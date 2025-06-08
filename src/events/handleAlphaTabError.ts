import type { ITabUIManager } from "../ITabUIManager";

export function handleAlphaTabError(
	error: { message?: string },
	ui: ITabUIManager
) {
	console.error("[AlphaTab Internal Error]", error);
	const errorMessage = `AlphaTab Error: ${
		error.message || "An unexpected issue occurred within AlphaTab."
	}`;
	ui.showErrorInOverlay(errorMessage, 10000);
}
