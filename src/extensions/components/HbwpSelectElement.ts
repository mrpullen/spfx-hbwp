import { BaseWebComponent } from '@mrpullen/spfx-extensibility';

/**
 * <hbwp-select> — Select dropdown web component wrapping <fluent-select>.
 *
 * Attributes:
 *   name, label, required
 *
 * Children: place <fluent-option> elements inside.
 */
export class HbwpSelectElement extends BaseWebComponent {

  protected connectedCallback(): void {
    const name = this.getAttribute('name') || '';
    const label = this.getAttribute('label') || '';
    const required = this.hasAttribute('required') ? 'required' : '';

    // Create label
    if (label) {
      const labelEl = document.createElement('label');
      labelEl.style.display = 'block';
      labelEl.style.marginBottom = '4px';
      labelEl.style.fontWeight = '600';
      labelEl.textContent = label;
      this.insertBefore(labelEl, this.firstChild);
    }

    // Wrap existing children (option elements) in a fluent-select
    const select = document.createElement('fluent-select');
    select.setAttribute('name', name);
    if (required) select.setAttribute('required', '');
    select.style.width = '100%';

    // Move child nodes (except the label we just added) into the select
    const children = Array.prototype.slice.call(this.childNodes);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.tagName && child.tagName.toLowerCase() === 'label') continue;
      select.appendChild(child);
    }

    this.appendChild(select);
  }
}
