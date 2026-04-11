# Analysis: Async Rendering in Handlebars

## Problem Statement

Handlebars is synchronous — `template(data)` returns a string immediately. We want to:

1. **`hbwp-expand`** — Fetch additional item data on demand and render success/loading/notfound states
2. **Async loading** — Show templated loading UI immediately, then replace with real content when data arrives

Both require some form of "render now, update later" pattern that Handlebars doesn't natively support.

---

## Existing Libraries

### 1. `promised-handlebars` (17k weekly downloads, MIT, last publish 10 years ago)

**How it works:** Wraps `Handlebars.compile()` so the compiled function returns a `Promise<string>` instead of `string`. Helpers can return promises. Internally uses placeholder characters (`\u0001` + index) in the synchronous output, then resolves all promises and replaces placeholders.

**Pros:**
- Most mature approach (handles edge cases: partials, block helpers calling `options.fn` async, sub-expression promises)
- Works with native Promises
- Block helpers can call `options.fn()` and `options.inverse()` from within `.then()` chains
- 17k downloads/week — most used option

**Cons:**
- Last published 10 years ago — no active maintenance
- Uses `\u0001` placeholder character — could collide with template content (configurable but hacky)
- Known issue: synchronous block helpers wrapping async helpers don't compose correctly (e.g., `{{#trim}}{{#if (async-helper)}}...{{/trim}}`)
- The entire template compile returns a promise — our `getHandlebarsTemplate()` is already async, so that's fine, but `ReactHtmlParser(html)` only runs after ALL promises resolve. No progressive rendering.
- **Verdict: Could work for hbwp-expand but doesn't solve progressive loading**

### 2. `handlebars-async-helpers` (7k weekly downloads, MIT, last publish 3 years ago)

**How it works:** Similar approach — wraps Handlebars to allow `async` helper functions. Compiled template returns a promise.

**Pros:**
- More recent than promised-handlebars
- Simpler API: just wrap handlebars instance, register async helpers normally
- Supports nesting

**Cons:**
- Only 17 stars, 8 open issues
- Less battle-tested edge case handling than promised-handlebars
- Same fundamental limitation: template returns a single promise, no progressive rendering
- **Verdict: Simpler alternative to promised-handlebars, same limitations**

### 3. `handlebars-async` (64 weekly downloads, BSD, last publish 8 years ago)

**How it works:** Callback-based (`this.async()` pattern inside helpers). Compiled template takes a callback instead of returning a value.

**Cons:**
- Dead project (8 years old, callback-based, 64 downloads)
- **Verdict: Not viable**

---

## Approaches for Our Architecture

### Approach A: Two-Phase Render (Placeholder → Hydrate)

**Current winner for `hbwp-expand`.** No library needed.

**How it works:**
1. `hbwp-expand` is a regular synchronous block helper. It renders the `loading` block immediately as a `<div>` with `data-hbwp-expand-*` attributes.
2. After React renders the HTML to the DOM (`componentDidUpdate` / `useEffect`), a hydration pass scans for `[data-hbwp-expand]` elements.
3. For each placeholder, fetch the data, compile the success/notfound template, replace the placeholder's `innerHTML`.

```typescript
// In the helper registration:
Handlebars.registerHelper('hbwp-expand', function(this: any, options: any) {
  const list = options.hash.list;
  const id = options.hash.id;
  const uid = `hbwp-expand-${list}-${id}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Store the success and notfound template functions for later hydration
  (window as any).__hbwpExpandTemplates = (window as any).__hbwpExpandTemplates || {};
  (window as any).__hbwpExpandTemplates[uid] = {
    success: options.fn,       // compiled block content
    notfound: options.inverse, // {{else}} block content
    list,
    id
  };
  
  // Render loading content immediately
  const loadingHtml = options.hash.loading 
    ? `<div data-hbwp-expand="${uid}">Loading...</div>`
    : `<div data-hbwp-expand="${uid}">${options.inverse ? options.inverse(this) : 'Loading...'}</div>`;
  
  return new Handlebars.SafeString(loadingHtml);
});
```

```typescript
// In componentDidUpdate, after setState({html}):
private hydrateExpandHelpers(): void {
  const container = this.containerRef.current;
  if (!container) return;
  
  const templates = (window as any).__hbwpExpandTemplates || {};
  const placeholders = container.querySelectorAll('[data-hbwp-expand]');
  
  placeholders.forEach(async (el: Element) => {
    const uid = el.getAttribute('data-hbwp-expand');
    const config = templates[uid];
    if (!config) return;
    
    try {
      const item = await this.listDataService.getItemById(config.list, config.id);
      if (item) {
        el.innerHTML = config.success(ListDataService.normalizeData(item));
      } else {
        el.innerHTML = config.notfound ? config.notfound({}) : '<span>Not found</span>';
      }
    } catch {
      el.innerHTML = config.notfound ? config.notfound({}) : '<span>Error loading</span>';
    }
  });
}
```

**Pros:**
- No extra dependencies
- Loading state shown immediately
- Each expand resolves independently (progressive)
- Template author controls all three states (loaded, loading, notfound)
- Works with our existing `dangerouslySetInnerHTML` → `ReactHtmlParser` pipeline

**Cons:**
- Global state (`window.__hbwpExpandTemplates`) is messy — better to use a Map on the component instance
- `options.fn` and `options.inverse` captured in the helper must be called later, outside the compile cycle. Need to verify Handlebars doesn't dispose these.
- Direct DOM manipulation (`el.innerHTML = ...`) bypasses React. This is fine since we already use `ReactHtmlParser(html)` and the container is unmanaged.
- Need Handlebars `else` sub-blocks — standard Handlebars only supports one `{{else}}`. For loading vs notfound, we'd need either:
  - Convention: `{{else}}` = notfound, loading is a `data-hbwp-loading` attribute with value
  - Or: Use a separate `{{hbwp-loading}}` helper inside the block (not standard Handlebars)

### Approach B: Async Library + Single Promise Resolution

Use `promised-handlebars` or `handlebars-async-helpers` so the `hbwp-expand` helper itself can `await` the data fetch and return the final HTML.

```typescript
const hb = asyncHelpers(Handlebars);

hb.registerHelper('hbwp-expand', async function(this: any, options: any) {
  const list = options.hash.list;
  const id = options.hash.id;
  
  try {
    const item = await listDataService.getItemById(list, id);
    if (item) {
      return options.fn(normalizeData(item));
    } else {
      return options.inverse({});
    }
  } catch {
    return options.inverse({});
  }
});

// template() now returns Promise<string>
const html = await template(data);
```

**Pros:**
- Cleaner template syntax — standard `{{#hbwp-expand}}...{{else}}...{{/hbwp-expand}}`
- No DOM manipulation / hydration needed
- No global state

**Cons:**
- **No progressive loading** — ALL expand helpers must resolve before ANY HTML is shown. If you have 50 items each with an expand, the page is blank until all 50 fetches complete.
- Adds a dependency on a library last updated 3-10 years ago
- Compatibility risk with `handlebars-helpers` (600+ helpers already registered)
- Performance: serial template compilation blocks the UI thread while waiting for promises
- `{{else}}` only gives us notfound — no separate loading state (it's never shown since we wait for resolution)

### Approach C: Pre-fetch + Synchronous Render (No Async Needed)

Fetch all expandable data upfront in `getAllData()`, attach to items, render synchronously.

```typescript
// In getAllData(), after fetching primary items:
for (const item of primaryItems) {
  if (item.IdeaId) {
    item._expanded = { idea: await fetchItem('ideas', item.IdeaId) };
  }
}
```

Template:
```handlebars
{{#each items}}
  <h3>{{Title}}</h3>
  {{#if _expanded.idea}}
    <p>Idea: {{_expanded.idea.Title}}</p>
  {{else}}
    <p class="muted">Idea not found</p>
  {{/if}}
{{/each}}
```

**Pros:**
- No library, no DOM manipulation, no hydration
- Pure Handlebars with `{{#if}}` / `{{else}}`
- All data available at render time — simple and predictable
- Could be configured in the property pane: "expand field X from list Y"

**Cons:**
- All fetches happen before render — slower time-to-first-paint (same as Approach B)
- Must know which fields to expand at configuration time
- N+1 query problem unless batched (fetch all related IDs in one CAML `<In>` query)
- Less flexible than a template helper — can't expand different fields in different templates

### Approach D: Hybrid — Synchronous First + Targeted Hydration

Combine Approach C (pre-fetch what we can from already-loaded data sources) with Approach A (hydrate missing items from the DOM).

1. During `getAllData()`, if a data source named `ideas` is already configured, attach matching items from the cached data source onto each primary item.
2. In the template, use `{{#if _expanded.idea}}` for items that were pre-matched.
3. Use `{{hbwp-expand list="ideas" id=this.IdeaId}}` only for items where the data source isn't pre-loaded — triggers lazy hydration.

**This is the recommended approach.**

---

## Recommendation

| Criteria | Approach A (Hydrate) | Approach B (Async Lib) | Approach C (Pre-fetch) | Approach D (Hybrid) |
|---|---|---|---|---|
| Time to first paint | Fast (loading shown) | Slow (wait for all) | Slow (wait for all) | Fast |
| Progressive loading | Yes | No | No | Yes |
| Template simplicity | Medium | Simple | Simple | Medium |
| Dependencies | None | +1 unmaintained lib | None | None |
| Loading state | Yes | No (invisible) | No (invisible) | Yes |
| Notfound state | Yes | Yes ({{else}}) | Yes ({{#if}}) | Yes |
| Implementation complexity | Medium | Low | Low | Medium-High |

**Recommended: Approach D (Hybrid)** for the full solution, with **Approach A** as the first implementation step since it's self-contained and delivers the core `hbwp-expand` UX.

**Do NOT adopt an async Handlebars library** — the two viable options are old/unmaintained, add risk of conflict with `handlebars-helpers`, and fundamentally don't support progressive rendering (which is the whole point of showing loading states).

---

## Implementation Plan

### Phase 1: `hbwp-expand` with Two-Phase Render (Approach A)

1. Register `hbwp-expand` block helper that outputs `<div data-hbwp-expand="uid">loading-content</div>`
2. Store `options.fn` / `options.inverse` in a component-level `Map`
3. After `setState({html})`, run `hydrateExpandHelpers()` in a `setTimeout(0)` or `componentDidUpdate`
4. Template syntax: `{{#hbwp-expand list="ideas" id=this.IdeaId}}success{{else}}notfound{{/hbwp-expand}}`
5. Loading content: a `loading` hash param or a default spinner

### Phase 2: Pre-fetch from loaded data sources (Approach D enrichment)

1. In `getAllData()`, after fetching additional data sources, auto-match items from known data sources onto primary items
2. Template helper `{{#hbwp-expand}}` checks if data is already attached — renders immediately if present, hydrates if not

### `{{else}}` Limitation Workaround

Standard Handlebars only supports one `{{else}}` block. For three states (loaded/loading/notfound), options:

1. **Use `loading` as a hash parameter**: `{{#hbwp-expand list="ideas" id=this.IdeaId loading="<div class='spinner'></div>"}}`
2. **Default loading HTML**: If no `loading` param, show a default spinner. `{{else}}` is the notfound block.
3. **Custom sub-expression**: Not supported in stock Handlebars without hacking the compiler.

**Recommendation:** Option 1 — `loading` as a hash string param, `{{else}}` for notfound. Simple, no Handlebars hacks.

```handlebars
{{#hbwp-expand list="ideas" id=this.IdeaId loading="<div class='spinner'>Loading...</div>"}}
  <p>Idea: {{Title}} — {{Description}}</p>
{{else}}
  <p class="muted">Idea not found</p>
{{/hbwp-expand}}
```
