import { HandlebarsExtension } from '../engines/HandlebarsExtension';

export class JsonHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('json', function(context: unknown) {
      return JSON.stringify(context, null, 2);
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('json');
  }
}
