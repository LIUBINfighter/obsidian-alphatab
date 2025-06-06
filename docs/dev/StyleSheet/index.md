# 小记录 渲染问题

看起来由于 `Obsidian` 和 `AlphaTab.js` 的特性， `AlphaTab.js` 的 `Environment.ts` 和 `BroserUiFacade.ts`是非常常用的上下文。

在这里我们提供两份文件的完整源码日常给ai提供技术上下文。

除此之外，CSS 的 @font-face 规则我们也不熟，相关的联动代码在`FontLoadingChecker.ts`。

```ts
// BroserUiFacade.ts
import type { AlphaTabApiBase } from '@src/AlphaTabApiBase';
import type { IAlphaSynth } from '@src/synth/IAlphaSynth';
import { Environment } from '@src/Environment';
import { EventEmitter, type IEventEmitter } from '@src/EventEmitter';
import { ScoreLoader } from '@src/importer/ScoreLoader';
import { Font, FontStyle, FontWeight } from '@src/model/Font';
import { Score } from '@src/model/Score';
import { NotationMode } from '@src/NotationSettings';
import type { IContainer } from '@src/platform/IContainer';
import { HtmlElementContainer } from '@src/platform/javascript/HtmlElementContainer';
import { FontSizes } from '@src/platform/svg/FontSizes';
import type { IScoreRenderer } from '@src/rendering/IScoreRenderer';
import type { RenderFinishedEventArgs } from '@src/rendering/RenderFinishedEventArgs';
import { Bounds } from '@src/rendering/utils/Bounds';
import { Settings } from '@src/Settings';
import { FontLoadingChecker } from '@src/util/FontLoadingChecker';
import { Logger } from '@src/Logger';
import type { IMouseEventArgs } from '@src/platform/IMouseEventArgs';
import type { IUiFacade } from '@src/platform/IUiFacade';
import { AlphaSynthScriptProcessorOutput } from '@src/platform/javascript/AlphaSynthScriptProcessorOutput';
import { AlphaSynthWebWorkerApi } from '@src/platform/javascript/AlphaSynthWebWorkerApi';
import type { AlphaTabApi } from '@src/platform/javascript/AlphaTabApi';
import { AlphaTabWorkerScoreRenderer } from '@src/platform/javascript/AlphaTabWorkerScoreRenderer';
import type { BrowserMouseEventArgs } from '@src/platform/javascript/BrowserMouseEventArgs';
import { Cursors } from '@src/platform/Cursors';
import { JsonConverter } from '@src/model/JsonConverter';
import { SettingsSerializer } from '@src/generated/SettingsSerializer';
import { WebPlatform } from '@src/platform/javascript/WebPlatform';
import { AlphaTabError, AlphaTabErrorType } from '@src/AlphaTabError';
import { AlphaSynthAudioWorkletOutput } from '@src/platform/javascript/AlphaSynthAudioWorkletOutput';
import { ScalableHtmlElementContainer } from '@src/platform/javascript/ScalableHtmlElementContainer';
import { PlayerOutputMode } from '@src/PlayerSettings';
import type { SettingsJson } from '@src/generated/SettingsJson';
import { AudioElementBackingTrackSynthOutput } from '@src/platform/javascript/AudioElementBackingTrackSynthOutput';
import { BackingTrackPlayer } from '@src/synth/BackingTrackPlayer';
import { CoreSettings, FontFileFormat } from '@src/CoreSettings';

/**
 * @target web
 */
enum ResultState {
    LayoutDone = 0,
    RenderRequested = 1,
    RenderDone = 2,
    Detached = 3
}

/**
 * @target web
 */
interface ResultPlaceholder extends HTMLElement {
    layoutResultId?: string;
    resultState: ResultState;
    renderedResult?: Element[];
    renderedResultId?: string;
}

/**
 * @target web
 */
interface RegisteredWebFont {
    hash: number;
    element: HTMLStyleElement;
    usages: number;
    fontSuffix: string;
    checker: FontLoadingChecker;
}

/**
 * @target web
 */
export class BrowserUiFacade implements IUiFacade<unknown> {
    private _fontCheckers: Map<string, FontLoadingChecker> = new Map();
    private _api!: AlphaTabApiBase<unknown>;
    private _contents: string | null = null;
    private _file: string | null = null;
    private _totalResultCount: number = 0;
    private _initialTrackIndexes: number[] | null = null;
    private _intersectionObserver: IntersectionObserver;
    private _barToElementLookup: Map<number, HTMLElement> = new Map<number, HTMLElement>();
    private _resultIdToElementLookup: Map<string, ResultPlaceholder> = new Map<string, ResultPlaceholder>();
    private _webFont!: RegisteredWebFont;

    public rootContainerBecameVisible: IEventEmitter = new EventEmitter();
    public canRenderChanged: IEventEmitter = new EventEmitter();

    public get resizeThrottle(): number {
        return 10;
    }

    public rootContainer: IContainer;
    public areWorkersSupported: boolean;

    public get canRender(): boolean {
        return this.areAllFontsLoaded();
    }

    private areAllFontsLoaded(): boolean {
        let isAnyNotLoaded = false;
        for (const checker of this._fontCheckers.values()) {
            if (!checker.isFontLoaded) {
                isAnyNotLoaded = true;
            }
        }

        if (isAnyNotLoaded) {
            return false;
        }

        Logger.debug('Font', `All fonts loaded: ${this._fontCheckers.size}`);
        return true;
    }

    private onFontLoaded(family: string): void {
        FontSizes.generateFontLookup(family);
        if (this.areAllFontsLoaded()) {
            (this.canRenderChanged as EventEmitter).trigger();
        }
    }

    public constructor(rootElement: HTMLElement) {
        if (Environment.webPlatform !== WebPlatform.Browser && Environment.webPlatform !== WebPlatform.BrowserModule) {
            throw new AlphaTabError(
                AlphaTabErrorType.General,
                'Usage of AlphaTabApi is only possible in browser environments. For usage in node use the Low Level APIs'
            );
        }
        rootElement.classList.add('alphaTab');
        this.rootContainer = new HtmlElementContainer(rootElement);
        this.areWorkersSupported = 'Worker' in window;

        this._intersectionObserver = new IntersectionObserver(this.onElementVisibilityChanged.bind(this), {
            threshold: [0, 0.01, 1]
        });
        this._intersectionObserver.observe(rootElement);
    }

    private onElementVisibilityChanged(entries: IntersectionObserverEntry[]) {
        for (const e of entries) {
            const htmlElement = e.target as HTMLElement;
            if (htmlElement === (this.rootContainer as HtmlElementContainer).element) {
                if (e.isIntersecting) {
                    (this.rootContainerBecameVisible as EventEmitter).trigger();
                    this._intersectionObserver.unobserve((this.rootContainer as HtmlElementContainer).element);
                }
            } else if ('layoutResultId' in htmlElement && this._api.settings.core.enableLazyLoading) {
                const placeholder = htmlElement as ResultPlaceholder;
                if (e.isIntersecting) {
                    // missing result or result not matching layout -> request render
                    if (placeholder.renderedResultId !== placeholder.layoutResultId) {
                        if (this._resultIdToElementLookup.has(placeholder.layoutResultId!)) {
                            if (placeholder.resultState !== ResultState.RenderRequested) {
                                placeholder.resultState = ResultState.RenderRequested;
                                this._api.renderer.renderResult(placeholder.layoutResultId!);
                            } else {
                                // Already requested render of this partial, wait for result
                            }
                        } else {
                            htmlElement.replaceChildren();
                        }
                    }
                    // detached and became visible
                    else if (placeholder.resultState === ResultState.Detached) {
                        htmlElement.replaceChildren(...placeholder.renderedResult!);
                        placeholder.resultState = ResultState.RenderDone;
                    }
                } else if (placeholder.resultState === ResultState.RenderDone) {
                    placeholder.resultState = ResultState.Detached;
                    placeholder.replaceChildren();
                }
            }
        }
    }

    public createWorkerRenderer(): IScoreRenderer {
        return new AlphaTabWorkerScoreRenderer<unknown>(this._api, this._api.settings);
    }

    public initialize(api: AlphaTabApiBase<unknown>, raw: SettingsJson | Settings): void {
        this._api = api;
        let settings: Settings;
        if (raw instanceof Settings) {
            settings = raw;
        } else {
            settings = JsonConverter.jsObjectToSettings(raw);
        }

        const dataAttributes: Map<string, unknown> = this.getDataAttributes();
        SettingsSerializer.fromJson(settings, dataAttributes);
        if (settings.notation.notationMode === NotationMode.SongBook) {
            settings.setSongBookModeSettings();
        }
        api.settings = settings;
        this.setupFontCheckers(settings);

        this._initialTrackIndexes = this.parseTracks(settings.core.tracks);
        this._contents = '';
        const element: HtmlElementContainer = api.container as HtmlElementContainer;
        if (settings.core.tex) {
            this._contents = element.element.innerHTML;
            element.element.innerHTML = '';
        }
        this.createStyleElements(settings);
        this._file = settings.core.file;
    }

    private setupFontCheckers(settings: Settings): void {
        this.registerFontChecker(settings.display.resources.copyrightFont);
        this.registerFontChecker(settings.display.resources.effectFont);
        this.registerFontChecker(settings.display.resources.fingeringFont);
        this.registerFontChecker(settings.display.resources.graceFont);
        this.registerFontChecker(settings.display.resources.markerFont);
        this.registerFontChecker(settings.display.resources.tablatureFont);
        this.registerFontChecker(settings.display.resources.titleFont);
        this.registerFontChecker(settings.display.resources.wordsFont);
        this.registerFontChecker(settings.display.resources.barNumberFont);
        this.registerFontChecker(settings.display.resources.fretboardNumberFont);
        this.registerFontChecker(settings.display.resources.subTitleFont);
    }

    private registerFontChecker(font: Font): void {
        if (!this._fontCheckers.has(font.families.join(', '))) {
            const checker: FontLoadingChecker = new FontLoadingChecker(font.families);
            this._fontCheckers.set(font.families.join(', '), checker);
            checker.fontLoaded.on(this.onFontLoaded.bind(this));
            checker.checkForFontAvailability();
        }
    }

    public destroy(): void {
        (this.rootContainer as HtmlElementContainer).element.innerHTML = '';
        const webFont = this._webFont;
        webFont.usages--;
        if (webFont.usages <= 0) {
            webFont.element.remove();
            BrowserUiFacade._registeredWebFonts.delete(webFont.hash);
        }
    }

    public createCanvasElement(): IContainer {
        const canvasElement: HTMLElement = document.createElement('div');
        canvasElement.classList.add('at-surface', `at${this._webFont.fontSuffix}`);
        canvasElement.style.fontSize = '0';
        canvasElement.style.overflow = 'hidden';
        canvasElement.style.lineHeight = '0';
        canvasElement.style.position = 'relative';
        return new HtmlElementContainer(canvasElement);
    }

    public triggerEvent(
        container: IContainer,
        name: string,
        details: unknown = null,
        originalEvent?: IMouseEventArgs
    ): void {
        const element: HTMLElement = (container as HtmlElementContainer).element;
        name = `alphaTab.${name}`;
        const e: any = document.createEvent('CustomEvent');
        const originalMouseEvent: MouseEvent | null = originalEvent
            ? (originalEvent as BrowserMouseEventArgs).mouseEvent
            : null;
        e.initCustomEvent(name, false, false, details);
        if (originalMouseEvent) {
            e.originalEvent = originalMouseEvent;
        }
        element.dispatchEvent(e);
        if (window && 'jQuery' in window) {
            const jquery: any = (window as any).jQuery;
            const args: unknown[] = [];
            args.push(details);
            if (originalMouseEvent) {
                args.push(originalMouseEvent);
            }
            jquery(element).trigger(name, args);
        }
    }

    public load(data: unknown, success: (score: Score) => void, error: (error: Error) => void): boolean {
        if (data instanceof Score) {
            success(data);
            return true;
        }
        if (data instanceof ArrayBuffer) {
            const byteArray: Uint8Array = new Uint8Array(data);
            success(ScoreLoader.loadScoreFromBytes(byteArray, this._api.settings));
            return true;
        }
        if (data instanceof Uint8Array) {
            success(ScoreLoader.loadScoreFromBytes(data, this._api.settings));
            return true;
        }
        if (typeof data === 'string') {
            ScoreLoader.loadScoreAsync(data, success, error, this._api.settings);
            return true;
        }
        return false;
    }

    public loadSoundFont(data: unknown, append: boolean): boolean {
        if (!this._api.player) {
            return false;
        }

        if (data instanceof ArrayBuffer) {
            this._api.player.loadSoundFont(new Uint8Array(data), append);
            return true;
        }
        if (data instanceof Uint8Array) {
            this._api.player.loadSoundFont(data, append);
            return true;
        }
        if (typeof data === 'string') {
            (this._api as AlphaTabApi).loadSoundFontFromUrl(data, append);
            return true;
        }
        return false;
    }

    public initialRender(): void {
        this._api.renderer.preRender.on((_: boolean) => {
            this._totalResultCount = 0;
            this._resultIdToElementLookup.clear();
            this._barToElementLookup.clear();
        });

        const initialRender = () => {
            // rendering was possibly delayed due to invisible element
            // in this case we need the correct width for autosize
            this._api.renderer.width = this.rootContainer.width | 0;
            this._api.renderer.updateSettings(this._api.settings);
            if (this._contents) {
                this._api.tex(this._contents, this._initialTrackIndexes ?? undefined);
                this._initialTrackIndexes = null;
            } else if (this._file) {
                ScoreLoader.loadScoreAsync(
                    this._file,
                    s => {
                        this._api.renderScore(s, this._initialTrackIndexes ?? undefined);
                        this._initialTrackIndexes = null;
                    },
                    e => {
                        this._api.onError(e as Error);
                    },
                    this._api.settings
                );
            }
        };

        if (!this.rootContainer!.isVisible) {
            this.rootContainerBecameVisible.on(initialRender);
        } else {
            initialRender();
        }
    }

    private createStyleElements(settings: Settings): void {
        const root = (this._api.container as HtmlElementContainer).element.ownerDocument!;
        BrowserUiFacade.createSharedStyleElement(root);

        // SmuFl Font Specific style

        const smuflFontSources =
            settings.core.smuflFontSources ?? CoreSettings.buildDefaultSmuflFontSources(settings.core.fontDirectory);

        // create a simple unique hash for the font source definition
        // as data urls might be used we don't want to just use the plain strings.
        const hash = BrowserUiFacade.cyrb53(smuflFontSources.values());

        // reuse existing style if available
        const registeredWebFonts = BrowserUiFacade._registeredWebFonts;
        if (registeredWebFonts.has(hash)) {
            const webFont = registeredWebFonts.get(hash)!;
            webFont.usages++;
            webFont.checker.fontLoaded.on(this.onFontLoaded.bind(this));
            this._webFont = webFont;
            return;
        }

        const fontSuffix = registeredWebFonts.size === 0 ? '' : String(registeredWebFonts.size);
        const familyName = `alphaTab${fontSuffix}`;

        const src = Array.from(smuflFontSources.entries())
            .map(e => `url(${JSON.stringify(e[1])}) format('${BrowserUiFacade.cssFormat(e[0])}')`)
            .join(',');

        const css: string = `
            @font-face {
                font-display: block;
                font-family: '${familyName}';
                src: ${src};
                font-weight: normal;
                font-style: normal;
            }
            .at-surface.at${fontSuffix} .at {
                font-family: '${familyName}';
                speak: none;
                font-style: normal;
                font-weight: normal;
                font-variant: normal;
                text-transform: none;
                line-height: 1;
                line-height: 1;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                font-size: ${Environment.MusicFontSize}px;
                overflow: visible !important;
            }`;

        const styleElement = root.createElement('style');
        styleElement.id = `alphaTabStyle${fontSuffix}`;
        styleElement.innerHTML = css;
        root.getElementsByTagName('head').item(0)!.appendChild(styleElement);
        const checker = new FontLoadingChecker([familyName]);
        checker.fontLoaded.on(this.onFontLoaded.bind(this));
        this._fontCheckers.set(familyName, checker);
        checker.checkForFontAvailability();

        settings.display.resources.smuflFont = new Font(
            familyName,
            Environment.MusicFontSize,
            FontStyle.Plain,
            FontWeight.Regular
        );

        const webFont: RegisteredWebFont = {
            hash,
            element: styleElement,
            fontSuffix,
            usages: 1,
            checker
        };

        registeredWebFonts.set(hash, webFont);
        this._webFont = webFont;
    }

    private static cssFormat(format: FontFileFormat) {
        switch (format) {
            case FontFileFormat.EmbeddedOpenType:
                return 'embedded-opentype';
            case FontFileFormat.Woff:
                return 'woff';
            case FontFileFormat.Woff2:
                return 'woff2';
            case FontFileFormat.OpenType:
                return 'opentype';
            case FontFileFormat.TrueType:
                return 'truetype';
            case FontFileFormat.Svg:
                return 'svg';
        }
    }

    private static _registeredWebFonts: Map<number, RegisteredWebFont> = new Map<number, RegisteredWebFont>();

    /**
     * cyrb53 (c) 2018 bryc (github.com/bryc)
     * License: Public domain (or MIT if needed). Attribution appreciated.
     * A fast and simple 53-bit string hash function with decent collision resistance.
     * Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity
     * @param str
     * @param seed
     * @returns
     */
    private static cyrb53(strings: Iterable<string>, seed: number = 0) {
        let h1 = 0xdeadbeef ^ seed;
        let h2 = 0x41c6ce57 ^ seed;
        for (const str of strings) {
            for (let i = 0; i < str.length; i++) {
                const ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }

    /**
     * Creates the default CSS styles used across all alphaTab instances.
     * @target web
     * @internal
     */
    public static createSharedStyleElement(root: Document) {
        let styleElement: HTMLStyleElement = root.getElementById('alphaTabStyle') as HTMLStyleElement;
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'alphaTabStyleShared';
            const css: string = `
                .at-surface * {
                    cursor: default;
                    vertical-align: top;
                    overflow: visible;
                }
                .at-surface-svg text {
                    dominant-baseline: central;
                    white-space:pre;
                }`;

            styleElement.innerHTML = css;
            document.getElementsByTagName('head').item(0)!.appendChild(styleElement);
        }
    }

    public parseTracks(tracksData: unknown): number[] {
        if (!tracksData) {
            return [];
        }
        const tracks: number[] = [];
        // decode string
        if (typeof tracksData === 'string') {
            try {
                if (tracksData === 'all') {
                    return [-1];
                }
                tracksData = JSON.parse(tracksData);
            } catch (e) {
                tracksData = [0];
            }
        }
        // decode array
        if (typeof tracksData === 'number') {
            tracks.push(tracksData);
        } else if ('length' in (tracksData as any)) {
            const length: number = (tracksData as any).length;
            const array: unknown[] = tracksData as unknown[];
            for (let i: number = 0; i < length; i++) {
                const item: unknown = array[i];
                let value: number = 0;
                if (typeof item === 'number') {
                    value = item;
                } else if ('index' in (item as any)) {
                    value = (item as any).index;
                } else {
                    value = Number.parseInt((item as any).toString());
                }
                if (value >= 0 || value === -1) {
                    tracks.push(value);
                }
            }
        } else if ('index' in (tracksData as any)) {
            tracks.push((tracksData as any).index);
        }
        return tracks;
    }

    private getDataAttributes(): Map<string, unknown> {
        const dataAttributes: Map<string, unknown> = new Map<string, unknown>();
        const element: HTMLElement = (this._api.container as HtmlElementContainer).element;
        if (element.dataset) {
            for (const key of Object.keys(element.dataset)) {
                let value: unknown = (element.dataset as any)[key];
                try {
                    const stringValue: string = value as string;
                    value = JSON.parse(stringValue);
                } catch (e) {
                    if (value === '') {
                        value = null;
                    }
                }
                dataAttributes.set(key, value);
            }
        } else {
            for (let i: number = 0; i < element.attributes.length; i++) {
                const attr: Attr = element.attributes.item(i)!;
                const nodeName: string = attr.nodeName;
                if (nodeName.startsWith('data-')) {
                    const keyParts: string[] = nodeName.substr(5).split('-');
                    let key: string = keyParts[0];
                    for (let j: number = 1; j < keyParts.length; j++) {
                        key += keyParts[j].substr(0, 1).toUpperCase() + keyParts[j].substr(1);
                    }
                    let value: unknown = attr.nodeValue;
                    try {
                        value = JSON.parse(value as string);
                    } catch (e) {
                        if (value === '') {
                            value = null;
                        }
                    }
                    dataAttributes.set(key, value);
                }
            }
        }
        return dataAttributes;
    }

    public beginUpdateRenderResults(renderResult: RenderFinishedEventArgs): void {
        if (!this._resultIdToElementLookup.has(renderResult.id)) {
            return;
        }

        const placeholder = this._resultIdToElementLookup.get(renderResult.id)!;

        const body: any = renderResult.renderResult;
        if (typeof body === 'string') {
            placeholder.innerHTML = body;
        } else if ('nodeType' in body) {
            placeholder.replaceChildren(body as Node);
        }
        placeholder.resultState = ResultState.RenderDone;
        placeholder.renderedResultId = renderResult.id;
        placeholder.renderedResult = Array.from(placeholder.children);
    }

    public beginAppendRenderResults(renderResult: RenderFinishedEventArgs | null): void {
        const canvasElement: HTMLElement = (this._api.canvasElement as HtmlElementContainer).element;
        // null result indicates that the rendering finished
        if (!renderResult) {
            // so we remove elements that might be from a previous render session
            while (canvasElement.childElementCount > this._totalResultCount) {
                if (this._api.settings.core.enableLazyLoading) {
                    this._intersectionObserver.unobserve(canvasElement.lastChild as Element);
                }
                canvasElement.removeChild(canvasElement.lastElementChild!);
            }
        } else {
            let placeholder: ResultPlaceholder;
            if (this._totalResultCount < canvasElement.childElementCount) {
                placeholder = canvasElement.childNodes.item(this._totalResultCount) as ResultPlaceholder;
            } else {
                placeholder = document.createElement('div') as unknown as ResultPlaceholder;
                canvasElement.appendChild(placeholder);
            }
            placeholder.style.zIndex = '1';
            placeholder.style.position = 'absolute';
            placeholder.style.left = `${renderResult.x}px`;
            placeholder.style.top = `${renderResult.y}px`;
            placeholder.style.width = `${renderResult.width}px`;
            placeholder.style.height = `${renderResult.height}px`;
            placeholder.style.display = 'inline-block';
            placeholder.layoutResultId = renderResult.id;
            placeholder.resultState = ResultState.LayoutDone;
            placeholder.renderedResultId = undefined;
            placeholder.renderedResult = undefined;

            this._resultIdToElementLookup.set(renderResult.id, placeholder);

            // remember which bar is contained in which node for faster lookup
            // on highlight/unhighlight
            for (let i = renderResult.firstMasterBarIndex; i <= renderResult.lastMasterBarIndex; i++) {
                if (i >= 0) {
                    this._barToElementLookup.set(i, placeholder);
                }
            }

            if (this._api.settings.core.enableLazyLoading) {
                // re-observe to fire event
                this._intersectionObserver.unobserve(placeholder);
                this._intersectionObserver.observe(placeholder);
            }

            this._totalResultCount++;
        }
    }

    /**
     * This method creates the player. It detects browser compatibility and
     * initializes a alphaSynth version for the client.
     */
    public createWorkerPlayer(): IAlphaSynth | null {
        let player: AlphaSynthWebWorkerApi | null = null;
        const supportsScriptProcessor: boolean = 'ScriptProcessorNode' in window;

        const supportsAudioWorklets: boolean = window.isSecureContext && 'AudioWorkletNode' in window;

        if (supportsAudioWorklets && this._api.settings.player.outputMode === PlayerOutputMode.WebAudioAudioWorklets) {
            Logger.debug('Player', 'Will use webworkers for synthesizing and web audio api with worklets for playback');
            player = new AlphaSynthWebWorkerApi(
                new AlphaSynthAudioWorkletOutput(this._api.settings),
                this._api.settings
            );
        } else if (supportsScriptProcessor) {
            Logger.debug(
                'Player',
                'Will use webworkers for synthesizing and web audio api with ScriptProcessor for playback'
            );
            player = new AlphaSynthWebWorkerApi(new AlphaSynthScriptProcessorOutput(), this._api.settings);
        }

        if (!player) {
            Logger.error('Player', 'Player requires webworkers and web audio api, browser unsupported', null);
        } else {
            player.ready.on(() => {
                if (this._api.settings.player.soundFont) {
                    (this._api as AlphaTabApi).loadSoundFontFromUrl(this._api.settings.player.soundFont, false);
                }
            });
        }
        return player;
    }

    public beginInvoke(action: () => void): void {
        window.requestAnimationFrame(() => {
            action();
        });
    }

    private _highlightedElements: HTMLElement[] = [];
    public highlightElements(groupId: string, masterBarIndex: number): void {
        const element = this._barToElementLookup.get(masterBarIndex);
        if (element) {
            const elementsToHighlight: HTMLCollection = element.getElementsByClassName(groupId);
            for (let i: number = 0; i < elementsToHighlight.length; i++) {
                elementsToHighlight.item(i)!.classList.add('at-highlight');
                this._highlightedElements.push(elementsToHighlight.item(i) as HTMLElement);
            }
        }
    }

    public removeHighlights(): void {
        const highlightedElements = this._highlightedElements;
        if (!highlightedElements) {
            return;
        }
        for (const element of highlightedElements) {
            element.classList.remove('at-highlight');
        }
        this._highlightedElements = [];
    }

    public destroyCursors(): void {
        const element: HTMLElement = (this._api.container as HtmlElementContainer).element;
        const cursorWrapper: HTMLElement = element.querySelector('.at-cursors') as HTMLElement;
        element.removeChild(cursorWrapper);
    }

    public createCursors(): Cursors | null {
        const element: HTMLElement = (this._api.container as HtmlElementContainer).element;
        const cursorWrapper: HTMLElement = document.createElement('div');
        cursorWrapper.classList.add('at-cursors');
        const selectionWrapper: HTMLElement = document.createElement('div');
        selectionWrapper.classList.add('at-selection');

        const barCursorContainer = this.createScalingElement();
        const beatCursorContainer = this.createScalingElement();

        const barCursor: HTMLElement = barCursorContainer.element;
        barCursor.classList.add('at-cursor-bar');
        const beatCursor: HTMLElement = beatCursorContainer.element;
        beatCursor.classList.add('at-cursor-beat');
        // required css styles
        element.style.position = 'relative';
        element.style.textAlign = 'left';

        cursorWrapper.style.position = 'absolute';
        cursorWrapper.style.zIndex = '1000';
        cursorWrapper.style.display = 'inline';
        cursorWrapper.style.pointerEvents = 'none';

        selectionWrapper.style.position = 'absolute';

        barCursor.style.position = 'absolute';
        barCursor.style.left = '0';
        barCursor.style.top = '0';
        barCursor.style.willChange = 'transform';
        barCursorContainer.width = 1;
        barCursorContainer.height = 1;
        barCursorContainer.setBounds(0, 0, 1, 1);

        beatCursor.style.position = 'absolute';
        beatCursor.style.transition = 'all 0s linear';
        beatCursor.style.left = '0';
        beatCursor.style.top = '0';
        beatCursor.style.willChange = 'transform';
        beatCursorContainer.width = 3;
        beatCursorContainer.height = 1;
        beatCursorContainer.setBounds(0, 0, 1, 1);

        // add cursors to UI
        element.insertBefore(cursorWrapper, element.firstChild);
        cursorWrapper.appendChild(selectionWrapper);
        cursorWrapper.appendChild(barCursor);
        cursorWrapper.appendChild(beatCursor);
        return new Cursors(
            new HtmlElementContainer(cursorWrapper),
            barCursorContainer,
            beatCursorContainer,
            new HtmlElementContainer(selectionWrapper)
        );
    }

    public getOffset(scrollContainer: IContainer | null, container: IContainer): Bounds {
        const element: HTMLElement = (container as HtmlElementContainer).element;
        const bounds: DOMRect = element.getBoundingClientRect();
        let top: number = bounds.top + element.ownerDocument!.defaultView!.pageYOffset;
        let left: number = bounds.left + element.ownerDocument!.defaultView!.pageXOffset;
        if (scrollContainer) {
            const scrollElement: HTMLElement = (scrollContainer as HtmlElementContainer).element;
            const nodeName: string = scrollElement.nodeName.toLowerCase();
            if (nodeName !== 'html' && nodeName !== 'body') {
                const scrollElementOffset: Bounds = this.getOffset(null, scrollContainer);
                top = top + scrollElement.scrollTop - scrollElementOffset.y;
                left = left + scrollElement.scrollLeft - scrollElementOffset.x;
            }
        }

        const b = new Bounds();
        b.x = left;
        b.y = top;
        b.w = bounds.width;
        b.h = bounds.height;
        return b;
    }

    private _scrollContainer: IContainer | null = null;
    public getScrollContainer(): IContainer {
        if (this._scrollContainer) {
            return this._scrollContainer;
        }

        let scrollElement: HTMLElement =
            // tslint:disable-next-line: strict-type-predicates
            typeof this._api.settings.player.scrollElement === 'string'
                ? (document.querySelector(this._api.settings.player.scrollElement) as HTMLElement)
                : (this._api.settings.player.scrollElement as HTMLElement);
        const nodeName: string = scrollElement.nodeName.toLowerCase();
        if (nodeName === 'html' || nodeName === 'body') {
            // https://github.com/CoderLine/alphaTab/issues/205
            // https://github.com/CoderLine/alphaTab/issues/354
            // https://dev.opera.com/articles/fixing-the-scrolltop-bug/
            if ('scrollingElement' in document) {
                scrollElement = document.scrollingElement as HTMLElement;
            } else {
                const userAgent = navigator.userAgent;
                if (userAgent.indexOf('WebKit') !== -1) {
                    scrollElement = (document as HTMLDocument).body;
                } else {
                    scrollElement = (document as HTMLDocument).documentElement;
                }
            }
        }

        this._scrollContainer = new HtmlElementContainer(scrollElement);
        return this._scrollContainer;
    }

    public createSelectionElement(): IContainer | null {
        return this.createScalingElement();
    }

    public createScalingElement(): ScalableHtmlElementContainer {
        const element = document.createElement('div');
        element.style.position = 'absolute';

        // to typical browser zoom levels are:
        // Chromium: 25,33,50,67,75,80,90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500
        // Firefox: 30, 50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200, 240, 300, 400, 500

        // with having a 100x100 scaling container we should be able to provide appropriate scaling

        const container = new ScalableHtmlElementContainer(element, 100, 100);
        container.width = 1;
        container.height = 1;
        container.setBounds(0, 0, 1, 1);
        return container;
    }

    public scrollToY(element: IContainer, scrollTargetY: number, speed: number): void {
        this.internalScrollToY((element as HtmlElementContainer).element, scrollTargetY, speed);
    }

    public scrollToX(element: IContainer, scrollTargetY: number, speed: number): void {
        this.internalScrollToX((element as HtmlElementContainer).element, scrollTargetY, speed);
    }

    private internalScrollToY(element: HTMLElement, scrollTargetY: number, speed: number): void {
        if (this._api.settings.player.nativeBrowserSmoothScroll) {
            element.scrollTo({
                top: scrollTargetY,
                behavior: 'smooth'
            });
        } else {
            const startY: number = element.scrollTop;
            const diff: number = scrollTargetY - startY;

            let start: number = 0;
            const step = (x: number) => {
                if (start === 0) {
                    start = x;
                }
                const time: number = x - start;
                const percent: number = Math.min(time / speed, 1);
                element.scrollTop = (startY + diff * percent) | 0;
                if (time < speed) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        }
    }

    private internalScrollToX(element: HTMLElement, scrollTargetX: number, speed: number): void {
        if (this._api.settings.player.nativeBrowserSmoothScroll) {
            element.scrollTo({
                left: scrollTargetX,
                behavior: 'smooth'
            });
        } else {
            const startX: number = element.scrollLeft;
            const diff: number = scrollTargetX - startX;
            let start: number = 0;
            const step = (t: number) => {
                if (start === 0) {
                    start = t;
                }
                const time: number = t - start;
                const percent: number = Math.min(time / speed, 1);
                element.scrollLeft = (startX + diff * percent) | 0;
                if (time < speed) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        }
    }

    public createBackingTrackPlayer(): IAlphaSynth | null {
        return new BackingTrackPlayer(
            new AudioElementBackingTrackSynthOutput(),
            this._api.settings.player.bufferTimeInMilliseconds
        );
    }
}
```

```ts
//Environment.ts
import { LayoutMode } from '@src/LayoutMode';
import { StaveProfile } from '@src/StaveProfile';
import { AlphaTexImporter } from '@src/importer/AlphaTexImporter';
import { Gp3To5Importer } from '@src/importer/Gp3To5Importer';
import { Gp7To8Importer } from '@src/importer/Gp7To8Importer';
import { GpxImporter } from '@src/importer/GpxImporter';
import { MusicXmlImporter } from '@src/importer/MusicXmlImporter';
import type { ScoreImporter } from '@src/importer/ScoreImporter';
import { HarmonicType } from '@src/model/HarmonicType';
import type { ICanvas } from '@src/platform/ICanvas';
import { AlphaSynthWebWorker } from '@src/platform/javascript/AlphaSynthWebWorker';
import { AlphaTabWebWorker } from '@src/platform/javascript/AlphaTabWebWorker';
import { Html5Canvas } from '@src/platform/javascript/Html5Canvas';
import { JQueryAlphaTab } from '@src/platform/javascript/JQueryAlphaTab';
import { CssFontSvgCanvas } from '@src/platform/svg/CssFontSvgCanvas';
import type { BarRendererFactory } from '@src/rendering/BarRendererFactory';
import { EffectBarRendererFactory } from '@src/rendering/EffectBarRendererFactory';
import { AlternateEndingsEffectInfo } from '@src/rendering/effects/AlternateEndingsEffectInfo';
import { CapoEffectInfo } from '@src/rendering/effects/CapoEffectInfo';
import { ChordsEffectInfo } from '@src/rendering/effects/ChordsEffectInfo';
import { CrescendoEffectInfo } from '@src/rendering/effects/CrescendoEffectInfo';
import { DynamicsEffectInfo } from '@src/rendering/effects/DynamicsEffectInfo';
import { FadeEffectInfo } from '@src/rendering/effects/FadeEffectInfo';
import { FermataEffectInfo } from '@src/rendering/effects/FermataEffectInfo';
import { FingeringEffectInfo } from '@src/rendering/effects/FingeringEffectInfo';
import { HarmonicsEffectInfo } from '@src/rendering/effects/HarmonicsEffectInfo';
import { LetRingEffectInfo } from '@src/rendering/effects/LetRingEffectInfo';
import { LyricsEffectInfo } from '@src/rendering/effects/LyricsEffectInfo';
import { MarkerEffectInfo } from '@src/rendering/effects/MarkerEffectInfo';
import { OttaviaEffectInfo } from '@src/rendering/effects/OttaviaEffectInfo';
import { PalmMuteEffectInfo } from '@src/rendering/effects/PalmMuteEffectInfo';
import { PickSlideEffectInfo } from '@src/rendering/effects/PickSlideEffectInfo';
import { PickStrokeEffectInfo } from '@src/rendering/effects/PickStrokeEffectInfo';
import { SlightBeatVibratoEffectInfo } from '@src/rendering/effects/SlightBeatVibratoEffectInfo';
import { SlightNoteVibratoEffectInfo } from '@src/rendering/effects/SlightNoteVibratoEffectInfo';
import { TapEffectInfo } from '@src/rendering/effects/TapEffectInfo';
import { TempoEffectInfo } from '@src/rendering/effects/TempoEffectInfo';
import { TextEffectInfo } from '@src/rendering/effects/TextEffectInfo';
import { TrillEffectInfo } from '@src/rendering/effects/TrillEffectInfo';
import { TripletFeelEffectInfo } from '@src/rendering/effects/TripletFeelEffectInfo';
import { WhammyBarEffectInfo } from '@src/rendering/effects/WhammyBarEffectInfo';
import { WideBeatVibratoEffectInfo } from '@src/rendering/effects/WideBeatVibratoEffectInfo';
import { WideNoteVibratoEffectInfo } from '@src/rendering/effects/WideNoteVibratoEffectInfo';
import { HorizontalScreenLayout } from '@src/rendering/layout/HorizontalScreenLayout';
import { PageViewLayout } from '@src/rendering/layout/PageViewLayout';
import type { ScoreLayout } from '@src/rendering/layout/ScoreLayout';
import { ScoreBarRendererFactory } from '@src/rendering/ScoreBarRendererFactory';
import type { ScoreRenderer } from '@src/rendering/ScoreRenderer';
import { TabBarRendererFactory } from '@src/rendering/TabBarRendererFactory';
import { Logger } from '@src/Logger';
import { LeftHandTapEffectInfo } from '@src/rendering/effects/LeftHandTapEffectInfo';
import { CapellaImporter } from '@src/importer/CapellaImporter';
import { WebPlatform } from '@src/platform/javascript/WebPlatform';
import { AlphaSynthWebWorklet } from '@src/platform/javascript/AlphaSynthAudioWorkletOutput';
import { SkiaCanvas } from '@src/platform/skia/SkiaCanvas';
import type { Font } from '@src/model/Font';
import type { Settings } from '@src/Settings';
import { AlphaTabError, AlphaTabErrorType } from '@src/AlphaTabError';
import { SlashBarRendererFactory } from '@src/rendering/SlashBarRendererFactory';
import { NumberedBarRendererFactory } from '@src/rendering/NumberedBarRendererFactory';
import { FreeTimeEffectInfo } from '@src/rendering/effects/FreeTimeEffectInfo';
import { ScoreBarRenderer } from '@src/rendering/ScoreBarRenderer';
import { TabBarRenderer } from '@src/rendering/TabBarRenderer';
import { SustainPedalEffectInfo } from '@src/rendering/effects/SustainPedalEffectInfo';
import { GolpeEffectInfo } from '@src/rendering/effects/GolpeEffectInfo';
import { GolpeType } from '@src/model/GolpeType';
import { WahPedalEffectInfo } from '@src/rendering/effects/WahPedalEffectInfo';
import { BeatBarreEffectInfo } from '@src/rendering/effects/BeatBarreEffectInfo';
import { NoteOrnamentEffectInfo } from '@src/rendering/effects/NoteOrnamentEffectInfo';
import { RasgueadoEffectInfo } from '@src/rendering/effects/RasgueadoEffectInfo';
import { DirectionsEffectInfo } from '@src/rendering/effects/DirectionsEffectInfo';
import { BeatTimerEffectInfo } from '@src/rendering/effects/BeatTimerEffectInfo';
import { VersionInfo } from '@src/generated/VersionInfo';

/**
 * A factory for custom layout engines.
 */
export class LayoutEngineFactory {
    /**
     * Whether the layout is considered "vertical" (affects mainly scrolling behavior).
     */
    public readonly vertical: boolean;
    /**
     * Creates a new layout instance.
     */
    public readonly createLayout: (renderer: ScoreRenderer) => ScoreLayout;

    public constructor(vertical: boolean, createLayout: (renderer: ScoreRenderer) => ScoreLayout) {
        this.vertical = vertical;
        this.createLayout = createLayout;
    }
}

/**
 * A factory for custom render engines.
 * Note for Web: To use a custom engine in workers you have to ensure the engine and registration to the environment are
 * also done in the background worker files (e.g. when bundling)
 */
export class RenderEngineFactory {
    /**
     * Whether the layout supports background workers.
     */
    public readonly supportsWorkers: boolean;
    public readonly createCanvas: () => ICanvas;

    public constructor(supportsWorkers: boolean, canvas: () => ICanvas) {
        this.supportsWorkers = supportsWorkers;
        this.createCanvas = canvas;
    }
}

/**
 * This public class represents the global alphaTab environment where
 * alphaTab looks for information like available layout engines
 * staves etc.
 * This public class represents the global alphaTab environment where
 * alphaTab looks for information like available layout engines
 * staves etc.
 * @partial
 */
export class Environment {
    private static readonly StaffIdBeforeSlashAlways = 'before-slash-always';
    private static readonly StaffIdBeforeScoreAlways = 'before-score-always';
    private static readonly StaffIdBeforeScoreHideable = 'before-score-hideable';
    private static readonly StaffIdBeforeNumberedAlways = 'before-numbered-always';
    private static readonly StaffIdBeforeTabAlways = 'before-tab-always';
    private static readonly StaffIdBeforeTabHideable = 'before-tab-hideable';
    private static readonly StaffIdBeforeEndAlways = 'before-end-always';

    /**
     * The font size of the music font in pixel.
     * @internal
     */
    public static readonly MusicFontSize = 34;

    /**
     * The scaling factor to use when rending raster graphics for sharper rendering on high-dpi displays.
     * @internal
     */
    public static HighDpiFactor = 1;

    /**
     * @target web
     */
    private static _globalThis: any | undefined = undefined;

    /**
     * @target web
     * @internal
     */
    public static get globalThis(): any {
        if (Environment._globalThis === undefined) {
            try {
                Environment._globalThis = globalThis;
            } catch (e) {
                // globalThis not available
            }

            if (typeof Environment._globalThis === 'undefined') {
                Environment._globalThis = self;
            }
            if (typeof Environment._globalThis === 'undefined') {
                Environment._globalThis = global;
            }
            if (typeof Environment._globalThis === 'undefined') {
                Environment._globalThis = window;
            }
            if (typeof Environment._globalThis === 'undefined') {
                Environment._globalThis = Function('return this')();
            }
        }

        return Environment._globalThis;
    }

    /**
     * @target web
     */
    public static readonly webPlatform: WebPlatform = Environment.detectWebPlatform();

    /**
     * @target web
     */
    public static readonly isWebPackBundled: boolean = Environment.detectWebPack();

    /**
     * @target web
     */
    public static readonly isViteBundled: boolean = Environment.detectVite();

    /**
     * @target web
     */
    public static readonly scriptFile: string | null = Environment.detectScriptFile();

    /**
     * @target web
     */
    public static readonly fontDirectory: string | null = Environment.detectFontDirectory();

    /**
     * @target web
     */
    public static get isRunningInWorker(): boolean {
        return 'WorkerGlobalScope' in Environment.globalThis;
    }

    /**
     * @target web
     */
    public static get isRunningInAudioWorklet(): boolean {
        return 'AudioWorkletGlobalScope' in Environment.globalThis;
    }

    /**
     * @target web
     * @internal
     */
    public static createWebWorker: (settings: Settings) => Worker;

    /**
     * @target web
     * @internal
     */
    public static createAudioWorklet: (context: AudioContext, settings: Settings) => Promise<void>;

    /**
     * @target web
     * @partial
     */
    public static throttle(action: () => void, delay: number): () => void {
        let timeoutId: number = 0;
        return () => {
            Environment.globalThis.clearTimeout(timeoutId);
            timeoutId = Environment.globalThis.setTimeout(action, delay);
        };
    }

    /**
     * @target web
     */
    private static detectScriptFile(): string | null {
        // custom global constant
        if (!Environment.isRunningInWorker && Environment.globalThis.ALPHATAB_ROOT) {
            let scriptFile = Environment.globalThis.ALPHATAB_ROOT;
            scriptFile = Environment.ensureFullUrl(scriptFile);
            scriptFile = Environment.appendScriptName(scriptFile);
            return scriptFile;
        }

        // browser include as ES6 import
        // <script type="module">
        // import * as alphaTab from 'dist/alphaTab.js';
        try {
            // @ts-ignore
            const importUrl = import.meta.url;
            // avoid using file:// urls in case of
            // bundlers like webpack
            if (importUrl && importUrl.indexOf('file://') === -1) {
                return importUrl;
            }
        } catch (e) {
            // ignore potential errors
        }

        // normal browser include as <script>
        if (
            'document' in Environment.globalThis &&
            document.currentScript &&
            document.currentScript instanceof HTMLScriptElement
        ) {
            return document.currentScript.src;
        }

        return null;
    }

    /**
     * @target web
     * @internal
     */
    public static ensureFullUrl(relativeUrl: string | null): string {
        if (!relativeUrl) {
            return '';
        }

        if (!relativeUrl.startsWith('http') && !relativeUrl.startsWith('https') && !relativeUrl.startsWith('file')) {
            let root: string = '';
            const location: Location = Environment.globalThis.location;
            root += location.protocol?.toString();
            root += '//'?.toString();
            if (location.hostname) {
                root += location.hostname?.toString();
            }
            if (location.port) {
                root += ':'?.toString();
                root += location.port?.toString();
            }
            // as it is not clearly defined how slashes are treated in the location object
            // better be safe than sorry here
            if (!relativeUrl.startsWith('/')) {
                const directory: string = location.pathname.split('/').slice(0, -1).join('/');
                if (directory.length > 0) {
                    if (!directory.startsWith('/')) {
                        root += '/'?.toString();
                    }
                    root += directory?.toString();
                }
            }
            if (!relativeUrl.startsWith('/')) {
                root += '/'?.toString();
            }
            root += relativeUrl?.toString();
            return root;
        }
        return relativeUrl;
    }

    private static appendScriptName(url: string): string {
        // append script name
        if (url && !url.endsWith('.js')) {
            if (!url.endsWith('/')) {
                url += '/';
            }
            url += 'alphaTab.js';
        }
        return url;
    }

    /**
     * @target web
     */
    private static detectFontDirectory(): string | null {
        if (!Environment.isRunningInWorker && Environment.globalThis.ALPHATAB_FONT) {
            return Environment.ensureFullUrl(Environment.globalThis.ALPHATAB_FONT);
        }

        const scriptFile = Environment.scriptFile;
        if (scriptFile) {
            const lastSlash: number = scriptFile.lastIndexOf(String.fromCharCode(47));
            if (lastSlash >= 0) {
                return `${scriptFile.substr(0, lastSlash)}/font/`;
            }
        }

        return null;
    }

    /**
     * @target web
     */
    private static registerJQueryPlugin(): void {
        if (!Environment.isRunningInWorker && Environment.globalThis && 'jQuery' in Environment.globalThis) {
            const jquery: any = Environment.globalThis.jQuery;
            const api: JQueryAlphaTab = new JQueryAlphaTab();
            jquery.fn.alphaTab = function (this: any, method: string) {
                // biome-ignore lint/style/noArguments: Legacy jQuery plugin argument forwarding
                const args = Array.prototype.slice.call(arguments, 1);
                // if only a single element is affected, we use this
                if (this.length === 1) {
                    return api.exec(this[0], method, args);
                }
                // if multiple elements are affected we provide chaining
                return this.each((_i: number, e: HTMLElement) => {
                    api.exec(e, method, args);
                });
            };
            jquery.alphaTab = {
                restore: JQueryAlphaTab.restore
            };
            jquery.fn.alphaTab.fn = api;
        }
    }

    public static readonly renderEngines: Map<string, RenderEngineFactory> = Environment.createDefaultRenderEngines();

    /**
     * @internal
     */
    public static readonly layoutEngines: Map<LayoutMode, LayoutEngineFactory> =
        Environment.createDefaultLayoutEngines();

    /**
     * @internal
     */
    public static readonly staveProfiles: Map<StaveProfile, BarRendererFactory[]> =
        Environment.createDefaultStaveProfiles();

    public static getRenderEngineFactory(engine: string): RenderEngineFactory {
        if (!engine || !Environment.renderEngines.has(engine)) {
            return Environment.renderEngines.get('default')!;
        }
        return Environment.renderEngines.get(engine)!;
    }

    /**
     * @internal
     */
    public static getLayoutEngineFactory(layoutMode: LayoutMode): LayoutEngineFactory {
        if (!layoutMode || !Environment.layoutEngines.has(layoutMode)) {
            return Environment.layoutEngines.get(LayoutMode.Page)!;
        }
        return Environment.layoutEngines.get(layoutMode)!;
    }

    /**
     * Gets all default ScoreImporters
     * @returns
     */
    public static buildImporters(): ScoreImporter[] {
        return [
            new Gp3To5Importer(),
            new GpxImporter(),
            new Gp7To8Importer(),
            new MusicXmlImporter(),
            new CapellaImporter(),
            new AlphaTexImporter()
        ];
    }

    private static createDefaultRenderEngines(): Map<string, RenderEngineFactory> {
        const renderEngines = new Map<string, RenderEngineFactory>();
        renderEngines.set(
            'svg',
            new RenderEngineFactory(true, () => {
                return new CssFontSvgCanvas();
            })
        );
        renderEngines.set('default', renderEngines.get('svg')!);

        renderEngines.set(
            'skia',
            new RenderEngineFactory(false, () => {
                return new SkiaCanvas();
            })
        );

        Environment.createPlatformSpecificRenderEngines(renderEngines);
        return renderEngines;
    }

    /**
     * Enables the usage of alphaSkia as rendering backend.
     * @param musicFontData The raw binary data of the music font.
     * @param alphaSkia The alphaSkia module.
     */
    public static enableAlphaSkia(musicFontData: ArrayBuffer, alphaSkia: unknown) {
        SkiaCanvas.enable(musicFontData, alphaSkia);
    }

    /**
     * Registers a new custom font for the usage in the alphaSkia rendering backend.
     * @param fontData The raw binary data of the font.
     * @returns The font info under which the font was registered.
     */
    public static registerAlphaSkiaCustomFont(fontData: Uint8Array): Font {
        return SkiaCanvas.registerFont(fontData);
    }

    /**
     * @target web
     * @partial
     */
    private static createPlatformSpecificRenderEngines(renderEngines: Map<string, RenderEngineFactory>) {
        renderEngines.set(
            'html5',
            new RenderEngineFactory(false, () => {
                return new Html5Canvas();
            })
        );
    }

    private static createDefaultRenderers(): BarRendererFactory[] {
        return [
            //
            // Slash
            new EffectBarRendererFactory(Environment.StaffIdBeforeSlashAlways, [
                new TempoEffectInfo(),
                new TripletFeelEffectInfo(),
                new MarkerEffectInfo(),
                new DirectionsEffectInfo(),
                new AlternateEndingsEffectInfo(),
                new FreeTimeEffectInfo(),
                new TextEffectInfo(),
                new BeatTimerEffectInfo(),
                new ChordsEffectInfo()
            ]),
            // no before-slash-hideable
            new SlashBarRendererFactory(),

            //
            // Score (standard notation)
            new EffectBarRendererFactory(Environment.StaffIdBeforeScoreAlways, [
                new FermataEffectInfo(),
                new BeatBarreEffectInfo(),
                new NoteOrnamentEffectInfo(),
                new RasgueadoEffectInfo(),
                new WahPedalEffectInfo()
            ]),
            new EffectBarRendererFactory(
                Environment.StaffIdBeforeScoreHideable,
                [
                    new WhammyBarEffectInfo(),
                    new TrillEffectInfo(),
                    new OttaviaEffectInfo(true),
                    new WideBeatVibratoEffectInfo(),
                    new SlightBeatVibratoEffectInfo(),
                    new WideNoteVibratoEffectInfo(),
                    new SlightNoteVibratoEffectInfo(false),
                    new LeftHandTapEffectInfo(),
                    new GolpeEffectInfo(GolpeType.Finger)
                ],
                (_, staff) => staff.showStandardNotation
            ),
            new ScoreBarRendererFactory(),

            //
            // Numbered
            new EffectBarRendererFactory(Environment.StaffIdBeforeNumberedAlways, [
                new CrescendoEffectInfo(),
                new OttaviaEffectInfo(false),
                new DynamicsEffectInfo(),
                new GolpeEffectInfo(GolpeType.Thumb, (s, b) => b.voice.bar.staff.showStandardNotation),
                new SustainPedalEffectInfo()
            ]),
            // no before-numbered-hideable
            new NumberedBarRendererFactory(),

            //
            // Tabs
            new EffectBarRendererFactory(Environment.StaffIdBeforeTabAlways, [new LyricsEffectInfo()]),
            new EffectBarRendererFactory(
                Environment.StaffIdBeforeTabHideable,
                [
                    // TODO: whammy line effect
                    new TrillEffectInfo(),
                    new WideBeatVibratoEffectInfo(),
                    new SlightBeatVibratoEffectInfo(),
                    new WideNoteVibratoEffectInfo(),
                    new SlightNoteVibratoEffectInfo(true),
                    new TapEffectInfo(),
                    new FadeEffectInfo(),
                    new HarmonicsEffectInfo(HarmonicType.Natural),
                    new HarmonicsEffectInfo(HarmonicType.Artificial),
                    new HarmonicsEffectInfo(HarmonicType.Pinch),
                    new HarmonicsEffectInfo(HarmonicType.Tap),
                    new HarmonicsEffectInfo(HarmonicType.Semi),
                    new HarmonicsEffectInfo(HarmonicType.Feedback),
                    new LetRingEffectInfo(),
                    new CapoEffectInfo(),
                    new FingeringEffectInfo(),
                    new PalmMuteEffectInfo(),
                    new PickStrokeEffectInfo(),
                    new PickSlideEffectInfo(),
                    new LeftHandTapEffectInfo(),
                    new GolpeEffectInfo(GolpeType.Finger, (s, b) => !b.voice.bar.staff.showStandardNotation)
                ],
                (_, staff) => staff.showTablature
            ),
            new TabBarRendererFactory(),
            new EffectBarRendererFactory(Environment.StaffIdBeforeEndAlways, [
                new GolpeEffectInfo(GolpeType.Thumb, (s, b) => !b.voice.bar.staff.showStandardNotation)
            ])
        ];
    }

    private static createDefaultStaveProfiles(): Map<StaveProfile, BarRendererFactory[]> {
        const staveProfiles = new Map<StaveProfile, BarRendererFactory[]>();

        // the general layout is repeating the same pattern across the different notation staffs:
        // * general effects before notation renderer, shown also if notation renderer is hidden (`before-xxxx-always`)
        // * effects specific to the notation renderer, hidden if the nottation renderer is hidden (`before-xxxx-hideable`)
        // * the notation renderer itself, hidden based on settings (`xxxx`)

        const defaultRenderers = Environment.createDefaultRenderers();
        staveProfiles.set(StaveProfile.Default, defaultRenderers);
        staveProfiles.set(StaveProfile.ScoreTab, defaultRenderers);

        const scoreRenderers = new Set<string>([
            Environment.StaffIdBeforeSlashAlways,
            Environment.StaffIdBeforeScoreAlways,
            Environment.StaffIdBeforeNumberedAlways,
            Environment.StaffIdBeforeTabAlways,
            ScoreBarRenderer.StaffId,
            Environment.StaffIdBeforeEndAlways
        ]);
        staveProfiles.set(
            StaveProfile.Score,
            defaultRenderers.filter(r => scoreRenderers.has(r.staffId))
        );

        const tabRenderers = new Set<string>([
            Environment.StaffIdBeforeSlashAlways,
            Environment.StaffIdBeforeScoreAlways,
            Environment.StaffIdBeforeNumberedAlways,
            Environment.StaffIdBeforeTabAlways,
            TabBarRenderer.StaffId,
            Environment.StaffIdBeforeEndAlways
        ]);
        staveProfiles.set(
            StaveProfile.Tab,
            Environment.createDefaultRenderers().filter(r => {
                if (r instanceof TabBarRendererFactory) {
                    const tab = r as TabBarRendererFactory;
                    tab.showTimeSignature = true;
                    tab.showRests = true;
                    tab.showTiedNotes = true;
                }
                return tabRenderers.has(r.staffId);
            })
        );

        staveProfiles.set(
            StaveProfile.TabMixed,
            Environment.createDefaultRenderers().filter(r => {
                if (r instanceof TabBarRendererFactory) {
                    const tab = r as TabBarRendererFactory;
                    tab.showTimeSignature = false;
                    tab.showRests = false;
                    tab.showTiedNotes = false;
                }
                return tabRenderers.has(r.staffId);
            })
        );

        return staveProfiles;
    }

    private static createDefaultLayoutEngines(): Map<LayoutMode, LayoutEngineFactory> {
        const engines = new Map<LayoutMode, LayoutEngineFactory>();
        // default layout engines
        engines.set(
            LayoutMode.Page,
            new LayoutEngineFactory(true, r => {
                return new PageViewLayout(r);
            })
        );
        engines.set(
            LayoutMode.Horizontal,
            new LayoutEngineFactory(false, r => {
                return new HorizontalScreenLayout(r);
            })
        );
        return engines;
    }

    /**
     * @target web
     */
    public static initializeMain(
        createWebWorker: (settings: Settings) => Worker,
        createAudioWorklet: (context: AudioContext, settings: Settings) => Promise<void>
    ) {
        if (Environment.isRunningInWorker || Environment.isRunningInAudioWorklet) {
            return;
        }

        // browser polyfills
        if (Environment.webPlatform === WebPlatform.Browser || Environment.webPlatform === WebPlatform.BrowserModule) {
            Environment.registerJQueryPlugin();
            Environment.HighDpiFactor = window.devicePixelRatio;
        }

        Environment.createWebWorker = createWebWorker;
        Environment.createAudioWorklet = createAudioWorklet;
    }

    /**
     * @target web
     * @internal
     */
    public static get alphaTabWorker(): any {
        return Environment.globalThis.Worker;
    }

    /**
     * @target web
     * @internal
     */
    public static get alphaTabUrl(): any {
        return Environment.globalThis.URL;
    }

    /**
     * @target web
     */
    public static initializeWorker() {
        if (!Environment.isRunningInWorker) {
            throw new AlphaTabError(
                AlphaTabErrorType.General,
                'Not running in worker, cannot run worker initialization'
            );
        }
        AlphaTabWebWorker.init();
        AlphaSynthWebWorker.init();
        Environment.createWebWorker = _ => {
            throw new AlphaTabError(AlphaTabErrorType.General, 'Nested workers are not supported');
        };
    }

    /**
     * @target web
     */
    public static initializeAudioWorklet() {
        if (!Environment.isRunningInAudioWorklet) {
            throw new AlphaTabError(
                AlphaTabErrorType.General,
                'Not running in audio worklet, cannot run worklet initialization'
            );
        }
        AlphaSynthWebWorklet.init();
    }

    /**
     * @target web
     */
    private static detectWebPack(): boolean {
        try {
            // @ts-ignore
            if (typeof __webpack_require__ === 'function') {
                return true;
            }
        } catch (e) {
            // ignore any errors
        }
        return false;
    }

    /**
     * @target web
     */
    private static detectVite(): boolean {
        try {
            // @ts-ignore
            if (typeof __BASE__ === 'string') {
                return true;
            }
        } catch (e) {
            // ignore any errors
        }
        return false;
    }

    /**
     * @target web
     */
    private static detectWebPlatform(): WebPlatform {
        try {
            // Credit of the node.js detection goes to
            // https://github.com/iliakan/detect-node
            // MIT License
            // Copyright (c) 2017 Ilya Kantor
            // tslint:disable-next-line: strict-type-predicates
            if (Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]') {
                return WebPlatform.NodeJs;
            }
        } catch (e) {
            // no node.js
        }

        try {
            // @ts-ignore
            const url: any = import.meta.url;
            if (url && typeof url === 'string' && !url.startsWith('file://')) {
                return WebPlatform.BrowserModule;
            }
        } catch (e) {
            // no browser module
        }

        return WebPlatform.Browser;
    }

    /**
     * Prints the environment information for easier troubleshooting.
     * @param force Whether to force printing.
     */
    public static printEnvironmentInfo(force: boolean = true) {
        const printer: (message: string) => void = force
            ? message => {
                  Logger.log.debug('VersionInfo', message);
              }
            : message => {
                  Logger.debug('VersionInfo', message);
              };
        VersionInfo.print(printer);
        printer(`High DPI: ${Environment.HighDpiFactor}`);
        Environment.printPlatformInfo(printer);
    }

    /**
     * @target web
     * @partial
     */
    private static printPlatformInfo(print: (message: string) => void) {
        print(`Browser: ${navigator.userAgent}`);
        print(`Platform: ${WebPlatform[Environment.webPlatform]}`);
        print(`WebPack: ${Environment.isWebPackBundled}`);
        print(`Vite: ${Environment.isViteBundled}`);
        if (Environment.webPlatform !== WebPlatform.NodeJs) {
            print(`Window Size: ${window.outerWidth}x${window.outerHeight}`);
            print(`Screen Size: ${window.screen.width}x${window.screen.height}`);
        }
    }

    /**
     * Prepares the given object to be sent to workers. Web Frameworks like Vue might
     * create proxy objects for all objects used. This code handles the necessary unwrapping.
     * @internal
     * @target web
     */
    public static prepareForPostMessage<T>(object: T): T {
        if (!object) {
            return object;
        }

        // Vue toRaw:
        // https://github.com/vuejs/core/blob/e7381761cc7971c0d40ae0a0a72687a500fd8db3/packages/reactivity/src/reactive.ts#L378-L381

        if (typeof object === 'object') {
            const unwrapped = (object as any).__v_raw;
            if (unwrapped) {
                return Environment.prepareForPostMessage(unwrapped);
            }
        }

        // Solidjs unwrap: the symbol required to access the raw object is unfortunately hidden and we cannot unwrap it without importing
        // import { unwrap } from "solid-js/store"
        // alternative for users is to replace this method during runtime. 

        return object;
    }
}


```


```ts
// src/util/FontLoadingChecker.ts
import { type IEventEmitterOfT, EventEmitterOfT } from '@src/EventEmitter';
import { Logger } from '@src/Logger';
import { Environment } from '@src/Environment';

/**
 * This small utility helps to detect whether a particular font is already loaded.
 * @target web
 */
export class FontLoadingChecker {
    private _originalFamilies: string[];
    private _families: string[];

    private _isStarted: boolean = false;
    public isFontLoaded: boolean = false;

    public fontLoaded: IEventEmitterOfT<string> = new EventEmitterOfT<string>();

    public constructor(families: string[]) {
        this._originalFamilies = families;
        this._families = families;
    }

    public checkForFontAvailability(): void {
        if (Environment.isRunningInWorker) {
            // no web fonts in web worker
            this.isFontLoaded = false;
            return;
        }

        if (this._isStarted) {
            return;
        }

        this._isStarted = true;
        let failCounter: number = 0;
        const failCounterId: number = window.setInterval(() => {
            Logger.warning(
                'Rendering',
                `Could not load font '${this._families[0]}' within ${(failCounter + 1) * 5} seconds`,
                null
            );

            // try loading next font if there are more than 1 left
            if (this._families.length > 1) {
                this._families.shift();
                failCounter = 0;
            } else {
                failCounter++;
            }
        }, 5000);

        Logger.debug('Font', `Start checking for font availablility: ${this._families.join(', ')}`);

        const errorHandler = (e: unknown) => {
            if (this._families.length > 1) {
                Logger.debug('Font', `[${this._families[0]}] Loading Failed, switching to ${this._families[1]}`, e);
                this._families.shift();
                window.setTimeout(() => {
                    // tslint:disable-next-line: no-floating-promises
                    checkFont();
                }, 0);
            } else {
                Logger.error('Font', `[${this._originalFamilies.join(',')}] Loading Failed, rendering cannot start`, e);
                window.clearInterval(failCounterId);
            }
        };

        const successHandler = (font: string) => {
            Logger.debug('Font', `[${font}] Font API signaled available`);
            this.isFontLoaded = true;
            window.clearInterval(failCounterId);
            (this.fontLoaded as EventEmitterOfT<string>).trigger(this._families[0]);
        };

        const checkFont = async () => {
            // Fast Path: check if one of the specified fonts is already available.
            for (const font of this._families) {
                if (await this.isFontAvailable(font, false)) {
                    successHandler(font);
                    return;
                }
            }

            // Slow path: Wait for fonts to be loaded sequentially
            try {
                await (document as any).fonts.load(`1em ${this._families[0]}`);
            } catch (e) {
                errorHandler(e);
            }

            Logger.debug('Font', `[${this._families[0]}] Font API signaled loaded`);
            if (await this.isFontAvailable(this._families[0], true)) {
                successHandler(this._families[0]);
            } else {
                errorHandler('Font not available');
            }
            return true;
        };

        (document as any).fonts.ready.then(() => {
            // tslint:disable-next-line: no-floating-promises
            checkFont();
        });
    }

    private isFontAvailable(family: string, advancedCheck: boolean): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            // In some very rare occasions Chrome reports false for the font.
            // in this case we try to force some refresh and reload by creating an element with this font.
            const fontString = `1em ${family}`;
            if ((document as any).fonts.check(fontString)) {
                resolve(true);
            } else if (advancedCheck) {
                Logger.debug('Font', `Font ${family} not available, creating test element to trigger load`);
                const testElement = document.createElement('div');
                testElement.style.font = fontString;
                testElement.style.opacity = '0';
                testElement.style.position = 'absolute';
                testElement.style.top = '0';
                testElement.style.left = '0';
                testElement.innerText = `Trigger ${family} load`;
                document.body.appendChild(testElement);
                setTimeout(() => {
                    document.body.removeChild(testElement);
                    if ((document as any).fonts.check(fontString)) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }, 200);
            } else {
                resolve(false);
            }
        });
    }
}
```
