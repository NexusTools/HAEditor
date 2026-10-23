import { AbstractSelectionTool } from "./base/abstract-selection-tool.js";

export class RectSelectTool extends AbstractSelectionTool {
    public readonly id = "select_rect";
    public readonly label = "Rectangle Select";
    public readonly icon = "⬚";
    public readonly shortcut = "R";
    protected readonly selectionMode = "rect" as const;
}
