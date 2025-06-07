export class TabDisplay {
	private container: HTMLElement;
	private contentEl: HTMLElement;

	constructor(parent: HTMLElement) {
		// 优化：如果父容器已存在主内容区域，则复用，否则创建
		const existing = parent.querySelector('.at-main-content') as HTMLElement;
		this.container = existing || parent.createDiv({ cls: "at-main-content" });
		this.contentEl = this.container;

		// 优化：确保主内容区域有明确尺寸，避免 AlphaTab 渲染异常
		this.container.style.minWidth = "300px";
		this.container.style.minHeight = "150px";
		this.container.style.flex = "1 1 auto";
	}

	getContentElement(): HTMLElement {
		return this.contentEl;
	}

	// 可扩展：如需要添加额外的渲染逻辑，可在此实现
}
