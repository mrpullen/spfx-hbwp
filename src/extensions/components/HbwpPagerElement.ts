import { BaseWebComponent, IDataEnvelope } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-pager data-wp-id="..." data-direction="next">Next</hbwp-pager>
 * <hbwp-pager data-wp-id="..." data-topic="roster" data-direction="prev">Prev</hbwp-pager>
 *
 * Publishes a `page-requested` envelope on the MessageBus for the owning adapter.
 * The adapter named by `data-topic` (which is the data-source key — `items` by
 * default for the primary list) re-fetches with the appropriate paging token,
 * preserving current criteria, and publishes `data-changed` when ready.
 *
 * Reads the latest paging token from `messageBus.lastMessage(topic)` so a fresh
 * pager shows correct enabled/disabled state on first paint.
 */
export class HbwpPagerElement extends BaseWebComponent {
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
    this._publishPageRequest();
  };

  private _onKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      this._publishPageRequest();
    }
  };

  private _publishPageRequest(): void {
    const direction = this.getAttribute('data-direction') as IDataEnvelope['data']['direction'];
    // data-topic maps to the data-source key in the property pane.
    // Defaults to 'items' (the primary list) when omitted so templates that
    // page the main list don't need to specify a topic.
    const topic = this.getAttribute('data-topic') || 'items';
    if (direction !== 'next' && direction !== 'prev' && direction !== 'first') {
      console.warn('[hbwp-pager] data-direction must be "next", "prev", or "first"');
      return;
    }

    const ctx = this.getServiceContext();
    if (!ctx?.messageBus) {
      console.warn('[hbwp-pager] No messageBus available in service context');
      return;
    }

    // Read the most recent paging token for this topic from the bus
    const last = ctx.messageBus.lastMessage(topic);
    const lastPaging = last?.data?.result?.paging;
    let pagingToken: string | undefined;
    if (direction === 'next') pagingToken = lastPaging?.nextToken;
    else if (direction === 'prev') pagingToken = lastPaging?.prevToken;
    // 'first' carries no token

    const envelope: IDataEnvelope = {
      topic,
      source: ctx.instanceId,
      timestamp: Date.now(),
      action: 'page-requested',
      data: {
        direction,
        ...(pagingToken ? { pagingToken } : {})
      }
    };
    ctx.messageBus.publish(envelope);
  }
}
