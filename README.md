# handlebars-list-view

## Summary

Short summary on functionality and used technologies.

[picture of the solution in action, if possible]

## Used SharePoint Framework Version

![version](https://img.shields.io/badge/version-1.18.2-green.svg)

## Applies to

- [SharePoint Framework](https://aka.ms/spfx)
- [Microsoft 365 tenant](https://docs.microsoft.com/en-us/sharepoint/dev/spfx/set-up-your-developer-tenant)

> Get your own free development tenant by subscribing to [Microsoft 365 developer program](http://aka.ms/o365devprogram)

## Prerequisites

> Any special pre-requisites?

## Solution

| Solution    | Author(s)                                               |
| ----------- | ------------------------------------------------------- |
| folder name | Author details (name, company, twitter alias with link) |

## Version history

| Version | Date             | Comments        |
| ------- | ---------------- | --------------- |
| 1.1     | March 10, 2021   | Update comment  |
| 1.0     | January 29, 2021 | Initial release |

## Disclaimer

**THIS CODE IS PROVIDED _AS IS_ WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

---

## Minimal Path to Awesome

- Clone this repository
- Ensure that you are at the solution folder
- in the command-line run:
  - **npm install**
  - **gulp serve**

> Include any additional steps as needed.

## Features


## Sample Handlebars

```handlebars
<style type="text/css">
    /*https://css-tricks.com/css-only-carousel/*/
fluentui-carousel {
  --carousel-controls: #000;
  --carousel-controls-hover: #022f55;
  --carousel-controls-active: #022f55;
  --carousel-controls-hover-background: rgba(255,255,255,.4);
}

.slide {
    width: 99%;
    height:200px;
    padding-left:50px;
    padding-right:50px;
    border:1px solid black;
}

.slide .content {
    
    height:100%;
}

.fix {
    display:flex;
    background-color: red;
    align-items: center;
    justify-content: center;
}

.one {
    display:flex;
    flex: 1 0 auto;
    border: 1px solid black;
    padding: 3px;
    height: 100%;
}

.two {
    display:flex;
    flex: 2 0 auto;
    height: 200px;
}
.previous {
    color:black;
}

</style>

<fluentui-carousel autoplay="true" autoplay-interval="2000" loop="true">
     {{#each items }}
       <div class="slide">
           <div class="content">{{Title}}</div>
       </div>
           
        
     {{/each}}
     
     <div class="slide fix">
         <div class="one">First</div>
         <div class="two">Second</div>
         <div class="one">Third</div>
         
     </div>
    
    
</fluentui-carousel>
```

Description of the extension that expands upon high-level summary above.

This extension illustrates the following concepts:

- topic 1
- topic 2
- topic 3

> Notice that better pictures and documentation will increase the sample usage and the value you are providing for others. Thanks for your submissions advance.

> Share your web part with others through Microsoft 365 Patterns and Practices program to get visibility and exposure. More details on the community, open-source projects and other activities from http://aka.ms/m365pnp.

## References

- [Getting started with SharePoint Framework](https://docs.microsoft.com/en-us/sharepoint/dev/spfx/set-up-your-developer-tenant)
- [Building for Microsoft teams](https://docs.microsoft.com/en-us/sharepoint/dev/spfx/build-for-teams-overview)
- [Use Microsoft Graph in your solution](https://docs.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/get-started/using-microsoft-graph-apis)
- [Publish SharePoint Framework applications to the Marketplace](https://docs.microsoft.com/en-us/sharepoint/dev/spfx/publish-to-marketplace-overview)
- [Microsoft 365 Patterns and Practices](https://aka.ms/m365pnp) - Guidance, tooling, samples and open-source controls for your Microsoft 365 development
