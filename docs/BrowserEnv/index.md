AlphaTabApi 作为核心api，是完整的播放器组件的基础

[alphatab-api](https://www.alphatab.net/docs/reference/api)

但是问题是会出现初始化报错（显示这是nodejs环境）


---

以下是详细信息：

原插件使用低级 API（兼容 nodejs 环境），只能用来进行简单的渲染

为了使用高级 API 获得完整的播放器体验，我们使用

```ts TabView.ts
try {
	this.api = new alphaTab.AlphaTabApi(this.atMainRef, this.alphaTabSettings);
} catch (e) {
	console.error("Failed to initialize AlphaTab API:", e);
	this.showErrorInOverlay(`Failed to initialize AlphaTab: ${e.message}`);
	return;
}
```

在这里报错，内容如下：

```console
[AlphaTab Debug] About to instantiate AlphaTabApi.
plugin:gp:53305 [AlphaTab Debug] typeof window: object
plugin:gp:53306 [AlphaTab Debug] typeof document: object
plugin:gp:53307 [AlphaTab Debug] window exists: true
plugin:gp:53308 [AlphaTab Debug] document exists: true
plugin:gp:53315 Failed to initialize AlphaTab API: AlphaTabError: Usage of AlphaTabApi is only possible in browser environments. For usage in node use the Low Level APIs
    at new BrowserUiFacade (plugin:gp:34449:13)
    at new AlphaTabApi (plugin:gp:34997:11)
    at TabView.initializeAlphaTabAndLoadScore (plugin:gp:53313:18)
    at TabView.onLoadFile (plugin:gp:53244:16)
    at TabView.<anonymous> (app.js:1:1320340)
    at app.js:1:248524
    at Object.next (app.js:1:248629)
    at app.js:1:247545
    at new Promise (<anonymous>)
    at g (app.js:1:247290)
initializeAlphaTabAndLoadScore	@	plugin:gp:53315
onLoadFile	@	plugin:gp:53244
```

添加新的内容：

```ts
// <-- Debug -->
// ... (之前的日志和 AlphaTab Settings 配置) ...

console.log("[AlphaTab Debug] Original typeof process:", typeof process);
console.log("[AlphaTab Debug] Original typeof module:", typeof module);

let originalProcess: any, originalModule: any; // any to avoid TS errors on reassigning global types
let modifiedGlobals = false;

// @ts-ignore
if (typeof process !== "undefined") {
	originalProcess = globalThis.process;
	// @ts-ignore
	globalThis.process = undefined;
	modifiedGlobals = true;
	console.log("[AlphaTab Debug] Temporarily undefined globalThis.process");
}
// @ts-ignore
if (typeof module !== "undefined") {
	originalModule = globalThis.module;
	// @ts-ignore
	globalThis.module = undefined; // UMD 包装器经常检查这个
	modifiedGlobals = true;
	console.log("[AlphaTab Debug] Temporarily undefined globalThis.module");
}

try {
	this.api = new alphaTab.AlphaTabApi(this.atMainRef, this.alphaTabSettings);
	console.log(
		"[AlphaTab Debug] AlphaTabApi instantiated successfully after modifying globals."
	);
} catch (e) {
	console.error(
		"Failed to initialize AlphaTab API (after modifying globals):",
		e
	);
	this.showErrorInOverlay(
		`Failed to initialize AlphaTab (modified globals): ${e.message}`
	);
	// 如果出错，也要确保恢复全局变量
} finally {
	// 立即恢复全局变量，无论成功与否
	if (modifiedGlobals) {
		if (originalProcess !== undefined) {
			// @ts-ignore
			globalThis.process = originalProcess;
			console.log("[AlphaTab Debug] Restored globalThis.process");
		}
		if (originalModule !== undefined) {
			// @ts-ignore
			globalThis.module = originalModule;
			console.log("[AlphaTab Debug] Restored globalThis.module");
		}
	}
}
```

```console
[AlphaTab Debug] About to instantiate AlphaTabApi.
[AlphaTab Debug] typeof window: object
[AlphaTab Debug] typeof document: object
[AlphaTab Debug] window exists: true
[AlphaTab Debug] document exists: true
[AlphaTab][AlphaTab] Font directory could not be detected, cannot create style element
error @ plugin:gp:999
error @ plugin:gp:1024
createStyleElement @ plugin:gp:49582
createStyleElement @ plugin:gp:34639
initialize @ plugin:gp:34516
AlphaTabApiBase @ plugin:gp:30780
AlphaTabApi @ plugin:gp:34997
initializeAlphaTabAndLoadScore @ plugin:gp:53392
onLoadFile @ plugin:gp:53257

plugin:gp:999 [AlphaTab][AlphaSynth] Failed to create WebWorker: Error: Could not detect alphaTab script file, cannot initialize renderer
error @ plugin:gp:999
error @ plugin:gp:1024
AlphaSynthWebWorkerApi @ plugin:gp:33865
createWorkerPlayer @ plugin:gp:34786
setupPlayer @ plugin:gp:31840
AlphaTabApiBase @ plugin:gp:30823
AlphaTabApi @ plugin:gp:34997
initializeAlphaTabAndLoadScore @ plugin:gp:53392
onLoadFile @ plugin:gp:53257

plugin:gp:53397 Failed to initialize AlphaTab API: TypeError: Cannot read properties of undefined (reading 'addEventListener')
```
