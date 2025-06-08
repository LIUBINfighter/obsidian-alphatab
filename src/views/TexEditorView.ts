import { TextFileView, WorkspaceLeaf, Notice } from "obsidian";
import AlphaTabPlugin from "../main";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

export const VIEW_TYPE_TEX_EDITOR = "tex-editor-view";

export class TexEditorView extends TextFileView {
    plugin: AlphaTabPlugin;
    private editor: EditorView;

    constructor(leaf: WorkspaceLeaf, plugin: AlphaTabPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_TEX_EDITOR;
    }

    getDisplayText(): string {
        return this.file ? `AlphaTab: ${this.file.basename}` : "AlphaTab Editor";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        // 创建编辑器容器
        const editorContainer = container.createDiv({ cls: "tex-editor-container" });
        
        // 创建工具栏
        const toolbar = editorContainer.createDiv({ cls: "tex-editor-toolbar" });
        
        // 创建工具栏标题
        toolbar.createEl("span", { text: "AlphaTex 编辑器", cls: "tex-editor-title" });
        
        // 添加工具栏按钮组
        const buttonGroup = toolbar.createDiv({ cls: "tex-editor-button-group" });
        
        // 添加常用 AlphaTex 命令按钮
        this.addToolbarButton(buttonGroup, "音符", ":4 ", "插入四分音符");
        this.addToolbarButton(buttonGroup, "小节线", "|", "插入小节线");
        this.addToolbarButton(buttonGroup, "和弦", ".1.3.5", "插入和弦");
        this.addToolbarButton(buttonGroup, "休止符", "r4", "插入休止符");
        this.addToolbarButton(buttonGroup, "升降记号", "#", "插入升号");
        
        // 创建 CodeMirror 编辑器容器
        const cmContainer = editorContainer.createDiv({ cls: "tex-editor-cm-container" });
        
        // 配置 CodeMirror 编辑器
        const extensions = [
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            syntaxHighlighting(defaultHighlightStyle),
            placeholder("输入 AlphaTex 内容...\n例如: :4 c d e f | g a b c5"),
            EditorView.lineWrapping,
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    // 内容变化时立即保存，而不仅是请求保存
                    this.save();
                    
                    // 可选：添加状态指示
                    const statusEl = this.containerEl.querySelector('.tex-editor-status');
                    if (statusEl) {
                        statusEl.textContent = "已保存";
                        setTimeout(() => {
                            statusEl.textContent = "";
                        }, 2000);
                    }
                }
            })
        ];

        const state = EditorState.create({
            doc: this.data || "",
            extensions
        });

        this.editor = new EditorView({
            state,
            parent: cmContainer
        });

        // 添加样式
        this.addEditorStyles();
        
        // 设置焦点到编辑器
        setTimeout(() => {
            this.editor.focus();
        }, 10);
    }

    private addToolbarButton(container: HTMLElement, label: string, insertText: string, tooltip: string) {
        const button = container.createEl("button", { 
            text: label,
            cls: "tex-editor-button",
            attr: { "aria-label": tooltip }
        });
        
        button.addEventListener("click", () => {
            if (!this.editor) return;
            
            // 获取当前光标位置并插入文本
            const selection = this.editor.state.selection.main;
            const transaction = this.editor.state.update({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: insertText
                },
                selection: { anchor: selection.from + insertText.length }
            });
            
            this.editor.dispatch(transaction);
            this.editor.focus();
            this.requestSave();
            new Notice(`已插入: ${insertText}`);
        });
    }

    private addEditorStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .tex-editor-container {
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            
            .tex-editor-toolbar {
                padding: 8px 12px;
                border-bottom: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                font-weight: 500;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .tex-editor-button-group {
                display: flex;
                gap: 4px;
            }
            
            .tex-editor-button {
                background: var(--interactive-normal);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.1s ease;
            }
            
            .tex-editor-button:hover {
                background: var(--interactive-hover);
            }
            
            .tex-editor-cm-container {
                flex: 1;
                overflow: auto;
                height: 100%;
            }
            
            .tex-editor-cm-container .cm-editor {
                height: 100%;
            }
            
            .tex-editor-cm-container .cm-scroller {
                font-family: var(--font-monospace);
                font-size: 14px;
                line-height: 1.5;
            }
            
            .tex-editor-cm-container .cm-content {
                padding: 12px;
            }
        `;
        document.head.appendChild(style);
        
        // 注册清理
        this.register(() => {
            document.head.removeChild(style);
        });
    }

    async onClose() {
        // 关闭时保存
        await this.save();
    }

    getViewData(): string {
        return this.editor ? this.editor.state.doc.toString() : this.data || "";
    }

    setViewData(data: string, clear: boolean): void {
        if (clear) {
            this.clear();
        }
        
        this.data = data;
        
        if (this.editor) {
            const transaction = this.editor.state.update({
                changes: { from: 0, to: this.editor.state.doc.length, insert: data }
            });
            this.editor.dispatch(transaction);
        }
    }

    clear(): void {
        this.data = "";
        if (this.editor) {
            const transaction = this.editor.state.update({
                changes: { from: 0, to: this.editor.state.doc.length, insert: "" }
            });
            this.editor.dispatch(transaction);
        }
    }
}
