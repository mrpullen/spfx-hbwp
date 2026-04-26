import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-checkbox> — Checkbox web component wrapping <fluent-checkbox>.
 *
 * Attributes:
 *   name, label, required, checked
 */
export class HbwpCheckboxElement extends BaseWebComponent {

  protected connectedCallback(): void {
    const name = this.getAttribute('name') || '';
    const label = this.getAttribute('label') || '';
    const required = this.hasAttribute('required') ? 'required' : '';
    const checked = this.hasAttribute('checked') ? 'checked' : '';

    const cb = document.createElement('fluent-checkbox');
    cb.setAttribute('name', name);
    if (required) cb.setAttribute('required', '');
    if (checked) cb.setAttribute('checked', '');
    cb.textContent = label;

    this.appendChild(cb);
  }
}
