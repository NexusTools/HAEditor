import { AbstractVectorShapeTool } from "./base/abstract-vector-shape-tool.js";

export class EllipseShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_ellipse";
    public readonly label = "Draw Ellipse";
    public readonly icon = "⬭";
    public readonly shortcut = "L";
    protected readonly shapeKind = "ellipse" as const;
}
