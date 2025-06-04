import * as fs from "fs";
import * as path from "path";
// --- Nodejs modules ---
import {
	App,
	FileView,
	Modal,
	Notice,
	Setting,
	TFile,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import * as alphaTab from "@coderline/alphatab";
import {
	model,
	type AlphaTabApi,
	type Settings,
	type PlayerStateChangedEventArgs,
	type Score,
	type Track,
	// FontFileFormat, // 添加FontFileFormat导入
	LayoutMode,
	ScrollMode,
	// PlayerState // 导入PlayerState枚举
} from "@coderline/alphatab"; // Or your specific import path for alphaTab

export const VIEW_TYPE_TAB = "tab-view";


// 在 TabView 的构造函数或 initializeAlphaTabAndLoadScore 的早期阶段尝试：
// @ts-ignore
if (alphaTab.Environment.webPlatform === alphaTab.WebPlatform.NodeJs) {
	// 假设 WebPlatform 枚举值可访问
	console.warn(
		"[AlphaTab Debug] Forcibly attempting to override cached Environment.webPlatform from NodeJs to Browser."
	);
	try {
		// @ts-ignore
		alphaTab.Environment.webPlatform = alphaTab.WebPlatform.Browser; // 或者 BrowserModule
		// @ts-ignore
		console.log(
			"[AlphaTab Debug] Environment.webPlatform overridden. New value:",
			alphaTab.Environment.webPlatform,
			alphaTab.WebPlatform[alphaTab.Environment.webPlatform]
		);
	} catch (e) {
		console.error(
			"[AlphaTab Debug] Failed to override Environment.webPlatform:",
			e
		);
	}
}

// 然后在 initializeAlphaTabAndLoadScore 中，仍然进行 process 和 module 的临时移除，
// 因为 AlphaTabApi 构造函数内部可能还有其他基于这些全局变量的即时判断或操作，
// 或者其依赖的组件会进行判断。
// BrowserUiFacade 构造函数中的那段 if 判断是基于 Environment.webPlatform 静态属性的，
// 所以我们主要目标是改变那个静态属性。


// TracksModal class (remains the same from your provided code)
export class TracksModal extends Modal {
	tracks: Track[];
	renderTracks: Set<Track>;
	onChange?: (tracks?: Track[]) => void;

	constructor(app: App, tracks: Track[], onChange?: TracksModal["onChange"]) {
		super(app);
		this.tracks = tracks;
		this.onChange = onChange;
		this.renderTracks = new Set(tracks.length > 0 ? [tracks[0]] : []); // Default to first track selected
		this.modalEl.addClass("tracks-modal");
	}
	onOpen = () => {
		this.contentEl.empty();
		this.titleEl.setText("Select Tracks to Display");
		this.tracks.forEach((track) => {
			new Setting(this.contentEl)
				.setName(track.name)
				.setDesc(track.shortName || `Track ${track.index + 1}`)
				.addToggle((toggle) => {
					toggle
						.setValue(this.renderTracks.has(track))
						.onChange((value) => {
							if (value) {
								this.renderTracks.add(track);
							} else {
								this.renderTracks.delete(track);
							}
							// No immediate re-render, selection confirmed on modal close or button
						});
				});
		});

		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("Apply")
					.setCta()
					.onClick(() => {
						this.onSelectTrack();
						this.close();
					})
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	};
	onSelectTrack = () => {
		const selectTracks = Array.from(this.renderTracks).sort(
			(a, b) => a.index - b.index
		);
		this.onChange?.(selectTracks);
	};
	onClose = () => {
		this.contentEl.empty();
	};
	setTracks(tracks: Track[]) {
		this.tracks = tracks;
		// Reset selection to default (e.g., first track) or persisted selection
		this.renderTracks = new Set(tracks.length > 0 ? [tracks[0]] : []);
	}
	setRenderTracks(tracks: Track[]) {
		this.renderTracks = new Set(tracks);
	}
}

export class TabView extends FileView {
	private currentFile: TFile | null = null;
	private api: AlphaTabApi | null = null;
	private score: Score | null = null;
	private alphaTabSettings!: Settings; // Definite assignment assertion
	private renderTracks: Track[] = [];
	private renderWidth = 800;
	private darkMode: boolean;
	private tracksModal: TracksModal;

	private atWrap!: HTMLElement; // Definite assignment assertions for DOM elements
	private atOverlayRef!: HTMLElement;
	private atOverlayContentRef!: HTMLElement;
	private atMainRef!: HTMLElement;
	private atViewportRef!: HTMLElement;
	private atControlsRef!: HTMLElement;
	private playPauseButton!: HTMLButtonElement;
	private stopButton!: HTMLButtonElement;

	private pluginInstance: any; // Consider defining a more specific type if possible

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.pluginInstance = plugin;

		if (!this.pluginInstance?.manifest?.id) {
			console.error(
				"[AlphaTab Plugin Error] CRITICAL - Plugin instance or manifest.id is not valid in TabView constructor. Ensure 'this' (the plugin instance) is passed from main.ts."
			);
		} else {
			console.log(
				`[AlphaTab Debug] TabView constructor: Initialized with plugin ID '${this.pluginInstance.manifest.id}'`
			);
		}

		this.containerEl.addClasses([
			"alphatab-obsidian-plugin",
			"gtp-preview-container",
		]);
		this.tracksModal = new TracksModal(
			this.app,
			[],
			this.onChangeTracks.bind(this)
		);
		this.addAction("music", "Select Tracks", () => {
			if (this.score && this.score.tracks) {
				this.tracksModal.setTracks(this.score.tracks); // Ensure modal has current tracks
				this.tracksModal.setRenderTracks(this.renderTracks); // Ensure modal reflects current selection
			}
			this.tracksModal.open();
		});
		this.addAction(
			"download",
			"Download MIDI",
			this.downloadMidi.bind(this)
		);
		this.darkMode = document.body.className.includes("theme-dark"); // Initialize darkMode
	}

	getViewType(): string {
		return VIEW_TYPE_TAB;
	}

	getDisplayText() {
		if (this.score) {
			return `${this.score.title || "Untitled"} - ${
				this.score.artist || "Unknown Artist"
			}`;
		}
		return this.currentFile?.basename || "Guitar Tab";
	}

	override async onLoadFile(file: TFile): Promise<void> {
		console.log(`[AlphaTab Debug] onLoadFile: Loading file '${file.path}'`);
		this.currentFile = file;
		this.contentEl.empty(); // Clear previous content
		this.darkMode = document.body.className.includes("theme-dark");

		// Setup DOM structure
		this.atWrap = this.contentEl.createDiv({ cls: "at-wrap" });
		this.atOverlayRef = this.atWrap.createDiv({
			cls: "at-overlay",
			attr: { style: "display: none;" },
		});
		this.atOverlayContentRef = this.atOverlayRef.createDiv({
			cls: "at-overlay-content",
		});
		const atContent = this.atWrap.createDiv({ cls: "at-content" });
		this.atViewportRef = atContent.createDiv({ cls: "at-viewport" });
		this.atMainRef = this.atViewportRef.createDiv({ cls: "at-main" }); // AlphaTab target
		this.atControlsRef = this.atWrap.createDiv({ cls: "at-controls" });
		this.renderControlBar(this.atControlsRef);

		await this.initializeAlphaTabAndLoadScore(file);
	}

	private renderControlBar(container: HTMLElement) {
		container.empty();
		console.log("[AlphaTab Debug] Rendering control bar.");
		this.playPauseButton = container.createEl("button", { text: "Play" });
		this.playPauseButton.addEventListener("click", () => {
			if (this.api) {
				console.log("[AlphaTab Debug] Play/Pause button clicked.");
				this.api.playPause();
			} else {
				console.warn(
					"[AlphaTab Debug] Play/Pause clicked, but API not initialized."
				);
			}
		});
		this.stopButton = container.createEl("button", { text: "Stop" });
		this.stopButton.disabled = true; // Initially disabled
		this.stopButton.addEventListener("click", () => {
			if (this.api) {
				console.log("[AlphaTab Debug] Stop button clicked.");
				this.api.stop();
			} else {
				console.warn(
					"[AlphaTab Debug] Stop clicked, but API not initialized."
				);
			}
		});
	}

	private getPluginAssetHttpUrl(pluginId: string, assetPath: string): string {
		// This function already has good logging from your previous version.
		if (
			this.app.vault.adapter.getPluginAssetUrl &&
			typeof this.app.vault.adapter.getPluginAssetUrl === "function"
		) {
			try {
				const url = this.app.vault.adapter.getPluginAssetUrl(
					pluginId,
					assetPath
				);
				console.log(
					`[AlphaTab Debug] Using getPluginAssetUrl for '${assetPath}': ${url}`
				);
				return url;
			} catch (e: any) {
				console.warn(
					`[AlphaTab Debug] getPluginAssetUrl failed for '${assetPath}', falling back to manual construction. Error:`,
					e.message,
					e.stack
				);
			}
		} else {
			console.warn(
				`[AlphaTab Debug] this.app.vault.adapter.getPluginAssetUrl is not a function or not available. Falling back to manual URL construction for '${assetPath}'.`
			);
		}

		const normalizedAssetPath = assetPath.startsWith("/")
			? assetPath.substring(1)
			: assetPath;
		const manualUrl = `app://${pluginId}/${normalizedAssetPath}`;
		console.log(
			`[AlphaTab Debug] Manually constructed URL for '${assetPath}': ${manualUrl}`
		);
		return manualUrl;
	}

	private async initializeAlphaTabAndLoadScore(file: TFile) {
		console.log("[AlphaTab Debug] initializeAlphaTabAndLoadScore started.");
		if (this.api) {
			console.log(
				"[AlphaTab Debug] Destroying previous AlphaTab API instance."
			);
			try {
				this.api.destroy();
			} catch (e: any) {
				console.error(
					"[AlphaTab Plugin Error] Error destroying previous API instance:",
					e.message,
					e.stack
				);
			}
			this.api = null;
		}
		this.score = null;
		this.showLoadingOverlay("Initializing AlphaTab engine...");
		// Ensure DOM is ready for width calculation, though atMainRef might not have width yet if CSS hasn't applied.
		await new Promise((resolve) => setTimeout(resolve, 0));
		this.renderWidth = Math.max(this.atMainRef?.clientWidth || 800, 300);
		console.log(
			`[AlphaTab Debug] Calculated renderWidth: ${this.renderWidth}`
		);

		const themeColors = this.darkMode
			? {
					staffLineColor: new model.Color(221, 221, 221),
					barSeparatorColor: new model.Color(221, 221, 221),
					mainGlyphColor: new model.Color(238, 238, 238),
					secondaryGlyphColor: new model.Color(232, 232, 232),
					scoreInfoColor: new model.Color(248, 248, 248),
			  }
			: {
					staffLineColor: new model.Color(34, 34, 34),
					barSeparatorColor: new model.Color(34, 34, 34),
					mainGlyphColor: new model.Color(17, 17, 17),
					secondaryGlyphColor: new model.Color(24, 24, 24),
					scoreInfoColor: new model.Color(8, 8, 8),
			  };
		const themeFonts = {
			/* Define your actual fonts here if needed */
		};
		console.log("[AlphaTab Debug] Theme colors and fonts determined.");

		this.alphaTabSettings = new alphaTab.Settings(); // Use the aliased import if that's your setup
		// console.log(
		// 	"[AlphaTab Debug] Initial new alphaTab.Settings() object:",
		// 	JSON.stringify(this.alphaTabSettings)
		// );
		// 太长不看

		this.alphaTabSettings.core.engine = "svg"; // SVG is generally more reliable for web plugins
		this.alphaTabSettings.core.enableLazyLoading = true; // Good for performance
		// this.alphaTabSettings.core.logLevel = 'debug'; // Enable AlphaTab's internal debug logging if needed

		const pluginId = this.pluginInstance?.manifest?.id;
		if (!pluginId) {
			const errorMsg =
				"[AlphaTab Plugin Error] CRITICAL - Plugin ID is not available during AlphaTab initialization. Cannot load resources.";
			console.error(errorMsg);
			new Notice(errorMsg, 10000);
			this.showErrorInOverlay("AlphaTab Setup Error: Plugin ID missing.");
			return;
		}
		console.log(
			`[AlphaTab Debug] Using Plugin ID for resources: '${pluginId}'`
		);

		// Current debugging state: disable workers and player to simplify
		this.alphaTabSettings.core.useWorkers = false;
		this.alphaTabSettings.player.enablePlayer = false;
		console.log(
			`[AlphaTab Debug] core.useWorkers set to: ${this.alphaTabSettings.core.useWorkers}`
		);
		console.log(
			`[AlphaTab Debug] player.enablePlayer set to: ${this.alphaTabSettings.player.enablePlayer}`
		);

		try {
			const fontDirectoryAssetPath = `assets/alphatab/font/`; // Ensure this path is correct relative to your plugin root
			const generatedFontDir = this.getPluginAssetHttpUrl(
				pluginId,
				fontDirectoryAssetPath
			);
			this.alphaTabSettings.core.fontDirectory = generatedFontDir;
			console.log(
				`[AlphaTab Debug] settings.core.fontDirectory set to: '${generatedFontDir}'`
			);

			const mainAlphaTabScriptAssetPath = `assets/alphatab/alphaTab.mjs`; // Ensure this path is correct
			const generatedScriptFile = this.getPluginAssetHttpUrl(
				pluginId,
				mainAlphaTabScriptAssetPath
			);
			this.alphaTabSettings.core.scriptFile = generatedScriptFile;
			console.log(
				`[AlphaTab Debug] settings.core.scriptFile set to: '${generatedScriptFile}'`
			);
		} catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] Critical error during resource URL construction:",
				e.message,
				e.stack
			);
			new Notice(
				"AlphaTab Error: Could not construct essential resource paths.",
				10000
			);
			this.showErrorInOverlay(
				"AlphaTab Setup Error: Resource path construction failed critically."
			);
			return;
		}

		this.alphaTabSettings.display.scale = 0.8;
		this.alphaTabSettings.display.layoutMode = LayoutMode.Page;
		Object.assign(
			this.alphaTabSettings.display.resources,
			themeColors,
			themeFonts
		);

		this.alphaTabSettings.player.enableCursor = true; // Player-related, but harmless to set
		this.alphaTabSettings.player.scrollMode = ScrollMode.Continuous; // Player-related
		this.alphaTabSettings.player.scrollElement = this.atViewportRef; // Player-related
		this.alphaTabSettings.player.scrollOffsetY = -30; // Player-related

		// console.log(
		// 	"[AlphaTab Debug] Final AlphaTab settings before API initialization:",
		// 	JSON.stringify(this.alphaTabSettings, null, 2)
		// );
		// 太长不看

		// --- Hack Removed ---
		// No more temporary modification of globalThis.module

		// --- Hack Added ---
		// ... (之前的代码，如 settings 初始化等) ...

		// console.log(
		// 	"[AlphaTab Debug] Final AlphaTab settings before API initialization:",
		// 	JSON.stringify(this.alphaTabSettings, null, 2)
		// );
		// 太长不看版

		// ... (之前的 settings 初始化, pluginId 获取等) ...

		// 关键: 禁用 workers 和 player 以简化调试
		this.alphaTabSettings.core.useWorkers = false;
		this.alphaTabSettings.player.enablePlayer = false;
		console.log(
			`[AlphaTab Debug] core.useWorkers set to: ${this.alphaTabSettings.core.useWorkers}`
		);
		console.log(
			`[AlphaTab Debug] player.enablePlayer set to: ${this.alphaTabSettings.player.enablePlayer}`
		);

		// --- 使用 fs 读取字体并生成 data: URL ---
		console.log(
			"[AlphaTab Debug] Attempting to load fonts using Node.js fs module."
		);

		// 1. 获取插件的绝对路径
		//    this.app.vault.adapter.getBasePath() 获取 vault 的根路径
		//    this.pluginInstance.manifest.id 是你的插件 ID (例如 'gp')
		//    你需要根据你的插件文件结构构建正确的绝对路径
		const vaultBasePath = this.app.vault.adapter.getBasePath();
		// const pluginId = this.pluginInstance.manifest.id; // 假设你的插件文件夹名与 ID 一致

		// 根据你提供的结构： .obsidian/plugins/alphatab/assets/fonts/Bravura.woff
		// 如果你的插件文件夹名确实是 'obsidian-alphatab' 而不是插件ID 'gp'，请使用实际的文件夹名
		// obsidian-alphatab/assets/alphatab/font
		const actualPluginFolderName = "obsidian-alphatab"; // 或者 pluginId 如果它们相同
		const pluginAssetsFontsPath = path.join(
			vaultBasePath,
			".obsidian",
			"plugins",
			actualPluginFolderName,
			"assets",
			"alphatab",
			"font"
		);


		// 使用正确的字体元数据文件名
		const fontJsonFileName = "bravura_metadata.json"; // 修正为正确的元数据文件名
		const fontBinaryFileName = "Bravura.woff"; // 你提到的是 .woff 文件

		const absoluteFontJsonPath = path.join(
			pluginAssetsFontsPath,
			fontJsonFileName
		);
		const absoluteFontBinaryPath = path.join(
			pluginAssetsFontsPath,
			fontBinaryFileName
		);

		console.log(
			`[AlphaTab Debug] Absolute path for ${fontJsonFileName}: ${absoluteFontJsonPath}`
		);
		console.log(
			`[AlphaTab Debug] Absolute path for ${fontBinaryFileName}: ${absoluteFontBinaryPath}`
		);

		let fontJsonDataString: string;
		let fontBinaryBuffer: Buffer;

		try {
			fontJsonDataString = fs.readFileSync(absoluteFontJsonPath, "utf-8");
			console.log(
				`[AlphaTab Debug] Successfully read ${fontJsonFileName}`
			);
		} catch (err) {
			console.error(
				`[AlphaTab Plugin Error] Failed to read ${fontJsonFileName} using fs:`,
				err
			);
			this.showErrorInOverlay(
				`字体元数据缺失: ${fontJsonFileName}. 请检查路径和权限。`
			);
			return; // 关键文件缺失，无法继续
		}

		try {
			fontBinaryBuffer = fs.readFileSync(absoluteFontBinaryPath);
			console.log(
				`[AlphaTab Debug] Successfully read ${fontBinaryFileName}, size: ${fontBinaryBuffer.byteLength} bytes`
			);
		} catch (err) {
			console.error(
				`[AlphaTab Plugin Error] Failed to read ${fontBinaryFileName} using fs:`,
				err
			);
			this.showErrorInOverlay(
				`字体文件缺失: ${fontBinaryFileName}. 请检查路径和权限。`
			);
			return; // 关键文件缺失，无法继续
		}

		// 2. 创建 data: URLs
		const fontJsonBase64 = Buffer.from(
			fontJsonDataString,
			"utf-8"
		).toString("base64");
		const fontJsonDataUrl = `data:application/json;charset=utf-8;base64,${fontJsonBase64}`;

		const fontBinaryBase64 = fontBinaryBuffer.toString("base64");
		const fontBinaryDataUrl = `data:font/woff;base64,${fontBinaryBase64}`; // MIME type for WOFF

		// 3. 设置 smuflFontSources
		const sources = new Map<FontFileFormat, string>();
		sources.set(FontFileFormat.Json, fontJsonDataUrl);
		sources.set(FontFileFormat.Woff, fontBinaryDataUrl); 

		this.alphaTabSettings.core.smuflFontSources = sources;
		this.alphaTabSettings.core.fontDirectory = null; // 不再需要 fontDirectory，因为我们提供了绝对的 data: URL
		console.log(
			"[AlphaTab Debug] Set settings.core.smuflFontSources with data URLs."
		);
		// console.log('[AlphaTab Debug] fontJsonDataUrl:', fontJsonDataUrl); // 可以打印出来检查，但会很长
		// console.log('[AlphaTab Debug] fontBinaryDataUrl:', fontBinaryDataUrl); // 可以打印出来检查，但会很长

		// --- 路径设置结束 ---

		// ... (之前设置 display, player 等 settings 的代码保持不变)
		this.alphaTabSettings.display.scale = 0.8;
		// ...

		// --- 环境伪装和 API 实例化 (这部分逻辑保持不变，因为我们还是要绕过环境检查) ---
		console.log(
			"[AlphaTab Debug] Final AlphaTab settings before API initialization:",
			JSON.stringify(
				this.alphaTabSettings,
				(key, value) => {
					// 避免在日志中打印超长的 Base64 data URLs
					if (key === "smuflFontSources" && value instanceof Map) {
						return Array.from(value.entries()).reduce(
							(obj, [mapKey, mapValue]) => {
								// @ts-ignore
								obj[FontFileFormat[mapKey]] =
									mapValue.substring(0, 100) +
									"... (truncated)"; // 只显示一部分
								return obj;
							},
							{}
						);
					}
					if (key === "scrollElement" && value instanceof HTMLElement)
						return `HTMLElement <${value.tagName}>`; // 避免循环引用
					return value;
				},
				2
			)
		);

		// ... (之前的 环境伪装 hack: 临时移除 globalThis.process 和 globalThis.module)
		// ... (之前的 try/catch/finally 块用于实例化 AlphaTabApi 和恢复全局变量)
		// ... (之后的 API 状态检查和事件绑定)
		// ... (之后的 加载 SoundFont 和乐谱数据代码)

		// --- 重新引入环境伪装 ---
		console.log(
			"[AlphaTab Debug] Preparing to temporarily modify global environment for AlphaTabApi instantiation."
		);
		let originalProcess: any = undefined;
		let originalModule: any = undefined;
		let modifiedGlobals = false;

		// @ts-ignore
		if (typeof process !== "undefined") {
			originalProcess = globalThis.process;
			// @ts-ignore
			globalThis.process = undefined; // 关键：临时移除 process
			modifiedGlobals = true;
			console.log(
				"[AlphaTab Debug] Temporarily undefined globalThis.process"
			);
		}

		// @ts-ignore
		if (typeof module !== "undefined") {
			originalModule = globalThis.module;
			// @ts-ignore
			globalThis.module = undefined; // 关键：临时移除 module
			modifiedGlobals = true;
			console.log(
				"[AlphaTab Debug] Temporarily undefined globalThis.module"
			);
		}

		// 再次检查环境，确认伪装是否生效
		console.log(
			"[AlphaTab Debug] Environment state check AFTER temporary modification:"
		);
		console.log(
			`[AlphaTab Debug] typeof process (after mod): ${typeof process}`
		);
		console.log(
			`[AlphaTab Debug] typeof module (after mod): ${typeof module}`
		);

		if (!this.atMainRef) {
			console.error(
				"[AlphaTab Plugin Error] CRITICAL: this.atMainRef is null before API instantiation."
			);
			// ... (错误处理并恢复全局变量)
			if (modifiedGlobals) {
				if (originalProcess !== undefined)
					globalThis.process = originalProcess;
				if (originalModule !== undefined)
					globalThis.module = originalModule;
				console.log(
					"[AlphaTab Debug] Restored globals due to atMainRef error."
				);
			}
			return;
		}
		console.log(
			"[AlphaTab Debug] this.atMainRef (DOM element for AlphaTab):",
			this.atMainRef
		);

		console.log(
			"[AlphaTab Debug] Attempting to instantiate alphaTab.AlphaTabApi with modified environment..."
		);
		try {
			this.api = new alphaTab.AlphaTabApi(
				this.atMainRef,
				this.alphaTabSettings
			); // 使用你正确的 alphaTab 命名空间
			console.log(
				"[AlphaTab Debug] alphaTab.AlphaTabApi instantiated (or did not throw immediately)."
			);
		} catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] FAILED to initialize AlphaTab API even with modified environment. Error Name:",
				e.name,
				"Message:",
				e.message
			);
			console.error("[AlphaTab Plugin Error] Error Details:", e);
			if (e.stack) {
				console.error("[AlphaTab Plugin Error] Error Stack:", e.stack);
			}
			this.showErrorInOverlay(
				`Failed to initialize AlphaTab (modified env): ${e.name} - ${e.message}`
			);
			// 注意：这里不需要 return，因为 finally 块会执行恢复操作
		} finally {
			// --- 恢复全局变量 ---
			if (modifiedGlobals) {
				if (originalProcess !== undefined) {
					// @ts-ignore
					globalThis.process = originalProcess;
					console.log("[AlphaTab Debug] Restored globalThis.process");
				}
				if (originalModule !== undefined) {
					// @ts-ignore
					globalThis.module = originalModule;
					console.log("[AlphaTab Debug] Restored globalThis.module");
				}
				console.log("[AlphaTab Debug] Global environment restored.");
				// 再次检查恢复后的环境
				console.log(
					`[AlphaTab Debug] typeof process (after restore): ${typeof process}`
				);
				console.log(
					`[AlphaTab Debug] typeof module (after restore): ${typeof module}`
				);
			}
		}

		// --- 后续 API 状态检查和事件绑定 ---
		// (这部分代码与你之前版本中，API 实例化成功后的检查逻辑相同)
		console.log(
			"[AlphaTab Debug] Post-instantiation API object check (after potential env modification and restore):"
		);
		if (!this.api) {
			console.error(
				"[AlphaTab Plugin Error] CRITICAL: this.api is null or undefined AFTER instantiation attempt. Cannot proceed."
			);
			this.showErrorInOverlay(
				"AlphaTab Error: API failed to initialize (object is null)."
			);
			return;
		}

		console.log("[AlphaTab Debug] this.api object:", this.api);
		console.log(
			`[AlphaTab Debug] typeof this.api.error: ${typeof this.api.error}`
		);
		// ... (继续检查 this.api.error.on 和其他事件发射器) ...

		// ... (事件绑定代码) ...

		// ... (加载 SoundFont 和乐谱数据代码) ...

		// Log environment state just before AlphaTabApi instantiation
		console.log(
			"[AlphaTab Debug] Environment state check before AlphaTabApi instantiation:"
		);
		console.log(
			`[AlphaTab Debug] typeof window: ${typeof window}, window exists: ${
				typeof window !== "undefined"
			}`
		);
		console.log(
			`[AlphaTab Debug] typeof document: ${typeof document}, document exists: ${
				typeof document !== "undefined"
			}`
		);
		console.log(`[AlphaTab Debug] typeof process: ${typeof process}`);
		if (typeof process !== "undefined") {
			console.log(
				"[AlphaTab Debug] process.versions:",
				JSON.stringify(process.versions)
			);
			console.log("[AlphaTab Debug] process.type:", process.type); // 'renderer' in Electron render process
		}
		console.log(`[AlphaTab Debug] typeof module: ${typeof module}`);
		if (
			typeof module !== "undefined" &&
			module &&
			typeof module === "object"
		) {
			// Be careful logging 'module' directly, it can be large or circular. Log specific properties if needed.
			console.log(
				`[AlphaTab Debug] module object exists. module.exports type: ${typeof module.exports}, module.id: ${
					module.id
				}`
			);
		}

		if (!this.atMainRef) {
			console.error(
				"[AlphaTab Plugin Error] CRITICAL: this.atMainRef (DOM element for AlphaTab) is null or undefined before API instantiation. AlphaTab will fail."
			);
			this.showErrorInOverlay(
				"AlphaTab Setup Error: Target DOM element missing."
			);
			return;
		}
		console.log(
			"[AlphaTab Debug] this.atMainRef (DOM element for AlphaTab):",
			this.atMainRef
		);

		console.log(
			"[AlphaTab Debug] Attempting to instantiate alphaTab.AlphaTabApi..."
		);
		try {
			this.api = new alphaTab.AlphaTabApi(
				this.atMainRef,
				this.alphaTabSettings
			); // Use aliased import
			console.log(
				"[AlphaTab Debug] alphaTab.AlphaTabApi instantiated successfully (or at least did not throw immediately)."
			);
		} catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] FAILED to initialize AlphaTab API. Error Name:",
				e.name,
				"Message:",
				e.message
			);
			console.error("[AlphaTab Plugin Error] Error Details:", e);
			if (e.stack) {
				console.error("[AlphaTab Plugin Error] Error Stack:", e.stack);
			}
			this.showErrorInOverlay(
				`Failed to initialize AlphaTab: ${e.name} - ${e.message}`
			);
			return; // Stop further execution if API init fails
		}

		console.log("[AlphaTab Debug] Post-instantiation API object check:");
		if (!this.api) {
			console.error(
				"[AlphaTab Plugin Error] CRITICAL: this.api is null or undefined AFTER instantiation attempt, even if no error was thrown. Cannot proceed."
			);
			this.showErrorInOverlay(
				"AlphaTab Error: API failed to initialize (object is null)."
			);
			return;
		}

		console.log("[AlphaTab Debug] this.api object:", this.api); // Could be large, log specific parts if needed
		console.log(
			`[AlphaTab Debug] typeof this.api.error: ${typeof this.api.error}`
		);
		if (this.api.error) {
			console.log(
				"[AlphaTab Debug] this.api.error object:",
				this.api.error
			);
			console.log(
				`[AlphaTab Debug] typeof this.api.error.on: ${typeof this.api
					.error.on}`
			);
		} else {
			console.error(
				"[AlphaTab Plugin Error] this.api.error is undefined/null. Event listeners cannot be attached."
			);
		}

		// Check other expected event emitters
		const eventEmittersToCheck = [
			"renderStarted",
			"renderFinished",
			"scoreLoaded",
			"playerStateChanged",
			"soundFontLoad",
			"soundFontLoaded",
			"soundFontLoadFailed",
		];
		for (const eventName of eventEmittersToCheck) {
			// @ts-ignore
			const emitter = this.api[eventName];
			console.log(
				`[AlphaTab Debug] typeof this.api.${eventName}: ${typeof emitter}`
			);
			if (emitter) {
				// @ts-ignore
				console.log(
					`[AlphaTab Debug] typeof this.api.${eventName}.on: ${typeof emitter.on}`
				);
			} else {
				console.warn(
					`[AlphaTab Debug] this.api.${eventName} is undefined/null.`
				);
			}
		}

		// Defensive event listener attachment
		try {
			if (
				this.api &&
				this.api.error &&
				typeof this.api.error.on === "function"
			) {
				this.api.error.on(this.handleAlphaTabError.bind(this));
			} else {
				console.error(
					"[AlphaTab Plugin Error] Cannot attach 'error' event listener: api.error or api.error.on is invalid."
				);
			}
			if (
				this.api &&
				this.api.renderStarted &&
				typeof this.api.renderStarted.on === "function"
			) {
				this.api.renderStarted.on(
					this.handleAlphaTabRenderStarted.bind(this)
				);
			} else {
				console.warn(
					"[AlphaTab Debug] Cannot attach 'renderStarted' event listener."
				);
			}
			// ... (similarly for other event listeners)
			if (
				this.api &&
				this.api.renderFinished &&
				typeof this.api.renderFinished.on === "function"
			) {
				this.api.renderFinished.on(
					this.handleAlphaTabRenderFinished.bind(this)
				);
			} else {
				console.warn(
					"[AlphaTab Debug] Cannot attach 'renderFinished' event listener."
				);
			}
			if (
				this.api &&
				this.api.scoreLoaded &&
				typeof this.api.scoreLoaded.on === "function"
			) {
				this.api.scoreLoaded.on(
					this.handleAlphaTabScoreLoaded.bind(this)
				);
			} else {
				console.warn(
					"[AlphaTab Debug] Cannot attach 'scoreLoaded' event listener."
				);
			}
			if (
				this.api?.playerStateChanged &&
				typeof this.api.playerStateChanged.on === "function"
			) {
				this.api.playerStateChanged.on(
					this.handlePlayerStateChanged.bind(this)
				);
			} else {
				console.warn(
					"[AlphaTab Debug] Cannot attach 'playerStateChanged' event listener."
				);
			}
			// Soundfont events (only really relevant if player is enabled, but harmless to try attaching)
			if (
				this.api?.soundFontLoad &&
				typeof this.api.soundFontLoad.on === "function"
			) {
				this.api.soundFontLoad.on((e) =>
					console.log(
						"[AlphaTab Debug] SoundFont loading progress:",
						e.progress
					)
				);
			}
			if (
				this.api?.soundFontLoaded &&
				typeof this.api.soundFontLoaded.on === "function"
			) {
				this.api.soundFontLoaded.on(() => {
					console.log(
						"[AlphaTab Debug] SoundFont loaded successfully event received."
					);
					new Notice("SoundFont loaded successfully!");
				});
			}
			if (
				this.api?.soundFontLoadFailed &&
				typeof this.api.soundFontLoadFailed.on === "function"
			) {
				this.api.soundFontLoadFailed.on((e) => {
					console.error(
						"[AlphaTab Plugin Error] SoundFont load failed event:",
						e
					);
					this.showErrorInOverlay(
						"Failed to load SoundFont (event)."
					);
					new Notice("Error: Could not load SoundFont for playback.");
				});
			}
		} catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] Error attaching AlphaTab event listeners:",
				e.message,
				e.stack
			);
			this.showErrorInOverlay(
				"AlphaTab Error: Failed to set up event handlers."
			);
			return; // Critical if event handlers can't be set
		}

		if (this.alphaTabSettings.player.enablePlayer) {
			this.showLoadingOverlay("Loading SoundFont...");
			console.log(
				"[AlphaTab Debug] Attempting to load SoundFont as player is enabled."
			);
			try {
				const soundFontAssetPath = `assets/alphatab/soundfont/sonivox.sf2`; // Ensure this path is correct
				const soundFontVaultPath = normalizePath(
					`${this.pluginInstance.manifest.dir}/${soundFontAssetPath}`
				);
				console.log(
					`[AlphaTab Debug] SoundFont vault path: ${soundFontVaultPath}`
				);
				if (await this.app.vault.adapter.exists(soundFontVaultPath)) {
					const soundFontData =
						await this.app.vault.adapter.readBinary(
							soundFontVaultPath
						);
					console.log(
						`[AlphaTab Debug] SoundFont data loaded from vault, size: ${soundFontData.byteLength} bytes. Calling api.loadSoundFont().`
					);
					await this.api.loadSoundFont(soundFontData); // Assuming this.api is valid here
					console.log("[AlphaTab Debug] api.loadSoundFont() called.");
				} else {
					console.error(
						"[AlphaTab Plugin Error] SoundFont file not found at:",
						soundFontVaultPath
					);
					this.showErrorInOverlay(
						"SoundFont file not found. Playback disabled."
					);
				}
			} catch (e: any) {
				console.error(
					"[AlphaTab Plugin Error] Error loading SoundFont:",
					e.message,
					e.stack
				);
				this.showErrorInOverlay(
					`Error loading SoundFont: ${e.message}.`
				);
			}
		} else {
			console.log(
				"[AlphaTab Debug] Player is not enabled, skipping SoundFont loading."
			);
		}

		this.showLoadingOverlay(`Loading tab: ${file.basename}...`);
		console.log(
			`[AlphaTab Debug] Attempting to load score data for file: ${file.path}`
		);
		try {
			const scoreData = await this.app.vault.readBinary(file);
			console.log(
				`[AlphaTab Debug] Score data read from vault, size: ${scoreData.byteLength} bytes. Calling api.load().`
			);
			if (!this.api)
				throw new Error("API not initialized before loading score."); // Should not happen if checks above are good
			await this.api.load(new Uint8Array(scoreData)); // AlphaTab expects Uint8Array or similar
			console.log("[AlphaTab Debug] api.load() called for score data.");
		} catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] Error loading score data into AlphaTab:",
				e.message,
				e.stack
			);
			this.handleAlphaTabError({
				message: `Failed to load score file into AlphaTab: ${e.message}`,
			} as any);
		}
		console.log(
			"[AlphaTab Debug] initializeAlphaTabAndLoadScore finished."
		);
	}

	private handleAlphaTabError(error: { message?: string } & any) {
		console.error("[AlphaTab Internal Error]", error); // Log the full error object
		const errorMessage = `AlphaTab Error: ${
			error.message || "An unexpected issue occurred within AlphaTab."
		}`;
		this.showErrorInOverlay(errorMessage);
		new Notice(errorMessage, 10000);
	}

	private handleAlphaTabRenderStarted() {
		console.log("[AlphaTab Debug] Event: renderStarted");
		this.showLoadingOverlay("Rendering sheet...");
	}

	private handleAlphaTabRenderFinished() {
		console.log("[AlphaTab Debug] Event: renderFinished");
		this.hideLoadingOverlay();
		new Notice("Tab rendered!");
		this.leaf.updateHeader(); // Update display text if title changed
	}

	private handleAlphaTabScoreLoaded(score: Score | null) {
		console.log(
			"[AlphaTab Debug] Event: scoreLoaded. Score object:",
			score
		);
		if (!score) {
			console.error(
				"[AlphaTab Plugin Error] Score data could not be loaded or parsed by AlphaTab (score object is null)."
			);
			this.showErrorInOverlay(
				"Error: Score data could not be loaded or parsed."
			);
			this.score = null;
			return;
		}
		this.score = score;
		new Notice(`Score loaded: ${score.title || "Untitled"}`);

		this.tracksModal.setTracks(score.tracks);
		if (score.tracks?.length > 0) {
			// Default to rendering the first track or previously selected tracks
			// For simplicity, let's always default to the first track on new score load.
			this.renderTracks = [score.tracks[0]];
			this.tracksModal.setRenderTracks(this.renderTracks);
			console.log(
				`[AlphaTab Debug] Defaulting to render track: ${score.tracks[0].name}`
			);
			if (this.api) {
				this.api.renderTracks(this.renderTracks);
			} else {
				console.warn(
					"[AlphaTab Debug] API not available to render tracks after score load."
				);
			}
		} else {
			this.renderTracks = [];
			console.log("[AlphaTab Debug] No tracks found in the score.");
		}
		this.leaf.updateHeader(); // Update display text
	}

	private handlePlayerStateChanged(args: PlayerStateChangedEventArgs) {
		console.log(
			`[AlphaTab Debug] Event: playerStateChanged - New state: ${
				PlayerState[args.state]
			}, isPlaying: ${args.isPlaying}`
		);
		if (!this.playPauseButton || !this.stopButton) {
			console.warn(
				"[AlphaTab Debug] Player state changed, but control buttons not found."
			);
			return;
		}
		const isPlaying = args.state === PlayerState.Playing;
		const isPaused = args.state === PlayerState.Paused;
		this.playPauseButton.setText(isPlaying ? "暂停" : "播放"); // 中文化按钮文本
		this.stopButton.disabled = !(isPlaying || isPaused);
	}

	private showLoadingOverlay(message: string) {
		if (this.atOverlayRef && this.atOverlayContentRef) {
			this.atOverlayContentRef.setText(message);
			this.atOverlayRef.style.display = "flex";
			this.atOverlayRef.removeClass("error"); // Ensure error class is removed if it was set
			// console.log(`[AlphaTab Debug] Showing loading overlay: "${message}"`);
		} else {
			// console.warn("[AlphaTab Debug] Attempted to show loading overlay, but DOM elements not ready.");
		}
	}
	private showErrorInOverlay(errorMessage: string) {
		// console.log(`[AlphaTab Debug] Showing error in overlay: "${errorMessage}"`);
		this.showLoadingOverlay(errorMessage); // Reuse showLoadingOverlay to set text and display
		if (this.atOverlayRef) {
			this.atOverlayRef.addClass("error"); // Add a distinct class for error styling
		}
	}
	private hideLoadingOverlay() {
		if (this.atOverlayRef) {
			this.atOverlayRef.style.display = "none";
			this.atOverlayRef.removeClass("error");
			// console.log("[AlphaTab Debug] Hiding loading overlay.");
		} else {
			// console.warn("[AlphaTab Debug] Attempted to hide loading overlay, but DOM element not ready.");
		}
	}

	public onChangeTracks(selectedTracks?: Track[]) {
		console.log(
			"[AlphaTab Debug] onChangeTracks called. Selected tracks:",
			selectedTracks
		);
		if (!this.api) {
			console.warn(
				"[AlphaTab Debug] onChangeTracks: API not initialized."
			);
			new Notice("AlphaTab API not ready. Cannot change tracks.", 5000);
			return;
		}
		if (selectedTracks && selectedTracks.length > 0) {
			this.renderTracks = selectedTracks;
			this.api.renderTracks(this.renderTracks);
			new Notice(`Rendering ${selectedTracks.length} track(s).`);
		} else {
			this.renderTracks = []; // Clear selection if nothing is chosen
			this.api.renderTracks([]); // Tell AlphaTab to render no tracks (or all, depending on its behavior for empty array)
			new Notice(
				"No tracks selected to render. Showing all tracks or default."
			); // Or adjust message
		}
	}

	public downloadMidi() {
		console.log("[AlphaTab Debug] downloadMidi called.");
		if (!this.score) {
			new Notice("No score loaded to generate MIDI.");
			console.warn("[AlphaTab Debug] Download MIDI: No score loaded.");
			return;
		}
		if (!this.api) {
			new Notice("AlphaTab API not ready for MIDI generation.");
			console.warn("[AlphaTab Debug] Download MIDI: API not ready.");
			return;
		}

		try {
			const tracksToExport =
				this.renderTracks.length > 0
					? this.renderTracks
					: this.score.tracks;
			if (!tracksToExport || tracksToExport.length === 0) {
				new Notice(
					"No tracks available or selected to export as MIDI."
				);
				console.warn(
					"[AlphaTab Debug] Download MIDI: No tracks to export."
				);
				return;
			}

			const midiFile = new alphaTab.midi.MidiFile(); // Use aliased import
			console.log(
				`[AlphaTab Debug] Generating MIDI for tracks:`,
				tracksToExport.map((t) => t.name)
			);
			this.api.midiGenerate(
				tracksToExport.map((t) => t.index),
				midiFile
			); // Use indices of selected tracks

			const fileName = `${this.score.title || "Untitled Tab"}.mid`;
			saveToFile(
				fileName,
				new Blob([midiFile.toBinary()], { type: "audio/midi" })
			);
			new Notice(`MIDI "${fileName}" download started.`);
		} catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] Error generating MIDI:",
				e.message,
				e.stack
			);
			new Notice(`Error generating MIDI: ${e.message}`);
		}
	}

	override onResize(): void {
		super.onResize();
		// console.log("[AlphaTab Debug] onResize called.");
		if (this.api && this.atMainRef) {
			const newWidth = this.atMainRef.clientWidth;
			if (newWidth > 0 && newWidth !== this.renderWidth) {
				console.log(
					`[AlphaTab Debug] Resizing AlphaTab from ${this.renderWidth} to ${newWidth}`
				);
				this.renderWidth = newWidth;
				if (this.api.settings?.display) {
					// Check if settings and display object exist
					this.api.settings.display.width = newWidth;
				} else {
					console.warn(
						"[AlphaTab Debug] API settings or display object not found during resize. Re-rendering might use old width or default."
					);
				}
				this.api.render(); // Re-render the score with the new width
				// new Notice("Tab resized and re-rendered."); // Can be a bit noisy
			}
		}
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		console.log(
			`[AlphaTab Debug] onUnloadFile: Unloading file '${file.path}'`
		);
		if (this.api) {
			console.log(
				"[AlphaTab Debug] Destroying AlphaTab API instance on unloadFile."
			);
			try {
				this.api.destroy();
			} catch (e: any) {
				console.error(
					"[AlphaTab Plugin Error] Error destroying API on unloadFile:",
					e.message,
					e.stack
				);
			}
			this.api = null;
		}
		this.score = null;
		this.currentFile = null;
		this.contentEl.empty(); // Clear content
		await super.onUnloadFile(file);
	}

	// This is called when the view itself is being closed permanently, not just when a file is closed.
	async onunload() {
		console.log(
			"[AlphaTab Debug] TabView onunload: Main view unload sequence started."
		);
		if (this.api) {
			console.log(
				"[AlphaTab Debug] Destroying AlphaTab API instance on final view unload."
			);
			try {
				this.api.destroy();
			} catch (e: any) {
				console.error(
					"[AlphaTab Plugin Error] Error destroying API on final view unload:",
					e.message,
					e.stack
				);
			}
			this.api = null;
		}
		// Any other cleanup specific to TabView
		await super.onunload();
		console.log("[AlphaTab Debug] TabView onunload finished.");
	}
}

// Helper function (remains the same)
export function saveToFile(fileName: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	console.log(`[AlphaTab Debug] File '${fileName}' saved.`);
}
