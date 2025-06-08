import type { AlphaTabApi } from "@coderline/alphatab";
import type { ITabUIManager } from "../ITabUIManager";

export interface CursorScrollOptions {
	enabled: boolean;
	smoothScroll: boolean;
	offsetY: number;
	scrollSpeed: number;
	autoScrollOnPlay: boolean;
	alwaysScrollToBottom: boolean;
}

/**
 * 光标滚动管理器
 * 提供更精细的光标跟随滚动控制和自动滚动功能
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
			offsetY: -25, // 负值在顶部预留空间，与Vue版本保持一致
			scrollSpeed: 500,
			autoScrollOnPlay: true,
			alwaysScrollToBottom: false,
			...options
		};
	}

	public setApi(api: AlphaTabApi | null) {
		this.api = api;
		this.updateAlphaTabSettings();
	}

	public setUI(ui: ITabUIManager | null) {
		this.ui = ui;
	}

	public updateOptions(options: Partial<CursorScrollOptions>) {
		this.options = { ...this.options, ...options };
		this.updateAlphaTabSettings();
	}

	/**
	 * 更新AlphaTab的滚动设置
	 */
	private updateAlphaTabSettings() {
		if (!this.api || !this.api.settings) {
			return;
		}

		// 同步设置到AlphaTab
		this.api.settings.player.enableCursor = this.options.enabled;
		this.api.settings.player.scrollSpeed = this.options.scrollSpeed;
		this.api.settings.player.scrollOffsetY = this.options.offsetY;
		this.api.settings.player.nativeBrowserSmoothScroll = this.options.smoothScroll;
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
	 * 处理播放器位置变化事件
	 */
	public handlePlayerPositionChanged(args: { 
		currentTime: number; 
		endTime: number; 
		currentTick: number; 
		endTick: number 
	}): void {
		if (!this.options.enabled || !this.api) {
			return;
		}

		const now = Date.now();
		if (now - this.lastScrollTime < this.scrollThrottle) {
			return; // 节流控制
		}
		this.lastScrollTime = now;

		// 检查是否应该滚动
		const isPlaying = this.api.playerState === 1; // PlayerState.Playing = 1
		const shouldAutoScroll = this.options.autoScrollOnPlay && isPlaying;

		if (shouldAutoScroll) {
			// 检查是否始终滚动到底部
			if (this.options.alwaysScrollToBottom) {
				this.scrollToBottom();
			} else {
				this.scrollToCursor();
			}
		}
	}

	/**
	 * 滚动到光标位置
	 */
	private scrollToCursor(): void {
		if (!this.api) {
			return;
		}

		// 使用AlphaTab内置的scrollToCursor方法
		try {
			this.api.scrollToCursor();
			console.debug("[CursorScrollManager] 滚动到光标位置");
		} catch (error) {
			console.warn("[CursorScrollManager] 滚动到光标失败:", error);
		}
	}

	/**
	 * 滚动到乐谱底部 - 参考Vue版本实现
	 */
	public scrollToBottom(): void {
		if (!this.api) {
			console.warn("[CursorScrollManager] API未初始化，无法滚动到底部");
			return;
		}

		setTimeout(() => {
			this.performScrollToBottom();
		}, 10);
	}

	/**
	 * 执行滚动到底部的操作
	 */
	private performScrollToBottom(): void {
		if (!this.api || !this.api.score) {
			console.warn("[CursorScrollManager] 乐谱未加载，无法滚动");
			return;
		}

		try {
			const score = this.api.score;
			const masterBars = score.masterBars;

			// 如果没有小节，则退出
			if (!masterBars || masterBars.length === 0) {
				console.warn("[CursorScrollManager] 无法滚动：没有小节");
				return;
			}

			// 策略1：直接使用DOM滚动（简单可靠的方法）
			const viewport = this.findScrollElement();
			if (viewport) {
				setTimeout(() => {
					viewport.scrollTop = viewport.scrollHeight;
					console.debug("[CursorScrollManager] DOM滚动到底部完成");
				}, 10);
			}

			// 策略2：尝试设置位置并延迟滚动（API方法）
			this.scrollToEndWithApi(masterBars);

		} catch (e) {
			console.error("[CursorScrollManager] 滚动到乐谱末尾时出错:", e);
			
			// 最终回退：尝试找到任何可滚动的容器
			const scrollElement = this.findScrollElement();
			if (scrollElement) {
				scrollElement.scrollTop = scrollElement.scrollHeight;
			}
		}
	}

	/**
	 * 使用API滚动到末尾
	 */
	private scrollToEndWithApi(masterBars: any[]): void {
		setTimeout(() => {
			try {
				// 找到最后一个有效的小节
				let lastValidBarIndex = -1;
				for (let i = masterBars.length - 1; i >= 0; i--) {
					if (masterBars[i] && masterBars[i].calculateDuration() > 0) {
						lastValidBarIndex = i;
						break;
					}
				}

				if (lastValidBarIndex >= 0 && this.api) {
					const targetBar = masterBars[lastValidBarIndex];
					const endTick = targetBar.start + targetBar.calculateDuration();

					// 设置位置
					this.api.tickPosition = endTick;

					// 延迟滚动
					setTimeout(() => {
						try {
							if (this.api) {
								this.api.scrollToCursor();
								console.debug("[CursorScrollManager] API滚动到末尾完成");
							}
						} catch (err) {
							console.warn("[CursorScrollManager] API滚动失败:", err);
						}
					}, 150);
				}
			} catch (e) {
				console.warn("[CursorScrollManager] 设置tickPosition失败:", e);
			}
		}, 50);
	}

	/**
	 * 查找可滚动的元素
	 */
	private findScrollElement(): HTMLElement | null {
		// 按优先级查找滚动元素
		const selectors = [
			'.at-viewport',
			'.at-main',
			'.at-content'
		];

		for (const selector of selectors) {
			const element = document.querySelector(selector) as HTMLElement;
			if (element && element.scrollHeight > element.clientHeight) {
				return element;
			}
		}

		return null;
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
					console.debug("[CursorScrollManager] 找到对应的节拍位置:", lookupResult);
				}
			}

			// 设置位置并滚动
			this.api.tickPosition = tick;
			this.api.scrollToCursor();
		} catch (error) {
			console.warn("[CursorScrollManager] 手动滚动失败:", error);
		}
	}

	/**
	 * 启用/禁用始终滚动到底部
	 */
	public setAlwaysScrollToBottom(enabled: boolean): void {
		this.options.alwaysScrollToBottom = enabled;
		
		// 如果启用且当前正在播放，立即滚动
		if (enabled && this.api && this.api.playerState === 1) {
			this.scrollToBottom();
		}
	}

	/**
	 * 获取当前设置
	 */
	public getOptions(): CursorScrollOptions {
		return { ...this.options };
	}

	/**
	 * 是否启用始终滚动到底部
	 */
	public isAlwaysScrollToBottom(): boolean {
		return this.options.alwaysScrollToBottom;
	}
} 