import { AbstractCategorizedTreePanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuItem, ContextMenuManager } from "../context-menu.js";
import type { ModalDialogManager } from "../modal-dialog.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import {
    parseSharedObjectCategory,
    type LibraryObjectEntry
} from "@nexustools/hacanvas";

/**
 * Global Reusable Shared Object Library Dock Panel inheriting from `AbstractCategorizedTreePanel<LibraryObjectEntry>`.
 * Persists reusable `.hacanvas` shared object packages inside `<osConfigDir>/library/` for use across future projects.
 */
export class LibraryDockPanel extends AbstractCategorizedTreePanel<LibraryObjectEntry> {
    public readonly panelId = "ha-library-panel";
    public readonly panelTitle = "Reusable Object Library";
    public readonly panelIcon = "📚";
    private readonly modal: ModalDialogManager;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal: ModalDialogManager
    ) {
        super(containerEl, state, contextMenu);
        this.modal = modal;
    }

    protected override getHeaderActions(): DockActionButton[] {
        return [
            {
                id: "btn-save-active-to-library",
                label: "+Save Active",
                icon: "💾",
                title: "Save Active or First Project Shared Object to Global Library",
                onClick: () => this.saveCurrentProjectObjectToLibrary()
            }
        ];
    }

    private saveCurrentProjectObjectToLibrary(): void {
        const cState = this.state.getCanvasState();
        const targetId =
            this.state.activeSharedObjectId || Object.keys(cState.sharedObjects)[0];
        if (!targetId) {
            this.state.setStatus("Create a Shared Object first before saving to the Library.");
            return;
        }
        const entry = this.state.library.saveSharedObjectToLibrary(
            this.state.engine,
            this.state.canvasId,
            targetId
        );
        this.state.setStatus(`Saved "${entry.name}" to Global Reusable Library.`);
    }

    protected override getItems(): LibraryObjectEntry[] {
        return this.state.library.listEntries();
    }

    protected override getItemId(item: LibraryObjectEntry): string {
        return item.id;
    }

    protected override getItemDimensions(item: LibraryObjectEntry): { width: number; height: number } {
        return { width: item.width, height: item.height };
    }

    protected override getItemThumbnailBase64(item: LibraryObjectEntry): string {
        return item.thumbnailBase64 || "";
    }

    protected override getItemBadges(_item: LibraryObjectEntry): string[] {
        return ["LIBRARY"];
    }

    protected override onItemPrimaryAction(item: LibraryObjectEntry): void {
        // Primary click imports the library object into the current project and places an instance on the canvas
        const res = this.state.library.importIntoProject(
            item.id,
            this.state.engine,
            this.state.canvasId,
            { instantiateOnMainCanvas: true }
        );
        if (res.refObject) {
            this.state.selectedObjectIds = [res.refObject.id];
        }
        this.state.setStatus(`Imported "${item.name}" from Library into project and placed instance.`);
    }

    protected override getEmptyStateText(): string {
        return `Library is empty (${this.state.library.getLibraryDir()}). Right-click any Project Shared Object and choose "Save to Reusable Library".`;
    }

    protected override getItemContextMenu(item: LibraryObjectEntry): ContextMenuItem[] {
        return [
            {
                label: "Import into Project & Place on Canvas",
                icon: "📥",
                action: () => this.onItemPrimaryAction(item)
            },
            {
                label: "Import into Project Shared Objects Only",
                icon: "🧩",
                action: () => {
                    const res = this.state.library.importIntoProject(
                        item.id,
                        this.state.engine,
                        this.state.canvasId,
                        { instantiateOnMainCanvas: false }
                    );
                    this.state.setStatus(`Imported "${res.sharedObject.name}" into Project Shared Objects.`);
                }
            },
            {
                label: "Rename / Categorize in Library...",
                icon: "🏷️",
                action: () => {
                    const parsed = parseSharedObjectCategory(item.name, item.category);
                    this.modal.openFormDialog({
                        title: `Recategorize Library Object "${parsed.displayName}"`,
                        fields: [
                            { key: "name", label: "Name / Slash Path", defaultValue: item.name },
                            { key: "category", label: "Category Folder", defaultValue: parsed.category }
                        ],
                        submitLabel: "Update Library Entry",
                        onSubmit: (vals) => {
                            if (vals.name) {
                                this.state.library.renameLibraryEntry(item.id, vals.name, vals.category || undefined);
                                this.state.setStatus(`Updated Library Object "${vals.name}".`);
                            }
                        }
                    });
                }
            },
            { divider: true },
            {
                label: "Delete from Library",
                icon: "🗑️",
                danger: true,
                action: () => {
                    this.state.library.deleteLibraryEntry(item.id);
                    this.state.setStatus(`Removed "${item.name}" from Library.`);
                }
            }
        ];
    }
}
