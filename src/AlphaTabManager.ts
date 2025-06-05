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
	LogLevel,
} from "@coderline/alphatab";
import { Notice, TFile, App } from "obsidian";

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
	private static readonly FONT_STYLE_ELEMENT_ID =
		"alphatab-manual-font-styles";

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
				"[AlphaTabManager] No WOFF or WOFF2 data URLs available to inject font faces."
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
			styleEl.id = AlphaTabManager.FONT_STYLE_ELEMENT_ID;
			styleEl.type = "text/css";
			styleEl.textContent = css;
			document.head.appendChild(styleEl);
			console.log(
				`[AlphaTabManager] Manually injected @font-face rules for: ${fontFamiliesToDefine.join(
					", "
				)} using WOFF/WOFF2 Data URLs.`
			);
			// Trigger browser to acknowledge font
			this.triggerFontPreload(fontFamiliesToDefine);
			return true;
		} catch (e) {
			console.error(
				"[AlphaTabManager] Error injecting manual font styles:",
				e
			);
			return false;
		}
	}

	private removeInjectedFontFaces() {
		const existingStyleEl = document.getElementById(
			AlphaTabManager.FONT_STYLE_ELEMENT_ID
		);
		if (existingStyleEl) {
			existingStyleEl.remove();
			console.log(
				"[AlphaTabManager] Removed previously injected manual font styles."
			);
		}
	}

	private triggerFontPreload(fontFamilies: string[]) {
		// Attempt to force browser to load/acknowledge the font by using it
		// This is a bit of a hack, FontFace API is more robust if available and working
		fontFamilies.forEach((fontFamily) => {
			if (typeof FontFace !== "undefined" && document.fonts) {
				// Using woff2 or woff from smuflFontData which should have been set up
				const fontUrl =
					(
						this.settings.core.smuflFontSources as Record<
							string,
							string
						>
					)?.["woff2"] ||
					(
						this.settings.core.smuflFontSources as Record<
							string,
							string
						>
					)?.["woff"];
				if (fontUrl) {
					const font = new FontFace(fontFamily, `url(${fontUrl})`, {
						display: "block",
					});
					font.load()
						.then((loadedFont) => {
							document.fonts.add(loadedFont);
							console.log(
								`[AlphaTabManager] FontFace API: Successfully loaded and added '${fontFamily}'.`
							);
						})
						.catch((err) => {
							console.warn(
								`[AlphaTabManager] FontFace API: Error loading '${fontFamily}':`,
								err
							);
						});
				} else {
					console.warn(
						`[AlphaTabManager] FontFace API: No WOFF/WOFF2 URL found in smuflFontSources to preload '${fontFamily}'.`
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
					`[AlphaTabManager] Triggered font preload for '${fontFamily}' via temporary element.`
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
				"[AlphaTabManager] CRITICAL PRE-INIT CHECK: mainElement has zero width or height. Rendering WILL FAIL. Fix in TabView.ts!"
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
					"[AlphaTabManager] Error destroying previous API:",
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

		this.settings.core.useWorkers = false;
		this.settings.core.workerFile = null;
		this.settings.player.enablePlayer = false;
		this.settings.player.soundFont = null;
		console.log(
			"[AlphaTabManager] Manual @font-face + Data URL Mode: Workers/Player disabled."
		);

		const pluginManifestDir = this.pluginInstance.manifest.dir;
		if (!pluginManifestDir) {
			/* ... error handling ... */ return;
		}
		console.log(
			`[AlphaTabManager] Plugin manifest dir: ${pluginManifestDir}`
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
				`[AlphaTabManager] Settings: core.scriptFile = ${this.settings.core.scriptFile}`
			);
		} else {
			this.settings.core.scriptFile = null;
			console.error(
				`[AlphaTabManager] Main AlphaTab script (alphatab.js) NOT FOUND at '${mainScriptAssetObsidianPath}'.`
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
			`[AlphaTabManager] Settings: core.fontDirectory (for satisfying internal checks) = ${this.settings.core.fontDirectory}`
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
						`[AlphaTabManager] Encoded ${fontInfo.name} as Data URL.`
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
						`[AlphaTabManager] Parsed ${metadataFile} and added to smuflFontData.json.`
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
					"[AlphaTabManager] Settings: core.smuflFontSources populated. Keys:",
					Object.keys(smuflFontData)
				);

				// MANUALLY INJECT @font-face rules
				if (!this.injectFontFaces(fontDataUrlsForCss)) {
					console.error(
						"[AlphaTabManager] Failed to manually inject @font-face styles. Font rendering will likely fail."
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
		// Explicitly tell AlphaTab to try "Bravura" first, then "alphaTab" (which we also define in manual @font-face)
		this.settings.display.resources.smuflFont = {
			families: ["Bravura", "alphaTab"],
			size: 21,
		};
		console.log(
			"[AlphaTabManager] Settings: display.resources.smuflFont.families set to ['Bravura', 'alphaTab']"
		);

		const initialThemeColors = this.darkMode; /* ... theme colors ... */
		Object.assign(this.settings.display.resources, initialThemeColors);
		console.log(
			"[AlphaTabManager] Final AlphaTab Settings:",
			JSON.parse(JSON.stringify(this.settings))
		);

		// Environment hack
		let originalProcess: any, originalModule: any;
		let modifiedGlobals = false;
		try {
			// ... (global overrides) ...
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
					"[AlphaTabManager] Environment.webPlatform overridden."
				);
			}

			console.log("[AlphaTabManager] Initializing AlphaTabApi...");

			this.api = new alphaTab.AlphaTabApi(
				this.mainElement,
				this.settings
			);
			console.log(
				"[AlphaTabManager] AlphaTabApi instantiated. API object:",
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
				console.log("[AlphaTabManager] Checking API event emitters:");
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
		// ... (safeBind logic as before, ensure it logs missing emitters) ...
		if (!this.api) {
			console.error("[AlphaTabManager] bindEvents: API is null.");
			return;
		}
		console.log("[AlphaTabManager] Attempting to bind events...");

		const safeBind = (
			eventName: string,
			handler?: (...args: any[]) => void
		) => {
			// @ts-ignore
			const emitter = this.api![eventName];
			if (emitter && typeof emitter.on === "function") {
				if (handler) emitter.on(handler);
				else
					emitter.on((...args: unknown[]) =>
						console.log(
							`[AlphaTabManager] Event '${eventName}' fired:`,
							args
						)
					);
				console.log(
					`[AlphaTabManager] Bound handler for '${eventName}'.`
				);
			} else {
				console.error(
					`[AlphaTabManager] FAILED to bind event '${eventName}'. Emitter missing/invalid:`,
					emitter
				);
			}
		};

		safeBind("error", this.eventHandlers.onError);
		safeBind("renderStarted", this.eventHandlers.onRenderStarted);
		safeBind("renderFinished", this.eventHandlers.onRenderFinished);
		// ... bind other events ...
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
					"[AlphaTabManager] Internal scoreLoaded. Score:",
					score?.title,
					"Tracks:",
					score?.tracks?.length
				);
				this.eventHandlers.onScoreLoaded?.(score);
			});
			console.log(`[AlphaTabManager] Bound handler for 'scoreLoaded'.`);
		} else {
			console.error(
				`[AlphaTabManager] FAILED to bind event 'scoreLoaded'. Emitter missing/invalid:`,
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
	public updateRenderTracks(tracks: Track[]) {
		if (this.api) this.api.renderTracks(tracks);
	}
	public getAllTracks(): Track[] {
		return this.score?.tracks || [];
	}
	public getSelectedRenderTracks(): Track[] {
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
		console.log("[AlphaTabManager] Destroyed.");
	}
}
