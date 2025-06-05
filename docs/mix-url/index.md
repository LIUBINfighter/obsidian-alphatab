mix-url 分支是由于render分支陷入问题导致的。

render分支 对 AlphaTab 内部 BrowserUiFacade.createStyleElements 做了拦截补丁，仍在验证中，我们尝试混合url模式即 一部分字体加载由本地 fs 读取并通过 data:URL 手动注入，绕过了原生网络加载；绕不过去的在本地跑一个server提供服务

---


目前插件开发状况：AlphaTabApi在obsidian环境中通过了浏览器环境检测正确实例化，然后渲染的时候我们用data:/// url加载了其余字体，唯独有一个字体无法加载，我们考虑使用 http协议跑一个server作为补充

下一步方案：

专门为 Bravura 优化

实施 fetch patch。
设置虚拟 fontDirectory。
移除 smuflFontSources。
移除手动字体注入和预加载。
密切关注 fetch 拦截器的日志，看它是否正确拦截并响应了 AlphaTab 的字体请求。

无论采用哪种方案，以下几点仍然重要：

保持 Environment.webPlatform = WebPlatform.Browser 和临时移除 process/module 的 hack。
在 renderStarted 事件中检查并按需修正 api.settings.display.resources.smuflFont.families 仍然是一个有用的保险措施，确保最终渲染使用的是我们期望的字体族（即使 AlphaTab 内部用了其他名称如 'alphaTab' 来通过加载检查，我们最终还是希望渲染引擎用我们指定的 smuflFont 设置）。
这些方案的核心都是让 AlphaTab 内部的 FontLoadingChecker 能够成功验证其认为关键的字体（通常是它自己生成的，如 'alphaTab'），从而使 canRender 变为 true。
