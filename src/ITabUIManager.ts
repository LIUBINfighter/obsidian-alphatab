// ITabUIManager.ts
import { PlayPauseButton } from "./components/controls/playPauseButton";
import { TimePositionDisplay } from "./components/controls/TimePositionDisplay";
import { StopButton } from "./components/controls/StopButton";
import { SelectControl } from "./components/controls/SelectControl";
import { ToggleButton } from "./components/controls/ToggleButton";

// 负责 AlphaTab 相关 UI 元素的创建与管理

export interface ITabUIManagerOptions {
	container: HTMLElement;
}

export class ITabUIManager {
	public atWrap!: HTMLElement;
	public atOverlayRef!: HTMLElement;
	public atOverlayContentRef!: HTMLElement;
	public atMainRef!: HTMLElement;
	public atViewportRef!: HTMLElement;
	public atControlsRef!: HTMLElement;
	public playPauseButton!: PlayPauseButton;
	public stopButton!: StopButton;
	// 新增的UI元素
	public timePositionDisplay!: TimePositionDisplay;
	public layoutControl!: SelectControl;
	public zoomControl!: SelectControl;
	public speedControl!: SelectControl;
	public metronomeButton!: ToggleButton;
	public countInButton!: ToggleButton;
	public savePdfButton!: ToggleButton;
	public savePngButton!: ToggleButton;

	constructor(options: ITabUIManagerOptions) {
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
		this.timePositionDisplay = new TimePositionDisplay(timePositionDiv, {
			initialText: "00:00 / 00:00",
			className: "time-position-display"
		});
		
		// 播放控制按钮
		this.playPauseButton = new PlayPauseButton(this.atControlsRef, {
			onClick: onPlayPause,
			initialText: "播放",
			className: "play-pause"
		});
		
		this.stopButton = new StopButton(this.atControlsRef, {
			onClick: onStop,
			initialText: "停止",
			className: "stop"
		});
		this.stopButton.setEnabled(false);
		
		// 布局控制下拉框
		const layoutDiv = this.atControlsRef.createDiv({ cls: "layout-control" });
		this.layoutControl = new SelectControl({
			label: "布局：",
			options: [
				{ value: "页面", text: "页面" },
				{ value: "水平", text: "水平" },
				{ value: "垂直", text: "垂直" }
			]
		});
		layoutDiv.appendChild(this.layoutControl.render());
		
		// 缩放控制下拉框
		const zoomDiv = this.atControlsRef.createDiv({ cls: "zoom-control" });
		this.zoomControl = new SelectControl({
			label: "缩放：",
			options: [
				{ value: "0.5x", text: "0.5x" },
				{ value: "0.75x", text: "0.75x" },
				{ value: "1x", text: "1x" },
				{ value: "1.25x", text: "1.25x" },
				{ value: "1.5x", text: "1.5x" },
				{ value: "2x", text: "2x" }
			],
			defaultValue: "1x"
		});
		zoomDiv.appendChild(this.zoomControl.render());
		
		// 速度控制下拉框
		const speedDiv = this.atControlsRef.createDiv({ cls: "speed-control" });
		this.speedControl = new SelectControl({
			label: "速度：",
			options: [
				{ value: "0.25", text: "0.25x" },
				{ value: "0.5", text: "0.5x" },
				{ value: "0.75", text: "0.75x" },
				{ value: "1", text: "1x" },
				{ value: "1.25", text: "1.25x" },
				{ value: "1.5", text: "1.5x" },
				{ value: "2", text: "2x" }
			],
			defaultValue: "1"
		});
		speedDiv.appendChild(this.speedControl.render());
		
		// 节拍器按钮
		this.metronomeButton = new ToggleButton({
			text: "节拍器",
			active: false
		});
		this.atControlsRef.appendChild(this.metronomeButton.getElement());
		
		// 前置四拍按钮
		this.countInButton = new ToggleButton({
			text: "前置四拍",
			active: false
		});
		this.atControlsRef.appendChild(this.countInButton.getElement());
		
		// 保存按钮
		this.savePdfButton = new ToggleButton({
			text: "保存PDF"
		});
		this.atControlsRef.appendChild(this.savePdfButton.getElement());
		
		this.savePngButton = new ToggleButton({
			text: "保存PNG"
		});
		this.atControlsRef.appendChild(this.savePngButton.getElement());
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
		if (this.stopButton) this.stopButton.setEnabled(enabled);
	}
	
	// 新增的辅助方法
	updateTimePosition(currentTime: string, totalTime: string) {
		if (this.timePositionDisplay) {
			this.timePositionDisplay.setText(`${currentTime} / ${totalTime}`);
		}
	}
	
	setMetronomeActive(active: boolean) {
		if (this.metronomeButton) {
			this.metronomeButton.setActive(active);
		}
	}
	
	setCountInActive(active: boolean) {
		if (this.countInButton) {
			this.countInButton.setActive(active);
		}
	}
}
