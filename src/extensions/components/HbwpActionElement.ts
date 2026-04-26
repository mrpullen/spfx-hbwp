import { BaseWebComponent, IDataEnvelope, DataAction } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-action data-wp-id="..."
 *              data-action="selection-changed"
 *              data-topic="selectedEmployee"
 *              data-item='{"Id":1,"Title":"foo"}' data-items='[...]'>
 *   Click me
 * </hbwp-action>
 *
 * Publishes a MessageBus envelope when clicked.
 *
 * Supported actions (see DataAction in @mrpullen/spfx-extensibility):
 *   - selection-changed     (data-item / data-items)
 *   - criteria-changed      (data-item, data-criteria-key REQUIRED; item="null" clears slice)
 *   - page-requested        (data-direction REQUIRED; data-paging-token optional)
 *   - item-saved            (data-item)
 *   - item-deleted          (data-item)
 *   - refresh-requested     (no payload)
 *   - cache-cleared         (no payload)
 *
 * NOTE: `data-changed` is reserved for adapters and will be rejected here.
 */
export class HbwpActionElement extends BaseWebComponent {
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
    this._publish();
  };

  private _onKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      e.preventDefault();
      this._publish();
    }
  };

  private _publish(): void {
    const ctx = this.getServiceContext();
    const action = this.getAttribute('data-action') as DataAction;
    const topic = this.getAttribute('data-topic');

    if (!ctx || !ctx.messageBus || !action || !topic) {
      console.warn('[hbwp-action] Missing service context, messageBus, action, or topic');
      return;
    }

    // Guard #1: UI never publishes data-changed
    if (action === 'data-changed') {
      console.error('[hbwp-action] `data-changed` is adapter-only and cannot be published from UI.');
      return;
    }

    // Build the data payload by verb
    const data: IDataEnvelope['data'] = {};

    // Optional item / items payload (most verbs)
    const itemJson = this.getAttribute('data-item');
    const itemsJson = this.getAttribute('data-items');
    if (itemJson !== null) {
      // Special case: `null` literal clears a criteria slice
      if (itemJson === 'null') {
        data.item = null;
      } else {
        try { data.item = JSON.parse(itemJson); } catch (_e) { /* ignore bad JSON */ }
      }
    }
    if (itemsJson) {
      try { data.items = JSON.parse(itemsJson); } catch (_e) { /* ignore bad JSON */ }
    }

    // Verb-specific required fields
    if (action === 'criteria-changed') {
      const criteriaKey = this.getAttribute('data-criteria-key');
      if (!criteriaKey) {
        console.error('[hbwp-action] criteria-changed requires data-criteria-key attribute.');
        return;
      }
      data.criteriaKey = criteriaKey;
    }

    if (action === 'page-requested') {
      const direction = this.getAttribute('data-direction') as IDataEnvelope['data']['direction'];
      if (direction !== 'next' && direction !== 'prev' && direction !== 'first') {
        console.error('[hbwp-action] page-requested requires data-direction="next|prev|first".');
        return;
      }
      data.direction = direction;
      const pagingToken = this.getAttribute('data-paging-token');
      if (pagingToken) data.pagingToken = pagingToken;
    }

    const envelope: IDataEnvelope = {
      topic,
      source: ctx.instanceId,
      timestamp: Date.now(),
      action,
      data
    };

    ctx.messageBus.publish(envelope);
  }
}
