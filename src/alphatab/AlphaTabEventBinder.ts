import * as alphaTab from "@coderline/alphatab";
import { ITabManagerOptions } from "../types";

export class AlphaTabEventBinder {
	static bind(api: any, eventHandlers: ITabManagerOptions, setScore: (score: alphaTab.model.Score | null) => void, setRenderTracks: (tracks: alphaTab.model.Track[]) => void) {
		const safeBind = (eventName: string, handler?: (...args: any[]) => void) => {
			const emitter = api[eventName];
			if (emitter && typeof emitter.on === "function" && handler) emitter.on(handler);
		};
		safeBind("error", eventHandlers.onError);
		safeBind("renderStarted", eventHandlers.onRenderStarted);
		safeBind("renderFinished", eventHandlers.onRenderFinished);
		const scoreLoadedEmitter = api.scoreLoaded;
		if (scoreLoadedEmitter && typeof scoreLoadedEmitter.on === "function") {
			scoreLoadedEmitter.on((score: alphaTab.model.Score | null) => {
				setScore(score);
				if (score?.tracks?.length) setRenderTracks([score.tracks[0]]);
				else setRenderTracks([]);
				eventHandlers.onScoreLoaded?.(score);
			});
		}
		safeBind("playerStateChanged", eventHandlers.onPlayerStateChanged);
		safeBind("playerPositionChanged", eventHandlers.onPlayerPositionChanged);
		safeBind("fontLoaded", eventHandlers.onFontLoaded);
		safeBind("soundFontLoaded", eventHandlers.onSoundFontLoaded);
		safeBind("playerReady", eventHandlers.onPlayerReady);
		safeBind("ready", eventHandlers.onReady);
	}
}
