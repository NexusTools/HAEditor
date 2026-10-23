import type { EditorSessionState } from "../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./base/abstract-editor-tool-base.js";

/**
 * Vector Deform / Curve Bending Tool (`VectorDeformTool`, `id = "vector_deform"`, shortcut `"K"`).
 * - Dragging anywhere on the segment of a line (or path/polygon edge) bends/curves it while keeping both
 *   endpoints pinned at their current positions.
 * - Dragging either endpoint of a line (or path/polygon vertex node) moves that endpoint while retaining the curve.
 * - Supports keyframe curve animation when `currentFrame > 0`.
 */
export class VectorDeformTool extends AbstractEditorTool {
    public readonly id = "vector_deform";
    public readonly label = "Deform / Bend Curve (Keep Ends or Retain Curve)";
    public readonly icon = "〰️";
    public readonly shortcut = "K";
    public readonly category = "vector" as const;

    private activeObjId: string | null = null;
    private deformMode: "bend_segment" | "move_endpoint" = "bend_segment";
    private pointIndex = 0;
    private segmentIndex = 0;
    private grabParamT = 0.5;
    private hasStartedGroup = false;

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "strokeColor", label: "Stroke", type: "color" },
            { key: "strokeWidth", label: "Stroke Width", type: "number", min: 1, max: 32, step: 1 }
        ];
    }

    private findDeformTarget(state: EditorSessionState, localPt: Point2D): {
        obj: any;
        evalObj: any;
        mode: "bend_segment" | "move_endpoint";
        pointIndex: number;
        segmentIndex: number;
        t: number;
    } | null {
        const cState = state.getCanvasState();
        const layers = state.getActiveContainerLayers();

        // Check selected object first, then any vector object on visible unlocked vector layers
        const candidates: any[] = [];
        for (let lIdx = layers.length - 1; lIdx >= 0; lIdx--) {
            const l = layers[lIdx];
            if (!l.visible || l.locked || l.type !== "vector") continue;
            for (let oIdx = l.objects.length - 1; oIdx >= 0; oIdx--) {
                const rawObj = l.objects[oIdx];
                if (state.selectedObjectIds.includes(rawObj.id)) {
                    candidates.unshift({ layer: l, rawObj });
                } else {
                    candidates.push({ layer: l, rawObj });
                }
            }
        }

        for (const { layer, rawObj } of candidates) {
            const evalObj = state.engine.resolveAnimatedObject(cState, rawObj, state.currentFrame, state.activeSharedObjectId);
            if (evalObj.kind === "line") {
                const x1 = evalObj.x ?? 0;
                const y1 = evalObj.y ?? 0;
                const x2 = evalObj.x2 ?? (x1 + (evalObj.width ?? 100));
                const y2 = evalObj.y2 ?? (y1 + (evalObj.height ?? 100));

                // 1. Check endpoints first (within 10px)
                if (Math.hypot(localPt.x - x1, localPt.y - y1) <= 10) {
                    state.activeLayerId = layer.id;
                    return { obj: rawObj, evalObj, mode: "move_endpoint", pointIndex: 0, segmentIndex: 0, t: 0 };
                }
                if (Math.hypot(localPt.x - x2, localPt.y - y2) <= 10) {
                    state.activeLayerId = layer.id;
                    return { obj: rawObj, evalObj, mode: "move_endpoint", pointIndex: 1, segmentIndex: 0, t: 1 };
                }

                // 2. Check distance along the line or existing quadratic curve
                let bestDist = Infinity;
                let bestT = 0.5;
                const steps = 24;
                for (let s = 1; s < steps; s++) {
                    const t = s / steps;
                    const mt = 1 - t;
                    const px =
                        evalObj.cx !== undefined
                            ? mt * mt * x1 + 2 * mt * t * evalObj.cx + t * t * x2
                            : x1 + (x2 - x1) * t;
                    const py =
                        evalObj.cy !== undefined
                            ? mt * mt * y1 + 2 * mt * t * evalObj.cy + t * t * y2
                            : y1 + (y2 - y1) * t;
                    const d = Math.hypot(localPt.x - px, localPt.y - py);
                    if (d < bestDist) {
                        bestDist = d;
                        bestT = t;
                    }
                }
                if (bestDist <= 14 || state.selectedObjectIds.includes(rawObj.id)) {
                    state.activeLayerId = layer.id;
                    return {
                        obj: rawObj,
                        evalObj,
                        mode: "bend_segment",
                        pointIndex: 0,
                        segmentIndex: 0,
                        t: Math.max(0.2, Math.min(0.8, bestT))
                    };
                }
            } else if (evalObj.points && evalObj.points.length >= 2) {
                const pts = evalObj.points;
                for (let i = 0; i < pts.length; i++) {
                    if (Math.hypot(localPt.x - pts[i].x, localPt.y - pts[i].y) <= 10) {
                        state.activeLayerId = layer.id;
                        return { obj: rawObj, evalObj, mode: "move_endpoint", pointIndex: i, segmentIndex: i, t: 0 };
                    }
                }
                const segCount = evalObj.closed ? pts.length : pts.length - 1;
                for (let s = 0; s < segCount; s++) {
                    const p0 = pts[s];
                    const p1 = pts[(s + 1) % pts.length];
                    const dx = p1.x - p0.x;
                    const dy = p1.y - p0.y;
                    const lenSq = dx * dx + dy * dy;
                    const projT = lenSq > 0 ? Math.max(0.15, Math.min(0.85, ((localPt.x - p0.x) * dx + (localPt.y - p0.y) * dy) / lenSq)) : 0.5;
                    const cx = p0.x + dx * projT;
                    const cy = p0.y + dy * projT;
                    if (Math.hypot(localPt.x - cx, localPt.y - cy) <= 12) {
                        state.activeLayerId = layer.id;
                        return { obj: rawObj, evalObj, mode: "bend_segment", pointIndex: s, segmentIndex: s, t: projT };
                    }
                }
            } else if (evalObj.kind === "rect") {
                const bbox = state.engine.computeObjectBoundingBox(evalObj, cState);
                if (
                    localPt.x >= bbox.x - 8 &&
                    localPt.x <= bbox.x + bbox.width + 8 &&
                    localPt.y >= bbox.y - 8 &&
                    localPt.y <= bbox.y + bbox.height + 8
                ) {
                    state.activeLayerId = layer.id;
                    return { obj: rawObj, evalObj, mode: "bend_segment", pointIndex: 0, segmentIndex: 0, t: 0.5 };
                }
            }
        }
        return null;
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const target = this.findDeformTarget(state, localPt);
        if (!target) {
            state.setStatus("Deform Tool: Click or drag on a line/path segment to bend it, or drag an endpoint to move it while retaining the curve.");
            return;
        }
        state.selectedObjectIds = [target.obj.id];
        this.activeObjId = target.obj.id;
        this.deformMode = target.mode;
        this.pointIndex = target.pointIndex;
        this.segmentIndex = target.segmentIndex;
        this.grabParamT = target.t;
        this.hasStartedGroup = false;
        state.notify();
    }

    public override onPointerMove(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.activeObjId) return;
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);

        if (!this.hasStartedGroup) {
            this.hasStartedGroup = true;
            state.setEditingObject(this.activeObjId, true);
            state.engine.beginUndoGroup(
                state.canvasId,
                this.deformMode === "bend_segment" ? "Curve Vector Segment" : "Move Endpoint (Retain Curve)"
            );
        }

        const updated = state.engine.deformVectorObject(state.canvasId, this.activeObjId, {
            mode: this.deformMode,
            pointIndex: this.pointIndex,
            segmentIndex: this.segmentIndex,
            t: this.grabParamT,
            targetX: localPt.x,
            targetY: localPt.y,
            sharedObjectId: state.activeSharedObjectId
        });

        // If on a non-zero animation frame, record keyframes for deformed properties
        if (state.currentFrame > 0) {
            if (updated.kind === "line") {
                const props: Record<string, any> = {};
                if (updated.cx !== undefined && updated.cy !== undefined) {
                    props.cx = updated.cx;
                    props.cy = updated.cy;
                }
                if (this.deformMode === "move_endpoint") {
                    props[this.pointIndex === 0 ? "x" : "x2"] =
                        (this.pointIndex === 0 ? updated.x : updated.x2) ?? 0;
                    props[this.pointIndex === 0 ? "y" : "y2"] =
                        (this.pointIndex === 0 ? updated.y : updated.y2) ?? 0;
                }
                if (Object.keys(props).length > 0) {
                    state.engine.setKeyframe(state.canvasId, {
                        targetId: updated.id,
                        frame: state.currentFrame,
                        sharedObjectId: state.activeSharedObjectId,
                        properties: props
                    });
                }
            } else if (updated.d) {
                state.engine.setKeyframe(state.canvasId, {
                    targetId: updated.id,
                    frame: state.currentFrame,
                    sharedObjectId: state.activeSharedObjectId,
                    properties: { d: updated.d }
                });
            }
        }

        state.notify();
    }

    public override onPointerUp(state: EditorSessionState): void {
        if (this.hasStartedGroup) {
            this.hasStartedGroup = false;
            state.setEditingObject(undefined, false);
            state.engine.endUndoGroup(state.canvasId, "Deform Vector");
            state.setStatus(
                this.deformMode === "bend_segment"
                    ? `Curved vector "${this.activeObjId}" keeping endpoints pinned.`
                    : `Moved endpoint on "${this.activeObjId}" while retaining curve.`
            );
            state.notify();
        } else if (state.editingObjectId) {
            state.setEditingObject(undefined, false);
        }
        this.activeObjId = null;
    }

    public override renderOverlay(state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        if (state.selectedObjectIds.length === 0) return;
        const selId = state.selectedObjectIds[0];
        const cState = state.getCanvasState();
        const layers = state.getActiveContainerLayers();
        let rawObj: any = null;
        for (const l of layers) {
            if (l.type !== "vector") continue;
            const found = l.objects.find(o => o.id === selId);
            if (found) {
                rawObj = found;
                break;
            }
        }
        if (!rawObj) return;
        const obj = state.engine.resolveAnimatedObject(cState, rawObj, state.currentFrame, state.activeSharedObjectId);

        ctx.save();
        if (obj.kind === "line") {
            const x1 = obj.x ?? 0;
            const y1 = obj.y ?? 0;
            const x2 = obj.x2 ?? (x1 + (obj.width ?? 100));
            const y2 = obj.y2 ?? (y1 + (obj.height ?? 100));
            const cx = obj.cx ?? (x1 + x2) / 2;
            const cy = obj.cy ?? (y1 + y2) / 2;
            const midOnCurveX = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
            const midOnCurveY = 0.25 * y1 + 0.5 * cy + 0.25 * y2;

            // Guide lines to control point
            ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(cx, cy);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Endpoint square handles
            ctx.fillStyle = "#00d4ff";
            ctx.strokeStyle = "#11131c";
            ctx.lineWidth = 1.5;
            ctx.fillRect(x1 - 5, y1 - 5, 10, 10);
            ctx.strokeRect(x1 - 5, y1 - 5, 10, 10);
            ctx.fillRect(x2 - 5, y2 - 5, 10, 10);
            ctx.strokeRect(x2 - 5, y2 - 5, 10, 10);

            // Curve bend diamond handle at t = 0.5 on the curve
            ctx.fillStyle = "#f59e0b";
            ctx.beginPath();
            ctx.moveTo(midOnCurveX, midOnCurveY - 6);
            ctx.lineTo(midOnCurveX + 6, midOnCurveY);
            ctx.lineTo(midOnCurveX, midOnCurveY + 6);
            ctx.lineTo(midOnCurveX - 6, midOnCurveY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (obj.points && obj.points.length >= 2) {
            ctx.fillStyle = "#00d4ff";
            ctx.strokeStyle = "#11131c";
            ctx.lineWidth = 1.2;
            for (const pt of obj.points) {
                ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
                ctx.strokeRect(pt.x - 4, pt.y - 4, 8, 8);
            }
        }
        ctx.restore();
    }
}
