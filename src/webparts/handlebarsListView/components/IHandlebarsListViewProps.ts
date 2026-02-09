import { SPFI } from "@pnp/sp";
import { IPropertyFieldSite } from "@pnp/spfx-property-controls";
import { AadHttpClientFactory, HttpClient } from "@microsoft/sp-http";
import { IUserProfile } from "../services";

/**
 * Configuration for a single list data source
 */
export interface IListDataSource {
  /** Unique key to identify this data source in the template */
  key: string;
  /** The site containing the list */
  site: IPropertyFieldSite;
  /** The list GUID */
  listId: string;
  /** The view GUID */
  viewId: string;
  /** Cache timeout in minutes for this specific data source (overrides global) */
  cacheTimeoutMinutes?: number;
}

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
 * HTTP endpoint configuration for API calls with multiple auth options
 */
export interface IHttpEndpointDataSource {
  /** Unique key to identify this endpoint in the template */
  key: string;
  /** The endpoint URL (can include tokens like {{user.email}}) */
  url: string;
  /** Authentication type (default: 'aad') */
  authType?: HttpAuthType;
  /** Azure AD App Registration Client ID - required for authType: 'aad' */
  appId?: string;
  /** API Key header name - for authType: 'apiKey' (e.g., 'X-API-Key', 'Ocp-Apim-Subscription-Key') */
  apiKeyHeaderName?: string;
  /** API Key value - for authType: 'apiKey' */
  apiKeyValue?: string;
  /** Bearer token - for authType: 'bearer' (e.g., Power Automate SAS token) */
  bearerToken?: string;
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query parameters */
  queryParams?: IQueryParameter[];
  /** Request body for POST/PUT (can include tokens) */
  body?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Cache timeout in minutes for this specific endpoint (overrides global) */
  cacheTimeoutMinutes?: number;
}

/**
 * Cache configuration options
 */
export interface ICacheOptions {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Cache timeout in minutes (default: 15) */
  timeoutMinutes: number;
}

/**
 * Submit endpoint type
 */
export type SubmitEndpointType = 'sharepoint' | 'http';

/**
 * SharePoint list submit configuration
 */
export interface ISharePointSubmitConfig {
  /** Site where the list resides */
  site: IPropertyFieldSite;
  /** List GUID to submit to */
  listId: string;
}

/**
 * HTTP submit configuration (reuses HTTP auth types)
 */
export interface IHttpSubmitConfig {
  /** The endpoint URL */
  url: string;
  /** Authentication type */
  authType: HttpAuthType;
  /** Azure AD App ID (for authType: 'aad') */
  appId?: string;
  /** API Key header name (for authType: 'apiKey') */
  apiKeyHeaderName?: string;
  /** API Key value (for authType: 'apiKey') */
  apiKeyValue?: string;
  /** Bearer token (for authType: 'bearer') */
  bearerToken?: string;
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Submit endpoint configuration for receiving form data
 */
export interface ISubmitEndpoint {
  /** Unique key to identify this submit endpoint in templates */
  key: string;
  /** Display name for the endpoint */
  name: string;
  /** Type of endpoint */
  type: SubmitEndpointType;
  /** SharePoint configuration (when type: 'sharepoint') */
  sharePointConfig?: ISharePointSubmitConfig;
  /** HTTP configuration (when type: 'http') */
  httpConfig?: IHttpSubmitConfig;
}

export interface IHandlebarsListViewProps {
  sp?: SPFI;
  /** AAD HTTP Client Factory for authenticated API calls */
  aadHttpClientFactory?: AadHttpClientFactory;
  /** HTTP Client for non-AAD authenticated calls */
  httpClient?: HttpClient;
  /** Legacy single list support */
  site?: IPropertyFieldSite;
  list?: string;
  view?: string;
  /** Multiple list data sources */
  dataSources: IListDataSource[];
  /** HTTP endpoint data sources */
  httpEndpoints?: IHttpEndpointDataSource[];
  /** Submit endpoints for form data */
  submitEndpoints?: ISubmitEndpoint[];
  /** Handlebars template */
  template: string;
  /** Cache configuration */
  cacheOptions: ICacheOptions;
  /** Current user profile (loaded on init) */
  userProfile?: IUserProfile;
  /** Web part instance ID for unique cache keys */
  instanceId: string;
}
