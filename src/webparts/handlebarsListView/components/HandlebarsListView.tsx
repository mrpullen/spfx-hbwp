/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import type { IHandlebarsListViewProps } from './IHandlebarsListViewProps';
import Handlebars from "handlebars";


import helpers from 'handlebars-helpers'
import { spfi } from "@pnp/sp";
import { AssignFrom } from "@pnp/core";

import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/views";
import "@pnp/sp/items";
import ReactHtmlParser from 'react-html-parser';

interface IHandlebarsListViewState {
  html: string;
  visible: boolean;
}

helpers({ handlebars: Handlebars });

export default class HandlebarsListView extends React.Component<IHandlebarsListViewProps, IHandlebarsListViewState> {
  

  constructor(props: IHandlebarsListViewProps) {
    super(props);
    this.state = {
      html: '',
      visible: false
    };
  }


  public async componentDidMount(): Promise<void> {
    await this.getHandlebarsTemplate();
  }
  
  private async getHandlebarsTemplate(): Promise<void> {
    

    const data = await this.getData();

    const template = Handlebars.compile(this.props.template);
    const templateContent = template({ items: data});
  
    this.setState({
      html: templateContent,
      visible: true
    });
  }


  private async getData(): Promise<Array<any>> {
    const {
      sp,
      site,
      list,
      view
    } = this.props;

    if(sp) {
    const spSite = spfi(site.url).using(AssignFrom(sp.web));
    
    const _list = spSite.web.lists.getById(list);

    const _listInfo = await _list();


    const views = await _list.views();
    
    console.log(views);

    const _viewr = _list.views.getById(view);

    console.log(_viewr);
    const _view = await _viewr.select('ListViewXml')(); //_list.views.getById(view).select('ListViewXml')();

    const expands: Array<string> = [];
   if(_listInfo.BaseType === 1) {
      expands.push("File");
   }
    
    const items = await _list.getItemsByCAMLQuery({
      ViewXml: _view.ListViewXml
    }, ...expands);

    return items;
  }

  return [];
    
  }
  
  
  
  public render(): React.ReactElement<IHandlebarsListViewProps> {
    const { html, visible } = this.state;
    return (
      <>
        {visible ? <div>{ReactHtmlParser(html)}</div> : null}
      </>
    );
  }
}
