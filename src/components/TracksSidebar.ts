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
    private selectAllButton!: HTMLButtonElement; // 新增：保存按钮引用
    
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
        
        // 移除footer和应用按钮，改为实时生效
        
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
        
        // 添加全选/取消全选切换按钮
        const selectAllContainer = this.contentEl.createDiv({ cls: "at-select-all-container" });
        this.selectAllButton = selectAllContainer.createEl("button", { 
            cls: "at-select-toggle-btn"
        });
        this.updateSelectAllButton(); // 设置初始状态
        this.selectAllButton.addEventListener("click", () => this.toggleSelectAll());
        
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
                            // 立即触发变更回调
                            this.triggerChange();
                            // 更新全选按钮状态
                            this.updateSelectAllButton();
                        });
                });
        });
    }
    
    // 新增：更新全选按钮的文本和状态
    private updateSelectAllButton() {
        if (!this.selectAllButton) return;
        
        const allSelected = this.tracks.length > 0 && this.renderTracks.size === this.tracks.length;
        const isDefaultSelection = this.renderTracks.size === 1 && 
                                  this.tracks.length > 0 && 
                                  this.renderTracks.has(this.tracks[0]);
        
        if (allSelected) {
            this.selectAllButton.textContent = "重置为默认";
            this.selectAllButton.removeClass("partial");
        } else if (isDefaultSelection) {
            this.selectAllButton.textContent = "全选";
            this.selectAllButton.removeClass("partial");
        } else {
            this.selectAllButton.textContent = "全选";
            this.selectAllButton.addClass("partial");
        }
    }
    
    // 修改：切换全选状态，取消全选时回退到默认第一个轨道
    private toggleSelectAll() {
        const allSelected = this.tracks.length > 0 && this.renderTracks.size === this.tracks.length;
        
        if (allSelected) {
            // 当前全选，则回退到默认第一个轨道
            this.renderTracks.clear();
            if (this.tracks.length > 0) {
                this.renderTracks.add(this.tracks[0]);
            }
        } else {
            // 当前未全选，则全选
            this.renderTracks = new Set(this.tracks);
        }
        
        this.render();
        // 立即触发变更
        this.triggerChange();
    }
    
    // 新增：立即触发变更的方法
    private triggerChange() {
        const selectedTracks = Array.from(this.renderTracks).sort(
            (a, b) => a.index - b.index
        );
        this.onChange?.(selectedTracks);
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
        // 确保至少有一个轨道被选中，如果传入空数组则选择第一个
        if (tracks.length === 0 && this.tracks.length > 0) {
            this.renderTracks = new Set([this.tracks[0]]);
        } else {
            this.renderTracks = new Set(tracks);
        }
        this.render();
    }
}
