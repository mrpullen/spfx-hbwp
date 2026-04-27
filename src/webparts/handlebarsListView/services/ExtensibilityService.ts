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

  /**
   * Registers a built-in (non-SPFx-loaded) library so it participates in
   * the same engine-extension / web-component pipeline as external
   * libraries loaded from the app catalog.
   */
  public registerBuiltInLibrary(library: IExtensibilityLibrary): void {
    this._builtInLibraries.push(library);
    console.log(`[HBWP Extensibility] Registered built-in library: ${library.name()}`);
  }

  /**
   * Loads one or more extensibility libraries by their SPFx component manifest
   * IDs. Libraries are resolved via the SPFx loader (`window.__spfx_loader__`)
   * which is available at runtime when the library component is deployed to the
   * tenant or site-collection app catalog.
   */
  public async loadLibraries(configs: IExtensibilityLibraryConfig[]): Promise<void> {
    // Reset external libraries but preserve built-in ones
    this._libraries = [...this._builtInLibraries];
    this._componentDefinitions = [];

    const enabledConfigs = configs.filter(c => c.enabled);
    if (enabledConfigs.length === 0) return;

    for (const config of enabledConfigs) {
      try {
        const library = await this.resolveLibrary(config.id);
        if (library) {
          this._libraries.push(library);
          console.log(`[HBWP Extensibility] Loaded library: ${library.name()} (${config.id})`);
        }
      } catch (error) {
        console.error(`[HBWP Extensibility] Failed to load library ${config.id}:`, error);
      }
    }
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
            console.log(`[HBWP Extensibility] Registered web component: <${comp.componentName}>`);
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
              console.log(`[HBWP Extensibility] Registered template engine: ${def.engineName} (${def.engineId}) from ${lib.name()}`);
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
      console.warn(`[HBWP Extensibility] No template engine found with id: ${engineId}`);
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
      // Use the SPFx SPComponentLoader which is available globally at runtime
      const { SPComponentLoader } = await import(
        /* webpackChunkName: "sp-loader" */
        '@microsoft/sp-loader'
      );

      const lib: any = await SPComponentLoader.loadComponentById(manifestId);

      // The library module default export (or the module itself) should
      // implement IExtensibilityLibrary
      const instance: IExtensibilityLibrary =
        lib.default ? new lib.default() :
        typeof lib === 'function' ? new lib() :
        lib;

      if (instance && typeof instance.getCustomWebComponents === 'function' && typeof instance.name === 'function') {
        return instance;
      }

      console.warn(`[HBWP Extensibility] Library ${manifestId} does not implement IExtensibilityLibrary`);
      return undefined;
    } catch (error) {
      console.error(`[HBWP Extensibility] SPComponentLoader failed for ${manifestId}:`, error);
      return undefined;
    }
  }
}
