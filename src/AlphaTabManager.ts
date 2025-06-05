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

// Node.js modules for reading files (available in Obsidian plugin context)
import * as fs from "fs";
import * as path from "path";

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

	private getAbsolutePath(relativePath: string): string {
		// Based on Obsidian's plugin structure, manifest.dir is relative to vault root.
		// We need an absolute path for fs.
		// vault.adapter.getBasePath() gives the absolute path to the vault.
		const vaultBasePath = (this.app.vault.adapter as any).getBasePath
			? (this.app.vault.adapter as any).getBasePath()
			: "";
		if (!vaultBasePath) {
			console.warn(
				"[AlphaTabManager] Vault base path could not be determined. Assuming relative paths for fs might fail if not running from vault root context (this is unlikely for a plugin)."
			);
		}
		// manifest.dir is like ".obsidian/plugins/your-plugin-id"
		return path.join(
			vaultBasePath,
			this.pluginInstance.manifest.dir,
			relativePath
		);
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
		this.settings.core.logLevel = LogLevel.Debug;

		// --- Configuration for Non-Worker, Data URL Font Debugging ---
		this.settings.core.useWorkers = false;
		this.settings.core.workerFile = null;
		this.settings.player.enablePlayer = false;
		this.settings.player.soundFont = null;
		console.log(
			"[AlphaTabManager] DATA URL FONT DEBUG MODE: Workers and Player are forcibly disabled."
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
			`[AlphaTabManager] Plugin manifest directory (relative to vault): ${pluginManifestDir}`
		);

		// --- Load Fonts as Data URLs ---
		this.settings.core.fontDirectory = null; // Explicitly null when using smuflFontSources
		const fontDataUrls: Record<string, string> = {};
		let SmuflFontsLoaded = false;

		try {
			const fontAssetsRelativePath = "assets/alphatab/font"; // Relative to plugin root
			const fontFilesToLoad = [
				{ name: "Bravura.woff2", ext: "woff2", mime: "font/woff2" },
				{ name: "Bravura.woff", ext: "woff", mime: "font/woff" },
				// Add OTF if you want to provide it and AlphaTab uses it from smuflFontSources
				// { name: "Bravura.otf", ext: "otf", mime: "font/otf" },
			];

			for (const fontInfo of fontFilesToLoad) {
				const absoluteFontPath = this.getAbsolutePath(
					path.join(fontAssetsRelativePath, fontInfo.name)
				);
				if (fs.existsSync(absoluteFontPath)) {
					const fontBuffer = fs.readFileSync(absoluteFontPath);
					const fontBase64 = fontBuffer.toString("base64");
					fontDataUrls[
						fontInfo.ext
					] = `data:${fontInfo.mime};base64,${fontBase64}`;
					SmuflFontsLoaded = true; // At least one font format loaded
					console.log(
						`[AlphaTabManager] Encoded ${fontInfo.name} as Data URL for smuflFontSources.`
					);
				} else {
					console.warn(
						`[AlphaTabManager] Font file NOT FOUND for Data URL: ${absoluteFontPath}`
					);
				}
			}

			// Load bravura_metadata.json
			const metadataFile = "bravura_metadata.json";
			const absoluteMetadataPath = this.getAbsolutePath(
				path.join(fontAssetsRelativePath, metadataFile)
			);
			if (fs.existsSync(absoluteMetadataPath)) {
				const metadataStr = fs.readFileSync(
					absoluteMetadataPath,
					"utf8"
				);
				// AlphaTab expects the actual JSON content for 'json' key if smuflFontSources is used, not a data URL of the json.
				// However, if it expects a data URL, then this would be:
				// const metadataBase64 = Buffer.from(metadataStr).toString("base64");
				// fontDataUrls["json"] = `data:application/json;base64,${metadataBase64}`;
				// Let's try providing the string content directly first, if AlphaTab handles that.
				// Based on AlphaTab source (JsonSmuflFont.ts), it seems to expect the raw data if the "ext" is "json"
				// For smuflFontSources, it's usually data URLs for font files. Let's see if it picks up metadata differently or if it's only via fontDirectory.
				// For now, we'll focus on font files in smuflFontSources. AlphaTab might try to load metadata relative to `scriptFile` or based on font.
				// If issues persist with metadata, we might need `settings.core.smuflMetaDataFile` with an app:// URL.
				console.log(
					`[AlphaTabManager] Found ${metadataFile}. AlphaTab will attempt to load it based on font or scriptFile if needed.`
				);
			} else {
				console.warn(
					`[AlphaTabManager] ${metadataFile} NOT FOUND at ${absoluteMetadataPath}. This might be an issue.`
				);
			}

			if (SmuflFontsLoaded) {
				this.settings.core.smuflFontSources = fontDataUrls;
				console.log(
					"[AlphaTabManager] Settings: core.smuflFontSources populated with Data URLs:",
					Object.keys(fontDataUrls)
				);
			} else {
				console.error(
					"[AlphaTabManager] CRITICAL: No SMUFL font files (woff2, woff) could be loaded as Data URLs. Rendering will fail."
				);
				this.eventHandlers.onError?.({
					message: "未能加载Bravura字体文件作为Data URL。",
				});
				return;
			}
		} catch (e: any) {
			console.error(
				"[AlphaTabManager] Error loading fonts as Data URLs:",
				e
			);
			this.eventHandlers.onError?.({
				message: `加载字体Data URL时出错: ${e.message}`,
			});
			return;
		}
		// --- End Font Loading as Data URLs ---

		// Main AlphaTab Script File URL (core.scriptFile) - still useful for AlphaTab to know its "base"
		const mainScriptFileSuffix = "/assets/alphatab/alphatab.js";
		const mainScriptAssetObsidianPath =
			pluginManifestDir + mainScriptFileSuffix;
		if (await this.app.vault.adapter.exists(mainScriptAssetObsidianPath)) {
			this.settings.core.scriptFile =
				this.app.vault.adapter.getResourcePath(
					mainScriptAssetObsidianPath
				);
			console.log(
				`[AlphaTabManager] Settings: core.scriptFile = ${this.settings.core.scriptFile}`
			);
		} else {
			this.settings.core.scriptFile = null;
			console.error(
				`[AlphaTabManager] Main AlphaTab script (alphatab.js) NOT FOUND at '${mainScriptAssetObsidianPath}'.`
			);
		}

		// Display settings
		this.settings.display.scale = 0.8;
		this.settings.display.layoutMode = LayoutMode.Page;
		// Ensure SMUFL font is used
		this.settings.display.resources.smuflFont = {
			families: ["Bravura", "alphaTab"],
			size: 21,
		}; // AlphaTab might default to 'alphaTab' or use 'Bravura'

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
			"[AlphaTabManager] Final AlphaTab Settings prepared (Data URL Font Debug Mode):",
			JSON.parse(JSON.stringify(this.settings))
		);

		// Environment hack
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
				"[AlphaTabManager] Initializing AlphaTabApi (Data URL Font Debug Mode)..."
			);

			if (
				this.mainElement.clientWidth === 0 ||
				this.mainElement.clientHeight === 0
			) {
				console.warn(
					"[AlphaTabManager] mainElement has zero width or height. This MUST be fixed in the calling View."
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
					"[AlphaTabManager] Checking API event emitters (Data URL Font Debug Mode):"
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
				console.error(
					`[AlphaTabManager] FAILED to bind event '${eventName}'. Emitter is missing or invalid:`,
					emitter
				);
			}
		};

		safeBind("error", this.eventHandlers.onError);
		safeBind("renderStarted", this.eventHandlers.onRenderStarted);
		safeBind("renderFinished", this.eventHandlers.onRenderFinished);

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
		safeBind("fontLoaded", this.eventHandlers.onFontLoaded);
		safeBind("soundFontLoaded", this.eventHandlers.onSoundFontLoaded);
		safeBind("playerReady", this.eventHandlers.onPlayerReady);
		safeBind("ready", this.eventHandlers.onReady);
	}

	playPause() {
		if (!this.api) return;
		if (this.settings.player.enablePlayer) {
			// This will be false in this debug mode
			this.api.playPause();
		} else {
			console.warn(
				"[AlphaTabManager] Player is not enabled, cannot play/pause (Data URL Font Debug Mode)."
			);
			new Notice("播放器当前已禁用 (Data URL 字体调试模式)");
		}
	}
	stop() {
		/* ... */
	}
	public updateRenderTracks(tracks: Track[]) {
		/* ... */
	}
	public getAllTracks(): Track[] {
		/* ... */
	}
	public getSelectedRenderTracks(): Track[] {
		/* ... */
	}
	render() {
		/* ... */
	}
	destroy() {
		/* ... */
	}
}
