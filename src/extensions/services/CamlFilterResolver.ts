/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CamlFilterResolver
 *
 * Resolves `{{token}}` substitutions in a CAML query template, with two
 * extensions over plain string-replace:
 *
 * 1. `{{#if-resolved key.path}} ... {{/if-resolved}}` block helper
 *    Drops the wrapped block entirely if the dotted-path token is
 *    unresolved / null / empty / undefined. This lets templates author
 *    optional filter clauses that simply disappear when their criteria
 *    aren't set.
 *
 * 2. Structural normalization
 *    After block removal + token substitution the resulting CAML may have
 *    `<And>` / `<Or>` wrappers with the wrong number of children. We:
 *      - Collapse single-child `<And>`/`<Or>` to its child
 *      - Drop empty `<And>`/`<Or>`
 *      - Drop `<Where>` if it ends up empty
 *
 * Used by SharePointListAdapter.fetch (and any future CAML-aware adapter).
 *
 * Token resolution: `{{a.b.c}}` walks `ctx.a.b.c`. Returns empty string for
 * missing/nullish; that empty value is what the if-resolved guard checks.
 */

const IF_RESOLVED_BLOCK_REGEX = /\{\{#if-resolved\s+([^\s}]+)\s*\}\}([\s\S]*?)\{\{\/if-resolved\}\}/g;
// eslint-disable-next-line @rushstack/security/no-unsafe-regexp
const TOKEN_REGEX = /\{\{\s*([^\s}]+)\s*\}\}/g;

/** Sentinel left in place of unresolved tokens during substitution. The
 *  structural-normalization pass drops any leaf comparison whose subtree
 *  contains this marker, so authors don't have to manually wrap every
 *  optional clause in `{{#if-resolved}}`. */
const UNRESOLVED_MARKER = '\u0000HBWP_UNRESOLVED\u0000';

/** Leaf CAML comparison elements that should be dropped if any of their
 *  tokens resolved empty. Logical wrappers (And/Or/Where) are handled
 *  separately by the And/Or collapse pass. */
const LEAF_COMPARISON_TAGS = new Set([
  'Eq', 'Neq', 'Gt', 'Geq', 'Lt', 'Leq',
  'BeginsWith', 'Contains', 'Includes', 'NotIncludes',
  'DateRangesOverlap', 'In', 'Membership'
]);

/**
 * Walk a dotted path against a context object. Supports array indexing via .0 / [0].
 * Returns undefined if any segment is missing.
 */
function resolvePath(ctx: any, path: string): any {
  if (!ctx || !path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: any = ctx;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/** Empty / nullish / blank string check used by `if-resolved` */
function isEmpty(value: any): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Pass 1: Strip `{{#if-resolved key}} ... {{/if-resolved}}` blocks whose token
 * is empty. Keeps the inner content (minus the markers) when resolved.
 */
function stripUnresolvedBlocks(template: string, ctx: any): string {
  return template.replace(IF_RESOLVED_BLOCK_REGEX, (_full, key, inner) => {
    const value = resolvePath(ctx, key);
    return isEmpty(value) ? '' : inner;
  });
}

/**
 * Pass 2: Replace remaining `{{token}}` occurrences with the resolved value.
 * Unresolved tokens are replaced with a sentinel marker so structural
 * normalization can drop the enclosing leaf comparison (auto-guard).
 */
function substituteTokens(template: string, ctx: any): string {
  return template.replace(TOKEN_REGEX, (_full, key) => {
    const value = resolvePath(ctx, key);
    if (value === undefined || value === null || (typeof value === 'string' && value === '')) {
      return UNRESOLVED_MARKER;
    }
    return String(value);
  });
}

/**
 * Pass 3: Structural normalization on the resolved CAML XML.
 * Collapses single-child <And>/<Or>, drops empty wrappers, removes empty <Where>.
 */
function normalizeStructure(caml: string): string {
  if (!caml.trim()) return caml;
  let xml: Document;
  try {
    // Wrap in a root so DOMParser doesn't choke on top-level fragments
    xml = new DOMParser().parseFromString(`<root>${caml}</root>`, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length > 0) {
      // Fall back to original (with markers stripped); structural
      // normalization is best-effort.
      return caml.split(UNRESOLVED_MARKER).join('');
    }
  } catch {
    return caml.split(UNRESOLVED_MARKER).join('');
  }

  const root = xml.documentElement;
  if (!root) return caml;

  // Drop any leaf comparison element whose subtree contains an unresolved
  // token marker. This makes `{{#if-resolved}}` optional for the common case
  // of a single-token <Eq>/<Geq>/<BeginsWith>/etc.
  const dropUnresolvedLeaves = (el: Element): void => {
    const childEls = Array.from(el.children);
    for (const c of childEls) dropUnresolvedLeaves(c);
    if (LEAF_COMPARISON_TAGS.has(el.tagName) && (el.textContent || '').indexOf(UNRESOLVED_MARKER) >= 0) {
      el.parentNode?.removeChild(el);
    }
  };
  dropUnresolvedLeaves(root);

  // Recursively collapse And/Or
  const collapse = (el: Element): void => {
    // Depth-first
    const childEls = Array.from(el.children);
    for (const c of childEls) collapse(c);

    const tag = el.tagName;
    if (tag !== 'And' && tag !== 'Or') return;

    const liveChildren = Array.from(el.children);

    if (liveChildren.length === 0) {
      // Empty And/Or — drop
      el.parentNode?.removeChild(el);
      return;
    }
    if (liveChildren.length === 1) {
      // Single child — replace this And/Or with its child
      const only = liveChildren[0];
      el.parentNode?.replaceChild(only, el);
      return;
    }
    // 2+ children — fine
  };
  collapse(root);

  // Drop empty <Where>
  const wheres = Array.from(root.getElementsByTagName('Where'));
  for (const w of wheres) {
    if (w.children.length === 0) {
      w.parentNode?.removeChild(w);
    }
  }

  // Serialize back, stripping the synthetic <root> wrapper
  const serialized = new XMLSerializer().serializeToString(root);
  // Belt-and-braces: any stray markers (e.g. inside attribute values or
  // outside a recognised leaf comparison) get replaced with empty string.
  return serialized
    .replace(/^<root[^>]*>/, '')
    .replace(/<\/root>$/, '')
    .split(UNRESOLVED_MARKER).join('');
}

/**
 * Resolve a CAML filter template against a context object.
 *
 * @param template  The CAML XML template, possibly containing `{{token}}` substitutions
 *                  and `{{#if-resolved key}}...{{/if-resolved}}` conditional blocks.
 * @param ctx       Token resolution context, e.g. `{ user, page, query, items, division: {...} }`
 * @returns         Resolved + normalized CAML string. Returns empty string if everything
 *                  was conditional and nothing resolved.
 */
export function resolveCamlFilter(template: string, ctx: Record<string, any>): string {
  if (!template) return template;
  const stripped = stripUnresolvedBlocks(template, ctx);
  const substituted = substituteTokens(stripped, ctx);
  return normalizeStructure(substituted);
}
