// ITabEventHandlers.ts
// 可选：复杂事件处理逻辑可集中于此
import type { ITabUIManager } from "./ITabUIManager";
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

export function handleAlphaTabRenderStarted(ui: ITabUIManager) {
	ui.showLoadingOverlay("Rendering sheet...");
}

export function handleAlphaTabRenderFinished(ui: ITabUIManager, leaf: any) {
	ui.hideLoadingOverlay();
	// new Notice("Tab rendered!");
	leaf?.updateHeader?.();
}

export function handleAlphaTabScoreLoaded(
	score: any,
	uiManager: any,
	tracksModal: any | null, // 改为可以为null
	api: any,
	leaf: any
) {
	uiManager.hideLoadingOverlay();

	// 如果tracksModal存在，则更新它
	if (tracksModal) {
		tracksModal.setTracks(score.tracks);
		const initialRenderTracks =
			score.tracks && score.tracks.length > 0 ? [score.tracks[0]] : [];
		tracksModal.setRenderTracks(initialRenderTracks);
		api?.renderTracks(initialRenderTracks);
		setTimeout(() => {
			api?.render();
		}, 1000);
	}

	leaf?.updateHeader?.();
}

export function handlePlayerStateChanged(
	args: { state: number }, // 简化类型定义
	ui: ITabUIManager
) {
	const isPlaying = args.state === 1; // synth.PlayerState.Playing
	const isPaused = args.state === 2; // synth.PlayerState.Paused
	ui.setPlayPauseButtonText(isPlaying ? "暂停" : "播放");
	ui.setStopButtonEnabled(isPlaying || isPaused);
}
