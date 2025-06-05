// AlphaTabUIManager.ts
// 负责 AlphaTab 相关 UI 元素的创建与管理

export interface AlphaTabUIManagerOptions {
	container: HTMLElement;
}

export class AlphaTabUIManager {
	public atWrap!: HTMLElement;
	public atOverlayRef!: HTMLElement;
	public atOverlayContentRef!: HTMLElement;
	public atMainRef!: HTMLElement;
	public atViewportRef!: HTMLElement;
	public atControlsRef!: HTMLElement;
	public playPauseButton!: HTMLButtonElement;
	public stopButton!: HTMLButtonElement;

	constructor(options: AlphaTabUIManagerOptions) {
		this.createUI(options.container);
	}

	createUI(container: HTMLElement) {
		this.atWrap = container.createDiv({ cls: "at-wrap" });
		this.atOverlayRef = this.atWrap.createDiv({
			cls: "at-overlay",
			attr: { style: "display: none;" },
		});
		this.atOverlayContentRef = this.atOverlayRef.createDiv({
			cls: "at-overlay-content",
		});
		const atContent = this.atWrap.createDiv({ cls: "at-content" });
		this.atViewportRef = atContent.createDiv({ cls: "at-viewport" });
		this.atMainRef = this.atViewportRef.createDiv({ cls: "at-main" });
		this.atControlsRef = this.atWrap.createDiv({ cls: "at-controls" });
	}

	renderControlBar(onPlayPause: () => void, onStop: () => void) {
		this.atControlsRef.empty();
		this.playPauseButton = this.atControlsRef.createEl("button", {
			text: "Play",
		});
		this.playPauseButton.addEventListener("click", onPlayPause);
		this.stopButton = this.atControlsRef.createEl("button", {
			text: "Stop",
		});
		this.stopButton.disabled = true;
		this.stopButton.addEventListener("click", onStop);
	}

	showLoadingOverlay(message: string) {
		this.atOverlayContentRef.setText(message);
		this.atOverlayRef.style.display = "flex";
		this.atOverlayRef.removeClass("error");
	}
	showErrorInOverlay(errorMessage: string) {
		this.showLoadingOverlay(errorMessage);
		this.atOverlayRef.addClass("error");
	}
	hideLoadingOverlay() {
		this.atOverlayRef.style.display = "none";
		this.atOverlayRef.removeClass("error");
	}
	setPlayPauseButtonText(text: string) {
		if (this.playPauseButton) this.playPauseButton.setText(text);
	}
	setStopButtonEnabled(enabled: boolean) {
		if (this.stopButton) this.stopButton.disabled = !enabled;
	}
}
