# HandlebarsListView Pipeline Wiring Plan

**Goal:** Wire the existing `DataAdapterPipeline` into `HandlebarsListView.tsx` so the
data flow runs through the new adapter abstraction. Current state: pipeline is referenced
but the supporting methods (`initPipeline`, `executePipelineAndRender`, `buildBaseContext`,
`_handleAdapterResult`) are missing, plus several legacy types are no longer imported,
producing 18 TypeScript errors.

This plan is broken into small atomic steps. Each step ends with a build to confirm
progress before continuing. If any step fails, recovery is to revert that step only.

---

## Current Errors (baseline: 18 errors)

- `IDataAdapterContext`, `FormSubmitAdapter`, `_adapterResults` declared but never read
- Methods missing: `initPipeline`, `executePipelineAndRender`, `buildBaseContext`
- Types not found: `ITokenContext`, `IListDataResult`, `IListDataSource`, `IHttpEndpointDataSource`
- Function not found: `resolveTokens`

The legacy `getAllData()` and its helpers (`getPrimaryListData`, `getAdditionalDataSources`,
`getHttpEndpointData`, `resolveFilterWithGuard`, `toEnvelope`) reference those missing
types and functions — they are the dead branch that must be replaced by the pipeline.

---

## Steps

### Step 1 — Add the four missing pipeline methods

Insert after `subscribeToTopics()` (around line 728):

- `initPipeline()` — instantiate `DataAdapterPipeline`, register adapter definitions
  from `this.props.extensibilityService.getDataAdapterDefinitions()`, instantiate
  configured adapter instances from `this.props.adapterConfigs`.
- `buildBaseContext()` — return the `Omit<IDataAdapterContext, 'config' | 'resolvedData'>`
  shape: `instanceId`, `user`, `page`, `query`, `pagingToken`.
- `executePipelineAndRender()` — build seed data (user, page, query, instanceId),
  call `pipeline.execute(baseContext, this._handleAdapterResult)`, then call
  `getHandlebarsTemplate()` for the final render.
- `_handleAdapterResult(key, result)` — store result in `this._adapterResults`,
  optionally do an incremental render.

**Expected:** 3 errors fixed (methods now exist). Some TS errors still present from
`getAllData` and helpers.

### Step 2 — Replace `getAllData()` body

Rewrite `getAllData()` to assemble `ITemplateData` from `this._adapterResults` instead
of calling the legacy helpers. Map adapter keys to template variable names:

- `items` (primary list) → `this._adapterResults['items']`
- `user` → `this._adapterResults['user']`
- `page` → `this._adapterResults['page']`
- additional data sources → spread by their adapter key
- HTTP endpoints → spread by their adapter key
- query, wpId, instanceId, siteUrl, incoming/incomingItems, topicContexts → unchanged

**Expected:** `getAllData` still typed, but its helpers are now dead. Errors reduced
to those inside the dead helpers.

### Step 3 — Delete dead legacy data methods

Remove:

- `resolveFilterWithGuard`
- `toEnvelope` (static)
- `getPrimaryListData`
- `getAdditionalDataSources`
- `getHttpEndpointData`

These reference `ITokenContext`, `IListDataResult`, `IListDataSource`, `IHttpEndpointDataSource`,
and `resolveTokens`, all of which are no longer imported.

**Expected:** All "cannot find name" errors disappear.

### Step 4 — Clean up imports

Remove unused symbols from the import line:
- `IDataAdapterContext` (only the type usage remains)
- `FormSubmitAdapter` (no longer instantiated directly here)

**Expected:** TS6133 errors disappear.

### Step 5 — Wire `_adapterResults` consumer or remove field

If `getAllData()` reads `this._adapterResults` directly, the field is consumed and
the TS6133 goes away. Otherwise remove the field.

**Expected:** Clean build, zero errors.

---

## Out of Scope (intentional)

- Stripping legacy handlers (`handleContainerClick` social/paging branches,
  `handleSocialAction`, `handleFormSubmit`, `showFormResult`, `handleContainerSubmit`).
  These are dual-path (try pipeline first, fall back to legacy services) and harmless
  to keep until the web-component migration is fully proven.
- Removing legacy service instantiation (`initLegacyServices`). The `ServiceContext`
  registration still relies on the legacy adapter wrappers for web components like
  `HbwpFormElement`, `HbwpLikeElement`, etc.
- Refactoring `componentWillUnmount` further. It already disposes the pipeline.

---

## Recovery Strategy

After each step, run:

```bash
cd /home/pullen/repos/spfx-hbwp
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 18 >/dev/null 2>&1
npx gulp build --ship 2>&1 | grep -E "error TS" | head -20
```

If a step introduces *new* errors (errors not on the baseline list), revert just that
step's edit and re-evaluate. Old errors disappearing is expected progress.
