# Obsidian AlphaTab 插件工程日志

## 项目概述

Obsidian AlphaTab 插件旨在为 Obsidian 提供直接查看和播放吉他谱文件的功能（支持 GP3、GP4、GP5、GPX 等格式）。该插件基于 [AlphaTab](https://www.alphatab.net/) 库实现，但在集成过程中遇到了几个关键挑战。

## 主要问题及解决方案

### 1. 插件目录路径问题

**问题**：在 Electron 环境下，`__dirname` 和 `__filename` 返回的是 Electron 运行时目录（如 `D:\Obsidian\resources\electron.asar\renderer\init.js`），而非插件实际目录。

**解决方法**：
- 使用 Obsidian API 提供的 `this.manifest.dir`（插件相对路径）和 `this.app.vault.adapter.basePath`（库根目录）来构建完整路径
- 实现了向上查找 `manifest.json` 的机制，确保在各种环境下都能找到正确的插件目录

```typescript
// 正确获取插件根目录的方法
const vaultRoot = (this.app.vault.adapter as any).basePath as string;
const pluginDir = path.join(vaultRoot, this.manifest.dir);
```

### 2. 字体加载问题

**问题**：AlphaTab 渲染五线谱需要 Bravura 字体，但在 Obsidian/Electron 环境中存在多种障碍：
1. CSP (Content Security Policy) 限制从本地文件系统或自定义 URL 加载字体
2. HTTP 服务器加载字体时存在 CORS 问题
3. 字体路径解析不正确，导致 "Font not available" 和 "NetworkError" 错误

**尝试解决方案**：

1. **方案一：HTTP 服务方式**
   - 创建本地 HTTP 服务器提供字体文件
   - 配置 `fontDirectory` 指向本地服务器
   - 问题：即使设置了正确的 CORS 头，仍然遇到 CSP 限制

2. **方案二：内联样式方式**
   - 读取字体文件，使用 `<style>` 标签和 `@font-face` 加载
   - 问题：AlphaTab 内部字体加载机制无法识别这种方式注册的字体

3. **方案三 (最终方案)：data:URL 方式**
   - 读取字体文件并转换为 base64 编码的 data:URL
   - 使用 `smuflFontSources` 而非 `fontDirectory` 设置字体源
   - 同时加载 `bravura_metadata.json` 元数据文件

```typescript
// 将字体转换为 data:URL 并通过 smuflFontSources 设置
const fontDataUrls: Record<string, string> = {};
for (const { ext, mime } of fontFiles) {
    const fontPath = path.join(fontAssetsPath, `Bravura.${ext}`);
    if (fs.existsSync(fontPath)) {
        const fontBuffer = fs.readFileSync(fontPath);
        const fontBase64 = fontBuffer.toString("base64");
        fontDataUrls[ext] = `data:${mime};base64,${fontBase64}`;
    }
}

// 加载元数据文件
const metadataStr = fs.readFileSync(metadataPath, "utf8");
const metadataBase64 = Buffer.from(metadataStr).toString("base64");
fontDataUrls["json"] = `data:application/json;base64,${metadataBase64}`;

// 设置到 AlphaTab
this.settings.core.smuflFontSources = fontDataUrls;
this.settings.core.fontDirectory = null; // 禁用 HTTP 加载
```

### 3. 环境兼容性问题

**问题**：AlphaTab 检测到 Node.js 环境时会使用 Node.js 特性，但 Obsidian/Electron 混合环境下会导致问题。

**解决方法**：
- 临时修改全局 `process` 和 `module` 对象，让 AlphaTab 认为是浏览器环境
- 显式设置 `alphaTab.Environment.webPlatform = WebPlatform.Browser`
- 实例化 API 后恢复全局对象

```typescript
// 环境 hack (用于 API 实例化)
let originalProcess = globalThis.process;
let originalModule = globalThis.module;
globalThis.process = undefined;
globalThis.module = undefined;

alphaTab.Environment.webPlatform = WebPlatform.Browser;
this.api = new alphaTab.AlphaTabApi(this.mainElement, this.settings);

// 恢复全局对象
globalThis.process = originalProcess;
globalThis.module = originalModule;
```

## 经验与最佳实践

1. **避免使用 __dirname/__filename**：在 Electron 插件中，总是使用 Obsidian API 提供的路径。

2. **字体加载考虑 CSP**：在 Electron 环境下，优先使用 data:URL 方式加载字体，避免 CSP 和 CORS 问题。

3. **优先使用简单方式**：尽管 HTTP 服务器看似灵活，但 data:URL 方式更可靠且无需额外的网络栈。

4. **React 到库的内部机制**：理解如 AlphaTab 这样的库在不同环境下的行为差异（如 Node.js vs. 浏览器）。

5. **充分测试各种平台**：Electron 应用在不同操作系统可能有不同的行为，特别是涉及文件路径和权限时。

## 总结

通过综合运用路径处理、字体加载技术、环境检测和兼容性处理，我们成功地将 AlphaTab 库集成到 Obsidian 插件中，实现了吉他谱文件的渲染和播放功能。最关键的突破是使用 data:URL 方式加载字体，这避开了 CSP 和 CORS 限制，也简化了部署流程。

---

*此工程日志记录了开发过程中的主要技术挑战和解决方案，希望能为其他开发者提供参考。*
