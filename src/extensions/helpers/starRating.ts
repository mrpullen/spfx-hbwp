/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

/** Render star rating as HTML (e.g. ★★★★☆) */
export function registerStarRatingHelper(hbs: typeof Handlebars): void {
  hbs.registerHelper('starRating', function(rating: any) {
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
