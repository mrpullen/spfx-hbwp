# External Library Extraction Plan

> **Goal**: Validate the extensibility surface end-to-end by extracting two
> self-contained libraries that can be loaded as external `IExtensibilityLibrary`
> packages — proving that third-party developers can ship the same kind of
> integrations we ship in the box.

## Why this matters

The HBWP web part already loads external libraries via the Tenant-Wide
Extensibility Manager. Today, the in-box `BuiltInExtensibilityLibrary` is the
only library that ships:

- Custom Handlebars helpers
- Custom web components (`<hbwp-form>`, `<hbwp-like>`, `<hbwp-rating>`, …)
- Data adapter type definitions (`SharePointListAdapter`, `SocialDataAdapter`, …)
- The Handlebars template engine itself

Extracting two real libraries from that monolith — Fluent and Social — gives us:

1. **A regression test** for every contribution slot in `IExtensibilityLibrary`.
2. **A reference implementation** users can clone for their own libraries.
3. **A path to versioning** — Social Library can ship semver-independent of HBWP.
4. **Smaller in-box footprint** — strip the web part bundle of components most
   templates don't use.

---

## Library 1 — `@mrpullen/hbwp-fluent` (Fluent 2 Web Components)

### Scope

Wrap the Fluent UI v3 web-components package and the existing `<hbwp-form>`,
`<hbwp-input>`, `<hbwp-textarea>`, `<hbwp-select>`, `<hbwp-checkbox>`,
`<hbwp-hidden>`, and `<hbwp-submit>` elements (all of which already wrap
`<fluent-*>` tags internally). Also include the `Carousel` registration
currently in `HandlebarsListViewWebPart.ts`.

### What gets extracted

| Source (current) | Destination |
| --- | --- |
| `provideFluentDesignSystem().register(allComponents, Carousel)` in `HandlebarsListViewWebPart.ts:228` | `FluentExtensibilityLibrary.constructor` (one-time boot) |
| `HbwpFormElement.ts` | `src/components/HbwpFormElement.ts` |
| `HbwpInputElement.ts` | `src/components/HbwpInputElement.ts` |
| `HbwpTextareaElement.ts` | `src/components/HbwpTextareaElement.ts` |
| `HbwpSelectElement.ts` | `src/components/HbwpSelectElement.ts` |
| `HbwpCheckboxElement.ts` | `src/components/HbwpCheckboxElement.ts` |
| `HbwpHiddenElement.ts` | `src/components/HbwpHiddenElement.ts` |
| `HbwpSubmitElement.ts` | `src/components/HbwpSubmitElement.ts` |
| Carousel-aware bits in HandlebarsTemplateEngine | optional `<hbwp-carousel>` wrapper component |

### Library contract

```ts
export class FluentExtensibilityLibrary implements IExtensibilityLibrary {
  constructor() {
    // Boot Fluent design system once
    provideFluentDesignSystem().register(allComponents, Carousel);
  }
  public name(): string { return 'HBWP Fluent'; }
  public getCustomWebComponents(): IComponentDefinition<any>[] {
    return [
      { componentName: 'hbwp-form',     componentClass: HbwpFormElement },
      { componentName: 'hbwp-input',    componentClass: HbwpInputElement },
      { componentName: 'hbwp-textarea', componentClass: HbwpTextareaElement },
      { componentName: 'hbwp-select',   componentClass: HbwpSelectElement },
      { componentName: 'hbwp-checkbox', componentClass: HbwpCheckboxElement },
      { componentName: 'hbwp-hidden',   componentClass: HbwpHiddenElement },
      { componentName: 'hbwp-submit',   componentClass: HbwpSubmitElement },
    ];
  }
  // No helpers, no engines, no adapters
  public registerHandlebarsCustomizations(): void { /* noop */ }
  public getDataAdapterDefinitions(): IDataAdapterDefinition[] { return []; }
  public getTemplateEngines(): ITemplateEngineDefinition[] { return []; }
}
```

### Removal from in-box

- Drop `provideFluentDesignSystem().register(...)` from
  `HandlebarsListViewWebPart.ts`.
- Drop the seven `Hbwp*Element` form components from
  `BuiltInExtensibilityLibrary.getCustomWebComponents()`.
- Keep `<hbwp-action>`, `<hbwp-pager>`, `<hbwp-like>`, `<hbwp-likers-drawer>`,
  `<hbwp-rating>` in-box for now (they don't depend on Fluent).
- Delete the seven files from `spfx-hbwp/src/extensions/components/`.

### Risk / gotchas

- **Custom-element registry collisions**: Fluent registers `fluent-*` tags on
  load; if two libraries each call `provideFluentDesignSystem()`, the second
  call is a noop, but DesignSystem singletons must agree on prefix. Document:
  "If you also load Fluent, defer to whichever library boots first."
- **Bundle size**: Fluent web-components is ~300KB minified. Loading it
  externally means it's no longer in the web-part bundle — a win for tenants
  that don't use forms.
- **Form validation hooks**: `FormSubmitService.ts:301-345` has Fluent-specific
  validation logic. Decide whether to (a) leave it in the service (works
  whether the library is loaded or not) or (b) move it into the library and
  expose hooks.

### Testing matrix

1. Tenant has only built-in library → `<fluent-button>` is undefined; existing
   social-only templates still work.
2. Tenant loads Fluent library → all form components render correctly; field
   validation works on submit.
3. Tenant loads Fluent + Social libraries → no clashes, both register
   independently.
4. Two web parts with different library combinations on the same page →
   custom-element registry is global, so first registration wins; verify
   templates render correctly.

---

## Library 2 — `@mrpullen/hbwp-social` (Social Web Components)

### Scope

Bundle everything related to SharePoint social: likes, ratings, likers drawer,
the `SocialDataService`, and the `SocialDataAdapter`. This is the more
interesting validation because it touches **every** extensibility slot.

### What gets extracted

| Source (current) | Destination |
| --- | --- |
| `src/extensions/services/SocialDataService.ts` | `src/services/SocialDataService.ts` |
| `src/extensions/adapters/SocialDataAdapter.ts` | `src/adapters/SocialDataAdapter.ts` |
| `src/extensions/components/HbwpLikeElement.ts` | `src/components/HbwpLikeElement.ts` |
| `src/extensions/components/HbwpRatingElement.ts` | `src/components/HbwpRatingElement.ts` |
| `src/extensions/components/HbwpRateElement.ts` (legacy single-star) | `src/components/HbwpRateElement.ts` |
| `src/extensions/components/HbwpLikersDrawerElement.ts` | `src/components/HbwpLikersDrawerElement.ts` |
| `src/extensions/components/skeletonStyles.ts` | **Promoted to `@mrpullen/spfx-extensibility`** (see Resolved decisions) |
| Social Handlebars helpers (heart icons, etc.) in `helpers/socialHelpers.ts` | `src/helpers/socialHelpers.ts` |

### Library contract

```ts
export class SocialExtensibilityLibrary implements IExtensibilityLibrary {
  public name(): string { return 'HBWP Social'; }

  public getCustomWebComponents(): IComponentDefinition<any>[] {
    return [
      { componentName: 'hbwp-like',           componentClass: HbwpLikeElement },
      { componentName: 'hbwp-likers-drawer',  componentClass: HbwpLikersDrawerElement },
      { componentName: 'hbwp-rate',           componentClass: HbwpRateElement },
      { componentName: 'hbwp-rating',         componentClass: HbwpRatingElement },
      { componentName: 'hbwp-comments',       componentClass: HbwpCommentsElement },
    ];
  }

  public getDataAdapterDefinitions(): IDataAdapterDefinition[] {
    return [{
      adapterId: 'social',
      adapterClass: SocialDataAdapter,
      // 'write' is correct even though the adapter serves reads.
      // The capability flag gates *only* whether the pull-loop calls
      // fetch() on every refresh. 'read' / 'read-write' adapters get
      // pulled; 'write' adapters do not. Components still call
      // ctx.executeRead('_social', 'isLiked', …) directly — that path
      // is on-demand and unaffected by this flag. Social reads are
      // per-item and lazy, exactly what we want NOT pulled on refresh.
      // Capability matrix:
      //   'read'       → pulled on refresh, executeRead, no executeWrite
      //   'write'      → not pulled, executeRead, executeWrite
      //   'read-write' → pulled on refresh, executeRead, executeWrite
      capability: 'write',
    }];
  }

  public registerHandlebarsCustomizations(hbs: typeof Handlebars): void {
    registerSocialHelpers(hbs); // {{social-heart}}, {{social-stars}}, etc.
  }

  public getTemplateEngines(): ITemplateEngineDefinition[] { return []; }
}
```

### Required platform service

`SocialDataService` needs `IPlatformServices.sp` (PnPjs `SPFI`). The
platform-services bag is already populated by the web part — adapters declare
their requirements via `getRequiredServices()` and the pipeline rejects with a
clear error if a service is missing. **No host changes required.**

### Adapter registration shape for templates

Today, users register the social adapter via the web part property pane (the
"Data Adapters" page). After extraction, that workflow is unchanged — the
adapter type definition arrives via the loaded library, the property pane
discovers it from `extensibilityService.getDataAdapterDefinitions()`, and users
configure an instance with key `_social` exactly as today.

### Removal from in-box

- Drop the four social components from `BuiltInExtensibilityLibrary`.
- Drop `SocialDataAdapter` from `BuiltInExtensibilityLibrary.getDataAdapterDefinitions()`.
- Delete the source files from `spfx-hbwp/src/extensions/`.
- Update `test-social-hbwp1.hbs` / `test-social-hbwp2.hbs` README headers to
  note "requires HBWP Social library to be installed".

### Risk / gotchas

- **`_social` key magic**: The pipeline treats keys starting with `_` as
  write-only (skipped by the read-result subscription). This convention is
  enforced in the host, not the library, so extraction is safe.
- **`executeRead` shape**: The library uses `IServiceContext.executeRead?` which
  is already in `@mrpullen/spfx-extensibility`. No type changes needed.
- **Custom-event bridging**: `<hbwp-like>` dispatches `hbwp-likers-requested`
  which `<hbwp-likers-drawer>` listens for on `document`. Both elements live
  in the same library, so this stays cohesive.
- **Skeleton CSS**: `ensureSkeletonStyles()` injects a `<style id="hbwp-skeleton-styles">`
  into `document.head`. If multiple libraries want to share skeleton styles,
  promote `skeletonStyles.ts` to `@mrpullen/spfx-extensibility`. Otherwise,
  leave it inside the social library and rename the style ID to
  `hbwp-social-skeleton-styles` to avoid collisions.

### Testing matrix

1. Tenant loads social library only → `test-social-hbwp1.hbs` works:
   row click → publishes selection; second web part receives, shows like/rate
   placeholders, resolves on click.
2. Tenant doesn't load social library → `<hbwp-like>` is undefined-element;
   social adapter isn't registrable in the property pane. Document this as
   the expected failure mode.
3. **Cross-library executeRead**: A custom library implements its own write
   adapter that calls `ctx.executeRead('_social', 'isLiked', ...)`. Validates
   that pipelined read ops cross library boundaries cleanly.
4. **Versioning**: Social v1.0 ships with `getRating`. Social v1.1 adds
   `getRatedBy` (paged list of raters). Both versions coexist in the field;
   v1.0 templates still work because they don't reference the new operation.

---

## Cross-cutting concerns

### Shared dependencies

Both libraries depend on:

- `@mrpullen/spfx-extensibility` — `BaseWebComponent`, `IExtensibilityLibrary`,
  `IServiceContext`, `IDataAdapterContext`, `DataAdapterBase`.
- `@pnp/sp` — Social uses it; Fluent does not.

The extensibility package is **already** the contract layer. No changes needed
there for either extraction.

### Build & packaging

Each library follows the existing SPFx external-library pattern:

```
hbwp-fluent/
├── src/
│   ├── components/
│   ├── FluentExtensibilityLibrary.ts
│   └── index.ts             // exports loadLibrary() factory
├── config/
├── tsconfig.json            // target: es2017
├── gulpfile.js
└── package.json             // peerDeps: @mrpullen/spfx-extensibility
```

### Loader contract

Libraries are loaded by `ExtensibilityService.loadLibraries()` via the
`spfx-extensibility` loader pattern: a top-level `loadLibrary()` factory that
returns `Promise<IExtensibilityLibrary>`. Both libraries follow this verbatim.

### Documentation deliverables

Each new library repository ships with:

1. `README.md` — install, configure, register in tenant
2. `docs/template-examples.md` — copy-paste handlebars snippets
3. `docs/api.md` — adapter operations and component attributes
4. A local `serve` story for development against a SPO tenant

---

## Sequencing

Recommended order (lowest-risk first):

1. **Social Library** — most contained; touches the executeRead path we just
   stabilized. Validates that the executeRead+pipeline architecture survives
   extraction cleanly.
2. **Fluent Library** — riskier because of design-system bootstrapping and
   the `provideFluentDesignSystem()` singleton, but the wrapper components
   themselves are simple. Doing this second lets us discover any host changes
   needed for libraries that have one-time global init.

After both ship, the in-box `BuiltInExtensibilityLibrary` shrinks to:

- Handlebars helpers (json, filter, if-resolved, …)
- The Handlebars template engine itself
- `<hbwp-action>` and `<hbwp-pager>` (engine-agnostic, no dependencies)
- The non-social data adapters (`SharePointListAdapter`, `PageDataAdapter`,
  `UserProfileAdapter`, `FormSubmitAdapter`, `HttpDataAdapter`)

Which is the minimum a HBWP web part needs to load a list and render it.

---

## Resolved decisions

- **Promote `skeletonStyles.ts` to `@mrpullen/spfx-extensibility`.** Both
  the social library and any future library (rating displays, persona
  cards, charts in loading state) benefit from a shared skeleton
  primitive. Move the file, keep the same exported `ensureSkeletonStyles()`
  signature, and have both libraries import it. The Fluent-aligned 3s
  wave + `prefers-reduced-motion` honoring becomes a platform amenity.

- **Ship `<hbwp-comments>` in the social library.** PnPjs exposes the
  full comment surface on `item.comments`:
  - List + paged read (`item.comments.top(N)()`, optionally
    `.expand("replies", "likedBy", "replies/likedBy")`)
  - Add (`item.comments.add(text | ICommentInfo)`) — supports `@mention`
    via `mentions: [{ loginName, email, name }]`
  - Delete (`comment.delete()`)
  - Reply (`comment.replies.add(text)`)
  - Load replies (`comment.replies()`)
  - **Like / unlike a comment** (`comment.like()` / `comment.unlike()`)

  `SocialDataService` adds:
  - `getComments(siteUrl, listId, itemId, { top, expandReplies, expandLikedBy })`
  - `addComment(siteUrl, listId, itemId, textOrInfo)` — accepts string or
    `ICommentInfo` so authors can pass mentions through
  - `deleteComment(siteUrl, listId, itemId, commentId)`
  - `replyToComment(siteUrl, listId, itemId, commentId, text)`
  - `getReplies(siteUrl, listId, itemId, commentId)`
  - `likeComment(siteUrl, listId, itemId, commentId)`
  - `unlikeComment(siteUrl, listId, itemId, commentId)`

  `SocialDataAdapter` exposes matching `executeRead` cases (`getComments`,
  `getReplies`) and `executeWrite` cases (`addComment`, `deleteComment`,
  `replyToComment`, `likeComment`, `unlikeComment`).

  `<hbwp-comments>` renders a threaded list with:
  - Avatar + name + relative time per comment
  - Reply affordance that expands inline
  - Like button per comment / per reply (heart icon, count, optimistic UI
    matching `<hbwp-like>`)
  - Compose box at the top
  - Paged via the standard pager pattern
  - `data-resolve="true"` mirrors `<hbwp-like>` so the component fetches
    on connect

  Like all the social components: optimistic UI on action, no
  post-action server re-resolve to avoid render flicker; only the
  initial connect fetch and explicit user-driven page changes touch the
  server.

  **Note**: PnPjs documents the comments APIs as **BETA** and "may not
  work on all tenants." Ship `<hbwp-comments>` with a feature-detect
  fallback that hides the component cleanly if the endpoint returns
  401/404, and document the BETA caveat in the library README.

- **Fluent v2 vs v3.** Your read — "v2 has more components than v3" —
  was true around 2023 but is no longer accurate. As of master today,
  `@fluentui/web-components` v3 ships ~45 components: accordion,
  anchor-button, avatar, badge, button, checkbox, combobox,
  compound-button, counter-badge, dialog, drawer, dropdown, field,
  image, label, link, listbox, menu, menu-button, menu-item, menu-list,
  message-bar, option, progress-bar, radio, radio-group, rating-display,
  select, slider, spinner, split-button, switch, tab, tablist, text,
  text-input, textarea, toggle-button, tooltip, tree. **The v3 set
  covers everything we currently use** (button, checkbox, dialog, field,
  input/text-input, menu, select, textarea, drawer, tablist, tooltip,
  rating-display) and adds primitives we'd want anyway (`rating-display`
  fits our `<hbwp-rating>` story; `field` cleans up form layout;
  `message-bar` covers the Fab 40 Message Bar template).

  **Decision:** target v3. Notable migration deltas to plan for in the
  Fluent library:
  - Bootstrap is now `setTheme(webLightTheme)` from `@fluentui/tokens`
    instead of `provideFluentDesignSystem().register(allComponents)`.
  - Per-component registration: `import '@fluentui/web-components/button.js'`
    or `ButtonDefinition.define(FluentDesignSystem.registry)`. Lets us
    bundle only the components our wrappers actually use — a real
    win over v2's all-or-nothing register.
  - `Carousel` is **not** in v3. Replace with our own `<hbwp-carousel>`
    on top of Swiper (already on the Fab 40 plan), or drop the carousel
    bootstrap entirely.
  - `<fluent-text-field>` is now `<fluent-text-input>` plus `<fluent-field>`
    for label/error layout. Update `HbwpInputElement` accordingly.
  - `<fluent-tabs>` / `<fluent-tab-panel>` were removed in favor of
    `<fluent-tablist>` + `<fluent-tab>`. If we ever wrap them, use the
    new shape.

  Net: targeting v3 is the right call. It also lets us drop ~300 KB of
  components we don't use thanks to per-component imports.

## Open questions

- _(none currently — prior open questions resolved above)_
