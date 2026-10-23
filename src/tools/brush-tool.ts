import { AbstractRasterStrokeTool } from "./base/abstract-raster-stroke-tool.js";

export class BrushTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_brush";
    public readonly label = "Paintbrush";
    public readonly icon = "🖌️";
    public readonly shortcut = "B";
    protected readonly strokeMode = "brush" as const;
}
