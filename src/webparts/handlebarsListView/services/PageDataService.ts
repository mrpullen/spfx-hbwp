/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import { CacheService } from "./CacheService";

const PAGE_DATA_CACHE_KEY = 'page_data';
// Page metadata changes infrequently, cache for 5 minutes
const PAGE_DATA_CACHE_TIMEOUT = 5;

export class PageDataService {
  private sp: SPFI;
  private cacheService: CacheService;

  constructor(sp: SPFI) {
    this.sp = sp;
    this.cacheService = new CacheService({ keyPrefix: 'hbwp_page_' });
  }

  /**
   * Gets the current page's metadata (all fields) from cache or fetches it.
   * @param listId The Site Pages library GUID
   * @param itemId The page's list item ID
   */
  public async getPageData(listId: string, itemId: number): Promise<Record<string, any>> {
    const cacheKey = `${PAGE_DATA_CACHE_KEY}_${listId}_${itemId}`;
    return this.cacheService.getOrFetch<Record<string, any>>(
      cacheKey,
      async () => await this.fetchPageData(listId, itemId),
      PAGE_DATA_CACHE_TIMEOUT
    );
  }

  /**
   * Clears the page data cache
   */
  public clearCache(): void {
    this.cacheService.clearAll();
  }

  /**
   * Fetches all metadata fields for the current page from SharePoint
   */
  private async fetchPageData(listId: string, itemId: number): Promise<Record<string, any>> {
    try {
      const item = await this.sp.web.lists.getById(listId).items.getById(itemId)();
      return item;
    } catch (error) {
      console.error('PageDataService: Error fetching page data:', error);
      return {};
    }
  }
}
