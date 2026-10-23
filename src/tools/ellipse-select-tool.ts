import { AbstractSelectionTool } from "./base/abstract-selection-tool.js";

export class EllipseSelectTool extends AbstractSelectionTool {
    public readonly id = "select_ellipse";
    public readonly label = "Ellipse Select";
    public readonly icon = "◯";
    public readonly shortcut = "C";
    protected readonly selectionMode = "ellipse" as const;
}
