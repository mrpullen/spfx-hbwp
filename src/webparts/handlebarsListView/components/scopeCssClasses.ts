/**
 * Scopes CSS class names in a Handlebars template by appending `-{wpId}` to every
 * class defined in `<style>` blocks, and updating all corresponding `class="..."` 
 * attribute references in the HTML to match.
 *
 * This allows template authors to write plain class names (e.g. `.idea-card`)
 * and have them automatically namespaced per web-part instance at runtime.
 *
 * @param template - Raw Handlebars template string
 * @param wpId - The web part instance ID to use as suffix
 * @returns The template with all CSS classes scoped
 */
export function scopeCssClasses(template: string, wpId: string): string {
  // 1. Extract all class names defined in <style> blocks
  const classNames = new Set<string>();
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;

  while ((styleMatch = styleRegex.exec(template)) !== null) {
    const styleContent = styleMatch[1];
    // Match CSS class selectors: .classname (not followed by another letter/digit/hyphen 
    // that would make it a Handlebars expression we already handle)
    const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(styleContent)) !== null) {
      classNames.add(classMatch[1]);
    }
  }

  if (classNames.size === 0) {
    return template;
  }

  const suffix = `-${wpId}`;

  // 2. Replace class names in <style> blocks
  let result = template.replace(styleRegex, (fullMatch: string, styleContent: string) => {
    let scoped = styleContent;
    classNames.forEach((cls: string) => {
      // Replace .classname when followed by a non-identifier character (space, {, :, ., ,, etc.)
      // This avoids partial matches like .card matching inside .card-body
      // Class names come from our own <style> blocks and are pre-escaped
      // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
      const selectorRegex = new RegExp(
        `\\.${escapeRegex(cls)}(?=[^a-zA-Z0-9_-])`,
        'g'
      );
      scoped = scoped.replace(selectorRegex, `.${cls}${suffix}`);
    });
    return fullMatch.replace(styleContent, scoped);
  });

  // 3. Replace class names in class="..." attributes throughout the HTML (outside <style> blocks)
  // Split on style blocks to only process non-style content
  const parts = result.split(/(<style[^>]*>[\s\S]*?<\/style>)/gi);

  // Sort class names longest-first to avoid partial replacements
  const sortedClasses = Array.from(classNames).sort((a, b) => b.length - a.length);

  result = parts.map(part => {
    // Skip <style> blocks (already processed)
    if (/^<style/i.test(part)) {
      return part;
    }

    // Replace class names inside class="..." attributes
    return part.replace(/\bclass\s*=\s*"([^"]*)"/gi, function(_attrMatch: string, attrValue: string) {
      let scopedAttr = attrValue;
      sortedClasses.forEach(function(cls: string) {
        // Split on whitespace, scope matching classes, rejoin
        scopedAttr = scopedAttr.split(/\s+/).map(function(token: string) {
          return token === cls ? cls + suffix : token;
        }).join(' ');
      });
      return 'class="' + scopedAttr + '"';
    });
  }).join('');

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
