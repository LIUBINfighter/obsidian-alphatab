import { Plugin, TFile } from "obsidian";
import { GTPView, VIEW_TYPE_GTP } from "./TabView";

interface AlphaTabPluginSettings {
  // 插件设置，可以根据需要扩展
  mySetting: string;
}

const DEFAULT_SETTINGS: AlphaTabPluginSettings = {
  mySetting: "default"
};

export default class AlphaTabPlugin extends Plugin {
  settings: AlphaTabPluginSettings;

  async onload() {
    await this.loadSettings();

    // 注册吉他谱文件扩展名的查看器
    this.registerView(
      VIEW_TYPE_GTP,
      (leaf) => new GTPView(leaf)
    );

    // 注册文件扩展名处理
    this.registerExtensions(["gp", "gp3", "gp4", "gp5", "gpx", "gp7"], VIEW_TYPE_GTP);

    // 添加右键菜单项用于打开吉他谱文件
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && this.isGuitarProFile(file.extension)) {
          menu.addItem((item) => {
            item
              .setTitle("Open as Guitar Tab")
              .setIcon("music")
              .onClick(async () => {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.setViewState({
                  type: VIEW_TYPE_GTP,
                  state: { file: file.path },
                });
              });
          });
        }
      })
    );

    // 可以在这里添加其他设置，如命令、设置选项卡等
  }

  isGuitarProFile(extension: string | undefined): boolean {
    if (!extension) return false;
    return ["gp", "gp3", "gp4", "gp5", "gpx", "gp7"].includes(extension.toLowerCase());
  }

  onunload() {
    // 清理工作
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GTP);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
