import type { EditorSessionState } from "../../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./abstract-editor-tool-base.js";

/**
 * Intermediate abstract base class for all Inkscape/SVG geometric vector shape tools
 * (`rect`, `circle`, `ellipse`, `polygon`, `star`, `line`).
 * Shares drag-box calculation, live vector overlay preview, and `engine.drawShape()` execution.
 */
export abstract class AbstractVectorShapeTool extends AbstractEditorTool {
    public readonly category = "vector" as const;
    protected abstract readonly shapeKind: "rect" | "circle" | "ellipse" | "polygon" | "star" | "line";
    protected startCanvasPt: Point2D | null = null;
    protected currentCanvasPt: Point2D | null = null;

    public override getOptionFields(): ToolOptionField[] {
        const base: ToolOptionField[] = [
            { key: "primaryColor", label: "Fill", type: "color" },
            { key: "strokeColor", label: "Stroke", type: "color" },
            { key: "strokeWidth", label: "Stroke Width", type: "number", min: 0, max: 32, step: 1 },
            { key: "opacity", label: "Opacity", type: "number", min: 0.05, max: 1.0, step: 0.05 }
        ];
        if (this.shapeKind === "polygon" || this.shapeKind === "star") {
            base.push({ key: "shapeSides", label: "Points/Sides", type: "number", min: 3, max: 24, step: 1 });
        }
        if (this.shapeKind === "star") {
            base.push({ key: "starInnerRadius", label: "Inner Radius", type: "number", min: 4, max: 200, step: 2 });
        }
        return base;
    }

    public override onPointerDown(_state: EditorSessionState, canvasPt: Point2D): void {
        this.startCanvasPt = canvasPt;
        this.currentCanvasPt = canvasPt;
    }

    public override onPointerMove(_state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.startCanvasPt) return;
        this.currentCanvasPt = canvasPt;
    }

    public override onPointerUp(state: EditorSessionState, canvasPt: Point2D): void {
        if (!this.startCanvasPt) return;
        const p0 = state.canvasToActiveTargetCoords(this.startCanvasPt.x, this.startCanvasPt.y);
        const p1 = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        this.startCanvasPt = null;
        this.currentCanvasPt = null;

        const vectorLayer = state.resolveActiveLayer("vector");
        const opts = state.toolOptions;
        const minX = Math.min(p0.x, p1.x);
        const minY = Math.min(p0.y, p1.y);
        const w = Math.max(8, Math.abs(p1.x - p0.x));
        const h = Math.max(8, Math.abs(p1.y - p0.y));

        const spec: Record<string, any> = {
            kind: this.shapeKind,
            sharedObjectId: state.activeSharedObjectId,
            fill: opts.primaryColor,
            stroke: opts.strokeWidth > 0 ? opts.strokeColor : "none",
            strokeWidth: opts.strokeWidth,
            opacity: opts.opacity
        };

        if (this.shapeKind === "line") {
            spec.x = p0.x;
            spec.y = p0.y;
            spec.x2 = p1.x;
            spec.y2 = p1.y;
        } else if (this.shapeKind === "circle") {
            const r = Math.max(4, Math.round(Math.hypot(w, h) / 2));
            spec.x = Math.round(minX + w / 2);
            spec.y = Math.round(minY + h / 2);
            spec.r = r;
        } else if (this.shapeKind === "ellipse") {
            spec.x = Math.round(minX + w / 2);
            spec.y = Math.round(minY + h / 2);
            spec.rx = Math.max(4, Math.round(w / 2));
            spec.ry = Math.max(4, Math.round(h / 2));
        } else {
            spec.x = minX;
            spec.y = minY;
            spec.width = w;
            spec.height = h;
            spec.sides = opts.shapeSides;
            spec.innerRadius = opts.starInnerRadius;
        }

        const created = state.engine.drawShape(state.canvasId, vectorLayer?.id, spec);
        state.selectedObjectIds = [created.id];
        state.setStatus(`Created vector ${this.shapeKind} "${created.id}" on "${vectorLayer?.name}".`);
    }

    public override renderOverlay(state: EditorSessionState, ctx: CanvasRenderingContext2D): void {
        if (!this.startCanvasPt || !this.currentCanvasPt) return;
        const x = Math.min(this.startCanvasPt.x, this.currentCanvasPt.x);
        const y = Math.min(this.startCanvasPt.y, this.currentCanvasPt.y);
        const w = Math.abs(this.currentCanvasPt.x - this.startCanvasPt.x);
        const h = Math.abs(this.currentCanvasPt.y - this.startCanvasPt.y);

        ctx.save();
        ctx.strokeStyle = state.toolOptions.strokeColor || "#00d4ff";
        ctx.fillStyle = state.toolOptions.primaryColor + "55";
        ctx.lineWidth = Math.max(1, state.toolOptions.strokeWidth);
        ctx.setLineDash([4, 3]);

        if (this.shapeKind === "line") {
            ctx.beginPath();
            ctx.moveTo(this.startCanvasPt.x, this.startCanvasPt.y);
            ctx.lineTo(this.currentCanvasPt.x, this.currentCanvasPt.y);
            ctx.stroke();
        } else if (this.shapeKind === "circle" || this.shapeKind === "ellipse") {
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, Math.max(2, w / 2), Math.max(2, h / 2), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
    }
}
