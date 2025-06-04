// AlphaTabEventHandlers.ts
// 可选：复杂事件处理逻辑可集中于此
import type { Score, PlayerStateChangedEventArgs, Track } from "@coderline/alphatab";
import type { AlphaTabManager } from "./AlphaTabManager";
import type { AlphaTabUIManager } from "./AlphaTabUIManager";
import { Notice } from "obsidian";

export function handleAlphaTabError(error: { message?: string }, ui: AlphaTabUIManager) {
    console.error("[AlphaTab Internal Error]", error);
    const errorMessage = `AlphaTab Error: ${error.message || "An unexpected issue occurred within AlphaTab."}`;
    ui.showErrorInOverlay(errorMessage);
    new Notice(errorMessage, 10000);
}

export function handleAlphaTabRenderStarted(ui: AlphaTabUIManager) {
    ui.showLoadingOverlay("Rendering sheet...");
}

export function handleAlphaTabRenderFinished(ui: AlphaTabUIManager, leaf: any) {
    ui.hideLoadingOverlay();
    new Notice("Tab rendered!");
    leaf?.updateHeader?.();
}

export function handleAlphaTabScoreLoaded(score: Score | null, ui: AlphaTabUIManager, tracksModal: any, api: any, leaf: any) {
    if (!score) {
        ui.showErrorInOverlay("Error: Score data could not be loaded or parsed.");
        return;
    }
    tracksModal.setTracks(score.tracks);
    if (score.tracks?.length > 0) {
        tracksModal.setRenderTracks([score.tracks[0]]);
        api?.renderTracks([score.tracks[0]]);
        setTimeout(() => { api?.render(); }, 1000);
    }
    leaf?.updateHeader?.();
}

export function handlePlayerStateChanged(args: PlayerStateChangedEventArgs, ui: AlphaTabUIManager) {
    const isPlaying = args.state === 1; // synth.PlayerState.Playing
    const isPaused = args.state === 2; // synth.PlayerState.Paused
    ui.setPlayPauseButtonText(isPlaying ? "暂停" : "播放");
    ui.setStopButtonEnabled(isPlaying || isPaused);
}
