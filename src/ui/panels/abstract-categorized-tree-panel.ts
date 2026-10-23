import {
    buildCategoryTree,
    parseSharedObjectCategory,
    type CategoryTreeNode
} from "@nexustools/hacanvas";
import type { ContextMenuItem } from "../context-menu.js";
import { AbstractDockPanel } from "./abstract-dock-panel.js";

/**
 * Shared abstract parent class for panels that display categorized items in a collapsible folder tree
 * (such as `SharedObjectsDockPanel` and `LibraryDockPanel`).
 * Supports both slash-delimited category paths (`"UI/Icons/Star"`) and explicit `category` fields,
 * search filtering, thumbnail rendering, and custom right-click context menus.
 */
export abstract class AbstractCategorizedTreePanel<
    T extends { name: string; category?: string }
> extends AbstractDockPanel {
    protected searchQuery = "";

    protected abstract getItems(): T[];
    protected abstract getItemId(item: T): string;
    protected abstract getItemDimensions(item: T): { width: number; height: number };
    protected abstract getItemThumbnailBase64(item: T): string;
    protected abstract getItemBadges(item: T): string[];
    protected abstract getItemContextMenu(item: T): ContextMenuItem[];
    protected abstract onItemPrimaryAction(item: T): void;
    protected abstract getEmptyStateText(): string;

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        const searchBar = this.createElement("div", "ha-tree-search-row");
        const input = this.createElement("input", "ha-input ha-tree-search-input", undefined, {
            type: "text",
            placeholder: "Filter by name or category (e.g. UI/Icons)...",
            value: this.searchQuery
        });
        input.addEventListener("input", () => {
            this.searchQuery = input.value;
            this.renderTreeContainer(treeContainer);
        });
        searchBar.appendChild(input);
        bodyEl.appendChild(searchBar);

        const treeContainer = this.createElement("div", "ha-category-tree-container");
        this.renderTreeContainer(treeContainer);
        bodyEl.appendChild(treeContainer);
    }

    private renderTreeContainer(treeContainer: HTMLElement): void {
        treeContainer.innerHTML = "";
        const allItems = this.getItems();
        const q = this.searchQuery.trim().toLowerCase();
        const filtered = q
            ? allItems.filter(it => {
                  const parsed = parseSharedObjectCategory(it.name, it.category);
                  return (
                      parsed.fullPath.toLowerCase().includes(q) ||
                      parsed.category.toLowerCase().includes(q) ||
                      parsed.displayName.toLowerCase().includes(q)
                  );
              })
            : allItems;

        if (filtered.length === 0) {
            const emptyEl = this.createElement("div", "ha-empty-hint", this.getEmptyStateText());
            treeContainer.appendChild(emptyEl);
            return;
        }

        const treeRoot = buildCategoryTree(filtered);
        const collapsedSet = new Set(this.state.configManager.getConfig().collapsedCategories);

        for (const folderNode of Object.values(treeRoot.folders)) {
            treeContainer.appendChild(this.renderFolderNode(folderNode, 0, collapsedSet));
        }
        for (const item of treeRoot.items) {
            treeContainer.appendChild(this.renderItemCard(item));
        }
    }

    private renderFolderNode(
        node: CategoryTreeNode<T>,
        depth: number,
        collapsedSet: Set<string>
    ): HTMLElement {
        const wrapper = this.createElement("div", "ha-category-folder-group");
        const folderKey = `${this.panelId}:${node.fullPath}`;
        const isCollapsed = collapsedSet.has(folderKey);

        const folderHeader = this.createElement("div", "ha-category-folder-header");
        folderHeader.style.paddingLeft = `${8 + depth * 12}px`;

        const totalInFolder = this.countItemsRecursive(node);
        folderHeader.innerHTML = `
            <span class="ha-folder-caret">${isCollapsed ? "▸" : "▾"}</span>
            <span class="ha-folder-icon">📁</span>
            <span class="ha-folder-name">${node.name}</span>
            <span class="ha-folder-count">${totalInFolder}</span>
        `;

        folderHeader.addEventListener("click", () => {
            const cfg = this.state.configManager.getConfig();
            const list = new Set(cfg.collapsedCategories);
            if (list.has(folderKey)) list.delete(folderKey);
            else list.add(folderKey);
            this.state.configManager.updateConfig({ collapsedCategories: Array.from(list) });
            this.render();
        });

        wrapper.appendChild(folderHeader);

        if (!isCollapsed) {
            const childrenBox = this.createElement("div", "ha-category-folder-children");
            for (const subFolder of Object.values(node.folders)) {
                childrenBox.appendChild(this.renderFolderNode(subFolder, depth + 1, collapsedSet));
            }
            for (const item of node.items) {
                childrenBox.appendChild(this.renderItemCard(item));
            }
            wrapper.appendChild(childrenBox);
        }

        return wrapper;
    }

    private countItemsRecursive(node: CategoryTreeNode<T>): number {
        let count = node.items.length;
        for (const sub of Object.values(node.folders)) {
            count += this.countItemsRecursive(sub);
        }
        return count;
    }

    protected renderItemCard(item: T): HTMLElement {
        const id = this.getItemId(item);
        const parsed = parseSharedObjectCategory(item.name, item.category);
        const dims = this.getItemDimensions(item);
        const thumbB64 = this.getItemThumbnailBase64(item);
        const badges = this.getItemBadges(item);
        const isActive = this.state.activeSharedObjectId === id;

        const card = this.createElement(
            "div",
            `ha-shared-obj-card ${isActive ? "active" : ""}`,
            undefined,
            { "data-object-id": id }
        );

        const thumbBox = this.createElement("div", "ha-shared-obj-thumb");
        if (thumbB64) {
            const img = this.createElement("img", "ha-shared-obj-img", undefined, {
                src: `data:image/png;base64,${thumbB64}`,
                alt: parsed.displayName
            });
            thumbBox.appendChild(img);
        }

        const metaBox = this.createElement("div", "ha-shared-obj-meta");
        const titleRow = this.createElement("div", "ha-shared-obj-title", parsed.displayName);
        const subRow = this.createElement(
            "div",
            "ha-shared-obj-sub",
            `${parsed.category} • ${dims.width}×${dims.height}px`
        );
        metaBox.append(titleRow, subRow);

        if (badges.length > 0) {
            const badgeRow = this.createElement("div", "ha-shared-obj-badges");
            for (const b of badges) {
                badgeRow.appendChild(this.createElement("span", "ha-badge", b));
            }
            metaBox.appendChild(badgeRow);
        }

        const menuBtn = this.createElement("button", "ha-icon-btn ha-card-menu-btn", "⋮", {
            title: "Actions (Right-click anywhere on card)",
            type: "button"
        });
        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.contextMenu.openMenu(e.clientX, e.clientY, this.getItemContextMenu(item));
        });

        card.append(thumbBox, metaBox, menuBtn);

        card.addEventListener("click", () => this.onItemPrimaryAction(item));
        card.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.contextMenu.openMenu(e.clientX, e.clientY, this.getItemContextMenu(item));
        });

        return card;
    }
}

