import { App, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, Notice, TFile } from 'obsidian';
import * as alphaTab from '@coderline/alphatab';
import { GTPView } from './GTPView';

export const VIEW_TYPE_GTP = "gtp-view";

// (可选) 插件设置接口
interface AlphaTabPluginSettings {
    defaultShowTrackSidebar: boolean;
    defaultControlBarFeatures: string[]; // e.g., ["play", "tempo", "zoom"]
    // ... 其他你希望用户可以配置的选项
}

const DEFAULT_SETTINGS: AlphaTabPluginSettings = {
    defaultShowTrackSidebar: true,
    defaultControlBarFeatures: ['play', 'pause', 'stop', 'tempo', 'loop', 'print', 'fullscreen', 'tracks', 'zoom'],
};

export default class AlphaTabPlugin extends Plugin {
    settings: AlphaTabPluginSettings;
    alphaTabInstances: Map<HTMLElement, alphaTab.AlphaTabApi> = new Map(); // 用于管理实例

    async onload() {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_GTP, (leaf) => new GTPView(leaf));
        this.registerExtensions(
            ["gtp", "gp", "gp3", "gp4", "gp5", "gpx", "alphatex"],
            VIEW_TYPE_GTP
        );
        
        // 注册 Markdown 代码块处理器
        this.registerMarkdownCodeBlockProcessor('alphatab', (source, el, ctx) => {
            this.renderAlphaTab(source, el, ctx);
        });

        // (可选) 添加设置页
        this.addSettingTab(new AlphaTabSettingTab(this.app, this));
        console.log('AlphaTab plugin loaded.');
    }

    onunload() {
        // 清理所有 AlphaTab 实例
        this.alphaTabInstances.forEach(api => api.destroy());
        this.alphaTabInstances.clear();
        console.log('AlphaTab plugin unloaded.');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 渲染 AlphaTab 的核心方法
    async renderAlphaTab(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        el.empty(); // 清空容器，防止重复渲染

        // --- 1. 解析代码块内容 (source) ---
        // 你需要定义一种方式从 `source` 中提取 AlphaTex 内容和配置参数
        // 例如，使用 YAML Frontmatter 风格的头部来配置，剩余部分为 AlphaTex
        // ---
        // file: path/to/score.gp
        // showSidebar: true
        // controls: [play, tempo]
        // alwaysScrollToBottom: false
        // ---
        // \title "My Song from AlphaTex"
        // ... (alphatex content) ...

        let texContent = source;
        let scoreFile: string | null = null;
        let showTrackSidebar = this.settings.defaultShowTrackSidebar;
        let controlBarFeatures = this.settings.defaultControlBarFeatures;
        let alwaysScrollToBottom = false; // 从 Vue props 移植

        // 简单的 YAML Frontmatter 解析 (或使用库)
        if (source.startsWith('---')) {
            const endFrontmatter = source.indexOf('---', 3);
            if (endFrontmatter > 0) {
                const frontmatterText = source.substring(3, endFrontmatter);
                texContent = source.substring(endFrontmatter + 3).trim();
                // (这里需要一个简单的YAML解析器或手动解析)
                // 示例：
                const lines = frontmatterText.split('\n');
                lines.forEach(line => {
                    const [key, ...valueParts] = line.split(':');
                    const value = valueParts.join(':').trim();
                    if (key.trim() === 'file') scoreFile = value;
                    if (key.trim() === 'showSidebar') showTrackSidebar = value === 'true';
                    if (key.trim() === 'alwaysScrollToBottom') alwaysScrollToBottom = value === 'true';
                    // 'controls' 解析会更复杂一点，可能需要解析数组字符串
                });
            }
        }


        // --- 2. 创建 DOM 结构 (类似 Vue 模板) ---
        const atWrap = el.createDiv({ cls: 'at-wrap-obsidian' }); // 使用不同类名避免冲突
        const atOverlay = atWrap.createDiv({ cls: 'at-overlay-obsidian', attr: { style: 'display: none;' } });
        const atOverlayContent = atOverlay.createDiv({ cls: 'at-overlay-content-obsidian' });
        atOverlayContent.setText('Music sheet is loading');

        const atContent = atWrap.createDiv({ cls: 'at-content-obsidian' });

        // TrackSidebar (如果启用)
        let trackSidebarContainer: HTMLElement | null = null;
        if (showTrackSidebar) {
            trackSidebarContainer = atContent.createDiv({ cls: 'at-track-sidebar-obsidian' });
            // TrackSidebar 的内容将由 AlphaTab 加载后填充
        }

        const atViewport = atContent.createDiv({ cls: `at-viewport-obsidian ${showTrackSidebar ? 'has-sidebar' : ''}` });
        const atMain = atViewport.createDiv({ cls: 'at-main-obsidian' });

        const atControls = atWrap.createDiv({ cls: 'at-controls-obsidian' });
        // ControlBar 的按钮将在这里创建

        // --- 3. AlphaTab 资源路径 ---
        // 这是关键且可能棘手的部分。路径需要相对于 Obsidian 插件的资源。
        // Obsidian v1.0+ 推荐使用 app.vault.adapter.getResourcePath()
        // 或者，你需要确保这些资源在插件的根目录下，并使用相对路径。
        // 更可靠的方式可能是在插件加载时将 worker 和 soundfont 复制到插件的数据目录。
        // 我们假设资源在插件的 assets 目录下。
        const pluginBasePath = this.manifest.dir || '';
        const fontDir = `${pluginBasePath}/assets/font/`;
        const soundFontPath = `${pluginBasePath}/assets/soundfont/sonivox.sf2`;
        const workerPath = `${pluginBasePath}/assets/alphaTab.worker.mjs`;

        // --- 4. AlphaTab 设置和实例化 ---
        const settings: alphaTab.Settings = {
            core: {
                fontDirectory: fontDir,
            },
            player: {
                enablePlayer: true,
                soundFont: soundFontPath,
                engine: workerPath,
                enableCursor: true,
                enableHighlights: true,
                scrollMode: alphaTab.model.ScrollMode.Continuous,
                scrollElement: atViewport, // 视口元素
                // scrollOffsetY: -30 // 与 Vue 组件一致
            }
            // file 属性会根据 scoreFile 动态设置
        };

        if (scoreFile && !texContent.trim()) { // 如果指定了文件且没有内联 AlphaTex
            const filePath = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            let absoluteScorePath = scoreFile;
            if (filePath && filePath.parent) {
                const resolvedFile = this.app.vault.getAbstractFileByPath(
                    this.app.vault.adapter.path.join(filePath.parent.path, scoreFile)
                );
                if (resolvedFile) {
                    absoluteScorePath = resolvedFile.path;
                }
            }
            
            const tFile = this.app.vault.getAbstractFileByPath(absoluteScorePath);
            if (tFile instanceof TFile) {
                try {
                    const scoreData = await this.app.vault.readBinary(tFile);
                    api.load(scoreData);
                } catch (error) {
                    atOverlayContent.setText(`Failed to load score file: ${error.message}`);
                    atOverlay.style.display = 'flex';
                    console.error(`AlphaTab: Failed to load score file:`, error);
                    return;
                }
            } else {
                atOverlayContent.setText(`Error: Score file not found at ${absoluteScorePath}`);
                atOverlay.style.display = 'flex';
                console.error(`AlphaTab: Score file not found at ${absoluteScorePath}`);
                return;
            }
        }

        let api: alphaTab.AlphaTabApi;
        try {
            api = new alphaTab.AlphaTabApi(atMain, settings);
            this.alphaTabInstances.set(el, api); // 存储实例以便后续清理
        } catch (e) {
            console.error("Failed to initialize AlphaTab API:", e);
            atOverlayContent.setText(`Failed to initialize AlphaTab: ${e.message}`);
            atOverlay.style.display = 'flex';
            return;
        }


        // --- 5. AlphaTab 事件监听 (移植 Vue 组件逻辑) ---
        api.error.on((error) => {
            console.error('AlphaTex Processing Error:', error);
            atOverlay.style.display = 'flex';
            atOverlayContent.setText(`AlphaTex Error: ${error.message || 'Unknown error'}`);
        });

        api.renderStarted.on(() => {
            atOverlay.style.display = 'flex';
            atOverlayContent.setText('Music sheet is loading');
            // currentActiveTrackIndices logic (if needed)
        });

        api.renderFinished.on(() => {
            atOverlay.style.display = 'none';
            if (alwaysScrollToBottom) {
                this.scrollToBottom(atViewport, api); // 实现 scrollToBottom
            }
        });

        api.scoreLoaded.on(score => {
            if (!score) {
                atOverlayContent.setText('Error: Score data could not be loaded.');
                atOverlay.style.display = 'flex';
            } else {
                // 更新歌曲标题和艺术家 (如果 ControlBar 中有这些元素)
                // const songTitleEl = atControls.querySelector('.at-song-title');
                // const songArtistEl = atControls.querySelector('.at-song-artist');
                // if (songTitleEl) songTitleEl.textContent = score.title;
                // if (songArtistEl) songArtistEl.textContent = score.artist;

                // 更新 TrackSidebar
                if (trackSidebarContainer && showTrackSidebar) {
                    this.renderTrackSidebar(trackSidebarContainer, score.tracks, api);
                }
            }
        });

        // --- 6. 加载乐谱数据 ---
        if (texContent.trim()) {
            try {
                const texPromise = api.tex(texContent);
                if (texPromise && typeof texPromise.catch === 'function') {
                    texPromise.catch(e => {
                        console.error('Error in tex loading promise:', e);
                        atOverlayContent.setText(`Failed to process AlphaTex: ${e.message || 'Error during loading.'}`);
                        atOverlay.style.display = 'flex';
                    });
                }
            } catch (e) {
                console.error('Synchronous error during tex processing:', e);
                atOverlayContent.setText(`Error initializing AlphaTex (sync): ${e.message}`);
                atOverlay.style.display = 'flex';
            }
        } else if (!scoreFile) { // 如果既没有 tex 也没有文件，显示提示
            atOverlayContent.setText('No AlphaTex content or score file provided in the code block.');
            atOverlay.style.display = 'flex';
        }
        // 如果是 scoreFile 并且是 URL (非附件)，则 settings.file = scoreFile; 然后 api 会自动加载

        // --- 7. 实现 ControlBar ---
        this.renderControlBar(atControls, api, controlBarFeatures);


        // --- 8. (可选) 主题和样式 ---
        // 监听 Obsidian 主题变化并应用样式
        // this.applyObsidianThemeStyles(api, atWrap); // 你需要实现这个
    }

    // --- 辅助方法 ---

    renderControlBar(container: HTMLElement, api: alphaTab.AlphaTabApi, features: string[]) {
        container.empty(); // 清空旧控件

        if (features.includes('play')) {
            new Setting(container)
                .addButton(btn => btn.setIcon('play').setTooltip('Play/Pause').onClick(() => api.playPause()));
        }
        if (features.includes('stop')) {
             new Setting(container)
                .addButton(btn => btn.setIcon('stop-circle').setTooltip('Stop').onClick(() => api.stop()));
        }
        if (features.includes('tempo')) {
            // Tempo control: label, slider/input
            const tempoDiv = container.createDiv();
            tempoDiv.createSpan({ text: 'Tempo: ' });
            const tempoValue = tempoDiv.createSpan({ text: api.tempo.toString() });
            const tempoSlider = new Setting(tempoDiv).addSlider(slider => slider
                .setLimits(30, 300, 1)
                .setValue(api.tempo)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    api.tempo = value;
                    tempoValue.setText(value.toString());
                })
            );
            api.tempoChanged.on(t => {
                tempoValue.setText(t.toString());
                // tempoSlider.components[0].setValue(t); //  需要找到正确的方式更新 slider
            });
        }
        // ... 实现其他控件 (loop, print, zoom, tracks toggle etc.)
        // 例如 Zoom:
        if (features.includes('zoom')) {
            new Setting(container)
                .addButton(btn => btn.setIcon('zoom-in').setTooltip('Zoom In').onClick(() => {
                    api.settings.display.scaleRests = Math.min(3, api.settings.display.scaleRests + 0.1); // 示例，实际 zoom 可能不同
                    api.updateSettings();
                    api.render();
                }));
            new Setting(container)
                .addButton(btn => btn.setIcon('zoom-out').setTooltip('Zoom Out').onClick(() => {
                    api.settings.display.scaleRests = Math.max(0.5, api.settings.display.scaleRests - 0.1);
                    api.updateSettings();
                    api.render();
                }));
        }
    }

    renderTrackSidebar(container: HTMLElement, tracks: alphaTab.model.Track[], api: alphaTab.AlphaTabApi) {
        container.empty();
        const ul = container.createEl('ul');
        tracks.forEach(track => {
            const li = ul.createEl('li');
            li.setText(track.name || `Track ${track.index + 1}`);
            li.addClass('at-track-item-obsidian');
            // if (api.tracks.some(t => t.index === track.index)) { //  检查是否当前渲染
            //     li.addClass('active');
            // }
            li.onClick(() => {
                api.renderTracks([track]); // 只渲染选中的音轨
                // 更新 sidebar 中 active 状态
                ul.querySelectorAll('.at-track-item-obsidian.active').forEach(el => el.removeClass('active'));
                li.addClass('active');
            });
        });
    }

    scrollToBottom(viewport: HTMLElement, api: alphaTab.AlphaTabApi) {
        // 移植 Vue 组件中的 scrollToBottom 逻辑
        // 注意：DOM 查询和 nextTick 等需要调整
        // 简单的版本：
        setTimeout(() => { // 确保渲染完成
            viewport.scrollTop = viewport.scrollHeight;
        }, 100); // 延迟可能需要调整
    }

    // (可选) applyObsidianThemeStyles
    // applyObsidianThemeStyles(api: alphaTab.AlphaTabApi, wrapper: HTMLElement) {
    //     if (document.body.classList.contains('theme-dark')) {
    //         // applyDarkThemeViaApi(api); // 从你的 utils 移植
    //         wrapper.addClass('at-dark-theme');
    //     } else {
    //         // resetToDefaultTheme(api); // 从你的 utils 移植
    //         wrapper.removeClass('at-dark-theme');
    //     }
    //     api.render();
    // }
}

// (可选) 设置页
class AlphaTabSettingTab extends PluginSettingTab {
    plugin: AlphaTabPlugin;

    constructor(app: App, plugin: AlphaTabPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'AlphaTab Settings' });

        new Setting(containerEl)
            .setName('Default Show Track Sidebar')
            .setDesc('Whether to show the track sidebar by default for new alphatab blocks.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.defaultShowTrackSidebar)
                .onChange(async (value) => {
                    this.plugin.settings.defaultShowTrackSidebar = value;
                    await this.plugin.saveSettings();
                }));

        // 可以添加更多设置，例如默认显示的 ControlBar features
    }
}
