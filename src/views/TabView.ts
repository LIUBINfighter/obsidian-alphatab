// TabView.ts
import { FileView, TFile, WorkspaceLeaf, Notice } from "obsidian";
import * as alphaTab from "@coderline/alphatab";
import { ITabUIManager } from "../ITabUIManager";
import { ITabManager, ITabManagerOptions } from "../ITabManager";
import * as ITabEventHandlers from "../ITabEventHandlers";
import { TracksSidebar } from "../components/TracksSidebar";
import { PlayerStateChangedEventArgs } from "../types"; // 从 types.ts 引入类型

export const VIEW_TYPE_TAB = "tab-view";

export class TabDisplay {
	private container: HTMLElement;
	private contentEl: HTMLElement;

	constructor(parent: HTMLElement) {
		// 优化：如果父容器已存在主内容区域，则复用，否则创建
		const existing = parent.querySelector('.at-main-content') as HTMLElement;
		this.container = existing || parent.createDiv({ cls: "at-main-content" });
		this.contentEl = this.container;

		// 优化：确保主内容区域有明确尺寸，避免 AlphaTab 渲染异常
		this.container.style.minWidth = "300px";
		this.container.style.minHeight = "150px";
		this.container.style.flex = "1 1 auto";
	}

	getContentElement(): HTMLElement {
		return this.contentEl;
	}

	// 可扩展：如需要添加额外的渲染逻辑，可在此实现
}

export class TabView extends FileView {
	private currentFile: TFile | null = null;
	private uiManager!: ITabUIManager;
	private atManager!: ITabManager;
	private tracksSidebar!: TracksSidebar;
	// private mainContentEl!: HTMLElement; // 移除
	private tabDisplay!: TabDisplay; // 新增
	private pluginInstance: any; // 主插件实例

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.pluginInstance = plugin; // 保存插件实例

		this.containerEl.addClasses([
			"itab"
		]);

		// 添加视图操作按钮
		this.addAction("music", "选择音轨", () => {
			if (this.atManager) {
				// 切换侧边栏显示或隐藏
				this.tracksSidebar.toggle();
			} else {
				new Notice("AlphaTab 管理器尚未初始化。");
			}
		});

		// 暂时注释掉 MIDI 下载按钮
		// this.addAction("download", "下载 MIDI", this.downloadMidi.bind(this));
	}

	getViewType(): string {
		return VIEW_TYPE_TAB;
	}

	getDisplayText() {
		// 从 ITabManager 获取乐谱信息来更新标题
		if (this.atManager && this.atManager.score) {
			return `${this.atManager.score.title || "未命名乐谱"} - ${
				this.atManager.score.artist || "未知艺术家"
			}`;
		}
		return this.currentFile?.basename || "吉他谱";
	}

	private async updateDisplayTitle() {
		// 使用 FileView 的方法来更新标题
		const title = this.getDisplayText();
		this.containerEl.find('.view-header-title')?.setText(title);
	}

	override async onLoadFile(file: TFile): Promise<void> {
		this.currentFile = file;
		this.contentEl.empty(); // 清空先前内容

		// 创建布局容器
		const layoutContainer = this.contentEl.createDiv({ cls: "at-layout-container" });
		
		// 创建侧边栏
		this.tracksSidebar = new TracksSidebar(
			layoutContainer, 
			this.onChangeTracksFromSidebar.bind(this)
		);

		// 优化：TabDisplay 只创建一次，后续复用
		if (!this.tabDisplay) {
			this.tabDisplay = new TabDisplay(layoutContainer);
		} else {
			// 复用时清空内容
			this.tabDisplay.getContentElement().empty();
		}

		// 1. 初始化 UI 管理器，主内容区域交给 TabDisplay
		this.uiManager = new ITabUIManager({ container: this.tabDisplay.getContentElement() });
		this.uiManager.renderControlBar(
			() => this.atManager?.playPause(), // Play/Pause 点击回调
			() => this.atManager?.stop() // Stop 点击回调
		);
		this.uiManager.showLoadingOverlay("正在初始化 AlphaTab..."); // "Initializing AlphaTab..."

		// 修复 mainElement 尺寸问题
		if (this.uiManager.atMainRef) {
			const mainEl = this.uiManager.atMainRef;
			if (
				mainEl.clientWidth === 0 ||
				mainEl.clientHeight === 0
			) {
				// 设置默认宽高，防止 AlphaTab 渲染失败
				mainEl.style.minWidth = mainEl.style.minWidth || "300px";
				mainEl.style.minHeight = mainEl.style.minHeight || "150px";
			}
		}

		// 2. 初始化 AlphaTab 管理器
		const managerOptions: ITabManagerOptions = {
			pluginInstance: this.pluginInstance,
			app: this.app, // 传递 App 实例
			mainElement: this.uiManager.atMainRef, // AlphaTab 渲染的主元素
			viewportElement: this.uiManager.atViewportRef, // AlphaTab 滚动视口元素
			onError: (error) => {
				ITabEventHandlers.handleAlphaTabError(
					error,
					this.uiManager
				);
				this.app.workspace.setActiveLeaf(this.leaf); // 修正: 使用正确的 API
			},
			onScoreLoaded: (score) => {
				// score 可能为 null
				if (score) {
					// 更新轨道侧边栏的数据源
					const allTracks = score.tracks || [];
					this.tracksSidebar.setTracks(allTracks);
					const initialRenderTracks =
						score.tracks && score.tracks.length > 0
							? [score.tracks[0]]
							: [];
					this.tracksSidebar.setRenderTracks(initialRenderTracks);
					
					// 如果需要，可以在这里额外调用 handler
					ITabEventHandlers.handleAlphaTabScoreLoaded(
						score,
						this.uiManager,
						null, // 不再使用TracksModal
						this.atManager.api,
						this.leaf
					);
				} else {
					// 处理 score 为 null 的情况，例如显示错误
					this.uiManager.showErrorInOverlay(
						"错误：无法加载乐谱数据。"
					);
				}
				this.app.workspace.setActiveLeaf(this.leaf); // 修正: 使用正确的 API
				this.updateDisplayTitle(); // 使用我们之前定义的方法
			},
			onRenderStarted: () => {
				ITabEventHandlers.handleAlphaTabRenderStarted(
					this.uiManager
				);
			},
			onRenderFinished: () => {
				ITabEventHandlers.handleAlphaTabRenderFinished(
					this.uiManager,
					this.leaf
				);
			},
			onPlayerStateChanged: (args: PlayerStateChangedEventArgs) => {
				ITabEventHandlers.handlePlayerStateChanged(
					args,
					this.uiManager
				);
			},
		};
		this.atManager = new ITabManager(managerOptions);
		this.atManager.setDarkMode(
			document.body.className.includes("theme-dark")
		);

		// 3. 使用 ITabManager 加载乐谱
		// 确保 pluginInstance.actualPluginDir 已被 main.ts 正确设置!
		if (!this.pluginInstance.actualPluginDir) {
			this.uiManager.showErrorInOverlay(
				"插件错误：根路径未配置，无法加载乐谱。"
			);
			console.error(
				"[TabView] CRITICAL: pluginInstance.actualPluginDir is not set. Aborting score load."
			);
			return;
		}
		await this.atManager.initializeAndLoadScore(file);
	}

	// 处理从轨道侧边栏的选择变更
	private onChangeTracksFromSidebar(selectedTracks?: alphaTab.model.Track[]) {
		if (!this.atManager) {
			new Notice("AlphaTab 管理器未准备好，无法更改音轨。");
			return;
		}
		
		// 确保至少有一个轨道被选中
		if (!selectedTracks || selectedTracks.length === 0) {
			const allTracks = this.atManager.getAllTracks();
			if (allTracks.length > 0) {
				selectedTracks = [allTracks[0]];
				// 同步更新侧边栏状态
				this.tracksSidebar.setRenderTracks(selectedTracks);
			} else {
				new Notice("没有可用的音轨。");
				return;
			}
		}
		
		this.atManager.updateRenderTracks(selectedTracks);
		
		if (selectedTracks.length === 1) {
			new Notice(`正在渲染轨道：${selectedTracks[0].name}`);
		} else {
			new Notice(`正在渲染 ${selectedTracks.length} 条音轨。`);
		}
	}

	// 暂时注释掉整个 downloadMidi 方法
	/*
	private downloadMidi() {
		if (!this.atManager || !this.atManager.score || !this.atManager.api) {
			new Notice("乐谱或 AlphaTab API 未就绪，无法导出 MIDI。");
			return;
		}
		try {
			const tracksForMidi =
				this.atManager.getSelectedRenderTracks().length > 0
					? this.atManager.getSelectedRenderTracks()
					: this.atManager.getAllTracks();

			if (!tracksForMidi || tracksForMidi.length === 0) {
				new Notice("没有可用音轨可以导出为 MIDI。");
				return;
			}
			const trackIndices = tracksForMidi.map((t) => t.index);

			const midiFile = new alphaTab.midi.MidiFile();
			const generator = new alphaTab.midi.MidiFileGenerator();
			generator.generate(this.atManager.api.score, trackIndices, midiFile);

			const fileName = `${
				this.atManager.score.title || "未命名乐谱"
			}.mid`;
			saveToFile(
				fileName,
				new Blob([midiFile.toBinary()], { type: "audio/midi" })
			);
			new Notice(`MIDI 文件 "${fileName}" 开始下载。`);
		} catch (e: any) {
			console.error(
				"[TabView] 生成 MIDI 时发生错误:",
				e.message,
				e.stack
			);
			new Notice(`生成 MIDI 错误: ${e.message}`);
		}
	}
	*/

	override onResize(): void {
		super.onResize();
		if (this.atManager && this.uiManager.atMainRef?.clientWidth > 0) {
			this.atManager.render();
			this.updateDisplayTitle(); // 使用我们之前定义的方法
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
		// 优化：彻底清理 TabDisplay
		if (this.tabDisplay) {
			this.tabDisplay.getContentElement().empty();
			// @ts-ignore
			this.tabDisplay = null;
		}
		await super.onUnloadFile(file);
	}
	
	async onunload() {
		// 当视图本身被关闭和销毁时
		console.log("[TabView] Final onunload triggered.");
		if (this.atManager) {
			this.atManager.destroy();
			// @ts-ignore
			this.atManager = null;
		}
		if (this.tabDisplay) {
			this.tabDisplay.getContentElement().empty();
			// @ts-ignore
			this.tabDisplay = null;
		}
		super.onunload();
	}
}
