import type { ITabUIManager } from "../ITabUIManager";

export function handleAlphaTabRenderFinished(ui: ITabUIManager, leaf: any) {
	ui.hideLoadingOverlay();
	// new Notice("Tab rendered!");
	leaf?.updateHeader?.();
}
