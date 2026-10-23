import { AbstractVectorShapeTool } from "./base/abstract-vector-shape-tool.js";

export class CircleShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_circle";
    public readonly label = "Draw Circle";
    public readonly icon = "⚪";
    public readonly shortcut = "O";
    protected readonly shapeKind = "circle" as const;
}
