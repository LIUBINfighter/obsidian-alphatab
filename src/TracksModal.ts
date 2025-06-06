// TracksModal.ts
import { Modal, Setting, App } from "obsidian";
import * as alphaTab from "@coderline/alphatab";

export class TracksModal extends Modal {
	tracks: alphaTab.model.Track[];
	renderTracks: Set<alphaTab.model.Track>;
	onChange?: (tracks?: alphaTab.model.Track[]) => void;

	constructor(app: App, tracks: alphaTab.model.Track[], onChange?: TracksModal["onChange"]) {
		super(app);
		this.tracks = tracks;
		this.onChange = onChange;
		this.renderTracks = new Set(tracks.length > 0 ? [tracks[0]] : []);
		this.modalEl.addClass("tracks-modal");
	}
	onOpen = () => {
		this.contentEl.empty();
		this.titleEl.setText("Select Tracks to Display");
		this.tracks.forEach((track) => {
			new Setting(this.contentEl)
				.setName(track.name)
				.setDesc(track.shortName || `Track ${track.index + 1}`)
				.addToggle((toggle) => {
					toggle
						.setValue(this.renderTracks.has(track))
						.onChange((value) => {
							if (value) {
								this.renderTracks.add(track);
							} else {
								this.renderTracks.delete(track);
							}
						});
				});
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("Apply")
					.setCta()
					.onClick(() => {
						this.onSelectTrack();
						this.close();
					})
			)
			.addButton((button) =>
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	};
	onSelectTrack = () => {
		const selectTracks = Array.from(this.renderTracks).sort(
			(a, b) => a.index - b.index
		);
		this.onChange?.(selectTracks);
	};
	onClose = () => {
		this.contentEl.empty();
	};
	setTracks(tracks: alphaTab.model.Track[]) {
		this.tracks = tracks;
		this.renderTracks = new Set(tracks.length > 0 ? [tracks[0]] : []);
	}
	setRenderTracks(tracks: alphaTab.model.Track[]) {
		this.renderTracks = new Set(tracks);
	}
}
