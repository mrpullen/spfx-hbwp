# Data Adapter Roadmap

This document catalogs the data adapters proposed for spfx-hbwp beyond the
ones already shipped (`SharePointListAdapter`, `HttpDataAdapter`,
`SocialDataAdapter`, `UserProfileAdapter`, `PageDataAdapter`, `FormSubmitAdapter`).

Adapters are organized into tiers by ROI. Tier 1 entries include a brief
end-user value statement; lower tiers are listed for completeness.

## Design rules

Before adding any adapter, check that it passes these tests:

1. **Distinct auth or shape** — if `HttpDataAdapter` already covers it
   with config, do *not* add a new adapter (e.g. JSON over REST is already
   covered).
2. **Reusable across templates** — adapter output should be a normalized
   shape multiple templates can consume without per-template parsing.
3. **Pub/sub native** — read operations participate in the topic system;
   write operations publish refresh-requested envelopes when appropriate.
4. **Property-pane configurable** — author should be able to drop the
   adapter and configure it without writing code.
5. **Bundled dependencies only** — any third-party library the adapter
   needs is an `npm` dependency of the adapter's package, never fetched
   from a CDN at runtime. See "Governance and observability" in
   `fab40-implementation-plan.md`.
6. **Admin-disable-able** — every adapter that performs network egress
   must be omittable from a tenant's solution build, and must honor the
   tenant endpoint allow-list and audit-sink hooks when enabled.

---

## Tier 1 — high-value, build first

### RssDataAdapter

**What it does.** Fetches RSS / Atom / RDF feeds and normalizes to a
uniform `{ items: [{ title, link, date, author, summary, thumbnail, categories }] }`
shape. Handles XML parsing, ATOM-vs-RSS variations, and an optional
CORS-proxy URL prefix in config.

**End-user value.**
- Surface news, blog posts, vendor announcements, and external thought
  leadership inside intranet pages without copy-paste.
- A team's homepage can pull from the company blog, the engineering team's
  dev.to feed, and a Microsoft 365 roadmap RSS — all in one rolled-up template.
- Pairs with the `<hbwp-news-ticker>` and `<hbwp-news-carousel>` web components.

---

### CalendarAdapter

**What it does.** Reads personal, room, and shared calendars via Microsoft
Graph (`/me/events`, `/users/{id}/calendar/calendarView`,
`/places/microsoft.graph.room`). Normalizes recurrence, time zones, and
attendee data. Read-only at first; `executeWrite` for create/RSVP later.

**End-user value.**
- Today views, this-week agendas, "next meeting" widgets on the homepage.
- Room availability boards for office floors.
- Department calendars rolled up into a public-facing site.
- Combined with the Copilot adapter: "summarize my afternoon".

---

### CopilotDataAdapter (with provider strategy)

**What it does.** Provider-agnostic AI adapter speaking
Microsoft Copilot Studio agents, Azure OpenAI, OpenAI, Anthropic, or a
self-hosted endpoint via a `provider` config. Operations include `chat`,
`chatWithContext`, `summarize`, `extract` (text + JSON schema → object),
`classify`, and `streamChat` (SSE/chunked, publishes incremental envelopes).
Builds prompts from a configurable system prompt + grounding context fed
in via topics. Enforces token budget, max output length, and a content-filter
hook.

**End-user value.**
- Drop-in chat surfaces grounded in the page or list the user is viewing.
- "Summarize this document", "draft a reply to this email", "what changed
  in our policy last week?" — all template-driven with no per-page code.
- Structured extraction: turn unstructured comments into tagged action items.
- Pairs with `<hbwp-copilot-chat>`, `<hbwp-copilot-button>`,
  `<hbwp-copilot-suggest>`.

**Recommended first backend.** Microsoft Copilot Studio declarative agents
(no key handoff, tenant-trust). Azure OpenAI second for production-grade
custom prompts.

**Hard rules.** API keys never live in the browser; always proxy through
Azure Function, Power Automate flow, or Copilot Studio. Streaming responses
go through the message bus so multiple components on the page can render
the same conversation.

---

### ContextHistoryAdapter (a.k.a. ActivityAdapter)

**What it does.** Subscribes to configurable topics on the message bus,
maintains a per-session ring buffer of recent envelopes, and republishes
a normalized `userContext` topic. Each tracked topic gets a small
"summarizer" turning raw envelopes into one-line human-readable strings.
Operations: `recent`, `summary`, `byTopic`, `since`. Built-in PII
scrubbing (emails, IDs, GUIDs), TTL enforcement, opt-out per user, and a
debug surface to audit what would be sent.

**End-user value.**
- The Copilot adapter consumes `userContext` to answer "what was I just
  looking at?" without the user re-typing it.
- Proactive suggestions: "You filtered policies by security three times —
  want a summary of recent security updates?"
- Session recap at end of session: "Here's what you accomplished;
  save as a note or email to your manager?"
- Drives "your recent activity" widgets and analytics dashboards.

**Why pair with Copilot.** Together these two adapters make every Copilot
interaction feel like it knows what the user is doing — without writing
per-template glue code. This pairing is the differentiator versus other
SPFx web-part toolkits.

**Privacy defaults.** Opt-out by default at tenant admin level, opt-in by
default at user level, `sessionStorage` only, never sent to a server
except when the Copilot adapter explicitly pulls it for a request the
user just initiated, configurable redaction list.

---

### SearchAdapter (Microsoft Graph search)

**What it does.** Wraps Graph `/search/query` for KQL across SP sites,
files, lists, mail, calendar, people, and external connectors. Normalizes
result hits, paging, and aggregations. Operations: `query`, `queryByEntity`,
`suggest`.

**End-user value.**
- "Find me X" templates anywhere in the intranet — knowledge bases, doc
  finders, expert finders.
- Auto-complete on a custom search input.
- Powers the **Knowledge Base Search** Fab 40 replacement web part.
- Combines with Copilot for retrieval-augmented chat: search first,
  feed top hits as grounding context, ask the LLM to answer.

---

### OrgChartAdapter (People / hierarchy)

**What it does.** Reads manager, direct reports, and peers via
Graph `/users/{id}/manager`, `/directReports`. Walks up/down the
hierarchy on demand. Normalizes a tree-friendly shape with photos and
titles.

**End-user value.**
- Org-chart templates ("who reports to whom").
- "About this team" widgets on a department site.
- Onboarding pages: "your team, your manager, your skip-level".
- Replaces the FckText slot in the Fab 40 with a much higher-value
  intranet feature.

---

### ExcelRangeAdapter

**What it does.** Reads named ranges and tables from a `.xlsx` in
SharePoint or OneDrive via Graph workbook API. Normalizes rows/columns
to objects. Optional write support for writing back into a range.

**End-user value.**
- Power users can keep authoritative data in Excel (where it already
  lives) and surface it on a SharePoint page without rebuilding it as
  a list.
- Scenarios: pricing tables, compensation bands, reference data,
  scorecards, KPI dashboards driven by an analyst's workbook.
- Pairs with `<hbwp-chart>` and table templates.
- Disproportionately popular with finance/operations teams.

---

### TodosAdapter

**What it does.** Reads To-Do lists and tasks via Graph
`/me/todo/lists` and `/me/todo/lists/{id}/tasks`. Read-write —
`executeWrite` for create/complete/delete. Pairs with `PlannerAdapter`.

**End-user value.**
- "My work" widgets that combine personal Todos with Planner tasks.
- Task quick-add UI directly on the homepage.
- Per-team task summaries.
- Combines with Copilot: "draft a status email from my completed tasks
  this week".

---

### PlannerAdapter

**What it does.** Reads boards, buckets, and tasks via Graph
`/me/planner/tasks`, `/groups/{id}/planner/plans`. Read-write for
task state changes. Companion to `TodosAdapter`.

**End-user value.**
- Cross-team "what's in flight" boards on a department homepage.
- Team-level Kanban templates without leaving SP.
- Roll-up of all assigned tasks across multiple plans.

---

### TeamsPresenceAdapter

**What it does.** Reads user presence via Graph
`/users/{id}/presence` and bulk
`/communications/getPresencesByUserId`. Lightweight, polls or
subscribes for changes. Read-only.

**End-user value.**
- "Who's available now" widgets paired with people directories.
- Presence badges on author bylines.
- Office floor plans that show who's in.
- One of the most-asked-for SharePoint UX additions.

---

### iCalAdapter

**What it does.** Parses public `.ics` feeds (holiday calendars, vendor
event calendars, conference schedules). Normalizes to the same shape as
`CalendarAdapter` so the same templates work for both.

**End-user value.**
- Holiday and PTO calendars on company homepages without integrating
  with HR.
- Industry conference schedules embedded on a community-of-practice site.
- Vendor maintenance windows on an IT operations page.
- Cheap to ship because it shares the Calendar adapter's output shape.

---

## Tier 2 — common feed and integration patterns

| Adapter | One-line value |
|---|---|
| **MailAdapter** (read-only) | Inbox snippets, "latest from CEO" filters, unread counts. Graph `/me/messages`. |
| **OneDriveFilesAdapter** | Recently used, shared with me, file picker source. Graph `/me/drive/recent`. |
| **TeamsChannelAdapter** (read) | Pull recent channel posts onto a "what's happening" widget. Graph `/teams/{id}/channels/{id}/messages`. |
| **ODataV4Adapter** | Generic OData with `$filter/$select/$expand/$top/$skip` and `@odata.nextLink` paging. Unlocks Dynamics, Business Central, custom Web APIs. |
| **GraphQLAdapter** | Generic query + variables + cursor pagination. |
| **OpenWeatherAdapter / OpenMeteoAdapter** | Weather widget. Open-Meteo needs no key. |
| **YouTubeChannelAdapter** | Channel video lists. Pairs with `<hbwp-media>`. |

## Tier 3 — operational and IT

| Adapter | One-line value |
|---|---|
| **ServiceHealthAdapter** | M365 service status board. Admin-only. |
| **MessageCenterAdapter** | M365 admin announcements feed for IT pages. |
| **AzureDevOpsAdapter** | Work items, builds, releases. WIQL or REST. |
| **GitHubAdapter** | Repos, issues, PRs, releases with paging + rate limits. |
| **JiraAdapter** | Issues by JQL. |

## Tier 4 — niche but cheap

| Adapter | One-line value |
|---|---|
| **JsonFileAdapter** | Author drops a `.json` in a SP doc lib, points adapter at it. Lower friction than HTTP for static data. |
| **CsvFileAdapter** | Same idea, CSV → row objects. |
| **YammerAdapter** / **VivaEngageAdapter** | Read communities and threads. |
| **SoapAdapter** | WSDL endpoint + envelope template + parameter map. Niche but unblocks legacy enterprise integrations when needed. |

## Explicitly out of scope

- **Per-provider social scrapers** (Instagram, Pinterest scrape mode).
  OAuth-only or against ToS. Use HTTP adapter against an official API
  or a customer-owned proxy.
- **Stock APIs** as discrete adapters. Each provider's auth differs by
  one line; ship as HTTP adapter sample configs.
- **Translator / OCR / single-shot AI services**. These are
  request/response operations, better as `executeWrite` operations on
  the Copilot adapter (or a sibling `AIServicesAdapter`) than as data
  sources.
- **`HttpJsonDataAdapter`**. The existing `HttpDataAdapter` already
  covers JSON/REST.

---

## Suggested build order

1. **RssDataAdapter** + **iCalAdapter** — same XML/ICS-parse-then-normalize
   pattern, ship as a pair.
2. **CalendarAdapter** — biggest intranet UX win after lists.
3. **CopilotDataAdapter** + **ContextHistoryAdapter** — ship together as
   the AI pairing. Copilot Studio backend first.
4. **SearchAdapter** — feeds knowledge-base templates and grounded Copilot.
5. **ExcelRangeAdapter** — punches above its weight for power users.
6. **OrgChartAdapter** — feeds the Org Chart web component.
7. **TodosAdapter** + **PlannerAdapter** — paired "my work" view.
8. **TeamsPresenceAdapter** + **TeamsChannelAdapter** — paired Teams story.
9. **ODataV4Adapter** + **GraphQLAdapter** — unlock every enterprise
   integration without writing per-system adapters.
10. **SoapAdapter** — last; niche, finicky authoring UX.

## Cross-adapter scenarios to test

These are the templates that prove the value of having multiple adapters
working together. Use them as integration smoke tests:

1. **Today board** — Calendar + Todos + Planner + Mail unread count, all
   on one page, all driven by `userTopic`.
2. **Knowledge desk** — Search + Copilot, with grounded chat over the top
   N hits.
3. **Team room** — TeamsPresence + TeamsChannel + OrgChart + Calendar
   for a single team.
4. **Operations dashboard** — ServiceHealth + MessageCenter + AzureDevOps
   + Jira on one IT page.
5. **Personalized homepage** — User + Calendar + Todos + ContextHistory →
   Copilot summarizes "your morning so far".
