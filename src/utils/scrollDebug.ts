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
		console.log("🔍 API状态:");
		console.log("  - API对象:", api);
		console.log("  - 播放器状态:", api.playerState);
		console.log("  - 是否可播放:", api.isReadyForPlayback);

		// 检查设置
		if (api.settings) {
			console.log("🔧 播放器设置:");
			console.log("  - enablePlayer:", api.settings.player.enablePlayer);
			console.log("  - enableCursor:", api.settings.player.enableCursor);
			console.log("  - enableAnimatedBeatCursor:", api.settings.player.enableAnimatedBeatCursor);
			console.log("  - scrollMode:", api.settings.player.scrollMode);
			console.log("  - scrollElement:", api.settings.player.scrollElement);
			console.log("  - scrollOffsetY:", api.settings.player.scrollOffsetY);
			console.log("  - scrollSpeed:", api.settings.player.scrollSpeed);
			console.log("  - nativeBrowserSmoothScroll:", api.settings.player.nativeBrowserSmoothScroll);
		} else {
			console.error("❌ API设置未找到");
		}

		// 检查容器元素
		console.log("📦 容器元素:");
		console.log("  - container:", api.container);
		if (api.container) {
			const element = (api.container as any).element;
			if (element) {
				console.log("  - container.element:", element);
				console.log("  - 容器尺寸:", {
					width: element.clientWidth,
					height: element.clientHeight,
					scrollWidth: element.scrollWidth,
					scrollHeight: element.scrollHeight
				});
				console.log("  - 滚动位置:", {
					scrollTop: element.scrollTop,
					scrollLeft: element.scrollLeft
				});
			}
		}

		// 检查scrollToCursor方法
		console.log("📍 滚动方法:");
		console.log("  - scrollToCursor方法存在:", typeof api.scrollToCursor === 'function');

		// 检查UI facade
		if (api.uiFacade) {
			console.log("🎨 UI Facade:");
			console.log("  - uiFacade:", api.uiFacade);
			console.log("  - scrollToY方法:", typeof (api.uiFacade as any).scrollToY === 'function');
			console.log("  - scrollToX方法:", typeof (api.uiFacade as any).scrollToX === 'function');
		}

		console.groupEnd();
	}

	/**
	 * 测试手动滚动
	 */
	static testManualScroll(api: AlphaTabApi | null) {
		console.log("[ScrollDebug] 🧪 测试手动滚动...");
		
		if (!api) {
			console.error("[ScrollDebug] ❌ API未初始化，无法测试滚动");
			return;
		}

		try {
			// 尝试使用scrollToCursor
			console.log("[ScrollDebug] 📍 尝试调用 scrollToCursor...");
			api.scrollToCursor();
			console.log("[ScrollDebug] ✅ scrollToCursor 调用成功");
		} catch (error) {
			console.error("[ScrollDebug] ❌ scrollToCursor 调用失败:", error);
		}

		// 检查是否有DOM元素可以滚动
		if (api.container) {
			const element = (api.container as any).element;
			if (element) {
				console.log("[ScrollDebug] 🔄 尝试手动滚动DOM元素...");
				const originalScrollTop = element.scrollTop;
				element.scrollTop += 50;
				setTimeout(() => {
					console.log(`[ScrollDebug] 滚动前: ${originalScrollTop}, 滚动后: ${element.scrollTop}`);
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

		console.log("[ScrollDebug] 🎯 开始监听滚动事件...");
		
		const scrollHandler = () => {
			console.log(`[ScrollDebug] 📊 滚动事件: scrollTop=${element.scrollTop}, scrollLeft=${element.scrollLeft}`);
		};

		element.addEventListener('scroll', scrollHandler);
		
		// 返回清理函数
		return () => {
			element.removeEventListener('scroll', scrollHandler);
			console.log("[ScrollDebug] 🛑 停止监听滚动事件");
		};
	}
} 