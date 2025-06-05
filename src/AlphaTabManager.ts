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
} from "@coderline/alphatab";
import * as fs from "fs";
import * as path from "path";
import { Notice, TFile, App } from "obsidian";

export interface AlphaTabManagerOptions {
	pluginInstance: any;
	app: App;
	mainElement: HTMLElement;
	viewportElement: HTMLElement;
	onError?: (error: any) => void;
	onScoreLoaded?: (score: Score | null) => void;
	onRenderStarted?: () => void;
	onRenderFinished?: () => void;
	onPlayerStateChanged?: (args: any) => void;
}

export class AlphaTabManager {
	public api: AlphaTabApi | null = null;
	public score: Score | null = null;
	public settings!: Settings; // 注意：这里你用了 !，确保在实际使用前它一定会被初始化
	private pluginInstance: any;
	private app: App;
	private mainElement: HTMLElement;
	private viewportElement: HTMLElement;
	private eventHandlers: AlphaTabManagerOptions;
	private renderTracks: Track[] = [];
	private renderWidth = 800;
	private darkMode: boolean = false;

	constructor(options: AlphaTabManagerOptions) {
		console.log(
			"[AlphaTabManager] Constructor called with options:",
			options
		); // 打印构造函数参数
		this.pluginInstance = options.pluginInstance;
		this.app = options.app;
		this.mainElement = options.mainElement;
		this.viewportElement = options.viewportElement;
		this.eventHandlers = options;
	}

	setDarkMode(isDark: boolean) {
		this.darkMode = isDark;
		console.log(`[AlphaTabManager] Dark mode set to: ${this.darkMode}`);
	}

	async initializeAndLoadScore(file: TFile) {
		console.log(
			`[AlphaTabManager] initializeAndLoadScore called for file: ${file.name}`
		);
		if (this.api) {
			console.log("[AlphaTabManager] Destroying previous API instance.");
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
		console.log(
			`[AlphaTabManager] Initial renderWidth: ${this.renderWidth}`
		);

		this.settings = new alphaTab.Settings();
		console.log("[AlphaTabManager] New alphaTab.Settings() created.");

		this.settings.core.engine = "svg";
		this.settings.core.enableLazyLoading = true; // 考虑在调试时暂时设为 false，简化流程
		this.settings.core.useWorkers = false; // 保持 false，避免 worker 的复杂性
		this.settings.player.enablePlayer = false; // 如果不需要播放，保持 false

		console.log("[AlphaTabManager] Initial core settings:", {
			engine: this.settings.core.engine,
			enableLazyLoading: this.settings.core.enableLazyLoading,
			useWorkers: this.settings.core.useWorkers,
			enablePlayer: this.settings.player.enablePlayer,
		});

		// --- 字体加载策略 ---
		console.log("[AlphaTabManager] --- Font Loading Strategy START ---");
		this.settings.core.fontDirectory = null;
		this.settings.core.scriptFile = null;
		console.log(
			"[AlphaTabManager] Settings: fontDirectory and scriptFile explicitly set to null."
		);

		const fontDataUrls: Record<string, string> = {};
		let essentialFontDataLoaded = false;

		const pluginRootPath = this.pluginInstance.actualPluginDir;
		console.log(
			`[AlphaTabManager] pluginInstance.actualPluginDir: ${pluginRootPath}`
		);

		if (!pluginRootPath || !fs.existsSync(pluginRootPath)) {
			const errorMsg = `[AlphaTabManager] CRITICAL - Plugin directory path from main plugin is invalid or does not exist: '${pluginRootPath}'`;
			console.error(errorMsg);
			this.eventHandlers.onError?.({
				message: `插件资源路径无效，无法加载字体。路径: ${pluginRootPath}`,
			});
			return;
		}
		console.log(
			`[AlphaTabManager] Using plugin directory for fs (from main.ts): ${pluginRootPath}`
		);
		const fontAssetsPath = path.join(
			pluginRootPath,
			"assets",
			"alphatab",
			"font"
		);
		console.log(
			`[AlphaTabManager] Determined fontAssetsPath: ${fontAssetsPath}`
		);
		if (!fs.existsSync(fontAssetsPath)) {
			console.warn(
				`[AlphaTabManager] WARNING: fontAssetsPath does not exist: ${fontAssetsPath}`
			);
		}

		let primaryFontLoaded = false;
		const fontPreferences = [
			{ ext: "woff2", mime: "font/woff2", name: "Bravura.woff2" },
			{ ext: "woff", mime: "font/woff", name: "Bravura.woff" },
		];

		for (const pref of fontPreferences) {
			const fontPath = path.join(fontAssetsPath, pref.name);
			console.log(
				`[AlphaTabManager] Checking for font file: ${fontPath}`
			);
			if (fs.existsSync(fontPath)) {
				console.log(`[AlphaTabManager] Font file found: ${fontPath}`);
				try {
					const fontBuffer = fs.readFileSync(fontPath);
					const fontBase64 = fontBuffer.toString("base64");
					fontDataUrls[pref.ext] = `data:${
						pref.mime
					};base64,${fontBase64.substring(0, 50)}... (length: ${
						fontBase64.length
					})`; // 截断过长的 base64 字符串，避免日志过大
					primaryFontLoaded = true;
					console.log(
						`[AlphaTabManager] Encoded ${pref.name} as data URL for smuflFontSources. primaryFontLoaded: ${primaryFontLoaded}`
					);
					break;
				} catch (err: any) {
					console.error(
						`[AlphaTabManager] Failed to read/encode ${pref.name}:`,
						err.message,
						err.stack // 添加堆栈信息
					);
				}
			} else {
				console.log(
					`[AlphaTabManager] Font file NOT found: ${fontPath}`
				);
			}
		}

		let metadataLoaded = false;
		const metadataPath = path.join(fontAssetsPath, "bravura_metadata.json");
		console.log(
			`[AlphaTabManager] Checking for metadata file: ${metadataPath}`
		);
		if (fs.existsSync(metadataPath)) {
			console.log(
				`[AlphaTabManager] Metadata file found: ${metadataPath}`
			);
			try {
				const metadataStr = fs.readFileSync(metadataPath, "utf8");
				const metadataBase64 =
					Buffer.from(metadataStr).toString("base64");
				fontDataUrls[
					"json"
				] = `data:application/json;charset=utf-8;base64,${metadataBase64.substring(
					0,
					50
				)}... (length: ${metadataBase64.length})`; // 截断
				metadataLoaded = true;
				console.log(
					`[AlphaTabManager] Encoded bravura_metadata.json for smuflFontSources. metadataLoaded: ${metadataLoaded}`
				);
			} catch (err: any) {
				console.error(
					"[AlphaTabManager] Failed to read/encode bravura_metadata.json:",
					err.message,
					err.stack // 添加堆栈信息
				);
			}
		} else {
			console.warn(
				`[AlphaTabManager] bravura_metadata.json not found at: ${metadataPath}. metadataLoaded: ${metadataLoaded}`
			);
		}

		if (primaryFontLoaded && metadataLoaded) {
			this.settings.core.smuflFontSources = fontDataUrls;
			essentialFontDataLoaded = true;
			console.log(
				"[AlphaTabManager] smuflFontSources populated. Keys:",
				Object.keys(fontDataUrls)
			);
			// 避免打印整个 data:URL，因为它太长了
			// console.log("[AlphaTabManager] smuflFontSources content (keys only):", Object.keys(this.settings.core.smuflFontSources));
		} else {
			const missing = `${
				!primaryFontLoaded ? "Primary font (WOFF2/WOFF)" : ""
			} ${!metadataLoaded ? "Metadata JSON" : ""}`;
			console.error(
				`[AlphaTabManager] CRITICAL: Essential font data missing: ${missing.trim()}. Cannot proceed.`
			);
			this.eventHandlers.onError?.({
				message: `字体数据缺失 (${missing.trim()})，无法渲染乐谱。`,
			});
			return;
		}

		// @ts-ignore
		let originalAlphaTabFontGlobal: string | undefined =
			globalThis.ALPHATAB_FONT;
		const pseudoFontUrlForStyleCreation = `file:///${fontAssetsPath.replace(
			/\\/g,
			"/"
		)}/`;
		console.log(
			`[AlphaTabManager] originalAlphaTabFontGlobal before set: ${originalAlphaTabFontGlobal}`
		);
		console.log(
			`[AlphaTabManager] pseudoFontUrlForStyleCreation to be set: ${pseudoFontUrlForStyleCreation}`
		);
		// @ts-ignore
		globalThis.ALPHATAB_FONT = pseudoFontUrlForStyleCreation;
		console.log(
			`[AlphaTabManager] Temporarily set globalThis.ALPHATAB_FONT = "${globalThis.ALPHATAB_FONT}"`
		);
		console.log("[AlphaTabManager] --- Font Loading Strategy END ---");

		this.settings.display.scale = 0.8;
		this.settings.display.layoutMode = LayoutMode.Page;
		this.settings.player.enableCursor = true;
		this.settings.player.scrollMode = ScrollMode.Continuous;
		this.settings.player.scrollElement = this.viewportElement;
		this.settings.player.scrollOffsetY = -30;

		// ... (themeColors logic, 保持不变)

		let originalProcess: any, originalModule: any;
		let modifiedGlobals = false;
		console.log(
			"[AlphaTabManager] --- Environment Hacking & API Instantiation START ---"
		);
		try {
			if (typeof process !== "undefined") {
				console.log(
					"[AlphaTabManager] 'process' global found, attempting to undefine."
				);
				originalProcess = globalThis.process;
				globalThis.process = undefined as any;
				modifiedGlobals = true;
			}
			if (typeof module !== "undefined") {
				console.log(
					"[AlphaTabManager] 'module' global found, attempting to undefine."
				);
				originalModule = globalThis.module;
				globalThis.module = undefined as any;
				modifiedGlobals = true;
			}

			if (alphaTab.Environment && typeof WebPlatform !== "undefined") {
				console.log(
					`[AlphaTabManager] Current alphaTab.Environment.webPlatform: ${alphaTab.Environment.webPlatform}`
				);
				alphaTab.Environment.webPlatform = WebPlatform.Browser;
				console.log(
					`[AlphaTabManager] Environment.webPlatform overridden to Browser (${WebPlatform.Browser}).`
				);
			} else {
				console.warn(
					"[AlphaTabManager] alphaTab.Environment or WebPlatform not available for overriding."
				);
			}

			console.log(
				"[AlphaTabManager] Attempting to instantiate AlphaTabApi. Final settings to be passed (smuflFontSources keys only):",
				JSON.stringify(
					this.settings,
					(k, v) => {
						if (
							k === "smuflFontSources" &&
							v &&
							typeof v === "object"
						) {
							return Object.keys(v); // 只打印 smuflFontSources 的键
						}
						if (v instanceof HTMLElement) {
							// 避免循环引用和过大对象
							return `HTMLElement<${v.tagName}>`;
						}
						return v;
					},
					2
				)
			);
			// 记录一下 settings 对象中几个关键字体相关的值
			console.log("[AlphaTabManager] Key settings before API init:", {
				"settings.core.fontDirectory": this.settings.core.fontDirectory,
				"settings.core.scriptFile": this.settings.core.scriptFile,
				"settings.core.smuflFontSources (keys)": this.settings.core
					.smuflFontSources
					? Object.keys(this.settings.core.smuflFontSources)
					: null,
				"globalThis.ALPHATAB_FONT": globalThis.ALPHATAB_FONT,
			});

			this.api = new alphaTab.AlphaTabApi(
				this.mainElement,
				this.settings
			);
			console.log(
				"[AlphaTabManager] AlphaTabApi instantiated successfully."
			);
			this.bindEvents();
		} catch (e: any) {
			console.error(
				"[AlphaTabManager] FAILED to initialize AlphaTab API. Error:",
				e.message,
				e.stack // 确保打印堆栈信息
			);
			this.eventHandlers.onError?.({
				message: `AlphaTab API 初始化失败: ${e.message}`,
			});
		} finally {
			console.log(
				"[AlphaTabManager] In 'finally' block for API instantiation."
			);
			if (modifiedGlobals) {
				if (originalProcess !== undefined) {
					globalThis.process = originalProcess;
					console.log("[AlphaTabManager] Restored 'process' global.");
				}
				if (originalModule !== undefined) {
					globalThis.module = originalModule;
					console.log("[AlphaTabManager] Restored 'module' global.");
				}
			}
			// @ts-ignore
			if (globalThis.ALPHATAB_FONT === pseudoFontUrlForStyleCreation) {
				if (originalAlphaTabFontGlobal !== undefined) {
					// @ts-ignore
					globalThis.ALPHATAB_FONT = originalAlphaTabFontGlobal;
					console.log(
						`[AlphaTabManager] Restored globalThis.ALPHATAB_FONT to: ${originalAlphaTabFontGlobal}`
					);
				} else {
					// @ts-ignore
					delete globalThis.ALPHATAB_FONT;
					console.log(
						"[AlphaTabManager] Deleted globalThis.ALPHATAB_FONT as it was originally undefined."
					);
				}
			} else {
				// @ts-ignore
				console.warn(
					`[AlphaTabManager] globalThis.ALPHATAB_FONT was not as expected in finally. Current: ${globalThis.ALPHATAB_FONT}, Expected: ${pseudoFontUrlForStyleCreation}`
				);
			}
			console.log(
				"[AlphaTabManager] --- Environment Hacking & API Instantiation END ---"
			);
		}

		if (!this.api) {
			console.error(
				"[AlphaTabManager] API is NULL after instantiation attempt. Cannot load score."
			);
			return;
		}

		console.log(
			`[AlphaTabManager] Attempting to load score data for ${file.name} into API.`
		);
		try {
			const scoreData = await this.app.vault.readBinary(file);
			console.log(
				`[AlphaTabManager] Score data read (${scoreData.byteLength} bytes). Calling api.load().`
			);
			await this.api.load(new Uint8Array(scoreData)); // 确保 await
			console.log(
				`[AlphaTabManager] api.load() called for ${file.name}. Waiting for scoreLoaded event.`
			);
		} catch (e: any) {
			console.error(
				`[AlphaTabManager] Error loading score data for ${file.path}:`,
				e.message,
				e.stack // 确保打印堆栈信息
			);
			this.eventHandlers.onError?.({
				message: `乐谱文件加载失败: ${e.message}`,
			});
		}
	}

	private bindEvents() {
		if (!this.api) {
			console.warn(
				"[AlphaTabManager] bindEvents: API is null, skipping event binding."
			);
			return;
		}
		console.log("[AlphaTabManager] Binding AlphaTab API events.");

		this.api.error?.on?.((error: any) => {
			console.error("[AlphaTabManager] API Event: error", error); // 详细打印错误对象
			this.eventHandlers.onError!(error);
		});
		this.api.renderStarted?.on?.(() => {
			console.log("[AlphaTabManager] API Event: renderStarted");
			this.eventHandlers.onRenderStarted!();
		});
		this.api.renderFinished?.on?.((args: any) => {
			// 打印事件参数
			console.log("[AlphaTabManager] API Event: renderFinished", args);
			// 检查此时 DOM 中是否存在 alphaTabStyle
			const styleElement =
				document.getElementById("alphaTabStyle") ||
				document.querySelector('[id^="alphaTabStyle"]');
			console.log(
				`[AlphaTabManager] renderFinished: alphaTabStyle element check: ${
					styleElement ? "FOUND" : "NOT FOUND"
				}`
			);
			if (styleElement) {
				console.log(
					`[AlphaTabManager] alphaTabStyle content (first 100 chars): ${styleElement.innerHTML.substring(
						0,
						100
					)}`
				);
			}
			// 检查 document.fonts.check
			const musicFontFamily =
				this.api?.settings.display.resources.smuflFont.families[0] ||
				"alphaTab"; // 获取实际使用的音乐字体家族名
			console.log(
				`[AlphaTabManager] renderFinished: Checking document.fonts for family '${musicFontFamily}': ${document.fonts.check(
					`1em ${musicFontFamily}`
				)}`
			);

			this.eventHandlers.onRenderFinished!(args); // 确保传递参数
		});
		this.api.scoreLoaded?.on?.((score: Score | null) => {
			console.log(
				"[AlphaTabManager] API Event: scoreLoaded",
				score
					? {
							title: score.title,
							artist: score.artist,
							trackCount: score.tracks.length,
					  }
					: null
			);
			this.score = score;
			if (score && score.tracks && score.tracks.length > 0) {
				this.renderTracks = [score.tracks[0]];
				console.log(
					`[AlphaTabManager] scoreLoaded: Default renderTracks set to track 0: ${score.tracks[0].name}`
				);
			} else {
				this.renderTracks = [];
				console.log(
					"[AlphaTabManager] scoreLoaded: No tracks in score or score is null, renderTracks is empty."
				);
			}
			this.eventHandlers.onScoreLoaded?.(score);
		});
		this.api.playerStateChanged?.on?.((args: any) => {
			console.log(
				"[AlphaTabManager] API Event: playerStateChanged",
				args
			);
			this.eventHandlers.onPlayerStateChanged!(args);
		});
	}

	playPause() {
		console.log("[AlphaTabManager] playPause called.");
		this.api?.playPause();
	}
	stop() {
		console.log("[AlphaTabManager] stop called.");
		this.api?.stop();
	}

	public updateRenderTracks(tracks: Track[]) {
		console.log(
			`[AlphaTabManager] updateRenderTracks called with ${tracks.length} tracks.`
		);
		this.renderTracks = tracks;
		this.api?.renderTracks(tracks);
		console.log(
			"[AlphaTabManager] api.renderTracks called. Calling api.render()."
		);
		this.api?.render();
	}

	public getAllTracks(): Track[] {
		// console.log("[AlphaTabManager] getAllTracks called."); // 这个可能会频繁调用，酌情保留
		return this.score?.tracks || [];
	}

	public getSelectedRenderTracks(): Track[] {
		// console.log("[AlphaTabManager] getSelectedRenderTracks called."); // 这个可能会频繁调用，酌情保留
		return this.renderTracks;
	}

	render() {
		console.log("[AlphaTabManager] render called.");
		this.api?.render();
	}

	destroy() {
		console.log("[AlphaTabManager] destroy called.");
		if (this.api) {
			this.api.destroy();
			console.log("[AlphaTabManager] Actual API destroy completed.");
		}
		this.api = null;
		this.score = null;
		this.renderTracks = [];
		console.log(
			"[AlphaTabManager] AlphaTabManager internal state cleaned up after destroy."
		);
	}
}
