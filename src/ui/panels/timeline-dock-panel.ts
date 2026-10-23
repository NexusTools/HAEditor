import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuManager } from "../context-menu.js";
import type { ModalDialogManager } from "../modal-dialog.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import {
    BUILT_IN_CURVE_PRESETS,
    BUILT_IN_RASTER_BLEND_PRESETS,
    RASTER_TRANSITION_CATEGORIES,
    evaluateCubicBezierEasing,
    type AnimationCurvePreset,
    type EasingMode,
    type RasterBlendPreset
} from "@nexustools/hacanvas";
import { JsCodeIdeEditor } from "../js-code-ide-editor.js";

/**
 * Top-Docked, Auto-Collapsing Animation Timeline, Multi-Track Keyframe Editor,
 * Scoped Shared Object Timeline, & Interactive Cubic-Bezier Visual Curve Editor
 * inheriting from `AbstractDockPanel`.
 */
export class TimelineDockPanel extends AbstractDockPanel {
    public readonly panelId = "ha-timeline-panel";
    public readonly panelTitle = "Animation Timeline";
    public readonly panelIcon = "🎬";
    private readonly modal?: ModalDialogManager;
    private playTimer: ReturnType<typeof setInterval> | null = null;
    private expandedLayerIds = new Set<string>();
    private activeCurvePresetId = "linear";
    private activeBezier: [number, number, number, number] = [0.25, 0.25, 0.75, 0.75];
    public lastBlendIdeEditor: JsCodeIdeEditor | null = null;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal?: ModalDialogManager
    ) {
        super(containerEl, state, contextMenu);
        this.modal = modal;
        this.isCollapsed = this.state.timelineCollapsed;
    }

    public override render(): void {
        this.isCollapsed = this.state.timelineCollapsed;
        super.render();

        const titleEl = this.containerEl.querySelector(".ha-dock-title");
        if (titleEl) {
            const clone = titleEl.cloneNode(true) as HTMLElement;
            titleEl.replaceWith(clone);
            clone.addEventListener("click", () => {
                this.state.timelineCollapsed = !this.state.timelineCollapsed;
                this.isCollapsed = this.state.timelineCollapsed;
                this.render();
            });
        }
    }

    protected override getDynamicTitle(): string {
        if (!this.state.hasOpenCanvas) {
            return "Animation Timeline";
        }
        const cState = this.state.getCanvasState();
        const sharedId = this.state.activeSharedObjectId;
        const scopeLabel = sharedId
            ? `Shared Object: ${cState.sharedObjects[sharedId]?.name || sharedId}`
            : "Main Canvas";
        const anim = this.state.getActiveAnimationTimeline();
        const loopBadge = anim.loop ? " • 🔁 Loop" : "";
        return `Animation Timeline (${scopeLabel} • ${anim.durationFrames}f @ ${anim.fps}fps${loopBadge})`;
    }

    protected override getHeaderActions(): DockActionButton[] {
        const anim = this.state.hasOpenCanvas
            ? this.state.getActiveAnimationTimeline()
            : { fps: 24, durationFrames: 1, loop: true };
        return [
            {
                id: "btn-timeline-collapse-toggle",
                label: this.state.timelineCollapsed ? "Expand" : "Collapse",
                icon: this.state.timelineCollapsed ? "▾" : "▴",
                title: "Toggle Top Animation Timeline Panel",
                onClick: () => {
                    this.state.timelineCollapsed = !this.state.timelineCollapsed;
                    this.isCollapsed = this.state.timelineCollapsed;
                    this.render();
                }
            },
            {
                id: "btn-timeline-play",
                label: this.state.isPlayingAnimation ? "Pause" : "Play",
                icon: this.state.isPlayingAnimation ? "⏸️" : "▶️",
                title: "Play / Pause Animation Timeline",
                onClick: () => this.togglePlay()
            },
            {
                id: "btn-timeline-loop-toggle",
                label: anim.loop ? "Loop: ON" : "Loop: OFF",
                icon: "🔁",
                title: "Toggle Infinite Loop back to Frame 0 at End of Timeline",
                onClick: () => {
                    if (!this.state.hasOpenCanvas) return;
                    const cur = this.state.getActiveAnimationTimeline();
                    this.state.engine.configureTimeline(this.state.canvasId, {
                        loop: !cur.loop,
                        loopBackToFrame: 0,
                        sharedObjectId: this.state.activeSharedObjectId
                    });
                    this.state.notify();
                }
            },
            {
                id: "btn-timeline-onion",
                label: this.state.onionSkin ? "Onion: ON" : "Onion: OFF",
                icon: "🧅",
                title: "Toggle Onion-Skin Previous Frame Overlay",
                onClick: () => {
                    this.state.onionSkin = !this.state.onionSkin;
                    this.state.notify();
                }
            },
            {
                id: "btn-timeline-add-frame",
                label: "+Frame",
                icon: "➕",
                title: "Add Frame to Active Timeline",
                onClick: () => {
                    if (!this.state.hasOpenCanvas) return;
                    const cur = this.state.getActiveAnimationTimeline();
                    this.state.engine.configureTimeline(this.state.canvasId, {
                        totalFrames: Math.max(1, cur.durationFrames) + 1,
                        sharedObjectId: this.state.activeSharedObjectId
                    });
                    this.state.timelineCollapsed = false;
                    this.state.notify();
                }
            },
            {
                id: "btn-timeline-curve-editor",
                label: "Curves",
                icon: "📈",
                title: "Open Visual Movement & Keyframe Curve Editor (Save Custom Presets)",
                onClick: () => {
                    const targetId =
                        this.state.selectedObjectIds[0] || this.state.activeLayerId || undefined;
                    this.openCurveEditorDialog(targetId, this.state.currentFrame);
                }
            },
            {
                id: "btn-timeline-raster-blend-editor",
                label: "Raster Blend",
                icon: "🧪",
                title: "Open Raster Layer Keyframe Blending & Custom JS Preset Editor",
                onClick: () => {
                    this.openRasterBlendDialog(this.state.activeLayerId, this.state.currentFrame);
                }
            }
        ];
    }

    private togglePlay(): void {
        this.state.isPlayingAnimation = !this.state.isPlayingAnimation;
        if (this.state.isPlayingAnimation) {
            const anim = this.state.getActiveAnimationTimeline();
            const intervalMs = Math.max(20, Math.round(1000 / Math.max(1, anim.fps || 12)));
            this.playTimer = setInterval(() => {
                const curAnim = this.state.getActiveAnimationTimeline();
                const total = Math.max(1, curAnim.durationFrames);
                const next = this.state.currentFrame + 1;
                if (next >= total) {
                    if (curAnim.loop !== false) {
                        this.state.currentFrame = curAnim.loopBackToFrame ?? 0;
                    } else {
                        this.state.currentFrame = total - 1;
                        this.state.isPlayingAnimation = false;
                        if (this.playTimer) {
                            clearInterval(this.playTimer);
                            this.playTimer = null;
                        }
                    }
                } else {
                    this.state.currentFrame = next;
                }
                this.state.notify();
            }, intervalMs);
        } else if (this.playTimer) {
            clearInterval(this.playTimer);
            this.playTimer = null;
        }
        this.state.notify();
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        if (!this.state.hasOpenCanvas) {
            bodyEl.appendChild(
                this.createElement(
                    "div",
                    "ha-dock-empty",
                    "Open or create a canvas to edit layer & object animation timelines."
                )
            );
            return;
        }

        const cState = this.state.getCanvasState();
        const anim = this.state.getActiveAnimationTimeline();
        const totalFrames = Math.max(1, anim.durationFrames);
        const layers = this.state.getActiveContainerLayers();

        // 1. Top Controls Bar (Scope, FPS, Duration, Current Frame, Target Start/End Frame, +Keyframe)
        const controlsBar = this.createElement("div", "ha-timeline-controls-bar");

        // Scope Selector (Main Canvas vs Shared Objects)
        const scopeGroup = this.createElement("div", "ha-timeline-control-group");
        scopeGroup.appendChild(this.createElement("label", "ha-timeline-ctrl-label", "Scope:"));
        const scopeSelect = this.createElement("select", "ha-select ha-timeline-scope-select", undefined, {
            id: "ha-timeline-scope-select",
            title: "Select Main Canvas Timeline or a Shared Object's Internal Timeline"
        }) as HTMLSelectElement;
        const mainOpt = this.createElement("option", undefined, "🎨 Main Canvas", { value: "" });
        if (!this.state.activeSharedObjectId) mainOpt.selected = true;
        scopeSelect.appendChild(mainOpt);
        for (const so of Object.values(cState.sharedObjects)) {
            const opt = this.createElement("option", undefined, `🧩 ${so.name}`, { value: so.id });
            if (this.state.activeSharedObjectId === so.id) opt.selected = true;
            scopeSelect.appendChild(opt);
        }
        scopeSelect.addEventListener("change", () => {
            const val = scopeSelect.value;
            if (!val) {
                this.state.exitSharedObjectEdit();
            } else {
                this.state.enterIsolatedTabSharedObjectEdit(val);
            }
        });
        scopeGroup.appendChild(scopeSelect);

        // FPS input
        const fpsGroup = this.createElement("div", "ha-timeline-control-group");
        fpsGroup.appendChild(this.createElement("label", "ha-timeline-ctrl-label", "FPS:"));
        const fpsInput = this.createElement("input", "ha-input ha-timeline-num-input", undefined, {
            id: "ha-timeline-fps-input",
            type: "number",
            min: "1",
            max: "240",
            value: String(anim.fps || 24)
        }) as HTMLInputElement;
        fpsInput.addEventListener("change", () => {
            const fps = Math.max(1, Math.min(240, Number(fpsInput.value) || 24));
            this.state.engine.configureTimeline(this.state.canvasId, {
                fps,
                sharedObjectId: this.state.activeSharedObjectId
            });
            this.state.notify();
        });
        fpsGroup.appendChild(fpsInput);

        // Total Frames (Duration) input
        const durGroup = this.createElement("div", "ha-timeline-control-group");
        durGroup.appendChild(this.createElement("label", "ha-timeline-ctrl-label", "Frames:"));
        const durInput = this.createElement("input", "ha-input ha-timeline-num-input", undefined, {
            id: "ha-timeline-duration-input",
            type: "number",
            min: "1",
            max: "9999",
            value: String(totalFrames)
        }) as HTMLInputElement;
        durInput.addEventListener("change", () => {
            const total = Math.max(1, Number(durInput.value) || 1);
            this.state.engine.configureTimeline(this.state.canvasId, {
                totalFrames: total,
                sharedObjectId: this.state.activeSharedObjectId
            });
            this.state.notify();
        });
        durGroup.appendChild(durInput);

        // Current Frame input
        const curFrameGroup = this.createElement("div", "ha-timeline-control-group");
        curFrameGroup.appendChild(this.createElement("label", "ha-timeline-ctrl-label", "Frame:"));
        const curFrameInput = this.createElement("input", "ha-input ha-timeline-num-input", undefined, {
            id: "ha-timeline-current-frame-input",
            type: "number",
            min: "0",
            max: String(Math.max(0, totalFrames - 1)),
            value: String(this.state.currentFrame)
        }) as HTMLInputElement;
        curFrameInput.addEventListener("change", () => {
            this.state.currentFrame = Math.max(0, Math.min(totalFrames - 1, Number(curFrameInput.value) || 0));
            this.state.notify();
        });
        curFrameGroup.appendChild(curFrameInput);

        // Selected Object / Layer StartFrame & EndFrame Controls
        const selectedTarget = this.resolveSelectedTimelineTarget();
        const spanGroup = this.createElement("div", "ha-timeline-control-group");
        spanGroup.appendChild(
            this.createElement(
                "label",
                "ha-timeline-ctrl-label",
                selectedTarget ? `${selectedTarget.label} Span:` : "Span:"
            )
        );
        const startFrameInput = this.createElement("input", "ha-input ha-timeline-num-input", undefined, {
            id: "ha-timeline-start-frame",
            type: "number",
            min: "0",
            placeholder: "Start",
            title: "Start Frame for selected Object or Layer",
            value: selectedTarget?.startFrame !== undefined ? String(selectedTarget.startFrame) : "0"
        }) as HTMLInputElement;
        const endFrameInput = this.createElement("input", "ha-input ha-timeline-num-input", undefined, {
            id: "ha-timeline-end-frame",
            type: "number",
            min: "0",
            placeholder: "End",
            title: "End Frame for selected Object or Layer (blank = entire timeline)",
            value: selectedTarget?.endFrame !== undefined ? String(selectedTarget.endFrame) : ""
        }) as HTMLInputElement;

        const updateTargetSpan = () => {
            if (!selectedTarget) return;
            const sf = startFrameInput.value.trim() !== "" ? Math.max(0, Number(startFrameInput.value) || 0) : 0;
            const ef =
                endFrameInput.value.trim() !== ""
                    ? Math.max(sf, Number(endFrameInput.value) || sf)
                    : null;
            this.state.engine.setTargetFrameRange(
                this.state.canvasId,
                selectedTarget.id,
                sf,
                ef,
                this.state.activeSharedObjectId
            );
            this.state.setStatus(
                `Set frame span for "${selectedTarget.id}" to [${sf} .. ${ef !== null ? ef : "∞"}].`
            );
            this.state.notify();
        };
        startFrameInput.addEventListener("change", updateTargetSpan);
        endFrameInput.addEventListener("change", updateTargetSpan);
        spanGroup.append(startFrameInput, this.createElement("span", "ha-timeline-dash", "→"), endFrameInput);

        // Default Curve Preset Quick Selector
        const curveQuickGroup = this.createElement("div", "ha-timeline-control-group");
        curveQuickGroup.appendChild(this.createElement("label", "ha-timeline-ctrl-label", "Curve:"));
        const curveQuickSelect = this.createElement("select", "ha-select ha-timeline-curve-select", undefined, {
            id: "ha-timeline-default-curve-select",
            title: "Default Movement / Interpolation Curve Preset for Keyframes"
        }) as HTMLSelectElement;
        for (const preset of this.getAllCurvePresets()) {
            const opt = this.createElement("option", undefined, preset.name, { value: preset.id });
            if (preset.id === this.activeCurvePresetId) opt.selected = true;
            curveQuickSelect.appendChild(opt);
        }
        curveQuickSelect.addEventListener("change", () => {
            this.activeCurvePresetId = curveQuickSelect.value;
            const found = this.getAllCurvePresets().find(p => p.id === this.activeCurvePresetId);
            if (found) {
                this.activeBezier = [
                    found.controlPoints[0],
                    found.controlPoints[1],
                    found.controlPoints[2],
                    found.controlPoints[3]
                ];
            }
        });
        curveQuickGroup.appendChild(curveQuickSelect);

        // Keyframe Selected Object / Layer @ Frame button
        const keyframeBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "🔑 Keyframe @ Frame",
            {
                id: "btn-add-keyframe",
                type: "button",
                title: "Record Keyframe at Current Frame for Selected Vector Object or Active Layer"
            }
        );
        keyframeBtn.addEventListener("click", () => {
            this.recordKeyframeForSelectedOrActive();
        });

        controlsBar.append(
            scopeGroup,
            fpsGroup,
            durGroup,
            curFrameGroup,
            spanGroup,
            curveQuickGroup,
            keyframeBtn
        );

        // 2. Main Timeline Strip (Frame Ruler + End-of-Timeline Loop Node)
        const strip = this.createElement("div", "ha-timeline-strip");
        for (let f = 0; f < totalFrames; f++) {
            const hasKeyframe = anim.tracks.some(t => t.keyframes.some(kf => kf.frame === f));
            const cell = this.createElement(
                "button",
                `ha-timeline-frame-cell ${this.state.currentFrame === f ? "active" : ""} ${hasKeyframe ? "has-keyframe" : ""}`,
                `${f}`,
                {
                    "data-frame-index": String(f),
                    title: `Frame ${f}${hasKeyframe ? " (Has Keyframe)" : ""}`,
                    type: "button"
                }
            );
            cell.addEventListener("click", () => {
                this.state.currentFrame = f;
                this.state.notify();
            });
            strip.appendChild(cell);
        }

        // End-of-Timeline Infinite Loop Node (`#ha-timeline-loop-node`)
        const loopNode = this.createElement(
            "button",
            `ha-timeline-loop-node ${anim.loop ? "active" : ""}`,
            anim.loop ? `🔁 Loop → F${anim.loopBackToFrame ?? 0}` : "➡️ Play Once",
            {
                id: "ha-timeline-loop-node",
                type: "button",
                title: "End-of-Timeline Loop Node: Click to toggle infinite loop back to Frame 0"
            }
        );
        loopNode.addEventListener("click", () => {
            this.state.engine.configureTimeline(this.state.canvasId, {
                loop: !anim.loop,
                loopBackToFrame: 0,
                sharedObjectId: this.state.activeSharedObjectId
            });
            this.state.setStatus(
                !anim.loop
                    ? "Enabled Infinite Loop node at end of timeline (loops back to Frame 0)."
                    : "Disabled timeline loop."
            );
            this.state.notify();
        });
        strip.appendChild(loopNode);

        // 3. Per-Layer & Expandable Per-Object Tracks Grid
        const tracksContainer = this.createElement("div", "ha-timeline-tracks-container", undefined, {
            id: "ha-timeline-tracks-container"
        });

        for (const layer of layers) {
            const hasObjects = layer.type === "vector" && layer.objects.length > 0;
            // Expand vector layers by default so objects inside the scene are immediately accessible
            if (hasObjects && !this.expandedLayerIds.has(layer.id)) {
                this.expandedLayerIds.add(layer.id);
            }
            const isExpanded = this.expandedLayerIds.has(layer.id);

            const layerRow = this.createElement(
                "div",
                `ha-timeline-track-row ha-timeline-layer-track ${this.state.activeLayerId === layer.id ? "active" : ""}`,
                undefined,
                { "data-track-layer-id": layer.id }
            );

            const labelCol = this.createElement("div", "ha-timeline-track-label-col");
            if (hasObjects) {
                const expBtn = this.createElement(
                    "button",
                    "ha-timeline-track-expand-btn",
                    isExpanded ? "▾" : "▸",
                    { type: "button", title: "Expand / Collapse Object Tracks on this Layer" }
                );
                expBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (this.expandedLayerIds.has(layer.id)) {
                        this.expandedLayerIds.delete(layer.id);
                    } else {
                        this.expandedLayerIds.add(layer.id);
                    }
                    this.render();
                });
                labelCol.appendChild(expBtn);
            } else {
                labelCol.appendChild(this.createElement("span", "ha-timeline-track-indent", "•"));
            }

            const layerTitle = this.createElement(
                "span",
                "ha-timeline-track-title",
                `${layer.type === "vector" ? "✒️" : "🖌️"} ${layer.name}`
            );
            layerTitle.addEventListener("click", () => {
                this.state.activeLayerId = layer.id;
                this.state.notify();
            });

            const addLayerKfBtn = this.createElement("button", "ha-dock-btn ha-track-kf-btn", "+KF", {
                "data-track-add-kf": `layer:${layer.id}`,
                title: `Record Layer Keyframe for "${layer.name}" at Frame ${this.state.currentFrame}`,
                type: "button"
            });
            addLayerKfBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.recordLayerKeyframe(layer.id, this.state.currentFrame);
            });

            labelCol.append(layerTitle, addLayerKfBtn);

            if (layer.type === "raster") {
                const blendBtn = this.createElement("button", "ha-dock-btn ha-track-kf-btn", "🧪", {
                    "data-track-raster-blend": layer.id,
                    title: `Configure Raster Keyframe Blending & JS Script for "${layer.name}"`,
                    type: "button"
                });
                blendBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.state.activeLayerId = layer.id;
                    this.openRasterBlendDialog(layer.id, this.state.currentFrame);
                });
                labelCol.appendChild(blendBtn);
            }

            const cellsCol = this.createElement("div", "ha-timeline-track-cells-col");
            const layerTracks = anim.tracks.filter(t => t.targetId === layer.id);
            const celFrames = layer.celFrames || [];

            for (let f = 0; f < totalFrames; f++) {
                const hasKf = layerTracks.some(t => t.keyframes.some(k => k.frame === f));
                const hasCel = celFrames.includes(f);
                const inRange =
                    (layer.startFrame === undefined || f >= layer.startFrame) &&
                    (layer.endFrame === undefined || f <= layer.endFrame);
                const cell = this.createElement(
                    "button",
                    `ha-timeline-track-cell ${this.state.currentFrame === f ? "current-frame" : ""} ${hasKf ? "has-kf" : ""} ${hasCel ? "has-cel" : ""} ${!inRange ? "out-of-range" : ""}`,
                    hasKf ? "◆" : hasCel ? "●" : "",
                    {
                        "data-layer-track-cell": `${layer.id}:${f}`,
                        title: `Layer "${layer.name}" @ Frame ${f}${hasKf || hasCel ? " (Keyframe - Click to edit Curve / Blend)" : ""}`,
                        type: "button"
                    }
                );
                cell.addEventListener("click", () => {
                    this.state.currentFrame = f;
                    this.state.activeLayerId = layer.id;
                    if (hasKf || hasCel) {
                        this.openCurveEditorDialog(layer.id, f);
                    } else {
                        this.state.notify();
                    }
                });
                cell.addEventListener("dblclick", () => {
                    this.recordLayerKeyframe(layer.id, f);
                });
                cellsCol.appendChild(cell);
            }

            layerRow.append(labelCol, cellsCol);
            tracksContainer.appendChild(layerRow);

            // Render Child Vector Object & <ObjectRef> Tracks inside this Vector Layer
            if (hasObjects && isExpanded) {
                for (const obj of layer.objects) {
                    const isObjSelected = this.state.selectedObjectIds.includes(obj.id);
                    const objRow = this.createElement(
                        "div",
                        `ha-timeline-track-row ha-timeline-object-track ${isObjSelected ? "active" : ""}`,
                        undefined,
                        { "data-track-object-id": obj.id }
                    );

                    const objLabelCol = this.createElement("div", "ha-timeline-track-label-col object-col");
                    const icon = obj.kind === "ref" ? "🧩" : obj.kind === "text" ? "🔤" : "📐";
                    const objTitle = this.createElement(
                        "span",
                        "ha-timeline-track-title",
                        `${icon} ${obj.id} (${obj.kind})`
                    );
                    objTitle.addEventListener("click", () => {
                        this.state.activeLayerId = layer.id;
                        this.state.selectedObjectIds = [obj.id];
                        this.state.notify();
                    });

                    // If this is a Shared Object <ObjectRef>, allow jumping directly to its internal timeline
                    if (obj.kind === "ref" && obj.refId) {
                        const enterSoBtn = this.createElement("button", "ha-dock-btn ha-track-kf-btn", "🎬", {
                            title: `Open Internal Animation Timeline for Shared Object "${obj.refId}"`,
                            type: "button"
                        });
                        enterSoBtn.addEventListener("click", (e) => {
                            e.stopPropagation();
                            this.state.enterInPlaceSharedObjectEdit(obj.refId!, obj.id);
                        });
                        objLabelCol.appendChild(enterSoBtn);
                    }

                    const addObjKfBtn = this.createElement("button", "ha-dock-btn ha-track-kf-btn", "+KF", {
                        "data-track-add-kf": `obj:${obj.id}`,
                        title: `Record Object Keyframe for "${obj.id}" at Frame ${this.state.currentFrame}`,
                        type: "button"
                    });
                    addObjKfBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.recordObjectKeyframe(obj, this.state.currentFrame);
                    });

                    objLabelCol.append(objTitle, addObjKfBtn);

                    const objCellsCol = this.createElement("div", "ha-timeline-track-cells-col");
                    const objTracks = anim.tracks.filter(t => t.targetId === obj.id);

                    for (let f = 0; f < totalFrames; f++) {
                        const kfsAtF = objTracks
                            .map(t => ({ property: t.property, kf: t.keyframes.find(k => k.frame === f) }))
                            .filter(item => Boolean(item.kf));
                        const hasKf = kfsAtF.length > 0;
                        const firstKf = kfsAtF[0]?.kf;
                        const inRange =
                            (obj.startFrame === undefined || f >= obj.startFrame) &&
                            (obj.endFrame === undefined || f <= obj.endFrame);

                        const cell = this.createElement(
                            "button",
                            `ha-timeline-track-cell ${this.state.currentFrame === f ? "current-frame" : ""} ${hasKf ? "has-kf" : ""} ${!inRange ? "out-of-range" : ""}`,
                            hasKf ? "◆" : "",
                            {
                                "data-object-track-cell": `${obj.id}:${f}`,
                                title: hasKf
                                    ? `Object "${obj.id}" @ Frame ${f} (${kfsAtF.map(k => k.property).join(", ")} • Curve: ${firstKf?.curvePresetId || firstKf?.easing || "linear"}) — Click to edit Curve & Span`
                                    : `Object "${obj.id}" @ Frame ${f} (Double-click to add keyframe)`,
                                type: "button"
                            }
                        );
                        cell.addEventListener("click", () => {
                            this.state.currentFrame = f;
                            this.state.activeLayerId = layer.id;
                            this.state.selectedObjectIds = [obj.id];
                            if (hasKf) {
                                this.openCurveEditorDialog(obj.id, f);
                            } else {
                                this.state.notify();
                            }
                        });
                        cell.addEventListener("dblclick", () => {
                            this.recordObjectKeyframe(obj, f);
                        });
                        objCellsCol.appendChild(cell);
                    }

                    objRow.append(objLabelCol, objCellsCol);
                    tracksContainer.appendChild(objRow);
                }
            }
        }

        bodyEl.append(controlsBar, strip, tracksContainer);
    }

    private resolveSelectedTimelineTarget(): {
        id: string;
        label: string;
        startFrame?: number;
        endFrame?: number;
    } | null {
        const layers = this.state.getActiveContainerLayers();
        const selObjId = this.state.selectedObjectIds[0];
        if (selObjId) {
            for (const l of layers) {
                const found = l.objects.find(o => o.id === selObjId);
                if (found) {
                    return {
                        id: found.id,
                        label: found.id,
                        startFrame: found.startFrame,
                        endFrame: found.endFrame
                    };
                }
            }
        }
        const activeLayer = layers.find(l => l.id === this.state.activeLayerId) || layers[0];
        if (activeLayer) {
            return {
                id: activeLayer.id,
                label: activeLayer.name,
                startFrame: activeLayer.startFrame,
                endFrame: activeLayer.endFrame
            };
        }
        return null;
    }

    private getAllCurvePresets(): AnimationCurvePreset[] {
        const fromConfig = this.state.configManager?.listCurvePresets?.() || BUILT_IN_CURVE_PRESETS;
        if (!this.state.hasOpenCanvas) return fromConfig;
        const cState = this.state.getCanvasState();
        const docPresets = cState.animation?.customCurvePresets || [];
        const merged = [...fromConfig];
        for (const dp of docPresets) {
            if (!merged.some(m => m.id === dp.id)) {
                merged.push(dp);
            }
        }
        return merged;
    }

    private resolveActiveCurveConfig(): {
        easing: EasingMode;
        curveControlPoints: [number, number, number, number];
        curvePresetId: string;
    } {
        const preset = this.getAllCurvePresets().find(p => p.id === this.activeCurvePresetId);
        const cp: [number, number, number, number] = preset
            ? [
                  preset.controlPoints[0],
                  preset.controlPoints[1],
                  preset.controlPoints[2],
                  preset.controlPoints[3]
              ]
            : [
                  this.activeBezier[0],
                  this.activeBezier[1],
                  this.activeBezier[2],
                  this.activeBezier[3]
              ];
        const easing: EasingMode =
            this.activeCurvePresetId === "step"
                ? "step"
                : this.activeCurvePresetId === "linear"
                  ? "linear"
                  : "custom_bezier";
        return {
            easing,
            curveControlPoints: cp,
            curvePresetId: this.activeCurvePresetId
        };
    }

    private recordKeyframeForSelectedOrActive(): void {
        const objId = this.state.selectedObjectIds[0];
        const layers = this.state.getActiveContainerLayers();
        if (objId) {
            for (const l of layers) {
                const obj = l.objects.find(o => o.id === objId);
                if (obj) {
                    this.recordObjectKeyframe(obj, this.state.currentFrame);
                    return;
                }
            }
        }
        const activeLayer = layers.find(l => l.id === this.state.activeLayerId) || layers[0];
        if (activeLayer) {
            this.recordLayerKeyframe(activeLayer.id, this.state.currentFrame);
            return;
        }
        this.state.setStatus("Select a vector object or layer first to record a keyframe.");
    }

    private recordLayerKeyframe(layerId: string, frame: number): void {
        const layers = this.state.getActiveContainerLayers();
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;
        const curveCfg = this.resolveActiveCurveConfig();
        if (layer.type === "raster") {
            this.state.engine.setRasterCelKeyframe(this.state.canvasId, {
                layerId: layer.id,
                frame,
                mode: "duplicate",
                easing: curveCfg.easing,
                curveControlPoints: curveCfg.curveControlPoints,
                curvePresetId: curveCfg.curvePresetId,
                sharedObjectId: this.state.activeSharedObjectId
            });
        }
        this.state.engine.setKeyframe(this.state.canvasId, {
            sharedObjectId: this.state.activeSharedObjectId,
            targetId: layer.id,
            frame,
            easing: curveCfg.easing,
            curveControlPoints: curveCfg.curveControlPoints,
            curvePresetId: curveCfg.curvePresetId,
            properties: {
                opacity: layer.opacity ?? 1
            }
        });
        this.state.setStatus(
            `Recorded layer keyframe for "${layer.name}" at frame ${frame} (${curveCfg.curvePresetId}).`
        );
        this.state.notify();
    }

    private getAllRasterBlendPresets(): RasterBlendPreset[] {
        const fromEngine = this.state.engine?.listRasterBlendPresets?.(
            this.state.hasOpenCanvas ? this.state.canvasId : undefined,
            this.state.activeSharedObjectId
        ) || [...BUILT_IN_RASTER_BLEND_PRESETS];
        const fromConfig = this.state.configManager?.listRasterBlendPresets?.() || [];
        const merged = [...fromEngine];
        for (const cp of fromConfig) {
            if (!merged.some(m => m.id === cp.id)) {
                merged.push(cp);
            }
        }
        return merged;
    }

    private recordObjectKeyframe(obj: any, frame: number): void {
        const curveCfg = this.resolveActiveCurveConfig();
        const props: Record<string, number> = {
            x: obj.x ?? 0,
            y: obj.y ?? 0,
            rotation: obj.rotation ?? 0,
            scaleX: obj.scaleX ?? 1,
            scaleY: obj.scaleY ?? 1,
            skewX: obj.skewX ?? 0,
            skewY: obj.skewY ?? 0,
            opacity: obj.opacity ?? 1
        };
        if (obj.cx !== undefined) props.cx = obj.cx;
        if (obj.cy !== undefined) props.cy = obj.cy;

        this.state.engine.setKeyframe(this.state.canvasId, {
            sharedObjectId: this.state.activeSharedObjectId,
            targetId: obj.id,
            frame,
            easing: curveCfg.easing,
            curveControlPoints: curveCfg.curveControlPoints,
            curvePresetId: curveCfg.curvePresetId,
            properties: props
        });
        this.state.setStatus(
            `Recorded keyframe for "${obj.id}" at frame ${frame} (Curve: ${curveCfg.curvePresetId}).`
        );
        this.state.notify();
    }

    /**
     * Opens the interactive Visual Cubic-Bezier Movement & Property Curve Editor modal
     * (`#ha-curve-editor-dialog`), supporting preset selection, draggable $P_1, P_2$ handles,
     * saving new custom presets to `config.json` & `.hacanvas`, and per-keyframe `startFrame`/`endFrame`.
     */
    public openCurveEditorDialog(targetId?: string, frame?: number): void {
        const existing = this.doc.getElementById("ha-curve-editor-dialog");
        if (existing) existing.remove();

        const anim = this.state.hasOpenCanvas ? this.state.getActiveAnimationTimeline() : null;
        const resolvedFrame = frame ?? this.state.currentFrame;
        const resolvedTargetId =
            targetId || this.state.selectedObjectIds[0] || this.state.activeLayerId || "";

        // Find any existing keyframe at (resolvedTargetId, resolvedFrame)
        let existingKf: any = null;
        if (anim && resolvedTargetId) {
            for (const t of anim.tracks) {
                if (t.targetId === resolvedTargetId) {
                    const kf = t.keyframes.find(k => k.frame === resolvedFrame);
                    if (kf) {
                        existingKf = kf;
                        break;
                    }
                }
            }
        }

        if (existingKf?.curveControlPoints) {
            this.activeBezier = [
                existingKf.curveControlPoints[0],
                existingKf.curveControlPoints[1],
                existingKf.curveControlPoints[2],
                existingKf.curveControlPoints[3]
            ];
        }
        if (existingKf?.curvePresetId) {
            this.activeCurvePresetId = existingKf.curvePresetId;
        }

        const overlay = this.createElement("div", "ha-modal-backdrop active", undefined, {
            id: "ha-curve-editor-dialog"
        });
        const card = this.createElement("div", "ha-modal-card ha-curve-editor-card");

        const header = this.createElement("div", "ha-modal-header");
        header.appendChild(
            this.createElement(
                "h3",
                "ha-modal-title",
                `📈 Visual Animation Curve Editor ${resolvedTargetId ? `— "${resolvedTargetId}" @ F${resolvedFrame}` : ""}`
            )
        );
        const closeBtn = this.createElement("button", "ha-modal-close", "×", { type: "button" });
        closeBtn.addEventListener("click", () => overlay.remove());
        header.appendChild(closeBtn);

        const body = this.createElement("div", "ha-modal-body ha-curve-editor-body");

        // Left Column: Interactive Cubic-Bezier Canvas
        const canvasCol = this.createElement("div", "ha-curve-canvas-col");
        const curveCanvas = this.createElement("canvas", "ha-curve-editor-canvas", undefined, {
            id: "ha-curve-editor-canvas",
            width: "240",
            height: "240"
        }) as HTMLCanvasElement;
        canvasCol.appendChild(curveCanvas);

        // Right Column: Presets, Bezier Coordinates, Keyframe Start/End Frame, & Preset Saver
        const controlsCol = this.createElement("div", "ha-curve-controls-col");

        // Preset dropdown
        const presetLabel = this.createElement("label", "ha-form-label", "Curve Preset");
        const presetSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-curve-preset-select"
        }) as HTMLSelectElement;

        const populatePresets = () => {
            presetSelect.innerHTML = "";
            for (const p of this.getAllCurvePresets()) {
                const opt = this.createElement(
                    "option",
                    undefined,
                    `${p.builtIn ? "⚡" : "⭐"} ${p.name} (${p.controlPoints.map(n => Number(n.toFixed(2))).join(", ")})`,
                    { value: p.id }
                );
                if (p.id === this.activeCurvePresetId) opt.selected = true;
                presetSelect.appendChild(opt);
            }
        };
        populatePresets();

        // Numeric inputs for x1, y1, x2, y2
        const coordsRow = this.createElement("div", "ha-curve-coords-grid");
        const x1Input = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-x1",
            type: "number",
            step: "0.05",
            min: "0",
            max: "1",
            value: String(this.activeBezier[0])
        }) as HTMLInputElement;
        const y1Input = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-y1",
            type: "number",
            step: "0.05",
            min: "-0.5",
            max: "1.5",
            value: String(this.activeBezier[1])
        }) as HTMLInputElement;
        const x2Input = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-x2",
            type: "number",
            step: "0.05",
            min: "0",
            max: "1",
            value: String(this.activeBezier[2])
        }) as HTMLInputElement;
        const y2Input = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-y2",
            type: "number",
            step: "0.05",
            min: "-0.5",
            max: "1.5",
            value: String(this.activeBezier[3])
        }) as HTMLInputElement;

        const wrapCoord = (lbl: string, inp: HTMLInputElement) => {
            const w = this.createElement("div", "ha-curve-coord-field");
            w.append(this.createElement("span", "ha-form-label", lbl), inp);
            return w;
        };
        coordsRow.append(
            wrapCoord("P1.x", x1Input),
            wrapCoord("P1.y", y1Input),
            wrapCoord("P2.x", x2Input),
            wrapCoord("P2.y", y2Input)
        );

        // Keyframe Segment Start/End Frame Inputs
        const spanLabel = this.createElement(
            "label",
            "ha-form-label",
            "Keyframe Segment Start / End Frame"
        );
        const kfSpanRow = this.createElement("div", "ha-curve-span-row");
        const kfStartInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-kf-start-frame",
            type: "number",
            min: "0",
            placeholder: "Start Frame",
            value: String(existingKf?.frame ?? resolvedFrame)
        }) as HTMLInputElement;
        const kfEndInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-kf-end-frame",
            type: "number",
            min: "0",
            placeholder: "End Frame (optional)",
            value: existingKf?.endFrame !== undefined ? String(existingKf.endFrame) : ""
        }) as HTMLInputElement;
        kfSpanRow.append(kfStartInput, kfEndInput);

        // Save New Custom Preset row
        const saveLabel = this.createElement("label", "ha-form-label", "Save Custom Curve Preset");
        const saveRow = this.createElement("div", "ha-curve-save-row");
        const presetNameInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-curve-preset-name-input",
            type: "text",
            placeholder: "e.g. Elastic Bounce"
        }) as HTMLInputElement;
        const savePresetBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "💾 Save Preset",
            {
                id: "ha-btn-save-curve-preset",
                type: "button"
            }
        );
        saveRow.append(presetNameInput, savePresetBtn);

        controlsCol.append(
            presetLabel,
            presetSelect,
            this.createElement("label", "ha-form-label", "Cubic-Bezier Control Points P1(x1,y1), P2(x2,y2)"),
            coordsRow,
            spanLabel,
            kfSpanRow,
            saveLabel,
            saveRow
        );

        body.append(canvasCol, controlsCol);

        // Canvas rendering & interactive handle dragging
        const pad = 36;
        const plotW = curveCanvas.width - pad * 2;
        const plotH = curveCanvas.height - pad * 2;
        const toCanvasXY = (bx: number, by: number) => ({
            cx: pad + bx * plotW,
            cy: curveCanvas.height - pad - by * plotH
        });
        const fromCanvasXY = (cx: number, cy: number) => ({
            bx: Math.max(0, Math.min(1, Number(((cx - pad) / plotW).toFixed(3)))),
            by: Math.max(-0.4, Math.min(1.4, Number(((curveCanvas.height - pad - cy) / plotH).toFixed(3))))
        });

        const drawCurveCanvas = () => {
            const ctx = curveCanvas.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, curveCanvas.width, curveCanvas.height);

            // Background box
            ctx.fillStyle = "#10121c";
            ctx.fillRect(0, 0, curveCanvas.width, curveCanvas.height);

            ctx.strokeStyle = "#262b40";
            ctx.lineWidth = 1;
            ctx.strokeRect(pad, pad, plotW, plotH);

            // Grid lines (25%, 50%, 75%)
            ctx.beginPath();
            for (const step of [0.25, 0.5, 0.75]) {
                const gx = pad + step * plotW;
                const gy = pad + step * plotH;
                ctx.moveTo(gx, pad);
                ctx.lineTo(gx, pad + plotH);
                ctx.moveTo(pad, gy);
                ctx.lineTo(pad + plotW, gy);
            }
            ctx.stroke();

            // Linear diagonal reference
            const p0 = toCanvasXY(0, 0);
            const p3 = toCanvasXY(1, 1);
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(p0.cx, p0.cy);
            ctx.lineTo(p3.cx, p3.cy);
            ctx.stroke();
            ctx.restore();

            // Control handles P1 and P2
            const [x1, y1, x2, y2] = this.activeBezier;
            const p1 = toCanvasXY(x1, y1);
            const p2 = toCanvasXY(x2, y2);

            // Tangents
            ctx.strokeStyle = "#00e5ff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p0.cx, p0.cy);
            ctx.lineTo(p1.cx, p1.cy);
            ctx.stroke();

            ctx.strokeStyle = "#ffab00";
            ctx.beginPath();
            ctx.moveTo(p3.cx, p3.cy);
            ctx.lineTo(p2.cx, p2.cy);
            ctx.stroke();

            // Sampled Easing Curve
            ctx.strokeStyle = "#00ffaa";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(p0.cx, p0.cy);
            for (let i = 1; i <= 60; i++) {
                const t = i / 60;
                const val = evaluateCubicBezierEasing(t, [x1, y1, x2, y2]);
                const pt = toCanvasXY(t, val);
                ctx.lineTo(pt.cx, pt.cy);
            }
            ctx.stroke();

            // Draw P1 & P2 control circles
            ctx.fillStyle = "#00e5ff";
            ctx.beginPath();
            ctx.arc(p1.cx, p1.cy, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffab00";
            ctx.beginPath();
            ctx.arc(p2.cx, p2.cy, 6, 0, Math.PI * 2);
            ctx.fill();
        };

        const syncInputsFromBezier = () => {
            x1Input.value = String(this.activeBezier[0]);
            y1Input.value = String(this.activeBezier[1]);
            x2Input.value = String(this.activeBezier[2]);
            y2Input.value = String(this.activeBezier[3]);
            drawCurveCanvas();
        };

        const syncBezierFromInputs = () => {
            this.activeBezier = [
                Math.max(0, Math.min(1, Number(x1Input.value) || 0)),
                Number(y1Input.value) || 0,
                Math.max(0, Math.min(1, Number(x2Input.value) || 0)),
                Number(y2Input.value) || 0
            ];
            drawCurveCanvas();
        };

        for (const inp of [x1Input, y1Input, x2Input, y2Input]) {
            inp.addEventListener("input", syncBezierFromInputs);
        }

        presetSelect.addEventListener("change", () => {
            this.activeCurvePresetId = presetSelect.value;
            const found = this.getAllCurvePresets().find(p => p.id === this.activeCurvePresetId);
            if (found) {
                this.activeBezier = [
                    found.controlPoints[0],
                    found.controlPoints[1],
                    found.controlPoints[2],
                    found.controlPoints[3]
                ];
                syncInputsFromBezier();
            }
        });

        let draggingHandle: "p1" | "p2" | null = null;
        curveCanvas.addEventListener("mousedown", (ev: MouseEvent) => {
            const rect = curveCanvas.getBoundingClientRect();
            const cx = ev.clientX - rect.left;
            const cy = ev.clientY - rect.top;
            const p1 = toCanvasXY(this.activeBezier[0], this.activeBezier[1]);
            const p2 = toCanvasXY(this.activeBezier[2], this.activeBezier[3]);
            const d1 = Math.hypot(cx - p1.cx, cy - p1.cy);
            const d2 = Math.hypot(cx - p2.cx, cy - p2.cy);
            draggingHandle = d1 <= d2 ? "p1" : "p2";
            const { bx, by } = fromCanvasXY(cx, cy);
            if (draggingHandle === "p1") {
                this.activeBezier[0] = bx;
                this.activeBezier[1] = by;
            } else {
                this.activeBezier[2] = bx;
                this.activeBezier[3] = by;
            }
            syncInputsFromBezier();
        });

        curveCanvas.addEventListener("mousemove", (ev: MouseEvent) => {
            if (!draggingHandle) return;
            const rect = curveCanvas.getBoundingClientRect();
            const { bx, by } = fromCanvasXY(ev.clientX - rect.left, ev.clientY - rect.top);
            if (draggingHandle === "p1") {
                this.activeBezier[0] = bx;
                this.activeBezier[1] = by;
            } else {
                this.activeBezier[2] = bx;
                this.activeBezier[3] = by;
            }
            syncInputsFromBezier();
        });

        this.listen(this.win, "mouseup", () => {
            draggingHandle = null;
        });

        // Save Custom Preset handler
        savePresetBtn.addEventListener("click", () => {
            const name = presetNameInput.value.trim() || "Custom Curve";
            const cp: [number, number, number, number] = [
                this.activeBezier[0],
                this.activeBezier[1],
                this.activeBezier[2],
                this.activeBezier[3]
            ];
            const saved = this.state.configManager.saveCurvePreset({
                name,
                controlPoints: cp
            });
            if (this.state.hasOpenCanvas) {
                const cState = this.state.getCanvasState();
                cState.animation.customCurvePresets = cState.animation.customCurvePresets || [];
                const idx = cState.animation.customCurvePresets.findIndex(p => p.id === saved.id);
                if (idx >= 0) {
                    cState.animation.customCurvePresets[idx] = saved;
                } else {
                    cState.animation.customCurvePresets.push(saved);
                }
            }
            this.activeCurvePresetId = saved.id;
            populatePresets();
            this.state.setStatus(`Saved custom animation curve preset "${saved.name}" (${saved.id}).`);
            this.state.notify();
        });

        // Footer Actions
        const footer = this.createElement("div", "ha-modal-footer");
        const rblendBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "🧪 Raster Blend & JS Presets",
            {
                id: "ha-btn-open-rblend-from-curve",
                type: "button",
                title: "Open Raster Layer Keyframe Blending & Custom JavaScript Preset Editor"
            }
        );
        rblendBtn.addEventListener("click", () => {
            overlay.remove();
            this.openRasterBlendDialog(resolvedTargetId || this.state.activeLayerId, resolvedFrame);
        });

        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Cancel", {
            type: "button"
        });
        cancelBtn.addEventListener("click", () => overlay.remove());

        const applyBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary",
            "✓ Apply Curve to Keyframe",
            {
                id: "ha-btn-apply-curve",
                type: "button"
            }
        );
        applyBtn.addEventListener("click", () => {
            if (this.state.hasOpenCanvas && resolvedTargetId) {
                const sf =
                    kfStartInput.value.trim() !== ""
                        ? Math.max(0, Number(kfStartInput.value) || 0)
                        : resolvedFrame;
                const ef =
                    kfEndInput.value.trim() !== ""
                        ? Math.max(sf, Number(kfEndInput.value) || sf)
                        : null;
                const curveCfg = this.resolveActiveCurveConfig();
                this.state.engine.updateKeyframeSegment(this.state.canvasId, {
                    sharedObjectId: this.state.activeSharedObjectId,
                    targetId: resolvedTargetId,
                    frame: resolvedFrame,
                    newFrame: sf,
                    endFrame: ef,
                    easing: curveCfg.easing,
                    curveControlPoints: [
                        this.activeBezier[0],
                        this.activeBezier[1],
                        this.activeBezier[2],
                        this.activeBezier[3]
                    ],
                    curvePresetId: this.activeCurvePresetId
                });
                this.state.setStatus(
                    `Applied curve "${this.activeCurvePresetId}" [${this.activeBezier.join(", ")}] to "${resolvedTargetId}" @ F${sf}.`
                );
                this.state.notify();
            }
            overlay.remove();
        });

        footer.append(rblendBtn, cancelBtn, applyBtn);
        card.append(header, body, footer);
        overlay.appendChild(card);
        this.doc.body.appendChild(overlay);

        drawCurveCanvas();
    }

    /**
     * Opens the Raster Layer Keyframe Blending & Custom JavaScript Preset Editor dialog (`#ha-raster-blend-dialog`).
     * - Displays the full JavaScript source code for ALL presets (including built-in ones).
     * - Supports blending between keyframes on the same raster layer OR between two different raster layers' keyframes.
     * - Supports writing/editing custom JavaScript blending code, live validation, and saving custom scripts as reusable presets.
     */
    public openRasterBlendDialog(layerId?: string, frame?: number): void {
        const existing = this.doc.getElementById("ha-raster-blend-dialog");
        if (existing) existing.remove();

        const layers = this.state.hasOpenCanvas ? this.state.getActiveContainerLayers() : [];
        const rasterLayers = layers.filter(l => l.type === "raster");
        const resolvedLayer =
            rasterLayers.find(l => l.id === layerId) ||
            rasterLayers.find(l => l.id === this.state.activeLayerId) ||
            rasterLayers[0];
        const resolvedFrame = frame ?? this.state.currentFrame ?? 0;

        const anim = this.state.hasOpenCanvas ? this.state.getActiveAnimationTimeline() : null;
        const celTrack =
            anim && resolvedLayer
                ? anim.tracks.find(t => t.targetId === resolvedLayer.id && t.property === "rasterCel")
                : undefined;
        const existingKf = celTrack?.keyframes.find(k => k.frame === resolvedFrame);

        const initialPresetId =
            existingKf?.rasterBlendPresetId || resolvedLayer?.rasterBlendPresetId || "crossfade";
        const initialCustomCode =
            existingKf?.rasterBlendCustomCode || resolvedLayer?.rasterBlendCustomCode || "";
        const initialTargetLayerId =
            existingKf?.rasterBlendTargetLayerId || resolvedLayer?.rasterBlendTargetLayerId || "";
        const initialTargetFrame =
            existingKf?.rasterBlendTargetFrame ?? resolvedLayer?.rasterBlendTargetFrame;

        const overlay = this.createElement("div", "ha-modal-backdrop active", undefined, {
            id: "ha-raster-blend-dialog"
        });
        const card = this.createElement("div", "ha-modal-card ha-curve-editor-card", undefined, {
            style: "max-width: 760px; width: 92vw;"
        });

        const header = this.createElement("div", "ha-modal-header");
        header.appendChild(
            this.createElement(
                "h3",
                "ha-modal-title",
                `🧪 Raster Keyframe Blending & JS Preset Editor ${resolvedLayer ? `— "${resolvedLayer.name}" @ F${resolvedFrame}` : ""}`
            )
        );
        const closeBtn = this.createElement("button", "ha-modal-close", "×", { type: "button" });
        closeBtn.addEventListener("click", () => overlay.remove());
        header.appendChild(closeBtn);

        const body = this.createElement("div", "ha-modal-body", undefined, {
            style: "display: flex; flex-direction: column; gap: 10px;"
        });

        // Row 1: Source Raster Layer + Keyframe Frame + End Frame + Add Cel button
        const row1 = this.createElement("div", "ha-curve-span-row", undefined, {
            style: "display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr auto; gap: 8px; align-items: end;"
        });

        const layerField = this.createElement("div");
        layerField.appendChild(this.createElement("label", "ha-form-label", "Source Raster Layer"));
        const layerSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-rblend-layer-select"
        }) as HTMLSelectElement;
        for (const rl of rasterLayers) {
            const opt = this.createElement("option", undefined, `🖌️ ${rl.name} (${rl.id})`, {
                value: rl.id
            });
            if (resolvedLayer && rl.id === resolvedLayer.id) opt.selected = true;
            layerSelect.appendChild(opt);
        }
        layerField.appendChild(layerSelect);

        const frameField = this.createElement("div");
        frameField.appendChild(this.createElement("label", "ha-form-label", "Start Frame"));
        const frameInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-rblend-frame-input",
            type: "number",
            min: "0",
            value: String(resolvedFrame)
        }) as HTMLInputElement;
        frameField.appendChild(frameInput);

        const endFrameField = this.createElement("div");
        endFrameField.appendChild(this.createElement("label", "ha-form-label", "End Frame (optional)"));
        const endFrameInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-rblend-end-frame-input",
            type: "number",
            min: "0",
            placeholder: "Next Cel",
            value: existingKf?.endFrame !== undefined ? String(existingKf.endFrame) : ""
        }) as HTMLInputElement;
        endFrameField.appendChild(endFrameInput);

        const addCelBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "➕ Add Cel @ Frame",
            {
                id: "ha-btn-add-rblend-cel",
                type: "button",
                title: "Create/duplicate a Raster Cel Keyframe on the selected Raster Layer at Start Frame"
            }
        );
        addCelBtn.addEventListener("click", () => {
            if (!this.state.hasOpenCanvas || !layerSelect.value) return;
            const f = Math.max(0, Number(frameInput.value) || 0);
            this.state.engine.setRasterCelKeyframe(this.state.canvasId, {
                layerId: layerSelect.value,
                frame: f,
                mode: "duplicate",
                sharedObjectId: this.state.activeSharedObjectId
            });
            this.state.setStatus(`Created raster cel keyframe at F${f} on "${layerSelect.value}".`);
            this.state.notify();
        });

        row1.append(layerField, frameField, endFrameField, addCelBtn);

        // Row 2: Cross-Layer Blend Target + Target Frame
        const row2 = this.createElement("div", "ha-curve-span-row", undefined, {
            style: "display: grid; grid-template-columns: 2fr 1fr; gap: 8px; align-items: end;"
        });

        const targetLayerField = this.createElement("div");
        targetLayerField.appendChild(
            this.createElement(
                "label",
                "ha-form-label",
                "Target Keyframe Source (Same Layer or Cross-Layer Raster Blend)"
            )
        );
        const targetLayerSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-rblend-target-layer-select"
        }) as HTMLSelectElement;
        targetLayerSelect.appendChild(
            this.createElement("option", undefined, "🔁 Same Raster Layer (Blend into Next Cel Keyframe)", {
                value: ""
            })
        );
        for (const rl of rasterLayers) {
            const opt = this.createElement(
                "option",
                undefined,
                `🔀 Blend into Raster Layer: "${rl.name}" (${rl.id})`,
                { value: rl.id }
            );
            if (initialTargetLayerId && rl.id === initialTargetLayerId) opt.selected = true;
            targetLayerSelect.appendChild(opt);
        }
        targetLayerField.appendChild(targetLayerSelect);

        const targetFrameField = this.createElement("div");
        targetFrameField.appendChild(this.createElement("label", "ha-form-label", "Target Layer Frame"));
        const targetFrameInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-rblend-target-frame-input",
            type: "number",
            min: "0",
            placeholder: "Auto / End Frame",
            value: initialTargetFrame !== undefined ? String(initialTargetFrame) : ""
        }) as HTMLInputElement;
        targetFrameField.appendChild(targetFrameInput);

        row2.append(targetLayerField, targetFrameField);

        // Row 3: Categorized Blending Method / Preset Selector + Description
        const presetField = this.createElement("div");
        const presetTopGrid = this.createElement("div", undefined, undefined, {
            style: "display: grid; grid-template-columns: 1fr 1.8fr; gap: 8px; align-items: end;"
        });

        const catSelectDiv = this.createElement("div");
        catSelectDiv.appendChild(
            this.createElement("label", "ha-form-label", "Transition Folder Category")
        );
        const categorySelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-rblend-category-select"
        }) as HTMLSelectElement;
        catSelectDiv.appendChild(categorySelect);

        const presetSelectDiv = this.createElement("div");
        presetSelectDiv.appendChild(
            this.createElement(
                "label",
                "ha-form-label",
                "Blending Method Preset (Built-In & Custom JavaScript Presets)"
            )
        );
        const presetSelect = this.createElement("select", "ha-select", undefined, {
            id: "ha-rblend-preset-select"
        }) as HTMLSelectElement;
        presetSelectDiv.appendChild(presetSelect);

        presetTopGrid.append(catSelectDiv, presetSelectDiv);

        // Collapsible Folder Category Pills / Tree for quick browsing
        const categoryFoldersBar = this.createElement("div", "ha-rblend-categories-tree", undefined, {
            id: "ha-rblend-categories-tree",
            style: "display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;"
        });

        const presetDescEl = this.createElement("div", "ha-form-label", "", {
            id: "ha-rblend-preset-desc",
            style: "color: #9aa4bf; font-size: 11px; margin-top: 4px;"
        });

        // Row 4: Visible & Editable JavaScript Blending Code Editor with Prism.js & Modifier+Click IDE
        const codeField = this.createElement("div");
        const codeHeaderRow = this.createElement("div", undefined, undefined, {
            style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;"
        });
        codeHeaderRow.appendChild(
            this.createElement(
                "label",
                "ha-form-label",
                "Blending JavaScript Code — Args: (bufA, bufB, outBuf, width, height, t, rawT, helpers)"
            )
        );
        const validateStatus = this.createElement("span", undefined, "✓ Valid JS", {
            id: "ha-rblend-validation-status",
            style: "font-size: 11px; color: #00e676;"
        });
        codeHeaderRow.appendChild(validateStatus);

        const ideMount = this.createElement("div", undefined, undefined, {
            id: "ha-rblend-ide-mount"
        });
        const blendIde = new JsCodeIdeEditor({
            container: ideMount,
            initialCode: "",
            minHeightPx: 185,
            maxHeightPx: 290,
            onStatus: (msg) => {
                validateStatus.textContent = msg;
                validateStatus.style.color = "#00e5ff";
            }
        });
        this.lastBlendIdeEditor = blendIde;
        const codeTextarea = blendIde.getTextareaElement();
        codeTextarea.id = "ha-rblend-code-editor";

        const presetCatInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-rblend-preset-category-input",
            type: "text",
            placeholder: "Category Folder (e.g. Wipe & Sweep)",
            value: "Custom"
        }) as HTMLInputElement;

        const populateBlendPresets = (selectedId: string, filterCategory: string = "ALL") => {
            const allPresets = this.getAllRasterBlendPresets();
            const categories = Array.from(
                new Set([
                    ...RASTER_TRANSITION_CATEGORIES,
                    ...allPresets.map(p => p.category || "Custom")
                ])
            );

            categorySelect.innerHTML = `<option value="ALL">📂 All Transition Folders (${allPresets.length})</option>`;
            categoryFoldersBar.innerHTML = "";
            for (const c of categories) {
                const inCat = allPresets.filter(p => (p.category || "Custom") === c);
                if (inCat.length === 0) continue;
                const opt = this.createElement("option", undefined, `📁 ${c} (${inCat.length})`, {
                    value: c
                });
                if (c === filterCategory) opt.selected = true;
                categorySelect.appendChild(opt);

                const folderChip = this.createElement(
                    "button",
                    `ha-filter-chip ha-rblend-category-folder ${filterCategory === c ? "active" : ""}`,
                    `📂 ${c} (${inCat.length})`,
                    {
                        "data-category": c,
                        type: "button",
                        style: "font-size:10px;padding:2px 6px;"
                    }
                );
                folderChip.addEventListener("click", () => {
                    const nextCat = filterCategory === c ? "ALL" : c;
                    populateBlendPresets(presetSelect.value || selectedId, nextCat);
                });
                categoryFoldersBar.appendChild(folderChip);
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
                    `[${p.category || "Custom"}] ${p.builtIn ? "⚡ Built-In:" : "⭐ Custom:"} ${p.name} (${p.id})`,
                    { value: p.id }
                );
                if (p.id === selectedId) opt.selected = true;
                presetSelect.appendChild(opt);
            }
            const active =
                visiblePresets.find(p => p.id === selectedId) ||
                visiblePresets[0] ||
                allPresets[0];
            if (active) {
                presetSelect.value = active.id;
                presetDescEl.textContent = `[${active.category || "Custom"}] ${active.description}`;
                presetCatInput.value = active.category || "Custom";
                const codeToShow =
                    initialCustomCode && active.id === initialPresetId
                        ? initialCustomCode
                        : active.code;
                blendIde.setCode(codeToShow);
            }
        };

        populateBlendPresets(initialPresetId, "ALL");

        categorySelect.addEventListener("change", () => {
            populateBlendPresets(presetSelect.value || initialPresetId, categorySelect.value);
        });

        presetSelect.addEventListener("change", () => {
            const chosen = this.getAllRasterBlendPresets().find(p => p.id === presetSelect.value);
            if (chosen) {
                presetDescEl.textContent = `[${chosen.category || "Custom"}] ${chosen.description}`;
                presetCatInput.value = chosen.category || "Custom";
                blendIde.setCode(chosen.code);
                validateStatus.textContent = `✓ Loaded "${chosen.name}" JS source`;
                validateStatus.style.color = "#00e676";
            }
        });

        presetField.append(presetTopGrid, categoryFoldersBar, presetDescEl);
        codeField.append(codeHeaderRow, ideMount);

        // Row 5: Validate JS & Save Custom JS Preset controls
        const saveRow = this.createElement("div", "ha-curve-save-row", undefined, {
            style: "display: grid; grid-template-columns: auto 1fr 0.9fr 1.1fr auto; gap: 6px; align-items: center;"
        });

        const validateBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "✓ Test / Validate JS",
            {
                id: "ha-btn-validate-rblend-code",
                type: "button"
            }
        );
        validateBtn.addEventListener("click", () => {
            const check = this.state.engine.validateRasterBlendScript(blendIde.getCode());
            if (check.valid) {
                validateStatus.textContent = "✓ JS Validated (2×2 RGBA test passed)";
                validateStatus.style.color = "#00e676";
            } else {
                validateStatus.textContent = `✗ Error: ${check.error}`;
                validateStatus.style.color = "#ff5252";
            }
        });

        const presetNameInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-rblend-preset-name-input",
            type: "text",
            placeholder: "New Preset Name (e.g. Radial Burn)"
        }) as HTMLInputElement;

        const presetDescInput = this.createElement("input", "ha-input", undefined, {
            id: "ha-rblend-preset-desc-input",
            type: "text",
            placeholder: "Preset description..."
        }) as HTMLInputElement;

        const savePresetBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "💾 Save JS Preset",
            {
                id: "ha-btn-save-rblend-preset",
                type: "button"
            }
        );
        savePresetBtn.addEventListener("click", () => {
            const code = blendIde.getCode();
            const check = this.state.engine.validateRasterBlendScript(code);
            if (!check.valid) {
                validateStatus.textContent = `✗ Error: ${check.error}`;
                validateStatus.style.color = "#ff5252";
                return;
            }
            const name = presetNameInput.value.trim() || "Custom JS Blend";
            const category = presetCatInput.value.trim() || "Custom";
            const description =
                presetDescInput.value.trim() || "Custom JavaScript raster keyframe blending preset.";
            const saved = this.state.configManager.saveRasterBlendPreset({
                name,
                category,
                description,
                code
            });
            if (this.state.hasOpenCanvas) {
                this.state.engine.saveCustomRasterBlendPreset(
                    this.state.canvasId,
                    {
                        id: saved.id,
                        name: saved.name,
                        category: saved.category,
                        description: saved.description,
                        code: saved.code
                    },
                    this.state.activeSharedObjectId
                );
            }
            populateBlendPresets(saved.id, "ALL");
            blendIde.setCode(saved.code);
            validateStatus.textContent = `✓ Saved preset "${saved.name}" in "${saved.category}"`;
            validateStatus.style.color = "#00e676";
            this.state.setStatus(`Saved custom raster blend JS preset "${saved.name}" (${saved.category}).`);
            this.state.notify();
        });

        saveRow.append(validateBtn, presetNameInput, presetCatInput, presetDescInput, savePresetBtn);

        body.append(row1, row2, presetField, codeField, saveRow);

        // Footer
        const footer = this.createElement("div", "ha-modal-footer");
        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Cancel", {
            type: "button"
        });
        cancelBtn.addEventListener("click", () => overlay.remove());

        const applyBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary",
            "✓ Apply Raster Blend",
            {
                id: "ha-btn-apply-rblend",
                type: "button"
            }
        );
        applyBtn.addEventListener("click", () => {
            if (!this.state.hasOpenCanvas || !layerSelect.value) {
                overlay.remove();
                return;
            }
            const code = blendIde.getCode();
            const check = this.state.engine.validateRasterBlendScript(code);
            if (!check.valid) {
                validateStatus.textContent = `✗ Error: ${check.error}`;
                validateStatus.style.color = "#ff5252";
                return;
            }
            const selectedPresetId = presetSelect.value || "crossfade";
            const chosenPreset = this.getAllRasterBlendPresets().find(p => p.id === selectedPresetId);
            const isModifiedCode = !chosenPreset || chosenPreset.code.trim() !== code.trim();
            const f = Math.max(0, Number(frameInput.value) || 0);
            const ef =
                endFrameInput.value.trim() !== ""
                    ? Math.max(f, Number(endFrameInput.value) || f)
                    : null;
            const tf =
                targetFrameInput.value.trim() !== ""
                    ? Math.max(0, Number(targetFrameInput.value) || 0)
                    : null;
            const curveCfg = this.resolveActiveCurveConfig();

            this.state.engine.configureRasterLayerBlend(this.state.canvasId, {
                layerId: layerSelect.value,
                frame: f,
                blendPresetId: selectedPresetId,
                customBlendCode: isModifiedCode ? code : null,
                targetLayerId: targetLayerSelect.value || null,
                targetFrame: tf,
                endFrame: ef,
                easing: curveCfg.easing,
                curveControlPoints: curveCfg.curveControlPoints,
                curvePresetId: curveCfg.curvePresetId,
                sharedObjectId: this.state.activeSharedObjectId
            });

            this.state.setStatus(
                `Configured raster keyframe blend "${selectedPresetId}" on layer "${layerSelect.value}" @ F${f}.`
            );
            this.state.notify();
            overlay.remove();
        });

        footer.append(cancelBtn, applyBtn);
        card.append(header, body, footer);
        overlay.appendChild(card);
        this.doc.body.appendChild(overlay);
    }
}
