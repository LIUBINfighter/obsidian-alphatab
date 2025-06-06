// TracksSidebar.ts
// 负责在TabView内显示音轨选择侧边栏

import { Setting, setIcon } from "obsidian";
import * as alphaTab from "@coderline/alphatab";

export class TracksSidebar {
    private container: HTMLElement;
    private tracks: alphaTab.model.Track[] = [];
    private renderTracks: Set<alphaTab.model.Track> = new Set();
    private onChange?: (tracks?: alphaTab.model.Track[]) => void;
    private sidebarEl: HTMLElement;
    private contentEl: HTMLElement;
    
    constructor(container: HTMLElement, onChange?: (tracks?: alphaTab.model.Track[]) => void) {
        this.container = container;
        this.onChange = onChange;
        this.createSidebar();
    }
    
    private createSidebar() {
        // 创建侧边栏基础结构
        this.sidebarEl = this.container.createDiv({ cls: "at-tracks-sidebar" });
        
        // 添加标题栏
        const headerEl = this.sidebarEl.createDiv({ cls: "at-sidebar-header" });
        headerEl.createEl("h3", { text: "轨道选择" });
        
        // 添加关闭按钮
        const closeButton = headerEl.createDiv({ cls: "at-sidebar-close" });
        setIcon(closeButton, "x");
        closeButton.addEventListener("click", () => this.hide());
        
        // 创建内容区域
        this.contentEl = this.sidebarEl.createDiv({ cls: "at-sidebar-content" });
        
        // 添加应用按钮
        const footerEl = this.sidebarEl.createDiv({ cls: "at-sidebar-footer" });
        const applyButton = footerEl.createEl("button", { 
            text: "应用选择",
            cls: "mod-cta"
        });
        applyButton.addEventListener("click", () => this.applySelection());
        
        // 默认隐藏侧边栏
        this.hide();
    }
    
    public render() {
        // 清空内容区域
        this.contentEl.empty();
        
        if (this.tracks.length === 0) {
            this.contentEl.createEl("p", { text: "没有可用的音轨" });
            return;
        }
        
        // 添加全选/取消全选按钮
        const selectAllContainer = this.contentEl.createDiv({ cls: "at-select-all-container" });
        const selectAllButton = selectAllContainer.createEl("button", { text: "全选" });
        selectAllButton.addEventListener("click", () => this.selectAll(true));
        
        const deselectAllButton = selectAllContainer.createDiv({ text: "取消全选" });
        deselectAllButton.addEventListener("click", () => this.selectAll(false));
        
        // 为每个音轨创建设置项
        this.tracks.forEach((track) => {
            new Setting(this.contentEl)
                .setName(track.name)
                .setDesc(track.shortName || `音轨 ${track.index + 1}`)
                .addToggle((toggle) => {
                    toggle
                        .setValue(this.renderTracks.has(track))
                        .onChange((value) => {
                            if (value) {
                                this.renderTracks.add(track);
                            } else {
                                this.renderTracks.delete(track);
                            }
                        });
                });
        });
    }
    
    public show() {
        this.sidebarEl.style.display = "flex";
        this.render(); // 显示时重新渲染以确保内容最新
        this.container.addClass("at-sidebar-active");
    }
    
    public hide() {
        this.sidebarEl.style.display = "none";
        this.container.removeClass("at-sidebar-active");
    }
    
    public toggle() {
        if (this.sidebarEl.style.display === "none") {
            this.show();
        } else {
            this.hide();
        }
    }
    
    public setTracks(tracks: alphaTab.model.Track[]) {
        this.tracks = tracks;
        if (this.renderTracks.size === 0 && tracks.length > 0) {
            this.renderTracks = new Set([tracks[0]]);
        }
        this.render();
    }
    
    public setRenderTracks(tracks: alphaTab.model.Track[]) {
        this.renderTracks = new Set(tracks);
        this.render();
    }
    
    private selectAll(selected: boolean) {
        if (selected) {
            this.renderTracks = new Set(this.tracks);
        } else {
            this.renderTracks.clear();
        }
        this.render();
    }
    
    private applySelection() {
        const selectedTracks = Array.from(this.renderTracks).sort(
            (a, b) => a.index - b.index
        );
        this.onChange?.(selectedTracks);
    }
}
