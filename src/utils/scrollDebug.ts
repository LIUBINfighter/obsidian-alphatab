import type { AlphaTabApi } from "@coderline/alphatab";

/**
 * 滚动调试工具
 * 用于诊断光标跟随滚动的问题
 */
export class ScrollDebugger {
	/**
	 * 检查并打印所有滚动相关的设置和状态
	 */
	static debugScrollSettings(api: AlphaTabApi | null, prefix = "[ScrollDebug]") {
		console.group(`${prefix} 滚动设置诊断`);
		
		if (!api) {
			console.error("❌ AlphaTab API 未初始化");
			console.groupEnd();
			return;
		}

		// 检查基本API状态
		console.debug("🔍 API状态:");
		console.debug("  - API对象:", api);
		console.debug("  - 播放器状态:", api.playerState);
		console.debug("  - 是否可播放:", api.isReadyForPlayback);

		// 检查设置
		if (api.settings) {
			console.debug("🔧 播放器设置:");
			console.debug("  - enablePlayer:", api.settings.player.enablePlayer);
			console.debug("  - enableCursor:", api.settings.player.enableCursor);
			console.debug("  - enableAnimatedBeatCursor:", api.settings.player.enableAnimatedBeatCursor);
			console.debug("  - scrollMode:", api.settings.player.scrollMode);
			console.debug("  - scrollElement:", api.settings.player.scrollElement);
			console.debug("  - scrollOffsetY:", api.settings.player.scrollOffsetY);
			console.debug("  - scrollSpeed:", api.settings.player.scrollSpeed);
			console.debug("  - nativeBrowserSmoothScroll:", api.settings.player.nativeBrowserSmoothScroll);
		} else {
			console.error("❌ API设置未找到");
		}

		// 检查容器元素
		console.debug("📦 容器元素:");
		console.debug("  - container:", api.container);
		if (api.container) {
			const element = (api.container as any).element;
			if (element) {
				console.debug("  - container.element:", element);
				console.debug("  - 容器尺寸:", {
					width: element.clientWidth,
					height: element.clientHeight,
					scrollWidth: element.scrollWidth,
					scrollHeight: element.scrollHeight
				});
				console.debug("  - 滚动位置:", {
					scrollTop: element.scrollTop,
					scrollLeft: element.scrollLeft
				});
			}
		}

		// 检查scrollToCursor方法
		console.debug("📍 滚动方法:");
		console.debug("  - scrollToCursor方法存在:", typeof api.scrollToCursor === 'function');

		// 检查UI facade
		if (api.uiFacade) {
			console.debug("🎨 UI Facade:");
			console.debug("  - uiFacade:", api.uiFacade);
			console.debug("  - scrollToY方法:", typeof (api.uiFacade as any).scrollToY === 'function');
			console.debug("  - scrollToX方法:", typeof (api.uiFacade as any).scrollToX === 'function');
		}

		console.groupEnd();
	}

	/**
	 * 测试手动滚动
	 */
	static testManualScroll(api: AlphaTabApi | null) {
		console.debug("[ScrollDebug] 🧪 测试手动滚动...");
		
		if (!api) {
			console.error("[ScrollDebug] ❌ API未初始化，无法测试滚动");
			return;
		}

		try {
			// 尝试使用scrollToCursor
			console.debug("[ScrollDebug] 📍 尝试调用 scrollToCursor...");
			api.scrollToCursor();
			console.debug("[ScrollDebug] ✅ scrollToCursor 调用成功");
		} catch (error) {
			console.error("[ScrollDebug] ❌ scrollToCursor 调用失败:", error);
		}

		// 检查是否有DOM元素可以滚动
		if (api.container) {
			const element = (api.container as any).element;
			if (element) {
				console.debug("[ScrollDebug] 🔄 尝试手动滚动DOM元素...");
				const originalScrollTop = element.scrollTop;
				element.scrollTop += 50;
				setTimeout(() => {
					console.debug(`[ScrollDebug] 滚动前: ${originalScrollTop}, 滚动后: ${element.scrollTop}`);
					element.scrollTop = originalScrollTop; // 恢复原位置
				}, 100);
			}
		}
	}

	/**
	 * 监听滚动事件
	 */
	static startScrollMonitoring(api: AlphaTabApi | null) {
		if (!api || !api.container) return;

		const element = (api.container as any).element;
		if (!element) return;

		console.debug("[ScrollDebug] 🎯 开始监听滚动事件...");
		
		const scrollHandler = () => {
			console.debug(`[ScrollDebug] 📊 滚动事件: scrollTop=${element.scrollTop}, scrollLeft=${element.scrollLeft}`);
		};

		element.addEventListener('scroll', scrollHandler);
		
		// 返回清理函数
		return () => {
			element.removeEventListener('scroll', scrollHandler);
			console.debug("[ScrollDebug] 🛑 停止监听滚动事件");
		};
	}
} 