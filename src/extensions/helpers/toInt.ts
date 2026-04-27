/* eslint-disable @typescript-eslint/no-explicit-any */
import { HandlebarsExtension } from '../engines/HandlebarsExtension';

export class ToIntHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('toInt', function(value: any) {
      return parseInt(value, 10) || 0;
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('toInt');
  }
}
