/* eslint-disable @typescript-eslint/no-explicit-any */
import { IPlatformServices, IDataAdapterInstanceConfig } from '@mrpullen/spfx-extensibility';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { SPFI } from '@pnp/sp';
import { IPropertyFieldSite } from '@pnp/spfx-property-controls';

/**
 * Configuration passed to the factory from the web part's property bag.
 * Keeps the factory decoupled from IHandlebarsListViewWebPartProps.
 */
export interface IPlatformServicesFactoryConfig {
  /** PnPjs SPFI instance (already initialised by the web part) */
  sp?: SPFI;
  /** SPFx WebPartContext (gives us httpClient, aadHttpClientFactory, pageContext) */
  webPartContext: WebPartContext;
}

/**
 * Builds the `IPlatformServices` DI bag consumed by DataAdapterBase subclasses.
 *
 * Deliberately a pure function — no hidden state, easy to test, easy to call
 * from any web part or service.
 */
export function buildPlatformServices(config: IPlatformServicesFactoryConfig): IPlatformServices {
  const ctx = config.webPartContext;
  return {
    sp: config.sp,
    httpClient: ctx.httpClient,
    aadHttpClientFactory: ctx.aadHttpClientFactory,
    pageContext: ctx.pageContext
  };
}

// ── Adapter config builder ─────────────────────────────────────────────────

/**
 * Everything the config builder needs from the web part's property bag.
 * Keeps the builder decoupled from the full IHandlebarsListViewWebPartProps.
 */
export interface IAdapterConfigSource {
  sites?: IPropertyFieldSite[];
  list?: string;
  view?: string;
  viewXml?: string;
  camlFilter?: string;
  enableCache?: boolean;
  cacheTimeoutMinutes?: number;
  cloudEnvironment?: string;
  dataSources?: Array<{
    key: string;
    site?: IPropertyFieldSite;
    siteUrl?: string;
    listId: string;
    viewId: string;
    viewXml?: string;
    camlFilter?: string;
    cacheTimeoutMinutes?: number;
  }>;
  httpEndpoints?: Array<{
    key: string;
    url: string;
    authType?: string;
    appId?: string;
    apiKeyHeaderName?: string;
    apiKeyValue?: string;
    bearerToken?: string;
    method?: string;
    queryParams?: Array<{ name: string; value: string }>;
    body?: string;
    headers?: Record<string, string>;
    cacheTimeoutMinutes?: number;
  }>;
  submitEndpoints?: Array<any>;
  sp?: SPFI;
}

/** Cloud-environment → Flow resource URI mapping (duplicated to keep factory self-contained) */
const FLOW_RESOURCE_URIS: Record<string, string> = {
  commercial: 'https://service.flow.microsoft.com/',
  gcc: 'https://gov.service.flow.microsoft.us/',
  gcchigh: 'https://high.service.flow.microsoft.us/'
};

/**
 * Builds `IDataAdapterInstanceConfig[]` from legacy property pane fields.
 *
 * Pure function — maps the existing property-pane structure to the unified
 * adapter-instance model without touching any web part internals.
 */
export function buildAdapterConfigs(src: IAdapterConfigSource): IDataAdapterInstanceConfig[] {
  const configs: IDataAdapterInstanceConfig[] = [];
  const flowResourceUri = FLOW_RESOURCE_URIS[src.cloudEnvironment || 'commercial'];
  const cacheEnabled = src.enableCache ?? true;
  const cacheTimeout = src.cacheTimeoutMinutes ?? 15;

  // ── User profile (always) ──
  configs.push({ key: 'user', adapterId: 'user-profile', properties: {} });

  // ── Page data (always) ──
  configs.push({ key: 'page', adapterId: 'sharepoint-page', properties: {} });

  // ── Primary list ──
  const primarySite = src.sites?.[0];
  if (primarySite?.url && src.list && src.view) {
    configs.push({
      key: 'items',
      adapterId: 'sharepoint-list',
      properties: {
        siteUrl: primarySite.url,
        listId: src.list,
        viewId: src.view,
        viewXml: src.viewXml || undefined,
        camlFilter: src.camlFilter || undefined,
        cacheTimeoutMinutes: cacheTimeout,
        cacheEnabled
      }
    });
  }

  // ── Additional list data sources ──
  if (src.dataSources) {
    for (const ds of src.dataSources) {
      const siteUrl = ds.site?.url || ds.siteUrl;
      if (!siteUrl || !ds.listId || !ds.viewId) continue;
      configs.push({
        key: ds.key,
        adapterId: 'sharepoint-list',
        properties: {
          siteUrl,
          listId: ds.listId,
          viewId: ds.viewId,
          viewXml: ds.viewXml || undefined,
          camlFilter: ds.camlFilter || undefined,
          cacheTimeoutMinutes: ds.cacheTimeoutMinutes ?? cacheTimeout,
          cacheEnabled
        }
      });
    }
  }

  // ── HTTP endpoints ──
  if (src.httpEndpoints) {
    for (const ep of src.httpEndpoints) {
      if (!ep.key || !ep.url) continue;
      configs.push({
        key: ep.key,
        adapterId: 'http',
        dependsOn: ['items'],
        properties: {
          url: ep.url,
          authType: ep.authType || 'aad',
          appId: ep.appId,
          apiKeyHeaderName: ep.apiKeyHeaderName,
          apiKeyValue: ep.apiKeyValue,
          bearerToken: ep.bearerToken,
          method: ep.method || 'GET',
          queryParams: ep.queryParams,
          body: ep.body,
          headers: ep.headers,
          cacheTimeoutMinutes: ep.cacheTimeoutMinutes ?? cacheTimeout,
          cacheEnabled,
          flowResourceUri
        }
      });
    }
  }

  // ── Social (write-only) ──
  if (src.sp && primarySite?.url && src.list) {
    configs.push({
      key: '_social',
      adapterId: 'social',
      properties: { siteUrl: primarySite.url, listId: src.list }
    });
  }

  // ── Form submit (write-only) ──
  if (src.submitEndpoints && src.submitEndpoints.length > 0) {
    configs.push({
      key: '_formSubmit',
      adapterId: 'form-submit',
      properties: { endpoints: src.submitEndpoints, flowResourceUri }
    });
  }

  return configs;
}
