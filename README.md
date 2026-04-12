# Handlebars List View Web Part

A powerful, flexible SharePoint Framework (SPFx) web part that renders SharePoint list data and HTTP API data using customizable Handlebars templates with Fluent UI Web Components.

![SPFx Version](https://img.shields.io/badge/SPFx-1.18.2-green.svg)
![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)

## Features

- 📋 **Multiple Data Sources** - Connect to SharePoint lists and HTTP endpoints
- 🎨 **Handlebars Templates** - Full templating with 180+ helpers from handlebars-helpers
- 🌐 **Fluent UI Web Components** - Modern, accessible UI components
- 🔐 **Multi-Auth Support** - AAD, API Key, Bearer Token, or Anonymous for HTTP endpoints
- 💾 **Per-Source Caching** - Individual cache timeouts stored in localStorage
- 📝 **Form Submission** - Submit data back to SharePoint lists or HTTP endpoints
- 👤 **User Context** - Access current user profile in templates
- 🔄 **Token Replacement** - Use `{{userEmail}}`, `{{userId}}` in URLs

---

## Backlog

Planned features and enhancements — see [docs/backlog.md](docs/backlog.md) for full details.

| Feature | Complexity | Description |
|---|---|---|
| [Paging Control](docs/backlog.md#paging-control) | Medium | Prev/next navigation using `renderListDataAsStream` paging tokens |
| [Template Lookup Helpers](docs/backlog.md#template-lookup-helpers-client-side-joins) | Low | `findItem` / `findItems` for cross-list client-side joins |
| [Query Parameter Tokens](docs/backlog.md#query-parameter-token-support) | Low | `{{query.paramName}}` in CAML filters and templates |
| [Web Part Connections](docs/backlog.md#web-part-connections-dynamic-data) | High | SPFx Dynamic Data for cross-web-part filtering |
| [Dynamic Filtering](docs/backlog.md#dynamic-filtering) | Medium | Combine query params + connections for live CAML filtering |
| [Social Integration](docs/backlog.md#social-integration-likes-ratings--comments) | Medium-High | Likes, ratings, comments — partially implemented |
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
| Auth Type | `aad`, `anonymous`, `apiKey`, `bearer` |
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

| Helper | Description | Example |
|--------|-------------|---------|
| `filter` | Filter array by property (handles SP lookups) | `{{#each (filter items "Status" "Active")}}` |
| `percentage` | Calculate percentage | `{{percentage count total}}` → `75` |
| `substring` | Get substring | `{{substring name 0 1}}` → First letter |
| `concat` | Concatenate strings | `{{concat "ID-" item.Id}}` → `ID-123` |
| `json` | Output data as formatted JSON (for debugging) | `{{json items}}` → pretty-printed JSON |

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

```javascript
document.addEventListener('hbwp-form-result', function(e) {
  if (e.detail.success) {
    alert('Saved successfully!');
  } else {
    alert('Error: ' + e.detail.error);
  }
});
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
