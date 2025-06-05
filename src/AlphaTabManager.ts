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
} from "@coderline/alphatab"; // WebPlatform added
import * as fs from "fs";
import * as path from "path";
import { Notice, TFile, App } from "obsidian";
// REMOVE: import { getPluginAssetHttpUrl } from "./utils"; // 不再需要此函数用于字体加载

// 添加缺失的接口定义
export interface AlphaTabManagerOptions {
	pluginInstance: any;
	app: App;
	mainElement: HTMLElement;
	viewportElement: HTMLElement;
	onError?: (args: any) => void;
	onRenderStarted?: () => void;
	onRenderFinished?: () => void;
	onScoreLoaded?: (score: Score | null) => void;
	onPlayerStateChanged?: (args: any) => void;
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
	private renderTracks: Track[] = []; // To store currently selected tracks for rendering
	private renderWidth = 800;
	private darkMode: boolean = false;

	constructor(options: AlphaTabManagerOptions) {
		this.pluginInstance = options.pluginInstance;
		this.app = options.app;
		this.mainElement = options.mainElement;
		this.viewportElement = options.viewportElement;
		this.eventHandlers = options; // Store all event handlers
	}

	setDarkMode(isDark: boolean) {
		this.darkMode = isDark;
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
		this.settings.core.useWorkers = false;
		this.settings.player.enablePlayer = false;

		// 强制禁用任何网络资源加载 - 非常重要的字体设置
		this.settings.core.fontDirectory = null;
		this.settings.core.scriptFile = null;

		this.settings.display.scale = 0.8;
		this.settings.display.layoutMode = LayoutMode.Page;
		this.settings.player.enableCursor = true;
		this.settings.player.scrollMode = ScrollMode.Continuous;
		this.settings.player.scrollElement = this.viewportElement;
		this.settings.player.scrollOffsetY = -30;

		const themeColors = this.darkMode
			? {
					/* ... dark theme colors ... */
             }
			: {
					/* ... light theme colors ... */
             };
		Object.assign(this.settings.display.resources, themeColors);

		// --- 字体加载：完全基于 data:URL，禁用所有 HTTP 方式 ---
		const pluginRootPath = this.pluginInstance.actualPluginDir;
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

		let fontLoaded = false;
		let fontLoadMode = "none";
		const fontAssetsPath = path.join(
			pluginRootPath,
			"assets",
			"alphatab",
			"font"
		);
		const fontFiles = [
			{ ext: "woff", mime: "font/woff" },
			{ ext: "woff2", mime: "font/woff2" },
			{ ext: "otf", mime: "font/otf" },
			{ ext: "eot", mime: "application/vnd.ms-fontobject" },
			{ ext: "svg", mime: "image/svg+xml" },
		];

		const fontDataUrls: Record<string, string> = {};

		for (const { ext, mime } of fontFiles) {
			const fontPath = path.join(fontAssetsPath, `Bravura.${ext}`);
			if (fs.existsSync(fontPath)) {
				const fontBuffer = fs.readFileSync(fontPath);
				const fontBase64 = fontBuffer.toString("base64");
				fontDataUrls[ext] = `data:${mime};base64,${fontBase64}`;
				fontLoaded = true;
				console.log(
					`[AlphaTabManager] Encoded Bravura.${ext} as data:${mime}`
				);
			}
		}

		const metadataPath = path.join(fontAssetsPath, "bravura_metadata.json");
		if (fs.existsSync(metadataPath)) {
			try {
				const metadataStr = fs.readFileSync(metadataPath, "utf8");
				const metadataBase64 =
					Buffer.from(metadataStr).toString("base64");
				fontDataUrls[
					"json"
				] = `data:application/json;base64,${metadataBase64}`;
				console.log("[AlphaTabManager] Encoded bravura_metadata.json");
			} catch (err) {
				console.error(
					"[AlphaTabManager] Failed to load metadata JSON:",
					err
				);
			}
		} else {
			console.warn(
				"[AlphaTabManager] bravura_metadata.json not found at:",
				metadataPath
			);
		}

		if (fontDataUrls["svg"]) {
			fontDataUrls["svgz"] = fontDataUrls["svg"];
		}

		if (fontLoaded) {
			this.settings.core.fontDirectory = null;
			this.settings.core.smuflFontSources = fontDataUrls;
			fontLoadMode = "dataurl";

			console.log("[AlphaTabManager] Font settings:", {
				smuflFontSources: Object.keys(fontDataUrls),
				fontDataExample: fontDataUrls["woff"]
					? fontDataUrls["woff"].substring(0, 50) + "..."
					: "none",
				fontDirectory: this.settings.core.fontDirectory,
				scriptFile: this.settings.core.scriptFile,
			});
			
			this.injectBravuraFontFace(fontDataUrls);
			// ----------- 修正 FontSettings 构造问题 -----------
			const resources = this.settings.display.resources;
			if (!resources.musicFont || typeof resources.musicFont !== 'object') {
				console.log("[AlphaTabManager] initializeAndLoadScore: settings.display.resources.musicFont was not an object or was undefined/null. Initializing as plain object.");
				// @ts-ignore
				resources.musicFont = {};
			}
			// @ts-ignore
			resources.musicFont.families = ['Bravura', 'alphaTab'];
			// @ts-ignore
			resources.musicFont.size = alphaTab.Environment.MusicFontSize;
			// @ts-ignore
			resources.musicFont.style = alphaTab.model.FontStyle?.Plain ?? 0;
			// @ts-ignore
			resources.musicFont.weight = alphaTab.model.FontWeight?.Regular ?? 0;
			console.log('[AlphaTabManager] initializeAndLoadScore: Set settings.display.resources.musicFont.families to:',
				// @ts-ignore
				resources.musicFont.families);
			// -----------------------------------------------
		} else {
			console.error(
				"[AlphaTabManager] No Bravura font files found for data:URL injection."
			);
			this.eventHandlers.onError?.({
				message: `未找到 Bravura 字体文件，无法渲染。路径: ${fontAssetsPath}`,
			});
			return;
		}
		console.log(`[AlphaTabManager] Font load mode: ${fontLoadMode}`);

		// ----------- Patch BrowserUiFacade.prototype.createStyleElements -----------
		console.log("%c--- DIAGNOSING BrowserUiFacade.createStyleElements PATCH ---", "color: orange; font-weight: bold;");
		// @ts-ignore
		console.log("typeof alphaTab.BrowserUiFacade:", typeof alphaTab.BrowserUiFacade);
		if (alphaTab.BrowserUiFacade) {
			// @ts-ignore
			console.log("alphaTab.BrowserUiFacade.prototype exists:", !!alphaTab.BrowserUiFacade.prototype);
			if (alphaTab.BrowserUiFacade.prototype) {
				// @ts-ignore
				console.log("typeof .createStyleElements:", typeof alphaTab.BrowserUiFacade.prototype.createStyleElements);
			}
		}
		console.log("%c--- END DIAGNOSING ---", "color: orange; font-weight: bold;");

		// @ts-ignore
		if (alphaTab.BrowserUiFacade && alphaTab.BrowserUiFacade.prototype && typeof alphaTab.BrowserUiFacade.prototype.createStyleElements === 'function') {
			// @ts-ignore
			const originalBrowserUiFacade_createStyleElements = alphaTab.BrowserUiFacade.prototype.createStyleElements;
			// @ts-ignore
			alphaTab.BrowserUiFacade.prototype.createStyleElements = function(settingsParam: alphaTab.Settings) {
				console.warn("[AlphaTabPatcher] Intercepting BrowserUiFacade.prototype.createStyleElements");

				// 1. 调用原始的共享样式创建
				// @ts-ignore
				const rootDoc = this.rootContainer?.element?.ownerDocument;
				if (rootDoc && alphaTab.BrowserUiFacade.createSharedStyleElement) {
					// @ts-ignore
					alphaTab.BrowserUiFacade.createSharedStyleElement(rootDoc);
					console.log("[AlphaTabPatcher] Called original BrowserUiFacade.createSharedStyleElement");
				} else {
					console.warn("[AlphaTabPatcher] Could not call original BrowserUiFacade.createSharedStyleElement. Shared styles might be missing.");
				}

				// 2. 跳过原始方法中关于 SMuFL 字体的复杂处理
				console.log("[AlphaTabPatcher] Skipped AlphaTab's internal SMuFL font style creation and checker registration.");

				// 3. 设置 smuflFont 为我们手动注入的字体信息
				// @ts-ignore
				const facadeApiSettings = this._api?.settings ?? settingsParam;
				if (facadeApiSettings?.display?.resources) {
					// @ts-ignore
					const res = facadeApiSettings.display.resources;
					if (!res.smuflFont || typeof res.smuflFont !== 'object') {
						// @ts-ignore
						res.smuflFont = {};
					}
					// @ts-ignore
					res.smuflFont.families = ['Bravura', 'alphaTab'];
					// @ts-ignore
					res.smuflFont.size = alphaTab.Environment.MusicFontSize;
					// @ts-ignore
					res.smuflFont.style = alphaTab.model.FontStyle?.Plain ?? 0;
					// @ts-ignore
					res.smuflFont.weight = alphaTab.model.FontWeight?.Regular ?? 0;
					console.log("[AlphaTabPatcher] Ensured api.settings.display.resources.smuflFont uses families:",
						// @ts-ignore
						res.smuflFont.families);
				} else {
					console.error("[AlphaTabPatcher] Could not access api.settings.display.resources in patched createStyleElements.");
				}
			};
			console.log("[AlphaTabManager] Successfully Patched BrowserUiFacade.prototype.createStyleElements");
		} else {
			console.error("[AlphaTabManager] FAILED to patch BrowserUiFacade.createStyleElements.");
		}
		// ----------------------------------------------------------

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
				// Check WebPlatform from alphaTab import
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

			this.api = new alphaTab.AlphaTabApi(
				this.mainElement,
				this.settings
			);
			console.log("[AlphaTabManager] AlphaTabApi instantiated.");

			// 初始化后再次检查确保字体设置没有被修改
			if (this.api) {
				// @ts-ignore - 确保 alphaTab 没有内部修改我们的设置
				if (this.api.settings && this.api.settings.core) {
					// @ts-ignore
					// this.api.settings.core.fontDirectory = null;

					// 可以尝试直接向 API 实例修改字体数据
					// @ts-ignore
					if (
						!this.api.settings.core.smuflFontSources ||
						typeof this.api.settings.core.smuflFontSources !==
							"object"
					) {
						// @ts-ignore
						this.api.settings.core.smuflFontSources = fontDataUrls;
						console.log(
							"[AlphaTabManager] Corrected font data after API init."
						);
					}

					// @ts-ignore
					console.log("[AlphaTabManager] Post-init font settings:", {
						// @ts-ignore
						smuflFontSources: Object.keys(
							this.api.settings.core.smuflFontSources || {}
						),
						// @ts-ignore
						fontDirectory: this.api.settings.core.fontDirectory,
					});
				}
			}

			this.bindEvents(); // 绑定事件
		} catch (e: any) {
			console.error(
				"[AlphaTabManager] FAILED to initialize AlphaTab API. Error:",
				e.message,
				e.stack
			);
			this.eventHandlers.onError?.({
				message: `AlphaTab API 初始化失败: ${e.message}`,
			});
			// 确保全局变量在API初始化失败时也能恢复
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
			return; // 如果API未初始化，则停止
		}

		// 加载乐谱数据
		try {
			const scoreData = await this.app.vault.readBinary(file);
			await this.api.load(new Uint8Array(scoreData));
			console.log(
				`[AlphaTabManager] Score loading initiated for ${file.name}.`
			);
		} catch (e: any) {
			console.error(
				`[AlphaTabManager] Error loading score data for ${file.path}:`,
				e.message
			);
			this.eventHandlers.onError?.({
				message: `乐谱文件加载失败: ${e.message}`,
			});
		}
	}

	private bindEvents() {
		if (!this.api) return;
		this.api.error?.on?.(this.eventHandlers.onError!);

		this.api.renderStarted?.on?.(() => {
			if (this.api?.settings?.display?.resources?.smuflFont) {
				// @ts-ignore
				const musicFontInUse = this.api.settings.display.resources.smuflFont;
				console.log(`[AlphaTabManager] renderStarted: Music font in use by API settings: families=${JSON.stringify(musicFontInUse.families)}, size=${musicFontInUse.size}`);
				if (!musicFontInUse.families?.includes('Bravura') && !musicFontInUse.families?.includes('alphaTab')) {
					console.warn("[AlphaTabManager] renderStarted: Music font families do not seem to be correctly set to 'Bravura' or 'alphaTab'!", musicFontInUse.families);
				}
			} else {
				console.warn("[AlphaTabManager] renderStarted: api.settings.display.resources.smuflFont is not available or not an object.");
			}
			this.eventHandlers.onRenderStarted?.();
		});
		// --------------------------------------
		this.api.renderFinished?.on?.(this.eventHandlers.onRenderFinished!);
		this.api.scoreLoaded?.on?.((score: Score | null) => {
			this.score = score;
			if (score && score.tracks && score.tracks.length > 0) {
				this.renderTracks = [score.tracks[0]];
			} else {
				this.renderTracks = [];
			}
			this.eventHandlers.onScoreLoaded?.(score);
		});
		this.api.playerStateChanged?.on?.(
			this.eventHandlers.onPlayerStateChanged!
		);
	}

	playPause() {
		this.api?.playPause();
	}
	stop() {
		this.api?.stop();
	}

	// 更新要渲染的音轨
	public updateRenderTracks(tracks: Track[]) {
		this.renderTracks = tracks; // Store selection
		this.api?.renderTracks(tracks);
		this.api?.render(); // Re-render after track selection
	}

	// 获取当前所有音轨（用于Modal）
	public getAllTracks(): Track[] {
		return this.score?.tracks || [];
	}

	// 获取当前选择用于渲染的音轨（用于Modal初始化）
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

	/**
	 * 手动将Bravura字体的@font-face规则注入到文档中
	 */
	private injectBravuraFontFace(fontDataUrls: Record<string, string>) {
		try {
			// 移除可能已存在的字体样式
			const existingStyle = document.getElementById("alphatab-bravura-font");
			if (existingStyle) {
				existingStyle.remove();
				console.log("[AlphaTabManager] Removed existing font style");
			}
			
			// 创建多个字体规则以增加兼容性
			let fontFaceCss = "";
			
			// 创建主要的Bravura字体规则
			fontFaceCss += `@font-face {
				font-family: 'Bravura';
				font-style: normal;
				font-weight: normal;
				font-display: block;
				src: `;
				
			const sources = [];
			
			// 添加各种格式的字体源 - 确保正确顺序（现代浏览器优先）
			if (fontDataUrls["woff2"]) {
				sources.push(`url('${fontDataUrls["woff2"]}') format('woff2')`);
			}
			if (fontDataUrls["woff"]) {
				sources.push(`url('${fontDataUrls["woff"]}') format('woff')`);
			}
			if (fontDataUrls["otf"]) {
				sources.push(`url('${fontDataUrls["otf"]}') format('opentype')`);
			}
			if (fontDataUrls["eot"]) {
				sources.push(`url('${fontDataUrls["eot"]}?#iefix') format('embedded-opentype')`);
			}
			if (fontDataUrls["svg"]) {
				sources.push(`url('${fontDataUrls["svg"]}#Bravura') format('svg')`);
			}
			
			// 完成主字体CSS
			fontFaceCss += sources.join(", ");
			fontFaceCss += ";\n}\n";
			
			// 添加alphaTab命名的字体规则，与AlphaTab内部期望一致
			fontFaceCss += `@font-face {
				font-family: 'alphaTab';
				font-style: normal;
				font-weight: normal;
				font-display: block;
				src: ${sources.join(", ")};
			}\n`;
			
			// 创建并附加样式元素
			const styleElement = document.createElement("style");
			styleElement.setAttribute("id", "alphatab-bravura-font");
			styleElement.setAttribute("type", "text/css");
			styleElement.textContent = fontFaceCss;
			document.head.appendChild(styleElement);
			
			console.log("[AlphaTabManager] Manually injected Bravura @font-face with sources:", 
				Object.keys(fontDataUrls).filter(key => sources.some(s => s.includes(key))));
			
			// 预加载字体以确保可用性
			this.preloadBravuraFont(fontDataUrls);
		} catch (err) {
			console.error("[AlphaTabManager] Error injecting Bravura font face:", err);
		}
	}
	
	/**
	 * 预加载Bravura字体，确保它被浏览器正确加载
	 */
	private preloadBravuraFont(fontDataUrls: Record<string, string>) {
		// 1. 尝试使用FontFace API（现代浏览器）
		try {
			if (window.FontFace) {
				// 尝试woff2和woff格式
				const fontUrl = fontDataUrls["woff2"] || fontDataUrls["woff"];
				if (fontUrl) {
					const fontFace = new FontFace('Bravura', `url(${fontUrl})`, {
						style: 'normal',
						weight: 'normal',
						display: 'block'
					});
					
					fontFace.load().then(() => {
						// 添加到FontFaceSet
						document.fonts.add(fontFace);
						console.log("[AlphaTabManager] Bravura font preloaded with FontFace API");
					}).catch(err => {
						console.error("[AlphaTabManager] Error preloading Bravura with FontFace API:", err);
					});
					
					// 同样尝试为alphaTab名称创建字体
					const altFontFace = new FontFace('alphaTab', `url(${fontUrl})`, {
						style: 'normal',
						weight: 'normal',
						display: 'block'
					});
					
					document.fonts.add(altFontFace);
				}
			}
		} catch (e) {
			console.warn("[AlphaTabManager] FontFace API preload failed:", e);
		}
		
		// 2. 强制创建一个不可见元素来触发字体加载
		try {
			const preloader = document.createElement('div');
			preloader.style.position = 'absolute';
			preloader.style.left = '-9999px';
			preloader.style.visibility = 'hidden';
			preloader.style.fontFamily = 'Bravura, alphaTab';
			preloader.textContent = 'abcdefghijklmnopqrstuvwxyz';
			document.body.appendChild(preloader);
			
			// 几秒后移除
			setTimeout(() => {
				document.body.removeChild(preloader);
			}, 5000);
		} catch (e) {
			console.warn("[AlphaTabManager] Font preload element creation failed:", e);
		}
	}
} // 这里补充闭合AlphaTabManager类的大括号
