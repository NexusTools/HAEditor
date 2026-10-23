import { AbstractVectorShapeTool } from "./base/abstract-vector-shape-tool.js";

export class PolygonShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_polygon";
    public readonly label = "Draw Polygon";
    public readonly icon = "⬡";
    public readonly shortcut = "Y";
    protected readonly shapeKind = "polygon" as const;
}
