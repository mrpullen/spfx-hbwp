# Dynamic Data Architecture — Dual-Path Design

## Overview

HBWP needs two **complementary** data exchange paths:

| Path | Scope | Participants | Configured by |
|------|-------|-------------|---------------|
| **SPFx Dynamic Data** | SharePoint page | Any SPFx web part (HBWP ↔ HBWP, HBWP ↔ 3rd-party) | End user via property pane UI |
| **MessageBus** | Window (same page) | HBWP instances + extensibility web components (inside Handlebars templates) | Template author via `data-*` attributes + property pane topic config |

They are not competing — they cover different audiences and solve different problems. The web part acts as a **bridge** between the two.

---

## Path 1: SPFx Dynamic Data (framework-native)

### What it gives us for free
- Standard property pane UX for connecting web parts (the "…" ellipsis menu)
- Automatic serialization/deserialization of connection config
- Works with **any** SPFx web part on the page (not just ours)
- Microsoft-supported, documented, familiar to SPFx developers

### How HBWP participates

#### As a **Source** (publishes data)

The web part class implements `IDynamicDataCallables` and registers itself as a source in `onInit()`.

```
┌─ HandlebarsListViewWebPart ─────────────────────────┐
│                                                      │
│  implements IDynamicDataCallables                    │
│                                                      │
│  onInit():                                           │
│    this.context.dynamicDataSourceManager             │
│        .initializeSource(this)                       │
│                                                      │
│  getPropertyDefinitions():                           │
│    [                                                 │
│      { id: 'selectedItem',  title: 'Selected Item' }│
│      { id: 'selectedItems', title: 'Selected Items'}│
│      { id: 'filterContext', title: 'Filter Context' }│
│    ]                                                 │
│                                                      │
│  getPropertyValue('selectedItem'):                   │
│    → this._selectedItem   (flat object)              │
│                                                      │
│  When user clicks a row or selection changes:        │
│    this._selectedItem = flatItem;                    │
│    this.context.dynamicDataSourceManager             │
│        .notifyPropertyChanged('selectedItem')        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Property definitions we expose:**

| Property ID | Type | When notified | Shape |
|------------|------|---------------|-------|
| `selectedItem` | `object` | Row click / row select | Flat key-value of the selected row |
| `selectedItems` | `array` | Multi-select changes | Array of flat key-value objects |
| `filterContext` | `object` | CAML filter / search changes | `{ camlFilter, searchQuery, siteUrl, listId, viewId }` |

> **Important:** SPFx Dynamic Data flattens nested objects. We must flatten lookup fields (`Author.Title` → `Author_Title`) before publishing.

#### As a **Consumer** (receives data)

New `DynamicProperty` web part properties let the page author wire an external source to HBWP.

```typescript
// In IHandlebarsListViewWebPartProps:
incomingItem: DynamicProperty<object>;    // single item from another source
incomingItems: DynamicProperty<object[]>; // collection from another source

// In propertiesMetadata:
'incomingItem':  { dynamicPropertyType: 'object' },
'incomingItems': { dynamicPropertyType: 'array'  }
```

When data arrives, the web part:
1. Reads the value via `this.properties.incomingItem.tryGetValue()`
2. Merges it into the Handlebars template context as `{{incoming.*}}`
3. Optionally re-renders the template (or the forms pre-fill from `{{incoming.Name}}`, etc.)

The property pane uses `IPropertyPaneConditionalGroup` so users can **either** type static values **or** connect to a dynamic source.

---

## Path 2: MessageBus (custom pub/sub)

### Why we need this in addition to SPFx Dynamic Data

SPFx Dynamic Data operates at the **web part class** level — it can't reach inside Handlebars templates where custom web components (`<hbwp-smart-form>`, `<hbwp-badge>`, etc.) live. Those components need a way to:

- Publish events (form submitted, button clicked, value changed)
- Subscribe to events (pre-fill from another component's selection)
- Communicate **within** a single web part instance (parent template → child web component)
- Communicate **across** web parts without requiring property pane wiring

The MessageBus lives in `@mrpullen/spfx-extensibility` so extensibility libraries can import it without depending on HBWP internals or SPFx framework packages.

### Data Envelope

```typescript
interface IDataEnvelope {
  /** Channel name — human-readable, configured by template/property author */
  topic: string;
  /** Publisher's web part instanceId */
  source: string;
  /** Unix timestamp (Date.now()) */
  timestamp: number;
  /** Semantic action — see Action Reference below */
  action: 'select' | 'submit' | 'delete' | 'filter' | 'refresh' | 'clear' | 'custom';
  /** Payload — consistent shape, extensible */
  data: {
    item?: Record<string, any>;      // single item
    items?: Record<string, any>[];   // collection
    [key: string]: any;              // extension point
  };
}
```

### Action Reference

| Action | Meaning | Publisher example | Subscriber behavior |
|--------|---------|-------------------|---------------------|
| `select` | User picked an item (row click, list selection) | Table row click | Merge `data.item` into template context, re-render |
| `submit` | Data was saved (create or update — distinction is backend-only) | Form save | Refresh data + optionally merge `data.item` |
| `delete` | Item was removed | Delete button | Refresh data |
| `filter` | Query / filter criteria changed | Dropdown selection, search box | Apply `data.item` tokens to CAML filter, re-fetch |
| `refresh` | Just re-fetch (no data change) | Manual refresh button | Re-query SharePoint with current config, no context merge |
| `clear` | Reset / deselect | Clear selection button | Wipe incoming context for this topic, re-render |
| `custom` | Escape hatch for extensibility libraries | App-specific events | Handler decides |

> **Why no separate `create` / `update`?** From the subscriber's perspective, the reaction is the same: refresh the data. If a subscriber ever needs to distinguish, it checks `envelope.data.item.ID` — present = update, absent = create.

### Template Attributes for Publishing

Elements in Handlebars templates can publish messages via `data-hbwp-*` attributes. The web part's delegated click handler picks these up:

| Attribute | Required | Description | Example |
|-----------|----------|-------------|---------|
| `data-hbwp-action` | Yes | The action to publish | `"select"`, `"filter"`, `"clear"` |
| `data-hbwp-topic` | Yes | Topic name to publish to | `"selectedEmployee"` |
| `data-hbwp-item` | No | JSON of the item to send in `data.item` | `'{{json this}}'` |
| `data-hbwp-items` | No | JSON array for `data.items` | `'{{json rows}}'` |

```handlebars
{{!-- Row click publishes the full row as a select --}}
<tr data-hbwp-action="select"
    data-hbwp-topic="selectedEmployee"
    data-hbwp-item='{{json this}}'>
  <td>{{Title}}</td>
  <td>{{Email}}</td>
</tr>

{{!-- Button publishes a filter with a specific value --}}
<button data-hbwp-action="filter"
        data-hbwp-topic="divisionSelected"
        data-hbwp-item='{"ID": {{ID}}, "Title": "{{Title}}"}'>
  {{Title}}
</button>

{{!-- Clear selection button --}}
<button data-hbwp-action="clear"
        data-hbwp-topic="selectedEmployee">
  Clear Selection
</button>
```

### Form Component Attributes for Publishing

`<hbwp-smart-form>` publishes automatically on successful submit:

| Attribute | Required | Description | Default |
|-----------|----------|-------------|---------|
| `data-topic` | No | Topic to publish to after successful submit | _(none — no publish)_ |
| `data-topic-action` | No | Action verb for the published envelope | `"submit"` |

```handlebars
<hbwp-smart-form data-wp-id="{{wpId}}"
    data-endpoint="addEmployee"
    data-topic="employeeUpdated"
    data-topic-action="submit">
  ...fields...
</hbwp-smart-form>
```

### MessageBus API

```typescript
interface IMessageBus {
  publish(envelope: IDataEnvelope): void;
  subscribe(topic: string, handler: (envelope: IDataEnvelope) => void): () => void;
  lastMessage(topic: string): IDataEnvelope | undefined;
}
```

- Singleton on `window.__hbwp_message_bus__`
- `subscribe()` returns an unsubscribe function (clean, no leak risk)
- `lastMessage()` lets late-mounting components catch the last published value

### Where it lives

| Layer | File |
|-------|------|
| Interface + implementation | `spfx-extensibility/src/MessageBus.ts` |
| Added to `IServiceContext` | `spfx-extensibility/src/models/IServiceContext.ts` → `messageBus: IMessageBus` |
| Published by web part | `spfx-hbwp` HandlebarsListView componentDidMount |
| Consumed by web components | `BaseWebComponent.getServiceContext().messageBus` |

### Two Ways to Publish — Same Bus

There are two ways to publish messages. They both write to the same `MessageBus` singleton — subscribers don't know or care which path the message came from.

#### 1. Template attributes (plain HTML — no code)

For elements rendered by Handlebars templates that have no JavaScript of their own. The web part's delegated `handleContainerClick` handler intercepts clicks on elements with `data-hbwp-action` and publishes on their behalf:

```handlebars
<tr data-hbwp-action="select"
    data-hbwp-topic="selectedEmployee"
    data-hbwp-item='{{json this}}'>
  <td>{{Title}}</td>
</tr>
```

#### 2. Direct API call (React web components — full code access)

For custom web components that extend `BaseWebComponent` and render React internally. These have full access to `IServiceContext` and call the MessageBus API directly in their event handlers:

```typescript
// Inside any web component that extends BaseWebComponent:
class MyComponent extends BaseWebComponent {
  public connectedCallback(): void {
    const ctx = this.getServiceContext();
    // ... render React component, passing ctx ...
  }
}

// Inside the React component's event handler:
private handleRowClick = (row: Record<string, any>): void => {
  const { serviceContext } = this.props;
  if (serviceContext?.messageBus) {
    serviceContext.messageBus.publish({
      topic: 'selectedEmployee',
      source: serviceContext.instanceId,
      timestamp: Date.now(),
      action: 'select',
      data: { item: row }
    });
  }
};
```

#### Summary

| Who publishes | How | When to use |
|---------------|-----|-------------|
| Plain HTML in a Handlebars template | `data-hbwp-action` + `data-hbwp-topic` attributes | Simple interactions (row click, button click, filter selection) |
| React web component (`extends BaseWebComponent`) | `this.getServiceContext().messageBus.publish(...)` | Complex interactions with custom logic, validation, async operations |
| `<hbwp-smart-form>` | Automatic via `data-topic` + `data-topic-action` attributes | Form submission (handled internally by SmartFormWebComponent) |

---

## The Bridge: How the Two Paths Connect

The web part is the bridge between framework-level Dynamic Data and component-level MessageBus.

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                    SharePoint Page                              │
 │                                                                 │
 │  ┌─ 3rd-party WP ─┐    ┌─ HBWP Instance A (table) ──────────┐│
 │  │                 │    │                                      ││
 │  │  SPFx Dynamic   │◄──┤  IDynamicDataCallables               ││
 │  │  Data Consumer   │    │    publishes: selectedItem          ││
 │  │                 │    │                                      ││
 │  └─────────────────┘    │  Internal:                          ││
 │                         │    row click                         ││
 │                         │      → notifyPropertyChanged()       ││
 │                         │      → messageBus.publish()          ││
 │                         │                                      ││
 │                         └──────────────┬───────────────────────┘│
 │                                        │ MessageBus (topic)     │
 │                                        ▼                        │
 │  ┌─ HBWP Instance B (detail/form) ───────────────────────────┐ │
 │  │                                                            │ │
 │  │  DynamicProperty<object> ← SPFx Dynamic Data Consumer     │ │
 │  │  messageBus.subscribe() ← MessageBus Consumer              │ │
 │  │                                                            │ │
 │  │  Either path triggers:                                     │ │
 │  │    merge incoming data → re-render template                │ │
 │  │                                                            │ │
 │  │  Template contains:                                        │ │
 │  │    <hbwp-smart-form data-wp-id="{{wpId}}"                 │ │
 │  │       data-endpoint="updateEmployee"                       │ │
 │  │       data-topic="selectedEmployee">                       │ │
 │  │      <hbwp-field data-name="Name"                          │ │
 │  │         data-default-value="{{incoming.Name}}" />          │ │
 │  │    </hbwp-smart-form>                                      │ │
 │  │                                                            │ │
 │  └────────────────────────────────────────────────────────────┘ │
 └─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Row Select → Form Pre-fill

1. **User clicks row** in HBWP Instance A
2. **HBWP A** fires **both**:
   - `this.context.dynamicDataSourceManager.notifyPropertyChanged('selectedItem')` ← SPFx path
   - `messageBus.publish({ topic: 'selectedEmployee', action: 'select', data: { item: row } })` ← MessageBus path
3. **HBWP B** receives via **both** (whichever is wired):
   - SPFx: `this.properties.incomingItem.tryGetValue()` → merges into template context as `{{incoming.*}}`
   - MessageBus: subscriber callback → merges into template context as `{{incoming.*}}`
4. **Template re-renders** → `<hbwp-smart-form>` `connectedCallback()` fires → reads `data-default-value="{{incoming.Name}}"` (already resolved by Handlebars)

### When to use which

| Scenario | Path |
|----------|------|
| Connect HBWP to a 3rd-party SPFx web part | SPFx Dynamic Data |
| Connect HBWP to another HBWP on the same page | Either — SPFx DD for property pane UX, MessageBus for template-driven config |
| Web component inside a template publishes data | MessageBus |
| Web component inside a template subscribes to data | MessageBus |
| Form component pre-fills from selected row | SPFx DD feeds template context → Handlebars resolves `{{incoming.*}}` into `data-default-value` |
| Form component submits and notifies table to refresh | MessageBus (form publishes `action: 'submit'`, table subscribes and re-fetches) |

---

## Web Part Property Pane Configuration

### New properties on `IHandlebarsListViewWebPartProps`

```typescript
// --- Multi-topic pub/sub ---
publishTopics?: IPublishTopicConfig[];
subscribeTopics?: ISubscribeTopicConfig[];

// --- SPFx Dynamic Data consumer ---
incomingItem: DynamicProperty<object>;
incomingItems: DynamicProperty<object[]>;

interface IPublishTopicConfig {
  topic: string;       // e.g. "selectedEmployee"
  action: string;      // e.g. "select", "filter"
  enabled: boolean;
}

interface ISubscribeTopicConfig {
  topic: string;       // e.g. "divisionSelected"
  contextKey: string;  // template namespace, e.g. "division" → {{division.*}}
  onReceive: string;   // "merge" | "filter" | "refresh"
  enabled: boolean;
}
```

### Property pane — "Dynamic Data" page (using PropertyFieldCollectionData)

```typescript
import { PropertyFieldCollectionData, CustomCollectionFieldType }
  from '@pnp/spfx-property-controls/lib/PropertyFieldCollectionData';

// Publish topics grid
PropertyFieldCollectionData('publishTopics', {
  key: 'publishTopics',
  label: 'Publish Topics',
  panelHeader: 'Configure outgoing topics',
  panelDescription: 'Each topic is a named channel. When the configured action occurs '
    + '(e.g. row click), the web part publishes data to all subscribers on that topic.',
  manageBtnLabel: 'Manage publish topics',
  fields: [
    { id: 'topic',   title: 'Topic Name', type: CustomCollectionFieldType.string,  required: true,
      placeholder: 'e.g. selectedEmployee' },
    { id: 'action',  title: 'Action',     type: CustomCollectionFieldType.dropdown, required: true,
      options: [
        { key: 'select',  text: 'Select (row click)' },
        { key: 'filter',  text: 'Filter' },
        { key: 'submit',  text: 'Submit' },
        { key: 'refresh', text: 'Refresh' },
      ] },
    { id: 'enabled', title: 'Enabled',    type: CustomCollectionFieldType.boolean, defaultValue: true },
  ],
  value: this.properties.publishTopics || [],
  enableSorting: true,
})

// Subscribe topics grid
PropertyFieldCollectionData('subscribeTopics', {
  key: 'subscribeTopics',
  label: 'Subscribe Topics',
  panelHeader: 'Configure incoming topics',
  panelDescription: 'Each subscription listens for messages on a topic and maps them '
    + 'to a template context key. For example, subscribing to "divisionSelected" with '
    + 'context key "division" makes {{division.ID}}, {{division.Title}} available in templates.',
  manageBtnLabel: 'Manage subscriptions',
  fields: [
    { id: 'topic',      title: 'Topic Name',  type: CustomCollectionFieldType.string,  required: true,
      placeholder: 'e.g. divisionSelected' },
    { id: 'contextKey', title: 'Context Key',  type: CustomCollectionFieldType.string,  required: true,
      defaultValue: 'incoming', placeholder: 'Template key (e.g. incoming, division)' },
    { id: 'onReceive',  title: 'On Receive',   type: CustomCollectionFieldType.dropdown, required: true,
      options: [
        { key: 'merge',   text: 'Merge into template context' },
        { key: 'filter',  text: 'Apply as CAML filter tokens' },
        { key: 'refresh', text: 'Refresh data only' },
      ] },
    { id: 'enabled', title: 'Enabled', type: CustomCollectionFieldType.boolean, defaultValue: true },
  ],
  value: this.properties.subscribeTopics || [],
  enableSorting: true,
})
```

### Stored configuration

```json
{
  "publishTopics": [
    { "topic": "selectedEmployee", "action": "select", "enabled": true }
  ],
  "subscribeTopics": [
    { "topic": "divisionSelected", "contextKey": "division", "onReceive": "filter", "enabled": true },
    { "topic": "employeeUpdated",  "contextKey": "incoming", "onReceive": "refresh", "enabled": true }
  ]
}
```

---

## Template Context Merge

Each subscription has its own `contextKey` that becomes a namespace in the template context. Multiple subscriptions write to different namespaces simultaneously:

```typescript
// In HandlebarsListView, when building templateData:
const templateData: ITemplateData = {
  rows: dataEnvelope.rows,
  paging: dataEnvelope.paging,
  user: this.props.userProfile,
  page: this.props.pageData,
  wpId: this.props.instanceId,
  // Each subscription's contextKey becomes a top-level key:
  // e.g. if subscribeTopics = [
  //   { topic: "divisionSelected", contextKey: "division", ... },
  //   { topic: "selectedEmployee", contextKey: "incoming", ... }
  // ]
  // then templateData gets:
  //   division: { ID: 3, Title: "Engineering" }
  //   incoming: { ID: 42, Title: "Jane Doe", ... }
  ...this.state.topicContexts   // Map<contextKey, data.item>
};
```

### State management for multi-topic

```typescript
// Component state holds a map of contextKey → last received data
interface IHandlebarsListViewState {
  html: string;
  visible: boolean;
  pagingToken?: string;
  pageHistory: string[];
  // NEW: keyed by subscription contextKey
  topicContexts: Record<string, Record<string, any>>;
}
```

When a message arrives, only the relevant contextKey is updated:

```typescript
private handleIncomingMessage = (envelope: IDataEnvelope, sub: ISubscribeTopicConfig): void => {
  switch (envelope.action) {
    case 'select':
    case 'filter':
    case 'submit': {
      // Merge data.item into the subscription's context key
      this.setState(prev => ({
        topicContexts: {
          ...prev.topicContexts,
          [sub.contextKey]: envelope.data.item || {}
        }
      }), () => this.fetchAndRender());
      break;
    }
    case 'refresh':
    case 'delete': {
      // Re-fetch only, no data merge
      this.debouncedRefresh();
      break;
    }
    case 'clear': {
      // Wipe this subscription's context and re-render
      this.setState(prev => {
        const updated = { ...prev.topicContexts };
        delete updated[sub.contextKey];
        return { topicContexts: updated };
      }, () => this.fetchAndRender());
      break;
    }
  }
};
```

### Debounced refresh (for rapid submit/delete actions)

When multiple `submit` or `refresh` messages arrive in rapid succession (e.g. user adding several items quickly via a form), we debounce the re-fetch to avoid hammering SharePoint:

```typescript
private _refreshTimer: number | undefined;

private debouncedRefresh = (): void => {
  clearTimeout(this._refreshTimer);
  this._refreshTimer = window.setTimeout(() => this.fetchAndRender(), 500);
};
```

5 rapid form submissions = 1 SharePoint query (500ms after the last one). By the time the debounce fires and the REST call completes (~1s total), SharePoint has updated rollup fields (item counts, calculated columns, etc.).

### Data shape by source

| Source | Template path | Shape | Example |
|--------|--------------|-------|---------|
| MessageBus (HBWP → HBWP) | `{{incoming.Author.Title}}` | **Nested** — original structure preserved | `{ Author: { Title: "Jane", Email: "jane@..." } }` |
| SPFx Dynamic Data (3rd-party → HBWP) | `{{incoming.Author_Title}}` | **Flat** — SPFx serialization flattens nested objects | `{ Author_Title: "Jane", Author_Email: "jane@..." }` |
| Web part's own list data | `{{rows.[0].Author.Title}}` | **Nested** — from `renderListDataAsStream` + lookup expansion | Same as MessageBus |

**We do not unflatten SPFx DD data.** It's ambiguous (`Author_Title` could be a real field name) and would introduce silent bugs. Template authors just use underscored keys for SPFx DD sources. Between HBWP instances, prefer MessageBus — you get the full nested structure.

---

## Template Examples

### Example 1: Detail / Edit Form (pre-fill from selected row)

**Setup:** HBWP A shows a table of employees. HBWP B shows a detail form. Connected via MessageBus topic `selectedEmployee`.

**HBWP A template** (the table — publishes on row click):
```handlebars
<table>
  <thead>
    <tr><th>Name</th><th>Department</th><th>Email</th></tr>
  </thead>
  <tbody>
    {{#each rows}}
    <tr data-hbwp-action="select"
        data-hbwp-topic="selectedEmployee"
        data-hbwp-item='{{json this}}'>
      <td>{{Title}}</td>
      <td>{{Department.Title}}</td>
      <td>{{Email}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
```

When the user clicks a row, HBWP fires both:
- `messageBus.publish({ topic: "selectedEmployee", action: "select", data: { item: { ID: 5, Title: "Jane Doe", Department: { Title: "Engineering", ID: 3 }, Email: "jane@..." } } })`
- `notifyPropertyChanged('selectedItem')` with flattened `{ ID: 5, Title: "Jane Doe", Department_Title: "Engineering", Department_ID: 3, Email: "jane@..." }`

**HBWP B template** (the detail form — receives `{{incoming}}`):
```handlebars
{{#if incoming.ID}}
  <h2>Editing: {{incoming.Title}}</h2>
  <hbwp-smart-form data-wp-id="{{wpId}}" data-endpoint="updateEmployee">
    <hbwp-field data-name="ID" data-type="hidden" data-default-value="{{incoming.ID}}" />
    <hbwp-field data-name="Title" data-type="text" data-label="Name"
                data-default-value="{{incoming.Title}}" data-required="true" />
    <hbwp-field data-name="Email" data-type="email" data-label="Email"
                data-default-value="{{incoming.Email}}" />
    <hbwp-field data-name="Department" data-type="select"
                data-options="Engineering|Marketing|Sales|HR"
                data-default-value="{{incoming.Department.Title}}" />
  </hbwp-smart-form>
{{else}}
  <div class="hbwp-placeholder">
    <p>Select an employee from the list to edit.</p>
  </div>
{{/if}}
```

> Note: `{{incoming.Department.Title}}` works because MessageBus preserves nesting. If this data came from SPFx DD (3rd-party web part), you'd use `{{incoming.Department_Title}}` instead.

---

### Example 2: Master-Detail with CAML Filter (pass ID to child query)

**Setup:** HBWP A shows a list of departments. HBWP B shows employees filtered by the selected department. Connected via MessageBus topic `selectedDepartment`.

**HBWP A template** (departments):
```handlebars
<ul class="department-list">
  {{#each rows}}
  <li data-hbwp-action="select"
      data-hbwp-topic="selectedDepartment"
      data-hbwp-item='{{json this}}'>
    {{Title}} ({{EmployeeCount}} employees)
  </li>
  {{/each}}
</ul>
```

**HBWP B configuration** (employees — filtered by incoming department):

In the property pane:
- **Subscribe Topic:** `selectedDepartment`
- **CAML Filter:** `<Eq><FieldRef Name='Department' LookupId='TRUE'/><Value Type='Lookup'>{{incoming.ID}}</Value></Eq>`

The token resolution pipeline already handles `{{user.*}}` and `{{page.*}}` tokens in CAML filters. We extend it to also resolve `{{incoming.*}}` tokens from the incoming data.

**How the flow works:**

```
1. User clicks "Engineering" (ID=3) in HBWP A
       │
2. MessageBus publishes:
   { topic: "selectedDepartment", action: "select",
     data: { item: { ID: 3, Title: "Engineering" } } }
       │
3. HBWP B receives message, sets state:
   this.state.incomingData = { item: { ID: 3, Title: "Engineering" } }
       │
4. HBWP B re-fetches list data. Token resolution runs on CAML filter:
   BEFORE: <Eq><FieldRef Name='Department' LookupId='TRUE'/>
                <Value Type='Lookup'>{{incoming.ID}}</Value></Eq>
   AFTER:  <Eq><FieldRef Name='Department' LookupId='TRUE'/>
                <Value Type='Lookup'>3</Value></Eq>
       │
5. SharePoint returns only employees in Engineering
       │
6. Template renders with filtered rows
```

**HBWP B template** (employees):
```handlebars
{{#if incoming.ID}}
  <h3>{{incoming.Title}} — Employees</h3>
  {{#if rows.length}}
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
    <tbody>
      {{#each rows}}
      <tr>
        <td>{{Title}}</td>
        <td>{{Email}}</td>
        <td>{{JobTitle}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{else}}
  <p>No employees in this department.</p>
  {{/if}}
{{else}}
  <div class="hbwp-placeholder">
    <p>Select a department to view its employees.</p>
  </div>
{{/if}}
```

---

### Example 3: Empty Incoming = No Rows (the guard pattern)

**The problem:** If no department is selected yet, `{{incoming.ID}}` resolves to an empty string. The CAML filter becomes `<Value Type='Lookup'></Value>`, which could return unpredictable results or errors.

**The solution — unresolved token guard:**

When the web part resolves CAML filter tokens and encounters an `{{incoming.*}}` token that resolves to `undefined` or empty string, it **skips the query entirely** and renders with zero rows. This is the safe default:

```typescript
// In HandlebarsListView, before fetching data:
function resolveIncomingTokens(camlFilter: string, incoming: Record<string, any>): string | null {
  let hasUnresolved = false;
  const resolved = camlFilter.replace(/\{\{incoming\.([^}]+)\}\}/g, (match, path) => {
    const value = resolveDotPath(incoming, path);
    if (value === undefined || value === null || value === '') {
      hasUnresolved = true;
      return '';
    }
    return String(value);
  });
  // If ANY incoming token was empty, return null → skip query, show 0 rows
  return hasUnresolved ? null : resolved;
}
```

**Template pattern for the "no selection yet" state:**

```handlebars
{{!-- incoming.ID is empty → query was skipped → rows is empty array --}}
{{#if incoming.ID}}
  {{!-- We have a selection and (possibly) data --}}
  {{#if rows.length}}
    {{!-- render the filtered data --}}
    <table>...</table>
  {{else}}
    <p>No matching records found.</p>
  {{/if}}
{{else}}
  {{!-- Nothing selected yet — show a prompt --}}
  <div class="hbwp-placeholder">
    <svg>...</svg>
    <p>Select an item from the connected web part to get started.</p>
  </div>
{{/if}}
```

**Decision tree:**

```
incoming.ID present?
  ├─ YES → resolve CAML tokens → fetch data → render rows
  │         └─ rows empty? → "No matching records"
  └─ NO  → skip query → rows = [] → render placeholder
```

---

### Example 4: Publishing filterContext (HBWP → 3rd-party consumer)

**Setup:** HBWP publishes its current filter state as an SPFx Dynamic Data property so other web parts can react to what the user is filtering.

**What gets published:**
```typescript
// getPropertyValue('filterContext') returns:
{
  siteUrl: "https://contoso.sharepoint.com/sites/hr",
  listId: "a1b2c3d4-...",
  viewId: "e5f6g7h8-...",
  camlFilter: "<Eq><FieldRef Name='Status'/><Value Type='Text'>Active</Value></Eq>",
  searchQuery: "engineering",
  rowCount: 42
}
```

A 3rd-party web part connected to this property via SPFx DD could use `filterContext.searchQuery` to synchronize its own search box, or use `filterContext.rowCount` to show a summary badge.

**When does HBWP notify?**
- User changes a CAML filter (via search box, dropdown, etc.)
- User navigates pages (rowCount updates)
- User clears a filter

```typescript
// In the web part, after filter changes:
this._filterContext = {
  siteUrl: this.properties.site,
  listId: this.properties.list,
  viewId: this.properties.view,
  camlFilter: resolvedCaml,
  searchQuery: searchText,
  rowCount: result.items.length
};
this.context.dynamicDataSourceManager.notifyPropertyChanged('filterContext');
```

---

### Example 5: Add Item Form + Table Refresh

**Setup:** Two HBWP instances on the same page. HBWP A shows a table of support tickets. HBWP B shows an "Add Ticket" form. When the form submits successfully, it tells HBWP A to refresh its data.

Connected via MessageBus topic `tickets`.

**How the `refresh` action works:**

When a web part receives an envelope with `action: 'refresh'`, it re-fetches its data from SharePoint without any other state change. No incoming data merge, no CAML changes — just "go get fresh data."

```typescript
// In HandlebarsListView, MessageBus subscriber:
private handleIncomingMessage = (envelope: IDataEnvelope): void => {
  switch (envelope.action) {
    case 'select':
    case 'update':
    case 'filter':
      // Merge incoming data into template context, then re-fetch/re-render
      this.setState({ incomingData: envelope.data }, () => this.fetchAndRender());
      break;

    case 'refresh':
      // No data merge — just re-fetch from SharePoint with current config
      this.fetchAndRender();
      break;

    case 'clear':
      // Clear incoming data and re-render
      this.setState({ incomingData: undefined }, () => this.fetchAndRender());
      break;

    default:
      break;
  }
};
```

**HBWP A template** (the ticket table):
```handlebars
<div class="ticket-list">
  <h2>Support Tickets</h2>
  {{#if rows.length}}
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Status</th>
        <th>Priority</th>
        <th>Assigned To</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      {{#each rows}}
      <tr class="ticket-row ticket-priority-{{Priority}}">
        <td>{{ID}}</td>
        <td>{{Title}}</td>
        <td><span class="status-badge status-{{lowercase Status}}">{{Status}}</span></td>
        <td>{{Priority}}</td>
        <td>{{AssignedTo.Title}}</td>
        <td>{{dateFormat Created "MM/DD/YYYY"}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{else}}
  <p>No tickets found.</p>
  {{/if}}
</div>
```

**HBWP A property pane config:**
- **List:** Support Tickets
- **Subscribe Topic:** `tickets`
- _(No publish topic needed — this instance only receives)_

---

**HBWP B template** (the add ticket form):
```handlebars
<div class="add-ticket-form">
  <hbwp-smart-form
    data-wp-id="{{wpId}}"
    data-endpoint="addTicket"
    data-title="New Support Ticket"
    data-success-message="Ticket created!"
    data-submit-label="Create Ticket"
    data-reset-on-success="true"
    data-topic="tickets"
    data-topic-action="refresh"
  >
    <hbwp-field data-name="Title" data-type="text" data-label="Title"
               data-required="true" data-placeholder="Brief description of the issue" />
    <hbwp-field data-name="Description" data-type="textarea" data-label="Description"
               data-placeholder="Provide details..." />
    <hbwp-field data-name="Priority" data-type="select" data-label="Priority"
               data-options="Low|Medium|High|Critical" data-default-value="Medium" />
    <hbwp-field data-name="Category" data-type="select" data-label="Category"
               data-options="Bug|Feature Request|Question|Access Issue" />
    <hbwp-field data-name="SubmittedBy" data-type="hidden"
               data-default-value="{{user.email}}" />
  </hbwp-smart-form>
</div>
```

**HBWP B property pane config:**
- **Submit Endpoint `addTicket`:** SharePoint list → Support Tickets
- **Publish Topic:** `tickets`
- _(No subscribe topic — this instance only sends)_

---

**The flow:**

```
1. User fills out the form in HBWP B and clicks "Create Ticket"
       │
2. SmartFormWebComponent calls:
   serviceContext.formSubmit.submit('addTicket', {
     Title: "Printer broken",
     Description: "3rd floor printer...",
     Priority: "High",
     Category: "Bug",
     SubmittedBy: "jane@contoso.com"
   })
       │
3. FormSubmitService creates the list item in SharePoint
       │
4. On success, SmartFormWebComponent publishes:
   messageBus.publish({
     topic: "tickets",
     source: wpInstanceId,
     timestamp: Date.now(),
     action: "refresh",         ← tells subscribers to re-fetch
     data: {
       item: { Title: "Printer broken", ... }  ← optional: the created item
     }
   })
       │
5. HBWP A receives the message. action === 'refresh'
   → calls fetchAndRender() → re-queries the Support Tickets list
   → new ticket appears in the table
       │
6. Form resets (data-reset-on-success="true") and shows
   "Ticket created!" briefly before returning to empty state
```

**How SmartFormWebComponent publishes on success:**

```typescript
// In SmartFormWebComponent, after successful submit:
const topic = this.getAttribute('data-topic');
const action = this.getAttribute('data-topic-action') || 'create';

if (topic && ctx.messageBus) {
  ctx.messageBus.publish({
    topic,
    source: ctx.instanceId,
    timestamp: Date.now(),
    action: action as IDataEnvelope['action'],
    data: {
      item: submittedFormData
    }
  });
}
```

The `data-topic-action` attribute controls the action verb. Defaults to `create`, but for refresh-only scenarios (where the subscriber doesn't need the created data), set `data-topic-action="refresh"`.

---

### Example 6: Bidirectional — Edit in Form, Refresh Table

Combining Examples 1 and 5: click a row in the table, edit it in the form, save, and the table refreshes.

**HBWP A** (table): publish `selectedTicket` on row click, subscribe to `tickets` for refresh  
**HBWP B** (form): subscribe to `selectedTicket` for pre-fill, publish `tickets` on save

**HBWP A property pane:**
- **Publish Topic:** `selectedTicket`
- **Subscribe Topic:** `tickets`

**HBWP B property pane:**
- **Subscribe Topic:** `selectedTicket`
- **Publish Topic:** `tickets`

**HBWP A template:**
```handlebars
<table>
  <thead><tr><th>ID</th><th>Title</th><th>Status</th></tr></thead>
  <tbody>
    {{#each rows}}
    <tr data-hbwp-action="select"
        data-hbwp-topic="selectedTicket"
        data-hbwp-item='{{json this}}'>
      <td>{{ID}}</td>
      <td>{{Title}}</td>
      <td>{{Status}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
```

**HBWP B template:**
```handlebars
{{#if incoming.ID}}
  <hbwp-smart-form
    data-wp-id="{{wpId}}"
    data-endpoint="updateTicket"
    data-title="Edit Ticket #{{incoming.ID}}"
    data-success-message="Ticket updated!"
    data-submit-label="Save Changes"
    data-topic="tickets"
    data-topic-action="refresh"
  >
    <hbwp-field data-name="ID" data-type="hidden" data-default-value="{{incoming.ID}}" />
    <hbwp-field data-name="Title" data-type="text" data-label="Title"
               data-default-value="{{incoming.Title}}" data-required="true" />
    <hbwp-field data-name="Status" data-type="select" data-label="Status"
               data-options="New|In Progress|Resolved|Closed"
               data-default-value="{{incoming.Status}}" />
    <hbwp-field data-name="Priority" data-type="select" data-label="Priority"
               data-options="Low|Medium|High|Critical"
               data-default-value="{{incoming.Priority}}" />
  </hbwp-smart-form>
{{else}}
  <p>Click a ticket in the table to edit it.</p>
{{/if}}
```

**The full loop:**

```
User clicks row in table (HBWP A)
  → publishes 'selectedTicket' action:'select' with item data
  → HBWP B receives, pre-fills form

User edits and clicks "Save Changes" (HBWP B)
  → FormSubmitService updates the list item
  → publishes 'tickets' action:'refresh'
  → HBWP A receives, re-fetches list data
  → table shows updated values
```

---

### Example 7: Four Web Parts — Division Filter → Employee Table → Form → Map

A realistic dashboard with 4 HBWP instances connected via multiple topics.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SharePoint Page                                                        │
│                                                                         │
│  ┌─ HBWP#2 (Division Filter) ─┐   ┌─ HBWP#1 (Employee Table) ───────┐│
│  │                             │   │                                   ││
│  │  Pub: divisionSelected      │──→│  Sub: divisionSelected            ││
│  │       action: filter        │   │       contextKey: division        ││
│  │                             │   │       onReceive: filter           ││
│  │  Lists all divisions.       │   │                                   ││
│  │  Click one → publishes      │   │  Sub: employeeUpdated             ││
│  │  { ID, Title }              │   │       onReceive: refresh          ││
│  │                             │   │                                   ││
│  └─────────────────────────────┘   │  Pub: selectedEmployee            ││
│                                    │       action: select              ││
│                                    │                                   ││
│                                    │  CAML Filter:                     ││
│                                    │  <Eq>                             ││
│                                    │    <FieldRef Name='Division'      ││
│                                    │       LookupId='TRUE'/>           ││
│                                    │    <Value Type='Lookup'>          ││
│                                    │      {{division.ID}}              ││
│                                    │    </Value>                       ││
│                                    │  </Eq>                            ││
│                                    └───────────────┬───────────────────┘│
│                                                    │ selectedEmployee   │
│                            ┌───────────────────────┼───────────────────┐│
│                            ▼                       ▼                   ││
│  ┌─ HBWP#3 (Add/Edit Form) ──────┐  ┌─ HBWP#4 (Map) ──────────────┐ ││
│  │                                │  │                               │ ││
│  │  Sub: divisionSelected         │  │  Sub: selectedEmployee        │ ││
│  │       contextKey: division     │  │       contextKey: incoming    │ ││
│  │       onReceive: merge         │  │       onReceive: merge        │ ││
│  │                                │  │                               │ ││
│  │  Sub: selectedEmployee         │  │  Displays office location     │ ││
│  │       contextKey: incoming     │  │  from {{incoming.Office}}     │ ││
│  │       onReceive: merge         │  │                               │ ││
│  │                                │  └───────────────────────────────┘ ││
│  │  Pub: employeeUpdated          │                                    │
│  │       action: submit           │                                    │
│  │                                │                                    │
│  └────────────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

#### HBWP#2 — Division Filter

**Property pane:**
- **List:** Divisions
- **Publish topics:** `[{ topic: "divisionSelected", action: "filter", enabled: true }]`
- **Subscribe topics:** _(none)_

**Template:**
```handlebars
<h3>Divisions</h3>
<ul class="division-filter">
  {{#each rows}}
  <li data-hbwp-action="filter"
      data-hbwp-topic="divisionSelected"
      data-hbwp-item='{{json this}}'>
    {{Title}}
  </li>
  {{/each}}
</ul>
<button data-hbwp-action="clear"
        data-hbwp-topic="divisionSelected">
  Show All
</button>
```

#### HBWP#1 — Employee Table

**Property pane:**
- **List:** Employees
- **CAML Filter:** `<Eq><FieldRef Name='Division' LookupId='TRUE'/><Value Type='Lookup'>{{division.ID}}</Value></Eq>`
- **Publish topics:** `[{ topic: "selectedEmployee", action: "select", enabled: true }]`
- **Subscribe topics:**
  ```json
  [
    { "topic": "divisionSelected", "contextKey": "division", "onReceive": "filter", "enabled": true },
    { "topic": "employeeUpdated",  "contextKey": "_refresh",  "onReceive": "refresh", "enabled": true }
  ]
  ```

**Template:**
```handlebars
{{#if division.ID}}
  <h3>Employees — {{division.Title}}</h3>
  {{#if rows.length}}
  <table>
    <thead>
      <tr><th>Name</th><th>Email</th><th>Office</th><th>Title</th></tr>
    </thead>
    <tbody>
      {{#each rows}}
      <tr data-hbwp-action="select"
          data-hbwp-topic="selectedEmployee"
          data-hbwp-item='{{json this}}'>
        <td>{{Title}}</td>
        <td>{{Email}}</td>
        <td>{{Office}}</td>
        <td>{{JobTitle}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{else}}
  <p>No employees in this division.</p>
  {{/if}}
{{else}}
  <p>Select a division to view employees.</p>
{{/if}}
```

#### HBWP#3 — Add / Edit Employee Form

**Property pane:**
- **Submit Endpoint `addEmployee`:** SharePoint list → Employees
- **Publish topics:** `[{ topic: "employeeUpdated", action: "submit", enabled: true }]`
- **Subscribe topics:**
  ```json
  [
    { "topic": "divisionSelected", "contextKey": "division", "onReceive": "merge", "enabled": true },
    { "topic": "selectedEmployee", "contextKey": "incoming",  "onReceive": "merge", "enabled": true }
  ]
  ```

**Template:**
```handlebars
{{#if division.ID}}
  <hbwp-smart-form data-wp-id="{{wpId}}"
      data-endpoint="addEmployee"
      data-title="{{#if incoming.ID}}Edit Employee{{else}}Add Employee{{/if}}"
      data-success-message="Employee saved!"
      data-submit-label="{{#if incoming.ID}}Save Changes{{else}}Add Employee{{/if}}"
      data-reset-on-success="true"
      data-topic="employeeUpdated"
      data-topic-action="submit">
    {{!-- Hidden ID: present = update, absent = create --}}
    {{#if incoming.ID}}
    <hbwp-field data-name="ID" data-type="hidden" data-default-value="{{incoming.ID}}" />
    {{/if}}
    <hbwp-field data-name="Title" data-type="text" data-label="Full Name"
               data-default-value="{{incoming.Title}}" data-required="true" />
    <hbwp-field data-name="Email" data-type="email" data-label="Email"
               data-default-value="{{incoming.Email}}" data-required="true" />
    <hbwp-field data-name="JobTitle" data-type="text" data-label="Job Title"
               data-default-value="{{incoming.JobTitle}}" />
    <hbwp-field data-name="Office" data-type="text" data-label="Office Location"
               data-default-value="{{incoming.Office}}" />
    {{!-- Division is set from the filter — read-only in the form --}}
    <hbwp-field data-name="DivisionId" data-type="hidden"
               data-default-value="{{division.ID}}" />
    <hbwp-field data-name="_DivisionDisplay" data-type="text" data-label="Division"
               data-default-value="{{division.Title}}" data-disabled="true" />
  </hbwp-smart-form>
{{else}}
  <p>Select a division first.</p>
{{/if}}
```

#### HBWP#4 — Office Map

**Property pane:**
- **Subscribe topics:** `[{ topic: "selectedEmployee", contextKey: "incoming", onReceive: "merge", enabled: true }]`
- **Publish topics:** _(none)_

**Template:**
```handlebars
{{#if incoming.Office}}
  <div class="office-map">
    <h3>{{incoming.Title}} — {{incoming.Office}}</h3>
    <img src="https://maps.example.com/static?q={{urlencode incoming.Office}}&size=400x300"
         alt="Map of {{incoming.Office}}" />
    <dl>
      <dt>Email</dt><dd>{{incoming.Email}}</dd>
      <dt>Job Title</dt><dd>{{incoming.JobTitle}}</dd>
      <dt>Division</dt><dd>{{incoming.Division.Title}}</dd>
    </dl>
  </div>
{{else}}
  <p>Select an employee to see their office location.</p>
{{/if}}
```

#### The full flow

```
1. User clicks "Engineering" in HBWP#2 (Division Filter)
   → publishes 'divisionSelected' action:'filter' data.item: { ID: 3, Title: "Engineering" }

2. HBWP#1 (Table) receives 'divisionSelected'
   → sets state.topicContexts.division = { ID: 3, Title: "Engineering" }
   → resolves CAML: {{division.ID}} → 3
   → fetches employees where Division=3
   → renders table

3. HBWP#3 (Form) receives 'divisionSelected'
   → sets state.topicContexts.division = { ID: 3, Title: "Engineering" }
   → re-renders: DivisionId hidden field = 3, Division display = "Engineering"
   → form is now enabled (division.ID is truthy)

4. User clicks "Jane Doe" row in HBWP#1
   → publishes 'selectedEmployee' action:'select' data.item: { ID: 42, Title: "Jane Doe", ... }

5. HBWP#3 (Form) receives 'selectedEmployee'
   → sets state.topicContexts.incoming = { ID: 42, Title: "Jane Doe", ... }
   → re-renders: form title = "Edit Employee", fields pre-filled

6. HBWP#4 (Map) receives 'selectedEmployee'
   → sets state.topicContexts.incoming = { ID: 42, ..., Office: "Building 7, Floor 3" }
   → renders map for "Building 7, Floor 3"

7. User edits Jane's job title in HBWP#3 and clicks "Save Changes"
   → FormSubmitService updates list item
   → publishes 'employeeUpdated' action:'submit'

8. HBWP#1 (Table) receives 'employeeUpdated'
   → onReceive: 'refresh' → debouncedRefresh()
   → re-fetches employee list → table shows updated job title
```

---

### Example 8: One-to-Many — Projects → Tasks with Rollup Count

**Setup:** HBWP#1 shows projects with a `TaskCount` calculated column. HBWP#2 shows tasks for the selected project and allows adding new tasks. Adding a task should refresh the project table so the count updates.

**HBWP#1** (Projects):
- **List:** Projects
- **Publish topics:** `[{ topic: "selectedProject", action: "select", enabled: true }]`
- **Subscribe topics:** `[{ topic: "taskUpdated", contextKey: "_refresh", onReceive: "refresh", enabled: true }]`

**Template:**
```handlebars
<table>
  <thead><tr><th>Project</th><th>Status</th><th>Tasks</th></tr></thead>
  <tbody>
    {{#each rows}}
    <tr data-hbwp-action="select"
        data-hbwp-topic="selectedProject"
        data-hbwp-item='{{json this}}'>
      <td>{{Title}}</td>
      <td>{{Status}}</td>
      <td>{{TaskCount}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
```

**HBWP#2** (Tasks + Add Form):
- **List:** Tasks
- **CAML Filter:** `<Eq><FieldRef Name='Project' LookupId='TRUE'/><Value Type='Lookup'>{{incoming.ID}}</Value></Eq>`
- **Subscribe topics:** `[{ topic: "selectedProject", contextKey: "incoming", onReceive: "filter", enabled: true }]`
- **Publish topics:** `[{ topic: "taskUpdated", action: "submit", enabled: true }]`
- **Submit endpoint `addTask`:** SharePoint list → Tasks

**Template:**
```handlebars
{{#if incoming.ID}}
  <h3>Tasks for {{incoming.Title}}</h3>

  {{#if rows.length}}
  <table>
    <thead><tr><th>Task</th><th>Status</th><th>Assigned</th></tr></thead>
    <tbody>
      {{#each rows}}
      <tr>
        <td>{{Title}}</td>
        <td>{{Status}}</td>
        <td>{{AssignedTo.Title}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{else}}
  <p>No tasks yet.</p>
  {{/if}}

  <hr />
  <hbwp-smart-form data-wp-id="{{wpId}}"
      data-endpoint="addTask"
      data-title="Add Task"
      data-submit-label="Add"
      data-reset-on-success="true"
      data-topic="taskUpdated"
      data-topic-action="submit">
    <hbwp-field data-name="Title" data-type="text" data-label="Task Name"
               data-required="true" />
    <hbwp-field data-name="Status" data-type="select" data-label="Status"
               data-options="Not Started|In Progress|Complete"
               data-default-value="Not Started" />
    <hbwp-field data-name="ProjectId" data-type="hidden"
               data-default-value="{{incoming.ID}}" />
  </hbwp-smart-form>
{{else}}
  <p>Select a project to view and add tasks.</p>
{{/if}}
```

**The rapid-add flow:**
```
1. User selects "Website Redesign" (TaskCount: 3) in HBWP#1
   → publishes 'selectedProject' with { ID: 7, Title: "Website Redesign", TaskCount: 3 }

2. HBWP#2 receives, filters tasks by ProjectId=7, renders task list + add form

3. User adds 3 tasks in quick succession:
   → submit #1 → publishes 'taskUpdated'  ─┐
   → submit #2 → publishes 'taskUpdated'   ├─ debounced to 1 refresh
   → submit #3 → publishes 'taskUpdated'  ─┘

4. HBWP#1 receives all 3 'taskUpdated' messages
   → debounce timer resets each time
   → 500ms after the last submit, fires ONE re-fetch
   → SharePoint returns TaskCount: 6
   → table shows updated count

5. HBWP#2 also self-refreshes after each submit
   (its own form publishes 'taskUpdated' which it also subscribes to via 'refresh')
   → or simply re-fetches after each form submit internally
```

> **Rollup field timing:** SharePoint computed columns (like lookup count) update within milliseconds of the item creation. The 500ms debounce + REST round-trip (~500ms) gives > 1 second of buffer — more than enough for the count to be correct.

---

## Implementation Plan

### Phase 1: MessageBus (spfx-extensibility)
1. Create `IDataEnvelope` and `IMessageBus` interfaces in `src/models/IDataEnvelope.ts`
2. Implement `MessageBus` singleton class in `src/MessageBus.ts`
3. Add `messageBus?: IMessageBus` to `IServiceContext`
4. Export from index

### Phase 2: SPFx Dynamic Data Source (spfx-hbwp)
5. Web part implements `IDynamicDataCallables`
6. `getPropertyDefinitions()` → selectedItem, selectedItems, filterContext
7. `getPropertyValue()` → returns flat objects from internal state
8. Row click / selection change → `notifyPropertyChanged()` + `messageBus.publish()`
9. Flatten nested lookup fields before publishing via SPFx DD

### Phase 3: SPFx Dynamic Data Consumer (spfx-hbwp)
10. Add `DynamicProperty<object>` and `DynamicProperty<object[]>` to web part props
11. Add `propertiesMetadata` with `dynamicPropertyType`
12. Add `PropertyPaneDynamicFieldSet` to property pane
13. Register callback on DynamicProperty → triggers re-render with incoming data

### Phase 4: Multi-Topic MessageBus Integration (spfx-hbwp)
14. Add `publishTopics` / `subscribeTopics` (array) to web part properties
15. Add `PropertyFieldCollectionData` grids for pub/sub topic config
16. Add `topicContexts: Record<string, Record<string, any>>` to component state
17. Subscribe to all enabled topics in `componentDidMount`, unsubscribe in `componentWillUnmount`
18. Message handler: `select`/`filter` → merge into contextKey + fetchAndRender, `submit`/`refresh`/`delete` → debouncedRefresh, `clear` → wipe contextKey
19. Resolve `{{contextKey.*}}` tokens in CAML filter for `onReceive: 'filter'` subscriptions
20. Publish on `data-hbwp-action` click events (delegated handler reads `data-hbwp-topic` + `data-hbwp-item`)
21. Register MessageBus instance on ServiceContext

### Phase 5: Web Component Integration (spfx-hbwp-forms)
22. SmartFormWebComponent reads `data-topic` and `data-topic-action` attributes
23. On successful form submit, publishes envelope to topic via messageBus
24. Build and verify all three projects

---

## Design Decisions

### Why both paths instead of just one?

| Just SPFx DD | Just MessageBus | Both (chosen) |
|-------------|----------------|---------------|
| ✅ Standard UX | ✅ Reaches web components | ✅ Standard UX for WP↔WP |
| ✅ Works with 3rd-party WPs | ❌ No 3rd-party interop | ✅ Works with 3rd-party WPs |
| ❌ Can't reach web components | ✅ Template-driven config | ✅ Reaches web components |
| ❌ Only flat objects | ✅ Rich envelopes | ✅ Rich envelopes internally |
| ❌ No action semantics | ✅ select/submit/delete/filter/refresh/clear | ✅ Full action vocabulary |

### Flattening strategy for SPFx DD

SharePoint lookup fields come back as nested objects (`Author: { Title, Email }`). SPFx DD requires flat objects. We flatten with underscore separator:

```typescript
function flattenForDynamicData(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        result[`${key}_${subKey}`] = subValue;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

### MessageBus `lastMessage()` — solving the timing problem

If Web Part B mounts after A already published a selection, B would miss it. `lastMessage(topic)` lets B read the last published value on mount:

```typescript
// In HandlebarsListView componentDidMount, for each enabled subscription:
for (const sub of enabledSubscriptions) {
  const last = messageBus.lastMessage(sub.topic);
  if (last) {
    this.handleIncomingMessage(last, sub);
  }
  this._unsubscribers.push(
    messageBus.subscribe(sub.topic, (env) => this.handleIncomingMessage(env, sub))
  );
}
```

### Why not use SPFx Dynamic Data for everything?

The `DynamicProperty` + `PropertyPaneDynamicFieldSet` pattern requires **property pane configuration** by an end user. For template-driven scenarios (a template author wires `data-topic="orders"` on a web component), there's no property pane involved — the template IS the configuration. MessageBus serves this template-driven use case.

---

## File Changes Summary

| Project | File | Change |
|---------|------|--------|
| spfx-extensibility | `src/models/IDataEnvelope.ts` | NEW — `IDataEnvelope`, `IMessageBus`, action type |
| spfx-extensibility | `src/MessageBus.ts` | NEW — singleton pub/sub with `lastMessage()` |
| spfx-extensibility | `src/models/IServiceContext.ts` | ADD `messageBus?: IMessageBus` |
| spfx-extensibility | `src/index.ts` | ADD exports |
| spfx-hbwp | `HandlebarsListViewWebPart.ts` | IMPL `IDynamicDataCallables`, add `DynamicProperty` consumer props, add `PropertyFieldCollectionData` for multi-topic pub/sub config, add `propertiesMetadata` |
| spfx-hbwp | `IHandlebarsListViewProps.ts` | ADD `publishTopics`, `subscribeTopics`, `topicContexts` |
| spfx-hbwp | `HandlebarsListView.tsx` | Multi-topic subscribe/unsubscribe, `handleIncomingMessage` with action switch, `debouncedRefresh`, `topicContexts` state merge into template data, `data-hbwp-*` click handler publish, resolve `{{contextKey.*}}` tokens in CAML |
| spfx-hbwp-forms | `SmartFormWebComponent.tsx` | READ `data-topic` + `data-topic-action`, publish on submit via messageBus |
