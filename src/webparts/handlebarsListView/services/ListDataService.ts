/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI, spfi } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/views";
import "@pnp/sp/items";
import { CacheService, ICacheConfig } from "./CacheService";

/**
 * Configuration for fetching list data
 */
export interface IListFetchConfig {
  /** Site URL where the list resides */
  siteUrl: string;
  /** List GUID */
  listId: string;
  /** View GUID */
  viewId: string;
}

/**
 * Result of a list data fetch operation
 */
export interface IListDataResult {
  /** The fetched items */
  items: Array<any>;
  /** Whether data came from cache */
  fromCache: boolean;
  /** Any error that occurred */
  error?: Error;
}

/**
 * Service for fetching and caching SharePoint list data
 */
export class ListDataService {
  private sp: SPFI;
  private cacheService: CacheService;
  private cacheEnabled: boolean;
  private cacheTimeoutMinutes: number;

  constructor(
    sp: SPFI,
    cacheConfig?: {
      enabled?: boolean;
      timeoutMinutes?: number;
      cacheServiceConfig?: Partial<ICacheConfig>;
    }
  ) {
    this.sp = sp;
    this.cacheEnabled = cacheConfig?.enabled ?? true;
    this.cacheTimeoutMinutes = cacheConfig?.timeoutMinutes ?? 15;
    
    // Initialize cache service with shared prefix for cross-instance caching
    this.cacheService = new CacheService({
      keyPrefix: 'hbwp_data_',
      timeoutMinutes: this.cacheTimeoutMinutes,
      ...cacheConfig?.cacheServiceConfig
    });
  }

  /**
   * Generates a unique cache key for a list/view combination
   */
  public getCacheKey(siteUrl: string, listId: string, viewId: string): string {
    // Use btoa to create a safe key from the combination
    return `list_${btoa(`${siteUrl}_${listId}_${viewId}`).replace(/[=+/]/g, '_')}`;
  }

  /**
   * Fetches data from a SharePoint list, using cache if enabled
   * @param config - List fetch configuration
   * @param timeoutMinutes - Optional cache timeout override (uses default if not provided)
   */
  public async getListData(config: IListFetchConfig, timeoutMinutes?: number): Promise<IListDataResult> {
    const { siteUrl, listId, viewId } = config;
    const effectiveTimeout = timeoutMinutes ?? this.cacheTimeoutMinutes;

    if (!siteUrl || !listId || !viewId) {
      return { items: [], fromCache: false, error: new Error('Missing required configuration') };
    }

    const cacheKey = this.getCacheKey(siteUrl, listId, viewId);

    try {
      if (this.cacheEnabled) {
        // Check if we have cached data first
        const cachedData = this.cacheService.get<Array<any>>(cacheKey);
        if (cachedData !== undefined) {
          return { items: cachedData, fromCache: true };
        }

        // Use getOrFetch which handles mutex locking
        const items = await this.cacheService.getOrFetch(
          cacheKey,
          async () => this.fetchFromSharePoint(siteUrl, listId, viewId),
          effectiveTimeout
        );
        
        return { items, fromCache: false };
      } else {
        // Cache disabled, fetch directly
        const items = await this.fetchFromSharePoint(siteUrl, listId, viewId);
        return { items, fromCache: false };
      }
    } catch (error) {
      console.error(`ListDataService: Error fetching list data:`, error);
      return { items: [], fromCache: false, error: error as Error };
    }
  }

  /**
   * Fetches data from multiple lists in parallel
   */
  public async getMultipleListData(
    configs: Array<{ key: string; config: IListFetchConfig; timeoutMinutes?: number }>
  ): Promise<Record<string, IListDataResult>> {
    const results: Record<string, IListDataResult> = {};

    // Fetch all in parallel
    const fetchPromises = configs.map(async ({ key, config, timeoutMinutes }) => {
      const result = await this.getListData(config, timeoutMinutes);
      return { key, result };
    });

    const fetchResults = await Promise.all(fetchPromises);
    
    for (const { key, result } of fetchResults) {
      results[key] = result;
    }

    return results;
  }

  /**
   * Preloads data into cache without returning it
   * Useful for warming up cache in the background
   */
  public async preloadListData(config: IListFetchConfig): Promise<void> {
    await this.getListData(config);
  }

  /**
   * Preloads multiple lists into cache
   */
  public async preloadMultipleListData(configs: Array<IListFetchConfig>): Promise<void> {
    await Promise.all(configs.map(config => this.preloadListData(config)));
  }

  /**
   * Forces a refresh of cached data for a specific list
   */
  public async refreshListData(config: IListFetchConfig): Promise<IListDataResult> {
    const { siteUrl, listId, viewId } = config;
    const cacheKey = this.getCacheKey(siteUrl, listId, viewId);
    
    // Remove from cache first
    this.cacheService.remove(cacheKey);
    
    // Fetch fresh data
    return this.getListData(config);
  }

  /**
   * Clears all cached list data
   */
  public clearAllCache(): void {
    this.cacheService.clearAll();
  }

  /**
   * Clears cached data for a specific list
   */
  public clearListCache(siteUrl: string, listId: string, viewId: string): void {
    const cacheKey = this.getCacheKey(siteUrl, listId, viewId);
    this.cacheService.remove(cacheKey);
  }

  /**
   * Checks if data for a list is currently cached
   */
  public isListCached(siteUrl: string, listId: string, viewId: string): boolean {
    const cacheKey = this.getCacheKey(siteUrl, listId, viewId);
    return this.cacheService.has(cacheKey);
  }

  /**
   * Internal method to fetch data directly from SharePoint
   */
  private async fetchFromSharePoint(
    siteUrl: string,
    listId: string,
    viewId: string
  ): Promise<Array<any>> {
    try {
      // Create a context for the target site
      const spSite = spfi(siteUrl).using(AssignFrom(this.sp.web));
      
      // Get list reference
      const list = spSite.web.lists.getById(listId);
      
      // Get list info to determine if it's a document library
      const listInfo = await list();
      
      // Get the view's CAML query
      const view = await list.views.getById(viewId).select('ListViewXml')();
      
      // Determine what to expand based on list type
      const expands: Array<string> = [];
      if (listInfo.BaseType === 1) {
        // Document library - expand File properties
        expands.push("File");
      }
      
      // Execute the CAML query
      const items = await list.getItemsByCAMLQuery({
        ViewXml: view.ListViewXml
      }, ...expands);

      return items;
    } catch (error) {
      console.error(`ListDataService: Error fetching from SharePoint (${siteUrl}):`, error);
      throw error;
    }
  }

  /**
   * Gets the underlying cache service for advanced operations
   */
  public getCacheService(): CacheService {
    return this.cacheService;
  }

  /**
   * Updates cache configuration
   */
  public setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  /**
   * Updates cache timeout
   */
  public setCacheTimeout(minutes: number): void {
    this.cacheTimeoutMinutes = minutes;
  }
}
