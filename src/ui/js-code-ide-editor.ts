import Prism from "prismjs";
import {
    GIMP_JS_INTERNAL_DOCS,
    type GimpJsInternalDoc
} from "@nexustools/hacanvas";

export interface JsIdeNavigationResult {
    action: "goto_definition" | "show_doc" | "not_found";
    symbol: string;
    line?: number;
    doc?: GimpJsInternalDoc;
}

export interface JsCodeIdeEditorOptions {
    container: HTMLElement;
    initialCode: string;
    readOnly?: boolean;
    minHeightPx?: number;
    maxHeightPx?: number;
    placeholder?: string;
    onChange?: (newCode: string) => void;
    onStatus?: (message: string) => void;
}

/**
 * Interactive JavaScript Code Editor powered by `prismjs` with:
 * - Live JavaScript syntax highlighting (`Prism.highlight(..., Prism.languages.javascript, "javascript")`)
 * - Line numbers & active definition line highlighting
 * - **Modifier+Click (`Ctrl+Click` / `Cmd+Click` / `Alt+Click`) IDE Navigation**:
 *   1. Clicking any user-defined function or variable (`function foo()`, `const foo = ...`) jumps to & selects its definition line.
 *   2. Clicking any internal library function or runtime scope variable (`helpers.*`, `gimp.*`, `gegl.*`, `srcBuf`, `outBuf`, `bufA`, `bufB`, `params`, etc.)
 *      opens the interactive **IDE Documentation Popover (`#ha-ide-doc-popover`)** displaying the function signature, summary, GIMP C source reference, and example code.
 */
export class JsCodeIdeEditor {
    private container: HTMLElement;
    private options: JsCodeIdeEditorOptions;
    private rootEl!: HTMLElement;
    private gutterEl!: HTMLElement;
    private preEl!: HTMLElement;
    private codeEl!: HTMLElement;
    private textareaEl!: HTMLTextAreaElement;
    private statusBannerEl!: HTMLElement;
    private highlightedLine: number | null = null;

    constructor(options: JsCodeIdeEditorOptions) {
        this.container = options.container;
        this.options = options;
        JsCodeIdeEditor.ensureStylesInjected();
        this.buildDom();
        this.setCode(options.initialCode || "");
    }

    public static ensureStylesInjected(): void {
        if (typeof document === "undefined") return;
        if (document.getElementById("ha-prism-ide-styles")) return;
        const style = document.createElement("style");
        style.id = "ha-prism-ide-styles";
        style.textContent = `
            .ha-js-ide-root {
                position: relative;
                display: flex;
                flex-direction: column;
                border: 1px solid #2b3550;
                border-radius: 5px;
                background: #0d1018;
                overflow: hidden;
                font-family: 'Consolas', 'JetBrains Mono', 'Fira Code', monospace;
                font-size: 11.5px;
                line-height: 18px;
            }
            .ha-js-ide-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 4px 8px;
                background: #141926;
                border-bottom: 1px solid #232b42;
                color: #8fa2c8;
                font-size: 10px;
                user-select: none;
            }
            .ha-js-ide-body {
                position: relative;
                display: flex;
                width: 100%;
                overflow: hidden;
            }
            .ha-js-ide-gutter {
                width: 36px;
                flex-shrink: 0;
                padding: 8px 4px;
                background: #101420;
                border-right: 1px solid #1f263b;
                color: #546488;
                text-align: right;
                user-select: none;
                overflow: hidden;
                font-family: inherit;
                font-size: 11px;
                line-height: 18px;
            }
            .ha-js-ide-gutter-line {
                padding-right: 4px;
                height: 18px;
            }
            .ha-js-ide-gutter-line.ha-def-target {
                background: rgba(0, 229, 255, 0.22);
                color: #00e5ff;
                font-weight: 700;
            }
            .ha-js-ide-stage {
                position: relative;
                flex: 1;
                min-height: 160px;
                overflow: hidden;
            }
            .ha-js-ide-pre,
            .ha-js-ide-textarea {
                margin: 0;
                padding: 8px 10px;
                border: 0;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                font-family: 'Consolas', 'JetBrains Mono', 'Fira Code', monospace;
                font-size: 11.5px;
                line-height: 18px;
                tab-size: 2;
                white-space: pre;
                overflow: auto;
            }
            .ha-js-ide-pre {
                position: absolute;
                inset: 0;
                pointer-events: none;
                color: #d8e2f5;
                z-index: 1;
            }
            .ha-js-ide-textarea {
                position: relative;
                z-index: 2;
                background: transparent;
                color: transparent;
                caret-color: #00e5ff;
                resize: vertical;
                outline: none;
            }
            .ha-js-ide-textarea::selection {
                background: rgba(0, 212, 255, 0.28);
                color: transparent;
            }
            .ha-js-ide-root.ha-mod-down .ha-js-ide-textarea {
                cursor: pointer;
            }
            /* Prism.js Dark GIMP Studio Syntax Tokens */
            .ha-js-ide-pre .token.comment,
            .ha-js-ide-pre .token.prolog,
            .ha-js-ide-pre .token.doctype,
            .ha-js-ide-pre .token.cdata {
                color: #637496;
                font-style: italic;
            }
            .ha-js-ide-pre .token.keyword,
            .ha-js-ide-pre .token.operator {
                color: #c792ea;
            }
            .ha-js-ide-pre .token.function {
                color: #82aaff;
            }
            .ha-js-ide-pre .token.number,
            .ha-js-ide-pre .token.boolean {
                color: #f78c6c;
            }
            .ha-js-ide-pre .token.string,
            .ha-js-ide-pre .token.char,
            .ha-js-ide-pre .token.regex {
                color: #c3e88d;
            }
            .ha-js-ide-pre .token.punctuation {
                color: #89ddff;
            }
            .ha-js-ide-pre .token.builtin,
            .ha-js-ide-pre .token.class-name,
            .ha-js-ide-pre .token.constant {
                color: #ffcb6b;
            }
            .ha-js-ide-pre .ha-ide-symbol {
                border-bottom: 1px dotted rgba(0, 229, 255, 0.45);
            }
            .ha-js-ide-status {
                padding: 4px 8px;
                background: #111622;
                border-top: 1px solid #1f263b;
                color: #7ee787;
                font-size: 10.5px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            #ha-ide-doc-popover {
                position: fixed;
                z-index: 10050;
                width: 440px;
                max-width: 92vw;
                background: #141926;
                border: 1px solid #00e5ff;
                border-radius: 6px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.72);
                padding: 12px;
                color: #e2e8f6;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 12px;
            }
        `;
        document.head.appendChild(style);
    }

    private buildDom(): void {
        this.container.innerHTML = "";
        const minH = this.options.minHeightPx ?? 190;
        const maxH = this.options.maxHeightPx ?? 340;

        this.rootEl = document.createElement("div");
        this.rootEl.className = "ha-js-ide-root";

        const toolbar = document.createElement("div");
        toolbar.className = "ha-js-ide-toolbar";
        toolbar.innerHTML = `
            <span><strong style="color:#00e5ff;">JS IDE</strong> · Prism.js Syntax Highlighting</span>
            <span>Hold <kbd style="background:#1e2638;padding:1px 4px;border-radius:3px;color:#ffd166;">Ctrl</kbd> / <kbd style="background:#1e2638;padding:1px 4px;border-radius:3px;color:#ffd166;">Alt</kbd> + Click any function for Definition / GIMP Docs</span>
        `;

        const body = document.createElement("div");
        body.className = "ha-js-ide-body";

        this.gutterEl = document.createElement("div");
        this.gutterEl.className = "ha-js-ide-gutter";

        const stage = document.createElement("div");
        stage.className = "ha-js-ide-stage";
        stage.style.minHeight = `${minH}px`;
        stage.style.maxHeight = `${maxH}px`;

        this.preEl = document.createElement("pre");
        this.preEl.className = "ha-js-ide-pre language-javascript";
        this.codeEl = document.createElement("code");
        this.codeEl.className = "language-javascript";
        this.preEl.appendChild(this.codeEl);

        this.textareaEl = document.createElement("textarea");
        this.textareaEl.className = "ha-js-ide-textarea";
        this.textareaEl.spellcheck = false;
        this.textareaEl.autocapitalize = "off";
        this.textareaEl.autocomplete = "off";
        this.textareaEl.style.minHeight = `${minH}px`;
        this.textareaEl.style.maxHeight = `${maxH}px`;
        if (this.options.readOnly) {
            this.textareaEl.readOnly = true;
        }
        if (this.options.placeholder) {
            this.textareaEl.placeholder = this.options.placeholder;
        }

        stage.appendChild(this.preEl);
        stage.appendChild(this.textareaEl);
        body.appendChild(this.gutterEl);
        body.appendChild(stage);

        this.statusBannerEl = document.createElement("div");
        this.statusBannerEl.className = "ha-js-ide-status";
        this.statusBannerEl.innerHTML = `
            <span class="ha-js-ide-status-msg">Ready · Click with Ctrl/Cmd/Alt on helpers.*, gimp.*, gegl.*, or local functions</span>
            <button type="button" class="ha-btn ha-js-ide-docs-btn" style="padding:1px 7px;font-size:10px;">📖 Internal API Docs</button>
        `;

        this.rootEl.appendChild(toolbar);
        this.rootEl.appendChild(body);
        this.rootEl.appendChild(this.statusBannerEl);
        this.container.appendChild(this.rootEl);

        // Synchronize scroll between textarea, syntax pre, and line gutter
        this.textareaEl.addEventListener("scroll", () => {
            this.preEl.scrollTop = this.textareaEl.scrollTop;
            this.preEl.scrollLeft = this.textareaEl.scrollLeft;
            this.gutterEl.scrollTop = this.textareaEl.scrollTop;
        });

        this.textareaEl.addEventListener("input", () => {
            this.highlightedLine = null;
            this.renderHighlight();
            this.options.onChange?.(this.textareaEl.value);
        });

        // Support Tab key indentation
        this.textareaEl.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) {
                this.rootEl.classList.add("ha-mod-down");
            }
            if (e.key === "Tab" && !this.textareaEl.readOnly) {
                e.preventDefault();
                const start = this.textareaEl.selectionStart ?? 0;
                const end = this.textareaEl.selectionEnd ?? start;
                const val = this.textareaEl.value;
                this.textareaEl.value = val.slice(0, start) + "  " + val.slice(end);
                this.textareaEl.selectionStart = this.textareaEl.selectionEnd = start + 2;
                this.renderHighlight();
                this.options.onChange?.(this.textareaEl.value);
            }
        });

        this.textareaEl.addEventListener("keyup", (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                this.rootEl.classList.remove("ha-mod-down");
            }
        });

        // Modifier+Click (`Ctrl+Click`, `Cmd+Click`, or `Alt+Click`) -> Go To Definition or Show Internal Function Doc
        this.textareaEl.addEventListener("click", (e: MouseEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) {
                e.preventDefault();
                const caretPos = this.textareaEl.selectionStart ?? 0;
                this.triggerModifierClickOnSymbol(caretPos, { clientX: e.clientX, clientY: e.clientY });
            }
        });

        this.statusBannerEl.querySelector(".ha-js-ide-docs-btn")?.addEventListener("click", (e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            this.showInternalDocPopover(GIMP_JS_INTERNAL_DOCS["helpers.perlin2d"] || Object.values(GIMP_JS_INTERNAL_DOCS)[0], {
                clientX: rect.left,
                clientY: rect.bottom + 6
            }, true);
        });
    }

    public getCode(): string {
        return this.textareaEl.value;
    }

    public setCode(code: string): void {
        this.textareaEl.value = code || "";
        this.highlightedLine = null;
        this.renderHighlight();
    }

    public getTextareaElement(): HTMLTextAreaElement {
        return this.textareaEl;
    }

    public getCodeElement(): HTMLElement {
        return this.codeEl;
    }

    private renderHighlight(): void {
        const rawCode = this.textareaEl.value || "";
        const grammar = Prism.languages.javascript;
        let html = Prism.highlight(rawCode, grammar, "javascript");
        // Trailing newline ensures the <pre> matches textarea height when the last line is empty
        if (rawCode.endsWith("\n")) {
            html += " ";
        }
        this.codeEl.innerHTML = html;

        const lineCount = Math.max(1, rawCode.split("\n").length);
        const gutterLines: string[] = [];
        for (let i = 1; i <= lineCount; i++) {
            const isTarget = this.highlightedLine === i;
            gutterLines.push(
                `<div class="ha-js-ide-gutter-line${isTarget ? " ha-def-target" : ""}" data-line="${i}">${i}</div>`
            );
        }
        this.gutterEl.innerHTML = gutterLines.join("");
    }

    /**
     * Extracts the identifier or dotted member expression (`helpers.perlin2d`, `gimp.convolve3x3`, `myLocalFn`)
     * at the given character offset in `code`.
     */
    public extractSymbolAtOffset(offset: number): string {
        const code = this.textareaEl.value;
        if (!code) return "";
        const clamped = Math.max(0, Math.min(code.length - 1, offset));
        const isIdentChar = (ch: string) => /[a-zA-Z0-9_.$]/.test(ch);

        let start = clamped;
        // If clicked right after an identifier, step 1 char left
        if (!isIdentChar(code[start] || "") && start > 0 && isIdentChar(code[start - 1] || "")) {
            start--;
        }
        if (!isIdentChar(code[start] || "")) return "";

        while (start > 0 && isIdentChar(code[start - 1])) {
            start--;
        }
        let end = clamped;
        while (end < code.length && isIdentChar(code[end])) {
            end++;
        }
        return code.slice(start, end).replace(/^\.+|\.+$/g, "");
    }

    /**
     * Searches the current JS code for a user-defined function or variable declaration matching `symbolName`.
     * Returns 1-based line number and character range if found.
     */
    public findLocalDefinition(symbolName: string): { line: number; startOffset: number; endOffset: number } | null {
        const cleanName = symbolName.includes(".") ? symbolName.split(".").pop()! : symbolName;
        if (!cleanName || cleanName in GIMP_JS_INTERNAL_DOCS) return null;

        const code = this.textareaEl.value;
        const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
            new RegExp(`\\bfunction\\s+(${escaped})\\s*\\(`, "m"),
            new RegExp(`\\b(?:const|let|var)\\s+(${escaped})\\s*=`, "m")
        ];

        for (const regex of patterns) {
            const match = regex.exec(code);
            if (match && match.index !== undefined) {
                const startOffset = match.index;
                const endOffset = startOffset + match[0].length;
                const line = code.slice(0, startOffset).split("\n").length;
                return { line, startOffset, endOffset };
            }
        }
        return null;
    }

    /**
     * Looks up internal function documentation for `symbol` (`helpers.*`, `gimp.*`, `gegl.*`, `srcBuf`, `outBuf`, `bufA`, `bufB`, `params`, etc.).
     */
    public findInternalDoc(symbol: string): GimpJsInternalDoc | undefined {
        if (!symbol) return undefined;
        if (GIMP_JS_INTERNAL_DOCS[symbol]) {
            return GIMP_JS_INTERNAL_DOCS[symbol];
        }
        const suffix = "." + symbol;
        return Object.values(GIMP_JS_INTERNAL_DOCS).find(
            d => d.symbol === symbol || d.symbol.endsWith(suffix)
        );
    }

    /**
     * Executes Modifier+Click (`Ctrl+Click` / `Cmd+Click` / `Alt+Click`) resolution on either a character offset
     * or an explicit symbol string.
     */
    public triggerModifierClickOnSymbol(
        symbolOrOffset: string | number,
        coords?: { clientX: number; clientY: number }
    ): JsIdeNavigationResult {
        const symbol = typeof symbolOrOffset === "number"
            ? this.extractSymbolAtOffset(symbolOrOffset)
            : symbolOrOffset.trim();

        const setBanner = (msg: string) => {
            const msgEl = this.statusBannerEl.querySelector(".ha-js-ide-status-msg");
            if (msgEl) msgEl.textContent = msg;
            this.options.onStatus?.(msg);
        };

        if (!symbol) {
            setBanner("No JavaScript symbol under cursor.");
            return { action: "not_found", symbol: "" };
        }

        // 1. Check user-defined function / variable definition in current script first (unless explicitly prefixed with helpers./gimp./gegl.)
        if (!symbol.startsWith("helpers.") && !symbol.startsWith("gimp.") && !symbol.startsWith("gegl.")) {
            const localDef = this.findLocalDefinition(symbol);
            if (localDef) {
                this.highlightedLine = localDef.line;
                this.renderHighlight();
                this.textareaEl.focus();
                this.textareaEl.setSelectionRange(localDef.startOffset, localDef.endOffset);
                const targetTop = Math.max(0, (localDef.line - 3) * 18);
                this.textareaEl.scrollTop = targetTop;
                this.preEl.scrollTop = targetTop;
                this.gutterEl.scrollTop = targetTop;
                setBanner(`↳ Jumped to definition of '${symbol}' at line ${localDef.line}`);
                return {
                    action: "goto_definition",
                    symbol,
                    line: localDef.line
                };
            }
        }

        // 2. Check internal GIMP / GEGL / helpers runtime documentation
        const internalDoc = this.findInternalDoc(symbol);
        if (internalDoc) {
            this.showInternalDocPopover(internalDoc, coords);
            setBanner(`📖 Showing GIMP JS API documentation for '${internalDoc.symbol}'`);
            return {
                action: "show_doc",
                symbol: internalDoc.symbol,
                doc: internalDoc
            };
        }

        setBanner(`Symbol '${symbol}' is not an internal helper or local function definition.`);
        return { action: "not_found", symbol };
    }

    public showInternalDocPopover(
        doc: GimpJsInternalDoc,
        coords?: { clientX: number; clientY: number },
        showSymbolSwitcher: boolean = false
    ): HTMLElement {
        const existing = document.getElementById("ha-ide-doc-popover");
        if (existing) existing.remove();

        const pop = document.createElement("div");
        pop.id = "ha-ide-doc-popover";

        const rect = this.rootEl.getBoundingClientRect();
        const left = Math.max(12, Math.min((typeof window !== "undefined" ? window.innerWidth : 1024) - 460, coords?.clientX ?? (rect.left + 40)));
        const top = Math.max(12, Math.min((typeof window !== "undefined" ? window.innerHeight : 768) - 290, (coords?.clientY ?? (rect.top + 36)) + 8));
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;

        const allDocs = Object.values(GIMP_JS_INTERNAL_DOCS);
        const switcherHtml = showSymbolSwitcher
            ? `<div style="margin-bottom:8px;">
                <select id="ha-ide-doc-select" class="ha-select" style="width:100%;font-size:11px;">
                    ${allDocs.map(d => `<option value="${d.symbol}" ${d.symbol === doc.symbol ? "selected" : ""}>[${d.namespace}] ${d.symbol} — ${d.summary}</option>`).join("")}
                </select>
               </div>`
            : "";

        const highlightedExample = Prism.highlight(doc.example, Prism.languages.javascript, "javascript");

        pop.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="background:#00e5ff22;color:#00e5ff;border:1px solid #00e5ff66;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;">${doc.namespace}</span>
                    <strong class="ha-ide-doc-symbol" style="color:#ffd166;font-family:monospace;font-size:13px;">${doc.symbol}</strong>
                </div>
                <button type="button" id="ha-ide-doc-close" class="ha-btn" style="padding:1px 7px;font-size:11px;">✕</button>
            </div>
            ${switcherHtml}
            <div class="ha-ide-doc-sig" style="background:#0b0e16;border:1px solid #26304a;padding:5px 8px;border-radius:4px;font-family:monospace;font-size:11px;color:#82aaff;margin-bottom:6px;overflow-x:auto;">${doc.signature}</div>
            <div class="ha-ide-doc-summary" style="color:#e2e8f6;font-weight:600;margin-bottom:4px;">${doc.summary}</div>
            <div class="ha-ide-doc-details" style="color:#9fb0d0;font-size:11px;line-height:1.45;margin-bottom:6px;">${doc.details}</div>
            ${doc.gimpSourceRef ? `<div class="ha-ide-doc-source" style="color:#7ee787;font-size:10.5px;font-family:monospace;margin-bottom:6px;">GIMP C Source: ${doc.gimpSourceRef}</div>` : ""}
            <pre style="background:#0b0e16;border:1px solid #1f263b;padding:6px 8px;border-radius:4px;font-family:monospace;font-size:11px;margin:0 0 8px 0;overflow-x:auto;"><code class="language-javascript">${highlightedExample}</code></pre>
            <div style="display:flex;justify-content:flex-end;gap:6px;">
                <button type="button" id="ha-ide-doc-browse-all" class="ha-btn" style="padding:2px 8px;font-size:10.5px;">Browse All Symbols (${allDocs.length})</button>
                ${!this.textareaEl.readOnly ? `<button type="button" id="ha-ide-doc-insert" class="ha-btn ha-btn-primary" style="padding:2px 8px;font-size:10.5px;">+ Insert Example</button>` : ""}
            </div>
        `;

        document.body.appendChild(pop);

        pop.querySelector("#ha-ide-doc-close")?.addEventListener("click", () => pop.remove());
        pop.querySelector("#ha-ide-doc-browse-all")?.addEventListener("click", () => {
            this.showInternalDocPopover(doc, coords, true);
        });
        pop.querySelector("#ha-ide-doc-select")?.addEventListener("change", (ev) => {
            const nextSym = (ev.target as HTMLSelectElement).value;
            const nextDoc = GIMP_JS_INTERNAL_DOCS[nextSym];
            if (nextDoc) {
                this.showInternalDocPopover(nextDoc, coords, true);
            }
        });
        pop.querySelector("#ha-ide-doc-insert")?.addEventListener("click", () => {
            const pos = this.textareaEl.selectionStart ?? this.textareaEl.value.length;
            const val = this.textareaEl.value;
            const insertText = `\n${doc.example}\n`;
            this.textareaEl.value = val.slice(0, pos) + insertText + val.slice(pos);
            this.renderHighlight();
            this.options.onChange?.(this.textareaEl.value);
            pop.remove();
        });

        return pop;
    }
}
