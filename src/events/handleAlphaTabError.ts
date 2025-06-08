import type { ITabUIManager } from "../ITabUIManager";

export function handleAlphaTabError(
	error: { message?: string; stack?: string },
	ui: ITabUIManager
) {
	console.error("[AlphaTab Internal Error]", error);

	// 如果有堆栈信息，可以记录到控制台但不向用户展示完整堆栈
	if (error.stack) {
		console.debug("Error stack:", error.stack);
	}
}
