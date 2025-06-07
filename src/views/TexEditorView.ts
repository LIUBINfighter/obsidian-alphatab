import { ItemView, WorkspaceLeaf, TFile, debounce } from "obsidian";
import { TabDisplay } from "../components/TabDisplay";
import { TexEditor } from "../components/TexEditor";
import { ITabUIManager } from "../ITabUIManager";
import { ITabManager, ITabManagerOptions } from "../ITabManager";
import * as ITabEventHandlers from "../ITabEventHandlers";
import { PlayerStateChangedEventArgs } from "../types";
import type AlphaTabPlugin from "../main";

export const VIEW_TYPE_TEX_EDITOR = "alphatab-tex-editor";

export class TexEditorView extends ItemView {
	plugin: AlphaTabPlugin;
	editor: TexEditor;
	display: TabDisplay;
	private currentFile: TFile | null = null;
	private uiManager: ITabUIManager | null = null;
	private atManager: ITabManager | null = null;
	private layoutContainer: HTMLElement | null = null;
	private leftPanel: HTMLElement | null = null;
	private rightPanel: HTMLElement | null = null;
	private debouncedRender: () => void;
	private isAlphaTabInitialized = false;

	constructor(leaf: WorkspaceLeaf, plugin: AlphaTabPlugin) {
		super(leaf);
		this.plugin = plugin;
		
		// 创建防抖渲染函数，避免频繁更新
		this.debouncedRender = debounce(this.renderAlphaTab.bind(this), 500);
	}

	getViewType(): string {
		return VIEW_TYPE_TEX_EDITOR;
	}

	getDisplayText(): string {
		return this.currentFile?.basename || "AlphaTab 编辑器";
	}

	async onOpen() {
		this.containerEl.empty();
		this.setupLayout();
	}

	private setupLayout() {
		// 创建双栏布局容器
		this.layoutContainer = this.containerEl.createDiv({ cls: "tex-editor-layout" });
		
		// 左侧面板 - 文本编辑器
		this.leftPanel = this.layoutContainer.createDiv({ cls: "tex-editor-left-panel" });
		this.editor = new TexEditor(this.leftPanel);
		
		// 设置文本变化监听
		this.editor.onTextChange(() => {
			this.debouncedRender();
		});
		
		// 右侧面板 - AlphaTab 渲染区域
		this.rightPanel = this.layoutContainer.createDiv({ cls: "tex-editor-right-panel" });
		this.display = new TabDisplay(this.rightPanel);
		
		// 初始化右侧 AlphaTab UI
		this.initializeAlphaTabUI();
		
		// 添加样式
		this.addLayoutStyles();
	}

	private addLayoutStyles() {
		if (!this.layoutContainer) return;
		
		// 双栏布局样式
		this.layoutContainer.style.display = "flex";
		this.layoutContainer.style.height = "100%";
		this.layoutContainer.style.gap = "8px";
		
		if (this.leftPanel) {
			this.leftPanel.style.flex = "1 1 50%";
			this.leftPanel.style.minWidth = "300px";
			this.leftPanel.style.borderRight = "1px solid var(--background-modifier-border)";
			this.leftPanel.style.paddingRight = "8px";
		}
		
		if (this.rightPanel) {
			this.rightPanel.style.flex = "1 1 50%";
			this.rightPanel.style.minWidth = "300px";
			this.rightPanel.style.paddingLeft = "8px";
		}
	}

	private async initializeAlphaTabUI() {
		if (!this.rightPanel) return;
		
		// 初始化 UI 管理器
		this.uiManager = new ITabUIManager({ container: this.display.getContentElement() });
		this.uiManager.renderControlBar(
			() => this.atManager?.playPause(),
			() => this.atManager?.stop()
		);
		
		// 显示初始化状态
		this.uiManager.showLoadingOverlay("正在初始化 AlphaTab...");
		
		// 修复 mainElement 尺寸问题（参考 TabView）
		if (this.uiManager.atMainRef) {
			const mainEl = this.uiManager.atMainRef;
			if (mainEl.clientWidth === 0 || mainEl.clientHeight === 0) {
				mainEl.style.minWidth = mainEl.style.minWidth || "300px";
				mainEl.style.minHeight = mainEl.style.minHeight || "150px";
			}
		}
		
		// 初始化 AlphaTab 管理器
		const managerOptions: ITabManagerOptions = {
			pluginInstance: this.plugin,
			app: this.app,
			mainElement: this.uiManager.atMainRef,
			viewportElement: this.uiManager.atViewportRef,
			onError: (error) => {
				ITabEventHandlers.handleAlphaTabError(error, this.uiManager!);
			},
			onScoreLoaded: (score) => {
				if (score) {
					ITabEventHandlers.handleAlphaTabScoreLoaded(
						score,
						this.uiManager!,
						null,
						this.atManager!.api,
						this.leaf
					);
				}
			},
			onRenderStarted: () => {
				ITabEventHandlers.handleAlphaTabRenderStarted(this.uiManager!);
			},
			onRenderFinished: () => {
				ITabEventHandlers.handleAlphaTabRenderFinished(this.uiManager!, this.leaf);
			},
			onPlayerStateChanged: (args: PlayerStateChangedEventArgs) => {
				ITabEventHandlers.handlePlayerStateChanged(args, this.uiManager!);
			},
		};
		
		this.atManager = new ITabManager(managerOptions);
		this.atManager.setDarkMode(document.body.className.includes("theme-dark"));
		
		// 异步初始化 AlphaTab API
		try {
			await this.atManager.initializeForTexEditor();
			this.isAlphaTabInitialized = true;
			this.uiManager.showLoadingOverlay("AlphaTab 已就绪，请输入内容...");
			
			// 如果已有内容，立即渲染
			const content = this.editor?.getText();
			if (content && content.trim()) {
				this.debouncedRender();
			}
		} catch (error) {
			console.error("[TexEditorView] AlphaTab 初始化失败:", error);
			this.uiManager.showErrorInOverlay(`初始化失败: ${error.message}`);
		}
	}

	private async renderAlphaTab() {
		if (!this.atManager || !this.editor) return;
		
		// 检查 AlphaTab 是否已初始化
		if (!this.isAlphaTabInitialized) {
			this.uiManager?.showLoadingOverlay("AlphaTab 正在初始化，请稍候...");
			return;
		}
		
		const content = this.editor.getText();
		if (!content.trim()) {
			this.uiManager?.showLoadingOverlay("请输入 AlphaTab/AlphaTex 内容...");
			return;
		}
		
		try {
			this.uiManager?.showLoadingOverlay("正在渲染乐谱...");
			await this.atManager.loadFromAlphaTexString(content);
		} catch (error) {
			console.error("[TexEditorView] 渲染 AlphaTab 时出错:", error);
			this.uiManager?.showErrorInOverlay(`渲染错误: ${error.message}`);
		}
	}

	async setState(state: any, result: any) {
		await super.setState(state, result);
		if (state?.file) {
			const file = this.app.vault.getAbstractFileByPath(state.file);
			if (file instanceof TFile) {
				this.currentFile = file;
				await this.loadFileContent(file);
			}
		}
	}

	private async loadFileContent(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			if (this.editor) {
				// 使用静默设置，避免在加载时触发渲染
				this.editor.setTextSilently(content);
				// 只有在 AlphaTab 初始化完成后才手动触发一次渲染
				if (this.isAlphaTabInitialized) {
					this.debouncedRender();
				}
			}
		} catch (error) {
			console.error("[TexEditorView] 加载文件内容失败:", error);
		}
	}

	async onClose() {
		if (this.atManager) {
			this.atManager.destroy();
			this.atManager = null;
		}
		this.isAlphaTabInitialized = false;
		this.containerEl.empty();
	}
}
