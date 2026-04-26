/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

/**
 * Filter an array by property value (handles SharePoint lookup fields).
 * Block usage: {{#filter arr "prop" val}}...{{else}}...{{/filter}}
 * Inline usage: {{filter arr "prop" val}}
 */
export function registerFilterHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('filter', function(this: any, array: any[], property: string, value: any, options: any) {
    if (!Array.isArray(array)) {
      if (options && options.fn) {
        return options.inverse(this);
      }
      return [];
    }
    const filtered = array.filter((item: any) => {
      const propValue = item[property];
      if (propValue && typeof propValue === 'object' && propValue.Id !== undefined) {
        return String(propValue.Id) === String(value) || propValue.Title === value;
      }
      return String(propValue) === String(value);
    });

    if (options && options.fn) {
      if (filtered.length > 0) {
        return options.fn(this);
      }
      return options.inverse(this);
    }

    return filtered;
  });
}
