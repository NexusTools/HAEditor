import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { fileURLToPath } from "url";
import {
    HybridArtEngine,
    HaEditorConfigManager,
    SharedObjectLibrary,
    ImageCodecRegistry,
    type ArtCanvasState,
    type ArtLayerSpec,
    type SharedObjectCanvasSpec,
    type VectorObjectSpec
} from "@nexustools/hacanvas";
import { AbstractUIComponent } from "../ui/abstract-ui-component.js";

/**
 * Abstract observable state class that shares subscription notification and batching across state managers.
 */
export abstract class AbstractObservableState {
    private readonly subscribers: Set<() => void> = new Set();

    public subscribe(listener: () => void): () => void {
        this.subscribers.add(listener);
        return () => this.subscribers.delete(listener);
    }

    public notify(): void {
        for (const fn of this.subscribers) {
            fn();
        }
    }
}

export type SharedObjectEditMode = "none" | "in_place" | "isolated_tab";

export interface InPlaceEditContext {
    refInstanceId: string;
    sharedObjectId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

export interface EditorToolOptions {
    primaryColor: string;
    secondaryColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
    brushSize: number;
    brushHardness: number;
    fillTolerance: number;
    fillType: "flood" | "linear_gradient" | "radial_gradient";
    shapeSides: number;
    starInnerRadius: number;
    cornerRadius: number;
    fontFamily: string;
    fontSize: number;
    textContent: string;
    closedPath: boolean;
}

export interface EditorClipboardBuffer {
    name: string;
    kind: "vector" | "raster";
    width: number;
    height: number;
    originX: number;
    originY: number;
    vectorObjects?: VectorObjectSpec[];
    rasterPixels?: Buffer;
    timestamp: number;
}

/**
 * Central state manager for `workspace/haeditor`, inheriting observer pub/sub from `AbstractObservableState`.
 */
export class EditorSessionState extends AbstractObservableState {
    public readonly projectRoot: string;
    public readonly engine: HybridArtEngine;
    public readonly configManager: HaEditorConfigManager;
    public readonly library: SharedObjectLibrary;

    public canvasId = "main_document";
    public hasOpenCanvas = false;
    public currentFilePath: string | null = null;
    public lastExportedFilePath: string | null = null;
    private _activeToolId = "vector_select";
    private _activeLayerId: string | undefined;
    public lastVectorToolId = "vector_select";
    public lastRasterToolId = "raster_brush";
    public selectedObjectIds: string[] = [];

    public get activeToolId(): string {
        return this._activeToolId;
    }

    public set activeToolId(toolId: string) {
        this._activeToolId = toolId;
        if (toolId.startsWith("vector_")) {
            this.lastVectorToolId = toolId;
        } else if (toolId.startsWith("raster_") || toolId.startsWith("select_")) {
            this.lastRasterToolId = toolId;
        }
    }

    public get activeLayerId(): string | undefined {
        return this._activeLayerId;
    }

    public set activeLayerId(layerId: string | undefined) {
        this._activeLayerId = layerId;
        this.syncToolWithActiveLayer();
    }

    public currentFrame = 0;
    public onionSkin = false;
    public isPlayingAnimation = false;
    public zoom = 1.0;
    public previousZoom = 1.0;
    public statusMessage = "Ready — Right-click anywhere for GIMP context menus, or double-click any Shared Object instance to edit it In-Place.";

    // GIMP View / Display State
    public showSelection = true;
    public showLayerBoundary = true;
    public showCanvasBoundary = true;
    public showGuides = false;
    public guides: Array<{ id?: string; orientation: "horizontal" | "vertical"; position: number }> = [
        { id: "guide_h_default", orientation: "horizontal", position: 180 },
        { id: "guide_v_default", orientation: "vertical", position: 280 }
    ];
    public showGrid = false;
    public gridSpacing = 32;
    public gridColor = "rgba(0, 212, 255, 0.28)";
    public showSamplePoints = false;
    public snapToGuides = true;
    public snapToGrid = false;
    public snapToCanvas = false;
    public snapToCanvasEdges = false;
    public snapToVectors = false;
    public snapToActivePath = false;
    public panX = 0;
    public panY = 0;
    public paddingColorMode: "theme" | "light_check" | "dark_check" | "custom" = "theme";
    public customPaddingColor = "#11131c";
    public showMenubar = true;
    public showRulers = true;
    public showScrollbars = true;
    public showStatusbar = true;
    public hideDocks = false;
    public quickMaskActive = false;
    public viewFlipH = false;
    public viewFlipV = false;
    public viewRotationDeg = 0;

    // GIMP Clipboard & Named Buffers
    public clipboard: EditorClipboardBuffer | null = null;
    public readonly namedBuffers: Map<string, EditorClipboardBuffer> = new Map();
    public systemClipboardOverride?: { text?: string; imageDataUri?: string } | null;
    private lastCopiedSystemText: string | null = null;
    public lastPastePromise: Promise<boolean> = Promise.resolve(false);
    public errorDialogHandler: ((title: string, message: string, details?: string) => void) | null = null;

    // GIMP Filter Repeat History
    public lastFilterUsed: { filterType: any; displayName: string; params: Record<string, any> } | null = null;
    public recentFilters: Array<{ filterType: any; displayName: string; params: Record<string, any> }> = [];

    public get lastFilterExecution(): { filterType: any; displayName: string; options: Record<string, any> } | null {
        if (!this.lastFilterUsed) return null;
        return {
            filterType: this.lastFilterUsed.filterType,
            displayName: this.lastFilterUsed.displayName,
            options: this.lastFilterUsed.params
        };
    }

    // Shared Object Editing Modes ("none" = Main Canvas, "in_place" = Embedded In-Place with darkened canvas, "isolated_tab" = Dedicated Sub-Canvas Tab)
    public editMode: SharedObjectEditMode = "none";
    public activeSharedObjectId: string | undefined;
    public inPlaceContext: InPlaceEditContext | undefined;
    public openSharedObjectTabs: string[] = [];

    public toolOptions: EditorToolOptions = {
        primaryColor: "#00d4ff",
        secondaryColor: "#ff3366",
        strokeColor: "#ffffff",
        strokeWidth: 2,
        opacity: 1.0,
        brushSize: 8,
        brushHardness: 0.85,
        fillTolerance: 20,
        fillType: "flood",
        shapeSides: 5,
        starInnerRadius: 22,
        cornerRadius: 6,
        fontFamily: "sans-serif",
        fontSize: 16,
        textContent: "HAEDITOR",
        closedPath: true
    };

    constructor(projectRoot: string, configDir?: string) {
        super();
        this.projectRoot = projectRoot;
        this.configManager = new HaEditorConfigManager(configDir);
        this.library = new SharedObjectLibrary(this.configManager);
        this.engine = new HybridArtEngine(projectRoot);

        // Hook engine creation/loading methods so `hasOpenCanvas` automatically becomes true whenever a document is created or opened
        const origCreateCanvas = this.engine.createCanvas.bind(this.engine);
        this.engine.createCanvas = ((canvasId: string, ...rest: any[]) => {
            const res = (origCreateCanvas as any)(canvasId, ...rest) as ArtCanvasState;
            if (canvasId === this.canvasId) {
                this.hasOpenCanvas = true;
                const topLayer = res.layers[res.layers.length - 1] || res.layers[0];
                if (topLayer && (!this._activeLayerId || !res.layers.some((l) => l.id === this._activeLayerId))) {
                    this.activeLayerId = topLayer.id;
                }
            }
            return res;
        }) as typeof this.engine.createCanvas;

        const origLoadFromFile = this.engine.loadFromFile.bind(this.engine);
        this.engine.loadFromFile = ((canvasId: string, filePath: string, opts?: any) => {
            const res = origLoadFromFile(canvasId, filePath, opts);
            if (canvasId === this.canvasId) {
                this.hasOpenCanvas = true;
                this.resolveActiveLayer();
            }
            return res;
        }) as typeof this.engine.loadFromFile;

        const origImportArtFile = this.engine.importArtFile.bind(this.engine);
        this.engine.importArtFile = ((filePath: string, opts: any) => {
            const res = origImportArtFile(filePath, opts);
            if (opts?.canvasId === this.canvasId) {
                this.hasOpenCanvas = true;
                this.resolveActiveLayer();
            }
            return res;
        }) as typeof this.engine.importArtFile;
    }

    public ensureCanvasOpen(width = 640, height = 420, backgroundColor = "#161822"): ArtCanvasState {
        if (!this.hasOpenCanvas || !this.engine.hasCanvas(this.canvasId)) {
            const st = this.engine.createCanvas(this.canvasId, width, height, backgroundColor, [
                { name: "Backdrop Raster Layer", type: "raster", visible: true, opacity: 1.0, blendMode: "normal" },
                { name: "Artwork Vector Layer", type: "vector", visible: true, opacity: 1.0, blendMode: "normal" }
            ]);
            this.hasOpenCanvas = true;
            this.activeLayerId = st.layers[st.layers.length - 1]?.id || st.layers[0]?.id;
            return st;
        }
        return this.engine.loadCanvas(this.canvasId);
    }

    public closeMainCanvas(): void {
        this.editMode = "none";
        this.activeSharedObjectId = undefined;
        this.inPlaceContext = undefined;
        this.openSharedObjectTabs = [];
        this.selectedObjectIds = [];
        this._activeLayerId = undefined;
        this.currentFilePath = null;
        this.hasOpenCanvas = false;
        try {
            this.engine.deleteCanvas(this.canvasId);
        } catch {
            // Ignore cleanup error
        }
        this.statusMessage = "Closed document — Click New or Open on the HACanvas splash screen to start.";
        this.notify();
    }

    public getCanvasState(): ArtCanvasState {
        if (this.hasOpenCanvas && this.engine.hasCanvas(this.canvasId)) {
            return this.engine.loadCanvas(this.canvasId);
        }
        return {
            canvasId: this.canvasId,
            width: 640,
            height: 420,
            dpi: 96,
            backgroundColor: "#161822",
            selection: { mode: "none", inverted: false, x: 0, y: 0, width: 640, height: 420 },
            layers: [],
            sharedObjects: {},
            animation: { fps: 12, durationFrames: 1, loop: true, tracks: [] },
            timeline: { fps: 12, totalFrames: 1, keyframes: [] }
        };
    }

    public setZoom(newZoom: number): void {
        const clamped = Math.max(0.125, Math.min(16.0, Number(newZoom.toFixed(3))));
        if (clamped !== this.zoom) {
            this.previousZoom = this.zoom;
            this.zoom = clamped;
            this.setStatus(`Zoom set to ${Math.round(this.zoom * 100)}%.`);
        }
    }

    public revertZoom(): void {
        const prev = this.previousZoom || 1.0;
        this.previousZoom = this.zoom;
        this.zoom = prev;
        this.setStatus(`Reverted zoom to ${Math.round(this.zoom * 100)}%.`);
    }

    public recordFilterExecution(filterType: any, displayName: string, params: Record<string, any>): void {
        const entry = { filterType, displayName, params: { ...params } };
        this.lastFilterUsed = entry;
        this.recentFilters = [
            entry,
            ...this.recentFilters.filter(f => f.filterType !== filterType)
        ].slice(0, 8);
    }

    // ============================================================================
    // Undo / Redo / History Operations (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
    // ============================================================================

    public undo(): boolean {
        const res = this.engine.undo(this.canvasId);
        if (!res.undone) {
            this.setStatus("Nothing to undo.");
            return false;
        }
        this.resolveActiveLayer();
        this.setStatus(`Undid: ${res.label || "Last Action"} (Ctrl+Z)`);
        return true;
    }

    public redo(): boolean {
        const res = this.engine.redo(this.canvasId);
        if (!res.redone) {
            this.setStatus("Nothing to redo.");
            return false;
        }
        this.resolveActiveLayer();
        this.setStatus(`Redid: ${res.label || "Next Action"} (Ctrl+Y)`);
        return true;
    }

    public clearUndoHistory(): void {
        this.engine.clearUndoHistory(this.canvasId);
        this.setStatus("Cleared undo history.");
    }

    // ============================================================================
    // GIMP Clipboard & Named Buffer Operations (Cut, Copy, Copy Visible, Paste)
    // ============================================================================

    public copy(visibleComposite = false, bufferName?: string): boolean {
        const cState = this.getCanvasState();
        const layers = this.getActiveContainerLayers();

        // If vector objects are selected and not explicitly copying composite visible pixels, copy vector objects
        if (!visibleComposite && this.selectedObjectIds.length > 0) {
            const copiedObjs: VectorObjectSpec[] = [];
            let minX = cState.width, minY = cState.height, maxX = 0, maxY = 0;
            for (const l of layers) {
                if (l.type !== "vector") continue;
                for (const obj of l.objects) {
                    if (this.selectedObjectIds.includes(obj.id)) {
                        copiedObjs.push(JSON.parse(JSON.stringify(obj)));
                        const bb = this.engine.computeObjectBoundingBox(obj, cState);
                        minX = Math.min(minX, bb.x);
                        minY = Math.min(minY, bb.y);
                        maxX = Math.max(maxX, bb.x + bb.width);
                        maxY = Math.max(maxY, bb.y + bb.height);
                    }
                }
            }
            if (copiedObjs.length > 0) {
                const clip: EditorClipboardBuffer = {
                    name: bufferName || `Vector Selection (${copiedObjs.length})`,
                    kind: "vector",
                    width: Math.max(16, Math.round(maxX - minX)),
                    height: Math.max(16, Math.round(maxY - minY)),
                    originX: Math.max(0, Math.round(minX)),
                    originY: Math.max(0, Math.round(minY)),
                    vectorObjects: copiedObjs,
                    timestamp: Date.now()
                };
                if (bufferName) {
                    this.namedBuffers.set(bufferName, clip);
                    this.setStatus(`Copied ${copiedObjs.length} vector object(s) to named buffer "${bufferName}".`);
                } else {
                    this.clipboard = clip;
                    this.lastCopiedSystemText = this.readSystemClipboard().text;
                    this.setStatus(`Copied ${copiedObjs.length} vector object(s) to clipboard (Ctrl+C).`);
                }
                return true;
            }
        }

        // Otherwise copy raster pixels (either active raster layer or visible composite)
        const rasterLayer = this.resolveActiveLayer("raster");
        const copiedRegion = this.engine.copyRegionPixels(this.canvasId, {
            layerId: rasterLayer?.id,
            visibleComposite: visibleComposite || !rasterLayer,
            sharedObjectId: this.activeSharedObjectId
        });
        const clip: EditorClipboardBuffer = {
            name: bufferName || (visibleComposite ? "Visible Canvas" : `Pixels (${copiedRegion.width}×${copiedRegion.height})`),
            kind: "raster",
            width: copiedRegion.width,
            height: copiedRegion.height,
            originX: copiedRegion.x,
            originY: copiedRegion.y,
            rasterPixels: copiedRegion.pixels,
            timestamp: Date.now()
        };
        if (bufferName) {
            this.namedBuffers.set(bufferName, clip);
            this.setStatus(`Copied ${clip.width}×${clip.height}px region to named buffer "${bufferName}".`);
        } else {
            this.clipboard = clip;
            this.lastCopiedSystemText = this.readSystemClipboard().text;
            this.setStatus(
                visibleComposite
                    ? `Copied visible region (${clip.width}×${clip.height}px) to clipboard (Ctrl+Shift+C).`
                    : `Copied ${clip.width}×${clip.height}px region to clipboard (Ctrl+C).`
            );
        }
        return true;
    }

    public cut(bufferName?: string): boolean {
        return this.engine.withUndoGroup(this.canvasId, bufferName ? `Cut Named (${bufferName})` : "Cut", () => {
            const hadVectorSel = this.selectedObjectIds.length > 0;
            this.copy(false, bufferName);
            this.engine.clearSelectionOrLayer(
                this.canvasId,
                this.activeLayerId,
                hadVectorSel ? this.selectedObjectIds : undefined,
                this.activeSharedObjectId
            );
            if (hadVectorSel) {
                this.selectedObjectIds = [];
            }
            this.setStatus(
                bufferName
                    ? `Cut selection into named buffer "${bufferName}".`
                    : `Cut selection to clipboard (Ctrl+X).`
            );
            return true;
        });
    }

    public showError(title: string, message: string, details?: string): void {
        this.setStatus(`Error: ${title} — ${message}${details ? " (" + details + ")" : ""}`);
        if (this.errorDialogHandler) {
            this.errorDialogHandler(title, message, details);
        }
    }

    /**
     * Reads text and/or raw image data from the OS system clipboard (`nw.Clipboard.get()`)
     * or returns `this.systemClipboardOverride` when set (e.g. in tests).
     */
    public readSystemClipboard(): { text: string; imageDataUri?: string } {
        if (this.systemClipboardOverride !== undefined) {
            return {
                text: (this.systemClipboardOverride?.text || "").trim(),
                imageDataUri: this.systemClipboardOverride?.imageDataUri
            };
        }

        try {
            const win = AbstractUIComponent.activeWindow || (typeof window !== "undefined" ? window : undefined);
            const nwObj =
                (globalThis as any).nw ||
                (win as any)?.nw ||
                (win?.top as any)?.nw ||
                (win?.parent as any)?.nw;
            const sysClip = nwObj?.Clipboard?.get?.();
            if (sysClip) {
                let text = "";
                try {
                    text = String(sysClip.get("text") || "").trim();
                } catch {
                    text = "";
                }
                let imageDataUri: string | undefined;
                try {
                    const types: string[] =
                        typeof sysClip.readAvailableTypes === "function" ? sysClip.readAvailableTypes() : [];
                    if (types.includes("png")) {
                        const png = sysClip.get("png", true);
                        if (typeof png === "string" && png.startsWith("data:image/")) {
                            imageDataUri = png;
                        }
                    } else if (types.includes("jpeg")) {
                        const jpg = sysClip.get("jpeg", true);
                        if (typeof jpg === "string" && jpg.startsWith("data:image/")) {
                            imageDataUri = jpg;
                        }
                    }
                } catch {
                    // Ignore raw image clipboard errors
                }
                return { text, imageDataUri };
            }
        } catch {
            // Ignore clipboard access error
        }

        return { text: "" };
    }

    public static normalizeClipboardUrl(rawText: string): string | null {
        const trimmed = (rawText || "")
            .trim()
            .replace(/^["'<]+|["'>]+$/g, "")
            .trim();
        if (!trimmed) return null;
        if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,\S+$/i.test(trimmed)) return trimmed;
        if (/^file:\/\/\S+$/i.test(trimmed)) return trimmed;
        if (/^www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/\S*$/i.test(trimmed)) return `https://${trimmed}`;
        return null;
    }

    private normalizePasteOptions(
        optsOrMode:
            | {
                  inPlace?: boolean;
                  intoSelection?: boolean;
                  asNewLayer?: boolean;
                  asNewImage?: boolean;
                  asNewSharedObject?: boolean;
                  bufferName?: string;
              }
            | "default"
            | "in_place"
            | "into_selection"
            | "new_layer"
            | "new_layer_in_place"
            | "new_image"
            | "new_shared_object" = {}
    ): {
        inPlace?: boolean;
        intoSelection?: boolean;
        asNewLayer?: boolean;
        asNewImage?: boolean;
        asNewSharedObject?: boolean;
        bufferName?: string;
    } {
        return typeof optsOrMode === "string"
            ? {
                  inPlace: optsOrMode === "in_place" || optsOrMode === "new_layer_in_place",
                  intoSelection: optsOrMode === "into_selection",
                  asNewLayer: optsOrMode === "new_layer" || optsOrMode === "new_layer_in_place",
                  asNewImage: optsOrMode === "new_image",
                  asNewSharedObject: optsOrMode === "new_shared_object"
              }
            : optsOrMode;
    }

    public paste(
        optsOrMode:
            | {
                  inPlace?: boolean;
                  intoSelection?: boolean;
                  asNewLayer?: boolean;
                  asNewImage?: boolean;
                  asNewSharedObject?: boolean;
                  bufferName?: string;
              }
            | "default"
            | "in_place"
            | "into_selection"
            | "new_layer"
            | "new_layer_in_place"
            | "new_image"
            | "new_shared_object" = {}
    ): boolean {
        const opts = this.normalizePasteOptions(optsOrMode);

        if (opts.bufferName) {
            const namedClip = this.namedBuffers.get(opts.bufferName);
            if (!namedClip) {
                this.showError(
                    "Clipboard Buffer Is Empty",
                    `Named clipboard buffer "${opts.bufferName}" is empty.`
                );
                this.lastPastePromise = Promise.resolve(false);
                return false;
            }
            const ok = this.applyClipboardPaste(namedClip, opts);
            this.lastPastePromise = Promise.resolve(ok);
            return ok;
        }

        const sysClip = this.readSystemClipboard();
        const hasNewExternalText =
            Boolean(sysClip.text) && (!this.clipboard || sysClip.text !== this.lastCopiedSystemText);
        const candidateUrl = hasNewExternalText ? EditorSessionState.normalizeClipboardUrl(sysClip.text) : null;

        if (candidateUrl) {
            this.lastPastePromise = this.pasteFromUrl(candidateUrl, opts);
            return true;
        }

        if (!this.clipboard && sysClip.imageDataUri) {
            this.lastPastePromise = this.pasteFromUrl(sysClip.imageDataUri, opts);
            return true;
        }

        if (!this.clipboard) {
            if (sysClip.text) {
                this.showError(
                    "Failed to Fetch Image from Clipboard",
                    "The clipboard does not contain an image or a valid image URL (http:// or https://).",
                    `Clipboard contents: "${sysClip.text.slice(0, 180)}"`
                );
            } else {
                this.showError(
                    "Clipboard Is Empty",
                    "Your clipboard is currently empty.\n\nCopy a selection or layer inside HAEditor (Ctrl+C), copy an image from another application, or copy an image URL (http:// or https://) before pasting."
                );
            }
            this.lastPastePromise = Promise.resolve(false);
            return false;
        }

        const ok = this.applyClipboardPaste(this.clipboard, opts);
        this.lastPastePromise = Promise.resolve(ok);
        return ok;
    }

    public async pasteAsync(
        optsOrMode:
            | {
                  inPlace?: boolean;
                  intoSelection?: boolean;
                  asNewLayer?: boolean;
                  asNewImage?: boolean;
                  asNewSharedObject?: boolean;
                  bufferName?: string;
              }
            | "default"
            | "in_place"
            | "into_selection"
            | "new_layer"
            | "new_layer_in_place"
            | "new_image"
            | "new_shared_object" = {}
    ): Promise<boolean> {
        this.paste(optsOrMode);
        return this.lastPastePromise;
    }

    /**
     * Fetches an image from a URL (`http://`, `https://`, `data:image/`, or `file://`) in the clipboard,
     * decodes it into RGBA pixels, and applies the requested paste operation (`New Image`, `New Layer`, etc.).
     * Shows an error dialog (`#ha-error-dialog`) if fetching or decoding fails.
     */
    public async pasteFromUrl(
        url: string,
        opts: {
            inPlace?: boolean;
            intoSelection?: boolean;
            asNewLayer?: boolean;
            asNewImage?: boolean;
            asNewSharedObject?: boolean;
        } = {}
    ): Promise<boolean> {
        const displayUrl = url.startsWith("data:") ? "data:image/... (clipboard image)" : url;
        this.setStatus(`Fetching image from clipboard URL: ${displayUrl}...`);
        try {
            const clip = await this.fetchAndDecodeUrlImage(url);
            this.clipboard = clip;
            this.lastCopiedSystemText = url;
            return this.applyClipboardPaste(clip, opts);
        } catch (err: any) {
            this.showError(
                "Failed to Fetch Image from Clipboard URL",
                `Could not fetch or decode a valid image from the clipboard URL:\n${displayUrl}`,
                err?.message || String(err)
            );
            return false;
        }
    }

    private async fetchAndDecodeUrlImage(url: string): Promise<EditorClipboardBuffer> {
        if (/^data:image\//i.test(url)) {
            const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/is);
            if (!match || !match[2]) {
                throw new Error("Malformed data:image URI in clipboard.");
            }
            const mime = (match[1] || "image/png").trim().toLowerCase();
            const buf = Buffer.from(match[2].trim(), "base64");
            if (buf.length === 0) {
                throw new Error("Clipboard data:image URI decoded to 0 bytes.");
            }
            return this.decodeImageBufferToClipboard(buf, "ClipboardImage", mime);
        }

        if (/^file:\/\//i.test(url)) {
            const localPath = fileURLToPath(url);
            if (!fs.existsSync(localPath)) {
                throw new Error(`File does not exist at path: ${localPath}`);
            }
            const buf = fs.readFileSync(localPath);
            return this.decodeImageBufferToClipboard(buf, path.basename(localPath));
        }

        const { buffer, contentType, finalUrl } = await this.fetchUrlBufferWithRedirects(url, 5);
        let sourceName = "ClipboardUrlImage";
        try {
            const parsed = new URL(finalUrl);
            const base = path.basename(parsed.pathname);
            if (base && base !== "/") {
                sourceName = base;
            }
        } catch {
            // Keep default name
        }
        return this.decodeImageBufferToClipboard(buffer, sourceName, contentType);
    }

    private fetchUrlBufferWithRedirects(
        urlStr: string,
        redirectsRemaining: number
    ): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
        return new Promise((resolve, reject) => {
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(urlStr);
            } catch {
                reject(new Error(`Invalid URL syntax: "${urlStr}"`));
                return;
            }

            if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
                reject(new Error(`Unsupported URL protocol "${parsedUrl.protocol}" (expected http: or https:).`));
                return;
            }

            const client = parsedUrl.protocol === "https:" ? https : http;
            const req = client.get(
                parsedUrl,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HAEditor/1.0 Chrome/124.0.0.0 Safari/537.36",
                        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                    },
                    timeout: 15000
                },
                (res) => {
                    const status = res.statusCode || 0;
                    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
                        res.resume();
                        if (redirectsRemaining <= 0) {
                            reject(new Error("Too many HTTP redirects while fetching image URL."));
                            return;
                        }
                        try {
                            const nextUrl = new URL(res.headers.location, parsedUrl).toString();
                            this.fetchUrlBufferWithRedirects(nextUrl, redirectsRemaining - 1).then(resolve, reject);
                        } catch (e) {
                            reject(e);
                        }
                        return;
                    }

                    if (status < 200 || status >= 300) {
                        res.resume();
                        reject(new Error(`Server responded with HTTP ${status} ${res.statusMessage || ""}.`.trim()));
                        return;
                    }

                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => {
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    });
                    res.on("end", () => {
                        const fullBuf = Buffer.concat(chunks);
                        if (fullBuf.length === 0) {
                            reject(new Error("Server returned an empty response body (0 bytes)."));
                            return;
                        }
                        const contentType = String(res.headers["content-type"] || "")
                            .split(";")[0]
                            .trim()
                            .toLowerCase();
                        resolve({ buffer: fullBuf, contentType, finalUrl: parsedUrl.toString() });
                    });
                    res.on("error", (err) => reject(err));
                }
            );

            req.on("timeout", () => {
                req.destroy(new Error("Timed out (15s) while fetching image from URL."));
            });
            req.on("error", (err) => {
                reject(err);
            });
        });
    }

    private async decodeImageBufferToClipboard(
        buf: Buffer,
        sourceName: string,
        contentType?: string
    ): Promise<EditorClipboardBuffer> {
        const headUtf8 = buf.subarray(0, Math.min(512, buf.length)).toString("utf8").trimStart().toLowerCase();
        if (
            contentType === "text/html" ||
            contentType === "application/json" ||
            headUtf8.startsWith("<!doctype html") ||
            headUtf8.startsWith("<html")
        ) {
            throw new Error(
                `The URL returned ${contentType || "an HTML webpage"} instead of an image file.`
            );
        }

        // 1. Try built-in HACanvas ImageCodecRegistry for signature-matched formats (PNG, BMP, GIF, PSD, XCF, AI, ORA, ICO, PPM, Farbfeld, etc.)
        try {
            const codec = ImageCodecRegistry.findCodecForBuffer(buf, sourceName);
            if (codec) {
                const doc = codec.decodeToDocument(buf, sourceName);
                if (doc && doc.width > 0 && doc.height > 0 && doc.layers.length > 0) {
                    const rasLayer = doc.layers.find((l) => l.type === "raster" && l.rgba && l.rgba.length >= doc.width * doc.height * 4);
                    if (rasLayer && rasLayer.rgba) {
                        return {
                            name: sourceName || `${doc.format.toUpperCase()} (${doc.width}×${doc.height})`,
                            kind: "raster",
                            width: doc.width,
                            height: doc.height,
                            originX: 0,
                            originY: 0,
                            rasterPixels: Buffer.from(rasLayer.rgba),
                            timestamp: Date.now()
                        };
                    }
                    const vecLayer = doc.layers.find((l) => l.type === "vector" && l.objects && l.objects.length > 0);
                    if (vecLayer && vecLayer.objects) {
                        return {
                            name: sourceName || `${doc.format.toUpperCase()} Vector (${doc.width}×${doc.height})`,
                            kind: "vector",
                            width: doc.width,
                            height: doc.height,
                            originX: 0,
                            originY: 0,
                            vectorObjects: vecLayer.objects,
                            timestamp: Date.now()
                        };
                    }
                }
            }
        } catch {
            // Fall through to Chromium HTMLImageElement decoder
        }

        // 2. Decode via Chromium / NW.js HTMLImageElement + offscreen <canvas> (supports JPEG, WebP, AVIF, PNG, GIF, BMP, ICO, SVG)
        const docObj = AbstractUIComponent.activeDocument || (typeof document !== "undefined" ? document : undefined);
        const winObj = AbstractUIComponent.activeWindow || (typeof window !== "undefined" ? window : undefined);
        const ImgCtor = (winObj as any)?.Image || (typeof Image !== "undefined" ? Image : undefined);

        if (docObj && ImgCtor) {
            let mime = contentType && contentType.startsWith("image/") ? contentType : "image/png";
            if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
                mime = "image/jpeg";
            } else if (
                buf.length >= 12 &&
                buf.toString("ascii", 0, 4) === "RIFF" &&
                buf.toString("ascii", 8, 12) === "WEBP"
            ) {
                mime = "image/webp";
            } else if (buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71) {
                mime = "image/png";
            } else if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") {
                mime = "image/gif";
            } else if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
                mime = "image/bmp";
            } else if (headUtf8.includes("<svg")) {
                mime = "image/svg+xml";
            }

            return await new Promise<EditorClipboardBuffer>((resolve, reject) => {
                const img = new ImgCtor();
                img.onload = () => {
                    const w = Math.max(1, img.naturalWidth || img.width || 0);
                    const h = Math.max(1, img.naturalHeight || img.height || 0);
                    if (!w || !h) {
                        reject(new Error("Decoded image has invalid 0×0 dimensions."));
                        return;
                    }
                    const offscreen = docObj.createElement("canvas");
                    offscreen.width = w;
                    offscreen.height = h;
                    const ctx = offscreen.getContext("2d");
                    if (!ctx) {
                        reject(new Error("Could not acquire 2D canvas context to decode image."));
                        return;
                    }
                    ctx.drawImage(img, 0, 0, w, h);
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const rgbaBuf = Buffer.from(
                        imgData.data.buffer,
                        imgData.data.byteOffset,
                        imgData.data.byteLength
                    );
                    resolve({
                        name: sourceName || `URL Image (${w}×${h})`,
                        kind: "raster",
                        width: w,
                        height: h,
                        originX: 0,
                        originY: 0,
                        rasterPixels: rgbaBuf,
                        timestamp: Date.now()
                    });
                };
                img.onerror = () => {
                    reject(
                        new Error(
                            `The resource at "${sourceName}" (${contentType || "unknown type"}, ${buf.length} bytes) could not be decoded as a valid image.`
                        )
                    );
                };
                img.src = `data:${mime};base64,${buf.toString("base64")}`;
            });
        }

        throw new Error(
            `Unsupported or corrupted image format for "${sourceName}" (${contentType || "unknown type"}).`
        );
    }

    private applyClipboardPaste(
        clip: EditorClipboardBuffer,
        opts: {
            inPlace?: boolean;
            intoSelection?: boolean;
            asNewLayer?: boolean;
            asNewImage?: boolean;
            asNewSharedObject?: boolean;
            bufferName?: string;
        }
    ): boolean {
        // If no canvas is open yet and the user pastes (e.g., Paste as New Layer or Paste from the Splash Screen),
        // automatically open a canvas sized to the clipboard content!
        if (!opts.asNewImage && (!this.hasOpenCanvas || !this.engine.hasCanvas(this.canvasId))) {
            const initW = Math.max(32, clip.width);
            const initH = Math.max(32, clip.height);
            this.ensureCanvasOpen(initW, initH);
        }

        if (opts.asNewSharedObject) {
            const w = Math.max(32, clip.width);
            const h = Math.max(32, clip.height);
            this.engine.withUndoGroup(this.canvasId, "Paste as New Shared Object", () => {
                const so = this.engine.createSharedObject(this.canvasId, {
                    name: `Clipboard/Pasted_${Date.now() % 10000}`,
                    category: "Clipboard",
                    width: w,
                    height: h
                });
                if (clip.kind === "vector" && clip.vectorObjects) {
                    const st = this.getCanvasState();
                    const vecL = st.sharedObjects[so.id].layers.find(l => l.type === "vector")!;
                    for (const obj of clip.vectorObjects) {
                        const clone: VectorObjectSpec = JSON.parse(JSON.stringify(obj));
                        clone.id = `${obj.id}_so_${Date.now() % 10000}`;
                        vecL.objects.push(clone);
                    }
                    this.engine.saveCanvas(st);
                } else if (clip.rasterPixels) {
                    const rasL = so.layers.find(l => l.type === "raster");
                    this.engine.pasteRegionPixels(
                        this.canvasId,
                        { width: clip.width, height: clip.height, x: 0, y: 0, pixels: clip.rasterPixels },
                        { layerId: rasL?.id, inPlace: true, sharedObjectId: so.id }
                    );
                }
                const vecMain = this.resolveActiveLayer("vector");
                const ref = this.engine.instantiateObjectRef(this.canvasId, so.id, {
                    layerId: vecMain?.id,
                    x: clip.originX,
                    y: clip.originY
                });
                this.selectedObjectIds = [ref.id];
            });
            this.setStatus("Pasted clipboard as a new reusable Shared Object.");
            return true;
        }

        if (opts.asNewImage) {
            this.exitSharedObjectEdit();
            const w = Math.max(32, clip.width);
            const h = Math.max(32, clip.height);
            this.engine.withUndoGroup(this.canvasId, "Paste as New Image", () => {
                this.engine.createCanvas(this.canvasId, w, h, "#181a24", [
                    { name: "Pasted Raster Layer", type: "raster", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Pasted Vector Layer", type: "vector", visible: true, opacity: 1, blendMode: "normal" }
                ]);
                if (clip.kind === "vector" && clip.vectorObjects) {
                    const st = this.getCanvasState();
                    const vecLayer = st.layers.find(l => l.type === "vector")!;
                    for (const obj of clip.vectorObjects) {
                        const clone: VectorObjectSpec = JSON.parse(JSON.stringify(obj));
                        clone.id = `${obj.id}_paste_${Date.now() % 10000}`;
                        if (clone.x !== undefined) clone.x = Math.max(0, clone.x - clip.originX);
                        if (clone.y !== undefined) clone.y = Math.max(0, clone.y - clip.originY);
                        vecLayer.objects.push(clone);
                    }
                    this.engine.saveCanvas(st);
                    this.activeLayerId = vecLayer.id;
                } else if (clip.rasterPixels) {
                    const rasLayer = this.resolveActiveLayer("raster");
                    this.engine.pasteRegionPixels(
                        this.canvasId,
                        { width: clip.width, height: clip.height, x: 0, y: 0, pixels: clip.rasterPixels },
                        { layerId: rasLayer?.id, inPlace: true }
                    );
                    if (rasLayer) {
                        this.activeLayerId = rasLayer.id;
                    }
                }
            });
            this.setStatus(`Created new ${w}×${h}px image from clipboard.`);
            return true;
        }

        if (clip.kind === "vector" && clip.vectorObjects && clip.vectorObjects.length > 0) {
            const label = opts.asNewLayer ? "Paste Vector as New Layer" : opts.inPlace ? "Paste Vector In Place" : "Paste Vector";
            this.engine.withUndoGroup(this.canvasId, label, () => {
                let targetLayer: ArtLayerSpec;
                if (opts.asNewLayer) {
                    targetLayer = this.engine.createLayer(this.canvasId, "Pasted Vector Layer", "vector", {
                        sharedObjectId: this.activeSharedObjectId
                    });
                } else {
                    targetLayer = this.resolveActiveLayer("vector");
                }
                const st = this.getCanvasState();
                const container = this.activeSharedObjectId ? st.sharedObjects[this.activeSharedObjectId] : st;
                const layer = container.layers.find(l => l.id === targetLayer.id) || container.layers[0];
                const offset = opts.inPlace ? 0 : 18;
                const newIds: string[] = [];

                for (const obj of clip.vectorObjects!) {
                    const clone: VectorObjectSpec = JSON.parse(JSON.stringify(obj));
                    clone.id = `${obj.id}_copy_${Date.now() % 10000}_${Math.floor(Math.random() * 100)}`;
                    if (clone.x !== undefined) clone.x += offset;
                    if (clone.y !== undefined) clone.y += offset;
                    if (clone.x2 !== undefined) clone.x2 += offset;
                    if (clone.y2 !== undefined) clone.y2 += offset;
                    if (clone.points) {
                        clone.points = clone.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
                    }
                    layer.objects.push(clone);
                    newIds.push(clone.id);
                }
                this.engine.saveCanvas(st);
                this.activeLayerId = layer.id;
                this.selectedObjectIds = newIds;
            });
            this.setStatus(`Pasted ${clip.vectorObjects.length} vector object(s)${opts.inPlace ? " in place" : ""}.`);
            return true;
        }

        if (clip.rasterPixels) {
            const hasUnlockedRaster = this.getActiveContainerLayers().some(
                (l) => l.type === "raster" && !l.locked
            );
            const useAsNewLayer = Boolean(opts.asNewLayer || !hasUnlockedRaster);
            const rasLayer = hasUnlockedRaster ? this.resolveActiveLayer("raster") : undefined;
            const pastedLayer = this.engine.pasteRegionPixels(
                this.canvasId,
                {
                    width: clip.width,
                    height: clip.height,
                    x: clip.originX,
                    y: clip.originY,
                    pixels: clip.rasterPixels
                },
                {
                    layerId: rasLayer?.id,
                    inPlace: opts.inPlace,
                    intoSelection: opts.intoSelection,
                    asNewLayer: useAsNewLayer,
                    newLayerName: clip.name ? `Pasted: ${clip.name}` : "Pasted Layer",
                    sharedObjectId: this.activeSharedObjectId
                }
            );
            this.activeLayerId = pastedLayer.id;
            this.setStatus(`Pasted ${clip.width}×${clip.height}px pixels onto "${pastedLayer.name}".`);
            return true;
        }

        return false;
    }

    public clearSelectionOrActive(): void {
        const res = this.engine.clearSelectionOrLayer(
            this.canvasId,
            this.activeLayerId,
            this.selectedObjectIds.length > 0 ? this.selectedObjectIds : undefined,
            this.activeSharedObjectId
        );
        if (res.clearedType === "vector_objects") {
            this.selectedObjectIds = [];
            this.setStatus(`Deleted ${res.count} selected vector object(s) (Delete).`);
        } else if (res.clearedType === "raster_pixels") {
            this.setStatus(`Cleared ${res.count} pixels on active raster layer (Delete).`);
        } else {
            this.setStatus(`Cleared ${res.count} vector object(s) on active layer.`);
        }
    }

    public fillWithColor(color: string, modeOrLabel: "solid" | "checker" | "stripes" | string = "solid"): void {
        const mode: "solid" | "checker" | "stripes" =
            modeOrLabel === "checker" || modeOrLabel === "Pattern"
                ? "checker"
                : modeOrLabel === "stripes"
                  ? "stripes"
                  : "solid";
        if (this.selectedObjectIds.length > 0 && mode === "solid") {
            this.engine.withUndoGroup(this.canvasId, `Fill Object (${color})`, () => {
                for (const id of this.selectedObjectIds) {
                    try {
                        this.engine.modifyObject(this.canvasId, id, { fill: color, fillOverride: color });
                    } catch {
                        // Ignore
                    }
                }
            });
            this.setStatus(`Filled ${this.selectedObjectIds.length} selected vector object(s) with ${color}.`);
            return;
        }
        const ras = this.resolveActiveLayer("raster");
        const res = this.engine.fillSelectionOrLayer(
            this.canvasId,
            ras?.id,
            color,
            { mode, secondaryColor: this.toolOptions.secondaryColor, cellSize: 12 },
            this.activeSharedObjectId
        );
        this.setStatus(
            `Filled ${res.pixelsFilled} pixels on "${ras?.name || res.layerId}" with ${mode === "solid" ? color : mode + " pattern"} (${modeOrLabel}).`
        );
    }

    /**
     * Returns the active layer list (either the Main Canvas layers or the active Shared Object's layers).
     */
    public getActiveContainerLayers(): ArtLayerSpec[] {
        const state = this.getCanvasState();
        if (this.activeSharedObjectId && state.sharedObjects[this.activeSharedObjectId]) {
            return state.sharedObjects[this.activeSharedObjectId].layers;
        }
        return state.layers;
    }

    public getActiveLayerList(): ArtLayerSpec[] {
        return this.getActiveContainerLayers();
    }

    public getActiveSharedObjectSpec(): SharedObjectCanvasSpec | undefined {
        if (!this.activeSharedObjectId) return undefined;
        const state = this.getCanvasState();
        return state.sharedObjects[this.activeSharedObjectId];
    }

    /**
     * Returns `"vector"` if the currently active layer is a vector layer, or `"raster"` if editing a raster layer.
     */
    public getActiveContextType(): "vector" | "raster" {
        try {
            const activeLayer = this.resolveActiveLayer();
            return activeLayer?.type === "raster" ? "raster" : "vector";
        } catch {
            return "vector";
        }
    }

    /**
     * Synchronizes `activeToolId` with the active layer's type (`"vector"` vs `"raster"`).
     */
    public syncToolWithActiveLayer(): void {
        try {
            const layers = this.getActiveContainerLayers();
            const layer = this._activeLayerId
                ? layers.find((l) => l.id === this._activeLayerId)
                : layers[0];
            if (!layer) return;
            if (layer.type === "vector") {
                if (!this._activeToolId.startsWith("vector_")) {
                    this._activeToolId = this.lastVectorToolId || "vector_select";
                }
            } else if (layer.type === "raster") {
                if (this._activeToolId.startsWith("vector_")) {
                    this._activeToolId = this.lastRasterToolId || "raster_brush";
                }
            }
        } catch {
            // Ignore when canvas is not yet initialized
        }
    }

    /**
     * Ensures `activeLayerId` points to a valid layer inside the current editing target (Main Canvas or Shared Object).
     */
    public resolveActiveLayer(preferredType?: "vector" | "raster"): ArtLayerSpec {
        const layers = this.getActiveContainerLayers();
        if (this._activeLayerId) {
            const exact = layers.find(l => l.id === this._activeLayerId);
            if (exact && (!preferredType || exact.type === preferredType)) {
                this.syncToolWithActiveLayer();
                return exact;
            }
        }
        if (preferredType) {
            const byType = layers.find(l => l.type === preferredType && !l.locked);
            if (byType) {
                this.activeLayerId = byType.id;
                return byType;
            }
        }
        const first = layers[0];
        if (first) {
            this.activeLayerId = first.id;
        }
        return first;
    }

    /**
     * Enters In-Place Shared Object Editing mode on the main canvas for a specific `<ObjectRef>` instance
     * (or the first `<ObjectRef>` referencing `sharedObjectId` on the main canvas, creating one if needed).
     * Everything outside the `<ObjectRef>` bounds on the main canvas is darkened while editing in place.
     */
    public enterInPlaceSharedObjectEdit(sharedObjectId: string, refInstanceId?: string): void {
        const state = this.getCanvasState();
        const sharedSpec = state.sharedObjects[sharedObjectId];
        if (!sharedSpec) return;

        let targetRef: VectorObjectSpec | undefined;
        for (const layer of state.layers) {
            if (layer.type !== "vector") continue;
            for (const obj of layer.objects) {
                if (obj.kind === "ref" && obj.refId === sharedObjectId) {
                    if (!refInstanceId || obj.id === refInstanceId) {
                        targetRef = obj;
                        break;
                    }
                }
            }
            if (targetRef) break;
        }

        if (!targetRef) {
            // Automatically place an instance on the main canvas so it can be edited in place
            targetRef = this.engine.instantiateObjectRef(this.canvasId, sharedObjectId, {
                x: Math.round((state.width - sharedSpec.width) / 2),
                y: Math.round((state.height - sharedSpec.height) / 2)
            });
        }

        this.editMode = "in_place";
        this.activeSharedObjectId = sharedObjectId;
        this.inPlaceContext = {
            refInstanceId: targetRef.id,
            sharedObjectId,
            x: targetRef.x ?? 0,
            y: targetRef.y ?? 0,
            width: sharedSpec.width,
            height: sharedSpec.height,
            scaleX: targetRef.scaleX ?? 1,
            scaleY: targetRef.scaleY ?? 1,
            rotation: targetRef.rotation ?? 0
        };
        this.activeLayerId = sharedSpec.layers[0]?.id;
        this.selectedObjectIds = [];
        this.statusMessage = `Editing Shared Object "${sharedSpec.name}" In-Place on Main Canvas (outside area darkened — press Esc to exit).`;
        this.notify();
    }

    /**
     * Opens a Shared Object in an Isolated Sub-Canvas Tab for dedicated full-frame symbol editing.
     */
    public enterIsolatedTabSharedObjectEdit(sharedObjectId: string): void {
        const state = this.getCanvasState();
        const sharedSpec = state.sharedObjects[sharedObjectId];
        if (!sharedSpec) return;

        if (!this.openSharedObjectTabs.includes(sharedObjectId)) {
            this.openSharedObjectTabs.push(sharedObjectId);
        }
        this.editMode = "isolated_tab";
        this.activeSharedObjectId = sharedObjectId;
        this.inPlaceContext = undefined;
        this.activeLayerId = sharedSpec.layers[0]?.id;
        this.selectedObjectIds = [];
        this.statusMessage = `Editing Shared Object "${sharedSpec.name}" in Isolated Tab (${sharedSpec.width}x${sharedSpec.height}).`;
        this.notify();
    }

    /**
     * Exits In-Place or Isolated Tab editing and returns to the Main Canvas.
     */
    public exitSharedObjectEdit(): void {
        const state = this.getCanvasState();
        this.editMode = "none";
        this.activeSharedObjectId = undefined;
        this.inPlaceContext = undefined;
        this.activeLayerId = state.layers[0]?.id;
        this.selectedObjectIds = [];
        this.statusMessage = "Returned to Main Canvas.";
        this.notify();
    }

    public closeSharedObjectTab(sharedObjectId: string): void {
        this.openSharedObjectTabs = this.openSharedObjectTabs.filter(id => id !== sharedObjectId);
        if (this.editMode === "isolated_tab" && this.activeSharedObjectId === sharedObjectId) {
            this.exitSharedObjectEdit();
        } else {
            this.notify();
        }
    }

    /**
     * Converts main-canvas pixel coordinates `(canvasX, canvasY)` into the active target's local coordinate system.
     * - When `editMode === "in_place"`, applies the inverse translation/rotation/scale of the active `<ObjectRef>`!
     * - Otherwise returns `(canvasX, canvasY)` directly.
     */
    public canvasToActiveTargetCoords(canvasX: number, canvasY: number): { x: number; y: number } {
        if (this.editMode === "in_place" && this.inPlaceContext) {
            const ctx = this.inPlaceContext;
            const dx = canvasX - ctx.x;
            const dy = canvasY - ctx.y;
            const rotRad = ((ctx.rotation || 0) * Math.PI) / 180;
            const cosR = Math.cos(-rotRad);
            const sinR = Math.sin(-rotRad);
            const rx = dx * cosR - dy * sinR;
            const ry = dx * sinR + dy * cosR;
            return {
                x: Math.round(rx / (ctx.scaleX || 1)),
                y: Math.round(ry / (ctx.scaleY || 1))
            };
        }
        let gx = Math.round(canvasX);
        let gy = Math.round(canvasY);
        if (this.snapToGrid && this.gridSpacing > 1) {
            gx = Math.round(gx / this.gridSpacing) * this.gridSpacing;
            gy = Math.round(gy / this.gridSpacing) * this.gridSpacing;
        }
        return { x: gx, y: gy };
    }

    public setStatus(msg: string): void {
        this.statusMessage = msg;
        this.notify();
    }

    public askAiHandler: ((promptText: string, autoSendMode?: "none" | "low" | "medium" | "max") => void) | null = null;

    public askAi(promptText: string, autoSendMode?: "none" | "low" | "medium" | "max"): void {
        if (this.askAiHandler) {
            this.askAiHandler(promptText, autoSendMode);
        }
    }
}
