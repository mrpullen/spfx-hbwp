/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Handlebars from 'handlebars';

// SVG path constants for heart icons (Fluent UI HeartFill / Heart)
const HEART_FILL_SVG = '<svg data-hbwp-heart-svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M7.99 3.31C6.57 1.07 2.54.73 1.09 3.52c-1.37 2.64.46 5.47 3.93 8.27.96.78 1.95 1.46 2.98 2.21 1.02-.75 2.01-1.43 2.97-2.2 3.47-2.8 5.3-5.64 3.93-8.28C13.45.73 9.42 1.07 7.99 3.31z"/></svg>';
const HEART_OUTLINE_SVG = '<svg data-hbwp-heart-svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M7.99 3.31C6.57 1.07 2.54.73 1.09 3.52c-1.37 2.64.46 5.47 3.93 8.27.96.78 1.95 1.46 2.98 2.21 1.02-.75 2.01-1.43 2.97-2.2 3.47-2.8 5.3-5.64 3.93-8.28C13.45.73 9.42 1.07 7.99 3.31z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';

/**
 * Social / interactive helpers: likeButton.
 */
export function registerSocialHelpers(hbs: typeof Handlebars): void {

  hbs.registerHelper('likeButton', function(this: any, itemId: any, likesCount: any, likedByArray: any, userId: any, options: any) {
    const count = parseInt(likesCount, 10) || 0;
    let liked = false;
    if (Array.isArray(likedByArray)) {
      liked = likedByArray.some((item: any) => {
        const propValue = item.Id !== undefined ? item.Id : item.id;
        return String(propValue) === String(userId);
      });
    }
    const activeColor = (options && options.hash && options.hash.color) || 'var(--ms-palette-neutralPrimary, #323130)';
    const inactiveColor = 'var(--ms-semanticColors-infoIcon, #605e5c)';
    const heartSvg = liked ? HEART_FILL_SVG : HEART_OUTLINE_SVG;
    const heartColor = liked ? activeColor : inactiveColor;
    const title = liked
      ? 'You have liked this item, click to unlike it'
      : 'Click to like this item';
    const label = count === 1 ? 'Like' : 'Likes';
    const escapedId = Handlebars.Utils.escapeExpression(String(itemId));
    const escapedActiveColor = Handlebars.Utils.escapeExpression(activeColor);
    return new Handlebars.SafeString(
      `<div data-hbwp-like="${escapedId}" data-hbwp-liked="${liked}" data-hbwp-active-color="${escapedActiveColor}" ` +
      `tabindex="0" role="button" title="${title}" ` +
      `style="align-items:center;background:none;border-radius:2px;border:none;cursor:pointer;display:inline-flex;height:fit-content;min-height:28px;width:fit-content;padding:0;font-family:inherit">` +
      `<div data-hbwp-heart style="align-items:center;background-color:transparent;color:${heartColor};display:flex;font-size:16px;height:28px;justify-content:center;width:28px;position:relative">` +
      heartSvg +
      `</div>` +
      `<div data-hbwp-count style="font-size:12px;color:var(--ms-palette-neutralPrimary,#323130);white-space:nowrap">${count} ${label}</div>` +
      `</div>`
    );
  });
}
