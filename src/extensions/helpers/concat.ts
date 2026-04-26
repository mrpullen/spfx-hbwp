/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

export function registerConcatHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('concat', function(...args: any[]) {
    const strings = args.slice(0, -1);
    return strings.join('');
  });
}
