import { AbstractUIComponent } from "./abstract-ui-component.js";

export interface ContextMenuItem {
    id?: string;
    label?: string;
    icon?: string;
    shortcut?: string;
    checked?: boolean;
    divider?: boolean;
    disabled?: boolean;
    danger?: boolean;
    children?: ContextMenuItem[];
    action?: () => void;
}

/**
 * Custom GIMP-styled context & menubar dropdown manager.
 * Supports multi-level nested submenus, hover auto-switching, and anchor tracking.
 * Inherits DOM helpers and event lifecycle management from `AbstractUIComponent`.
 */
export class ContextMenuManager extends AbstractUIComponent {
    private activeMenuEl: HTMLElement | null = null;
    private activeAnchorId: string | null = null;
    private activeAnchorEl: HTMLElement | null = null;

    constructor(containerEl?: HTMLElement) {
        super(containerEl || (AbstractUIComponent.activeDocument?.body ?? document.body));
        this.render();
    }

    public override render(): void {
        this.listen(this.win, "mousedown", (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (
                this.activeMenuEl &&
                target &&
                !this.activeMenuEl.contains(target) &&
                (!this.activeAnchorEl || !this.activeAnchorEl.contains(target))
            ) {
                this.closeMenu();
            }
        });
        this.listen(this.win, "keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.closeMenu();
            }
        });
        this.listen(this.win, "resize", () => this.closeMenu());
    }

    public isOpen(): boolean {
        return this.activeMenuEl !== null;
    }

    public getActiveAnchorId(): string | null {
        return this.activeAnchorId;
    }

    public openMenu(
        clientX: number,
        clientY: number,
        items: ContextMenuItem[],
        anchorId?: string,
        anchorEl?: HTMLElement
    ): void {
        this.closeMenu();
        const menuEl = this.buildMenuListElement(items, false);
        if (anchorId) {
            menuEl.setAttribute("data-anchor-id", anchorId);
        }
        this.containerEl.appendChild(menuEl);
        this.activeMenuEl = menuEl;
        this.activeAnchorId = anchorId || null;
        this.activeAnchorEl = anchorEl || null;
        if (this.activeAnchorEl) {
            this.activeAnchorEl.classList.add("active-menu-open");
        }

        const rect = menuEl.getBoundingClientRect();
        const maxX = Math.max(8, this.win.innerWidth - rect.width - 8);
        const maxY = Math.max(8, this.win.innerHeight - rect.height - 8);
        menuEl.style.left = `${Math.min(clientX, maxX)}px`;
        menuEl.style.top = `${Math.min(clientY, maxY)}px`;
    }

    private buildMenuListElement(items: ContextMenuItem[], isSubmenu: boolean): HTMLElement {
        const menuEl = this.createElement(
            "div",
            `ha-context-menu ${isSubmenu ? "ha-context-submenu" : ""}`
        );

        let currentOpenSubmenu: HTMLElement | null = null;
        let currentOpenRow: HTMLElement | null = null;

        const closeChildSubmenu = () => {
            if (currentOpenSubmenu) {
                currentOpenSubmenu.remove();
                currentOpenSubmenu = null;
            }
            if (currentOpenRow) {
                currentOpenRow.classList.remove("submenu-open");
                currentOpenRow = null;
            }
        };

        for (const item of items) {
            if (item.divider) {
                const div = this.createElement("div", "ha-context-menu-divider");
                menuEl.appendChild(div);
                continue;
            }

            const row = this.createElement(
                "div",
                `ha-context-menu-item ${item.disabled ? "disabled" : ""} ${item.danger ? "danger" : ""}`,
                undefined,
                item.id ? { id: item.id } : undefined
            );

            const leftSpan = this.createElement("span", "ha-context-menu-left");
            const iconText =
                typeof item.checked === "boolean"
                    ? item.checked
                        ? "☑"
                        : "☐"
                    : item.icon || "•";
            const iconSpan = this.createElement("span", "ha-context-menu-icon", iconText);
            const labelSpan = this.createElement("span", "ha-context-menu-label", item.label || "");
            leftSpan.append(iconSpan, labelSpan);
            row.appendChild(leftSpan);

            const hasChildren = Boolean(item.children && item.children.length > 0);
            if (hasChildren) {
                const arrowSpan = this.createElement("span", "ha-context-menu-shortcut", "▸");
                row.appendChild(arrowSpan);
            } else if (item.shortcut) {
                const shortSpan = this.createElement("span", "ha-context-menu-shortcut", item.shortcut);
                row.appendChild(shortSpan);
            }

            const handleHover = (ev: MouseEvent) => {
                ev.stopPropagation();
                if (currentOpenRow === row && currentOpenSubmenu) {
                    return;
                }
                closeChildSubmenu();
                if (hasChildren && !item.disabled) {
                    const subEl = this.buildMenuListElement(item.children!, true);
                    row.appendChild(subEl);
                    row.classList.add("submenu-open");
                    currentOpenSubmenu = subEl;
                    currentOpenRow = row;

                    // Keep submenu within viewport bounds
                    const subRect = subEl.getBoundingClientRect();
                    if (subRect.right > this.win.innerWidth - 8) {
                        subEl.style.left = "auto";
                        subEl.style.right = "calc(100% - 2px)";
                    }
                    if (subRect.bottom > this.win.innerHeight - 8) {
                        const shiftUp = Math.min(subRect.top - 8, subRect.bottom - (this.win.innerHeight - 8));
                        if (shiftUp > 0) {
                            subEl.style.top = `${-shiftUp}px`;
                        }
                    }
                }
            };

            row.addEventListener("mouseenter", handleHover);
            row.addEventListener("mouseover", (ev) => {
                // Only trigger if mouseover originated directly on this row or its direct label/icon children (not from inside its nested submenu)
                if (currentOpenSubmenu && currentOpenSubmenu.contains(ev.target as Node)) {
                    return;
                }
                handleHover(ev);
            });

            row.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (item.disabled) return;
                if (hasChildren) {
                    if (currentOpenRow !== row || !currentOpenSubmenu) {
                        handleHover(ev);
                    }
                    return;
                }
                this.closeMenu();
                if (item.action) {
                    item.action();
                }
            });

            menuEl.appendChild(row);
        }

        return menuEl;
    }

    public closeMenu(): void {
        if (this.activeAnchorEl) {
            this.activeAnchorEl.classList.remove("active-menu-open");
            this.activeAnchorEl = null;
        }
        this.activeAnchorId = null;
        if (this.activeMenuEl) {
            this.activeMenuEl.remove();
            this.activeMenuEl = null;
        }
    }
}
