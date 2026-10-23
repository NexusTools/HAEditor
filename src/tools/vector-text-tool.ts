import type { EditorSessionState } from "../state/editor-state.js";
import { AbstractEditorTool, type Point2D, type ToolOptionField } from "./base/abstract-editor-tool-base.js";

export class VectorTextTool extends AbstractEditorTool {
    public readonly id = "vector_text";
    public readonly label = "Vector Text (In-Place Edit)";
    public readonly icon = "🔤";
    public readonly shortcut = "T";
    public readonly category = "vector" as const;

    public override getOptionFields(): ToolOptionField[] {
        return [
            { key: "textContent", label: "Text", type: "text" },
            { key: "fontFamily", label: "Font Family", type: "text" },
            { key: "fontSize", label: "Font Size", type: "number", min: 7, max: 96, step: 1 },
            { key: "primaryColor", label: "Color", type: "color" }
        ];
    }

    public override onPointerDown(state: EditorSessionState, canvasPt: Point2D): void {
        const localPt = state.canvasToActiveTargetCoords(canvasPt.x, canvasPt.y);
        const cState = state.getCanvasState();
        const layers = state.getActiveContainerLayers();

        // Check if clicking an existing text object to edit it in-place while retaining its font and attributes
        for (let lIdx = layers.length - 1; lIdx >= 0; lIdx--) {
            const l = layers[lIdx];
            if (!l.visible || l.locked || l.type !== "vector") continue;
            for (let oIdx = l.objects.length - 1; oIdx >= 0; oIdx--) {
                const obj = l.objects[oIdx];
                if (obj.kind !== "text") continue;
                const bbox = state.engine.computeObjectBoundingBox(obj, cState);
                if (
                    localPt.x >= bbox.x - 6 &&
                    localPt.x <= bbox.x + bbox.width + 6 &&
                    localPt.y >= bbox.y - 6 &&
                    localPt.y <= bbox.y + bbox.height + 6
                ) {
                    state.activeLayerId = l.id;
                    state.selectedObjectIds = [obj.id];
                    state.requestInPlaceTextEdit(obj.id);
                    state.setStatus(`Editing text "${obj.text || obj.id}" in-place (Font: ${obj.fontFamily || "sans-serif"}, ${obj.fontSize || 16}px).`);
                    return;
                }
            }
        }

        const vectorLayer = state.resolveActiveLayer("vector");
        const opts = state.toolOptions;
        const txt = opts.textContent || "TEXT";
        const created = state.engine.drawText(state.canvasId, vectorLayer?.id, {
            sharedObjectId: state.activeSharedObjectId,
            x: localPt.x,
            y: localPt.y,
            text: txt,
            fontFamily: opts.fontFamily,
            fontSize: opts.fontSize,
            fill: opts.primaryColor,
            opacity: opts.opacity
        });
        state.selectedObjectIds = [created.id];
        state.setStatus(`Placed vector text "${txt}" on "${vectorLayer?.name}".`);
    }
}
