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
	WebPlatform,
	LogLevel, // Import LogLevel
} from "@coderline/alphatab";
import { Notice, TFile, App } from "obsidian";

export interface AlphaTabManagerOptions {
	pluginInstance: any;
	app: App;
	mainElement: HTMLElement;
	viewportElement: HTMLElement;
	onError?: (args: any) => void;
	onRenderStarted?: (isReload: boolean, canRender: boolean) => void;
	onRenderFinished?: () => void;
	onScoreLoaded?: (score: Score | null) => void;
	onPlayerStateChanged?: (args: any) => void;
	onFontLoaded?: (name: string, family: string) => void; // For external handler
	onSoundFontLoaded?: () => void; // For external handler
	onPlayerReady?: () => void; // For external handler
	onReady?: () => void; // For external handler
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

		// @ts-ignore
		console.log(
			`[AlphaTabManager] Initializing with AlphaTab library version: ${
				alphaTab.version || "unknown"
			}`
		);
		if (!this.pluginInstance?.manifest?.dir) {
			const errorMsg =
				"[AlphaTabManager] CRITICAL - pluginInstance.manifest.dir is not available.";
			console.error(errorMsg);
			this.eventHandlers.onError?.({
				message: "插件清单信息不完整，无法构建资源路径。",
			});
		}
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
			this.api.settings = this.settings;
			this.api.render();
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
		this.settings.core.engine = "svg";
		this.settings.core.enableLazyLoading = true;
		this.settings.core.logLevel = LogLevel.Debug; // Enable AlphaTab's verbose logging

		// --- Configuration for Non-Worker Font Debugging ---
		this.settings.core.useWorkers = false; // Force disable workers for font debugging
		this.settings.core.workerFile = null;
		this.settings.player.enablePlayer = false; // Disable player as it often relies on workers
		this.settings.player.soundFont = null;
		console.log(
			"[AlphaTabManager] FONT DEBUG MODE: Workers and Player are forcibly disabled."
		);
		// --- End Configuration ---

		const pluginManifestDir = this.pluginInstance.manifest.dir;
		if (!pluginManifestDir) {
			console.error(
				"[AlphaTabManager] CRITICAL - pluginInstance.manifest.dir is undefined."
			);
			this.eventHandlers.onError?.({
				message: "无法获取插件目录，资源加载将失败。",
			});
			return;
		}
		console.log(
			`[AlphaTabManager] Plugin manifest directory: ${pluginManifestDir}`
		);

		// 1. Main AlphaTab Script File URL (core.scriptFile)
		// Use the UMD version 'alphatab.js' for broader compatibility in non-module worker scenarios,
		// or if AlphaTab uses it to determine a base path for other non-font resources.
		const mainScriptFileSuffix = "/assets/alphatab/alphatab.js"; // Assuming UMD version
		const mainScriptAssetObsidianPath =
			pluginManifestDir + mainScriptFileSuffix;
		if (await this.app.vault.adapter.exists(mainScriptAssetObsidianPath)) {
			const mainScriptURL = this.app.vault.adapter.getResourcePath(
				mainScriptAssetObsidianPath
			);
			this.settings.core.scriptFile = mainScriptURL;
			console.log(
				`[AlphaTabManager] Settings: core.scriptFile = ${mainScriptURL}`
			);
		} else {
			this.settings.core.scriptFile = null;
			console.error(
				`[AlphaTabManager] Main AlphaTab script (alphatab.js) NOT FOUND at '${mainScriptAssetObsidianPath}'. This might affect resource discovery.`
			);
		}

		// 2. Font Directory URL (core.fontDirectory)
		const fontAssetDirSuffix = "/assets/alphatab/font/";
		const fontAssetObsidianPath = `${pluginManifestDir}${fontAssetDirSuffix}`;
		// Assuming the path itself is valid as per your file structure.
		// getResourcePath doesn't validate existence, but Obsidian's loader will later.
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
			this.settings.core.fontDirectory = null; // Fallback
		}

		// CRITICAL: Ensure smuflFontSources is null to force fontDirectory usage.
		this.settings.core.smuflFontSources = null;

		// Display and Player settings
		this.settings.display.scale = 0.8;
		this.settings.display.layoutMode = LayoutMode.Page;
		// ... other display/player settings if needed for non-player mode

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
			"[AlphaTabManager] Final AlphaTab Settings prepared (Font Debug Mode):",
			JSON.parse(JSON.stringify(this.settings))
		);

		// Environment hack (KEEP THIS SECTION)
		let originalProcess: any, originalModule: any;
		let modifiedGlobals = false;
		try {
			// @ts-ignore
			if (typeof process !== "undefined") {
				originalProcess = globalThis.process;
				globalThis.process = undefined;
				modifiedGlobals = true;
			}
			// @ts-ignore
			if (typeof module !== "undefined") {
				originalModule = globalThis.module;
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

			console.log(
				"[AlphaTabManager] Initializing AlphaTabApi (Font Debug Mode)..."
			);

			// ENSURE mainElement HAS DIMENSIONS IN THE CALLING CODE (e.g., TabView)
			if (
				this.mainElement.clientWidth === 0 ||
				this.mainElement.clientHeight === 0
			) {
				console.warn(
					"[AlphaTabManager] mainElement has zero width or height. This MUST be fixed in the calling View. Rendering might fail or be invisible."
				);
			}

			this.api = new alphaTab.AlphaTabApi(
				this.mainElement,
				this.settings
			);
			console.log(
				"[AlphaTabManager] AlphaTabApi instantiated. API object:",
				this.api
			);

			// ---- Detailed check of API event emitters ----
			if (this.api) {
				const eventNames = [
					"error",
					"renderStarted",
					"renderFinished",
					"scoreLoaded",
					"playerStateChanged",
					"fontLoaded",
					"soundFontLoaded",
					"playerReady",
					"ready",
				];
				console.log(
					"[AlphaTabManager] Checking API event emitters (Font Debug Mode):"
				);
				eventNames.forEach((eventName) => {
					// @ts-ignore
					const emitter = this.api[eventName];
					if (emitter && typeof emitter.on === "function") {
						console.log(
							`[AlphaTabManager] ✅ this.api.${eventName} seems OK (has .on method).`
						);
					} else {
						console.error(
							`[AlphaTabManager] ❌ this.api.${eventName} is MISSING or not an event emitter. Value:`,
							emitter
						);
					}
				});
			} else {
				console.error(
					"[AlphaTabManager] CRITICAL: this.api is null/undefined AFTER instantiation attempt!"
				);
			}
			// ---- End check ----

			this.bindEvents();
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
		if (!this.api) {
			console.error(
				"[AlphaTabManager] bindEvents called, but this.api is null."
			);
			return;
		}
		console.log(
			"[AlphaTabManager] Attempting to bind events. API object:",
			this.api
		);

		const safeBind = (
			eventName: string,
			handler?: (...args: any[]) => void
		) => {
			// @ts-ignore
			const emitter = this.api![eventName];
			if (emitter && typeof emitter.on === "function") {
				if (handler) {
					emitter.on(handler);
					console.log(
						`[AlphaTabManager] Successfully bound handler for '${eventName}'.`
					);
				} else {
					emitter.on((...args: unknown[]) => {
						// Default logger
						console.log(
							`[AlphaTabManager] Event '${eventName}' fired with args:`,
							args
						);
					});
					console.log(
						`[AlphaTabManager] Bound default logger for '${eventName}'.`
					);
				}
			} else {
				// Log error but don't stop other bindings
				console.error(
					`[AlphaTabManager] FAILED to bind event '${eventName}'. Emitter is missing or invalid:`,
					emitter
				);
			}
		};

		safeBind("error", this.eventHandlers.onError);
		safeBind("renderStarted", this.eventHandlers.onRenderStarted);
		safeBind("renderFinished", this.eventHandlers.onRenderFinished);

		// Special handling for scoreLoaded to update internal state
		// @ts-ignore
		const scoreLoadedEmitter = this.api!.scoreLoaded;
		if (scoreLoadedEmitter && typeof scoreLoadedEmitter.on === "function") {
			scoreLoadedEmitter.on((score: Score | null) => {
				this.score = score;
				if (score?.tracks?.length) {
					this.renderTracks = [score.tracks[0]];
				} else {
					this.renderTracks = [];
				}
				console.log(
					"[AlphaTabManager] Internal scoreLoaded handler. Score:",
					score ? score.title : "null",
					"Tracks:",
					score?.tracks?.length
				);
				this.eventHandlers.onScoreLoaded?.(score);
			});
			console.log(
				`[AlphaTabManager] Successfully bound handler for 'scoreLoaded'.`
			);
		} else {
			console.error(
				`[AlphaTabManager] FAILED to bind event 'scoreLoaded'. Emitter is missing or invalid:`,
				scoreLoadedEmitter
			);
		}

		safeBind("playerStateChanged", this.eventHandlers.onPlayerStateChanged);
		safeBind("fontLoaded", this.eventHandlers.onFontLoaded); // Bind even if initially undefined, to catch if it appears later
		safeBind("soundFontLoaded", this.eventHandlers.onSoundFontLoaded);
		safeBind("playerReady", this.eventHandlers.onPlayerReady);
		safeBind("ready", this.eventHandlers.onReady); // Bind even if initially undefined
	}

	playPause() {
		if (!this.api) return;
		if (this.settings.player.enablePlayer) {
			this.api.playPause();
		} else {
			console.warn(
				"[AlphaTabManager] Player is not enabled, cannot play/pause."
			);
			new Notice("播放器当前已禁用 (字体调试模式)");
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
}
