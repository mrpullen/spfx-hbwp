/* eslint-disable @typescript-eslint/no-explicit-any */
import { HandlebarsExtension } from '../engines/HandlebarsExtension';

export class ConcatHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('concat', function(...args: any[]) {
      const strings = args.slice(0, -1);
      return strings.join('');
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('concat');
  }
}
