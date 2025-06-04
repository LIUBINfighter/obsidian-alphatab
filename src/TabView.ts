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
	LayoutMode,
	ScrollMode,
	synth // 添加synth命名空间导入
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
		
		// 添加调试信息
		console.log("[AlphaTab Debug] DOM structure created:");
		console.log("- atWrap:", this.atWrap);
		console.log("- atMainRef:", this.atMainRef);
		console.log("- atMainRef dimensions:", {
			width: this.atMainRef.clientWidth,
			height: this.atMainRef.clientHeight,
			offsetWidth: this.atMainRef.offsetWidth,
			offsetHeight: this.atMainRef.offsetHeight
		});
		
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
    const resourceServer = this.pluginInstance.getResourceServer();
    
    if (!resourceServer) {
        console.error('[AlphaTab Debug] Resource server not available');
        throw new Error('Resource server not initialized');
    }

    const baseUrl = resourceServer.getBaseUrl();
    const normalizedAssetPath = assetPath.startsWith("/") 
        ? assetPath.substring(1) 
        : assetPath;
    
    const fullUrl = `${baseUrl}/${normalizedAssetPath}`;
    console.log(`[AlphaTab Debug] Generated resource URL for '${assetPath}': ${fullUrl}`);
    
    return fullUrl;
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

		this.alphaTabSettings = new alphaTab.Settings();
		this.alphaTabSettings.core.engine = "svg";
		this.alphaTabSettings.core.enableLazyLoading = true;

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

		this.alphaTabSettings.core.useWorkers = false;
		this.alphaTabSettings.player.enablePlayer = false;
		console.log(
			`[AlphaTab Debug] core.useWorkers set to: ${this.alphaTabSettings.core.useWorkers}`
		);
		console.log(
			`[AlphaTab Debug] player.enablePlayer set to: ${this.alphaTabSettings.player.enablePlayer}`
		);

		try {
            // 尝试检查并配置字体目录
            console.log("[AlphaTab Debug] Checking font availability...");
            
            const resourceServer = this.pluginInstance.getResourceServer();
            if (resourceServer) {
                // 修复：使用绝对路径构建字体目录路径
                // 之前的错误：使用了相对路径 this.pluginInstance.manifest.dir
                // 正确的做法：使用绝对路径
                console.log(`[AlphaTab Debug] Plugin manifest.dir: ${this.pluginInstance.manifest.dir}`);
                
                // 尝试多个可能的插件目录路径
                const possiblePluginDirs = [
                    // 使用绝对路径
                    path.resolve(this.pluginInstance.manifest.dir),
                    // 硬编码的开发路径（基于之前成功的经验）
                    path.resolve("d:\\Jay.Lab\\300 Lab\\Plugin Lab\\.obsidian\\plugins\\obsidian-alphatab"),
                    // 当前工作目录下的相对路径
                    path.resolve(process.cwd(), ".obsidian\\plugins\\obsidian-alphatab"),
                ];
                
                let actualPluginDir = null;
                let fontDirPath = null;
                
                for (const dir of possiblePluginDirs) {
                    console.log(`[AlphaTab Debug] Trying plugin directory: ${dir}`);
                    if (fs.existsSync(dir)) {
                        const testFontDir = path.join(dir, 'assets', 'alphatab', 'font');
                        console.log(`[AlphaTab Debug] Testing font directory: ${testFontDir}`);
                        
                        if (fs.existsSync(testFontDir)) {
                            actualPluginDir = dir;
                            fontDirPath = testFontDir;
                            console.log(`[AlphaTab Debug] Found valid font directory: ${testFontDir}`);
                            break;
                        } else {
                            console.log(`[AlphaTab Debug] Font directory not found in: ${testFontDir}`);
                            // 列出该目录下的内容以便调试
                            const assetsDir = path.join(dir, 'assets');
                            if (fs.existsSync(assetsDir)) {
                                const assetsContents = fs.readdirSync(assetsDir);
                                console.log(`[AlphaTab Debug] Assets directory contents:`, assetsContents);
                                
                                const alphatabDir = path.join(assetsDir, 'alphatab');
                                if (fs.existsSync(alphatabDir)) {
                                    const alphatabContents = fs.readdirSync(alphatabDir);
                                    console.log(`[AlphaTab Debug] AlphaTab directory contents:`, alphatabContents);
                                }
                            }
                        }
                    } else {
                        console.log(`[AlphaTab Debug] Plugin directory does not exist: ${dir}`);
                    }
                }
                
                if (actualPluginDir && fontDirPath) {
                    const fontFiles = fs.readdirSync(fontDirPath);
                    console.log(`[AlphaTab Debug] Found font files:`, fontFiles);
                    
                    if (fontFiles.length > 0) {
                        const fontDirectoryAssetPath = `assets/alphatab/font/`;
                        const generatedFontDir = this.getPluginAssetHttpUrl(
                            pluginId,
                            fontDirectoryAssetPath
                        );
                        
                        this.alphaTabSettings.core.fontDirectory = generatedFontDir;
                        console.log(
                            `[AlphaTab Debug] settings.core.fontDirectory set to: '${generatedFontDir}'`
                        );
                        
                        // 测试字体可用性
                        console.log("[AlphaTab Debug] Testing font accessibility...");
                        try {
                            // 使用实际存在的字体文件进行测试
                            const firstFontFile = fontFiles[0];
                            const testFontUrl = `${generatedFontDir}${firstFontFile}`;
                            console.log(`[AlphaTab Debug] Testing font URL: ${testFontUrl}`);
                            
                            // 使用 fetch 测试字体是否可访问
                            const response = await fetch(testFontUrl);
                            console.log(`[AlphaTab Debug] Font test response status: ${response.status}`);
                            if (response.ok) {
                                console.log("[AlphaTab Debug] Font accessibility test passed");
                            } else {
                                console.warn("[AlphaTab Debug] Font accessibility test failed");
                                // 即使测试失败，也尝试使用字体目录
                                console.log("[AlphaTab Debug] Continuing with font directory despite test failure");
                            }
                        } catch (fontTestError) {
                            console.warn("[AlphaTab Debug] Font accessibility test error:", fontTestError);
                            // 即使测试出错，也尝试使用字体目录
                            console.log("[AlphaTab Debug] Continuing with font directory despite test error");
                        }
                    } else {
                        console.warn("[AlphaTab Debug] Font directory exists but is empty");
                        // 不设置字体目录，使用默认字体
                    }
                } else {
                    console.warn("[AlphaTab Debug] No valid font directory found, using default fonts");
                    // 不设置字体目录，使用默认字体
                }
                
                // 检查脚本文件（暂时跳过实际配置，避免脚本加载问题）
                console.log("[AlphaTab Debug] Skipping script file configuration to avoid loading issues");
            } else {
                console.warn("[AlphaTab Debug] Resource server not available, using default configuration");
            }
        } catch (e: any) {
			console.error(
				"[AlphaTab Plugin Error] Error during resource configuration:",
				e.message,
				e.stack
			);
			console.log("[AlphaTab Debug] Continuing with default configuration");
		}

		this.alphaTabSettings.display.scale = 0.8;
		this.alphaTabSettings.display.layoutMode = LayoutMode.Page;
		Object.assign(
			this.alphaTabSettings.display.resources,
			themeColors,
			themeFonts
		);

		this.alphaTabSettings.player.enableCursor = true;
		this.alphaTabSettings.player.scrollMode = ScrollMode.Continuous;
		this.alphaTabSettings.player.scrollElement = this.atViewportRef;
		this.alphaTabSettings.player.scrollOffsetY = -30;

		console.log(
			"[AlphaTab Debug] Final AlphaTab settings before API initialization:",
			JSON.stringify(
				this.alphaTabSettings,
				(key, value) => {
					if (key === "scrollElement" && value instanceof HTMLElement)
						return `HTMLElement <${value.tagName}>`;
					return value;
				},
				2
			)
		);

		// --- 环境伪装和 API 实例化 ---
		console.log(
			"[AlphaTab Debug] Preparing to temporarily modify global environment for AlphaTabApi instantiation."
		);
		// 修正环境检测绕过 - 同时处理 process 和 module
let originalProcess: any, originalModule: any;
let modifiedGlobals = false;

try {
    // 保存原始值
    originalProcess = globalThis.process;
    originalModule = globalThis.module;
    
    // 临时移除两个对象
    // @ts-ignore
    globalThis.process = undefined;
    // @ts-ignore
    globalThis.module = undefined;
    modifiedGlobals = true;
    
    // 强制设置环境平台（如果可能）
    // @ts-ignore
    if (alphaTab.Environment) {
        alphaTab.Environment.webPlatform = alphaTab.WebPlatform.Browser;
    }
    
    console.log("[AlphaTab Debug] Temporarily removed process and module, forcing browser platform");
    
    // 实例化 API
    this.api = new alphaTab.AlphaTabApi(this.atMainRef, this.alphaTabSettings);
    
} catch (e) {
    console.error("Failed to initialize AlphaTab API:", e);
    this.showErrorInOverlay(`Failed to initialize AlphaTab: ${e.message}`);
    return;
} finally {
    // 无论成功与否都要恢复
    if (modifiedGlobals) {
        globalThis.process = originalProcess;
        globalThis.module = originalModule;
        console.log("[AlphaTab Debug] Restored process and module");
    }
}

		// --- 后续 API 状态检查和事件绑定 ---
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
		
		// 添加更详细的字体相关事件监听
		// @ts-ignore
		if (this.api.fontLoad && typeof this.api.fontLoad.on === "function") {
			// @ts-ignore
			this.api.fontLoad.on((e) => {
				console.log("[AlphaTab Debug] Font loading event:", e);
			});
		}
		// @ts-ignore
		if (this.api.fontLoaded && typeof this.api.fontLoaded.on === "function") {
			// @ts-ignore
			this.api.fontLoaded.on(() => {
				console.log("[AlphaTab Debug] Font loaded successfully");
			});
		}
		// @ts-ignore
		if (this.api.fontLoadFailed && typeof this.api.fontLoadFailed.on === "function") {
			// @ts-ignore
			this.api.fontLoadFailed.on((e) => {
				console.error("[AlphaTab Debug] Font load failed event:", e);
				// 尝试使用备用字体或跳过字体要求
				console.log("[AlphaTab Debug] Attempting to continue without custom fonts...");
			});
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
				const soundFontAssetPath = `assets/alphatab/soundfont/sonivox.sf2`;
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
					await this.api.loadSoundFont(soundFontData);
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
				throw new Error("API not initialized before loading score.");
			await this.api.load(new Uint8Array(scoreData));
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
			this.renderTracks = [score.tracks[0]];
			this.tracksModal.setRenderTracks(this.renderTracks);
			console.log(
				`[AlphaTab Debug] Defaulting to render track: ${score.tracks[0].name}`
			);
			if (this.api) {
				console.log("[AlphaTab Debug] Calling api.renderTracks() with selected tracks");
				this.api.renderTracks(this.renderTracks);
				
				// 尝试手动触发渲染
				setTimeout(() => {
					console.log("[AlphaTab Debug] Manually triggering render...");
					if (this.api) {
						try {
							this.api.render();
							console.log("[AlphaTab Debug] Manual render() called");
						} catch (e) {
							console.error("[AlphaTab Debug] Error in manual render():", e);
						}
					}
				}, 1000);
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
				synth.PlayerState[args.state] // 使用synth.PlayerState
			}, isPlaying: ${args.isPlaying}`
		);
		if (!this.playPauseButton || !this.stopButton) {
			console.warn(
				"[AlphaTab Debug] Player state changed, but control buttons not found."
			);
			return;
		}
		const isPlaying = args.state === synth.PlayerState.Playing; // 使用synth.PlayerState
		const isPaused = args.state === synth.PlayerState.Paused; // 使用synth.PlayerState
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
