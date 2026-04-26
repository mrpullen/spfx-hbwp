import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-rate data-wp-id="..." data-item-id="123" data-value="3">
 * </hbwp-rate>
 *
 * Submits a rating via the `_social` write adapter (ctx.executeWrite).
 * The `data-value` attribute holds the rating value to submit.
 */
export class HbwpRateElement extends BaseWebComponent {
  protected connectedCallback(): void {
    this.style.cursor = 'pointer';
    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');

    this.addEventListener('click', this._onClick);
    this.addEventListener('keydown', this._onKeydown);
  }

  private _onClick = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this._submitRating();
  };

  private _onKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      this._submitRating();
    }
  };

  private _submitRating(): void {
    const ctx = this.getServiceContext();
    const itemId = this.getAttribute('data-item-id');
    const value = this.getAttribute('data-value');

    if (!ctx || !ctx.executeWrite || !ctx.siteUrl || !ctx.listId || !itemId || value === null) {
      console.warn('[hbwp-rate] Missing service context, executeWrite, siteUrl, listId, itemId, or value');
      return;
    }

    ctx.executeWrite('_social', 'rate', { siteUrl: ctx.siteUrl, listId: ctx.listId, itemId: Number(itemId), value: Number(value) })
      .catch((err: Error) => console.error('[hbwp-rate] rate failed:', err));
  }
}
