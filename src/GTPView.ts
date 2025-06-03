import { FileView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import * as alphaTab from '@coderline/alphatab';
import { VIEW_TYPE_GTP } from './main';

export class GTPView extends FileView {
    private alphaTabApi: alphaTab.AlphaTabApi | null = null;
    private atMain: HTMLElement | null = null;
    private atOverlay: HTMLElement | null = null;
    private atOverlayContent: HTMLElement | null = null;
    private atControls: HTMLElement | null = null;
    private controlBarFeatures: string[] = ['play', 'pause', 'stop', 'tempo'];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_GTP;
    }

    getDisplayText(): string {
        return this.file?.basename || 'Guitar Pro File';
    }

    async onLoadFile(file: TFile): Promise<void> {
        this.contentEl.empty();
        this.buildDOMStructure();

        if (this.alphaTabApi) {
            this.alphaTabApi.destroy();
            this.alphaTabApi = null;
        }

        try {
            const fileData = await this.app.vault.readBinary(file);
            await this.initializeAlphaTab(fileData);
        } catch (error) {
            this.showErrorInView(`Failed to load file: ${error.message}`);
        }
    }

    private buildDOMStructure(): void {
        const atWrap = this.contentEl.createDiv({ cls: 'at-wrap-gtp' });
        
        this.atOverlay = atWrap.createDiv({ cls: 'at-overlay', attr: { style: 'display: flex;' } });
        this.atOverlayContent = this.atOverlay.createDiv({ cls: 'at-overlay-content' });
        this.atOverlayContent.setText('Loading music sheet...');

        const atContent = atWrap.createDiv({ cls: 'at-content' });
        const atViewport = atContent.createDiv({ cls: 'at-viewport' });
        this.atMain = atViewport.createDiv({ cls: 'at-main' });

        this.atControls = atWrap.createDiv({ cls: 'at-controls' });
    }

    private async initializeAlphaTab(fileData: ArrayBuffer): Promise<void> {
        if (!this.atMain) return;

        // 获取插件基础路径
        const plugin = this.app.plugins.plugins['gp'];
        if (!plugin) {
            this.showErrorInView('AlphaTab plugin not found');
            return;
        }

        const pluginBasePath = plugin.manifest.dir || '';
        const settings: alphaTab.Settings = {
            core: {
                fontDirectory: `${pluginBasePath}/assets/font/`,
            },
            player: {
                enablePlayer: true,
                soundFont: `${pluginBasePath}/assets/soundfont/sonivox.sf2`,
                enableCursor: true,
                enableHighlights: true,
                scrollMode: alphaTab.model.ScrollMode.Continuous,
            }
        };

        try {
            this.alphaTabApi = new alphaTab.AlphaTabApi(this.atMain, settings);
            this.setupEventListeners();
            this.renderControls();
            
            // 加载文件数据
            this.alphaTabApi.load(fileData);
        } catch (error) {
            this.showErrorInView(`Failed to initialize AlphaTab: ${error.message}`);
        }
    }

    private setupEventListeners(): void {
        if (!this.alphaTabApi) return;

        this.alphaTabApi.error.on((error) => {
            this.showErrorInView(`AlphaTab Error: ${error.message || 'Unknown error'}`);
        });

        this.alphaTabApi.renderStarted.on(() => {
            if (this.atOverlay) {
                this.atOverlay.style.display = 'flex';
                if (this.atOverlayContent) {
                    this.atOverlayContent.setText('Rendering music sheet...');
                }
            }
        });

        this.alphaTabApi.renderFinished.on(() => {
            if (this.atOverlay) {
                this.atOverlay.style.display = 'none';
            }
        });

        this.alphaTabApi.scoreLoaded.on((score) => {
            if (!score) {
                this.showErrorInView('Score data could not be loaded');
            }
        });
    }

    private renderControls(): void {
        if (!this.atControls || !this.alphaTabApi) return;
        
        this.atControls.empty();
        const api = this.alphaTabApi;

        if (this.controlBarFeatures.includes('play') || this.controlBarFeatures.includes('pause')) {
            const playBtn = this.atControls.createEl('button', {
                cls: 'at-control-btn',
                text: '▶️',
                attr: { 'aria-label': 'Play/Pause' }
            });
            playBtn.onclick = () => api.playPause();
        }

        if (this.controlBarFeatures.includes('stop')) {
            const stopBtn = this.atControls.createEl('button', {
                cls: 'at-control-btn',
                text: '⏹️',
                attr: { 'aria-label': 'Stop' }
            });
            stopBtn.onclick = () => api.stop();
        }
    }

    private showErrorInView(message: string): void {
        if (this.atOverlay && this.atOverlayContent) {
            this.atOverlay.style.display = 'flex';
            this.atOverlayContent.setText(message);
        }
        new Notice(message);
        console.error('GTPView:', message);
    }

    async onUnloadFile(file: TFile): Promise<void> {
        if (this.alphaTabApi) {
            this.alphaTabApi.destroy();
            this.alphaTabApi = null;
        }
    }

    onunload(): void {
        if (this.alphaTabApi) {
            this.alphaTabApi.destroy();
        }
    }
}
