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

// ... AlphaTabManagerOptions interface remains the same ...

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
		// 确保 pluginInstance.actualPluginDir 由 main.ts 正确设置并传递过来
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

		// 编码所有 Bravura 字体文件
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

		// 使用普通 JavaScript 对象而非 Map
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

		// 添加元数据 JSON 文件 - SMuFL 字体需要这个
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

		// 兼容 AlphaTab 可能的 fallback：svg 需加 id
		if (fontDataUrls["svg"]) {
			fontDataUrls["svgz"] = fontDataUrls["svg"];
		}

		if (fontLoaded) {
			// 按照 AlphaTab 文档设置字体数据
			this.settings.core.fontDirectory = null;
            // this.settings.core.fontDirectory = "/font/"; // 或者 "./fonts/" 或 "/" 或插件的某个虚拟子路径
			
			// 直接使用 JS 对象，而非 Map
			this.settings.core.smuflFontSources = fontDataUrls;
			fontLoadMode = "dataurl";

			// 打印所有字体设置以便调试（注意我们现在显示更多信息）
			console.log("[AlphaTabManager] Font settings:", {
				smuflFontSources: Object.keys(fontDataUrls),
				fontDataExample: fontDataUrls["woff"]
					? fontDataUrls["woff"].substring(0, 50) + "..."
					: "none",
				fontDirectory: this.settings.core.fontDirectory,
				scriptFile: this.settings.core.scriptFile,
			});
			
			// 手动注入@font-face规则，取代AlphaTab的自动注入
			this.injectBravuraFontFace(fontDataUrls);
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

		// 环境 hack (用于 API 实例化)
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

			// Monkey Patch AlphaTab的字体样式注入函数，阻止自动添加@font-face
			if (alphaTab.WebPlatform && alphaTab.WebPlatform.prototype) {
				// 保存原始方法引用
				const originalCreateStyleElement = alphaTab.WebPlatform.prototype.createStyleElement;
				
				// 替换方法
				alphaTab.WebPlatform.prototype.createStyleElement = function(
					idOrClass: string, 
					styles?: string
				) {
					// 检查是否为Bravura字体相关的样式
					if (styles && 
						(styles.includes("@font-face") && 
						(styles.includes("Bravura") || styles.includes("alphatab")))) {
						console.log("[AlphaTabManager] Suppressed AlphaTab font style injection:", 
							idOrClass?.substring(0, 30) + "...");
						
						// 返回一个虚拟元素，不添加到DOM
						const dummy = document.createElement("style");
						dummy.setAttribute("data-alphatab-suppressed", "true");
						return dummy;
					}
					
					// 其他样式正常处理
					return originalCreateStyleElement.apply(this, arguments);
				};
				
				console.log("[AlphaTabManager] Monkey patched AlphaTab's createStyleElement");
			} else {
				console.warn("[AlphaTabManager] Could not patch AlphaTab WebPlatform - font injection may still occur automatically");
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
					this.api.settings.core.fontDirectory = null;

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
		// Renamed from bindEvents to avoid conflict if superclass has it
		if (!this.api) return;
		// 使用可选链和函数类型检查确保安全绑定
		this.api.error?.on?.(this.eventHandlers.onError!);
		this.api.renderStarted?.on?.(this.eventHandlers.onRenderStarted!);
		this.api.renderFinished?.on?.(this.eventHandlers.onRenderFinished!);
		this.api.scoreLoaded?.on?.((score: Score | null) => {
			// Capture score here
			this.score = score; // Store the loaded score
			if (score && score.tracks && score.tracks.length > 0) {
				this.renderTracks = [score.tracks[0]]; // Default to rendering the first track
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
			// 创建字体CSS
			let fontFaceCss = `@font-face {
				font-family: 'Bravura';
				font-style: normal;
				font-weight: 400;
				src: `;
				
			const sources = [];
			
			// 添加各种格式的字体源
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
				sources.push(`url('${fontDataUrls["eot"]}') format('embedded-opentype')`);
			}
			if (fontDataUrls["svg"]) {
				sources.push(`url('${fontDataUrls["svg"]}') format('svg')`);
			}
			
			// 完成CSS
			fontFaceCss += sources.join(", ");
			fontFaceCss += ";\n}\n";
			
			// 创建并附加样式元素
			const styleElement = document.createElement("style");
			styleElement.setAttribute("id", "alphatab-bravura-font");
			styleElement.setAttribute("type", "text/css");
			styleElement.textContent = fontFaceCss;
			document.head.appendChild(styleElement);
			
			console.log("[AlphaTabManager] Manually injected Bravura @font-face with sources:", 
				Object.keys(fontDataUrls).filter(key => sources.some(s => s.includes(key))));
		} catch (err) {
			console.error("[AlphaTabManager] Error injecting Bravura font face:", err);
		}
	}
}
