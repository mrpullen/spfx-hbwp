/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataAdapterBase,
  DataAdapterCapability,
  IDataAdapterContext,
  IDataAdapterResult,
  IDataAdapterPropertyDefinition,
  IPlatformServices,
  PlatformServiceKey
} from '@mrpullen/spfx-extensibility';
import { ListDataService, IListFetchConfig } from '../services/ListDataService';
import { resolveCamlFilter } from '../services/CamlFilterResolver';

/**
 * Built-in adapter for SharePoint list data.
 *
 * Wraps ListDataService.  Each instance maps to one list/view combination
 * (primary or additional data source).
 *
 * Config properties (set in property pane):
 *  - siteUrl, listId, viewId  (required)
 *  - viewXml, camlFilter      (optional)
 *  - cacheEnabled, cacheTimeoutMinutes (optional)
 */
export class SharePointListAdapter extends DataAdapterBase {
  public readonly adapterId = 'sharepoint-list';
  public readonly adapterName = 'SharePoint List';
  public readonly capability: DataAdapterCapability = 'read';

  private inner: ListDataService;

  constructor(services: IPlatformServices) {
    super(services);
    // eslint-disable-next-line dot-notation
    const sp = services['sp'];
    this.inner = new ListDataService(sp);
  }

  public getRequiredServices(): PlatformServiceKey[] { return ['sp']; }

  public async fetch(context: IDataAdapterContext): Promise<IDataAdapterResult> {
    const { siteUrl, listId, viewId, viewXml, camlFilter, cacheTimeoutMinutes, cacheIsolation } = context.config;

    if (!siteUrl || !listId || !viewId) {
      return { data: [], error: 'SharePoint List adapter requires siteUrl, listId, and viewId' };
    }

    // Resolve CAML filter tokens from upstream data, with `{{#if-resolved}}`
    // block support and structural normalization (empty And/Or collapsed away).
    let resolvedFilter = camlFilter as string | undefined;
    if (resolvedFilter) {
      resolvedFilter = resolveCamlFilter(resolvedFilter, {
        user: context.user,
        page: context.page,
        query: context.query,
        ...(context.resolvedData || {})
      });
    }
    console.log('[SharePointListAdapter] fetch listId=%s instance=%s resolvedFilter=%s', listId, context.instanceId, resolvedFilter);

    const config: IListFetchConfig = {
      siteUrl,
      listId,
      viewId,
      viewXml,
      camlFilter: resolvedFilter,
      pagingToken: context.pagingToken,
      // When cacheIsolation === true, scope the cache key to this web part's
      // instanceId so two web parts hitting the same list+view don't share a
      // cache slot. Default (undefined / false) keeps the original page-global
      // shared cache for best perf.
      cacheScope: cacheIsolation ? context.instanceId : undefined
    };

    const result = await this.inner.getListData(config, cacheTimeoutMinutes);

    return {
      data: result.items,
      fromCache: result.fromCache,
      paging: {
        hasNext: !!result.nextHref,
        hasPrev: !!result.prevHref,
        nextToken: result.nextHref,
        prevToken: result.prevHref,
        pageNumber: result.firstRow !== undefined && result.rowLimit
          ? Math.floor((result.firstRow - 1) / result.rowLimit) + 1
          : undefined,
        totalRows: undefined
      },
      error: result.error?.message
    };
  }

  public getPropertyDefinitions(): IDataAdapterPropertyDefinition[] {
    return [
      { propertyName: 'siteUrl',    label: 'Site URL', type: 'sitePicker', required: true, order: 1 },
      { propertyName: 'listId',     label: 'List',     type: 'listPicker', required: true, order: 2 },
      { propertyName: 'viewId',     label: 'View',     type: 'viewPicker', required: true, order: 3 },
      { propertyName: 'camlFilter', label: 'CAML Filter', type: 'multiline', description: 'Optional CAML Where clause. Supports tokens like {{user.email}}, {{page.Id}}.', order: 4 },
      { propertyName: 'cacheTimeoutMinutes', label: 'Cache (minutes)', type: 'slider', defaultValue: 15, description: 'How long to cache results. 0 = disabled.', order: 5 },
      { propertyName: 'cacheIsolation', label: 'Per-Web-Part Cache', type: 'toggle', defaultValue: false, description: 'OFF (default): cache shared across web parts hitting the same list+view+filter. ON: this web part keeps its own private cache slot.', order: 6 },
    ];
  }

  public clearCache(): void {
    this.inner.clearAllCache();
  }
}
