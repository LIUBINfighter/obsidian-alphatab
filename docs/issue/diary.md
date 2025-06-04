# AlphaTab Obsidian 插件调试历程总结

## 目标
- 在 Obsidian 插件中集成 AlphaTab.js，实现吉他谱（.gp* 等格式）的预览和播放功能。

## 初始状态 (MVP)
### 功能：
- 能够识别吉他谱文件扩展名。
- 注册了自定义视图 (TabView) 来显示乐谱。
- 使用 alphaTab.rendering.ScoreRenderer 将乐谱渲染为 SVG。
- 实现了基本的音轨选择模态框 (TracksModal)。
- 能够根据 Obsidian 的暗黑/明亮主题调整乐谱颜色。
- 实现了 MIDI 文件导出功能。

> 注：播放功能 (playMidi 使用 AlphaSynth) 被注释掉了，未实际测试。

## 调试阶段及遇到的主要问题

### 阶段一：尝试激活播放器并移植 Vue 组件逻辑
#### 遇到的问题 1：alphaTab.model.ScrollMode.Continuous 访问错误
- **现象**：`TypeError: Cannot read properties of undefined (reading 'Continuous')`
- **原因**：错误地将 ScrollMode 作为 alphaTab.model 的子属性访问
- **解决方法**：修正为 `alphaTab.ScrollMode.Continuous`
- **涉及技术**：AlphaTab API 的正确使用，JavaScript/TypeScript 命名空间和对象结构

### 阶段二：AlphaTab 环境检测错误
#### 遇到的问题 2：AlphaTab 报错"非浏览器环境 (Node.js)"
- **现象**：`AlphaTabError: Usage of AlphaTabApi is only possible in browser environments. For usage in node use the Low Level APIs`
- **分析**：
  - MVP 版本主要使用 ScoreRenderer，可能未完全激活播放器子系统，因此未触发此错误。
  - 当前版本使用了完整的 AlphaTabApi，它会初始化包括播放器在内的所有子系统，其中 BrowserUiFacade 会进行环境检查。
  - Electron 渲染进程同时具有浏览器 API (window, document) 和 Node.js API (process, module)，这可能迷惑了 AlphaTab 的环境检测逻辑。
- **定位过程**：
  - 日志确认：添加日志确认在 AlphaTabApi 实例化前 window 和 document 对象是存在的。
  - 简化配置：尝试禁用播放器 (enablePlayer = false) 和核心 Worker (useWorkers = false)，错误依然存在，说明问题发生在更早期的环境检查。
  - 源码分析 (关键)：通过你同事提供的 AlphaTab 源码信息，定位到 Environment.ts 中的 detectWebPlatform() 方法。该方法优先检查 process 对象，如果存在，则将环境判断为 WebPlatform.NodeJs，即使 window 和 document 也存在。
- **解决方法 (尝试)**：临时在 AlphaTabApi 实例化前将 globalThis.process 和 globalThis.module 设置为 undefined，以“欺骗”AlphaTab 的环境检测。
- **涉及技术**：Electron 环境特性，JavaScript 全局对象，库的内部环境检测机制。

### 阶段三：资源加载失败 (环境检测绕过后)
#### 遇到的问题 3：字体和 Worker 资源无法加载
##### 现象：
```
[AlphaTab][AlphaTab] Font directory could not be detected, cannot create style element
[AlphaTab][AlphaSynth] Failed to create WebWorker: Error: Could not detect alphaTab script file, cannot initialize renderer
TypeError: Cannot read properties of undefined (reading 'addEventListener')
```

##### 分析：
- 临时修改全局变量后，AlphaTab 认为自己处于浏览器环境，但其自动检测脚本路径和依赖资源（字体、Worker）的机制在 Obsidian 插件的 app:// 环境下失效。
- 手动拼接的 fontDirectory URL 中的模板字符串变量未被正确替换。

##### 解决方法 (当前尝试)：
- 修正 themeColors 初始化顺序。
- 使用 this.app.vault.adapter.getPluginAssetUrl() 生成资源 URL：这是 Obsidian 推荐的获取插件内部静态资源 URL 的方式。
- 如果 getPluginAssetUrl 不可用，则回退到手动拼接 app://${pluginId}/${assetPath}，并确保模板字符串正确插值。
- 显式设置 settings.core.fontDirectory 指向打包后的字体目录。
- 显式设置 settings.core.scriptFile 指向一个核心的 AlphaTab 脚本文件 (如 alphaTab.mjs)，以帮助 AlphaTab 定位自身和相关资源（特别是 Worker）。
- 确保 pluginId 正确传递和使用。
- **涉及技术**：Obsidian 插件 API (getPluginAssetUrl)，资源路径处理，app:// 协议，AlphaTab 的资源加载配置 (fontDirectory, scriptFile)，JavaScript 模板字符串。

#### 遇到的问题 4：this.app.vault.adapter.getPluginAssetUrl is not a function
- **现象**：尝试使用 Obsidian API 获取资源 URL 时，发现该方法不存在。
- **分析**：可能是 Obsidian API 版本差异，或者该方法在特定 adapter 类型上不可用。
- **当前解决方法**：在代码中增加了对 getPluginAssetUrl 是否存在的检查，如果不存在或调用失败，则回退到手动拼接 app:// URL 的方式。

## 当前状态和下一步
1. 我们已经通过临时修改 `globalThis.module` 绕过了 AlphaTab 最初的环境检测。
2. 当前主要问题是 AlphaTab 在此"模拟浏览器"模式下，无法自动定位其字体和 Worker 资源。
3. 我们正在尝试通过 `settings.core.fontDirectory` 和 `settings.core.scriptFile`，并结合 `this.app.vault.adapter.getPluginAssetUrl()` (及回退方案) 来显式提供这些资源的路径。

### 调试策略
- 保持禁用 Worker 和播放器
- 首先专注于让静态乐谱渲染（仅依赖字体）正常工作
- 观察开发者控制台的网络请求，确认字体文件是否能以正确的 URL 被请求并成功加载
