import { AbstractEditorTool } from "./base/abstract-editor-tool-base.js";
import { BrushTool } from "./brush-tool.js";
import { PencilTool } from "./pencil-tool.js";
import { AirbrushTool } from "./airbrush-tool.js";
import { EraserTool } from "./eraser-tool.js";
import { FloodFillTool } from "./flood-fill-tool.js";
import { GradientFillTool } from "./gradient-fill-tool.js";
import { RectSelectTool } from "./rect-select-tool.js";
import { EllipseSelectTool } from "./ellipse-select-tool.js";
import { RectShapeTool } from "./rect-shape-tool.js";
import { CircleShapeTool } from "./circle-shape-tool.js";
import { EllipseShapeTool } from "./ellipse-shape-tool.js";
import { PolygonShapeTool } from "./polygon-shape-tool.js";
import { StarShapeTool } from "./star-shape-tool.js";
import { LineShapeTool } from "./line-shape-tool.js";
import { VectorSelectTransformTool } from "./vector-select-transform-tool.js";
import { VectorDeformTool } from "./vector-deform-tool.js";
import { VectorPathTool } from "./vector-path-tool.js";
import { VectorTextTool } from "./vector-text-tool.js";

/**
 * Registry of all interactive GIMP + Inkscape tools in `workspace/haeditor`.
 */
export class EditorToolRegistry {
    private static readonly tools: AbstractEditorTool[] = [
        new VectorSelectTransformTool(),
        new VectorDeformTool(),
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
