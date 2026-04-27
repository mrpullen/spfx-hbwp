import { BaseWebComponent } from '@mrpullen/spfx-extensibility';
import { ensureSkeletonStyles } from './skeletonStyles';

/**
 * <hbwp-rating data-wp-id="..." data-item-id="123"
 *              data-resolve="true"
 *              data-value="3.5" data-user-rating="0"
 *              data-active-color="#ffb900"
 *              data-allow-half="true"
 *              data-readonly="false">
 * </hbwp-rating>
 *
 * Five-star rating control with half-star precision.
 *
 *  - data-value         The displayed average (0–5, decimal). Painted as filled
 *                       stars (with half-star precision when allow-half=true).
 *  - data-user-rating   The current user's submitted rating (0 if none).
 *                       Shown in parentheses next to the average.
 *  - data-resolve       If "true", calls executeRead('_social','getRating')
 *                       on connect to populate value, count, and user rating.
 *  - data-allow-half    Default true. Set to "false" to snap to whole stars.
 *  - data-readonly      If "true", disables hover/click voting (display-only).
 *  - data-active-color  Star fill color (default goldenrod #ffb900).
 *
 * On hover: stars repaint live to indicate the rating that would be submitted
 * based on cursor X position. A floating label shows the numeric value.
 *
 * On click: dispatches executeWrite('_social','rate', { value }) and updates
 * data-value/data-user-rating optimistically. Reverts on error.
 */

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

export class HbwpRatingElement extends BaseWebComponent {
  private _starsWrap: HTMLDivElement | undefined;
  private _starEls: SVGSVGElement[] = [];
  private _fillRectEls: SVGRectElement[] = [];
  private _statusEl: HTMLSpanElement | undefined;
  private _hoverLabel: HTMLSpanElement | undefined;
  private _skeletonEl: HTMLDivElement | undefined;

  private _value: number = 0;       // displayed average
  private _userRating: number = 0;  // the current user's rating
  private _count: number = 0;
  private _activeColor: string = '#ffb900';
  private _inactiveColor: string = '#e1dfdd';
  private _allowHalf: boolean = true;
  private _readonly: boolean = false;
  private _gradientIds: string[] = [];

  protected connectedCallback(): void {
    this._value = parseFloat(this.getAttribute('data-value') || '0') || 0;
    this._userRating = parseFloat(this.getAttribute('data-user-rating') || '0') || 0;
    this._count = parseInt(this.getAttribute('data-count') || '0', 10) || 0;
    this._activeColor = this.getAttribute('data-active-color') || this._activeColor;
    this._allowHalf = this.getAttribute('data-allow-half') !== 'false';
    this._readonly = this.getAttribute('data-readonly') === 'true';
    const willResolve = this.getAttribute('data-resolve') === 'true';

    this.style.display = 'inline-flex';
    this.style.alignItems = 'center';
    this.style.gap = '8px';
    this.style.userSelect = 'none';
    this.style.fontFamily = 'var(--body-font, "Segoe UI", sans-serif)';

    this._buildDom();
    this._paint(this._value);

    if (willResolve) {
      ensureSkeletonStyles();
      this._showSkeleton();
      this._resolveRating();
    }
  }

  private _showSkeleton(): void {
    if (this._starsWrap) this._starsWrap.style.visibility = 'hidden';
    if (this._statusEl) this._statusEl.style.visibility = 'hidden';
    if (this._hoverLabel) this._hoverLabel.style.visibility = 'hidden';
    if (!this._skeletonEl) {
      this._skeletonEl = document.createElement('div');
      this._skeletonEl.className = 'hbwp-skeleton';
      Object.assign(this._skeletonEl.style, {
        position: 'absolute',
        width: '140px',
        height: '16px',
        top: '50%',
        left: '0',
        transform: 'translateY(-50%)'
      } as CSSStyleDeclaration);
      this.style.position = 'relative';
      this.appendChild(this._skeletonEl);
    }
    this._skeletonEl.style.display = 'block';
  }

  private _hideSkeleton(): void {
    if (this._skeletonEl) this._skeletonEl.style.display = 'none';
    if (this._starsWrap) this._starsWrap.style.visibility = '';
    if (this._statusEl) this._statusEl.style.visibility = '';
    // hover label visibility is managed by mouseenter/leave; leave hidden by default
  }

  // ---------- DOM ----------

  private _buildDom(): void {
    this._starsWrap = document.createElement('div');
    Object.assign(this._starsWrap.style, {
      display: 'inline-flex',
      gap: '2px',
      cursor: this._readonly ? 'default' : 'pointer',
      position: 'relative'
    } as CSSStyleDeclaration);

    const uid = `hbwprate-${Math.random().toString(36).slice(2, 9)}`;

    for (let i = 0; i < 5; i++) {
      const gradientId = `${uid}-g${i}`;
      this._gradientIds.push(gradientId);
      const star = this._buildStar(gradientId, i);
      this._starsWrap.appendChild(star);
    }

    if (!this._readonly) {
      this._starsWrap.addEventListener('mousemove', this._onMouseMove);
      this._starsWrap.addEventListener('mouseleave', this._onMouseLeave);
      this._starsWrap.addEventListener('click', this._onClick);
    }

    this._statusEl = document.createElement('span');
    this._statusEl.style.fontSize = '13px';
    this._statusEl.style.color = '#605e5c';

    this._hoverLabel = document.createElement('span');
    Object.assign(this._hoverLabel.style, {
      fontSize: '12px',
      color: this._activeColor,
      fontWeight: '600',
      minWidth: '24px',
      visibility: 'hidden'
    } as CSSStyleDeclaration);

    this.appendChild(this._starsWrap);
    this.appendChild(this._hoverLabel);
    this.appendChild(this._statusEl);
  }

  private _buildStar(gradientId: string, index: number): SVGSVGElement {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.style.transition = 'transform 80ms ease';
    svg.dataset.starIndex = String(index);

    // Defs / linearGradient — used to paint half-stars precisely
    const defs = document.createElementNS(svgNS, 'defs');
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', gradientId);
    grad.setAttribute('x1', '0');
    grad.setAttribute('x2', '1');
    grad.setAttribute('y1', '0');
    grad.setAttribute('y2', '0');

    const stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', this._activeColor);
    const stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '0%');
    stop2.setAttribute('stop-color', this._inactiveColor);

    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Clip path of the star — fill rect uses gradient, stroke is the star outline
    const clipId = `${gradientId}-clip`;
    const clip = document.createElementNS(svgNS, 'clipPath');
    clip.setAttribute('id', clipId);
    const clipPath = document.createElementNS(svgNS, 'path');
    clipPath.setAttribute('d', STAR_PATH);
    clip.appendChild(clipPath);
    defs.appendChild(clip);

    const fillRect = document.createElementNS(svgNS, 'rect');
    fillRect.setAttribute('x', '0');
    fillRect.setAttribute('y', '0');
    fillRect.setAttribute('width', '24');
    fillRect.setAttribute('height', '24');
    fillRect.setAttribute('fill', `url(#${gradientId})`);
    fillRect.setAttribute('clip-path', `url(#${clipId})`);
    svg.appendChild(fillRect);

    // Outline stroke for crispness
    const outline = document.createElementNS(svgNS, 'path');
    outline.setAttribute('d', STAR_PATH);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', this._activeColor);
    outline.setAttribute('stroke-width', '1');
    outline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(outline);

    this._starEls.push(svg);
    this._fillRectEls.push(fillRect as unknown as SVGRectElement);
    // Cache the gradient stops via data so _paint can update them quickly
    (svg as any).__hbwpStops = [stop1, stop2];

    return svg;
  }

  // ---------- Paint ----------

  /**
   * Paint the stars to reflect a numeric rating (0–5, half-step precision).
   * Each star's gradient is set to either fully filled, fully empty, or
   * 50% (half-star).
   */
  private _paint(value: number): void {
    for (let i = 0; i < 5; i++) {
      const stops = (this._starEls[i] as any).__hbwpStops as [SVGStopElement, SVGStopElement];
      let pct = 0;
      if (value >= i + 1) pct = 100;
      else if (this._allowHalf && value >= i + 0.5) pct = 50;
      else if (value > i) pct = (value - i) * 100;

      stops[0].setAttribute('offset', `${pct}%`);
      stops[1].setAttribute('offset', `${pct}%`);
    }
    this._renderStatus();
  }

  private _renderStatus(): void {
    if (!this._statusEl) return;
    if (this._value > 0 || this._count > 0 || this._userRating > 0) {
      const avgFmt = this._value > 0 ? this._value.toFixed(1) : '0';
      const countLabel = this._count > 0 ? ` (${this._count})` : '';
      const userPart = this._userRating > 0 ? ` — your rating: ${this._userRating.toFixed(1)}` : '';
      this._statusEl.textContent = `${avgFmt}${countLabel}${userPart}`;
    } else {
      this._statusEl.textContent = '';
    }
  }

  // ---------- Hover ----------

  private _onMouseMove = (e: MouseEvent): void => {
    const v = this._valueFromEvent(e);
    if (v <= 0) return;
    this._paint(v);
    if (this._hoverLabel) {
      this._hoverLabel.textContent = String(v);
      this._hoverLabel.style.visibility = 'visible';
    }
  };

  private _onMouseLeave = (): void => {
    this._paint(this._value);
    if (this._hoverLabel) {
      this._hoverLabel.style.visibility = 'hidden';
    }
  };

  private _onClick = (e: MouseEvent): void => {
    const v = this._valueFromEvent(e);
    if (v <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    this._submit(v);
  };

  /**
   * Resolve the rating value corresponding to the cursor's X position over
   * the star strip. Submissions are always whole stars (1–5); half-stars are
   * a *display-only* feature for showing averages — `data-allow-half` only
   * affects how the painted average is drawn, not the submitted value.
   */
  private _valueFromEvent(e: MouseEvent): number {
    const target = (e.target as Element | null)?.closest('svg[data-star-index]') as SVGSVGElement | null;
    if (!target) return 0;
    const idx = parseInt(target.dataset.starIndex || '-1', 10);
    if (idx < 0) return 0;
    return idx + 1; // whole stars only, 1–5
  }

  // ---------- Submit / Resolve ----------

  private _submit(value: number): void {
    const ctx = this.getServiceContext();
    const itemId = this.getAttribute('data-item-id');
    if (!ctx || !ctx.executeWrite || !ctx.siteUrl || !ctx.listId || !itemId) {
      console.warn('[hbwp-rating] missing ctx/executeWrite/siteUrl/listId/itemId');
      return;
    }

    const previousValue = this._value;
    const previousUser = this._userRating;
    const previousCount = this._count;

    // Optimistic update — recompute the running average locally:
    //   - if user had no prior rating → count grows by 1, add their value
    //   - if user had a prior rating → count unchanged, swap their value
    const newCount = previousUser > 0 ? previousCount : previousCount + 1;
    const sum = previousValue * previousCount - (previousUser > 0 ? previousUser : 0) + value;
    const newAverage = newCount > 0 ? sum / newCount : value;

    this._value = newAverage;
    this._userRating = value;
    this._count = newCount;
    this.setAttribute('data-value', String(newAverage));
    this.setAttribute('data-user-rating', String(value));
    this.setAttribute('data-count', String(newCount));
    this._paint(newAverage);

    ctx.executeWrite('_social', 'rate', {
      siteUrl: ctx.siteUrl,
      listId: ctx.listId,
      itemId: Number(itemId),
      value
    }).then((result) => {
      if (!result.success) {
        console.error('[hbwp-rating] rate failed:', result.error);
        // Revert
        this._value = previousValue;
        this._userRating = previousUser;
        this._count = previousCount;
        this.setAttribute('data-value', String(previousValue));
        this.setAttribute('data-user-rating', String(previousUser));
        this.setAttribute('data-count', String(previousCount));
        this._paint(previousValue);
        return;
      }
      // Re-fetch authoritative values from the server (running-average math
      // is approximate; the server may have rounded differently or other
      // ratings may have come in concurrently).
      this._resolveRating();
    }).catch((err: Error) => {
      console.error('[hbwp-rating] rate error:', err);
      this._value = previousValue;
      this._userRating = previousUser;
      this._count = previousCount;
      this.setAttribute('data-value', String(previousValue));
      this.setAttribute('data-user-rating', String(previousUser));
      this.setAttribute('data-count', String(previousCount));
      this._paint(previousValue);
    });
  }

  private _resolveRating(): void {
    const ctx = this.getServiceContext();
    const itemId = this.getAttribute('data-item-id');
    if (!ctx || !ctx.executeRead || !ctx.siteUrl || !ctx.listId || !itemId) {
      console.warn('[hbwp-rating] resolve aborted — missing ctx/executeRead/siteUrl/listId/itemId');
      this._hideSkeleton();
      return;
    }

    ctx.executeRead('_social', 'getRating', {
      siteUrl: ctx.siteUrl,
      listId: ctx.listId,
      itemId: Number(itemId)
    }).then((result) => {
      if (!result.success || !result.data) return;
      const avg = typeof result.data.average === 'number' ? result.data.average : 0;
      const userRating = typeof result.data.userRating === 'number' ? result.data.userRating : 0;
      const count = typeof result.data.count === 'number' ? result.data.count : 0;
      this._value = avg;
      this._userRating = userRating;
      this._count = count;
      this.setAttribute('data-value', String(avg));
      this.setAttribute('data-user-rating', String(userRating));
      this.setAttribute('data-count', String(count));
      this._paint(avg);
    }).catch((err: Error) => {
      console.error('[hbwp-rating] getRating failed:', err);
    }).then(() => {
      this._hideSkeleton();
    });
  }
}
