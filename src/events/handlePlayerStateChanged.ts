import type { ITabUIManager } from "../ITabUIManager";

export function handlePlayerStateChanged(
	args: { state: number },
	ui: ITabUIManager
) {
	const isPlaying = args.state === 1; // synth.PlayerState.Playing
	const isPaused = args.state === 2; // synth.PlayerState.Paused
	ui.setPlayPauseButtonText(isPlaying ? "暂停" : "播放");
	ui.setStopButtonEnabled(isPlaying || isPaused);
}
