import type { EditorSessionState } from "../../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./abstract-editor-tool-base.js";

/**
 * Intermediate abstract base class for GIMP selection mask tools (`rect`, `ellipse`).
 */
export abstract class AbstractSelectionTool extends AbstractEditorTool {
    public readonly category = "selection" as const;
    protected abstract readonly selectionMode: "rect" | "ellipse";
    protected startPt: Point2D | null = null;
    protected currentPt: Point2D | null = null;

    public override getOptionFields(): ToolOptionField[] {
        return [];
    }

    public override onPointerDown(_state: EditorSessionState, canvasPt: Point2D): void {
        this.startPt = canvasPt;
        this.currentPt = canvasPt;
    }

    public override onPointerMove(_state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.startPt) return;
        this.currentPt = canvasPt;
    }

    public override onPointerUp(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.startPt) return;
        const x = Math.min(this.startPt.x, canvasPt.x);
        const y = Math.min(this.startPt.y, canvasPt.y);
        const width = Math.max(2, Math.abs(canvasPt.x - this.startPt.x));
        const height = Math.max(2, Math.abs(canvasPt.y - this.startPt.y));
        state.engine.rasterSelection(state.canvasId, this.selectionMode, { x, y, width, height });
        this.startPt = null;
        this.currentPt = null;
        state.setStatus(`Created ${this.selectionMode} selection (${Math.round(width)}x${Math.round(height)}).`);
    }

    public override renderOverlay(_state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        if (!this.startPt || !this.currentPt) return;
        const x = Math.min(this.startPt.x, this.currentPt.x);
        const y = Math.min(this.startPt.y, this.currentPt.y);
        const w = Math.abs(this.currentPt.x - this.startPt.x);
        const h = Math.abs(this.currentPt.y - this.startPt.y);
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        if (this.selectionMode === "rect") {
            ctx.strokeRect(x, y, w, h);
        } else {
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
}
