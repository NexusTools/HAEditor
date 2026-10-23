import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { TestRunner, expect } from "./TestRunner.js";
import {
    HybridArtEngine,
    RasterFilterRegistry,
    AbstractRasterFilter,
    ImageCodecRegistry,
    AbstractImageCodec,
    AiCodec,
    parseAiBuffer,
    encodeRgbaToPng,
    HaEditorConfigManager,
    SharedObjectLibrary,
    parseSharedObjectCategory,
    buildCategoryTree
} from "@nexustools/hacanvas";
import { EditorSessionState } from "../state/editor-state.js";
import { EditorToolRegistry, AbstractEditorTool } from "../tools/abstract-editor-tool.js";
import { HaEditorAiToolRegistry, AbstractAiTool, parsePartialJson } from "../ai/abstract-ai-tool.js";
import { LmStudioAiClient } from "../ai/lm-studio-client.js";
import {
    ContextualToolRegistry,
    Tool,
    AiProviderRegistry,
    resolveReasoningConfig,
    AiLiveChatController
} from "@nexustools/aitooling";

export function registerHaEditorTestSuites(runner: TestRunner): void {
    runner.registerSuite("AbstractClassHierarchiesAndRegistries", (suite) => {
        suite.it("registers all 6 GIMP raster filters inheriting from AbstractRasterFilter", () => {
            const filters = RasterFilterRegistry.getAllFilters();
            expect(filters.length).toBe(6);
            for (const f of filters) {
                expect(f instanceof AbstractRasterFilter).toBe(true);
            }
        });

        suite.it("registers multi-format codecs inheriting from AbstractImageCodec", () => {
            const codecs = ImageCodecRegistry.getAllCodecs();
            expect(codecs.length >= 10).toBe(true);
            for (const c of codecs) {
                expect(c instanceof AbstractImageCodec).toBe(true);
            }
        });

        suite.it("registers all 17 GIMP & Inkscape editor tools inheriting from AbstractEditorTool", () => {
            const tools = EditorToolRegistry.getAllTools();
            expect(tools.length).toBe(17);
            for (const t of tools) {
                expect(t instanceof AbstractEditorTool).toBe(true);
            }
        });
    });

    runner.registerSuite("GimpFiltersAndInkscapeVectors", (suite) => {
        suite.it("applies all 6 GIMP raster filters and Inkscape boolean/path operations", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-suite-"));
            try {
                const engine = new HybridArtEngine(tmpDir);
                engine.createCanvas("test_c", 120, 120, "#202030", [
                    { name: "Ras", type: "raster", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Vec", type: "vector", visible: true, opacity: 1, blendMode: "normal" }
                ]);

                engine.rasterStroke("test_c", "layer_1", {
                    tool: "brush",
                    points: [{ x: 20, y: 20 }, { x: 80, y: 80 }],
                    color: "#00ffcc",
                    size: 10
                });

                for (const ft of [
                    "gaussian_blur",
                    "sharpen",
                    "invert",
                    "threshold",
                    "brightness_contrast",
                    "drop_shadow"
                ] as const) {
                    engine.rasterFilter("test_c", "layer_1", {
                        filterType: ft,
                        radius: 2,
                        amount: 1.2,
                        threshold: 120,
                        brightness: 10,
                        contrast: 15
                    });
                }

                const r1 = engine.drawShape("test_c", "layer_2", {
                    kind: "rect",
                    x: 15,
                    y: 15,
                    width: 50,
                    height: 50,
                    fill: "#ff0055"
                });
                const r2 = engine.drawShape("test_c", "layer_2", {
                    kind: "circle",
                    x: 55,
                    y: 55,
                    r: 30,
                    fill: "#00aaff"
                });

                const unionObj = engine.pathOperation("test_c", "union", {
                    targetIds: [r1.id, r2.id]
                });
                expect(unionObj.kind).toBe("boolean");
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("SharedObjectCategorizationAndModes", (suite) => {
        suite.it("supports both slash-path categorization and explicit category fields", () => {
            const p1 = parseSharedObjectCategory("UI/Icons/Star");
            expect(p1.category).toBe("UI/Icons");
            expect(p1.displayName).toBe("Star");

            const p2 = parseSharedObjectCategory("PrimaryButton", "UI/Controls");
            expect(p2.category).toBe("UI/Controls");
            expect(p2.displayName).toBe("PrimaryButton");
            expect(p2.fullPath).toBe("UI/Controls/PrimaryButton");

            const tree = buildCategoryTree([
                { name: "UI/Icons/Star", category: "UI/Icons" },
                { name: "UI/Buttons/Submit", category: "UI/Buttons" }
            ]);
            expect(Boolean(tree.folders["UI"])).toBe(true);
            expect(Boolean(tree.folders["UI"].folders["Icons"])).toBe(true);
            expect(tree.folders["UI"].folders["Icons"].items.length).toBe(1);
        });

        suite.it("supports both In-Place Shared Object Editing (with coordinate mapping) and Isolated Tab Editing", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-modes-"));
            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                state.engine.createCanvas(state.canvasId, 400, 300, "#101018");
                const so = state.engine.createSharedObject(state.canvasId, {
                    id: "so_badge",
                    name: "UI/Badges/Hero",
                    category: "UI/Badges",
                    width: 80,
                    height: 80
                });
                const ref = state.engine.instantiateObjectRef(state.canvasId, so.id, {
                    x: 100,
                    y: 50
                });

                // 1. Enter In-Place editing on Main Canvas
                state.enterInPlaceSharedObjectEdit(so.id, ref.id);
                expect(state.editMode).toBe("in_place");
                expect(state.activeSharedObjectId).toBe(so.id);
                expect(Boolean(state.inPlaceContext)).toBe(true);

                // Verify main-canvas -> shared-object local coordinate conversion
                const local = state.canvasToActiveTargetCoords(125, 80);
                expect(local.x).toBe(25);
                expect(local.y).toBe(30);

                // 2. Switch to Isolated Sub-Canvas Tab editing
                state.enterIsolatedTabSharedObjectEdit(so.id);
                expect(state.editMode).toBe("isolated_tab");
                expect(state.openSharedObjectTabs).toContain(so.id);

                // 3. Exit back to Main Canvas
                state.exitSharedObjectEdit();
                expect(state.editMode).toBe("none");
                expect(state.activeSharedObjectId).toBeUndefined();
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("OSConfigAndReusableSharedObjectLibrary", (suite) => {
        suite.it("persists config.json and saves/imports reusable Shared Objects in the OS config library directory", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-lib-"));
            const cfgDir = path.join(tmpDir, "os-config");
            try {
                const cfgManager = new HaEditorConfigManager(cfgDir);
                const library = new SharedObjectLibrary(cfgManager);
                expect(fs.existsSync(cfgManager.getStoreFilePath())).toBe(true);

                const engine1 = new HybridArtEngine(tmpDir);
                engine1.createCanvas("proj_1", 200, 200, "#000000");
                const shared = engine1.createSharedObject("proj_1", {
                    id: "so_gem",
                    name: "Sprites/Items/RubyGem",
                    category: "Sprites/Items",
                    width: 64,
                    height: 64
                });
                engine1.drawShape("proj_1", shared.layers[0].id, {
                    sharedObjectId: shared.id,
                    kind: "polygon",
                    x: 8,
                    y: 8,
                    width: 48,
                    height: 48,
                    sides: 6,
                    fill: "#ff0055"
                });

                // Save to OS Config Library
                const libEntry = library.saveSharedObjectToLibrary(engine1, "proj_1", shared.id);
                expect(libEntry.category).toBe("Sprites/Items");
                expect(fs.existsSync(libEntry.filePath)).toBe(true);
                expect(library.listEntries().length).toBe(1);

                // Import into a brand new future project
                const engine2 = new HybridArtEngine(tmpDir);
                engine2.createCanvas("proj_2", 300, 300, "#111111");
                const imported = library.importIntoProject(libEntry.id, engine2, "proj_2", {
                    instantiateOnMainCanvas: true
                });
                expect(imported.sharedObject.name).toBe("Sprites/Items/RubyGem");
                expect(Boolean(imported.refObject)).toBe(true);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("AdobeIllustratorAiImport", (suite) => {
        suite.it("imports PostScript-based Adobe Illustrator (.ai) files with multiple layers, Bezier paths, and text", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-ai-ps-"));
            try {
                const psAiContent = [
                    "%!PS-Adobe-3.0",
                    "%%Creator: Adobe Illustrator(TM) 8.0",
                    "%%HiResBoundingBox: 0 0 320 240",
                    "%AI5_BeginLayer",
                    "1 1 1 1 0 0 0 79 128 255 Lb",
                    "(Background Shapes) Ln",
                    "0.2 0.6 1.0 Xa",
                    "0 0 0 XA",
                    "2 w",
                    "20 40 m",
                    "140 40 l",
                    "140 200 l",
                    "20 200 l",
                    "b",
                    "%AI5_EndLayer--",
                    "%AI5_BeginLayer",
                    "1 1 1 1 0 0 0 255 100 100 Lb",
                    "(Foreground Curves & Text) Ln",
                    "1.0 0.2 0.4 Xa",
                    "50 60 m",
                    "90 180 180 180 220 60 c",
                    "f",
                    "To",
                    "1 0 0 1 60 120 0 Tp",
                    "/_Helvetica 18 Tf",
                    "(AI VECTOR) Tx",
                    "TO",
                    "%AI5_EndLayer--"
                ].join("\n");

                const aiPath = path.join(tmpDir, "legacy_artwork.ai");
                fs.writeFileSync(aiPath, psAiContent, "latin1");

                const codec = ImageCodecRegistry.findCodecForBuffer(fs.readFileSync(aiPath), aiPath);
                expect(codec instanceof AiCodec).toBe(true);

                const engine = new HybridArtEngine(tmpDir);
                const res = engine.importArtFile(aiPath, {
                    canvasId: "ai_ps_canvas",
                    mode: "new_canvas"
                });

                expect(res.detectedFormat).toBe("ai");
                expect(res.width).toBe(320);
                expect(res.height).toBe(240);
                expect(res.layersImported).toBe(2);

                const state = engine.loadCanvas("ai_ps_canvas");
                expect(state.layers[0].name).toBe("Background Shapes");
                expect(state.layers[0].type).toBe("vector");
                expect(state.layers[0].objects.length).toBe(1);
                expect(state.layers[1].name).toBe("Foreground Curves & Text");
                expect(state.layers[1].objects.length).toBe(2);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        suite.it("imports modern PDF-compatible Adobe Illustrator (.ai) files with FlateDecode streams and OCG layers", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-ai-pdf-"));
            try {
                const streamContent = [
                    "/OC /MC0 BDC",
                    "q",
                    "0.1 0.8 0.4 rg",
                    "0 0 0 RG",
                    "3 w",
                    "30 50 120 90 re",
                    "B",
                    "Q",
                    "EMC",
                    "/OC /MC1 BDC",
                    "0 0.8 0.9 0 k",
                    "40 40 m",
                    "80 190 160 190 210 40 c",
                    "f",
                    "BT",
                    "/F1 21 Tf",
                    "50 140 Td",
                    "(PDF AI LAYER) Tj",
                    "ET",
                    "EMC"
                ].join("\n");

                const compressedStream = zlib.deflateSync(Buffer.from(streamContent, "latin1"));

                const header = Buffer.from(
                    [
                        "%PDF-1.5",
                        "%Illustrator PDF-Compatible AI",
                        "1 0 obj",
                        "<< /Type /Page /ArtBox [0 0 400 300] /Resources << /Properties << /MC0 10 0 R /MC1 11 0 R >> >> /Contents 5 0 R >>",
                        "endobj",
                        "10 0 obj",
                        "<< /Type /OCG /Name (AI Base Layer) >>",
                        "endobj",
                        "11 0 obj",
                        "<< /Type /OCG /Name (AI Badge Layer) >>",
                        "endobj",
                        `5 0 obj\n<< /Length ${compressedStream.length} /Filter /FlateDecode >>\nstream\n`
                    ].join("\n"),
                    "latin1"
                );
                const footer = Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1");
                const pdfAiBuf = Buffer.concat([header, compressedStream, footer]);

                const aiPath = path.join(tmpDir, "modern_cc_artwork.ai");
                fs.writeFileSync(aiPath, pdfAiBuf);

                const parsedDoc = parseAiBuffer(pdfAiBuf);
                expect(parsedDoc.format).toBe("ai");
                expect(parsedDoc.width).toBe(400);
                expect(parsedDoc.height).toBe(300);
                expect(parsedDoc.layers.length).toBe(2);
                expect(parsedDoc.layers[0].name).toBe("AI Base Layer");
                expect(parsedDoc.layers[0].objects?.[0].kind).toBe("rect");
                expect(parsedDoc.layers[1].name).toBe("AI Badge Layer");
                expect(parsedDoc.layers[1].objects?.length).toBe(2);

                const engine = new HybridArtEngine(tmpDir);
                const res = engine.loadFromFile("ai_pdf_canvas", aiPath, { mode: "new_canvas" });
                expect(res.detectedFormat).toBe("ai");
                expect(res.layersImported).toBe(2);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("LmStudioAiAssistantAndTooling", (suite) => {
        suite.it("connects to LM Studio at http://localhost:1234 by default and supports non-reasoning + 3 reasoning levels (low, medium, max)", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-ai-cfg-"));
            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                state.engine.createCanvas(state.canvasId, 480, 320, "#181a24");
                const client = new LmStudioAiClient(state);

                expect(client.getBaseUrl()).toBe("http://localhost:1234");
                expect(state.configManager.getConfig().lmStudioUrl).toBe("http://localhost:1234");
                expect(state.configManager.getConfig().defaultReasoningLevel).toBe("medium");

                // 1. Non-reasoning payload ("none")
                const fastPayload = client.buildRequestPayload(
                    [{ role: "user", content: "Inspect the canvas" }],
                    "none"
                );
                expect(fastPayload.reasoning_effort).toBe("none");
                expect(fastPayload.max_reasoning_tokens).toBe(0);
                expect(fastPayload.tools.length).toBe(26);

                // 2. 3 Reasoning levels ("low", "medium", "max")
                const lowPayload = client.buildRequestPayload(
                    [{ role: "user", content: "Draw a star" }],
                    "low"
                );
                expect(lowPayload.reasoning_effort).toBe("low");
                expect(lowPayload.reasoning_level).toBe("low");

                const medPayload = client.buildRequestPayload(
                    [{ role: "user", content: "Draw a star" }],
                    "medium"
                );
                expect(medPayload.reasoning_effort).toBe("medium");
                expect(medPayload.reasoning_level).toBe("medium");

                const maxPayload = client.buildRequestPayload(
                    [{ role: "user", content: "Draw a star" }],
                    "max"
                );
                expect(maxPayload.reasoning_effort).toBe("high");
                expect(maxPayload.reasoning_level).toBe("max");
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        suite.it("parses incomplete streaming JSON tool arguments via parsePartialJson and executes all 26 AI tools across every editor feature", async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-ai-tools-"));
            try {
                const allTools = HaEditorAiToolRegistry.getAllTools();
                expect(allTools.length).toBe(26);
                for (const t of allTools) {
                    expect(t instanceof AbstractAiTool).toBe(true);
                }

                // Verify partial JSON parsing for live tool rendering
                const partial1 = parsePartialJson('{"kind": "star", "x": 140, "y": 95, "fill": "#00d4');
                expect(partial1.kind).toBe("star");
                expect(partial1.x).toBe(140);
                expect(partial1.fill).toBe("#00d4");
                const liveLabel = HaEditorAiToolRegistry.getLiveToolStatusLabel(
                    "draw_vector_shape",
                    partial1,
                    '{"kind": "star", "x": 140'
                );
                expect(liveLabel.includes("star")).toBe(true);

                // Execute inspect, canvas, layer, vector, raster, filter, shared_object, library, animation, and export tools
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                await HaEditorAiToolRegistry.getTool("create_new_canvas")!.execute(state, {
                    width: 400,
                    height: 300,
                    backgroundColor: "#121624"
                });

                const statusRes = await HaEditorAiToolRegistry.getTool("inspect_canvas_status")!.execute(state, {});
                expect(statusRes.width).toBe(400);
                expect(statusRes.height).toBe(300);

                const starObj = await HaEditorAiToolRegistry.getTool("draw_vector_shape")!.execute(state, {
                    kind: "star",
                    x: 100,
                    y: 80,
                    width: 60,
                    height: 60,
                    sides: 5,
                    fill: "#ffcc00",
                    stroke: "#ffffff"
                });
                expect(starObj.kind).toBe("star");

                const strokeRes = await HaEditorAiToolRegistry.getTool("paint_raster_stroke")!.execute(state, {
                    tool: "brush",
                    points: [{ x: 20, y: 20 }, { x: 120, y: 80 }],
                    color: "#00d4ff",
                    size: 12
                });
                expect(strokeRes.pointsDrawn).toBe(2);

                const filterRes = await HaEditorAiToolRegistry.getTool("apply_gimp_filter")!.execute(state, {
                    filterType: "gaussian_blur",
                    radius: 2
                });
                expect(filterRes.filterType).toBe("gaussian_blur");

                const sharedRes = await HaEditorAiToolRegistry.getTool("create_shared_object")!.execute(state, {
                    name: "UI/Badges/AiGem",
                    category: "UI/Badges",
                    width: 80,
                    height: 80,
                    instantiateOnCanvas: true,
                    x: 220,
                    y: 120
                });
                expect(sharedRes.sharedObject.name).toBe("UI/Badges/AiGem");
                expect(Boolean(sharedRes.refInstance)).toBe(true);

                const kfRes = await HaEditorAiToolRegistry.getTool("set_animation_keyframe")!.execute(state, {
                    targetId: starObj.id,
                    property: "rotation",
                    frame: 8,
                    value: 180
                });
                expect(kfRes.property).toBe("rotation");

                const snapRes = await HaEditorAiToolRegistry.getTool("capture_canvas_snapshot")!.execute(state, {
                    targetType: "canvas"
                });
                expect(snapRes.width).toBe(400);
                expect(snapRes.previewBase64.length > 50).toBe(true);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("GimpUndoRedoClipboardAndTransforms", (suite) => {
        suite.it("supports multi-step Undo (Ctrl+Z), Redo (Ctrl+Y), Cut, Copy, Paste, and Image/Layer Transforms", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-undo-"));
            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                state.engine.createCanvas(state.canvasId, 320, 240, "#181a24", [
                    { name: "Base Raster", type: "raster", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Main Vector", type: "vector", visible: true, opacity: 1, blendMode: "normal" }
                ]);
                state.engine.resetUndoHistory(state.canvasId, "Base Image");
                expect(state.engine.canUndo(state.canvasId)).toBe(false);

                const drawn = state.engine.drawShape(state.canvasId, "layer_2", {
                    kind: "rect",
                    x: 40,
                    y: 40,
                    width: 80,
                    height: 60,
                    fill: "#00d4ff"
                });
                expect(state.engine.canUndo(state.canvasId)).toBe(true);
                expect(state.getCanvasState().layers[1].objects.length).toBe(1);

                // Undo drawing the shape
                const undid = state.undo();
                expect(undid).toBe(true);
                expect(state.getCanvasState().layers[1].objects.length).toBe(0);
                expect(state.engine.canRedo(state.canvasId)).toBe(true);

                // Redo drawing the shape
                const redid = state.redo();
                expect(redid).toBe(true);
                expect(state.getCanvasState().layers[1].objects.length).toBe(1);

                // Copy & Paste vector shape
                state.selectedObjectIds = [drawn.id];
                expect(state.copy(false)).toBe(true);
                expect(state.paste("default")).toBe(true);
                expect(state.getCanvasState().layers[1].objects.length).toBe(2);

                // Rotate 90 CW image transform and undo it
                state.engine.transformCanvas(state.canvasId, "rotate_90_cw");
                expect(state.getCanvasState().width).toBe(240);
                expect(state.getCanvasState().height).toBe(320);
                state.undo();
                expect(state.getCanvasState().width).toBe(320);
                expect(state.getCanvasState().height).toBe(240);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        suite.it("switches toolbox context and active tool between vector and raster layers", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-ctx-"));
            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                state.engine.createCanvas(state.canvasId, 320, 240, "#181a24", [
                    { name: "Base Raster", type: "raster", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Main Vector", type: "vector", visible: true, opacity: 1, blendMode: "normal" }
                ]);

                // Activate Vector layer -> context is "vector", tools are vector tools
                state.activeLayerId = "layer_2";
                expect(state.getActiveContextType()).toBe("vector");
                expect(state.activeToolId).toBe("vector_select");
                const vecTools = EditorToolRegistry.getToolsForContext("vector");
                expect(vecTools.length).toBe(9);
                expect(vecTools.every(t => t.category === "vector")).toBe(true);

                state.activeToolId = "vector_star";
                expect(state.lastVectorToolId).toBe("vector_star");

                // Switch to Raster layer -> context is "raster", activeToolId automatically becomes raster tool
                state.activeLayerId = "layer_1";
                expect(state.getActiveContextType()).toBe("raster");
                expect(state.activeToolId).toBe("raster_brush");
                const rasTools = EditorToolRegistry.getToolsForContext("raster");
                expect(rasTools.length).toBe(8);
                expect(rasTools.every(t => t.category === "raster" || t.category === "selection")).toBe(true);

                state.activeToolId = "raster_flood_fill";
                expect(state.lastRasterToolId).toBe("raster_flood_fill");

                // Switch back to Vector layer -> remembers last vector tool ("vector_star")
                state.activeLayerId = "layer_2";
                expect(state.getActiveContextType()).toBe("vector");
                expect(state.activeToolId).toBe("vector_star");
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        suite.it("supports @nexustools/aitooling ContextualToolRegistry, custom code providers, and varied reasoning levels", async () => {
            // 1. ContextualToolRegistry plan-gating
            const ctxRegistry = new ContextualToolRegistry<{ hasTaskListBeenCreated: boolean; enforcePlanGate: boolean }>();
            ctxRegistry.registerTool(new Tool("@read_files", "Read files", {}, async () => "ok"));
            ctxRegistry.registerTool(new Tool("@create_task_list", "Create tasks", {}, async () => "ok"));
            ctxRegistry.registerTool(new Tool("edit_files", "Edit files", {}, async () => "ok"));

            const beforePlan = ctxRegistry.getActiveToolNames({ hasTaskListBeenCreated: false, enforcePlanGate: true });
            expect(beforePlan.includes("@read_files")).toBe(true);
            expect(beforePlan.includes("@create_task_list")).toBe(true);
            expect(beforePlan.includes("edit_files")).toBe(false);

            const afterPlan = ctxRegistry.getActiveToolNames({ hasTaskListBeenCreated: true, enforcePlanGate: true });
            expect(afterPlan.includes("@read_files")).toBe(true);
            expect(afterPlan.includes("@create_task_list")).toBe(false);
            expect(afterPlan.includes("edit_files")).toBe(true);

            // 2. Varied reasoning levels (none, low, medium, max)
            expect(resolveReasoningConfig("none").maxReasoningTokens).toBe(0);
            expect(resolveReasoningConfig("low").openaiEffort).toBe("low");
            expect(resolveReasoningConfig("medium").openaiEffort).toBe("medium");
            expect(resolveReasoningConfig("max").openaiEffort).toBe("high");

            // 3. Custom AI Service Provider registered via code
            AiProviderRegistry.registerProvider({
                providerId: "test-custom-llm",
                displayName: "Test Custom LLM",
                defaultModel: "custom-70b",
                defaultBaseUrl: "http://127.0.0.1:9999",
                fetchModels: async () => ["custom-70b", "custom-8b"]
            });
            try {
                const options = AiLiveChatController.getProviderSelectOptions();
                expect(options.some(o => o.value === "test-custom-llm")).toBe(true);
            } finally {
                AiProviderRegistry.unregisterProvider("test-custom-llm");
            }
        });

        suite.it("fetches image from clipboard URL on paste and shows error dialogs for failed URL or empty clipboard", async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-clip-url-"));
            const pngW = 48;
            const pngH = 36;
            const rgba = Buffer.alloc(pngW * pngH * 4);
            for (let i = 0; i < pngW * pngH; i++) {
                rgba[i * 4] = 20;
                rgba[i * 4 + 1] = 200;
                rgba[i * 4 + 2] = 255;
                rgba[i * 4 + 3] = 255;
            }
            const validPngBuf = encodeRgbaToPng(pngW, pngH, rgba);

            const server = http.createServer((req, res) => {
                if (req.url && req.url.startsWith("/valid-image.png")) {
                    res.writeHead(200, { "Content-Type": "image/png" });
                    res.end(validPngBuf);
                } else if (req.url && req.url.startsWith("/webpage")) {
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end("<!DOCTYPE html><html><body>Not an image</body></html>");
                } else {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Not Found");
                }
            });

            await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
            const port = (server.address() as any).port;

            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                const errorsShown: Array<{ title: string; message: string; details?: string }> = [];
                state.errorDialogHandler = (title, message, details) => {
                    errorsShown.push({ title, message, details });
                };

                // 1. Genuinely empty clipboard -> shows "Clipboard Is Empty" error dialog
                state.clipboard = null;
                state.systemClipboardOverride = { text: "" };
                const emptyRes = await state.pasteAsync("new_image");
                expect(emptyRes).toBe(false);
                expect(errorsShown.length).toBe(1);
                expect(errorsShown[0].title).toContain("Clipboard Is Empty");

                // 2. Broken image URL (HTTP 404) -> shows "Failed to Fetch Image from Clipboard URL" error dialog
                state.clipboard = null;
                state.systemClipboardOverride = { text: `http://127.0.0.1:${port}/missing.png` };
                const brokenRes = await state.pasteAsync("new_image");
                expect(brokenRes).toBe(false);
                expect(errorsShown.length).toBe(2);
                expect(errorsShown[1].title).toContain("Failed to Fetch Image");

                // 3. HTML webpage URL -> fails image decode and shows error dialog
                state.clipboard = null;
                state.systemClipboardOverride = { text: `http://127.0.0.1:${port}/webpage` };
                const htmlRes = await state.pasteAsync("new_layer");
                expect(htmlRes).toBe(false);
                expect(errorsShown.length).toBe(3);

                // 4. Valid image URL -> Paste as New Image creates canvas of image dimensions (48x36)
                state.clipboard = null;
                state.systemClipboardOverride = { text: `http://127.0.0.1:${port}/valid-image.png` };
                const newImgOk = await state.pasteAsync("new_image");
                expect(newImgOk).toBe(true);
                expect(state.hasOpenCanvas).toBe(true);
                expect(state.getCanvasState().width).toBe(pngW);
                expect(state.getCanvasState().height).toBe(pngH);

                // 5. Valid image URL -> Paste as New Layer appends a new raster layer with the fetched image
                const layersBefore = state.getCanvasState().layers.length;
                state.clipboard = null;
                state.systemClipboardOverride = { text: `http://127.0.0.1:${port}/valid-image.png?layer=2` };
                const newLayerOk = await state.pasteAsync("new_layer");
                expect(newLayerOk).toBe(true);
                expect(state.getCanvasState().layers.length).toBe(layersBefore + 1);
            } finally {
                await new Promise<void>((resolve) => server.close(() => resolve()));
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });
}
