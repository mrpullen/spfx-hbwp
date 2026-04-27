/* eslint-disable @typescript-eslint/no-explicit-any */
import { HandlebarsExtension } from '../engines/HandlebarsExtension';

/**
 * Shuffle an array (Fisher-Yates). Returns a new array.
 * Usage: {{#each (shuffle items.rows)}}...{{/each}}
 */
export class ShuffleHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('shuffle', function(arr: any) {
      if (!Array.isArray(arr)) return arr;
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('shuffle');
  }
}
