// ITabEventHandlers.ts
// 可选：复杂事件处理逻辑可集中于此

// 拆分后的事件处理函数导入
export { handleAlphaTabError } from "./events/handleAlphaTabError";
export { handleAlphaTabRenderStarted } from "./events/handleAlphaTabRenderStarted";
export { handleAlphaTabRenderFinished } from "./events/handleAlphaTabRenderFinished";
export { handleAlphaTabScoreLoaded } from "./events/handleAlphaTabScoreLoaded";
export { handlePlayerStateChanged } from "./events/handlePlayerStateChanged";
export { handlePlayerPositionChanged } from "./events/handlePlayerPositionChanged";
