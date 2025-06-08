import type { AlphaTabApi } from "@coderline/alphatab";
import type { ITabUIManager } from "../ITabUIManager";

export interface CursorScrollOptions {
	enabled: boolean;
	smoothScroll: boolean;
	offsetY: number;
	scrollSpeed: number;
	autoScrollOnPlay: boolean;
}

/**
 * 光标滚动管理器
 * 提供更精细的光标跟随滚动控制
 */
export class CursorScrollManager {
	private api: AlphaTabApi | null = null;
	private ui: ITabUIManager | null = null;
	private options: CursorScrollOptions;
	private lastScrollTime = 0;
	private scrollThrottle = 100; // 滚动节流时间（毫秒）

	constructor(options: Partial<CursorScrollOptions> = {}) {
		this.options = {
			enabled: true,
			smoothScroll: true,
			offsetY: 50,
			scrollSpeed: 500,
			autoScrollOnPlay: true,
			...options
		};
	}

	public setApi(api: AlphaTabApi | null) {
		this.api = api;
	}

	public setUI(ui: ITabUIManager | null) {
		this.ui = ui;
	}

	public updateOptions(options: Partial<CursorScrollOptions>) {
		this.options = { ...this.options, ...options };
		
		// 更新AlphaTab设置
		if (this.api && this.api.settings) {
			this.api.settings.player.scrollOffsetY = this.options.offsetY;
			this.api.settings.player.scrollSpeed = this.options.scrollSpeed;
			this.api.settings.player.nativeBrowserSmoothScroll = this.options.smoothScroll;
		}
	}

	public setEnabled(enabled: boolean) {
		this.options.enabled = enabled;
		if (this.ui) {
			this.ui.setScrollFollowEnabled(enabled);
		}
	}

	public isEnabled(): boolean {
		return this.options.enabled && (this.ui?.isScrollFollowEnabled() ?? true);
	}

	/**
	 * 处理播放器位置变化，执行光标跟随滚动
	 */
	public handlePlayerPositionChanged(args: {
		currentTime: number;
		endTime: number;
		currentTick: number;
		endTick: number;
	}): void {
		if (!this.shouldScroll()) {
			return;
		}

		// 节流处理，避免过度滚动
		const now = Date.now();
		if (now - this.lastScrollTime < this.scrollThrottle) {
			return;
		}
		this.lastScrollTime = now;

		try {
			this.scrollToCursor();
		} catch (error) {
			console.warn("[CursorScrollManager] 滚动失败:", error);
		}
	}

	/**
	 * 判断是否应该进行滚动
	 */
	private shouldScroll(): boolean {
		if (!this.api || !this.isEnabled()) {
			return false;
		}

		// 检查播放器状态
		if (this.options.autoScrollOnPlay && this.api.playerState !== 1) { // PlayerState.Playing
			return false;
		}

		// 检查光标设置
		if (!this.api.settings?.player?.enableCursor) {
			return false;
		}

		return true;
	}

	/**
	 * 执行滚动到光标位置
	 */
	private scrollToCursor(): void {
		if (!this.api) {
			return;
		}

		// 使用AlphaTab内置的scrollToCursor方法
		this.api.scrollToCursor();
	}

	/**
	 * 手动滚动到指定位置
	 */
	public scrollToPosition(tick: number): void {
		if (!this.api) {
			return;
		}

		try {
			// 如果有tick缓存，可以使用更精确的滚动
			if (this.api.tickCache) {
				const lookupResult = this.api.tickCache.findBeat(new Set([0]), tick);
				if (lookupResult) {
					// 可以在这里实现更精确的滚动逻辑
					console.debug("[CursorScrollManager] 找到对应的节拍位置:", lookupResult);
				}
			}
			
			// 回退到基本滚动
			this.api.scrollToCursor();
		} catch (error) {
			console.warn("[CursorScrollManager] 手动滚动失败:", error);
		}
	}

	/**
	 * 获取当前设置
	 */
	public getOptions(): CursorScrollOptions {
		return { ...this.options };
	}
} 