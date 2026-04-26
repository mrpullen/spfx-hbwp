/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import type { IHandlebarsListViewProps } from './IHandlebarsListViewProps';

// ListDataService is no longer needed here — adapters emit already-normalized
// data via the pipeline's data-changed envelopes.
import { DataAdapterPipeline } from '../services';
import { registerServiceContext, unregisterServiceContext, IServiceContext, IDataEnvelope as IMessageEnvelope, TemplateEngineBase, ITemplateEngineContext, getPageState, clearPageState, IPageState, IDataAdapterResult, IDataAdapterContext } from '@mrpullen/spfx-extensibility';
import { HandlebarsTemplateEngine } from '../../../extensions/engines';

interface IHandlebarsListViewState {}

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
    pageNumber?: number;
  };
}

interface ITemplateData {
  items: IDataEnvelope;
  user: any;
  page: any;
  /** Additional data sources are spread at root level by their key */
  [key: string]: any;
}

export default class HandlebarsListView extends React.Component<IHandlebarsListViewProps, IHandlebarsListViewState> {

  // Pipeline for main data loading and write operations (form submit, social)
  private _pipeline: DataAdapterPipeline | undefined;
  private _adapterResults: Record<string, IDataAdapterResult> = {};

  private containerRef: React.RefObject<HTMLDivElement>;
  /** Unsubscribe callbacks for MessageBus subscriptions (per adapter topic) */
  private _busUnsubs: (() => void)[] = [];
  /** Debounce timer for collapsing burst result updates into a single render */
  private _renderTimer: number | undefined;
  /** The active template engine instance */
  private _templateEngine: TemplateEngineBase | undefined;
  /** Reactive state store scoped to this web part instance */
  private _pageState: IPageState | undefined;

  constructor(props: IHandlebarsListViewProps) {
    super(props);
    this.state = {};

    this.containerRef = React.createRef();

    // Bind event handlers
    this.handleContainerClick = this.handleContainerClick.bind(this);
  }

  /**
   * executeWrite delegate exposed on the ServiceContext so web components
   * (HbwpFormElement, HbwpLikeElement, HbwpRateElement) can invoke pipeline
   * write adapters without importing pipeline internals.
   */
  private executeWrite = async (
    key: string,
    operation: string,
    payload: any
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    if (!this._pipeline) return { success: false, error: 'Pipeline not initialized' };
    return this._pipeline.executeWrite(key, operation, payload, this.buildBaseContext());
  };

  /**
   * executeRead delegate — non-mutating ad-hoc reads against any adapter
   * that exposes an `executeRead` method. Does not publish bus envelopes.
   */
  private executeRead = async (
    key: string,
    operation: string,
    payload: any
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    if (!this._pipeline) return { success: false, error: 'Pipeline not initialized' };
    return this._pipeline.executeRead(key, operation, payload, this.buildBaseContext());
  };

  public async componentDidMount(): Promise<void> {
    // Create a PageState instance scoped to this web part
    this._pageState = getPageState(this.props.instanceId);

    // Initialize the pipeline first so executeWrite is wired before web
    // components render and call into the ServiceContext.
    this.initPipeline();

    // Publish service context so extensibility web components can reach
    // pipeline write adapters and shared metadata.
    const ctx: IServiceContext = {
      instanceId: this.props.instanceId,
      siteUrl: this.props.site?.url,
      listId: this.props.list,
      executeWrite: this.executeWrite,
      executeRead: this.executeRead,
      userProfile: this.props.userProfile,
      pageData: this.props.pageData,
      cloudEnvironment: this.props.cloudEnvironment,
      messageBus: this.props.messageBus,
      pageState: this._pageState
    };
    registerServiceContext(ctx);

    // Subscribe to each adapter's data-changed envelope; attach pipeline to bus.
    this.subscribeToAdapterResults();
    if (this._pipeline && this.props.messageBus) {
      await this._pipeline.attach(this.props.messageBus, () => this.buildBaseContext());
    } else {
      // No message bus → render whatever scaffold exists
      await this.renderTemplate();
    }

    // Attach delegated event listeners directly on the container.
    if (this.containerRef.current) {
      this.containerRef.current.addEventListener('click', this.handleContainerClick);
    }
  }

  public componentWillUnmount(): void {
    // Unsubscribe from MessageBus
    this._busUnsubs.forEach(fn => fn());
    this._busUnsubs = [];
    clearTimeout(this._renderTimer);

    // Destroy the template engine if it was active
    if (this._templateEngine && this.containerRef.current) {
      this._templateEngine.destroy(this.containerRef.current);
      this._templateEngine = undefined;
    }

    // Detach + dispose the data adapter pipeline
    this._pipeline?.dispose();
    this._pipeline = undefined;

    // Clean up PageState for this web part instance
    clearPageState(this.props.instanceId);
    this._pageState = undefined;

    unregisterServiceContext(this.props.instanceId);
    if (this.containerRef.current) {
      this.containerRef.current.removeEventListener('click', this.handleContainerClick);
    }
  }

  /**
   * Delegated click handler for template interactions:
   * - MessageBus publish: data-hbwp-action + data-hbwp-topic (inline path)
   * - Panel open/close: data-hbwp-panel-open="id" / data-hbwp-panel-close="id"
   *
   * Social actions and paging are handled by the dedicated <hbwp-like>,
   * <hbwp-rate> and <hbwp-pager> web components.
   */
  private handleContainerClick(e: Event): void {
    const target = e.target as HTMLElement;

    // ── MessageBus topic publish (data-hbwp-action + data-hbwp-topic) ──
    const actionEl = target.closest<HTMLElement>('[data-hbwp-action]');
    if (actionEl) {
      const action = actionEl.getAttribute('data-hbwp-action');
      const topic = actionEl.getAttribute('data-hbwp-topic');
      if (action && topic && this.props.messageBus) {
        let item: Record<string, any> | undefined;
        let items: Record<string, any>[] | undefined;
        const itemJson = actionEl.getAttribute('data-hbwp-item');
        const itemsJson = actionEl.getAttribute('data-hbwp-items');
        try { if (itemJson) item = JSON.parse(itemJson); } catch (_e) { /* ignore bad JSON */ }
        try { if (itemsJson) items = JSON.parse(itemsJson); } catch (_e) { /* ignore bad JSON */ }

        const envelope: IMessageEnvelope = {
          topic,
          source: this.props.instanceId,
          timestamp: Date.now(),
          action: action as IMessageEnvelope['action'],
          data: { ...(item !== undefined ? { item } : {}), ...(items !== undefined ? { items } : {}) }
        };
        this.props.messageBus.publish(envelope);
      }
    }

    // ── Panel open / close ──
    const panelOpen = target.closest<HTMLElement>('[data-hbwp-panel-open]');
    if (panelOpen) {
      const panelId = panelOpen.getAttribute('data-hbwp-panel-open');
      if (panelId) {
        const panel = document.getElementById(panelId) as any;
        if (panel) {
          if (typeof panel.show === 'function') {
            panel.show();
          } else {
            panel.setAttribute('data-hbwp-open', '');
          }
        }
      }
      return;
    }

    const panelClose = target.closest<HTMLElement>('[data-hbwp-panel-close]');
    if (panelClose) {
      const panelId = panelClose.getAttribute('data-hbwp-panel-close');
      if (panelId) {
        const panel = document.getElementById(panelId) as any;
        if (panel) {
          if (typeof panel.hide === 'function') {
            panel.hide();
          } else {
            panel.removeAttribute('data-hbwp-open');
          }
        }
      }
      return;
    }
  }

  public async componentDidUpdate(prevProps: IHandlebarsListViewProps): Promise<void> {
    const configsChanged =
      prevProps.list !== this.props.list ||
      prevProps.view !== this.props.view ||
      prevProps.site?.url !== this.props.site?.url ||
      JSON.stringify(prevProps.dataSources) !== JSON.stringify(this.props.dataSources) ||
      JSON.stringify(prevProps.httpEndpoints) !== JSON.stringify(this.props.httpEndpoints) ||
      JSON.stringify(prevProps.submitEndpoints) !== JSON.stringify(this.props.submitEndpoints) ||
      JSON.stringify(prevProps.adapterConfigs) !== JSON.stringify(this.props.adapterConfigs) ||
      JSON.stringify(prevProps.incomingItem) !== JSON.stringify(this.props.incomingItem) ||
      JSON.stringify(prevProps.incomingItems) !== JSON.stringify(this.props.incomingItems) ||
      prevProps.cloudEnvironment !== this.props.cloudEnvironment ||
      JSON.stringify(prevProps.cacheOptions) !== JSON.stringify(this.props.cacheOptions);

    if (configsChanged) {
      // Tear down existing pipeline + bus subscriptions and rebuild from scratch
      this._busUnsubs.forEach(fn => fn());
      this._busUnsubs = [];
      this._pipeline?.dispose();
      this._pipeline = undefined;
      this._adapterResults = {};

      this.initPipeline();

      // Update ServiceContext with the refreshed pipeline-backed delegates
      const ctx: IServiceContext = {
        instanceId: this.props.instanceId,
        siteUrl: this.props.site?.url,
        listId: this.props.list,
        executeWrite: this.executeWrite,
        executeRead: this.executeRead,
        userProfile: this.props.userProfile,
        pageData: this.props.pageData,
        cloudEnvironment: this.props.cloudEnvironment,
        messageBus: this.props.messageBus,
        pageState: this._pageState
      };
      registerServiceContext(ctx);

      this.subscribeToAdapterResults();
      const pipeline = this._pipeline as DataAdapterPipeline | undefined;
      if (pipeline && this.props.messageBus) {
        await pipeline.attach(this.props.messageBus, () => this.buildBaseContext());
      } else {
        await this.renderTemplate();
      }
    } else if (prevProps.template !== this.props.template) {
      // Template only — re-render with existing data
      await this.renderTemplate();
    }
  }

  // ── Adapter result subscriptions ──────────────────────────────────────

  /**
   * Subscribe to the `data-changed` envelope on every read adapter's topic.
   * Each result lands in `_adapterResults` and triggers a debounced re-render.
   */
  private subscribeToAdapterResults(): void {
    if (!this._pipeline || !this.props.messageBus) return;
    const configs = this.props.adapterConfigs || [];
    for (const cfg of configs) {
      if (cfg.key.startsWith('_')) continue; // skip write-only adapters
      const unsub = this.props.messageBus.subscribe(cfg.key, (envelope: IMessageEnvelope) => {
        if (envelope.action !== 'data-changed') return;
        const result = envelope.data?.result;
        if (result) {
          this._adapterResults[cfg.key] = result as IDataAdapterResult;
          this.scheduleRender();
        }
      });
      this._busUnsubs.push(unsub);
    }
  }

  /**
   * Debounced render — collapses bursts of data-changed envelopes into a
   * single template render.
   */
  private scheduleRender = (): void => {
    clearTimeout(this._renderTimer);
    this._renderTimer = window.setTimeout(() => this.renderTemplate(), 50);
  };

  // ── Data adapter pipeline ─────────────────────────────────────────────

  /**
   * Initializes the DataAdapterPipeline:
   *   1. Builds the platform-services DI bag (or reuses one passed via props)
   *   2. Registers all adapter type definitions from the extensibility service
   *   3. Instantiates configured adapter instances from props.adapterConfigs
   */
  private initPipeline(): void {
    const services = this.props.platformServices;
    if (!services) {
      console.warn('[HandlebarsListView] No platformServices on props — pipeline disabled');
      return;
    }

    this._pipeline = new DataAdapterPipeline(services);

    // Register adapter type definitions from the extensibility service
    if (this.props.extensibilityService) {
      const defs = this.props.extensibilityService.getDataAdapterDefinitions();
      this._pipeline.registerDefinitions(defs);
    }

    // Instantiate configured adapter instances
    if (this.props.adapterConfigs && this.props.adapterConfigs.length > 0) {
      this._pipeline.instantiate(this.props.adapterConfigs);
    }

    // Seed scaffold so first render has empty defaults for every read adapter
    this._adapterResults = this._pipeline.buildScaffold();
  }

  /**
   * Builds the base context fields shared across every adapter execution.
   * Includes resolvedData seeds for SPFx Dynamic Data tokens (incoming /
   * incomingItems) so adapters can resolve those in CAML / URL templates.
   */
  private buildBaseContext(): Omit<IDataAdapterContext, 'config'> {
    const query: Record<string, string> = {};
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => { query[key] = value; });

    const resolvedData: Record<string, any> = {};
    if (this.props.incomingItem) resolvedData.incoming = this.props.incomingItem;
    if (this.props.incomingItems) resolvedData.incomingItems = this.props.incomingItems;

    return {
      instanceId: this.props.instanceId,
      user: this.props.userProfile || {},
      page: this.props.pageData || {},
      query,
      resolvedData
    };
  }

  /**
   * Renders the configured template engine into the host container.
   *
   * Engine resolution flows through `extensibilityService.createTemplateEngine(engineId)`,
   * so any registered engine (handlebars by default, plus any libraries that
   * contribute their own) handles compile + DOM lifecycle. The web part itself
   * is engine-agnostic — it only assembles the data and hands it to the engine.
   */
  private async renderTemplate(): Promise<void> {
    if (!this.containerRef.current) return;

    const templateData = this.getAllData();
    const wpId = this.props.instanceId;
    const engineId = this.props.templateEngine || 'handlebars';

    // Resolve or create the template engine via the extensibility service
    if (!this._templateEngine || this._templateEngine.engineId !== engineId) {
      if (this._templateEngine) {
        this._templateEngine.destroy(this.containerRef.current);
        this._templateEngine = undefined;
      }
      if (this.props.extensibilityService) {
        this._templateEngine = this.props.extensibilityService.createTemplateEngine(engineId);

        // Handlebars engine needs a back-reference to the extensibility service
        // so it can register custom helpers/partials at compile time.
        if (this._templateEngine instanceof HandlebarsTemplateEngine) {
          this._templateEngine.setExtensibilityService(this.props.extensibilityService);
        }
      }
    }

    if (!this._templateEngine) {
      console.error(`[HandlebarsListView] No template engine resolved for engineId="${engineId}"`);
      return;
    }

    const context: ITemplateEngineContext = {
      instanceId: wpId,
      template: this.props.template,
      engineProperties: {},
      pageState: this._pageState || getPageState(wpId)
    };

    this._templateEngine.render(context, templateData, this.containerRef.current);
  }

  /**
   * Synchronously assembles a placeholder ITemplateData from the latest
   * `_adapterResults` snapshot.
   *
   * This method does NOT fetch — every adapter populates its own slot
   * asynchronously (the pipeline calls `fetch()` on attach + on every
   * `refresh-requested` envelope, then publishes a `data-changed` envelope
   * that the bus subscription in `subscribeToAdapterResults` lands here).
   * Each new envelope schedules a debounced re-render, so this method is
   * called repeatedly with progressively more populated results.
   *
   * Initial render therefore receives a scaffold of empty envelopes from
   * `pipeline.buildScaffold()`, and the template re-renders as adapters
   * resolve.
   *
   * Adapter result conventions (set in BuiltInExtensibilityLibrary):
   *   - 'items'   → primary SharePoint list      → envelope { rows, paging }
   *   - 'user'    → user profile                  → object spread under .user
   *   - 'page'    → SharePoint page metadata      → object spread under .page
   *   - additional list keys → envelope { rows, paging }
   *   - HTTP endpoint keys   → raw data spread at root level
   *   - '_social', '_formSubmit' → write-only, skipped
   */
  private getAllData(): ITemplateData {
    // Parse URL query string parameters for templates (still surfaced under .query)
    const query: Record<string, string> = {};
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => { query[key] = value; });

    const configs = this.props.adapterConfigs || [];
    const cfgByKey = new Map<string, { adapterId: string }>();
    for (const c of configs) cfgByKey.set(c.key, { adapterId: c.adapterId });

    // Pull the canonical results
    const itemsResult = this._adapterResults.items;
    const userResult = this._adapterResults.user;
    const pageResult = this._adapterResults.page;

    // Build primary items envelope (matches legacy IDataEnvelope shape)
    const primaryEnvelope: IDataEnvelope = {
      rows: Array.isArray(itemsResult?.data) ? itemsResult.data as any[] : [],
      paging: {
        hasNext: !!itemsResult?.paging?.hasNext,
        hasPrev: !!itemsResult?.paging?.hasPrev,
        nextHref: itemsResult?.paging?.nextToken,
        prevHref: itemsResult?.paging?.prevToken,
        pageNumber: itemsResult?.paging?.pageNumber
      }
    };

    // Walk remaining adapter results and bucket by adapter type
    const additionalListEnvelopes: Record<string, IDataEnvelope> = {};
    const httpData: Record<string, any> = {};
    for (const key of Object.keys(this._adapterResults)) {
      if (key === 'items' || key === 'user' || key === 'page') continue;
      if (key.startsWith('_')) continue; // write-only adapters
      const cfg = cfgByKey.get(key);
      const result = this._adapterResults[key];
      if (!cfg || !result) continue;

      if (cfg.adapterId === 'sharepoint-list') {
        additionalListEnvelopes[key] = {
          rows: Array.isArray(result.data) ? result.data : [],
          paging: {
            hasNext: !!result.paging?.hasNext,
            hasPrev: !!result.paging?.hasPrev,
            nextHref: result.paging?.nextToken,
            prevHref: result.paging?.prevToken,
            pageNumber: result.paging?.pageNumber
          }
        };
      } else {
        // HTTP / other read adapters — spread raw data at root
        httpData[key] = result.data;
      }
    }

    // Build template data — adapters are responsible for normalizing their
    // own payloads (see UserProfileAdapter / PageDataAdapter).
    const templateData: ITemplateData = {
      items: primaryEnvelope,
      user: (userResult?.data as any) || {},
      page: (pageResult?.data as any) || {},
      query,
      // Include instanceId for unique DOM element IDs when multiple web parts are on a page
      wpId: this.props.instanceId,
      instanceId: this.props.instanceId,
      siteUrl: this.props.site?.url || '',
      ...additionalListEnvelopes,
      ...httpData,
      // SPFx Dynamic Data incoming items still surface to the template
      ...(this.props.incomingItem ? { incoming: this.props.incomingItem } : {}),
      ...(this.props.incomingItems ? { incomingItems: this.props.incomingItems } : {})
    };

    return templateData;
  }

  public render(): React.ReactElement<IHandlebarsListViewProps> {
    // The active template engine renders directly into the container ref;
    // React simply owns the host element.
    return <div ref={this.containerRef} />;
  }
}
