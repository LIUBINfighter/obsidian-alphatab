// main.ts
import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { TabView, VIEW_TYPE_TAB } from "./TabView";
import { ResourceServer } from "./ResourceServer";

interface AlphaTabPluginSettings {
  // 插件设置，可以根据需要扩展
  mySetting: string;
}

const DEFAULT_SETTINGS: AlphaTabPluginSettings = {
  mySetting: "default"
};

export default class AlphaTabPlugin extends Plugin {
  settings: AlphaTabPluginSettings;
  private resourceServer: ResourceServer | null = null;

  async onload() {
    await this.loadSettings();

    // 启动资源服务器
    try {
      this.resourceServer = new ResourceServer(this.manifest.dir);
      const serverUrl = await this.resourceServer.start();
      console.log(`[AlphaTab Debug] Resource server available at: ${serverUrl}`);
    } catch (error) {
      console.error('[AlphaTab Debug] Failed to start resource server:', error);
      new Notice('Failed to start AlphaTab resource server', 5000);
    }

    // 加载自定义样式
    this.registerStyles();

    // 注册吉他谱文件扩展名的查看器
    this.registerView(
      VIEW_TYPE_TAB,
      (leaf) => new TabView(leaf, this)
    );

    // 注册文件扩展名处理
    this.registerExtensions(["gp", "gp3", "gp4", "gp5", "gpx", "gp7"], VIEW_TYPE_TAB);

    // 添加右键菜单项用于打开吉他谱文件
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && this.isGuitarProFile(file.extension)) {
          menu.addItem((item) => {
            item
              .setTitle("Open as Guitar Tab (AlphaTab)")
              .setIcon("music")
              .onClick(async () => {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.setViewState({
                  type: VIEW_TYPE_TAB,
                  state: { file: file.path },
                });
                this.app.workspace.revealLeaf(leaf); // 确保新叶子处于活动状态
              });
          });
        }
      })
    );

    console.log("AlphaTab Plugin Loaded");
  }

  registerStyles() {
    // 添加CSS的简单方式
    const css = `@import url('app://local/${this.manifest.dir}/styles.css?v=${this.manifest.version}');`;
    const styleEl = document.createElement('style');
    styleEl.id = 'alphatab-plugin-styles'; // 添加ID以便于移除/更新
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);

    // 确保在卸载时移除
    this.register(() => {
      const existingStyleEl = document.getElementById('alphatab-plugin-styles');
      if (existingStyleEl) {
        existingStyleEl.remove();
      }
    });
  }

  isGuitarProFile(extension: string | undefined): boolean {
    if (!extension) return false;
    return ["gp", "gp3", "gp4", "gp5", "gpx", "gp7"].includes(extension.toLowerCase());
  }

  onunload() {
    // 停止资源服务器
    if (this.resourceServer) {
      this.resourceServer.stop().catch(err => {
        console.error('[AlphaTab Debug] Error stopping resource server:', err);
      });
      this.resourceServer = null;
    }

    // 清理工作
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAB);
    console.log("AlphaTab Plugin Unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getResourceServer(): ResourceServer | null {
    return this.resourceServer;
  }
}
