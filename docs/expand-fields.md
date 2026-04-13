# Expand Lookup Fields

## Overview

By default, SharePoint list queries only return the ID values for lookup and person/group fields. The **Expand Lookup Fields** option lets you retrieve the full details (e.g. display name, email, department) for these field types so they are available in your Handlebars template.

## Supported Field Types

The expand field picker filters to columns of these types:

- **Lookup**
- **LookupMulti**
- **User**
- **UserMulti**

## How to Configure

### Primary List

1. Open the web part property pane.
2. Select a site, list, and view.
3. In the **Expand Lookup Fields** multi-select dropdown, choose the lookup or person fields you want expanded.

### Additional Data Sources

Each additional data source has its own **Expand Lookup Fields** picker. The picker is disabled until a list is selected for that data source.

## How It Works

1. **Property pane** — The selected fields are stored as a comma-separated string of internal field names (e.g. `"Author,Editor,AssignedTo"`).

2. **Query execution** — When fetching data, `ListDataService` splits the string and passes each field name to PnP JS's `getItemsByCAMLQuery()` as expand parameters:

   ```typescript
   const items = await list.getItemsByCAMLQuery(
     { ViewXml: viewXml },
     ...expands   // e.g. "Author", "Editor", "AssignedTo"
   );
   ```

   For document libraries, `File` is automatically included in the expand list.

3. **Template access** — Expanded fields become nested objects on each item. For example, expanding `Author` gives you:

   ```handlebars
   {{Author.Title}}
   {{Author.EMail}}
   ```

   For multi-value lookups, iterate the array:

   ```handlebars
   {{#each AssignedTo}}
     {{this.Title}}
   {{/each}}
   ```

## Caching

Expand fields are included in the cache key. This means:

- Changing which fields are expanded produces a separate cache entry.
- You don't need to manually clear cache after changing expand fields — the new configuration will fetch fresh data automatically.

## Common Expanded Properties

| Field Type | Useful Properties |
|---|---|
| User / Person | `Title`, `EMail`, `Id`, `Department`, `JobTitle` |
| Lookup | `Title`, `Id`, plus any projected columns |

## Example

**Scenario:** A list has an `AssignedTo` (User) column and a `Category` (Lookup) column.

1. Select both in **Expand Lookup Fields**.
2. In your Handlebars template:

```handlebars
<div class="card">
  <h3>{{Title}}</h3>
  <p>Assigned to: {{AssignedTo.Title}} ({{AssignedTo.EMail}})</p>
  <p>Category: {{Category.Title}}</p>
</div>
```

Without expanding, `AssignedTo` and `Category` would only contain ID values.
