# HTTP Endpoint Governance Plan

## Purpose

The `HttpDataAdapter` is the most powerful — and the most dangerous — adapter
in the toolkit. It can reach any URL, with any method, carrying any payload,
authenticated as the user or as the application. Without controls, a single
malicious or careless template author can:

- Exfiltrate list/user data to an attacker-controlled endpoint.
- Send authenticated requests to internal APIs the page author should not
  reach.
- Cause data leaks invisible to admins because the request fires from the
  user's browser, not the tenant's network egress.
- Trigger destructive write operations (POST/PUT/DELETE) under the user's
  identity.

This plan defines a **layered control model** so a tenant can land anywhere
on the spectrum from "HTTP adapter fully disabled" to "HTTP adapter fully
open" with explicit, auditable choices in between.

This is a **plan**, not an implementation. No code yet.

---

## Threat model (what we're defending against)

| Threat | Example |
|---|---|
| **Exfiltration** | Author writes a template that POSTs list rows to `https://attacker.example/collect`. |
| **SSRF / lateral movement** | Author hits internal IPs (`http://10.0.0.1/admin`) the user's browser can reach but they shouldn't probe. |
| **Credential leak via header** | Author hard-codes a personal API token in a property-pane field, page is shared, token leaks. |
| **Cross-domain cookie ride** | Adapter call carries the user's session cookies to an unintended target. |
| **Quiet capability creep** | A solution update adds new endpoints; admins don't notice. |
| **Audit blind spot** | Calls fire from the browser; tenant network egress logging never sees them. |
| **PII overshare** | A template sends user profile fields to a third-party service that shouldn't receive them. |

The control model below maps every threat to one or more layers.

---

## Layer model

Eight layers, each independently configurable. A tenant turns on as many
as they need; defaults are **conservative** (allow-list required to do
anything cross-origin).

### Layer 1 — Compile-time inclusion

The HTTP adapter is a separately-versioned npm package. Customers who do
not want any HTTP egress capability simply **do not install** the package
in their solution build. The web part still loads, the property pane
shows no HTTP option, and there is zero runtime risk surface.

**Decision lever:** package presence.

### Layer 2 — Tenant admin disable switch

Even when installed, the adapter checks a **tenant property** at startup.
If the property is `false`, the adapter registers itself as disabled and
refuses to be selected in the property pane. Useful when admins want to
deploy the same solution package to many sites but disable egress for a
subset.

**Decision lever:** tenant property `hbwp.http.enabled`.

### Layer 3 — Site / web-part instance scoping

A site collection admin can override the tenant default for their site
only. Within a site, a page editor sees only the adapters their site
permits. This is read at the SPFx web-part instance level, not at the
adapter level, so no client-side spoofing of the flag is possible (the
property pane simply won't show the option).

**Decision lever:** site property bag entry, evaluated server-side at
property-pane load.

### Layer 4 — Endpoint allow-list (the most important layer)

When the adapter is enabled, **every URL must match an allow-list pattern**
or the request is refused. The allow-list is stored as a tenant or site
property and managed by admins. Patterns are URL globs:

```
https://graph.microsoft.com/v1.0/*
https://*.contoso.com/api/*
https://api.openai.com/v1/chat/completions
```

Behavior:

- Match is performed **before** any request leaves the browser.
- Rejection produces a **design-time error** in the property pane and a
  **runtime error** at fetch time. Authors cannot save a property-pane
  configuration that points at a non-allow-listed URL.
- An empty allow-list means **deny all** (safe default), not allow all.
- Wildcards are scheme- and host-aware; `*` does not cross `/` in the
  path component to prevent overly broad matches like `https://*` matching
  `https://attacker.example`.
- Token-resolved URLs are matched **after** token resolution, so an
  author can't sneak in `https://{{user.email}}.attacker.example`.

**Decision lever:** tenant + site `hbwp.http.allowlist` arrays, merged.

### Layer 5 — Method and capability scoping

Per allow-list entry, admins specify which HTTP methods are permitted:

```
{ pattern: "https://graph.microsoft.com/v1.0/*", methods: ["GET"] }
{ pattern: "https://api.contoso.com/*", methods: ["GET", "POST"] }
```

This lets admins say "anything inside our API surface is read-only from
the browser; only specific endpoints can be written to." Defaults to
`["GET"]` if not specified.

Additional capability flags per entry:

- `authTypes` — which auth types are permitted (e.g. only AAD; never
  `apiKey` because that means a key in the property pane).
- `cookies` — whether the adapter should send credentials. Default `false`.
- `maxBodyBytes` — caps payload size to prevent bulk exfiltration.
- `dataClass` — sensitivity of data this endpoint is permitted to receive
  (`public | internal | confidential`). Used by Layer 7.

**Decision lever:** allow-list entry properties.

### Layer 6 — Property-pane authoring guardrails

When an author configures the HTTP adapter:

- The URL field shows a live validation indicator: green if the URL
  matches an allow-list entry, red if it doesn't.
- Auth-type dropdown is **filtered** to types the matched entry permits.
- Method dropdown is **filtered** to methods the matched entry permits.
- API-key auth is opt-in at tenant level only (default off) because
  authors are tempted to paste keys into a property field that gets
  serialized to the page.
- A "test" button exercises the call once and shows the response in the
  property pane so authors can validate without saving a broken
  configuration.

These are usability features that turn the allow-list from a runtime
gate into a design-time experience.

**Decision lever:** allow-list entry + tenant policy for sensitive auth
types.

### Layer 7 — Data-classification policy

Every adapter operation declares a sensitivity hint for the data it
sends out (`public | internal | confidential | restricted`). Templates
can override the hint on a per-call basis — for example, a write that
includes user-profile fields might bump from `internal` to `confidential`.

The HTTP adapter checks the call's sensitivity against the matched
allow-list entry's `dataClass`. Mismatches are blocked.

```
allow-list entry: { pattern: "https://api.partner.com/*", dataClass: "internal" }
template call:    sensitivity = "confidential"
result:           BLOCKED, audit event recorded
```

This is the most expressive layer — it lets admins say "this endpoint can
have internal data but never confidential data" without listing every
possible data shape.

**Decision lever:** classification metadata on the operation + allow-list
entry's `dataClass`.

### Layer 8 — Audit and egress reporting

Every accepted call (and every blocked call) emits an audit event through
a pluggable `auditSink` interface. Sample sinks ship as opt-in samples:

- **Microsoft Purview** via the Audit API
- **Application Insights**
- **Microsoft Sentinel** via Log Analytics workspace
- **Custom HTTPS endpoint** (for tenants with their own SIEM)

Event shape:

```
{
  ts, userId, siteId, webPartInstanceId, pageUrl,
  adapter: "http",
  operation: "GET" | "POST" | ...,
  url, host, allowlistEntryMatched,
  authType, dataClass,
  status: "allowed" | "blocked" | "error",
  blockReason?: "no-allowlist-match" | "method-denied" | "data-class-mismatch" | ...,
  bytesOut, bytesIn,
  durationMs
}
```

Out of the box `auditSink` is a no-op; admins enable it via tenant
config. A documented KQL query bundle answers common admin questions:

- What endpoints are my users hitting, by site?
- Which authors are configuring blocked URLs?
- What's our top 10 by volume? By blocked count?
- Are any users sending confidential data to internal-only endpoints?

**Decision lever:** tenant property `hbwp.http.auditSink` with sink-
specific config blob.

---

## Configuration storage

Three places store config, in priority order (later overrides earlier):

| Where | Stored in | Managed by |
|---|---|---|
| Solution defaults | `package-solution.json` constants | developer / packager |
| Tenant policy | tenant property bag (`hbwp.http.*`) | tenant admin |
| Site policy | site property bag (`hbwp.http.*`) | site collection admin |

A site collection admin **cannot loosen** tenant policy — only tighten.
The merge function rejects site overrides that grant capabilities the
tenant denies. This rule is enforced in the policy resolver, not just by
convention.

A user / page editor **cannot override** policy at all. They configure
URLs within the policy envelope; values outside the envelope are rejected.

---

## Property-pane experience for admins

Ship a small **policy management** web part (or a SharePoint admin tool)
that:

- Lists current allow-list entries with patterns, methods, auth types,
  and data class.
- Shows per-entry usage stats from the audit sink (last 30 days).
- Lets admins add / remove / edit entries with validation.
- Provides a "test pattern" surface so admins can paste a candidate URL
  and see whether it would match.
- Exports / imports policy as JSON for cross-tenant deployment.

This is the difference between "we have governance" and "admins can
actually use the governance." Policy without a UX rots into a `.json`
file nobody touches.

---

## Default policy (out of the box)

A fresh install lands here:

| Setting | Default |
|---|---|
| `hbwp.http.enabled` | `true` |
| `hbwp.http.allowlist` | empty (deny all) |
| `hbwp.http.allowedAuthTypes` | `["aad", "anonymous"]` |
| `hbwp.http.allowApiKeyAuth` | `false` |
| `hbwp.http.allowSendCredentials` | `false` |
| `hbwp.http.maxBodyBytes` | `1_048_576` (1 MiB) |
| `hbwp.http.requireDataClass` | `true` |
| `hbwp.http.auditSink` | `noop` |
| `hbwp.http.allowSiteOverride` | `false` |

Net effect: **fresh install = HTTP adapter is installed but does nothing
until an admin adds at least one allow-list entry.** This is the safe
landing position.

---

## Data flow with all layers active

```
template author saves config
   │
   ▼
property-pane validator (Layer 6)
   │  matches allow-list, valid auth type and method?
   ▼
config persisted to web-part instance
   │
   ▼
runtime: adapter.fetch() called
   │
   ▼
policy resolver (Layers 2,3,4,5,7)
   │  enabled? URL matches? method permitted? auth permitted?
   │  data class permitted?
   ▼
token resolution (existing)
   │
   ▼
post-resolution allow-list re-check (Layer 4)
   │
   ▼
HTTP request leaves browser
   │
   ▼
audit sink emits "allowed" event (Layer 8)
   │
   ▼
response handed back to caller
```

Every block in this pipeline emits an audit event with the relevant
status (`allowed`, `blocked`, `error`).

---

## Implementation phases

### Phase 1 — Foundation (no breaking changes)

- Hoist `HttpDataAdapter` into its own package (`@mrpullen/hbwp-http`).
- Add `dataClass` parameter to read/write operations (default `internal`,
  optional override per call).
- Stub `auditSink` interface with a no-op default and a console-log
  sample sink.

**Result:** code structure ready for governance without changing
runtime behavior.

### Phase 2 — Allow-list and policy resolver

- Implement policy storage (tenant + site property bag) with merge
  semantics and the "site can't loosen" rule.
- Implement runtime URL matcher with the path-aware wildcard rules.
- Wire the matcher into `fetch()` and `execute()`.
- Add property-pane validation indicator.

**Result:** policy enforced; existing customers must add allow-list
entries to keep working. Provide a migration command that adds entries
matching their existing configurations as a starting point.

### Phase 3 — Capability scoping

- Add `methods`, `authTypes`, `cookies`, `maxBodyBytes`, `dataClass`
  per allow-list entry.
- Property-pane filtering of method / auth type dropdowns.
- Add tenant flags for `allowApiKeyAuth`, `allowSendCredentials`.

**Result:** admins can express fine-grained policy.

### Phase 4 — Audit sinks

- Implement Purview, App Insights, Sentinel, and HTTPS sinks as separate
  opt-in packages.
- Document KQL query bundle.
- Add the policy-management web part / admin tool.

**Result:** observability and admin experience.

### Phase 5 — Data-classification enforcement

- Require `dataClass` on every operation.
- Enforce `dataClass` ≤ entry `dataClass`.
- Add per-call sensitivity override syntax in templates.

**Result:** strongest layer; gates outbound flows by data sensitivity.

### Phase 6 — Continuous improvement

- Anomaly detection on audit stream (volumes, new endpoints, new auth
  patterns) flagged to admin dashboard.
- Periodic re-validation of allow-list entries (DNS still resolves,
  TLS cert healthy, response shape unchanged).
- Policy versioning with changelog so admins can review what changed
  between solution versions.

---

## Same model, applied to other adapters

The HTTP adapter is the proving ground, but the same eight-layer model
applies (with smaller surface) to:

- **Copilot adapter** — endpoint allow-list per provider, model allow-list,
  prompt-redaction policy, max-tokens cap, audit of every prompt and
  response classification.
- **RSS / iCal adapters** — endpoint allow-list (same matcher), no auth,
  data-class always `public`, audit.
- **OData / GraphQL adapters** — endpoint allow-list, query allow-list
  (or query-shape policy that rejects unfamiliar operations), method
  scoping, audit.
- **Search adapter** — Graph-only; restrict to specific entity types and
  result counts; audit.

Reusing the policy resolver across adapters is the entire point: admins
configure governance once and every egress-capable adapter honors it.

---

## What we explicitly do **not** do

- **No silent bypass.** There is no "developer mode" flag that disables
  the policy. The only way to grant a capability is to add it to the
  allow-list.
- **No client-side-only enforcement claims.** The browser cannot be
  trusted to keep secrets, but it *can* be trusted to refuse to make a
  call. The policy is enforced at request-build time so a tampered
  client cannot bypass; for true defense-in-depth, customers should pair
  this with **a CSP `connect-src`** at the SP page level. We document
  this as the recommended companion control.
- **No automatic discovery of "what authors are using."** Audit captures
  what the adapter is configured to do; we don't ship anything that
  scans templates for hidden URLs because that creates a parallel
  surface area to attack.
- **No global allow-all.** If an admin really wants permissive behavior,
  they can add `https://*` to the allow-list — but they have to type it,
  and it shows up in audit metadata.

---

## Open questions

These need decisions before Phase 2:

1. **Where does policy live?** Tenant property bag is convenient but has
   a 64 KiB limit. For large allow-lists, store in a dedicated SP list
   in the App Catalog. Recommend: list-based with property-bag pointer.
2. **Cache invalidation for policy changes.** Adapters cache config; how
   fast must a policy change propagate? Recommend: 5-minute TTL with a
   "force refresh" admin action.
3. **Versioning.** Allow-list schema will evolve. Stamp every policy
   document with a schema version and refuse to load policies the
   adapter doesn't understand.
4. **Audit cost.** Purview audit calls have throughput limits. Recommend:
   batch + sample at high volume; alarm if sample-rate falls below
   admin-set threshold.
5. **Per-environment allow-lists.** Dev / test / prod tenants may need
   different policies. Recommend: parameterize via tenant property,
   not via build-time config, so the same package deploys everywhere.
