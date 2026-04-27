import helpers from 'handlebars-helpers';
import { HandlebarsExtension } from './HandlebarsExtension';

/**
 * Extension wrapping the third-party `handlebars-helpers` package (180+ helpers).
 * Follows the same EngineExtension pattern as all other helper extensions.
 */
export class HandlebarsHelpersExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    helpers({ handlebars: this.hbs });
  }

  // handlebars-helpers registers many helpers; no clean single-call unregister
  // is available. The engine's Handlebars instance is shared, so helpers
  // persist until the engine is torn down.
}
