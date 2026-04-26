import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-hidden> — Hidden input web component.
 *
 * Attributes:
 *   name, value, data-type (optional: "number" | "boolean" for coercion)
 */
export class HbwpHiddenElement extends BaseWebComponent {

  protected connectedCallback(): void {
    const name = this.getAttribute('name') || '';
    const value = this.getAttribute('value') || '';
    const dataType = this.getAttribute('data-type') || '';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    if (dataType) input.setAttribute('data-type', dataType);

    this.appendChild(input);
  }
}
