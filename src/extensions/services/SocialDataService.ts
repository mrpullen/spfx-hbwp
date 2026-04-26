/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI, spfi } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import "@pnp/sp/comments";
import "@pnp/sp/comments/item";
import type { RatingValues } from "@pnp/sp/comments/types";

/**
 * Result of a social action (like/unlike/rate)
 */
export interface ISocialActionResult {
  success: boolean;
  error?: string;
}

/**
 * Service for handling social interactions (likes, ratings) on SharePoint list items.
 * Uses PnPjs v4 .like(), .unlike(), and .rate() methods via @pnp/sp/comments/item.
 */
export class SocialDataService {
  private sp: SPFI;

  constructor(sp: SPFI) {
    this.sp = sp;
  }

  /**
   * Toggle like on a list item.
   * @param siteUrl - The site URL where the list resides
   * @param listId - The list GUID
   * @param itemId - The item ID
   * @param currentlyLiked - Whether the current user has already liked this item
   */
  public async toggleLike(
    siteUrl: string,
    listId: string,
    itemId: number,
    currentlyLiked: boolean
  ): Promise<ISocialActionResult> {
    try {
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const item = targetSp.web.lists.getById(listId).items.getById(itemId);

      if (currentlyLiked) {
        await item.unlike();
      } else {
        await item.like();
      }

      return { success: true };
    } catch (error) {
      console.error(`SocialDataService: Error toggling like on item ${itemId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Submit a star rating (1-5) on a list item.
   * @param siteUrl - The site URL where the list resides
   * @param listId - The list GUID
   * @param itemId - The item ID
   * @param value - Rating value (1-5)
   */
  public async rate(
    siteUrl: string,
    listId: string,
    itemId: number,
    value: number
  ): Promise<ISocialActionResult> {
    if (value < 1 || value > 5) {
      return { success: false, error: 'Rating value must be between 1 and 5' };
    }

    try {
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const item = targetSp.web.lists.getById(listId).items.getById(itemId);

      await item.rate(value as RatingValues);

      return { success: true };
    } catch (error) {
      console.error(`SocialDataService: Error rating item ${itemId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Generates the client-side script for handling social interactions via event delegation.
 * Listens for clicks on [data-hbwp-like] and [data-hbwp-rate] elements,
 * performs optimistic UI updates, and dispatches CustomEvents to the React component.
 */
export function generateSocialHandlerScript(wpId: string): string {
  return `<script>
(function() {
  var container = document.querySelector('[data-wpid="${wpId}"]');
  if (!container) return;

  container.addEventListener('click', function(e) {
    // Find the closest social action element
    var likeBtn = e.target.closest('[data-hbwp-like]');
    var rateBtn = e.target.closest('[data-hbwp-rate]');

    if (likeBtn) {
      e.preventDefault();
      e.stopPropagation();
      var itemId = likeBtn.getAttribute('data-hbwp-like');
      var liked = likeBtn.getAttribute('data-hbwp-liked') === 'true';

      // Optimistic UI update
      var heart = likeBtn.querySelector('.heart');
      var countSpan = likeBtn.querySelector('span:last-child');
      if (heart) {
        if (liked) {
          heart.className = 'heart heart-not-liked';
          heart.textContent = '\\u2661';
        } else {
          heart.className = 'heart heart-liked';
          heart.textContent = '\\u2665';
        }
      }
      if (countSpan) {
        var current = parseInt(countSpan.textContent) || 0;
        var newCount = liked ? Math.max(0, current - 1) : current + 1;
        countSpan.textContent = newCount + (newCount === 1 ? ' like' : ' likes');
      }
      likeBtn.setAttribute('data-hbwp-liked', liked ? 'false' : 'true');

      // Dispatch event to React component
      container.dispatchEvent(new CustomEvent('hbwp-social-action', {
        bubbles: true,
        detail: { action: 'like', itemId: itemId, currentlyLiked: liked }
      }));
    }

    if (rateBtn) {
      e.preventDefault();
      e.stopPropagation();
      var rateItemId = rateBtn.getAttribute('data-hbwp-rate');
      var rateValue = rateBtn.getAttribute('data-hbwp-rate-value');

      // Dispatch event to React component
      container.dispatchEvent(new CustomEvent('hbwp-social-action', {
        bubbles: true,
        detail: { action: 'rate', itemId: rateItemId, value: rateValue }
      }));
    }
  });
})();
</script>`;
}
