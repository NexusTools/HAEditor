import type { EditorSessionState } from "../../state/editor-state.js";

export interface Point2D {
    x: number;
    y: number;
}

export interface ToolOptionField {
    key: string;
    label: string;
    type: "number" | "color" | "text" | "boolean" | "select";
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string; label: string }>;
}

/**
 * Root abstract base class for all interactive tools in `workspace/haeditor`.
 * Shares target container resolution (Main Canvas vs. Shared Object), coordinate transformation
 * for In-Place Shared Object editing, and overlay preview rendering hooks.
 */
export abstract class AbstractEditorTool {
    public abstract readonly id: string;
    public abstract readonly label: string;
    public abstract readonly icon: string;
    public abstract readonly shortcut: string;
    public abstract readonly category: "vector" | "raster" | "selection";

    public abstract getOptionFields(): ToolOptionField[];

    public onPointerDown(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}
    public onPointerMove(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}
    public onPointerUp(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}
    public onDoubleClick(_state: EditorSessionState, _canvasPt: Point2D, _ev: MouseEvent): void {}

    public renderOverlay(_state: EditorSessionState, _ctx: CanvasRenderingContext2D): void {}
}
