import * as fs from "fs";
import * as path from "path";
import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuItem, ContextMenuManager } from "../context-menu.js";
import type { ModalDialogManager } from "../modal-dialog.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import { buildMinimalTrueTypeFontBuffer, type EmbeddedFontSpec } from "@nexustools/hacanvas";

/**
 * Embedded Fonts Dock Panel (`#ha-fonts-panel`) inheriting from `AbstractDockPanel`.
 * Lists fonts extracted from imported PDFs or embedded by the user into the `.hacanvas` package,
 * injects `@font-face` rules for live rendering, and allows applying, importing, exporting, or removing fonts.
 */
export class FontsDockPanel extends AbstractDockPanel {
    public readonly panelId = "ha-fonts-panel";
    public readonly panelTitle = "Embedded Fonts";
    public readonly panelIcon = "🔤";
    private readonly modal: ModalDialogManager;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal: ModalDialogManager
    ) {
        super(containerEl, state, contextMenu);
        this.modal = modal;
    }

    protected override getDynamicTitle(): string {
        const fonts = this.getEmbeddedFontList();
        return fonts.length > 0 ? `Embedded Fonts (${fonts.length})` : this.panelTitle;
    }

    protected override getHeaderActions(): DockActionButton[] {
        return [
            {
                id: "btn-import-embedded-font",
                label: "+Font",
                icon: "➕",
                title: "Embed Font File (.ttf, .otf, .woff, .woff2) into Document",
                onClick: () => this.openImportFontDialog()
            }
        ];
    }

    private getEmbeddedFontList(): EmbeddedFontSpec[] {
        if (!this.state.hasOpenCanvas || !this.state.engine.hasCanvas(this.state.canvasId)) {
            return [];
        }
        const cState = this.state.getCanvasState();
        return Object.values(cState.embeddedFonts || {});
    }

    private injectFontFaces(fonts: EmbeddedFontSpec[]): void {
        const doc = this.containerEl.ownerDocument;
        if (!doc || !doc.head) return;
        let styleEl = doc.getElementById("ha-embedded-fonts-style") as HTMLStyleElement | null;
        if (!styleEl) {
            styleEl = doc.createElement("style");
            styleEl.id = "ha-embedded-fonts-style";
            doc.head.appendChild(styleEl);
        }
        const rules = fonts
            .filter(f => f && f.family && f.dataBase64)
            .map(f => {
                const fmt =
                    f.format === "otf"
                        ? "opentype"
                        : f.format === "woff"
                          ? "woff"
                          : f.format === "woff2"
                            ? "woff2"
                            : "truetype";
                const mime =
                    f.format === "otf"
                        ? "font/otf"
                        : f.format === "woff"
                          ? "font/woff"
                          : f.format === "woff2"
                            ? "font/woff2"
                            : "font/ttf";
                const safeFam = f.family.replace(/"/g, '\\"');
                return `@font-face { font-family: "${safeFam}"; src: url("data:${mime};base64,${f.dataBase64}") format("${fmt}"); font-weight: ${f.weight || f.fontWeight || "normal"}; font-style: ${f.style || f.fontStyle || "normal"}; }`;
            });
        styleEl.textContent = rules.join("\n");
    }

    private applyFontToSelection(font: EmbeddedFontSpec): void {
        this.state.toolOptions.fontFamily = font.family;
        let updatedCount = 0;
        if (this.state.hasOpenCanvas && this.state.selectedObjectIds.length > 0) {
            const layers = this.state.getActiveContainerLayers();
            for (const l of layers) {
                if (l.type !== "vector") continue;
                for (const obj of l.objects) {
                    if (this.state.selectedObjectIds.includes(obj.id) && obj.kind === "text") {
                        const fw = font.weight || font.fontWeight;
                        const fs = font.style || font.fontStyle;
                        this.state.engine.modifyObject(this.state.canvasId, obj.id, {
                            fontFamily: font.family,
                            fontId: font.id,
                            ...(fw ? { fontWeight: fw } : {}),
                            ...(fs ? { fontStyle: fs } : {})
                        });
                        updatedCount++;
                    }
                }
            }
        }
        if (updatedCount > 0) {
            this.state.setStatus(`Applied embedded font "${font.family}" to ${updatedCount} selected text object(s).`);
        } else {
            this.state.setStatus(`Selected active font family "${font.family}" for Text tool.`);
        }
        this.state.notify();
    }

    private openImportFontDialog(): void {
        this.modal.openFormDialog({
            title: "Embed Font into Document (.hacanvas / PDF)",
            fields: [
                {
                    key: "fontFamily",
                    label: "Font Family Name",
                    type: "text",
                    defaultValue: "CustomSans",
                    placeholder: "e.g., Inter, Roboto, CustomSans"
                },
                {
                    key: "filePath",
                    label: "Font File Path (.ttf, .otf, .woff, .woff2) — Leave blank to synthesize embedded TTF",
                    type: "text",
                    defaultValue: "",
                    placeholder: "Optional path to .ttf / .otf file"
                },
                {
                    key: "weight",
                    label: "Font Weight",
                    type: "select",
                    defaultValue: "normal",
                    options: [
                        { value: "normal", label: "Normal (400)" },
                        { value: "bold", label: "Bold (700)" }
                    ]
                },
                {
                    key: "style",
                    label: "Font Style",
                    type: "select",
                    defaultValue: "normal",
                    options: [
                        { value: "normal", label: "Normal" },
                        { value: "italic", label: "Italic" }
                    ]
                }
            ],
            submitLabel: "Embed Font",
            onSubmit: (vals) => {
                this.state.ensureCanvasOpen();
                const family = (vals.fontFamily || "CustomSans").trim();
                const rawPath = (vals.filePath || "").trim();
                if (rawPath && fs.existsSync(rawPath)) {
                    const embedded = this.state.engine.importFontFile(this.state.canvasId, rawPath, family);
                    embedded.weight = vals.weight || "normal";
                    embedded.style = vals.style || "normal";
                    this.state.toolOptions.fontFamily = embedded.family;
                    this.state.setStatus(
                        `Embedded font "${embedded.family}" (${embedded.format.toUpperCase()}) from ${path.basename(rawPath)}.`
                    );
                } else {
                    const ttfBuf = buildMinimalTrueTypeFontBuffer(family);
                    const embedded = this.state.engine.addEmbeddedFont(this.state.canvasId, {
                        name: family,
                        family,
                        format: "ttf",
                        weight: vals.weight || "normal",
                        style: vals.style || "normal",
                        dataBase64: ttfBuf.toString("base64"),
                        source: "user"
                    });
                    this.state.toolOptions.fontFamily = embedded.family;
                    this.state.setStatus(`Embedded TrueType font "${embedded.family}" into document.`);
                }
                this.state.notify();
            }
        });
    }

    private exportFontFile(font: EmbeddedFontSpec): void {
        const ext = font.format || "ttf";
        const defaultOut = path.join(
            this.state.projectRoot,
            `${font.family.replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`
        );
        this.modal.openFormDialog({
            title: `Export Embedded Font "${font.family}"`,
            fields: [
                {
                    key: "outputPath",
                    label: "Export File Path",
                    type: "text",
                    defaultValue: defaultOut
                }
            ],
            submitLabel: "Export Font",
            onSubmit: (vals) => {
                const outPath = (vals.outputPath || defaultOut).trim();
                this.state.engine.exportEmbeddedFont(this.state.canvasId, font.id, outPath);
                this.state.setStatus(`Exported embedded font "${font.family}" to ${outPath}.`);
            }
        });
    }

    private removeEmbeddedFont(font: EmbeddedFontSpec): void {
        this.state.engine.removeEmbeddedFont(this.state.canvasId, font.id);
        this.state.setStatus(`Removed embedded font "${font.family}".`);
        this.state.notify();
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        const fonts = this.getEmbeddedFontList();
        this.injectFontFaces(fonts);

        if (fonts.length === 0) {
            const emptyEl = this.createElement(
                "div",
                "ha-empty-hint",
                "No embedded fonts in document. Open a PDF with embedded fonts or click +Font to embed a .ttf/.otf/.woff font into the .hacanvas package.",
                { id: "ha-fonts-empty-state" }
            );
            bodyEl.appendChild(emptyEl);
            return;
        }

        const listEl = this.createElement("div", "ha-fonts-list", undefined, {
            id: "ha-embedded-font-list"
        });

        for (const font of fonts) {
            const isSelectedFamily = this.state.toolOptions.fontFamily === font.family;
            const itemEl = this.createElement(
                "div",
                `ha-font-card ha-font-item ${isSelectedFamily ? "active" : ""}`,
                undefined,
                {
                    "data-font-id": font.id,
                    "data-font-family": font.family
                }
            );

            const topRow = this.createElement("div", "ha-font-card-top");
            const titleSpan = this.createElement("span", "ha-font-title", font.family);
            topRow.appendChild(titleSpan);

            const badgesWrap = this.createElement("div", "ha-font-actions");
            const fmtBadge = this.createElement(
                "span",
                "ha-badge",
                (font.format || "ttf").toUpperCase()
            );
            const srcBadge = this.createElement(
                "span",
                "ha-badge",
                font.source === "pdf" ? "PDF" : "USER"
            );

            const applyBtn = this.createElement("button", "ha-dock-btn", "Use", {
                title: `Apply "${font.family}" to selected text or set as active font`,
                type: "button"
            });
            applyBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.applyFontToSelection(font);
            });

            const delBtn = this.createElement("button", "ha-dock-btn", "✕", {
                title: `Remove embedded font "${font.family}"`,
                type: "button"
            });
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.removeEmbeddedFont(font);
            });

            badgesWrap.append(fmtBadge, srcBadge, applyBtn, delBtn);
            topRow.appendChild(badgesWrap);

            const previewRow = this.createElement(
                "div",
                "ha-font-preview",
                `Aa Bb Cc 123 — ${font.name}`
            );
            previewRow.style.fontFamily = `"${font.family}", sans-serif`;
            previewRow.style.fontWeight = font.weight || font.fontWeight || "normal";
            previewRow.style.fontStyle = font.style || font.fontStyle || "normal";

            itemEl.append(topRow, previewRow);

            itemEl.addEventListener("click", () => {
                this.applyFontToSelection(font);
            });

            itemEl.addEventListener("contextmenu", (ev: MouseEvent) => {
                ev.preventDefault();
                ev.stopPropagation();
                const items: ContextMenuItem[] = [
                    {
                        id: "ctx-font-apply",
                        label: `Use "${font.family}" on Selected Text`,
                        icon: "🔤",
                        action: () => this.applyFontToSelection(font)
                    },
                    {
                        id: "ctx-font-export",
                        label: `Export Font File (.${font.format || "ttf"})...`,
                        icon: "💾",
                        action: () => this.exportFontFile(font)
                    },
                    { divider: true },
                    {
                        id: "ctx-font-remove",
                        label: "Remove Embedded Font",
                        icon: "🗑️",
                        danger: true,
                        action: () => this.removeEmbeddedFont(font)
                    }
                ];
                this.contextMenu.openMenu(ev.clientX, ev.clientY, items);
            });

            listEl.appendChild(itemEl);
        }

        bodyEl.appendChild(listEl);
    }
}
