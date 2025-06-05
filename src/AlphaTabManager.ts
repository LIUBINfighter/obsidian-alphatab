// AlphaTabManager.ts

import * as alphaTab from "@coderline/alphatab";
import {
	model,
	LayoutMode,
	ScrollMode,
	type AlphaTabApi,
	type Settings,
	type Score,
	type Track,
	WebPlatform, // Keep this for environment override
} from "@coderline/alphatab";
// REMOVE: fs and path are no longer needed for AlphaTab's resource loading via URL
// import * as fs from "fs";
// import * as path from "path";
import { Notice, TFile, App } from "obsidian";

export interface AlphaTabManagerOptions {
	pluginInstance: any; // Your main plugin class instance
	app: App;
	mainElement: HTMLElement; // The element where AlphaTab will render
	viewportElement: HTMLElement; // Element for player scroll, if any
	onError?: (args: any) => void;
	onRenderStarted?: (isReload: boolean, canRender: boolean) => void; // Adjusted signature
	onRenderFinished?: () => void;
	onScoreLoaded?: (score: Score | null) => void;
	onPlayerStateChanged?: (args: any) => void;
	// Add other specific event handlers if needed
	onFontLoaded?: (name: string, family: string) => void;
	onSoundFontLoaded?: () => void;
	onPlayerReady?: () => void;
	onReady?: () => void;
}

export class AlphaTabManager {
	public api: AlphaTabApi | null = null;
	public score: Score | null = null;
	public settings!: Settings;
	private pluginInstance: any;
	private app: App;
	private mainElement: HTMLElement;
	private viewportElement: HTMLElement;
	private eventHandlers: AlphaTabManagerOptions;
	private renderTracks: Track[] = [];
	private renderWidth = 800;
	private darkMode: boolean = false;

	constructor(options: AlphaTabManagerOptions) {
		this.pluginInstance = options.pluginInstance;
		this.app = options.app;
		this.mainElement = options.mainElement;
		this.viewportElement = options.viewportElement;
		this.eventHandlers = options;

		if (
			!this.pluginInstance ||
			!this.pluginInstance.manifest ||
			!this.pluginInstance.manifest.dir
		) {
			const errorMsg =
				"[AlphaTabManager] CRITICAL - pluginInstance.manifest.dir is not available. Cannot construct resource paths.";
			console.error(errorMsg);
			this.eventHandlers.onError?.({
				message: "插件清单信息不完整，无法构建资源路径。",
			});
			// Consider throwing an error here to stop further execution if this is fatal
		}
	}

	setDarkMode(isDark: boolean) {
		this.darkMode = isDark;
		if (this.api && this.settings) {
			const themeColors = isDark
				? {
						scoreColor: "rgba(236, 236, 236, 1)", // Example: Lighter score elements on dark background
						selectionColor: "rgba(80, 130, 180, 0.7)",
						barSeparatorColor: "rgba(200, 200, 200, 0.7)",
						staffLineColor: "rgba(200, 200, 200, 1)",
						// ... other dark theme specific colors from AlphaTab docs ...
				  }
				: {
						scoreColor: "rgba(0, 0, 0, 1)",
						selectionColor: "rgba(0, 120, 255, 0.5)",
						barSeparatorColor: "rgba(0, 0, 0, 0.2)",
						staffLineColor: "rgba(0, 0, 0, 1)",
						// ... other light theme specific colors ...
				  };
			Object.assign(this.settings.display.resources, themeColors);
			this.api.settings = this.settings; // Re-assign settings
			this.api.render(); // Re-render with new colors
		}
	}

	async initializeAndLoadScore(file: TFile) {
		if (this.api) {
			try {
				this.api.destroy();
			} catch (e) {
				console.error(
					"[AlphaTabManager] Error destroying previous API:",
					e
				);
			}
			this.api = null;
		}
		this.score = null;
		this.renderTracks = [];

		this.renderWidth = Math.max(this.mainElement?.clientWidth || 800, 300);

		this.settings = new alphaTab.Settings();
		this.settings.core.engine = "svg"; // Or "html5" (canvas)
		this.settings.core.enableLazyLoading = true;

		// --- NEW: Construct resource URLs using Obsidian API ---
		const pluginManifestDir = this.pluginInstance.manifest.dir;
		if (!pluginManifestDir) {
			const criticalErrorMsg =
				"[AlphaTabManager] CRITICAL - pluginInstance.manifest.dir is undefined. Cannot load resources.";
			console.error(criticalErrorMsg);
			this.eventHandlers.onError?.({
				message: "无法获取插件目录，资源加载将失败。",
			});
			return; // Stop further execution
		}
		console.log(
			`[AlphaTabManager] Plugin manifest directory: ${pluginManifestDir}`
		);

		// 1. Font Directory URL
		const fontAssetDirSuffix = "/assets/alphatab/font/"; // 保持你原来的正确路径
		const fontAssetObsidianPath = `${pluginManifestDir}${fontAssetDirSuffix}`;
		try {
			const fontDirectoryURL = this.app.vault.adapter.getResourcePath(
				fontAssetObsidianPath
			);
			this.settings.core.fontDirectory = fontDirectoryURL;
			console.log(
				`[AlphaTabManager] Settings: core.fontDirectory = ${fontDirectoryURL}`
			);
		} catch (e) {
			console.error(
				`[AlphaTabManager] Error getting resource path for font directory '${fontAssetObsidianPath}':`,
				e
			);
			this.eventHandlers.onError?.({
				message: `字体目录资源路径获取失败: ${fontAssetObsidianPath}`,
			});
		}

		// --- START: 新增 Main Script File 检查 ---
		const mainScriptFileSuffix = "/assets/alphatab/alphatab.js"; // 按实际文件名调整
		const mainScriptAssetObsidianPath = pluginManifestDir + mainScriptFileSuffix;
		if (await this.app.vault.adapter.exists(mainScriptAssetObsidianPath)) {
			const mainScriptURL = this.app.vault.adapter.getResourcePath(mainScriptAssetObsidianPath);
			this.settings.core.scriptFile = mainScriptURL;
			console.log(`[AlphaTabManager] Settings: core.scriptFile = ${mainScriptURL}`);
		} else {
			this.settings.core.scriptFile = null;
			const scriptFileErrorMsg = `[AlphaTabManager] CRITICAL: Main AlphaTab script file not found at '${mainScriptAssetObsidianPath}'. Worker initialization will likely fail.`;
			console.error(scriptFileErrorMsg);
			this.eventHandlers.onError?.({ message: `AlphaTab主脚本文件未找到: ${mainScriptAssetObsidianPath}，WebWorker可能无法启动。` });
			// 可选：this.settings.core.useWorkers = false;
		}
		// --- END: 新增 Main Script File 检查 ---

		// 2. Worker File URL
		const workerFileSuffix = "/assets/alphatab/alphaTab.worker.mjs";
		const workerAssetObsidianPath = pluginManifestDir + workerFileSuffix;
		if (await this.app.vault.adapter.exists(workerAssetObsidianPath)) {
			if (this.settings.core.scriptFile) {
				const workerFileURL = this.app.vault.adapter.getResourcePath(
					workerAssetObsidianPath
				);
				this.settings.core.workerFile = workerFileURL;
				this.settings.core.useWorkers = true;
				console.log(
					`[AlphaTabManager] Settings: core.workerFile = ${workerFileURL}, useWorkers = true`
				);
			} else {
				this.settings.core.useWorkers = false;
				console.warn(`[AlphaTabManager] Main script file for AlphaTab not found. Disabling WebWorkers even if worker file exists.`);
			}
		} else {
			this.settings.core.useWorkers = false;
			console.warn(
				`[AlphaTabManager] Worker file not found at '${workerAssetObsidianPath}'. Disabling workers.`
			);
		}

		// 4. SoundFont URL
		const soundFontFileSuffix = "/assets/alphatab/soundfont/sonivox.sf2"; // 按实际文件名调整
		const soundFontAssetObsidianPath = pluginManifestDir + soundFontFileSuffix;
		if (await this.app.vault.adapter.exists(soundFontAssetObsidianPath)) {
			if (this.settings.core.useWorkers) {
				const soundFontURL = this.app.vault.adapter.getResourcePath(
					soundFontAssetObsidianPath
				);
				this.settings.player.soundFont = soundFontURL;
				this.settings.player.enablePlayer = true;
				console.log(
					`[AlphaTabManager] Settings: player.soundFont = ${soundFontURL}, enablePlayer = true`
				);
			} else {
				this.settings.player.enablePlayer = false;
				console.warn(`[AlphaTabManager] WebWorkers are disabled, so SoundFont player is also disabled.`);
			}
		} else {
			this.settings.player.enablePlayer = false;
			console.warn(
				`[AlphaTabManager] SoundFont file not found at '${soundFontAssetObsidianPath}'. Disabling player.`
			);
		}

		// CRITICAL: Ensure smuflFontSources is null to force fontDirectory usage.
		this.settings.core.smuflFontSources = null;

		// Display and Player settings
		this.settings.display.scale = 0.8;
		this.settings.display.layoutMode = LayoutMode.Page; // Or Horizontal
		this.settings.player.enableCursor = true;
		this.settings.player.scrollMode = ScrollMode.Continuous; // Or Off, Page
		this.settings.player.scrollElement = this.viewportElement; // Ensure this is a valid scrollable element
		this.settings.player.scrollOffsetY = -30; // Adjust as needed

		// Apply theme colors (initial setup)
		const initialThemeColors = this.darkMode
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
		Object.assign(this.settings.display.resources, initialThemeColors);

		console.log(
			"[AlphaTabManager] Final AlphaTab Settings prepared:",
			JSON.parse(JSON.stringify(this.settings))
		); // Deep copy for logging

		// Environment hack (KEEP THIS SECTION)
		let originalProcess: any, originalModule: any;
		let modifiedGlobals = false;
		try {
			// @ts-ignore
			if (typeof process !== "undefined") {
				originalProcess = globalThis.process;
				// @ts-ignore
				globalThis.process = undefined;
				modifiedGlobals = true;
			}
			// @ts-ignore
			if (typeof module !== "undefined") {
				originalModule = globalThis.module;
				// @ts-ignore
				globalThis.module = undefined;
				modifiedGlobals = true;
			}

			// @ts-ignore
			if (alphaTab.Environment && typeof WebPlatform !== "undefined") {
				// @ts-ignore
				alphaTab.Environment.webPlatform = WebPlatform.Browser;
				console.log(
					"[AlphaTabManager] Environment.webPlatform overridden to Browser."
				);
			} else {
				console.warn(
					"[AlphaTabManager] alphaTab.Environment or WebPlatform not available for overriding."
				);
			}

			// --- ALL MONKEY PATCHING AND MANUAL FONT INJECTION IS REMOVED ---

			console.log(
				"[AlphaTabManager] Initializing AlphaTabApi with new settings..."
			);
			// Ensure the mainElement has dimensions. AlphaTab might not render if container is 0x0.
			if (
				this.mainElement.clientWidth === 0 ||
				this.mainElement.clientHeight === 0
			) {
				console.warn(
					"[AlphaTabManager] mainElement has zero width or height. AlphaTab might not render correctly. Ensure it's visible and sized."
				);
				// You might want to set a default style if it's not managed elsewhere
				// this.mainElement.style.width = '100%';
				// this.mainElement.style.height = '600px'; // A default height
			}

			this.api = new alphaTab.AlphaTabApi(
				this.mainElement,
				this.settings
			);
			console.log("[AlphaTabManager] AlphaTabApi instantiated.");

			this.bindEvents(); // Bind all event handlers
		} catch (e: any) {
			console.error(
				"[AlphaTabManager] FAILED to initialize AlphaTab API. Error:",
				e.message,
				e.stack,
				e
			);
			this.eventHandlers.onError?.({
				message: `AlphaTab API 初始化失败: ${e.message}`,
			});
		} finally {
			if (modifiedGlobals) {
				if (originalProcess !== undefined)
					globalThis.process = originalProcess;
				if (originalModule !== undefined)
					globalThis.module = originalModule;
				console.log(
					"[AlphaTabManager] Globals (process, module) restored."
				);
			}
		}

		if (!this.api) {
			console.error(
				"[AlphaTabManager] API not initialized after attempt."
			);
			this.eventHandlers.onError?.({
				message: "AlphaTab API未能成功初始化。",
			});
			return;
		}

		try {
			const scoreData = await this.app.vault.readBinary(file);
			console.log(
				`[AlphaTabManager] Read ${scoreData.byteLength} bytes for score ${file.name}. Loading into AlphaTab...`
			);
			// AlphaTab's load method expects a Uint8Array or similar binary format
			await this.api.load(new Uint8Array(scoreData));
			console.log(
				`[AlphaTabManager] Score loading initiated for ${file.name}. Waiting for scoreLoaded event.`
			);
		} catch (e: any) {
			console.error(
				`[AlphaTabManager] Error loading score data for ${file.path}:`,
				e.message,
				e.stack,
				e
			);
			this.eventHandlers.onError?.({
				message: `乐谱文件加载失败: ${e.message}`,
			});
		}
	}

	private bindEvents() {
		if (!this.api) return;

		// Using optional chaining for safety, though eventHandlers should provide them
		if (this.eventHandlers.onError)
			this.api.error.on(this.eventHandlers.onError);
		if (this.eventHandlers.onRenderStarted)
			this.api.renderStarted.on(this.eventHandlers.onRenderStarted);
		if (this.eventHandlers.onRenderFinished)
			this.api.renderFinished.on(this.eventHandlers.onRenderFinished);

		if (this.eventHandlers.onScoreLoaded || true) {
			// Always handle scoreLoaded internally too
			this.api.scoreLoaded.on((score: Score | null) => {
				this.score = score;
				if (score && score.tracks && score.tracks.length > 0) {
					this.renderTracks = [score.tracks[0]]; // Default to rendering the first track
				} else {
					this.renderTracks = [];
				}
				console.log(
					"[AlphaTabManager] Score loaded event. Score:",
					score ? score.title : "null",
					"Tracks available:",
					score?.tracks?.length
				);
				this.eventHandlers.onScoreLoaded?.(score); // Call external handler
			});
		}

		if (this.eventHandlers.onPlayerStateChanged)
			this.api.playerStateChanged.on(
				this.eventHandlers.onPlayerStateChanged
			);

		// Detailed logging for resource loading events from AlphaTab
		if (this.eventHandlers.onFontLoaded || true) {
			this.api.fontLoaded.on((name: string, family: string) => {
				console.log(
					`[AlphaTabManager] AlphaTab FONT_LOADED event: Name='${name}', Family='${family}'`
				);
				this.eventHandlers.onFontLoaded?.(name, family);
			});
		}
		if (this.eventHandlers.onSoundFontLoaded || true) {
			this.api.soundFontLoaded.on(() => {
				console.log(
					"[AlphaTabManager] AlphaTab SOUNDFONT_LOADED event."
				);
				this.eventHandlers.onSoundFontLoaded?.();
			});
		}
		if (this.eventHandlers.onPlayerReady || true) {
			this.api.playerReady.on(() => {
				console.log("[AlphaTabManager] AlphaTab PLAYER_READY event.");
				this.eventHandlers.onPlayerReady?.();
			});
		}
		if (this.eventHandlers.onReady || true) {
			this.api.ready.on(() => {
				// General readiness
				console.log(
					"[AlphaTabManager] AlphaTab READY event (general API readiness)."
				);
				this.eventHandlers.onReady?.();
			});
		}
	}

	playPause() {
		if (!this.api) return;
		if (this.settings.player.enablePlayer) {
			this.api.playPause();
		} else {
			console.warn(
				"[AlphaTabManager] Player is not enabled, cannot play/pause."
			);
			new Notice("播放器未启用 (可能未找到SoundFont)");
		}
	}
	stop() {
		if (!this.api) return;
		if (this.settings.player.enablePlayer) {
			this.api.stop();
		} else {
			console.warn(
				"[AlphaTabManager] Player is not enabled, cannot stop."
			);
		}
	}

	public updateRenderTracks(tracks: Track[]) {
		if (!this.api) return;
		this.renderTracks = tracks;
		this.api.renderTracks(tracks);
		// api.render() is usually called automatically after renderTracks or if settings change.
		// If not, you might need to call this.api.render();
	}

	public getAllTracks(): Track[] {
		return this.score?.tracks || [];
	}

	public getSelectedRenderTracks(): Track[] {
		return this.renderTracks;
	}

	render() {
		this.api?.render();
	}

	destroy() {
		this.api?.destroy();
		this.api = null;
		this.score = null;
		this.renderTracks = [];
		console.log("[AlphaTabManager] AlphaTab API destroyed.");
	}

	// --- All manual font injection, preloading, and patching methods are REMOVED ---
	// private injectBravuraFontFace(...) { /* REMOVED */ }
	// private preloadBravuraFont(...) { /* REMOVED */ }
	// private tryFindAndPatchFontMethods(...) { /* REMOVED */ }
}
