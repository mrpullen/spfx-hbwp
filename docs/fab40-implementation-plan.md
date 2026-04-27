# Fab 40 Implementation Plan

This document maps each [spfx-40-fantastics](https://github.com/OlivierCC/spfx-40-fantastics)
web part to a concrete implementation strategy in our pub/sub Handlebars
toolkit. Most are templates + a small helper or a single web component;
nothing here requires forking the host web part.

## Architecture recap

We have four extension points. Decide which one fits and you've decided 90%
of the implementation:

| Extension point | When to use |
|---|---|
| **Handlebars template + helper** | Pure layout/transform. No state, no async. |
| **Custom web component** (`<hbwp-*>`) | Stateful or interactive UI (charts, players, tabs, drawers). |
| **Data adapter** | New data *source* with auth/caching semantics distinct from existing adapters. |
| **Property-pane control** | Authoring UX for inline item lists (tiles, slides). Use `@pnp/spfx-property-controls` first. |

We already have:
- `HttpDataAdapter` — AAD / Bearer / API key / Anonymous / Flow, GET/POST/PUT/DELETE,
  token resolution, caching. **Covers nearly every "third-party API" need.**
- `SharePointListAdapter` — list-driven anything.
- `SocialDataAdapter` — likes/ratings.
- `UserProfileAdapter` — current user / target user fields.
- `PageDataAdapter` — page context.

So most of the work below is **templates + small helpers + a few web components**.
We are not adding new adapter classes unless an authentication or caching
pattern is genuinely different.

---

## Cross-cutting infrastructure to add first

These unlock multiple Fab 40 web parts in one go. Build these before the
per-template work:

### 1. Property-controls integration

Add `@pnp/spfx-property-controls` to the dependencies. Wire the relevant
controls into the host web part's property pane:

- `PropertyFieldColorPicker` — color picker
- `PropertyFieldIconPicker` — icon picker
- `PropertyFieldFilePicker` — image picker (sites assets, OneDrive, web search, link)
- `PropertyFieldCollectionData` — **the big one**: lets authors manage an
  inline JSON collection (title/url/image/order rows). This single control
  is what lets us replicate every "Tiles Menu" / "News Carousel" web part
  without forcing a backing list.

Once available, the same Handlebars host renders any of these from inline
collection data via a new template-data merge key (e.g. `inlineItems`).

### 2. Bundled-only third-party libraries (no runtime script loading)

**Hard rule: we do not load arbitrary scripts at runtime.** No `loadScript()`
helper, no CDN injection, no `<script src>` from a template. Admins must be
able to audit exactly what JavaScript ships with each solution package; a
runtime loader undermines that and is a supply-chain risk vector.

What we do instead:

- Each web component that needs a third-party library (Chart.js, Swiper,
  Prism, plyr, wavesurfer, etc.) **bundles it as an npm dependency** of
  the component's library (`@mrpullen/hbwp-chart`, `@mrpullen/hbwp-media`,
  etc.).
- Components are published as **separate, opt-in npm packages** so admins
  can install only the components their organization approves. This is
  the architectural reason for the library extraction plan in
  `external-libraries-plan.md`.
- Per-tenant governance: an admin who is uncomfortable with, say, the
  HTTP adapter or the Copilot adapter can omit those packages from their
  solution build entirely. The web part still works for everything else.
- Where a library is large (Chart.js, Swiper), the consuming component
  uses **dynamic ES imports** for code-splitting, but the bundle is still
  baked into the SPFx package — no external network fetch.

If a customer truly needs a library we don't ship, the answer is: fork
the relevant `@mrpullen/hbwp-*` library, add the dependency to their
fork, and bundle their own variant. This keeps the supply chain fully
under their control.

### 3. Helper pack

Add to `HelperManager`:

- `{{markdown body}}` — markdown-it (bundled)
- `{{syntax lang="js" code=…}}` — Prism (bundled)
- `{{qrcode value size=120}}` — qrcode-generator (bundled, tiny)
- `{{relativeTime date}}` — already exists in some form; verify
- `{{truncate text length=200}}`
- `{{rss xmlString}}` — parses RSS/Atom XML to a JS array (used by the HTTP
  adapter's response when pointed at an RSS endpoint)

All helper dependencies are `npm install`'d into the helper package and
shipped in the SPFx bundle. No runtime fetches.

### 4. Generic chart web component

`<hbwp-chart type="pie|bar|line|radar|polarArea|doughnut" data-…>` backed
by Chart.js, **bundled** as a dependency of `@mrpullen/hbwp-chart`. One
component covers six Fab 40 web parts (Pie, Bar, Line, Radar, Polar, plus
Stock). Lazy-loaded via dynamic `import()` so it only ships when actually
rendered, but always from the SPFx bundle, never from a CDN.

### 5. CORS proxy guidance (not code)

Document the recommended pattern for hitting non-CORS-friendly third-party
APIs (RSS feeds, public JSON APIs without CORS headers): publish a small
**Azure Function** or **SharePoint-based proxy** the customer owns, point
the HTTP adapter at it. This matters for RSS, Yahoo Finance replacements,
and any provider that doesn't return permissive CORS headers.

The proxy pattern also gives the customer a place to **enforce egress
policy**, **log to Purview / Sentinel**, and **strip credentials** before
they touch the browser.

### 6. Governance and observability

Several adapters in our roadmap (HTTP, Copilot, ContextHistory) can be
misused either accidentally or maliciously. Build governance in from
day one rather than retrofitting it:

**Per-adapter admin disable.** Every adapter's `package-solution.json`
manifest entry includes a tenant-admin gate so an admin can disable
HTTP, Copilot, ContextHistory, or any other sensitive adapter at the
solution level without uninstalling the whole web part.

**Allow-listing.** Adapters that hit external endpoints (HTTP, RSS,
iCal, Copilot) honor an admin-configured **endpoint allow-list** stored
in tenant properties. Out-of-list URLs are blocked with a clear error
shown to the author at design time, not silently failing at runtime.

**Audit hook.** A pluggable `auditSink` interface in the platform
services lets admins route adapter events (request URLs, payload
hashes, response sizes, user IDs, timestamps) to:
- **Microsoft Purview** via Audit API (built-in sink we ship as a sample)
- **Application Insights** (sample sink)
- **Microsoft Sentinel** via Log Analytics workspace (sample sink)
- **Custom HTTPS endpoint** (sample sink)

Out of the box `auditSink` is a no-op, opt-in by tenant config. When
enabled, every external read/write flows through it.

**Egress reports.** A tenant admin diagnostic page (or just a documented
KQL query) so admins can answer "what endpoints are my web parts hitting,
who, when, with what data class?"

**Data-classification metadata.** Adapter authors annotate each operation
with a data sensitivity hint (`public | internal | confidential | restricted`).
The audit sink records the hint; admins can write Purview policies that
reject restricted data flowing to external endpoints.

**No silent capability creep.** Never add a new outbound capability
(new domain, new auth flow, new data category) without bumping the
solution version and surfacing it in the install prompt. Admins should
never be surprised by a minor update that suddenly adds a network call.

These guardrails are part of the *platform*, not per-adapter code. The
goal is that an organization can ship spfx-hbwp with HTTP and Copilot
adapters disabled and the remainder fully governed, and still get most
of the Fab 40 value.

---

## Per-web-part plan

### Menus, carousels, news (6)

| Fab 40 | Strategy |
|---|---|
| News Carousel | Template + Swiper.js (bundled, dynamic-imported). Data: SP list **or** inline collection. |
| News Slider | Template + Swiper.js, fade transition. Same data shape as carousel. |
| News Ticker | Pure template + CSS keyframe scroll. Data: list. |
| Tiles Menu | Template + CSS grid. Data: inline collection (PropertyFieldCollectionData) **or** list. |
| 3D Carousel | Template + a 3D-carousel JS lib (e.g. `react-spring-3d-carousel` adapted, or a vanilla carousel like Cycle2). Inline collection. |
| Coverflow | `<hbwp-coverflow>` web component using flickity or a custom CSS-3D implementation. |

**One template authoring pattern for all six:** the author drops the web
part, picks "carousel/slider/ticker/tiles/3d/coverflow" template, configures
items inline, done.

### Social / feeds (4)

| Fab 40 | Strategy |
|---|---|
| Tweets Feed | **Service replacement.** Twitter/X feed widgets are paywalled. Replace with **Mastodon**, **Bluesky**, or **LinkedIn organization feed** via HTTP adapter. Document Twitter widget embed as a template option (works for users who still pay). |
| Social Share | Template only — render share links to LinkedIn/Facebook/email/X with `window.location` injected. No external service needed. |
| RSS Reader | HTTP adapter pointed at RSS URL (via customer-owned proxy if CORS-blocked) + `{{rss}}` helper that parses XML → JSON. Template renders feed items. |
| Social Photo Stream | **Service replacement / per-provider.** Original used Instagram/Pinterest/Flickr/Picasa. Modern reality: Picasa is dead, Instagram requires OAuth. Practical alternatives: **Unsplash** (public API, no key), **Pexels**, **Flickr** (still has API), **SharePoint asset library**. Each is just an HTTP adapter config + a template. |

### Charts and graphs (7)

| Fab 40 | Strategy |
|---|---|
| Pie / Bar / Line / Radar / Polar Chart | All five → one `<hbwp-chart>` web component. Author picks `type` attribute, supplies data via list adapter, HTTP adapter, or inline. |
| Vertical Timeline | Template + CSS over a calendar list query. No web component needed. |
| Stock Info | **Service replacement.** Yahoo killed the chart endpoint. Use **AlphaVantage** (free key), **Finnhub**, or **Polygon.io** via HTTP adapter. Render with `<hbwp-chart type="line">`. **Two Fab 40 web parts solved by the same chart component.** |

### Image galleries (6)

| Fab 40 | Strategy |
|---|---|
| Tiles Gallery | Template + CSS grid + lightbox JS (e.g. PhotoSwipe). Data: SP image library. |
| Grid Gallery | Template + auto-scroll JS. Data: SP image library. |
| Photopile | Template + CSS transforms (Polaroid stack). Data: SP image library. |
| Slider Gallery | Template + Swiper.js (already loaded for news). Data: SP image library. |
| Simple Carousel | Template + Swiper. Same library, different config. |
| Image Puzzle | `<hbwp-image-puzzle>` web component (CSS clip-path or canvas). One image input. |
| Image Color | Helper or component that applies CSS filter classes. Trivial. |

**Reuse:** Swiper covers News Carousel, News Slider, Slider Gallery, Simple
Carousel. PhotoSwipe (or similar) covers Tiles Gallery, Grid Gallery,
Photopile lightbox-on-click.

### Video and audio (2)

| Fab 40 | Strategy |
|---|---|
| Media Player | `<hbwp-media>` web component using **plyr.io** (handles HTML5, YouTube, Vimeo, captions). One file or list of files. |
| Audio Equalizer | `<hbwp-equalizer>` using **wavesurfer.js**. Source: SP file or external URL. |

### Text tools (8)

| Fab 40 | Strategy |
|---|---|
| Markdown | `{{markdown body}}` helper + a property-pane multiline text. Done. |
| Syntax Highlighter | `{{syntax}}` helper + Prism. |
| Tabs | `<hbwp-tabs>` web component with declarative `<hbwp-tab title="...">` children. |
| Accordion | `<hbwp-accordion>` similar pattern. |
| Animated Text | Template + animate.css class on element (no JS needed). |
| Text Rotator | `<hbwp-text-rotator phrases="A|B|C">` web component (CSS transitions). |
| ArcText | `<hbwp-arc-text>` using SVG textPath. |
| TypeWriting | `<hbwp-typewriter>` using Typed.js (bundled, dynamic-imported). |
| ~~FckText~~ | **Skipped** — modern SP page authoring already has this OOTB. |

### Tools (5)

| Fab 40 | Strategy |
|---|---|
| Simple Poll | `<hbwp-poll>` component + survey-list adapter mode (read question, post response, aggregate results). Render with `<hbwp-chart type="pie">`. **Real work** — about a day. |
| Bing Translator | **Service replacement.** Bing widget retired. Use **Azure Translator** API via HTTP adapter (customer's key). `<hbwp-translate>` component swaps page text. |
| Message Bar | Pure Fluent template. |
| Stock Info | See Charts section. |
| QR Code | `{{qrcode value size=120}}` helper. Trivial. |

### Replacement for ~~FckText~~

We dropped FckText (modern pages cover it). Suggested replacement to keep
the count at 40:

- **Countdown / Event Timer** — `<hbwp-countdown to="2026-12-31T00:00:00Z">`
  with live-updating days/hours/minutes/seconds. Common ask, easy to ship.
- **Org Chart** — `<hbwp-orgchart>` using a UPS adapter for the reporting
  hierarchy. High-value for intranets.
- **People Tile** — already partially implied; render any user with avatar,
  name, title, presence. Pairs well with `UserProfileAdapter`.
- **Knowledge Base Search** — search-driven web part using SP search adapter
  + result template.

Pick one of these to fill the FckText slot. **Org Chart** has the most
"wow" and the lowest external-dependency risk.

---

## Service replacements (reference)

When the original Fab 40 web part depended on a service that is now dead,
paywalled, or behind OAuth:

| Original | Replacement(s) |
|---|---|
| Twitter widget | Mastodon REST, Bluesky API, LinkedIn org feed, or X embed (paid) |
| Yahoo Finance chart | AlphaVantage (free key), Finnhub, Polygon.io |
| Bing Translator widget | Azure Translator (key) |
| Instagram public photo stream | Instagram Basic Display (OAuth), or Unsplash / Pexels / Flickr as a "photo stream" |
| Picasa | Google Photos requires OAuth. Use SP asset library or Flickr instead. |
| AddThis (Social Share) | Static share URLs — no service required. |

All of these are HTTP adapter configurations against the new endpoint, plus
a small template to render the response. No new adapter classes.

---

## Suggested build order

Do the cross-cutting pieces first; everything else falls out of the same
pattern.

1. **Property controls integration** (collection data, color, icon, image,
   file pickers). Unlocks ~10 web parts.
2. **External script loader** + **`<hbwp-chart>`**. Unlocks Pie/Bar/Line/Radar/Polar/Stock.
3. **Helper pack** (markdown, syntax, qrcode, rss, truncate). Unlocks Markdown,
   Syntax Highlighter, QR Code, RSS Reader.
4. **Swiper-based components** (`<hbwp-carousel>`, `<hbwp-slider>`).
   Unlocks News Carousel, News Slider, Slider Gallery, Simple Carousel.
5. **Media components** (`<hbwp-media>`, `<hbwp-equalizer>`).
6. **Text components** (`<hbwp-tabs>`, `<hbwp-accordion>`, `<hbwp-typewriter>`,
   `<hbwp-arc-text>`, `<hbwp-text-rotator>`).
7. **Image components** (`<hbwp-image-puzzle>`, lightbox helper for galleries).
8. **3D / coverflow** (lower priority, niche).
9. **Service-replacement adapters as needed** (RSS feed proxy, AlphaVantage,
   Azure Translator, Mastodon/Bluesky). Each is just an HTTP adapter config
   shipped as a sample.
10. **Org Chart** (replacement for FckText slot).
11. **Simple Poll** + survey-list mode.

## What we are explicitly *not* building

- A separate `HttpJsonDataAdapter` — `HttpDataAdapter` already covers it.
- A custom rich-text editor (FckText) — modern SP pages already have one.
- A bundled mega-package of every web component — keep them in
  `@mrpullen/hbwp-*` libraries per `external-libraries-plan.md`.
- Per-provider scrape adapters — use HTTP adapter against an official API
  or a customer-owned proxy.
