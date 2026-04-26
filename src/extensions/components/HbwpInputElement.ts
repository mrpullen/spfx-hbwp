import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-input> — Text input web component wrapping <fluent-text-field>.
 *
 * Attributes:
 *   name, label, type, required, pattern, minlength, maxlength,
 *   placeholder, value
 */
export class HbwpInputElement extends BaseWebComponent {

  protected connectedCallback(): void {
    const name = this.getAttribute('name') || '';
    const label = this.getAttribute('label') || '';
    const type = this.getAttribute('type') || 'text';
    const required = this.hasAttribute('required') ? 'required' : '';
    const pattern = this.getAttribute('pattern');
    const minlength = this.getAttribute('minlength');
    const maxlength = this.getAttribute('maxlength');
    const placeholder = this.getAttribute('placeholder') || '';
    const value = this.getAttribute('value') || '';

    const field = document.createElement('fluent-text-field');
    field.setAttribute('name', name);
    field.setAttribute('type', type);
    if (required) field.setAttribute('required', '');
    if (pattern) field.setAttribute('pattern', pattern);
    if (minlength) field.setAttribute('minlength', minlength);
    if (maxlength) field.setAttribute('maxlength', maxlength);
    field.setAttribute('placeholder', placeholder);
    field.setAttribute('value', value);
    field.style.width = '100%';
    field.textContent = label;

    this.appendChild(field);
  }
}
