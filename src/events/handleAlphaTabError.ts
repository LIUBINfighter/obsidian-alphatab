import type { ITabUIManager } from "../ITabUIManager";

export function handleAlphaTabError(
	error: { message?: string; stack?: string },
	ui: ITabUIManager
) {
	console.error("[AlphaTab Internal Error]", error);

	// 构建更详细的错误信息
	const errorMessage = `AlphaTab 错误: ${
		error.message || "AlphaTab 内部发生了意外问题。"
	}`;

	// 如果有堆栈信息，可以记录到控制台但不向用户展示完整堆栈
	if (error.stack) {
		console.debug("Error stack:", error.stack);
	}

	// 显示到UI界面
	ui.showErrorInOverlay(errorMessage, 10000);
}
