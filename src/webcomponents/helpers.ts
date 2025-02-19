/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable promise/param-names */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ValueConverter } from "@microsoft/fast-element";

export const numberConverter: ValueConverter = {
  toView(value: any): string {
    return value.toString();
  },

  fromView(value: string): any {
    return parseInt(value, 10);
  }
};


export const delay = (ms:number) => { 
  console.log("delaying for " + ms + "ms");
  return new Promise(res => setTimeout(res, ms));
};