// main.ts
import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { TabView, VIEW_TYPE_TAB } from "./TabView";
import { ResourceServer } from "./ResourceServer";
import * as path from "path";
import * as fs from "fs";

interface AlphaTabPluginSettings {
  // 插件设置，可以根据需要扩展
  mySetting: string;
}

const DEFAULT_SETTINGS: AlphaTabPluginSettings = {
  mySetting: "default",
};

export default class AlphaTabPlugin extends Plugin {
  settings: AlphaTabPluginSettings;
  private resourceServer: ResourceServer | null = null;

  async onload() {
    await this.loadSettings();

    // 调试：打印当前目录信息
    console.log(`[AlphaTab Debug] Current working directory: ${process.cwd()}`);
    console.log(`[AlphaTab Debug] Plugin manifest.dir: ${this.manifest.dir}`);
    console.log(`[AlphaTab Debug] Plugin manifest.id: ${this.manifest.id}`);

    // 修复：使用正确的插件目录路径
    // 硬编码开发路径，因为 manifest.dir 可能是相对路径
    const possiblePluginDirs = [
      // 尝试使用绝对路径解析
      path.resolve(this.manifest.dir),
      // 硬编码的实际开发路径
      "d:\\Jay.Lab\\300 Lab\\Plugin Lab\\.obsidian\\plugins\\obsidian-alphatab",
      // 当前工作目录基础上的相对路径
      path.resolve(process.cwd(), this.manifest.dir),
    ];

    let actualPluginDir = null;

    for (const dir of possiblePluginDirs) {
      console.log(`[AlphaTab Debug] Testing plugin directory: ${dir}`);
      if (fs.existsSync(dir)) {
        // 验证这是正确的插件目录（检查是否有 assets 目录）
        const assetsDir = path.join(dir, "assets");
        if (fs.existsSync(assetsDir)) {
          actualPluginDir = dir;
          console.log(`[AlphaTab Debug] Found valid plugin directory: ${dir}`);
          const contents = fs.readdirSync(dir);
          console.log(`[AlphaTab Debug] Plugin directory contents:`, contents);
          break;
        } else {
          console.log(`[AlphaTab Debug] Directory exists but no assets folder: ${dir}`);
        }
      } else {
        console.log(`[AlphaTab Debug] Directory does not exist: ${dir}`);
      }
    }

    if (!actualPluginDir) {
      console.error(`[AlphaTab Debug] Could not find valid plugin directory`);
      actualPluginDir = path.resolve(this.manifest.dir); // 回退到默认路径
    }

    console.log(`[AlphaTab Debug] Using plugin directory: ${actualPluginDir}`);

    // 启动资源服务器
    try {
      this.resourceServer = new ResourceServer(actualPluginDir);
      const serverUrl = await this.resourceServer.start();
      console.log(`[AlphaTab Debug] Resource server available at: ${serverUrl}`);
    } catch (error) {
      console.error("[AlphaTab Debug] Failed to start resource server:", error);
      // 不要因为资源服务器失败就停止插件加载
      // new Notice("Failed to start AlphaTab resource server", 5000);
    }

    // 加载自定义样式
    this.registerStyles();

    // 注册吉他谱文件扩展名的查看器
    this.registerView(VIEW_TYPE_TAB, (leaf) => new TabView(leaf, this));

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
    const styleEl = document.createElement("style");
    styleEl.id = "alphatab-plugin-styles"; // 添加ID以便于移除/更新
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);

    // 确保在卸载时移除
    this.register(() => {
      const existingStyleEl = document.getElementById("alphatab-plugin-styles");
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
      this.resourceServer.stop().catch((err) => {
        console.error("[AlphaTab Debug] Error stopping resource server:", err);
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
