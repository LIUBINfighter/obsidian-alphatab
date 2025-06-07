interface ToggleButtonOptions {
    text: string;
    active?: boolean;
    onClick?: (active: boolean) => void;
}

export class ToggleButton {
    private element: HTMLButtonElement;
    private active: boolean;
    private onClick?: (active: boolean) => void;

    constructor(options: ToggleButtonOptions) {
        this.active = options.active || false;
        this.onClick = options.onClick;

        this.element = document.createElement('button');
        this.element.textContent = options.text;
        this.element.addEventListener('click', this.handleClick.bind(this));
        this.updateStyle();
    }

    private handleClick() {
        this.active = !this.active;
        this.updateStyle();
        if (this.onClick) {
            this.onClick(this.active);
        }
    }

    private updateStyle() {
        this.element.style.backgroundColor = this.active
            ? 'var(--interactive-accent)'
            : 'var(--background-modifier-form-field)';
        this.element.style.color = this.active
            ? 'var(--text-on-accent)'
            : 'var(--text-normal)';
    }

    public setActive(active: boolean): void {
        this.active = active;
        this.updateStyle();
    }

    public isActive(): boolean {
        return this.active;
    }

    public getElement(): HTMLButtonElement {
        return this.element;
    }
}
