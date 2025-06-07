// ITabManager.ts

import * as alphaTab from "@coderline/alphatab";
import {
	type AlphaTabApi,
	type Settings,
} from "@coderline/alphatab";
import { Notice, TFile, App } from "obsidian";

import { ITabManagerOptions } from "./types";
import { FontManager } from "./alphatab/FontManager";
import { AlphaTabSettingsHelper } from "./alphatab/AlphaTabSettingsHelper";
import { AlphaTabEventBinder } from "./alphatab/AlphaTabEventBinder";
import { initializeAndLoadScore } from "./alphatab/initializeAndLoadScore";

export class ITabManager {
	private pluginInstance: any;
	private app: App;
	private mainElement: HTMLElement;
	private viewportElement: HTMLElement;
	private eventHandlers: ITabManagerOptions;
	private settings: Settings;

	public api: AlphaTabApi | null = null;
	public score: alphaTab.model.Score | null = null;
	private renderTracks: alphaTab.model.Track[] = [];
	private renderWidth = 800;
	private darkMode = false;
	public static readonly FONT_STYLE_ELEMENT_ID =
		"alphatab-manual-font-styles";

	constructor(options: ITabManagerOptions) {
		this.pluginInstance = options.pluginInstance;
		this.app = options.app;
		this.mainElement = options.mainElement;
		this.viewportElement = options.viewportElement;
		this.eventHandlers = options;

		if (!this.pluginInstance?.manifest?.dir) {
			const errorMsg = "[AlphaTab] CRITICAL - pluginInstance.manifest.dir is not available.";
			console.error(errorMsg);
			this.eventHandlers.onError?.({
				message: "插件清单信息不完整，无法构建资源路径。",
			});
		}
	}

	// 新增接口方法
	public getMainElement() {
		return this.mainElement;
	}
	public getApp() {
		return this.app;
	}
	public getPluginInstance() {
		return this.pluginInstance;
	}
	public getEventHandlers() {
		return this.eventHandlers;
	}
	public getSettings() {
		return this.settings;
	}
	public setSettings(settings: Settings) {
		this.settings = settings;
	}
	public getRenderTracks() {
		return this.renderTracks;
	}
	public setRenderTracks(tracks: alphaTab.model.Track[]) {
		this.renderTracks = tracks;
	}
	public getRenderWidth() {
		return this.renderWidth;
	}
	public setRenderWidth(width: number) {
		this.renderWidth = width;
	}
	public getDarkMode() {
		return this.darkMode;
	}
	public setDarkModeFlag(flag: boolean) {
		this.darkMode = flag;
	}

	setDarkMode(isDark: boolean) {
		this.darkMode = isDark;
		if (this.api && this.settings) {
			const themeColors = isDark
				? {
						scoreColor: "rgba(236, 236, 236, 1)",
						selectionColor: "rgba(80, 130, 180, 0.7)",
						barSeparatorColor: "rgba(200, 200, 200, 0.7)",
						staffLineColor: "rgba(200, 200, 200, 1)",
                  }
				: {
						scoreColor: "rgba(0, 0, 0, 1)",
						selectionColor: "rgba(0, 120, 255, 0.5)",
						barSeparatorColor: "rgba(0, 0, 0, 0.2)",
						staffLineColor: "rgba(0, 0, 0, 1)",
                  };
			Object.assign(this.settings.display.resources, themeColors);
			this.api.settings = this.settings; // Re-apply settings
			this.api.render();
		}
	}

	public getAbsolutePath(relativePath: string): string {
		return AlphaTabSettingsHelper.getAbsolutePath(this.app, this.pluginInstance.manifest.dir, relativePath);
	}
	public injectFontFaces(fontData: Record<string, string>): boolean {
		return FontManager.injectFontFaces(fontData, ["Bravura", "alphaTab"]);
	}
	public removeInjectedFontFaces() {
		FontManager.removeInjectedFontFaces();
	}
	public triggerFontPreload(fontFamilies: string[]) {
		const fontUrl = this.settings.core.fontDirectory + 'Bravura.woff2';
		FontManager.triggerFontPreload(fontFamilies, fontUrl);
	}

	async initializeAndLoadScore(file: TFile) {
		return initializeAndLoadScore(this, file);
	}

	private bindEvents() {
		AlphaTabEventBinder.bind(
			this.api,
			this.eventHandlers,
			(score) => { this.score = score; },
			(tracks) => { this.renderTracks = tracks; }
		);
	}

	// ... other methods ...
	playPause() {
		if (!this.api || !this.settings.player.enablePlayer) {
			new Notice("播放器当前已禁用");
			return;
		}
		this.api.playPause();
	}
	stop() {
		if (this.api && this.settings.player.enablePlayer) this.api.stop();
		else console.warn("Player disabled");
	}
	public updateRenderTracks(tracks: alphaTab.model.Track[]) {
		if (this.api) this.api.renderTracks(tracks);
	}
	public getAllTracks(): alphaTab.model.Track[] {
		return this.score?.tracks || [];
	}
	public getSelectedRenderTracks(): alphaTab.model.Track[] {
		return this.renderTracks;
	}
	render() {
		if (this.api) this.api.render();
	}
	destroy() {
		if (this.api) {
			this.api.destroy();
			this.api = null;
		}
		console.log("[ITabManager] Destroyed.");
	}
}
export type { ITabManagerOptions };

