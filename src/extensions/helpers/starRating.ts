/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';
import { HandlebarsExtension } from '../engines/HandlebarsExtension';

/** Render star rating as HTML (e.g. ★★★★☆) */
export class StarRatingHelperExtension extends HandlebarsExtension {
  public static readonly engineId = 'handlebars';

  public register(): void {
    this.hbs.registerHelper('starRating', function(rating: any) {
      const val = parseFloat(rating) || 0;
      const full = Math.floor(val);
      const half = (val - full) >= 0.5 ? 1 : 0;
      const empty = 5 - full - half;
      return new Handlebars.SafeString(
        '<span style="color:#ffb900;">' + '\u2605'.repeat(full) +
        (half ? '\u2BEA' : '') + '</span>' +
        '<span style="color:#d2d0ce;">' + '\u2606'.repeat(empty) + '</span>'
      );
    });
  }

  public unregister(): void {
    this.hbs.unregisterHelper('starRating');
  }
}
