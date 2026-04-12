# Social Integration — Implementation Plan

## Overview

Add interactive likes and ratings to any template rendered by the Handlebars List View web part. Social data (`LikesCount`, `LikedBy`, `AverageRating`, `RatingCount`) already arrives in `renderListDataAsStream` rows when included in the view. This feature adds **write-back** — users can like/unlike items and submit star ratings directly from template UI via `data-hbwp-*` attributes and event delegation.

**Scope for v1:** Likes toggle + star ratings. Comments deferred to v2.

gOING TO Surface comments on a page that will be dedicate to the specific element - (let the native functionality handle it - so we don't need comments. at least for V1.)
---

## Architecture

```
Template HTML                    React Component                    SharePoint REST
─────────────                    ───────────────                    ───────────────
<button data-hbwp-like="3">  →  injected <script>              
   click event                   dispatches CustomEvent         
                                 'hbwp-social-action'           
                              →  handleSocialAction()           
                                 calls SocialDataService        →  POST .../items(3)/like
                              ←  optimistic DOM update          ←  response
                                 re-renders full template
```

This follows the exact same pattern as `FormSubmitService` + `generateFormHandlerScript`.

---

## Step-by-Step Implementation

### Step 1: Create `SocialDataService.ts`

**File:** `src/webparts/handlebarsListView/services/SocialDataService.ts`

**Purpose:** Wraps SharePoint REST endpoints for like/unlike and rate actions.

**Constructor dependencies:** `SPFI` (same as other services)

**Methods to implement:**

```typescript
export interface ISocialActionResult {
  success: boolean;
  error?: string;
  likesCount?: number;
  likedByMe?: boolean;
  averageRating?: number;
  ratingCount?: number;
}

export class SocialDataService {
  constructor(private sp: SPFI) {}

  /** Toggle like on an item. Returns updated like state. */
  public async toggleLike(
    siteUrl: string, listId: string, itemId: number, currentlyLiked: boolean
  ): Promise<ISocialActionResult>

  /** Submit a 1–5 star rating. Returns updated rating state. */
  public async rate(
    siteUrl: string, listId: string, itemId: number, value: number
  ): Promise<ISocialActionResult>
}
```

**REST calls** (use PnPjs `spfi` cross-site pattern from `FormSubmitService`):

| Action | Endpoint | Method |
|---|---|---|
| Like | `{siteUrl}/_api/web/lists('${listId}')/items(${itemId})/like` | POST |
| Unlike | `{siteUrl}/_api/web/lists('${listId}')/items(${itemId})/unlike` | POST |
| Rate | `{siteUrl}/_api/web/lists('${listId}')/items(${itemId})/rate(${value})` | POST |

PnPjs doesn't have typed wrappers for these, so use the raw fetch pattern:

```typescript
const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
const endpoint = currentlyLiked ? 'unlike' : 'like';
await targetSp.web.lists.getById(listId).items.getById(itemId)[endpoint]();
```

> **Note:** PnPjs v3 *does* support `.like()` and `.unlike()` on list items via `@pnp/sp/comments`. Import `"@pnp/sp/comments/item"` to get these methods. For `.rate()`, use a raw POST via `spHttpClient` or extend the item.

**How to verify PnPjs support:** Check if `import "@pnp/sp/comments/item"` adds `.like()` / `.unlike()` to the item interface. If not, fall back to raw REST via `sp.web.lists.getById(listId).items.getById(itemId)` using the underlying fetch.

**Test this step:**
- Instantiate `SocialDataService` in the browser console or a unit test
- Call `toggleLike()` and verify the REST call succeeds (check network tab)
- Confirm the response includes updated `LikesCount`

---

### Step 2: Export from Services Index

**File:** `src/webparts/handlebarsListView/services/index.ts`

Add:
```typescript
export * from './SocialDataService';
```

---

### Step 3: Instantiate in `HandlebarsListView.tsx`

**File:** `src/webparts/handlebarsListView/components/HandlebarsListView.tsx`

In the constructor, alongside existing service instantiation:

```typescript
private socialDataService?: SocialDataService;

constructor(props) {
  super(props);
  // ... existing code ...
  if (props.sp) {
    this.socialDataService = new SocialDataService(props.sp);
  }
}
```

No new props needed — the service only needs `SPFI`, and `site.url`, `list` are passed per-call.

---

### Step 4: Generate Social Event Handler Script

**File:** `src/webparts/handlebarsListView/services/SocialDataService.ts` (or a separate file like `socialScripts.ts`)

Create `generateSocialHandlerScript(wpId: string): string` — returns a `<script>` block that:

1. Finds the container: `document.querySelector('[data-wpid="${wpId}"]')`
2. Attaches a **click** listener (delegated)
3. On click, checks for:
   - `data-hbwp-like="<itemId>"` → dispatches `CustomEvent('hbwp-social-action', { detail: { action: 'like', itemId, currentlyLiked } })`
   - `data-hbwp-rate="<itemId>"` with `data-hbwp-rate-value="<1-5>"` → dispatches `CustomEvent('hbwp-social-action', { detail: { action: 'rate', itemId, value } })`
4. **Optimistic UI update** for likes: immediately toggle the heart icon class and increment/decrement the count in the DOM before the REST call completes

**Determining `currentlyLiked`:** The clicked element (or its parent `[data-hbwp-like]`) should also carry `data-hbwp-liked="true|false"` so the script knows the current state.

**Template usage:**
```handlebars
<button data-hbwp-like="{{ID}}" data-hbwp-liked="{{#filter LikedBy 'Id' ../../user.id}}true{{else}}false{{/filter}}">
  ♥ {{LikesCount}}
</button>
```

---

### Step 5: Wire Event Listener in Component

**File:** `src/webparts/handlebarsListView/components/HandlebarsListView.tsx`

In `componentDidMount`, add alongside the existing form submit listener:

```typescript
this.containerRef.current.addEventListener(
  'hbwp-social-action', this.handleSocialAction as EventListener
);
```

In `componentWillUnmount`, remove it.

Implement `handleSocialAction`:

```typescript
private handleSocialAction = async (event: CustomEvent): Promise<void> => {
  const { action, itemId, currentlyLiked, value } = event.detail;
  const siteUrl = this.props.site?.url;
  const listId = this.props.list;

  if (!this.socialDataService || !siteUrl || !listId) return;

  try {
    if (action === 'like') {
      await this.socialDataService.toggleLike(siteUrl, listId, Number(itemId), currentlyLiked);
    } else if (action === 'rate') {
      await this.socialDataService.rate(siteUrl, listId, Number(itemId), Number(value));
    }
    // Re-fetch and re-render to show updated social state
    await this.getHandlebarsTemplate();
  } catch (error) {
    console.error('Social action failed:', error);
  }
};
```

**Why full re-render?** The optimistic DOM update (Step 4) gives instant feedback. The full re-render after the REST call ensures data consistency. If the call fails, the re-render corrects the UI back.

---

### Step 6: Inject Social Script in Template Output

**File:** `src/webparts/handlebarsListView/components/HandlebarsListView.tsx`

In `getHandlebarsTemplate()`, inject the social handler script alongside the form scripts:

```typescript
const socialScripts = generateSocialHandlerScript(wpId);
this.setState({
  html: templateContent + formScripts + socialScripts,
  visible: true
});
```

The social script is always injected (it's a no-op if no `data-hbwp-like` / `data-hbwp-rate` elements exist).

---

### Step 7: Register Handlebars Helpers (Optional)

If you want convenience helpers beyond what `{{LikesCount}}` and `{{#filter LikedBy}}` already provide, register these at module scope:

| Helper | Usage | Returns |
|---|---|---|
| `starRating` | `{{starRating AverageRating}}` | HTML string: `★★★★☆` using filled/empty stars |

```typescript
Handlebars.registerHelper('starRating', function(rating: any) {
  const val = parseFloat(rating) || 0;
  const full = Math.floor(val);
  const half = val - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return new Handlebars.SafeString(
    '<span style="color:#ffb900;">' + '★'.repeat(full) +
    (half ? '⯪' : '') + '</span>' +
    '<span style="color:#d2d0ce;">' + '☆'.repeat(empty) + '</span>'
  );
});
```

**Note:** `LikesCount`, `LikedBy`, `AverageRating`, `RatingCount` are already available as row fields — they come from `renderListDataAsStream` when included in the view. No new helpers are strictly required for read-only display. The idea-cards template already demonstrates the pattern using `{{#filter LikedBy "Id" ...}}`.

---

### Step 8: Update idea-cards.hbs (or Create a Social Demo Template)

Update the existing likes section in `idea-cards.hbs` to be interactive:

**Before (read-only):**
```handlebars
<a href="{{FileRef}}" class="idea-likes">
  {{#filter LikedBy "Id" ../../user.id}}
    <span class="heart heart-liked">♥</span>
  {{else}}
    <span class="heart heart-not-liked">♡</span>
  {{/filter}}
  <span>{{LikesCount}} likes</span>
</a>
```

**After (interactive):**
```handlebars
<button class="idea-likes" data-hbwp-like="{{ID}}"
  data-hbwp-liked="{{#filter LikedBy 'Id' ../../user.id}}true{{else}}false{{/filter}}">
  {{#filter LikedBy "Id" ../../user.id}}
    <span class="heart heart-liked">♥</span>
  {{else}}
    <span class="heart heart-not-liked">♡</span>
  {{/filter}}
  <span>{{LikesCount}} {{#is LikesCount "1"}}like{{else}}likes{{/is}}</span>
</button>
```

Changes: `<a>` → `<button>`, add `data-hbwp-like` and `data-hbwp-liked` attributes, remove `href`.

---

## Testing Plan

### Manual Test 1: Like Toggle
1. Deploy the updated `.sppkg` to the site collection app catalog
2. Open a page with the idea-cards template configured against a list with Likes enabled
3. Click the heart button on an item
4. **Expected:** Heart immediately fills (optimistic), count increments
5. Refresh the page — like state should persist
6. Click again to unlike — heart empties, count decrements
7. Check another user's browser — like count should reflect the change

### Manual Test 2: Like State Accuracy
1. Like an item via the standard SharePoint page (not the web part)
2. Load the web part page
3. **Expected:** The heart shows as filled, count is correct
4. Unlike via the web part
5. Go back to the SharePoint page — unlike should be reflected

### Manual Test 3: Rating (if implementing)
1. Enable ratings on the list (Site Pages → List Settings → Rating settings)
2. Add `AverageRating` and `RatingCount` to the view
3. Use `{{starRating AverageRating}}` in the template
4. Add `data-hbwp-rate="{{ID}}" data-hbwp-rate-value="4"` buttons
5. Click to rate — stars should update after re-render
6. Verify the average changes correctly when multiple users rate

### Manual Test 4: Error Handling
1. Disconnect from network, click like
2. **Expected:** Optimistic update shows, then reverts on re-render (REST call fails, full re-render corrects)
3. Test with a list where the user has read-only permissions
4. **Expected:** REST call returns 403, console logs error, UI reverts

### Manual Test 5: Multiple Web Parts
1. Place two HBWP instances on the same page pointing to the same list
2. Like an item in web part A
3. **Expected:** Web part A updates immediately. Web part B still shows old state until refreshed (each instance is independent)

---

## File Summary

| File | Action | What Changes |
|---|---|---|
| `services/SocialDataService.ts` | **New** | Like/unlike/rate REST wrappers |
| `services/index.ts` | Edit | Add export |
| `components/HandlebarsListView.tsx` | Edit | Import service, instantiate, add event listener, `handleSocialAction`, inject social script, optionally register `starRating` helper |
| `src/template/idea-cards.hbs` | Edit | Change likes from `<a>` to `<button>` with `data-hbwp-like`/`data-hbwp-liked` |

**No changes needed to:** `IHandlebarsListViewProps.ts`, `HandlebarsListViewWebPart.ts`, `ListDataService.ts`

---

## Open Questions

1. **PnPjs `.like()` / `.unlike()` availability** — Need to verify `@pnp/sp/comments/item` import works with the project's PnPjs version. If not, use raw `sp.web.fetch()` POST calls.
2. **Rate endpoint** — `.rate(value)` may not have a PnPjs wrapper. May need raw REST: `POST {siteUrl}/_api/web/lists('{listId}')/items({itemId})/rate({value})`.
3. **Optimistic UI vs. full re-render** — The plan uses both (optimistic for instant feel, re-render for correctness). Could skip optimistic if the re-render is fast enough (<500ms typical).
4. **Cache invalidation** — After a social action, should we clear the list data cache for that item? Currently `getHandlebarsTemplate()` re-fetches, but if caching is enabled the stale data will be returned. Need to call `clearListCache()` before re-fetch, or temporarily bypass cache.
