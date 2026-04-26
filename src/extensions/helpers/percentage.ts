import * as Handlebars from 'handlebars';

export function registerPercentageHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('percentage', function(count: number, total: number) {
    if (!total || total === 0) return 0;
    return Math.round((count / total) * 100);
  });
}
