/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseWebComponent, IDataEnvelope, DataAction } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-form> — Form container web component.
 *
 * Wraps child inputs and handles submission through the ServiceContext's
 * FormSubmitService. Attributes:
 *   data-endpoint        — endpoint key passed to FormSubmitService (default: "default")
 *   data-reset           — reset fields on success (default: "true")
 *   data-topic           — MessageBus topic to notify on success (typically the adapter key, e.g. "roster")
 *   data-publish-action  — DataAction verb to publish on success: "item-saved" (default) or "item-deleted"
 *   data-wp-id           — web part instance ID (injected automatically by HBWP)
 *
 * Dispatches custom events:
 *   hbwp-form-submit   — { detail: { endpoint, formData } }
 *   hbwp-form-success  — { detail: { endpoint, result } }
 *   hbwp-form-error    — { detail: { endpoint, error } }
 *
 * Publishes on the MessageBus on success (if data-topic set):
 *   { topic, action: 'item-saved'|'item-deleted', data: { item: <saved record> } }
 */
export class HbwpFormElement extends BaseWebComponent {

  protected connectedCallback(): void {
    // Wrap existing innerHTML in a <form>
    const endpoint = this.getAttribute('data-endpoint') || 'default';
    const resetOnSuccess = this.getAttribute('data-reset') !== 'false';

    const form = document.createElement('form');
    form.setAttribute('data-hbwp-submit', endpoint);
    form.setAttribute('data-hbwp-reset', String(resetOnSuccess));

    // Move child nodes into the form
    while (this.firstChild) {
      form.appendChild(this.firstChild);
    }

    // Add result container
    const resultDiv = document.createElement('div');
    resultDiv.setAttribute('data-hbwp-result', '');
    resultDiv.style.marginTop = '12px';
    form.appendChild(resultDiv);

    this.appendChild(form);

    form.addEventListener('submit', (e) => this._handleSubmit(e, form, endpoint, resetOnSuccess, resultDiv));
  }

  private async _handleSubmit(
    e: Event,
    form: HTMLFormElement,
    endpoint: string,
    resetOnSuccess: boolean,
    resultDiv: HTMLElement
  ): Promise<void> {
    e.preventDefault();

    const formData: Record<string, any> = {};
    const elements = form.querySelectorAll('[name]');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as any;
      const name = el.getAttribute('name');
      if (!name) continue;

      if (el.tagName.toLowerCase() === 'fluent-checkbox' || el.type === 'checkbox') {
        formData[name] = !!(el.checked || el.currentChecked);
      } else {
        formData[name] = el.value || '';
      }

      // Coerce hidden fields with data-type
      const dataType = el.getAttribute('data-type');
      if (dataType === 'number') formData[name] = Number(formData[name]) || 0;
      if (dataType === 'boolean') formData[name] = formData[name] === 'true';
    }

    this.dispatchEvent(new CustomEvent('hbwp-form-submit', {
      bubbles: true, detail: { endpoint, formData }
    }));

    const ctx = this.getServiceContext();
    if (!ctx?.executeWrite) {
      console.warn(`[hbwp-form] No executeWrite available for endpoint "${endpoint}"`);
      return;
    }

    try {
      const result = await ctx.executeWrite('_formSubmit', 'submit', { endpointKey: endpoint, formData });
      if (result.success) {
        resultDiv.innerHTML = '<span style="color:green">Submitted successfully.</span>';
        if (resetOnSuccess) {
          form.reset();
          // Reset Fluent UI web-component values that .reset() doesn't cover
          form.querySelectorAll('fluent-text-field, fluent-text-area, fluent-select').forEach((el: any) => {
            if (typeof el.value !== 'undefined') el.value = '';
          });
        }
        this.dispatchEvent(new CustomEvent('hbwp-form-success', {
          bubbles: true, detail: { endpoint, result }
        }));

        // Publish item-saved / item-deleted to MessageBus so the owning adapter refetches
        const topic = this.getAttribute('data-topic');
        if (topic && ctx.messageBus) {
          const action = (this.getAttribute('data-publish-action') as DataAction) || 'item-saved';
          if (action !== 'item-saved' && action !== 'item-deleted') {
            console.warn(`[hbwp-form] data-publish-action="${action}" is not allowed; use "item-saved" or "item-deleted".`);
          } else {
            const envelope: IDataEnvelope = {
              topic,
              source: ctx.instanceId,
              timestamp: Date.now(),
              action,
              data: { item: (result.data as Record<string, any>) || formData }
            };
            ctx.messageBus.publish(envelope);
          }
        }
      } else {
        resultDiv.innerHTML = `<span style="color:red">${result.error || 'Submission failed.'}</span>`;
        this.dispatchEvent(new CustomEvent('hbwp-form-error', {
          bubbles: true, detail: { endpoint, error: result.error }
        }));
      }
      // Auto-clear the result message after 8 seconds
      setTimeout(() => { if (resultDiv) resultDiv.innerHTML = ''; }, 8000);
    } catch (err: any) {
      resultDiv.innerHTML = `<span style="color:red">${err.message || 'Unexpected error.'}</span>`;
      this.dispatchEvent(new CustomEvent('hbwp-form-error', {
        bubbles: true, detail: { endpoint, error: err.message }
      }));
      setTimeout(() => { if (resultDiv) resultDiv.innerHTML = ''; }, 8000);
    }
  }
}
