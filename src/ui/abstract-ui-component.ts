/**
 * Abstract parent class for all UI components in `workspace/haeditor`.
 * Provides shared DOM element creation, NW.js `<webview>` window/document isolation,
 * managed event listeners with automatic disposal, visibility controls, and template rendering lifecycle hooks.
 */
export abstract class AbstractUIComponent {
    public static activeWindow: Window | undefined;
    public static activeDocument: Document | undefined;

    public static setWindow(win: Window): void {
        AbstractUIComponent.activeWindow = win;
        AbstractUIComponent.activeDocument = win.document;
    }

    protected readonly containerEl: HTMLElement;
    private readonly registeredListeners: Array<{
        target: EventTarget;
        type: string;
        listener: EventListenerOrEventListenerObject;
        options?: boolean | AddEventListenerOptions;
    }> = [];

    constructor(containerEl: HTMLElement) {
        this.containerEl = containerEl;
    }

    protected get doc(): Document {
        return (
            this.containerEl?.ownerDocument ||
            AbstractUIComponent.activeDocument ||
            document
        );
    }

    protected get win(): Window {
        return (
            this.doc.defaultView ||
            AbstractUIComponent.activeWindow ||
            window
        );
    }

    protected createElement<K extends keyof HTMLElementTagNameMap>(
        tagName: K,
        className?: string,
        innerHTML?: string,
        attrs?: Record<string, string>
    ): HTMLElementTagNameMap[K] {
        const el = this.doc.createElement(tagName);
        if (className) el.className = className;
        if (innerHTML !== undefined) el.innerHTML = innerHTML;
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                el.setAttribute(k, v);
            }
        }
        return el;
    }

    protected listen<K extends keyof HTMLElementEventMap>(
        target: EventTarget,
        type: K | string,
        listener: (ev: any) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        target.addEventListener(type, listener as EventListener, options);
        this.registeredListeners.push({
            target,
            type: String(type),
            listener: listener as EventListener,
            options
        });
    }

    public show(): void {
        this.containerEl.classList.remove("ha-hidden");
    }

    public hide(): void {
        this.containerEl.classList.add("ha-hidden");
    }

    public toggle(force?: boolean): void {
        if (force !== undefined) {
            this.containerEl.classList.toggle("ha-hidden", !force);
        } else {
            this.containerEl.classList.toggle("ha-hidden");
        }
    }

    public dispose(): void {
        for (const item of this.registeredListeners) {
            item.target.removeEventListener(item.type, item.listener, item.options);
        }
        this.registeredListeners.length = 0;
    }

    public abstract render(): void;

    public refresh(): void {
        this.render();
    }
}
