/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneToggle,
  PropertyPaneSlider,
  PropertyPaneButton,
  PropertyPaneButtonType,
  PropertyPaneLabel,
  PropertyPaneTextField,
  PropertyPaneDropdown,
  IPropertyPaneGroup
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
//import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'HandlebarsListViewWebPartStrings';
import HandlebarsListView from './components/HandlebarsListView';
import { IListDataSource, IHttpEndpointDataSource, IQueryParameter, ISubmitEndpoint, HttpAuthType, SubmitEndpointType } from './components/IHandlebarsListViewProps';
import { PropertyFieldSitePicker, PropertyFieldListPicker, PropertyFieldListPickerOrderBy, IPropertyFieldSite } from '@pnp/spfx-property-controls';
import { PropertyFieldViewPicker, PropertyFieldViewPickerOrderBy } from '@pnp/spfx-property-controls/lib/PropertyFieldViewPicker';
import { PropertyFieldCodeEditor, PropertyFieldCodeEditorLanguages } from '@pnp/spfx-property-controls/lib/PropertyFieldCodeEditor';
import { PropertyFieldFilePicker, IFilePickerResult } from '@pnp/spfx-property-controls/lib/PropertyFieldFilePicker';
import { spfi, SPFI, SPFx } from '@pnp/sp';
import "@pnp/sp/files";
import { LogLevel, PnPLogging } from "@pnp/logging";
import { allComponents, provideFluentDesignSystem } from '@fluentui/web-components';
import { Carousel } from '@mrpullen/fluentui-carousel';
import { UserProfileService, IUserProfile, CacheService } from './services';

/** Extended data source interface to include site picker data */
interface IDataSourceConfig {
  key: string;
  sites: Array<IPropertyFieldSite>;
  listId: string;
  viewId: string;
}

export interface IHandlebarsListViewWebPartProps {
  /** Legacy single site/list/view selection */
  sites: Array<IPropertyFieldSite>;
  list: string;
  view: string;
  /** Multiple data sources - stored as array of configs */
  dataSources: IDataSourceConfig[];
  /** Number of additional data sources to show */
  dataSourceCount: number;
  /** Handlebars template (inline) */
  template: string;
  /** Template file from SharePoint (takes precedence over inline template) */
  templateFile: IFilePickerResult;
  /** Cache settings */
  enableCache: boolean;
  cacheTimeoutMinutes: number;
  /** Number of HTTP endpoints */
  httpEndpointCount: number;
  // Dynamic properties for data sources and HTTP endpoints will be added at runtime
  [key: string]: any;
}


export default class HandlebarsListViewWebPart extends BaseClientSideWebPart<IHandlebarsListViewWebPartProps> {

  private sp?: SPFI = undefined;
  private userProfile?: IUserProfile = undefined;
  private userProfileService?: UserProfileService = undefined;
  private resolvedTemplate: string = '';

  protected async onInit(): Promise<void> {
    this.sp = spfi().using(SPFx(this.context)).using(PnPLogging(LogLevel.Warning));
    provideFluentDesignSystem().register(allComponents, Carousel);
    
    // Initialize user profile service and load user profile
    this.userProfileService = new UserProfileService(this.sp);
    try {
      this.userProfile = await this.userProfileService.getCurrentUserProfile();
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
    
    // Load template from file if configured
    await this.loadTemplateFromFile();
    
    // Set default cache values if not set
    if (this.properties.enableCache === undefined) {
      this.properties.enableCache = true;
    }
    if (this.properties.cacheTimeoutMinutes === undefined) {
      this.properties.cacheTimeoutMinutes = 15;
    }
    if (!this.properties.dataSources) {
      this.properties.dataSources = [];
    }
    if (this.properties.dataSourceCount === undefined) {
      this.properties.dataSourceCount = 0;
    }
    if (this.properties.httpEndpointCount === undefined) {
      this.properties.httpEndpointCount = 0;
    }
    
    return super.onInit();
  }

  private clearCache(): void {
    // Clear shared data cache (affects all web part instances)
    const cacheService = new CacheService({ keyPrefix: `hbwp_data_` });
    cacheService.clearAll();
    // Also clear user profile cache
    const userCacheService = new CacheService({ keyPrefix: `hbwp_user_` });
    userCacheService.clearAll();
    this.render();
  }

  /**
   * Loads template content from a SharePoint file if configured
   */
  private async loadTemplateFromFile(): Promise<void> {
    const templateFile = this.properties.templateFile;
    
    if (templateFile && templateFile.fileAbsoluteUrl) {
      try {
        // Use fetch to get the file content
        const response = await fetch(templateFile.fileAbsoluteUrl, {
          headers: {
            'Accept': 'text/plain'
          }
        });
        
        if (response.ok) {
          this.resolvedTemplate = await response.text();
        } else {
          console.error('Failed to load template file:', response.statusText);
          this.resolvedTemplate = this.properties.template || '';
        }
      } catch (error) {
        console.error('Error loading template from file:', error);
        this.resolvedTemplate = this.properties.template || '';
      }
    } else {
      this.resolvedTemplate = this.properties.template || '';
    }
  }

  /**
   * Gets the effective template (file takes precedence over inline)
   */
  private getEffectiveTemplate(): string {
    if (this.properties.templateFile && this.properties.templateFile.fileAbsoluteUrl && this.resolvedTemplate) {
      return this.resolvedTemplate;
    }
    return this.properties.template || '';
  }

  private addDataSource(): void {
    this.properties.dataSourceCount = (this.properties.dataSourceCount || 0) + 1;
    this.context.propertyPane.refresh();
  }

  private removeDataSource(): void {
    if (this.properties.dataSourceCount > 0) {
      const index = this.properties.dataSourceCount - 1;
      // Clean up the properties for the removed data source
      delete this.properties[`ds${index}Key`];
      delete this.properties[`ds${index}Sites`];
      delete this.properties[`ds${index}List`];
      delete this.properties[`ds${index}View`];
      this.properties.dataSourceCount--;
      this.context.propertyPane.refresh();
      this.render();
    }
  }

  private addHttpEndpoint(): void {
    this.properties.httpEndpointCount = (this.properties.httpEndpointCount || 0) + 1;
    this.context.propertyPane.refresh();
  }

  private removeHttpEndpoint(): void {
    if (this.properties.httpEndpointCount > 0) {
      const index = this.properties.httpEndpointCount - 1;
      // Clean up the properties for the removed HTTP endpoint
      delete this.properties[`http${index}Key`];
      delete this.properties[`http${index}Url`];
      delete this.properties[`http${index}AppId`];
      delete this.properties[`http${index}Method`];
      delete this.properties[`http${index}QueryParams`];
      delete this.properties[`http${index}Body`];
      this.properties.httpEndpointCount--;
      this.context.propertyPane.refresh();
      this.render();
    }
  }

  private addSubmitEndpoint(): void {
    this.properties.submitEndpointCount = (this.properties.submitEndpointCount || 0) + 1;
    this.context.propertyPane.refresh();
  }

  private removeSubmitEndpoint(): void {
    if (this.properties.submitEndpointCount > 0) {
      const index = this.properties.submitEndpointCount - 1;
      // Clean up the properties for the removed submit endpoint
      delete this.properties[`submit${index}Key`];
      delete this.properties[`submit${index}Name`];
      delete this.properties[`submit${index}Type`];
      delete this.properties[`submit${index}SpSites`];
      delete this.properties[`submit${index}SpList`];
      delete this.properties[`submit${index}HttpUrl`];
      delete this.properties[`submit${index}HttpAuthType`];
      delete this.properties[`submit${index}HttpAppId`];
      delete this.properties[`submit${index}HttpApiKeyHeader`];
      delete this.properties[`submit${index}HttpApiKeyValue`];
      delete this.properties[`submit${index}HttpBearerToken`];
      delete this.properties[`submit${index}HttpMethod`];
      this.properties.submitEndpointCount--;
      this.context.propertyPane.refresh();
      this.render();
    }
  }

  /**
   * Builds the httpEndpoints array from individual property fields
   */
  private buildHttpEndpointsArray(): IHttpEndpointDataSource[] {
    const endpoints: IHttpEndpointDataSource[] = [];
    const count = this.properties.httpEndpointCount || 0;
    
    for (let i = 0; i < count; i++) {
      const key = this.properties[`http${i}Key`] as string;
      const url = this.properties[`http${i}Url`] as string;
      const authType = (this.properties[`http${i}AuthType`] as HttpAuthType) || 'aad';
      const appId = this.properties[`http${i}AppId`] as string;
      const apiKeyHeaderName = this.properties[`http${i}ApiKeyHeaderName`] as string;
      const apiKeyValue = this.properties[`http${i}ApiKeyValue`] as string;
      const bearerToken = this.properties[`http${i}BearerToken`] as string;
      const method = (this.properties[`http${i}Method`] as string || 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE';
      const queryParamsJson = this.properties[`http${i}QueryParams`] as string;
      const body = this.properties[`http${i}Body`] as string;
      const cacheTimeoutMinutes = this.properties[`http${i}CacheTimeout`] as number;
      
      // Validate based on auth type
      const isValid = key && url && (
        authType === 'aad' ? !!appId :
        authType === 'apiKey' ? !!(apiKeyHeaderName && apiKeyValue) :
        authType === 'bearer' ? !!bearerToken :
        true // anonymous
      );
      
      if (isValid) {
        let queryParams: IQueryParameter[] = [];
        if (queryParamsJson) {
          try {
            queryParams = JSON.parse(queryParamsJson);
          } catch (e) {
            console.warn(`Invalid query params JSON for HTTP endpoint ${i}:`, e);
          }
        }
        
        endpoints.push({
          key,
          url,
          authType,
          appId,
          apiKeyHeaderName,
          apiKeyValue,
          bearerToken,
          method,
          queryParams,
          body,
          cacheTimeoutMinutes
        });
      }
    }
    
    return endpoints;
  }

  /**
   * Builds the dataSources array from individual property fields
   */
  private buildDataSourcesArray(): IListDataSource[] {
    const dataSources: IListDataSource[] = [];
    const count = this.properties.dataSourceCount || 0;
    
    for (let i = 0; i < count; i++) {
      const key = this.properties[`ds${i}Key`] as string;
      const sites = this.properties[`ds${i}Sites`] as Array<IPropertyFieldSite>;
      const listId = this.properties[`ds${i}List`] as string;
      const viewId = this.properties[`ds${i}View`] as string;
      const cacheTimeoutMinutes = this.properties[`ds${i}CacheTimeout`] as number;
      
      if (key && sites && sites.length > 0 && listId && viewId) {
        dataSources.push({
          key,
          site: sites[0],
          listId,
          viewId,
          cacheTimeoutMinutes
        });
      }
    }
    
    return dataSources;
  }

  public render(): void {
    // Build data sources from individual property fields
    const dataSources = this.buildDataSourcesArray();
    const httpEndpoints = this.buildHttpEndpointsArray();
    const submitEndpoints = this.buildSubmitEndpointsArray();
    const effectiveTemplate = this.getEffectiveTemplate();
    
    if(this.properties && this.properties.sites && this.properties.sites.length > 0) {
    const element: React.ReactElement<any> = React.createElement(
      HandlebarsListView,
      {
        sp: this.sp,
        aadHttpClientFactory: this.context.aadHttpClientFactory,
        httpClient: this.context.httpClient,
        site: this.properties.sites[0],
        list: this.properties.list,
        view: this.properties.view,
        dataSources: dataSources,
        httpEndpoints: httpEndpoints,
        submitEndpoints: submitEndpoints,
        template: effectiveTemplate,
        cacheOptions: {
          enabled: this.properties.enableCache ?? true,
          timeoutMinutes: this.properties.cacheTimeoutMinutes ?? 15
        },
        userProfile: this.userProfile,
        instanceId: this.context.instanceId
      }
    );
    ReactDom.unmountComponentAtNode(this.domElement);
    ReactDom.render(element, this.domElement);
  } else {
    const element: React.ReactElement<any> = React.createElement(
      'div',
      {
        style: {
          color: 'red',
          fontSize: '18px',
          padding: '10px'
        }
      },
      'Please configure the web part'
    );
    
    ReactDom.render(element, this.domElement);
  }
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /**
   * Handles template file property changes
   */
  private onTemplateFileChange(propertyPath: string, oldValue: any, newValue: any): void {
    this.properties.templateFile = newValue;
    this.loadTemplateFromFile().then(() => {
      this.render();
    }).catch(err => console.error('Error loading template:', err));
  }

  /**
   * Clears the selected template file
   */
  private clearTemplateFile(): void {
    this.properties.templateFile = undefined as any;
    this.resolvedTemplate = '';
    this.context.propertyPane.refresh();
    this.render();
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    // Build dynamic data source groups
    const dataSourceGroups = this.buildDataSourcePropertyGroups();
    const httpEndpointGroups = this.buildHttpEndpointPropertyGroups();
    const submitEndpointGroups = this.buildSubmitEndpointPropertyGroups();
    
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription
          },
          groups: [
            {
              groupName: strings.ListGroupName,
              groupFields: [
                PropertyFieldSitePicker('sites', {
                  label: 'Select sites',
                  initialSites: this.properties.sites,
                  context: this.context as any,
                  deferredValidationTime: 500,
                  multiSelect: false,
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  properties: this.properties,
                  key: 'sitesFieldId'
                }),
                PropertyFieldListPicker('list', {
                  label: 'Select a list',
                  selectedList: this.properties.list,
                  webAbsoluteUrl: this.properties && this.properties.sites && this.properties.sites.length > 0 ? this.properties.sites[0].url : undefined,
                  includeHidden: false,
                  orderBy: PropertyFieldListPickerOrderBy.Title,
                  disabled: !(this.properties && this.properties.sites && this.properties.sites.length > 0),
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  properties: this.properties,
                  context: this.context as any,
                  multiSelect: false,
                  deferredValidationTime: 0,
                  key: 'listPickerFieldId'
                }),
                PropertyFieldViewPicker('view', {
                  label: 'Select a view',
                  webAbsoluteUrl: this.properties && this.properties.sites && this.properties.sites.length > 0 ? this.properties.sites[0].url : undefined,
                  listId: this.properties.list,
                  selectedView: this.properties.view,
                  orderBy: PropertyFieldViewPickerOrderBy.Title,
                  disabled: this.properties.list === undefined || this.properties.list === '',
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  properties: this.properties,
                  context: this.context as any,
                  deferredValidationTime: 0,
                  key: 'viewPickerFieldId'
                })
              ]
            }, 
            {
              groupName: strings.TemplateGroupName,
              groupFields: [
                PropertyFieldFilePicker('templateFile', {
                  context: this.context as any,
                  filePickerResult: this.properties.templateFile,
                  onPropertyChange: this.onTemplateFileChange.bind(this),
                  properties: this.properties,
                  onSave: (e: IFilePickerResult) => { 
                    this.properties.templateFile = e;
                    this.loadTemplateFromFile().then(() => this.render()).catch(err => console.error('Error loading template:', err));
                  },
                  onChanged: (e: IFilePickerResult) => { 
                    this.properties.templateFile = e;
                    this.loadTemplateFromFile().then(() => this.render()).catch(err => console.error('Error loading template:', err));
                  },
                  key: 'templateFilePickerId',
                  buttonLabel: 'Select Template File',
                  label: 'Template File (.hbs)',
                  accepts: ['.hbs', '.handlebars', '.html', '.txt'],
                  buttonIcon: 'FileTemplate'
                }),
                PropertyPaneLabel('templateFileInfo', {
                  text: this.properties.templateFile?.fileName 
                    ? `Using file: ${this.properties.templateFile.fileName}` 
                    : 'No file selected. Using inline template below.'
                }),
                PropertyPaneButton('clearTemplateFile', {
                  text: 'Clear Template File',
                  buttonType: PropertyPaneButtonType.Normal,
                  onClick: this.clearTemplateFile.bind(this),
                  disabled: !this.properties.templateFile?.fileAbsoluteUrl
                }),
                PropertyFieldCodeEditor('template', {
                  label: 'Inline Handlebars Template',
                  panelTitle: 'Handlebars Code',
                  initialValue: this.properties.template,
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  properties: this.properties,
                  disabled: !!this.properties.templateFile?.fileAbsoluteUrl,
                  key: 'codeEditorFieldId',
                  language: PropertyFieldCodeEditorLanguages.Handlebars,
                  options: {
                    wrap: true,
                    fontSize: 14
                    // more options
                  }
                }),
                PropertyPaneLabel('templateHelp', {
                  text: 'Tip: Upload .hbs files to a SharePoint library and select them above for easier template management.'
                })
              ]
            },
            {
              groupName: 'Cache Settings',
              groupFields: [
                PropertyPaneToggle('enableCache', {
                  label: 'Enable Data Caching',
                  onText: 'On',
                  offText: 'Off',
                  checked: this.properties.enableCache ?? true
                }),
                PropertyPaneSlider('cacheTimeoutMinutes', {
                  label: 'Cache Timeout (minutes)',
                  min: 1,
                  max: 60,
                  step: 1,
                  value: this.properties.cacheTimeoutMinutes ?? 15,
                  disabled: !this.properties.enableCache
                }),
                PropertyPaneButton('clearCache', {
                  text: 'Clear Cache',
                  buttonType: PropertyPaneButtonType.Normal,
                  onClick: this.clearCache.bind(this)
                }),
                PropertyPaneLabel('cacheInfo', {
                  text: 'User profile is cached for 24 hours. List data uses the timeout above.'
                })
              ]
            }
          ]
        },
        {
          header: {
            description: 'Configure additional data sources with site, list, and view pickers'
          },
          groups: [
            {
              groupName: 'Manage Data Sources',
              groupFields: [
                PropertyPaneLabel('dataSourcesInfo', {
                  text: `You have ${this.properties.dataSourceCount || 0} additional data source(s) configured.`
                }),
                PropertyPaneButton('addDataSource', {
                  text: 'Add Data Source',
                  buttonType: PropertyPaneButtonType.Primary,
                  onClick: this.addDataSource.bind(this)
                }),
                PropertyPaneButton('removeDataSource', {
                  text: 'Remove Last Data Source',
                  buttonType: PropertyPaneButtonType.Normal,
                  onClick: this.removeDataSource.bind(this),
                  disabled: (this.properties.dataSourceCount || 0) === 0
                }),
                PropertyPaneLabel('dataSourcesHelp', {
                  text: 'Access in template: {{#each keyName}}...{{/each}}. Primary list: {{#each items}}...{{/each}}. User: {{user.displayName}}'
                })
              ]
            },
            ...dataSourceGroups
          ]
        },
        {
          header: {
            description: 'Configure HTTP endpoints with AAD authentication'
          },
          groups: [
            {
              groupName: 'Manage HTTP Endpoints',
              groupFields: [
                PropertyPaneLabel('httpEndpointsInfo', {
                  text: `You have ${this.properties.httpEndpointCount || 0} HTTP endpoint(s) configured.`
                }),
                PropertyPaneButton('addHttpEndpoint', {
                  text: 'Add HTTP Endpoint',
                  buttonType: PropertyPaneButtonType.Primary,
                  onClick: this.addHttpEndpoint.bind(this)
                }),
                PropertyPaneButton('removeHttpEndpoint', {
                  text: 'Remove Last Endpoint',
                  buttonType: PropertyPaneButtonType.Normal,
                  onClick: this.removeHttpEndpoint.bind(this),
                  disabled: (this.properties.httpEndpointCount || 0) === 0
                }),
                PropertyPaneLabel('httpEndpointsHelp', {
                  text: 'Access in template: {{#each keyName}}...{{/each}}. Use tokens like {{user.email}} in URL/params.'
                })
              ]
            },
            ...httpEndpointGroups
          ]
        },
        {
          header: {
            description: 'Configure submit endpoints for form data'
          },
          groups: [
            {
              groupName: 'Manage Submit Endpoints',
              groupFields: [
                PropertyPaneLabel('submitEndpointsInfo', {
                  text: `You have ${this.properties.submitEndpointCount || 0} submit endpoint(s) configured.`
                }),
                PropertyPaneButton('addSubmitEndpoint', {
                  text: 'Add Submit Endpoint',
                  buttonType: PropertyPaneButtonType.Primary,
                  onClick: this.addSubmitEndpoint.bind(this)
                }),
                PropertyPaneButton('removeSubmitEndpoint', {
                  text: 'Remove Last Endpoint',
                  buttonType: PropertyPaneButtonType.Normal,
                  onClick: this.removeSubmitEndpoint.bind(this),
                  disabled: (this.properties.submitEndpointCount || 0) === 0
                }),
                PropertyPaneLabel('submitEndpointsHelp', {
                  text: 'Use in template: {{#hbwp-form endpoint="keyName"}}...{{hbwp-submit label="Submit"}}{{/hbwp-form}}'
                })
              ]
            },
            ...submitEndpointGroups
          ]
        }
      ]
    };
  }

  /**
   * Builds property pane groups for each configured data source
   */
  private buildDataSourcePropertyGroups(): IPropertyPaneGroup[] {
    const groups: IPropertyPaneGroup[] = [];
    const count = this.properties.dataSourceCount || 0;

    for (let i = 0; i < count; i++) {
      const sites = this.properties[`ds${i}Sites`] as Array<IPropertyFieldSite>;
      const listId = this.properties[`ds${i}List`] as string;
      const siteUrl = sites && sites.length > 0 ? sites[0].url : undefined;

      groups.push({
        groupName: `Data Source ${i + 1}`,
        groupFields: [
          PropertyPaneTextField(`ds${i}Key`, {
            label: 'Key (used in template)',
            description: 'e.g., "announcements" → {{#each announcements}}',
            value: this.properties[`ds${i}Key`] || ''
          }),
          PropertyFieldSitePicker(`ds${i}Sites`, {
            label: 'Select Site',
            initialSites: sites || [],
            context: this.context as any,
            deferredValidationTime: 500,
            multiSelect: false,
            onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
            properties: this.properties,
            key: `ds${i}SitesFieldId`
          }),
          PropertyFieldListPicker(`ds${i}List`, {
            label: 'Select List',
            selectedList: listId,
            webAbsoluteUrl: siteUrl,
            includeHidden: false,
            orderBy: PropertyFieldListPickerOrderBy.Title,
            disabled: !siteUrl,
            onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
            properties: this.properties,
            context: this.context as any,
            multiSelect: false,
            deferredValidationTime: 0,
            key: `ds${i}ListFieldId`
          }),
          PropertyFieldViewPicker(`ds${i}View`, {
            label: 'Select View',
            webAbsoluteUrl: siteUrl,
            listId: listId,
            selectedView: this.properties[`ds${i}View`],
            orderBy: PropertyFieldViewPickerOrderBy.Title,
            disabled: !listId,
            onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
            properties: this.properties,
            context: this.context as any,
            deferredValidationTime: 0,
            key: `ds${i}ViewFieldId`
          }),
          PropertyPaneSlider(`ds${i}CacheTimeout`, {
            label: 'Cache Timeout (minutes)',
            min: 1,
            max: 120,
            step: 1,
            showValue: true,
            value: this.properties[`ds${i}CacheTimeout`] ?? 15
          })
        ]
      });
    }

    return groups;
  }

  /**
   * Builds property pane groups for each configured HTTP endpoint
   */
  private buildHttpEndpointPropertyGroups(): IPropertyPaneGroup[] {
    const groups: IPropertyPaneGroup[] = [];
    const count = this.properties.httpEndpointCount || 0;

    for (let i = 0; i < count; i++) {
      const authType = (this.properties[`http${i}AuthType`] as HttpAuthType) || 'aad';
      
      groups.push({
        groupName: `HTTP Endpoint ${i + 1}`,
        groupFields: [
          PropertyPaneTextField(`http${i}Key`, {
            label: 'Key (used in template)',
            description: 'e.g., "apiData" → {{#each apiData}}',
            value: this.properties[`http${i}Key`] || ''
          }),
          PropertyPaneTextField(`http${i}Url`, {
            label: 'Endpoint URL',
            description: 'Can include tokens: {{user.email}}, {{items[0].Id}}',
            value: this.properties[`http${i}Url`] || ''
          }),
          PropertyPaneDropdown(`http${i}AuthType`, {
            label: 'Authentication Type',
            options: [
              { key: 'aad', text: 'Azure AD (AAD)' },
              { key: 'anonymous', text: 'Anonymous (No Auth)' },
              { key: 'apiKey', text: 'API Key (Header)' },
              { key: 'bearer', text: 'Bearer Token' }
            ],
            selectedKey: authType
          }),
          // AAD-specific field
          ...(authType === 'aad' ? [
            PropertyPaneTextField(`http${i}AppId`, {
              label: 'Azure AD App ID (Client ID)',
              description: 'Required for AAD auth. Must be registered in package-solution.json',
              value: this.properties[`http${i}AppId`] || ''
            })
          ] : []),
          // API Key-specific fields
          ...(authType === 'apiKey' ? [
            PropertyPaneTextField(`http${i}ApiKeyHeaderName`, {
              label: 'API Key Header Name',
              description: 'e.g., X-API-Key, Ocp-Apim-Subscription-Key',
              value: this.properties[`http${i}ApiKeyHeaderName`] || 'X-API-Key'
            }),
            PropertyPaneTextField(`http${i}ApiKeyValue`, {
              label: 'API Key Value',
              description: 'The API key value (consider using Azure Key Vault for production)',
              value: this.properties[`http${i}ApiKeyValue`] || ''
            })
          ] : []),
          // Bearer token-specific field
          ...(authType === 'bearer' ? [
            PropertyPaneTextField(`http${i}BearerToken`, {
              label: 'Bearer Token',
              description: 'Token or SAS key for authentication',
              value: this.properties[`http${i}BearerToken`] || '',
              multiline: true
            })
          ] : []),
          PropertyPaneDropdown(`http${i}Method`, {
            label: 'HTTP Method',
            options: [
              { key: 'GET', text: 'GET' },
              { key: 'POST', text: 'POST' },
              { key: 'PUT', text: 'PUT' },
              { key: 'DELETE', text: 'DELETE' }
            ],
            selectedKey: this.properties[`http${i}Method`] || 'GET'
          }),
          PropertyPaneTextField(`http${i}QueryParams`, {
            label: 'Query Parameters (JSON)',
            description: '[{"name":"param1","value":"{{user.email}}"}]',
            value: this.properties[`http${i}QueryParams`] || '',
            multiline: true
          }),
          PropertyPaneTextField(`http${i}Body`, {
            label: 'Request Body (for POST/PUT)',
            description: 'JSON body - can include tokens',
            value: this.properties[`http${i}Body`] || '',
            multiline: true
          }),
          PropertyPaneSlider(`http${i}CacheTimeout`, {
            label: 'Cache Timeout (minutes)',
            min: 1,
            max: 120,
            step: 1,
            showValue: true,
            value: this.properties[`http${i}CacheTimeout`] ?? 15
          })
        ]
      });
    }

    return groups;
  }

  /**
   * Builds the submitEndpoints array from individual property fields
   */
  private buildSubmitEndpointsArray(): ISubmitEndpoint[] {
    const endpoints: ISubmitEndpoint[] = [];
    const count = this.properties.submitEndpointCount || 0;
    
    for (let i = 0; i < count; i++) {
      const key = this.properties[`submit${i}Key`] as string;
      const name = this.properties[`submit${i}Name`] as string;
      const type = (this.properties[`submit${i}Type`] as SubmitEndpointType) || 'http';
      
      if (key && name) {
        const endpoint: ISubmitEndpoint = {
          key,
          name,
          type
        };
        
        if (type === 'sharepoint') {
          const sites = this.properties[`submit${i}SpSites`] as Array<IPropertyFieldSite>;
          if (sites && sites.length > 0) {
            endpoint.sharePointConfig = {
              site: sites[0],
              listId: this.properties[`submit${i}SpList`] as string
            };
          }
        } else if (type === 'http') {
          const httpAuthType = (this.properties[`submit${i}HttpAuthType`] as HttpAuthType) || 'aad';
          endpoint.httpConfig = {
            url: this.properties[`submit${i}HttpUrl`] as string,
            authType: httpAuthType,
            appId: this.properties[`submit${i}HttpAppId`] as string,
            apiKeyHeaderName: this.properties[`submit${i}HttpApiKeyHeader`] as string,
            apiKeyValue: this.properties[`submit${i}HttpApiKeyValue`] as string,
            bearerToken: this.properties[`submit${i}HttpBearerToken`] as string,
            method: (this.properties[`submit${i}HttpMethod`] as 'POST' | 'PUT' | 'PATCH') || 'POST'
          };
        }
        
        endpoints.push(endpoint);
      }
    }
    
    return endpoints;
  }

  /**
   * Builds property pane groups for each configured submit endpoint
   */
  private buildSubmitEndpointPropertyGroups(): IPropertyPaneGroup[] {
    const groups: IPropertyPaneGroup[] = [];
    const count = this.properties.submitEndpointCount || 0;

    for (let i = 0; i < count; i++) {
      const type = (this.properties[`submit${i}Type`] as SubmitEndpointType) || 'http';
      const httpAuthType = (this.properties[`submit${i}HttpAuthType`] as HttpAuthType) || 'aad';
      const sites = this.properties[`submit${i}SpSites`] as Array<IPropertyFieldSite>;
      const siteUrl = sites && sites.length > 0 ? sites[0].url : undefined;
      
      groups.push({
        groupName: `Submit Endpoint ${i + 1}`,
        groupFields: [
          PropertyPaneTextField(`submit${i}Key`, {
            label: 'Key (used in template)',
            description: 'e.g., "createTicket" → {{#hbwp-form endpoint="createTicket"}}',
            value: this.properties[`submit${i}Key`] || ''
          }),
          PropertyPaneTextField(`submit${i}Name`, {
            label: 'Display Name',
            description: 'Human-readable name for this endpoint',
            value: this.properties[`submit${i}Name`] || ''
          }),
          PropertyPaneDropdown(`submit${i}Type`, {
            label: 'Endpoint Type',
            options: [
              { key: 'http', text: 'HTTP Endpoint' },
              { key: 'sharepoint', text: 'SharePoint List' }
            ],
            selectedKey: type
          }),
          // SharePoint-specific fields
          ...(type === 'sharepoint' ? [
            PropertyFieldSitePicker(`submit${i}SpSites`, {
              label: 'Select Site',
              initialSites: sites || [],
              context: this.context as any,
              deferredValidationTime: 500,
              multiSelect: false,
              onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
              properties: this.properties,
              key: `submit${i}SpSitesFieldId`
            }),
            PropertyFieldListPicker(`submit${i}SpList`, {
              label: 'Select List',
              selectedList: this.properties[`submit${i}SpList`],
              webAbsoluteUrl: siteUrl,
              includeHidden: false,
              orderBy: PropertyFieldListPickerOrderBy.Title,
              disabled: !siteUrl,
              onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
              properties: this.properties,
              context: this.context as any,
              multiSelect: false,
              deferredValidationTime: 0,
              key: `submit${i}SpListFieldId`
            })
          ] : []),
          // HTTP-specific fields
          ...(type === 'http' ? [
            PropertyPaneTextField(`submit${i}HttpUrl`, {
              label: 'Endpoint URL',
              description: 'The URL to POST form data to',
              value: this.properties[`submit${i}HttpUrl`] || ''
            }),
            PropertyPaneDropdown(`submit${i}HttpAuthType`, {
              label: 'Authentication Type',
              options: [
                { key: 'aad', text: 'Azure AD (AAD)' },
                { key: 'anonymous', text: 'Anonymous (No Auth)' },
                { key: 'apiKey', text: 'API Key (Header)' },
                { key: 'bearer', text: 'Bearer Token' }
              ],
              selectedKey: httpAuthType
            }),
            ...(httpAuthType === 'aad' ? [
              PropertyPaneTextField(`submit${i}HttpAppId`, {
                label: 'Azure AD App ID',
                description: 'App Registration client ID',
                value: this.properties[`submit${i}HttpAppId`] || ''
              })
            ] : []),
            ...(httpAuthType === 'apiKey' ? [
              PropertyPaneTextField(`submit${i}HttpApiKeyHeader`, {
                label: 'API Key Header Name',
                value: this.properties[`submit${i}HttpApiKeyHeader`] || 'X-API-Key'
              }),
              PropertyPaneTextField(`submit${i}HttpApiKeyValue`, {
                label: 'API Key Value',
                value: this.properties[`submit${i}HttpApiKeyValue`] || ''
              })
            ] : []),
            ...(httpAuthType === 'bearer' ? [
              PropertyPaneTextField(`submit${i}HttpBearerToken`, {
                label: 'Bearer Token',
                value: this.properties[`submit${i}HttpBearerToken`] || '',
                multiline: true
              })
            ] : []),
            PropertyPaneDropdown(`submit${i}HttpMethod`, {
              label: 'HTTP Method',
              options: [
                { key: 'POST', text: 'POST' },
                { key: 'PUT', text: 'PUT' },
                { key: 'PATCH', text: 'PATCH' }
              ],
              selectedKey: this.properties[`submit${i}HttpMethod`] || 'POST'
            })
          ] : [])
        ]
      });
    }

    return groups;
  }
}
