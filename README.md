# Handlebars List View Web Part

A powerful, flexible SharePoint Framework (SPFx) web part that renders SharePoint list data and HTTP API data using customizable Handlebars templates with Fluent UI Web Components.

![SPFx Version](https://img.shields.io/badge/SPFx-1.18.2-green.svg)
![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)

## Features

- 📋 **Multiple Data Sources** - Connect to SharePoint lists and HTTP endpoints
- 🎨 **Handlebars Templates** - Full templating with 180+ helpers from handlebars-helpers
- 🌐 **Fluent UI Web Components** - Modern, accessible UI components
- 🔐 **Multi-Auth Support** - AAD, API Key, Bearer Token, Anonymous, or Power Automate Flow for HTTP endpoints
- 💾 **Per-Source Caching** - Individual cache timeouts stored in localStorage (auto-bypassed for paged requests)
- 📝 **Form Submission** - Submit data to SharePoint lists, HTTP endpoints, or Power Automate HTTP-triggered flows
- 👤 **User Context** - Access current user profile in templates
- 🔄 **Token Replacement** - Use `{{user.email}}`, `{{page.Id}}`, `{{query.param}}` in CAML filters, URLs, and templates
- ❤️ **Social Integration** - Interactive like/unlike toggle with optimistic UI (`{{likeButton}}` helper)
- ⭐ **Star Ratings** - Display and submit star ratings on list items (`{{starRating}}` helper)
- 🎨 **Auto CSS Scoping** - CSS classes in `<style>` blocks are automatically scoped per web part instance
- 🔍 **Dynamic CAML Filters** - Filter list data using `{{page.Id}}`, `{{user.department}}`, `{{query.category}}` tokens
- 📄 **External Templates** - Load `.hbs` template files from SharePoint document libraries
- 📑 **Server-Side Paging** - Prev/next navigation via `renderListDataAsStream` with `{{hbwp-paging}}` helper
- 🎯 **CSP-Compliant Interactions** - Delegated event handlers via `data-hbwp-*` attributes (no inline JS)
- 🔀 **Data Manipulation** - `shuffle`, `filter`, `toInt`, `mod` helpers for in-template data processing
- 🏗️ **Panel / Drawer Support** - Slide-in panels via `data-hbwp-panel-open` / `data-hbwp-panel-close` attributes
- 🔧 **Tenant-Specific Permissions** - Gitignored `webApiPermissions-config.json` merged at build time

---

## Backlog

Planned features and enhancements — see [docs/backlog.md](docs/backlog.md) for full details.

| Feature | Complexity | Description |
|---|---|---|
| [Paging Control](docs/backlog.md#paging-control) | ~~Medium~~ | ✅ Prev/next navigation using `renderListDataAsStream` paging tokens |
| [Template Lookup Helpers](docs/backlog.md#template-lookup-helpers-client-side-joins) | Low | `findItem` / `findItems` for cross-list client-side joins |
| [Query Parameter Tokens](docs/backlog.md#query-parameter-token-support) | ~~Low~~ | ✅ `{{query.paramName}}` in CAML filters and templates |
| [Web Part Connections](docs/backlog.md#web-part-connections-dynamic-data) | High | SPFx Dynamic Data for cross-web-part filtering |
| [Dynamic Filtering](docs/backlog.md#dynamic-filtering) | Medium | Combine query params + connections for live CAML filtering |
| [Social Integration](docs/backlog.md#social-integration-likes-ratings--comments) | ~~Medium-High~~ | ✅ Likes & ratings done; comments panel remaining |
| [Async Data Expansion](docs/backlog.md#async-data-expansion-helper-hbwp-expand) | High | `{{#hbwp-expand}}` for lazy/eager drill-down into related data |
| [Extensibility Library Import](docs/backlog.md#enable-extensibility-library-import) | Medium | Load external SPFx library components (like PnP Search) |
| [Web Component Library](docs/backlog.md#web-component-library-hbwp-components) | High | Extract `<hbwp-like-button>`, `<hbwp-star-rating>`, etc. for reuse |

---

## Screenshots

### Cards Template

![Cards Template](docs/images/cards-template.png)
*Grid layout with Fluent UI cards displaying list items*

### Survey Template

![Survey Template](docs/images/survey-template.png)
*Interactive survey with voting and bar chart results*

### Feedback Form Template

![Feedback Form](docs/images/feedback-form-template.png)
*Form submission with validation*

### Carousel Template

![Carousel Template](docs/images/carousel-template.png)
*Image carousel using @mrpullen/fluentui-carousel*

---

## Installation

```bash
# Clone the repository
git clone https://github.com/mrpullen/spfx-hbwp.git
cd spfx-hbwp

# Install dependencies
npm install

# Build
gulp build

# Serve locally
gulp serve

# Package for production
gulp bundle --ship
gulp package-solution --ship
```

---

## Configuration

### Property Pane Pages

| Page | Purpose |
|------|---------|
| **1. General** | Primary site/list, view selection, template source |
| **2. Data Sources** | Additional SharePoint lists (up to 5) |
| **3. HTTP Endpoints** | External API endpoints with auth config |
| **4. Submit Endpoints** | Form submission targets |

### Data Source Configuration

Each data source has:
- **Key** - Unique identifier used in templates (e.g., `users`, `products`)
- **Site** - SharePoint site URL
- **List** - Target list
- **View** - Optional view filter
- **Cache Timeout** - Minutes to cache in localStorage (1-120)

### HTTP Endpoint Configuration

| Field | Description |
|-------|-------------|
| Key | Template reference (e.g., `{{api.items}}`) |
| URL | Endpoint URL with token support |
| Auth Type | `aad`, `anonymous`, `apiKey`, `bearer`, `flow` |
| App ID | Azure AD app registration (for AAD auth) |
| API Key Header/Value | Custom header authentication |
| Cache Timeout | Per-endpoint caching |

**URL Tokens:**
- `{{userEmail}}` - Current user's email
- `{{userId}}` - Current user's ID
- `{{siteUrl}}` - Current site URL

---

## Template Data Context

Templates receive this data structure:

```javascript
{
  items: [...],           // Primary list items
  user: {
    displayName: "John Doe",
    email: "john@contoso.com",
    pictureUrl: "...",
    // ... other profile properties
  },
  page: {
    Title: "My Page",
    Id: 42,
    AbsoluteUrl: "https://contoso.sharepoint.com/sites/hr/SitePages/My-Page.aspx",
    // ... other page metadata
  },
  wpId: "abc-123",        // Web part instance ID
  // Additional data sources by key:
  users: [...],           // If you added a data source with key "users"
  products: [...],        // If you added a data source with key "products"
  api: {...}              // HTTP endpoint data
}
```

---

## Available Helpers

### From handlebars-helpers (180+)

| Category | Examples |
|----------|----------|
| **Array** | `first`, `last`, `each`, `filter`, `map`, `sort`, `unique`, `slice` |
| **Comparison** | `eq`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not` |
| **Math** | `add`, `subtract`, `multiply`, `divide`, `ceil`, `floor`, `round` |
| **String** | `capitalize`, `uppercase`, `lowercase`, `trim`, `replace`, `split` |
| **Object** | `get`, `keys`, `values`, `extend` |
| **URL** | `encodeURI`, `decodeURI` |

### Custom Helpers

See [docs/helpers.md](docs/helpers.md) for a complete reference of all custom Handlebars helpers with usage examples.

| Helper | Description | Example |
|--------|-------------|---------|
| `filter` | Filter array by property (handles SP lookups) | `{{#each (filter items "Status" "Active")}}` |
| `percentage` | Calculate percentage | `{{percentage count total}}` → `75` |
| `substring` | Get substring | `{{substring name 0 1}}` → First letter |
| `concat` | Concatenate strings | `{{concat "ID-" item.Id}}` → `ID-123` |
| `json` | Output data as formatted JSON (for debugging) | `{{json items}}` → pretty-printed JSON |
| `starRating` | Render ★★★★☆ star display | `{{starRating 4}}` → 4 filled + 1 empty |
| `likeButton` | Like/unlike toggle with count | `{{likeButton ID LikesCount LikedBy ../user.id}}` |
| `toInt` | Parse value to integer | `{{toInt "42"}}` → `42` |
| `mod` | Modulo operation | `{{mod 7 3}}` → `1` |
| `shuffle` | Randomize array order (Fisher-Yates) | `{{#each (shuffle items.rows)}}` |
| `hbwp-paging` | Prev/next page navigation | `{{hbwp-paging items.paging label="people"}}` |

### Form Helpers

| Helper | Description |
|--------|-------------|
| `{{#hbwp-form endpoint="key"}}` | Form wrapper bound to submit endpoint |
| `{{hbwp-input name="Title"}}` | Fluent text field |
| `{{hbwp-textarea name="Description"}}` | Fluent textarea |
| `{{hbwp-select name="Status" options="New\|Active\|Closed"}}` | Fluent dropdown |
| `{{hbwp-checkbox name="Agree"}}` | Fluent checkbox |
| `{{hbwp-hidden name="Id" value=item.Id}}` | Hidden field |
| `{{hbwp-submit label="Save"}}` | Submit button |

---

## Sample Templates

### 1. Cards Template (`cards.hbs`)

Grid layout with Fluent UI cards:

```handlebars
<div class="cards-grid">
  {{#each items}}
    <fluent-card>
      <div class="card-header">
        <h3>{{this.Title}}</h3>
      </div>
      <div class="card-body">
        <p>{{this.Description}}</p>
      </div>
      <div class="card-footer">
        <fluent-button appearance="primary">View</fluent-button>
      </div>
    </fluent-card>
  {{/each}}
</div>
```

### 2. Survey Template (`survey.hbs`)

Interactive survey with voting and results visualization:

```handlebars
{{#each items}}
  <div class="question-card">
    <fluent-tabs>
      <fluent-tab id="vote-tab">Vote</fluent-tab>
      <fluent-tab id="results-tab">Results</fluent-tab>
      
      <fluent-tab-panel>
        {{#hbwp-form endpoint="submitSurvey"}}
          {{hbwp-hidden name="QuestionId" value=this.ID}}
          <div class="answer-options">
            {{#each (split this.Options "|")}}
              <div class="answer-option">
                <input type="radio" name="Answer" value="{{this}}" required>
                <label>{{this}}</label>
              </div>
            {{/each}}
          </div>
          {{hbwp-submit label="Submit Vote"}}
        {{/hbwp-form}}
      </fluent-tab-panel>
      
      <fluent-tab-panel>
        <div class="bar-chart">
          {{#each (split this.Options "|")}}
            {{#with (filter ../responses "Answer" this) as |votes|}}
              <div class="bar-item">
                <span>{{../this}}</span>
                <div class="bar-fill" style="width: {{percentage (length votes) (length ../../responses)}}%">
                  {{length votes}} votes
                </div>
              </div>
            {{/with}}
          {{/each}}
        </div>
      </fluent-tab-panel>
    </fluent-tabs>
  </div>
{{/each}}
```

**Required Lists:**
| List | Fields |
|------|--------|
| Questions | `Title`, `Options` (pipe-delimited) |
| Responses | `QuestionId`, `Answer`, `RespondentEmail` |

### 3. Feedback Form (`feedback-form.hbs`)

Form submission with validation:

```handlebars
<div class="feedback-container">
  <div class="user-info">
    <div class="user-avatar">{{substring userProfile.DisplayName 0 1}}</div>
    <div>{{userProfile.DisplayName}}</div>
  </div>
  
  {{#hbwp-form endpoint="submitFeedback"}}
    {{hbwp-hidden name="SubmitterEmail" value=userProfile.Email}}
    
    {{hbwp-input name="Title" label="Subject" required=true}}
    
    {{hbwp-select name="Category" label="Category" required=true 
      options="Bug|Feature Request|General"}}
    
    {{hbwp-textarea name="Description" label="Details" rows=5 required=true}}
    
    {{hbwp-checkbox name="ContactMe" label="Contact me about this"}}
    
    {{hbwp-submit label="Submit Feedback" appearance="primary"}}
  {{/hbwp-form}}
</div>
```

### 4. Master-Detail Template (`master-detail.hbs`)

Two-pane layout with drawer:

```handlebars
<div class="master-detail">
  <div class="master-list">
    {{#each items}}
      <div class="list-item" onclick="openDetail('{{this.ID}}')">
        <h4>{{this.Title}}</h4>
        <p>{{this.Status}}</p>
      </div>
    {{/each}}
  </div>
  
  <fluent-drawer id="detailDrawer" position="end" hidden>
    <div slot="title">
      <span id="drawerTitle"></span>
      <fluent-button appearance="stealth" onclick="closeDrawer()">✕</fluent-button>
    </div>
    <div id="detailContent"></div>
  </fluent-drawer>
</div>
```

### 5. Carousel Template (`carousel.hbs`)

Image slideshow:

```handlebars
<fluentui-carousel autoplay="true" autoplay-interval="5000" loop="true">
  {{#each items}}
    <div class="slide">
      <img src="{{this.ImageUrl}}" alt="{{this.Title}}" />
      <div class="slide-caption">
        <h2>{{this.Title}}</h2>
        <p>{{this.Description}}</p>
      </div>
    </div>
  {{/each}}
</fluentui-carousel>
```

---

## Fluent UI Web Components

All [Fluent UI Web Components](https://docs.microsoft.com/en-us/fluent-ui/web-components/) are available:

| Component | Usage |
|-----------|-------|
| `<fluent-button>` | Buttons with `appearance="primary\|outline\|stealth"` |
| `<fluent-card>` | Content containers |
| `<fluent-tabs>` | Tab navigation |
| `<fluent-text-field>` | Text inputs |
| `<fluent-text-area>` | Multiline text |
| `<fluent-select>` | Dropdowns |
| `<fluent-checkbox>` | Checkboxes |
| `<fluent-radio-group>` | Radio buttons |
| `<fluent-dialog>` | Modal dialogs |
| `<fluent-drawer>` | Side panels |
| `<fluent-badge>` | Status badges |
| `<fluent-progress-ring>` | Loading indicators |
| `<fluent-divider>` | Horizontal rules |
| `<fluentui-carousel>` | Image carousels (@mrpullen/fluentui-carousel) |

### CSS Variables

Fluent UI provides design tokens as CSS variables:

```css
.my-element {
  background: var(--colorNeutralBackground1);
  color: var(--colorNeutralForeground1);
  border: 1px solid var(--colorNeutralStroke1);
  font-family: var(--fontFamilyBase);
  border-radius: var(--borderRadiusMedium);
}

/* Brand colors */
.accent { background: var(--colorBrandBackground); }

/* Status colors */
.success { color: var(--colorStatusSuccessForeground1); }
.danger { color: var(--colorStatusDangerForeground1); }
.warning { color: var(--colorStatusWarningForeground1); }
```

---

## CAML Filters

Both the primary list and additional data sources support an optional **CAML Filter** field in the property pane. This lets you add a `<Where>` clause that is merged with the view's existing query.

### Token Support

CAML filters support `{{user.*}}` and `{{page.*}}` tokens that are resolved at runtime:

```xml
<!-- Filter by current user's email -->
<Eq><FieldRef Name="AssignedTo" /><Value Type="Text">{{user.email}}</Value></Eq>

<!-- Filter by current page ID -->
<Eq><FieldRef Name="PageId" /><Value Type="Number">{{page.Id}}</Value></Eq>
```

### How It Works

- If the view already has a `<Where>` clause, the filter is combined using `<And>`
- If no `<Where>` exists, one is injected into the query
- Tokens are resolved before the CAML query is sent to SharePoint
- The cache key includes the resolved filter, so different filter values produce separate cache entries

---

## Debug Template

Use the built-in `debug.hbs` template to inspect the raw data available to your templates. It displays:

- **User profile** as JSON
- **Items** (with count) as JSON
- **Full template context** as JSON
- A **Copy All** button for easy clipboard export

Select it from the template dropdown when you aren't seeing expected data in your templates.

---

## Form Submission

### Configure Submit Endpoint

1. Go to **Property Pane → Page 4 (Submit Endpoints)**
2. Add endpoint with key, type (SharePoint/HTTP), and target

### SharePoint List Submission

Creates a new item in the target list. Form field `name` attributes map to list columns.

### HTTP Submission

POSTs JSON to the configured endpoint with authentication.

### Handle Response in Template

Form results are displayed inline within the form's `[data-hbwp-result]` div automatically. Success shows a green message, failure shows red. Messages auto-clear after 8 seconds and the submit button is re-enabled.

### Power Automate Flow Submission

To submit form data to a Power Automate HTTP-triggered flow:

1. Set the submit endpoint **Auth Type** to **Power Automate Flow (HTTP trigger)**
2. Set the **URL** to your flow's HTTP trigger URL
3. Form data is POSTed as JSON with AAD authentication against `https://service.flow.microsoft.com/`

Requires the `Microsoft Flow Service / User` permission in `package-solution.json`.

### Typed Form Data

Add `data-type` attributes to form elements for automatic type coercion:

```html
<input name="count" data-type="number" value="5" />       <!-- → 5 (number) -->
<input name="active" data-type="boolean" value="true" />   <!-- → true (boolean) -->
{{hbwp-hidden name="UserId" value=user.id type="number"}}  <!-- → number -->
```

---

## Caching

Data is cached in localStorage with keys:
```
hbwp-cache-{instanceId}-{sourceKey}
```

Each data source can have its own timeout (1-120 minutes).

---

## API Permissions

For HTTP endpoints using AAD authentication, add to `config/package-solution.json`:

```json
{
  "webApiPermissionRequests": [
    {
      "resource": "your-api-app-name",
      "scope": "user_impersonation"
    }
  ]
}
```

### Tenant-Specific Permissions (Build-Time Merge)

To keep sensitive or tenant-specific API permission names out of the public repo:

1. Create `config/webApiPermissions-config.json` (gitignored):

```json
{
  "webApiPermissionRequests": [
    {
      "resource": "My Internal Service",
      "scope": "user_impersonation"
    }
  ]
}
```

2. At build time, the gulp `merge-api-permissions` subtask merges entries from this file into `package-solution.json`, deduplicating by `resource + scope`. After the build completes, the original `package-solution.json` is automatically restored.

---

## Interaction Model (CSP-Compliant)

SharePoint Online's Content Security Policy blocks inline `onclick` handlers. All interactions use delegated `data-hbwp-*` attributes instead:

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-hbwp-panel-open="panelId"` | Open a panel/drawer by element ID | `<button data-hbwp-panel-open="my-panel">Open</button>` |
| `data-hbwp-panel-close="panelId"` | Close a panel/drawer | `<button data-hbwp-panel-close="my-panel">Close</button>` |
| `data-hbwp-page="next"` | Navigate to next page | Rendered by `{{hbwp-paging}}` helper |
| `data-hbwp-page="prev"` | Navigate to previous page | Rendered by `{{hbwp-paging}}` helper |
| `data-hbwp-like="itemId"` | Toggle like on an item | Rendered by `{{likeButton}}` helper |
| `data-hbwp-rate="itemId"` | Submit a star rating | `<span data-hbwp-rate="42" data-hbwp-rate-value="4">` |
| `data-hbwp-submit="endpointKey"` | Form submission target | Rendered by `{{#hbwp-form}}` helper |
| `data-hbwp-open` | Panel open state (set/removed by JS) | CSS: `.panel[data-hbwp-open] { ... }` |

Panels use `data-hbwp-open` attribute (not CSS classes) for state to avoid interference from the auto CSS scoping system.

---

## Template Builder Tool

For rapid template development, see the companion project:

👉 **[template-builder](../template-builder/)** - Local development server with live preview, mock data, and all helpers pre-loaded.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Jan 2025 | Initial release |
| 1.0.1 | Feb 2025 | Added @mrpullen/fluentui-carousel |
| 1.1.0 | Feb 2025 | Multiple data sources, HTTP endpoints |
| 1.2.0 | Feb 2025 | Form submission, multi-auth, survey template |
| 1.3.0 | Apr 2026 | PageDataService (`{{page.*}}` tokens), CAML filter support with token resolution, `json` Handlebars helper, debug template |
| 1.4.0 | Apr 2026 | Power Automate flow auth, server-side paging, CSP-compliant panel/drawer interactions, persona card template, metro-links template, typed form data (`data-type`), inline form result display, `starRating`/`toInt`/`mod`/`shuffle`/`hbwp-paging` helpers, cache bypass for paged requests, build-time API permissions merge |

---

## Disclaimer

**THIS CODE IS PROVIDED _AS IS_ WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

---

## References

- [SharePoint Framework Documentation](https://docs.microsoft.com/en-us/sharepoint/dev/spfx/sharepoint-framework-overview)
- [Fluent UI Web Components](https://docs.microsoft.com/en-us/fluent-ui/web-components/)
- [Handlebars.js](https://handlebarsjs.com/)
- [handlebars-helpers](https://github.com/helpers/handlebars-helpers)

---

## Author

**@mrpullen**
