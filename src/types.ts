import * as alphaTab from "@coderline/alphatab";
import { App } from "obsidian";

export interface ITabManagerOptions {
	pluginInstance: any;
	app: App;
	mainElement: HTMLElement;
	viewportElement: HTMLElement;
	onError?: (args: any) => void;
	onRenderStarted?: (isReload: boolean, canRender: boolean) => void;
	onRenderFinished?: () => void;
	onScoreLoaded?: (score: alphaTab.model.Score | null) => void;
	onPlayerStateChanged?: (args: any) => void;
	onPlayerPositionChanged?: (args: { currentTime: number; endTime: number; currentTick: number; endTick: number }) => void;
	onFontLoaded?: (name: string, family: string) => void;
	onSoundFontLoaded?: () => void;
	onPlayerReady?: () => void;
	onReady?: () => void;
}

export type PlayerStateChangedEventArgs = any;
