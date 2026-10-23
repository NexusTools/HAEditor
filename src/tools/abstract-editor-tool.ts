import type { EditorSessionState } from "../state/editor-state.js";

export interface Point2D {
    x: number;
    y: number;
}

export interface ToolOptionField {
    key: string;
    label: string;
    type: "number" | "color" | "text" | "boolean" | "select";
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string; label: string }>;
}

/**
 * Root abstract base class for all interactive tools in `workspace/haeditor`.
 * Shares target container resolution (Main Canvas vs. Shared Object), coordinate transformation
 * for In-Place Shared Object editing, and overlay preview rendering hooks.
 */
export abstract class AbstractEditorTool {
    public abstract readonly id: string;
    public abstract readonly label: string;
    public abstract readonly icon: string;
    public abstract readonly shortcut: string;
    public abstract readonly category: "vector" | "raster" | "selection";

    public abstract getOptionFields(): ToolOptionField[];

    public onPointerDown(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}
    public onPointerMove(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}
    public onPointerUp(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}
    public onDoubleClick(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}

    public renderOverlay(_state: EditorSessionState, _ctx: CanvasRenderingContext2D): void {}
}

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

export class BrushTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_brush";
    public readonly label = "Paintbrush";
    public readonly icon = "🖌️";
    public readonly shortcut = "B";
    protected readonly strokeMode = "brush" as const;
}

export class PencilTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_pencil";
    public readonly label = "Pencil (Hard Edge)";
    public readonly icon = "✏️";
    public readonly shortcut = "N";
    protected readonly strokeMode = "pencil" as const;
}

export class AirbrushTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_airbrush";
    public readonly label = "Airbrush (Soft)";
    public readonly icon = "💨";
    public readonly shortcut = "A";
    protected readonly strokeMode = "airbrush" as const;
}

export class EraserTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_eraser";
    public readonly label = "Eraser";
    public readonly icon = "🧽";
    public readonly shortcut = "E";
    protected readonly strokeMode = "eraser" as const;
}

/**
 * Intermediate abstract base class for GIMP raster fill tools (Flood Bucket Fill & Linear/Radial Gradients).
 */
export abstract class AbstractRasterFillTool extends AbstractEditorTool {
    public readonly category = "raster" as const;
}

export class FloodFillTool extends AbstractRasterFillTool {
    public readonly id = "raster_flood_fill";
    public readonly label = "Bucket Flood Fill";
    public readonly icon = "🪣";
    public readonly shortcut = "G";

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "primaryColor", label: "Fill Color", type: "color" },
            { key: "fillTolerance", label: "Tolerance", type: "number", min: 0, max: 255, step: 1 }
        ];
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const rasterLayer = state.resolveActiveLayer("raster");
        const res = state.engine.rasterFill(state.canvasId, rasterLayer?.id, {
            fillType: "flood",
            x: localPt.x,
            y: localPt.y,
            color: state.toolOptions.primaryColor,
            tolerance: state.toolOptions.fillTolerance,
            frame: state.currentFrame > 0 ? state.currentFrame : undefined,
            sharedObjectId: state.activeSharedObjectId
        });
        state.setStatus(`Bucket filled ${res.pixelsFilled} pixels on "${rasterLayer?.name}".`);
    }
}

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

export class RectSelectTool extends AbstractSelectionTool {
    public readonly id = "select_rect";
    public readonly label = "Rectangle Select";
    public readonly icon = "⬚";
    public readonly shortcut = "R";
    protected readonly selectionMode = "rect" as const;
}

export class EllipseSelectTool extends AbstractSelectionTool {
    public readonly id = "select_ellipse";
    public readonly label = "Ellipse Select";
    public readonly icon = "◯";
    public readonly shortcut = "C";
    protected readonly selectionMode = "ellipse" as const;
}

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

export class RectShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_rect";
    public readonly label = "Draw Rectangle";
    public readonly icon = "▭";
    public readonly shortcut = "U";
    protected readonly shapeKind = "rect" as const;
}

export class CircleShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_circle";
    public readonly label = "Draw Circle";
    public readonly icon = "⚪";
    public readonly shortcut = "O";
    protected readonly shapeKind = "circle" as const;
}

export class EllipseShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_ellipse";
    public readonly label = "Draw Ellipse";
    public readonly icon = "⬭";
    public readonly shortcut = "L";
    protected readonly shapeKind = "ellipse" as const;
}

export class PolygonShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_polygon";
    public readonly label = "Draw Polygon";
    public readonly icon = "⬡";
    public readonly shortcut = "Y";
    protected readonly shapeKind = "polygon" as const;
}

export class StarShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_star";
    public readonly label = "Draw Star";
    public readonly icon = "⭐";
    public readonly shortcut = "S";
    protected readonly shapeKind = "star" as const;
}

export class LineShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_line";
    public readonly label = "Draw Line";
    public readonly icon = "╱";
    public readonly shortcut = "I";
    protected readonly shapeKind = "line" as const;
}

/**
 * Vector Select, Move, Transform, & In-Place Shared Object Entry Tool.
 * - Click to select any vector shape or `<ObjectRef>` instance (Shift+Click to multi-select for Boolean Ops).
 * - Drag to move the selected object.
 * - Double-click any `<ObjectRef>` instance on the Main Canvas to enter **In-Place Shared Object Editing**
 *   (darkening everything outside the shared object instance while letting you edit its layers directly in place!).
 */
export class VectorSelectTransformTool extends AbstractEditorTool {
    public readonly id = "vector_select";
    public readonly label = "Select / Move / Edit Shared Object In-Place";
    public readonly icon = "↖";
    public readonly shortcut = "V";
    public readonly category = "vector" as const;

    private draggingObjId: string | null = null;
    private dragStartPt: Point2D | null = null;
    private origX = 0;
    private origY = 0;
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
                const obj = layer.objects[oIdx];
                const bbox = state.engine.computeObjectBoundingBox(obj, cState);
                if (
                    localPt.x >= bbox.x - 4 &&
                    localPt.x <= bbox.x + bbox.width + 4 &&
                    localPt.y >= bbox.y - 4 &&
                    localPt.y <= bbox.y + bbox.height + 4
                ) {
                    return { layer, obj, bbox };
                }
            }
        }
        return null;
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D, ev: MouseEvent): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
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
            this.dragStartPt = localPt;
            this.origX = hit.obj.x ?? hit.bbox.x;
            this.origY = hit.obj.y ?? hit.bbox.y;
            this.hasStartedDragGroup = false;
            state.setStatus(
                hit.obj.kind === "ref"
                    ? `Selected Shared Object Instance "${hit.obj.id}" -> "${hit.obj.refId}" (Double-click or right-click to edit In-Place).`
                    : `Selected vector ${hit.obj.kind} "${hit.obj.id}".`
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
            state.engine.beginUndoGroup(state.canvasId, "Move Object");
        }

        state.engine.modifyObject(state.canvasId, this.draggingObjId, {
            x: Math.round(this.origX + dx),
            y: Math.round(this.origY + dy)
        });
        state.notify();
    }

    public override onPointerUp(state: EditorSessionState): void {
        if (this.hasStartedDragGroup) {
            this.hasStartedDragGroup = false;
            state.engine.endUndoGroup(state.canvasId, "Move Object");
            state.notify();
        }
        this.draggingObjId = null;
        this.dragStartPt = null;
    }

    public override onDoubleClick(state: EditorSessionState, canvasPt: Point2D): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const hit = this.findTopObjectAt(state, localPt);
        if (hit && hit.obj.kind === "ref" && hit.obj.refId) {
            state.enterInPlaceSharedObjectEdit(hit.obj.refId, hit.obj.id);
        }
    }
}

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

export class VectorTextTool extends AbstractEditorTool {
    public readonly id = "vector_text";
    public readonly label = "Vector Text";
    public readonly icon = "🔤";
    public readonly shortcut = "T";
    public readonly category = "vector" as const;

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "textContent", label: "Text", type: "text" },
            { key: "fontSize", label: "Font Size", type: "number", min: 7, max: 64, step: 7 },
            { key: "primaryColor", label: "Color", type: "color" }
        ];
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const vectorLayer = state.resolveActiveLayer("vector");
        const opts = state.toolOptions;
        const txt = opts.textContent || "TEXT";
        const created = state.engine.drawText(state.canvasId, vectorLayer?.id, {
            sharedObjectId: state.activeSharedObjectId,
            x: localPt.x,
            y: localPt.y,
            text: txt,
            fontFamily: opts.fontFamily,
            fontSize: opts.fontSize,
            fill: opts.primaryColor,
            opacity: opts.opacity
        });
        state.selectedObjectIds = [created.id];
        state.setStatus(`Placed vector text "${txt}" on "${vectorLayer?.name}".`);
    }
}

/**
 * Registry of all interactive GIMP + Inkscape tools in `workspace/haeditor`.
 */
export class EditorToolRegistry {
    private static readonly tools: AbstractEditorTool[] = [
        new VectorSelectTransformTool(),
        new RectShapeTool(),
        new CircleShapeTool(),
        new EllipseShapeTool(),
        new PolygonShapeTool(),
        new StarShapeTool(),
        new LineShapeTool(),
        new VectorPathTool(),
        new VectorTextTool(),
        new BrushTool(),
        new PencilTool(),
        new AirbrushTool(),
        new EraserTool(),
        new FloodFillTool(),
        new GradientFillTool(),
        new RectSelectTool(),
        new EllipseSelectTool()
    ];

    public static getAllTools(): AbstractEditorTool[] {
        return [...this.tools];
    }

    public static getToolsForContext(contextType: "vector" | "raster"): AbstractEditorTool[] {
        if (contextType === "vector") {
            return this.tools.filter((t) => t.category === "vector");
        }
        return this.tools.filter((t) => t.category === "raster" || t.category === "selection");
    }

    public static isToolForContext(toolId: string, contextType: "vector" | "raster"): boolean {
        const found = this.tools.find((t) => t.id === toolId);
        if (!found) return false;
        if (contextType === "vector") {
            return found.category === "vector";
        }
        return found.category === "raster" || found.category === "selection";
    }

    public static getTool(id: string): AbstractEditorTool {
        return this.tools.find(t => t.id === id) || this.tools[0];
    }
}
