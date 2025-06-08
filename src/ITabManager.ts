// ITabManager.ts

import * as alphaTab from "@coderline/alphatab";
import {
	type AlphaTabApi,
	type Settings,
} from "@coderline/alphatab";
import { TFile, App } from "obsidian";

import { ITabManagerOptions } from "./types";
import { FontManager } from "./alphatab/FontManager";
import { AlphaTabSettingsHelper } from "./alphatab/AlphaTabSettingsHelper";
import { AlphaTabEventBinder } from "./alphatab/AlphaTabEventBinder";
import { initializeAndLoadScore } from "./alphatab/initializeAndLoadScore";
import { getObsidianThemeColors, applyThemeColorsToScore } from "./alphatab/ThemeAdapter";

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
		if (!this.api || !this.settings || !this.score) return;

		// 获取 Obsidian 主题色
		const theme = getObsidianThemeColors();
		// 同步基础资源色到 AlphaTab settings
		Object.assign(this.settings.display.resources, {
			scoreColor: theme.textColor,
			selectionColor: theme.textAccent,
			barSeparatorColor: theme.barLineColor,
			staffLineColor: theme.staffLineColor,
		});
		this.api.settings = this.settings;

		// 应用到模型，随后重新渲染
		applyThemeColorsToScore(this.score, theme);
		this.api.render();
	}

	/**
	 * 新增方法：读取 Obsidian 主题颜色并应用到当前乐谱
	 */
	public applyThemeColorsToScore(): void {
		if (!this.api || !this.score) {
			// 如果乐谱尚未加载，则不执行任何操作
			return;
		}
		try {
			const obsidianColors = getObsidianThemeColors();
			applyThemeColorsToScore(this.score, obsidianColors);
			// 应用颜色后必须重新渲染才能生效
			this.api.render();
		} catch (e) {
			console.error("[ITabManager] Failed to apply theme colors:", e);
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
			// 替换全局 Notice 为错误回调
			if (this.eventHandlers.onError) {
				this.eventHandlers.onError({
					message: "播放器当前已禁用"
				});
			} else {
				console.warn("播放器当前已禁用");
			}
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
		console.debug("[ITabManager] Destroyed.");
	}

	/**
	 * 从 AlphaTex 字符串加载乐谱
	 */
	async loadFromAlphaTexString(alphaTexContent: string): Promise<void> {
		if (!this.api) {
			throw new Error("AlphaTab API 未初始化");
		}

		try {
			// 使用 AlphaTab API 从字符串加载
			this.api.tex(alphaTexContent);
		} catch (error) {
			console.error("[ITabManager] 从 AlphaTex 字符串加载失败:", error);
			throw error;
		}
	}

	/**
	 * 初始化 AlphaTab API（用于 TexEditor）
	 */
	async initializeForTexEditor(): Promise<void> {
		if (!this.pluginInstance.actualPluginDir) {
			throw new Error("插件错误：根路径未配置，无法初始化 AlphaTab。");
		}

		// 复用 initializeAndLoadScore 的初始化逻辑，但不加载文件
		const { initializeAndLoadScore } = await import("./alphatab/initializeAndLoadScore");
		
		// 创建一个临时的假文件对象来触发初始化
		const fakeFile = {
			path: "temp.alphatex",
			name: "temp.alphatex",
			extension: "alphatex"
		} as any;

		// 备份原始的 vault.readBinary 方法
		const originalReadBinary = this.app.vault.readBinary;
		
		try {
			// 临时替换 readBinary 方法，防止实际读取文件
			this.app.vault.readBinary = async () => {
				throw new Error("Skip file loading for TexEditor");
			};

			// 调用初始化逻辑（会在文件加载时失败，但 API 已初始化）
			await initializeAndLoadScore(this, fakeFile);
		} catch (error) {
			// 忽略文件加载错误，这是预期的
			if (!error.message.includes("Skip file loading")) {
				console.error("[ITabManager] 初始化过程中出现意外错误:", error);
				throw error;
			}
		} finally {
			// 恢复原始的 readBinary 方法
			this.app.vault.readBinary = originalReadBinary;
		}

		if (!this.api) {
			throw new Error("AlphaTab API 初始化失败");
		}

		console.debug("[ITabManager] AlphaTab API 已为 TexEditor 初始化完成");
	}

	/**
	 * 从 AlphaTex 文本内容初始化并加载乐谱
	 */
	async initializeAndLoadFromTex(texContent: string): Promise<void> {
		try {
			// 确保 API 已初始化
			if (!this.api) {
				// 使用正确的初始化方法
				await this.initializeForTexEditor();
			}
			
			if (!this.api) {
				throw new Error("无法初始化 AlphaTab API");
			}
			
			// 渲染 AlphaTex 内容
			this.api.tex(texContent);
			
			// 通知加载成功
			if (this.eventHandlers.onScoreLoaded && this.api.score) {
				this.score = this.api.score;
				this.eventHandlers.onScoreLoaded(this.score);
			}
		} catch (error) {
			console.error("[ITabManager] AlphaTex 渲染失败:", error);
			if (this.eventHandlers.onError) {
				this.eventHandlers.onError(error);
			}
			throw error;
		}
	}
}
export type { ITabManagerOptions };

