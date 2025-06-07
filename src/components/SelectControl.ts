interface SelectControlOptions {
    label: string;
    options: Array<{ value: string; text: string }>;
    defaultValue?: string;
    onChange?: (value: string) => void;
}

export class SelectControl {
    private element: HTMLDivElement;
    private selectElement: HTMLSelectElement;
    private currentValue: string;

    constructor(private options: SelectControlOptions) {
        this.currentValue = options.defaultValue || '';
        this.element = document.createElement('div');
        this.element.className = 'select-control';

        const label = document.createElement('label');
        label.textContent = options.label;
        this.element.appendChild(label);

        this.selectElement = document.createElement('select');
        options.options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            this.selectElement.appendChild(optionElement);
        });

        this.selectElement.value = this.currentValue;
        this.selectElement.addEventListener('change', () => {
            this.currentValue = this.selectElement.value;
            if (this.options.onChange) {
                this.options.onChange(this.currentValue);
            }
        });

        this.element.appendChild(this.selectElement);
    }

    getValue(): string {
        return this.currentValue;
    }

    render(): HTMLElement {
        return this.element;
    }
}
