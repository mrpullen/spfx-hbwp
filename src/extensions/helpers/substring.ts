import { HandlebarsExtension } from '../engines/HandlebarsExtension';

export class SubstringHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('substring', function(str: string, start: number, end?: number) {
      if (!str || typeof str !== 'string') return '';
      if (end !== undefined) {
        return str.substring(start, end);
      }
      return str.substring(start);
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('substring');
  }
}
