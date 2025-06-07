import * as path from "path";
import * as fs from "fs";
import { App } from "obsidian";

export class AlphaTabSettingsHelper {
	static getAbsolutePath(app: App, pluginDir: string, relativePath: string): string {
		const vaultBasePath = (app.vault.adapter as any).getBasePath
			? (app.vault.adapter as any).getBasePath()
			: "";
		return path.join(vaultBasePath, pluginDir, relativePath);
	}

	static loadFontData(app: App, pluginDir: string): Record<string, string> {
		const fontAssetsRelativePath = "assets/alphatab/font";
		const fontFiles = [
			{ name: "Bravura.woff2", ext: "woff2", mime: "font/woff2" },
			{ name: "Bravura.woff", ext: "woff", mime: "font/woff" },
		];
		const fontData: Record<string, string> = {};
		for (const fontInfo of fontFiles) {
			const absPath = this.getAbsolutePath(app, pluginDir, path.join(fontAssetsRelativePath, fontInfo.name));
			if (fs.existsSync(absPath)) {
				const buffer = fs.readFileSync(absPath);
				fontData[fontInfo.ext] = `data:${fontInfo.mime};base64,${buffer.toString("base64")}`;
			}
		}
		return fontData;
	}
}
