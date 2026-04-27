# Custom Element Flicker on Re-Render (Handlebars-specific)

## Symptom

Web components like `<hbwp-like>` and `<hbwp-rating>` flash through their
skeleton state every time the surrounding template re-renders, even when the
data the component depends on is unchanged.

Typical sequence in DevTools:

```
[hbwp-like] resolve start { … }
[hbwp-like] isLiked result { liked: true, count: 3 }
... (some other adapter publishes a data-changed envelope) ...
[hbwp-like] resolve start { … }   ← skeleton flashes again
[hbwp-like] isLiked result { liked: true, count: 3 }
```

## Root cause

Handlebars is a **string-based** template engine. Every render produces a
brand-new HTML string that we hand to `containerRef.current.innerHTML = ...`.
That replaces the DOM subtree wholesale, which means:

- Every `<hbwp-*>` custom element is **destroyed** (`disconnectedCallback`)
- Every replacement element is freshly **constructed + connected** (`connectedCallback`)
- Components that self-resolve via `data-resolve="true"` therefore re-fire
  their `executeRead` calls and pass through their skeleton state on every
  render — even when nothing about their inputs has changed.

This is **not specific to HBWP's pipeline** — it's a fundamental limitation
of Handlebars (and other string-templating engines like Mustache, EJS,
underscore templates). They produce strings; the DOM has no concept of
"this `<hbwp-like>` is the same `<hbwp-like>` that was here before".

The host has a few mitigations in place:

1. **Render debounce** (250 ms) — collapses bursts of `data-changed` envelopes
   into a single render.
2. **Render-data dedupe** (`_lastRenderedHash`) — skips renders when the
   merged template data is structurally identical.
3. **Adapter-result dedupe** in `subscribeToAdapterResults` — skips publishing
   to the render path when an adapter republishes the same result (e.g. a
   cache hit).
4. **Double-buffered render** in `HandlebarsTemplateEngine.render` — the
   compiled HTML is written into a detached `<div>` buffer first, then the
   children are swapped into the live host in a single synchronous tick.
   The browser batches both mutations into one paint frame, so the user
   never sees a blank container between renders.

These reduce the *visual* flash dramatically and keep the number of renders
low, but they cannot prevent the destroy/recreate cycle when a render *does*
legitimately fire — the new HTML string is still parsed into fresh DOM nodes,
so each `<hbwp-*>` element's `connectedCallback` re-fires on the new instance.
That's why a `data-resolve="true"` element will still flash through its
skeleton when the merged template data legitimately changes.

## Workarounds

### Option 1 — Encapsulate in a custom web component

Move the rendering logic out of the Handlebars template and into a single
custom element that owns its DOM and its data lifecycle. The web part's
template becomes a stable shell:

```handlebars
<my-feature-card data-wp-id="{{wpId}}" data-item-id="{{incoming.ID}}"></my-feature-card>
```

Inside `MyFeatureCardElement`:

- `connectedCallback` runs once per page-level mount (not per template render)
- `attributeChangedCallback` lets you react to `data-item-id` changes without
  destroying internal state
- All state (loading, resolved, error) lives in element instance fields and
  doesn't reset between Handlebars renders
- Children like `<hbwp-like>` / `<hbwp-rating>` can either be created
  imperatively from the parent element (so they're never owned by Handlebars)
  or wrapped in `<template>` slots that the parent stamps once.

This is the recommended pattern when the same logical UI participates in
multiple data updates per minute (live dashboards, social feeds, anything
driven by topicData subscriptions).

### Option 2 — Use a diffing template engine

The HBWP template engine slot is pluggable via `getTemplateEngines()`. A
library could ship a Vue, Lit, Preact, or React engine that diffs the DOM
instead of replacing it. Existing custom elements survive across renders
because the engine reuses the underlying DOM nodes — `connectedCallback`
fires once, `attributeChangedCallback` fires for changed attributes only.

Practical engines to consider:

- **Vue 3 single-file templates** — strong diffing, mature web-component
  interop, runtime-compiled templates that match Handlebars' authoring
  experience reasonably closely.
- **Lit** — minimal runtime, optimized for custom elements; templates are
  tagged template literals rather than HTML files, which is a bigger
  authoring shift.
- **Preact + htm** — JSX-shaped HTML strings without a build step. Fast
  diffing, small footprint.

Each of these would be implemented as a new `ITemplateEngineDefinition`
contributed by an external library, exactly the way the built-in
`HandlebarsTemplateEngine` is registered today.

## Decision matrix

| Scenario | Recommended approach |
| --- | --- |
| Mostly static template, occasional updates | Stay with Handlebars. The 500 ms debounce + dedupes are sufficient. |
| Same UI region updates many times per second | **Option 1** — encapsulate in a custom element. |
| Whole page is reactive / form-driven / live data | **Option 2** — adopt a diffing engine. |
| Mix — most of the page is static, one card is hot | **Option 1** for the hot card, Handlebars for the rest. |

## What HBWP will *not* fix at the framework level

We deliberately don't try to make Handlebars do diffing — that would mean
parsing the rendered string back into a DOM, comparing it to the existing
DOM, and patching only the differences. Libraries that do this (e.g.
morphdom) exist, but:

- They preserve element identity but **not** state from before the morph,
  so `connectedCallback` doesn't re-run, but neither does
  `attributeChangedCallback` for attributes the morph leaves identical.
- They're surprising to debug — a custom element that "should" have
  re-initialized after a config change suddenly doesn't.
- They add ~5–10 KB to every page that uses Handlebars.

The cleaner answer is the one above: if you need stable element identity,
either own the lifecycle in a custom element or use a template engine that
was designed to diff.

## See also

- [external-libraries-plan.md](./external-libraries-plan.md) — covers
  packaging custom elements as a third-party library.
- `HandlebarsListView.tsx` — the host implementation of debounce + dedupe
  (search for `_lastRenderedHash` and `scheduleRender`).
