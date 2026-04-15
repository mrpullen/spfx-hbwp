/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI, spfi } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/views";
import "@pnp/sp/items";
import { RenderListDataOptions } from "@pnp/sp/lists";
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
  /** Pre-fetched ViewXml (without Where clause). If provided, skips runtime view fetch. */
  viewXml?: string;
  /** Optional CAML Where clause to inject into the viewXml.
   *  Should be the inner CAML (e.g. <Eq><FieldRef Name='Status'/><Value Type='Text'>Active</Value></Eq>).
   *  Tokens like {{user.email}} or {{page.Id}} should already be resolved before passing. */
  camlFilter?: string;
  /** Optional paging token (NextHref/PrevHref value) for requesting a specific page. */
  pagingToken?: string;
}

/**
 * Result of a list data fetch operation
 */
export interface IListDataResult {
  /** The fetched items (with lookup fields nested into objects) */
  items: Array<any>;
  /** Whether data came from cache */
  fromCache: boolean;
  /** Any error that occurred */
  error?: Error;
  /** Paging token for next page (from renderListDataAsStream NextHref) */
  nextHref?: string;
  /** Paging token for previous page (from renderListDataAsStream PrevHref) */
  prevHref?: string;
  /** First row index in the current page */
  firstRow?: number;
  /** Last row index in the current page */
  lastRow?: number;
  /** Row limit configured on the view */
  rowLimit?: number;
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
   * Generates a unique cache key for a list/view/filter combination
   */
  public getCacheKey(siteUrl: string, listId: string, viewId: string, camlFilter?: string, pagingToken?: string): string {
    const base = `${siteUrl}_${listId}_${viewId}${camlFilter ? `_${camlFilter}` : ''}${pagingToken ? `_page_${pagingToken}` : ''}`;
    return `list_${btoa(base).replace(/[=+/]/g, '_')}`;
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

    // Bypass cache entirely for paged requests — only cache page 1.
    // Paged data is sequential/ephemeral; caching individual pages causes stale hits.
    const isPaged = !!config.pagingToken;

    const cacheKey = this.getCacheKey(siteUrl, listId, viewId, config.camlFilter, config.pagingToken);

    try {
      if (this.cacheEnabled && !isPaged) {
        // Check if we have cached data first (page 1 only)
        const cachedResult = this.cacheService.get<IListDataResult>(cacheKey);
        if (cachedResult !== undefined) {
          return { ...cachedResult, fromCache: true };
        }

        // Fetch fresh data and cache it
        const result = await this.fetchFromSharePoint(siteUrl, listId, viewId, config.camlFilter, config.viewXml, config.pagingToken);
        this.cacheService.set(cacheKey, result, effectiveTimeout);
        return result;
      } else {
        // Cache disabled or paged request — fetch directly
        return await this.fetchFromSharePoint(siteUrl, listId, viewId, config.camlFilter, config.viewXml, config.pagingToken);
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
    const cacheKey = this.getCacheKey(siteUrl, listId, viewId, config.camlFilter);

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
  public clearListCache(siteUrl: string, listId: string, viewId: string, camlFilter?: string): void {
    const cacheKey = this.getCacheKey(siteUrl, listId, viewId, camlFilter);
    this.cacheService.remove(cacheKey);
  }

  /**
   * Checks if data for a list is currently cached
   */
  public isListCached(siteUrl: string, listId: string, viewId: string, camlFilter?: string): boolean {
    const cacheKey = this.getCacheKey(siteUrl, listId, viewId, camlFilter);
    return this.cacheService.has(cacheKey);
  }

  /**
   * Merges an additional CAML filter into a view's ListViewXml.
   * If the view already has a <Where> clause, the two are combined with <And>.
   * If no <Where> exists, one is injected inside the <Query> element.
   */
  public mergeCamlFilter(viewXml: string, camlFilter: string): string {
    if (!camlFilter || !camlFilter.trim()) return viewXml;

    const hasWhere = /<Where>/i.test(viewXml);

    if (hasWhere) {
      // Extract existing <Where>...</Where> content and wrap both in <And>
      return viewXml.replace(
        /<Where>([\s\S]*?)<\/Where>/i,
        `<Where><And>$1${camlFilter}</And></Where>`
      );
    }

    // No existing <Where> — inject inside <Query> if present, otherwise wrap the whole view
    const hasQuery = /<Query>/i.test(viewXml);
    if (hasQuery) {
      return viewXml.replace(
        /<Query>/i,
        `<Query><Where>${camlFilter}</Where>`
      );
    }

    // No <Query> at all — inject before closing </View>
    return viewXml.replace(
      /<\/View>/i,
      `<Query><Where>${camlFilter}</Where></Query></View>`
    );
  }

  /**
   * Internal method to fetch data directly from SharePoint using renderListDataAsStream.
   * Returns items with lookup/person fields automatically expanded and nested into objects.
   */
  private async fetchFromSharePoint(
    siteUrl: string,
    listId: string,
    viewId: string,
    camlFilter?: string,
    storedViewXml?: string,
    pagingToken?: string
  ): Promise<IListDataResult> {
    try {
      // Create a context for the target site
      const spSite = spfi(siteUrl).using(AssignFrom(this.sp.web));
      
      // Get list reference
      const list = spSite.web.lists.getById(listId);
      
      // Use stored ViewXml if available, otherwise fetch at runtime
      let viewXml: string;
      if (storedViewXml) {
        viewXml = storedViewXml;
      } else {
        const view = await list.views.getById(viewId).select('ListViewXml')();
        viewXml = view.ListViewXml;
      }
      
      // Inject CAML filter if provided
      if (camlFilter) {
        viewXml = this.mergeCamlFilter(viewXml, camlFilter);
      }
      
      // Execute via renderListDataAsStream — returns rich lookup/person data natively
      const renderParams: any = {
        ViewXml: viewXml,
        RenderOptions: [RenderListDataOptions.ListData],
        ExpandUserField: true
      };

      // Paging: NextHref is a query string like "?Paged=TRUE&p_Title=...&p_ID=1602&PageFirstRow=31"
      // PnPjs renderListDataAsStream accepts these as a Map<string, string> in the third argument
      let queryMap: Map<string, string> | undefined;
      if (pagingToken) {
        const qs = pagingToken.startsWith('?') ? pagingToken.substring(1) : pagingToken;
        const map = new Map<string, string>();
        const params = new URLSearchParams(qs);
        params.forEach((value, key) => { map.set(key, value); });
        queryMap = map;
      }

      const response = await list.renderListDataAsStream(renderParams, undefined, queryMap);

      // Post-process rows to nest dot-notation lookup fields into proper objects
      const items = (response.Row || []).map((row: any) => ListDataService.nestLookupFields(row));

      return {
        items,
        fromCache: false,
        nextHref: response.NextHref,
        prevHref: (response as any).PrevHref,
        firstRow: response.FirstRow,
        lastRow: response.LastRow,
        rowLimit: response.RowLimit
      };
    } catch (error) {
      console.error(`ListDataService: Error fetching from SharePoint (${siteUrl}):`, error);
      throw error;
    }
  }

  /**
   * Normalizes any data object through the same pipeline as list items:
   * dot-notation nesting, PascalCase keys, multi-lookup/multi-choice parsing.
   * Use for user profile, page data, or any object that should match item field conventions.
   */
  public static normalizeData(data: Record<string, any>): Record<string, any> {
    return ListDataService.nestLookupFields(data);
  }

  /**
   * Converts flattened dot-notation fields from renderListDataAsStream into nested objects,
   * and parses multi-lookup "id;#value;#id;#value" strings into arrays of {Id, Title}.
   *
   * Dot-notation example:
   *   { "Author": "John", "Author.id": "5", "Author.title": "John Doe" }
   *   → { "Author": { "Value": "John", "Id": "5", "Title": "John Doe" } }
   *
   * Multi-lookup example:
   *   { "Tags": "1;#Engineering;#2;#Marketing" }
   *   → { "Tags": [{ Id: 1, Title: "Engineering" }, { Id: 2, Title: "Marketing" }] }
   */
  public static nestLookupFields(row: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    const nestedKeys = new Set<string>();

    // First pass: identify all dot-notation keys and group them
    for (const key of Object.keys(row)) {
      const dotIndex = key.indexOf('.');
      if (dotIndex > 0) {
        const parent = key.substring(0, dotIndex);
        let child = key.substring(dotIndex + 1);
        nestedKeys.add(parent);

        // Normalize: bare dot → Id, otherwise PascalCase the first letter
        if (child === '') {
          child = 'Id';
        } else {
          child = child.charAt(0).toUpperCase() + child.slice(1);
        }

        if (!result[parent] || typeof result[parent] !== 'object' || Array.isArray(result[parent])) {
          // Initialize or convert to nested object, preserving existing base value
          const existing = result[parent];
          result[parent] = existing !== undefined && typeof existing !== 'object'
            ? { Value: existing }
            : (typeof existing === 'object' && !Array.isArray(existing) ? existing : {});
        }

        if (child) {
          result[parent][child] = row[key];
        }
      } else if (!nestedKeys.has(key)) {
        // Simple field — copy directly
        result[key] = row[key];
      } else {
        // This key was already flagged as a nested parent; store base value
        if (typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key].Value = row[key];
        } else {
          result[key] = { Value: row[key] };
        }
      }
    }

    // Second pass: parse SharePoint delimited strings into structured data.
    // Check multi-choice first (;#val;#val;#), then multi-lookup (id;#val;#id;#val).
    // Also PascalCase object keys inside arrays (person fields come as [{id, title, email}]).
    for (const key of Object.keys(result)) {
      const val = result[key];
      if (typeof val === 'string' && val.includes(';#')) {
        const multiChoice = ListDataService.parseMultiChoice(val);
        if (multiChoice) {
          result[key] = multiChoice;
          continue;
        }
        const multiLookup = ListDataService.parseMultiLookup(val);
        if (multiLookup) {
          result[key] = multiLookup;
        }
      } else if (Array.isArray(val)) {
        // PascalCase keys in array items (e.g. person fields: [{id, title, email}] → [{Id, Title, Email}])
        result[key] = val.map((item: any) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            return ListDataService.pascalCaseKeys(item);
          }
          return item;
        });
      }
    }

    return result;
  }

  /**
   * Parses a SharePoint multi-lookup string "id;#value;#id;#value" into an array of {Id, Title}.
   * Returns null if the string doesn't match the multi-lookup pattern.
   */
  private static parseMultiLookup(value: string): Array<{ Id: number; Title: string }> | null {
    // Must contain ;# to be a candidate
    if (!value || !value.includes(';#')) return null;

    const parts = value.split(';#');
    // Multi-lookup produces pairs: [id, value, id, value, ...]
    // Must have an even number of parts (id/value pairs)
    if (parts.length < 2 || parts.length % 2 !== 0) return null;

    const items: Array<{ Id: number; Title: string }> = [];
    for (let i = 0; i < parts.length; i += 2) {
      const id = parseInt(parts[i], 10);
      if (isNaN(id)) return null; // Not a valid multi-lookup string
      items.push({ Id: id, Title: parts[i + 1] });
    }

    return items;
  }

  /**
   * PascalCases all keys of a plain object.
   * e.g. { id: "5", title: "John", email: "j@co.com", jobTitle: "Dev" }
   *    → { Id: "5", Title: "John", Email: "j@co.com", JobTitle: "Dev" }
   */
  private static pascalCaseKeys(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
      result[pascalKey] = obj[key];
    }
    return result;
  }

  /**
   * Parses a SharePoint multi-choice string ";#Value1;#Value2;#" into an array of strings.
   * MultiChoice values start and end with ;# — this distinguishes them from multi-lookup.
   * Returns null if the string doesn't match the multi-choice pattern.
   */
  private static parseMultiChoice(value: string): string[] | null {
    // MultiChoice format: ";#Engineering;#Marketing;#Sales;#"
    if (!value.startsWith(';#') || !value.endsWith(';#')) return null;

    // Strip leading and trailing ;# then split on ;#
    const inner = value.substring(2, value.length - 2);
    if (!inner) return null;

    return inner.split(';#');
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
    if (!enabled) {
      this.clearAllCache();
    }
  }

  /**
   * Updates cache timeout
   */
  public setCacheTimeout(minutes: number): void {
    this.cacheTimeoutMinutes = minutes;
  }
}
