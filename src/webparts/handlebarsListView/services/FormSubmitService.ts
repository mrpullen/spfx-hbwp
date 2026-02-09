/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI, spfi } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import { AadHttpClient, AadHttpClientFactory, HttpClient, HttpClientResponse, IHttpClientOptions } from '@microsoft/sp-http';
import { ISubmitEndpoint } from '../components/IHandlebarsListViewProps';

/**
 * Result of a form submission
 */
export interface IFormSubmitResult {
  /** Whether the submission was successful */
  success: boolean;
  /** The response data (for HTTP) or created item (for SharePoint) */
  data?: any;
  /** Error message if failed */
  error?: string;
  /** HTTP status code (for HTTP endpoints) */
  status?: number;
}

/**
 * Form submission event data
 */
export interface IFormSubmitEvent {
  /** The endpoint key to submit to */
  endpointKey: string;
  /** The form data to submit */
  formData: Record<string, any>;
  /** The web part instance ID */
  wpId: string;
}

/**
 * Service for handling form submissions to SharePoint lists and HTTP endpoints
 */
export class FormSubmitService {
  private sp: SPFI;
  private aadHttpClientFactory: AadHttpClientFactory;
  private httpClient: HttpClient;
  private submitEndpoints: Map<string, ISubmitEndpoint> = new Map();
  private aadClientCache: Map<string, AadHttpClient> = new Map();

  constructor(
    sp: SPFI,
    aadHttpClientFactory: AadHttpClientFactory,
    httpClient: HttpClient
  ) {
    this.sp = sp;
    this.aadHttpClientFactory = aadHttpClientFactory;
    this.httpClient = httpClient;
  }

  /**
   * Registers submit endpoints for use
   */
  public registerEndpoints(endpoints: ISubmitEndpoint[]): void {
    this.submitEndpoints.clear();
    for (const endpoint of endpoints) {
      this.submitEndpoints.set(endpoint.key, endpoint);
    }
  }

  /**
   * Submits form data to the specified endpoint
   */
  public async submit(endpointKey: string, formData: Record<string, any>): Promise<IFormSubmitResult> {
    const endpoint = this.submitEndpoints.get(endpointKey);
    
    if (!endpoint) {
      return {
        success: false,
        error: `Submit endpoint '${endpointKey}' not found. Available: ${Array.from(this.submitEndpoints.keys()).join(', ')}`
      };
    }

    try {
      if (endpoint.type === 'sharepoint') {
        return await this.submitToSharePoint(endpoint, formData);
      } else if (endpoint.type === 'http') {
        return await this.submitToHttp(endpoint, formData);
      } else {
        return {
          success: false,
          error: `Unknown endpoint type: ${endpoint.type}`
        };
      }
    } catch (error) {
      console.error(`FormSubmitService: Error submitting to '${endpointKey}':`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Submits form data to a SharePoint list
   */
  private async submitToSharePoint(
    endpoint: ISubmitEndpoint,
    formData: Record<string, any>
  ): Promise<IFormSubmitResult> {
    const config = endpoint.sharePointConfig;
    
    if (!config || !config.site?.url || !config.listId) {
      return {
        success: false,
        error: 'SharePoint submit endpoint missing site or list configuration'
      };
    }

    // Create SP instance for the target site
    const targetSp = spfi(config.site.url).using(AssignFrom(this.sp.web));
    
    // Add item to list
    const result = await targetSp.web.lists.getById(config.listId).items.add(formData);
    
    return {
      success: true,
      data: result
    };
  }

  /**
   * Submits form data to an HTTP endpoint
   */
  private async submitToHttp(
    endpoint: ISubmitEndpoint,
    formData: Record<string, any>
  ): Promise<IFormSubmitResult> {
    const config = endpoint.httpConfig;
    
    if (!config || !config.url) {
      return {
        success: false,
        error: 'HTTP submit endpoint missing URL configuration'
      };
    }

    const { url, authType = 'aad', method = 'POST' } = config;

    // Build headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...config.headers
    };

    // Add auth headers
    if (authType === 'apiKey' && config.apiKeyHeaderName && config.apiKeyValue) {
      headers[config.apiKeyHeaderName] = config.apiKeyValue;
    } else if (authType === 'bearer' && config.bearerToken) {
      // eslint-disable-next-line dot-notation
      headers['Authorization'] = `Bearer ${config.bearerToken}`;
    }

    const body = JSON.stringify(formData);
    let response: HttpClientResponse;

    if (authType === 'aad' && config.appId) {
      // Use AAD HTTP Client
      const client = await this.getAadClient(config.appId);
      response = await client.fetch(url, AadHttpClient.configurations.v1, {
        method,
        headers,
        body
      });
    } else {
      // Use standard HTTP Client
      const options: IHttpClientOptions = { headers, body };
      response = await this.httpClient.fetch(url, HttpClient.configurations.v1, {
        ...options,
        method
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        status: response.status
      };
    }

    // Try to parse response as JSON
    let data: any;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      success: true,
      data,
      status: response.status
    };
  }

  /**
   * Gets or creates an AAD HTTP client for the specified app ID
   */
  private async getAadClient(appId: string): Promise<AadHttpClient> {
    const cached = this.aadClientCache.get(appId);
    if (cached) {
      return cached;
    }

    const client = await this.aadHttpClientFactory.getClient(appId);
    this.aadClientCache.set(appId, client);
    return client;
  }
}

/**
 * Generates the form handling script to be injected into templates
 */
export function generateFormHandlerScript(wpId: string): string {
  return `
<script>
(function() {
  // Form submission handler for web part ${wpId}
  const wpContainer = document.querySelector('[data-wpid="${wpId}"]');
  if (!wpContainer) return;

  // Handle form submissions
  wpContainer.addEventListener('submit', function(e) {
    const form = e.target.closest('form[data-hbwp-submit]');
    if (!form) return;
    
    e.preventDefault();
    
    // Check form validity using native HTML5 validation
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    const endpointKey = form.dataset.hbwpSubmit;
    const submitBtn = form.querySelector('[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : '';
    
    // Disable submit button and show loading
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
    
    // Collect form data
    const formData = {};
    const formElements = form.elements;
    for (let i = 0; i < formElements.length; i++) {
      const el = formElements[i];
      if (el.name && !el.disabled) {
        if (el.type === 'checkbox') {
          formData[el.name] = el.checked;
        } else if (el.type === 'radio') {
          if (el.checked) formData[el.name] = el.value;
        } else if (el.tagName === 'SELECT' && el.multiple) {
          formData[el.name] = Array.from(el.selectedOptions).map(o => o.value);
        } else {
          formData[el.name] = el.value;
        }
      }
    }
    
    // Dispatch custom event for web part to handle
    const submitEvent = new CustomEvent('hbwp-form-submit', {
      bubbles: true,
      detail: {
        endpointKey: endpointKey,
        formData: formData,
        wpId: '${wpId}',
        form: form,
        submitButton: submitBtn,
        originalButtonText: originalBtnText
      }
    });
    wpContainer.dispatchEvent(submitEvent);
  });

  // Handle custom validation for Fluent UI components
  wpContainer.addEventListener('invalid', function(e) {
    const el = e.target;
    // Fluent UI text-field validation
    if (el.tagName && el.tagName.toLowerCase().startsWith('fluent-')) {
      // Let the browser show the validation message
      el.focus();
    }
  }, true);
})();
</script>
`;
}

/**
 * Generates success/error handler script for form responses
 */
export function generateFormResponseHandlerScript(wpId: string): string {
  return `
<script>
(function() {
  const wpContainer = document.querySelector('[data-wpid="${wpId}"]');
  if (!wpContainer) return;

  // Listen for form submission results
  wpContainer.addEventListener('hbwp-form-result', function(e) {
    const { success, error, form, submitButton, originalButtonText } = e.detail;
    
    // Re-enable submit button
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
    
    // Show result
    const resultContainer = form.querySelector('[data-hbwp-result]');
    if (resultContainer) {
      if (success) {
        resultContainer.innerHTML = '<fluent-badge color="success">✓ Submitted successfully!</fluent-badge>';
        // Optionally reset form
        if (form.dataset.hbwpReset !== 'false') {
          form.reset();
        }
      } else {
        resultContainer.innerHTML = '<fluent-badge color="danger">✗ ' + (error || 'Submission failed') + '</fluent-badge>';
      }
    } else {
      // Alert fallback
      if (success) {
        console.log('Form submitted successfully');
      } else {
        console.error('Form submission failed:', error);
        alert('Submission failed: ' + (error || 'Unknown error'));
      }
    }
  });
})();
</script>
`;
}
