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
	// 新增的UI元素
	public timePositionSpan!: HTMLSpanElement;
	public layoutControl!: HTMLSelectElement;
	public zoomControl!: HTMLSelectElement;
	public speedControl!: HTMLSelectElement;
	public metronomeButton!: HTMLButtonElement;
	public countInButton!: HTMLButtonElement;
	public savePdfButton!: HTMLButtonElement;
	public savePngButton!: HTMLButtonElement;

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
		
		// 时间显示元素
		const timePositionDiv = this.atControlsRef.createDiv({ cls: "time-position" });
		this.timePositionSpan = timePositionDiv.createSpan();
		this.timePositionSpan.textContent = "00:00 / 00:00";
		
		// 播放控制按钮
		this.playPauseButton = this.atControlsRef.createEl("button", {
			text: "播放", // 原为 "Play"
			cls: "play-pause",
		});
		this.playPauseButton.addEventListener("click", onPlayPause);
		
		this.stopButton = this.atControlsRef.createEl("button", {
			text: "停止", // 原为 "Stop"
			cls: "stop",
		});
		this.stopButton.disabled = true;
		this.stopButton.addEventListener("click", onStop);
		
		// 布局控制下拉框
		const layoutDiv = this.atControlsRef.createDiv({ cls: "layout-control" });
		layoutDiv.createSpan({ text: "布局：" });
		this.layoutControl = layoutDiv.createEl("select");
		["页面", "水平", "垂直"].forEach(option => {
			this.layoutControl.createEl("option", { text: option, value: option });
		});
		
		// 缩放控制下拉框
		const zoomDiv = this.atControlsRef.createDiv({ cls: "zoom-control" });
		zoomDiv.createSpan({ text: "缩放：" });
		this.zoomControl = zoomDiv.createEl("select");
		["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"].forEach(option => {
			this.zoomControl.createEl("option", { text: option, value: option });
		});
		this.zoomControl.value = "1x";
		
		// 速度控制下拉框
		const speedDiv = this.atControlsRef.createDiv({ cls: "speed-control" });
		speedDiv.createSpan({ text: "速度：" });
		this.speedControl = speedDiv.createEl("select");
		["0.25", "0.5", "0.75", "1", "1.25", "1.5", "2"].forEach(option => {
			this.speedControl.createEl("option", { text: `${option}x`, value: option });
		});
		this.speedControl.value = "1";
		
		// 节拍器按钮
		this.metronomeButton = this.atControlsRef.createEl("button", {
			text: "节拍器",
			cls: "metronome",
		});
		
		// 前置四拍按钮
		this.countInButton = this.atControlsRef.createEl("button", {
			text: "前置四拍",
			cls: "count-in",
		});
		
		// 保存按钮
		this.savePdfButton = this.atControlsRef.createEl("button", {
			text: "保存PDF",
			cls: "save-pdf",
		});
		
		this.savePngButton = this.atControlsRef.createEl("button", {
			text: "保存PNG",
			cls: "save-png",
		});
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
	
	// 新增的辅助方法
	updateTimePosition(currentTime: string, totalTime: string) {
		if (this.timePositionSpan) {
			this.timePositionSpan.textContent = `${currentTime} / ${totalTime}`;
		}
	}
	
	setMetronomeActive(active: boolean) {
		if (this.metronomeButton) {
			if (active) {
				this.metronomeButton.addClass("active");
			} else {
				this.metronomeButton.removeClass("active");
			}
		}
	}
	
	setCountInActive(active: boolean) {
		if (this.countInButton) {
			if (active) {
				this.countInButton.addClass("active");
			} else {
				this.countInButton.removeClass("active");
			}
		}
	}
}
