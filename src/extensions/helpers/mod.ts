/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

export function registerModHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('mod', function(a: any, b: any) {
    return (parseInt(a, 10) || 0) % (parseInt(b, 10) || 1);
  });
}
