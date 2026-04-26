import * as Handlebars from 'handlebars';

export function registerJsonHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('json', function(context: unknown) {
    return JSON.stringify(context, null, 2);
  });
}
