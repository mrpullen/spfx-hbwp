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

Extracting four real libraries from that monolith — Fluent, Social, RSS,
and Vue — gives us:

1. **A regression test** for every contribution slot in `IExtensibilityLibrary`,
   plus the new template-asset and engine-extension slots.
2. **A reference implementation** users can clone for their own libraries.
3. **A path to versioning** — each library ships semver-independent of HBWP.
4. **Smaller in-box footprint** — strip the web part bundle of components most
   templates don't use.
5. **Four different shapes** — Fluent contributes only components, Social
   touches every existing slot, RSS adds a network-egress adapter and
   the new template-asset slot, and Vue ships a complete alternative
   template engine that proves the render pipeline is engine-agnostic.

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

## Library 3 — `@mrpullen/hbwp-rss` (RSS / Feed Library)

### Scope

The RSS / Atom / RDF / podcast / video-feed story, packaged as a single
opt-in library. Demonstrates the **third extensibility shape** —
contributing a *data adapter that performs network egress* — and pairs
that adapter with a curated set of templates and small web components
so authors get a working "blog reader / news ticker / podcast list /
video gallery" in one drop.

This validates that:

- A library can ship a network-egress adapter that honors the host's
  endpoint allow-list and audit-sink contracts (per
  `http-endpoint-governance-plan.md`).
- A library can ship **template assets** (`.hbs` files) discoverable
  by the host's template picker, not just code.
- A media-flavored library coexists cleanly with Fluent + Social on the
  same page.

### What it ships

**`RssDataAdapter`** — implementation of the Tier 1 entry in
`data-adapters-roadmap.md`. Operations:

- `fetch` — paged feed read (`pageSize`, `page` config; returns
  `{ items, page, pageSize, totalItems? }`)
- `getByLink` — single item by exact link match
- `getByGuid` — single item by GUID/ID
- `since` — items newer than a timestamp

Normalized envelope per item:

```ts
interface IRssItem {
  guid: string;
  title: string;
  link: string;
  date: string;             // ISO
  author?: string;
  summary?: string;         // plain text
  contentHtml?: string;     // sanitized HTML when present
  thumbnail?: string;       // URL
  categories?: string[];
  // Media extensions (RSS Media, iTunes, YouTube)
  enclosure?: {
    url: string;
    type: string;           // mime
    durationSeconds?: number;
    sizeBytes?: number;
  };
  itunes?: {
    duration?: string;
    episode?: number;
    season?: number;
    explicit?: boolean;
    image?: string;
  };
  youtube?: {
    videoId: string;
    channelId?: string;
  };
}
```

The adapter normalizes RSS 2.0, Atom 1.0, RDF 1.0, RSS Media (`media:*`),
iTunes podcast (`itunes:*`), and YouTube channel feeds
(`yt:videoId`, `media:group`) into the same shape so a single template
can render any feed type.

**Config (property pane):**

- Feed URL (token-resolvable)
- Optional CORS-proxy URL prefix
- Cache TTL (default 15 minutes)
- Max items per page
- Optional User-Agent override
- Sanitize content HTML (default on; uses bundled DOMPurify)
- Strip tracking pixels (default on)

**Sanitization rule:** `contentHtml` is always passed through DOMPurify
before publishing. Templates render via `{{{contentHtml}}}` (triple-stash)
without re-sanitizing. The adapter is the trust boundary.

### Web components

- **`<hbwp-feed-card>`** — single feed-item card (thumbnail / title /
  date / summary / "Read more"). Reused by every template below.
- **`<hbwp-feed-list>`** — virtualized list wrapper for long feeds
  (lazy renders only visible rows).
- **`<hbwp-podcast-player>`** — audio player for `enclosure` items
  with audio MIME types. Wraps the standard `<hbwp-media>` (plyr.io)
  with podcast chrome: cover art, episode title, play/pause, scrubber,
  speed control, "subscribe in your podcast app" deep links
  (Apple, Spotify, Pocket Casts, RSS).
- **`<hbwp-video-tile>`** — video thumbnail with hover-preview, click
  opens a Plyr modal. Handles YouTube, Vimeo, and direct video URLs.
- **`<hbwp-feed-filter>`** — filter chip row driven by `categories`.
  Click a chip → publishes `feedFilter` topic; the adapter (or a
  Handlebars `{{filter}}` step) narrows the rendered set.

All components honor the same skeleton + optimistic-UI conventions as
the social library.

### Templates shipped

The library ships four reference templates (`.hbs` files exported from
the package, registerable with the host's template picker). Each
demonstrates a different consumption pattern:

1. **Blog template** (`blog.hbs`)

   - Hero card for the latest post (large thumbnail + excerpt + read time).
   - Stacked cards for the rest of the page.
   - Author byline with `<hbwp-persona size="xsmall">` if the persona
     library is installed (graceful fallback to plain text otherwise).
   - Categories rendered as `<hbwp-feed-filter>` chips at the top.
   - Pager driven by standard `<hbwp-pager>` for next/prev pages.
   - **Use case:** company blog roll-up, team blog, partner blog feed.

2. **RSS news template** (`news.hbs`)

   - Compact list view: date, source, headline, 2-line summary.
   - Source domain rendered as a chip (favicon + hostname) so multi-feed
     mixes are scannable.
   - Optional "ticker" mode (CSS marquee) for a thin horizontal banner
     variant; toggled via property-pane radio.
   - Auto-refresh interval (1, 5, 15 minutes) via the existing refresh
     contract.
   - **Use case:** corporate-comms news feed, IT alert ticker, vendor
     announcements roll-up.

3. **Music / podcast template** (`podcast.hbs`)

   - Episode list with cover art, title, duration, episode number.
   - Inline `<hbwp-podcast-player>` for the currently selected episode
     (click an episode → publishes `selectedEpisode` → player resolves).
   - Show-level metadata header (show art, host, "subscribe" deep links).
   - Search box scoped to episode titles via the standard
     `<hbwp-action data-publishes="podcastSearch">` pattern.
   - **Use case:** internal podcast distribution, employee comms
     podcast, learning channels.

4. **Video gallery template** (`video.hbs`)

   - Grid of `<hbwp-video-tile>` thumbnails (3, 4, or 6 columns
     responsive).
   - Click a tile → opens a Plyr modal with the full player.
   - Channel header (title + description + thumbnail) for YouTube /
     Vimeo channel feeds.
   - Optional "featured" row at the top with one large tile + four
     smaller below.
   - **Use case:** training video catalog, vendor demo channel, internal
     video library, "all-hands recordings" page.

Each template ships with a matching property-pane preset so an author
can drop the web part, pick "Blog from RSS" / "RSS news ticker" /
"Podcast feed" / "Video gallery" and supply just the URL.

### Library contract

```ts
export class RssExtensibilityLibrary implements IExtensibilityLibrary {
  public name(): string { return 'HBWP RSS'; }

  public getCustomWebComponents(): IComponentDefinition<any>[] {
    return [
      { componentName: 'hbwp-feed-card',     componentClass: HbwpFeedCardElement },
      { componentName: 'hbwp-feed-list',     componentClass: HbwpFeedListElement },
      { componentName: 'hbwp-feed-filter',   componentClass: HbwpFeedFilterElement },
      { componentName: 'hbwp-podcast-player',componentClass: HbwpPodcastPlayerElement },
      { componentName: 'hbwp-video-tile',    componentClass: HbwpVideoTileElement },
    ];
  }

  public getDataAdapterDefinitions(): IDataAdapterDefinition[] {
    return [{
      adapterId: 'rss',
      adapterClass: RssDataAdapter,
      capability: 'read',          // pulled on refresh, no executeWrite
    }];
  }

  public registerHandlebarsCustomizations(hbs: typeof Handlebars): void {
    registerFeedHelpers(hbs); // {{feedDate}}, {{readingTime}}, {{durationHuman}}, …
  }

  public getTemplateEngines(): ITemplateEngineDefinition[] { return []; }

  public getTemplates(): ITemplateAssetDefinition[] {
    return [
      { id: 'rss-blog',    name: 'Blog from RSS',     file: 'blog.hbs' },
      { id: 'rss-news',    name: 'RSS news ticker',   file: 'news.hbs' },
      { id: 'rss-podcast', name: 'Podcast feed',      file: 'podcast.hbs' },
      { id: 'rss-video',   name: 'Video gallery',     file: 'video.hbs' },
    ];
  }
}
```

> **New extension slot**: `getTemplates()` is not in `IExtensibilityLibrary`
> today. Adding template-asset contribution is part of this library's
> validation work — see "Host changes" below.

### Required platform service

`RssDataAdapter` needs `IPlatformServices.httpClient` (the SPFx
`HttpClient`) for outbound fetches and the platform's `auditSink` if
configured. Both are already populated by the host. No SP-specific
service required.

### Bundled dependencies

- `fast-xml-parser` (~30 KB, MIT) — RSS/Atom/RDF parsing.
- `dompurify` (~22 KB, MIT) — HTML sanitization.
- `plyr` (~50 KB, MIT) — shared with `@mrpullen/hbwp-media`; if both are
  installed, the second registration is a noop.

All bundled per the section-2 hard rule in `fab40-implementation-plan.md`.
No CDN or runtime fetch.

### Governance integration

- Adapter calls go through `HttpDataService` so the **endpoint allow-list**
  applies to RSS feed URLs exactly as it does to HTTP endpoints. An
  admin disabling outbound HTTP also disables RSS.
- Audit events emit with `adapter: 'rss'`, `dataClass: 'public'` by
  default (since RSS feeds are inherently public). Admin can override
  per allow-list entry.
- Sanitization is non-bypassable — the property pane has no "skip
  sanitize" option. Authors who want raw HTML must fork the library.
- Tracking-pixel stripping defaults on; mentioned in the audit record
  so admins can verify.

### Host changes required

Two small additions to `@mrpullen/spfx-extensibility`:

1. **`getTemplates()` slot** on `IExtensibilityLibrary` — returns
   `ITemplateAssetDefinition[]` so libraries can contribute discoverable
   templates. Host's template picker concatenates built-in + library
   templates and shows them grouped by source.
2. **`ITemplateAssetDefinition`** type:
   ```ts
   interface ITemplateAssetDefinition {
     id: string;          // unique, e.g. 'rss-blog'
     name: string;        // display name
     file: string;        // relative path inside the library bundle
     description?: string;
     thumbnail?: string;  // small preview image, optional
   }
   ```

This is the only contract change for the entire library. Once this slot
exists, every future library can ship templates the same way (Fluent
could ship form templates, Social could ship comment-thread templates,
etc.).

### Risk / gotchas

- **CORS.** Most public RSS feeds don't return permissive CORS headers.
  Document the customer-owned proxy pattern prominently in the README;
  ship a sample Azure Function. Without a proxy the adapter is limited
  to feeds inside the customer tenant or feeds that explicitly allow
  CORS.
- **Feed-of-feeds dedup.** When mixing multiple feeds, items can repeat
  (cross-posts). Adapter exposes a `dedupeBy: 'guid' | 'link' | 'title'`
  config knob; default is `guid`.
- **HTML sanitization perf.** Long feed content + DOMPurify on every
  refresh is measurable. Cache sanitized output keyed by `(guid, contentHash)`
  in memory per adapter instance.
- **Podcast feeds are huge.** Some podcast feeds list every episode ever.
  Adapter must respect `pageSize` / `top` to avoid pulling 1 MB of XML
  per refresh; document recommended `pageSize` of 20.
- **YouTube channel feeds** are unauthenticated and stable
  (`https://www.youtube.com/feeds/videos.xml?channel_id=…`). No API key
  needed. **Do not** add YouTube Data API usage here — that's a
  different governance story; keep this library zero-key.

### Testing matrix

1. **Single feed, blog template** — Microsoft 365 blog RSS renders as
   blog cards with sanitized content.
2. **Multi-feed mix, news template** — three RSS sources merged,
   chronologically sorted, source chips visible. Validate dedup.
3. **Podcast feed** — official MS Mechanics or any public podcast.
   Episodes render with cover art and durations; player streams from
   enclosure URL. Subscribe deep links work.
4. **YouTube channel feed** — Microsoft 365 channel. Tiles render with
   thumbnails and click-to-play opens Plyr modal. No API key required.
5. **CORS-blocked feed** — confirm clean failure mode (cards render
   placeholder + admin sees audit event with status=`error`,
   reason=`cors`).
6. **Cross-library composition** — a `video.hbs` page that also uses
   `<hbwp-persona>` for the channel host's avatar. Both libraries
   loaded; no clashes.
7. **Allow-list enforcement** — feed URL outside admin allow-list is
   rejected at design time with a clear property-pane error.
8. **Template versioning** — RSS v1.0 ships `blog.hbs`. RSS v1.1 adds
   `magazine.hbs`. Templates from both versions remain selectable; a
   page using v1.0 `blog.hbs` continues to render after v1.1 deploy.

### Removal from in-box

Nothing to remove — RSS isn't in-box today. The library debuts in
the extracted form, and any existing reference to "RSS Reader" in
`fab40-implementation-plan.md` resolves to "install the
`@mrpullen/hbwp-rss` library."

---

## Library 4 — `@mrpullen/hbwp-vue` (Vue 3 Template Engine)

### Scope

Validate the **fourth and final extensibility shape** —
`getTemplateEngines()` — by shipping a Vue 3 alternative to Handlebars.
Authors using this library can pick "Vue" in the property-pane engine
selector, write a Vue template in the same textbox they used for
Handlebars, and have everything else (adapters, pub/sub, refresh,
`<hbwp-*>` web components, governance) work unchanged.

This is the first library that proves:

- The host's render pipeline is genuinely engine-agnostic.
- Custom web components from other libraries (`<hbwp-feed-card>`,
  `<hbwp-like>`, `<hbwp-pager>`) compose into Vue templates without
  modification.
- Pub/sub topics from the message bus surface cleanly as reactive Vue
  primitives.

### Engine choice — Vue, not Aurelia

Decision recorded here for posterity:

- **Vue 3 with Composition API + `<script setup>` and runtime template
  compilation.** ~90 KB gzipped including the compiler. Authors write
  template strings in the property pane; the library compiles them at
  runtime via `vue/dist/vue.esm-bundler.js`.
- **Aurelia 2 considered and declined**: better TS/DI ergonomics but
  smaller SPFx audience, less documentation density, and we'd own
  more support surface than Vue.
- **Lit / React / Svelte considered and declined**: Lit is too close
  to `BaseWebComponent` to prove anything new; React is unsurprising
  for SPFx; Svelte's compile-only model breaks the "author your own
  template in the property pane" workflow.

### What it ships

**`VueTemplateEngine`** — implementation of the host's
`TemplateEngineBase` contract (mirrors the existing
`HandlebarsTemplateEngine` shape so the host's render pipeline
treats both interchangeably):

```ts
import { createApp, App, reactive } from 'vue';
import {
  TemplateEngineBase,
  ITemplateEngineContext,
  ITemplateEnginePropertyDefinition,
  ITemplateEngineCallbacks,
} from '@mrpullen/spfx-extensibility';
import { ExtensibilityService } from '<host>';

export class VueTemplateEngine extends TemplateEngineBase {

  public readonly engineId   = 'vue';
  public readonly engineName = 'Vue 3';

  private _extensibilityService: ExtensibilityService | undefined;
  private _callbacks:            ITemplateEngineCallbacks | undefined;

  // One Vue app per host element so re-renders patch instead of remount.
  // Keyed by host element identity; cleared in dispose / on engine swap.
  private _apps = new WeakMap<HTMLElement, {
    app:   App;
    model: Record<string, unknown>;       // reactive data bag
    key:   string;                        // last template hash
  }>();

  public setExtensibilityService(service: ExtensibilityService): void {
    this._extensibilityService = service;
  }

  public registerCallbacks(cb: ITemplateEngineCallbacks): void {
    this._callbacks = cb;
  }

  public render(context: ITemplateEngineContext, data: any, host: HTMLElement): void {
    const templateKey = hash(context.template);
    const existing    = this._apps.get(host);

    // Re-render path: same template, just refresh the reactive model.
    if (existing && existing.key === templateKey) {
      Object.assign(existing.model, data);
      return;
    }

    // First render or template changed: dispose old app, mount a new one.
    if (existing) {
      existing.app.unmount();
    }

    const model = reactive({ ...data });

    const app = createApp({
      setup() { return model; },
      template: context.template,
    });

    // Engine extension point: every loaded library's
    // getEngineExtensions({ engineId: 'vue' }) install hook fires here,
    // installing $globals, directives, components, plugins, etc.
    this._extensibilityService?.installEngineExtensions('vue', app);

    // Composables (useTopic / useAdapterRead / …) read context out of
    // a per-app provide() so they don't need globals.
    app.provide('hbwpContext', { ...context, callbacks: this._callbacks });

    app.mount(host);
    this._apps.set(host, { app, model, key: templateKey });
  }

  public dispose(host: HTMLElement): void {
    const existing = this._apps.get(host);
    if (existing) {
      existing.app.unmount();
      this._apps.delete(host);
    }
  }

  public getPropertyDefinitions(): ITemplateEnginePropertyDefinition[] {
    // Mirrors HandlebarsTemplateEngine.getPropertyDefinitions() — same
    // file-picker + inline-code pair, just relabeled for Vue. Authors
    // can either (a) drop a .vue file in a SharePoint document library
    // and pick it via the file picker, or (b) write the template
    // inline in the property pane code editor. The host falls back to
    // the inline template only when no file is selected, identical to
    // the Handlebars behavior.
    return [
      {
        propertyName: 'templateFile',
        label: 'Template File (.vue)',
        type: 'filePicker',
        accepts: ['.vue', '.html', '.txt'],
        description: 'Upload .vue files to a SharePoint library and select them here.',
        order: 1
      },
      {
        propertyName: 'template',
        label: 'Inline Vue Template',
        type: 'code',
        language: 'HTML',  // closest Monaco language for Vue templates;
                           // could be upgraded to a 'Vue' contribution
                           // if/when Monaco gets first-class Vue support
                           // in the SPFx code-editor control.
        description: 'Used when no template file is selected.',
        order: 2
      }
    ];
  }
}
```

Key shape notes:

- Implements the **same `TemplateEngineBase` the Handlebars engine
  implements** — host doesn't know or care which engine it's calling.
- `engineId` / `engineName` are instance fields (not just types) so the
  property-pane engine selector can label them.
- Re-render uses Vue's `reactive` model + `Object.assign` so the host's
  refresh loop drives a Vue diff instead of a full DOM rebuild — same
  outcome as the Handlebars double-buffer trick, but free because Vue's
  reactivity is the diff.
- `dispose()` cleanly unmounts the Vue app, which is critical when the
  host swaps engines or the web part is removed (covers the
  "Cleanup on web-part dispose" risk above).

**Composables** — the headline feature for Vue authors:

- `useTopic<T>(topic): Ref<T | undefined>` — subscribes to a pub/sub
  topic, returns a reactive ref that auto-updates.
- `usePublish<T>(topic): (value: T) => void` — returns a publisher
  function bound to the topic.
- `useAdapterRead<T>(key, op, args?): { data, loading, error }` —
  calls `ctx.executeRead` and surfaces the result as reactive refs.
- `useAdapterWrite(key, op): (args) => Promise<result>` — async writer
  bound to `ctx.executeWrite`.
- `useResolvedTemplate(scope)` — re-renders when any resolved-key
  changes; the Vue equivalent of the `if-resolved` helper.

These pull `hbwpContext` out of the per-app `provide()` shown above, so
no globals leak between web parts on the same page.

These ship as named exports so authors `import { useTopic } from '@mrpullen/hbwp-vue'` at the top of `<script setup>`.

**Global properties** — Vue's nearest equivalent to Handlebars helpers,
registered on the engine's `app.config.globalProperties` so they're
callable from any template as `$relativeTime(date)`, `$json(obj)`, etc.
Mirror the Handlebars helper set so templates port 1:1 where possible.

**Sample templates (Fab 40 parity demos)** — five small Vue templates
that recreate Fab 40 patterns using only what already ships:

1. **`vue-tabs.vue`** — *Fab 40 Tabs.* Tab strip + content panels driven
   by a SharePoint list (column = tab name, body = content). Click a
   tab → publishes `selectedTab`, content panel reacts.
2. **`vue-accordion.vue`** — *Fab 40 Accordion.* List grouped by
   section column, expand/collapse via reactive ref. Pure Vue, no
   external library.
3. **`vue-image-rotator.vue`** — *Fab 40 Image Rotator.* Cycles through
   image-library items on a timer (`setInterval` cleaned up via
   `onUnmounted`). Demonstrates lifecycle hooks.
4. **`vue-news-feed.vue`** — *Fab 40 RSS Reader / News.* Renders the
   RSS adapter's normalized envelope. **Cross-library composition
   demo** — requires `@mrpullen/hbwp-rss` for the data, Vue for the
   rendering. Same data, different engine, same UX as `news.hbs`.
5. **`vue-counter.vue`** — *Fab 40 Counter / Stats Card.* Animated
   number ticker driven by a reactive ref. Smallest possible "hello,
   reactivity" demo for first-time authors.

Each template is a single-file `.vue` blob (template + script +
optional style) shipped as a template asset via the `getTemplates()`
slot introduced by Library 3.

### Library contract

```ts
export class VueExtensibilityLibrary implements IExtensibilityLibrary {
  public name(): string { return 'HBWP Vue'; }

  // Mirrors BuiltInExtensibilityLibrary.getTemplateEngines() exactly.
  // The host treats every engine identically — it's the engineId field
  // (on the engine instance + on this definition) that the property
  // pane uses for selection, and that the host uses for routing
  // template-asset → engine when rendering.
  public getTemplateEngines(): ITemplateEngineDefinition[] {
    return [{
      engineId:    'vue',
      engineName:  'Vue 3',
      engineClass: VueTemplateEngine,   // host calls `new engineClass()` per web part
    }];
  }

  // Engine-keyed extension contributions (see "Helper contract evolution")
  public getEngineExtensions(): IEngineExtensionDefinition[] {
    return [{
      engineId: 'vue',
      install: (app: VueApp) => {
        app.config.globalProperties.$relativeTime = relativeTime;
        app.config.globalProperties.$feedDate    = feedDate;
        app.config.globalProperties.$json        = json;
        app.directive('highlight', highlightDirective);
        // …
      },
    }];
  }

  public getCustomWebComponents(): IComponentDefinition<any>[] { return []; }
  public getDataAdapters(): IDataAdapterDefinition[] { return []; }
  public registerHandlebarsCustomizations(): void { /* noop — engine-agnostic */ }

  public getTemplates(): ITemplateAssetDefinition[] {
    return [
      { id: 'vue-tabs',           name: 'Tabs (Vue)',          file: 'vue-tabs.vue' },
      { id: 'vue-accordion',      name: 'Accordion (Vue)',     file: 'vue-accordion.vue' },
      { id: 'vue-image-rotator',  name: 'Image rotator (Vue)', file: 'vue-image-rotator.vue' },
      { id: 'vue-news-feed',      name: 'News feed (Vue)',     file: 'vue-news-feed.vue' },
      { id: 'vue-counter',        name: 'Counter (Vue)',       file: 'vue-counter.vue' },
    ];
  }
}
```

### Registration & discovery flow

End-to-end, here's how a Vue template ends up rendering on the page —
no host code changes for engine routing because the host already
discovers engines through `ExtensibilityService`:

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Tenant deploys @mrpullen/hbwp-vue via the Tenant-Wide          │
│    Extensibility Manager (same as any other library).             │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Web part boots → ExtensibilityService.loadLibraries() picks    │
│    up VueExtensibilityLibrary.                                    │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. ExtensibilityService aggregates getTemplateEngines() across    │
│    every loaded library:                                          │
│      [ {engineId:'handlebars', …},  {engineId:'vue', …} ]         │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Property pane's template-engine selector reads the aggregated  │
│    list — author sees "Handlebars" + "Vue 3". Picks Vue.          │
│    Author's choice persists as { engineId: 'vue', template: '…' } │
│    on web-part properties.                                        │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. On render, host resolves the engine instance:                  │
│      const def    = extService.getEngineById(props.engineId);     │
│      const engine = engineCache.get(def) ?? new def.engineClass();│
│      engine.setExtensibilityService(extService);                  │
│      engine.registerCallbacks({ onSelectionChanged, … });         │
│      engine.render(context, data, host);                          │
│    Same call shape used today for Handlebars — host code is       │
│    engine-agnostic.                                               │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. Inside engine.render():                                        │
│      • createApp({ setup → reactive(data), template })            │
│      • extService.installEngineExtensions('vue', app)             │
│        ↳ iterates every library's getEngineExtensions()           │
│          where engineId==='vue', calls install(app) on each       │
│      • app.provide('hbwpContext', { …context, callbacks })        │
│      • app.mount(host)                                            │
└──────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. Vue compiles the template at runtime, evaluates composables    │
│    (useTopic / useAdapterRead) which read hbwpContext, mounts     │
│    the result. Subsequent host-driven refreshes call render()     │
│    again with new data → engine's same-template path patches the  │
│    reactive model in place; Vue diffs and updates the DOM.        │
└──────────────────────────────────────────────────────────────────┘
```

**Two host changes implied by this flow** (callouts already in
"Host changes required" below; restating here so the registration
story is in one place):

1. `ExtensibilityService.installEngineExtensions(engineId, engineRoot)`
   — new method that iterates `getEngineExtensions()` from every
   library and calls each matching `install(engineRoot)`. Drop-in
   replacement for the implicit Handlebars-only path that lives in
   `registerHandlebarsCustomizations()` today.
2. The property pane's existing engine selector reads from
   `extService.getTemplateEngines()`, which is already the
   aggregation point — no change needed there. Adding Vue to a tenant
   is purely a deploy-the-library operation.

### Helper contract evolution — engine-keyed extensions

`registerHandlebarsCustomizations(hbs)` is **engine-specific by name**
and was fine when there was only one engine. With Vue in the mix, a
library that wants to ship "the same helpers in both engines" has to
know about every engine, which is leaky. Two contract additions to
`@mrpullen/spfx-extensibility`:

1. **Deprecate** `registerHandlebarsCustomizations(hbs)` (keep working
   for back-compat; mark as `@deprecated` in the type).
2. **Add** a generic, engine-keyed extension slot:

   ```ts
   interface IEngineExtensionDefinition {
     engineId: string;                    // 'handlebars' | 'vue' | future
     install(engineRoot: unknown): void;  // engine-specific install hook
   }

   interface IExtensibilityLibrary {
     getEngineExtensions?(): IEngineExtensionDefinition[];
   }
   ```

   For Handlebars, `engineRoot` is the `Handlebars` namespace. For Vue,
   it's the per-render `App` instance. Each engine exposes its own
   install-hook signature documented in its README; the library
   matches by `engineId`.

3. **Calling convention** — the host calls every matching
   `getEngineExtensions()` entry against every render. Vue's per-render
   `createApp` makes this natural; Handlebars caches per-engine
   instance and only installs once.

This change is **driven by Library 4 but benefits everyone**: a future
"feed-helpers" package could ship one library that contributes
`{{relativeTime}}` to Handlebars *and* `$relativeTime` to Vue from the
same install function. Document migration notes in
`@mrpullen/spfx-extensibility` v2.

### Required platform service

`VueTemplateEngine` needs nothing beyond the standard `IServiceContext`
the host already supplies. No external HTTP, no PnPjs, no SP-specific
dependencies. The engine is purely a renderer.

### Bundled dependencies

- `vue` (~90 KB gzipped including `vue/dist/vue.esm-bundler.js` for
  runtime template compilation, MIT). Bundled per the section-2 hard
  rule.
- No other external runtime deps. Composables and global properties
  are tiny in-package code.

### Governance integration

- The engine itself performs no network egress; governance scope is
  the templates authors write. Templates can still call composables
  that call adapters — those are governed by the adapters'
  capability/allow-list rules exactly as in Handlebars.
- **Template-source caveat**: Vue templates compiled at runtime can
  contain arbitrary expressions and function calls in `{{ }}`
  bindings. Same risk profile as a Handlebars helper that accepts
  arbitrary input. Enforcement parity:
  - Templates ship from the library or from SharePoint document
    libraries the same way Handlebars templates do.
  - The engine runs in the page's existing security context (no
    extra sandbox; consistent with Handlebars).
  - Author guidance in the README: "Treat Vue templates as code,
    not data. Don't accept untrusted template sources."

### Host changes required

- **Already added by Library 3**: `getTemplates()` slot.
- **New for Library 4**: `getEngineExtensions()` slot + the deprecation
  of `registerHandlebarsCustomizations()` described above.
- **Engine selection in property pane**: the existing template picker
  needs an engine column. When the library is loaded, the picker shows
  Vue templates next to Handlebars templates with an engine badge.
  Engine selection drives which `ITemplateEngine` the host hands the
  compile call to.

### Risk / gotchas

- **Bundle size.** ~90 KB gzipped for the Vue runtime + compiler is
  the largest opt-in cost of any library so far. Document prominently
  that this library is for tenants who want Vue, not a default install.
- **Template compilation perf.** Runtime compilation runs once per
  template per session (results cached). Re-renders only re-patch.
  Long, complex templates compile in ~5–20ms; not a concern for
  typical SPFx pages.
- **CSP `unsafe-eval`.** Some hardened tenants disable `unsafe-eval`,
  which Vue's runtime compiler needs. Detection: if
  `new Function('return 1')` throws, fall back to a clear in-DOM
  error message and audit log: "This tenant blocks runtime
  compilation. Pre-compiled `.vue` templates are required."
  Pre-compiled is a v1.1 follow-up.
- **`<style>` blocks in `.vue` files.** Single-file components with
  `<style scoped>` need scoping, which requires `@vue/compiler-sfc`
  (Node-only). **Decision:** v1 supports `<template>` and
  `<script setup>` only; styles must be authored separately or
  inlined as Vue's `:style` bindings. Document the limitation.
- **Cleanup on web-part dispose.** Each rendered template's Vue app
  must `unmount()` cleanly when the host swaps templates or the web
  part is removed. Engine's `dispose()` enforces this.
- **Reactivity vs pub/sub semantics.** Vue's deep reactivity can
  trigger re-renders the host doesn't expect. Composables wrap
  pub/sub so the engine only triggers on topic publish, not on every
  property mutation. Author guidance: "Don't mutate the data model
  directly; publish via `usePublish` so the host stays in sync."

### Testing matrix

1. **Engine registration** — load library, confirm `Vue 3` appears in
   property-pane engine selector.
2. **Hello-world template** — `vue-counter.vue` renders, increments,
   re-renders without flicker.
3. **Cross-library composition** — `vue-news-feed.vue` consumes the
   `rss` adapter from `@mrpullen/hbwp-rss`. Same data shape,
   different engine, identical UX to `news.hbs`.
4. **Custom-element interop** — `<hbwp-pager>` and `<hbwp-feed-card>`
   work inside a Vue template (Vue treats them as native custom
   elements when the registry has them).
5. **Pub/sub** — `vue-tabs.vue` publishes `selectedTab`, a sibling
   web part receives the value. Round-trips bus integration.
6. **CSP-strict tenant** — runtime compiler blocked; engine emits a
   clear in-DOM error and audit log. No silent failure.
7. **Engine extensions** — Library 4 installs `$relativeTime` on Vue's
   app; a Handlebars-only library installs `{{relativeTime}}` via
   `getEngineExtensions({ engineId: 'handlebars' })` against the same
   helper module. Both engines render the same date string.
8. **Template versioning** — Vue v1.0 ships five templates. Vue v1.1
   adds `vue-kanban.vue`. Existing pages continue to work.
9. **Engine swap** — author switches a page from Handlebars to Vue
   on the same data source; refresh, no errors, content renders in
   the new engine.

### Removal from in-box

Nothing to remove — Vue isn't in-box today. The library debuts in
the extracted form.

---

### Shared dependencies

Both libraries depend on:

- `@mrpullen/spfx-extensibility` — `BaseWebComponent`, `IExtensibilityLibrary`,
  `IServiceContext`, `IDataAdapterContext`, `DataAdapterBase`.
- `@pnp/sp` — Social uses it; Fluent / RSS / Vue do not.
- `dompurify`, `fast-xml-parser`, `plyr` — RSS-only.
- `vue` — Vue-only.

The extensibility package gains:

- **`getTemplates()`** + **`ITemplateAssetDefinition`** (driven by RSS) —
  optional, default empty.
- **`getEngineExtensions()`** + **`IEngineExtensionDefinition`** (driven
  by Vue) — optional, default empty;
  `registerHandlebarsCustomizations()` is deprecated but kept working
  for back-compat.

No other contract changes for any of the four extractions.

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
3. **RSS Library** — third. Adds a network-egress adapter (validates
   governance integration end-to-end), introduces the new
   `getTemplates()` extension slot, and ships four reference templates
   that stress-test template-asset discovery and the property-pane
   preset workflow.
4. **Vue Library** — last and most ambitious. Ships an alternative
   template engine, introduces the engine-keyed extensions slot
   (`getEngineExtensions()`), and recreates five Fab 40 patterns plus
   one cross-library composition demo against RSS. Doing this last
   lets us land the engine-extensions contract change after we've
   exercised the existing slots and have the most evidence about
   what's actually needed.

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
