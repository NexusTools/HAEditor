import { AbstractVectorShapeTool } from "./base/abstract-vector-shape-tool.js";

export class LineShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_line";
    public readonly label = "Draw Line";
    public readonly icon = "╱";
    public readonly shortcut = "I";
    protected readonly shapeKind = "line" as const;
}
