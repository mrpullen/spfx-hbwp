/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataAdapterBase,
  DataAdapterCapability,
  IDataAdapterContext,
  IDataAdapterWriteResult,
  IDataAdapterPropertyDefinition,
  IPlatformServices,
  PlatformServiceKey
} from '@mrpullen/spfx-extensibility';
import { SocialDataService } from '../services/SocialDataService';

/**
 * Built-in adapter for SharePoint social interactions (likes, ratings).
 *
 * Wraps SocialDataService.  Write-only — called by web components
 * (HbwpLikeElement, HbwpRateElement) or template-driven actions.
 *
 * Supported operations:
 *  - execute('toggleLike', { siteUrl, listId, itemId, currentlyLiked })
 *  - execute('rate',       { siteUrl, listId, itemId, value })
 *  - executeRead('isLiked', { siteUrl, listId, itemId }) → { liked, count }
 */
export class SocialDataAdapter extends DataAdapterBase {
  public readonly adapterId = 'social';
  public readonly adapterName = 'Social (Likes & Ratings)';
  public readonly capability: DataAdapterCapability = 'write';

  private inner: SocialDataService;

  constructor(services: IPlatformServices) {
    super(services);
    // eslint-disable-next-line dot-notation
    const sp = services['sp'];
    this.inner = new SocialDataService(sp);
  }

  public getRequiredServices(): PlatformServiceKey[] { return ['sp']; }

  public async execute(
    operation: string,
    payload: any,
    _context: IDataAdapterContext
  ): Promise<IDataAdapterWriteResult> {
    switch (operation) {
      case 'toggleLike': {
        const { siteUrl, listId, itemId, currentlyLiked } = payload;
        if (!siteUrl || !listId || !itemId) {
          return { success: false, error: 'toggleLike requires siteUrl, listId, and itemId' };
        }
        const result = await this.inner.toggleLike(siteUrl, listId, Number(itemId), !!currentlyLiked);
        return { success: result.success, error: result.error };
      }

      case 'rate': {
        const { siteUrl, listId, itemId, value } = payload;
        if (!siteUrl || !listId || !itemId || value === undefined) {
          return { success: false, error: 'rate requires siteUrl, listId, itemId, and value' };
        }
        const result = await this.inner.rate(siteUrl, listId, Number(itemId), Number(value));
        return { success: result.success, error: result.error };
      }

      default:
        return { success: false, error: `Unknown social operation: ${operation}` };
    }
  }

  public async executeRead(
    operation: string,
    payload: any,
    _context: IDataAdapterContext
  ): Promise<IDataAdapterWriteResult> {
    switch (operation) {
      case 'isLiked': {
        const { siteUrl, listId, itemId } = payload || {};
        if (!siteUrl || !listId || !itemId) {
          return { success: false, error: 'isLiked requires siteUrl, listId, and itemId' };
        }
        const result = await this.inner.isLiked(siteUrl, listId, Number(itemId));
        return result.success
          ? { success: true, data: { liked: result.liked, count: result.count } }
          : { success: false, error: result.error };
      }

      case 'getLikedBy': {
        const { siteUrl, listId, itemId, skip, top } = payload || {};
        if (!siteUrl || !listId || !itemId) {
          return { success: false, error: 'getLikedBy requires siteUrl, listId, and itemId' };
        }
        const result = await this.inner.getLikedBy(
          siteUrl,
          listId,
          Number(itemId),
          skip !== null && skip !== undefined ? Number(skip) : 0,
          top !== null && top !== undefined ? Number(top) : 25
        );
        return result.success
          ? { success: true, data: { users: result.users, total: result.total, skip: result.skip, top: result.top } }
          : { success: false, error: result.error };
      }

      case 'getRating': {
        const { siteUrl, listId, itemId } = payload || {};
        if (!siteUrl || !listId || !itemId) {
          return { success: false, error: 'getRating requires siteUrl, listId, and itemId' };
        }
        const result = await this.inner.getRating(siteUrl, listId, Number(itemId));
        return result.success
          ? { success: true, data: { average: result.average, count: result.count, userRating: result.userRating } }
          : { success: false, error: result.error };
      }

      default:
        return { success: false, error: `Unknown social read operation: ${operation}` };
    }
  }

  public getPropertyDefinitions(): IDataAdapterPropertyDefinition[] {
    // Social adapter is configured per web part (siteUrl/listId from the primary list),
    // not per adapter instance.  No additional properties needed.
    return [];
  }
}
