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
import { PageDataService } from '../services/PageDataService';
import { ListDataService } from '../services/ListDataService';

/**
 * Built-in adapter for current page metadata.
 *
 * Wraps PageDataService.  Read-only, fetches all fields from the current
 * Site Pages item.  Cached for 5 minutes by default.
 *
 * Typically used as a singleton instance named "page" so templates
 * can reference {{page.Title}}, {{page.Id}}, etc.
 *
 * Config properties:
 *  - listId, itemId are resolved from pageContext at runtime if not overridden
 */
export class PageDataAdapter extends DataAdapterBase {
  public readonly adapterId = 'sharepoint-page';
  public readonly adapterName = 'SharePoint Page';
  public readonly capability: DataAdapterCapability = 'read';

  private inner: PageDataService;

  constructor(services: IPlatformServices) {
    super(services);
    // eslint-disable-next-line dot-notation
    const sp = services['sp'];
    this.inner = new PageDataService(sp);
  }

  public getRequiredServices(): PlatformServiceKey[] { return ['sp']; }
  public getOptionalServices(): PlatformServiceKey[] { return ['pageContext']; }

  public async fetch(context: IDataAdapterContext): Promise<IDataAdapterResult> {
    // eslint-disable-next-line dot-notation
    const pageContext = this.services['pageContext'];

    // Prefer explicit config; fall back to pageContext
    const listId = (context.config.listId as string)
      || pageContext?.list?.id?.toString()
      || '';
    const itemId = (context.config.itemId as number)
      || pageContext?.listItem?.id
      || 0;

    if (!listId || !itemId) {
      return { data: {}, error: 'Page Data adapter requires listId and itemId (or a valid pageContext)' };
    }

    try {
      const data = await this.inner.getPageData(listId, itemId);
      // Normalize so templates can use the same field-access conventions as
      // list items (dot-notation lookups, multi-choice arrays, etc.).
      return { data: ListDataService.normalizeData(data), fromCache: false };
    } catch (err) {
      return { data: {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public getPropertyDefinitions(): IDataAdapterPropertyDefinition[] {
    return [
      { propertyName: 'listId', label: 'Site Pages List ID', type: 'text', description: 'Leave blank to auto-detect from page context.', order: 1 },
      { propertyName: 'itemId', label: 'Page Item ID', type: 'text', description: 'Leave blank to auto-detect from page context.', order: 2 },
    ];
  }

  public clearCache(): void {
    this.inner.clearCache();
  }
}
