import type { EditorSessionState } from "../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./base/abstract-editor-tool-base.js";

export class VectorPathTool extends AbstractEditorTool {
    public readonly id = "vector_path";
    public readonly label = "Draw Path / Polygon Curve";
    public readonly icon = "✒️";
    public readonly shortcut = "P";
    public readonly category = "vector" as const;

    private canvasPts: Point2D[] = [];
    private targetPts: Point2D[] = [];
    private isDrawing = false;

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "primaryColor", label: "Fill", type: "color" },
            { key: "strokeColor", label: "Stroke", type: "color" },
            { key: "strokeWidth", label: "Stroke Width", type: "number", min: 1, max: 32, step: 1 },
            { key: "closedPath", label: "Close Path", type: "boolean" }
        ];
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D): void {
        this.isDrawing = true;
        this.canvasPts = [canvasPt];
        this.targetPts = [state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y)];
    }

    public override onPointerMove(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.isDrawing) return;
        const last = this.canvasPts[this.canvasPts.length - 1];
        if (!last || Math.hypot(canvasPt.x - last.x, canvasPt.y - last.y) >= 6) {
            this.canvasPts.push(canvasPt);
            this.targetPts.push(state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y));
        }
    }

    public override onPointerUp(state: EditorSessionState): void {
        if (!this.isDrawing || this.targetPts.length < 2) {
            this.isDrawing = false;
            this.canvasPts = [];
            this.targetPts = [];
            return;
        }
        this.isDrawing = false;
        const vectorLayer = state.resolveActiveLayer("vector");
        const opts = state.toolOptions;
        const created = state.engine.drawPath(state.canvasId, vectorLayer?.id, {
            sharedObjectId: state.activeSharedObjectId,
            points: this.targetPts,
            closed: opts.closedPath,
            fill: opts.closedPath ? opts.primaryColor : "none",
            stroke: opts.strokeColor,
            strokeWidth: opts.strokeWidth,
            opacity: opts.opacity
        });
        this.canvasPts = [];
        this.targetPts = [];
        state.selectedObjectIds = [created.id];
        state.setStatus(`Created vector path "${created.id}".`);
    }

    public override renderOverlay(state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        if (!this.isDrawing || this.canvasPts.length < 2) return;
        ctx.save();
        ctx.strokeStyle = state.toolOptions.strokeColor;
        ctx.lineWidth = state.toolOptions.strokeWidth;
        ctx.beginPath();
        this.canvasPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
    }
}
