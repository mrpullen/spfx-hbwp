# Paging

## Overview

The web part supports server-side paging using SharePoint's `renderListDataAsStream` paging tokens. When a view has a row limit, the web part fetches one page at a time and provides paging metadata to your Handlebars template so you can render navigation controls.

## Template Data

Inside your template, `items.paging` contains the following properties:

| Property     | Type    | Description                                           |
| ------------ | ------- | ----------------------------------------------------- |
| `hasNext`    | boolean | `true` if there is a next page                        |
| `hasPrev`    | boolean | `true` if there is a previous page (history-based)    |
| `pageNumber` | number  | Current page number (1-based)                         |
| `firstRow`   | number  | 1-based index of the first row on the current page    |
| `lastRow`    | number  | 1-based index of the last row on the current page     |
| `rowLimit`   | number  | Maximum rows per page (from the view's row limit)     |
| `nextHref`   | string  | Raw paging token for the next page (internal use)     |
| `prevHref`   | string  | Raw paging token for the previous page (internal use) |

## Using the `hbwp-paging` Helper

The simplest way to add paging is the built-in `hbwp-paging` helper:

```handlebars
{{#each items.rows}}
  <div>{{Title}}</div>
{{/each}}

{{hbwp-paging items.paging}}
```

The helper renders a `<nav>` element with previous/next buttons, a page indicator, and a row range display. Buttons are automatically disabled when there is no previous or next page.

### Options

| Parameter | Default   | Description                          |
| --------- | --------- | ------------------------------------ |
| `label`   | `"items"` | Label shown in the range display     |

```handlebars
{{hbwp-paging items.paging label="ideas"}}
```

Renders: `1 – 30 ideas`

## Custom Paging Controls

If you need full control over the paging UI, use `data-hbwp-page` attributes on any clickable element:

```handlebars
{{#if items.paging.hasPrev}}
  <button data-hbwp-page="prev">← Previous</button>
{{/if}}

<span>Page {{items.paging.pageNumber}}</span>

{{#if items.paging.hasNext}}
  <button data-hbwp-page="next">Next →</button>
{{/if}}
```

The web part's click delegation detects `data-hbwp-page="next"` and `data-hbwp-page="prev"` and triggers navigation automatically.

## Styling

The `hbwp-paging` helper outputs these CSS classes for styling:

| Class                | Element                              |
| -------------------- | ------------------------------------ |
| `.hbwp-paging`       | Outer `<nav>` container              |
| `.hbwp-paging-controls` | Flex container for buttons + page |
| `.hbwp-paging-btn`   | Previous and next buttons            |
| `.hbwp-paging-prev`  | Previous button specifically         |
| `.hbwp-paging-next`  | Next button specifically             |
| `.hbwp-paging-page`  | Page number indicator                |
| `.hbwp-paging-info`  | Row range display                    |
| `.hbwp-paging-range` | Range text span                      |

Example custom styles in your template:

```handlebars
<style>
.hbwp-paging {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 0;
}
.hbwp-paging-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hbwp-paging-btn {
  background: none;
  border: 1px solid var(--ms-palette-neutralTertiaryAlt, #c8c6c4);
  border-radius: 2px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--ms-palette-neutralPrimary, #323130);
}
.hbwp-paging-btn:hover:not(:disabled) {
  background: var(--ms-palette-neutralLighter, #f3f2f1);
}
.hbwp-paging-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.hbwp-paging-page {
  font-size: 14px;
  color: var(--ms-palette-neutralPrimary, #323130);
}
.hbwp-paging-info {
  font-size: 12px;
  color: var(--ms-palette-neutralSecondary, #605e5c);
}
</style>
```

## How It Works

1. The view's row limit determines page size.
2. `ListDataService.fetchFromSharePoint()` passes a `Paging` token to `renderListDataAsStream` to request the correct page.
3. SharePoint returns `NextHref` / `PrevHref` in the response, which are stored as paging hrefs.
4. The component maintains a `pageHistory` stack — clicking "next" pushes the current token onto the stack, clicking "prev" pops it.
5. When the list, view, or site changes, paging resets to page 1.

## Notes

- Paging is server-side; only the current page's rows are fetched.
- The `hasPrev` flag is based on the component's navigation history, not SharePoint's `PrevHref`, to ensure reliable back-navigation.
- CSS classes rendered by the helper are subject to auto-scoping when CSS scoping is enabled (e.g. `.hbwp-paging` becomes `.hbwp-paging-{wpId}`). Use the scoped class names in your `<style>` blocks for them to be scoped automatically.
