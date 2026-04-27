import { HandlebarsExtension } from '../engines/HandlebarsExtension';

export class PercentageHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('percentage', function(count: number, total: number) {
      if (!total || total === 0) return 0;
      return Math.round((count / total) * 100);
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('percentage');
  }
}
