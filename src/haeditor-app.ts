import { AbstractUIComponent } from "./ui/abstract-ui-component.js";
import { ContextMenuManager } from "./ui/context-menu.js";
import { ModalDialogManager } from "./ui/modal-dialog.js";
import { EditorSessionState } from "./state/editor-state.js";
import { TopMenuBar, LeftToolbox } from "./ui/top-menu-and-toolbar.js";
import { CanvasViewport } from "./ui/canvas-viewport.js";
import { LayersDockPanel } from "./ui/panels/layers-dock-panel.js";
import { SharedObjectsDockPanel } from "./ui/panels/shared-objects-dock-panel.js";
import { LibraryDockPanel } from "./ui/panels/library-dock-panel.js";
import { FiltersDockPanel } from "./ui/panels/filters-dock-panel.js";
import { TimelineDockPanel } from "./ui/panels/timeline-dock-panel.js";
import { AiAssistantDockPanel } from "./ui/panels/ai-assistant-dock-panel.js";
import { EditorToolRegistry } from "./tools/abstract-editor-tool.js";

/**
 * Main NW.js GIMP + Inkscape Graphical Editor Application (`HaEditorApp extends AbstractUIComponent`).
 */
export class HaEditorApp extends AbstractUIComponent {
    public readonly state: EditorSessionState;
    public readonly contextMenu: ContextMenuManager;
    public readonly modal: ModalDialogManager;

    public topMenuBar!: TopMenuBar;
    public leftToolbox!: LeftToolbox;
    public viewport!: CanvasViewport;
    public aiAssistantPanel!: AiAssistantDockPanel;
    public sharedObjectsPanel!: SharedObjectsDockPanel;
    public libraryPanel!: LibraryDockPanel;
    public layersPanel!: LayersDockPanel;
    public filtersPanel!: FiltersDockPanel;
    public timelinePanel!: TimelineDockPanel;

    private statusBarEl!: HTMLElement;

    constructor(containerEl: HTMLElement, projectRoot: string = process.cwd(), configDir?: string) {
        super(containerEl);
        this.state = new EditorSessionState(projectRoot, configDir);
        this.contextMenu = new ContextMenuManager(this.doc.body);
        this.modal = new ModalDialogManager(this.doc.body);
        this.state.errorDialogHandler = (title, message, details) => {
            this.modal.openErrorDialog({ title, message, details });
        };

        // Start completely blank (no default image, no default shared objects, no open tabs)
        try {
            this.state.engine.deleteCanvas(this.state.canvasId);
        } catch {
            // Ignore cleanup errors
        }
        this.state.hasOpenCanvas = false;
        this.render();

        this.state.subscribe(() => {
            this.refreshAllPanels();
        });

        this.listen(this.win, "keydown", (e: KeyboardEvent) => {
            if (
                e.target &&
                ((e.target as HTMLElement).tagName === "INPUT" ||
                    (e.target as HTMLElement).tagName === "TEXTAREA" ||
                    (e.target as HTMLElement).tagName === "SELECT" ||
                    (e.target as HTMLElement).isContentEditable)
            ) {
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                const lower = e.key.toLowerCase();
                if (lower === "z") {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.state.redo();
                    } else {
                        this.state.undo();
                    }
                    return;
                }
                if (lower === "y") {
                    e.preventDefault();
                    this.state.redo();
                    return;
                }
                if (lower === "x") {
                    e.preventDefault();
                    this.state.cut();
                    return;
                }
                if (lower === "c") {
                    e.preventDefault();
                    this.state.copy(e.shiftKey);
                    return;
                }
                if (lower === "v") {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.state.paste("new_image");
                    } else if (e.altKey) {
                        this.state.paste("in_place");
                    } else {
                        this.state.paste("default");
                    }
                    return;
                }
                if (lower === "a") {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.state.engine.rasterSelection(this.state.canvasId, "clear");
                        this.state.selectedObjectIds = [];
                        this.state.setStatus("Cleared selection.");
                    } else {
                        const st = this.state.getCanvasState();
                        this.state.engine.rasterSelection(this.state.canvasId, "rect", {
                            x: 0,
                            y: 0,
                            width: st.width,
                            height: st.height
                        });
                        this.state.setStatus("Selected entire canvas.");
                    }
                    return;
                }
                if (lower === "i") {
                    e.preventDefault();
                    this.state.engine.rasterSelection(this.state.canvasId, "invert");
                    this.state.setStatus("Inverted raster selection.");
                    return;
                }
                if (e.key === ",") {
                    e.preventDefault();
                    this.state.fillWithColor(this.state.toolOptions.primaryColor, "Foreground Color");
                    return;
                }
                if (e.key === ".") {
                    e.preventDefault();
                    this.state.fillWithColor(this.state.toolOptions.secondaryColor, "Background Color");
                    return;
                }
                if (e.key === ";") {
                    e.preventDefault();
                    this.state.fillWithColor(this.state.toolOptions.primaryColor, "Pattern");
                    return;
                }
                if (lower === "d") {
                    e.preventDefault();
                    if (e.shiftKey) {
                        const activeLayer = this.state.resolveActiveLayer();
                        if (activeLayer) {
                            const dup = this.state.engine.manageLayer(this.state.canvasId, "duplicate", {
                                layerId: activeLayer.id,
                                sharedObjectId: this.state.activeSharedObjectId
                            });
                            if (dup) {
                                this.state.activeLayerId = dup.id;
                                this.state.setStatus(`Duplicated layer "${dup.name}".`);
                            }
                        }
                    } else {
                        const l = this.state.engine.newLayerFromVisible(this.state.canvasId, this.state.activeSharedObjectId);
                        this.state.activeLayerId = l.id;
                        this.state.setStatus("Duplicated visible image composite into a new layer.");
                    }
                    return;
                }
                if (lower === "m") {
                    e.preventDefault();
                    const merged = this.state.engine.mergeVisibleLayers(this.state.canvasId);
                    this.state.activeLayerId = merged.id;
                    this.state.setStatus(`Merged visible layers into "${merged.name}".`);
                    return;
                }
                if (lower === "f") {
                    e.preventDefault();
                    const last = this.state.lastFilterExecution;
                    if (last) {
                        const ras = this.state.resolveActiveLayer("raster");
                        this.state.engine.rasterFilter(
                            this.state.canvasId,
                            ras?.id,
                            last.options as any,
                            this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                            this.state.activeSharedObjectId
                        );
                        this.state.setStatus(`Repeated filter "${last.displayName}".`);
                    }
                    return;
                }
                if (lower === "n") {
                    e.preventDefault();
                    this.topMenuBar.openNewCanvasDialog();
                    return;
                }
                if (lower === "o") {
                    e.preventDefault();
                    if (e.altKey) {
                        this.topMenuBar.openFileDialogForMode("append_layers", "Open as Layers into Current Canvas");
                    } else {
                        this.topMenuBar.openFileDialogForMode("new_canvas");
                    }
                    return;
                }
                if (lower === "s") {
                    e.preventDefault();
                    this.topMenuBar.openSaveDialog(false);
                    return;
                }
                if (lower === "e") {
                    e.preventDefault();
                    this.topMenuBar.openExportDialog();
                    return;
                }
                if (lower === "w") {
                    e.preventDefault();
                    if (this.state.editMode === "isolated_tab" && this.state.activeSharedObjectId) {
                        this.state.closeSharedObjectTab(this.state.activeSharedObjectId);
                    } else if (this.state.hasOpenCanvas) {
                        this.state.closeMainCanvas();
                    }
                    return;
                }
            }
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                this.state.clearSelectionOrActive();
                return;
            }
            if (e.key === "F1") {
                e.preventDefault();
                this.topMenuBar.openKeyboardShortcutsDialog();
                return;
            }
            if (e.key === "Escape" && this.state.editMode !== "none") {
                this.state.exitSharedObjectEdit();
                return;
            }
            if (e.key === "+" || e.key === "=") {
                this.state.setZoom(this.state.zoom + 0.25);
                return;
            }
            if (e.key === "-") {
                this.state.setZoom(this.state.zoom - 0.25);
                return;
            }
            if (e.key === "1") {
                this.state.setZoom(1.0);
                return;
            }
            const upper = e.key.toUpperCase();
            if (upper === "X") {
                const tmp = this.state.toolOptions.primaryColor;
                this.state.toolOptions.primaryColor = this.state.toolOptions.secondaryColor;
                this.state.toolOptions.secondaryColor = tmp;
                this.state.setStatus("Swapped Foreground and Background colors.");
                return;
            }
            const contextTools = EditorToolRegistry.getToolsForContext(this.state.getActiveContextType());
            for (const tool of contextTools) {
                if (tool.shortcut === upper) {
                    this.state.activeToolId = tool.id;
                    this.state.setStatus(`Selected tool: ${tool.label} (${tool.shortcut}).`);
                    return;
                }
            }
        });
    }

    public override render(): void {
        this.containerEl.innerHTML = "";
        this.containerEl.className = "ha-editor-shell";
        this.containerEl.id = "ha-editor-shell";

        const topHost = this.createElement("header", "ha-shell-top");
        const workspaceRow = this.createElement("div", "ha-shell-workspace");
        const leftHost = this.createElement("aside", "ha-shell-left");
        const centerCol = this.createElement("main", "ha-shell-center");
        const viewportHost = this.createElement("div", "ha-shell-viewport-host");
        const timelineHost = this.createElement("div", "ha-shell-timeline-host");
        centerCol.append(viewportHost, timelineHost);

        const rightDock = this.createElement("aside", "ha-shell-right-dock", undefined, {
            id: "ha-right-dock"
        });
        const aiAssistantHost = this.createElement("div", "ha-dock-slot");
        const sharedObjectsHost = this.createElement("div", "ha-dock-slot");
        const libraryHost = this.createElement("div", "ha-dock-slot");
        const layersHost = this.createElement("div", "ha-dock-slot");
        const filtersHost = this.createElement("div", "ha-dock-slot");
        rightDock.append(aiAssistantHost, sharedObjectsHost, libraryHost, layersHost, filtersHost);

        workspaceRow.append(leftHost, centerCol, rightDock);

        this.statusBarEl = this.createElement("footer", "ha-status-bar", undefined, {
            id: "ha-status-bar"
        });

        this.containerEl.append(topHost, workspaceRow, this.statusBarEl);

        this.aiAssistantPanel = new AiAssistantDockPanel(
            aiAssistantHost,
            this.state,
            this.contextMenu,
            this.modal
        );
        this.state.askAiHandler = (promptText, autoSendMode) => {
            this.aiAssistantPanel.promptFromAction(promptText, autoSendMode);
        };
        this.sharedObjectsPanel = new SharedObjectsDockPanel(
            sharedObjectsHost,
            this.state,
            this.contextMenu,
            this.modal,
            () => this.libraryPanel.render()
        );
        this.libraryPanel = new LibraryDockPanel(libraryHost, this.state, this.contextMenu, this.modal);
        this.layersPanel = new LayersDockPanel(layersHost, this.state, this.contextMenu, this.modal);
        this.filtersPanel = new FiltersDockPanel(filtersHost, this.state, this.contextMenu);
        this.timelinePanel = new TimelineDockPanel(timelineHost, this.state, this.contextMenu);
        this.topMenuBar = new TopMenuBar(
            topHost,
            this.state,
            this.contextMenu,
            this.modal,
            () => this.sharedObjectsPanel.openCreateSharedObjectDialog(),
            () => this.aiAssistantPanel.openLmStudioSettingsDialog(),
            () => this.aiAssistantPanel.openToolsCatalogDialog()
        );
        this.viewport = new CanvasViewport(
            viewportHost,
            this.state,
            this.contextMenu,
            this.modal,
            () => this.topMenuBar.openNewCanvasDialog(),
            () => this.topMenuBar.openFileDialogForMode("new_canvas")
        );
        this.leftToolbox = new LeftToolbox(leftHost, this.state);

        this.refreshAllPanels();
    }

    public refreshAllPanels(): void {
        this.topMenuBar.render();
        this.leftToolbox.render();
        this.viewport.refreshViewport();
        this.aiAssistantPanel.render();
        this.sharedObjectsPanel.render();
        this.libraryPanel.render();
        this.layersPanel.render();
        this.filtersPanel.render();
        this.timelinePanel.render();
        this.renderStatusBar();
    }

    private renderStatusBar(): void {
        if (!this.state.hasOpenCanvas) {
            this.statusBarEl.innerHTML = `
                <span class="ha-status-msg">${this.state.statusMessage}</span>
                <span class="ha-status-meta">🎨 NO DOCUMENT OPEN • Library: ${this.state.library.listEntries().length} • OS Config: ${this.state.configManager.getConfigDir()}</span>
            `;
            return;
        }
        const cState = this.state.getCanvasState();
        const modeLabel =
            this.state.editMode === "in_place"
                ? `🎯 IN-PLACE SHARED OBJECT (${this.state.activeSharedObjectId})`
                : this.state.editMode === "isolated_tab"
                  ? `🗂️ ISOLATED TAB (${this.state.activeSharedObjectId})`
                  : "🎨 MAIN CANVAS";
        this.statusBarEl.innerHTML = `
            <span class="ha-status-msg">${this.state.statusMessage}</span>
            <span class="ha-status-meta">${modeLabel} • ${cState.width}×${cState.height}px • Shared Objects: ${Object.keys(cState.sharedObjects).length} • Library: ${this.state.library.listEntries().length} • OS Config: ${this.state.configManager.getConfigDir()}</span>
        `;
    }
}

declare global {
    interface Window {
        haEditorApp?: HaEditorApp;
    }
}

export function bootstrapHaEditor(win?: Window, projectRoot?: string, configDir?: string): HaEditorApp {
    const targetWin = win || (typeof window !== "undefined" ? window : undefined);
    if (targetWin) {
        AbstractUIComponent.setWindow(targetWin);
    }
    const targetDoc = targetWin ? targetWin.document : document;
    const root = targetDoc.getElementById("app-root") || targetDoc.body;
    const app = new HaEditorApp(root, projectRoot || process.cwd(), configDir);
    if (targetWin) {
        (targetWin as any).haEditorApp = app;
    }
    if (typeof window !== "undefined") {
        window.haEditorApp = app;
    }
    return app;
}

export function startHaEditorApp(win?: Window, projectRoot?: string, configDir?: string): HaEditorApp {
    return bootstrapHaEditor(win, projectRoot, configDir);
}
