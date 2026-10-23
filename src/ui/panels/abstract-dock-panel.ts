import { AbstractUIComponent } from "../abstract-ui-component.js";
import { ContextMenuManager, type ContextMenuItem } from "../context-menu.js";
import type { EditorSessionState } from "../../state/editor-state.js";

export interface DockActionButton {
    id: string;
    label: string;
    icon: string;
    title: string;
    onClick: () => void;
}

/**
 * Abstract parent class for all GIMP-style dockable panels in `workspace/haeditor`.
 * Shares header rendering, action button toolbars, collapsible panel state, and body container lifecycle.
 */
export abstract class AbstractDockPanel extends AbstractUIComponent {
    protected readonly state: EditorSessionState;
    protected readonly contextMenu: ContextMenuManager;
    public abstract readonly panelId: string;
    public abstract readonly panelTitle: string;
    public abstract readonly panelIcon: string;
    protected bodyEl!: HTMLElement;
    protected isCollapsed = false;

    constructor(containerEl: HTMLElement, state: EditorSessionState, contextMenu: ContextMenuManager) {
        super(containerEl);
        this.state = state;
        this.contextMenu = contextMenu;
    }

    protected abstract getHeaderActions(): DockActionButton[];
    protected abstract renderPanelBody(bodyEl: HTMLElement): void;

    public override render(): void {
        this.containerEl.innerHTML = "";
        this.containerEl.className = `ha-dock-panel ${this.isCollapsed ? "collapsed" : ""}`;
        this.containerEl.id = this.panelId;

        const headerEl = this.createElement("div", "ha-dock-header");
        const titleLeft = this.createElement("div", "ha-dock-title");
        const collapseIcon = this.createElement("span", "ha-dock-collapse-arrow", this.isCollapsed ? "▸" : "▾");
        const iconSpan = this.createElement("span", "ha-dock-icon", this.panelIcon);
        const labelSpan = this.createElement("span", "ha-dock-label", this.getDynamicTitle());
        titleLeft.append(collapseIcon, iconSpan, labelSpan);

        titleLeft.addEventListener("click", () => {
            this.isCollapsed = !this.isCollapsed;
            this.render();
        });

        const actionsBar = this.createElement("div", "ha-dock-actions");
        for (const act of this.getHeaderActions()) {
            const btn = this.createElement("button", "ha-dock-btn", `${act.icon} ${act.label}`.trim(), {
                id: act.id,
                title: act.title,
                type: "button"
            });
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                act.onClick();
            });
            actionsBar.appendChild(btn);
        }

        headerEl.append(titleLeft, actionsBar);
        this.containerEl.appendChild(headerEl);

        this.bodyEl = this.createElement("div", "ha-dock-body");
        if (!this.isCollapsed) {
            this.renderPanelBody(this.bodyEl);
        }
        this.containerEl.appendChild(this.bodyEl);
    }

    protected getDynamicTitle(): string {
        return this.panelTitle;
    }
}


export { AbstractCategorizedTreePanel } from "./abstract-categorized-tree-panel.js";
export type { ContextMenuItem };
