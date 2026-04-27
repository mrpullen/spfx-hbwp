import * as Handlebars from 'handlebars';
import { EngineExtension, TemplateEngineBase } from '@mrpullen/spfx-extensibility';

/**
 * Base class for any Handlebars engine extension — helpers, partials,
 * decorators, etc.
 *
 * Subclasses access the Handlebars namespace via
 * `this.engine.getEngineNamespace()` (typed as `typeof Handlebars`
 * through the convenience getter `this.hbs`).
 *
 * **Creating an extension in an external library:**
 *
 * ```ts
 * import { EngineExtension, TemplateEngineBase } from '@mrpullen/spfx-extensibility';
 * import * as Handlebars from 'handlebars';
 *
 * export class MyCustomHelpers extends EngineExtension {
 *   public static readonly engineId = 'handlebars';
 *
 *   public register(): void {
 *     const hbs = this.engine.getEngineNamespace() as typeof Handlebars;
 *     hbs.registerHelper('myHelper', (arg) => { ... });
 *   }
 *
 *   public unregister(): void {
 *     const hbs = this.engine.getEngineNamespace() as typeof Handlebars;
 *     hbs.unregisterHelper('myHelper');
 *   }
 * }
 *
 * // In your library's IExtensibilityLibrary:
 * getEngineExtensions() { return [MyCustomHelpers]; }
 * ```
 */
export abstract class HandlebarsExtension extends EngineExtension<TemplateEngineBase> {
  public static readonly engineId = 'handlebars';

  /** Typed convenience getter for the Handlebars namespace. */
  protected get hbs(): typeof Handlebars {
    return this.engine.getEngineNamespace() as typeof Handlebars;
  }
}
