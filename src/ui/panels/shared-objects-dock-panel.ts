import { AbstractCategorizedTreePanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuItem, ContextMenuManager } from "../context-menu.js";
import type { ModalDialogManager } from "../modal-dialog.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import {
    parseSharedObjectCategory,
    type SharedObjectCanvasSpec
} from "@nexustools/hacanvas";

/**
 * Project Shared Objects Dock Panel inheriting from `AbstractCategorizedTreePanel<SharedObjectCanvasSpec>`.
 * Supports:
 * - Categorization via slash-delimited names (`"UI/Icons/Star"`) and explicit `category` fields.
 * - Editing Shared Objects **In-Place on the Main Canvas** (darkening everything outside the instance) OR in an **Isolated Sub-Canvas Tab**.
 * - Instantiating `<ObjectRef>` references onto the Main Canvas or nested inside another Shared Object.
 * - Saving any Project Shared Object directly into the Global Reusable Library (`<osConfigDir>/library/`).
 */
export class SharedObjectsDockPanel extends AbstractCategorizedTreePanel<SharedObjectCanvasSpec> {
    public readonly panelId = "ha-shared-objects-panel";
    public readonly panelTitle = "Project Shared Objects";
    public readonly panelIcon = "🧩";
    private readonly modal: ModalDialogManager;
    private readonly onLibraryUpdated?: () => void;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal: ModalDialogManager,
        onLibraryUpdated?: () => void
    ) {
        super(containerEl, state, contextMenu);
        this.modal = modal;
        this.onLibraryUpdated = onLibraryUpdated;
    }

    protected override getHeaderActions(): DockActionButton[] {
        return [
            {
                id: "btn-create-shared-object",
                label: "+New Object",
                icon: "🧩",
                title: "Create New Shared Object (supports Category/Name paths like UI/Icons/Badge)",
                onClick: () => this.openCreateSharedObjectDialog()
            }
        ];
    }

    private getCategoryQuickChips(): Array<{ label: string; value: string }> {
        const defaults = ["UI/Badges", "UI/Icons", "UI/Buttons", "Sprites/Items", "Characters", "Props"];
        const existing = this.getItems()
            .map((it) => parseSharedObjectCategory(it.name, it.category).category)
            .filter(Boolean);
        const unique = Array.from(new Set([...existing, ...defaults]));
        return unique.map((cat) => ({ label: `📁 ${cat}`, value: cat }));
    }

    public openCreateSharedObjectDialog(defaultName = "UI/Badges/StarBadge", defaultCategory = "UI/Badges"): void {
        this.modal.openFormDialog({
            title: "Create New Shared Object Canvas",
            subtitle: "Create a reusable sub-canvas with its own Vector & Raster layers. Click a category folder chip below or type a slash path (like UI/Icons/Shield).",
            presets: [
                { label: "Icon (64×64)", icon: "🎯", values: { width: "64", height: "64" } },
                { label: "Badge (96×96)", icon: "🏅", values: { width: "96", height: "96" } },
                { label: "Tile (128×128)", icon: "⬛", values: { width: "128", height: "128" } },
                { label: "Button (160×56)", icon: "🔘", values: { width: "160", height: "56" } },
                { label: "Character (256×256)", icon: "🦸", values: { width: "256", height: "256" } }
            ],
            fields: [
                {
                    key: "name",
                    label: "Object Name (or Category/Name Path)",
                    description: "Tip: Using slashes like 'UI/Icons/Shield' automatically organizes it into nested folders.",
                    defaultValue: defaultName,
                    placeholder: "e.g. UI/Icons/Shield"
                },
                {
                    key: "category",
                    label: "Category Folder",
                    description: "Click an existing folder below or type a new category path:",
                    defaultValue: defaultCategory,
                    placeholder: "e.g. UI/Icons",
                    quickChips: this.getCategoryQuickChips()
                },
                {
                    key: "width",
                    label: "Sub-Canvas Width (px)",
                    type: "number",
                    min: 16,
                    max: 1024,
                    step: 8,
                    defaultValue: "96"
                },
                {
                    key: "height",
                    label: "Sub-Canvas Height (px)",
                    type: "number",
                    min: 16,
                    max: 1024,
                    step: 8,
                    defaultValue: "96"
                }
            ],
            submitLabel: "Create Shared Object",
            onSubmit: (vals) => {
                this.state.ensureCanvasOpen();
                const name = vals.name || "UI/Icons/NewObject";
                const parsed = parseSharedObjectCategory(name, vals.category || undefined);
                const w = Math.max(16, Number(vals.width) || 96);
                const h = Math.max(16, Number(vals.height) || 96);
                const created = this.state.engine.createSharedObject(this.state.canvasId, {
                    name: parsed.fullPath,
                    category: parsed.category,
                    width: w,
                    height: h
                });
                this.state.setStatus(`Created Shared Object "${created.name}" (${w}×${h}px) in category "${parsed.category}".`);
            }
        });
    }

    protected override getItems(): SharedObjectCanvasSpec[] {
        const cState = this.state.getCanvasState();
        return Object.values(cState.sharedObjects);
    }

    protected override getItemId(item: SharedObjectCanvasSpec): string {
        return item.id;
    }

    protected override getItemDimensions(item: SharedObjectCanvasSpec): { width: number; height: number } {
        return { width: item.width, height: item.height };
    }

    protected override getItemThumbnailBase64(item: SharedObjectCanvasSpec): string {
        try {
            return this.state.engine.renderSharedObjectThumbnailBase64(this.state.canvasId, item.id, 44);
        } catch {
            return "";
        }
    }

    protected override getItemBadges(item: SharedObjectCanvasSpec): string[] {
        const cState = this.state.getCanvasState();
        const refs = this.state.engine.countSharedObjectReferences(cState, item.id);
        const badges = [`${item.layers.length}L`, `${refs} ref${refs === 1 ? "" : "s"}`];
        if (this.state.activeSharedObjectId === item.id) {
            badges.push(this.state.editMode === "in_place" ? "IN-PLACE" : "TAB");
        }
        return badges;
    }

    protected override onItemPrimaryAction(item: SharedObjectCanvasSpec): void {
        // Clicking a shared object card enters In-Place editing on the main canvas by default
        this.state.enterInPlaceSharedObjectEdit(item.id);
    }

    protected override getEmptyStateText(): string {
        return "No Shared Objects in this project yet. Click '+New Object' or right-click any vector shape to convert or instantiate one.";
    }

    protected override getItemContextMenu(item: SharedObjectCanvasSpec): ContextMenuItem[] {
        const cState = this.state.getCanvasState();
        return [
            {
                label: "Edit In-Place on Main Canvas (Darken Outside)",
                icon: "🎯",
                action: () => this.state.enterInPlaceSharedObjectEdit(item.id)
            },
            {
                label: "Edit in Isolated Sub-Canvas Tab",
                icon: "🗂️",
                action: () => this.state.enterIsolatedTabSharedObjectEdit(item.id)
            },
            { divider: true },
            {
                label: "Place <ObjectRef> Instance on Active Canvas",
                icon: "➕",
                action: () => {
                    const targetSharedId =
                        this.state.activeSharedObjectId && this.state.activeSharedObjectId !== item.id
                            ? this.state.activeSharedObjectId
                            : undefined;
                    const vecLayer = this.state.resolveActiveLayer("vector");
                    const refObj = this.state.engine.instantiateObjectRef(this.state.canvasId, item.id, {
                        targetSharedObjectId: targetSharedId,
                        layerId: vecLayer?.id,
                        x: Math.round((cState.width - item.width) / 2),
                        y: Math.round((cState.height - item.height) / 2)
                    });
                    this.state.selectedObjectIds = [refObj.id];
                    this.state.setStatus(`Placed <ObjectRef> instance "${refObj.id}" -> "${item.name}".`);
                }
            },
            {
                label: "Rename / Change Category...",
                icon: "🏷️",
                action: () => {
                    const parsed = parseSharedObjectCategory(item.name, item.category);
                    this.modal.openFormDialog({
                        title: `Categorize & Rename "${parsed.displayName}"`,
                        subtitle: "Update the Shared Object's name or move it to a different category folder.",
                        fields: [
                            {
                                key: "name",
                                label: "Name or Slash Path (e.g. UI/Buttons/Primary)",
                                defaultValue: item.name
                            },
                            {
                                key: "category",
                                label: "Category Folder",
                                defaultValue: parsed.category,
                                quickChips: this.getCategoryQuickChips()
                            }
                        ],
                        submitLabel: "Save Category & Name",
                        onSubmit: (vals) => {
                            if (vals.name) {
                                this.state.engine.renameSharedObject(
                                    this.state.canvasId,
                                    item.id,
                                    vals.name,
                                    vals.category || undefined
                                );
                                this.state.setStatus(`Updated Shared Object to "${vals.name}" (${vals.category}).`);
                            }
                        }
                    });
                }
            },
            {
                label: "Duplicate Shared Object",
                icon: "📋",
                action: () => {
                    const copy = this.state.engine.duplicateSharedObject(this.state.canvasId, item.id);
                    this.state.setStatus(`Duplicated Shared Object as "${copy.name}".`);
                }
            },
            { divider: true },
            {
                label: "Save to Reusable Library (OS Config Dir)",
                icon: "📚",
                action: () => {
                    const entry = this.state.library.saveSharedObjectToLibrary(
                        this.state.engine,
                        this.state.canvasId,
                        item.id
                    );
                    if (this.onLibraryUpdated) this.onLibraryUpdated();
                    this.state.setStatus(`Saved "${entry.name}" to OS Library (${entry.filePath}).`);
                }
            },
            { divider: true },
            {
                label: `Ask AI to Customize "${item.name}"...`,
                icon: "🤖",
                action: () => {
                    this.state.askAi(
                        `Inspect Shared Object "${item.name}" (${item.id}) and enhance its vector/raster layers.`
                    );
                }
            },
            { divider: true },
            {
                label: "Delete Shared Object",
                icon: "🗑️",
                danger: true,
                action: () => {
                    if (this.state.activeSharedObjectId === item.id) {
                        this.state.exitSharedObjectEdit();
                    }
                    this.state.engine.deleteSharedObject(this.state.canvasId, item.id);
                    this.state.setStatus(`Deleted Shared Object "${item.name}".`);
                }
            }
        ];
    }
}
