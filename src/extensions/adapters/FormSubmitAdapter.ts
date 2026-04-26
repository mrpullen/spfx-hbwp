/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataAdapterBase,
  DataAdapterCapability,
  IDataAdapterContext,
  IDataAdapterWriteResult,
  IDataAdapterPropertyDefinition,
  IPlatformServices,
  PlatformServiceKey
} from '@mrpullen/spfx-extensibility';
import { FormSubmitService } from '../services/FormSubmitService';
import { ISubmitEndpoint } from '../../webparts/handlebarsListView/components/IHandlebarsListViewProps';

/**
 * Built-in adapter for form submissions to SharePoint lists or HTTP endpoints.
 *
 * Wraps FormSubmitService.  Write-only — called by the HbwpFormElement
 * web component or template-driven form submission.
 *
 * Endpoint routing is by key: the adapter's instance config holds an array
 * of submit endpoints, each with a key, type ('sharepoint' | 'http'), and
 * the corresponding connection details.
 *
 * Supported operations:
 *  - execute('submit', { endpointKey, formData })
 *  - execute('registerEndpoints', { endpoints: ISubmitEndpoint[] })
 */
export class FormSubmitAdapter extends DataAdapterBase {
  public readonly adapterId = 'form-submit';
  public readonly adapterName = 'Form Submit';
  public readonly capability: DataAdapterCapability = 'write';

  private inner: FormSubmitService;

  constructor(services: IPlatformServices) {
    super(services);
    /* eslint-disable dot-notation */
    const sp = services['sp'];
    const aadHttpClientFactory = services['aadHttpClientFactory'];
    const httpClient = services['httpClient'];
    /* eslint-enable dot-notation */
    this.inner = new FormSubmitService(sp, aadHttpClientFactory, httpClient);
  }

  public getRequiredServices(): PlatformServiceKey[] {
    return ['sp', 'aadHttpClientFactory', 'httpClient'];
  }

  /**
   * Register endpoints from external config (e.g. web part properties).
   * Call this after construction so the inner service knows where to route.
   */
  public registerEndpoints(endpoints: ISubmitEndpoint[]): void {
    this.inner.registerEndpoints(endpoints);
  }

  public async execute(
    operation: string,
    payload: any,
    _context: IDataAdapterContext
  ): Promise<IDataAdapterWriteResult> {
    switch (operation) {
      case 'submit': {
        const { endpointKey, formData } = payload;
        if (!endpointKey || !formData) {
          return { success: false, error: 'submit requires endpointKey and formData' };
        }
        const result = await this.inner.submit(endpointKey, formData);
        return { success: result.success, data: result.data, error: result.error };
      }

      case 'registerEndpoints': {
        const { endpoints } = payload;
        if (Array.isArray(endpoints)) {
          this.inner.registerEndpoints(endpoints);
        }
        return { success: true };
      }

      default:
        return { success: false, error: `Unknown form-submit operation: ${operation}` };
    }
  }

  public getPropertyDefinitions(): IDataAdapterPropertyDefinition[] {
    // Submit endpoints are configured at the web part level (property pane
    // collection data), not per adapter instance.
    return [];
  }
}
