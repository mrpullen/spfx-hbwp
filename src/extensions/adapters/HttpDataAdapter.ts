/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataAdapterBase,
  DataAdapterCapability,
  IDataAdapterContext,
  IDataAdapterResult,
  IDataAdapterWriteResult,
  IDataAdapterPropertyDefinition,
  IPlatformServices,
  PlatformServiceKey
} from '@mrpullen/spfx-extensibility';
import {
  HttpDataService,
  IHttpEndpointConfig,
  ITokenContext,
  HttpAuthType
} from '../services/HttpDataService';

/**
 * Built-in adapter for HTTP endpoint data (REST APIs, Power Automate flows, etc.).
 *
 * Wraps HttpDataService.  Read-write: `fetch()` does GET requests with
 * token resolution from upstream adapter data; `execute()` handles
 * POST / PUT / DELETE.
 *
 * Config properties (set in property pane per instance):
 *  - url        (required)
 *  - authType   ('aad' | 'anonymous' | 'apiKey' | 'bearer' | 'flow')
 *  - appId      (for AAD)
 *  - method     (for fetch — default GET; for execute — overridden by operation)
 *  - body, headers, queryParams
 *  - cacheTimeoutMinutes
 */
export class HttpDataAdapter extends DataAdapterBase {
  public readonly adapterId = 'http';
  public readonly adapterName = 'HTTP Endpoint';
  public readonly capability: DataAdapterCapability = 'read-write';

  private inner: HttpDataService;

  constructor(services: IPlatformServices) {
    super(services);
    /* eslint-disable dot-notation */
    const aadHttpClientFactory = services['aadHttpClientFactory'];
    const httpClient = services['httpClient'];
    /* eslint-enable dot-notation */
    this.inner = new HttpDataService(aadHttpClientFactory, httpClient);
  }

  public getRequiredServices(): PlatformServiceKey[] {
    return ['aadHttpClientFactory', 'httpClient'];
  }

  // ── Read ────────────────────────────────────────────────────────────────

  public async fetch(context: IDataAdapterContext): Promise<IDataAdapterResult> {
    const config = this.buildEndpointConfig(context.config);
    const tokenCtx = this.buildTokenContext(context);

    const result = await this.inner.getHttpData(config, tokenCtx, context.config.cacheTimeoutMinutes as number | undefined);

    return {
      data: result.data,
      fromCache: result.fromCache,
      error: result.error?.message
    };
  }

  // ── Write ───────────────────────────────────────────────────────────────

  public async execute(
    operation: string,
    payload: any,
    context: IDataAdapterContext
  ): Promise<IDataAdapterWriteResult> {
    const methodMap: Record<string, 'POST' | 'PUT' | 'DELETE'> = {
      post: 'POST',
      put: 'PUT',
      delete: 'DELETE',
      submit: 'POST'
    };
    const method = methodMap[operation.toLowerCase()];
    if (!method) {
      return { success: false, error: `Unknown HTTP operation: ${operation}` };
    }

    const configOverrides: Record<string, any> = {
      ...context.config,
      method
    };
    // Allow payload to override URL and body
    if (payload?.url) configOverrides.url = payload.url;
    if (payload?.body !== undefined) configOverrides.body = typeof payload.body === 'string'
      ? payload.body
      : JSON.stringify(payload.body);

    const config = this.buildEndpointConfig(configOverrides);
    const tokenCtx = this.buildTokenContext(context);

    const result = await this.inner.getHttpData(config, tokenCtx);

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, data: result.data };
  }

  // ── Property pane ───────────────────────────────────────────────────────

  public getPropertyDefinitions(): IDataAdapterPropertyDefinition[] {
    return [
      { propertyName: 'url', label: 'Endpoint URL', type: 'text', required: true, description: 'Supports tokens: {{user.email}}, {{items[0].Id}}, etc.', order: 1 },
      { propertyName: 'authType', label: 'Auth Type', type: 'dropdown', defaultValue: 'aad', options: [
          { key: 'aad', text: 'Azure AD' },
          { key: 'anonymous', text: 'Anonymous' },
          { key: 'apiKey', text: 'API Key' },
          { key: 'bearer', text: 'Bearer Token' },
          { key: 'flow', text: 'Power Automate Flow' },
        ], order: 2 },
      { propertyName: 'appId', label: 'AAD App ID', type: 'text', description: 'Required for Azure AD auth.', order: 3 },
      { propertyName: 'method', label: 'HTTP Method', type: 'dropdown', defaultValue: 'GET', options: [
          { key: 'GET', text: 'GET' },
          { key: 'POST', text: 'POST' },
          { key: 'PUT', text: 'PUT' },
          { key: 'DELETE', text: 'DELETE' },
        ], order: 4 },
      { propertyName: 'body', label: 'Request Body', type: 'code', description: 'JSON body for POST/PUT. Supports tokens.', order: 5 },
      { propertyName: 'apiKeyHeaderName', label: 'API Key Header', type: 'text', description: 'Header name for API Key auth.', order: 6 },
      { propertyName: 'apiKeyValue', label: 'API Key Value', type: 'text', description: 'Header value for API Key auth.', order: 7 },
      { propertyName: 'bearerToken', label: 'Bearer Token', type: 'text', description: 'Token for Bearer auth.', order: 8 },
      { propertyName: 'cacheTimeoutMinutes', label: 'Cache (minutes)', type: 'slider', defaultValue: 15, description: '0 = disabled.', order: 9 },
    ];
  }

  public clearCache(): void {
    // HttpDataService doesn't expose clearAll — adapters with cache can be
    // re-instantiated if a full clear is needed.
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private buildEndpointConfig(cfg: Record<string, any>): IHttpEndpointConfig {
    return {
      key: '_adapter',
      url: cfg.url || '',
      method: (cfg.method as 'GET' | 'POST' | 'PUT' | 'DELETE') || 'GET',
      authType: (cfg.authType as HttpAuthType) || 'aad',
      appId: cfg.appId,
      apiKeyHeaderName: cfg.apiKeyHeaderName,
      apiKeyValue: cfg.apiKeyValue,
      bearerToken: cfg.bearerToken,
      headers: cfg.headers,
      body: cfg.body,
      queryParams: cfg.queryParams
    };
  }

  private buildTokenContext(context: IDataAdapterContext): ITokenContext {
    return {
      user: context.user,
      page: context.page,
      query: context.query,
      items: context.resolvedData?.items?.data || context.resolvedData?.items,
      ...Object.entries(context.resolvedData || {}).reduce((acc, [k, v]) => {
        // If the resolved data is an adapter result, unwrap .data
        acc[k] = v?.data !== undefined ? v.data : v;
        return acc;
      }, {} as Record<string, any>)
    };
  }
}
