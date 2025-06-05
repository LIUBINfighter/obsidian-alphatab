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
			this.settings.core.fontDirectory = null;
			this.settings.core.smuflFontSources = fontDataUrls;
			fontLoadMode = "dataurl";
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

		// 新增：检测缺失格式并回退到 fetch 加载
		{
			const expectedExts = fontFiles.map((f) => f.ext);
			const loadedExts = Object.keys(fontDataUrls);
			const missingExts = expectedExts.filter((ext) => !loadedExts.includes(ext));
			const serverUrl = (this.pluginInstance as any).resourceServerBaseUrl;
			console.log(
				`[AlphaTabManager Debug] Checking missing fonts: expected ${expectedExts.join(", ")}, got ${loadedExts.join(", ")}`
			);
			if (missingExts.length > 0 && serverUrl) {
				this.settings.core.fontDirectory = `${serverUrl}/assets/alphatab/font/`;
				fontLoadMode = "fetch";
				console.log(`[AlphaTabManager Debug] Switch to fetch mode. fontDirectory = '${this.settings.core.fontDirectory}'`);
			} else {
				console.log("[AlphaTabManager Debug] No missing fonts or serverUrl not available.");
			}
		}

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

			// 尝试多种方法对AlphaTab的字体加载系统进行monkey patching

			// 方法1: 替换WebPlatform.createStyleElement（如果存在）
			let patchSucceeded = false;
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
				
				console.log("[AlphaTabManager] Patched WebPlatform.createStyleElement");
				patchSucceeded = true;
			}
			
			// 方法2: 替换全局document.createElement，特别针对style元素
			const originalCreateElement = document.createElement;
			document.createElement = function(tagName: string, options?: ElementCreationOptions) {
				const element = originalCreateElement.call(document, tagName, options);
				if (tagName.toLowerCase() === 'style') {
					// 添加属性以便之后标识
					element.setAttribute('data-intercepted', 'true');
					
					// 替代appendChild方法，拦截与字体相关的样式添加
					const originalAppendChild = element.appendChild;
					element.appendChild = function(child: Node) {
						if (child.nodeType === Node.TEXT_NODE) {
							const content = child.textContent || '';
							if (content.includes('@font-face') && 
								(content.includes('Bravura') || content.includes('alphatab'))) {
								console.log('[AlphaTabManager] Intercepted font-face injection');
								// 返回一个虚拟节点而不实际追加
								return child;
							}
						}
						return originalAppendChild.call(this, child);
					};
				}
				return element;
			};
			console.log("[AlphaTabManager] Monkey patched document.createElement for style elements");
			
			// 方法3: 尝试在alphaTab对象上寻找字体相关功能并打补丁
			if (alphaTab.platform && alphaTab.platform.fontCheckers) {
				alphaTab.platform.fontCheckers = {
					checkFont: (name: string) => Promise.resolve(true)
				};
				console.log('[AlphaTabManager] Patched fontCheckers.checkFont to always resolve true');
				patchSucceeded = true;
			}
			
			// 如果上述方法都找不到目标对象，尝试遍历alphaTab对象寻找字体相关方法
			if (!patchSucceeded) {
				console.log('[AlphaTabManager] Attempting to find font loading related objects in alphaTab');
				this.tryFindAndPatchFontMethods(alphaTab);
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
	
	/**
	 * 尝试在复杂对象中找到与字体相关的方法并进行monkey patching
	 */
	private tryFindAndPatchFontMethods(obj: any, visited = new Set()) {
		if (!obj || visited.has(obj) || typeof obj !== 'object') return;
		visited.add(obj);
		
		try {
			// 遍历所有属性，搜索特定名称或特征
			for (const key in obj) {
				try {
					if (key.toLowerCase().includes('font') || 
					   (typeof key === 'string' && (
						key.includes('createStyle') || 
						key.includes('check') || 
						key.includes('load')
					   ))) {
						console.log(`[AlphaTabManager] Found potential font-related key: ${key}`);
						
						// 如果是函数，尝试替换它
						if (typeof obj[key] === 'function') {
							const originalFn = obj[key];
							obj[key] = function(...args: any[]) {
								console.log(`[AlphaTabManager] Intercepted call to ${key}`, args);
								
								// 如果函数名称与字体加载相关，返回成功状态
								if (key.toLowerCase().includes('fontavail') || 
									key.toLowerCase().includes('checkfont')) {
									return Promise.resolve(true);
								}
								
								// 默认行为
								return originalFn.apply(this, args);
							};
							console.log(`[AlphaTabManager] Patched ${key} function`);
						}
					}
					
					// 递归检查子对象，但避免循环引用
					if (obj[key] && typeof obj[key] === 'object' && !visited.has(obj[key])) {
						this.tryFindAndPatchFontMethods(obj[key], visited);
					}
				} catch (e) {
					// 忽略属性访问错误
				}
			}
		} catch (e) {
			console.warn('[AlphaTabManager] Error in tryFindAndPatchFontMethods:', e);
		}
	}
} // 这里补充闭合AlphaTabManager类的大括号
