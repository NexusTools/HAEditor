import { AbstractVectorShapeTool } from "./base/abstract-vector-shape-tool.js";

export class RectShapeTool extends AbstractVectorShapeTool {
    public readonly id = "vector_rect";
    public readonly label = "Draw Rectangle";
    public readonly icon = "▭";
    public readonly shortcut = "U";
    protected readonly shapeKind = "rect" as const;
}
