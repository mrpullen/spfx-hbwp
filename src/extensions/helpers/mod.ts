/* eslint-disable @typescript-eslint/no-explicit-any */
import { HandlebarsExtension } from '../engines/HandlebarsExtension';

export class ModHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('mod', function(a: any, b: any) {
      return (parseInt(a, 10) || 0) % (parseInt(b, 10) || 1);
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('mod');
  }
}
