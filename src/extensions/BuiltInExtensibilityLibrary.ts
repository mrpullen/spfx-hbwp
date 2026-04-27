/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  IExtensibilityLibrary,
  IComponentDefinition,
  ITemplateEngineDefinition,
  IDataAdapterDefinition
} from '@mrpullen/spfx-extensibility';
import * as Handlebars from 'handlebars';
import helpers from 'handlebars-helpers';
import {
  registerJsonHelper,
  registerFilterHelper,
  registerPercentageHelper,
  registerSubstringHelper,
  registerConcatHelper,
  registerStarRatingHelper,
  registerToIntHelper,
  registerModHelper,
  registerShuffleHelper,
  registerSocialHelpers,
  registerPagingHelpers
} from './helpers';
import {
  HbwpFormElement,
  HbwpInputElement,
  HbwpTextareaElement,
  HbwpSelectElement,
  HbwpCheckboxElement,
  HbwpHiddenElement,
  HbwpSubmitElement,
  HbwpLikeElement,
  HbwpLikersDrawerElement,
  HbwpRateElement,
  HbwpRatingElement,
  HbwpActionElement,
  HbwpPagerElement
} from './components';
import { HandlebarsTemplateEngine } from './engines';
import {
  SharePointListAdapter,
  PageDataAdapter,
  UserProfileAdapter,
  SocialDataAdapter,
  FormSubmitAdapter,
  HttpDataAdapter
} from './adapters';

/**
 * Built-in extensibility library providing HBWP's core Handlebars helpers
 * and form web components. Loaded through the same IExtensibilityLibrary
 * interface as external libraries, ensuring a single, consistent
 * extensibility pipeline.
 */
export class BuiltInExtensibilityLibrary implements IExtensibilityLibrary {

  public name(): string {
    return 'HBWP Built-In';
  }

  public getCustomWebComponents(): IComponentDefinition<any>[] {
    return [
      { componentName: 'hbwp-form', componentClass: HbwpFormElement },
      { componentName: 'hbwp-input', componentClass: HbwpInputElement },
      { componentName: 'hbwp-textarea', componentClass: HbwpTextareaElement },
      { componentName: 'hbwp-select', componentClass: HbwpSelectElement },
      { componentName: 'hbwp-checkbox', componentClass: HbwpCheckboxElement },
      { componentName: 'hbwp-hidden', componentClass: HbwpHiddenElement },
      { componentName: 'hbwp-submit', componentClass: HbwpSubmitElement },
      { componentName: 'hbwp-like', componentClass: HbwpLikeElement },
      { componentName: 'hbwp-likers-drawer', componentClass: HbwpLikersDrawerElement },
      { componentName: 'hbwp-rate', componentClass: HbwpRateElement },
      { componentName: 'hbwp-rating', componentClass: HbwpRatingElement },
      { componentName: 'hbwp-action', componentClass: HbwpActionElement },
      { componentName: 'hbwp-pager', componentClass: HbwpPagerElement },
    ];
  }

  public registerHandlebarsCustomizations(hbs: typeof Handlebars): void {
    // Third-party helpers (handlebars-helpers: 180+)
    helpers({ handlebars: hbs });

    // Data helpers
    registerJsonHelper(hbs);
    registerFilterHelper(hbs);
    registerPercentageHelper(hbs);
    registerSubstringHelper(hbs);
    registerConcatHelper(hbs);
    registerStarRatingHelper(hbs);
    registerToIntHelper(hbs);
    registerModHelper(hbs);
    registerShuffleHelper(hbs);

    // Social & UI helpers
    registerSocialHelpers(hbs);
    registerPagingHelpers(hbs);
  }

  public getTemplateEngines(): ITemplateEngineDefinition[] {
    return [
      {
        engineId: 'handlebars',
        engineName: 'Handlebars',
        engineClass: HandlebarsTemplateEngine
      }
    ];
  }

  public getDataAdapters(): IDataAdapterDefinition[] {
    return [
      { adapterId: 'sharepoint-list', adapterName: 'SharePoint List',          capability: 'read',       adapterClass: SharePointListAdapter },
      { adapterId: 'sharepoint-page', adapterName: 'SharePoint Page',          capability: 'read',       adapterClass: PageDataAdapter },
      { adapterId: 'user-profile',    adapterName: 'User Profile',             capability: 'read',       adapterClass: UserProfileAdapter },
      { adapterId: 'social',          adapterName: 'Social (Likes & Ratings)', capability: 'write',      adapterClass: SocialDataAdapter },
      { adapterId: 'form-submit',     adapterName: 'Form Submit',              capability: 'write',      adapterClass: FormSubmitAdapter },
      { adapterId: 'http',            adapterName: 'HTTP Endpoint',            capability: 'read-write', adapterClass: HttpDataAdapter },
    ];
  }
}
