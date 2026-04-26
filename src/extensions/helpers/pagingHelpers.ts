/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

/**
 * Paging helper: renders previous/next navigation controls.
 *
 * Usage:  {{hbwp-paging items.paging}}
 *         {{hbwp-paging items.paging label="Ideas"}}
 */
export function registerPagingHelpers(hbs: typeof Handlebars): void {

  hbs.registerHelper('hbwp-paging', function(paging: any, options: any) {
    if (!paging) return '';

    const hash = options && options.hash ? options.hash : {};
    const label: string = hash.label || 'items';

    const hasNext = !!paging.hasNext;
    const hasPrev = !!paging.hasPrev;

    if (!hasNext && !hasPrev) return '';

    const pageNum = paging.pageNumber || 1;
    const firstRow = paging.firstRow || '';
    const lastRow = paging.lastRow || '';

    const rangeText = firstRow && lastRow
      ? '<span class="hbwp-paging-range">' + Handlebars.Utils.escapeExpression(String(firstRow)) +
        ' &ndash; ' + Handlebars.Utils.escapeExpression(String(lastRow)) +
        ' ' + Handlebars.Utils.escapeExpression(label) + '</span>'
      : '';

    const prevBtn = '<button type="button" class="hbwp-paging-btn hbwp-paging-prev" data-hbwp-page="prev"'
      + (hasPrev ? '' : ' disabled')
      + ' aria-label="Previous page"'
      + ' title="Previous page">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">'
      + '<path d="M10.354 3.354L5.707 8l4.647 4.646-.708.708L4.293 8l5.353-5.354.708.708z"/>'
      + '</svg>'
      + '</button>';

    const nextBtn = '<button type="button" class="hbwp-paging-btn hbwp-paging-next" data-hbwp-page="next"'
      + (hasNext ? '' : ' disabled')
      + ' aria-label="Next page"'
      + ' title="Next page">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">'
      + '<path d="M5.646 12.646L10.293 8 5.646 3.354l.708-.708L11.707 8l-5.353 5.354-.708-.708z"/>'
      + '</svg>'
      + '</button>';

    const pageIndicator = '<span class="hbwp-paging-page">Page ' + Handlebars.Utils.escapeExpression(String(pageNum)) + '</span>';

    const html = '<nav class="hbwp-paging" role="navigation" aria-label="Pagination">'
      + '<div class="hbwp-paging-controls">'
      + prevBtn
      + pageIndicator
      + nextBtn
      + '</div>'
      + (rangeText ? '<div class="hbwp-paging-info">' + rangeText + '</div>' : '')
      + '</nav>';

    return new Handlebars.SafeString(html);
  });
}
