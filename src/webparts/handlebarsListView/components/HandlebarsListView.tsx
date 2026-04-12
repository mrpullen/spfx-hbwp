/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import type { IHandlebarsListViewProps, IListDataSource, IHttpEndpointDataSource } from './IHandlebarsListViewProps';
import Handlebars from "handlebars";

import helpers from 'handlebars-helpers'
import ReactHtmlParser from 'react-html-parser';
import { ListDataService, IListDataResult, HttpDataService, FormSubmitService, generateFormHandlerScript, generateFormResponseHandlerScript, SocialDataService, generateSocialHandlerScript, ITokenContext } from '../services';
import { scopeCssClasses } from './scopeCssClasses';

/**
 * Resolves {{token}} expressions in a string using a context object.
 * Supports dot-notation and array indexing (e.g. {{user.email}}, {{page.Id}}).
 */
function resolveTokens(template: string, context: ITokenContext): string {
  if (!template) return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    try {
      const parts = path.trim().replace(/\[(\d+)\]/g, '.$1').split('.');
      let current: any = context;
      for (const part of parts) {
        if (current === undefined || current === null) return '';
        current = current[part];
      }
      return current === undefined || current === null ? '' : String(current);
    } catch {
      return '';
    }
  });
}

interface IHandlebarsListViewState {
  html: string;
  visible: boolean;
}

/**
 * Envelope wrapping list data rows with paging metadata.
 * Used for primary items and every additional data source.
 */
interface IDataEnvelope {
  rows: Array<any>;
  paging: {
    hasNext: boolean;
    hasPrev: boolean;
    nextHref?: string;
    prevHref?: string;
    firstRow?: number;
    lastRow?: number;
    rowLimit?: number;
  };
}

interface ITemplateData {
  items: IDataEnvelope;
  user: any;
  page: any;
  /** Additional data sources are spread at root level by their key */
  [key: string]: any;
}

helpers({ handlebars: Handlebars });

// Override json helper with pretty-printed output
Handlebars.registerHelper('json', function(context: unknown) {
  return JSON.stringify(context, null, 2);
});

// Register custom form helpers
/* eslint-disable dot-notation */
Handlebars.registerHelper('hbwp-form', function(this: any, options: Handlebars.HelperOptions) {
  const endpointKey = options.hash['endpoint'] || options.hash['submit'] || 'default';
  const resetOnSuccess = options.hash['reset'] !== false;
  const cssClass = options.hash['class'] || '';
  const id = options.hash['id'] || '';
  
  const content = options.fn(this);
  
  return new Handlebars.SafeString(
    `<form data-hbwp-submit="${endpointKey}" data-hbwp-reset="${resetOnSuccess}"${id ? ` id="${id}"` : ''}${cssClass ? ` class="${cssClass}"` : ''}>
      ${content}
      <div data-hbwp-result style="margin-top: 12px;"></div>
    </form>`
  );
});

Handlebars.registerHelper('hbwp-submit', function(options: Handlebars.HelperOptions) {
  const label = options.hash['label'] || 'Submit';
  const appearance = options.hash['appearance'] || 'accent';
  const disabled = options.hash['disabled'] ? 'disabled' : '';
  const cssClass = options.hash['class'] || '';
  
  return new Handlebars.SafeString(
    `<fluent-button type="submit" appearance="${appearance}" ${disabled} class="${cssClass}">${label}</fluent-button>`
  );
});

Handlebars.registerHelper('hbwp-input', function(options: Handlebars.HelperOptions) {
  const name = options.hash['name'] || '';
  const label = options.hash['label'] || '';
  const type = options.hash['type'] || 'text';
  const required = options.hash['required'] ? 'required' : '';
  const pattern = options.hash['pattern'] ? `pattern="${options.hash['pattern']}"` : '';
  const minlength = options.hash['minlength'] ? `minlength="${options.hash['minlength']}"` : '';
  const maxlength = options.hash['maxlength'] ? `maxlength="${options.hash['maxlength']}"` : '';
  const placeholder = options.hash['placeholder'] || '';
  const value = options.hash['value'] || '';
  
  return new Handlebars.SafeString(
    `<fluent-text-field name="${name}" type="${type}" ${required} ${pattern} ${minlength} ${maxlength} placeholder="${placeholder}" value="${value}" style="width: 100%;">${label}</fluent-text-field>`
  );
});

Handlebars.registerHelper('hbwp-textarea', function(options: Handlebars.HelperOptions) {
  const name = options.hash['name'] || '';
  const label = options.hash['label'] || '';
  const required = options.hash['required'] ? 'required' : '';
  const rows = options.hash['rows'] || 3;
  const placeholder = options.hash['placeholder'] || '';
  
  return new Handlebars.SafeString(
    `<fluent-text-area name="${name}" ${required} rows="${rows}" placeholder="${placeholder}" style="width: 100%;">${label}</fluent-text-area>`
  );
});

Handlebars.registerHelper('hbwp-select', function(this: any, options: Handlebars.HelperOptions) {
  const name = options.hash['name'] || '';
  const label = options.hash['label'] || '';
  const required = options.hash['required'] ? 'required' : '';
  
  const content = options.fn(this);
  
  return new Handlebars.SafeString(
    `<label style="display: block; margin-bottom: 4px; font-weight: 600;">${label}</label>
    <fluent-select name="${name}" ${required} style="width: 100%;">
      ${content}
    </fluent-select>`
  );
});

Handlebars.registerHelper('hbwp-checkbox', function(options: Handlebars.HelperOptions) {
  const name = options.hash['name'] || '';
  const label = options.hash['label'] || '';
  const required = options.hash['required'] ? 'required' : '';
  const checked = options.hash['checked'] ? 'checked' : '';
  
  return new Handlebars.SafeString(
    `<fluent-checkbox name="${name}" ${required} ${checked}>${label}</fluent-checkbox>`
  );
});

// Helper to generate JSON data attribute for hidden fields
Handlebars.registerHelper('hbwp-hidden', function(options: Handlebars.HelperOptions) {
  const name = options.hash['name'] || '';
  const value = options.hash['value'] || '';
  
  return new Handlebars.SafeString(
    `<input type="hidden" name="${name}" value="${value}" />`
  );
});

// Custom helper: filter an array by property value (handles SharePoint lookup fields)
Handlebars.registerHelper('filter', function(this: any, array: any[], property: string, value: any, options: any) {
  if (!Array.isArray(array)) {
    // Block usage: render else block if array is not valid
    if (options && options.fn) {
      return options.inverse(this);
    }
    return [];
  }
  const filtered = array.filter((item: any) => {
    const propValue = item[property];
    // Handle lookup fields (SharePoint returns {Id, Title} for lookups)
    if (propValue && typeof propValue === 'object' && propValue.Id !== undefined) {
      return String(propValue.Id) === String(value) || propValue.Title === value;
    }
    return String(propValue) === String(value);
  });

  // Block usage: {{#filter arr "prop" val}}...{{else}}...{{/filter}}
  if (options && options.fn) {
    if (filtered.length > 0) {
      return options.fn(this);
    }
    return options.inverse(this);
  }

  // Inline usage: returns the filtered array
  return filtered;
});

// Custom helper: calculate percentage (returns integer)
Handlebars.registerHelper('percentage', function(count: number, total: number) {
  if (!total || total === 0) return 0;
  return Math.round((count / total) * 100);
});

// Custom helper: get substring of a string
Handlebars.registerHelper('substring', function(str: string, start: number, end?: number) {
  if (!str || typeof str !== 'string') return '';
  if (end !== undefined) {
    return str.substring(start, end);
  }
  return str.substring(start);
});

// Custom helper: concatenate strings (not in handlebars-helpers, they have 'join' for arrays)
Handlebars.registerHelper('concat', function(...args: any[]) {
  // Remove the last argument (Handlebars options object)
  const strings = args.slice(0, -1);
  return strings.join('');
});

// Custom helper: output data as formatted JSON for debugging
Handlebars.registerHelper('json', function(context: any) {
  return JSON.stringify(context, null, 2);
});

// Custom helper: render star rating as HTML (e.g. ★★★★☆)
Handlebars.registerHelper('starRating', function(rating: any) {
  const val = parseFloat(rating) || 0;
  const full = Math.floor(val);
  const half = (val - full) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return new Handlebars.SafeString(
    '<span style="color:#ffb900;">' + '\u2605'.repeat(full) +
    (half ? '\u2BEA' : '') + '</span>' +
    '<span style="color:#d2d0ce;">' + '\u2606'.repeat(empty) + '</span>'
  );
});

/* eslint-enable dot-notation */

export default class HandlebarsListView extends React.Component<IHandlebarsListViewProps, IHandlebarsListViewState> {
  
  private listDataService: ListDataService | undefined;
  private httpDataService: HttpDataService | undefined;
  private formSubmitService: FormSubmitService | undefined;
  private socialDataService: SocialDataService | undefined;
  private containerRef: React.RefObject<HTMLDivElement>;

  constructor(props: IHandlebarsListViewProps) {
    super(props);
    this.state = {
      html: '',
      visible: false
    };
    
    this.containerRef = React.createRef();
    
    // Initialize list data service if sp is available
    if (props.sp) {
      this.listDataService = new ListDataService(props.sp, {
        enabled: props.cacheOptions?.enabled ?? true,
        timeoutMinutes: props.cacheOptions?.timeoutMinutes ?? 15
      });
    }
    
    // Initialize HTTP data service if both clients are available
    if (props.aadHttpClientFactory && props.httpClient) {
      this.httpDataService = new HttpDataService(
        props.aadHttpClientFactory, 
        props.httpClient,
        {
          enabled: props.cacheOptions?.enabled ?? true,
          timeoutMinutes: props.cacheOptions?.timeoutMinutes ?? 15
        }
      );
    }
    
    // Initialize form submit service if all clients are available
    if (props.sp && props.aadHttpClientFactory && props.httpClient) {
      this.formSubmitService = new FormSubmitService(
        props.sp,
        props.aadHttpClientFactory,
        props.httpClient
      );
      // Register submit endpoints if provided
      if (props.submitEndpoints) {
        this.formSubmitService.registerEndpoints(props.submitEndpoints);
      }
    }
    
    // Initialize social data service
    if (props.sp) {
      this.socialDataService = new SocialDataService(props.sp);
    }

    // Bind event handlers
    this.handleFormSubmit = this.handleFormSubmit.bind(this);
    this.handleSocialAction = this.handleSocialAction.bind(this);
  }


  public async componentDidMount(): Promise<void> {
    await this.getHandlebarsTemplate();
    
    // Add event listeners
    if (this.containerRef.current) {
      this.containerRef.current.addEventListener('hbwp-form-submit', this.handleFormSubmit as EventListener);
      this.containerRef.current.addEventListener('hbwp-social-action', this.handleSocialAction as EventListener);
    }
  }
  
  public componentWillUnmount(): void {
    // Remove event listeners
    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener('hbwp-form-submit', this.handleFormSubmit as EventListener);
      this.containerRef.current.removeEventListener('hbwp-social-action', this.handleSocialAction as EventListener);
    }
  }

  /**
   * Handles form submission events from the template
   */
  private async handleFormSubmit(event: CustomEvent): Promise<void> {
    const { endpointKey, formData, form, submitButton, originalButtonText } = event.detail;
    
    if (!this.formSubmitService) {
      console.error('FormSubmitService not initialized');
      this.dispatchFormResult(form, submitButton, originalButtonText, false, 'Form service not available');
      return;
    }
    
    try {
      const result = await this.formSubmitService.submit(endpointKey, formData);
      this.dispatchFormResult(form, submitButton, originalButtonText, result.success, result.error);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.dispatchFormResult(form, submitButton, originalButtonText, false, errorMessage);
    }
  }
  
  /**
   * Dispatches the form result event back to the template
   */
  private dispatchFormResult(form: HTMLFormElement, submitButton: HTMLElement, originalButtonText: string, success: boolean, error?: string): void {
    const resultEvent = new CustomEvent('hbwp-form-result', {
      bubbles: true,
      detail: { success, error, form, submitButton, originalButtonText }
    });
    form.dispatchEvent(resultEvent);
  }

  /**
   * Handles social action events (like/unlike/rate) from the template
   */
  private async handleSocialAction(event: CustomEvent): Promise<void> {
    const { action, itemId, currentlyLiked, value } = event.detail;
    const siteUrl = this.props.site?.url;
    const listId = this.props.list;

    if (!this.socialDataService || !siteUrl || !listId) return;

    try {
      if (action === 'like') {
        // Fire-and-forget: the client script already applied optimistic UI.
        // Don't re-render — SharePoint may not have propagated the change yet.
        this.socialDataService.toggleLike(siteUrl, listId, Number(itemId), currentlyLiked === true || currentlyLiked === 'true')
          .then(() => {
            // Invalidate cache so the next full render picks up the new state
            if (this.listDataService) {
              this.listDataService.clearListCache(siteUrl, listId, this.props.view || '');
            }
          })
          .catch((error: any) => console.error('Like toggle failed:', error));
      } else if (action === 'rate') {
        await this.socialDataService.rate(siteUrl, listId, Number(itemId), Number(value));
        // Re-fetch for ratings since server computes the average
        if (this.listDataService) {
          this.listDataService.clearListCache(siteUrl, listId, this.props.view || '');
        }
        await this.getHandlebarsTemplate();
      }
    } catch (error) {
      console.error('Social action failed:', error);
    }
  }

  public async componentDidUpdate(prevProps: IHandlebarsListViewProps): Promise<void> {
    // Re-render if relevant props changed
    if (
      prevProps.template !== this.props.template ||
      prevProps.list !== this.props.list ||
      prevProps.view !== this.props.view ||
      prevProps.site?.url !== this.props.site?.url ||
      JSON.stringify(prevProps.dataSources) !== JSON.stringify(this.props.dataSources) ||
      JSON.stringify(prevProps.httpEndpoints) !== JSON.stringify(this.props.httpEndpoints) ||
      JSON.stringify(prevProps.submitEndpoints) !== JSON.stringify(this.props.submitEndpoints)
    ) {
      await this.getHandlebarsTemplate();
    }
    
    // Update submit endpoints if they changed
    if (this.formSubmitService && this.props.submitEndpoints) {
      if (JSON.stringify(prevProps.submitEndpoints) !== JSON.stringify(this.props.submitEndpoints)) {
        this.formSubmitService.registerEndpoints(this.props.submitEndpoints);
      }
    }
    
    // Update cache settings if they changed
    if (this.listDataService) {
      if (prevProps.cacheOptions?.enabled !== this.props.cacheOptions?.enabled) {
        this.listDataService.setCacheEnabled(this.props.cacheOptions?.enabled ?? true);
      }
      if (prevProps.cacheOptions?.timeoutMinutes !== this.props.cacheOptions?.timeoutMinutes) {
        this.listDataService.setCacheTimeout(this.props.cacheOptions?.timeoutMinutes ?? 15);
      }
    }
    
    if (this.httpDataService) {
      if (prevProps.cacheOptions?.enabled !== this.props.cacheOptions?.enabled) {
        this.httpDataService.setCacheEnabled(this.props.cacheOptions?.enabled ?? true);
      }
      if (prevProps.cacheOptions?.timeoutMinutes !== this.props.cacheOptions?.timeoutMinutes) {
        this.httpDataService.setCacheTimeout(this.props.cacheOptions?.timeoutMinutes ?? 15);
      }
    }
  }
  
  private async getHandlebarsTemplate(): Promise<void> {
    const templateData = await this.getAllData();

    // Scope CSS classes in <style> blocks with the web part instance ID
    const wpId = this.props.instanceId;
    const scopedTemplate = scopeCssClasses(this.props.template, wpId);

    const template = Handlebars.compile(scopedTemplate);
    const templateContent = template(templateData);
    
    // Inject form handler scripts if submit endpoints are configured
    const formScripts = this.props.submitEndpoints && this.props.submitEndpoints.length > 0
      ? generateFormHandlerScript(wpId) + generateFormResponseHandlerScript(wpId)
      : '';
  
    const socialScripts = generateSocialHandlerScript(wpId);

    this.setState({
      html: templateContent + formScripts + socialScripts,
      visible: true
    });
  }

  /**
   * Builds an IDataEnvelope from an IListDataResult.
   */
  private static toEnvelope(result: IListDataResult): IDataEnvelope {
    return {
      rows: result.items,
      paging: {
        hasNext: !!result.nextHref,
        hasPrev: !!result.prevHref,
        nextHref: result.nextHref,
        prevHref: result.prevHref,
        firstRow: result.firstRow,
        lastRow: result.lastRow,
        rowLimit: result.rowLimit
      }
    };
  }

  /**
   * Loads all data including primary list, additional data sources, HTTP endpoints, and user profile
   */
  private async getAllData(): Promise<ITemplateData> {
    // Build token context from user and page data (available before list fetches)
    const filterTokenContext: ITokenContext = {
      user: this.props.userProfile || {},
      page: this.props.pageData || {}
    };

    // Get primary list data (with resolved CAML filter)
    const primaryResult = await this.getPrimaryListData(filterTokenContext);
    const primaryEnvelope = HandlebarsListView.toEnvelope(primaryResult);

    // Get additional data sources (with resolved CAML filters)
    const dataSources = await this.getAdditionalDataSources(filterTokenContext);

    // Build full token context for HTTP endpoints (includes list data rows)
    const dsRows: Record<string, any> = {};
    for (const key of Object.keys(dataSources)) {
      dsRows[key] = dataSources[key].rows;
    }
    const tokenContext: ITokenContext = {
      items: primaryEnvelope.rows,
      user: this.props.userProfile || {},
      page: this.props.pageData || {},
      ...dsRows
    };

    // Get HTTP endpoint data (can use tokens from list data, user, and page)
    const httpData = await this.getHttpEndpointData(tokenContext);

    // Build template data object with data sources spread at root level
    // Each list data source is an envelope: { rows: [...], paging: {...} }
    const templateData: ITemplateData = {
      items: primaryEnvelope,
      user: ListDataService.normalizeData(this.props.userProfile || {}),
      page: ListDataService.normalizeData(this.props.pageData || {}),
      // Include instanceId for unique DOM element IDs when multiple web parts are on a page
      wpId: this.props.instanceId,
      instanceId: this.props.instanceId,
      siteUrl: this.props.site?.url || '',
      ...dataSources,
      ...httpData
    };

    return templateData;
  }

  /**
   * Gets primary list data using the ListDataService
   */
  private async getPrimaryListData(tokenContext: ITokenContext): Promise<IListDataResult> {
    const { site, list, view, viewXml, camlFilter } = this.props;

    if (!this.listDataService || !site?.url || !list || !view) {
      return { items: [], fromCache: false };
    }

    const resolvedFilter = camlFilter ? resolveTokens(camlFilter, tokenContext) : undefined;

    return this.listDataService.getListData({
      siteUrl: site.url,
      listId: list,
      viewId: view,
      viewXml: viewXml || undefined,
      camlFilter: resolvedFilter
    });
  }

  /**
   * Gets all additional data sources using the ListDataService, wrapped in envelopes
   */
  private async getAdditionalDataSources(tokenContext: ITokenContext): Promise<Record<string, IDataEnvelope>> {
    const { dataSources } = this.props;
    const result: Record<string, IDataEnvelope> = {};

    if (!this.listDataService || !dataSources || dataSources.length === 0) {
      return result;
    }

    // Build configs for all data sources
    const configs = dataSources
      .filter((ds: IListDataSource & { siteUrl?: string }) => {
        const siteUrl = ds.site?.url || ds.siteUrl;
        return siteUrl && ds.listId && ds.viewId;
      })
      .map((ds: IListDataSource & { siteUrl?: string }) => ({
        key: ds.key,
        config: {
          siteUrl: (ds.site?.url || ds.siteUrl) as string,
          listId: ds.listId,
          viewId: ds.viewId,
          viewXml: ds.viewXml || undefined,
          camlFilter: ds.camlFilter ? resolveTokens(ds.camlFilter, tokenContext) : undefined
        },
        timeoutMinutes: ds.cacheTimeoutMinutes
      }));

    // Fetch all data sources using the service
    const fetchResults = await this.listDataService.getMultipleListData(configs);
    
    for (const key of Object.keys(fetchResults)) {
      result[key] = HandlebarsListView.toEnvelope(fetchResults[key]);
    }

    return result;
  }

  /**
   * Gets all HTTP endpoint data using the HttpDataService
   */
  private async getHttpEndpointData(tokenContext: ITokenContext): Promise<Record<string, any>> {
    const { httpEndpoints } = this.props;
    const result: Record<string, any> = {};

    if (!this.httpDataService || !httpEndpoints || httpEndpoints.length === 0) {
      return result;
    }

    // Filter valid endpoints (key and url required, auth validation done in service)
    const validEndpoints = httpEndpoints.filter(
      (ep: IHttpEndpointDataSource) => ep.key && ep.url
    );

    if (validEndpoints.length === 0) {
      return result;
    }

    // Fetch all endpoints using the service
    const fetchResults = await this.httpDataService.getMultipleHttpData(
      validEndpoints.map(ep => ({
        key: ep.key,
        url: ep.url,
        authType: ep.authType,
        appId: ep.appId,
        apiKeyHeaderName: ep.apiKeyHeaderName,
        apiKeyValue: ep.apiKeyValue,
        bearerToken: ep.bearerToken,
        method: ep.method,
        queryParams: ep.queryParams,
        body: ep.body,
        headers: ep.headers,
        cacheTimeoutMinutes: ep.cacheTimeoutMinutes
      })),
      tokenContext
    );
    
    for (const key of Object.keys(fetchResults)) {
      const fetchResult = fetchResults[key];
      if (fetchResult.error) {
        console.error(`Error fetching HTTP endpoint '${key}':`, fetchResult.error);
        result[key] = null;
      } else {
        result[key] = fetchResult.data;
      }
    }

    return result;
  }
  
  public render(): React.ReactElement<IHandlebarsListViewProps> {
    const { html, visible } = this.state;
    return (
      <div ref={this.containerRef}>
        {visible ? <div>{ReactHtmlParser(html)}</div> : null}
      </div>
    );
  }
}
