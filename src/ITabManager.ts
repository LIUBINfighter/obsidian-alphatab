// ITabManager.ts

import * as alphaTab from "@coderline/alphatab";
import {
	LayoutMode,
	type AlphaTabApi,
	type Settings,
	WebPlatform,
	LogLevel,
} from "@coderline/alphatab";
import { Notice, TFile, App } from "obsidian";

import * as fs from "fs";
import * as path from "path";

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
	onFontLoaded?: (name: string, family: string) => void;
	onSoundFontLoaded?: () => void;
	onPlayerReady?: () => void;
	onReady?: () => void;
}

export class ITabManager {
	// 添加缺失的类属性声明
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
	private static readonly FONT_STYLE_ELEMENT_ID =
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

	private getAbsolutePath(relativePath: string): string {
		const vaultBasePath = (this.app.vault.adapter as any).getBasePath
			? (this.app.vault.adapter as any).getBasePath()
			: "";
		return path.join(
			vaultBasePath,
			this.pluginInstance.manifest.dir,
			relativePath
		);
	}

	private injectFontFaces(fontData: Record<string, string>): boolean {
		this.removeInjectedFontFaces(); // Clean up previous attempts

		const woff2Src = fontData["woff2"];
		const woffSrc = fontData["woff"];

		if (!woff2Src && !woffSrc) {
			console.error(
				"[ITabManager] No WOFF or WOFF2 data URLs available to inject font faces."
			);
			return false;
		}

		let css = "";
		const sources: string[] = [];
		if (woff2Src) sources.push(`url('${woff2Src}') format('woff2')`);
		if (woffSrc) sources.push(`url('${woffSrc}') format('woff')`);
		// You could add OTF here too if you provide it in fontData
		// if (fontData["otf"]) sources.push(`url('${fontData["otf"]}') format('opentype')`);

		const fontFamiliesToDefine = ["Bravura", "alphaTab"]; // Define for both

		fontFamiliesToDefine.forEach((fontFamily) => {
			css += `@font-face {\n`;
			css += `  font-family: '${fontFamily}';\n`;
			css += `  src: ${sources.join(",\n       ")};\n`; // Format for readability
			css += `  font-display: block;\n`; // Or 'swap'
			css += `}\n\n`;
		});

		try {
			const styleEl = document.createElement("style");
			styleEl.id = ITabManager.FONT_STYLE_ELEMENT_ID;
			styleEl.type = "text/css";
			styleEl.textContent = css;
			document.head.appendChild(styleEl);
			console.log(
				`[ITabManager] Manually injected @font-face rules for: ${fontFamiliesToDefine.join(
					", "
				)} using WOFF/WOFF2 Data URLs.`
			);
			// Trigger browser to acknowledge font
			this.triggerFontPreload(fontFamiliesToDefine);
			return true;
		} catch (e) {
			console.error(
				"[ITabManager] Error injecting manual font styles:",
				e
			);
			return false;
		}
	}

	private removeInjectedFontFaces() {
		const existingStyleEl = document.getElementById(
			ITabManager.FONT_STYLE_ELEMENT_ID
		);
		if (existingStyleEl) {
			existingStyleEl.remove();
			console.log(
				"[ITabManager] Removed previously injected manual font styles."
			);
		}
	}

	private triggerFontPreload(fontFamilies: string[]) {
		fontFamilies.forEach((fontFamily) => {
			if (typeof FontFace !== "undefined" && document.fonts) {
				const fontUrl = this.settings.core.fontDirectory + 'Bravura.woff2';
				if (fontUrl) {
					const font = new FontFace(fontFamily, `url(${fontUrl})`, {
						display: 'block'
					});
					font.load()
						.then((loadedFont) => {
							// @ts-ignore
							document.fonts.add(loadedFont);
							console.log(
								`[ITabManager] FontFace API: Successfully loaded and added '${fontFamily}'.`
							);
						})
						.catch((err) => {
							console.warn(
								`[ITabManager] FontFace API: Error loading '${fontFamily}':`,
								err
							);
						});
				} else {
					console.warn(
						`[ITabManager] FontFace API: No WOFF/WOFF2 URL found in smuflFontSources to preload '${fontFamily}'.`
					);
				}
			} else {
				// Fallback if FontFace API is not fully supported or as an additional trigger
				const testEl = document.createElement("div");
				testEl.style.fontFamily = fontFamily;
				testEl.style.position = "absolute";
				testEl.style.left = "-9999px";
				testEl.style.visibility = "hidden";
				testEl.textContent = "test"; // Some content
				document.body.appendChild(testEl);
				setTimeout(() => {
					if (testEl.parentElement) testEl.remove();
				}, 100); // Clean up
				console.log(
					`[ITabManager] Triggered font preload for '${fontFamily}' via temporary element.`
				);
			}
		});
	}

	async initializeAndLoadScore(file: TFile) {
		// Ensure mainElement has dimensions - USER MUST FIX THIS IN TABVIEW.TS
		if (
			this.mainElement?.clientWidth === 0 ||
			this.mainElement?.clientHeight === 0
		) {
			console.error(
				"[AlphaTab] CRITICAL: mainElement has zero width or height."
			);
			// Forcing a minimal size here for extreme cases, but this is a hack.
			this.mainElement.style.minWidth =
				this.mainElement.style.minWidth || "300px";
			this.mainElement.style.minHeight =
				this.mainElement.style.minHeight || "150px";
			this.eventHandlers.onError?.({
				message:
					"AlphaTab容器尺寸为0。已尝试设置最小尺寸，但请在插件视图中修复。",
			});
		}

		if (this.api) {
			try {
				this.api.destroy();
			} catch (e) {
				console.error(
					"[ITabManager] Error destroying previous API:",
					e
				);
			}
			this.api = null;
		}
		this.score = null;
		this.renderTracks = [];
		this.renderWidth = Math.max(this.mainElement?.clientWidth || 300, 300);

		this.settings = new alphaTab.Settings();
		this.settings.core.engine = "svg";
		this.settings.core.enableLazyLoading = true;
		this.settings.core.logLevel = LogLevel.Debug;

		// === Worker 支持 begin ===
		this.settings.core.useWorkers = true; // 启用 Worker

		const pluginManifestDir = this.pluginInstance.manifest.dir;
		if (!pluginManifestDir) {
			/* ... error handling ... */ return;
		}
		// Worker 路径设置
		const workerScriptFileSuffix = "/assets/alphatab/alphaTab.worker.mjs";
		const workerScriptAssetObsidianPath = pluginManifestDir + workerScriptFileSuffix;
		if (await this.app.vault.adapter.exists(workerScriptAssetObsidianPath)) {
			// @ts-ignore
			this.settings.core.workerFile = this.app.vault.adapter.getResourcePath(workerScriptAssetObsidianPath);
			// console.log(`[AlphaTab] Worker file path set`);
		} else {
			// @ts-ignore
			this.settings.core.workerFile = null;
			this.settings.core.useWorkers = false;
			console.error("[AlphaTab] Worker script not found. Worker disabled.");
			this.eventHandlers.onError?.({ message: "AlphaTab Worker脚本文件丢失，性能可能会受影响。" });
		}
		// === Worker 支持 end ===

		// === Player/SoundFont 支持 begin ===
		this.settings.player.enablePlayer = true; // 启用 Player

		const soundFontFileSuffix = "/assets/alphatab/soundfont/sonivox.sf2";
		const soundFontAssetObsidianPath = pluginManifestDir + soundFontFileSuffix;
		if (await this.app.vault.adapter.exists(soundFontAssetObsidianPath)) {
			this.settings.player.soundFont = this.app.vault.adapter.getResourcePath(soundFontAssetObsidianPath);
			console.log(`[ITabManager] Settings: player.soundFont = ${this.settings.player.soundFont}`);
		} else {
			this.settings.player.soundFont = null;
			this.settings.player.enablePlayer = false; // 找不到则禁用
			console.error(`[ITabManager] SoundFont file NOT FOUND at '${soundFontAssetObsidianPath}'. Player disabled.`);
			this.eventHandlers.onError?.({ message: "音色库文件丢失，播放功能已禁用。" });
		}
		// === Player/SoundFont 支持 end ===

		console.log(
			"[ITabManager] Manual @font-face + Data URL Mode: Workers/Player disabled."
		);

		// 移除重复声明，直接使用 pluginManifestDir
		if (!pluginManifestDir) {
			/* ... error handling ... */ return;
		}
		console.log(
			`[ITabManager] Plugin manifest dir: ${pluginManifestDir}`
		);

		// --- Main AlphaTab Script File URL (core.scriptFile) ---
		const mainScriptFileSuffix = "/assets/alphatab/alphatab.js";
		const mainScriptAssetObsidianPath =
			pluginManifestDir + mainScriptFileSuffix;
		if (await this.app.vault.adapter.exists(mainScriptAssetObsidianPath)) {
			this.settings.core.scriptFile =
				this.app.vault.adapter.getResourcePath(
					mainScriptAssetObsidianPath
				);
			console.log(
				`[ITabManager] Settings: core.scriptFile = ${this.settings.core.scriptFile}`
			);
		} else {
			this.settings.core.scriptFile = null;
			console.error(
				`[ITabManager] Main AlphaTab script (alphatab.js) NOT FOUND at '${mainScriptAssetObsidianPath}'.`
			);
		}

		// --- Attempt to satisfy fontDirectory check with a dummy value derived from scriptFile ---
		if (this.settings.core.scriptFile) {
			const baseScriptPath = this.settings.core.scriptFile.substring(
				0,
				this.settings.core.scriptFile.lastIndexOf("/") + 1
			);
			this.settings.core.fontDirectory = baseScriptPath + "font/"; // e.g., app://.../assets/alphatab/font/
		} else {
			// Fallback if scriptFile isn't set (less ideal but better than null for the check)
			this.settings.core.fontDirectory = "/alphatab-virtual-fonts/"; // A plausible relative path
		}
		console.log(
			`[ITabManager] Settings: core.fontDirectory (for satisfying internal checks) = ${this.settings.core.fontDirectory}`
		);

		// --- Load Fonts as Data URLs AND INJECT @font-face ---
		const smuflFontData: Record<string, string | Record<string, unknown>> =
			{};
		let actualSmuflFontFilesLoaded = false;
		const fontDataUrlsForCss: Record<string, string> = {}; // For injectFontFaces

		try {
			const fontAssetsRelativePath = "assets/alphatab/font";
			const fontFilesToLoad = [
				{ name: "Bravura.woff2", ext: "woff2", mime: "font/woff2" },
				{ name: "Bravura.woff", ext: "woff", mime: "font/woff" },
			];

			for (const fontInfo of fontFilesToLoad) {
				const absoluteFontPath = this.getAbsolutePath(
					path.join(fontAssetsRelativePath, fontInfo.name)
				);
				if (fs.existsSync(absoluteFontPath)) {
					const fontBuffer = fs.readFileSync(absoluteFontPath);
					const fontBase64 = fontBuffer.toString("base64");
					const dataUrl = `data:${fontInfo.mime};base64,${fontBase64}`;
					smuflFontData[fontInfo.ext] = dataUrl; // For AlphaTab settings
					fontDataUrlsForCss[fontInfo.ext] = dataUrl; // For manual CSS injection
					actualSmuflFontFilesLoaded = true;
					console.log(
						`[ITabManager] Encoded ${fontInfo.name} as Data URL.`
					);
				} else {
					/* ... warning ... */
				}
			}

			const metadataFile = "bravura_metadata.json";
			const absoluteMetadataPath = this.getAbsolutePath(
				path.join(fontAssetsRelativePath, metadataFile)
			);
			if (fs.existsSync(absoluteMetadataPath)) {
				const metadataStr = fs.readFileSync(
					absoluteMetadataPath,
					"utf8"
				);
				try {
					smuflFontData["json"] = JSON.parse(metadataStr);
					console.log(
						`[ITabManager] Parsed ${metadataFile} and added to smuflFontData.json.`
					);
				} catch (jsonError) {
					/* ... error handling ... */
				}
			} else {
				/* ... warning ... */
			}

			if (actualSmuflFontFilesLoaded) {
				// @ts-ignore
				this.settings.core.smuflFontSources = smuflFontData; // Provide to AlphaTab
				console.log(
					"[ITabManager] Settings: core.smuflFontSources populated. Keys:",
					Object.keys(smuflFontData)
				);

				// MANUALLY INJECT @font-face rules
				if (!this.injectFontFaces(fontDataUrlsForCss)) {
					console.error(
						"[ITabManager] Failed to manually inject @font-face styles. Font rendering will likely fail."
					);
					// this.eventHandlers.onError?.({message: "手动注入字体样式失败。"}); // Optional: report error
				}
			} else {
				/* ... critical error handling ... */ return;
			}
		} catch (e: any) {
			/* ... error handling ... */ return;
		}

		// Display settings
		this.settings.display.scale = 0.8;
		this.settings.display.layoutMode = LayoutMode.Page;
		// 移除有问题的 smuflFont 设置，AlphaTab 会使用默认的 SMuFL 字体配置
		// this.settings.display.resources.smuflFont = alphaTab.model.Font.withFamilyList(
		// 	["Bravura", "alphaTab"],
		// 	21
		// );
		console.log(
			"[ITabManager] Settings: Using default SMuFL font configuration"
		);

		const initialThemeColors = this.darkMode; /* ... theme colors ... */
		Object.assign(this.settings.display.resources, initialThemeColors);
		console.log(
			"[ITabManager] Final AlphaTab Settings:",
			JSON.parse(JSON.stringify(this.settings))
		);

		// Environment hack
		try {
			let originalProcess: any, originalModule: any;
			if (typeof process !== "undefined") {
				originalProcess = (globalThis as any).process;
				(globalThis as any).process = undefined;
			}
			if (typeof module !== "undefined") {
				originalModule = (globalThis as any).module;
				(globalThis as any).module = undefined;
			}
			// @ts-ignore
			if (alphaTab.Environment && typeof WebPlatform !== "undefined") {
				// @ts-ignore
				alphaTab.Environment.webPlatform = WebPlatform.Browser;
				console.log(
					"[ITabManager] Environment.webPlatform overridden."
				);
			}

			console.log("[ITabManager] Initializing AlphaTabApi...");

			this.api = new alphaTab.AlphaTabApi(
				this.mainElement,
				this.settings
			);
			console.log(
				"[ITabManager] AlphaTabApi instantiated. API object:",
				this.api
			);

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
				console.log("[ITabManager] Checking API event emitters:");
				eventNames.forEach((eventName) => {
					/* ... event emitter check ... */
				});
			}

			this.bindEvents();
		} catch (e: any) {
			/* ... error handling ... */
		} finally {
			/* ... restore globals ... */
		}

		if (!this.api) {
			/* ... error handling ... */ return;
		}

		try {
			const scoreData = await this.app.vault.readBinary(file);
			await this.api.load(new Uint8Array(scoreData));
		} catch (e: any) {
			/* ... error handling ... */
		}
	}

	private bindEvents() {
		if (!this.api) {
			console.error("[AlphaTab] bindEvents: API is null.");
			return;
		}
		
		const safeBind = (eventName: string, handler?: (...args: any[]) => void) => {
			// @ts-ignore
			const emitter = this.api![eventName];
			if (emitter && typeof emitter.on === "function") {
				if (handler) emitter.on(handler);
			} else {
				console.error(`[AlphaTab] Failed to bind event '${eventName}'`);
			}
		};

		// 绑定所有事件
		safeBind("error", this.eventHandlers.onError);
		safeBind("renderStarted", this.eventHandlers.onRenderStarted);
		safeBind("renderFinished", this.eventHandlers.onRenderFinished);
		// ... bind other events ...
		// @ts-ignore
		const scoreLoadedEmitter = this.api!.scoreLoaded;
		if (scoreLoadedEmitter && typeof scoreLoadedEmitter.on === "function") {
			scoreLoadedEmitter.on((score: alphaTab.model.Score | null) => {
				this.score = score;
				if (score?.tracks?.length) {
					this.renderTracks = [score.tracks[0]];
				} else {
					this.renderTracks = [];
				}
				console.log(
					"[ITabManager] Internal scoreLoaded. Score:",
					score?.title,
					"Tracks:",
					score?.tracks?.length
				);
				this.eventHandlers.onScoreLoaded?.(score);
			});
			console.log(`[ITabManager] Bound handler for 'scoreLoaded'.`);
		} else {
			console.error(
				`[ITabManager] FAILED to bind event 'scoreLoaded'. Emitter missing/invalid:`,
				scoreLoadedEmitter
			);
		}

		safeBind("playerStateChanged", this.eventHandlers.onPlayerStateChanged);
		safeBind("fontLoaded", this.eventHandlers.onFontLoaded);
		safeBind("soundFontLoaded", this.eventHandlers.onSoundFontLoaded);
		safeBind("playerReady", this.eventHandlers.onPlayerReady);
		safeBind("ready", this.eventHandlers.onReady);
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
