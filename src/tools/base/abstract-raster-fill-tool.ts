import { AbstractEditorTool } from "./abstract-editor-tool-base.js";

/**
 * Intermediate abstract base class for GIMP raster fill tools (Flood Bucket Fill & Linear/Radial Gradients).
 */
export abstract class AbstractRasterFillTool extends AbstractEditorTool {
    public readonly category = "raster" as const;
}
