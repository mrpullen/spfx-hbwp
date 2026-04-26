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
 * Missing tokens become empty string.
 */
function substituteTokens(template: string, ctx: any): string {
  return template.replace(TOKEN_REGEX, (_full, key) => {
    const value = resolvePath(ctx, key);
    return value === undefined || value === null ? '' : String(value);
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
      // Fall back to original; structural normalization is best-effort
      return caml;
    }
  } catch {
    return caml;
  }

  const root = xml.documentElement;
  if (!root) return caml;

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
  return serialized.replace(/^<root[^>]*>/, '').replace(/<\/root>$/, '');
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
