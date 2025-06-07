export function handleAlphaTabScoreLoaded(
	score: any,
	uiManager: any,
	tracksModal: any | null,
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
