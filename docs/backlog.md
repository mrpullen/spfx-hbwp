# Backlog

## Paging Control

This paging will only work on the items data - as it will be primary. it should integrate with the viewxml and the returned data if used - data returned will hopefully provide next / previous pointer information.

- [ ] Build `hbwp-paging` Handlebars helper/block that integrates with paged list results
- [ ] Support configurable page size
- [ ] Render next/previous/page number navigation
- [ ] Maintain paging state across re-renders

### Implementation Notes

**Current limitation:** `getItemsByCAMLQuery` in PnPjs returns a flat array — it does **not** expose `ListItemCollectionPositionNext` paging metadata.

**Required approach — use SharePoint REST directly:**
```
POST /_api/web/lists('{listId}')/GetItems
Body: { query: { ViewXml: '...', ListItemCollectionPositionNext: '...' } }
```

The REST response includes:
- `d.results` — the page of items
- `d.ListItemCollectionPositionNext` — a token string (e.g., `Paged=TRUE&p_ID=100`) to pass for the next page

**Steps to implement:**
1. Replace `getItemsByCAMLQuery` with direct REST call via PnPjs `spHttpClient` or `SPHttpClient`
2. Ensure `<RowLimit Paged="TRUE">N</RowLimit>` is in the ViewXml (injected or from the stored view)
3. Return both items and position token from `fetchFromSharePoint` (update `IListDataResult`)
4. Store position token in component state for forward/back navigation
5. `hbwp-paging` helper renders prev/next controls that trigger re-fetch with the stored position token
6. Consider exposing `{{paging.hasNext}}`, `{{paging.hasPrev}}`, `{{paging.currentPage}}` in template context

## Query Parameter Token Support

We want to be able to link to query / parameter name 

- [ ] Support `{{query.paramName}}` tokens in CAML filters and HTTP endpoint URLs
- [ ] Parse URL query string parameters at runtime and inject into token context
- [ ] Allow dynamic filtering based on URL (e.g., `{{query.id}}`, `{{query.status}}`)

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
