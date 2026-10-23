import { AbstractRasterStrokeTool } from "./base/abstract-raster-stroke-tool.js";

export class PencilTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_pencil";
    public readonly label = "Pencil (Hard Edge)";
    public readonly icon = "✏️";
    public readonly shortcut = "N";
    protected readonly strokeMode = "pencil" as const;
}
