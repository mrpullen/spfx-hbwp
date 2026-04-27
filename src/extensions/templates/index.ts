/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Bundled template content loaded from .hbs source files via raw-loader.
 * Edit the .hbs files — this barrel just re-exports them as strings.
 *
 * Paths resolve from the compiled output (lib/extensions/templates/) back
 * to the original source files so webpack inlines them at bundle time.
 */
export const newsCardsTemplate: string = require('raw-loader!../../../src/extensions/templates/news-cards.hbs');
export const simpleTableTemplate: string = require('raw-loader!../../../src/extensions/templates/simple-table.hbs');
