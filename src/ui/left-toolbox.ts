import { AbstractUIComponent } from "./abstract-ui-component.js";
import type { EditorSessionState } from "../state/editor-state.js";
import { EditorToolRegistry } from "../tools/abstract-editor-tool.js";

/**
 * Left GIMP + Inkscape Dockable Toolbox inheriting from `AbstractUIComponent`.
 */
export class LeftToolbox extends AbstractUIComponent {
    private readonly state: EditorSessionState;

    constructor(containerEl: HTMLElement, state: EditorSessionState) {
        super(containerEl);
        this.state = state;
    }

    public override render(): void {
        this.containerEl.innerHTML = "";
        const contextType = this.state.getActiveContextType();
        const activeLayer = this.state.resolveActiveLayer();
        this.state.syncToolWithActiveLayer();

        this.containerEl.className = `ha-left-toolbox context-${contextType}`;
        this.containerEl.id = "ha-left-toolbox";
        this.containerEl.setAttribute("data-toolbox-context", contextType);

        const sectionTitle = contextType === "vector" ? "VECTOR / INKSCAPE" : "RASTER / GIMP";
        const contextSection = this.createElement("div", "ha-toolbox-section-label", sectionTitle, {
            id: "ha-toolbox-context-label"
        });

        const layerBadge = this.createElement(
            "div",
            `ha-toolbox-layer-badge ${contextType}`,
            activeLayer ? `${contextType === "vector" ? "✒️" : "🖌️"} ${activeLayer.name}` : sectionTitle,
            {
                id: "ha-toolbox-active-layer-badge",
                title: activeLayer ? `Editing ${activeLayer.type.toUpperCase()} layer: ${activeLayer.name}` : sectionTitle
            }
        );

        const toolsGrid = this.createElement("div", "ha-toolbox-grid", undefined, {
            id: "ha-toolbox-grid"
        });

        const contextTools = EditorToolRegistry.getToolsForContext(contextType);
        for (const tool of contextTools) {
            const isActive = this.state.activeToolId === tool.id;
            const btn = this.createElement(
                "button",
                `ha-tool-btn ${isActive ? "active" : ""}`,
                tool.icon,
                {
                    id: `tool-btn-${tool.id}`,
                    "data-tool-id": tool.id,
                    "data-tool-category": tool.category,
                    title: `${tool.label} (${tool.shortcut})`,
                    type: "button"
                }
            );
            btn.addEventListener("click", () => {
                this.state.activeToolId = tool.id;
                this.state.setStatus(`Selected tool: ${tool.label} (${tool.shortcut}).`);
            });
            toolsGrid.appendChild(btn);
        }

        // Foreground / Background GIMP Color Swatches
        const swatchBox = this.createElement("div", "ha-color-swatch-box");
        const fgInput = this.createElement("input", "ha-swatch-fg", undefined, {
            id: "swatch-fg-color",
            type: "color",
            title: "Foreground / Primary Color",
            value: this.state.toolOptions.primaryColor
        });
        fgInput.addEventListener("input", () => {
            this.state.toolOptions.primaryColor = fgInput.value;
            this.state.notify();
        });

        const bgInput = this.createElement("input", "ha-swatch-bg", undefined, {
            id: "swatch-bg-color",
            type: "color",
            title: "Background / Secondary Color",
            value: this.state.toolOptions.secondaryColor
        });
        bgInput.addEventListener("input", () => {
            this.state.toolOptions.secondaryColor = bgInput.value;
            this.state.notify();
        });

        const swapBtn = this.createElement("button", "ha-icon-btn ha-swatch-swap", "⇄", {
            id: "btn-swap-colors",
            title: "Swap Foreground & Background Colors (X)",
            type: "button"
        });
        swapBtn.addEventListener("click", () => {
            const tmp = this.state.toolOptions.primaryColor;
            this.state.toolOptions.primaryColor = this.state.toolOptions.secondaryColor;
            this.state.toolOptions.secondaryColor = tmp;
            this.state.notify();
        });

        swatchBox.append(fgInput, bgInput, swapBtn);
        this.containerEl.append(contextSection, layerBadge, toolsGrid, swatchBox);
    }
}

