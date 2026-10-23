import { AbstractVectorShapeTool } from "./base/abstract-vector-shape-tool.js";

export class StarShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_star";
    public readonly label = "Draw Star";
    public readonly icon = "⭐";
    public readonly shortcut = "S";
    protected readonly shapeKind = "star" as const;
}
