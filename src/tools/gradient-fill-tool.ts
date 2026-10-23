import type { EditorSessionState } from "../state/editor-state.js";
import type { Point2D, ToolOptionField } from "./base/abstract-editor-tool-base.js";
import { AbstractRasterFillTool } from "./base/abstract-raster-fill-tool.js";

export class GradientFillTool extends AbstractRasterFillTool {
    public readonly id = "raster_gradient";
    public readonly label = "Gradient Fill";
    public readonly icon = "🌈";
    public readonly shortcut = "D";
    private startPt: Point2D | null = null;
    private currentPt: Point2D | null = null;

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "primaryColor", label: "Start Color", type: "color" },
            { key: "secondaryColor", label: "End Color", type: "color" },
            {
                key: "fillType",
                label: "Gradient Mode",
                type: "select",
                options: [
                    { value: "linear_gradient", label: "Linear Gradient" },
                    { value: "radial_gradient", label: "Radial Gradient" }
                ]
            }
        ];
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
        const p0 = state.canvasToActiveTargetCoords(this.startPt.x, this.startPt.y);
        const p1 = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const rasterLayer = state.resolveActiveLayer("raster");
        const gradMode = state.toolOptions.fillType === "radial_gradient" ? "radial_gradient" : "linear_gradient";

        state.engine.rasterFill(state.canvasId, rasterLayer?.id, {
            fillType: gradMode,
            x: p0.x,
            y: p0.y,
            x2: p1.x,
            y2: p1.y,
            radius: Math.max(4, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
            color: state.toolOptions.primaryColor,
            colorEnd: state.toolOptions.secondaryColor,
            frame: state.currentFrame > 0 ? state.currentFrame : undefined,
            sharedObjectId: state.activeSharedObjectId
        });

        this.startPt = null;
        this.currentPt = null;
        state.setStatus(`Applied ${gradMode.replace("_", " ")} on "${rasterLayer?.name}".`);
    }

    public override renderOverlay(_state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        if (!this.startPt || !this.currentPt) return;
        ctx.save();
        ctx.strokeStyle = "#00ffcc";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.startPt.x, this.startPt.y);
        ctx.lineTo(this.currentPt.x, this.currentPt.y);
        ctx.stroke();
        ctx.restore();
    }
}
