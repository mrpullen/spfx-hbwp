# Handlebars Helpers Reference

Complete reference for all custom Handlebars helpers registered by the Handlebars List View Web Part. These are available in addition to the 180+ helpers from [handlebars-helpers](https://github.com/helpers/handlebars-helpers).

---

## Table of Contents

- [Data Helpers](#data-helpers)
  - [json](#json)
  - [filter](#filter)
  - [shuffle](#shuffle)
  - [toInt](#toint)
  - [mod](#mod)
  - [percentage](#percentage)
  - [substring](#substring)
  - [concat](#concat)
- [UI Helpers](#ui-helpers)
  - [starRating](#starrating)
  - [likeButton](#likebutton)
  - [hbwp-paging](#hbwp-paging)
- [Form Helpers](#form-helpers)
  - [hbwp-form](#hbwp-form)
  - [hbwp-input](#hbwp-input)
  - [hbwp-textarea](#hbwp-textarea)
  - [hbwp-select](#hbwp-select)
  - [hbwp-checkbox](#hbwp-checkbox)
  - [hbwp-hidden](#hbwp-hidden)
  - [hbwp-submit](#hbwp-submit)

---

## Data Helpers

### json

Output any data as pretty-printed JSON. Useful for debugging template data.

**Usage:**
```handlebars
<pre>{{json items}}</pre>
<pre>{{json user}}</pre>
```

**Output:** Formatted JSON string with 2-space indentation.

---

### filter

Filter an array by a property value. Handles SharePoint lookup fields (objects with `Id` and `Title`) automatically.

**Inline usage** (returns filtered array):
```handlebars
{{#each (filter items.rows "Status" "Active")}}
  <p>{{this.Title}}</p>
{{/each}}
```

**Block usage** (conditional rendering):
```handlebars
{{#filter items.rows "Category" "News"}}
  <p>There are news items</p>
{{else}}
  <p>No news items found</p>
{{/filter}}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `array` | Array | The array to filter |
| `property` | String | Property name to match against |
| `value` | Any | Value to match (compared as string, or matched against lookup `.Id` / `.Title`) |

---

### shuffle

Randomize array order using the Fisher-Yates algorithm. Returns a new array (does not mutate the original).

**Usage:**
```handlebars
{{#each (shuffle items.rows)}}
  <div>{{this.Title}}</div>
{{/each}}
```

---

### toInt

Parse a value to an integer. Returns `0` if the value is not a valid number.

**Usage:**
```handlebars
{{toInt "42"}}           {{!-- → 42 --}}
{{toInt ID}}             {{!-- → numeric ID --}}
{{toInt "not a number"}} {{!-- → 0 --}}
```

---

### mod

Modulo (remainder) operation. Returns `a % b`. Both values are parsed as integers.

**Usage:**
```handlebars
{{mod 7 3}}              {{!-- → 1 --}}
{{mod (toInt ID) 5}}     {{!-- → ID mod 5 --}}
```

**Tip:** Combine with `toInt` and `add` for deterministic pseudo-random values:
```handlebars
{{add (mod (toInt ID) 5) 1}}  {{!-- → 1-5 based on item ID --}}
```

---

### percentage

Calculate a percentage as a rounded integer.

**Usage:**
```handlebars
{{percentage 30 120}}    {{!-- → 25 --}}
{{percentage votes totalVotes}}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `count` | Number | The numerator |
| `total` | Number | The denominator (returns 0 if 0) |

---

### substring

Extract a portion of a string.

**Usage:**
```handlebars
{{substring Title 0 1}}     {{!-- → First character (for initials) --}}
{{substring Description 0 100}}  {{!-- → First 100 chars --}}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `str` | String | Input string |
| `start` | Number | Start index (0-based) |
| `end` | Number | (Optional) End index |

---

### concat

Concatenate multiple values into a single string.

**Usage:**
```handlebars
{{concat "ID-" item.Id}}             {{!-- → "ID-123" --}}
{{concat user.FirstName " " user.LastName}}  {{!-- → "John Doe" --}}
```

**Note:** Accepts any number of arguments. The last argument (Handlebars options) is automatically excluded.

---

## UI Helpers

### starRating

Render a star rating display (★★★★☆). Supports full and half stars.

**Usage:**
```handlebars
{{starRating 4}}                          {{!-- → ★★★★☆ --}}
{{starRating 3.5}}                        {{!-- → ★★★⯪☆ --}}
{{starRating (add (mod (toInt ID) 5) 1)}} {{!-- → Deterministic 1-5 rating --}}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `rating` | Number | Rating value (0-5). Decimals ≥ 0.5 render a half star. |

**Output:** HTML `<span>` elements with filled stars (gold #ffb900) and empty stars (gray #d2d0ce).

---

### likeButton

Render an interactive like/unlike toggle button matching the OOTB SharePoint heart style. Clicking triggers an API call via the SocialDataService.

**Usage:**
```handlebars
{{likeButton ID LikesCount LikedBy ../user.id}}
{{likeButton ID LikesCount LikedBy ../user.id color="#e3008c"}}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `itemId` | Any | The list item ID |
| `likesCount` | Number | Current number of likes |
| `likedByArray` | Array | Array of users who liked the item (objects with `Id` or `id`) |
| `userId` | Any | Current user's ID (to determine liked state) |

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `color` | `var(--ms-palette-neutralPrimary)` | Color for the filled heart |

**Behavior:** Optimistic UI — the heart fills/unfills immediately on click, count updates, then the API call fires in the background.

---

### hbwp-paging

Render previous/next page navigation controls. Works with the `items.paging` metadata from `renderListDataAsStream`.

**Usage:**
```handlebars
{{hbwp-paging items.paging}}
{{hbwp-paging items.paging label="people"}}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `paging` | Object | The paging metadata object (from `items.paging`) |

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `label` | `"items"` | Label shown in range display (e.g. "1 – 30 people") |

**Paging object properties:**
| Property | Type | Description |
|----------|------|-------------|
| `hasNext` | Boolean | Whether a next page exists |
| `hasPrev` | Boolean | Whether a previous page exists |
| `pageNumber` | Number | Current page number |
| `firstRow` | Number | First row index on this page |
| `lastRow` | Number | Last row index on this page |

**Output:** A `<nav>` element with styled prev/next buttons using `data-hbwp-page` attributes. Returns empty string if only one page exists. Buttons are auto-disabled when at the first/last page.

---

## Form Helpers

All form helpers render [Fluent UI Web Components](https://docs.microsoft.com/en-us/fluent-ui/web-components/) and work with the delegated form submission system.

### hbwp-form

Block helper that wraps form content in a `<form>` element bound to a submit endpoint. Includes an auto-managed `[data-hbwp-result]` div for inline success/error messages.

**Usage:**
```handlebars
{{#hbwp-form endpoint="submitFeedback" class="my-form" id="feedback-form"}}
  {{hbwp-input name="Title" label="Subject" required=true}}
  {{hbwp-submit label="Send"}}
{{/hbwp-form}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `endpoint` | `"default"` | Submit endpoint key (configured in property pane) |
| `reset` | `true` | Reset form fields on successful submission |
| `class` | `""` | CSS class for the form element |
| `id` | `""` | HTML id for the form element |

---

### hbwp-input

Render a Fluent UI text field.

**Usage:**
```handlebars
{{hbwp-input name="Email" label="Email Address" type="email" required=true}}
{{hbwp-input name="Phone" label="Phone" pattern="[0-9]{3}-[0-9]{4}" placeholder="555-1234"}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `name` | `""` | Field name (maps to list column or JSON key) |
| `label` | `""` | Display label |
| `type` | `"text"` | Input type (`text`, `email`, `number`, `tel`, etc.) |
| `required` | `false` | Whether the field is required |
| `placeholder` | `""` | Placeholder text |
| `value` | `""` | Default value |
| `pattern` | — | Validation regex pattern |
| `minlength` | — | Minimum character length |
| `maxlength` | — | Maximum character length |

---

### hbwp-textarea

Render a Fluent UI multiline text area.

**Usage:**
```handlebars
{{hbwp-textarea name="Description" label="Details" rows=5 required=true placeholder="Describe..."}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `name` | `""` | Field name |
| `label` | `""` | Display label |
| `required` | `false` | Required field |
| `rows` | `3` | Number of visible rows |
| `placeholder` | `""` | Placeholder text |

---

### hbwp-select

Block helper that renders a Fluent UI dropdown. Options are provided as the block content.

**Usage:**
```handlebars
{{#hbwp-select name="Category" label="Category" required=true}}
  <fluent-option value="">-- Select --</fluent-option>
  <fluent-option value="Bug">Bug</fluent-option>
  <fluent-option value="Feature">Feature Request</fluent-option>
{{/hbwp-select}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `name` | `""` | Field name |
| `label` | `""` | Display label |
| `required` | `false` | Required field |

---

### hbwp-checkbox

Render a Fluent UI checkbox.

**Usage:**
```handlebars
{{hbwp-checkbox name="Agree" label="I agree to the terms" required=true}}
{{hbwp-checkbox name="Subscribe" label="Email me updates" checked=true}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `name` | `""` | Field name |
| `label` | `""` | Display label |
| `required` | `false` | Required field |
| `checked` | `false` | Default checked state |

---

### hbwp-hidden

Render a hidden form field. Supports `data-type` for automatic type coercion on submission.

**Usage:**
```handlebars
{{hbwp-hidden name="PageId" value=page.Id}}
{{hbwp-hidden name="UserId" value=user.id type="number"}}
{{hbwp-hidden name="IsActive" value="true" type="boolean"}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `name` | `""` | Field name |
| `value` | `""` | Field value |
| `type` | `""` | Data type for coercion: `"number"`, `"boolean"`, or `"string"` |

**Type coercion:** When submitted, the value is converted based on `data-type`:
- `number` → `Number(value)` (e.g. `"42"` → `42`)
- `boolean` → truthy check (e.g. `"true"` → `true`, `""` → `false`)
- `string` or omitted → raw string value

---

### hbwp-submit

Render a Fluent UI submit button.

**Usage:**
```handlebars
{{hbwp-submit label="Save"}}
{{hbwp-submit label="Submit Feedback" appearance="primary"}}
{{hbwp-submit label="Delete" appearance="outline" disabled=true}}
```

**Hash options:**
| Option | Default | Description |
|--------|---------|-------------|
| `label` | `"Submit"` | Button text |
| `appearance` | `"accent"` | Fluent UI appearance: `accent`, `primary`, `outline`, `stealth` |
| `disabled` | `false` | Disabled state |
| `class` | `""` | CSS class |

---

## handlebars-helpers (180+)

The full [handlebars-helpers](https://github.com/helpers/handlebars-helpers) library is registered, providing helpers across these categories:

| Category | Examples |
|----------|----------|
| **Array** | `first`, `last`, `each`, `filter`, `map`, `sort`, `unique`, `slice`, `length` |
| **Comparison** | `eq`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`, `ifEven`, `ifOdd` |
| **Math** | `add`, `subtract`, `multiply`, `divide`, `ceil`, `floor`, `round`, `abs` |
| **String** | `capitalize`, `uppercase`, `lowercase`, `trim`, `replace`, `split`, `truncate` |
| **Object** | `get`, `keys`, `values`, `extend`, `merge` |
| **URL** | `encodeURI`, `decodeURI`, `urlResolve`, `urlParse` |
| **Date** | `moment` (if available), date formatting |
| **HTML** | `sanitize`, `ul`, `ol` |
| **Inflection** | `pluralize`, `singularize`, `ordinalize` |

See the [handlebars-helpers documentation](https://github.com/helpers/handlebars-helpers) for the full list.
