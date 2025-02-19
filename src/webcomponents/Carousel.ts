/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { FASTElement, html, css, customElement, observable, attr } from "@microsoft/fast-element";
import { provideFluentDesignSystem } from "@fluentui/web-components";
import { delay, numberConverter } from "./helpers";

const template = html<Carousel>`
    <div class="carousel" @mouseover="${x => {if(x.autoplay) { x.pauseCarousel() }}}" @mouseout="${x => { if(x.autoplay) { x.startCarousel()}}}">
        <div class="carousel-previous" @click="${x => x.previous(true)}">
            <slot name="previous-button">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ai ai-ChevronLeft"><path d="M15 4l-8 8 8 8"/></svg>
            </slot>
        </div>
        <div class="viewport">
            <slot @slotchange="${x => x.handleSlotChange()}"></slot>
        </div>
        <div class="carousel-next" @click="${x => x.next(true)}">
            <slot name="next-button"> 
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ai ai-ChevronRight"><path d="M8 4l8 8-8 8"/></svg>
            </slot>
        </div>

        <div class="carousel-indicators">
            <slot name="carousel-indicators">

            </slot>

        </div>
    </div>
`;
const styles = css`
            .carousel {
                display: flex;
                flex-direction: column;
                align-items: center;
                flex-flow: row wrap;
                position: relative;
            }
                
            .viewport {
                overflow: hidden;
                display: flex;
                flex: 99 0 auto;
            }
            ::slotted(*) {
                flex: 1 0 100%;
                transition: transform 0.5s ease;
               
            }
            .carousel-previous, .carousel-next {
                display: flex;
                flex: 1 0 auto;
                justify-content: center;
                z-index: 10;
                position: absolute;
                top:0;
                bottom:0;
                width: 50px;
                color: var(--accent-foreground-active);
                align-items:center;
            }

            .carousel-previous:hover, .carousel-next:hover {
                background-color: rgba(255,255,255,.4);
            }
            .carousel-previous {
                left: 0;
            }
                
            .carousel-next {
                right: 0;
            }
            
            .carousel-indicators {
                display: flex;
                flex: 1 0 100%;
                justify-content: center;
                z-index: 10;
                position: absolute;
                width: 100%;
                bottom: 0;
                align-items: center;
                padding-bottom: 5px;

            }

            .carousel-bullet {
                width: 10px;
                height: 10px;
                opacity: .5;
                margin: 0 2px;
                border-radius: 100%;
                background-color: var(--accent-foreground-rest)
            }

            .carousel-bullet.active {
                background-color: var(--accent-foreground-active);
                opacity: 1;
            }   
`;

@customElement({ name: "fluentui-carousel", template, styles })
export class Carousel extends FASTElement {
    @attr({ mode: "boolean" }) autoplay: boolean = false;
    @attr({attribute: "autoplay-interval", converter: numberConverter }) autoplayInterval: number = 3000;
    @attr({ mode: "boolean" }) loop: boolean = true;
    @attr({ attribute: "aria-labelledby" }) ariaLabelledby: string = "";
    @attr({ attribute: "aria-labelled" }) ariaLabelled: string = "";
    @attr({ mode: "boolean", attribute: "paused" }) paused: boolean = false; 
    @attr({ attribute: "activeslideid" }) activeSlideId: string = "";
    
    @observable
    currentIndex = 0;
    
    @observable
    totalItems = 0;

    abortNext = false;



    constructor() {
        super();
        provideFluentDesignSystem().register();
    }

    startCarousel() {
        if(this.paused) {
            this.paused = false;
            console.log("starting carousel with playcount " + this.playCount);
            if(this.playCount === 0) {
                this.play(this.playCount);
            }
        }
    }

    playCount: number = 0;

    async play(playCounter: number = 0) {
        if(playCounter === 0) {
            this.playCount++;
            try {
                while(this.autoplay && !this.paused) {
                    await delay(this.autoplayInterval);
                    
                    if(!this.abortNext && !this.paused) {
                        this.next();
                    }
                    else {
                        this.abortNext = false;
                    }
                }
            } 
            finally {
                if(playCounter === 0)
                this.playCount--;
            }
        }
 
    }

   
    async pauseCarousel() {
        this.abortNext = true;
        this.paused = true;
       // while(this.playCount > 0) {
       //     await delay(100);
       // }
    }
    
    handleSlotChange() {
        const defaultSlot = this.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement;
        const indicatorSlot = this.shadowRoot!.querySelector('slot[name="carousel-indicators"]') as HTMLSlotElement;
        const items = defaultSlot.assignedElements();
        this.totalItems = items.length;
        this.currentIndex = this.activeSlideId ? parseInt(this.activeSlideId) % this.totalItems : 0;

        const indicators = [];
        for(let i = 0; i < items.length; i++) {
            
            const indicator = document.createElement('span');
            indicator.classList.add('carousel-bullet');
            indicator.setAttribute('aria-hidden', 'false');
            indicator.setAttribute('aria-label', `Go to slide ${i + 1}`);
            indicator.setAttribute('role', 'button');
            indicator.setAttribute('tabindex', '0');
            indicator.setAttribute('aria-selected', `${i === this.currentIndex}`);
            indicator.setAttribute('aria-controls', `slide-${i}`);
            indicator.setAttribute('id', `indicator-${i}`);
            indicator.addEventListener('click', () => this.goto(i));
            if(i === this.currentIndex) {
                indicator.classList.add('active');
            }
            
            indicatorSlot.appendChild(indicator);

            indicators.push( indicator); 
        }


        this.updateTransform(items);
    }
    
    addPreviousEventHandler() {
        const previousSlot = this.shadowRoot!.querySelector('slot[name="carousel-previous"]') as HTMLSlotElement;
        const items = previousSlot.assignedElements();

        items.forEach((item) => { 
            item.addEventListener("click", () => { this.previous(true); });
        });
    }

    addNextEventHandler() {
        const nextSlot = this.shadowRoot!.querySelector('slot[name="carousel-previous"]') as HTMLSlotElement;
        const items = nextSlot.assignedElements();

        items.forEach((item) => { 
            item.addEventListener("click", () => { this.next(true); });
        });
    }


    next(waitForNext: boolean = false) {
        this.abortNext = waitForNext;
        const defaultSlot = this.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement;
    
        const items = defaultSlot.assignedElements();
        this.currentIndex = (this.currentIndex + 1) % items.length;
        this.updateTransform(items);
    }

    previous(waitForNext: boolean = false) {
        this.abortNext = waitForNext;
        const defaultSlot = this.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement;
        const items = defaultSlot.assignedElements();
        this.currentIndex = (this.currentIndex - 1 + items.length) % items.length;
        this.updateTransform(items);
    }

    goto(index: number) {
        this.pauseCarousel();
        const defaultSlot = this.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement;
        const items = defaultSlot.assignedElements();
        this.currentIndex = index;
        this.updateTransform(items)
    }

    updateTransform(items: any[]) {
        const indicatorSlot = this.shadowRoot!.querySelector('slot[name="carousel-indicators"]') as HTMLSlotElement;
        const indicators = indicatorSlot.children;
        
        Array.from(indicators).forEach((indicator, index) => { 
            if(index === this.currentIndex) {
                indicator.classList.add('active');
            }
            else {
                indicator.classList.remove('active');
            }
        });
        //-${this.currentIndex}.classList.add('active');
        items.forEach((item, index) => {
            if(index === this.currentIndex) {
                item.classList.add('active');
                
            } else {
                item.classList.remove('active');
            }
            item.style.transform = `translateX(-${this.currentIndex * 100}%)`;
        });
    }

    connectedCallback(): void {
        super.connectedCallback();
        if(this.autoplay) {
            this.startCarousel();
        }
    }
}
