// main.ts
import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { TabView, VIEW_TYPE_TAB } from "./TabView";
// import { ResourceServer } from "./ResourceServer";
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
	// private resourceServer: ResourceServer | null = null;
	actualPluginDir: string | null = null; // 新增属性

	async onload() {
		await this.loadSettings();

		// 获取 Obsidian 库根目录
		const vaultRoot = (this.app.vault.adapter as any).basePath as string;
		// 拼接插件目录绝对路径
		const pluginDir = path.join(vaultRoot, this.manifest.dir);

		// 检查 manifest.json 是否存在且 id 匹配
		let actualPluginDir: string | null = null;
		const manifestPath = path.join(pluginDir, "manifest.json");
		if (fs.existsSync(manifestPath)) {
			try {
				const manifestContent = JSON.parse(
					fs.readFileSync(manifestPath, "utf8")
				);
				if (manifestContent.id === this.manifest.id) {
					actualPluginDir = pluginDir;
				}
			} catch {
				// ignore
			}
		}

		if (!actualPluginDir) {
			console.error(
				`[AlphaTab Debug] Could not find valid plugin directory from vault: ${pluginDir}`
			);
			throw new Error(
				"AlphaTab 插件根目录查找失败，请检查插件安装路径。"
			);
		}

		this.actualPluginDir = actualPluginDir;
		console.log(
			`[AlphaTab Debug] Using plugin directory: ${actualPluginDir}`
		);

		// 启动资源服务器
		/*
    try {
      this.resourceServer = new ResourceServer(actualPluginDir);
      const serverUrl = await this.resourceServer.start();
      console.log(`[AlphaTab Debug] Resource server available at: ${serverUrl}`);
    } catch (error) {
      console.error("[AlphaTab Debug] Failed to start resource server:", error);
      // 不要因为资源服务器失败就停止插件加载
      // new Notice("Failed to start AlphaTab resource server", 5000);
    }
    */

		// 加载自定义样式
		this.registerStyles();

		// 注册吉他谱文件扩展名的查看器
		this.registerView(VIEW_TYPE_TAB, (leaf) => {
			const view = new TabView(leaf, this);
			// TabView 内部会通过 this.pluginInstance.actualPluginDir 访问
			return view;
		});

		// 注册文件扩展名处理
		this.registerExtensions(
			["gp", "gp3", "gp4", "gp5", "gpx", "gp7"],
			VIEW_TYPE_TAB
		);

		// 添加右键菜单项用于打开吉他谱文件
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (
					file instanceof TFile &&
					this.isGuitarProFile(file.extension)
				) {
					menu.addItem((item) => {
						item.setTitle("Open as Guitar Tab (AlphaTab)")
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
		// 直接读取插件目录下的 styles.css 并内联注入，避免 CSP 问题
		try {
			if (!this.actualPluginDir) return;
			const cssPath = path.join(this.actualPluginDir, "styles.css");
			if (fs.existsSync(cssPath)) {
				const css = fs.readFileSync(cssPath, "utf8");
				const styleEl = document.createElement("style");
				styleEl.id = "alphatab-plugin-styles";
				styleEl.innerHTML = css;
				document.head.appendChild(styleEl);

				// 确保在卸载时移除
				this.register(() => {
					const existingStyleEl = document.getElementById(
						"alphatab-plugin-styles"
					);
					if (existingStyleEl) {
						existingStyleEl.remove();
					}
				});
			} else {
				console.warn(
					"[AlphaTab Debug] styles.css not found in plugin directory."
				);
			}
		} catch (e) {
			console.error("[AlphaTab Debug] Failed to inject styles.css:", e);
		}
	}

	isGuitarProFile(extension: string | undefined): boolean {
		if (!extension) return false;
		return ["gp", "gp3", "gp4", "gp5", "gpx", "gp7"].includes(
			extension.toLowerCase()
		);
	}

	onunload() {
		// 停止资源服务器
		/*
    if (this.resourceServer) {
      this.resourceServer.stop().catch((err) => {
        console.error("[AlphaTab Debug] Error stopping resource server:", err);
      });
      this.resourceServer = null;
    }
    */

		// 清理工作
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAB);
		console.log("AlphaTab Plugin Unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/*
  getResourceServer(): ResourceServer | null {
    return this.resourceServer;
  }
  */
}
