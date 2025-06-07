// components/StopButton.ts

export interface StopButtonOptions {
    onClick: () => void;
    initialText?: string;
    className?: string;
}

export class StopButton {
    public el: HTMLButtonElement;

    constructor(parent: HTMLElement, options: StopButtonOptions) {
        this.el = parent.createEl("button", {
            text: options.initialText ?? "停止",
            cls: options.className ?? "stop-button",
        });
        this.el.addEventListener("click", options.onClick);
    }

    setText(text: string) {
        this.el.setText(text);
    }

    setEnabled(enabled: boolean) {
        this.el.disabled = !enabled;
    }
}