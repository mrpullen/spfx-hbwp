/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI, spfi } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import "@pnp/sp/site-users/web";
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
 * Result of an isLiked lookup.
 */
export interface IIsLikedResult {
  success: boolean;
  liked?: boolean;
  count?: number;
  error?: string;
}

/**
 * Result of a getRating lookup.
 */
export interface IGetRatingResult {
  success: boolean;
  average?: number;
  count?: number;
  userRating?: number; // 0 if the current user hasn't rated
  error?: string;
}

/**
 * A single user who has liked an item.
 */
export interface ILikerInfo {
  id: number;
  title: string;
  email: string;
  loginName: string;
}

/**
 * Result of a paged getLikedBy lookup.
 */
export interface IGetLikedByResult {
  success: boolean;
  users?: ILikerInfo[];
  total?: number;
  skip?: number;
  top?: number;
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
   * Submit a star rating (1–5, whole stars only) on a list item.
   * Half-star rendering is display-only (for averages); SharePoint accepts
   * integer values via item.rate().
   *
   * @param siteUrl - The site URL where the list resides
   * @param listId - The list GUID
   * @param itemId - The item ID
   * @param value - Rating value (1–5)
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

  /**
   * Check whether the current user has liked a list item, and return the
   * total like count. Uses SharePoint's LikedByInformation field.
   */
  public async isLiked(
    siteUrl: string,
    listId: string,
    itemId: number
  ): Promise<IIsLikedResult> {
    try {
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const item = targetSp.web.lists.getById(listId).items.getById(itemId);

      // Read the LikedBy multi-user field directly — authoritative source.
      // LikedByInformation expand is unreliable on SitePages / modern lists.
      // Note: LikeCount is not always available as a select-able column, so we
      // derive count from LikedBy.length.
      const [itemData, currentUser] = await Promise.all([
        item.select('LikedBy/Id').expand('LikedBy')() as Promise<any>,
        targetSp.web.currentUser.select('Id')() as Promise<any>
      ]);

      console.log('[SocialDataService] isLiked raw result', { itemId, itemData, currentUser });

      const likedBy: Array<{ Id: number }> = Array.isArray(itemData?.LikedBy) ? itemData.LikedBy : [];
      const currentUserId = currentUser?.Id;
      const liked = currentUserId !== null && currentUserId !== undefined && likedBy.some((u) => u.Id === currentUserId);
      const count = likedBy.length;

      return {
        success: true,
        liked,
        count
      };
    } catch (error) {
      console.error(`SocialDataService: Error checking isLiked on item ${itemId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Return a paged list of users who have liked the item. Reads the LikedBy
   * user-multi field, expanded with Title/EMail/Name, then slices in memory.
   */
  public async getLikedBy(
    siteUrl: string,
    listId: string,
    itemId: number,
    skip: number = 0,
    top: number = 25
  ): Promise<IGetLikedByResult> {
    try {
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const item = targetSp.web.lists.getById(listId).items.getById(itemId);

      const itemData: any = await item
        .select('LikedBy/Id', 'LikedBy/Title', 'LikedBy/EMail', 'LikedBy/Name')
        .expand('LikedBy')();

      const likedBy: any[] = Array.isArray(itemData?.LikedBy) ? itemData.LikedBy : [];
      const total = likedBy.length;
      const safeSkip = Math.max(0, Math.floor(skip) || 0);
      const safeTop = Math.max(1, Math.floor(top) || 25);
      const slice = likedBy.slice(safeSkip, safeSkip + safeTop).map((u) => ({
        id: u.Id,
        title: u.Title || '',
        email: u.EMail || '',
        loginName: u.Name || ''
      } as ILikerInfo));

      return {
        success: true,
        users: slice,
        total,
        skip: safeSkip,
        top: safeTop
      };
    } catch (error) {
      console.error(`SocialDataService: Error getting LikedBy for item ${itemId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Read the current rating state for an item:
   *  - average rating (AverageRating)
   *  - total rating count (RatingCount)
   *  - the current user's rating (0 if they haven't rated)
   *
   * Pulls RatedBy + Ratings together (parallel arrays) and matches the
   * current user's index to find their submitted value.
   */
  public async getRating(
    siteUrl: string,
    listId: string,
    itemId: number
  ): Promise<IGetRatingResult> {
    try {
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const item = targetSp.web.lists.getById(listId).items.getById(itemId);

      const [itemData, currentUser] = await Promise.all([
        item.select('AverageRating', 'RatingCount', 'RatedBy/Id', 'Ratings').expand('RatedBy')() as Promise<any>,
        targetSp.web.currentUser.select('Id')() as Promise<any>
      ]);

      console.log('[SocialDataService] getRating raw result', { itemId, itemData, currentUser });

      const average = typeof itemData?.AverageRating === 'number'
        ? itemData.AverageRating
        : parseFloat(itemData?.AverageRating) || 0;
      const count = typeof itemData?.RatingCount === 'number'
        ? itemData.RatingCount
        : parseInt(itemData?.RatingCount, 10) || 0;

      // Ratings field is a string of semicolon-delimited values, e.g.
      // ";#5.0000000000000000;#3.5000000000000000;#" — paired with RatedBy by index.
      const ratedBy: Array<{ Id: number }> = Array.isArray(itemData?.RatedBy) ? itemData.RatedBy : [];
      const ratingsRaw: string = typeof itemData?.Ratings === 'string' ? itemData.Ratings : '';
      const ratingTokens = ratingsRaw
        .split(';#')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      const ratings = ratingTokens.map((s: string) => parseFloat(s) || 0);

      let userRating = 0;
      const currentUserId = currentUser?.Id;
      if (currentUserId !== null && currentUserId !== undefined) {
        const idx = ratedBy.findIndex((u) => u.Id === currentUserId);
        if (idx >= 0 && idx < ratings.length) {
          userRating = ratings[idx];
        }
      }

      return {
        success: true,
        average,
        count,
        userRating
      };
    } catch (error) {
      console.error(`SocialDataService: Error getting rating for item ${itemId}:`, error);
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
