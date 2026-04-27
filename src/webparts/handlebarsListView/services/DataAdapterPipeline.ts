/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DataAdapterBase,
  IDataAdapterDefinition,
  IDataAdapterInstanceConfig,
  IDataAdapterContext,
  IDataAdapterResult,
  IPlatformServices,
  IMessageBus
} from '@mrpullen/spfx-extensibility';

/**
 * Manages multi-instance data adapter lifecycle:
 *  1. Instantiation with DI (platform services bag)
 *  2. Topological execution order (dependsOn graph)
 *  3. Pub/sub attach: adapters subscribe to their own topic + dependency
 *     topics' data-changed envelopes and self-refetch.
 */
export class DataAdapterPipeline {

  /** Adapter type registry: adapterId → definition */
  private _registry: Map<string, IDataAdapterDefinition> = new Map();

  /** Live adapter instances keyed by instance key */
  private _instances: Map<string, DataAdapterBase> = new Map();

  /** Instance configs keyed by instance key */
  private _configs: Map<string, IDataAdapterInstanceConfig> = new Map();

  /** Platform services bag */
  private _services: IPlatformServices;

  constructor(services: IPlatformServices) {
    this._services = services;
  }

  // ── Registry ────────────────────────────────────────────────────────────

  /**
   * Register adapter type definitions (from extensibility libraries).
   */
  public registerDefinitions(defs: IDataAdapterDefinition[]): void {
    for (const def of defs) {
      this._registry.set(def.adapterId, def);
    }
  }

  // ── Instantiation ──────────────────────────────────────────────────────

  /**
   * Instantiate adapters from instance configs.
   * Validates required services; skips adapters whose deps can't be met.
   *
   * Loop-prevention guards:
   *   - Throws if two configs share the same `key` (single-owner-per-topic rule).
   *   - Cycle detection happens later in `_topoSort`; throws there too.
   */
  public instantiate(configs: IDataAdapterInstanceConfig[]): void {
    // Dispose previous instances
    this.dispose();

    // Guard #2: single owner per topic
    const seenKeys = new Set<string>();
    for (const cfg of configs) {
      if (seenKeys.has(cfg.key)) {
        throw new Error(
          `[DataAdapterPipeline] Duplicate adapter instance key '${cfg.key}' — each topic must have exactly one owning adapter.`
        );
      }
      seenKeys.add(cfg.key);
    }

    for (const cfg of configs) {
      const def = this._registry.get(cfg.adapterId);
      if (!def) {
        console.warn(`[DataAdapterPipeline] Unknown adapter type '${cfg.adapterId}' for key '${cfg.key}' — skipping`);
        continue;
      }

      // Check required services
      try {
        const instance = new def.adapterClass(this._services);
        const required = instance.getRequiredServices();
        const missing = required.filter(k => this._services[k] === undefined || this._services[k] === null);
        if (missing.length > 0) {
          console.error(`[DataAdapterPipeline] Adapter '${cfg.key}' (${cfg.adapterId}) requires [${missing.join(', ')}] — not available, skipping`);
          continue;
        }
        this._instances.set(cfg.key, instance);
        this._configs.set(cfg.key, cfg);
      } catch (err) {
        console.error(`[DataAdapterPipeline] Failed to instantiate adapter '${cfg.key}' (${cfg.adapterId}):`, err);
      }
    }
  }

  // ── Pub/Sub Lifecycle (v2) ──────────────────────────────────────────────

  /**
   * Attach all adapter instances to the MessageBus and run the initial
   * topo-sorted fetch wave.  After this returns, adapters remain subscribed
   * and react to UI verbs autonomously.
   *
   * @param bus                  MessageBus to attach to
   * @param baseContextProvider  Function returning the current base context
   *                             (so adapters always see fresh user/page/query)
   */
  public async attach(
    bus: IMessageBus,
    baseContextProvider: () => Omit<IDataAdapterContext, 'config'>
  ): Promise<void> {
    // Resolve instanceId once so we can namespace adapter bus topics. This
    // keeps two web parts on the same page from cross-talking on shared
    // adapter keys (e.g. both have a primary `items` adapter). User-defined
    // topics (data-hbwp-topic in templates) remain page-global.
    const baseCtx = baseContextProvider();
    const instanceId = baseCtx.instanceId;
    const ns = (k: string): string => `${instanceId}::${k}`;

    // Hook every adapter into the bus.  The base class sets up its own
    // subscriptions for UI verbs and token-discovered dependencies.
    this._instances.forEach((instance, key) => {
      const cfg = this._configs.get(key);
      if (!cfg) return;
      instance.onAttach(bus, ns(key), cfg, baseContextProvider);
    });

    // Initial fetch wave — topo-sorted so dependencies land first.
    // Each adapter publishes data-changed when it completes.
    const waves = this._topoSort();
    for (const wave of waves) {
      await Promise.all(wave.map(async (key) => {
        const instance = this._instances.get(key);
        if (!instance || instance.capability === 'write') return;
        if (typeof instance.fetch !== 'function') return;
        // Drive the adapter's own _fetchAndPublish so it uses the same
        // criteria/paging state path as later, bus-driven fetches.
        await (instance as any)._fetchAndPublish();
      }));
    }
  }

  /**
   * Detach all adapter instances from the MessageBus.
   */
  public detach(): void {
    this._instances.forEach((instance) => {
      if (typeof instance.onDetach === 'function') instance.onDetach();
    });
  }

  // ── Execution ──────────────────────────────────────────────────────────

  /**
   * Build an empty scaffold with default values for every registered
   * read/read-write adapter instance.  Used for immediate first render.
   */
  public buildScaffold(): Record<string, IDataAdapterResult> {
    const scaffold: Record<string, IDataAdapterResult> = {};
    this._instances.forEach((instance, key) => {
      if (instance.capability === 'read' || instance.capability === 'read-write') {
        scaffold[key] = { data: instance.adapterId === 'user-profile' || instance.adapterId === 'sharepoint-page' ? {} : [], fromCache: false };
      }
    });
    return scaffold;
  }

  // ── Write operations ───────────────────────────────────────────────────

  /**
   * Execute a write operation on a specific adapter instance.
   */
  public async executeWrite(
    key: string,
    operation: string,
    payload: any,
    context: Omit<IDataAdapterContext, 'config' | 'resolvedData'>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const instance = this._instances.get(key);
    const cfg = this._configs.get(key);
    if (!instance || !cfg) {
      return { success: false, error: `Adapter instance '${key}' not found` };
    }
    if (typeof instance.execute !== 'function') {
      return { success: false, error: `Adapter '${key}' does not support write operations` };
    }
    const ctx: IDataAdapterContext = {
      ...context,
      config: cfg.properties || {},
      resolvedData: {}
    };
    return instance.execute(operation, payload, ctx);
  }

  // ── Read operations ────────────────────────────────────────────────────

  /**
   * Execute an ad-hoc read operation on a specific adapter instance.
   * Unlike the pipeline's batch fetch flow, this does NOT publish a
   * `data-changed` envelope onto the bus and does NOT update any cached
   * adapter result. The response is returned directly to the caller.
   */
  public async executeRead(
    key: string,
    operation: string,
    payload: any,
    context: Omit<IDataAdapterContext, 'config' | 'resolvedData'>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const instance = this._instances.get(key);
    const cfg = this._configs.get(key);
    if (!instance || !cfg) {
      return { success: false, error: `Adapter instance '${key}' not found` };
    }
    if (typeof instance.executeRead !== 'function') {
      return { success: false, error: `Adapter '${key}' does not support executeRead operations` };
    }
    const ctx: IDataAdapterContext = {
      ...context,
      config: cfg.properties || {},
      resolvedData: {}
    };
    return instance.executeRead(operation, payload, ctx);
  }

  /**
   * Get a specific adapter instance by key (for direct access, e.g. FormSubmitAdapter.registerEndpoints).
   */
  public getInstance(key: string): DataAdapterBase | undefined {
    return this._instances.get(key);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Clear caches on all adapter instances.
   */
  public clearCaches(): void {
    Array.from(this._instances.values()).forEach(instance => {
      if (typeof instance.clearCache === 'function') instance.clearCache();
    });
  }

  /**
   * Dispose all adapter instances.
   */
  public dispose(): void {
    // Detach from bus first so subscriptions are cleaned up
    this.detach();
    Array.from(this._instances.values()).forEach(instance => {
      if (typeof instance.dispose === 'function') instance.dispose();
    });
    this._instances.clear();
    this._configs.clear();
  }

  // ── Topological sort ──────────────────────────────────────────────────

  /**
   * Returns adapter keys grouped into execution waves.
   * Wave 0: no dependencies. Wave 1: depends only on wave-0 adapters. Etc.
   * Circular dependencies are detected and those adapters are pushed to the last wave with a warning.
   */
  private _topoSort(): string[][] {
    const waves: string[][] = [];
    const placed = new Set<string>();
    const allKeys = new Set(
      Array.from(this._instances.keys()).filter(k => {
        const inst = this._instances.get(k);
        return inst && (inst.capability === 'read' || inst.capability === 'read-write');
      })
    );

    const remaining = new Set(allKeys);
    let maxIterations = allKeys.size + 1; // safety valve

    while (remaining.size > 0 && maxIterations-- > 0) {
      const wave: string[] = [];
      Array.from(remaining).forEach(key => {
        const cfg = this._configs.get(key);
        const deps = cfg?.dependsOn || [];
        // All deps must be placed already (or not in the adapter set at all)
        const satisfied = deps.every(d => placed.has(d) || !allKeys.has(d));
        if (satisfied) {
          wave.push(key);
        }
      });
      if (wave.length === 0) {
        // Guard #3: acyclic dependency graph — throw on cycle
        throw new Error(
          `[DataAdapterPipeline] Circular dependency detected among adapters: ${Array.from(remaining).join(', ')}. ` +
          `Each adapter's dependsOn must form a DAG.`
        );
      }

      waves.push(wave);
      for (const key of wave) {
        placed.add(key);
        remaining.delete(key);
      }
    }

    return waves;
  }
}
