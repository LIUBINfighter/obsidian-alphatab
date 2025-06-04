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
    LayoutMode,
    ScrollMode
    // PlayerState
} from "@coderline/alphatab";

export const VIEW_TYPE_TAB = "tab-view";

// TracksModal class (remains the same)
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
        this.contentEl.empty();
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
    private alphaTabSettings: Settings;
    private renderTracks: Track[] = [];
    private renderWidth = 800;
    private darkMode: boolean;
    private tracksModal: TracksModal;

    private atWrap: HTMLElement;
    private atOverlayRef: HTMLElement;
    private atOverlayContentRef: HTMLElement;
    private atMainRef: HTMLElement;
    private atViewportRef: HTMLElement;
    private atControlsRef: HTMLElement;
    private playPauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;

    private pluginInstance: any;

    constructor(leaf: WorkspaceLeaf, plugin: any) { // Expect plugin to be passed directly
        super(leaf);
        this.pluginInstance = plugin; // Store the passed plugin instance

        // Simplified plugin instance check in constructor
        if (!this.pluginInstance?.manifest?.id) {
            console.error("AlphaTabPlugin: CRITICAL - Plugin instance or manifest.id is not valid in TabView constructor. Ensure 'this' (the plugin instance) is passed from main.ts.");
        } else {
            console.log(`[AlphaTab Debug] TabView constructor: Initialized with plugin ID '${this.pluginInstance.manifest.id}' (this.pluginInstance.manifest.id)`);
        }

        this.containerEl.addClasses(["alphatab-obsidian-plugin", "gtp-preview-container"]);
        this.tracksModal = new TracksModal(this.app, [], this.onChangeTracks.bind(this));
        this.addAction("music", "Select Tracks", () => this.tracksModal.open());
        this.addAction("download", "Download MIDI", this.downloadMidi.bind(this));
    }

    getViewType(): string {
        return VIEW_TYPE_TAB;
    }

    getDisplayText() {
        if (this.score) {
            return `${this.score.title || "Untitled"} - ${this.score.artist || "Unknown Artist"}`;
        }
        return this.currentFile?.basename || "Guitar Tab";
    }

    override async onLoadFile(file: TFile): Promise<void> {
        this.currentFile = file;
        this.contentEl.empty();
        this.darkMode = document.body.className.includes("theme-dark");

        this.atWrap = this.contentEl.createDiv({ cls: "at-wrap" });
        this.atOverlayRef = this.atWrap.createDiv({ cls: "at-overlay", attr: { style: "display: none;" } });
        this.atOverlayContentRef = this.atOverlayRef.createDiv({ cls: "at-overlay-content" });
        const atContent = this.atWrap.createDiv({ cls: "at-content" });
        this.atViewportRef = atContent.createDiv({ cls: "at-viewport" });
        this.atMainRef = this.atViewportRef.createDiv({ cls: "at-main" });
        this.atControlsRef = this.atWrap.createDiv({ cls: "at-controls" });
        this.renderControlBar(this.atControlsRef);

        await this.initializeAlphaTabAndLoadScore(file);
    }

    private renderControlBar(container: HTMLElement) {
        container.empty();
        this.playPauseButton = container.createEl("button", { text: "Play" });
        this.playPauseButton.addEventListener("click", () => this.api?.playPause());
        this.stopButton = container.createEl("button", { text: "Stop" });
        this.stopButton.addEventListener("click", () => this.api?.stop());
    }

    private getPluginAssetHttpUrl(pluginId: string, assetPath: string): string {
        // Check if getPluginAssetUrl is available and is a function
        if (this.app.vault.adapter.getPluginAssetUrl && typeof this.app.vault.adapter.getPluginAssetUrl === 'function') {
            try {
                const url = this.app.vault.adapter.getPluginAssetUrl(pluginId, assetPath);
                console.log(`[AlphaTab Debug] Using getPluginAssetUrl for '${assetPath}': ${url}`);
                return url;
            } catch (e) {
                console.warn(`[AlphaTab Debug] getPluginAssetUrl failed for '${assetPath}', falling back to manual construction. Error:`, e);
            }
        } else {
            console.warn(`[AlphaTab Debug] this.app.vault.adapter.getPluginAssetUrl is not a function. Falling back to manual URL construction for '${assetPath}'.`);
        }
        
        // Fallback: Manually construct the app:// URL
        // Ensure assetPath doesn't start with a slash if pluginId already provides the base
        const normalizedAssetPath = assetPath.startsWith('/') ? assetPath.substring(1) : assetPath;
        const manualUrl = `app://${pluginId}/${normalizedAssetPath}`;
        console.log(`[AlphaTab Debug] Manually constructed URL for '${assetPath}': ${manualUrl}`);
        return manualUrl;
    }


    private async initializeAlphaTabAndLoadScore(file: TFile) {
        if (this.api) {
            try { this.api.destroy(); } catch (e) { console.error("Error destroying previous API:", e); }
            this.api = null;
        }
        this.score = null;
        this.showLoadingOverlay("Initializing AlphaTab...");
        await new Promise(resolve => setTimeout(resolve, 0));
        this.renderWidth = Math.max(this.atMainRef?.clientWidth || 800, 300);

        const themeColors = this.darkMode
            ? {
                staffLineColor: new model.Color(221, 221, 221), barSeparatorColor: new model.Color(221, 221, 221),
                mainGlyphColor: new model.Color(238, 238, 238), secondaryGlyphColor: new model.Color(232, 232, 232),
                scoreInfoColor: new model.Color(248, 248, 248),
            } : {
                staffLineColor: new model.Color(34, 34, 34), barSeparatorColor: new model.Color(34, 34, 34),
                mainGlyphColor: new model.Color(17, 17, 17), secondaryGlyphColor: new model.Color(24, 24, 24),
                scoreInfoColor: new model.Color(8, 8, 8),
            };
        const themeFonts = { /* Define your actual fonts here if needed */ };

        this.alphaTabSettings = new alphaTab.Settings();
        this.alphaTabSettings.core.engine = "svg";
        this.alphaTabSettings.core.enableLazyLoading = true;

        const pluginId = this.pluginInstance?.manifest?.id;
        if (!pluginId) {
            const errorMsg = "AlphaTabPlugin: CRITICAL - Plugin ID is not available during AlphaTab initialization. Cannot load resources.";
            console.error(errorMsg);
            new Notice(errorMsg, 10000);
            this.showErrorInOverlay("AlphaTab Setup Error: Plugin ID missing.");
            return;
        }
        console.log(`[AlphaTab Debug] Using Plugin ID for resources: '${pluginId}'`);

        this.alphaTabSettings.core.useWorkers = false;
        this.alphaTabSettings.player.enablePlayer = false;

        try {
            const fontDirectoryAssetPath = `assets/alphatab/font/`;
            this.alphaTabSettings.core.fontDirectory = this.getPluginAssetHttpUrl(pluginId, fontDirectoryAssetPath);
            
            const mainAlphaTabScriptAssetPath = `assets/alphatab/alphaTab.mjs`;
            this.alphaTabSettings.core.scriptFile = this.getPluginAssetHttpUrl(pluginId, mainAlphaTabScriptAssetPath);

        } catch (e: any) {
            console.error("[AlphaTab Debug] Critical error during resource URL construction:", e);
            new Notice("AlphaTab Error: Could not construct essential resource paths.", 10000);
            this.showErrorInOverlay("AlphaTab Setup Error: Resource path construction failed critically.");
            return;
        }
        
        this.alphaTabSettings.display.scale = 0.8;
        this.alphaTabSettings.display.layoutMode = LayoutMode.Page;
        Object.assign(this.alphaTabSettings.display.resources, themeColors, themeFonts);

        this.alphaTabSettings.player.enableCursor = true;
        this.alphaTabSettings.player.scrollMode = ScrollMode.Continuous;
        this.alphaTabSettings.player.scrollElement = this.atViewportRef;
        this.alphaTabSettings.player.scrollOffsetY = -30;

        console.log("[AlphaTab Debug] Original typeof module:", typeof module);
        let originalModule: any;
        let modifiedGlobals = false;
        // @ts-ignore
        if (typeof module !== "undefined") {
            originalModule = globalThis.module;
            // @ts-ignore
            globalThis.module = undefined;
            modifiedGlobals = true;
            console.log("[AlphaTab Debug] Temporarily undefined globalThis.module");
        }

        try {
            console.log("[AlphaTab Debug] Final settings before API init:", JSON.stringify(this.alphaTabSettings, null, 2));
            this.api = new alphaTab.AlphaTabApi(this.atMainRef, this.alphaTabSettings);
            console.log("[AlphaTab Debug] AlphaTabApi instantiated successfully.");
        } catch (e: any) {
            console.error("Failed to initialize AlphaTab API:", e);
            this.showErrorInOverlay(`Failed to initialize AlphaTab: ${e.message}`);
            if (modifiedGlobals) {
                // @ts-ignore
                globalThis.module = originalModule;
                console.log("[AlphaTab Debug] Restored globalThis.module on API init error");
            }
            return;
        } finally {
            if (modifiedGlobals && globalThis.module === undefined) {
                 // @ts-ignore
                globalThis.module = originalModule;
                console.log("[AlphaTab Debug] Restored globalThis.module in finally block");
            }
        }

        if (!this.api) {
            console.error("[AlphaTab Debug] API is null after instantiation attempt, cannot proceed.");
            this.showErrorInOverlay("AlphaTab Error: API failed to initialize.");
            return;
        }

        this.api.error.on(this.handleAlphaTabError.bind(this));
        this.api.renderStarted.on(this.handleAlphaTabRenderStarted.bind(this));
        this.api.renderFinished.on(this.handleAlphaTabRenderFinished.bind(this));
        this.api.scoreLoaded.on(this.handleAlphaTabScoreLoaded.bind(this));
        this.api.playerStateChanged.on(this.handlePlayerStateChanged.bind(this));
        this.api.soundFontLoad.on(e => console.log("SoundFont loading progress:", e.progress));
        this.api.soundFontLoaded.on(() => new Notice("SoundFont loaded successfully!"));
        this.api.soundFontLoadFailed.on(e => {
            console.error("SoundFont load failed:", e);
            this.showErrorInOverlay("Failed to load SoundFont.");
            new Notice("Error: Could not load SoundFont for playback.");
        });

        if (this.alphaTabSettings.player.enablePlayer) {
            this.showLoadingOverlay("Loading SoundFont...");
            try {
                const soundFontAssetPath = `assets/alphatab/soundfont/sonivox.sf2`;
                // For binary files like soundfont, we use vault.readBinary, not getPluginAssetUrl
                const soundFontVaultPath = normalizePath(`${this.pluginInstance.manifest.dir}/${soundFontAssetPath}`);
                if (await this.app.vault.adapter.exists(soundFontVaultPath)) {
                    const soundFontData = await this.app.vault.adapter.readBinary(soundFontVaultPath);
                    await this.api.loadSoundFont(soundFontData);
                } else {
                    console.error("SoundFont file not found:", soundFontVaultPath);
                    this.showErrorInOverlay("SoundFont file not found. Playback disabled.");
                }
            } catch (e: any) {
                console.error("Error loading SoundFont:", e);
                this.showErrorInOverlay(`Error loading SoundFont: ${e.message}.`);
            }
        }

        this.showLoadingOverlay(`Loading tab: ${file.basename}...`);
        try {
            const scoreData = await this.app.vault.readBinary(file);
            await this.api.load(new Uint8Array(scoreData));
        } catch (e: any) {
            console.error("Error loading score data:", e);
            this.handleAlphaTabError({ message: `Failed to load score file: ${e.message}` } as any);
        }
    }

    private handleAlphaTabError(error: { message?: string } & any) {
        console.error("AlphaTab Processing Error:", error);
        const errorMessage = `AlphaTab Error: ${error.message || 'An unexpected issue occurred.'}`;
        this.showErrorInOverlay(errorMessage);
        new Notice(errorMessage, 10000);
    }

    private handleAlphaTabRenderStarted() { this.showLoadingOverlay("Rendering sheet..."); }
    private handleAlphaTabRenderFinished() {
        this.hideLoadingOverlay();
        new Notice("Tab rendered!");
        this.leaf.updateHeader();
    }

    private handleAlphaTabScoreLoaded(score: Score | null) {
        if (!score) {
            this.showErrorInOverlay("Error: Score data could not be loaded or parsed.");
            this.score = null; return;
        }
        this.score = score;
        new Notice(`Score loaded: ${score.title || 'Untitled'}`);
        this.tracksModal.setTracks(score.tracks);
        if (score.tracks?.length > 0) {
            this.renderTracks = [score.tracks[0]];
            this.tracksModal.setRenderTracks(this.renderTracks);
            this.api?.renderTracks(this.renderTracks);
        } else {
            this.renderTracks = [];
        }
        this.leaf.updateHeader();
    }

    private handlePlayerStateChanged(args: PlayerStateChangedEventArgs) {
        if (!this.playPauseButton || !this.stopButton) return;
        const isPlaying = args.state === PlayerState.Playing;
        const isPaused = args.state === PlayerState.Paused;
        this.playPauseButton.setText(isPlaying ? "Pause" : "Play");
        this.stopButton.disabled = !(isPlaying || isPaused);
    }

    private showLoadingOverlay(message: string) {
        if (this.atOverlayRef && this.atOverlayContentRef) {
            this.atOverlayContentRef.setText(message);
            this.atOverlayRef.style.display = "flex";
        }
    }
    private showErrorInOverlay(errorMessage: string) {
        this.showLoadingOverlay(errorMessage);
        this.atOverlayRef?.addClass("error");
    }
    private hideLoadingOverlay() {
        if (this.atOverlayRef) {
            this.atOverlayRef.style.display = "none";
            this.atOverlayRef.removeClass("error");
        }
    }

    public onChangeTracks(selectedTracks?: Track[]) {
        if (!this.api) return;
        if (selectedTracks && selectedTracks.length > 0) {
            this.renderTracks = selectedTracks;
            this.api.renderTracks(this.renderTracks);
            new Notice(`Rendering ${selectedTracks.length} track(s).`);
        } else {
            new Notice("No tracks selected to render.");
        }
    }

    public downloadMidi() {
        if (!this.score || !this.api) { new Notice("No score loaded."); return; }
        try {
            const midiFile = new alphaTab.midi.MidiFile();
            this.api.midiGenerate(this.renderTracks.map(t => t.index), midiFile);
            const fileName = `${this.score.title || 'Untitled Tab'}.mid`;
            saveToFile(fileName, new Blob([midiFile.toBinary()], { type: "audio/midi" }));
            new Notice(`MIDI "${fileName}" download started.`);
        } catch (e: any) {
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
                if (this.api.settings?.display) {
                    this.api.settings.display.width = newWidth;
                } else {
                    console.warn("[AlphaTab Debug] API settings or display object not found during resize.");
                }
                this.api.render();
                new Notice("Tab resized and re-rendered.");
            }
        }
    }

    override async onUnloadFile(file: TFile): Promise<void> {
        if (this.api) { try { this.api.destroy(); } catch (e) { console.error("Error destroying API on unload:", e); } this.api = null; }
        this.score = null; this.currentFile = null; this.contentEl.empty();
        await super.onUnloadFile(file);
    }

    async onunload() {
        if (this.api) { try { this.api.destroy(); } catch(e) { console.error("Error destroying API on final unload:", e); } this.api = null; }
        await super.onunload();
    }
}

export function saveToFile(fileName: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}
