/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
//import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'HandlebarsListViewWebPartStrings';
import HandlebarsListView from './components/HandlebarsListView';
import { PropertyFieldSitePicker, PropertyFieldListPicker, PropertyFieldListPickerOrderBy, IPropertyFieldSite } from '@pnp/spfx-property-controls';
import { PropertyFieldViewPicker, PropertyFieldViewPickerOrderBy } from '@pnp/spfx-property-controls/lib/PropertyFieldViewPicker';
import { PropertyFieldCodeEditor, PropertyFieldCodeEditorLanguages } from '@pnp/spfx-property-controls/lib/PropertyFieldCodeEditor';
import { spfi, SPFI, SPFx } from '@pnp/sp';
import { LogLevel, PnPLogging } from "@pnp/logging";
import { allComponents, provideFluentDesignSystem } from '@fluentui/web-components';

export interface IHandlebarsListViewWebPartProps {
  
  sites: Array<IPropertyFieldSite>;
  list: string;
  view: string;
  template: string;
}

export default class HandlebarsListViewWebPart extends BaseClientSideWebPart<IHandlebarsListViewWebPartProps> {

  private sp?: SPFI = undefined;

  protected onInit(): Promise<void> {
    this.sp = spfi().using(SPFx(this.context)).using(PnPLogging(LogLevel.Warning));
    provideFluentDesignSystem().register(allComponents);

    return super.onInit();
  }

  public render(): void {
    if(this.properties && this.properties.sites && this.properties.sites.length > 0) {
    const element: React.ReactElement<any> = React.createElement(
      HandlebarsListView,
      {
        sp: this.sp,
        site: this.properties.sites[0],
        list: this.properties.list,
        view: this.properties.view,
        template: this.properties.template
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

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
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
                PropertyFieldCodeEditor('template', {
                  label: 'Edit Handlebars Template',
                  panelTitle: 'Handlebars Code',
                  initialValue: this.properties.template,
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  properties: this.properties,
                  disabled: false,
                  key: 'codeEditorFieldId',
                  language: PropertyFieldCodeEditorLanguages.Handlebars,
                  options: {
                    wrap: true,
                    fontSize: 14
                    // more options
                  }
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
