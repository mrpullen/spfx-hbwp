/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

export function registerToIntHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('toInt', function(value: any) {
    return parseInt(value, 10) || 0;
  });
}
