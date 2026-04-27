/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  IExtensibilityLibrary,
  IComponentDefinition,
  ITemplateEngineDefinition,
  ITemplateAssetDefinition,
  IDataAdapterDefinition,
  EngineExtensionConstructor,
  TemplateEngineBase
} from '@mrpullen/spfx-extensibility';
import {
  JsonHelperExtension,
  FilterHelperExtension,
  PercentageHelperExtension,
  SubstringHelperExtension,
  ConcatHelperExtension,
  StarRatingHelperExtension,
  ToIntHelperExtension,
  ModHelperExtension,
  ShuffleHelperExtension,
} from './helpers';
import {
  HbwpFormElement,
  HbwpInputElement,
  HbwpTextareaElement,
  HbwpSelectElement,
  HbwpCheckboxElement,
  HbwpHiddenElement,
  HbwpSubmitElement,
  HbwpActionElement,
  HbwpPagerElement
} from './components';
import { HandlebarsTemplateEngine } from './engines';
import {
  SharePointListAdapter,
  PageDataAdapter,
  UserProfileAdapter,
  FormSubmitAdapter,
  HttpDataAdapter
} from './adapters';
import { HandlebarsHelpersExtension } from './engines/HandlebarsHelpersExtension';
import { newsCardsTemplate, simpleTableTemplate } from './templates';

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
      { componentName: 'hbwp-action', componentClass: HbwpActionElement },
      { componentName: 'hbwp-pager', componentClass: HbwpPagerElement },
    ];
  }

  /**
   * Built-in Handlebars extensions — each helper category is its own
   * EngineExtension class, following the same pattern external libraries use.
   */
  public getEngineExtensions(): EngineExtensionConstructor<TemplateEngineBase>[] {
    return [
      // Third-party helpers (handlebars-helpers: 180+)
      HandlebarsHelpersExtension,

      // Data helpers
      JsonHelperExtension,
      FilterHelperExtension,
      PercentageHelperExtension,
      SubstringHelperExtension,
      ConcatHelperExtension,
      StarRatingHelperExtension,
      ToIntHelperExtension,
      ModHelperExtension,
      ShuffleHelperExtension,
    ];
  }

  public getTemplates(): ITemplateAssetDefinition[] {
    return [
      {
        id: 'news-cards',
        name: 'News Cards',
        content: newsCardsTemplate,
        engineId: 'handlebars',
        description: 'Responsive card grid for news/announcements with image, title, author and excerpt.'
      },
      {
        id: 'simple-table',
        name: 'Simple Table',
        content: simpleTableTemplate,
        engineId: 'handlebars',
        description: 'Clean striped table showing Title, Modified date, and Editor columns.'
      }
    ];
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
      { adapterId: 'form-submit',     adapterName: 'Form Submit',              capability: 'write',      adapterClass: FormSubmitAdapter },
      { adapterId: 'http',            adapterName: 'HTTP Endpoint',            capability: 'read-write', adapterClass: HttpDataAdapter },
    ];
  }
}
