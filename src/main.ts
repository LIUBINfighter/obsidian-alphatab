// main.ts
import { Plugin, TFile } from "obsidian";
import { TabView, VIEW_TYPE_TAB } from "./views/TabView";
import * as path from "path";
import * as fs from "fs";
import { registerStyles, isGuitarProFile } from "./utils/utils";

interface AlphaTabPluginSettings {
	// 插件设置，可以根据需要扩展
	mySetting: string;
}

const DEFAULT_SETTINGS: AlphaTabPluginSettings = {
	mySetting: "default",
};

export default class AlphaTabPlugin extends Plugin {
	settings: AlphaTabPluginSettings;
	actualPluginDir: string | null = null; // 新增属性

	async onload() {
		await this.loadSettings();

		const vaultRoot = (this.app.vault.adapter as any).basePath as string;
		// 确保 manifest.dir 有值
		const pluginDir = path.join(vaultRoot, this.manifest.dir || '');

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
				`[AlphaTab] Could not find valid plugin directory from vault: ${pluginDir}`
			);
			throw new Error(
				"AlphaTab 插件根目录查找失败，请检查插件安装路径。"
			);
		}

		this.actualPluginDir = actualPluginDir;
		// console.log(`[AlphaTab Debug] Using plugin directory: ${actualPluginDir}`);

		// 加载自定义样式
		registerStyles(this);

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
				// 新建 AlphaTab 文件菜单项
				menu.addItem((item) => {
					item.setTitle("新建 AlphaTab 文件")
						.setIcon("plus")
						.onClick(async () => {
							const parent = file instanceof TFile ? this.app.vault.getAbstractFileByPath(path.dirname(file.path)) : file;
							const baseName = "新建吉他谱";
							let filename = `${baseName}.alphatab`;
							let i = 1;
							while (await this.app.vault.adapter.exists(path.join((parent as any).path, filename))) {
								filename = `${baseName} ${i}.alphatab`;
								i++;
							}
							const newFilePath = path.join((parent as any).path, filename);
							await this.app.vault.create(newFilePath, "");
							const newFile = this.app.vault.getAbstractFileByPath(newFilePath);
							if (newFile instanceof TFile) {
								const leaf = this.app.workspace.getLeaf(false);
								await leaf.openFile(newFile);
							}
						});
				});
				if (
					file instanceof TFile &&
					isGuitarProFile(file.extension)
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

		// console.log("AlphaTab Plugin Loaded");
	}

	onunload() {
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
}
