import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-textarea> — Textarea web component wrapping <fluent-text-area>.
 *
 * Attributes:
 *   name, label, required, rows, placeholder
 */
export class HbwpTextareaElement extends BaseWebComponent {

  protected connectedCallback(): void {
    const name = this.getAttribute('name') || '';
    const label = this.getAttribute('label') || '';
    const required = this.hasAttribute('required') ? 'required' : '';
    const rows = this.getAttribute('rows') || '3';
    const placeholder = this.getAttribute('placeholder') || '';

    const area = document.createElement('fluent-text-area');
    area.setAttribute('name', name);
    if (required) area.setAttribute('required', '');
    area.setAttribute('rows', rows);
    area.setAttribute('placeholder', placeholder);
    area.style.width = '100%';
    area.textContent = label;

    this.appendChild(area);
  }
}
