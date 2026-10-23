import { AbstractUIComponent } from "./abstract-ui-component.js";
import type { ContextMenuItem, ContextMenuManager } from "./context-menu.js";
import type { ModalDialogManager } from "./modal-dialog.js";
import type { EditorSessionState } from "../state/editor-state.js";
import { EditorToolRegistry, type ToolOptionField } from "../tools/abstract-editor-tool.js";
import {
    RasterFilterRegistry,
    GIMP_FILTER_CATEGORIES,
    type ExportCanvasOptions,
    type IcoIconFormatBpp,
    type IcoLayerExportOption
} from "@nexustools/hacanvas";
import * as path from "path";

/**
 * Top GIMP-style Menu Bar & Dynamic Tool Options Bar inheriting from `AbstractUIComponent`.
 */
export class TopMenuBar extends AbstractUIComponent {
    private readonly state: EditorSessionState;
    private readonly contextMenu: ContextMenuManager;
    private readonly modal: ModalDialogManager;
    private readonly onOpenSharedObjectModal: () => void;
    private readonly onOpenAiSettings?: () => void;
    private readonly onOpenAiToolsCatalog?: () => void;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal: ModalDialogManager,
        onOpenSharedObjectModal: () => void,
        onOpenAiSettings?: () => void,
        onOpenAiToolsCatalog?: () => void
    ) {
        super(containerEl);
        this.state = state;
        this.contextMenu = contextMenu;
        this.modal = modal;
        this.onOpenSharedObjectModal = onOpenSharedObjectModal;
        this.onOpenAiSettings = onOpenAiSettings;
        this.onOpenAiToolsCatalog = onOpenAiToolsCatalog;
    }

    public override render(): void {
        this.containerEl.innerHTML = "";
        this.containerEl.className = "ha-top-bars-wrapper";

        const menuRow = this.createElement("div", "ha-top-menubar", undefined, { id: "ha-top-menubar" });
        const brand = this.createElement("div", "ha-brand-logo", "🎨 HAEditor");
        menuRow.appendChild(brand);

        const menus: Array<{ id: string; label: string; items: () => ContextMenuItem[] }> = [
            { id: "menu-file", label: "File", items: () => this.buildFileMenu() },
            { id: "menu-edit", label: "Edit", items: () => this.buildEditMenu() },
            { id: "menu-select", label: "Select", items: () => this.buildSelectMenu() },
            { id: "menu-view", label: "View", items: () => this.buildViewMenu() },
            { id: "menu-image", label: "Image", items: () => this.buildImageMenu() },
            { id: "menu-layer", label: "Layer", items: () => this.buildLayerMenu() },
            { id: "menu-colors", label: "Colors", items: () => this.buildColorsMenu() },
            { id: "menu-tools", label: "Tools", items: () => this.buildToolsMenu() },
            { id: "menu-filters", label: "Filters", items: () => this.buildFiltersMenu() },
            { id: "menu-vector", label: "Vector", items: () => this.buildVectorMenu() },
            { id: "menu-shared-objects", label: "Shared Objects", items: () => this.buildSharedObjectsMenu() },
            { id: "menu-library", label: "Library", items: () => this.buildLibraryMenu() },
            { id: "menu-windows", label: "Windows", items: () => this.buildWindowsMenu() },
            { id: "menu-ai-studio", label: "🤖 AI Studio", items: () => this.buildAiStudioMenu() },
            { id: "menu-help", label: "Help", items: () => this.buildHelpMenu() }
        ];

        for (const m of menus) {
            const btn = this.createElement("button", "ha-menu-item-btn", m.label, {
                id: m.id,
                type: "button"
            });
            const openThisMenu = () => {
                const rect = btn.getBoundingClientRect();
                this.contextMenu.openMenu(rect.left, rect.bottom + 2, m.items(), m.id, btn);
            };
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (this.contextMenu.isOpen() && this.contextMenu.getActiveAnchorId() === m.id) {
                    this.contextMenu.closeMenu();
                    return;
                }
                openThisMenu();
            });
            const handleMenuHover = () => {
                if (
                    this.contextMenu.isOpen() &&
                    this.contextMenu.getActiveAnchorId()?.startsWith("menu-") &&
                    this.contextMenu.getActiveAnchorId() !== m.id
                ) {
                    openThisMenu();
                }
            };
            btn.addEventListener("mouseenter", handleMenuHover);
            btn.addEventListener("mouseover", handleMenuHover);
            menuRow.appendChild(btn);
        }

        // Right-aligned Zoom & OS Config indicator
        const rightBox = this.createElement("div", "ha-menubar-right");
        const zoomOutBtn = this.createElement("button", "ha-icon-btn", "➖", {
            id: "btn-zoom-out",
            title: "Zoom Out",
            type: "button"
        });
        zoomOutBtn.addEventListener("click", () => {
            this.state.zoom = Math.max(0.25, Number((this.state.zoom - 0.25).toFixed(2)));
            this.state.notify();
        });
        const zoomLabel = this.createElement("span", "ha-zoom-badge", `${Math.round(this.state.zoom * 100)}%`);
        const zoomInBtn = this.createElement("button", "ha-icon-btn", "➕", {
            id: "btn-zoom-in",
            title: "Zoom In",
            type: "button"
        });
        zoomInBtn.addEventListener("click", () => {
            this.state.zoom = Math.min(4.0, Number((this.state.zoom + 0.25).toFixed(2)));
            this.state.notify();
        });

        rightBox.append(zoomOutBtn, zoomLabel, zoomInBtn);
        menuRow.appendChild(rightBox);

        // Second row: Dynamic Tool Options Bar
        const optionsRow = this.renderToolOptionsBar();
        this.containerEl.append(menuRow, optionsRow);
    }

    private renderToolOptionsBar(): HTMLElement {
        const bar = this.createElement("div", "ha-tool-options-bar", undefined, {
            id: "ha-tool-options-bar"
        });

        this.state.syncToolWithActiveLayer();
        const contextType = this.state.getActiveContextType();
        const tool = EditorToolRegistry.getTool(this.state.activeToolId);
        const badge = this.createElement(
            "div",
            "ha-active-tool-badge",
            `${tool.icon} ${tool.label} (${tool.shortcut})`
        );
        bar.appendChild(badge);

        for (const field of tool.getOptionFields()) {
            bar.appendChild(this.renderOptionField(field));
        }

        // Quick Boolean Operations toolbar when editing a vector layer
        if (contextType === "vector") {
            const boolGroup = this.createElement("div", "ha-tool-options-bool-group");
            for (const op of ["union", "difference", "intersection", "exclusion"] as const) {
                const btn = this.createElement(
                    "button",
                    "ha-btn ha-btn-secondary ha-btn-sm",
                    `Bool: ${op}`,
                    {
                        id: `btn-bool-${op}`,
                        title: `Boolean ${op.toUpperCase()} on selected vector shapes`,
                        type: "button"
                    }
                );
                btn.addEventListener("click", () => {
                    if (this.state.selectedObjectIds.length < 2) {
                        this.state.setStatus("Select at least 2 vector shapes (Shift+Click) for Boolean operations.");
                        return;
                    }
                    const res = this.state.engine.pathOperation(this.state.canvasId, op, {
                        targetIds: this.state.selectedObjectIds.slice(0, 2)
                    });
                    this.state.selectedObjectIds = [res.id];
                    this.state.setStatus(`Boolean ${op} created path "${res.id}".`);
                });
                boolGroup.appendChild(btn);
            }
            bar.appendChild(boolGroup);
        }

        return bar;
    }

    private renderOptionField(field: ToolOptionField): HTMLElement {
        const wrap = this.createElement("div", "ha-tool-opt-item");
        const lbl = this.createElement("span", "ha-tool-opt-label", `${field.label}:`);
        wrap.appendChild(lbl);

        const optsRecord = this.state.toolOptions as unknown as Record<string, any>;
        const curVal = optsRecord[field.key];

        if (field.type === "color") {
            const inp = this.createElement("input", "ha-color-input", undefined, {
                type: "color",
                value: String(curVal || "#00d4ff")
            });
            inp.addEventListener("input", () => {
                optsRecord[field.key] = inp.value;
            });
            wrap.appendChild(inp);
        } else if (field.type === "number") {
            const inp = this.createElement("input", "ha-input ha-tool-num-input", undefined, {
                type: "number",
                min: String(field.min ?? 0),
                max: String(field.max ?? 500),
                step: String(field.step ?? 1),
                value: String(curVal ?? 1)
            });
            inp.addEventListener("input", () => {
                optsRecord[field.key] = Number(inp.value);
            });
            wrap.appendChild(inp);
        } else if (field.type === "text") {
            const inp = this.createElement("input", "ha-input ha-tool-text-input", undefined, {
                type: "text",
                value: String(curVal ?? "")
            });
            inp.addEventListener("input", () => {
                optsRecord[field.key] = inp.value;
            });
            wrap.appendChild(inp);
        } else if (field.type === "boolean") {
            const inp = this.createElement("input", "ha-checkbox", undefined, {
                type: "checkbox"
            });
            inp.checked = Boolean(curVal);
            inp.addEventListener("change", () => {
                optsRecord[field.key] = inp.checked;
            });
            wrap.appendChild(inp);
        } else if (field.type === "select" && field.options) {
            const sel = this.createElement("select", "ha-select");
            for (const o of field.options) {
                const optEl = this.createElement("option", undefined, o.label, { value: o.value });
                if (o.value === curVal) optEl.selected = true;
                sel.appendChild(optEl);
            }
            sel.addEventListener("change", () => {
                optsRecord[field.key] = sel.value;
            });
            wrap.appendChild(sel);
        }

        return wrap;
    }

    public openNewCanvasDialog(): void {
        this.modal.openFormDialog({
            title: "Create New Hybrid Canvas",
            subtitle: "Choose a standard preset size below or customize your canvas dimensions, background color, and starting layers.",
            presets: [
                { label: "Standard (640×420)", icon: "🖼️", values: { width: "640", height: "420" } },
                { label: "HD 720p (1280×720)", icon: "📺", values: { width: "1280", height: "720" } },
                { label: "Full HD (1920×1080)", icon: "🖥️", values: { width: "1920", height: "1080" } },
                { label: "Square (512×512)", icon: "⬛", values: { width: "512", height: "512" } },
                { label: "UI Icon (128×128)", icon: "🎯", values: { width: "128", height: "128" } },
                { label: "Pixel Sprite (64×64)", icon: "👾", values: { width: "64", height: "64" } }
            ],
            fields: [
                {
                    key: "width",
                    label: "Canvas Width (px)",
                    type: "number",
                    min: 16,
                    max: 4096,
                    step: 8,
                    defaultValue: "640"
                },
                {
                    key: "height",
                    label: "Canvas Height (px)",
                    type: "number",
                    min: 16,
                    max: 4096,
                    step: 8,
                    defaultValue: "420"
                },
                {
                    key: "background",
                    label: "Canvas Background Color",
                    type: "color",
                    defaultValue: "#181a24",
                    quickChips: [
                        { label: "Dark Slate (#181a24)", value: "#181a24" },
                        { label: "Pure White (#ffffff)", value: "#ffffff" },
                        { label: "Transparent", value: "transparent" },
                        { label: "Charcoal (#10121a)", value: "#10121a" }
                    ]
                },
                {
                    key: "layerTemplate",
                    label: "Starting Layers Template",
                    type: "select",
                    defaultValue: "hybrid",
                    options: [
                        { label: "Hybrid Studio (1 GIMP Raster Layer + 1 Inkscape Vector Layer)", value: "hybrid" },
                        { label: "Vector Illustration Only (Inkscape Vector Layer)", value: "vector_only" },
                        { label: "Digital Painting / Pixel Art Only (GIMP Raster Layer)", value: "raster_only" }
                    ]
                }
            ],
            submitLabel: "Create Canvas",
            onSubmit: (vals) => {
                const w = Math.max(16, Number(vals.width) || 640);
                const h = Math.max(16, Number(vals.height) || 420);
                const tpl = vals.layerTemplate || "hybrid";
                const initialLayers =
                    tpl === "vector_only"
                        ? [{ name: "Main Vector Layer", type: "vector" as const, visible: true, opacity: 1, blendMode: "normal" as const }]
                        : tpl === "raster_only"
                          ? [{ name: "Base Raster Layer", type: "raster" as const, visible: true, opacity: 1, blendMode: "normal" as const }]
                          : [
                                { name: "Base Raster Layer", type: "raster" as const, visible: true, opacity: 1, blendMode: "normal" as const },
                                { name: "Main Vector Layer", type: "vector" as const, visible: true, opacity: 1, blendMode: "normal" as const }
                            ];
                this.state.exitSharedObjectEdit();
                this.state.engine.createCanvas(this.state.canvasId, w, h, vals.background || "#181a24", initialLayers);
                this.state.resolveActiveLayer();
                this.state.setStatus(`Created new ${w}×${h}px hybrid canvas.`);
            }
        });
    }

    public openFileDialogForMode(
        importMode: "new_canvas" | "append_layers" | "new_shared_object" | "into_active_shared_object",
        customTitle?: string,
        customSubtitle?: string
    ): void {
        const extraBookmarks = [
            { label: "Project Root", icon: "🎨", dirPath: this.state.projectRoot },
            { label: "Shared Library", icon: "📚", dirPath: this.state.library.getLibraryDir() }
        ];

        const titles: Record<typeof importMode, string> = {
            new_canvas: "Open Image or Artwork File",
            append_layers: "Import File as Layers into Current Canvas",
            new_shared_object: "Import File as a New Reusable Shared Object",
            into_active_shared_object: "Import Layers into Active Shared Object"
        };

        const subtitles: Record<typeof importMode, string> = {
            new_canvas: "Browse and double-click any file (.hacanvas, .ai, .psd, .xcf, .ora, .svg, .png, .jpg, .gif, .bmp, .tga, .pcx, .ico, ...) to open it as a canvas.",
            append_layers: "All vector and raster layers from the selected file (.ai, .psd, .xcf, .ora, .svg, or image) will be appended to your current canvas.",
            new_shared_object: "Creates a new categorized Shared Object from the selected file and places an <ObjectRef> instance on your canvas.",
            into_active_shared_object: "Appends all layers from the selected file directly inside the currently edited Shared Object sub-canvas."
        };

        this.modal.openFileBrowserDialog({
            title: customTitle || titles[importMode],
            subtitle: customSubtitle || subtitles[importMode],
            mode: "open",
            submitLabel: importMode === "new_canvas" ? "Open File" : "Import File",
            initialDir: this.state.currentFilePath ? path.dirname(this.state.currentFilePath) : this.state.projectRoot,
            extraBookmarks,
            onSubmit: (selectedPath) => {
                try {
                    if (importMode === "new_shared_object") {
                        const baseName = path.basename(selectedPath, path.extname(selectedPath)) || "ImportedAsset";
                        const cState = this.state.getCanvasState();
                        const createdSo = this.state.engine.createSharedObject(this.state.canvasId, {
                            name: `Imported/${baseName}`,
                            category: "Imported",
                            width: Math.min(256, cState.width),
                            height: Math.min(256, cState.height)
                        });
                        // Clear default empty layer before importing file layers into the Shared Object
                        const updatedState = this.state.getCanvasState();
                        if (updatedState.sharedObjects[createdSo.id]) {
                            updatedState.sharedObjects[createdSo.id].layers = [];
                            this.state.engine.saveCanvas(updatedState);
                        }
                        const res = this.state.engine.importArtFile(selectedPath, {
                            canvasId: this.state.canvasId,
                            mode: "into_shared_object",
                            sharedObjectId: createdSo.id
                        });
                        const vecLayer = this.state.resolveActiveLayer("vector");
                        const refObj = this.state.engine.instantiateObjectRef(this.state.canvasId, createdSo.id, {
                            layerId: vecLayer?.id,
                            x: 40,
                            y: 40
                        });
                        this.state.selectedObjectIds = [refObj.id];
                        this.state.configManager.addRecentFile(res.filePath);
                        this.state.setStatus(
                            `Imported "${path.basename(res.filePath)}" (${res.detectedFormat.toUpperCase()}, ${res.layersImported} layers) as Shared Object "${createdSo.name}".`
                        );
                        return;
                    }

                    if (importMode === "into_active_shared_object") {
                        const cState = this.state.getCanvasState();
                        const targetSoId = this.state.activeSharedObjectId || Object.keys(cState.sharedObjects)[0];
                        if (!targetSoId) {
                            this.state.setStatus("No Shared Object exists yet — importing as a new Shared Object instead.");
                            this.openFileDialogForMode("new_shared_object");
                            return;
                        }
                        const res = this.state.engine.importArtFile(selectedPath, {
                            canvasId: this.state.canvasId,
                            mode: "into_shared_object",
                            sharedObjectId: targetSoId
                        });
                        this.state.configManager.addRecentFile(res.filePath);
                        this.state.setStatus(
                            `Imported ${res.layersImported} layer(s) from "${path.basename(res.filePath)}" into Shared Object "${targetSoId}".`
                        );
                        return;
                    }

                    const res = this.state.engine.importArtFile(selectedPath, {
                        canvasId: this.state.canvasId,
                        mode: importMode
                    });
                    if (importMode === "new_canvas") {
                        this.state.exitSharedObjectEdit();
                        this.state.currentFilePath = res.filePath;
                    }
                    this.state.configManager.addRecentFile(res.filePath);
                    this.state.resolveActiveLayer();
                    this.state.setStatus(
                        `${importMode === "new_canvas" ? "Opened" : "Imported"} ${res.detectedFormat.toUpperCase()} (${res.layersImported} layer${res.layersImported === 1 ? "" : "s"}, ${res.width}×${res.height}px) from "${res.filePath}".`
                    );
                } catch (e: any) {
                    this.state.setStatus(`Error opening "${selectedPath}": ${e?.message || e}`);
                }
            }
        });
    }

    public openSaveDialog(saveAsCopy = false): void {
        this.modal.openFileBrowserDialog({
            title: saveAsCopy ? "Save a Copy of Canvas (.hacanvas)" : "Save Hybrid Canvas Project (.hacanvas)",
            subtitle: "Choose a destination folder and filename for your native .hacanvas ZIP+XML project archive.",
            mode: "save",
            submitLabel: saveAsCopy ? "Save Copy" : "Save .hacanvas",
            defaultExtension: ".hacanvas",
            initialDir: this.state.currentFilePath ? path.dirname(this.state.currentFilePath) : this.state.projectRoot,
            initialFileName: this.state.currentFilePath
                ? path.basename(this.state.currentFilePath)
                : saveAsCopy
                  ? "artwork_copy.hacanvas"
                  : "artwork.hacanvas",
            filters: [
                { label: "HAEditor Hybrid Canvas Archive (.hacanvas, .aicz)", extensions: [".hacanvas", ".aicz"] },
                { label: "All Files (*.*)", extensions: [] }
            ],
            onSubmit: (targetPath) => {
                try {
                    const res = this.state.engine.saveCanvas(this.state.canvasId, targetPath);
                    if (!saveAsCopy) {
                        this.state.currentFilePath = res.filePath;
                    }
                    this.state.configManager.addRecentFile(res.filePath);
                    this.state.setStatus(`Saved .hacanvas (${res.bytesWritten} bytes) to "${res.filePath}".`);
                } catch (e: any) {
                    this.state.setStatus(`Error saving file: ${e?.message || e}`);
                }
            }
        });
    }

    public openExportDialog(presetFormat?: string): void {
        const ext = presetFormat === "spritesheet" ? "png" : presetFormat === "farbfeld" ? "ff" : (presetFormat || "png");
        const defaultName = presetFormat === "spritesheet" ? "spritesheet_export.png" : `exported_artwork.${ext}`;
        this.modal.openFileBrowserDialog({
            title: presetFormat ? `Export Artwork as .${presetFormat.toUpperCase()}` : "Export Image / Vector / Animation As...",
            subtitle: "Choose the destination folder and filename. Next, a GIMP-style Export Settings dialog for the selected format will open.",
            mode: "save",
            submitLabel: "Export...",
            defaultExtension: `.${ext}`,
            initialDir: this.state.currentFilePath ? path.dirname(this.state.currentFilePath) : this.state.projectRoot,
            initialFileName: defaultName,
            filters: [
                {
                    label: "All Exportable Formats (.png, .jpg, .pdf, .svg, .gif, .ico, .bmp, .tga, .ora, .ppm, .ff)",
                    extensions: [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".svg", ".gif", ".ora", ".bmp", ".tga", ".ico", ".cur", ".ppm", ".pnm", ".ff", ".farbfeld", ".tiff", ".tif"]
                },
                { label: "Multi-Page PDF Document (.pdf)", extensions: [".pdf"] },
                { label: "PNG Image (.png)", extensions: [".png"] },
                { label: "JPEG / WebP Image (.jpg, .jpeg, .webp)", extensions: [".jpg", ".jpeg", ".webp"] },
                { label: "Windows Icon / Multi-Layer Icon (.ico, .cur)", extensions: [".ico", ".cur"] },
                { label: "Scalable Vector Graphics (.svg)", extensions: [".svg"] },
                { label: "Animated or Static GIF (.gif)", extensions: [".gif"] },
                { label: "OpenRaster Multi-Layer Archive (.ora)", extensions: [".ora"] },
                { label: "Windows Bitmap (.bmp)", extensions: [".bmp"] },
                { label: "Truevision Targa (.tga)", extensions: [".tga"] },
                { label: "Netpbm Portable Pixmap (.ppm, .pnm)", extensions: [".ppm", ".pnm"] },
                { label: "Farbfeld 16-bit RGBA (.ff, .farbfeld)", extensions: [".ff", ".farbfeld"] }
            ],
            onSubmit: (targetPath) => {
                const fmtToUse =
                    presetFormat ||
                    path.extname(targetPath).toLowerCase().replace(/^\./, "") ||
                    "png";
                this.openFormatExportSettingsDialog(targetPath, fmtToUse);
            }
        });
    }

    /**
     * Opens a GIMP-style format-specific Export Settings dialog after the target file path is chosen.
     * Supports per-layer icon format configuration for `.ico` (where each layer is exported as its own icon entry),
     * quality/subsampling for `.jpg`/`.webp`, compression/metadata for `.png`, animation/disposal/dithering for `.gif`,
     * bit-depth/color-space for `.bmp`, RLE/origin for `.tga`, Raw/ASCII for `.ppm`, vector scope for `.svg`,
     * composite/layer options for `.ora`, gamma for `.ff`, and grid layout for `spritesheet`.
     */
    public openFormatExportSettingsDialog(targetPath: string, rawFormat: string): void {
        const fmt = rawFormat.toLowerCase().replace(/^\./, "");

        if (fmt === "hacanvas" || fmt === "aicz") {
            try {
                const res = this.state.engine.exportCanvas(this.state.canvasId, fmt, targetPath);
                this.state.setStatus(`Exported ${res.format.toUpperCase()} (${res.bytesWritten} bytes) to "${res.filePath}".`);
            } catch (e: any) {
                this.state.setStatus(`Export failed: ${e?.message || e}`);
            }
            return;
        }

        if (fmt === "ico" || fmt === "cur") {
            this.openIcoExportSettingsDialog(targetPath, fmt);
            return;
        }

        const runExportWithOptions = (opts: ExportCanvasOptions) => {
            try {
                const fmtForEngine = fmt === "spritesheet" ? "sprite_sheet" : fmt;
                const res = this.state.engine.exportCanvas(this.state.canvasId, fmtForEngine, targetPath, opts);
                this.state.setStatus(`Exported ${res.format.toUpperCase()} (${res.bytesWritten} bytes) to "${res.filePath}".`);
            } catch (e: any) {
                this.state.setStatus(`Export failed: ${e?.message || e}`);
            }
        };

        const fileNameLabel = path.basename(targetPath);

        if (fmt === "pdf") {
            const st = this.state.getCanvasState();
            this.modal.openFormDialog({
                title: `Export Document as PDF — "${fileNameLabel}"`,
                subtitle:
                    "Configure multi-page PDF export (where each visible layer becomes a PDF page), selectable text & embedded font tables, and document metadata.",
                presets: [
                    {
                        label: "Layers as Pages (Selectable Text)",
                        icon: "📄",
                        values: {
                            layersAsPages: "true",
                            embedFonts: "true",
                            reversePageOrder: "false"
                        }
                    },
                    {
                        label: "Single Flattened Page",
                        icon: "🖼️",
                        values: {
                            layersAsPages: "false",
                            embedFonts: "true",
                            reversePageOrder: "false"
                        }
                    }
                ],
                fields: [
                    {
                        key: "layersAsPages",
                        label: "Multi-Page Mode (Layers as Pages)",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Export Each Layer as a Separate PDF Page (Recommended)", value: "true" },
                            { label: "Merge All Layers onto a Single PDF Page", value: "false" }
                        ]
                    },
                    {
                        key: "embedFonts",
                        label: "Selectable Text & Font Embedding",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            {
                                label: "Emit Native PDF Text (BT ... Tj ET) & Embed Fonts",
                                value: "true"
                            },
                            { label: "Standard Base14 Fonts Only", value: "false" }
                        ]
                    },
                    {
                        key: "reversePageOrder",
                        label: "Page Order",
                        type: "select",
                        defaultValue: "false",
                        options: [
                            { label: "Bottom-to-Top Layer Order (Page 1 = First Layer)", value: "false" },
                            { label: "Reverse Page Order (Top Layer First)", value: "true" }
                        ]
                    },
                    {
                        key: "title",
                        label: "PDF Document Title (/Info)",
                        type: "text",
                        defaultValue: st.metadata?.title || fileNameLabel
                    },
                    {
                        key: "author",
                        label: "PDF Author (/Info)",
                        type: "text",
                        defaultValue: st.metadata?.author || ""
                    }
                ],
                submitLabel: "Export PDF",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        layersAsPages: vals.layersAsPages !== "false",
                        embedFonts: vals.embedFonts !== "false",
                        reversePageOrder: vals.reversePageOrder === "true",
                        title: vals.title,
                        author: vals.author
                    });
                }
            });
            return;
        }

        if (fmt === "jpg" || fmt === "jpeg" || fmt === "webp") {
            this.modal.openFormDialog({
                title: `Export Image as ${fmt.toUpperCase()} — "${fileNameLabel}"`,
                subtitle: "Configure GIMP-style lossy compression quality, chroma subsampling, progressive encoding, and alpha background fill color.",
                presets: [
                    { label: "High Quality (92%)", icon: "✨", values: { quality: "92", subsampling: "4:4:4", progressive: "true", backgroundColor: "#ffffff" } },
                    { label: "Maximum (100%)", icon: "💎", values: { quality: "100", subsampling: "4:4:4", progressive: "false", backgroundColor: "#ffffff" } },
                    { label: "Balanced Web (80%)", icon: "🌐", values: { quality: "80", subsampling: "4:2:0", progressive: "true", backgroundColor: "#ffffff" } },
                    { label: "Small File (60%)", icon: "📦", values: { quality: "60", subsampling: "4:2:0", progressive: "true", backgroundColor: "#ffffff" } }
                ],
                fields: [
                    {
                        key: "quality",
                        label: "Quality (1–100)",
                        type: "number",
                        min: 1,
                        max: 100,
                        step: 1,
                        defaultValue: "90",
                        description: "Higher values preserve finer detail at the cost of a larger file size."
                    },
                    {
                        key: "subsampling",
                        label: "Chroma Subsampling",
                        type: "select",
                        defaultValue: "4:4:4",
                        options: [
                            { label: "4:4:4 (Best Quality — No Chroma Subsampling)", value: "4:4:4" },
                            { label: "4:2:2 (Horizontal Chroma Subsampling)", value: "4:2:2" },
                            { label: "4:2:0 (Quartered Chroma — Smallest File Size)", value: "4:2:0" }
                        ]
                    },
                    {
                        key: "progressive",
                        label: "Progressive Encoding",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Enabled (Multi-Scan Progressive JPEG)", value: "true" },
                            { label: "Disabled (Standard Baseline JPEG)", value: "false" }
                        ]
                    },
                    {
                        key: "backgroundColor",
                        label: "Transparency Matte / Background Fill Color",
                        type: "color",
                        defaultValue: "#ffffff",
                        description: "Transparent pixels are composited onto this solid color when exporting to JPEG."
                    },
                    {
                        key: "comment",
                        label: "Image Comment (COM Marker)",
                        type: "text",
                        defaultValue: "Created with HAEditor"
                    }
                ],
                submitLabel: `Export ${fmt.toUpperCase()}`,
                onSubmit: (vals) => {
                    runExportWithOptions({
                        quality: Math.max(1, Math.min(100, Number(vals.quality) || 90)),
                        subsampling: (vals.subsampling as any) || "4:4:4",
                        progressive: vals.progressive !== "false",
                        backgroundColor: vals.backgroundColor || "#ffffff",
                        comment: vals.comment
                    });
                }
            });
            return;
        }

        if (fmt === "gif") {
            const st = this.state.getCanvasState();
            const defaultDelay = String(Math.round(1000 / Math.max(1, st.animation.fps || 10)));
            const defaultMode = st.animation.durationFrames > 1 ? "timeline" : st.layers.length > 1 ? "layers" : "static";
            this.modal.openFormDialog({
                title: `Export Image as GIF — "${fileNameLabel}"`,
                subtitle: "Configure GIMP-style GIF animation options, frame delay, frame disposal method, and 216-color palette dithering.",
                presets: [
                    { label: "GIMP Layers as Animation", icon: "🎞️", values: { exportMode: "layers", loop: "true", defaultDelayMs: "100", disposal: "replace", dither: "false" } },
                    { label: "Timeline Animation", icon: "🎬", values: { exportMode: "timeline", loop: "true", defaultDelayMs: defaultDelay, disposal: "replace", dither: "false" } },
                    { label: "Static Flattened GIF", icon: "🖼️", values: { exportMode: "static", dither: "true" } }
                ],
                fields: [
                    {
                        key: "exportMode",
                        label: "GIF Export Mode",
                        type: "select",
                        defaultValue: defaultMode,
                        options: [
                            { label: "As Animation — Each Visible Layer = 1 Frame (GIMP Style)", value: "layers" },
                            { label: "As Animation — Animation Timeline Frames", value: "timeline" },
                            { label: "Single Static Image (Flattened Composite)", value: "static" }
                        ]
                    },
                    {
                        key: "loop",
                        label: "Loop Forever (NETSCAPE2.0 Extension)",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Loop Forever (Infinite Animation Loop)", value: "true" },
                            { label: "Play Once Only", value: "false" }
                        ],
                        visibleWhen: (vals) => vals.exportMode !== "static"
                    },
                    {
                        key: "defaultDelayMs",
                        label: "Delay Between Frames Where Unspecified (ms)",
                        type: "number",
                        min: 20,
                        max: 5000,
                        step: 10,
                        defaultValue: defaultDelay,
                        visibleWhen: (vals) => vals.exportMode !== "static"
                    },
                    {
                        key: "disposal",
                        label: "Frame Disposal Where Unspecified",
                        type: "select",
                        defaultValue: "replace",
                        options: [
                            { label: "One frame per layer (replace / restore background)", value: "replace" },
                            { label: "Cumulative layers (combine / do not dispose)", value: "combine" },
                            { label: "I don't care (unspecified)", value: "unspecified" }
                        ],
                        visibleWhen: (vals) => vals.exportMode !== "static"
                    },
                    {
                        key: "dither",
                        label: "Color Palette Dithering (216-Color Web Cube)",
                        type: "select",
                        defaultValue: "false",
                        options: [
                            { label: "None (Crisp Nearest Palette Match)", value: "false" },
                            { label: "Ordered Bayer 4×4 Dithering (Smooth Gradients)", value: "true" }
                        ]
                    },
                    {
                        key: "comment",
                        label: "GIF Comment",
                        type: "text",
                        defaultValue: "Created with HAEditor"
                    }
                ],
                submitLabel: "Export GIF",
                onSubmit: (vals) => {
                    const mode = vals.exportMode || defaultMode;
                    runExportWithOptions({
                        asAnimation: mode !== "static",
                        layersAsFrames: mode === "layers",
                        loop: vals.loop !== "false",
                        defaultDelayMs: Math.max(20, Number(vals.defaultDelayMs) || 100),
                        disposal: (vals.disposal as any) || "replace",
                        dither: vals.dither === "true",
                        comment: vals.comment
                    });
                }
            });
            return;
        }

        if (fmt === "bmp") {
            this.modal.openFormDialog({
                title: `Export Image as BMP — "${fileNameLabel}"`,
                subtitle: "Configure GIMP-style Windows Bitmap pixel bit depth, sRGB color space header, and scanline row order.",
                presets: [
                    { label: "32-bit BGRA (Alpha)", icon: "✨", values: { bmpBpp: "32", writeColorSpace: "false", topDown: "true" } },
                    { label: "24-bit BGR (Standard)", icon: "🪟", values: { bmpBpp: "24", writeColorSpace: "false", topDown: "false" } },
                    { label: "16-bit R5G6B5 (Game)", icon: "🎮", values: { bmpBpp: "16", writeColorSpace: "false", topDown: "false" } }
                ],
                fields: [
                    {
                        key: "bmpBpp",
                        label: "Pixel Format / Bit Depth",
                        type: "select",
                        defaultValue: "32",
                        options: [
                            { label: "32 bits (A8 R8 G8 B8 — Full 8-bit Alpha)", value: "32" },
                            { label: "24 bits (R8 G8 B8 — Standard 24-bit TrueColor)", value: "24" },
                            { label: "16 bits (R5 G6 B5 — High-Color 16-bit)", value: "16" }
                        ]
                    },
                    {
                        key: "writeColorSpace",
                        label: "Compatibility Options (Color Space Info)",
                        type: "select",
                        defaultValue: "false",
                        options: [
                            { label: "Write standard 40-byte BITMAPINFOHEADER (Max Compatibility)", value: "false" },
                            { label: "Write 108-byte BITMAPV4HEADER with sRGB Color Space", value: "true" }
                        ]
                    },
                    {
                        key: "topDown",
                        label: "Scanline Row Order",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Top-Down Scanlines", value: "true" },
                            { label: "Bottom-Up Scanlines (Classic Windows DIB)", value: "false" }
                        ]
                    }
                ],
                submitLabel: "Export BMP",
                onSubmit: (vals) => {
                    const bppNum = Number(vals.bmpBpp);
                    runExportWithOptions({
                        bmpBpp: bppNum === 16 || bppNum === 24 ? bppNum : 32,
                        writeColorSpace: vals.writeColorSpace === "true",
                        topDown: vals.topDown !== "false"
                    });
                }
            });
            return;
        }

        if (fmt === "tga") {
            this.modal.openFormDialog({
                title: `Export Image as TGA — "${fileNameLabel}"`,
                subtitle: "Configure GIMP-style Truevision Targa RLE compression, image origin corner, and bit depth.",
                presets: [
                    { label: "32-bit RLE Compressed", icon: "📦", values: { rle: "true", origin: "top_left", tgaBpp: "32" } },
                    { label: "32-bit Uncompressed", icon: "🖼️", values: { rle: "false", origin: "top_left", tgaBpp: "32" } },
                    { label: "24-bit Bottom-Left", icon: "🎮", values: { rle: "true", origin: "bottom_left", tgaBpp: "24" } }
                ],
                fields: [
                    {
                        key: "rle",
                        label: "RLE Compression",
                        type: "select",
                        defaultValue: "false",
                        options: [
                            { label: "Disabled (Uncompressed True-Color Type 2)", value: "false" },
                            { label: "Enabled (Run-Length Encoded True-Color Type 10)", value: "true" }
                        ]
                    },
                    {
                        key: "origin",
                        label: "Image Origin",
                        type: "select",
                        defaultValue: "top_left",
                        options: [
                            { label: "Top-Left", value: "top_left" },
                            { label: "Bottom-Left (Classic OpenGL / TGA)", value: "bottom_left" }
                        ]
                    },
                    {
                        key: "tgaBpp",
                        label: "Bit Depth",
                        type: "select",
                        defaultValue: "32",
                        options: [
                            { label: "32 bpp (BGRA + 8-bit Alpha Channel)", value: "32" },
                            { label: "24 bpp (BGR Opaque)", value: "24" }
                        ]
                    }
                ],
                submitLabel: "Export TGA",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        rle: vals.rle === "true",
                        origin: vals.origin === "bottom_left" ? "bottom_left" : "top_left",
                        tgaBpp: Number(vals.tgaBpp) === 24 ? 24 : 32
                    });
                }
            });
            return;
        }

        if (fmt === "ppm" || fmt === "pnm") {
            this.modal.openFormDialog({
                title: `Export Image as PNM / PPM — "${fileNameLabel}"`,
                subtitle: "Choose GIMP-style Netpbm data formatting (Raw binary P6 vs ASCII plaintext P3).",
                presets: [
                    { label: "Raw Binary (P6)", icon: "⚡", values: { dataFormatting: "raw" } },
                    { label: "ASCII Plaintext (P3)", icon: "📝", values: { dataFormatting: "ascii" } }
                ],
                fields: [
                    {
                        key: "dataFormatting",
                        label: "Data Formatting",
                        type: "select",
                        defaultValue: "raw",
                        options: [
                            { label: "Raw (Binary P6 — Compact & Fast)", value: "raw" },
                            { label: "ASCII (Plaintext P3 — Human-Readable RGB Triplets)", value: "ascii" }
                        ]
                    }
                ],
                submitLabel: "Export PPM",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        dataFormatting: vals.dataFormatting === "ascii" ? "ascii" : "raw"
                    });
                }
            });
            return;
        }

        if (fmt === "svg") {
            this.modal.openFormDialog({
                title: `Export Artwork as SVG — "${fileNameLabel}"`,
                subtitle: "Configure Inkscape/GIMP SVG export scope, Shared Object <defs>, background rectangle, and XML formatting.",
                presets: [
                    { label: "Full Hybrid SVG", icon: "🎨", values: { exportScope: "all", includeSharedDefs: "true", includeBackground: "true", exportHiddenLayers: "false", prettyPrint: "true" } },
                    { label: "Pure Vector Paths Only", icon: "✒️", values: { exportScope: "vector_only", includeSharedDefs: "true", includeBackground: "false", exportHiddenLayers: "false", prettyPrint: "true" } },
                    { label: "Minified Web SVG", icon: "🌐", values: { exportScope: "all", includeSharedDefs: "true", includeBackground: "false", exportHiddenLayers: "false", prettyPrint: "false" } }
                ],
                fields: [
                    {
                        key: "exportScope",
                        label: "Layer Export Scope",
                        type: "select",
                        defaultValue: "all",
                        options: [
                            { label: "All Layers (Vector Paths + Embedded Base64 Raster Layers)", value: "all" },
                            { label: "Vector Layers Only (Omit Raster Layers)", value: "vector_only" }
                        ]
                    },
                    {
                        key: "includeSharedDefs",
                        label: "Shared Objects (<defs>)",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Include Shared Object Definitions in <defs>", value: "true" },
                            { label: "Omit <defs> Block", value: "false" }
                        ]
                    },
                    {
                        key: "includeBackground",
                        label: "Canvas Background Rectangle",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Include Background <rect> When Non-Transparent", value: "true" },
                            { label: "Transparent Background (Omit Background <rect>)", value: "false" }
                        ]
                    },
                    {
                        key: "exportHiddenLayers",
                        label: "Hidden Layers",
                        type: "select",
                        defaultValue: "false",
                        options: [
                            { label: "Export Visible Layers Only", value: "false" },
                            { label: "Include Hidden Layers (display=\"none\")", value: "true" }
                        ]
                    },
                    {
                        key: "prettyPrint",
                        label: "XML Output Formatting",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Pretty-Printed Indented XML", value: "true" },
                            { label: "Minified Compact XML", value: "false" }
                        ]
                    }
                ],
                submitLabel: "Export SVG",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        exportScope: vals.exportScope === "vector_only" ? "vector_only" : "all",
                        includeSharedDefs: vals.includeSharedDefs !== "false",
                        includeBackground: vals.includeBackground !== "false",
                        exportHiddenLayers: vals.exportHiddenLayers === "true",
                        prettyPrint: vals.prettyPrint !== "false"
                    });
                }
            });
            return;
        }

        if (fmt === "ora") {
            this.modal.openFormDialog({
                title: `Export Image as OpenRaster (.ORA) — "${fileNameLabel}"`,
                subtitle: "Configure OpenRaster multi-layer archive options, merged composite preview, and PNG layer compression.",
                fields: [
                    {
                        key: "includeMergedComposite",
                        label: "Merged Composite & Thumbnail (mergedimage.png)",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Include mergedimage.png & Thumbnails/thumbnail.png (Standard ORA)", value: "true" },
                            { label: "Layer Stack Only (Faster, Smaller File)", value: "false" }
                        ]
                    },
                    {
                        key: "exportHiddenLayers",
                        label: "Hidden Layers",
                        type: "select",
                        defaultValue: "true",
                        options: [
                            { label: "Include All Layers (Preserve visibility=\"hidden\")", value: "true" },
                            { label: "Export Visible Layers Only", value: "false" }
                        ]
                    },
                    {
                        key: "compressionLevel",
                        label: "PNG Layer Compression Level (0–9)",
                        type: "number",
                        min: 0,
                        max: 9,
                        step: 1,
                        defaultValue: "6"
                    }
                ],
                submitLabel: "Export ORA",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        includeMergedComposite: vals.includeMergedComposite !== "false",
                        exportHiddenLayers: vals.exportHiddenLayers !== "false",
                        compressionLevel: Math.max(0, Math.min(9, Number(vals.compressionLevel ?? 6)))
                    });
                }
            });
            return;
        }

        if (fmt === "ff" || fmt === "farbfeld") {
            this.modal.openFormDialog({
                title: `Export Image as Farbfeld (.FF) — "${fileNameLabel}"`,
                subtitle: "Configure suckless Farbfeld 16-bit big-endian RGBA channel quantization.",
                fields: [
                    {
                        key: "applyGamma",
                        label: "16-Bit Channel Quantization Mode",
                        type: "select",
                        defaultValue: "false",
                        options: [
                            { label: "Standard sRGB 8-to-16 Bit Replication (v × 257)", value: "false" },
                            { label: "Linear 2.2 Gamma Expansion to 16-bit Channels", value: "true" }
                        ]
                    }
                ],
                submitLabel: "Export Farbfeld",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        applyGamma: vals.applyGamma === "true"
                    });
                }
            });
            return;
        }

        if (fmt === "spritesheet" || fmt === "sprite_sheet") {
            this.modal.openFormDialog({
                title: `Export Sprite Sheet as PNG — "${fileNameLabel}"`,
                subtitle: "Configure sprite cell source (animation frames vs layers), grid column count, padding, and PNG compression.",
                presets: [
                    { label: "Horizontal Strip (All Frames)", icon: "🎞️", values: { sourceMode: "animation_frames", columns: "0", padding: "0", compressionLevel: "6" } },
                    { label: "4-Column Sprite Grid", icon: "🪟", values: { sourceMode: "animation_frames", columns: "4", padding: "2", compressionLevel: "6" } },
                    { label: "Layers as Sprite Sheet", icon: "🗂️", values: { sourceMode: "layers", columns: "4", padding: "0", compressionLevel: "6" } }
                ],
                fields: [
                    {
                        key: "sourceMode",
                        label: "Sprite Cells Source",
                        type: "select",
                        defaultValue: "animation_frames",
                        options: [
                            { label: "Animation Timeline Frames", value: "animation_frames" },
                            { label: "Visible Canvas Layers (1 Cell per Layer)", value: "layers" }
                        ]
                    },
                    {
                        key: "columns",
                        label: "Grid Columns (0 = Single Horizontal Row)",
                        type: "number",
                        min: 0,
                        max: 64,
                        step: 1,
                        defaultValue: "0"
                    },
                    {
                        key: "padding",
                        label: "Spacing / Padding Between Sprite Cells (px)",
                        type: "number",
                        min: 0,
                        max: 64,
                        step: 1,
                        defaultValue: "0"
                    },
                    {
                        key: "compressionLevel",
                        label: "PNG Compression Level (0–9)",
                        type: "number",
                        min: 0,
                        max: 9,
                        step: 1,
                        defaultValue: "6"
                    }
                ],
                submitLabel: "Export Sprite Sheet",
                onSubmit: (vals) => {
                    runExportWithOptions({
                        sourceMode: vals.sourceMode === "layers" ? "layers" : "animation_frames",
                        columns: Math.max(0, Number(vals.columns) || 0),
                        padding: Math.max(0, Number(vals.padding) || 0),
                        compressionLevel: Math.max(0, Math.min(9, Number(vals.compressionLevel ?? 6)))
                    });
                }
            });
            return;
        }

        // Default / PNG Export Settings Dialog (like GIMP's "Export Image as PNG")
        this.modal.openFormDialog({
            title: `Export Image as PNG — "${fileNameLabel}"`,
            subtitle: "Configure GIMP-style PNG compression level, pixel format, background color chunk (bKGD), DPI resolution (pHYs), and metadata.",
            presets: [
                { label: "Default Lossless (Level 6)", icon: "🖼️", values: { compressionLevel: "6", pixelFormat: "rgba8", saveBackground: "true", saveResolution: "true", saveCreationTime: "true" } },
                { label: "Max Compression (Level 9)", icon: "📦", values: { compressionLevel: "9", pixelFormat: "rgba8", saveBackground: "false", saveResolution: "false", saveCreationTime: "false" } },
                { label: "Fast Uncompressed (Level 0)", icon: "⚡", values: { compressionLevel: "0", pixelFormat: "rgba8", saveBackground: "true", saveResolution: "true", saveCreationTime: "false" } },
                { label: "24-bit RGB (No Alpha)", icon: "🎨", values: { compressionLevel: "6", pixelFormat: "rgb8", saveBackground: "true", saveResolution: "true", saveCreationTime: "false" } }
            ],
            fields: [
                {
                    key: "compressionLevel",
                    label: "Compression Level (0 = None, 9 = Smallest File)",
                    type: "number",
                    min: 0,
                    max: 9,
                    step: 1,
                    defaultValue: "6"
                },
                {
                    key: "pixelFormat",
                    label: "Pixel Format",
                    type: "select",
                    defaultValue: "rgba8",
                    options: [
                        { label: "8bpc RGBA (32-bit TrueColor + Alpha)", value: "rgba8" },
                        { label: "8bpc RGB (24-bit TrueColor, Opaque)", value: "rgb8" },
                        { label: "8bpc GRAYA (16-bit Grayscale + Alpha)", value: "graya8" },
                        { label: "8bpc GRAY (8-bit Grayscale, Opaque)", value: "gray8" }
                    ]
                },
                {
                    key: "saveBackground",
                    label: "Save Background Color (bKGD Chunk)",
                    type: "select",
                    defaultValue: "true",
                    options: [
                        { label: "Enabled (Save Canvas Background Color)", value: "true" },
                        { label: "Disabled", value: "false" }
                    ]
                },
                {
                    key: "saveResolution",
                    label: "Save Resolution / DPI (pHYs Chunk)",
                    type: "select",
                    defaultValue: "true",
                    options: [
                        { label: "Enabled (Save Canvas DPI Resolution)", value: "true" },
                        { label: "Disabled", value: "false" }
                    ]
                },
                {
                    key: "saveCreationTime",
                    label: "Save Creation Time (tIME Chunk)",
                    type: "select",
                    defaultValue: "true",
                    options: [
                        { label: "Enabled", value: "true" },
                        { label: "Disabled", value: "false" }
                    ]
                },
                {
                    key: "comment",
                    label: "PNG Comment (tEXt Chunk)",
                    type: "text",
                    defaultValue: "Created with HAEditor"
                }
            ],
            submitLabel: "Export PNG",
            onSubmit: (vals) => {
                runExportWithOptions({
                    compressionLevel: Math.max(0, Math.min(9, Number(vals.compressionLevel ?? 6))),
                    pixelFormat: (vals.pixelFormat as any) || "rgba8",
                    saveBackground: vals.saveBackground !== "false",
                    saveResolution: vals.saveResolution !== "false",
                    saveCreationTime: vals.saveCreationTime !== "false",
                    comment: vals.comment
                });
            }
        });
    }

    /**
     * Opens the GIMP-style "Export Image as Windows Icon (.ICO)" dialog where each layer in the canvas
     * is treated as its own icon entry within the `.ico` container with configurable per-layer bit depth,
     * palette mode, dimensions, and `Compressed (PNG)` toggle.
     */
    public openIcoExportSettingsDialog(targetPath: string, fmtToUse: string = "ico"): void {
        this.modal.closeDialog();
        const st = this.state.getCanvasState();
        const layers = st.layers;
        const iconW = Math.min(256, Math.max(1, st.width));
        const iconH = Math.min(256, Math.max(1, st.height));

        const backdrop = this.createElement("div", "ha-modal-backdrop", undefined, {
            id: "ha-modal-backdrop"
        });
        const card = this.createElement("div", "ha-modal-card ha-modal-card-wide ha-ico-export-dialog", undefined, {
            id: "ha-ico-export-dialog"
        });

        const header = this.createElement("div", "ha-modal-header ha-fb-header");
        const titleSpan = this.createElement(
            "span",
            undefined,
            `Export Image as Windows Icon (.${fmtToUse.toUpperCase()}) — "${path.basename(targetPath)}"`
        );
        const closeXBtn = this.createElement("button", "ha-icon-btn", "✕", {
            title: "Close (Esc)",
            type: "button"
        });
        closeXBtn.addEventListener("click", () => this.modal.closeDialog());
        header.append(titleSpan, closeXBtn);

        const body = this.createElement("div", "ha-modal-body");
        body.appendChild(
            this.createElement(
                "div",
                "ha-modal-subtitle-banner",
                "Icon Details (GIMP Windows Icon Export): Each layer below is exported as its own icon entry inside the .ico file. Choose the bit depth / palette format, optional icon size, and PNG compression for each layer."
            )
        );

        // Quick Batch Presets Bar for all layers
        const batchBar = this.createElement("div", "ha-modal-presets-box");
        batchBar.appendChild(this.createElement("span", "ha-modal-presets-label", "Apply to All Layers:"));
        const pillsRow = this.createElement("div", "ha-modal-presets-row");

        interface LayerRowControls {
            layerId: string;
            includeChk: HTMLInputElement;
            bppSelect: HTMLSelectElement;
            sizeSelect: HTMLSelectElement;
            compressedChk: HTMLInputElement;
        }
        const rowControls: LayerRowControls[] = [];

        const applyBatchToAll = (bpp: string, compressed: boolean) => {
            for (const rc of rowControls) {
                rc.bppSelect.value = bpp;
                rc.compressedChk.checked = compressed;
            }
        };

        const batchPresets: Array<{ label: string; icon: string; bpp: string; compressed: boolean }> = [
            { label: "All 32-bpp 8-bit Alpha (Standard DIB)", icon: "🪟", bpp: "32", compressed: false },
            { label: "All 32-bpp Compressed (PNG)", icon: "📦", bpp: "32", compressed: true },
            { label: "All 24-bpp 1-bit Alpha", icon: "🎨", bpp: "24", compressed: false },
            { label: "All 8-bpp (256-Slot Palette)", icon: "👾", bpp: "8", compressed: false },
            { label: "All 4-bpp (16-Slot Palette)", icon: "🕹️", bpp: "4", compressed: false },
            { label: "All 1-bpp Monochrome (2-Slot)", icon: "⬛", bpp: "1", compressed: false }
        ];
        for (const bp of batchPresets) {
            const btn = this.createElement("button", "ha-modal-preset-pill", `${bp.icon} ${bp.label}`, {
                type: "button"
            });
            btn.addEventListener("click", () => applyBatchToAll(bp.bpp, bp.compressed));
            pillsRow.appendChild(btn);
        }
        batchBar.appendChild(pillsRow);
        body.appendChild(batchBar);

        // Per-layer table header
        const listContainer = this.createElement("div", "ha-ico-layer-list", undefined, {
            id: "ha-ico-export-layer-list"
        });

        const bppOptions: Array<{ label: string; value: string }> = [
            { label: "32 bpp, 8-bit alpha, no palette", value: "32" },
            { label: "24 bpp, 1-bit alpha, no palette", value: "24" },
            { label: "8 bpp, 1-bit alpha, 256-slot palette", value: "8" },
            { label: "4 bpp, 1-bit alpha, 16-slot palette", value: "4" },
            { label: "1 bpp, 1-bit alpha, 2-slot palette", value: "1" }
        ];

        const sizeOptions: Array<{ label: string; value: string }> = [
            { label: `Canvas Size (${iconW}×${iconH} px)`, value: "0" },
            { label: "256×256 px (Extra Large)", value: "256" },
            { label: "128×128 px (Large)", value: "128" },
            { label: "64×64 px (High-DPI)", value: "64" },
            { label: "48×48 px (Medium Explorer)", value: "48" },
            { label: "32×32 px (Standard Desktop)", value: "32" },
            { label: "24×24 px (Toolbar)", value: "24" },
            { label: "16×16 px (Small Title/Menu)", value: "16" }
        ];

        layers.forEach((layer, idx) => {
            const row = this.createElement("div", "ha-ico-layer-row", undefined, {
                "data-layer-id": layer.id,
                "data-layer-index": String(idx)
            });

            // 1. Include Checkbox
            const includeChk = this.createElement("input", "ha-checkbox ha-ico-layer-include", undefined, {
                type: "checkbox",
                "data-ico-layer-include": layer.id,
                title: "Include this layer as an icon entry in the exported .ico file"
            }) as HTMLInputElement;
            includeChk.checked = layer.visible || layers.length === 1;

            // 2. Layer Thumbnail Canvas (36x36)
            const thumbCanvas = this.createElement("canvas", "ha-ico-layer-thumb", undefined, {
                width: "36",
                height: "36"
            }) as HTMLCanvasElement;
            try {
                const snap = this.state.engine.captureSnapshot({
                    canvasId: this.state.canvasId,
                    targetType: "layer",
                    targetId: layer.id,
                    frame: this.state.currentFrame
                });
                const tCtx = thumbCanvas.getContext("2d");
                if (tCtx) {
                    for (let y = 0; y < 36; y += 6) {
                        for (let x = 0; x < 36; x += 6) {
                            tCtx.fillStyle = ((x / 6 + y / 6) & 1) === 0 ? "#252a3d" : "#181c2b";
                            tCtx.fillRect(x, y, 6, 6);
                        }
                    }
                    const img = new Image();
                    img.onload = () => {
                        tCtx.drawImage(img, 0, 0, 36, 36);
                    };
                    img.src = `data:image/png;base64,${snap.base64}`;
                }
            } catch {
                // Ignore thumbnail render error
            }

            // 3. Layer Name & Info
            const metaCol = this.createElement("div", "ha-ico-layer-meta");
            const nameEl = this.createElement(
                "div",
                "ha-ico-layer-name",
                `Icon #${idx + 1}: ${layer.name}`
            );
            const subEl = this.createElement(
                "div",
                "ha-ico-layer-sub",
                `${layer.type.toUpperCase()} • ${iconW}×${iconH}px${layer.visible ? "" : " (hidden)"}`
            );
            metaCol.append(nameEl, subEl);

            // 4. GIMP Per-Layer Icon Format (BPP / Alpha / Palette) Select
            const bppSelect = this.createElement("select", "ha-select ha-ico-layer-bpp", undefined, {
                "data-ico-layer-bpp": layer.id,
                title: "Icon color depth, alpha bits, and palette slots for this layer"
            }) as HTMLSelectElement;
            for (const opt of bppOptions) {
                const oEl = this.createElement("option", undefined, opt.label, { value: opt.value });
                if (opt.value === "32") oEl.selected = true;
                bppSelect.appendChild(oEl);
            }

            // 5. Optional Icon Resolution Size Select
            const sizeSelect = this.createElement("select", "ha-select ha-ico-layer-size", undefined, {
                "data-ico-layer-size": layer.id,
                title: "Target icon entry dimensions in the .ico directory"
            }) as HTMLSelectElement;
            for (const opt of sizeOptions) {
                const oEl = this.createElement("option", undefined, opt.label, { value: opt.value });
                if (opt.value === "0") oEl.selected = true;
                sizeSelect.appendChild(oEl);
            }

            // 6. GIMP "Compressed (PNG)" Checkbox per Layer
            const compWrap = this.createElement("label", "ha-ico-layer-compressed-label", undefined, {
                title: "Store this layer's icon entry as a lossless compressed PNG stream inside the .ico file"
            });
            const compressedChk = this.createElement("input", "ha-checkbox ha-ico-layer-compressed", undefined, {
                type: "checkbox",
                "data-ico-layer-compressed": layer.id
            }) as HTMLInputElement;
            compressedChk.checked = st.width >= 256 || st.height >= 256;
            const compText = this.createElement("span", undefined, "Compressed (PNG)");
            compWrap.append(compressedChk, compText);

            rowControls.push({
                layerId: layer.id,
                includeChk,
                bppSelect,
                sizeSelect,
                compressedChk
            });

            row.append(includeChk, thumbCanvas, metaCol, bppSelect, sizeSelect, compWrap);
            listContainer.appendChild(row);
        });

        body.appendChild(listContainer);

        const footer = this.createElement("div", "ha-modal-footer");
        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Cancel", {
            id: "ha-modal-cancel",
            type: "button"
        });
        const submitBtn = this.createElement("button", "ha-btn ha-btn-primary", `Export .${fmtToUse.toUpperCase()}`, {
            id: "ha-modal-submit",
            type: "button"
        });

        cancelBtn.addEventListener("click", () => this.modal.closeDialog());
        submitBtn.addEventListener("click", () => {
            const icoLayers: IcoLayerExportOption[] = rowControls.map((rc) => {
                const rawBpp = Number(rc.bppSelect.value);
                const bpp: IcoIconFormatBpp =
                    rawBpp === 1 || rawBpp === 4 || rawBpp === 8 || rawBpp === 24 || rawBpp === 32 ? rawBpp : 32;
                const sz = Number(rc.sizeSelect.value) || 0;
                return {
                    layerId: rc.layerId,
                    include: rc.includeChk.checked,
                    bpp,
                    compressed: rc.compressedChk.checked,
                    width: sz > 0 ? sz : undefined,
                    height: sz > 0 ? sz : undefined
                };
            });

            this.modal.closeDialog();
            try {
                const res = this.state.engine.exportCanvas(this.state.canvasId, fmtToUse, targetPath, {
                    icoLayers
                });
                const countInfo = res.iconCount ? ` (${res.iconCount} layer icon${res.iconCount === 1 ? "" : "s"})` : "";
                this.state.setStatus(
                    `Exported ${res.format.toUpperCase()}${countInfo} (${res.bytesWritten} bytes) to "${res.filePath}".`
                );
            } catch (e: any) {
                this.state.setStatus(`Export failed: ${e?.message || e}`);
            }
        });

        footer.append(cancelBtn, submitBtn);
        card.append(header, body, footer);
        backdrop.appendChild(card);
        this.doc.body.appendChild(backdrop);
        (this.modal as any).activeBackdrop = backdrop;
    }

    public openUndoHistoryDialog(): void {
        const hist = this.state.engine.getUndoHistory(this.state.canvasId);
        const combinedEntries = [
            ...hist.undoList.map((e, i) => ({
                id: e.id,
                label: e.label,
                timestamp: e.timestamp,
                delta: -(hist.undoList.length - i),
                isCurrent: false
            })),
            {
                id: "current",
                label: hist.currentLabel || "Current State",
                timestamp: Date.now(),
                delta: 0,
                isCurrent: true
            },
            ...hist.redoList.map((e, i) => ({
                id: e.id,
                label: e.label,
                timestamp: e.timestamp,
                delta: i + 1,
                isCurrent: false
            }))
        ];
        const overlay = this.doc.createElement("div");
        overlay.className = "ha-modal-overlay";
        overlay.id = "ha-undo-history-modal";

        const card = this.doc.createElement("div");
        card.className = "ha-modal-card ha-modal-card-wide";

        const header = this.doc.createElement("div");
        header.className = "ha-modal-header";
        header.innerHTML = `<div class="ha-modal-title">⏪ GIMP Undo History (${combinedEntries.length} states)</div>`;
        const closeBtn = this.doc.createElement("button");
        closeBtn.className = "ha-icon-btn";
        closeBtn.textContent = "✖";
        closeBtn.type = "button";
        closeBtn.addEventListener("click", () => overlay.remove());
        header.appendChild(closeBtn);
        card.appendChild(header);

        const sub = this.doc.createElement("div");
        sub.className = "ha-modal-subtitle";
        sub.textContent =
            "Click any history state below to jump directly to that point in time, or use Undo (Ctrl+Z) and Redo (Ctrl+Y).";
        card.appendChild(sub);

        const listWrap = this.doc.createElement("div");
        listWrap.style.cssText =
            "max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin:10px 0;padding:6px;background:#12141f;border:1px solid #2b2f42;border-radius:6px;";

        combinedEntries.forEach((entry, idx) => {
            const isCurrent = entry.isCurrent;
            const row = this.doc.createElement("button");
            row.type = "button";
            row.className = `ha-btn ${isCurrent ? "ha-btn-primary" : "ha-btn-secondary"}`;
            row.style.cssText = "display:flex;justify-content:space-between;align-items:center;text-align:left;padding:6px 10px;";
            const timeStr = new Date(entry.timestamp).toLocaleTimeString();
            row.innerHTML = `<span>${isCurrent ? "👉 " : "🕓 "}<strong>#${idx}</strong> — ${entry.label}</span><span style="opacity:0.75;font-size:11px;">${timeStr}${isCurrent ? " (Current)" : ""}</span>`;
            row.addEventListener("click", () => {
                if (entry.delta !== 0) {
                    this.state.engine.jumpToHistoryState(this.state.canvasId, entry.delta);
                    this.state.resolveActiveLayer();
                    this.state.setStatus(`Jumped to history state #${idx}: ${entry.label}`);
                }
                overlay.remove();
            });
            listWrap.appendChild(row);
        });
        card.appendChild(listWrap);

        const footer = this.doc.createElement("div");
        footer.className = "ha-modal-footer";
        const clearBtn = this.doc.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "ha-btn ha-btn-secondary";
        clearBtn.textContent = "🧹 Clear Undo History";
        clearBtn.addEventListener("click", () => {
            this.state.clearUndoHistory();
            overlay.remove();
        });
        const doneBtn = this.doc.createElement("button");
        doneBtn.type = "button";
        doneBtn.className = "ha-btn ha-btn-primary";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", () => overlay.remove());
        footer.append(clearBtn, doneBtn);
        card.appendChild(footer);

        overlay.appendChild(card);
        this.doc.body.appendChild(overlay);
    }

    public openCanvasSizeDialog(): void {
        const st = this.state.getCanvasState();
        const oldW = Math.max(1, st.width);
        const oldH = Math.max(1, st.height);

        // Pre-render a composite thumbnail of the current canvas so the GIMP offset preview shows the actual artwork
        const thumbCanvas = this.doc.createElement("canvas");
        thumbCanvas.width = oldW;
        thumbCanvas.height = oldH;
        try {
            const comp = this.state.engine.compositeCanvasFrame(st, {
                frame: this.state.currentFrame
            });
            const tCtx = thumbCanvas.getContext("2d");
            if (tCtx && comp.pixels && comp.width > 0 && comp.height > 0) {
                const imgData = tCtx.createImageData(comp.width, comp.height);
                imgData.data.set(
                    new Uint8ClampedArray(comp.pixels.buffer, comp.pixels.byteOffset, comp.pixels.byteLength)
                );
                tCtx.putImageData(imgData, 0, 0);
            }
        } catch {
            // Fallback if canvas composite is unavailable
        }

        this.modal.openFormDialog({
            title: "Set Image Canvas Size (GIMP Canvas Size)",
            subtitle:
                "Resize the canvas boundaries without stretching existing artwork. Drag the preview or use the alignment buttons to position the X/Y offset visually.",
            presets: [
                { label: "Standard (640×420)", icon: "🖼️", values: { width: "640", height: "420", offsetX: "0", offsetY: "0" } },
                { label: "HD 720p (1280×720)", icon: "📺", values: { width: "1280", height: "720", offsetX: "0", offsetY: "0" } },
                { label: "Full HD (1920×1080)", icon: "🖥️", values: { width: "1920", height: "1080", offsetX: "0", offsetY: "0" } },
                { label: "Add 64px Padding Around", icon: "➕", values: { width: String(oldW + 128), height: String(oldH + 128), offsetX: "64", offsetY: "64" } }
            ],
            fields: [
                { key: "width", label: "Canvas Width (px)", type: "number", min: 1, max: 8192, step: 8, defaultValue: String(oldW) },
                { key: "height", label: "Canvas Height (px)", type: "number", min: 1, max: 8192, step: 8, defaultValue: String(oldH) },
                { key: "offsetX", label: "Offset X (px)", type: "number", min: -4096, max: 4096, step: 1, defaultValue: "0" },
                { key: "offsetY", label: "Offset Y (px)", type: "number", min: -4096, max: 4096, step: 1, defaultValue: "0" }
            ],
            customPreview: ({ getValues, setValues, onChange }) => {
                const previewBox = this.createElement("div", "ha-canvas-size-preview-box", undefined, {
                    id: "ha-canvas-size-preview-box"
                });

                const headerRow = this.createElement("div", "ha-canvas-size-preview-header");
                const titleEl = this.createElement("span", "ha-canvas-size-preview-title", "📐 Offset Preview");
                const hintEl = this.createElement("span", "ha-canvas-size-preview-hint", "Drag to move offset");
                headerRow.append(titleEl, hintEl);

                const previewW = 270;
                const previewH = 176;
                const previewCanvas = this.createElement("canvas", "ha-canvas-size-preview-canvas", undefined, {
                    id: "ha-canvas-size-preview-canvas",
                    width: String(previewW),
                    height: String(previewH),
                    title: "Drag to position the existing image inside the new canvas boundary"
                }) as HTMLCanvasElement;

                const controlsRow = this.createElement("div", "ha-canvas-size-preview-controls");

                const anchorGrid = this.createElement("div", "ha-canvas-size-anchor-grid", undefined, {
                    id: "ha-canvas-size-anchor-grid",
                    title: "Snap image alignment inside new canvas"
                });
                const anchors: Array<{ id: string; label: string; title: string; ax: number; ay: number }> = [
                    { id: "tl", label: "↖", title: "Align Top-Left", ax: 0, ay: 0 },
                    { id: "tc", label: "↑", title: "Align Top-Center", ax: 0.5, ay: 0 },
                    { id: "tr", label: "↗", title: "Align Top-Right", ax: 1, ay: 0 },
                    { id: "ml", label: "←", title: "Align Middle-Left", ax: 0, ay: 0.5 },
                    { id: "mc", label: "•", title: "Center Image in Canvas", ax: 0.5, ay: 0.5 },
                    { id: "mr", label: "→", title: "Align Middle-Right", ax: 1, ay: 0.5 },
                    { id: "bl", label: "↙", title: "Align Bottom-Left", ax: 0, ay: 1 },
                    { id: "bc", label: "↓", title: "Align Bottom-Center", ax: 0.5, ay: 1 },
                    { id: "br", label: "↘", title: "Align Bottom-Right", ax: 1, ay: 1 }
                ];

                for (const a of anchors) {
                    const aBtn = this.createElement("button", "ha-canvas-size-anchor-btn", a.label, {
                        type: "button",
                        "data-anchor": a.id,
                        title: a.title
                    });
                    aBtn.addEventListener("click", () => {
                        const cur = getValues();
                        const nw = Math.max(1, Number(cur.width) || oldW);
                        const nh = Math.max(1, Number(cur.height) || oldH);
                        const nextOx = Math.round((nw - oldW) * a.ax);
                        const nextOy = Math.round((nh - oldH) * a.ay);
                        setValues({ offsetX: String(nextOx), offsetY: String(nextOy) });
                    });
                    anchorGrid.appendChild(aBtn);
                }

                const btnCol = this.createElement("div", "ha-canvas-size-btn-col");
                const centerBtn = this.createElement("button", "ha-btn ha-btn-secondary ha-btn-sm", "🎯 Center", {
                    id: "btn-canvas-size-center",
                    type: "button",
                    title: "Center existing image inside new canvas boundaries"
                });
                centerBtn.addEventListener("click", () => {
                    const cur = getValues();
                    const nw = Math.max(1, Number(cur.width) || oldW);
                    const nh = Math.max(1, Number(cur.height) || oldH);
                    setValues({
                        offsetX: String(Math.round((nw - oldW) / 2)),
                        offsetY: String(Math.round((nh - oldH) / 2))
                    });
                });

                const resetOffsetBtn = this.createElement("button", "ha-btn ha-btn-secondary ha-btn-sm", "↺ Reset (0, 0)", {
                    id: "btn-canvas-size-reset-offset",
                    type: "button",
                    title: "Reset X and Y offsets to (0, 0)"
                });
                resetOffsetBtn.addEventListener("click", () => {
                    setValues({ offsetX: "0", offsetY: "0" });
                });
                btnCol.append(centerBtn, resetOffsetBtn);
                controlsRow.append(anchorGrid, btnCol);

                const legendRow = this.createElement("div", "ha-canvas-size-legend");
                legendRow.innerHTML = `
                    <span class="ha-legend-item"><span class="ha-legend-swatch new-canvas"></span>New Canvas</span>
                    <span class="ha-legend-item"><span class="ha-legend-swatch orig-image"></span>Original Image</span>
                `;

                const infoEl = this.createElement("div", "ha-canvas-size-preview-info", undefined, {
                    id: "ha-canvas-size-preview-info"
                });

                let currentScale = 1;
                const drawPreview = (vals: Record<string, string>) => {
                    const nw = Math.max(1, Number(vals.width) || oldW);
                    const nh = Math.max(1, Number(vals.height) || oldH);
                    const ox = Number(vals.offsetX) || 0;
                    const oy = Number(vals.offsetY) || 0;

                    const minX = Math.min(0, ox);
                    const minY = Math.min(0, oy);
                    const maxX = Math.max(nw, ox + oldW);
                    const maxY = Math.max(nh, oy + oldH);
                    const unionW = Math.max(1, maxX - minX);
                    const unionH = Math.max(1, maxY - minY);

                    const pad = 18;
                    const availW = previewW - pad * 2;
                    const availH = previewH - pad * 2;
                    const scale = Math.min(availW / unionW, availH / unionH);
                    currentScale = scale > 0 ? scale : 1;

                    const originX = Math.round((previewW - unionW * scale) / 2 - minX * scale);
                    const originY = Math.round((previewH - unionH * scale) / 2 - minY * scale);

                    const newRectX = originX;
                    const newRectY = originY;
                    const newRectW = Math.max(2, Math.round(nw * scale));
                    const newRectH = Math.max(2, Math.round(nh * scale));

                    const oldRectX = Math.round(originX + ox * scale);
                    const oldRectY = Math.round(originY + oy * scale);
                    const oldRectW = Math.max(2, Math.round(oldW * scale));
                    const oldRectH = Math.max(2, Math.round(oldH * scale));

                    const ctx = previewCanvas.getContext("2d");
                    if (ctx) {
                        ctx.clearRect(0, 0, previewW, previewH);
                        ctx.fillStyle = "#0c0e17";
                        ctx.fillRect(0, 0, previewW, previewH);

                        // 1. Draw checkerboard inside the New Canvas boundary
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(newRectX, newRectY, newRectW, newRectH);
                        ctx.clip();
                        const chk = 8;
                        for (let cy = newRectY; cy < newRectY + newRectH; cy += chk) {
                            for (let cx = newRectX; cx < newRectX + newRectW; cx += chk) {
                                const isLight = ((Math.floor((cx - newRectX) / chk) + Math.floor((cy - newRectY) / chk)) & 1) === 0;
                                ctx.fillStyle = isLight ? "#23283b" : "#181c2b";
                                ctx.fillRect(cx, cy, chk, chk);
                            }
                        }
                        if (st.backgroundColor && st.backgroundColor !== "transparent") {
                            ctx.fillStyle = st.backgroundColor;
                            ctx.globalAlpha = 0.45;
                            ctx.fillRect(newRectX, newRectY, newRectW, newRectH);
                            ctx.globalAlpha = 1.0;
                        }
                        ctx.restore();

                        // 2. Draw Original Image ghosted outside New Canvas (cropped overflow visibility)
                        ctx.save();
                        ctx.globalAlpha = 0.32;
                        ctx.drawImage(thumbCanvas, oldRectX, oldRectY, oldRectW, oldRectH);
                        ctx.restore();

                        // 3. Draw Original Image at full opacity clipped inside New Canvas
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(newRectX, newRectY, newRectW, newRectH);
                        ctx.clip();
                        ctx.globalAlpha = 1.0;
                        ctx.drawImage(thumbCanvas, oldRectX, oldRectY, oldRectW, oldRectH);
                        ctx.restore();

                        // 4. Draw Original Image dashed gold outline
                        ctx.save();
                        ctx.strokeStyle = "#ffd54f";
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([4, 3]);
                        ctx.strokeRect(oldRectX + 0.5, oldRectY + 0.5, Math.max(1, oldRectW - 1), Math.max(1, oldRectH - 1));
                        ctx.restore();

                        // 5. Draw New Canvas solid cyan outline
                        ctx.save();
                        ctx.strokeStyle = "#00e5ff";
                        ctx.lineWidth = 1.75;
                        ctx.strokeRect(newRectX + 0.5, newRectY + 0.5, Math.max(1, newRectW - 1), Math.max(1, newRectH - 1));
                        ctx.restore();

                        // 6. Draw Offset indicator vector line if offset is non-zero
                        if (ox !== 0 || oy !== 0) {
                            ctx.save();
                            ctx.strokeStyle = "#ff6e40";
                            ctx.fillStyle = "#ff6e40";
                            ctx.lineWidth = 1.5;
                            ctx.beginPath();
                            ctx.moveTo(newRectX, newRectY);
                            ctx.lineTo(oldRectX, oldRectY);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.arc(oldRectX, oldRectY, 3, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.restore();
                        }
                    }

                    const dW = nw - oldW;
                    const dH = nh - oldH;
                    const dWStr = dW >= 0 ? `+${dW}` : String(dW);
                    const dHStr = dH >= 0 ? `+${dH}` : String(dH);
                    infoEl.textContent = `${oldW}×${oldH}px → ${nw}×${nh}px (${dWStr}, ${dHStr}) • Offset: (${ox}, ${oy})px`;
                    previewCanvas.setAttribute("data-preview-width", String(nw));
                    previewCanvas.setAttribute("data-preview-height", String(nh));
                    previewCanvas.setAttribute("data-preview-offset-x", String(ox));
                    previewCanvas.setAttribute("data-preview-offset-y", String(oy));
                };

                // Interactive drag-to-offset on the preview canvas (like GIMP GimpOffsetArea)
                let isDragging = false;
                let dragStartClientX = 0;
                let dragStartClientY = 0;
                let dragStartOx = 0;
                let dragStartOy = 0;
                let dragScale = 1;

                previewCanvas.addEventListener("mousedown", (ev: MouseEvent) => {
                    if (ev.button !== 0) return;
                    ev.preventDefault();
                    const cur = getValues();
                    isDragging = true;
                    dragStartClientX = ev.clientX;
                    dragStartClientY = ev.clientY;
                    dragStartOx = Number(cur.offsetX) || 0;
                    dragStartOy = Number(cur.offsetY) || 0;
                    dragScale = currentScale > 0 ? currentScale : 1;
                });

                const onWinMouseMove = (ev: MouseEvent) => {
                    if (!isDragging) return;
                    if (!previewCanvas.isConnected) {
                        isDragging = false;
                        return;
                    }
                    const dx = Math.round((ev.clientX - dragStartClientX) / dragScale);
                    const dy = Math.round((ev.clientY - dragStartClientY) / dragScale);
                    setValues({
                        offsetX: String(dragStartOx + dx),
                        offsetY: String(dragStartOy + dy)
                    });
                };

                const onWinMouseUp = () => {
                    isDragging = false;
                };

                this.win.addEventListener("mousemove", onWinMouseMove);
                this.win.addEventListener("mouseup", onWinMouseUp);

                onChange((vals) => drawPreview(vals));
                drawPreview(getValues());

                previewBox.append(headerRow, previewCanvas, legendRow, controlsRow, infoEl);
                return previewBox;
            },
            submitLabel: "Resize Canvas",
            onSubmit: (vals) => {
                const w = Math.max(1, Number(vals.width) || st.width);
                const h = Math.max(1, Number(vals.height) || st.height);
                const ox = Number(vals.offsetX) || 0;
                const oy = Number(vals.offsetY) || 0;
                this.state.engine.resizeCanvas(this.state.canvasId, w, h, ox, oy);
                this.state.setStatus(`Resized canvas to ${w}×${h}px (offset ${ox}, ${oy}).`);
            }
        });
    }

    public openScaleImageDialog(): void {
        const st = this.state.getCanvasState();
        this.modal.openFormDialog({
            title: "Scale Image (Resample Raster & Vector Layers)",
            subtitle:
                "Proportionally or freely scale the entire image and all its raster and vector layers.",
            presets: [
                { label: "50% Half Size", icon: "🔉", values: { width: String(Math.max(1, Math.round(st.width * 0.5))), height: String(Math.max(1, Math.round(st.height * 0.5))) } },
                { label: "150% Larger", icon: "🔊", values: { width: String(Math.round(st.width * 1.5)), height: String(Math.round(st.height * 1.5)) } },
                { label: "200% Double Size", icon: "🚀", values: { width: String(st.width * 2), height: String(st.height * 2) } },
                { label: "Square 512×512", icon: "⬛", values: { width: "512", height: "512" } }
            ],
            fields: [
                { key: "width", label: "Scaled Width (px)", type: "number", min: 1, max: 8192, step: 1, defaultValue: String(st.width) },
                { key: "height", label: "Scaled Height (px)", type: "number", min: 1, max: 8192, step: 1, defaultValue: String(st.height) },
                {
                    key: "interpolation",
                    label: "Interpolation Quality",
                    type: "select",
                    defaultValue: "bilinear",
                    options: [
                        { label: "Linear / Bilinear (Smooth)", value: "bilinear" },
                        { label: "None / Nearest Neighbor (Crisp Pixel Art)", value: "nearest" }
                    ]
                }
            ],
            submitLabel: "Scale Image",
            onSubmit: (vals) => {
                const w = Math.max(1, Number(vals.width) || st.width);
                const h = Math.max(1, Number(vals.height) || st.height);
                this.state.engine.scaleCanvas(this.state.canvasId, w, h);
                this.state.setStatus(`Scaled image to ${w}×${h}px.`);
            }
        });
    }

    public openPreferencesDialog(): void {
        const cfg = this.state.configManager.getConfig();
        this.modal.openFormDialog({
            title: "HAEditor Preferences (GIMP + Inkscape Studio)",
            subtitle:
                "Customize default grid spacing, canvas appearance, AI Studio endpoint, and shared object library settings.",
            presets: [
                { label: "Default Dark Studio", icon: "🌙", values: { gridSpacing: "32", paddingMode: "theme", lmStudioUrl: "http://localhost:1234" } },
                { label: "Pixel Art Studio (16px Grid)", icon: "👾", values: { gridSpacing: "16", paddingMode: "dark_check", lmStudioUrl: "http://localhost:1234" } }
            ],
            fields: [
                {
                    key: "gridSpacing",
                    label: "Canvas Grid Spacing (px)",
                    type: "number",
                    min: 4,
                    max: 256,
                    step: 4,
                    defaultValue: String(this.state.gridSpacing || 32),
                    quickChips: [
                        { label: "8px", value: "8" },
                        { label: "16px", value: "16" },
                        { label: "32px", value: "32" },
                        { label: "64px", value: "64" }
                    ]
                },
                {
                    key: "paddingMode",
                    label: "Viewport Padding Color Mode",
                    type: "select",
                    defaultValue: this.state.paddingColorMode,
                    options: [
                        { label: "From Theme (Dark Studio)", value: "theme" },
                        { label: "Dark Checkboard", value: "dark_check" },
                        { label: "Light Checkboard", value: "light_check" },
                        { label: "Custom Padding Color", value: "custom" }
                    ]
                },
                {
                    key: "lmStudioUrl",
                    label: "LM Studio OpenAI Endpoint URL",
                    type: "text",
                    defaultValue: cfg.lmStudioUrl || "http://localhost:1234",
                    quickChips: [
                        { label: "Default (http://localhost:1234)", value: "http://localhost:1234" },
                        { label: "Ollama (http://localhost:11434)", value: "http://localhost:11434" }
                    ]
                }
            ],
            submitLabel: "Save Preferences",
            onSubmit: (vals) => {
                this.state.gridSpacing = Math.max(4, Number(vals.gridSpacing) || 32);
                this.state.paddingColorMode = (vals.paddingMode as any) || "theme";
                if (vals.lmStudioUrl) {
                    this.state.configManager.updateConfig({ lmStudioUrl: vals.lmStudioUrl.trim() });
                }
                this.state.setStatus("Saved HAEditor studio preferences.");
            }
        });
    }

    public openKeyboardShortcutsDialog(): void {
        const shortcuts: Array<[string, string]> = [
            ["Ctrl+Z", "Undo last canvas operation"],
            ["Ctrl+Y / Ctrl+Shift+Z", "Redo canvas operation"],
            ["Ctrl+X / Ctrl+C / Ctrl+V", "Cut / Copy / Paste selection or vector object"],
            ["Ctrl+Shift+C", "Copy Visible (merged composite of all visible layers)"],
            ["Ctrl+Alt+V", "Paste In Place at original coordinates"],
            ["Ctrl+Shift+V", "Paste clipboard as New Image"],
            ["Delete / Backspace", "Clear selection pixels or delete selected vector shape"],
            ["Ctrl+A / Ctrl+Shift+A / Ctrl+I", "Select All / Select None / Invert Selection"],
            ["Ctrl+, / Ctrl+. / Ctrl+;", "Fill with Foreground / Background / Pattern"],
            ["Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+E", "New Canvas / Open / Save / Export"],
            ["Ctrl+F", "Repeat Last Raster Filter"],
            ["Ctrl+M", "Merge Visible Layers"],
            ["V / N / R / C / Y / P / T / O", "Vector Tools (Select, Node, Rect, Ellipse, Star, Pen, Text, Shared Object)"],
            ["M / E / L / W / B / A / G / D / I", "GIMP Raster Tools (Marquee, Lasso, Wand, Brush, Airbrush, Fill, Gradient, Picker)"],
            ["X / D", "Swap FG/BG Colors / Reset Default Colors"],
            ["+ / - / 1", "Zoom In / Zoom Out / Reset Zoom 100%"],
            ["Tab", "Toggle Hide Docks (Distraction-Free Canvas)"]
        ];

        const overlay = this.doc.createElement("div");
        overlay.className = "ha-modal-overlay";
        overlay.id = "ha-shortcuts-modal";

        const card = this.doc.createElement("div");
        card.className = "ha-modal-card ha-modal-card-wide";

        const header = this.doc.createElement("div");
        header.className = "ha-modal-header";
        header.innerHTML = `<div class="ha-modal-title">⌨️ GIMP + Inkscape Keyboard Shortcuts Reference</div>`;
        const closeBtn = this.doc.createElement("button");
        closeBtn.className = "ha-icon-btn";
        closeBtn.textContent = "✖";
        closeBtn.type = "button";
        closeBtn.addEventListener("click", () => overlay.remove());
        header.appendChild(closeBtn);
        card.appendChild(header);

        const list = this.doc.createElement("div");
        list.style.cssText =
            "max-height:360px;overflow-y:auto;display:grid;grid-template-columns:1fr;gap:4px;margin:10px 0;padding:8px;background:#12141f;border:1px solid #2b2f42;border-radius:6px;";
        for (const [key, desc] of shortcuts) {
            const row = this.doc.createElement("div");
            row.style.cssText =
                "display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;";
            row.innerHTML = `<code style="background:#23283d;color:#00d4ff;padding:2px 6px;border-radius:4px;font-weight:600;">${key}</code><span style="color:#d5d9e8;">${desc}</span>`;
            list.appendChild(row);
        }
        card.appendChild(list);

        const footer = this.doc.createElement("div");
        footer.className = "ha-modal-footer";
        const okBtn = this.doc.createElement("button");
        okBtn.type = "button";
        okBtn.className = "ha-btn ha-btn-primary";
        okBtn.textContent = "Close";
        okBtn.addEventListener("click", () => overlay.remove());
        footer.appendChild(okBtn);
        card.appendChild(footer);

        overlay.appendChild(card);
        this.doc.body.appendChild(overlay);
    }

    private buildFileMenu(): ContextMenuItem[] {
        const recentFiles = this.state.configManager.getConfig().recentFiles || [];
        const recentChildren: ContextMenuItem[] =
            recentFiles.length > 0
                ? [
                      ...recentFiles.map((rf) => ({
                          label: `${path.basename(rf)} (${path.dirname(rf)})`,
                          icon: "🕒",
                          action: () => {
                              try {
                                  const res = this.state.engine.importArtFile(rf, {
                                      canvasId: this.state.canvasId,
                                      mode: "new_canvas"
                                  });
                                  this.state.currentFilePath = res.filePath;
                                  this.state.resolveActiveLayer();
                                  this.state.setStatus(`Opened recent ${res.detectedFormat.toUpperCase()} file "${res.filePath}".`);
                              } catch (e: any) {
                                  this.state.setStatus(`Could not open recent file: ${e?.message || e}`);
                              }
                          }
                      })),
                      { divider: true },
                      {
                          label: "Clear Recent Files History",
                          icon: "🧹",
                          action: () => {
                              this.state.configManager.updateConfig({ recentFiles: [] });
                              this.state.setStatus("Cleared recent files history.");
                          }
                      }
                  ]
                : [{ label: "(No recent files yet)", icon: "🕒", disabled: true }];

        return [
            {
                id: "menu-file-new",
                label: "New...",
                icon: "📄",
                shortcut: "Ctrl+N",
                action: () => this.openNewCanvasDialog()
            },
            {
                id: "menu-file-create",
                label: "Create",
                icon: "✨",
                children: [
                    {
                        label: "From Clipboard",
                        icon: "📋",
                        shortcut: "Ctrl+Shift+V",
                        action: () => this.state.paste("new_image")
                    },
                    {
                        label: "UI Icon Template (128×128)",
                        icon: "🎯",
                        action: () => {
                            this.state.exitSharedObjectEdit();
                            this.state.engine.createCanvas(this.state.canvasId, 128, 128, "transparent");
                            this.state.resolveActiveLayer();
                            this.state.setStatus("Created 128×128 UI Icon template canvas.");
                        }
                    },
                    {
                        label: "Pixel Art Sprite Template (64×64)",
                        icon: "👾",
                        action: () => {
                            this.state.exitSharedObjectEdit();
                            this.state.engine.createCanvas(this.state.canvasId, 64, 64, "transparent");
                            this.state.showGrid = true;
                            this.state.gridSpacing = 8;
                            this.state.resolveActiveLayer();
                            this.state.setStatus("Created 64×64 Pixel Art Sprite canvas with 8px grid.");
                        }
                    }
                ]
            },
            {
                id: "menu-file-open",
                label: "Open...",
                icon: "📂",
                shortcut: "Ctrl+O",
                action: () => this.openFileDialogForMode("new_canvas")
            },
            {
                id: "menu-file-open-layers",
                label: "Open as Layers...",
                icon: "🗂️",
                shortcut: "Ctrl+Alt+O",
                action: () => this.openFileDialogForMode("append_layers", "Open as Layers into Current Canvas")
            },
            {
                id: "menu-file-open-recent",
                label: "Open Recent",
                icon: "🕒",
                children: recentChildren
            },
            { divider: true },
            {
                id: "menu-file-import",
                label: "Import",
                icon: "📥",
                children: [
                    {
                        label: "Import as New Canvas (.ai, .psd, .xcf, .svg, .ora, .png, ...)...",
                        icon: "📄",
                        action: () =>
                            this.openFileDialogForMode(
                                "new_canvas",
                                "Import Artwork as New Canvas"
                            )
                    },
                    {
                        label: "Import as Layers into Current Canvas...",
                        icon: "🗂️",
                        action: () =>
                            this.openFileDialogForMode(
                                "append_layers",
                                "Import File as Layers into Current Canvas"
                            )
                    },
                    {
                        label: "Import File as a New Shared Object...",
                        icon: "🧩",
                        action: () =>
                            this.openFileDialogForMode(
                                "new_shared_object",
                                "Import Artwork as New Reusable Shared Object"
                            )
                    },
                    {
                        label: "Import Layers into Active Shared Object...",
                        icon: "🎯",
                        action: () =>
                            this.openFileDialogForMode(
                                "into_active_shared_object",
                                "Import Layers into Active Shared Object"
                            )
                    },
                    { divider: true },
                    {
                        label: "Import Shared Object from Library File (.haso / .hacanvas)...",
                        icon: "📚",
                        action: () => {
                            this.modal.openFileBrowserDialog({
                                title: "Import Shared Object Package from Disk",
                                subtitle: "Select a saved .haso or .hacanvas Shared Object package to add into your current project.",
                                mode: "open",
                                submitLabel: "Import Shared Object",
                                initialDir: this.state.library.getLibraryDir(),
                                filters: [
                                    { label: "Shared Object Packages (.haso, .hacanvas)", extensions: [".haso", ".hacanvas"] },
                                    { label: "All Files (*.*)", extensions: [] }
                                ],
                                onSubmit: (filePath) => {
                                    try {
                                        const baseName = path.basename(filePath, path.extname(filePath)) || "LibraryObject";
                                        const cState = this.state.getCanvasState();
                                        const createdSo = this.state.engine.createSharedObject(this.state.canvasId, {
                                            name: `Library/${baseName}`,
                                            category: "Library",
                                            width: Math.min(256, cState.width),
                                            height: Math.min(256, cState.height)
                                        });
                                        const updatedState = this.state.getCanvasState();
                                        if (updatedState.sharedObjects[createdSo.id]) {
                                            updatedState.sharedObjects[createdSo.id].layers = [];
                                            this.state.engine.saveCanvas(updatedState);
                                        }
                                        this.state.engine.importArtFile(filePath, {
                                            canvasId: this.state.canvasId,
                                            mode: "into_shared_object",
                                            sharedObjectId: createdSo.id
                                        });
                                        this.modal.closeDialog();
                                        this.state.setStatus(`Imported Shared Object "${createdSo.name}" from "${filePath}".`);
                                    } catch (e: any) {
                                        this.state.setStatus(`Error importing Shared Object: ${e?.message || e}`);
                                    }
                                }
                            });
                        }
                    }
                ]
            },
            { divider: true },
            {
                id: "menu-file-save",
                label: "Save",
                icon: "💾",
                shortcut: "Ctrl+S",
                action: () => {
                    if (this.state.currentFilePath && /\.hacanvas$/i.test(this.state.currentFilePath)) {
                        const res = this.state.engine.saveCanvas(this.state.canvasId, this.state.currentFilePath);
                        this.state.configManager.addRecentFile(res.filePath);
                        this.state.setStatus(`Saved .hacanvas (${res.bytesWritten} bytes) to "${res.filePath}".`);
                    } else {
                        this.openSaveDialog(false);
                    }
                }
            },
            {
                id: "menu-file-save-as",
                label: "Save As...",
                icon: "💾",
                shortcut: "Ctrl+Shift+S",
                action: () => this.openSaveDialog(false)
            },
            {
                id: "menu-file-save-copy",
                label: "Save a Copy...",
                icon: "📋",
                action: () => this.openSaveDialog(true)
            },
            {
                id: "menu-file-revert",
                label: "Revert",
                icon: "🔄",
                action: () => {
                    if (this.state.currentFilePath) {
                        try {
                            const res = this.state.engine.importArtFile(this.state.currentFilePath, {
                                canvasId: this.state.canvasId,
                                mode: "new_canvas"
                            });
                            this.state.resolveActiveLayer();
                            this.state.setStatus(`Reverted canvas to saved file "${res.filePath}".`);
                        } catch (e: any) {
                            this.state.setStatus(`Revert failed: ${e?.message || e}`);
                        }
                    } else {
                        this.state.engine.jumpToHistoryState(this.state.canvasId, 0);
                        this.state.resolveActiveLayer();
                        this.state.setStatus("Reverted canvas to initial state.");
                    }
                }
            },
            { divider: true },
            {
                id: "menu-file-export-as",
                label: "Export As...",
                icon: "📤",
                shortcut: "Ctrl+E",
                action: () => this.openExportDialog()
            },
            {
                id: "menu-file-export-by-format",
                label: "Export By Format",
                icon: "🖼️",
                children: (["pdf", "png", "jpg", "svg", "gif", "ora", "bmp", "tga", "ico", "ppm", "farbfeld", "spritesheet"] as const).map(fmt => ({
                    label: `Export as .${fmt.toUpperCase()}...`,
                    icon: fmt === "pdf" ? "📄" : "🖼️",
                    action: () => this.openExportDialog(fmt)
                }))
            },
            { divider: true },
            {
                id: "menu-file-copy-location",
                label: "Copy Image Location",
                icon: "🔗",
                action: () => {
                    const loc = this.state.currentFilePath || this.state.projectRoot;
                    this.state.setStatus(`Image location: ${loc}`);
                }
            },
            {
                id: "menu-file-close-view",
                label: "Close View",
                icon: "✖",
                shortcut: "Ctrl+W",
                action: () => {
                    if (this.state.editMode === "isolated_tab" && this.state.activeSharedObjectId) {
                        this.state.closeSharedObjectTab(this.state.activeSharedObjectId);
                    } else {
                        this.state.closeMainCanvas();
                    }
                }
            },
            {
                id: "menu-file-quit",
                label: "Quit",
                icon: "🚪",
                shortcut: "Ctrl+Q",
                action: () => {
                    try {
                        if (typeof (this.win as any).nw !== "undefined") {
                            (this.win as any).nw.App.quit();
                        } else {
                            this.win.close();
                        }
                    } catch {
                        // Ignore in test environment
                    }
                }
            }
        ];
    }

    /**
     * Full GIMP Edit Menu (`menus/image-menu.xml.in` -> `<menu action="edit-menu">` & `app/actions/edit-actions.c`).
     */
    private buildEditMenu(): ContextMenuItem[] {
        const canUndo = this.state.engine.canUndo(this.state.canvasId);
        const canRedo = this.state.engine.canRedo(this.state.canvasId);
        const undoLabel = this.state.engine.getUndoLabel(this.state.canvasId);
        const redoLabel = this.state.engine.getRedoLabel(this.state.canvasId);

        const namedBufferKeys = Array.from(this.state.namedBuffers.keys());

        return [
            {
                id: "menu-edit-undo",
                label: undoLabel ? `Undo ${undoLabel}` : "Undo",
                icon: "↩️",
                shortcut: "Ctrl+Z",
                disabled: !canUndo,
                action: () => this.state.undo()
            },
            {
                id: "menu-edit-redo",
                label: redoLabel ? `Redo ${redoLabel}` : "Redo",
                icon: "↪️",
                shortcut: "Ctrl+Y",
                disabled: !canRedo,
                action: () => this.state.redo()
            },
            {
                id: "menu-edit-strong-undo",
                label: "Strong Undo",
                icon: "⏪",
                shortcut: "Ctrl+Shift+Z",
                disabled: !canUndo,
                action: () => this.state.undo()
            },
            {
                id: "menu-edit-strong-redo",
                label: "Strong Redo",
                icon: "⏩",
                shortcut: "Ctrl+Shift+Y",
                disabled: !canRedo,
                action: () => this.state.redo()
            },
            {
                id: "menu-edit-undo-history",
                label: "Undo History...",
                icon: "🕒",
                action: () => this.openUndoHistoryDialog()
            },
            {
                id: "menu-edit-clear-undo",
                label: "Clear Undo History",
                icon: "🧹",
                action: () => this.state.clearUndoHistory()
            },
            { divider: true },
            {
                id: "menu-edit-cut",
                label: "Cut",
                icon: "✂️",
                shortcut: "Ctrl+X",
                action: () => this.state.cut()
            },
            {
                id: "menu-edit-copy",
                label: "Copy",
                icon: "📋",
                shortcut: "Ctrl+C",
                action: () => this.state.copy(false)
            },
            {
                id: "menu-edit-copy-visible",
                label: "Copy Visible",
                icon: "👁️",
                shortcut: "Ctrl+Shift+C",
                action: () => this.state.copy(true)
            },
            {
                id: "menu-edit-paste",
                label: "Paste",
                icon: "📥",
                shortcut: "Ctrl+V",
                action: () => this.state.paste("default")
            },
            {
                id: "menu-edit-paste-in-place",
                label: "Paste In Place",
                icon: "📌",
                shortcut: "Ctrl+Alt+V",
                action: () => this.state.paste("in_place")
            },
            {
                id: "menu-edit-paste-into",
                label: "Paste Into Selection",
                icon: "🎯",
                action: () => this.state.paste("into_selection")
            },
            {
                id: "menu-edit-paste-as",
                label: "Paste as",
                icon: "🗂️",
                children: [
                    {
                        id: "menu-edit-paste-new-layer",
                        label: "New Layer",
                        icon: "➕",
                        action: () => this.state.paste("new_layer")
                    },
                    {
                        id: "menu-edit-paste-new-layer-in-place",
                        label: "New Layer In Place",
                        icon: "📌",
                        action: () => this.state.paste("new_layer_in_place")
                    },
                    {
                        id: "menu-edit-paste-new-image",
                        label: "New Image",
                        icon: "🖼️",
                        shortcut: "Ctrl+Shift+V",
                        action: () => this.state.paste("new_image")
                    },
                    {
                        id: "menu-edit-paste-new-shared-object",
                        label: "New Shared Object",
                        icon: "🧩",
                        action: () => this.state.paste("new_shared_object")
                    }
                ]
            },
            {
                id: "menu-edit-buffer",
                label: "Buffer",
                icon: "🗄️",
                children: [
                    {
                        label: "Cut Named...",
                        icon: "✂️",
                        action: () => {
                            this.modal.openFormDialog({
                                title: "Cut to Named Buffer (GIMP Named Clipboard)",
                                subtitle: "Give this cut clip a memorable name so you can paste it back anytime during your session.",
                                presets: [
                                    { label: "HeroClip", icon: "⭐", values: { bufferName: "HeroClip" } },
                                    { label: "UIElement", icon: "🎯", values: { bufferName: "UIElement" } }
                                ],
                                fields: [
                                    {
                                        key: "bufferName",
                                        label: "Buffer Name",
                                        type: "text",
                                        defaultValue: `Buffer_${this.state.namedBuffers.size + 1}`,
                                        quickChips: [
                                            { label: "Clip_A", value: "Clip_A" },
                                            { label: "Clip_B", value: "Clip_B" },
                                            { label: "BadgeStamp", value: "BadgeStamp" }
                                        ]
                                    }
                                ],
                                submitLabel: "Cut to Buffer",
                                onSubmit: (vals) => {
                                    const name = (vals.bufferName || "Buffer_1").trim();
                                    if (this.state.cut() && this.state.clipboard) {
                                        this.state.namedBuffers.set(name, { ...this.state.clipboard });
                                        this.state.setStatus(`Cut selection into named buffer "${name}".`);
                                    }
                                }
                            });
                        }
                    },
                    {
                        label: "Copy Named...",
                        icon: "📋",
                        action: () => {
                            this.modal.openFormDialog({
                                title: "Copy to Named Buffer (GIMP Named Clipboard)",
                                subtitle: "Store a copy of the current selection or active layer in a named buffer.",
                                presets: [
                                    { label: "HeroClip", icon: "⭐", values: { bufferName: "HeroClip" } },
                                    { label: "BackupLayer", icon: "💾", values: { bufferName: "BackupLayer" } }
                                ],
                                fields: [
                                    {
                                        key: "bufferName",
                                        label: "Buffer Name",
                                        type: "text",
                                        defaultValue: `Buffer_${this.state.namedBuffers.size + 1}`,
                                        quickChips: [
                                            { label: "Clip_A", value: "Clip_A" },
                                            { label: "Clip_B", value: "Clip_B" },
                                            { label: "SpriteFrame", value: "SpriteFrame" }
                                        ]
                                    }
                                ],
                                submitLabel: "Copy to Buffer",
                                onSubmit: (vals) => {
                                    const name = (vals.bufferName || "Buffer_1").trim();
                                    if (this.state.copy(false) && this.state.clipboard) {
                                        this.state.namedBuffers.set(name, { ...this.state.clipboard });
                                        this.state.setStatus(`Copied into named buffer "${name}".`);
                                    }
                                }
                            });
                        }
                    },
                    {
                        label: "Copy Visible Named...",
                        icon: "👁️",
                        action: () => {
                            const name = `Visible_${this.state.namedBuffers.size + 1}`;
                            if (this.state.copy(true) && this.state.clipboard) {
                                this.state.namedBuffers.set(name, { ...this.state.clipboard });
                                this.state.setStatus(`Copied visible composite into named buffer "${name}".`);
                            }
                        }
                    },
                    { divider: true },
                    ...(namedBufferKeys.length > 0
                        ? namedBufferKeys.map((k) => ({
                              label: `Paste Buffer "${k}"`,
                              icon: "📥",
                              action: () => {
                                  const buf = this.state.namedBuffers.get(k);
                                  if (buf) {
                                      this.state.clipboard = { ...buf };
                                      this.state.paste("default");
                                  }
                              }
                          }))
                        : [{ label: "(No named buffers stored yet)", icon: "🗄️", disabled: true }])
                ]
            },
            { divider: true },
            {
                id: "menu-edit-clear",
                label: "Clear",
                icon: "🧹",
                shortcut: "Delete",
                action: () => this.state.clearSelectionOrActive()
            },
            {
                id: "menu-edit-fill-fg",
                label: "Fill with Foreground Color",
                icon: "🎨",
                shortcut: "Ctrl+,",
                action: () => this.state.fillWithColor(this.state.toolOptions.primaryColor, "Foreground Color")
            },
            {
                id: "menu-edit-fill-bg",
                label: "Fill with Background Color",
                icon: "🪣",
                shortcut: "Ctrl+.",
                action: () => this.state.fillWithColor(this.state.toolOptions.secondaryColor, "Background Color")
            },
            {
                id: "menu-edit-fill-pattern",
                label: "Fill with Pattern",
                icon: "🏁",
                shortcut: "Ctrl+;",
                action: () => this.state.fillWithColor(this.state.toolOptions.primaryColor, "Pattern")
            },
            {
                id: "menu-edit-stroke-selection",
                label: "Stroke Selection...",
                icon: "✏️",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Stroke Selection Outline (GIMP Stroke Selection)",
                        subtitle:
                            "Paint a crisp border around the current selection (or canvas border if no selection is active).",
                        presets: [
                            { label: "Thin 2px FG Stroke", icon: "✏️", values: { width: "2", color: this.state.toolOptions.primaryColor } },
                            { label: "Bold 6px FG Stroke", icon: "🖊️", values: { width: "6", color: this.state.toolOptions.primaryColor } },
                            { label: "Neon Pink 4px Frame", icon: "💖", values: { width: "4", color: "#ff007f" } }
                        ],
                        fields: [
                            {
                                key: "width",
                                label: "Stroke Line Width (px)",
                                type: "number",
                                min: 1,
                                max: 64,
                                step: 1,
                                defaultValue: String(this.state.toolOptions.strokeWidth || 3),
                                quickChips: [
                                    { label: "1px", value: "1" },
                                    { label: "2px", value: "2" },
                                    { label: "4px", value: "4" },
                                    { label: "8px", value: "8" }
                                ]
                            },
                            {
                                key: "color",
                                label: "Stroke Color",
                                type: "color",
                                defaultValue: this.state.toolOptions.primaryColor,
                                quickChips: [
                                    { label: "FG Color", value: this.state.toolOptions.primaryColor },
                                    { label: "BG Color", value: this.state.toolOptions.secondaryColor },
                                    { label: "White (#ffffff)", value: "#ffffff" }
                                ]
                            }
                        ],
                        submitLabel: "Stroke Selection",
                        onSubmit: (vals) => {
                            const ras = this.state.resolveActiveLayer("raster");
                            const w = Math.max(1, Number(vals.width) || 3);
                            const col = vals.color || this.state.toolOptions.primaryColor;
                            this.state.engine.strokeSelectionOutline(
                                this.state.canvasId,
                                ras?.id,
                                col,
                                w,
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus(`Stroked selection outline (${w}px, ${col}).`);
                        }
                    });
                }
            },
            {
                id: "menu-edit-stroke-path",
                label: "Stroke Path...",
                icon: "✒️",
                action: () => {
                    if (this.state.selectedObjectIds.length === 0) {
                        this.state.setStatus("Select a vector shape or path first to stroke it.");
                        return;
                    }
                    for (const objId of this.state.selectedObjectIds) {
                        this.state.engine.modifyObject(this.state.canvasId, objId, {
                            stroke: this.state.toolOptions.primaryColor,
                            strokeWidth: Math.max(1, this.state.toolOptions.strokeWidth || 3)
                        });
                    }
                    this.state.setStatus(`Applied ${this.state.toolOptions.primaryColor} stroke to selected vector path(s).`);
                }
            },
            { divider: true },
            {
                id: "ha-menu-edit-metadata",
                label: "Document Metadata (EXIF / GPS / Author)...",
                icon: "🌍",
                shortcut: "Ctrl+Shift+M",
                action: () => this.openDocumentMetadataDialog()
            },
            {
                id: "menu-edit-preferences",
                label: "Preferences...",
                icon: "⚙️",
                action: () => this.openPreferencesDialog()
            },
            {
                id: "menu-edit-shortcuts",
                label: "Keyboard Shortcuts...",
                icon: "⌨️",
                action: () => this.openKeyboardShortcutsDialog()
            }
        ];
    }

    /**
     * Opens the interactive Document Metadata (EXIF / GPS / Author / Camera / Copyright)
     * dialog (`#ha-metadata-dialog`). Saved metadata is stored in `.hacanvas` (`metadata/exif.xml`)
     * and automatically embedded into compatible export formats (JPEG EXIF/GPS/XMP, PNG eXIf/iTXt/tEXt,
     * PDF /Info + XMP, SVG <metadata>, GIF Comment).
     */
    public openDocumentMetadataDialog(): void {
        const existing = this.doc.getElementById("ha-metadata-dialog");
        if (existing) existing.remove();

        this.state.ensureCanvasOpen();
        const cState = this.state.getCanvasState();
        const meta = cState.metadata || {};

        const overlay = this.createElement("div", "ha-modal-backdrop active", undefined, {
            id: "ha-metadata-dialog"
        });
        const card = this.createElement("div", "ha-modal-card ha-modal-card-wide");

        const header = this.createElement("div", "ha-modal-header");
        header.appendChild(
            this.createElement(
                "h3",
                "ha-modal-title",
                "🌍 Document Metadata (EXIF / GPS Geolocation / Author / XMP)"
            )
        );
        const closeBtn = this.createElement("button", "ha-modal-close", "×", { type: "button" });
        closeBtn.addEventListener("click", () => overlay.remove());
        header.appendChild(closeBtn);

        const body = this.createElement("div", "ha-modal-body ha-metadata-dialog-body");
        body.appendChild(
            this.createElement(
                "p",
                "ha-modal-subtitle",
                "Stored in .hacanvas (metadata/exif.xml) and automatically exported into JPEG (APP1 EXIF/GPS/XMP), PNG (eXIf/iTXt/tEXt), PDF (/Info + XMP), SVG (<metadata>), and GIF."
            )
        );

        const grid = this.createElement("div", "ha-metadata-grid");
        const makeField = (
            id: string,
            labelText: string,
            val: string,
            type = "text",
            placeholder = ""
        ): HTMLInputElement => {
            const wrap = this.createElement("div", "ha-form-group");
            const lbl = this.createElement("label", "ha-form-label", labelText, { for: id });
            const inp = this.createElement("input", "ha-input", undefined, {
                id,
                type,
                value: val,
                placeholder
            }) as HTMLInputElement;
            if (type === "number") {
                inp.step = "any";
            }
            wrap.append(lbl, inp);
            grid.appendChild(wrap);
            return inp;
        };

        const titleInp = makeField("ha-meta-title", "Title", meta.title || "", "text", "Artwork Title");
        const authorInp = makeField("ha-meta-author", "Author / Artist", meta.author || "", "text", "Jane Doe");
        const copyrightInp = makeField(
            "ha-meta-copyright",
            "Copyright Notice",
            meta.copyright || "",
            "text",
            "© 2026 Studio"
        );
        const descInp = makeField(
            "ha-meta-description",
            "Description / Caption",
            meta.description || "",
            "text",
            "Scene description..."
        );
        const keywordsInp = makeField(
            "ha-meta-keywords",
            "Keywords (comma-separated)",
            (meta.keywords || []).join(", "),
            "text",
            "vector, illustration, pdf"
        );
        const softwareInp = makeField(
            "ha-meta-software",
            "Software",
            meta.software || "HACanvas Hybrid Art Engine"
        );
        const latInp = makeField(
            "ha-meta-lat",
            "GPS Latitude (Decimal °)",
            meta.gps?.latitude !== undefined ? String(meta.gps.latitude) : "",
            "number",
            "37.7749"
        );
        const lonInp = makeField(
            "ha-meta-lon",
            "GPS Longitude (Decimal °)",
            meta.gps?.longitude !== undefined ? String(meta.gps.longitude) : "",
            "number",
            "-122.4194"
        );
        const altInp = makeField(
            "ha-meta-alt",
            "GPS Altitude (m)",
            meta.gps?.altitude !== undefined ? String(meta.gps.altitude) : "",
            "number",
            "15"
        );
        const locNameInp = makeField(
            "ha-meta-location-name",
            "Location Name",
            meta.gps?.locationName || "",
            "text",
            "San Francisco, CA"
        );
        const camMakeInp = makeField(
            "ha-meta-camera-make",
            "Camera / Device Make",
            meta.make || "",
            "text",
            "Canon / Sony / Apple"
        );
        const camModelInp = makeField(
            "ha-meta-camera-model",
            "Camera / Device Model",
            meta.model || "",
            "text",
            "EOS R5"
        );

        body.appendChild(grid);

        const footer = this.createElement("div", "ha-modal-footer");
        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Cancel", {
            type: "button"
        });
        cancelBtn.addEventListener("click", () => overlay.remove());

        const saveBtn = this.createElement("button", "ha-btn ha-btn-primary", "💾 Save Metadata", {
            id: "ha-btn-save-metadata",
            type: "button"
        });
        saveBtn.addEventListener("click", () => {
            const latVal = latInp.value.trim() !== "" ? Number(latInp.value) : undefined;
            const lonVal = lonInp.value.trim() !== "" ? Number(lonInp.value) : undefined;
            const altVal = altInp.value.trim() !== "" ? Number(altInp.value) : undefined;
            const locVal = locNameInp.value.trim() || undefined;

            const updated = this.state.engine.setDocumentMetadata(this.state.canvasId, {
                title: titleInp.value.trim() || undefined,
                author: authorInp.value.trim() || undefined,
                copyright: copyrightInp.value.trim() || undefined,
                description: descInp.value.trim() || undefined,
                software: softwareInp.value.trim() || undefined,
                keywords: keywordsInp.value
                    .split(",")
                    .map(s => s.trim())
                    .filter(Boolean),
                gps:
                    latVal !== undefined || lonVal !== undefined || altVal !== undefined || locVal
                        ? {
                              latitude: latVal,
                              longitude: lonVal,
                              altitude: altVal,
                              locationName: locVal
                          }
                        : undefined,
                make: camMakeInp.value.trim() || undefined,
                model: camModelInp.value.trim() || undefined
            });

            overlay.remove();
            this.state.setStatus(
                `Saved document metadata (Author: "${updated.author || "—"}", Title: "${updated.title || "—"}").`
            );
            this.state.notify();
        });

        footer.append(cancelBtn, saveBtn);
        card.append(header, body, footer);
        overlay.appendChild(card);
        this.doc.body.appendChild(overlay);
    }

    /**
     * Full GIMP Select Menu (`menus/image-menu.xml.in` -> `<menu action="select-menu">` & `app/actions/select-actions.c`).
     */
    private buildSelectMenu(): ContextMenuItem[] {
        return [
            {
                id: "menu-select-all",
                label: "Select All Canvas",
                icon: "⬚",
                shortcut: "Ctrl+A",
                action: () => {
                    const st = this.state.getCanvasState();
                    this.state.engine.rasterSelection(this.state.canvasId, "rect", {
                        x: 0,
                        y: 0,
                        width: st.width,
                        height: st.height
                    });
                    this.state.setStatus("Selected entire canvas.");
                }
            },
            {
                id: "menu-select-none",
                label: "Clear Selection",
                icon: "✖",
                shortcut: "Ctrl+Shift+A",
                action: () => {
                    this.state.engine.rasterSelection(this.state.canvasId, "clear");
                    this.state.selectedObjectIds = [];
                    this.state.setStatus("Cleared raster and vector selection.");
                }
            },
            {
                id: "menu-select-invert",
                label: "Invert Selection Mask",
                icon: "🔄",
                shortcut: "Ctrl+I",
                action: () => {
                    this.state.engine.rasterSelection(this.state.canvasId, "invert");
                    this.state.setStatus("Inverted raster selection.");
                }
            },
            {
                id: "menu-select-float",
                label: "Float",
                icon: "🎈",
                shortcut: "Shift+Ctrl+L",
                action: () => {
                    if (this.state.cut()) {
                        this.state.paste("new_layer_in_place");
                        this.state.setStatus("Floated selection into a new layer.");
                    }
                }
            },
            {
                id: "menu-select-by-color",
                label: "By Color",
                icon: "🪄",
                shortcut: "Shift+O",
                action: () => {
                    this.state.activeToolId = "raster_magic_wand";
                    this.state.setStatus("Activated Fuzzy Select / Select By Color tool.");
                }
            },
            {
                id: "menu-select-from-path",
                label: "From Path",
                icon: "📐",
                shortcut: "Shift+V",
                action: () => {
                    const sel = this.state.engine.vectorObjectToSelection(
                        this.state.canvasId,
                        this.state.selectedObjectIds[0]
                    );
                    this.state.setStatus(
                        `Created raster selection (${sel.width}×${sel.height}px) from vector path.`
                    );
                }
            },
            {
                id: "menu-select-to-path",
                label: "To Path",
                icon: "✒️",
                action: () => {
                    const vecLayer = this.state.resolveActiveLayer("vector");
                    const obj = this.state.engine.selectionToVectorPath(
                        this.state.canvasId,
                        vecLayer?.id,
                        this.state.activeSharedObjectId
                    );
                    this.state.selectedObjectIds = [obj.id];
                    this.state.setStatus(`Converted selection outline to vector path "${obj.id}".`);
                }
            },
            { divider: true },
            {
                id: "menu-select-feather",
                label: "Feather...",
                icon: "🪶",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Feather Selection Border",
                        subtitle: "Soften the edges of the current selection by a specified pixel radius.",
                        presets: [
                            { label: "Subtle (2px)", icon: "🪶", values: { radius: "2" } },
                            { label: "Medium (5px)", icon: "☁️", values: { radius: "5" } },
                            { label: "Wide Glow (15px)", icon: "✨", values: { radius: "15" } }
                        ],
                        fields: [
                            {
                                key: "radius",
                                label: "Feather Radius (px)",
                                type: "number",
                                min: 1,
                                max: 100,
                                step: 1,
                                defaultValue: "5"
                            }
                        ],
                        submitLabel: "Feather Selection",
                        onSubmit: (vals) => {
                            const r = Math.max(1, Number(vals.radius) || 5);
                            this.state.engine.modifySelectionBounds(this.state.canvasId, "feather", r);
                            this.state.setStatus(`Feathered selection edges by ${r}px.`);
                        }
                    });
                }
            },
            {
                id: "menu-select-shrink",
                label: "Shrink...",
                icon: "🔽",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Shrink Selection (GIMP Shrink)",
                        subtitle: "Contract the current selection inward by a specified number of pixels.",
                        presets: [
                            { label: "Shrink by 2px", icon: "🔉", values: { amount: "2" } },
                            { label: "Shrink by 8px", icon: "🔽", values: { amount: "8" } },
                            { label: "Shrink by 16px", icon: "⏬", values: { amount: "16" } }
                        ],
                        fields: [
                            { key: "amount", label: "Shrink Amount (px)", type: "number", min: 1, max: 256, step: 1, defaultValue: "4" }
                        ],
                        submitLabel: "Shrink Selection",
                        onSubmit: (vals) => {
                            const px = Math.max(1, Number(vals.amount) || 4);
                            const res = this.state.engine.modifySelectionBounds(this.state.canvasId, "shrink", px);
                            this.state.setStatus(`Shrank selection by ${px}px (now ${res.width}×${res.height}px).`);
                        }
                    });
                }
            },
            {
                id: "menu-select-grow",
                label: "Grow...",
                icon: "🔼",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Grow Selection (GIMP Grow)",
                        subtitle: "Expand the current selection outward by a specified number of pixels.",
                        presets: [
                            { label: "Grow by 2px", icon: "🔉", values: { amount: "2" } },
                            { label: "Grow by 8px", icon: "🔼", values: { amount: "8" } },
                            { label: "Grow by 16px", icon: "⏫", values: { amount: "16" } }
                        ],
                        fields: [
                            { key: "amount", label: "Grow Amount (px)", type: "number", min: 1, max: 256, step: 1, defaultValue: "4" }
                        ],
                        submitLabel: "Grow Selection",
                        onSubmit: (vals) => {
                            const px = Math.max(1, Number(vals.amount) || 4);
                            const res = this.state.engine.modifySelectionBounds(this.state.canvasId, "grow", px);
                            this.state.setStatus(`Grew selection by ${px}px (now ${res.width}×${res.height}px).`);
                        }
                    });
                }
            },
            {
                id: "menu-select-border",
                label: "Border...",
                icon: "🖼️",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Border Selection",
                        subtitle: "Adjust the selection around its border by a given pixel width.",
                        presets: [
                            { label: "2px Border", icon: "🖼️", values: { amount: "2" } },
                            { label: "6px Border", icon: "🖼️", values: { amount: "6" } }
                        ],
                        fields: [
                            { key: "amount", label: "Border Width (px)", type: "number", min: 1, max: 128, step: 1, defaultValue: "4" }
                        ],
                        submitLabel: "Apply Border",
                        onSubmit: (vals) => {
                            const px = Math.max(1, Number(vals.amount) || 4);
                            this.state.engine.modifySelectionBounds(this.state.canvasId, "border", px);
                            this.state.setStatus(`Applied ${px}px selection border.`);
                        }
                    });
                }
            }
        ];
    }

    /**
     * Full GIMP View Menu (`menus/image-menu.xml.in` -> `<menu action="view-menu">` & `app/actions/view-actions.c`).
     */
    private buildViewMenu(): ContextMenuItem[] {
        return [
            {
                id: "menu-view-zoom",
                label: `Zoom (${Math.round(this.state.zoom * 100)}%)`,
                icon: "🔍",
                children: [
                    {
                        label: `Revert Zoom (${Math.round(this.state.previousZoom * 100)}%)`,
                        icon: "↩️",
                        shortcut: "`",
                        action: () => {
                            this.state.revertZoom();
                            this.state.setStatus(`Reverted zoom to ${Math.round(this.state.zoom * 100)}%.`);
                        }
                    },
                    {
                        label: "Zoom Out",
                        icon: "➖",
                        shortcut: "-",
                        action: () => {
                            this.state.setZoom(this.state.zoom - 0.25);
                            this.state.setStatus(`Zoom: ${Math.round(this.state.zoom * 100)}%`);
                        }
                    },
                    {
                        label: "Zoom In",
                        icon: "➕",
                        shortcut: "+",
                        action: () => {
                            this.state.setZoom(this.state.zoom + 0.25);
                            this.state.setStatus(`Zoom: ${Math.round(this.state.zoom * 100)}%`);
                        }
                    },
                    {
                        label: "Fit Image in Window",
                        icon: "🗖",
                        shortcut: "Ctrl+Shift+J",
                        action: () => {
                            this.state.setZoom(1.0);
                            this.state.panX = 0;
                            this.state.panY = 0;
                            this.state.setStatus("Fitted image in viewport (100%).");
                        }
                    },
                    { divider: true },
                    ...(
                        [
                            [16, "16:1 (1600%)", ""],
                            [8, "8:1 (800%)", ""],
                            [4, "4:1 (400%)", "4"],
                            [2, "2:1 (200%)", "2"],
                            [1, "1:1 (100%)", "1"],
                            [0.5, "1:2 (50%)", "Shift+2"],
                            [0.25, "1:4 (25%)", "Shift+4"]
                        ] as const
                    ).map(([z, lbl, sc]) => ({
                        label: lbl,
                        checked: Math.abs(this.state.zoom - z) < 0.01,
                        shortcut: sc || undefined,
                        action: () => {
                            this.state.setZoom(z);
                            this.state.setStatus(`Zoom set to ${lbl}.`);
                        }
                    }))
                ]
            },
            {
                id: "menu-view-flip-rotate",
                label: "Flip & Rotate",
                icon: "🔄",
                children: [
                    {
                        label: "Reset Flip & Rotate",
                        icon: "🔄",
                        shortcut: "!",
                        action: () => {
                            this.state.viewFlipH = false;
                            this.state.viewFlipV = false;
                            this.state.viewRotationDeg = 0;
                            this.state.setStatus("Reset viewport flip and rotation.");
                        }
                    },
                    { divider: true },
                    {
                        label: "Flip Horizontally",
                        checked: this.state.viewFlipH,
                        action: () => {
                            this.state.viewFlipH = !this.state.viewFlipH;
                            this.state.setStatus(`View Flip Horizontally: ${this.state.viewFlipH ? "ON" : "OFF"}`);
                        }
                    },
                    {
                        label: "Flip Vertically",
                        checked: this.state.viewFlipV,
                        action: () => {
                            this.state.viewFlipV = !this.state.viewFlipV;
                            this.state.setStatus(`View Flip Vertically: ${this.state.viewFlipV ? "ON" : "OFF"}`);
                        }
                    },
                    { divider: true },
                    {
                        label: "Rotate 15° Clockwise",
                        icon: "↻",
                        action: () => {
                            this.state.viewRotationDeg = (this.state.viewRotationDeg + 15) % 360;
                            this.state.setStatus(`View Rotation: ${this.state.viewRotationDeg}°`);
                        }
                    },
                    {
                        label: "Rotate 90° Clockwise",
                        icon: "↻",
                        action: () => {
                            this.state.viewRotationDeg = (this.state.viewRotationDeg + 90) % 360;
                            this.state.setStatus(`View Rotation: ${this.state.viewRotationDeg}°`);
                        }
                    },
                    {
                        label: "Rotate 180°",
                        icon: "🔃",
                        action: () => {
                            this.state.viewRotationDeg = (this.state.viewRotationDeg + 180) % 360;
                            this.state.setStatus(`View Rotation: ${this.state.viewRotationDeg}°`);
                        }
                    },
                    {
                        label: "Rotate 90° Counter-Clockwise",
                        icon: "↺",
                        action: () => {
                            this.state.viewRotationDeg = (this.state.viewRotationDeg + 270) % 360;
                            this.state.setStatus(`View Rotation: ${this.state.viewRotationDeg}°`);
                        }
                    }
                ]
            },
            {
                id: "menu-view-center",
                label: "Center Image in Window",
                icon: "🎯",
                shortcut: "Shift+J",
                action: () => {
                    this.state.panX = 0;
                    this.state.panY = 0;
                    this.state.setStatus("Centered image in viewport.");
                }
            },
            { divider: true },
            {
                id: "menu-view-show-selection",
                label: "Show Selection",
                shortcut: "Ctrl+T",
                checked: this.state.showSelection,
                action: () => {
                    this.state.showSelection = !this.state.showSelection;
                    this.state.setStatus(`Show Selection: ${this.state.showSelection ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-show-layer-boundary",
                label: "Show Layer Boundary",
                checked: this.state.showLayerBoundary,
                action: () => {
                    this.state.showLayerBoundary = !this.state.showLayerBoundary;
                    this.state.setStatus(`Show Layer Boundary: ${this.state.showLayerBoundary ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-show-canvas-boundary",
                label: "Show Canvas Boundary",
                checked: this.state.showCanvasBoundary,
                action: () => {
                    this.state.showCanvasBoundary = !this.state.showCanvasBoundary;
                    this.state.setStatus(`Show Canvas Boundary: ${this.state.showCanvasBoundary ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-show-guides",
                label: "Show Guides",
                shortcut: "Ctrl+Shift+T",
                checked: this.state.showGuides,
                action: () => {
                    this.state.showGuides = !this.state.showGuides;
                    this.state.setStatus(`Show Guides: ${this.state.showGuides ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-show-grid",
                label: "Show Grid",
                checked: this.state.showGrid,
                action: () => {
                    this.state.showGrid = !this.state.showGrid;
                    this.state.setStatus(`Show Grid (${this.state.gridSpacing}px): ${this.state.showGrid ? "ON" : "OFF"}`);
                }
            },
            { divider: true },
            {
                id: "menu-view-snap-guides",
                label: "Snap to Guides",
                checked: this.state.snapToGuides,
                action: () => {
                    this.state.snapToGuides = !this.state.snapToGuides;
                    this.state.setStatus(`Snap to Guides: ${this.state.snapToGuides ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-snap-grid",
                label: "Snap to Grid",
                checked: this.state.snapToGrid,
                action: () => {
                    this.state.snapToGrid = !this.state.snapToGrid;
                    this.state.setStatus(`Snap to Grid: ${this.state.snapToGrid ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-snap-canvas",
                label: "Snap to Canvas Edges",
                checked: this.state.snapToCanvasEdges,
                action: () => {
                    this.state.snapToCanvasEdges = !this.state.snapToCanvasEdges;
                    this.state.setStatus(`Snap to Canvas Edges: ${this.state.snapToCanvasEdges ? "ON" : "OFF"}`);
                }
            },
            { divider: true },
            {
                id: "menu-view-padding-color",
                label: "Padding Color",
                icon: "🎨",
                children: [
                    {
                        label: "From Theme",
                        checked: this.state.paddingColorMode === "theme",
                        action: () => {
                            this.state.paddingColorMode = "theme";
                            this.state.setStatus("Viewport padding color: From Theme.");
                        }
                    },
                    {
                        label: "Dark Check Colors",
                        checked: this.state.paddingColorMode === "dark_check",
                        action: () => {
                            this.state.paddingColorMode = "dark_check";
                            this.state.setStatus("Viewport padding color: Dark Check.");
                        }
                    },
                    {
                        label: "Light Check Colors",
                        checked: this.state.paddingColorMode === "light_check",
                        action: () => {
                            this.state.paddingColorMode = "light_check";
                            this.state.setStatus("Viewport padding color: Light Check.");
                        }
                    }
                ]
            },
            {
                id: "menu-view-show-rulers",
                label: "Show Rulers",
                shortcut: "Ctrl+Shift+R",
                checked: this.state.showRulers,
                action: () => {
                    this.state.showRulers = !this.state.showRulers;
                    this.state.setStatus(`Show Rulers: ${this.state.showRulers ? "ON" : "OFF"}`);
                }
            },
            {
                id: "menu-view-show-statusbar",
                label: "Show Statusbar",
                checked: this.state.showStatusbar,
                action: () => {
                    this.state.showStatusbar = !this.state.showStatusbar;
                    const sb = this.doc.getElementById("ha-status-bar");
                    if (sb) sb.style.display = this.state.showStatusbar ? "" : "none";
                    this.state.setStatus(`Show Statusbar: ${this.state.showStatusbar ? "ON" : "OFF"}`);
                }
            }
        ];
    }

    /**
     * Full GIMP Image Menu (`menus/image-menu.xml.in` -> `<menu action="image-menu">` & `app/actions/image-actions.c`).
     */
    private buildImageMenu(): ContextMenuItem[] {
        const st = this.state.getCanvasState();
        return [
            {
                id: "menu-image-duplicate",
                label: "Duplicate",
                icon: "📋",
                shortcut: "Ctrl+D",
                action: () => {
                    this.state.engine.newLayerFromVisible(this.state.canvasId, this.state.activeSharedObjectId);
                    this.state.setStatus("Duplicated visible image composite into a new layer.");
                }
            },
            {
                id: "menu-image-mode",
                label: "Mode",
                icon: "🎨",
                children: [
                    {
                        label: "RGB / Hybrid RGBA (Default)",
                        checked: true,
                        action: () => this.state.setStatus("Image mode: Full Hybrid RGBA + SVG Vector.")
                    },
                    {
                        label: "Grayscale (Convert Active Raster Layer)",
                        icon: "⚫",
                        action: () => {
                            const ras = this.state.resolveActiveLayer("raster");
                            this.state.engine.adjustLayerColors(this.state.canvasId, ras?.id, "desaturate");
                            this.state.setStatus("Converted active raster layer to Grayscale luminance.");
                        }
                    },
                    {
                        label: "Indexed / Posterize Colors...",
                        icon: "🎭",
                        action: () => {
                            const ras = this.state.resolveActiveLayer("raster");
                            this.state.engine.adjustLayerColors(this.state.canvasId, ras?.id, "posterize", {
                                levels: 6
                            });
                            this.state.setStatus("Posterized active raster layer to 6 color levels per channel.");
                        }
                    }
                ]
            },
            { divider: true },
            {
                id: "menu-image-transform",
                label: "Transform",
                icon: "🔄",
                children: [
                    {
                        label: "Flip Horizontally",
                        icon: "↔️",
                        action: () => {
                            this.state.engine.transformCanvas(this.state.canvasId, "flip_h");
                            this.state.setStatus("Flipped entire image horizontally.");
                        }
                    },
                    {
                        label: "Flip Vertically",
                        icon: "↕️",
                        action: () => {
                            this.state.engine.transformCanvas(this.state.canvasId, "flip_v");
                            this.state.setStatus("Flipped entire image vertically.");
                        }
                    },
                    { divider: true },
                    {
                        label: "Rotate 90° clockwise",
                        icon: "↻",
                        action: () => {
                            const res = this.state.engine.transformCanvas(this.state.canvasId, "rotate_90_cw");
                            this.state.setStatus(`Rotated image 90° CW (${res.width}×${res.height}px).`);
                        }
                    },
                    {
                        label: "Rotate 90° counter-clockwise",
                        icon: "↺",
                        action: () => {
                            const res = this.state.engine.transformCanvas(this.state.canvasId, "rotate_90_ccw");
                            this.state.setStatus(`Rotated image 90° CCW (${res.width}×${res.height}px).`);
                        }
                    },
                    {
                        label: "Rotate 180°",
                        icon: "🔃",
                        action: () => {
                            this.state.engine.transformCanvas(this.state.canvasId, "rotate_180");
                            this.state.setStatus("Rotated image 180°.");
                        }
                    }
                ]
            },
            {
                id: "menu-image-canvas-size",
                label: "Canvas Size...",
                icon: "📐",
                action: () => this.openCanvasSizeDialog()
            },
            {
                id: "menu-image-scale",
                label: "Scale Image...",
                icon: "🔍",
                action: () => this.openScaleImageDialog()
            },
            {
                id: "menu-image-crop-selection",
                label: "Crop to Selection",
                icon: "✂️",
                action: () => {
                    const res = this.state.engine.cropCanvasToSelection(this.state.canvasId);
                    this.state.setStatus(`Cropped image to selection (${res.width}×${res.height}px).`);
                }
            },
            {
                id: "menu-image-crop-content",
                label: "Crop to Content",
                icon: "🎯",
                action: () => {
                    const res = this.state.engine.cropCanvasToContent(this.state.canvasId);
                    this.state.setStatus(`Autocropped image to content (${res.width}×${res.height}px).`);
                }
            },
            { divider: true },
            {
                id: "menu-image-merge-visible",
                label: "Merge Visible Layers...",
                icon: "🗂️",
                shortcut: "Ctrl+M",
                action: () => {
                    const merged = this.state.engine.mergeVisibleLayers(this.state.canvasId);
                    this.state.activeLayerId = merged.id;
                    this.state.setStatus(`Merged visible layers into "${merged.name}".`);
                }
            },
            {
                id: "menu-image-flatten",
                label: "Flatten Image",
                icon: "🥞",
                action: () => {
                    const flat = this.state.engine.flattenImage(this.state.canvasId);
                    this.state.activeLayerId = flat.id;
                    this.state.setStatus(`Flattened image into single raster layer "${flat.name}".`);
                }
            },
            { divider: true },
            {
                id: "menu-image-guides",
                label: "Guides",
                icon: "📏",
                children: [
                    {
                        label: "New Guide (by Percent)...",
                        icon: "📏",
                        action: () => {
                            this.modal.openFormDialog({
                                title: "Add Canvas Guide by Percentage",
                                subtitle: "Place a horizontal or vertical alignment guide at a percentage of the canvas size.",
                                presets: [
                                    { label: "50% Horizontal Center", icon: "↔️", values: { orientation: "horizontal", percent: "50" } },
                                    { label: "50% Vertical Center", icon: "↕️", values: { orientation: "vertical", percent: "50" } },
                                    { label: "Rule of Thirds (33%)", icon: "📐", values: { orientation: "horizontal", percent: "33.33" } }
                                ],
                                fields: [
                                    {
                                        key: "orientation",
                                        label: "Guide Direction",
                                        type: "select",
                                        defaultValue: "horizontal",
                                        options: [
                                            { label: "Horizontal", value: "horizontal" },
                                            { label: "Vertical", value: "vertical" }
                                        ]
                                    },
                                    {
                                        key: "percent",
                                        label: "Position (%)",
                                        type: "number",
                                        min: 0,
                                        max: 100,
                                        step: 5,
                                        defaultValue: "50"
                                    }
                                ],
                                submitLabel: "Add Guide",
                                onSubmit: (vals) => {
                                    const ori = vals.orientation === "vertical" ? "vertical" : "horizontal";
                                    const pct = Math.max(0, Math.min(100, Number(vals.percent) || 50));
                                    const pos = Math.round(((ori === "horizontal" ? st.height : st.width) * pct) / 100);
                                    this.state.guides.push({ id: `guide_${Date.now()}`, orientation: ori, position: pos });
                                    this.state.showGuides = true;
                                    this.state.setStatus(`Added ${ori} guide at ${pct}% (${pos}px).`);
                                }
                            });
                        }
                    },
                    {
                        label: "New Guides from Selection",
                        icon: "⬚",
                        action: () => {
                            const sel = st.selection;
                            if (sel && sel.mode !== "none" && sel.width > 0 && sel.height > 0) {
                                this.state.guides.push(
                                    { id: `g_${Date.now()}_t`, orientation: "horizontal", position: sel.y },
                                    { id: `g_${Date.now()}_b`, orientation: "horizontal", position: sel.y + sel.height },
                                    { id: `g_${Date.now()}_l`, orientation: "vertical", position: sel.x },
                                    { id: `g_${Date.now()}_r`, orientation: "vertical", position: sel.x + sel.width }
                                );
                                this.state.showGuides = true;
                                this.state.setStatus("Added 4 guides around current selection.");
                            } else {
                                this.state.setStatus("Create a selection first to place guides around it.");
                            }
                        }
                    },
                    {
                        label: "Remove All Guides",
                        icon: "🧹",
                        action: () => {
                            this.state.guides = [];
                            this.state.setStatus("Removed all canvas guides.");
                        }
                    }
                ]
            },
            {
                id: "menu-image-configure-grid",
                label: "Configure Grid...",
                icon: "🪟",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Configure Canvas Grid (GIMP Grid Settings)",
                        subtitle: "Set the pixel spacing for the viewport alignment grid.",
                        presets: [
                            { label: "8×8 Pixel Grid", icon: "👾", values: { spacing: "8" } },
                            { label: "16×16 Sprite Grid", icon: "🎮", values: { spacing: "16" } },
                            { label: "32×32 Icon Grid", icon: "🎯", values: { spacing: "32" } },
                            { label: "64×64 Layout Grid", icon: "📐", values: { spacing: "64" } }
                        ],
                        fields: [
                            {
                                key: "spacing",
                                label: "Grid Spacing (px)",
                                type: "number",
                                min: 4,
                                max: 256,
                                step: 4,
                                defaultValue: String(this.state.gridSpacing || 32)
                            }
                        ],
                        submitLabel: "Apply Grid",
                        onSubmit: (vals) => {
                            this.state.gridSpacing = Math.max(4, Number(vals.spacing) || 32);
                            this.state.showGrid = true;
                            this.state.setStatus(`Configured grid spacing to ${this.state.gridSpacing}px and enabled grid display.`);
                        }
                    });
                }
            },
            {
                id: "menu-image-properties",
                label: "Image Properties...",
                icon: "ℹ️",
                shortcut: "Alt+Return",
                action: () => {
                    const totalVecObjs = st.layers.reduce((acc, l) => acc + (l.objects?.length || 0), 0);
                    const soCount = Object.keys(st.sharedObjects || {}).length;
                    this.state.setStatus(
                        `Image Properties: ${st.width}×${st.height}px | ${st.layers.length} layers | ${totalVecObjs} vector objects | ${soCount} shared objects | BG: ${st.backgroundColor}`
                    );
                }
            }
        ];
    }

    /**
     * Full GIMP Layer Menu (`menus/image-menu.xml.in` -> `<menu action="layers-menu">` & `app/actions/layers-actions.c`).
     */
    private buildLayerMenu(): ContextMenuItem[] {
        const activeLayer = this.state.resolveActiveLayer();
        return [
            {
                id: "menu-layer-new-raster",
                label: "New Raster Layer...",
                icon: "🖌️",
                shortcut: "Ctrl+Shift+N",
                action: () => {
                    this.modal.openFormDialog({
                        title: "Create New GIMP Raster Layer",
                        subtitle: "Add a transparent pixel layer for brushwork, gradients, selections, and filters.",
                        presets: [
                            { label: "Paint Layer (Normal 100%)", icon: "🖌️", values: { name: "Paint Layer", blendMode: "normal", opacity: "100" } },
                            { label: "Multiply Shading Layer", icon: "🌑", values: { name: "Shadows (Multiply)", blendMode: "multiply", opacity: "85" } },
                            { label: "Screen Glow Layer", icon: "✨", values: { name: "Highlights (Screen)", blendMode: "screen", opacity: "80" } }
                        ],
                        fields: [
                            { key: "name", label: "Layer Name", type: "text", defaultValue: "New Raster Layer" },
                            {
                                key: "blendMode",
                                label: "Blend Mode",
                                type: "select",
                                defaultValue: "normal",
                                options: [
                                    { label: "Normal", value: "normal" },
                                    { label: "Multiply", value: "multiply" },
                                    { label: "Screen", value: "screen" },
                                    { label: "Overlay", value: "overlay" }
                                ]
                            },
                            { key: "opacity", label: "Opacity (%)", type: "number", min: 0, max: 100, step: 5, defaultValue: "100" }
                        ],
                        submitLabel: "Create Raster Layer",
                        onSubmit: (vals) => {
                            this.state.ensureCanvasOpen();
                            const l = this.state.engine.manageLayer(this.state.canvasId, "add", {
                                layerName: vals.name || "New Raster Layer",
                                layerType: "raster",
                                blendMode: (vals.blendMode as any) || "normal",
                                opacity: Math.max(0, Math.min(1, (Number(vals.opacity) || 100) / 100)),
                                sharedObjectId: this.state.activeSharedObjectId
                            });
                            if (l) {
                                this.state.activeLayerId = l.id;
                                this.state.setStatus(`Created raster layer "${l.name}".`);
                            }
                        }
                    });
                }
            },
            {
                id: "menu-layer-new-vector",
                label: "New Vector Layer...",
                icon: "📐",
                action: () => {
                    this.state.ensureCanvasOpen();
                    const l = this.state.engine.manageLayer(this.state.canvasId, "add", {
                        layerName: "New Vector Layer",
                        layerType: "vector",
                        sharedObjectId: this.state.activeSharedObjectId
                    });
                    if (l) {
                        this.state.activeLayerId = l.id;
                        this.state.setStatus(`Created Inkscape vector layer "${l.name}".`);
                    }
                }
            },
            {
                id: "menu-layer-new-from-visible",
                label: "New from Visible",
                icon: "👁️",
                action: () => {
                    const l = this.state.engine.newLayerFromVisible(this.state.canvasId, this.state.activeSharedObjectId);
                    this.state.activeLayerId = l.id;
                    this.state.setStatus(`Created layer "${l.name}" from visible composite.`);
                }
            },
            {
                id: "menu-layer-duplicate",
                label: "Duplicate Layer",
                icon: "📋",
                shortcut: "Ctrl+Shift+D",
                disabled: !activeLayer,
                action: () => {
                    if (!activeLayer) return;
                    const dup = this.state.engine.manageLayer(this.state.canvasId, "duplicate", {
                        layerId: activeLayer.id,
                        sharedObjectId: this.state.activeSharedObjectId
                    });
                    if (dup) {
                        this.state.activeLayerId = dup.id;
                        this.state.setStatus(`Duplicated layer "${dup.name}".`);
                    }
                }
            },
            {
                id: "menu-layer-merge-down",
                label: "Merge Down",
                icon: "⏬",
                disabled: !activeLayer,
                action: () => {
                    if (!activeLayer) return;
                    const merged = this.state.engine.mergeLayerDown(
                        this.state.canvasId,
                        activeLayer.id,
                        this.state.activeSharedObjectId
                    );
                    this.state.activeLayerId = merged.id;
                    this.state.setStatus(`Merged down into layer "${merged.name}".`);
                }
            },
            {
                id: "menu-layer-delete",
                label: "Delete Layer",
                icon: "🗑️",
                danger: true,
                disabled: !activeLayer,
                action: () => {
                    if (!activeLayer) return;
                    try {
                        this.state.engine.manageLayer(this.state.canvasId, "remove", {
                            layerId: activeLayer.id,
                            sharedObjectId: this.state.activeSharedObjectId
                        });
                        this.state.resolveActiveLayer();
                        this.state.setStatus(`Deleted layer "${activeLayer.name}".`);
                    } catch (e: any) {
                        this.state.setStatus(`Cannot delete layer: ${e?.message || e}`);
                    }
                }
            },
            { divider: true },
            {
                id: "menu-layer-stack",
                label: "Stack",
                icon: "📚",
                children: [
                    {
                        label: "Raise Layer",
                        icon: "🔼",
                        disabled: !activeLayer,
                        action: () => {
                            if (!activeLayer) return;
                            const layers = this.state.getActiveLayerList();
                            const idx = layers.findIndex((l) => l.id === activeLayer.id);
                            if (idx >= 0 && idx < layers.length - 1) {
                                this.state.engine.manageLayer(this.state.canvasId, "reorder", {
                                    layerId: activeLayer.id,
                                    targetIndex: idx + 1,
                                    sharedObjectId: this.state.activeSharedObjectId
                                });
                                this.state.setStatus(`Raised layer "${activeLayer.name}".`);
                            }
                        }
                    },
                    {
                        label: "Lower Layer",
                        icon: "🔽",
                        disabled: !activeLayer,
                        action: () => {
                            if (!activeLayer) return;
                            const layers = this.state.getActiveLayerList();
                            const idx = layers.findIndex((l) => l.id === activeLayer.id);
                            if (idx > 0) {
                                this.state.engine.manageLayer(this.state.canvasId, "reorder", {
                                    layerId: activeLayer.id,
                                    targetIndex: idx - 1,
                                    sharedObjectId: this.state.activeSharedObjectId
                                });
                                this.state.setStatus(`Lowered layer "${activeLayer.name}".`);
                            }
                        }
                    },
                    {
                        label: "Layer to Top",
                        icon: "⏫",
                        disabled: !activeLayer,
                        action: () => {
                            if (!activeLayer) return;
                            const layers = this.state.getActiveLayerList();
                            this.state.engine.manageLayer(this.state.canvasId, "reorder", {
                                layerId: activeLayer.id,
                                targetIndex: layers.length - 1,
                                sharedObjectId: this.state.activeSharedObjectId
                            });
                            this.state.setStatus(`Moved layer "${activeLayer.name}" to top.`);
                        }
                    },
                    {
                        label: "Layer to Bottom",
                        icon: "⏬",
                        disabled: !activeLayer,
                        action: () => {
                            if (!activeLayer) return;
                            this.state.engine.manageLayer(this.state.canvasId, "reorder", {
                                layerId: activeLayer.id,
                                targetIndex: 0,
                                sharedObjectId: this.state.activeSharedObjectId
                            });
                            this.state.setStatus(`Moved layer "${activeLayer.name}" to bottom.`);
                        }
                    }
                ]
            },
            {
                id: "menu-layer-transform",
                label: "Transform",
                icon: "🔄",
                children: [
                    {
                        label: "Flip Horizontally",
                        icon: "↔️",
                        action: () => {
                            this.state.engine.transformLayer(
                                this.state.canvasId,
                                activeLayer?.id,
                                "flip_h",
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus(`Flipped layer "${activeLayer?.name}" horizontally.`);
                        }
                    },
                    {
                        label: "Flip Vertically",
                        icon: "↕️",
                        action: () => {
                            this.state.engine.transformLayer(
                                this.state.canvasId,
                                activeLayer?.id,
                                "flip_v",
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus(`Flipped layer "${activeLayer?.name}" vertically.`);
                        }
                    },
                    {
                        label: "Rotate 90° clockwise",
                        icon: "↻",
                        action: () => {
                            this.state.engine.transformLayer(
                                this.state.canvasId,
                                activeLayer?.id,
                                "rotate_90_cw",
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus(`Rotated layer "${activeLayer?.name}" 90° CW.`);
                        }
                    },
                    {
                        label: "Rotate 90° counter-clockwise",
                        icon: "↺",
                        action: () => {
                            this.state.engine.transformLayer(
                                this.state.canvasId,
                                activeLayer?.id,
                                "rotate_90_ccw",
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus(`Rotated layer "${activeLayer?.name}" 90° CCW.`);
                        }
                    },
                    {
                        label: "Rotate 180°",
                        icon: "🔃",
                        action: () => {
                            this.state.engine.transformLayer(
                                this.state.canvasId,
                                activeLayer?.id,
                                "rotate_180",
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus(`Rotated layer "${activeLayer?.name}" 180°.`);
                        }
                    },
                    { divider: true },
                    {
                        label: "Offset...",
                        icon: "💠",
                        shortcut: "Ctrl+Shift+O",
                        action: () => {
                            const st = this.state.getCanvasState();
                            this.modal.openFormDialog({
                                title: "Offset Layer (GIMP Seamless Tile / Shift)",
                                subtitle:
                                    "Shift the contents of the active layer horizontally and vertically, optionally wrapping around edges for seamless textures.",
                                presets: [
                                    {
                                        label: "Offset by X/2, Y/2 (Seamless Tile Check)",
                                        icon: "🏁",
                                        values: { offsetX: String(Math.floor(st.width / 2)), offsetY: String(Math.floor(st.height / 2)), wrap: "yes" }
                                    },
                                    { label: "Nudge Right +32px", icon: "➡️", values: { offsetX: "32", offsetY: "0", wrap: "no" } }
                                ],
                                fields: [
                                    { key: "offsetX", label: "Offset X (px)", type: "number", min: -4096, max: 4096, step: 1, defaultValue: "32" },
                                    { key: "offsetY", label: "Offset Y (px)", type: "number", min: -4096, max: 4096, step: 1, defaultValue: "32" },
                                    {
                                        key: "wrap",
                                        label: "Edge Behavior",
                                        type: "select",
                                        defaultValue: "yes",
                                        options: [
                                            { label: "Wrap Around (Seamless Texture)", value: "yes" },
                                            { label: "Fill Exposed Area with Transparent Pixels", value: "no" }
                                        ]
                                    }
                                ],
                                submitLabel: "Offset Layer",
                                onSubmit: (vals) => {
                                    const ox = Number(vals.offsetX) || 0;
                                    const oy = Number(vals.offsetY) || 0;
                                    const wrap = vals.wrap !== "no";
                                    this.state.engine.offsetLayer(
                                        this.state.canvasId,
                                        activeLayer?.id,
                                        ox,
                                        oy,
                                        wrap,
                                        this.state.activeSharedObjectId
                                    );
                                    this.state.setStatus(`Offset layer by (${ox}, ${oy})px [wrap=${wrap}].`);
                                }
                            });
                        }
                    }
                ]
            }
        ];
    }

    /**
     * Full GIMP Colors Menu (`menus/image-menu.xml.in` -> `<menu action="colors-menu">`).
     */
    private buildColorsMenu(): ContextMenuItem[] {
        const getRasId = () => this.state.resolveActiveLayer("raster")?.id;
        return [
            {
                id: "menu-colors-balance",
                label: "Color Balance...",
                icon: "⚖️",
                action: () => {
                    this.modal.openFormDialog({
                        title: "GIMP Color Balance",
                        subtitle: "Shift the color balance of the active raster layer between Cyan/Red, Magenta/Green, and Yellow/Blue.",
                        presets: [
                            { label: "Warm Golden Sunset", icon: "🌅", values: { cyanRed: "35", magentaGreen: "10", yellowBlue: "-30" } },
                            { label: "Cool Cyberpunk Cyan", icon: "❄️", values: { cyanRed: "-35", magentaGreen: "5", yellowBlue: "40" } },
                            { label: "Neon Magenta Shift", icon: "🔮", values: { cyanRed: "25", magentaGreen: "-35", yellowBlue: "25" } }
                        ],
                        fields: [
                            { key: "cyanRed", label: "Cyan (-100) ↔ Red (+100)", type: "number", min: -100, max: 100, step: 5, defaultValue: "20" },
                            { key: "magentaGreen", label: "Magenta (-100) ↔ Green (+100)", type: "number", min: -100, max: 100, step: 5, defaultValue: "0" },
                            { key: "yellowBlue", label: "Yellow (-100) ↔ Blue (+100)", type: "number", min: -100, max: 100, step: 5, defaultValue: "-20" }
                        ],
                        submitLabel: "Apply Color Balance",
                        onSubmit: (vals) => {
                            this.state.engine.adjustLayerColors(
                                this.state.canvasId,
                                getRasId(),
                                "color_balance",
                                {
                                    cyanRed: Number(vals.cyanRed) || 0,
                                    magentaGreen: Number(vals.magentaGreen) || 0,
                                    yellowBlue: Number(vals.yellowBlue) || 0
                                },
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Color Balance adjustment.");
                        }
                    });
                }
            },
            {
                id: "menu-colors-hue-saturation",
                label: "Hue-Saturation...",
                icon: "🌈",
                action: () => {
                    this.modal.openFormDialog({
                        title: "GIMP Hue-Saturation",
                        subtitle: "Rotate hue angles, boost or mute color saturation, and adjust lightness on the active raster layer.",
                        presets: [
                            { label: "Vibrant Boost (+40 Sat)", icon: "🔥", values: { hue: "0", saturation: "40", lightness: "5" } },
                            { label: "Shift Hue +90°", icon: "🌈", values: { hue: "90", saturation: "10", lightness: "0" } },
                            { label: "Muted Vintage (-45 Sat)", icon: "📷", values: { hue: "15", saturation: "-45", lightness: "5" } }
                        ],
                        fields: [
                            { key: "hue", label: "Hue Rotation (-180° to +180°)", type: "number", min: -180, max: 180, step: 15, defaultValue: "30" },
                            { key: "saturation", label: "Saturation (-100 to +100)", type: "number", min: -100, max: 100, step: 5, defaultValue: "25" },
                            { key: "lightness", label: "Lightness (-100 to +100)", type: "number", min: -100, max: 100, step: 5, defaultValue: "0" }
                        ],
                        submitLabel: "Apply Hue-Saturation",
                        onSubmit: (vals) => {
                            this.state.engine.adjustLayerColors(
                                this.state.canvasId,
                                getRasId(),
                                "hue_saturation",
                                {
                                    hue: Number(vals.hue) || 0,
                                    saturation: Number(vals.saturation) || 0,
                                    lightness: Number(vals.lightness) || 0
                                },
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Hue-Saturation adjustment.");
                        }
                    });
                }
            },
            {
                id: "menu-colors-brightness-contrast",
                label: "Brightness-Contrast...",
                icon: "☀️",
                action: () => {
                    this.modal.openFormDialog({
                        title: "GIMP Brightness-Contrast",
                        subtitle: "Adjust overall brightness and contrast of the active raster layer.",
                        presets: [
                            { label: "Crisp Pop (+15 Bright, +30 Contrast)", icon: "✨", values: { brightness: "15", contrast: "30" } },
                            { label: "Brighten Shadows (+35 Bright)", icon: "☀️", values: { brightness: "35", contrast: "10" } },
                            { label: "High Contrast Drama (+60 Contrast)", icon: "🎭", values: { brightness: "0", contrast: "60" } }
                        ],
                        fields: [
                            { key: "brightness", label: "Brightness (-127 to +127)", type: "number", min: -127, max: 127, step: 5, defaultValue: "15" },
                            { key: "contrast", label: "Contrast (-127 to +127)", type: "number", min: -127, max: 127, step: 5, defaultValue: "25" }
                        ],
                        submitLabel: "Apply Brightness-Contrast",
                        onSubmit: (vals) => {
                            this.state.engine.rasterFilter(
                                this.state.canvasId,
                                getRasId(),
                                {
                                    filterType: "brightness_contrast",
                                    brightness: Number(vals.brightness) || 0,
                                    contrast: Number(vals.contrast) || 0
                                },
                                this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Brightness-Contrast adjustment.");
                        }
                    });
                }
            },
            {
                id: "menu-colors-threshold",
                label: "Threshold...",
                icon: "◑",
                action: () => {
                    this.modal.openFormDialog({
                        title: "GIMP Threshold (Black & White Cut)",
                        subtitle: "Convert the active raster layer into high-contrast black and white pixels based on luminance.",
                        presets: [
                            { label: "Balanced 50% (128)", icon: "◑", values: { threshold: "128" } },
                            { label: "Dark Ink (90)", icon: "🖋️", values: { threshold: "90" } },
                            { label: "Bright Stencil (170)", icon: "💡", values: { threshold: "170" } }
                        ],
                        fields: [
                            { key: "threshold", label: "Threshold Level (0-255)", type: "number", min: 0, max: 255, step: 5, defaultValue: "128" }
                        ],
                        submitLabel: "Apply Threshold",
                        onSubmit: (vals) => {
                            this.state.engine.rasterFilter(
                                this.state.canvasId,
                                getRasId(),
                                { filterType: "threshold", threshold: Number(vals.threshold) || 128 },
                                this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Threshold adjustment.");
                        }
                    });
                }
            },
            {
                id: "menu-colors-posterize",
                label: "Posterize...",
                icon: "🎨",
                action: () => {
                    this.modal.openFormDialog({
                        title: "GIMP Posterize (Reduce Color Levels)",
                        subtitle: "Reduce the number of distinct tonal levels in each RGB channel for a bold retro/silkscreen look.",
                        presets: [
                            { label: "Retro 4 Levels", icon: "👾", values: { levels: "4" } },
                            { label: "Comic Art 6 Levels", icon: "💥", values: { levels: "6" } },
                            { label: "Subtle 12 Levels", icon: "🎨", values: { levels: "12" } }
                        ],
                        fields: [
                            { key: "levels", label: "Posterize Levels (2-64)", type: "number", min: 2, max: 64, step: 1, defaultValue: "5" }
                        ],
                        submitLabel: "Apply Posterize",
                        onSubmit: (vals) => {
                            this.state.engine.adjustLayerColors(
                                this.state.canvasId,
                                getRasId(),
                                "posterize",
                                { levels: Number(vals.levels) || 5 },
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Posterize adjustment.");
                        }
                    });
                }
            },
            { divider: true },
            {
                id: "menu-colors-invert",
                label: "Invert",
                icon: "🔄",
                action: () => {
                    this.state.engine.rasterFilter(
                        this.state.canvasId,
                        getRasId(),
                        { filterType: "invert" },
                        this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                        this.state.activeSharedObjectId
                    );
                    this.state.setStatus("Inverted active raster layer colors.");
                }
            },
            {
                id: "menu-colors-desaturate",
                label: "Desaturate",
                icon: "⚫",
                children: [
                    {
                        label: "Desaturate (Luminance)",
                        icon: "⚫",
                        action: () => {
                            this.state.engine.adjustLayerColors(
                                this.state.canvasId,
                                getRasId(),
                                "desaturate",
                                {},
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Desaturated active raster layer.");
                        }
                    },
                    {
                        label: "Sepia Tone",
                        icon: "📜",
                        action: () => {
                            this.state.engine.adjustLayerColors(
                                this.state.canvasId,
                                getRasId(),
                                "sepia",
                                {},
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Sepia Tone to active raster layer.");
                        }
                    }
                ]
            },
            {
                id: "menu-colors-auto",
                label: "Auto",
                icon: "🪄",
                children: [
                    {
                        label: "White Balance / Stretch Contrast",
                        icon: "✨",
                        action: () => {
                            this.state.engine.adjustLayerColors(
                                this.state.canvasId,
                                getRasId(),
                                "white_balance",
                                {},
                                this.state.activeSharedObjectId
                            );
                            this.state.setStatus("Applied Auto Stretch Contrast / White Balance.");
                        }
                    }
                ]
            }
        ];
    }

    /**
     * Full GIMP Tools Menu (`menus/image-menu.xml.in` -> `<menu action="tools-menu">`).
     */
    private buildToolsMenu(): ContextMenuItem[] {
        const vecTools = EditorToolRegistry.getToolsForContext("vector");
        const rasTools = EditorToolRegistry.getToolsForContext("raster");

        return [
            {
                id: "menu-tools-selection",
                label: "Selection Tools",
                icon: "⬚",
                children: rasTools
                    .filter((t) => t.category === "selection" || t.id.includes("select") || t.id.includes("lasso") || t.id.includes("wand"))
                    .map((t) => ({
                        label: t.label,
                        icon: t.icon,
                        shortcut: t.shortcut,
                        checked: this.state.activeToolId === t.id,
                        action: () => {
                            this.state.resolveActiveLayer("raster");
                            this.state.activeToolId = t.id;
                            this.state.setStatus(`Selected tool: ${t.label} (${t.shortcut}).`);
                        }
                    }))
            },
            {
                id: "menu-tools-paint",
                label: "Paint Tools (GIMP)",
                icon: "🖌️",
                children: rasTools
                    .filter((t) => t.category === "raster" && !t.id.includes("select") && !t.id.includes("lasso") && !t.id.includes("wand"))
                    .map((t) => ({
                        label: t.label,
                        icon: t.icon,
                        shortcut: t.shortcut,
                        checked: this.state.activeToolId === t.id,
                        action: () => {
                            this.state.resolveActiveLayer("raster");
                            this.state.activeToolId = t.id;
                            this.state.setStatus(`Selected tool: ${t.label} (${t.shortcut}).`);
                        }
                    }))
            },
            {
                id: "menu-tools-vector",
                label: "Vector & Path Tools (Inkscape)",
                icon: "📐",
                children: vecTools.map((t) => ({
                    label: t.label,
                    icon: t.icon,
                    shortcut: t.shortcut,
                    checked: this.state.activeToolId === t.id,
                    action: () => {
                        this.state.resolveActiveLayer("vector");
                        this.state.activeToolId = t.id;
                        this.state.setStatus(`Selected tool: ${t.label} (${t.shortcut}).`);
                    }
                }))
            },
            { divider: true },
            {
                id: "menu-tools-default-colors",
                label: "Default Colors",
                icon: "🎨",
                shortcut: "D",
                action: () => {
                    this.state.toolOptions.primaryColor = "#00d4ff";
                    this.state.toolOptions.secondaryColor = "#ff007f";
                    this.state.setStatus("Reset Foreground (#00d4ff) and Background (#ff007f) colors.");
                }
            },
            {
                id: "menu-tools-swap-colors",
                label: "Swap Colors",
                icon: "⇄",
                shortcut: "X",
                action: () => {
                    const tmp = this.state.toolOptions.primaryColor;
                    this.state.toolOptions.primaryColor = this.state.toolOptions.secondaryColor;
                    this.state.toolOptions.secondaryColor = tmp;
                    this.state.setStatus("Swapped Foreground and Background colors.");
                }
            }
        ];
    }

    private buildVectorMenu(): ContextMenuItem[] {
        return [
            {
                label: "Boolean Union",
                icon: "🔗",
                shortcut: "Ctrl++",
                action: () => this.runMenuBool("union")
            },
            {
                label: "Boolean Difference",
                icon: "➖",
                shortcut: "Ctrl+-",
                action: () => this.runMenuBool("difference")
            },
            {
                label: "Boolean Intersection",
                icon: "✖",
                shortcut: "Ctrl+*",
                action: () => this.runMenuBool("intersection")
            },
            {
                label: "Boolean Exclusion",
                icon: "➗",
                shortcut: "Ctrl+^",
                action: () => this.runMenuBool("exclusion")
            },
            { divider: true },
            {
                label: "Simplify Vector Path",
                icon: "〰️",
                shortcut: "Ctrl+L",
                action: () => {
                    if (this.state.selectedObjectIds.length === 0) {
                        this.state.setStatus("Select a vector shape or path first.");
                        return;
                    }
                    const res = this.state.engine.pathOperation(this.state.canvasId, "simplify", {
                        targetIds: [this.state.selectedObjectIds[0]],
                        simplifyTolerance: 2
                    });
                    this.state.selectedObjectIds = [res.id];
                    this.state.setStatus(`Simplified vector path "${res.id}".`);
                }
            },
            {
                label: "Outset / Expand Vector Path (+4px)",
                icon: "🔼",
                action: () => {
                    if (this.state.selectedObjectIds.length === 0) {
                        this.state.setStatus("Select a vector shape or path first.");
                        return;
                    }
                    const res = this.state.engine.pathOperation(this.state.canvasId, "offset", {
                        targetIds: [this.state.selectedObjectIds[0]],
                        offsetDistance: 4
                    });
                    this.state.selectedObjectIds = [res.id];
                    this.state.setStatus(`Expanded vector path by +4px -> "${res.id}".`);
                }
            }
        ];
    }

    private runMenuBool(op: "union" | "difference" | "intersection" | "exclusion"): void {
        if (this.state.selectedObjectIds.length < 2) {
            this.state.setStatus("Select 2 vector objects first.");
            return;
        }
        const res = this.state.engine.pathOperation(this.state.canvasId, op, {
            targetIds: this.state.selectedObjectIds.slice(0, 2)
        });
        this.state.selectedObjectIds = [res.id];
        this.state.setStatus(`Executed Boolean ${op} -> "${res.id}".`);
    }

    /**
     * Full GIMP Filters Menu (`menus/image-menu.xml.in` -> `<menu action="filters-menu">`).
     * Includes Repeat Last (`Ctrl+F`), Re-Show Last (`Ctrl+Shift+F`), categorized submenus,
     * and direct access to all registered filters.
     */
    private buildFiltersMenu(): ContextMenuItem[] {
        const lastFilter = this.state.lastFilterExecution;
        const applyFilterItem = (f: { filterType: string; displayName: string }) => {
            const ras = this.state.resolveActiveLayer("raster");
            const opts = {
                filterType: f.filterType as any,
                radius: 3,
                amount: 1.2,
                threshold: 128,
                brightness: 15,
                contrast: 20
            };
            this.state.engine.rasterFilter(
                this.state.canvasId,
                ras?.id,
                opts,
                this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                this.state.activeSharedObjectId
            );
            this.state.recordFilterExecution(f.filterType, f.displayName, opts);
            this.state.setStatus(`Applied filter "${f.displayName}".`);
        };

        const allFilters = RasterFilterRegistry.getAllFilters();
        const categories = Array.from(
            new Set([...GIMP_FILTER_CATEGORIES, ...allFilters.map(f => f.category || "Generic")])
        );

        const categorySubmenus: ContextMenuItem[] = categories
            .map((cat) => {
                const inCat = allFilters.filter(f => (f.category || "Generic") === cat);
                if (inCat.length === 0) return null;
                return {
                    id: `menu-filters-cat-${cat.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                    label: cat,
                    icon: "📂",
                    children: inCat.map((f) => ({
                        id: `menu-filter-item-${f.filterType}`,
                        label: f.displayName,
                        icon: "✨",
                        action: () => applyFilterItem(f)
                    }))
                } as ContextMenuItem;
            })
            .filter((item): item is ContextMenuItem => item !== null);

        return [
            {
                id: "menu-filters-repeat",
                label: lastFilter ? `Repeat "${lastFilter.displayName}"` : "Repeat Last",
                icon: "🔁",
                shortcut: "Ctrl+F",
                disabled: !lastFilter,
                action: () => {
                    if (!lastFilter) return;
                    const ras = this.state.resolveActiveLayer("raster");
                    this.state.engine.rasterFilter(
                        this.state.canvasId,
                        ras?.id,
                        lastFilter.options as any,
                        this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                        this.state.activeSharedObjectId
                    );
                    this.state.setStatus(`Repeated filter "${lastFilter.displayName}".`);
                }
            },
            {
                id: "menu-filters-js-studio",
                label: "GIMP Filter Studio & JS Preset Editor...",
                icon: "🧬",
                action: () => {
                    const studioBtn = this.doc.getElementById("btn-open-filter-js-studio") as HTMLButtonElement | null;
                    if (studioBtn) studioBtn.click();
                }
            },
            { divider: true },
            ...categorySubmenus
        ];
    }

    private buildSharedObjectsMenu(): ContextMenuItem[] {
        return [
            {
                label: "Create New Shared Object...",
                icon: "🧩",
                action: () => this.onOpenSharedObjectModal()
            },
            {
                label: "Exit Shared Object Edit Mode (Return to Main Canvas)",
                icon: "🔙",
                disabled: this.state.editMode === "none",
                action: () => this.state.exitSharedObjectEdit()
            }
        ];
    }

    private buildLibraryMenu(): ContextMenuItem[] {
        return [
            {
                label: `OS Config Dir: ${path.basename(this.state.configManager.getConfigDir())}`,
                icon: "📁",
                disabled: true
            },
            {
                label: "Browse & Choose Library Folder...",
                icon: "📂",
                action: () => {
                    this.modal.openFileBrowserDialog({
                        title: "Select Reusable Shared Object Library Folder",
                        subtitle: "Navigate into the folder where you want HAEditor to store reusable Shared Object packages (.haso) across projects, then click 'Select This Folder'.",
                        mode: "directory",
                        submitLabel: "Select This Folder",
                        initialDir: this.state.library.getLibraryDir(),
                        onSubmit: (chosenDir) => {
                            if (chosenDir) {
                                this.state.configManager.updateConfig({ customLibraryDir: chosenDir });
                                this.state.setStatus(`Updated Reusable Library folder to "${chosenDir}".`);
                            }
                        }
                    });
                }
            },
            {
                label: "Reset Library Folder to Default OS Config Directory",
                icon: "🔄",
                action: () => {
                    this.state.configManager.updateConfig({ customLibraryDir: undefined });
                    this.state.setStatus(`Reset Reusable Library folder to "${this.state.library.getLibraryDir()}".`);
                }
            }
        ];
    }

    /**
     * Full GIMP Windows Menu (`menus/image-menu.xml.in` -> `<menu action="windows-menu">`).
     */
    private buildWindowsMenu(): ContextMenuItem[] {
        return [
            {
                id: "menu-windows-dockable",
                label: "Dockable Dialogs",
                icon: "🪟",
                children: [
                    {
                        label: "Layers, Objects & Shared Objects Dock",
                        icon: "🗂️",
                        action: () => {
                            this.state.hideDocks = false;
                            const rightEl = this.doc.getElementById("ha-right-inspector");
                            if (rightEl) rightEl.style.display = "";
                            this.state.setStatus("Focused Layers, Objects & Shared Objects dock.");
                        }
                    },
                    {
                        label: "Animation Timeline & Keyframes Dock",
                        icon: "🎞️",
                        action: () => {
                            this.state.hideDocks = false;
                            const botEl = this.doc.getElementById("ha-bottom-timeline");
                            if (botEl) botEl.style.display = "";
                            this.state.setStatus("Focused Animation Timeline dock.");
                        }
                    },
                    {
                        label: "Undo History Dialog...",
                        icon: "⏪",
                        action: () => this.openUndoHistoryDialog()
                    },
                    {
                        label: "🤖 AI Studio Chat Dock",
                        icon: "🤖",
                        action: () => {
                            const toggleBtn = this.doc.getElementById("btn-toggle-ai-dock") as HTMLButtonElement | null;
                            if (toggleBtn) toggleBtn.click();
                        }
                    }
                ]
            },
            {
                id: "menu-windows-toolbox",
                label: "Toolbox",
                icon: "🧰",
                shortcut: "Ctrl+B",
                action: () => {
                    const tb = this.doc.getElementById("ha-left-toolbox");
                    if (tb) {
                        tb.style.display = tb.style.display === "none" ? "" : "none";
                    }
                    this.state.setStatus("Toggled Left Toolbox dock.");
                }
            },
            {
                id: "menu-windows-hide-docks",
                label: "Hide Docks",
                shortcut: "Tab",
                checked: this.state.hideDocks,
                action: () => {
                    this.state.hideDocks = !this.state.hideDocks;
                    const leftEl = this.doc.getElementById("ha-left-toolbox");
                    const rightEl = this.doc.getElementById("ha-right-inspector");
                    const botEl = this.doc.getElementById("ha-bottom-timeline");
                    const disp = this.state.hideDocks ? "none" : "";
                    if (leftEl) leftEl.style.display = disp;
                    if (rightEl) rightEl.style.display = disp;
                    if (botEl) botEl.style.display = disp;
                    this.state.setStatus(`Hide Docks: ${this.state.hideDocks ? "ON (Distraction-Free Canvas)" : "OFF"}`);
                }
            },
            {
                id: "menu-windows-single-window",
                label: "Single-Window Mode",
                checked: true,
                action: () => this.state.setStatus("Single-Window Studio Mode is active.")
            }
        ];
    }

    private buildAiStudioMenu(): ContextMenuItem[] {
        const cfg = this.state.configManager.getConfig();
        return [
            {
                label: `LM Studio Server: ${cfg.lmStudioUrl || "http://localhost:1234"}`,
                icon: "🔌",
                action: () => this.onOpenAiSettings?.()
            },
            {
                label: "Configure LM Studio Server & Model...",
                icon: "⚙️",
                action: () => this.onOpenAiSettings?.()
            },
            {
                label: "Browse All 26 AI Canvas Tools...",
                icon: "🧰",
                action: () => this.onOpenAiToolsCatalog?.()
            },
            { divider: true },
            {
                label: "Ask AI to Inspect Scene Graph",
                icon: "🔍",
                action: () =>
                    this.state.askAi(
                        "Inspect the current canvas scene graph and summarize all layers, vector shapes, and shared objects."
                    )
            },
            {
                label: "Ask AI to Create Vector Illustration...",
                icon: "📐",
                action: () =>
                    this.state.askAi(
                        "Draw a vibrant vector illustration on the active vector layer with shapes, paths, and text."
                    )
            },
            {
                label: "Ask AI to Paint & Filter Raster Layer...",
                icon: "🖌️",
                action: () =>
                    this.state.askAi(
                        "Paint a gradient backdrop on the raster layer and apply a GIMP drop shadow filter."
                    )
            },
            {
                label: "Ask AI to Create a Reusable Shared Object...",
                icon: "🧩",
                action: () =>
                    this.state.askAi(
                        "Create a new categorized Shared Object badge under 'UI/Badges/' and instantiate an <ObjectRef> on the canvas."
                    )
            },
            {
                label: "Ask AI to Animate Selected Object...",
                icon: "🎞️",
                action: () =>
                    this.state.askAi(
                        "Configure the animation timeline and add smooth keyframe animation to the active objects."
                    )
            }
        ];
    }

    /**
     * Full GIMP Help Menu (`menus/image-menu.xml.in` -> `<menu action="help-menu">`).
     */
    private buildHelpMenu(): ContextMenuItem[] {
        return [
            {
                id: "menu-help-shortcuts",
                label: "Keyboard Shortcuts Reference...",
                icon: "⌨️",
                shortcut: "F1",
                action: () => this.openKeyboardShortcutsDialog()
            },
            {
                id: "menu-help-undo-history",
                label: "Open Undo History...",
                icon: "⏪",
                action: () => this.openUndoHistoryDialog()
            },
            {
                id: "menu-help-ai-tools",
                label: "Browse All 26 AI Studio Tools...",
                icon: "🤖",
                action: () => this.onOpenAiToolsCatalog?.()
            },
            { divider: true },
            {
                id: "menu-help-about",
                label: "About HAEditor (GIMP + Inkscape + AI Hybrid Studio)",
                icon: "🎨",
                action: () => {
                    this.state.setStatus(
                        "HAEditor v1.0 — Unified GIMP Raster + Inkscape Vector + Reusable Shared Objects (.hacanvas) + Live AI Studio."
                    );
                }
            }
        ];
    }
}

