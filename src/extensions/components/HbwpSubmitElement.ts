import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-submit> — Submit button web component wrapping <fluent-button>.
 *
 * Attributes:
 *   label (default: "Submit"), appearance (default: "accent"), disabled
 */
export class HbwpSubmitElement extends BaseWebComponent {

  protected connectedCallback(): void {
    const label = this.getAttribute('label') || 'Submit';
    const appearance = this.getAttribute('appearance') || 'accent';
    const disabled = this.hasAttribute('disabled');
    const cssClass = this.getAttribute('class') || '';

    const btn = document.createElement('fluent-button');
    btn.setAttribute('type', 'submit');
    btn.setAttribute('appearance', appearance);
    if (disabled) btn.setAttribute('disabled', '');
    if (cssClass) btn.className = cssClass;
    btn.textContent = label;

    this.appendChild(btn);
  }
}
