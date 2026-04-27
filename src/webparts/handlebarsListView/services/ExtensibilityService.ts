/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  IExtensibilityLibrary,
  IComponentDefinition,
  IExtensibilityLibraryConfig,
  ITemplateEngineDefinition,
  IDataAdapterDefinition,
  ITemplateAssetDefinition,
  EngineExtensionConstructor,
  TemplateEngineBase
} from '@mrpullen/spfx-extensibility';

/**
 * Service responsible for loading extensibility libraries (SPFx library
 * components deployed to the app catalog) and registering their web
 * components and Handlebars customizations with the web part.
 */
export class ExtensibilityService {
  private _builtInLibraries: IExtensibilityLibrary[] = [];
  private _libraries: IExtensibilityLibrary[] = [];
  private _componentDefinitions: IComponentDefinition<any>[] = [];
  private _registeredElements: Set<string> = new Set();
  private _debug = false;

  public get debug(): boolean { return this._debug; }
  public set debug(value: boolean) { this._debug = value; }

  private log(...args: any[]): void { if (this._debug) console.log(...args); }
  private logWarn(...args: any[]): void { if (this._debug) console.warn(...args); }

  /**
   * Registers a built-in (non-SPFx-loaded) library so it participates in
   * the same engine-extension / web-component pipeline as external
   * libraries loaded from the app catalog.
   */
  public registerBuiltInLibrary(library: IExtensibilityLibrary): void {
    this._builtInLibraries.push(library);
    this.log(`[HBWP Extensibility] Registered built-in library: ${library.name()}`);
  }

  /**
   * Loads one or more extensibility libraries by their SPFx component manifest
   * IDs. Libraries are resolved via the SPFx loader (`window.__spfx_loader__`)
   * which is available at runtime when the library component is deployed to the
   * tenant or site-collection app catalog.
   */
  public async loadLibraries(configs: IExtensibilityLibraryConfig[]): Promise<void> {
    this.log(`[HBWP Extensibility] loadLibraries called with ${configs.length} config(s):`, JSON.stringify(configs));
    // Reset external libraries but preserve built-in ones
    this._libraries = [...this._builtInLibraries];
    this._componentDefinitions = [];
    this.log(`[HBWP Extensibility] Built-in libraries: ${this._builtInLibraries.map(l => l.name()).join(', ')}`);

    const enabledConfigs = configs.filter(c => c.enabled);
    this.log(`[HBWP Extensibility] Enabled configs: ${enabledConfigs.length}`);
    if (enabledConfigs.length === 0) {
      this.log('[HBWP Extensibility] No enabled configs — skipping external load');
      return;
    }

    for (const config of enabledConfigs) {
      this.log(`[HBWP Extensibility] Loading library: id="${config.id}", name="${config.name}", enabled=${config.enabled}`);
      try {
        const library = await this.resolveLibrary(config.id);
        if (library) {
          this._libraries.push(library);
          this.log(`[HBWP Extensibility] ✓ Loaded library: ${library.name()} (${config.id})`);
          this.log(`[HBWP Extensibility]   - Components: ${library.getCustomWebComponents().map(c => c.componentName).join(', ')}`);
          this.log(`[HBWP Extensibility]   - Templates: ${(library.getTemplates?.() ?? []).map(t => t.id).join(', ') || '(none)'}`);
          this.log(`[HBWP Extensibility]   - Adapters: ${(library.getDataAdapters?.() ?? []).map(a => a.adapterId).join(', ') || '(none)'}`);
        } else {
          this.logWarn(`[HBWP Extensibility] ✗ resolveLibrary returned undefined for ${config.id}`);
        }
      } catch (error) {
        console.error(`[HBWP Extensibility] ✗ Failed to load library ${config.id}:`, error);
      }
    }
    this.log(`[HBWP Extensibility] Total libraries after load: ${this._libraries.length}`);
  }

  /**
   * Registers all web components from loaded libraries with the Custom
   * Elements registry (idempotent — skips already-registered tag names).
   */
  public registerWebComponents(): void {
    for (const lib of this._libraries) {
      try {
        const components = lib.getCustomWebComponents();
        for (const comp of components) {
          if (!this._registeredElements.has(comp.componentName)) {
            if (!customElements.get(comp.componentName)) {
              customElements.define(comp.componentName, comp.componentClass);
            }
            this._registeredElements.add(comp.componentName);
            this._componentDefinitions.push(comp);
            this.log(`[HBWP Extensibility] Registered web component: <${comp.componentName}>`);
          }
        }
      } catch (error) {
        console.error(`[HBWP Extensibility] Error registering web components from ${lib.name()}:`, error);
      }
    }
  }

  /**
   * Aggregates engine-scoped extensions from every loaded library into a
   * flat list. Engines call this from their render / mount path and
   * filter by their own `engineId` to consume the extensions they
   * understand.
   */
  public getEngineExtensions(): EngineExtensionConstructor<TemplateEngineBase>[] {
    const out: EngineExtensionConstructor<TemplateEngineBase>[] = [];
    for (const lib of this._libraries) {
      try {
        const exts = lib.getEngineExtensions?.() ?? [];
        out.push(...exts);
      } catch (error) {
        console.error(`[HBWP Extensibility] Error collecting engine extensions from ${lib.name()}:`, error);
      }
    }
    return out;
  }

  /**
   * Aggregates ready-to-use template assets from every loaded library.
   * Used by the property-pane template picker.
   */
  public getTemplates(): ITemplateAssetDefinition[] {
    const out: ITemplateAssetDefinition[] = [];
    for (const lib of this._libraries) {
      try {
        const templates = lib.getTemplates?.() ?? [];
        out.push(...templates);
      } catch (error) {
        console.error(`[HBWP Extensibility] Error collecting templates from ${lib.name()}:`, error);
      }
    }
    return out;
  }

  /** Returns all component definitions collected from loaded libraries. */
  public getComponentDefinitions(): IComponentDefinition<any>[] {
    return this._componentDefinitions;
  }

  /** Returns the loaded library instances. */
  public getLibraries(): IExtensibilityLibrary[] {
    return this._libraries;
  }

  /**
   * Collects all template engine definitions from every loaded library.
   * Returns a de-duplicated list keyed by engineId (first registration wins).
   */
  public getTemplateEngineDefinitions(): ITemplateEngineDefinition[] {
    const seen = new Set<string>();
    const definitions: ITemplateEngineDefinition[] = [];

    for (const lib of this._libraries) {
      try {
        if (lib.getTemplateEngines) {
          for (const def of lib.getTemplateEngines()) {
            if (!seen.has(def.engineId)) {
              seen.add(def.engineId);
              definitions.push(def);
              this.log(`[HBWP Extensibility] Registered template engine: ${def.engineName} (${def.engineId}) from ${lib.name()}`);
            }
          }
        }
      } catch (error) {
        console.error(`[HBWP Extensibility] Error collecting template engines from ${lib.name()}:`, error);
      }
    }

    return definitions;
  }

  /**
   * Instantiates and returns a template engine by its engineId.
   * Returns undefined if no matching engine is registered.
   */
  public createTemplateEngine(engineId: string): TemplateEngineBase | undefined {
    const definitions = this.getTemplateEngineDefinitions();
    const def = definitions.find(d => d.engineId === engineId);
    if (!def) {
      this.logWarn(`[HBWP Extensibility] No template engine found with id: ${engineId}`);
      return undefined;
    }
    return new def.engineClass();
  }

  /**
   * Collects all data adapter definitions from every loaded library.
   * Returns a de-duplicated list keyed by adapterId (first registration wins).
   */
  public getDataAdapterDefinitions(): IDataAdapterDefinition[] {
    const seen = new Set<string>();
    const definitions: IDataAdapterDefinition[] = [];

    for (const lib of this._libraries) {
      try {
        if (lib.getDataAdapters) {
          for (const def of lib.getDataAdapters()) {
            if (!seen.has(def.adapterId)) {
              seen.add(def.adapterId);
              definitions.push(def);
            }
          }
        }
      } catch (error) {
        console.error(`[HBWP Extensibility] Error collecting data adapters from ${lib.name()}:`, error);
      }
    }

    return definitions;
  }

  /**
   * Attempts to load an SPFx library component by its manifest ID.
   *
   * At runtime on a SharePoint page the SPFx framework exposes
   * `SPComponentLoader` which can load library components from the app catalog
   * by their component ID.
   */
  private async resolveLibrary(manifestId: string): Promise<IExtensibilityLibrary | undefined> {
    try {
      this.log(`[HBWP Extensibility] resolveLibrary: importing SPComponentLoader...`);
      // Use the SPFx SPComponentLoader which is available globally at runtime
      const { SPComponentLoader } = await import(
        /* webpackChunkName: "sp-loader" */
        '@microsoft/sp-loader'
      );
      this.log(`[HBWP Extensibility] resolveLibrary: SPComponentLoader loaded, calling loadComponentById("${manifestId}")...`);

      const lib: any = await SPComponentLoader.loadComponentById(manifestId);
      this.log(`[HBWP Extensibility] resolveLibrary: loadComponentById returned:`, typeof lib, lib);
      this.log(`[HBWP Extensibility] resolveLibrary: lib keys:`, lib ? Object.keys(lib) : 'null/undefined');
      this.log(`[HBWP Extensibility] resolveLibrary: lib.default =`, lib?.default, typeof lib?.default);

      // The library module default export (or the module itself) should
      // implement IExtensibilityLibrary
      let instance: IExtensibilityLibrary;
      if (lib.default) {
        this.log(`[HBWP Extensibility] resolveLibrary: using lib.default (new lib.default())`);
        instance = new lib.default();
      } else if (typeof lib === 'function') {
        this.log(`[HBWP Extensibility] resolveLibrary: lib is a function, calling new lib()`);
        instance = new lib();
      } else {
        this.log(`[HBWP Extensibility] resolveLibrary: using lib directly as instance`);
        instance = lib;
      }

      this.log(`[HBWP Extensibility] resolveLibrary: instance type =`, typeof instance);
      this.log(`[HBWP Extensibility] resolveLibrary: instance.name =`, typeof instance?.name, instance?.name?.toString?.().substring(0, 100));
      this.log(`[HBWP Extensibility] resolveLibrary: instance.getCustomWebComponents =`, typeof instance?.getCustomWebComponents);

      if (instance && typeof instance.getCustomWebComponents === 'function' && typeof instance.name === 'function') {
        this.log(`[HBWP Extensibility] resolveLibrary: ✓ instance passes IExtensibilityLibrary check`);
        return instance;
      }

      this.logWarn(`[HBWP Extensibility] ✗ Library ${manifestId} does not implement IExtensibilityLibrary. Instance keys:`, instance ? Object.keys(instance) : 'null', 'prototype:', instance ? Object.getOwnPropertyNames(Object.getPrototypeOf(instance)) : 'N/A');
      return undefined;
    } catch (error) {
      console.error(`[HBWP Extensibility] ✗ SPComponentLoader failed for ${manifestId}:`, error);
      return undefined;
    }
  }
}
