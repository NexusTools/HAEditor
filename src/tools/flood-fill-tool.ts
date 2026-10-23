import type { EditorSessionState } from "../state/editor-state.js";
import type { Point2D, ToolOptionField } from "./base/abstract-editor-tool-base.js";
import { AbstractRasterFillTool } from "./base/abstract-raster-fill-tool.js";

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
