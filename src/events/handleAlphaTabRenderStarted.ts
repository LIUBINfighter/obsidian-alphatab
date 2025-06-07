import type { ITabUIManager } from "../ITabUIManager";

export function handleAlphaTabRenderStarted(ui: ITabUIManager) {
	ui.showLoadingOverlay("Rendering sheet...");
}
