# v2 Pub/Sub Data Flow

**Goal:** Replace synchronous "fetch → wait → render" with a pub/sub flow where
adapters publish results onto the global MessageBus, and the web part listens,
merges into the shared data model, and re-renders.

This unifies initial-load and connected-part-update into one mental model:
*everything is a topic on the bus*.

## Out of Scope

Legacy backward-compat code is being removed; v2 is breaking. The old
`feature/modern-page-likes` branch retains the legacy path.

---

## Confirmed Decisions

- **Global MessageBus** — adapter results and connected-part inputs share one bus.
- **Token-scan + auto-refresh in `DataAdapterBase`** — third-party adapters get reactive behaviour for free.
- **Services already relocated** to `src/extensions/services/`.

---

## Vocabulary — 8 DataAction verbs

```ts
export type DataAction =
  | 'selection-changed'    // UI: user picked record(s)
  | 'criteria-changed'     // UI: filter slice updated (or null = clear slice)
  | 'page-requested'       // UI: paging click; preserves criteria
  | 'item-saved'           // UI/Form: record created or updated
  | 'item-deleted'         // UI/Form: record removed
  | 'data-changed'         // Adapter ONLY: fresh result data published
  | 'refresh-requested'    // UI: re-fetch this topic (resets paging)
  | 'cache-cleared';       // UI: wipe criteria + cache, re-fetch
```

### Envelope additions

```ts
export interface IDataEnvelope {
  topic: string;
  source: string;
  timestamp: number;
  action: DataAction;
  data: {
    item?: Record<string, any> | null;        // null = clear slice (criteria-changed)
    items?: Record<string, any>[];
    criteriaKey?: string;                      // criteria-changed
    direction?: 'next' | 'prev' | 'first';    // page-requested
    pagingToken?: string;                      // page-requested
    result?: IDataAdapterResult;               // data-changed
    [key: string]: any;
  };
}
```

### Producer / Consumer matrix

| Verb | Producers | Consumers | Effect |
|---|---|---|---|
| `selection-changed` | `HbwpActionElement` | Forms / maps; adapters whose tokens reference this topic | Replace local context; adapters re-fetch |
| `criteria-changed` | `HbwpActionElement` (filters) | Adapter owning the topic | Merge slice by `criteriaKey` (null = clear); reset paging; refetch |
| `page-requested` | `HbwpPagerElement` | Adapter owning the topic | Preserve criteria; fetch with token |
| `item-saved` | `HbwpFormElement` | Owning adapter; connected views | Refetch (resets paging) |
| `item-deleted` | `HbwpFormElement` / delete button | Same as item-saved | Refetch (resets paging) |
| `data-changed` | **Adapters only** | WP (re-render); dependent adapters; filter WPs (rebuild options) | Update `_adapterResults`, re-render |
| `refresh-requested` | UI / dependency cascade | Owning adapter | Reset paging; preserve criteria; refetch |
| `cache-cleared` | UI / external | Owning adapter | Wipe criteria + cache; refetch |

---

## Loop-Prevention (Six independent guards)

1. **Verb separation** — `data-changed` produced only by adapters; UI never publishes it.
2. **Single owner per topic** — Pipeline asserts at `instantiate()` no duplicate keys.
3. **Acyclic graph** — Topo-sort detects cycles; throws.
4. **No self-subscription** — `DataAdapterBase.onAttach` excludes own `instanceKey` from token-discovered subscriptions.
5. **Per-topic refresh debounce** — 250ms collapse window inside the adapter.
6. **`lastMessage` replay (not re-publish)** — Late-joiners read state without firing events.

---

## CAML Filter Composition (`criteria-changed` multi-slice)

`criteria-changed` is **partial-merge** by `criteriaKey`. Two filter web parts publishing on the same topic each own a named slice:

```
Division filter → { criteriaKey: 'division',  item: { division: 42 } }
JobTitle filter → { criteriaKey: 'jobTitle',  item: { jobTitle: 'Mgr' } }
Clear division  → { criteriaKey: 'division',  item: null }
Reset all       → cache-cleared (no payload)
```

Adapter merges:

```ts
if (env.data.item === null) delete this._criteria[env.data.criteriaKey];
else                        this._criteria[env.data.criteriaKey] = env.data.item;
```

### `{{#if-resolved}}` block helper for CAML

Wrap each conditional clause:

```handlebars
<Where>
  <And>
    {{#if-resolved roster.division}}
    <Eq><FieldRef Name='Division'/><Value Type='Lookup'>{{roster.division}}</Value></Eq>
    {{/if-resolved}}
    {{#if-resolved roster.jobTitle}}
    <Eq><FieldRef Name='JobTitle'/><Value Type='Text'>{{roster.jobTitle}}</Value></Eq>
    {{/if-resolved}}
  </And>
</Where>
```

Resolver pipeline:
1. Drop blocks where the token is unresolved/empty/null.
2. Run standard `{{token}}` substitution on what remains.
3. **Structural normalization**: `<And>`/`<Or>` with single child collapse to the child; empty `<And>`/`<Or>` are dropped; empty `<Where>` is removed entirely.

Lives in `src/extensions/services/CamlFilterResolver.ts` — `resolveCamlFilter(template, ctx): string`.

---

## Paging Trace

```
[Pager click "Next"]
  → publishes { topic:'roster', action:'page-requested',
                data:{ direction:'next', pagingToken:'<from lastMessage>' } }
  → SharePointListAdapter ('roster' owner):
      this._pagingToken = env.data.pagingToken;
      scheduleFetch();   // criteria preserved
  → fetch resolves CAML against criteria slices + pagingToken
  → publishes { topic:'roster', action:'data-changed', data:{ result } }
  → HandlebarsListView re-renders
  → HbwpPagerElement reads new envelope, updates next/prev state
```

`HandlebarsListView` no longer holds `pagingToken` or `pageHistory` — pure consumer.

---

## Architecture Changes

### `DataAdapterBase`

- `onAttach(bus, baseCtx)` — lifecycle hook with default implementation:
  - Subscribes to `this.instanceKey` for: `criteria-changed`, `page-requested`, `refresh-requested`, `cache-cleared`, `item-saved`, `item-deleted`, `selection-changed`
  - Scans `config.properties` string values for `{{topic.*}}` tokens; subscribes to those topics' `data-changed` (excluding self)
  - Any incoming → `_scheduleFetch()`
- `onDetach()` — unsubscribe all
- `_scheduleFetch()` — debounced (250 ms) fetch then publish
- `publishResult(bus, result)` — posts `{ topic, action: 'data-changed', data: { result } }`

### `DataAdapterPipeline`

- Replace `execute(baseCtx, onResult)` with `attach(bus, baseCtx)` / `detach()`.
- Initial wave is topo-sorted; afterwards, subscriptions drive everything.
- `instantiate()` asserts unique keys, detects cycles.

### `HandlebarsListView`

- Subscribe to `data-changed` per configured adapter key.
- On envelope: `_adapterResults[key] = env.data.result; debouncedRender()`.
- Drop `pagingToken`, `pageHistory` state.
- Drop `_handleTopicMessage` (connected parts publish via web components, adapters consume directly).

### Legacy cleanup (after pub/sub works)

- Remove `initLegacyServices()` + four service fields.
- Remove ServiceContext `formSubmit/listData/httpData/social` wrappers — web components use bus + adapters.
- Remove `handleSocialAction`, `handleFormSubmit`, `showFormResult`, `handleContainerSubmit`.
- Remove social/paging branches in `handleContainerClick`.
- Remove `ServiceAdapters.ts` if unused.
- Drop `subscribeTopics` property pane if no longer needed.

---

## Step Plan

1. ✅ Codify this doc.
2. Update `DataAction` + envelope in `spfx-extensibility`.
3. Build extensibility.
4. Add duplicate-key + cycle assertion to `DataAdapterPipeline.instantiate`.
5. Update `HbwpActionElement` (verb names + `data-criteria-key`).
6. Update `HbwpFormElement` (publish `item-saved`/`item-deleted`).
7. Update `HbwpPagerElement` (publish `page-requested` from `lastMessage`).
8. Update `HandlebarsListView.handleIncomingMessage` to new verbs (transitional — will be deleted in step 13).
9. Add `CamlFilterResolver` (block helper + structural normalization).
10. Add `DataAdapterBase.onAttach` lifecycle (token scan, debounce, publish).
11. Refactor `DataAdapterPipeline` to `attach()`/`detach()`.
12. Wire `HandlebarsListView` to subscribe to `data-changed` per adapter key.
13. Strip legacy services / handlers / state.
14. Final build + smoke.
