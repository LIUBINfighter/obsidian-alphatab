// TabView.ts
import { FileView, TFile, WorkspaceLeaf, Notice, App } from "obsidian"; // App needed for TracksModal & Manager
import { AlphaTabUIManager } from "./AlphaTabUIManager";
import { AlphaTabManager, AlphaTabManagerOptions } from "./AlphaTabManager";
import * as AlphaTabEventHandlers from "./AlphaTabEventHandlers";
import { TracksModal } from "./TracksModal";
import { saveToFile } from "./utils"; // MIDI 下载需要
import type { Track, Score, PlayerStateChangedEventArgs, AlphaTabApi } from "@coderline/alphatab"; // 完整类型导入

export const VIEW_TYPE_TAB = "tab-view";

export class TabView extends FileView {
    private currentFile: TFile | null = null;
    private uiManager!: AlphaTabUIManager;
    private atManager!: AlphaTabManager;
    private tracksModal!: TracksModal;
    private pluginInstance: any; // 主插件实例

    constructor(leaf: WorkspaceLeaf, plugin: any) {
        super(leaf);
        this.pluginInstance = plugin; // 保存插件实例

        this.containerEl.addClasses([
            "alphatab-obsidian-plugin",
            "gtp-preview-container",
        ]);

        // TracksModal 初始化 (稍后当乐谱加载时会更新其音轨)
        // onChangeTracksFromModal 是 TracksModal 点击 "Apply" 后的回调
        this.tracksModal = new TracksModal(this.app, [], this.onChangeTracksFromModal.bind(this));

        // 添加视图操作按钮
        this.addAction("music", "选择音轨", () => { // "Select Tracks"
            if (this.atManager) {
                const allTracks = this.atManager.getAllTracks();
                const selectedTracks = this.atManager.getSelectedRenderTracks();
                if (allTracks.length > 0) {
                    this.tracksModal.setTracks(allTracks);
                    this.tracksModal.setRenderTracks(selectedTracks);
                    this.tracksModal.open();
                } else {
                    new Notice("当前乐谱没有可用音轨。");
                }
            } else {
                new Notice("AlphaTab 管理器尚未初始化。");
            }
        });

        this.addAction("download", "下载 MIDI", this.downloadMidi.bind(this)); // "Download MIDI"
    }

    getViewType(): string {
        return VIEW_TYPE_TAB;
    }

    getDisplayText() {
        // 从 AlphaTabManager 获取乐谱信息来更新标题
        if (this.atManager && this.atManager.score) {
            return `${this.atManager.score.title || "未命名乐谱"} - ${this.atManager.score.artist || "未知艺术家"}`;
        }
        return this.currentFile?.basename || "吉他谱";
    }

    override async onLoadFile(file: TFile): Promise<void> {
        this.currentFile = file;
        this.contentEl.empty(); // 清空先前内容

        // 1. 初始化 UI 管理器
        this.uiManager = new AlphaTabUIManager({ container: this.contentEl });
        this.uiManager.renderControlBar(
            () => this.atManager?.playPause(), // Play/Pause 点击回调
            () => this.atManager?.stop()      // Stop 点击回调
        );
        this.uiManager.showLoadingOverlay("正在初始化 AlphaTab..."); // "Initializing AlphaTab..."

        // 2. 初始化 AlphaTab 管理器
        const managerOptions: AlphaTabManagerOptions = {
            pluginInstance: this.pluginInstance,
            app: this.app, // 传递 App 实例
            mainElement: this.uiManager.atMainRef,    // AlphaTab 渲染的主元素
            viewportElement: this.uiManager.atViewportRef, // AlphaTab 滚动视口元素
            onError: (error) => {
                AlphaTabEventHandlers.handleAlphaTabError(error, this.uiManager);
                this.leaf.updateHeader(); // 更新标题以防乐谱信息失效
            },
            onScoreLoaded: (score) => { // score 可能为 null
                // AlphaTabEventHandlers.handleAlphaTabScoreLoaded 现在直接在 Manager 内部处理 score 和 renderTracks 的初始设置
                // TabView 仅需响应 UI 更新或 Modal 数据更新
                if (score) {
                     // 更新 TracksModal 的数据源
                    this.tracksModal.setTracks(score.tracks || []);
                    const initialRenderTracks = (score.tracks && score.tracks.length > 0) ? [score.tracks[0]] : [];
                    this.tracksModal.setRenderTracks(initialRenderTracks); // Modal 也用初始选择
                    // 如果需要，可以在这里额外调用 handler (但 manager 内部已处理 score 和 renderTracks)
                    AlphaTabEventHandlers.handleAlphaTabScoreLoaded(score, this.uiManager, this.tracksModal, this.atManager.api, this.leaf);

                } else {
                    // 处理 score 为 null 的情况，例如显示错误
                    this.uiManager.showErrorInOverlay("错误：无法加载乐谱数据。");
                }
                this.leaf.updateHeader(); // 更新视图标题
            },
            onRenderStarted: () => {
                AlphaTabEventHandlers.handleAlphaTabRenderStarted(this.uiManager);
            },
            onRenderFinished: () => {
                AlphaTabEventHandlers.handleAlphaTabRenderFinished(this.uiManager, this.leaf);
            },
            onPlayerStateChanged: (args: PlayerStateChangedEventArgs) => {
                AlphaTabEventHandlers.handlePlayerStateChanged(args, this.uiManager);
            },
        };
        this.atManager = new AlphaTabManager(managerOptions);
        this.atManager.setDarkMode(document.body.className.includes("theme-dark"));

        // 3. 使用 AlphaTabManager 加载乐谱
        // 确保 pluginInstance.actualPluginDir 已被 main.ts 正确设置!
        if (!this.pluginInstance.actualPluginDir) {
             this.uiManager.showErrorInOverlay("插件错误：根路径未配置，无法加载乐谱。");
             console.error("[TabView] CRITICAL: pluginInstance.actualPluginDir is not set. Aborting score load.");
             return;
        }
        await this.atManager.initializeAndLoadScore(file);
    }

    // TracksModal "Apply" 按钮的回调
    private onChangeTracksFromModal(selectedTracks?: Track[]) {
        if (!this.atManager) {
            new Notice("AlphaTab 管理器未准备好，无法更改音轨。");
            return;
        }
        if (selectedTracks && selectedTracks.length > 0) {
            this.atManager.updateRenderTracks(selectedTracks); // 通知 Manager 更新音轨
            new Notice(`正在渲染 ${selectedTracks.length} 条音轨。`);
        } else {
            // 如果没有选择音轨，可以恢复到默认（例如，Manager 内部的 this.renderTracks 或所有音轨）
            // new Notice("未选择音轨，将按默认显示。"); // 或者 Manager 自己决定如何处理空选择
            const allTracks = this.atManager.getAllTracks(); // 获取所有音轨作为后备
            this.atManager.updateRenderTracks(allTracks);
            new Notice("未选择特定音轨，显示所有音轨。");
        }
    }

    private downloadMidi() {
        if (!this.atManager || !this.atManager.score || !this.atManager.api) {
            new Notice("乐谱或 AlphaTab API 未就绪，无法导出 MIDI。");
            return;
        }
        try {
            // 获取当前选择用于渲染的音轨，如果没有则导出所有音轨
            const tracksForMidi = this.atManager.getSelectedRenderTracks().length > 0
                ? this.atManager.getSelectedRenderTracks()
                : this.atManager.getAllTracks();

            if (!tracksForMidi || tracksForMidi.length === 0) {
                new Notice("没有可用音轨可以导出为 MIDI。");
                return;
            }
            const trackIndices = tracksForMidi.map(t => t.index);

            const midiFile = new alphaTab.midi.MidiFile();
            this.atManager.api.midiGenerate(trackIndices, midiFile);

            const fileName = `${this.atManager.score.title || '未命名乐谱'}.mid`;
            saveToFile(fileName, new Blob([midiFile.toBinary()], { type: "audio/midi" }));
            new Notice(`MIDI 文件 "${fileName}" 开始下载。`);

        } catch (e: any) {
            console.error("[TabView] 生成 MIDI 时发生错误:", e.message, e.stack);
            new Notice(`生成 MIDI 错误: ${e.message}`);
        }
    }

    override onResize(): void {
        super.onResize();
        // 可以添加防抖逻辑
        if (this.atManager && this.uiManager.atMainRef?.clientWidth > 0) {
            // AlphaTabManager 应该自己处理宽度的变化，或者提供一个 resize 方法
            // this.atManager.settings.display.width = this.uiManager.atMainRef.clientWidth; // 不建议直接修改
            this.atManager.render(); // 通知 Manager 重新渲染，它会使用当前的宽度
        }
    }

    override async onUnloadFile(file: TFile): Promise<void> {
        console.log(`[TabView] Unloading file: ${file.name}`);
        if (this.atManager) {
            this.atManager.destroy();
            // @ts-ignore
            this.atManager = null; // Help GC
        }
        this.currentFile = null;
        this.contentEl.empty(); // 清理 DOM
        await super.onUnloadFile(file);
    }

    async onunload() { // 当视图本身被关闭和销毁时
        console.log("[TabView] Final onunload triggered.");
        if (this.atManager) {
            this.atManager.destroy();
            // @ts-ignore
            this.atManager = null;
        }
        super.onunload();
    }
}
