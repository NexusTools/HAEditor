import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuManager } from "../context-menu.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import {
    RasterFilterRegistry,
    type AbstractRasterFilter,
    type RasterFilterParams
} from "@nexustools/hacanvas";

/**
 * GIMP Raster Filters Dock Panel inheriting from `AbstractDockPanel`.
 * Dynamically renders all registered `AbstractRasterFilter` subclasses from `RasterFilterRegistry`
 * (`gaussian_blur`, `sharpen`, `invert`, `threshold`, `brightness_contrast`, `drop_shadow`) with parameter controls.
 */
export class FiltersDockPanel extends AbstractDockPanel {
    public readonly panelId = "ha-filters-panel";
    public readonly panelTitle = "GIMP Pixel Filters";
    public readonly panelIcon = "✨";

    private selectedFilterType: RasterFilterParams["filterType"] = "gaussian_blur";
    private filterParams: RasterFilterParams = {
        filterType: "gaussian_blur",
        radius: 3,
        amount: 1.2,
        threshold: 128,
        brightness: 15,
        contrast: 20,
        offsetX: 4,
        offsetY: 4,
        color: "#000000",
        opacity: 0.65
    };

    constructor(containerEl: HTMLElement, state: EditorSessionState, contextMenu: ContextMenuManager) {
        super(containerEl, state, contextMenu);
    }

    protected override getHeaderActions(): DockActionButton[] {
        return [
            {
                id: "btn-apply-selected-filter",
                label: "Apply Filter",
                icon: "⚡",
                title: "Apply Selected GIMP Pixel Filter to Active Raster Layer",
                onClick: () => this.applyFilter(this.selectedFilterType)
            }
        ];
    }

    public applyFilter(filterType: RasterFilterParams["filterType"], customParams?: Partial<RasterFilterParams>): void {
        this.state.ensureCanvasOpen();
        const rasterLayer = this.state.resolveActiveLayer("raster");
        const merged: RasterFilterParams = {
            ...this.filterParams,
            ...customParams,
            filterType
        };
        this.state.engine.rasterFilter(
            this.state.canvasId,
            rasterLayer?.id,
            merged,
            this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
            this.state.activeSharedObjectId
        );
        this.state.setStatus(`Applied GIMP filter "${filterType}" on layer "${rasterLayer?.name || "Raster"}".`);
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        const filters = RasterFilterRegistry.getAllFilters();

        const quickGrid = this.createElement("div", "ha-filter-buttons-grid");
        for (const f of filters) {
            const isSelected = f.filterType === this.selectedFilterType;
            const btn = this.createElement(
                "button",
                `ha-filter-chip ${isSelected ? "active" : ""}`,
                f.displayName,
                {
                    "data-filter-type": f.filterType,
                    type: "button",
                    title: `Select ${f.displayName}`
                }
            );
            btn.addEventListener("click", () => {
                this.selectedFilterType = f.filterType;
                this.filterParams.filterType = f.filterType;
                this.render();
            });
            btn.addEventListener("dblclick", () => {
                this.selectedFilterType = f.filterType;
                this.applyFilter(f.filterType);
            });
            quickGrid.appendChild(btn);
        }
        bodyEl.appendChild(quickGrid);

        const activeFilter = RasterFilterRegistry.getFilter(this.selectedFilterType);
        bodyEl.appendChild(this.renderFilterParamsForm(activeFilter));
    }

    private renderFilterParamsForm(filter: AbstractRasterFilter): HTMLElement {
        const form = this.createElement("div", "ha-filter-params-form");
        const ft = filter.filterType;

        if (ft === "gaussian_blur" || ft === "drop_shadow") {
            form.appendChild(
                this.createNumericRow("Radius (px)", this.filterParams.radius ?? 3, 1, 25, 1, (v) => {
                    this.filterParams.radius = v;
                })
            );
        }
        if (ft === "sharpen") {
            form.appendChild(
                this.createNumericRow("Amount", this.filterParams.amount ?? 1.2, 0.1, 5.0, 0.1, (v) => {
                    this.filterParams.amount = v;
                })
            );
        }
        if (ft === "threshold") {
            form.appendChild(
                this.createNumericRow("Threshold (0-255)", this.filterParams.threshold ?? 128, 0, 255, 1, (v) => {
                    this.filterParams.threshold = v;
                })
            );
        }
        if (ft === "brightness_contrast") {
            form.appendChild(
                this.createNumericRow("Brightness (-100..100)", this.filterParams.brightness ?? 15, -100, 100, 5, (v) => {
                    this.filterParams.brightness = v;
                })
            );
            form.appendChild(
                this.createNumericRow("Contrast (-100..100)", this.filterParams.contrast ?? 20, -100, 100, 5, (v) => {
                    this.filterParams.contrast = v;
                })
            );
        }
        if (ft === "drop_shadow") {
            form.appendChild(
                this.createNumericRow("Offset X", this.filterParams.offsetX ?? 4, -30, 30, 1, (v) => {
                    this.filterParams.offsetX = v;
                })
            );
            form.appendChild(
                this.createNumericRow("Offset Y", this.filterParams.offsetY ?? 4, -30, 30, 1, (v) => {
                    this.filterParams.offsetY = v;
                })
            );
        }

        const runBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary ha-btn-block",
            `⚡ Run ${filter.displayName} Now`,
            {
                id: `btn-run-filter-${ft}`,
                type: "button"
            }
        );
        runBtn.addEventListener("click", () => this.applyFilter(ft));
        form.appendChild(runBtn);

        return form;
    }

    private createNumericRow(
        label: string,
        val: number,
        min: number,
        max: number,
        step: number,
        onChange: (n: number) => void
    ): HTMLElement {
        const row = this.createElement("div", "ha-param-row");
        const lbl = this.createElement("label", "ha-param-label", label);
        const ctrlGroup = this.createElement("div", "ha-param-slider-group");
        const slider = this.createElement("input", "ha-range ha-param-range", undefined, {
            type: "range",
            min: String(min),
            max: String(max),
            step: String(step),
            value: String(val)
        });
        const inp = this.createElement("input", "ha-input ha-param-input", undefined, {
            type: "number",
            min: String(min),
            max: String(max),
            step: String(step),
            value: String(val)
        });
        slider.addEventListener("input", () => {
            inp.value = slider.value;
            onChange(Number(slider.value));
        });
        inp.addEventListener("input", () => {
            slider.value = inp.value;
            onChange(Number(inp.value));
        });
        ctrlGroup.append(slider, inp);
        row.append(lbl, ctrlGroup);
        return row;
    }
}
