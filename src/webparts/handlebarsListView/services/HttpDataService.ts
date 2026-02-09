/* eslint-disable @typescript-eslint/no-explicit-any */
import { AadHttpClient, AadHttpClientFactory, HttpClientResponse, HttpClient, IHttpClientOptions } from '@microsoft/sp-http';
import { CacheService, ICacheConfig } from './CacheService';

/**
 * Query parameter configuration with optional token replacement
 */
export interface IQueryParameter {
  /** Parameter name */
  name: string;
  /** Parameter value - can include tokens like {{user.email}} or {{items[0].Id}} */
  value: string;
}

/**
 * Authentication type for HTTP endpoints
 */
export type HttpAuthType = 'aad' | 'anonymous' | 'apiKey' | 'bearer';

/**
 * HTTP endpoint configuration
 */
export interface IHttpEndpointConfig {
  /** Unique key to identify this endpoint in the template */
  key: string;
  /** The endpoint URL (can include tokens) */
  url: string;
  /** Authentication type (default: 'aad') */
  authType?: HttpAuthType;
  /** Azure AD App Registration Client ID - required for authType: 'aad' */
  appId?: string;
  /** API Key header name - for authType: 'apiKey' */
  apiKeyHeaderName?: string;
  /** API Key value - for authType: 'apiKey' */
  apiKeyValue?: string;
  /** Bearer token - for authType: 'bearer' */
  bearerToken?: string;
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query parameters */
  queryParams?: IQueryParameter[];
  /** Request body for POST/PUT (can include tokens) */
  body?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Token context for replacing tokens in URLs, query params, and body
 */
export interface ITokenContext {
  /** Current user profile */
  user?: Record<string, any>;
  /** Primary list items */
  items?: Array<any>;
  /** Additional data sources by key */
  [key: string]: any;
}

/**
 * Result of an HTTP endpoint fetch operation
 */
export interface IHttpDataResult {
  /** The fetched data */
  data: any;
  /** Whether data came from cache */
  fromCache: boolean;
  /** HTTP status code (if not from cache) */
  status?: number;
  /** Any error that occurred */
  error?: Error;
}

/**
 * Service for fetching data from HTTP endpoints with multiple auth options
 */
export class HttpDataService {
  private aadHttpClientFactory: AadHttpClientFactory;
  private httpClient: HttpClient;
  private cacheService: CacheService;
  private cacheEnabled: boolean;
  private cacheTimeoutMinutes: number;
  private aadClientCache: Map<string, AadHttpClient> = new Map();

  constructor(
    aadHttpClientFactory: AadHttpClientFactory,
    httpClient: HttpClient,
    cacheConfig?: {
      enabled?: boolean;
      timeoutMinutes?: number;
      cacheServiceConfig?: Partial<ICacheConfig>;
    }
  ) {
    this.aadHttpClientFactory = aadHttpClientFactory;
    this.httpClient = httpClient;
    this.cacheEnabled = cacheConfig?.enabled ?? true;
    this.cacheTimeoutMinutes = cacheConfig?.timeoutMinutes ?? 15;
    
    // Initialize cache service with shared prefix
    this.cacheService = new CacheService({
      keyPrefix: 'hbwp_http_',
      timeoutMinutes: this.cacheTimeoutMinutes,
      ...cacheConfig?.cacheServiceConfig
    });
  }

  /**
   * Replaces tokens in a string with values from the context
   * Tokens format: {{path.to.value}} e.g., {{user.email}}, {{items[0].Id}}
   */
  public replaceTokens(template: string, context: ITokenContext): string {
    if (!template) return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      try {
        const value = this.getValueByPath(context, path.trim());
        if (value === undefined || value === null) {
          console.warn(`HttpDataService: Token '${match}' resolved to undefined`);
          return '';
        }
        return String(value);
      } catch (error) {
        console.warn(`HttpDataService: Error resolving token '${match}':`, error);
        return '';
      }
    });
  }

  /**
   * Gets a value from an object by dot-notation path (supports array indexing)
   * e.g., "user.email", "items[0].Title", "announcements[2].Author.Title"
   */
  private getValueByPath(obj: any, path: string): any {
    // Parse path with array notation support
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  /**
   * Generates a unique cache key for an HTTP endpoint configuration
   */
  public getCacheKey(config: IHttpEndpointConfig, context: ITokenContext): string {
    const resolvedUrl = this.replaceTokens(config.url, context);
    const resolvedParams = config.queryParams?.map(p => 
      `${p.name}=${this.replaceTokens(p.value, context)}`
    ).join('&') || '';
    const resolvedBody = config.body ? this.replaceTokens(config.body, context) : '';
    
    // Create a unique key from the resolved request
    const requestSignature = `${config.method || 'GET'}:${resolvedUrl}?${resolvedParams}:${resolvedBody}`;
    return `http_${btoa(requestSignature).replace(/[=+/]/g, '_')}`;
  }

  /**
   * Gets or creates an AadHttpClient for the specified app ID
   */
  private async getAadClient(appId: string): Promise<AadHttpClient> {
    const cached = this.aadClientCache.get(appId);
    if (cached) {
      return cached;
    }

    const client = await this.aadHttpClientFactory.getClient(appId);
    this.aadClientCache.set(appId, client);
    return client;
  }

  /**
   * Fetches data from an HTTP endpoint with configurable authentication
   * @param config - HTTP endpoint configuration
   * @param context - Token context for variable replacement
   * @param timeoutMinutes - Optional cache timeout override (uses default if not provided)
   */
  public async getHttpData(
    config: IHttpEndpointConfig,
    context: ITokenContext,
    timeoutMinutes?: number
  ): Promise<IHttpDataResult> {
    const { url, authType = 'aad', appId } = config;
    const effectiveTimeout = timeoutMinutes ?? this.cacheTimeoutMinutes;

    if (!url) {
      return { data: null, fromCache: false, error: new Error('Missing required URL') };
    }

    // Validate auth-specific requirements
    if (authType === 'aad' && !appId) {
      return { data: null, fromCache: false, error: new Error('AAD auth requires appId') };
    }

    const cacheKey = this.getCacheKey(config, context);

    try {
      if (this.cacheEnabled) {
        // Check if we have cached data first
        const cachedData = this.cacheService.get<any>(cacheKey);
        if (cachedData !== undefined) {
          return { data: cachedData, fromCache: true };
        }

        // Use getOrFetch which handles mutex locking
        const data = await this.cacheService.getOrFetch(
          cacheKey,
          async () => this.fetchFromEndpoint(config, context),
          effectiveTimeout
        );
        
        return { data, fromCache: false };
      } else {
        // Cache disabled, fetch directly
        const data = await this.fetchFromEndpoint(config, context);
        return { data, fromCache: false };
      }
    } catch (error) {
      console.error(`HttpDataService: Error fetching from ${url}:`, error);
      return { data: null, fromCache: false, error: error as Error };
    }
  }

  /**
   * Fetches data from multiple HTTP endpoints in parallel
   */
  public async getMultipleHttpData(
    configs: Array<IHttpEndpointConfig & { cacheTimeoutMinutes?: number }>,
    context: ITokenContext
  ): Promise<Record<string, IHttpDataResult>> {
    const results: Record<string, IHttpDataResult> = {};

    // Fetch all in parallel
    const fetchPromises = configs.map(async (config) => {
      const result = await this.getHttpData(config, context, config.cacheTimeoutMinutes);
      return { key: config.key, result };
    });

    const fetchResults = await Promise.all(fetchPromises);
    
    for (const { key, result } of fetchResults) {
      results[key] = result;
    }

    return results;
  }

  /**
   * Internal method to fetch data from an HTTP endpoint with configurable auth
   */
  private async fetchFromEndpoint(
    config: IHttpEndpointConfig,
    context: ITokenContext
  ): Promise<any> {
    const { 
      url, 
      authType = 'aad', 
      appId, 
      apiKeyHeaderName, 
      apiKeyValue, 
      bearerToken,
      method = 'GET', 
      queryParams, 
      body, 
      headers 
    } = config;

    // Resolve tokens in URL
    let resolvedUrl = this.replaceTokens(url, context);

    // Build query string with resolved tokens
    if (queryParams && queryParams.length > 0) {
      const params = new URLSearchParams();
      for (const param of queryParams) {
        const resolvedValue = this.replaceTokens(param.value, context);
        params.append(param.name, resolvedValue);
      }
      const queryString = params.toString();
      resolvedUrl += (resolvedUrl.includes('?') ? '&' : '?') + queryString;
    }

    // Build request headers
    const requestHeaders: Record<string, string> = {
      'Accept': 'application/json',
      ...headers
    };

    // Add auth-specific headers
    if (authType === 'apiKey' && apiKeyHeaderName && apiKeyValue) {
      requestHeaders[apiKeyHeaderName] = apiKeyValue;
    } else if (authType === 'bearer' && bearerToken) {
      // eslint-disable-next-line dot-notation
      requestHeaders['Authorization'] = `Bearer ${bearerToken}`;
    }

    let response: HttpClientResponse;
    const resolvedBody = body ? this.replaceTokens(body, context) : undefined;

    if (authType === 'aad' && appId) {
      // Use AAD HTTP Client for Azure AD authenticated calls
      response = await this.fetchWithAadClient(appId, resolvedUrl, method, requestHeaders, resolvedBody);
    } else {
      // Use standard HTTP Client for anonymous, apiKey, or bearer auth
      response = await this.fetchWithHttpClient(resolvedUrl, method, requestHeaders, resolvedBody);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // Try to parse as JSON, fall back to text
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }

  /**
   * Fetch using AAD HTTP Client (for Azure AD protected APIs)
   */
  private async fetchWithAadClient(
    appId: string,
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<HttpClientResponse> {
    const client = await this.getAadClient(appId);

    if (method === 'GET') {
      return client.get(url, AadHttpClient.configurations.v1, { headers });
    } else {
      return client.fetch(url, AadHttpClient.configurations.v1, {
        method,
        headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
        body
      });
    }
  }

  /**
   * Fetch using standard HTTP Client (for anonymous, API key, or bearer auth)
   */
  private async fetchWithHttpClient(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<HttpClientResponse> {
    const options: IHttpClientOptions = {
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers
    };

    if (method === 'GET') {
      return this.httpClient.get(url, HttpClient.configurations.v1, options);
    } else {
      return this.httpClient.fetch(url, HttpClient.configurations.v1, {
        ...options,
        method,
        body
      });
    }
  }

  /**
   * Forces a refresh of cached data for a specific endpoint
   */
  public async refreshHttpData(
    config: IHttpEndpointConfig,
    context: ITokenContext
  ): Promise<IHttpDataResult> {
    const cacheKey = this.getCacheKey(config, context);
    
    // Remove from cache first
    this.cacheService.remove(cacheKey);
    
    // Fetch fresh data
    return this.getHttpData(config, context);
  }

  /**
   * Clears all cached HTTP data
   */
  public clearAllCache(): void {
    this.cacheService.clearAll();
  }

  /**
   * Clears cached data for a specific endpoint
   */
  public clearEndpointCache(config: IHttpEndpointConfig, context: ITokenContext): void {
    const cacheKey = this.getCacheKey(config, context);
    this.cacheService.remove(cacheKey);
  }

  /**
   * Checks if data for an endpoint is currently cached
   */
  public isEndpointCached(config: IHttpEndpointConfig, context: ITokenContext): boolean {
    const cacheKey = this.getCacheKey(config, context);
    return this.cacheService.has(cacheKey);
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
