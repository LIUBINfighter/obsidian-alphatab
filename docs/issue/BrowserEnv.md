原插件使用低级API（兼容nodejs环境），只能用来进行简单的渲染

为了使用高级API获得完整的播放器体验，我们使用

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
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
g	@	app.js:1
t.loadFile	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
g	@	app.js:1
t.setState	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
a	@	app.js:1
Promise.then		
l	@	app.js:1
（匿名）	@	app.js:1
g	@	app.js:1
（匿名）	@	app.js:1
eval	@	plugin:obsidian-kanban:67
o	@	plugin:obsidian-kanban:33
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
（匿名）	@	app.js:1
g	@	app.js:1
t.openFile	@	app.js:1
t.onSelfClick	@	app.js:1
t.onFileClick	@	app.js:1
s	@	enhance.js:1
```
