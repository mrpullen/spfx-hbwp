import * as Handlebars from 'handlebars';

export function registerSubstringHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('substring', function(str: string, start: number, end?: number) {
    if (!str || typeof str !== 'string') return '';
    if (end !== undefined) {
      return str.substring(start, end);
    }
    return str.substring(start);
  });
}
