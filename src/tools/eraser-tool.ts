import { AbstractRasterStrokeTool } from "./base/abstract-raster-stroke-tool.js";

export class EraserTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_eraser";
    public readonly label = "Eraser";
    public readonly icon = "🧽";
    public readonly shortcut = "E";
    protected readonly strokeMode = "eraser" as const;
}
