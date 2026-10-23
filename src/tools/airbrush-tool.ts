import { AbstractRasterStrokeTool } from "./base/abstract-raster-stroke-tool.js";

export class AirbrushTool extends AbstractRasterStrokeTool {
    public readonly id = "raster_airbrush";
    public readonly label = "Airbrush (Soft)";
    public readonly icon = "💨";
    public readonly shortcut = "A";
    protected readonly strokeMode = "airbrush" as const;
}
