import type { EditorSessionState } from "../../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./abstract-editor-tool-base.js";

/**
 * Intermediate abstract base class for all GIMP raster stroke tools (`brush`, `pencil`, `airbrush`, `eraser`).
 * Shares path point collection, live brush stroke preview on the overlay canvas, and `engine.rasterStroke()` commit.
 */
export abstract class AbstractRasterStrokeTool extends AbstractEditorTool {
    public readonly category = "raster" as const;
    protected abstract readonly strokeMode: "brush" | "pencil" | "airbrush" | "eraser";
    protected isDrawing = false;
    protected canvasPoints: Point2D[] = [];
    protected targetPoints: Point2D[] = [];

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "primaryColor", label: "Color", type: "color" },
            { key: "brushSize", label: "Size (px)", type: "number", min: 1, max: 64, step: 1 },
            { key: "brushHardness", label: "Hardness", type: "number", min: 0.1, max: 1.0, step: 0.05 },
            { key: "opacity", label: "Opacity", type: "number", min: 0.05, max: 1.0, step: 0.05 }
        ];
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D): void {
        this.isDrawing = true;
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        this.canvasPoints = [canvasPt];
        this.targetPoints = [localPt];
    }

    public override onPointerMove(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.isDrawing) return;
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        this.canvasPoints.push(canvasPt);
        this.targetPoints.push(localPt);
    }

    public override onPointerUp(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        this.targetPoints.push(localPt);

        const rasterLayer = state.resolveActiveLayer("raster");
        const opts = state.toolOptions;
        state.engine.rasterStroke(state.canvasId, rasterLayer?.id, {
            tool: this.strokeMode,
            points: this.targetPoints,
            color: opts.primaryColor,
            size: opts.brushSize,
            hardness: opts.brushHardness,
            opacity: opts.opacity,
            frame: state.currentFrame > 0 ? state.currentFrame : undefined,
            sharedObjectId: state.activeSharedObjectId
        });

        this.canvasPoints = [];
        this.targetPoints = [];
        state.setStatus(`Painted ${this.label} stroke on layer "${rasterLayer?.name || "Raster"}".`);
    }

    public override renderOverlay(state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        if (!this.isDrawing || this.canvasPoints.length === 0) return;
        ctx.save();
        ctx.strokeStyle = this.strokeMode === "eraser" ? "rgba(255,255,255,0.8)" : state.toolOptions.primaryColor;
        ctx.lineWidth = state.toolOptions.brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        this.canvasPoints.forEach((p, idx) => {
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
    }
}
