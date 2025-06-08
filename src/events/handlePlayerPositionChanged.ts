import type { ITabUIManager } from "../ITabUIManager";
import type { AlphaTabApi } from "@coderline/alphatab";

/**
 * 播放器位置变化事件处理
 * 实现光标跟随滚动功能
 */
export function handlePlayerPositionChanged(
	args: { currentTime: number; endTime: number; currentTick: number; endTick: number },
	ui: ITabUIManager,
	api: AlphaTabApi | null
) {
	// 更新时间显示
	const currentTimeFormatted = formatTime(args.currentTime);
	const totalTimeFormatted = formatTime(args.endTime);
	ui.updateTimePosition(currentTimeFormatted, totalTimeFormatted);
	
	// 实现光标跟随滚动 - 只在播放时进行，且用户启用了跟随功能
	const shouldScroll = api && 
		api.settings?.player?.enableCursor && 
		api.playerState === 1 && // PlayerState.Playing = 1
		ui.isScrollFollowEnabled();

	// 详细的调试信息
	console.debug(`[TabView] 位置变化事件:`, {
		currentTime: args.currentTime,
		currentTick: args.currentTick,
		playerState: api?.playerState,
		enableCursor: api?.settings?.player?.enableCursor,
		scrollFollowEnabled: ui.isScrollFollowEnabled(),
		shouldScroll
	});

	if (shouldScroll) {
		try {
			// 使用 AlphaTab 的 scrollToCursor 方法进行自动滚动
			api.scrollToCursor();
			console.debug(`[TabView] ✅ 滚动命令已发送 - 光标位置: ${args.currentTick}/${args.endTick}`);
		} catch (error) {
			console.warn("[TabView] ❌ 滚动到光标位置失败:", error);
		}
	} else if (api?.playerState === 1) {
		console.debug("[TabView] ⏸️ 滚动已跳过 - 检查设置和状态");
	}
}

/**
 * 格式化时间显示
 */
function formatTime(milliseconds: number): string {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
} 