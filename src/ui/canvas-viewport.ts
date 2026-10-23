import { AbstractUIComponent } from "./abstract-ui-component.js";
import type { ContextMenuItem, ContextMenuManager } from "./context-menu.js";
import type { ModalDialogManager } from "./modal-dialog.js";
import type { EditorSessionState } from "../state/editor-state.js";
import { EditorToolRegistry, type Point2D } from "../tools/abstract-editor-tool.js";
import { RasterFilterRegistry } from "@nexustools/hacanvas";

/**
 * Central interactive Canvas Viewport component inheriting from `AbstractUIComponent`.
 * Supports:
 * - Main Canvas rendering
 * - **In-Place Shared Object Editing** on the main canvas (with darkened overlay outside the `<ObjectRef>` bounds)
 * - **Isolated Sub-Canvas Tab Editing** for Shared Objects
 * - Vector bounding-box handles, raster selection marching ants, and custom GIMP right-click context menus.
 */
export class CanvasViewport extends AbstractUIComponent {
    private readonly state: EditorSessionState;
    private readonly contextMenu: ContextMenuManager;
    private readonly modal: ModalDialogManager;
    private readonly onNewCanvas?: () => void;
    private readonly onOpenFile?: () => void;

    private displayCanvas!: HTMLCanvasElement;
    private overlayCanvas!: HTMLCanvasElement;
    private tabsBarEl!: HTMLElement;
    private bannerEl!: HTMLElement;
    private stageWrapperEl!: HTMLElement;
    private splashScreenEl!: HTMLElement;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal: ModalDialogManager,
        onNewCanvas?: () => void,
        onOpenFile?: () => void
    ) {
        super(containerEl);
        this.state = state;
        this.contextMenu = contextMenu;
        this.modal = modal;
        this.onNewCanvas = onNewCanvas;
        this.onOpenFile = onOpenFile;
        this.state.inPlaceTextEditHandler = (objectId: string) => {
            this.openInPlaceTextEditor(objectId);
        };
        this.render();
    }

    public override render(): void {
        this.containerEl.innerHTML = "";
        this.containerEl.className = "ha-viewport-root";

        this.tabsBarEl = this.createElement("div", "ha-viewport-tabs-bar", undefined, {
            id: "ha-viewport-tabs-bar"
        });
        this.bannerEl = this.createElement("div", "ha-viewport-mode-banner", undefined, {
            id: "ha-viewport-mode-banner"
        });

        const scrollArea = this.createElement("div", "ha-viewport-scroll-area");
        this.splashScreenEl = this.renderSplashScreen();
        this.stageWrapperEl = this.createElement("div", "ha-canvas-stage-wrapper", undefined, {
            id: "ha-canvas-stage-wrapper"
        });

        this.displayCanvas = this.createElement("canvas", "ha-display-canvas", undefined, {
            id: "ha-display-canvas"
        });
        this.overlayCanvas = this.createElement("canvas", "ha-overlay-canvas", undefined, {
            id: "ha-overlay-canvas"
        });

        this.stageWrapperEl.append(this.displayCanvas, this.overlayCanvas);
        scrollArea.append(this.splashScreenEl, this.stageWrapperEl);
        this.containerEl.append(this.tabsBarEl, this.bannerEl, scrollArea);

        this.bindCanvasEvents();
        this.refreshViewport();
    }

    private renderSplashScreen(): HTMLElement {
        const splash = this.createElement("div", "ha-splash-screen", undefined, {
            id: "ha-splash-screen"
        });

        const card = this.createElement("div", "ha-splash-card");

        const header = this.createElement("div", "ha-splash-header");
        const badge = this.createElement("div", "ha-splash-badge", "OPEN PACKAGING ZIP + XML • GIMP RASTER + INKSCAPE VECTOR");
        const title = this.createElement("h1", "ha-splash-title", "🎨 HACanvas & HAEditor Studio");
        const subtitle = this.createElement(
            "p",
            "ha-splash-subtitle",
            "HACanvas (.hacanvas) is a hybrid 2D raster & vector document engine and Open Packaging ZIP+XML archive format that unifies GIMP-style pixel layers, Inkscape-style SVG vector geometry, hierarchical Reusable Shared Objects (<ObjectRef>), multi-format codecs (.psd, .xcf, .ai, .svg, .ora, .png, .gif), keyframe animations, and live LM Studio AI authoring."
        );
        header.append(badge, title, subtitle);

        const actionsRow = this.createElement("div", "ha-splash-actions");
        const newBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary ha-splash-action-btn",
            "✨ New",
            {
                id: "btn-splash-new-canvas",
                type: "button",
                title: "Create a New Hybrid Canvas (Ctrl+N)"
            }
        );
        newBtn.addEventListener("click", () => {
            if (this.onNewCanvas) {
                this.onNewCanvas();
            } else {
                this.state.ensureCanvasOpen(640, 420, "#161822");
                this.state.notify();
            }
        });

        const openBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary ha-splash-action-btn",
            "📂 Open",
            {
                id: "btn-splash-open-file",
                type: "button",
                title: "Open an Existing .hacanvas, .psd, .xcf, .ai, .svg, .ora, or Image File (Ctrl+O)"
            }
        );
        openBtn.addEventListener("click", () => {
            if (this.onOpenFile) {
                this.onOpenFile();
            }
        });
        actionsRow.append(newBtn, openBtn);

        const featuresGrid = this.createElement("div", "ha-splash-features-grid");
        const features = [
            {
                icon: "📦",
                title: ".hacanvas ZIP + XML Architecture",
                desc: "Structured like .docx Open Packaging Conventions ([Content_Types].xml, _rels/.rels, canvas/document.xml, objects/<id>.xml, media/) storing lossless RGBA buffers, cel frames, and SVG vector trees."
            },
            {
                icon: "🖌️",
                title: "Context-Sensitive GIMP + Inkscape Tools",
                desc: "Select a Vector layer for Inkscape shapes, Bezier paths, text, and Boolean operations, or select a Raster layer for GIMP brushes, flood/gradient fills, marching-ants selections, and pixel filters."
            },
            {
                icon: "🧩",
                title: "Reusable Shared Objects & Library",
                desc: "Author self-contained sub-canvases with their own vector & raster layers, edit them In-Place on the main canvas or in Isolated Tabs, and save them to your cross-project OS Config Library (.haso)."
            },
            {
                icon: "🤖",
                title: "LM Studio AI Assistant (localhost:1234)",
                desc: "26 live-streaming canvas tools with Fast Non-Reasoning execution and 3-Level Brain Reasoning (Low, Medium, Max) plus multi-format import (.psd, .xcf, .ai, .svg, .ora, .png, .gif)."
            }
        ];

        for (const f of features) {
            const item = this.createElement("div", "ha-splash-feature-card");
            const fTitle = this.createElement("div", "ha-splash-feature-title", `${f.icon} ${f.title}`);
            const fDesc = this.createElement("div", "ha-splash-feature-desc", f.desc);
            item.append(fTitle, fDesc);
            featuresGrid.appendChild(item);
        }

        card.append(header, actionsRow, featuresGrid);
        splash.appendChild(card);
        return splash;
    }

    private getCanvasCoordinates(ev: MouseEvent): Point2D {
        const rect = this.overlayCanvas.getBoundingClientRect();
        const scaleX = this.overlayCanvas.width / Math.max(1, rect.width);
        const scaleY = this.overlayCanvas.height / Math.max(1, rect.height);
        return {
            x: Math.round((ev.clientX - rect.left) * scaleX),
            y: Math.round((ev.clientY - rect.top) * scaleY)
        };
    }

    private bindCanvasEvents(): void {
        this.overlayCanvas.addEventListener("mousedown", (ev: MouseEvent) => {
            if (ev.button !== 0) return;
            const pt = this.getCanvasCoordinates(ev);
            const tool = EditorToolRegistry.getTool(this.state.activeToolId);
            tool.onPointerDown(this.state, pt, ev);
            this.drawOverlay();
        });

        this.overlayCanvas.addEventListener("mousemove", (ev: MouseEvent) => {
            const pt = this.getCanvasCoordinates(ev);
            const tool = EditorToolRegistry.getTool(this.state.activeToolId);
            tool.onPointerMove(this.state, pt, ev);
            this.drawOverlay();
        });

        this.listen(this.win, "mouseup", (ev: MouseEvent) => {
            if (ev.button !== 0) return;
            const pt = this.getCanvasCoordinates(ev);
            const tool = EditorToolRegistry.getTool(this.state.activeToolId);
            tool.onPointerUp(this.state, pt, ev);
            this.drawOverlay();
        });

        this.overlayCanvas.addEventListener("dblclick", (ev: MouseEvent) => {
            const pt = this.getCanvasCoordinates(ev);
            const tool = EditorToolRegistry.getTool(this.state.activeToolId);
            tool.onDoubleClick(this.state, pt, ev);
        });

        this.overlayCanvas.addEventListener("contextmenu", (ev: MouseEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            const pt = this.getCanvasCoordinates(ev);
            this.contextMenu.openMenu(ev.clientX, ev.clientY, this.buildCanvasContextMenu(pt));
        });
    }

    public refreshViewport(): void {
        if (!this.displayCanvas) {
            this.render();
            return;
        }
        if (!this.state.hasOpenCanvas) {
            this.tabsBarEl.innerHTML = "";
            this.tabsBarEl.classList.add("ha-hidden");
            this.bannerEl.innerHTML = "";
            this.bannerEl.className = "ha-viewport-mode-banner";
            this.stageWrapperEl.classList.add("ha-hidden");
            this.splashScreenEl.classList.remove("ha-hidden");
            return;
        }
        this.splashScreenEl.classList.add("ha-hidden");
        this.stageWrapperEl.classList.remove("ha-hidden");
        this.tabsBarEl.classList.remove("ha-hidden");
        this.renderTabsAndBanner();
        this.drawCompositedFrame();
        this.drawOverlay();
    }

    private renderTabsAndBanner(): void {
        const cState = this.state.getCanvasState();
        this.tabsBarEl.innerHTML = "";

        // Main Canvas Tab (with × close button)
        const isMainActive = this.state.editMode === "none" || this.state.editMode === "in_place";
        const mainTab = this.createElement(
            "div",
            `ha-viewport-tab ${isMainActive ? "active" : ""}`,
            undefined,
            {
                id: "tab-main-canvas"
            }
        );
        const mainLabel = this.createElement(
            "span",
            "ha-tab-label",
            `🎨 Main Canvas (${cState.width}×${cState.height})`
        );
        mainLabel.addEventListener("click", () => this.state.exitSharedObjectEdit());
        const mainClose = this.createElement("span", "ha-tab-close", "×", {
            id: "btn-close-main-canvas-tab",
            title: "Close Canvas Tab (Ctrl+W)"
        });
        mainClose.addEventListener("click", (e) => {
            e.stopPropagation();
            this.state.closeMainCanvas();
        });
        mainTab.append(mainLabel, mainClose);
        this.tabsBarEl.appendChild(mainTab);

        // Open Shared Object Isolated Tabs
        for (const sharedId of this.state.openSharedObjectTabs) {
            const spec = cState.sharedObjects[sharedId];
            if (!spec) continue;
            const isTabActive =
                this.state.editMode === "isolated_tab" && this.state.activeSharedObjectId === sharedId;
            const tabEl = this.createElement(
                "div",
                `ha-viewport-tab ${isTabActive ? "active" : ""}`,
                undefined,
                { "data-shared-tab-id": sharedId }
            );
            const labelSpan = this.createElement(
                "span",
                "ha-tab-label",
                `🧩 ${spec.name} (${spec.width}×${spec.height})`
            );
            labelSpan.addEventListener("click", () => this.state.enterIsolatedTabSharedObjectEdit(sharedId));

            const closeSpan = this.createElement("span", "ha-tab-close", "×", {
                title: "Close Shared Object Tab"
            });
            closeSpan.addEventListener("click", (e) => {
                e.stopPropagation();
                this.state.closeSharedObjectTab(sharedId);
            });

            tabEl.append(labelSpan, closeSpan);
            this.tabsBarEl.appendChild(tabEl);
        }

        // Mode Banner (shown during In-Place or Isolated Tab Shared Object editing)
        this.bannerEl.innerHTML = "";
        if (this.state.editMode === "in_place" && this.state.activeSharedObjectId) {
            const spec = cState.sharedObjects[this.state.activeSharedObjectId];
            this.bannerEl.className = "ha-viewport-mode-banner active in-place";
            const msg = this.createElement(
                "span",
                "ha-banner-text",
                `🎯 In-Place Editing Shared Object: "${spec?.name}" (${spec?.category || "Uncategorized"}) — Main Canvas outside instance is darkened`
            );
            const btnGroup = this.createElement("div", "ha-banner-actions");
            const switchTabBtn = this.createElement(
                "button",
                "ha-btn ha-btn-secondary",
                "🗂️ Open in Isolated Tab",
                { id: "btn-switch-to-isolated-tab", type: "button" }
            );
            switchTabBtn.addEventListener("click", () => {
                if (this.state.activeSharedObjectId) {
                    this.state.enterIsolatedTabSharedObjectEdit(this.state.activeSharedObjectId);
                }
            });
            const exitBtn = this.createElement(
                "button",
                "ha-btn ha-btn-primary",
                "✓ Exit In-Place Edit (Esc)",
                { id: "btn-exit-shared-edit", type: "button" }
            );
            exitBtn.addEventListener("click", () => this.state.exitSharedObjectEdit());
            btnGroup.append(switchTabBtn, exitBtn);
            this.bannerEl.append(msg, btnGroup);
        } else if (this.state.editMode === "isolated_tab" && this.state.activeSharedObjectId) {
            const spec = cState.sharedObjects[this.state.activeSharedObjectId];
            this.bannerEl.className = "ha-viewport-mode-banner active isolated-tab";
            const msg = this.createElement(
                "span",
                "ha-banner-text",
                `🗂️ Isolated Tab Editing Shared Object: "${spec?.name}" (${spec?.width}×${spec?.height}px)`
            );
            const btnGroup = this.createElement("div", "ha-banner-actions");
            const switchInPlaceBtn = this.createElement(
                "button",
                "ha-btn ha-btn-secondary",
                "🎯 Edit In-Place on Main Canvas",
                { id: "btn-switch-to-inplace", type: "button" }
            );
            switchInPlaceBtn.addEventListener("click", () => {
                if (this.state.activeSharedObjectId) {
                    this.state.enterInPlaceSharedObjectEdit(this.state.activeSharedObjectId);
                }
            });
            const exitBtn = this.createElement(
                "button",
                "ha-btn ha-btn-primary",
                "← Return to Main Canvas",
                { id: "btn-exit-shared-edit", type: "button" }
            );
            exitBtn.addEventListener("click", () => this.state.exitSharedObjectEdit());
            btnGroup.append(switchInPlaceBtn, exitBtn);
            this.bannerEl.append(msg, btnGroup);
        } else {
            this.bannerEl.className = "ha-viewport-mode-banner";
        }
    }

    private drawCompositedFrame(): void {
        const cState = this.state.getCanvasState();
        // When in Isolated Tab mode, composite only the shared object sub-canvas;
        // When in Main Canvas OR In-Place mode, composite the full Main Canvas!
        const isolatedSharedId =
            this.state.editMode === "isolated_tab" ? this.state.activeSharedObjectId : undefined;

        const comp = this.state.engine.compositeCanvasFrame(cState, {
            frame: this.state.currentFrame,
            onionSkin: this.state.onionSkin,
            sharedObjectId: isolatedSharedId
        });

        this.displayCanvas.width = comp.width;
        this.displayCanvas.height = comp.height;
        this.overlayCanvas.width = comp.width;
        this.overlayCanvas.height = comp.height;

        const cssW = Math.round(comp.width * this.state.zoom);
        const cssH = Math.round(comp.height * this.state.zoom);
        this.stageWrapperEl.style.width = `${cssW}px`;
        this.stageWrapperEl.style.height = `${cssH}px`;
        const sx = this.state.viewFlipH ? -1 : 1;
        const sy = this.state.viewFlipV ? -1 : 1;
        const rot = this.state.viewRotationDeg || 0;
        this.stageWrapperEl.style.transform =
            sx !== 1 || sy !== 1 || rot !== 0 ? `scale(${sx}, ${sy}) rotate(${rot}deg)` : "";

        const ctx = this.displayCanvas.getContext("2d");
        if (!ctx) return;

        const imgData = ctx.createImageData(comp.width, comp.height);
        imgData.data.set(
            new Uint8ClampedArray(comp.pixels.buffer, comp.pixels.byteOffset, comp.pixels.byteLength)
        );
        ctx.putImageData(imgData, 0, 0);
    }

    public drawOverlay(): void {
        const ctx = this.overlayCanvas.getContext("2d");
        if (!ctx) return;
        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const cState = this.state.getCanvasState();

        // 1. If editing a Shared Object IN-PLACE on the Main Canvas, darken everything outside its bounds!
        if (this.state.editMode === "in_place" && this.state.inPlaceContext) {
            const ip = this.state.inPlaceContext;
            const instW = Math.round(ip.width * (ip.scaleX || 1));
            const instH = Math.round(ip.height * (ip.scaleY || 1));

            ctx.save();
            ctx.fillStyle = "rgba(8, 10, 18, 0.72)";
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.rect(ip.x, ip.y, instW, instH);
            ctx.fill("evenodd");

            // Highlight border around the active In-Place Shared Object
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(ip.x - 1, ip.y - 1, instW + 2, instH + 2);

            ctx.setLineDash([]);
            ctx.fillStyle = "#00e5ff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(
                `🧩 IN-PLACE: ${cState.sharedObjects[ip.sharedObjectId]?.name || ip.sharedObjectId}`,
                Math.max(4, ip.x),
                Math.max(14, ip.y - 6)
            );
            ctx.restore();
        }

        // 1b. Draw Grid if View -> Show Grid is enabled
        if (this.state.showGrid) {
            const step = Math.max(4, this.state.gridSpacing || 32);
            ctx.save();
            ctx.strokeStyle = this.state.gridColor || "rgba(0, 212, 255, 0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let gx = step; gx < w; gx += step) {
                ctx.moveTo(gx + 0.5, 0);
                ctx.lineTo(gx + 0.5, h);
            }
            for (let gy = step; gy < h; gy += step) {
                ctx.moveTo(0, gy + 0.5);
                ctx.lineTo(w, gy + 0.5);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 1c. Draw Guides if View -> Show Guides is enabled
        if (this.state.showGuides && this.state.guides.length > 0) {
            ctx.save();
            ctx.strokeStyle = "rgba(0, 229, 255, 0.85)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            for (const g of this.state.guides) {
                ctx.beginPath();
                if (g.orientation === "horizontal") {
                    ctx.moveTo(0, g.position + 0.5);
                    ctx.lineTo(w, g.position + 0.5);
                } else {
                    ctx.moveTo(g.position + 0.5, 0);
                    ctx.lineTo(g.position + 0.5, h);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        // 1d. Draw Layer Boundary if View -> Show Layer Boundary is enabled
        if (this.state.showLayerBoundary) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 204, 0, 0.7)";
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
            ctx.restore();
        }

        // 2. Draw active raster selection marching ants
        if (cState.selection && this.state.showSelection) {
            const sel = cState.selection;
            ctx.save();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            if (sel.mode === "ellipse") {
                ctx.beginPath();
                ctx.ellipse(
                    sel.x + sel.width / 2,
                    sel.y + sel.height / 2,
                    Math.max(1, sel.width / 2),
                    Math.max(1, sel.height / 2),
                    0,
                    0,
                    Math.PI * 2
                );
                ctx.stroke();
            } else {
                ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);
            }
            ctx.restore();
        }

        // 3. Draw bounding boxes & handles for selected vector objects
        if (this.state.selectedObjectIds.length > 0) {
            const layers = this.state.getActiveContainerLayers();
            const offsetX =
                this.state.editMode === "in_place" && this.state.inPlaceContext
                    ? this.state.inPlaceContext.x
                    : 0;
            const offsetY =
                this.state.editMode === "in_place" && this.state.inPlaceContext
                    ? this.state.inPlaceContext.y
                    : 0;

            for (const layer of layers) {
                if (layer.type !== "vector") continue;
                for (const obj of layer.objects) {
                    if (!this.state.selectedObjectIds.includes(obj.id)) continue;
                    const bbox = this.state.engine.computeObjectBoundingBox(obj, cState);
                    const bx = bbox.x + offsetX;
                    const by = bbox.y + offsetY;

                    ctx.save();
                    ctx.strokeStyle = obj.kind === "ref" ? "#ffab00" : "#00d4ff";
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 2]);
                    ctx.strokeRect(bx - 2, by - 2, bbox.width + 4, bbox.height + 4);
                    ctx.setLineDash([]);

                    // Draw 4 corner handles
                    const corners = [
                        [bx - 4, by - 4],
                        [bx + bbox.width - 2, by - 4],
                        [bx - 4, by + bbox.height - 2],
                        [bx + bbox.width - 2, by + bbox.height - 2]
                    ];
                    ctx.fillStyle = "#141622";
                    for (const [cx, cy] of corners) {
                        ctx.fillRect(cx, cy, 6, 6);
                        ctx.strokeRect(cx, cy, 6, 6);
                    }
                    ctx.restore();
                }
            }
        }

        // 4. Active tool live preview overlay
        const activeTool = EditorToolRegistry.getTool(this.state.activeToolId);
        activeTool.renderOverlay(this.state, ctx);
    }

    private buildCanvasContextMenu(canvasPt: Point2D): ContextMenuItem[] {
        const cState = this.state.getCanvasState();
        const localPt = this.state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const layers = this.state.getActiveContainerLayers();

        // Check if cursor is over a vector object or <ObjectRef>
        let hitObj: any = null;
        for (let l = layers.length - 1; l >= 0; l--) {
            const layer = layers[l];
            if (!layer.visible || layer.type !== "vector") continue;
            for (let o = layer.objects.length - 1; o >= 0; o--) {
                const candidate = layer.objects[o];
                const bbox = this.state.engine.computeObjectBoundingBox(candidate, cState);
                if (
                    localPt.x >= bbox.x &&
                    localPt.x <= bbox.x + bbox.width &&
                    localPt.y >= bbox.y &&
                    localPt.y <= bbox.y + bbox.height
                ) {
                    hitObj = candidate;
                    break;
                }
            }
            if (hitObj) break;
        }

        const menu: ContextMenuItem[] = [];

        if (this.state.editMode !== "none") {
            menu.push({
                label: "Exit Shared Object Editing (Return to Main Canvas)",
                icon: "🔙",
                shortcut: "Esc",
                action: () => this.state.exitSharedObjectEdit()
            });
            menu.push({ divider: true });
        }

        if (hitObj && hitObj.kind === "ref" && hitObj.refId) {
            const sharedSpec = cState.sharedObjects[hitObj.refId];
            menu.push(
                {
                    label: `Edit "${sharedSpec?.name || hitObj.refId}" In-Place (Darken Outside)`,
                    icon: "🎯",
                    action: () => this.state.enterInPlaceSharedObjectEdit(hitObj.refId, hitObj.id)
                },
                {
                    label: `Edit "${sharedSpec?.name || hitObj.refId}" in Isolated Tab`,
                    icon: "🗂️",
                    action: () => this.state.enterIsolatedTabSharedObjectEdit(hitObj.refId)
                },
                {
                    label: `Save "${sharedSpec?.name || hitObj.refId}" to Reusable Library`,
                    icon: "📚",
                    action: () => {
                        const entry = this.state.library.saveSharedObjectToLibrary(
                            this.state.engine,
                            this.state.canvasId,
                            hitObj.refId
                        );
                        this.state.setStatus(`Saved "${entry.name}" to OS Library.`);
                    }
                },
                {
                    label: "Delete <ObjectRef> Instance",
                    icon: "🗑️",
                    danger: true,
                    action: () => {
                        this.state.engine.deleteObject(this.state.canvasId, hitObj.id);
                        this.state.selectedObjectIds = [];
                        this.state.setStatus(`Deleted instance "${hitObj.id}".`);
                    }
                },
                { divider: true }
            );
        } else if (hitObj) {
            this.state.selectedObjectIds = [hitObj.id];
            if (hitObj.kind === "text") {
                menu.push({
                    label: `Edit Text "${(hitObj.text || "").slice(0, 20)}" In-Place`,
                    icon: "🔤",
                    action: () => this.openInPlaceTextEditor(hitObj.id)
                });
            }
            menu.push(
                {
                    label: "Deform / Bend Vector Curve (K)",
                    icon: "〰️",
                    shortcut: "K",
                    action: () => {
                        this.state.activeToolId = "vector_deform";
                        this.state.setStatus(`Switched to Vector Deform Tool for "${hitObj.id}".`);
                        this.state.notify();
                    }
                },
                {
                    label: "Skew Vector Object (skewX / skewY)...",
                    icon: "▱",
                    action: () => {
                        this.modal.openFormDialog({
                            title: `Skew Vector Object "${hitObj.id}"`,
                            fields: [
                                {
                                    key: "skewX",
                                    label: "Horizontal Skew X (deg)",
                                    type: "number",
                                    defaultValue: String(hitObj.skewX || 0)
                                },
                                {
                                    key: "skewY",
                                    label: "Vertical Skew Y (deg)",
                                    type: "number",
                                    defaultValue: String(hitObj.skewY || 0)
                                }
                            ],
                            submitLabel: "Apply Skew",
                            onSubmit: (vals) => {
                                const sx = Number(vals.skewX) || 0;
                                const sy = Number(vals.skewY) || 0;
                                this.state.engine.modifyObject(
                                    this.state.canvasId,
                                    hitObj.id,
                                    { skewX: sx, skewY: sy }
                                );
                                this.state.setStatus(`Skewed "${hitObj.id}" to (${sx}°, ${sy}°).`);
                                this.state.notify();
                            }
                        });
                    }
                },
                {
                    label: `Convert "${hitObj.id}" into New Shared Object...`,
                    icon: "🧩",
                    action: () => this.convertVectorObjectToSharedObject(hitObj)
                },
                {
                    label: "Path Offset (+4px Outset)",
                    icon: "📐",
                    action: () => {
                        this.state.engine.pathOperation(this.state.canvasId, "offset", {
                            targetIds: [hitObj.id],
                            offsetDistance: 4
                        });
                        this.state.setStatus(`Applied +4px path offset on "${hitObj.id}".`);
                    }
                },
                {
                    label: "Simplify Path Nodes",
                    icon: "〰️",
                    action: () => {
                        this.state.engine.pathOperation(this.state.canvasId, "simplify", {
                            targetIds: [hitObj.id],
                            simplifyTolerance: 2.0
                        });
                        this.state.setStatus(`Simplified path "${hitObj.id}".`);
                    }
                },
                {
                    label: `Delete Vector Object "${hitObj.id}"`,
                    icon: "🗑️",
                    danger: true,
                    action: () => {
                        this.state.engine.deleteObject(this.state.canvasId, hitObj.id);
                        this.state.selectedObjectIds = [];
                        this.state.setStatus(`Deleted object "${hitObj.id}".`);
                    }
                },
                { divider: true }
            );
        }

        if (this.state.selectedObjectIds.length >= 2) {
            const pair = this.state.selectedObjectIds.slice(0, 2);
            menu.push({
                label: "Boolean Path Operations",
                icon: "🔗",
                children: (["union", "difference", "intersection", "exclusion"] as const).map(op => ({
                    label: `Boolean ${op.toUpperCase()}`,
                    icon: "⚡",
                    action: () => {
                        const res = this.state.engine.pathOperation(this.state.canvasId, op, {
                            targetIds: pair
                        });
                        this.state.selectedObjectIds = [res.id];
                        this.state.setStatus(`Executed Boolean ${op} -> "${res.id}".`);
                    }
                }))
            });
        }

        // Insert Shared Object submenu
        const sharedList = Object.values(cState.sharedObjects);
        menu.push({
            label: "Insert Shared Object Instance",
            icon: "🧩",
            disabled: sharedList.length === 0,
            children: sharedList.map(so => ({
                label: `${so.name} (${so.width}×${so.height})`,
                icon: "➕",
                action: () => {
                    const vecLayer = this.state.resolveActiveLayer("vector");
                    const ref = this.state.engine.instantiateObjectRef(this.state.canvasId, so.id, {
                        targetSharedObjectId: this.state.activeSharedObjectId,
                        layerId: vecLayer?.id,
                        x: localPt.x,
                        y: localPt.y
                    });
                    this.state.selectedObjectIds = [ref.id];
                    this.state.setStatus(`Placed instance of "${so.name}" at (${localPt.x}, ${localPt.y}).`);
                }
            }))
        });

        // Apply GIMP Pixel Filter submenu
        menu.push({
            label: "GIMP Pixel Filters",
            icon: "✨",
            children: RasterFilterRegistry.getAllFilters().map(f => ({
                label: f.displayName,
                icon: "⚡",
                action: () => {
                    const rasLayer = this.state.resolveActiveLayer("raster");
                    this.state.engine.rasterFilter(
                        this.state.canvasId,
                        rasLayer?.id,
                        { filterType: f.filterType, radius: 3, amount: 1.2, threshold: 128, brightness: 15, contrast: 20 },
                        this.state.currentFrame > 0 ? this.state.currentFrame : undefined,
                        this.state.activeSharedObjectId
                    );
                    this.state.setStatus(`Applied GIMP filter "${f.displayName}".`);
                }
            }))
        });

        // Clear selection option if selection is active
        if (cState.selection) {
            menu.push({
                label: "Clear Selection Mask",
                icon: "⬚",
                action: () => {
                    this.state.engine.rasterSelection(this.state.canvasId, "clear");
                    this.state.setStatus("Cleared raster selection mask.");
                }
            });
        }

        menu.push(
            { divider: true },
            {
                label: "AI Studio Assistant (LM Studio)",
                icon: "🤖",
                children: [
                    {
                        label: `Ask AI to Draw Shape at (${localPt.x}, ${localPt.y})...`,
                        icon: "📐",
                        action: () =>
                            this.state.askAi(
                                `Draw a vector shape at (${localPt.x}, ${localPt.y}) on the active vector layer.`
                            )
                    },
                    {
                        label: `Ask AI to Sample & Inspect Pixels at (${localPt.x}, ${localPt.y})`,
                        icon: "💧",
                        action: () =>
                            this.state.askAi(
                                `Use inspect_pixels at (${localPt.x}, ${localPt.y}) with a 16x16 region and describe the colors.`
                            )
                    },
                    {
                        label: "Ask AI to Inspect Entire Scene Graph",
                        icon: "🔍",
                        action: () =>
                            this.state.askAi(
                                "Inspect the full scene graph and summarize all layers, vector objects, and shared objects."
                            )
                    }
                ]
            }
        );

        return menu;
    }

    private convertVectorObjectToSharedObject(obj: any): void {
        this.modal.openFormDialog({
            title: "Convert Vector Object to Shared Object",
            fields: [
                {
                    key: "name",
                    label: "Shared Object Name (with Category Path)",
                    defaultValue: `UI/Components/${obj.kind}_${obj.id}`
                },
                {
                    key: "category",
                    label: "Category",
                    defaultValue: "UI/Components"
                }
            ],
            submitLabel: "Create & Replace with <ObjectRef>",
            onSubmit: (vals) => {
                const cState = this.state.getCanvasState();
                const bbox = this.state.engine.computeObjectBoundingBox(obj, cState);
                const w = Math.max(24, Math.ceil(bbox.width + 12));
                const h = Math.max(24, Math.ceil(bbox.height + 12));
                const shared = this.state.engine.createSharedObject(this.state.canvasId, {
                    name: vals.name || `UI/Components/${obj.id}`,
                    category: vals.category || "UI/Components",
                    width: w,
                    height: h
                });
                const cloned = JSON.parse(JSON.stringify(obj));
                cloned.x = Math.round((w - bbox.width) / 2);
                cloned.y = Math.round((h - bbox.height) / 2);
                shared.layers[0].objects.push(cloned);

                this.state.engine.deleteObject(this.state.canvasId, obj.id);
                const ref = this.state.engine.instantiateObjectRef(this.state.canvasId, shared.id, {
                    x: Math.round(bbox.x),
                    y: Math.round(bbox.y)
                });
                this.state.selectedObjectIds = [ref.id];
                this.state.setStatus(`Converted "${obj.id}" into Shared Object "${shared.name}".`);
            }
        });
    }

    /**
     * Opens an interactive floating in-place text editor (`#ha-inplace-text-editor`)
     * directly over a `"text"` vector object on the canvas, preserving its font family,
     * font size, weight, style, color, and position.
     */
    public openInPlaceTextEditor(objectId: string): void {
        if (!this.stageWrapperEl) return;
        const existing = this.stageWrapperEl.querySelector("#ha-inplace-text-editor");
        if (existing) {
            existing.remove();
        }

        const cState = this.state.getCanvasState();
        const layers = this.state.getActiveContainerLayers();
        let targetObj: any = null;
        for (const layer of layers) {
            if (layer.type !== "vector") continue;
            const found = layer.objects.find((o: any) => o.id === objectId && o.kind === "text");
            if (found) {
                targetObj = found;
                break;
            }
        }
        if (!targetObj) return;

        const bbox = this.state.engine.computeObjectBoundingBox(targetObj, cState);
        const offsetX =
            this.state.editMode === "in_place" && this.state.inPlaceContext
                ? this.state.inPlaceContext.x
                : 0;
        const offsetY =
            this.state.editMode === "in_place" && this.state.inPlaceContext
                ? this.state.inPlaceContext.y
                : 0;

        const zoom = this.state.zoom || 1;
        const leftPx = Math.max(0, Math.round((bbox.x + offsetX) * zoom));
        const topPx = Math.max(0, Math.round((bbox.y + offsetY) * zoom));
        const widthPx = Math.max(120, Math.round((bbox.width + 40) * zoom));
        const heightPx = Math.max(32, Math.round((bbox.height + 16) * zoom));
        const fontSizePx = Math.max(10, Math.round((targetObj.fontSize || 24) * zoom));

        const textarea = this.createElement("textarea", "ha-inplace-text-editor", undefined, {
            id: "ha-inplace-text-editor",
            "data-object-id": targetObj.id
        }) as HTMLTextAreaElement;

        textarea.value = targetObj.text || "";
        textarea.style.position = "absolute";
        textarea.style.left = `${leftPx}px`;
        textarea.style.top = `${topPx}px`;
        textarea.style.width = `${widthPx}px`;
        textarea.style.minHeight = `${heightPx}px`;
        textarea.style.fontFamily = targetObj.fontFamily || "sans-serif";
        textarea.style.fontSize = `${fontSizePx}px`;
        textarea.style.fontWeight = targetObj.fontWeight || "normal";
        textarea.style.fontStyle = targetObj.fontStyle || "normal";
        textarea.style.color =
            targetObj.fill && targetObj.fill !== "none" ? targetObj.fill : "#ffffff";
        if (targetObj.letterSpacing) {
            textarea.style.letterSpacing = `${targetObj.letterSpacing * zoom}px`;
        }
        textarea.style.zIndex = "50";

        this.state.setEditingObject(targetObj.id, true);
        this.drawCompositedFrame();

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            this.state.setEditingObject(undefined, false);
            const nextText = textarea.value;
            textarea.remove();
            if (nextText !== targetObj.text) {
                this.state.engine.modifyObject(
                    this.state.canvasId,
                    targetObj.id,
                    { text: nextText }
                );
                this.state.setStatus(`Updated text object "${targetObj.id}" in-place.`);
            }
            this.state.notify();
        };

        textarea.addEventListener("keydown", (ev: KeyboardEvent) => {
            ev.stopPropagation();
            if (ev.key === "Escape") {
                committed = true;
                this.state.setEditingObject(undefined, false);
                textarea.remove();
                this.state.setStatus("Cancelled in-place text edit.");
                this.state.notify();
            } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey || !ev.shiftKey)) {
                ev.preventDefault();
                commit();
            }
        });

        textarea.addEventListener("blur", () => {
            commit();
        });

        this.stageWrapperEl.appendChild(textarea);
        textarea.focus();
        textarea.select();
    }
}
