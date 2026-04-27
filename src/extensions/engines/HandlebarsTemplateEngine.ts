/* eslint-disable @typescript-eslint/no-explicit-any */
import Handlebars from 'handlebars';
import {
  TemplateEngineBase,
  ITemplateEngineContext,
  ITemplateEnginePropertyDefinition,
  ITemplateEngineCallbacks,
  IPageState
} from '@mrpullen/spfx-extensibility';
import { scopeCssClasses } from '../../webparts/handlebarsListView/components/scopeCssClasses';
import { ExtensibilityService } from '../../webparts/handlebarsListView/services';

/**
 * Built-in Handlebars template engine.
 *
 * Compiles Handlebars templates, applies CSS scoping per web-part instance,
 * registers helpers/partials from all loaded extensibility libraries,
 * and binds PageState-driven DOM interactions after each render.
 *
 * Template authors use data attributes to interact with PageState:
 *
 *   Click actions (delegated on the host container):
 *     data-hbwp-toggle="key"                    toggle boolean
 *     data-hbwp-set="key" [data-hbwp-value="v"] set to value (default: true)
 *     data-hbwp-clear="key"                     set to false/undefined
 *
 *   Visibility binding (via PageState subscriptions):
 *     data-hbwp-show="key"                      visible when key is truthy
 *     data-hbwp-hide="key"                      hidden when key is truthy
 *     data-hbwp-show="key" data-hbwp-eq="val"   visible only when key === val
 *
 *   Panel / dialog binding:
 *     data-hbwp-panel="key"                     show/hide via .show()/.hide() or data-hbwp-open attr
 */
export class HandlebarsTemplateEngine extends TemplateEngineBase {

  public readonly engineId = 'handlebars';
  public readonly engineName = 'Handlebars';

  private _extensibilityService: ExtensibilityService | undefined;
  /** Unsubscribe callbacks from PageState watchers */
  private _stateUnsubs: (() => void)[] = [];
  /** Delegated click handler bound to the host */
  private _clickHandler: ((e: Event) => void) | undefined;

  public setExtensibilityService(service: ExtensibilityService): void {
    this._extensibilityService = service;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public registerCallbacks(_callbacks: ITemplateEngineCallbacks): void { }

  public render(context: ITemplateEngineContext, data: any, host: HTMLElement): void {
    // Clean up previous state bindings before re-render
    this._teardownStateBindings(host);

    // Register all extensibility library Handlebars customizations
    if (this._extensibilityService) {
      this._extensibilityService.registerHandlebarsCustomizations(Handlebars);
    }

    // Scope CSS classes in <style> blocks with the web part instance ID
    const scopedTemplate = scopeCssClasses(context.template, context.instanceId);

    // Compile + render into a detached buffer first (double-buffered render).
    // This keeps the previous DOM mounted right up until the moment we swap,
    // eliminating the "blank flash" between renders.  Custom elements still
    // get destroyed + recreated (Handlebars is string-based — see
    // docs/custom-element-rerender-flicker.md) but the page never paints
    // an empty container.
    const compiled = Handlebars.compile(scopedTemplate);
    const html = compiled(data);

    const buffer = document.createElement('div');
    buffer.innerHTML = html;

    // Move children from buffer → host in a single mutation batch:
    //   1. Detach all current children
    //   2. Append the new children
    // We do this inside one synchronous block so the browser only paints once.
    while (host.firstChild) host.removeChild(host.firstChild);
    while (buffer.firstChild) host.appendChild(buffer.firstChild);

    // Bind PageState interactions on the freshly-mounted DOM
    this._bindStateActions(host, context.pageState);
    this._bindStateVisibility(host, context.pageState);
    this._bindStatePanels(host, context.pageState);
  }

  public destroy(host: HTMLElement): void {
    this._teardownStateBindings(host);
    host.innerHTML = '';
  }

  public updateData(_data: any): void {
    // Handlebars is not reactive — a full re-render is required.
  }

  // ── PageState DOM bindings ──

  /**
   * Delegated click handler for state actions.
   * Looks for data-hbwp-toggle, data-hbwp-set, data-hbwp-clear on the
   * clicked element or its ancestors.
   */
  private _bindStateActions(host: HTMLElement, pageState: IPageState): void {
    this._clickHandler = (e: Event) => {
      const target = e.target as HTMLElement;

      // Toggle: data-hbwp-toggle="key"
      const toggleEl = target.closest<HTMLElement>('[data-hbwp-toggle]');
      if (toggleEl) {
        const key = toggleEl.getAttribute('data-hbwp-toggle');
        if (key) {
          pageState.toggle(key);
        }
        return;
      }

      // Set: data-hbwp-set="key" [data-hbwp-value="val"]
      const setEl = target.closest<HTMLElement>('[data-hbwp-set]');
      if (setEl) {
        const key = setEl.getAttribute('data-hbwp-set');
        if (key) {
          let value: any = setEl.getAttribute('data-hbwp-value');
          // Parse JSON values (objects, arrays, numbers, booleans)
          if (value !== null) {
            try { value = JSON.parse(value); } catch (_e) { /* keep as string */ }
          } else {
            value = true;
          }
          pageState.set(key, value);
        }
        return;
      }

      // Clear: data-hbwp-clear="key"
      const clearEl = target.closest<HTMLElement>('[data-hbwp-clear]');
      if (clearEl) {
        const key = clearEl.getAttribute('data-hbwp-clear');
        if (key) {
          pageState.set(key, false);
        }
        return;
      }
    };

    host.addEventListener('click', this._clickHandler);
  }

  /**
   * Subscribes to PageState keys referenced by data-hbwp-show and data-hbwp-hide
   * elements, toggling their display style reactively.
   */
  private _bindStateVisibility(host: HTMLElement, pageState: IPageState): void {
    // data-hbwp-show="key" [data-hbwp-eq="val"]
    const showEls = host.querySelectorAll<HTMLElement>('[data-hbwp-show]');
    // data-hbwp-hide="key"
    const hideEls = host.querySelectorAll<HTMLElement>('[data-hbwp-hide]');

    // Collect unique keys → elements mapping
    const keyBindings: Map<string, Array<{ el: HTMLElement; mode: 'show' | 'hide'; eq?: string }>> = new Map();

    showEls.forEach(el => {
      const key = el.getAttribute('data-hbwp-show') || '';
      const eq = el.getAttribute('data-hbwp-eq') || undefined;
      if (!keyBindings.has(key)) keyBindings.set(key, []);
      const arr = keyBindings.get(key);
      if (arr) arr.push({ el, mode: 'show', eq });
    });

    hideEls.forEach(el => {
      const key = el.getAttribute('data-hbwp-hide') || '';
      if (!keyBindings.has(key)) keyBindings.set(key, []);
      const arr = keyBindings.get(key);
      if (arr) arr.push({ el, mode: 'hide' });
    });

    keyBindings.forEach((bindings, key) => {
      // Apply initial state
      const currentValue = pageState.get(key);
      for (const b of bindings) {
        this._applyVisibility(b.el, b.mode, currentValue, b.eq);
      }

      // Subscribe for changes
      const unsub = pageState.subscribe(key, (value: any) => {
        for (const b of bindings) {
          this._applyVisibility(b.el, b.mode, value, b.eq);
        }
      });
      this._stateUnsubs.push(unsub);
    });
  }

  private _applyVisibility(el: HTMLElement, mode: 'show' | 'hide', value: any, eq?: string): void {
    let visible: boolean;
    if (eq !== undefined) {
      // Equality comparison (loose to handle "3" === 3 etc.)
      // eslint-disable-next-line eqeqeq
      visible = value == eq;
    } else {
      visible = !!value;
    }
    if (mode === 'hide') visible = !visible;
    el.style.display = visible ? '' : 'none';
  }

  /**
   * Binds data-hbwp-panel="key" elements: when the key becomes truthy the
   * panel/dialog opens; when falsy it closes.
   * Supports .show()/.hide() (Fluent drawer/dialog) or data-hbwp-open attribute toggle.
   */
  private _bindStatePanels(host: HTMLElement, pageState: IPageState): void {
    const panelEls = host.querySelectorAll<HTMLElement>('[data-hbwp-panel]');
    panelEls.forEach(panel => {
      const key = panel.getAttribute('data-hbwp-panel') || '';

      // Apply initial state
      const initial = pageState.get(key);
      this._applyPanelState(panel, !!initial);

      const unsub = pageState.subscribe(key, (value: any) => {
        this._applyPanelState(panel, !!value);
      });
      this._stateUnsubs.push(unsub);
    });
  }

  private _applyPanelState(panel: HTMLElement & { show?: () => void; hide?: () => void }, open: boolean): void {
    if (open) {
      if (typeof panel.show === 'function') {
        panel.show();
      } else {
        panel.setAttribute('data-hbwp-open', '');
      }
    } else {
      if (typeof panel.hide === 'function') {
        panel.hide();
      } else {
        panel.removeAttribute('data-hbwp-open');
      }
    }
  }

  /**
   * Removes all state subscriptions and event listeners from a previous render.
   */
  private _teardownStateBindings(host: HTMLElement): void {
    // Remove delegated click handler
    if (this._clickHandler) {
      host.removeEventListener('click', this._clickHandler);
      this._clickHandler = undefined;
    }
    // Unsubscribe all PageState watchers
    for (const unsub of this._stateUnsubs) {
      unsub();
    }
    this._stateUnsubs = [];
  }

  public getPropertyDefinitions(): ITemplateEnginePropertyDefinition[] {
    return [
      {
        propertyName: 'templateFile',
        label: 'Template File (.hbs)',
        type: 'filePicker',
        accepts: ['.hbs', '.handlebars', '.html', '.txt'],
        description: 'Upload .hbs files to a SharePoint library and select them here.',
        order: 1
      },
      {
        propertyName: 'template',
        label: 'Inline Handlebars Template',
        type: 'code',
        language: 'Handlebars',
        description: 'Used when no template file is selected.',
        order: 2
      }
    ];
  }
}
