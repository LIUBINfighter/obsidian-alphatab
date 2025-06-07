import type { ITabUIManager } from "../ITabUIManager";
import { Notice } from "obsidian";

export function handleAlphaTabError(
	error: { message?: string },
	ui: ITabUIManager
) {
	console.error("[AlphaTab Internal Error]", error);
	const errorMessage = `AlphaTab Error: ${
		error.message || "An unexpected issue occurred within AlphaTab."
	}`;
	ui.showErrorInOverlay(errorMessage);
	new Notice(errorMessage, 10000);
}
