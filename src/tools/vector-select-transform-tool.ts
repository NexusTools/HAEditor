import type { EditorSessionState } from "../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./base/abstract-editor-tool-base.js";

/**
 * Vector Select, Move, Skew, Rotate, & In-Place Shared Object / Text Entry Tool.
 * - Click to select any vector shape or `<ObjectRef>` instance (Shift+Click to multi-select for Boolean Ops).
 * - Drag inside to move the selected object; drag the top/bottom diamond handles to skew horizontally (`skewX`),
 *   left/right diamond handles to skew vertically (`skewY`), or top circle handle to rotate (`rotation`).
 * - Double-click any `<ObjectRef>` instance on the Main Canvas to enter **In-Place Shared Object Editing**.
 * - Double-click any `text` object to edit its text in-place on the canvas while retaining its font and style.
 */
export class VectorSelectTransformTool extends AbstractEditorTool {
    public readonly id = "vector_select";
    public readonly label = "Select / Move / Skew / Edit In-Place";
    public readonly icon = "↖";
    public readonly shortcut = "V";
    public readonly category = "vector" as const;

    private draggingObjId: string | null = null;
    private dragMode: "move" | "skew_x" | "skew_y" | "rotate" = "move";
    private dragStartPt: Point2D | null = null;
    private origX = 0;
    private origY = 0;
    private origX2 = 0;
    private origY2 = 0;
    private origCx: number | undefined = undefined;
    private origCy: number | undefined = undefined;
    private origSkewX = 0;
    private origSkewY = 0;
    private origRotation = 0;
    private pivotPt: Point2D = { x: 0, y: 0 };
    private hasStartedDragGroup = false;

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "primaryColor", label: "Fill / Override", type: "color" },
            { key: "strokeColor", label: "Stroke / Override", type: "color" },
            { key: "strokeWidth", label: "Stroke Width", type: "number", min: 0, max: 32, step: 1 }
        ];
    }

    private findTopObjectAt(state: EditorSessionState, localPt: Point2D) {
        const cState = state.getCanvasState();
        const layers = state.getActiveContainerLayers();
        for (let lIdx = layers.length - 1; lIdx >= 0; lIdx--) {
            const layer = layers[lIdx];
            if (!layer.visible || layer.locked || layer.type !== "vector") continue;
            for (let oIdx = layer.objects.length - 1; oIdx >= 0; oIdx--) {
                const rawObj = layer.objects[oIdx];
                const obj = state.engine.resolveAnimatedObject(cState, rawObj, state.currentFrame, state.activeSharedObjectId);
                const bbox = state.engine.computeObjectBoundingBox(obj, cState);
                if (
                    localPt.x >= bbox.x - 6 &&
                    localPt.x <= bbox.x + bbox.width + 6 &&
                    localPt.y >= bbox.y - 6 &&
                    localPt.y <= bbox.y + bbox.height + 6
                ) {
                    return { layer, obj: rawObj, evalObj: obj, bbox };
                }
            }
        }
        return null;
    }

    private findSelectedObject(state: EditorSessionState) {
        if (state.selectedObjectIds.length === 0) return null;
        const selId = state.selectedObjectIds[0];
        const cState = state.getCanvasState();
        const layers = state.getActiveContainerLayers();
        for (const layer of layers) {
            if (layer.type !== "vector") continue;
            const rawObj = layer.objects.find(o => o.id === selId);
            if (rawObj) {
                const evalObj = state.engine.resolveAnimatedObject(cState, rawObj, state.currentFrame, state.activeSharedObjectId);
                const bbox = state.engine.computeObjectBoundingBox(evalObj, cState);
                return { layer, obj: rawObj, evalObj, bbox };
            }
        }
        return null;
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D, ev: MouseEvent): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);

        // Check if clicking on a Skew or Rotation handle of the currently selected object
        const currentSel = this.findSelectedObject(state);
        if (currentSel) {
            const b = currentSel.bbox;
            const midX = b.x + b.width / 2;
            const midY = b.y + b.height / 2;
            const rotHandle = { x: midX, y: b.y - 18 };
            const skewTopHandle = { x: midX, y: b.y };
            const skewBottomHandle = { x: midX, y: b.y + b.height };
            const skewLeftHandle = { x: b.x, y: midY };
            const skewRightHandle = { x: b.x + b.width, y: midY };

            if (Math.hypot(localPt.x - rotHandle.x, localPt.y - rotHandle.y) <= 9) {
                this.draggingObjId = currentSel.obj.id;
                this.dragMode = "rotate";
                this.dragStartPt = localPt;
                this.origRotation = currentSel.evalObj.rotation ?? 0;
                this.pivotPt = { x: midX, y: midY };
                this.hasStartedDragGroup = false;
                return;
            }
            if (
                Math.hypot(localPt.x - skewTopHandle.x, localPt.y - skewTopHandle.y) <= 8 ||
                Math.hypot(localPt.x - skewBottomHandle.x, localPt.y - skewBottomHandle.y) <= 8
            ) {
                this.draggingObjId = currentSel.obj.id;
                this.dragMode = "skew_x";
                this.dragStartPt = localPt;
                this.origSkewX = currentSel.evalObj.skewX ?? 0;
                this.pivotPt = { x: midX, y: midY };
                this.hasStartedDragGroup = false;
                return;
            }
            if (
                Math.hypot(localPt.x - skewLeftHandle.x, localPt.y - skewLeftHandle.y) <= 8 ||
                Math.hypot(localPt.x - skewRightHandle.x, localPt.y - skewRightHandle.y) <= 8
            ) {
                this.draggingObjId = currentSel.obj.id;
                this.dragMode = "skew_y";
                this.dragStartPt = localPt;
                this.origSkewY = currentSel.evalObj.skewY ?? 0;
                this.pivotPt = { x: midX, y: midY };
                this.hasStartedDragGroup = false;
                return;
            }
        }

        const hit = this.findTopObjectAt(state, localPt);

        if (hit) {
            state.activeLayerId = hit.layer.id;
            if (ev.shiftKey) {
                if (!state.selectedObjectIds.includes(hit.obj.id)) {
                    state.selectedObjectIds.push(hit.obj.id);
                }
            } else {
                state.selectedObjectIds = [hit.obj.id];
            }
            this.draggingObjId = hit.obj.id;
            this.dragMode = "move";
            this.dragStartPt = localPt;
            this.origX = hit.evalObj.x ?? hit.bbox.x;
            this.origY = hit.evalObj.y ?? hit.bbox.y;
            this.origX2 = hit.evalObj.x2 ?? (this.origX + hit.bbox.width);
            this.origY2 = hit.evalObj.y2 ?? (this.origY + hit.bbox.height);
            this.origCx = hit.evalObj.cx;
            this.origCy = hit.evalObj.cy;
            this.hasStartedDragGroup = false;
            state.setStatus(
                hit.obj.kind === "ref"
                    ? `Selected Shared Object Instance "${hit.obj.id}" -> "${hit.obj.refId}" (Double-click to edit In-Place).`
                    : hit.obj.kind === "text"
                      ? `Selected text "${hit.obj.text || hit.obj.id}" (Double-click to edit text in-place).`
                      : `Selected vector ${hit.obj.kind} "${hit.obj.id}" (Drag edge diamonds to Skew, top handle to Rotate, or press K to Deform).`
            );
        } else {
            state.selectedObjectIds = [];
            this.draggingObjId = null;
            this.hasStartedDragGroup = false;
            state.notify();
        }
    }

    public override onPointerMove(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.draggingObjId || !this.dragStartPt) return;
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const dx = localPt.x - this.dragStartPt.x;
        const dy = localPt.y - this.dragStartPt.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

        if (!this.hasStartedDragGroup) {
            this.hasStartedDragGroup = true;
            state.setEditingObject(this.draggingObjId, true);
            const actionLabel =
                this.dragMode === "skew_x" || this.dragMode === "skew_y"
                    ? "Skew Object"
                    : this.dragMode === "rotate"
                      ? "Rotate Object"
                      : "Move Object";
            state.engine.beginUndoGroup(state.canvasId, actionLabel);
        }

        if (this.dragMode === "skew_x") {
            const newSkewX = Math.max(-75, Math.min(75, Math.round(this.origSkewX + dx * 0.5)));
            state.engine.modifyObject(state.canvasId, this.draggingObjId, { skewX: newSkewX });
            if (state.currentFrame > 0) {
                state.engine.setKeyframe(state.canvasId, {
                    targetId: this.draggingObjId,
                    frame: state.currentFrame,
                    sharedObjectId: state.activeSharedObjectId,
                    properties: { skewX: newSkewX }
                });
            }
        } else if (this.dragMode === "skew_y") {
            const newSkewY = Math.max(-75, Math.min(75, Math.round(this.origSkewY + dy * 0.5)));
            state.engine.modifyObject(state.canvasId, this.draggingObjId, { skewY: newSkewY });
            if (state.currentFrame > 0) {
                state.engine.setKeyframe(state.canvasId, {
                    targetId: this.draggingObjId,
                    frame: state.currentFrame,
                    sharedObjectId: state.activeSharedObjectId,
                    properties: { skewY: newSkewY }
                });
            }
        } else if (this.dragMode === "rotate") {
            const startAng = Math.atan2(this.dragStartPt.y - this.pivotPt.y, this.dragStartPt.x - this.pivotPt.x);
            const curAng = Math.atan2(localPt.y - this.pivotPt.y, localPt.x - this.pivotPt.x);
            const deltaDeg = ((curAng - startAng) * 180) / Math.PI;
            const newRot = Math.round(this.origRotation + deltaDeg);
            state.engine.modifyObject(state.canvasId, this.draggingObjId, { rotation: newRot });
            if (state.currentFrame > 0) {
                state.engine.setKeyframe(state.canvasId, {
                    targetId: this.draggingObjId,
                    frame: state.currentFrame,
                    sharedObjectId: state.activeSharedObjectId,
                    properties: { rotation: newRot }
                });
            }
        } else {
            const nx = Math.round(this.origX + dx);
            const ny = Math.round(this.origY + dy);
            const sel = this.findSelectedObject(state);
            const updates: Record<string, any> = { x: nx, y: ny };
            if (sel && sel.obj.kind === "line") {
                updates.x2 = Math.round(this.origX2 + dx);
                updates.y2 = Math.round(this.origY2 + dy);
                if (this.origCx !== undefined && this.origCy !== undefined) {
                    updates.cx = Math.round(this.origCx + dx);
                    updates.cy = Math.round(this.origCy + dy);
                }
            }
            state.engine.modifyObject(state.canvasId, this.draggingObjId, updates);
            if (state.currentFrame > 0) {
                state.engine.setKeyframe(state.canvasId, {
                    targetId: this.draggingObjId,
                    frame: state.currentFrame,
                    sharedObjectId: state.activeSharedObjectId,
                    properties: { x: nx, y: ny }
                });
            }
        }
        state.notify();
    }

    public override onPointerUp(state: EditorSessionState): void {
        if (this.hasStartedDragGroup) {
            this.hasStartedDragGroup = false;
            state.setEditingObject(undefined, false);
            state.engine.endUndoGroup(state.canvasId, "Transform Object");
            state.notify();
        } else if (state.editingObjectId) {
            state.setEditingObject(undefined, false);
        }
        this.draggingObjId = null;
        this.dragStartPt = null;
    }

    public override onDoubleClick(state: EditorSessionState, canvasPt: Point2D): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const hit = this.findTopObjectAt(state, localPt);
        if (!hit) return;
        if (hit.obj.kind === "ref" && hit.obj.refId) {
            state.enterInPlaceSharedObjectEdit(hit.obj.refId, hit.obj.id);
        } else if (hit.obj.kind === "text") {
            state.selectedObjectIds = [hit.obj.id];
            state.requestInPlaceTextEdit(hit.obj.id);
        }
    }

    public override renderOverlay(state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        const sel = this.findSelectedObject(state);
        if (!sel) return;
        const b = sel.bbox;
        const midX = b.x + b.width / 2;
        const midY = b.y + b.height / 2;
        const rotHandle = { x: midX, y: b.y - 18 };

        ctx.save();
        // Rotation stem & circle handle
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(midX, b.y);
        ctx.lineTo(rotHandle.x, rotHandle.y);
        ctx.stroke();

        ctx.fillStyle = "#0ea5e9";
        ctx.beginPath();
        ctx.arc(rotHandle.x, rotHandle.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Skew diamond handles on the 4 edge midpoints
        const drawDiamond = (cx: number, cy: number) => {
            ctx.fillStyle = "#f59e0b";
            ctx.strokeStyle = "#11131c";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy - 4.5);
            ctx.lineTo(cx + 4.5, cy);
            ctx.lineTo(cx, cy + 4.5);
            ctx.lineTo(cx - 4.5, cy);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };
        drawDiamond(midX, b.y);
        drawDiamond(midX, b.y + b.height);
        drawDiamond(b.x, midY);
        drawDiamond(b.x + b.width, midY);
        ctx.restore();
    }
}
