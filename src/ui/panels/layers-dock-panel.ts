import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuItem } from "../context-menu.js";
import type { ModalDialogManager } from "../modal-dialog.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import type { ContextMenuManager } from "../context-menu.js";
import type { ArtBlendMode, ArtLayerSpec } from "@nexustools/hacanvas";

const BLEND_MODES: ArtBlendMode[] = [
    "normal",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "addition",
    "difference"
];

/**
 * GIMP-style Layers Dock Panel inheriting from `AbstractDockPanel`.
 * Displays layers for either the Main Canvas or the currently active Shared Object (In-Place or Isolated Tab).
 */
export class LayersDockPanel extends AbstractDockPanel {
    public readonly panelId = "ha-layers-panel";
    public readonly panelTitle = "Layers & Blend Modes";
    public readonly panelIcon = "🗂️";
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

    protected override getDynamicTitle(): string {
        const sharedSpec = this.state.getActiveSharedObjectSpec();
        if (sharedSpec) {
            return `Layers (${sharedSpec.name})`;
        }
        return this.panelTitle;
    }

    protected override getHeaderActions(): DockActionButton[] {
        const cState = this.state.getCanvasState();
        const previewOn = cState.previewDynamicFilters !== false;
        return [
            {
                id: "btn-toggle-canvas-filters-preview",
                label: previewOn ? "FX:On" : "FX:Off",
                icon: "✨",
                title: "Toggle Dynamic Filters Preview On/Off (Exporting always renders attached filters)",
                onClick: () => {
                    this.state.ensureCanvasOpen();
                    const next = this.state.engine.setTargetFiltersEnabled(this.state.canvasId, {
                        targetType: "canvas"
                    });
                    this.state.setStatus(
                        next
                            ? "Dynamic Filters Preview enabled in viewport."
                            : "Dynamic Filters Preview paused in viewport (exporting will still render attached filters)."
                    );
                }
            },
            {
                id: "btn-add-vector-layer",
                label: "+Vec",
                icon: "✒️",
                title: "Add Vector Layer (Inkscape/SVG)",
                onClick: () => this.addLayer("vector")
            },
            {
                id: "btn-add-raster-layer",
                label: "+Ras",
                icon: "🖌️",
                title: "Add Raster Layer (GIMP Pixel)",
                onClick: () => this.addLayer("raster")
            }
        ];
    }

    private addLayer(type: "vector" | "raster"): void {
        this.state.ensureCanvasOpen();
        const layers = this.state.getActiveContainerLayers();
        const name = `${type === "vector" ? "Vector" : "Raster"} Layer ${layers.length + 1}`;
        const created = this.state.engine.manageLayer(this.state.canvasId, "add", {
            sharedObjectId: this.state.activeSharedObjectId,
            layerName: name,
            layerType: type
        }) as ArtLayerSpec;
        this.state.activeLayerId = created.id;
        this.state.setStatus(`Added ${type} layer "${created.name}".`);
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        const layers = this.state.getActiveContainerLayers();
        const activeLayer = this.state.resolveActiveLayer();

        if (activeLayer) {
            const controlsRow = this.createElement("div", "ha-layer-controls-bar");

            const blendSelect = this.createElement("select", "ha-select ha-layer-blend-select", undefined, {
                id: "layer-blend-mode-select",
                title: "Layer Blend Mode"
            });
            for (const mode of BLEND_MODES) {
                const opt = this.createElement("option", undefined, mode.toUpperCase(), { value: mode });
                if (activeLayer.blendMode === mode) opt.selected = true;
                blendSelect.appendChild(opt);
            }
            blendSelect.addEventListener("change", () => {
                this.state.engine.manageLayer(this.state.canvasId, "set_blend_mode", {
                    sharedObjectId: this.state.activeSharedObjectId,
                    layerId: activeLayer.id,
                    blendMode: blendSelect.value as ArtBlendMode
                });
                this.state.setStatus(`Set "${activeLayer.name}" blend mode to ${blendSelect.value}.`);
            });

            const opacityInput = this.createElement("input", "ha-range ha-layer-opacity-range", undefined, {
                id: "layer-opacity-range",
                type: "range",
                min: "0",
                max: "100",
                value: String(Math.round(activeLayer.opacity * 100)),
                title: `Opacity: ${Math.round(activeLayer.opacity * 100)}%`
            });
            opacityInput.addEventListener("change", () => {
                const val = Number(opacityInput.value) / 100;
                this.state.engine.manageLayer(this.state.canvasId, "set_opacity", {
                    sharedObjectId: this.state.activeSharedObjectId,
                    layerId: activeLayer.id,
                    opacity: val
                });
                this.state.setStatus(`Set "${activeLayer.name}" opacity to ${Math.round(val * 100)}%.`);
            });

            controlsRow.append(blendSelect, opacityInput);
            bodyEl.appendChild(controlsRow);
        }

        const listEl = this.createElement("div", "ha-layers-list", undefined, { id: "ha-layers-list" });
        if (layers.length === 0) {
            listEl.appendChild(
                this.createElement(
                    "div",
                    "ha-empty-state",
                    "No layers — Click 'New' or 'Open' on the splash screen to start."
                )
            );
        } else {
            // Render top-to-bottom (highest index first, like GIMP)
            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                listEl.appendChild(this.renderLayerRow(layer, i, layers.length));
            }
        }
        bodyEl.appendChild(listEl);
    }

    private renderLayerRow(layer: ArtLayerSpec, index: number, total: number): HTMLElement {
        const isActive = this.state.activeLayerId === layer.id;
        const row = this.createElement(
            "div",
            `ha-layer-row ${isActive ? "active" : ""}`,
            undefined,
            { "data-layer-id": layer.id }
        );

        const visBtn = this.createElement(
            "button",
            `ha-icon-btn ha-layer-vis-btn ${layer.visible ? "visible" : "hidden"}`,
            layer.visible ? "👁️" : "🚫",
            { title: "Toggle Visibility", type: "button" }
        );
        visBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.state.engine.manageLayer(this.state.canvasId, "set_visibility", {
                sharedObjectId: this.state.activeSharedObjectId,
                layerId: layer.id,
                visible: !layer.visible
            });
            this.state.notify();
        });

        const badge = this.createElement(
            "span",
            `ha-layer-type-badge ${layer.type}`,
            layer.type === "vector" ? "VEC" : "RAS"
        );

        const nameSpan = this.createElement("span", "ha-layer-name", layer.name);
        const fxCount = (layer.attachedFilters || []).length;
        const fxEnabled = layer.filtersEnabled !== false;
        const fxBtn = this.createElement(
            "button",
            `ha-icon-btn ha-layer-fx-toggle ${fxCount > 0 ? "has-fx" : ""} ${fxEnabled ? "fx-on" : "fx-off"}`,
            fxCount > 0 ? `✨${fxCount}` : "✨",
            {
                type: "button",
                title:
                    fxCount > 0
                        ? `Layer has ${fxCount} attached dynamic filter(s) (${fxEnabled ? "Preview ON" : "Preview OFF"}) — Click to toggle all filters on/off for "${layer.name}"`
                        : `Toggle dynamic filters on/off for "${layer.name}"`,
                "data-layer-fx-id": layer.id
            }
        );
        fxBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const next = this.state.engine.setTargetFiltersEnabled(this.state.canvasId, {
                targetType: "layer",
                targetId: layer.id,
                sharedObjectId: this.state.activeSharedObjectId
            });
            this.state.setStatus(
                next
                    ? `Enabled dynamic filters preview on layer "${layer.name}".`
                    : `Toggled off dynamic filters preview on layer "${layer.name}" (exporting still renders filters).`
            );
        });

        const infoSpan = this.createElement(
            "span",
            "ha-layer-meta",
            layer.type === "vector"
                ? `${layer.objects.length} obj`
                : `${Math.round(layer.opacity * 100)}%`
        );

        row.append(visBtn, badge, nameSpan, fxBtn, infoSpan);

        row.addEventListener("click", () => {
            this.state.activeLayerId = layer.id;
            this.state.notify();
        });

        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.contextMenu.openMenu(e.clientX, e.clientY, this.buildLayerContextMenu(layer, index, total));
        });

        return row;
    }

    private buildLayerContextMenu(layer: ArtLayerSpec, index: number, total: number): ContextMenuItem[] {
        return [
            {
                label: `Rename "${layer.name}"...`,
                icon: "✏️",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Rename Layer",
                        fields: [{ key: "name", label: "Layer Name", defaultValue: layer.name }],
                        onSubmit: (vals) => {
                            if (vals.name) {
                                layer.name = vals.name;
                                this.state.setStatus(`Renamed layer to "${vals.name}".`);
                            }
                        }
                    });
                }
            },
            {
                label: "Duplicate Layer",
                icon: "📋",
                action: () => {
                    this.state.engine.manageLayer(this.state.canvasId, "duplicate", {
                        sharedObjectId: this.state.activeSharedObjectId,
                        layerId: layer.id
                    });
                    this.state.setStatus(`Duplicated layer "${layer.name}".`);
                }
            },
            {
                label: layer.visible ? "Hide Layer" : "Show Layer",
                icon: "👁️",
                action: () => {
                    this.state.engine.manageLayer(this.state.canvasId, "set_visibility", {
                        sharedObjectId: this.state.activeSharedObjectId,
                        layerId: layer.id,
                        visible: !layer.visible
                    });
                    this.state.notify();
                }
            },
            { divider: true },
            {
                label: "Move Layer Up",
                icon: "⬆️",
                disabled: index >= total - 1,
                action: () => {
                    this.state.engine.manageLayer(this.state.canvasId, "reorder", {
                        sharedObjectId: this.state.activeSharedObjectId,
                        layerId: layer.id,
                        targetIndex: index + 1
                    });
                    this.state.notify();
                }
            },
            {
                label: "Move Layer Down",
                icon: "⬇️",
                disabled: index <= 0,
                action: () => {
                    this.state.engine.manageLayer(this.state.canvasId, "reorder", {
                        sharedObjectId: this.state.activeSharedObjectId,
                        layerId: layer.id,
                        targetIndex: index - 1
                    });
                    this.state.notify();
                }
            },
            {
                label: "Clear Layer Contents",
                icon: "🧹",
                action: () => {
                    this.state.engine.manageLayer(this.state.canvasId, "clear", {
                        sharedObjectId: this.state.activeSharedObjectId,
                        layerId: layer.id
                    });
                    this.state.setStatus(`Cleared layer "${layer.name}".`);
                }
            },
            { divider: true },
            {
                label: `Ask AI to Edit "${layer.name}"...`,
                icon: "🤖",
                action: () => {
                    this.state.activeLayerId = layer.id;
                    this.state.askAi(
                        layer.type === "vector"
                            ? `Inspect vector layer "${layer.name}" (${layer.id}) and draw or enhance vector artwork on it.`
                            : `Inspect raster layer "${layer.name}" (${layer.id}) and paint or apply a GIMP filter to it.`
                    );
                }
            },
            { divider: true },
            {
                label: "Delete Layer",
                icon: "🗑️",
                danger: true,
                disabled: total <= 1,
                action: () => {
                    this.state.engine.manageLayer(this.state.canvasId, "remove", {
                        sharedObjectId: this.state.activeSharedObjectId,
                        layerId: layer.id
                    });
                    this.state.resolveActiveLayer();
                    this.state.setStatus(`Deleted layer "${layer.name}".`);
                }
            }
        ];
    }
}
