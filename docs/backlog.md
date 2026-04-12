# Backlog

## Paging Control

Paging applies to primary list items only. Now that we use `renderListDataAsStream`, paging metadata (`NextHref`, `FirstRow`, `LastRow`, `RowLimit`) is returned natively — no workarounds needed.

- [ ] Accept `Paging` parameter in `fetchFromSharePoint` to request a specific page
- [x] Add `prevHref` to `IListDataResult` (SharePoint returns it, PnPjs type just doesn't declare it)
- [x] Expose paging state in template context (`{{paging.hasNext}}`, `{{paging.hasPrev}}`, `{{paging.firstRow}}`, `{{paging.lastRow}}`, `{{paging.rowLimit}}`)
- [ ] Build `hbwp-paging` Handlebars block helper to render prev/next navigation
- [ ] Wire click events (`data-hbwp-page="next"` / `data-hbwp-page="prev"`) through event delegation to trigger re-fetch
- [ ] Maintain paging state in component state across re-renders

### What's Already Done

- [x] `renderListDataAsStream` is the data fetch method (replaces `getItemsByCAMLQuery`)
- [x] `IListDataResult` already includes `nextHref`, `firstRow`, `lastRow`, `rowLimit`
- [x] `RowLimit` in the ViewXml is respected automatically (comes from the stored view)
- [x] `IRenderListDataParameters` has a `Paging` property for passing paging tokens

### Implementation Tasks

**Files to modify:**
- `ListDataService.ts` — accept `paging` token in `IListFetchConfig` and pass to `renderListDataAsStream`
- `HandlebarsListView.tsx` — paging state, template context, event delegation, re-fetch
- `IHandlebarsListViewProps.ts` — no changes needed (paging is component state, not props)

**Tasks:**
1. **Add `paging` to `IListFetchConfig`** — Optional `paging?: string` field. Pass it as the `Paging` property on `renderListDataAsStream({ ..., Paging: config.paging })`. This is the `NextHref`/`PrevHref` token string.
2. **Capture `PrevHref`** — The REST response includes `PrevHref` but the PnPjs `IRenderListDataAsStreamResult` type doesn't declare it. Cast `response` as `any` to access `response.PrevHref`, or extend the interface. Add `prevHref?: string` to `IListDataResult`.
3. **Paging state in component** — Add to component state: `{ pagingToken?: string, prevToken?: string, pageHistory: string[] }`. On next/prev click, update the paging token and re-fetch.
4. **Template context** — After `getPrimaryListData`, spread paging info into the template data:
   ```typescript
   paging: {
     hasNext: !!result.nextHref,
     hasPrev: !!result.prevHref || pageHistory.length > 0,
     firstRow: result.firstRow,
     lastRow: result.lastRow,
     rowLimit: result.rowLimit
   }
   ```
5. **`hbwp-paging` helper** — Block helper that renders navigation controls:
   ```handlebars
   {{#hbwp-paging}}
     {{#if paging.hasPrev}}<button data-hbwp-page="prev">← Previous</button>{{/if}}
     <span>Showing {{paging.firstRow}}–{{paging.lastRow}}</span>
     {{#if paging.hasNext}}<button data-hbwp-page="next">Next →</button>{{/if}}
   {{/hbwp-paging}}
   ```
   Or simpler: just use `{{#if paging.hasNext}}` directly in templates — the helper may not be needed if paging data is in the template context.
6. **Event delegation** — In the container click handler, detect `data-hbwp-page="next"` / `data-hbwp-page="prev"` clicks. On next, store current paging token in `pageHistory`, set `pagingToken = result.nextHref`, re-fetch. On prev, pop from `pageHistory`.
7. **Cache key** — Include paging token in the cache key so different pages are cached independently.
8. **RowLimit enforcement** — If the stored ViewXml doesn't have `<RowLimit>`, consider injecting `<RowLimit Paged="TRUE">N</RowLimit>` via a configurable page size property. Otherwise, the view's RowLimit is used as-is.

**Estimated complexity:** Medium — the hard part (getting paging tokens from SharePoint) is already solved. Remaining work is state management and event wiring.

## Template Lookup Helpers (Client-Side Joins)

Cross-list lookup joining via Handlebars helpers. Enables multi-level lookup traversal that SharePoint doesn't support natively (e.g., Pages → Ideas → Categories).

- [ ] Register `findItem` helper — find a single item from a data source by key match
- [ ] Register `findItems` helper — find all matching items (one-to-many)
- [ ] Support nested usage for multi-hop lookups (Page → Idea → Category)

### Implementation Tasks

**Files to modify:**
- `HandlebarsListView.tsx` — register new Handlebars helpers with access to all data source collections

**Tasks:**
1. **`findItem` helper** — `{{#with (findItem ideas "ID" this.IdeaId)}}...{{/with}}` — searches a named data source array for the first item where `item[key] === value`. Returns the matched object (usable with `{{#with}}`)
2. **`findItems` helper** — `{{#each (findItems comments "IdeaId" this.ID)}}...{{/each}}` — returns all matching items (usable with `{{#each}}`)
3. **Data source access** — Helpers need access to the full template context root (where data sources live by key). Use `options.data.root` inside the helper to access named data sources
4. **Type coercion** — Lookup ID values may come back as string or number depending on the API. Compare with `String(item[key]) === String(value)` for safety
5. **Null safety** — Return `undefined` / empty array if the data source doesn't exist or no match is found, so templates degrade gracefully
6. **Example usage** — Three-level join in a template:
   ```handlebars
   {{#each items}}
     <h3>{{this.Title}}</h3>
     {{#with (findItem ../ideas "ID" this.IdeaLookupId)}}
       <p>Idea: {{this.Title}}</p>
       {{#with (findItem ../../categories "ID" this.CategoryLookupId)}}
         <p>Category: {{this.Title}}</p>
       {{/with}}
     {{/with}}
   {{/each}}
   ```

**Estimated complexity:** Low — two helper registrations, purely template-side logic

---

## ~~Query Parameter Token Support~~ ✅ Done

~~We want to be able to link to query / parameter name~~

- [x] Support `{{query.paramName}}` tokens in CAML filters and HTTP endpoint URLs
- [x] Parse URL query string parameters at runtime and inject into token context
- [x] Allow dynamic filtering based on URL (e.g., `{{query.id}}`, `{{query.status}}`)
- [x] Add `query` field to `ITokenContext` interface
- [x] Inject `query` into both CAML filter token context and full token context
- [x] Expose `query` in Handlebars template data

### Implementation Tasks

**Files to modify:**
- `HandlebarsListView.tsx` — parse query string, add to token context
- `IHandlebarsListViewProps.ts` — extend `ITokenContext` with `query`

**Tasks:**
1. **Parse query string in component** — In `getAllData()`, parse `window.location.search` using `URLSearchParams` and build a `Record<string, string>` of all query params
2. **Add `query` to `ITokenContext`** — Extend the interface: `query?: Record<string, string>`
3. **Inject into token context** — In `getAllData()`, add `query: parsedQueryParams` to both `filterTokenContext` and the full `tokenContext`
4. **Works automatically** — The existing `resolveTokens()` function already handles dot-notation (`{{query.id}}`) so no changes needed there
5. **Template access** — Handlebars templates can use `{{query.id}}` directly since query params are spread into the root context via `getAllData()`
6. **Add `query` to debug template** — Add a section in `debug.hbs` showing current query parameters
7. **Listen for URL changes** — Consider adding `popstate` listener for SPA navigation (back/forward) to re-fetch data when query params change
8. **Security** — Sanitize query param values injected into CAML to prevent CAML injection (escape `<`, `>`, `&` in values)

**Estimated complexity:** Low — mostly wiring existing pieces together

## Web Part Connections (Dynamic Data)

We will want to build additional web parts like refiners -or perhaps use another HBWP-component to provide the a selected value as a filter - which we would then be providing to other hbwp controls as specified.

- [ ] Implement SPFx Dynamic Data consumer support (`IDynamicDataCallables`)
- [ ] Allow connecting to other web parts on the page (e.g., list pickers, search boxes)
- [ ] Expose connected values as tokens (e.g., `{{connection.selectedId}}`)

### Implementation Tasks

**Files to modify:**
- `HandlebarsListViewWebPart.ts` — implement Dynamic Data provider/consumer
- `IHandlebarsListViewProps.ts` — add `connections` to props and `ITokenContext`
- `HandlebarsListView.tsx` — pass connection data through to templates
- New file: consider a companion HBWP refiner web part

**Tasks:**
1. **Implement `IDynamicDataCallables`** on the web part class — override `getPropertyDefinitions()` and `getPropertyValue()` to expose selected values (e.g., when a user clicks an item in a template)
2. **Register as Dynamic Data source** — Call `this.context.dynamicDataSourceManager.initializeSource(this)` in `onInit()`
3. **Consume Dynamic Data** — Add `DynamicProperty<string>` fields for each connection slot. Use the property pane's `PropertyPaneDynamicField` or `PropertyPaneDynamicFieldSet` controls
4. **Property pane UI** — Add a "Connections" page in the property pane with configurable connection slots (name + dynamic data source picker)
5. **Add to token context** — In the web part's `render()`, resolve each `DynamicProperty` value and pass as `connections: Record<string, any>` prop to the component
6. **Wire through component** — In `getAllData()`, add `connection: this.props.connections` to the token context so `{{connection.selectedId}}` resolves
7. **Re-render on change** — Dynamic Data properties fire change events — listen via `DynamicProperty.register()` callback and call `this.render()`
8. **HBWP as data source** — Register `hbwp-click` or `hbwp-select` helpers that call `this.context.dynamicDataSourceManager.notifyPropertyChanged()` to push selected values to connected web parts
9. **Event delegation** — The component already uses `dangerouslySetInnerHTML` — add a click event listener on the container that checks for `data-hbwp-select` attributes and publishes the value

**Estimated complexity:** High — SPFx Dynamic Data API has boilerplate; companion refiner web part is a separate build target

## Dynamic Filtering

We will definitely need to be able to modify the data returned - we should cache when reasonable. we should be able to use {{connectionname.selected}} {{query.paramName}} in our handlebars templates as well as our camlQueries.

- [ ] Combine query parameters and web part connections for fully dynamic CAML filtering
- [ ] Support re-fetching data when connected values change
- [ ] Consider debouncing rapid filter changes

### Implementation Tasks

**Files to modify:**
- `HandlebarsListView.tsx` — re-fetch logic, debouncing
- `ListDataService.ts` — cache key generation with dynamic tokens
- `HandlebarsListViewWebPart.ts` — change detection from connections

**Tasks:**
1. **Unified token context** — Merge `query`, `connection`, `user`, and `page` into a single token context used for both CAML filter resolution AND template rendering (partially done already)
2. **Cache key includes resolved tokens** — Currently the cache key uses the raw `camlFilter` string. After tokens are resolved, the cache key must use the **resolved** filter so different query params produce different cache entries. Update `getCacheKey` to accept the resolved filter
3. **Change detection for connections** — When a `DynamicProperty` fires a change, the web part calls `render()` which triggers `componentDidUpdate` in the component. The component already re-fetches when props change — ensure `connections` is included in the `componentDidUpdate` comparison
4. **Change detection for query params** — Add `popstate` and `hashchange` listeners in `componentDidMount`. On change, re-run `getAllData()` with fresh `query` values. Clean up listeners in `componentWillUnmount`
5. **Debouncing** — Add a debounce wrapper (300-500ms) around `getHandlebarsTemplate()` to prevent rapid re-fetches when multiple connection/query changes fire in quick succession. Use a simple `setTimeout`/`clearTimeout` pattern
6. **Smart cache invalidation** — When dynamic values change, only invalidate cache entries whose keys include the changed token. For simple cases, `clearAllCache()` works; for performance, consider a cache tag system
7. **Template re-render without re-fetch** — If only template-level tokens changed (not CAML tokens), skip the data fetch and only re-compile the template with the new context. Detect this by comparing resolved CAML before/after
8. **Error handling** — Show a user-friendly message if dynamic filtering produces invalid CAML (e.g., empty `{{query.id}}` token). Consider a fallback: if a required token is empty, show "No filter applied" rather than erroring

**Estimated complexity:** Medium — most infrastructure exists; main work is debouncing, smart cache keys, and change detection wiring

---

## Social Integration (Likes, Ratings & Comments) — Partially Done

Enable templates to show and interact with SharePoint social features — likes/ratings and comments — on list items. Operates in two modes depending on list rating settings.

- [x] Create `SocialDataService` to fetch and post likes, ratings, and comment counts
- [x] Support **Likes mode** — show like count, current user liked state, toggle like
- [x] Support **Ratings mode** — show average rating, current user's rating, submit rating
- [ ] Fetch comment counts per item
- [x] Register Handlebars helpers for template access (`likeButton`, `starRating`)
- [x] Add template event delegation for like/rate actions (`handleContainerClick`)
- [x] Optimistic UI for like toggle (OOTB SharePoint-style heart with SVG)
- [x] Fire-and-forget API calls with cache invalidation
- [ ] Comments panel (`data-hbwp-comments`)

### Implementation Tasks

**New file:** `services/SocialDataService.ts`
**Files to modify:** `HandlebarsListView.tsx` (register helpers, event delegation), `ListDataService.ts` (optionally enrich items with social data)

**Tasks:**
1. **`SocialDataService`** — New service wrapping the SharePoint REST social endpoints:
   - `/_api/web/lists('${listId}')/items(${itemId})/likedBy` — get who liked an item
   - `/_api/web/lists('${listId}')/items(${itemId})/like` / `unlike` — toggle like (POST)
   - `/_api/web/lists('${listId}')/items(${itemId})/rate(value)` — submit a 1-5 star rating (POST)
   - Ratings metadata lives in `OData__AverageRating` and `OData__RatingCount` fields (add to ViewFields in ViewXml if rating is enabled on the list)
   - Comment count: `/_api/web/lists('${listId}')/items(${itemId})/Comments/$count`
2. **Detect mode** — Query list settings (`EnableRating`, `EnableLikes`) via REST to determine which mode applies. Cache this per list.
3. **Enrich items** — After fetching list data, optionally batch-fetch social data and merge onto each item:
   - `_likes: { count: 5, likedByMe: true }`
   - `_rating: { average: 3.7, count: 12, myRating: 4 }`
   - `_comments: { count: 3 }`
4. **Handlebars helpers:**
   - `{{likes this}}` — renders like count
   - `{{likedByMe this}}` — returns true/false for conditional styling
   - `{{rating this}}` — renders average rating
   - `{{ratingCount this}}` — number of ratings
   - `{{myRating this}}` — current user's rating (0 if unrated)
   - `{{commentCount this}}` — number of comments on the item
5. **Template actions via data attributes:**
   - `data-hbwp-like="{{ID}}"` — clicking toggles like, re-fetches social data for that item
   - `data-hbwp-rate="{{ID}}" data-hbwp-rate-value="4"` — submits a rating
   - `data-hbwp-comments="{{ID}}"` — could open a comments panel (future)
6. **Event delegation** — In the component's container click handler, detect `data-hbwp-like` and `data-hbwp-rate` attributes, call the `SocialDataService`, update the item's social data in state, and re-render the template
7. **Caching** — Social data changes frequently; cache briefly (1-2 min) or skip caching. Like/rate actions should optimistically update the UI before the REST call returns
8. **Rating display component** — Consider a `{{starRating average}}` helper that outputs ★★★☆☆ HTML using the average value

**Template usage examples:**
```handlebars
{{#each items}}
  <div class="item">
    <h3>{{Title}}</h3>
    
    {{!-- Like button --}}
    <button data-hbwp-like="{{ID}}" class="{{#if (likedByMe this)}}liked{{/if}}">
      ♥ {{likes this}}
    </button>
    
    {{!-- Star rating --}}
    <div>{{starRating (rating this)}} ({{ratingCount this}} ratings)</div>
    
    {{!-- Comments --}}
    <span>💬 {{commentCount this}}</span>
  </div>
{{/each}}
```

**Estimated complexity:** Medium-High — REST endpoints are straightforward but batching social data across many items efficiently requires careful design; optimistic UI updates add complexity

---

## Async Data Expansion Helper (hbwp-expand)

A Handlebars block helper that fetches additional data for a list item on demand, rendering loading/notfound/loaded states. Enables drill-down into related data without pre-fetching everything.

- [ ] Implement `{{#hbwp-expand}}` block helper with loading/notfound/loaded sections
- [ ] Post-render hydration — placeholder divs get replaced when async data arrives
- [ ] Support expanding from any configured list by key
- [ ] Support click-to-expand (lazy) and auto-expand (eager) modes

### Concept

```handlebars
{{#each items}}
  <h3>{{Title}}</h3>
  
  {{#hbwp-expand list="ideas" id=this.IdeaId}}
    {{!-- Rendered when data loads successfully --}}
    <p>Idea: {{Title}} — {{Description}}</p>
    <span>Category: {{Category.Value}}</span>
  {{else hbwp-loading}}
    {{!-- Rendered immediately as placeholder --}}
    <div class="spinner">Loading idea details...</div>
  {{else hbwp-notfound}}
    {{!-- Rendered if item not found or fetch fails --}}
    <p class="muted">Idea not found</p>
  {{/hbwp-expand}}
{{/each}}
```

### Implementation Tasks

**Files to modify:** `HandlebarsListView.tsx` (helper registration, post-render hydration), `ListDataService.ts` (single-item fetch)

**Tasks:**
1. **Helper registration** — `hbwp-expand` is a block helper that outputs a placeholder `<div data-hbwp-expand data-list="..." data-item-id="..." data-template-id="...">`. The loading block is rendered inline immediately. The success/notfound templates are stored as compiled functions keyed by a unique ID.
2. **Template storage** — On first render, each `hbwp-expand` invocation compiles its inner blocks (success, notfound) and stores them in a Map keyed by a unique element ID. These are used during hydration.
3. **Post-render hydration** — After `dangerouslySetInnerHTML` renders, scan for `[data-hbwp-expand]` elements. For each, fetch the item from SharePoint (or from an already-loaded data source cache), render the appropriate template block, and replace the placeholder.
4. **Data fetching** — Single-item fetch: `list.items.getById(id)` or check if the item exists in an already-fetched data source. If the data source is already loaded (e.g., `ideas` was configured as an additional data source), skip the fetch and look up locally.
5. **Click-to-expand mode** — If `lazy=true` is set, don't auto-fetch. Instead render the loading block with a click handler. On click, fetch and replace.
6. **Caching** — Expanded items should be cached so re-renders don't re-fetch. Use the existing CacheService with short TTL.
7. **Cleanup** — On component unmount or re-render, clear stored template functions and any pending fetch promises.

**Estimated complexity:** High — Handlebars is synchronous, so this requires a two-phase render pattern (render placeholders → hydrate after mount). See [docs/analysis-async-handlebars.md](analysis-async-handlebars.md) for detailed feasibility analysis.

---

## Enable Extensibility Library Import

Add support for importing an external SPFx library component (like PnP Modern Search does), so third-party or shared Handlebars helpers and web components can be registered at runtime.

### How PnP Search Does It

PnP Search v4 defines an `IExtensibilityLibrary` interface. The Search Results web part:
1. Takes a library component manifest ID from the property pane
2. Loads it at runtime via `SPComponentLoader.loadComponentById()`
3. Calls `getCustomWebComponents()`, `registerHandlebarsCustomizations()`, etc. on the loaded library
4. Registers the returned web components via `customElements.define()` and passes the Handlebars namespace for helper registration

### Implementation Tasks

**Files to create:**
- `src/webparts/handlebarsListView/extensibility/IExtensibilityLibrary.ts` — interface definition

**Files to modify:**
- `HandlebarsListViewWebPart.ts` — property pane field for library manifest ID, load library in `onInit()`
- `HandlebarsListView.tsx` — pass loaded library to component, call registration methods before template compile
- `IHandlebarsListViewProps.ts` — add optional `extensibilityLibrary` prop

**Tasks:**
1. **Define `IHbwpExtensibilityLibrary` interface:**
   ```typescript
   interface IHbwpExtensibilityLibrary {
     getCustomWebComponents?(): IComponentDefinition[];
     registerHandlebarsCustomizations?(handlebarsNamespace: typeof Handlebars): void;
     getCustomDataSources?(): IDataSourceDefinition[];
     onInit?(context: IHbwpExtensibilityContext): Promise<void>;
   }
   ```
2. **Property pane config** — Add a text field for the library component manifest GUID. Validate it's a valid GUID format.
3. **Load library at runtime** — In `onInit()`, use `SPComponentLoader.loadComponentById<IHbwpExtensibilityLibrary>(manifestId)` to load the library. Cache the reference.
4. **Register web components** — Call `getCustomWebComponents()` and iterate: `customElements.define(name, componentClass)` (guard with `customElements.get()` to avoid double-registration).
5. **Register helpers** — Call `registerHandlebarsCustomizations(Handlebars)` before template compilation.
6. **Context passing** — Create an `IHbwpExtensibilityContext` with `siteUrl`, `listId`, `spHttpClient`, `aadHttpClientFactory`, so library authors can make auth-aware REST calls.
7. **Multiple libraries** — Support an array of manifest IDs (not just one) so multiple libraries can be loaded.
8. **Error handling** — If a library fails to load, log a warning and continue. Don't block template rendering.

**Estimated complexity:** Medium — `SPComponentLoader` API is straightforward; main work is interface design and the property pane UX.

---

## Web Component Library (hbwp-components)

Extract interactive UI patterns from this project into a standalone SPFx library component that can be consumed by both this web part AND PnP Modern Search (or any Handlebars-based SPFx web part).

### Component Inventory

#### Tier 1 — Strong candidates (self-contained interactive behavior)

| Component | Tag | Attributes | What It Does | Current Source |
|---|---|---|---|---|
| **Like Button** | `<hbwp-like-button>` | `item-id`, `list-id`, `site-url`, `count`, `liked` | Toggle like/unlike with optimistic UI, heart icon, count display. Makes REST calls directly via `fetch()`. | `likeButton` helper + `handleContainerClick` delegation |
| **Star Rating** | `<hbwp-star-rating>` | `value`, `max`, `item-id`, `list-id`, `site-url`, `interactive` | Displays ★★★☆☆. When `interactive`, click submits rating via REST. | `starRating` helper + `data-hbwp-rate` delegation |
| **Form Container** | `<hbwp-form>` | `endpoint`, `method`, `site-url`, `list-id`, `auth-type`, `reset` | Wraps child inputs, intercepts submit, posts to SP list or HTTP endpoint, shows success/error. | `hbwp-form` helper + `handleContainerSubmit` + `FormSubmitService` |
| **Persona** | `<hbwp-persona>` | `name`, `email`, `sip`, `picture-url`, `size`, `show-actions` | User photo + name + email/chat action links. Uses `userphoto.aspx` for avatar. | Repeated pattern in idea-cards, cards, master-detail templates |

#### Tier 2 — Good candidates (reusable UI patterns)

| Component | Tag | Attributes | What It Does | Current Source |
|---|---|---|---|---|
| **Bar Chart** | `<hbwp-bar-chart>` | `data` (JSON), `label-key`, `value-key`, `color` | Simple horizontal bar chart for survey results / metrics | survey.hbs results visualization |
| **Metro Tile** | `<hbwp-metro-tile>` | `href`, `label`, `badge`, `icon` (slot) | Dashboard-style tile with icon, label, and optional badge count | metro-links.hbs |
| **Detail Dialog** | `<hbwp-detail-dialog>` | `title`, slotted content | Click-to-open modal for item details. Wraps `<fluent-dialog>`. | cards.hbs, announcements.hbs |

#### Tier 3 — Keep as Handlebars helpers (register via `registerHandlebarsCustomizations`)

| Helper | Why Not a Web Component |
|---|---|
| `filter`, `percentage`, `substring`, `concat`, `json` | Pure data/string utilities, no DOM output |
| `hbwp-input`, `hbwp-textarea`, `hbwp-select`, `hbwp-checkbox`, `hbwp-submit`, `hbwp-hidden` | Thin wrappers over existing Fluent UI web components |
| `findItem`, `findItems` (future) | Data lookup, no DOM |

### Architecture

```
spfx-hbwp-components/                      ← New SPFx library component project
  src/
    HbwpComponentsLibrary.ts               ← implements IHbwpExtensibilityLibrary
      ├── getCustomWebComponents()         ← returns all Tier 1 + Tier 2 components
      └── registerHandlebarsCustomizations(Handlebars)
            ├── filter, percentage, substring, concat, json
            ├── likeButton (emits <hbwp-like-button> tag)
            ├── starRating (emits <hbwp-star-rating> tag)
            └── hbwp-form helpers
    components/
      ├── HbwpLikeButton.ts                ← extends HTMLElement, Shadow DOM
      ├── HbwpStarRating.ts                ← extends HTMLElement, Shadow DOM
      ├── HbwpForm.ts                      ← extends HTMLElement, Shadow DOM
      ├── HbwpPersona.ts                   ← extends HTMLElement, Shadow DOM
      ├── HbwpBarChart.ts                  ← extends HTMLElement, Shadow DOM
      ├── HbwpMetroTile.ts                 ← extends HTMLElement, Shadow DOM
      └── HbwpDetailDialog.ts              ← extends HTMLElement, Shadow DOM
    services/
      ├── SpRestClient.ts                  ← fetch-based SP REST (no PnPjs dependency)
      │     ├── like(siteUrl, listId, itemId)
      │     ├── unlike(siteUrl, listId, itemId)
      │     ├── rate(siteUrl, listId, itemId, value)
      │     ├── addItem(siteUrl, listId, data)
      │     └── getRequestDigest(siteUrl)
      └── CacheService.ts                  ← portable localStorage cache (copy from hbwp)
    helpers/
      └── index.ts                         ← all Handlebars helper registrations
```

### Key Design Decisions

1. **No PnPjs dependency** — Web components use `fetch()` with `credentials: 'same-origin'` for SP REST calls. The auth cookie on the SharePoint page handles authentication. Need `X-RequestDigest` for POST operations (obtained from `/_api/contextinfo`).

2. **Shadow DOM** — Each component renders in Shadow DOM for style isolation. This replaces `scopeCssClasses` entirely. Templates can still style the host element via `::part()` or CSS custom properties.

3. **Handlebars helpers as wrappers** — The `registerHandlebarsCustomizations` method registers helpers that emit the web component tags:
   ```typescript
   Handlebars.registerHelper('likeButton', (itemId, count, likedBy, userId, options) => {
     const liked = /* check likedBy array */;
     return new Handlebars.SafeString(
       `<hbwp-like-button item-id="${itemId}" count="${count}" liked="${liked}" 
         site-url="${options.data.root.siteUrl}" list-id="${options.data.root.listId}">
        </hbwp-like-button>`
     );
   });
   ```

4. **Works in both HBWP and PnP Search** — PnP Search calls `getCustomWebComponents()` and `registerHandlebarsCustomizations()` on the library. HBWP would do the same via the extensibility library import (see backlog item above).

5. **Progressive extraction** — Start by building `<hbwp-like-button>` as a proof of concept. Once the pattern is proven, extract the rest incrementally.

### Implementation Phases

| Phase | Components | Effort |
|---|---|---|
| **Phase 1: Foundation** | Project scaffolding, `SpRestClient`, `IHbwpExtensibilityLibrary` impl, `<hbwp-like-button>` | Medium |
| **Phase 2: Social** | `<hbwp-star-rating>`, interactive rating support | Low |
| **Phase 3: Forms** | `<hbwp-form>`, form helper wrappers | Medium |
| **Phase 4: Display** | `<hbwp-persona>`, `<hbwp-bar-chart>`, `<hbwp-metro-tile>`, `<hbwp-detail-dialog>` | Medium |
| **Phase 5: Integration** | Wire into HBWP extensibility loader, test with PnP Search, documentation | Medium |

### PnP Search Compatibility Notes

- PnP Search expects `IExtensibilityLibrary` from `@pnp/modern-search-extensibility`
- Our `IHbwpExtensibilityLibrary` should be a superset — implement both interfaces
- Web components must work in light DOM context (PnP Search doesn't use Shadow DOM for its layout)
- Consider a `shadow` attribute: `<hbwp-like-button shadow="false">` to opt out of Shadow DOM for compatibility
- Handlebars namespace passed to `registerHandlebarsCustomizations()` is PnP Search's instance, not a global — helpers must be registered on the passed namespace

**Estimated complexity:** High overall (spans multiple phases), but each phase is Medium individually.
