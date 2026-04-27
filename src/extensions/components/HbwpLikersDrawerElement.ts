import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-likers-drawer data-wp-id="..." data-page-size="25"></hbwp-likers-drawer>
 *
 * Listens on `document` for `hbwp-likers-requested` CustomEvents (dispatched by
 * <hbwp-like> when the count text is clicked). Opens an overlay drawer with a
 * paged list of users who have liked the item.
 *
 * Calls executeRead('_social', 'getLikedBy', { siteUrl, listId, itemId, skip, top }).
 *
 * One drawer per page is enough — it filters incoming events by data-wp-id when
 * set; if data-wp-id is omitted, it handles events from any web part.
 */

interface ILikerInfo {
  id: number;
  title: string;
  email: string;
  loginName: string;
}

export class HbwpLikersDrawerElement extends BaseWebComponent {
  private _overlay: HTMLDivElement | undefined;
  private _panel: HTMLDivElement | undefined;
  private _header: HTMLDivElement | undefined;
  private _listEl: HTMLDivElement | undefined;
  private _footer: HTMLDivElement | undefined;
  private _prevBtn: HTMLButtonElement | undefined;
  private _nextBtn: HTMLButtonElement | undefined;
  private _statusEl: HTMLSpanElement | undefined;

  private _siteUrl: string = '';
  private _listId: string = '';
  private _itemId: number = 0;
  private _skip: number = 0;
  private _top: number = 25;
  private _total: number = 0;
  private _loading: boolean = false;

  protected connectedCallback(): void {
    const ps = parseInt(this.getAttribute('data-page-size') || '25', 10);
    if (!isNaN(ps) && ps > 0) this._top = ps;

    this._buildDom();
    document.addEventListener('hbwp-likers-requested', this._onLikersRequested as EventListener);
  }

  protected disconnectedCallback(): void {
    document.removeEventListener('hbwp-likers-requested', this._onLikersRequested as EventListener);
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    super.disconnectedCallback();
  }

  private _onLikersRequested = (e: Event): void => {
    const ce = e as CustomEvent<{ siteUrl: string; listId: string; itemId: number; count: number; wpId: string }>;
    const detail = ce.detail || ({} as any);
    const myWp = this.getAttribute('data-wp-id') || '';
    if (myWp && detail.wpId && myWp !== detail.wpId) return; // not for me

    this._siteUrl = detail.siteUrl;
    this._listId = detail.listId;
    this._itemId = detail.itemId;
    this._skip = 0;
    this._total = detail.count || 0;
    this._open();
    this._fetchPage().catch((err) => console.error('[hbwp-likers-drawer] fetch failed:', err));
  };

  // ---------- DOM ----------

  private _buildDom(): void {
    // Hidden container — drawer sits inside this element, fixed-positioned.
    this.style.display = 'none';

    this._overlay = document.createElement('div');
    Object.assign(this._overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.4)',
      zIndex: '99998', opacity: '0', transition: 'opacity 160ms ease',
      display: 'none'
    } as CSSStyleDeclaration);
    this._overlay.addEventListener('click', () => this._close());

    this._panel = document.createElement('div');
    Object.assign(this._panel.style, {
      position: 'fixed', top: '0', right: '0', height: '100%', width: '380px',
      maxWidth: '100%', background: '#fff', boxShadow: '-2px 0 16px rgba(0,0,0,0.2)',
      zIndex: '99999', transform: 'translateX(100%)', transition: 'transform 200ms ease',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--body-font, "Segoe UI", sans-serif)'
    } as CSSStyleDeclaration);

    this._header = document.createElement('div');
    Object.assign(this._header.style, {
      padding: '16px', borderBottom: '1px solid #edebe9',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    } as CSSStyleDeclaration);
    const title = document.createElement('div');
    title.textContent = 'People who liked this';
    title.style.fontWeight = '600';
    title.style.fontSize = '16px';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'transparent', border: 'none', fontSize: '18px',
      cursor: 'pointer', color: '#605e5c'
    } as CSSStyleDeclaration);
    closeBtn.addEventListener('click', () => this._close());
    this._header.appendChild(title);
    this._header.appendChild(closeBtn);

    this._listEl = document.createElement('div');
    Object.assign(this._listEl.style, {
      flex: '1', overflowY: 'auto', padding: '8px 0'
    } as CSSStyleDeclaration);

    this._footer = document.createElement('div');
    Object.assign(this._footer.style, {
      padding: '12px 16px', borderTop: '1px solid #edebe9',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '8px', fontSize: '12px', color: '#605e5c'
    } as CSSStyleDeclaration);
    this._prevBtn = this._buildPagerBtn('‹ Prev', () => this._goPrev());
    this._nextBtn = this._buildPagerBtn('Next ›', () => this._goNext());
    this._statusEl = document.createElement('span');
    this._footer.appendChild(this._prevBtn);
    this._footer.appendChild(this._statusEl);
    this._footer.appendChild(this._nextBtn);

    this._panel.appendChild(this._header);
    this._panel.appendChild(this._listEl);
    this._panel.appendChild(this._footer);

    document.body.appendChild(this._overlay);
    document.body.appendChild(this._panel);
  }

  private _buildPagerBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '6px 12px', border: '1px solid #c8c6c4', borderRadius: '4px',
      background: '#fff', cursor: 'pointer', fontSize: '12px'
    } as CSSStyleDeclaration);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private _open(): void {
    if (!this._overlay || !this._panel) return;
    this._overlay.style.display = 'block';
    // Force reflow before transitioning opacity/transform
    this._overlay.getBoundingClientRect();
    this._overlay.style.opacity = '1';
    this._panel.style.transform = 'translateX(0)';
  }

  private _close(): void {
    if (!this._overlay || !this._panel) return;
    this._overlay.style.opacity = '0';
    this._panel.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (this._overlay) this._overlay.style.display = 'none';
    }, 200);
  }

  // ---------- Data ----------

  private _goPrev(): void {
    if (this._loading || this._skip === 0) return;
    this._skip = Math.max(0, this._skip - this._top);
    this._fetchPage().catch((err) => console.error('[hbwp-likers-drawer] fetch failed:', err));
  }

  private _goNext(): void {
    if (this._loading) return;
    if (this._skip + this._top >= this._total) return;
    this._skip += this._top;
    this._fetchPage().catch((err) => console.error('[hbwp-likers-drawer] fetch failed:', err));
  }

  private async _fetchPage(): Promise<void> {
    const ctx = this.getServiceContext();
    if (!ctx || !ctx.executeRead) {
      this._renderError('Service context unavailable');
      return;
    }
    if (!this._siteUrl || !this._listId || !this._itemId) {
      this._renderError('Missing item context');
      return;
    }

    this._loading = true;
    this._renderLoading();
    try {
      const result = await ctx.executeRead('_social', 'getLikedBy', {
        siteUrl: this._siteUrl,
        listId: this._listId,
        itemId: this._itemId,
        skip: this._skip,
        top: this._top
      });
      if (!result.success || !result.data) {
        this._renderError(result.error || 'Failed to load likers');
        return;
      }
      const users: ILikerInfo[] = result.data.users || [];
      const total: number = typeof result.data.total === 'number' ? result.data.total : users.length;
      this._total = total;
      this._renderList(users);
      this._renderPager();
    } catch (err) {
      this._renderError(err instanceof Error ? err.message : String(err));
    } finally {
      this._loading = false;
    }
  }

  // ---------- Render ----------

  private _renderLoading(): void {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.textContent = 'Loading…';
    msg.style.padding = '16px';
    msg.style.color = '#605e5c';
    this._listEl.appendChild(msg);
    if (this._statusEl) this._statusEl.textContent = '';
    if (this._prevBtn) this._prevBtn.disabled = true;
    if (this._nextBtn) this._nextBtn.disabled = true;
  }

  private _renderError(message: string): void {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.textContent = message;
    msg.style.padding = '16px';
    msg.style.color = '#a4262c';
    this._listEl.appendChild(msg);
    if (this._statusEl) this._statusEl.textContent = '';
    if (this._prevBtn) this._prevBtn.disabled = true;
    if (this._nextBtn) this._nextBtn.disabled = true;
  }

  private _renderList(users: ILikerInfo[]): void {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';

    if (users.length === 0) {
      const msg = document.createElement('div');
      msg.textContent = 'No likers found.';
      msg.style.padding = '16px';
      msg.style.color = '#605e5c';
      this._listEl.appendChild(msg);
      return;
    }

    for (const u of users) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 16px', borderBottom: '1px solid #f3f2f1'
      } as CSSStyleDeclaration);

      const avatar = document.createElement('div');
      Object.assign(avatar.style, {
        width: '32px', height: '32px', borderRadius: '50%', flex: '0 0 32px',
        background: '#0078d4', color: '#fff', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '12px',
        fontWeight: '600', overflow: 'hidden'
      } as CSSStyleDeclaration);
      if (u.email) {
        const img = document.createElement('img');
        img.src = `/_layouts/15/userphoto.aspx?accountname=${encodeURIComponent(u.email)}&size=S`;
        img.alt = u.title;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.onerror = (): void => {
          avatar.textContent = this._initials(u.title);
          if (img.parentNode) img.parentNode.removeChild(img);
        };
        avatar.appendChild(img);
      } else {
        avatar.textContent = this._initials(u.title);
      }

      const info = document.createElement('div');
      info.style.flex = '1';
      info.style.minWidth = '0';
      const nameEl = document.createElement('div');
      nameEl.textContent = u.title || '(unknown)';
      nameEl.style.fontWeight = '500';
      nameEl.style.fontSize = '13px';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.whiteSpace = 'nowrap';
      const emailEl = document.createElement('div');
      emailEl.textContent = u.email || '';
      emailEl.style.fontSize = '11px';
      emailEl.style.color = '#605e5c';
      emailEl.style.overflow = 'hidden';
      emailEl.style.textOverflow = 'ellipsis';
      emailEl.style.whiteSpace = 'nowrap';
      info.appendChild(nameEl);
      if (u.email) info.appendChild(emailEl);

      row.appendChild(avatar);
      row.appendChild(info);
      this._listEl.appendChild(row);
    }
  }

  private _renderPager(): void {
    if (!this._statusEl) return;
    const start = this._total === 0 ? 0 : this._skip + 1;
    const end = Math.min(this._total, this._skip + this._top);
    this._statusEl.textContent = `${start}-${end} of ${this._total}`;
    if (this._prevBtn) this._prevBtn.disabled = this._skip === 0;
    if (this._nextBtn) this._nextBtn.disabled = this._skip + this._top >= this._total;
  }

  private _initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  }
}
