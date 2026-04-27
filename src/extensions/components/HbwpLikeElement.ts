import { BaseWebComponent } from '@mrpullen/spfx-extensibility';
import { ensureSkeletonStyles } from './skeletonStyles';

const HEART_FILL_SVG = '<svg data-hbwp-heart-svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M7.99 3.31C6.57 1.07 2.54.73 1.09 3.52c-1.37 2.64.46 5.47 3.93 8.27.96.78 1.95 1.46 2.98 2.21 1.02-.75 2.01-1.43 2.97-2.2 3.47-2.8 5.3-5.64 3.93-8.28C13.45.73 9.42 1.07 7.99 3.31z"/></svg>';
const HEART_OUTLINE_SVG = '<svg data-hbwp-heart-svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M7.99 3.31C6.57 1.07 2.54.73 1.09 3.52c-1.37 2.64.46 5.47 3.93 8.27.96.78 1.95 1.46 2.98 2.21 1.02-.75 2.01-1.43 2.97-2.2 3.47-2.8 5.3-5.64 3.93-8.28C13.45.73 9.42 1.07 7.99 3.31z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';

/**
 * <hbwp-like data-wp-id="..." data-item-id="123" data-liked="false"
 *            data-active-color="#c00" data-count="5"
 *            data-resolve="true">
 * </hbwp-like>
 *
 * Renders a like button with optimistic UI (heart SVG + count).
 * Calls the `_social` write adapter via ctx.executeWrite (toggleLike).
 *
 * If `data-resolve="true"`, the element will call ctx.executeRead('_social',
 * 'isLiked', ...) on connect and update its own liked state + count from
 * the server. Useful when the template can't compute liked state up front.
 */

export class HbwpLikeElement extends BaseWebComponent {
  private _heartEl: HTMLElement | undefined;
  private _countEl: HTMLElement | undefined;
  private _skeletonEl: HTMLElement | undefined;
  private _activeColor: string = 'var(--ms-palette-neutralPrimary, #323130)';
  private _inactiveColor: string = 'var(--ms-semanticColors-infoIcon, #605e5c)';

  protected connectedCallback(): void {
    const liked = this.getAttribute('data-liked') === 'true';
    const count = parseInt(this.getAttribute('data-count') || '0', 10) || 0;
    this._activeColor = this.getAttribute('data-active-color') || this._activeColor;
    const willResolve = this.getAttribute('data-resolve') === 'true';

    this.style.cursor = 'pointer';
    this.style.display = 'inline-flex';
    this.style.alignItems = 'center';
    this.style.gap = '4px';
    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');
    this.setAttribute('title', liked ? 'You have liked this item, click to unlike it' : 'Click to like this item');

    // Heart icon
    this._heartEl = document.createElement('span');
    this._heartEl.innerHTML = liked ? HEART_FILL_SVG : HEART_OUTLINE_SVG;
    this._heartEl.style.color = liked ? this._activeColor : this._inactiveColor;
    this._heartEl.style.display = 'inline-flex';
    this.appendChild(this._heartEl);

    // Count label — clickable, opens the likers drawer (if any drawer is on the page)
    this._countEl = document.createElement('span');
    this._countEl.textContent = count + (count === 1 ? ' Like' : ' Likes');
    this._countEl.style.cursor = 'pointer';
    this._countEl.style.textDecoration = 'underline';
    this._countEl.style.textDecorationStyle = 'dotted';
    this._countEl.setAttribute('role', 'button');
    this._countEl.setAttribute('tabindex', '0');
    this._countEl.setAttribute('title', 'Show people who liked this');
    this._countEl.addEventListener('click', this._onCountClick);
    this._countEl.addEventListener('keydown', this._onCountKeydown);
    this.appendChild(this._countEl);

    this.addEventListener('click', this._onClick);
    this.addEventListener('keydown', this._onKeydown);

    // Optionally resolve liked state from the server. While we wait, hide the
    // real UI behind a skeleton placeholder so the user doesn't see a flicker.
    if (willResolve) {
      ensureSkeletonStyles();
      this._showSkeleton();
      this._resolveLiked();
    }
  }

  private _showSkeleton(): void {
    if (this._heartEl) this._heartEl.style.visibility = 'hidden';
    if (this._countEl) this._countEl.style.visibility = 'hidden';
    if (!this._skeletonEl) {
      this._skeletonEl = document.createElement('span');
      this._skeletonEl.className = 'hbwp-skeleton';
      Object.assign(this._skeletonEl.style, {
        position: 'absolute',
        width: '52px',
        height: '12px',
        top: '50%',
        left: '0',
        transform: 'translateY(-50%)'
      } as CSSStyleDeclaration);
      // host needs relative positioning so the absolute skeleton overlays
      this.style.position = 'relative';
      this.appendChild(this._skeletonEl);
    }
    this._skeletonEl.style.display = 'inline-block';
  }

  private _hideSkeleton(): void {
    if (this._skeletonEl) this._skeletonEl.style.display = 'none';
    if (this._heartEl) this._heartEl.style.visibility = '';
    if (this._countEl) this._countEl.style.visibility = '';
  }

  /**
   * Query the `_social` adapter for current liked state + count and update
   * the UI. Used when the template can't pre-compute liked state.
   */
  private _resolveLiked(): void {
    const ctx = this.getServiceContext();
    const itemId = this.getAttribute('data-item-id');
    console.log('[hbwp-like] resolve start', { itemId, hasCtx: !!ctx, hasExecuteRead: !!ctx?.executeRead, siteUrl: ctx?.siteUrl, listId: ctx?.listId });
    if (!ctx || !ctx.executeRead || !ctx.siteUrl || !ctx.listId || !itemId) {
      console.warn('[hbwp-like] resolve aborted — missing ctx/executeRead/siteUrl/listId/itemId', { hasCtx: !!ctx, hasExecuteRead: !!ctx?.executeRead, siteUrl: ctx?.siteUrl, listId: ctx?.listId, itemId });
      this._hideSkeleton();
      return;
    }

    ctx.executeRead('_social', 'isLiked', { siteUrl: ctx.siteUrl, listId: ctx.listId, itemId: Number(itemId) })
      .then((result) => {
        console.log('[hbwp-like] isLiked result', result);
        if (!result.success || !result.data) return;
        const liked = !!result.data.liked;
        const count = typeof result.data.count === 'number' ? result.data.count : 0;
        this.setAttribute('data-liked', String(liked));
        this.setAttribute('data-count', String(count));
        this.setAttribute('title', liked ? 'You have liked this item, click to unlike it' : 'Click to like this item');
        if (this._heartEl) {
          this._heartEl.innerHTML = liked ? HEART_FILL_SVG : HEART_OUTLINE_SVG;
          this._heartEl.style.color = liked ? this._activeColor : this._inactiveColor;
        }
        if (this._countEl) {
          this._countEl.textContent = count + (count === 1 ? ' Like' : ' Likes');
        }
      })
      .catch((err: Error) => {
        console.error('[hbwp-like] isLiked lookup failed:', err);
      })
      .then(() => {
        this._hideSkeleton();
      });
  }

  private _onClick = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this._toggle();
  };

  private _onCountClick = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this._dispatchLikersRequested();
  };

  private _onCountKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this._dispatchLikersRequested();
    }
  };

  private _dispatchLikersRequested(): void {
    const ctx = this.getServiceContext();
    const itemId = this.getAttribute('data-item-id');
    const count = parseInt(this.getAttribute('data-count') || '0', 10) || 0;
    if (count === 0) return; // nothing to show
    if (!ctx || !ctx.siteUrl || !ctx.listId || !itemId) return;

    this.dispatchEvent(new CustomEvent('hbwp-likers-requested', {
      bubbles: true,
      composed: true,
      detail: {
        siteUrl: ctx.siteUrl,
        listId: ctx.listId,
        itemId: Number(itemId),
        count,
        wpId: this.getAttribute('data-wp-id') || ''
      }
    }));
  }

  private _onKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      this._toggle();
    }
  };

  private _toggle(): void {
    const ctx = this.getServiceContext();
    const itemId = this.getAttribute('data-item-id');
    const liked = this.getAttribute('data-liked') === 'true';

    if (!ctx || !ctx.executeWrite || !ctx.siteUrl || !ctx.listId || !itemId) {
      console.warn('[hbwp-like] Missing service context, executeWrite, siteUrl, listId, or itemId');
      return;
    }

    // Optimistic UI update
    const newLiked = !liked;
    this.setAttribute('data-liked', String(newLiked));
    this.setAttribute('title', newLiked ? 'You have liked this item, click to unlike it' : 'Click to like this item');

    if (this._heartEl) {
      this._heartEl.innerHTML = newLiked ? HEART_FILL_SVG : HEART_OUTLINE_SVG;
      this._heartEl.style.color = newLiked ? this._activeColor : this._inactiveColor;
    }
    if (this._countEl) {
      const current = parseInt(this._countEl.textContent || '0', 10) || 0;
      const newCount = newLiked ? current + 1 : Math.max(0, current - 1);
      this._countEl.textContent = newCount + (newCount === 1 ? ' Like' : ' Likes');
    }

    // Fire-and-forget API call. We trust the optimistic state and don't
    // re-resolve from the server — the round-trip + pub/sub re-render was
    // causing a visible state-flicker (liked -> unliked -> liked -> unliked).
    // The server count is derived from LikedBy length, so toggling locally
    // is exact for the current user. Other viewers will pick up the change
    // on their next resolve.
    ctx.executeWrite('_social', 'toggleLike', { siteUrl: ctx.siteUrl, listId: ctx.listId, itemId: Number(itemId), currentlyLiked: liked })
      .catch((err: Error) => {
        console.error('[hbwp-like] toggleLike failed:', err);
        // Revert optimistic UI
        this.setAttribute('data-liked', String(liked));
        this.setAttribute('title', liked ? 'You have liked this item, click to unlike it' : 'Click to like this item');
        if (this._heartEl) {
          this._heartEl.innerHTML = liked ? HEART_FILL_SVG : HEART_OUTLINE_SVG;
          this._heartEl.style.color = liked ? this._activeColor : this._inactiveColor;
        }
        if (this._countEl) {
          const current = parseInt(this._countEl.textContent || '0', 10) || 0;
          const reverted = liked ? current + 1 : Math.max(0, current - 1);
          this._countEl.textContent = reverted + (reverted === 1 ? ' Like' : ' Likes');
        }
      });
  }
}
