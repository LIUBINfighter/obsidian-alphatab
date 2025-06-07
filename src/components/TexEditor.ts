export class TexEditor {
	private container: HTMLElement;
	private textArea: HTMLTextAreaElement;
	private changeListeners: (() => void)[] = [];

	constructor(parent: HTMLElement) {
		this.container = parent.createDiv({ cls: "at-tex-editor" });
		this.setupEditor();
	}

	private setupEditor() {
		// 创建编辑器标题
		const header = this.container.createDiv({ cls: "tex-editor-header" });
		header.createEl("h3", { text: "AlphaTab/AlphaTex 编辑器", cls: "tex-editor-title" });
		
		// 创建文本编辑区域
		const editorContent = this.container.createDiv({ cls: "tex-editor-content" });
		this.textArea = editorContent.createEl("textarea", {
			cls: "tex-editor-textarea",
			attr: {
				placeholder: "在此输入 AlphaTab/AlphaTex 代码...\n\n示例:\n\\title \"My Song\"\n\\artist \"Artist Name\"\n\\tempo 120\n\n.\n3.3 4.2 5.2 |"
			}
		});
		
		// 设置样式
		this.textArea.style.width = "100%";
		this.textArea.style.height = "100%";
		this.textArea.style.minHeight = "300px";
		this.textArea.style.resize = "vertical";
		this.textArea.style.fontFamily = "monospace";
		this.textArea.style.fontSize = "14px";
		this.textArea.style.border = "1px solid var(--background-modifier-border)";
		this.textArea.style.borderRadius = "4px";
		this.textArea.style.padding = "8px";
		this.textArea.style.backgroundColor = "var(--background-primary)";
		this.textArea.style.color = "var(--text-normal)";
		
		// 监听文本变化
		this.textArea.addEventListener("input", () => {
			this.notifyChange();
		});
		
		// 设置容器样式
		this.container.style.height = "100%";
		this.container.style.display = "flex";
		this.container.style.flexDirection = "column";
		
		editorContent.style.flex = "1";
		editorContent.style.display = "flex";
		editorContent.style.flexDirection = "column";
	}

	onTextChange(callback: () => void) {
		this.changeListeners.push(callback);
	}

	private notifyChange() {
		this.changeListeners.forEach(callback => callback());
	}

	getText(): string {
		return this.textArea.value;
	}

	setText(text: string, suppressChange = false) {
		this.textArea.value = text;
		if (!suppressChange) {
			this.notifyChange();
		}
	}

	// 新增方法：设置文本但不触发变化事件
	setTextSilently(text: string) {
		this.setText(text, true);
	}

	focus() {
		this.textArea.focus();
	}
}
