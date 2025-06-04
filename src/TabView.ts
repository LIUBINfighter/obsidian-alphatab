// 在你的插件文件顶部，或者在 import alphaTab 之前尝试（这可能很难控制加载顺序）
// @ts-ignore
// globalThis.module = undefined;
// @ts-ignore
// globalThis.exports = undefined; // 通常 module = undefined 足够
// @ts-ignore
// globalThis.process = undefined; // 这个要非常小心，可能会破坏 Obsidian 的其他部分
// 这个方法没有骗过检测器

// TabView.ts
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
} from "@coderline/alphatab";

export const VIEW_TYPE_TAB = "tab-view";

// (TracksModal class remains the same as your MVP, so it's omitted here for brevity)
// Make sure TracksModal is imported or defined above this class if in a separate file.
export class TracksModal extends Modal {
	tracks: Track[];
	renderTracks: Set<Track>;
	onChange?: (tracks?: Track[]) => void;

	constructor(app: App, tracks: Track[], onChange?: TracksModal["onChange"]) {
		super(app);
		this.tracks = tracks;
		this.onChange = onChange;
		this.renderTracks = new Set(tracks.length > 0 ? [tracks[0]] : []);
		this.modalEl.addClass("tracks-modal");
	}
	onOpen = () => {
		this.contentEl.empty(); // Clear previous content
		this.tracks.forEach((track) => {
			new Setting(this.contentEl)
				.setName(track.name)
				.setDesc(track.shortName)
				.addToggle((toggle) => {
					toggle
						.setValue(this.renderTracks.has(track))
						.onChange((value) => {
							if (value) {
								this.renderTracks.add(track);
							} else {
								this.renderTracks.delete(track);
							}
							this.onSelectTrack();
						});
				});
		});
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
		// Optionally, reset selection or maintain it if possible
		// For simplicity, let's default to the first track if tracks exist
		this.renderTracks = new Set(tracks.length > 0 ? [tracks[0]] : []);
	}

	setRenderTracks(tracks: Track[]) {
		this.renderTracks = new Set(tracks);
	}
}

export class TabView extends FileView {
	private currentFile: TFile | null = null;
	private api: AlphaTabApi | null = null;
	private score: Score | null = null; // Changed from model.Score to Score
	private alphaTabSettings: Settings;
	private renderTracks: Track[] = []; // Changed from AlphaTabApi["tracks"]
	private renderWidth = 800;

	private darkMode: boolean;
	private tracksModal: TracksModal;

	// UI Elements (Refs similar to Vue's atXXXRef)
	private atWrap: HTMLElement;
	private atOverlayRef: HTMLElement;
	private atOverlayContentRef: HTMLElement;
	private atMainRef: HTMLElement;
	private atViewportRef: HTMLElement;
	private atControlsRef: HTMLElement;
	private playPauseButton: HTMLButtonElement;
	private stopButton: HTMLButtonElement;

	// Store the plugin reference to access its manifest.dir
	// @ts-ignore (Obsidian specific, will be initialized)
	private plugin: any; // Assuming this will be set by the plugin main file or passed in

	constructor(leaf: WorkspaceLeaf, plugin?: any) {
		// Added plugin parameter
		super(leaf);
		this.plugin = plugin || this.app.plugins.plugins["your-plugin-id"]; // Replace 'your-plugin-id'

		this.containerEl.addClass("alphatab-obsidian-plugin"); // For namespacing styles
		this.containerEl.addClass("gtp-preview-container"); // Your existing class

		this.tracksModal = new TracksModal(
			this.app,
			[],
			this.onChangeTracks.bind(this)
		);
		this.addAction("music", "Select Tracks", () => this.tracksModal.open());
		this.addAction(
			"download",
			"Download MIDI",
			this.downloadMidi.bind(this)
		);
		// Play action will be part of the custom controls bar
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
		if (this.currentFile) {
			return this.currentFile.basename;
		}
		return "Guitar Tab";
	}

	override async onLoadFile(file: TFile): Promise<void> {
		this.currentFile = file;
		this.contentEl.empty(); // Clear previous content

		this.darkMode = document.body.className.includes("theme-dark");

		// 1. Build UI Structure (mimicking Vue template)
		this.atWrap = this.contentEl.createDiv({ cls: "at-wrap" });

		this.atOverlayRef = this.atWrap.createDiv({
			cls: "at-overlay",
			attr: { style: "display: none;" },
		});
		this.atOverlayContentRef = this.atOverlayRef.createDiv({
			cls: "at-overlay-content",
		});

		const atContent = this.atWrap.createDiv({ cls: "at-content" });
		// Sidebar (using TracksModal for now, but you could build a persistent one here)
		// const trackSidebarContainer = atContent.createDiv({ cls: 'at-sidebar-container' });

		this.atViewportRef = atContent.createDiv({ cls: "at-viewport" });
		this.atMainRef = this.atViewportRef.createDiv({ cls: "at-main" });

		this.atControlsRef = this.atWrap.createDiv({ cls: "at-controls" });
		this.renderControlBar(this.atControlsRef);

		// 2. Initialize AlphaTab and load score
		await this.initializeAlphaTabAndLoadScore(file);
	}

	private renderControlBar(container: HTMLElement) {
		container.empty();

		this.playPauseButton = container.createEl("button", { text: "Play" });
		this.playPauseButton.addEventListener("click", () => {
			if (this.api) {
				this.api.playPause();
			}
		});

		this.stopButton = container.createEl("button", { text: "Stop" });
		this.stopButton.addEventListener("click", () => {
			if (this.api) {
				this.api.stop();
			}
		});
		// Add more controls here: volume, tempo, etc.
	}

	private async initializeAlphaTabAndLoadScore(file: TFile) {
		if (this.api) {
			try {
				this.api.destroy();
			} catch (e) {
				console.error(
					"Error destroying previous AlphaTab API instance:",
					e
				);
			}
			this.api = null;
		}
		this.score = null; // Reset score

		this.showLoadingOverlay("Initializing AlphaTab...");

		// Determine render width dynamically
		this.renderWidth = Math.max(this.atMainRef.clientWidth || 800, 300);

		// --- AlphaTab Settings ---
		// (Adapted from your MVP and Vue component)
		this.alphaTabSettings = new alphaTab.Settings();
		this.alphaTabSettings.core.engine = "svg"; // Or "html5" if you prefer canvas
		this.alphaTabSettings.core.enableLazyLoading = true;
		this.alphaTabSettings.core.useWorkers = false; // Recommended true for performance
		this.alphaTabSettings.player.enablePlayer = false;
		// fontDirectory: For AlphaTab v2.x, fonts are often bundled.
		// If you are using v1.x or need custom fonts, this needs careful handling.
		// this.alphaTabSettings.core.fontDirectory = ...

		this.alphaTabSettings.display.scale = 0.8; // Default scale
		this.alphaTabSettings.display.layoutMode = alphaTab.LayoutMode.Page; // Or Horizontal

		// Player settings from your Vue component
		this.alphaTabSettings.player.enablePlayer = true;
		this.alphaTabSettings.player.enableCursor = true;
		// this.alphaTabSettings.player.enableHighlights = true; // if you want note highlights
		// this.alphaTabSettings.player.scrollMode = alphaTab.model.ScrollMode.Continuous;
		this.alphaTabSettings.player.scrollMode =
			alphaTab.ScrollMode.Continuous;
		this.alphaTabSettings.player.scrollElement = this.atViewportRef;
		this.alphaTabSettings.player.scrollOffsetY = -30; // Adjust as needed

		// soundFont: Will be loaded via api.loadSoundFont()
		// engine (worker for player): For v2.x, often bundled. If v1.x, path needs care.
		// this.alphaTabSettings.player.engine = ...

		// <-- Debug -->
		// ... (之前的日志和 AlphaTab Settings 配置) ...

		console.log(
			"[AlphaTab Debug] Original typeof process:",
			typeof process
		);
		console.log("[AlphaTab Debug] Original typeof module:", typeof module);

		let originalProcess: any, originalModule: any; // any to avoid TS errors on reassigning global types
		let modifiedGlobals = false;

		// @ts-ignore
		if (typeof process !== "undefined") {
			originalProcess = globalThis.process;
			// @ts-ignore
			globalThis.process = undefined;
			modifiedGlobals = true;
			console.log(
				"[AlphaTab Debug] Temporarily undefined globalThis.process"
			);
		}
		// @ts-ignore
		if (typeof module !== "undefined") {
			originalModule = globalThis.module;
			// @ts-ignore
			globalThis.module = undefined; // UMD 包装器经常检查这个
			modifiedGlobals = true;
			console.log(
				"[AlphaTab Debug] Temporarily undefined globalThis.module"
			);
		}

		try {
			this.api = new alphaTab.AlphaTabApi(
				this.atMainRef,
				this.alphaTabSettings
			);
			console.log(
				"[AlphaTab Debug] AlphaTabApi instantiated successfully after modifying globals."
			);
		} catch (e) {
			console.error(
				"Failed to initialize AlphaTab API (after modifying globals):",
				e
			);
			this.showErrorInOverlay(
				`Failed to initialize AlphaTab (modified globals): ${e.message}`
			);
			// 如果出错，也要确保恢复全局变量
		} finally {
			// 立即恢复全局变量，无论成功与否
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
			}
		}

		// ... (后续代码，但如果上面try中出错，可能不会执行) ...

		// --- 显式设置字体目录 ---
		try {
			const pluginId = this.plugin?.manifest?.id || "your-plugin-id"; // 确保 ID 正确
			if (pluginId === "your-plugin-id" && !this.plugin?.manifest?.id) {
				console.warn(
					"Plugin ID not found, fontDirectory path might be incorrect."
				);
			}

			// Obsidian 插件的资源通常通过 app://<plugin-id>/<path_to_asset> 访问
			// 我们需要指向包含 .font.json 文件的目录
			// 注意：AlphaTab 可能期望这个路径的末尾有或没有斜杠，需要测试。
			// 假设你的字体文件在 'assets/alphatab-fonts/' 目录下
			const fontDirectoryRelativePath = "assets/alphatab/font";
			// 构建一个 Obsidian 内部可访问的 URL
			// this.app.vault.adapter.getResourcePath() 通常用于文件，但我们可以尝试构建目录的URL
			// 一个更可靠的方法是直接使用 app:// 协议
			// const obsidianAssetProtocol = "app://"; // 或者 'app://obsidian.md/' - 需要确认
			const obsidianAssetProtocol = "obsidian://";

			// 尝试1: 使用插件ID构建的 app:// URL
			// AlphaTab 内部加载资源时，如果像浏览器一样使用 fetch 或 XHR，这个 URL 应该能工作
			// 注意：确保你的 manifest.json 中的 ID 是正确的
			const fontBaseUrl = `<span class="math-inline">\{obsidianAssetProtocol\}</span>{pluginId}/${fontDirectoryRelativePath}`;

			// 有些版本的 Obsidian 或 adapter 可能需要更完整的路径
			// const fontBaseUrl = this.app.vault.adapter.getResourcePath(normalizePath(`<span class="math-inline">\{this\.app\.plugins\.plugins\[pluginId\]?\.manifest\.dir\}/</span>{fontDirectoryRelativePath}`));
			// 上面这行 getResourcePath 对于目录可能不直接工作，或者返回的不是 URL。

			this.alphaTabSettings.core.fontDirectory = fontBaseUrl;
			console.log(
				`[AlphaTab Debug] Setting fontDirectory to: ${this.alphaTabSettings.core.fontDirectory}`
			);
		} catch (e) {
			console.error(
				"[AlphaTab Debug] Error constructing fontDirectory path:",
				e
			);
			this.alphaTabSettings.core.fontDirectory = ""; // Fallback or leave unset
		}

		// ... (显示设置、主题颜色和字体) ...
		this.alphaTabSettings.display.scale = 0.8;
		// ...
		Object.assign(
			this.alphaTabSettings.display.resources,
			themeColors,
			themeFonts
		);
		//Hack步骤结束

		// 进入正常的设置步骤
		// Theme resources (colors and fonts from your MVP)
		const themeColors = this.darkMode
			? {
					staffLineColor: new model.Color(221, 221, 221),
					barSeparatorColor: new model.Color(221, 221, 221),
					// ... other dark mode colors
					mainGlyphColor: new model.Color(238, 238, 238),
					secondaryGlyphColor: new model.Color(232, 232, 232),
					scoreInfoColor: new model.Color(248, 248, 248),
			  }
			: {
					staffLineColor: new model.Color(34, 34, 34),
					barSeparatorColor: new model.Color(34, 34, 34),
					// ... other light mode colors
					mainGlyphColor: new model.Color(17, 17, 17),
					secondaryGlyphColor: new model.Color(24, 24, 24),
					scoreInfoColor: new model.Color(8, 8, 8),
			  };
		const themeFonts = {
			/* ... your font definitions ... */
		};
		Object.assign(
			this.alphaTabSettings.display.resources,
			themeColors,
			themeFonts
		);

		console.log("[AlphaTab Debug] About to instantiate AlphaTabApi.");
		console.log("[AlphaTab Debug] typeof window:", typeof window);
		console.log("[AlphaTab Debug] typeof document:", typeof document);
		console.log(
			"[AlphaTab Debug] window exists:",
			window !== undefined && window !== null
		);
		console.log(
			"[AlphaTab Debug] document exists:",
			document !== undefined && document !== null
		);

		if (typeof window === "undefined" || typeof document === "undefined") {
			console.error(
				"CRITICAL DIAGNOSTIC: window or document IS UNDEFINED right before AlphaTabApi instantiation!"
			);
			// 你甚至可以在这里手动抛出一个错误，以便更早地捕获问题
			// throw new Error("Pre-AlphaTab check: window or document is undefined!");
		}

		// --- Instantiate AlphaTab API ---
		try {
			this.api = new alphaTab.AlphaTabApi(
				this.atMainRef,
				this.alphaTabSettings
			);
		} catch (e) {
			console.error("Failed to initialize AlphaTab API:", e);
			this.showErrorInOverlay(
				`Failed to initialize AlphaTab: ${e.message}`
			);
			return;
		}

		// --- Register AlphaTab Event Handlers ---
		this.api.error.on(this.handleAlphaTabError.bind(this));
		this.api.renderStarted.on(this.handleAlphaTabRenderStarted.bind(this));
		this.api.renderFinished.on(
			this.handleAlphaTabRenderFinished.bind(this)
		);
		this.api.scoreLoaded.on(this.handleAlphaTabScoreLoaded.bind(this));
		this.api.playerStateChanged.on(
			this.handlePlayerStateChanged.bind(this)
		);
		this.api.soundFontLoad.on((e) =>
			console.log("SoundFont loading progress:", e.progress)
		);
		this.api.soundFontLoaded.on(
			() => new Notice("SoundFont loaded successfully!")
		);
		this.api.soundFontLoadFailed.on((e) => {
			console.error("SoundFont load failed:", e);
			this.showErrorInOverlay("Failed to load SoundFont.");
			new Notice("Error: Could not load SoundFont for playback.");
		});
		// this.api.beatPlayed.on(beat => console.log("Beat played:", beat.index)); // For debugging

		// --- Load SoundFont ---
		this.showLoadingOverlay("Loading SoundFont...");
		try {
			// IMPORTANT: Replace 'your-plugin-id' with your actual plugin ID from manifest.json
			const pluginId = this.plugin?.manifest?.id || "your-plugin-id";
			if (pluginId === "your-plugin-id" && !this.plugin?.manifest?.id) {
				console.warn(
					"Plugin ID not found, SoundFont path might be incorrect. Please pass plugin to TabView constructor or set this.plugin correctly."
				);
			}
			const pluginBasePath = this.app.vault.adapter.getBasePath();
			// Note: getFullPath might not be available on all adapters or might behave differently.
			// We construct the path relative to the vault base path and plugin directory.
			const soundFontVaultPath = normalizePath(
				`${this.app.plugins.plugins[pluginId]?.manifest.dir}/assets/sonivox.sf2`
			);

			if (await this.app.vault.adapter.exists(soundFontVaultPath)) {
				const soundFontData = await this.app.vault.adapter.readBinary(
					soundFontVaultPath
				);
				await this.api.loadSoundFont(soundFontData); // AlphaTab handles ArrayBuffer directly
			} else {
				console.error(
					"SoundFont file not found at vault path:",
					soundFontVaultPath
				);
				this.showErrorInOverlay(
					"SoundFont file not found. Playback disabled."
				);
				new Notice(
					"SoundFont file (sonivox.sf2) not found in plugin assets. Playback will not work."
				);
			}
		} catch (e) {
			console.error("Error loading SoundFont:", e);
			this.showErrorInOverlay(
				`Error loading SoundFont: ${e.message}. Playback disabled.`
			);
		}

		// --- Load Score Data ---
		this.showLoadingOverlay(`Loading tab: ${file.basename}...`);
		try {
			const scoreData = await this.app.vault.readBinary(file);
			// AlphaTab's `load` method expects Uint8Array for binary files like GPX
			await this.api.load(new Uint8Array(scoreData));
			// If it were AlphaTex, you would use: await this.api.tex("alphaTexString");
		} catch (e) {
			console.error("Error loading score data:", e);
			this.handleAlphaTabError({
				message: `Failed to load score file: ${e.message}`,
			} as any);
		}
	}

	// --- AlphaTab Event Handler Methods ---
	private handleAlphaTabError(error: { message?: string } & any) {
		console.error("AlphaTab Processing Error:", error);
		let errorMessage = "AlphaTab Error: An unexpected issue occurred.";
		if (error && error.message) {
			errorMessage = `AlphaTab Error: ${error.message}`;
		} else if (typeof error === "string") {
			errorMessage = `AlphaTab Error: ${error}`;
		}
		this.showErrorInOverlay(errorMessage);
		new Notice(errorMessage, 10000); // Show notice for 10s
	}

	private handleAlphaTabRenderStarted() {
		this.showLoadingOverlay("Rendering sheet...");
	}

	private handleAlphaTabRenderFinished() {
		this.hideLoadingOverlay();
		// Optional: Scroll to a specific point, e.g., if alwaysScrollToBottom is a setting
		// this.scrollToBottom();
		new Notice("Tab rendered!");

		// Update display text after score info might be available
		this.leaf.updateHeader();
	}

	private handleAlphaTabScoreLoaded(score: Score | null) {
		if (!score) {
			this.showErrorInOverlay(
				"Error: Score data could not be loaded or parsed."
			);
			this.score = null;
			return;
		}
		this.score = score;
		new Notice(`Score loaded: ${score.title || "Untitled"}`);

		// Update tracks for the modal and set default render tracks
		this.tracksModal.setTracks(score.tracks);
		if (score.tracks && score.tracks.length > 0) {
			this.renderTracks = [score.tracks[0]]; // Default to first track
			this.tracksModal.setRenderTracks(this.renderTracks);
			if (this.api) {
				// Render the default track(s)
				this.api.renderTracks(this.renderTracks);
			}
		} else {
			this.renderTracks = [];
		}
		this.leaf.updateHeader(); // Update tab title
	}

	private handlePlayerStateChanged(args: PlayerStateChangedEventArgs) {
		if (!this.playPauseButton || !this.stopButton) return;

		switch (args.state) {
			case alphaTab.PlayerState.Playing:
				this.playPauseButton.setText("Pause");
				this.stopButton.disabled = false;
				break;
			case alphaTab.PlayerState.Paused:
				this.playPauseButton.setText("Play");
				this.stopButton.disabled = false;
				break;
			case alphaTab.PlayerState.Stopped:
				this.playPauseButton.setText("Play");
				this.stopButton.disabled = true;
				break;
		}
	}

	// --- UI Helper Methods (Overlay) ---
	private showLoadingOverlay(message: string) {
		if (this.atOverlayRef && this.atOverlayContentRef) {
			this.atOverlayContentRef.setText(message);
			this.atOverlayRef.style.display = "flex";
		}
	}
	private showErrorInOverlay(errorMessage: string) {
		this.showLoadingOverlay(errorMessage); // For now, same styling
		if (this.atOverlayRef) this.atOverlayRef.addClass("error"); // Optional: add error class for styling
	}
	private hideLoadingOverlay() {
		if (this.atOverlayRef) {
			this.atOverlayRef.style.display = "none";
			this.atOverlayRef.removeClass("error");
		}
	}

	// --- Other Methods from MVP ---
	public onChangeTracks(selectedTracks?: Track[]) {
		if (this.api && selectedTracks) {
			this.renderTracks = selectedTracks;
			this.api.renderTracks(this.renderTracks);
			new Notice(`Rendering ${selectedTracks.length} track(s).`);
		} else if (
			this.api &&
			(!selectedTracks || selectedTracks.length === 0)
		) {
			// Optionally handle no tracks selected - perhaps render all or show a message
			// For now, let's do nothing or render all if that's desired
			// this.api.renderTracks(this.score?.tracks || []);
			new Notice("No tracks selected to render.");
		}
	}

	public downloadMidi() {
		if (!this.score || !this.api) {
			new Notice("No score loaded to download MIDI from.");
			return;
		}
		try {
			const midiFile = new alphaTab.midi.MidiFile();
			// For AlphaTab v2, the way to generate MIDI might be slightly different.
			// The old way:
			// const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile, true);
			// const generator = new alphaTab.midi.MidiFileGenerator(this.score, this.api.settings, handler);
			// generator.generate();

			// More direct way if available (check AlphaTab docs for current best practice for MIDI export)
			// This is a common pattern:
			this.api.midiGenerate(
				this.renderTracks.map((t) => t.index),
				midiFile
			);

			const fileName = `${this.score.title || "Untitled Tab"}.mid`;
			const blob = new Blob([midiFile.toBinary()], {
				type: "audio/midi",
			});
			saveToFile(fileName, blob); // Assuming saveToFile is globally available or imported
			new Notice(`MIDI file "${fileName}" download started.`);
		} catch (e) {
			console.error("Error generating MIDI:", e);
			new Notice(`Error generating MIDI: ${e.message}`);
		}
	}

	override onResize(): void {
		super.onResize();
		if (this.api && this.atMainRef) {
			const newWidth = this.atMainRef.clientWidth;
			if (newWidth > 0 && newWidth !== this.renderWidth) {
				this.renderWidth = newWidth;
				// AlphaTab v2 might handle resize more automatically or have api.resized()
				// Forcing a re-render might be needed if layoutMode is Page and width changes significantly
				this.api.settings.display.width = newWidth; // Update setting
				this.api.render(); // Re-render
				new Notice("Tab resized and re-rendered.");
			}
		}
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		if (this.api) {
			try {
				this.api.destroy();
			} catch (e) {
				console.error("Error destroying AlphaTab API on unload:", e);
			}
			this.api = null;
		}
		this.score = null;
		this.currentFile = null;
		this.contentEl.empty();
		return super.onUnloadFile(file);
	}

	// Make sure to call this when the plugin unloads for this view type
	async onunload() {
		if (this.api) {
			try {
				this.api.destroy();
			} catch (e) {
				console.error(
					"Error destroying AlphaTab API during final unload:",
					e
				);
			}
			this.api = null;
		}
		super.onunload();
	}
}

// Helper function (can be moved to a utils.ts file)
export function saveToFile(fileName: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
