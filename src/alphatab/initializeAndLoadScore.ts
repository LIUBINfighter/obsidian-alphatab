/*
这一段是在obsidian中使用AlphaTabApi的核心。
"环境 hack" 主要是对 process、module、alphaTab.Environment.webPlatform 做兼容性处理
确保 AlphaTab 能在 Obsidian 的 Electron/Web 环境下正常运行。

AlphaTabApi 的初始化即 manager.api = new alphaTab.AlphaTabApi(...)，紧跟在 hack 代码之后。
*/
import * as alphaTab from "@coderline/alphatab";
import * as fs from "fs";
import * as path from "path";
import { TFile } from "obsidian";
import { ITabManager } from "../ITabManager";

export async function initializeAndLoadScore(manager: ITabManager, file: TFile) {
	const mainElement = manager.getMainElement();
	const eventHandlers = manager.getEventHandlers();
	const pluginInstance = manager.getPluginInstance();
	const app = manager.getApp();

	// Ensure mainElement has dimensions - MUST FIX THIS IN TABVIEW.TS
	if (
		mainElement?.clientWidth === 0 ||
		mainElement?.clientHeight === 0
	) {
		console.error(
			"[AlphaTab] CRITICAL: mainElement has zero width or height."
		);
		mainElement.style.minWidth = mainElement.style.minWidth || "300px";
		mainElement.style.minHeight = mainElement.style.minHeight || "150px";
		eventHandlers.onError?.({
			message:
				"AlphaTab容器尺寸为0。已尝试设置最小尺寸，但请在插件视图中修复。",
		});
	}

	if (manager.api) {
		try {
			manager.api.destroy();
		} catch (e) {
			console.error(
				"[ITabManager] Error destroying previous API:",
				e
			);
		}
		manager.api = null;
	}
	manager.score = null;
	manager.setRenderTracks([]);
	manager.setRenderWidth(Math.max(mainElement?.clientWidth || 300, 300));

	const settings = new alphaTab.Settings();
	settings.core.engine = "svg";
	settings.core.enableLazyLoading = true;
	settings.core.logLevel = alphaTab.LogLevel.Debug;
	manager.setSettings(settings);

	// === Worker 支持 begin ===
	settings.core.useWorkers = true; // 启用 Worker

	const pluginManifestDir = pluginInstance.manifest.dir;
	if (!pluginManifestDir) {
		return;
	}
	const workerScriptFileSuffix = "/assets/alphatab/alphaTab.worker.mjs";
	const workerScriptAssetObsidianPath = pluginManifestDir + workerScriptFileSuffix;
	if (await app.vault.adapter.exists(workerScriptAssetObsidianPath)) {
		// @ts-ignore
		settings.core.workerFile = app.vault.adapter.getResourcePath(workerScriptAssetObsidianPath);
	} else {
		// @ts-ignore
		settings.core.workerFile = null;
		settings.core.useWorkers = false;
		console.error("[AlphaTab] Worker script not found. Worker disabled.");
		eventHandlers.onError?.({ message: "AlphaTab Worker脚本文件丢失，性能可能会受影响。" });
	}
	// === Worker 支持 end ===

	// === Player/SoundFont 支持 begin ===
	settings.player.enablePlayer = true; // 启用 Player

	const soundFontFileSuffix = "/assets/alphatab/soundfont/sonivox.sf2";
	const soundFontAssetObsidianPath = pluginManifestDir + soundFontFileSuffix;
	if (await app.vault.adapter.exists(soundFontAssetObsidianPath)) {
		settings.player.soundFont = app.vault.adapter.getResourcePath(soundFontAssetObsidianPath);
		console.debug(`[ITabManager] Settings: player.soundFont = ${settings.player.soundFont}`);
	} else {
		settings.player.soundFont = null;
		settings.player.enablePlayer = false; // 找不到则禁用
		console.error(`[ITabManager] SoundFont file NOT FOUND at '${soundFontAssetObsidianPath}'. Player disabled.`);
		eventHandlers.onError?.({ message: "音色库文件丢失，播放功能已禁用。" });
	}
	// === Player/SoundFont 支持 end ===

	console.debug(
		"[ITabManager] Manual @font-face + Data URL Mode: Workers/Player disabled."
	);

	if (!pluginManifestDir) {
		return;
	}
	console.debug(
		`[ITabManager] Plugin manifest dir: ${pluginManifestDir}`
	);

	// --- Main AlphaTab Script File URL (core.scriptFile) ---
	const mainScriptFileSuffix = "/assets/alphatab/alphatab.js";
	const mainScriptAssetObsidianPath =
		pluginManifestDir + mainScriptFileSuffix;
	if (await app.vault.adapter.exists(mainScriptAssetObsidianPath)) {
		settings.core.scriptFile =
			app.vault.adapter.getResourcePath(
				mainScriptAssetObsidianPath
			);
		console.debug(
			`[ITabManager] Settings: core.scriptFile = ${settings.core.scriptFile}`
		);
	} else {
		settings.core.scriptFile = null;
		console.error(
			`[ITabManager] Main AlphaTab script (alphatab.js) NOT FOUND at '${mainScriptAssetObsidianPath}'.`
		);
	}

	// --- Attempt to satisfy fontDirectory check with a dummy value derived from scriptFile ---
	if (settings.core.scriptFile) {
		const baseScriptPath = settings.core.scriptFile.substring(
			0,
			settings.core.scriptFile.lastIndexOf("/") + 1
		);
		settings.core.fontDirectory = baseScriptPath + "font/"; // e.g., app://.../assets/alphatab/font/
	} else {
		settings.core.fontDirectory = "/alphatab-virtual-fonts/"; // A plausible relative path
	}
	console.debug(
		`[ITabManager] Settings: core.fontDirectory (for satisfying internal checks) = ${settings.core.fontDirectory}`
	);

	// --- Load Fonts as Data URLs AND INJECT @font-face ---
	const smuflFontData: Record<string, string | Record<string, unknown>> =
		{};
	let actualSmuflFontFilesLoaded = false;
	const fontDataUrlsForCss: Record<string, string> = {}; // For injectFontFaces

	try {
		const fontAssetsRelativePath = "assets/alphatab/font";
		const fontFilesToLoad = [
			{ name: "Bravura.woff2", ext: "woff2", mime: "font/woff2" },
			{ name: "Bravura.woff", ext: "woff", mime: "font/woff" },
		];

		for (const fontInfo of fontFilesToLoad) {
			const absoluteFontPath = manager.getAbsolutePath(
				path.join(fontAssetsRelativePath, fontInfo.name)
			);
			if (fs.existsSync(absoluteFontPath)) {
				const fontBuffer = fs.readFileSync(absoluteFontPath);
				const fontBase64 = fontBuffer.toString("base64");
				const dataUrl = `data:${fontInfo.mime};base64,${fontBase64}`;
				smuflFontData[fontInfo.ext] = dataUrl; // For AlphaTab settings
				fontDataUrlsForCss[fontInfo.ext] = dataUrl; // For manual CSS injection
				actualSmuflFontFilesLoaded = true;
				console.debug(
					`[ITabManager] Encoded ${fontInfo.name} as Data URL.`
				);
			}
		}

		const metadataFile = "bravura_metadata.json";
		const absoluteMetadataPath = manager.getAbsolutePath(
			path.join(fontAssetsRelativePath, metadataFile)
		);
		if (fs.existsSync(absoluteMetadataPath)) {
			const metadataStr = fs.readFileSync(
				absoluteMetadataPath,
				"utf8"
			);
			try {
				smuflFontData["json"] = JSON.parse(metadataStr);
				console.debug(
					`[ITabManager] Parsed ${metadataFile} and added to smuflFontData.json.`
				);
			} catch (jsonError) {
				/* ... error handling ... */
			}
		}

		if (actualSmuflFontFilesLoaded) {
			// @ts-ignore
			settings.core.smuflFontSources = smuflFontData; // Provide to AlphaTab
			console.debug(
				"[ITabManager] Settings: core.smuflFontSources populated. Keys:",
				Object.keys(smuflFontData)
			);

			// MANUALLY INJECT @font-face rules
			if (!manager.injectFontFaces(fontDataUrlsForCss)) {
				console.error(
					"[ITabManager] Failed to manually inject @font-face styles. Font rendering will likely fail."
				);
			}
		} else {
			return;
		}
	} catch (e: any) {
		return;
	}

	// Display settings
	settings.display.scale = 0.8;
	settings.display.layoutMode = alphaTab.LayoutMode.Page;
	
	// Player and cursor settings - 启用光标跟随功能
	settings.player.enablePlayer = true; // 确保播放器启用
	settings.player.enableCursor = true; // 启用播放光标
	settings.player.enableAnimatedBeatCursor = true; // 启用动画节拍光标
	
	// 重要：找到正确的滚动容器
	// 应该是包含滚动条的视口元素，而不是主渲染元素
	const viewportElement = manager.getEventHandlers().viewportElement;
	if (viewportElement) {
		settings.player.scrollElement = viewportElement; // 设置滚动元素为视口容器
		console.debug("[ITabManager] 滚动元素设置为viewport:", viewportElement);
	} else {
		settings.player.scrollElement = mainElement; // 回退到主元素
		console.debug("[ITabManager] 滚动元素回退到main:", mainElement);
	}
	
	settings.player.scrollMode = alphaTab.ScrollMode.OffScreen; // 改为仅在光标离开屏幕时滚动
	settings.player.scrollOffsetY = -25; // 负值在顶部预留空间，参考Vue版本
	settings.player.scrollSpeed = 800; // 增加滚动时间，使动画更平滑
	settings.player.nativeBrowserSmoothScroll = true; // 使用浏览器原生平滑滚动
	
	console.debug(
		"[ITabManager] Settings: Using default SMuFL font configuration with cursor following enabled"
	);

	const initialThemeColors = manager.getDarkMode(); /* ... theme colors ... */
	Object.assign(settings.display.resources, initialThemeColors);
	console.debug(
		"[ITabManager] Final AlphaTab Settings:",
		JSON.parse(JSON.stringify(settings))
	);

	// 环境 hack 代码段
	try {
		let originalProcess: any, originalModule: any;
		if (typeof process !== "undefined") {
			originalProcess = (globalThis as any).process;
			(globalThis as any).process = undefined;
		}
		if (typeof module !== "undefined") {
			originalModule = (globalThis as any).module;
			(globalThis as any).module = undefined;
		}
		// @ts-ignore
		if (alphaTab.Environment && typeof alphaTab.WebPlatform !== "undefined") {
			// @ts-ignore
			alphaTab.Environment.webPlatform = alphaTab.WebPlatform.Browser;
			console.debug(
				"[ITabManager] Environment.webPlatform overridden."
			);
		}

		console.debug("[ITabManager] Initializing AlphaTabApi...");

		// 初始化 AlphaTabApi
		manager.api = new alphaTab.AlphaTabApi(
			mainElement,
			settings
		);
		console.debug(
			"[ITabManager] AlphaTabApi instantiated. API object:",
			manager.api
		);

		if (manager.api) {
			const eventNames = [
				"error",
				"renderStarted",
				"renderFinished",
				"scoreLoaded",
				"playerStateChanged",
				"fontLoaded",
				"soundFontLoaded",
				"playerReady",
				"ready",
			];
			console.debug("[ITabManager] Checking API event emitters:");
			eventNames.forEach((eventName) => {
				/* ... event emitter check ... */
			});
		}

		// 通过 ITabManager 的私有方法绑定事件
		(manager as any).bindEvents();
	} catch (e: any) {
		/* ... error handling ... */
	} finally {
		/* ... cleanup ... */
	}

	if (!manager.api) {
		return;
	}

	try {
		const scoreData = await app.vault.readBinary(file);
		await manager.api.load(new Uint8Array(scoreData));
	} catch (e: any) {
		/* ... error handling ... */
	}
}
