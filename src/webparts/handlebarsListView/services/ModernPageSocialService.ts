/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI, spfi, SPQueryable, spPost, spGet } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";
import "@pnp/sp/webs";

/**
 * Result of a modern page social action (like/unlike).
 */
export interface IModernPageLikeResult {
  success: boolean;
  error?: string;
}

/**
 * Liked-by information for a modern SharePoint page.
 */
export interface IModernPageLikeInfo {
  isLikedByUser: boolean;
  likeCount: number;
  likedBy: Array<{
    name: string;
    email: string;
    id: number;
    loginName: string;
  }>;
}

/**
 * Service for handling likes on modern SharePoint pages.
 *
 * Uses the `_api/sitepages/pages({id})` endpoints — the same REST API
 * that the native SharePoint modern page "like" button calls.
 *
 * This is different from the list-item like endpoint used by
 * SocialDataService (`_api/web/lists('{id}')/items({id})/like`),
 * which goes through the Comments service and does NOT sync with the
 * modern page like UI.
 *
 * Use this service when the web part renders items from a Site Pages library
 * and you need likes to be visible/consistent with the native page experience.
 */
export class ModernPageSocialService {
  private sp: SPFI;

  constructor(sp: SPFI) {
    this.sp = sp;
  }

  /**
   * Toggle like on a modern SharePoint page.
   * Calls the same endpoint as the native page like button:
   *   POST _api/sitepages/pages({pageItemId})/like  (or /unlike)
   *
   * @param siteUrl - The site URL where the Site Pages library resides
   * @param pageItemId - The list item ID of the page in the Site Pages library
   * @param currentlyLiked - Whether the current user has already liked this page
   */
  public async toggleLike(
    siteUrl: string,
    pageItemId: number,
    currentlyLiked: boolean
  ): Promise<IModernPageLikeResult> {
    try {
      const action = currentlyLiked ? 'unlike' : 'like';
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const baseUrl = siteUrl.replace(/\/$/, '');
      const endpoint = `${baseUrl}/_api/sitepages/pages(${pageItemId})/${action}`;

      const q = SPQueryable([targetSp.web, endpoint]);
      await spPost(q);

      return { success: true };
    } catch (error) {
      console.error(`ModernPageSocialService: Error toggling like on page ${pageItemId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get liked-by information for a modern SharePoint page.
   * Returns accurate like status including whether the current user has liked the page.
   *
   * Calls: GET _api/sitepages/pages({pageItemId})/likedByInformation
   *
   * Note: The item-level getLikedByInformation is deprecated and unreliable for
   * regular list items (per PnPjs docs), but the sitepages endpoint works correctly.
   *
   * @param siteUrl - The site URL
   * @param pageItemId - The list item ID of the page
   */
  public async getLikedByInformation(
    siteUrl: string,
    pageItemId: number
  ): Promise<IModernPageLikeInfo | undefined> {
    try {
      const targetSp = spfi(siteUrl).using(AssignFrom(this.sp.web));
      const baseUrl = siteUrl.replace(/\/$/, '');
      const endpoint = `${baseUrl}/_api/sitepages/pages(${pageItemId})/likedByInformation`;

      const q = SPQueryable([targetSp.web, endpoint]);
      const info: any = await spGet(q);

      return {
        isLikedByUser: !!info.isLikedByUser,
        likeCount: info.likeCount || 0,
        likedBy: (info.likedBy || []).map((u: any) => ({
          name: u.name || '',
          email: u.email || '',
          id: u.id || 0,
          loginName: u.loginName || ''
        }))
      };
    } catch (error) {
      console.error(`ModernPageSocialService: Error getting like info for page ${pageItemId}:`, error);
      return undefined;
    }
  }
}
