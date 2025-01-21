import { SPFI } from "@pnp/sp";
import { IPropertyFieldSite } from "@pnp/spfx-property-controls";

export interface IHandlebarsListViewProps {
  sp?: SPFI;
  site: IPropertyFieldSite;
  list: string;
  view: string;
  template: string;
}
