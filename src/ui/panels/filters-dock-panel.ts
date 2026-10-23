import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuManager } from "../context-menu.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import {
    RasterFilterRegistry,
    GIMP_FILTER_CATEGORIES,
    type AbstractRasterFilter,
    type RasterFilterParams,
    type GimpFilterPreset
} from "@nexustools/hacanvas";
import { JsCodeIdeEditor } from "../js-code-ide-editor.js";

/**
 * GIMP Raster Filters Dock Panel & JS Filter Studio inheriting from `AbstractDockPanel`.
 * - Categorizes all 85+ built-in GIMP filters & C plugins and custom JS filters into collapsible folder categories
 *   (`Blur`, `Enhance`, `Distorts`, `Light and Shadow`, `Noise`, `Edge-Detect`, `Artistic`, `Combine`, `Generic`,
 *   `Map`, `Render`, `Colors`, `Decor`, `Custom`).
 * - Exposes the full JavaScript source code for every built-in and custom filter with `prismjs` syntax highlighting
 *   and `Ctrl+Click` / `Cmd+Click` / `Alt+Click` Go-To-Definition & Internal Function Documentation (`JsCodeIdeEditor`).
 * - Supports creating, validating, categorizing, and saving custom JavaScript filter presets into `.hacanvas` and `config.json`.
 */
export class FiltersDockPanel extends AbstractDockPanel {
    public readonly panelId = "ha-filters-panel";
    public readonly panelTitle = "GIMP Pixel Filters & JS Studio";
    public readonly panelIcon = "✨";

    private selectedFilterType: string = "gaussian_blur";
    private searchQuery: string = "";
    private collapsedFolders: Set<string> = new Set();
    private showInlineCodeIde: boolean = false;
    public selectedTargetType: "layer" | "object" | "shared_object" = "layer";
    public lastIdeEditor: JsCodeIdeEditor | null = null;

    private filterParams: Record<string, any> = {
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
                id: "btn-open-filter-js-studio",
                label: "JS Studio",
                icon: "🧬",
                title: "Open GIMP Filter JavaScript Source & Preset Studio",
                onClick: () => this.openFilterStudioDialog(this.selectedFilterType)
            },
            {
                id: "btn-attach-selected-filter",
                label: "Attach FX",
                icon: "📌",
                title: "Attach Selected Filter Dynamically (Non-Destructive)",
                onClick: () => this.attachFilterDynamically(this.selectedFilterType)
            },
            {
                id: "btn-apply-selected-filter",
                label: "Apply Filter",
                icon: "⚡",
                title: "Apply Selected GIMP Pixel Filter Immediately to Active Raster Layer",
                onClick: () => this.applyFilter(this.selectedFilterType)
            }
        ];
    }

    public getAllMergedFilterPresets(): GimpFilterPreset[] {
        const fromEngine = this.state.engine.listGimpFilterPresets(
            this.state.hasOpenCanvas ? this.state.canvasId : undefined
        );
        const fromConfig = this.state.configManager.listGimpFilterPresets();
        const merged = [...fromEngine];
        for (const cp of fromConfig) {
            const idx = merged.findIndex(m => m.id === cp.id);
            if (idx >= 0) {
                if (!merged[idx].builtIn) merged[idx] = cp;
            } else {
                merged.push(cp);
            }
        }
        return merged;
    }

    private resolveMergedFilterParams(filterType: string, customParams?: Record<string, any>): RasterFilterParams {
        const activeFilter = RasterFilterRegistry.getFilter(filterType);
        const defaults: Record<string, any> = {};
        if (activeFilter) {
            for (const s of activeFilter.parameterSchemas) {
                defaults[s.key] = s.defaultValue;
            }
        }
        return {
            ...defaults,
            ...this.filterParams,
            ...(customParams || {}),
            filterType
        };
    }

    public applyFilter(filterType: string, customParams?: Record<string, any>): void {
        this.state.ensureCanvasOpen();
        const rasterLayer = this.state.resolveActiveLayer("raster");
        const activeFilter = RasterFilterRegistry.getFilter(filterType);
        const merged = this.resolveMergedFilterParams(filterType, customParams);
        this.state.engine.rasterFilter(
            this.state.canvasId,
            rasterLayer?.id,
            merged,
            this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
            this.state.activeSharedObjectId
        );
        this.state.recordFilterExecution(
            filterType,
            activeFilter?.displayName || filterType,
            merged as Record<string, unknown>
        );
        this.state.setStatus(`Applied GIMP filter "${activeFilter?.displayName || filterType}" immediately on layer "${rasterLayer?.name || "Raster"}".`);
    }

    public attachFilterDynamically(
        filterType: string,
        explicitTargetType?: "layer" | "object" | "shared_object",
        explicitTargetId?: string,
        customParams?: Record<string, any>
    ): void {
        this.state.ensureCanvasOpen();
        const tType = explicitTargetType || this.selectedTargetType || "layer";
        const activeLayer = this.state.resolveActiveLayer();
        let targetId = explicitTargetId;
        if (!targetId) {
            if (tType === "object") {
                targetId = this.state.selectedObjectIds[0];
            } else if (tType === "shared_object") {
                targetId = this.state.activeSharedObjectId || Object.keys(this.state.getCanvasState().sharedObjects || {})[0];
            } else {
                targetId = activeLayer?.id;
            }
        }
        const merged = this.resolveMergedFilterParams(filterType, customParams);
        const attached = this.state.engine.attachFilter(this.state.canvasId, {
            targetType: tType,
            targetId,
            sharedObjectId: tType === "shared_object" ? undefined : this.state.activeSharedObjectId,
            filterType,
            params: merged
        });
        this.render();
        this.state.setStatus(`Attached dynamic filter "${attached.name}" to ${tType} "${targetId || "active"}" (non-destructive).`);
    }

    public toggleTargetFiltersPreview(
        targetType: "layer" | "object" | "shared_object" | "canvas" = "layer",
        explicitTargetId?: string
    ): boolean {
        this.state.ensureCanvasOpen();
        const activeLayer = this.state.resolveActiveLayer();
        const targetId =
            explicitTargetId ||
            (targetType === "object"
                ? this.state.selectedObjectIds[0]
                : targetType === "shared_object"
                  ? this.state.activeSharedObjectId
                  : activeLayer?.id);
        const enabled = this.state.engine.setTargetFiltersEnabled(this.state.canvasId, {
            targetType,
            targetId,
            sharedObjectId: targetType === "shared_object" ? undefined : this.state.activeSharedObjectId
        });
        this.render();
        this.state.setStatus(
            enabled
                ? `Enabled dynamic filter preview on ${targetType}.`
                : `Paused dynamic filter preview on ${targetType} (exporting still renders filters).`
        );
        return enabled;
    }

    public bakeActiveLayerFilters(layerId?: string): void {
        this.state.ensureCanvasOpen();
        const activeLayer = this.state.resolveActiveLayer();
        const targetLayerId = layerId || activeLayer?.id;
        const res = this.state.engine.bakeLayerFilters(
            this.state.canvasId,
            targetLayerId,
            this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
            this.state.activeSharedObjectId
        );
        this.render();
        this.state.setStatus(`Baked ${res.filtersBaked} dynamic filter(s) into pixels on layer "${res.layerId}".`);
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        const allPresets = this.getAllMergedFilterPresets();
        const activeFilter =
            RasterFilterRegistry.getFilter(this.selectedFilterType) ||
            RasterFilterRegistry.getAllFilters()[0];

        // Top Search & JS Studio bar
        const topRow = this.createElement("div", "ha-filter-search-row", undefined, {
            style: "display:flex;gap:6px;margin-bottom:6px;align-items:center;"
        });
        const searchInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-filter-search-input",
            type: "text",
            placeholder: `Search ${allPresets.length} GIMP filters or folders...`,
            value: this.searchQuery,
            style: "flex:1;font-size:11px;padding:4px 7px;"
        }) as HTMLInputElement;
        searchInput.addEventListener("input", () => {
            this.searchQuery = searchInput.value;
            this.render();
            const restored = this.containerEl.querySelector("#ha-filter-search-input") as HTMLInputElement | null;
            if (restored) {
                restored.focus();
                restored.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
            }
        });

        const codeBtn = this.createElement(
            "button",
            `ha-btn ${this.showInlineCodeIde ? "ha-btn-primary" : "ha-btn-secondary"}`,
            "</> JS Code",
            {
                id: "ha-btn-toggle-inline-filter-code",
                type: "button",
                title: "Toggle inline JavaScript Source Code & IDE for the selected filter",
                style: "padding:4px 8px;font-size:11px;"
            }
        );
        codeBtn.addEventListener("click", () => {
            this.showInlineCodeIde = !this.showInlineCodeIde;
            this.render();
        });
        topRow.append(searchInput, codeBtn);
        bodyEl.appendChild(topRow);

        // Group presets into GIMP folder categories
        const grouped = new Map<string, GimpFilterPreset[]>();
        for (const cat of GIMP_FILTER_CATEGORIES) {
            grouped.set(cat, []);
        }
        const q = this.searchQuery.trim().toLowerCase();
        for (const p of allPresets) {
            if (
                q &&
                !p.name.toLowerCase().includes(q) &&
                !p.id.toLowerCase().includes(q) &&
                !(p.category || "").toLowerCase().includes(q) &&
                !(p.description || "").toLowerCase().includes(q)
            ) {
                continue;
            }
            const cat = p.category || "Generic";
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(p);
        }

        const categoriesContainer = this.createElement("div", "ha-filter-categories-tree", undefined, {
            id: "ha-filter-categories-tree",
            style: "max-height:220px;overflow-y:auto;border:1px solid #22293e;border-radius:4px;padding:4px;margin-bottom:8px;background:#101420;"
        });

        for (const [catName, presetsInCat] of grouped.entries()) {
            if (presetsInCat.length === 0) continue;
            const isCollapsed = !q && this.collapsedFolders.has(catName);

            const folderBox = this.createElement("div", "ha-filter-category-folder", undefined, {
                "data-category": catName,
                style: "margin-bottom:4px;"
            });

            const folderHeader = this.createElement(
                "div",
                "ha-filter-category-header",
                undefined,
                {
                    style: "display:flex;align-items:center;justify-content:space-between;padding:3px 6px;background:#181e30;border-radius:3px;cursor:pointer;user-select:none;font-size:11px;font-weight:600;color:#b8c7e6;"
                }
            );
            folderHeader.innerHTML = `
                <span>${isCollapsed ? "📁" : "📂"} ${catName}</span>
                <span style="font-size:10px;color:#7f92b8;">${presetsInCat.length}</span>
            `;
            folderHeader.addEventListener("click", () => {
                if (this.collapsedFolders.has(catName)) {
                    this.collapsedFolders.delete(catName);
                } else {
                    this.collapsedFolders.add(catName);
                }
                this.render();
            });
            folderBox.appendChild(folderHeader);

            const quickGrid = this.createElement("div", "ha-filter-buttons-grid", undefined, {
                style: isCollapsed ? "display:none;" : "padding:4px 2px;"
            });
            for (const p of presetsInCat) {
                const isSelected = p.id === this.selectedFilterType;
                const btn = this.createElement(
                    "button",
                    `ha-filter-chip ${isSelected ? "active" : ""}`,
                    p.name,
                    {
                        "data-filter-type": p.id,
                        "data-filter-category": catName,
                        type: "button",
                        title: `[${catName}] ${p.name} — ${p.description}`
                    }
                );
                btn.addEventListener("click", () => {
                    this.selectedFilterType = p.id;
                    this.filterParams.filterType = p.id;
                    const fObj = RasterFilterRegistry.getFilter(p.id);
                    if (fObj) {
                        for (const s of fObj.parameterSchemas) {
                            if (this.filterParams[s.key] === undefined) {
                                this.filterParams[s.key] = s.defaultValue;
                            }
                        }
                    }
                    this.render();
                });
                btn.addEventListener("dblclick", () => {
                    this.selectedFilterType = p.id;
                    this.applyFilter(p.id);
                });
                quickGrid.appendChild(btn);
            }
            folderBox.appendChild(quickGrid);
            categoriesContainer.appendChild(folderBox);
        }

        bodyEl.appendChild(categoriesContainer);

        if (activeFilter) {
            bodyEl.appendChild(this.renderFilterParamsForm(activeFilter));
        }
    }

    private renderFilterParamsForm(filter: AbstractRasterFilter): HTMLElement {
        const form = this.createElement("div", "ha-filter-params-form");
        const ft = filter.filterType;

        const metaRow = this.createElement("div", undefined, undefined, {
            style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;color:#9aa8c7;"
        });
        metaRow.innerHTML = `
            <span>📂 <strong>${filter.category}</strong> · <span style="color:#00e5ff;">${filter.displayName}</span></span>
            <button type="button" class="ha-btn ha-btn-secondary" id="btn-edit-filter-js-modal" style="padding:2px 7px;font-size:10px;">🧬 Edit JS / Preset...</button>
        `;
        metaRow.querySelector("#btn-edit-filter-js-modal")?.addEventListener("click", () => {
            this.openFilterStudioDialog(ft);
        });
        form.appendChild(metaRow);

        const schemas = filter.parameterSchemas;
        for (const schema of schemas) {
            const paramKey = schema.key;
            const paramLabel = schema.label || schema.key;
            const curVal =
                this.filterParams[paramKey] !== undefined
                    ? this.filterParams[paramKey]
                    : schema.defaultValue;
            if (schema.type === "number") {
                const min = schema.min ?? 0;
                const max = schema.max ?? 100;
                const step = schema.step ?? (max - min <= 5 ? 0.1 : 1);
                form.appendChild(
                    this.createNumericRow(
                        paramLabel !== paramKey ? `${paramKey} (${paramLabel})` : paramKey,
                        Number(curVal),
                        min,
                        max,
                        step,
                        (v) => {
                            this.filterParams[paramKey] = v;
                        }
                    )
                );
            } else {
                const row = this.createElement("div", "ha-param-row");
                const lbl = this.createElement("label", "ha-param-label", paramLabel);
                const isColor = schema.type === "color" || (typeof curVal === "string" && /^#[0-9a-fA-F]{6}$/.test(curVal));
                const inp = this.createElement("input", isColor ? "ha-color-input" : "ha-input", undefined, {
                    type: isColor ? "color" : "text",
                    value: String(curVal ?? "")
                }) as HTMLInputElement;
                inp.addEventListener("input", () => {
                    this.filterParams[paramKey] = inp.value;
                });
                row.append(lbl, inp);
                form.appendChild(row);
            }
        }

        if (this.showInlineCodeIde) {
            const ideWrap = this.createElement("div", "ha-inline-filter-ide-wrap", undefined, {
                style: "margin:6px 0;"
            });
            this.lastIdeEditor = new JsCodeIdeEditor({
                container: ideWrap,
                initialCode: filter.code,
                minHeightPx: 140,
                maxHeightPx: 220,
                onChange: (newCode) => {
                    this.filterParams.customCode = newCode;
                }
            });
            form.appendChild(ideWrap);
        }

        // Target selector & dynamic filter controls bar
        const targetBar = this.createElement("div", "ha-filter-target-bar", undefined, {
            style: "display:flex;gap:4px;align-items:center;margin:6px 0;"
        });
        const targetSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-filter-target-select",
            title: "Select target for dynamic attached filters (Layer, Selected Object, or Shared Object)",
            style: "flex:1;font-size:11px;padding:3px 6px;"
        }) as HTMLSelectElement;
        const activeLayer = this.state.resolveActiveLayer();
        const selObjId = this.state.selectedObjectIds[0];
        const activeSharedId =
            this.state.activeSharedObjectId ||
            Object.keys(this.state.getCanvasState().sharedObjects || {})[0];
        const targetOpts: Array<{ value: "layer" | "object" | "shared_object"; label: string }> = [
            { value: "layer", label: `🗂️ Active Layer (${activeLayer?.name || "Layer"})` },
            { value: "object", label: `🎯 Selected Object (${selObjId || "None"})` },
            { value: "shared_object", label: `🧩 Shared Object (${activeSharedId || "None"})` }
        ];
        for (const to of targetOpts) {
            const optEl = this.createElement("option", undefined, to.label, { value: to.value });
            if (to.value === this.selectedTargetType) optEl.selected = true;
            targetSelect.appendChild(optEl);
        }
        targetSelect.addEventListener("change", () => {
            this.selectedTargetType = targetSelect.value as "layer" | "object" | "shared_object";
            this.render();
        });

        let curFiltersEnabled = true;
        let curAttachedList: any[] = [];
        if (this.state.hasOpenCanvas) {
            try {
                const targetId =
                    this.selectedTargetType === "object"
                        ? selObjId
                        : this.selectedTargetType === "shared_object"
                          ? activeSharedId
                          : activeLayer?.id;
                if (targetId) {
                    const info = this.state.engine.listAttachedFilters(this.state.canvasId, {
                        targetType: this.selectedTargetType,
                        targetId,
                        sharedObjectId: this.selectedTargetType === "shared_object" ? undefined : this.state.activeSharedObjectId
                    });
                    curFiltersEnabled = info.filtersEnabled && info.previewDynamicFilters;
                    curAttachedList = info.attachedFilters;
                }
            } catch {
                // Ignore if target doesn't exist yet
            }
        }

        const toggleFxBtn = this.createElement(
            "button",
            `ha-btn ${curFiltersEnabled ? "ha-btn-primary" : "ha-btn-secondary"}`,
            curFiltersEnabled ? "👁️ FX On" : "🚫 FX Off",
            {
                id: "btn-toggle-layer-filters-enabled",
                type: "button",
                title: "Toggle all attached filters on/off for the target (Exporting always renders attached filters)",
                style: "padding:3px 7px;font-size:10.5px;"
            }
        );
        toggleFxBtn.addEventListener("click", () => {
            this.toggleTargetFiltersPreview(this.selectedTargetType);
        });

        const bakeBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "🔥 Bake",
            {
                id: "btn-bake-layer-filters",
                type: "button",
                title: "Permanently bake attached dynamic filters into the active layer's pixels",
                style: "padding:3px 7px;font-size:10.5px;"
            }
        );
        bakeBtn.addEventListener("click", () => {
            this.bakeActiveLayerFilters();
        });

        targetBar.append(targetSelect, toggleFxBtn, bakeBtn);
        form.appendChild(targetBar);

        const actionsRow = this.createElement("div", "ha-filter-actions-row", undefined, {
            style: "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;"
        });

        const runBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary ha-btn-block",
            `⚡ Run ${filter.displayName} Now`,
            {
                id: `btn-run-filter-${ft}`,
                title: "Apply filter immediately to mutate the active raster layer's pixels",
                type: "button"
            }
        );
        runBtn.addEventListener("click", () => this.applyFilter(ft));

        const attachBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary ha-btn-block",
            `📌 Attach Dynamically`,
            {
                id: "btn-attach-filter-dynamically",
                title: "Attach filter dynamically without touching underlying pixels (renders live & on export)",
                type: "button"
            }
        );
        attachBtn.addEventListener("click", () => this.attachFilterDynamically(ft));

        actionsRow.append(runBtn, attachBtn);
        form.appendChild(actionsRow);

        // Attached Dynamic Filters Stack
        const stackWrap = this.createElement("div", "ha-attached-filters-stack", undefined, {
            id: "ha-attached-filters-stack",
            style: "margin-top:8px;padding:6px;background:#0e121d;border:1px solid #22293e;border-radius:4px;font-size:11px;"
        });
        const stackHeader = this.createElement(
            "div",
            undefined,
            `📌 Attached Dynamic Filters (${curAttachedList.length})`,
            {
                style: "font-weight:600;color:#9fb0d0;margin-bottom:4px;display:flex;justify-content:space-between;"
            }
        );
        stackWrap.appendChild(stackHeader);
        if (curAttachedList.length === 0) {
            stackWrap.appendChild(
                this.createElement(
                    "div",
                    undefined,
                    "No dynamic filters attached to this target.",
                    { style: "color:#657597;font-size:10.5px;" }
                )
            );
        } else {
            for (const af of curAttachedList) {
                const itemRow = this.createElement("div", "ha-attached-filter-item", undefined, {
                    "data-attached-filter-id": af.id,
                    style: "display:flex;align-items:center;justify-content:space-between;padding:3px 6px;margin-top:3px;background:#161c2e;border-radius:3px;"
                });
                const lblSpan = this.createElement("span", undefined, `✨ ${af.name} (${af.filterType})`);
                const rmBtn = this.createElement("button", "ha-icon-btn ha-btn-remove-attached-filter", "×", {
                    type: "button",
                    title: `Remove attached filter "${af.name}"`,
                    "data-remove-filter-id": af.id
                });
                rmBtn.addEventListener("click", () => {
                    const targetId =
                        this.selectedTargetType === "object"
                            ? selObjId
                            : this.selectedTargetType === "shared_object"
                              ? activeSharedId
                              : activeLayer?.id;
                    this.state.engine.removeAttachedFilter(this.state.canvasId, {
                        targetType: this.selectedTargetType,
                        targetId,
                        sharedObjectId: this.selectedTargetType === "shared_object" ? undefined : this.state.activeSharedObjectId,
                        filterId: af.id
                    });
                    this.render();
                    this.state.setStatus(`Removed attached filter "${af.name}".`);
                });
                itemRow.append(lblSpan, rmBtn);
                stackWrap.appendChild(itemRow);
            }
        }
        form.appendChild(stackWrap);

        return form;
    }

    /**
     * Opens the interactive GIMP Filter Studio & JavaScript Preset Editor modal (`#ha-gimp-filter-dialog`).
     * - Displays all 13+ GIMP folder categories and 85+ filters.
     * - Uses `JsCodeIdeEditor` (`prismjs`) for live JS syntax highlighting and Modifier+Click Go-To-Definition / Internal Function Docs.
     * - Supports creating & saving new custom categorized JS filter presets into `.hacanvas` and `config.json`.
     */
    public openFilterStudioDialog(initialFilterId?: string): void {
        const existing = this.doc.getElementById("ha-gimp-filter-dialog");
        if (existing) existing.remove();

        let activeId = initialFilterId || this.selectedFilterType || "gaussian_blur";
        const overlay = this.createElement("div", "ha-modal-backdrop active", undefined, {
            id: "ha-gimp-filter-dialog"
        });
        const card = this.createElement("div", "ha-modal-card", undefined, {
            style: "max-width: 860px; width: 94vw;"
        });

        const header = this.createElement("div", "ha-modal-header");
        const titleEl = this.createElement(
            "h3",
            "ha-modal-title",
            "🧬 GIMP Filter Studio & JavaScript Preset Editor"
        );
        const closeBtn = this.createElement("button", "ha-modal-close", "×", { type: "button" });
        closeBtn.addEventListener("click", () => overlay.remove());
        header.append(titleEl, closeBtn);

        const body = this.createElement("div", "ha-modal-body", undefined, {
            style: "display:flex;flex-direction:column;gap:10px;"
        });

        // Row 1: Category Folder filter + Filter Preset Selector + GIMP C Procedure badge
        const row1 = this.createElement("div", undefined, undefined, {
            style: "display:grid;grid-template-columns:1fr 1.8fr;gap:8px;align-items:end;"
        });

        const catFilterDiv = this.createElement("div");
        catFilterDiv.appendChild(this.createElement("label", "ha-form-label", "Filter Folder Category"));
        const catFilterSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-filter-studio-category-select"
        }) as HTMLSelectElement;

        const presetDiv = this.createElement("div");
        presetDiv.appendChild(
            this.createElement("label", "ha-form-label", "GIMP Filter Preset (Built-In & Custom JS)")
        );
        const presetSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-filter-studio-preset-select"
        }) as HTMLSelectElement;

        catFilterDiv.appendChild(catFilterSelect);
        presetDiv.appendChild(presetSelect);
        row1.append(catFilterDiv, presetDiv);

        const descBar = this.createElement("div", undefined, "", {
            id: "ha-filter-studio-desc",
            style: "font-size:11.5px;color:#9fb0d0;background:#111623;padding:6px 10px;border-radius:4px;border:1px solid #222b42;"
        });

        // Row 2: Prism.js IDE Code Editor
        const ideHeader = this.createElement("div", undefined, undefined, {
            style: "display:flex;justify-content:space-between;align-items:center;"
        });
        ideHeader.appendChild(
            this.createElement(
                "label",
                "ha-form-label",
                "Filter JavaScript Source Code — Scope: (srcBuf, outBuf, width, height, params, selectionMask, helpers, gimp, gegl)"
            )
        );
        const validBadge = this.createElement("span", undefined, "✓ Valid JS", {
            id: "ha-filter-studio-valid-status",
            style: "font-size:11px;color:#00e676;"
        });
        ideHeader.appendChild(validBadge);

        const ideMount = this.createElement("div", undefined, undefined, {
            id: "ha-filter-studio-ide-mount"
        });
        const ideEditor = new JsCodeIdeEditor({
            container: ideMount,
            initialCode: "",
            minHeightPx: 220,
            maxHeightPx: 320,
            onStatus: (msg) => {
                validBadge.textContent = msg;
                validBadge.style.color = "#00e5ff";
            }
        });
        this.lastIdeEditor = ideEditor;

        // Row 3: Save as Custom Categorized Filter Preset
        const saveRow = this.createElement("div", undefined, undefined, {
            style: "display:grid;grid-template-columns:auto 1fr 0.9fr 1.2fr auto;gap:6px;align-items:center;"
        });
        const validateBtn = this.createElement("button", "ha-btn ha-btn-secondary", "✓ Validate JS", {
            id: "ha-btn-validate-filter-code",
            type: "button"
        });
        const newNameInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-filter-preset-name-input",
            type: "text",
            placeholder: "Preset Name (e.g. Cyber Halftone)"
        }) as HTMLInputElement;
        const newCatInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-filter-preset-category-input",
            type: "text",
            placeholder: "Category Folder (e.g. Artistic)",
            value: "Custom"
        }) as HTMLInputElement;
        const newDescInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-filter-preset-desc-input",
            type: "text",
            placeholder: "Description..."
        }) as HTMLInputElement;
        const savePresetBtn = this.createElement("button", "ha-btn ha-btn-secondary", "💾 Save Filter Preset", {
            id: "ha-btn-save-filter-preset",
            type: "button"
        });
        saveRow.append(validateBtn, newNameInput, newCatInput, newDescInput, savePresetBtn);

        const populateStudioSelectors = (selectedFilterId: string, filterCategory: string = "ALL") => {
            const allPresets = this.getAllMergedFilterPresets();
            const categories = Array.from(
                new Set([...GIMP_FILTER_CATEGORIES, ...allPresets.map(p => p.category || "Custom")])
            );

            catFilterSelect.innerHTML = `<option value="ALL">📂 All Categories (${allPresets.length} Filters)</option>`;
            for (const c of categories) {
                const count = allPresets.filter(p => (p.category || "Custom") === c).length;
                if (count === 0) continue;
                const opt = this.createElement("option", undefined, `📁 ${c} (${count})`, { value: c });
                if (c === filterCategory) opt.selected = true;
                catFilterSelect.appendChild(opt);
            }

            presetSelect.innerHTML = "";
            const visiblePresets =
                filterCategory === "ALL"
                    ? allPresets
                    : allPresets.filter(p => (p.category || "Custom") === filterCategory);

            for (const p of visiblePresets) {
                const opt = this.createElement(
                    "option",
                    undefined,
                    `[${p.category}] ${p.builtIn ? "⚡" : "⭐"} ${p.name} (${p.id})`,
                    { value: p.id }
                );
                if (p.id === selectedFilterId) opt.selected = true;
                presetSelect.appendChild(opt);
            }

            const chosen =
                visiblePresets.find(p => p.id === selectedFilterId) ||
                visiblePresets[0] ||
                allPresets[0];
            if (chosen) {
                activeId = chosen.id;
                presetSelect.value = chosen.id;
                descBar.innerHTML = `<strong>[${chosen.category}] ${chosen.name}</strong> — ${chosen.description} ${chosen.gimpProcedure ? `<span style="color:#7ee787;font-family:monospace;">(${chosen.gimpProcedure})</span>` : ""}`;
                newCatInput.value = chosen.category || "Custom";
                ideEditor.setCode(chosen.code);
            }
        };

        populateStudioSelectors(activeId, "ALL");

        catFilterSelect.addEventListener("change", () => {
            populateStudioSelectors(activeId, catFilterSelect.value);
        });

        presetSelect.addEventListener("change", () => {
            activeId = presetSelect.value;
            const chosen = this.getAllMergedFilterPresets().find(p => p.id === activeId);
            if (chosen) {
                descBar.innerHTML = `<strong>[${chosen.category}] ${chosen.name}</strong> — ${chosen.description} ${chosen.gimpProcedure ? `<span style="color:#7ee787;font-family:monospace;">(${chosen.gimpProcedure})</span>` : ""}`;
                newCatInput.value = chosen.category || "Custom";
                ideEditor.setCode(chosen.code);
                validBadge.textContent = `✓ Loaded "${chosen.name}" JS source`;
                validBadge.style.color = "#00e676";
            }
        });

        validateBtn.addEventListener("click", () => {
            const res = this.state.engine.validateGimpFilterScript(ideEditor.getCode());
            if (res.valid) {
                validBadge.textContent = "✓ JS Filter Validated (RGBA buffer sandbox passed)";
                validBadge.style.color = "#00e676";
            } else {
                validBadge.textContent = `✗ Error: ${res.error}`;
                validBadge.style.color = "#ff5252";
            }
        });

        savePresetBtn.addEventListener("click", () => {
            const code = ideEditor.getCode();
            const res = this.state.engine.validateGimpFilterScript(code);
            if (!res.valid) {
                validBadge.textContent = `✗ Error: ${res.error}`;
                validBadge.style.color = "#ff5252";
                return;
            }
            const name = newNameInput.value.trim() || "Custom JS Filter";
            const category = newCatInput.value.trim() || "Custom";
            const description = newDescInput.value.trim() || "Custom JavaScript GIMP filter preset.";
            const basePreset = this.getAllMergedFilterPresets().find(p => p.id === activeId);

            const saved = this.state.configManager.saveGimpFilterPreset({
                name,
                category,
                description,
                parameterSchemas: basePreset?.parameterSchemas || [],
                code
            });
            if (this.state.hasOpenCanvas) {
                this.state.engine.saveCustomGimpFilterPreset(this.state.canvasId, {
                    id: saved.id,
                    name: saved.name,
                    category: saved.category,
                    description: saved.description,
                    parameterSchemas: saved.parameterSchemas,
                    code: saved.code
                });
            }
            this.selectedFilterType = saved.id;
            populateStudioSelectors(saved.id, "ALL");
            validBadge.textContent = `✓ Saved "${saved.name}" in folder "${saved.category}"`;
            validBadge.style.color = "#00e676";
            this.render();
            this.state.setStatus(`Saved custom GIMP JS filter preset "${saved.name}" in "${saved.category}".`);
        });

        body.append(row1, descBar, ideHeader, ideMount, saveRow);

        const footer = this.createElement("div", "ha-modal-footer");
        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Close", {
            type: "button"
        });
        cancelBtn.addEventListener("click", () => overlay.remove());

        const attachStudioBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "🔗 Attach Filter Dynamically (Non-Destructive)",
            {
                id: "ha-btn-attach-filter-studio",
                type: "button"
            }
        );
        attachStudioBtn.style.borderColor = "rgba(0, 188, 212, 0.55)";
        attachStudioBtn.style.color = "#4dd0e1";
        attachStudioBtn.addEventListener("click", () => {
            const code = ideEditor.getCode();
            const check = this.state.engine.validateGimpFilterScript(code);
            if (!check.valid) {
                validBadge.textContent = `✗ Error: ${check.error}`;
                validBadge.style.color = "#ff5252";
                return;
            }
            this.selectedFilterType = activeId;
            const chosen = this.getAllMergedFilterPresets().find(p => p.id === activeId);
            const isModified = !chosen || chosen.code.trim() !== code.trim();
            this.attachFilterDynamically(
                activeId,
                undefined,
                undefined,
                isModified ? { customCode: code } : undefined
            );
            this.render();
            overlay.remove();
        });

        const applyBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary",
            "⚡ Apply Immediately (Mutate Raster)",
            {
                id: "ha-btn-apply-filter-studio",
                type: "button"
            }
        );
        applyBtn.addEventListener("click", () => {
            const code = ideEditor.getCode();
            const check = this.state.engine.validateGimpFilterScript(code);
            if (!check.valid) {
                validBadge.textContent = `✗ Error: ${check.error}`;
                validBadge.style.color = "#ff5252";
                return;
            }
            this.selectedFilterType = activeId;
            const chosen = this.getAllMergedFilterPresets().find(p => p.id === activeId);
            const isModified = !chosen || chosen.code.trim() !== code.trim();
            this.applyFilter(activeId, isModified ? { customCode: code } : undefined);
            this.render();
            overlay.remove();
        });

        footer.append(cancelBtn, attachStudioBtn, applyBtn);
        card.append(header, body, footer);
        overlay.appendChild(card);
        this.doc.body.appendChild(overlay);
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
