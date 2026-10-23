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
    inspectIcoBuffer,
    decodeIcoToLayers,
    HaEditorConfigManager,
    SharedObjectLibrary,
    parseSharedObjectCategory,
    buildCategoryTree,
    extractJpegExifMetadata,
    extractPngMetadata,
    evaluateCubicBezierEasing,
    BUILT_IN_RASTER_BLEND_PRESETS,
    BUILT_IN_GIMP_FILTER_PRESETS,
    GIMP_FILTER_CATEGORIES,
    RASTER_TRANSITION_CATEGORIES,
    GIMP_JS_INTERNAL_DOCS
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
        suite.it("registers all 85+ categorized GIMP raster filters inheriting from AbstractRasterFilter with full JS source code", () => {
            const filters = RasterFilterRegistry.getAllFilters();
            expect(filters.length >= 85).toBe(true);
            for (const f of filters) {
                expect(f instanceof AbstractRasterFilter).toBe(true);
                expect(typeof f.code).toBe("string");
                expect(f.code.length > 30).toBe(true);
                expect(typeof f.category).toBe("string");
                expect(f.category.length > 0).toBe(true);
            }
            const byCat = RasterFilterRegistry.getFiltersByCategory();
            for (const cat of GIMP_FILTER_CATEGORIES.filter(c => c !== "Custom")) {
                const inCat = byCat.get(cat) || [];
                expect(inCat.length >= 2).toBe(true);
            }
        });

        suite.it("registers multi-format codecs inheriting from AbstractImageCodec", () => {
            const codecs = ImageCodecRegistry.getAllCodecs();
            expect(codecs.length >= 10).toBe(true);
            for (const c of codecs) {
                expect(c instanceof AbstractImageCodec).toBe(true);
            }
        });

        suite.it("registers all 18 GIMP & Inkscape editor tools inheriting from AbstractEditorTool", () => {
            const tools = EditorToolRegistry.getAllTools();
            expect(tools.length).toBe(18);
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
                expect(fastPayload.tools.length).toBe(33);

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

        suite.it("parses incomplete streaming JSON tool arguments via parsePartialJson and executes all 33 AI tools across every editor feature", async () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-ai-tools-"));
            try {
                const allTools = HaEditorAiToolRegistry.getAllTools();
                expect(allTools.length).toBe(33);
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
                    endFrame: 12,
                    value: 180,
                    easing: "custom_bezier",
                    curveControlPoints: [0.42, 0, 0.58, 1],
                    properties: { skewX: 15, skewY: -10 }
                });
                expect(kfRes.property).toBe("rotation");

                // Execute configure_animation_curve AI tool
                const curveToolRes = await HaEditorAiToolRegistry.getTool("configure_animation_curve")!.execute(state, {
                    action: "save_preset",
                    name: "AI Elastic Snap",
                    controlPoints: [0.22, 1.3, 0.36, 1.0]
                });
                expect(curveToolRes.preset.name).toBe("AI Elastic Snap");

                const applyCurveRes = await HaEditorAiToolRegistry.getTool("configure_animation_curve")!.execute(state, {
                    action: "apply_to_keyframe",
                    targetId: starObj.id,
                    frame: 8,
                    presetId: curveToolRes.preset.id
                });
                expect(applyCurveRes.updatedCount >= 1).toBe(true);

                // Execute deform_vector_object AI tool
                const lineForDeform = await HaEditorAiToolRegistry.getTool("draw_vector_shape")!.execute(state, {
                    kind: "line",
                    x: 40,
                    y: 40,
                    x2: 140,
                    y2: 40,
                    stroke: "#00ffcc"
                });
                const deformToolRes = await HaEditorAiToolRegistry.getTool("deform_vector_object")!.execute(state, {
                    objectId: lineForDeform.id,
                    mode: "bend_segment",
                    t: 0.5,
                    targetX: 90,
                    targetY: 10
                });
                expect(deformToolRes.cx).toBe(90);

                // Execute configure_raster_keyframe_blend AI tool (list_presets + save_preset with category)
                const listBlendsRes = await HaEditorAiToolRegistry.getTool("configure_raster_keyframe_blend")!.execute(state, {
                    action: "list_presets"
                });
                expect(listBlendsRes.presets.length >= 14).toBe(true);
                expect(listBlendsRes.presets.every((p: any) => typeof p.code === "string" && p.code.length > 20 && typeof p.category === "string")).toBe(true);

                const customBlendRes = await HaEditorAiToolRegistry.getTool("configure_raster_keyframe_blend")!.execute(state, {
                    action: "save_preset",
                    name: "AI Horizontal Split Blend",
                    category: "Wipe & Sweep",
                    code: `const total = width * height; for (let p = 0; p < total; p++) { const x = (p % width) / Math.max(1, width - 1); const wB = x <= t ? 1 : 0; const i = p * 4; outBuf[i] = Math.round(bufA[i]*(1-wB) + bufB[i]*wB); outBuf[i+1] = Math.round(bufA[i+1]*(1-wB) + bufB[i+1]*wB); outBuf[i+2] = Math.round(bufA[i+2]*(1-wB) + bufB[i+2]*wB); outBuf[i+3] = Math.round(bufA[i+3]*(1-wB) + bufB[i+3]*wB); }`
                });
                expect(customBlendRes.preset.name).toBe("AI Horizontal Split Blend");
                expect(customBlendRes.preset.category).toBe("Wipe & Sweep");

                // Execute configure_gimp_filter_preset AI tool (list_categories, inspect_preset, inspect_internal_docs, save_preset, apply_preset)
                const filterCatsRes = await HaEditorAiToolRegistry.getTool("configure_gimp_filter_preset")!.execute(state, {
                    action: "list_categories"
                });
                expect(filterCatsRes.categories.length >= 13).toBe(true);
                expect(filterCatsRes.totalPresets >= 85).toBe(true);

                const inspectFilterRes = await HaEditorAiToolRegistry.getTool("configure_gimp_filter_preset")!.execute(state, {
                    action: "inspect_preset",
                    filterId: "whirl_pinch"
                });
                expect(inspectFilterRes.preset.category).toBe("Distorts");
                expect(inspectFilterRes.preset.code.includes("sampleBilinear")).toBe(true);

                const inspectDocRes = await HaEditorAiToolRegistry.getTool("configure_gimp_filter_preset")!.execute(state, {
                    action: "inspect_internal_docs",
                    symbolName: "helpers.perlin2d"
                });
                expect(Boolean(inspectDocRes.doc)).toBe(true);
                expect(inspectDocRes.doc.symbol).toBe("helpers.perlin2d");

                const savedCustomFilterRes = await HaEditorAiToolRegistry.getTool("configure_gimp_filter_preset")!.execute(state, {
                    action: "save_preset",
                    name: "AI Cyan Tint Boost",
                    category: "Colors",
                    description: "Boosts green and blue channels using custom JS",
                    code: `const total = width * height; for (let p = 0; p < total; p++) { const i = p * 4; outBuf[i] = srcBuf[i] >> 1; outBuf[i+1] = helpers.clamp255(srcBuf[i+1] + 40); outBuf[i+2] = helpers.clamp255(srcBuf[i+2] + 60); outBuf[i+3] = srcBuf[i+3]; }`
                });
                expect(savedCustomFilterRes.preset.name).toBe("AI Cyan Tint Boost");
                expect(savedCustomFilterRes.preset.category).toBe("Colors");

                const appliedCustomFilter = await HaEditorAiToolRegistry.getTool("configure_gimp_filter_preset")!.execute(state, {
                    action: "apply_preset",
                    filterId: savedCustomFilterRes.preset.id
                });
                expect(appliedCustomFilter.filterType).toBe(savedCustomFilterRes.preset.id);

                // Attach a dynamic filter via apply_gimp_filter ("attach") and verify inspect_layer returns full filter settings
                const attachFilterRes = await HaEditorAiToolRegistry.getTool("apply_gimp_filter")!.execute(state, {
                    action: "attach",
                    targetType: "layer",
                    layerId: "layer_1",
                    filterType: "gaussian_blur",
                    radius: 4
                });
                expect(attachFilterRes.attachedFilter.filterType).toBe("gaussian_blur");

                const inspectedLayerRes = await HaEditorAiToolRegistry.getTool("inspect_layer")!.execute(state, {
                    layerId: "layer_1"
                });
                expect(Array.isArray(inspectedLayerRes.attachedFilters)).toBe(true);
                expect(inspectedLayerRes.attachedFilters.length).toBe(1);
                expect(inspectedLayerRes.attachedFilters[0].filterType).toBe("gaussian_blur");
                expect(inspectedLayerRes.attachedFilters[0].activeParams.radius).toBe(4);
                expect(Array.isArray(inspectedLayerRes.attachedFilters[0].parameterSchemas)).toBe(true);

                // Verify deform_vector_object on geometric shapes (rect -> curved edge, add_vertex, inspect_nodes)
                const rectForDeform = await HaEditorAiToolRegistry.getTool("draw_vector_shape")!.execute(state, {
                    kind: "rect",
                    x: 20,
                    y: 20,
                    width: 80,
                    height: 50,
                    fill: "#ff3366"
                });
                const deformedRect = await HaEditorAiToolRegistry.getTool("deform_vector_object")!.execute(state, {
                    objectId: rectForDeform.id,
                    mode: "bend_segment",
                    segmentIndex: 0,
                    t: 0.5,
                    targetX: 60,
                    targetY: 5
                });
                expect(Boolean(deformedRect.d && deformedRect.d.includes("Q"))).toBe(true);
                expect(Array.isArray(deformedRect.points) && deformedRect.points.length === 4).toBe(true);

                const addedVertexRect = await HaEditorAiToolRegistry.getTool("deform_vector_object")!.execute(state, {
                    objectId: rectForDeform.id,
                    mode: "add_vertex",
                    segmentIndex: 1,
                    t: 0.5
                });
                expect(addedVertexRect.points.length).toBe(5);

                const inspectedNodes = await HaEditorAiToolRegistry.getTool("deform_vector_object")!.execute(state, {
                    objectId: rectForDeform.id,
                    mode: "inspect_nodes"
                });
                expect(inspectedNodes.points.length).toBe(5);
                expect(inspectedNodes.segments.some((s: any) => s.curved)).toBe(true);

                // Verify inspect_animation_timeline returns easing curves & transition info
                const timelineInspection = await HaEditorAiToolRegistry.getTool("inspect_animation_timeline")!.execute(state, {});
                expect(timelineInspection.fps).toBe(12);
                expect(Array.isArray(timelineInspection.tracks)).toBe(true);
                expect(timelineInspection.tracks.length >= 1).toBe(true);
                const rotTrack = timelineInspection.tracks.find((t: any) => t.property === "rotation");
                expect(Boolean(rotTrack)).toBe(true);
                expect(Array.isArray(rotTrack.keyframes[0].sampledEasingCurve)).toBe(true);
                expect(Array.isArray(timelineInspection.availableCurvePresets)).toBe(true);
                expect(Array.isArray(timelineInspection.availableRasterBlendPresets)).toBe(true);

                // Verify manage_metadata_and_fonts and undo_redo_and_transform AI tools
                const metaRes = await HaEditorAiToolRegistry.getTool("manage_metadata_and_fonts")!.execute(state, {
                    action: "set_metadata",
                    title: "AI Modular Masterpiece",
                    author: "HAEditor AI"
                });
                expect(metaRes.metadata.title).toBe("AI Modular Masterpiece");

                const histRes = await HaEditorAiToolRegistry.getTool("undo_redo_and_transform")!.execute(state, {
                    action: "inspect_history"
                });
                expect(histRes.canUndo).toBe(true);

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
                expect(vecTools.length).toBe(10);
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

        suite.it("exports multi-layer ICO with per-layer GIMP icon formats (32/24/8/4/1 bpp & Compressed PNG) and format-specific options", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-fmt-export-"));
            try {
                const engine = new HybridArtEngine(tmpDir);
                engine.createCanvas("ico_canvas", 64, 64, "#00000000", [
                    { name: "Icon 16x16", type: "raster", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Icon 32x32 Paletted", type: "raster", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Icon 64x64 PNG", type: "vector", visible: true, opacity: 1, blendMode: "normal" }
                ]);
                engine.rasterFill("ico_canvas", "layer_1", { fillType: "flood", x: 16, y: 16, color: "#ff3366" });
                engine.rasterFill("ico_canvas", "layer_2", { fillType: "flood", x: 16, y: 16, color: "#00d4ff" });
                engine.drawShape("ico_canvas", "layer_3", {
                    kind: "star",
                    x: 8,
                    y: 8,
                    width: 48,
                    height: 48,
                    fill: "#ffd166",
                    stroke: "#ffffff",
                    strokeWidth: 2
                });

                // 1. Export multi-layer .ico where each layer is its own icon entry with custom bpp, size, and compression
                const icoPath = path.join(tmpDir, "multi_layer.ico");
                const icoRes = engine.exportCanvas("ico_canvas", "ico", icoPath, {
                    icoLayers: [
                        { layerId: "layer_1", include: true, bpp: 32, compressed: false, width: 16, height: 16 },
                        { layerId: "layer_2", include: true, bpp: 8, compressed: false, width: 32, height: 32 },
                        { layerId: "layer_3", include: true, bpp: 32, compressed: true, width: 64, height: 64 }
                    ]
                });
                expect(icoRes.iconCount).toBe(3);

                const icoBuf = fs.readFileSync(icoPath);
                const entries = inspectIcoBuffer(icoBuf);
                expect(entries.length).toBe(3);
                expect(entries[0].width).toBe(16);
                expect(entries[0].height).toBe(16);
                expect(entries[0].bpp).toBe(32);
                expect(entries[0].compressedPng).toBe(false);

                expect(entries[1].width).toBe(32);
                expect(entries[1].height).toBe(32);
                expect(entries[1].bpp).toBe(8);
                expect(entries[1].compressedPng).toBe(false);

                expect(entries[2].width).toBe(64);
                expect(entries[2].height).toBe(64);
                expect(entries[2].compressedPng).toBe(true);

                // Verify decoding multi-icon .ico back into separate layers
                const decodedLayers = decodeIcoToLayers(icoBuf);
                expect(decodedLayers.layers.length).toBe(3);
                expect(decodedLayers.width).toBe(64);
                expect(decodedLayers.height).toBe(64);

                // 2. PNG export options (compression level, pixelFormat, bKGD, pHYs, tIME, tEXt comment)
                const pngPath = path.join(tmpDir, "custom.png");
                engine.exportCanvas("ico_canvas", "png", pngPath, {
                    compressionLevel: 6,
                    pixelFormat: "rgba8",
                    saveBackground: true,
                    saveResolution: true,
                    saveCreationTime: true,
                    comment: "Created with HAEditor GIMP Export"
                });
                const pngBuf = fs.readFileSync(pngPath);
                expect(pngBuf.includes(Buffer.from("bKGD"))).toBe(true);
                expect(pngBuf.includes(Buffer.from("pHYs"))).toBe(true);
                expect(pngBuf.includes(Buffer.from("tIME"))).toBe(true);
                expect(pngBuf.includes(Buffer.from("tEXt"))).toBe(true);

                // 3. TGA RLE vs Uncompressed export options
                const tgaRlePath = path.join(tmpDir, "rle.tga");
                engine.exportCanvas("ico_canvas", "tga", tgaRlePath, {
                    rle: true,
                    origin: "top_left",
                    tgaBpp: 32
                });
                const tgaRleBuf = fs.readFileSync(tgaRlePath);
                expect(tgaRleBuf[2]).toBe(10); // Type 10 = RLE True-Color

                // 4. PPM ASCII (P3) vs Raw (P6)
                const ppmAsciiPath = path.join(tmpDir, "ascii.ppm");
                engine.exportCanvas("ico_canvas", "ppm", ppmAsciiPath, {
                    dataFormatting: "ascii"
                });
                const ppmAsciiStr = fs.readFileSync(ppmAsciiPath, "utf8");
                expect(ppmAsciiStr.startsWith("P3\n")).toBe(true);

                // 5. BMP 16-bit R5G6B5 & 32-bit V4 color space header
                const bmp16Path = path.join(tmpDir, "rgb565.bmp");
                engine.exportCanvas("ico_canvas", "bmp", bmp16Path, {
                    bmpBpp: 16,
                    topDown: true,
                    writeColorSpace: false
                });
                const bmp16Buf = fs.readFileSync(bmp16Path);
                expect(bmp16Buf.readUInt16LE(28)).toBe(16);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("PdfSupportSharedObjectRastersAndEmbeddedFonts", (suite) => {
        suite.it("exports multi-page PDF with selectable text & embedded fonts and imports PDF pages as vector layers with Shared Object rasters", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-pdf-"));
            try {
                const engine = new HybridArtEngine(tmpDir);
                engine.createCanvas("pdf_src", 400, 300, "#ffffff", [
                    { name: "Page 1 - Cover", type: "vector", visible: true, opacity: 1, blendMode: "normal" },
                    { name: "Page 2 - Diagram", type: "vector", visible: true, opacity: 1, blendMode: "normal" }
                ]);

                // Create a Shared Object containing a raster layer and instantiate it on Page 1
                const rasterBadge = engine.createSharedObject(
                    "pdf_src",
                    { id: "so_raster_img", name: "PDF/EmbeddedPhoto", category: "PDF", width: 32, height: 32 },
                    [{ name: "Raster Pixels", type: "raster", visible: true, opacity: 1, blendMode: "normal" }]
                );
                engine.rasterFill("pdf_src", rasterBadge.layers[0].id, {
                    sharedObjectId: rasterBadge.id,
                    fillType: "flood",
                    x: 8,
                    y: 8,
                    color: "#ff3366"
                });
                engine.instantiateObjectRef("pdf_src", rasterBadge.id, {
                    layerId: "layer_1",
                    x: 40,
                    y: 40
                });

                // Add editable text on Page 1 and Page 2
                engine.drawText("pdf_src", "layer_1", {
                    x: 50,
                    y: 120,
                    text: "Selectable PDF Headline",
                    fontFamily: "CustomHeadlineFont",
                    fontSize: 24,
                    fill: "#112244"
                });
                engine.drawShape("pdf_src", "layer_2", {
                    kind: "rect",
                    x: 30,
                    y: 30,
                    width: 160,
                    height: 90,
                    fill: "#00d4ff",
                    stroke: "#003355",
                    strokeWidth: 2
                });
                engine.drawText("pdf_src", "layer_2", {
                    x: 45,
                    y: 75,
                    text: "Second Page Editable Text",
                    fontFamily: "Helvetica",
                    fontSize: 18,
                    fill: "#000000"
                });

                // Export as multi-page PDF where each layer is a page
                const pdfPath = path.join(tmpDir, "multi_page_doc.pdf");
                const expRes = engine.exportCanvas("pdf_src", "pdf", pdfPath, {
                    layersAsPages: true,
                    embedFonts: true,
                    title: "HAEditor Multi-Page PDF",
                    author: "HAEditor Test Suite"
                });
                expect(expRes.bytesWritten > 200).toBe(true);

                const rawPdfStr = fs.readFileSync(pdfPath, "latin1");
                // Verify selectable PDF text operators (BT ... Tj ... ET) are present in the exported PDF
                expect(rawPdfStr.includes("BT")).toBe(true);
                expect(rawPdfStr.includes("(Selectable PDF Headline) Tj")).toBe(true);
                expect(rawPdfStr.includes("(Second Page Editable Text) Tj")).toBe(true);

                // Re-import the multi-page PDF into a fresh canvas
                const impRes = engine.importArtFile(pdfPath, {
                    canvasId: "pdf_imported",
                    mode: "new_canvas"
                });
                expect(impRes.detectedFormat).toBe("pdf");
                expect(impRes.layersImported).toBe(2);

                const importedState = engine.loadCanvas("pdf_imported");
                expect(importedState.layers.length).toBe(2);
                expect(importedState.layers[0].type).toBe("vector");
                expect(importedState.layers[1].type).toBe("vector");

                // Verify extracted embedded fonts from PDF
                const fonts = engine.listEmbeddedFonts("pdf_imported");
                expect(fonts.length >= 1).toBe(true);

                // Verify text objects were imported as editable "text" vector objects retaining font info
                const page1Texts = importedState.layers[0].objects.filter(o => o.kind === "text");
                expect(page1Texts.length >= 1).toBe(true);
                expect(page1Texts[0].text).toContain("Selectable PDF Headline");

                // Verify in-place text edit retains font family & size while updating text content
                const editedText = engine.modifyObject("pdf_imported", page1Texts[0].id, {
                    text: "Updated In-Place Headline"
                });
                expect(editedText.text).toBe("Updated In-Place Headline");
                expect(editedText.fontSize).toBe(page1Texts[0].fontSize);

                // Verify raster XObject in PDF was imported as a Shared Object containing a raster layer and placed via <ObjectRef>
                const page1Refs = importedState.layers[0].objects.filter(o => o.kind === "ref");
                expect(page1Refs.length >= 1).toBe(true);
                const refTargetId = page1Refs[0].refId!;
                const sharedRasterSpec = importedState.sharedObjects[refTargetId];
                expect(Boolean(sharedRasterSpec)).toBe(true);
                expect(sharedRasterSpec.layers.some(l => l.type === "raster")).toBe(true);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("DocumentMetadataAndMultiFormatExport", (suite) => {
        suite.it("stores JPEG-like EXIF/GPS/Author metadata in .hacanvas and exports it automatically to JPEG, PNG, PDF, and SVG", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-meta-"));
            try {
                const engine = new HybridArtEngine(tmpDir);
                engine.createCanvas("meta_canvas", 120, 90, "#223344");
                engine.setDocumentMetadata("meta_canvas", {
                    title: "Golden Gate Sunrise",
                    author: "Ada Lovelace",
                    copyright: "© 2026 Analytical Studio",
                    description: "Vector and raster study with GPS coordinates",
                    keywords: ["sunrise", "bridge", "vector"],
                    software: "HAEditor 1.0",
                    make: "Hasselblad",
                    model: "X2D 100C",
                    gps: {
                        latitude: 37.8199,
                        longitude: -122.4783,
                        altitude: 67.5,
                        locationName: "San Francisco, CA"
                    }
                });

                // 1. Round-trip through .hacanvas ZIP+XML (metadata/exif.xml)
                const hacPath = path.join(tmpDir, "with_meta.hacanvas");
                engine.saveCanvas("meta_canvas", hacPath);
                engine.importArtFile(hacPath, { canvasId: "meta_reloaded", mode: "new_canvas" });
                const reloadedMeta = engine.getDocumentMetadata("meta_reloaded");
                expect(reloadedMeta.title).toBe("Golden Gate Sunrise");
                expect(reloadedMeta.author).toBe("Ada Lovelace");
                expect(reloadedMeta.copyright).toBe("© 2026 Analytical Studio");
                expect(reloadedMeta.make).toBe("Hasselblad");
                expect(Math.abs((reloadedMeta.gps?.latitude || 0) - 37.8199) < 0.001).toBe(true);
                expect(Math.abs((reloadedMeta.gps?.longitude || 0) - -122.4783) < 0.001).toBe(true);

                // 2. Export to JPEG and verify APP1 EXIF + GPS + XMP extraction
                const jpgPath = path.join(tmpDir, "exported_meta.jpg");
                engine.exportCanvas("meta_reloaded", "jpg", jpgPath, { quality: 92 });
                const jpgMeta = extractJpegExifMetadata(fs.readFileSync(jpgPath));
                expect(Boolean(jpgMeta)).toBe(true);
                expect(jpgMeta?.author).toBe("Ada Lovelace");
                expect(jpgMeta?.title).toBe("Golden Gate Sunrise");
                expect(Math.abs((jpgMeta?.gps?.latitude || 0) - 37.8199) < 0.01).toBe(true);
                expect(Math.abs((jpgMeta?.gps?.longitude || 0) - -122.4783) < 0.01).toBe(true);

                // 3. Export to PNG and verify eXIf / iTXt / tEXt metadata extraction
                const pngPath = path.join(tmpDir, "exported_meta.png");
                engine.exportCanvas("meta_reloaded", "png", pngPath);
                const pngMeta = extractPngMetadata(fs.readFileSync(pngPath));
                expect(Boolean(pngMeta)).toBe(true);
                expect(pngMeta?.author).toBe("Ada Lovelace");
                expect(pngMeta?.title).toBe("Golden Gate Sunrise");
                expect(Math.abs((pngMeta?.gps?.latitude || 0) - 37.8199) < 0.01).toBe(true);

                // 4. Export to SVG and verify <metadata> block
                const svgPath = path.join(tmpDir, "exported_meta.svg");
                engine.exportCanvas("meta_reloaded", "svg", svgPath);
                const svgStr = fs.readFileSync(svgPath, "utf8");
                expect(svgStr.includes("<metadata>")).toBe(true);
                expect(svgStr.includes("Ada Lovelace")).toBe(true);
                expect(svgStr.includes("37.8199")).toBe(true);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    runner.registerSuite("TopTimelineCurvesSkewAndVectorDeform", (suite) => {
        suite.it("supports auto-collapsing top timeline, per-layer & Shared Object keyframes, custom cubic-Bezier curve presets, skew animation, and vector curve deformation", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-anim-deform-"));
            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                state.ensureCanvasOpen(320, 240, "#12141f");

                // 1. Timeline is collapsed by default when canvas has only 1 static frame
                expect(state.timelineCollapsed).toBe(true);

                // 2. Save a custom curve preset to HaEditorConfigManager
                const customPreset = state.configManager.saveCurvePreset({
                    name: "Dramatic Snap Overshoot",
                    controlPoints: [0.18, 0.89, 0.32, 1.28]
                });
                expect( state.configManager.listCurvePresets().some(p => p.id === customPreset.id) ).toBe(true);
                // Verify cubic-Bezier evaluator supports overshoot (> 1.0)
                const midVal = evaluateCubicBezierEasing(0.6, customPreset.controlPoints);
                expect(midVal > 0.8).toBe(true);

                // 3. Configure Main Canvas timeline with 12 frames, 24 FPS, and Infinite Loop back to Frame 0
                state.engine.configureTimeline(state.canvasId, {
                    fps: 24,
                    totalFrames: 12,
                    loop: true,
                    loopBackToFrame: 0
                });
                state.syncTimelineCollapseStateForActiveTab();
                expect(state.timelineCollapsed).toBe(false);

                // 4. Create a vector object with startFrame/endFrame span and animate x, y, skewX, skewY with custom curve
                const vecLayer = state.resolveActiveLayer("vector")!;
                const box = state.engine.drawShape(state.canvasId, vecLayer.id, {
                    kind: "rect",
                    x: 20,
                    y: 40,
                    width: 60,
                    height: 40,
                    fill: "#00e5ff"
                });
                state.engine.setTargetFrameRange(state.canvasId, box.id, 1, 10);

                state.engine.setKeyframe(state.canvasId, {
                    targetId: box.id,
                    frame: 1,
                    endFrame: 9,
                    easing: "custom_bezier",
                    curveControlPoints: [0.42, 0, 0.58, 1],
                    curvePresetId: "ease_in_out",
                    properties: { x: 20, y: 40, skewX: 0, skewY: 0 }
                });
                state.engine.setKeyframe(state.canvasId, {
                    targetId: box.id,
                    frame: 9,
                    easing: "linear",
                    properties: { x: 180, y: 120, skewX: 30, skewY: -15 }
                });

                const cState = state.getCanvasState();
                const updatedBox = cState.layers.find(l => l.id === vecLayer.id)!.objects.find(o => o.id === box.id)!;
                const atFrame5 = state.engine.resolveAnimatedObject(cState, updatedBox, 5);
                expect((atFrame5.x ?? 0) > 20 && (atFrame5.x ?? 0) < 180).toBe(true);
                expect((atFrame5.skewX ?? 0) > 0 && (atFrame5.skewX ?? 0) < 30).toBe(true);
                expect((atFrame5.skewY ?? 0) < 0 && (atFrame5.skewY ?? 0) > -15).toBe(true);

                // 5. Shared Object independent internal animation timeline
                const shared = state.engine.createSharedObject(state.canvasId, {
                    id: "so_spinner",
                    name: "Animated/Spinner",
                    width: 64,
                    height: 64
                });
                const soShape = state.engine.drawShape(state.canvasId, shared.layers[0].id, {
                    sharedObjectId: shared.id,
                    kind: "star",
                    x: 8,
                    y: 8,
                    width: 48,
                    height: 48,
                    fill: "#ffd166"
                });
                state.engine.configureTimeline(state.canvasId, {
                    sharedObjectId: shared.id,
                    fps: 30,
                    totalFrames: 8,
                    loop: true,
                    loopBackToFrame: 0
                });
                state.engine.setKeyframe(state.canvasId, {
                    sharedObjectId: shared.id,
                    targetId: soShape.id,
                    frame: 0,
                    properties: { rotation: 0 }
                });
                state.engine.setKeyframe(state.canvasId, {
                    sharedObjectId: shared.id,
                    targetId: soShape.id,
                    frame: 8,
                    properties: { rotation: 180 }
                });

                const cStateAfterSo = state.getCanvasState();
                const soTimeline = cStateAfterSo.sharedObjects[shared.id].animation!;
                expect(soTimeline.durationFrames).toBe(9);
                expect(soTimeline.fps).toBe(30);
                const soResolved = state.engine.resolveAnimatedObject(
                    cStateAfterSo,
                    cStateAfterSo.sharedObjects[shared.id].layers[0].objects[0],
                    4,
                    soTimeline
                );
                expect(Math.round(soResolved.rotation || 0)).toBe(90);

                // 6. VectorDeformTool: Bend line segment keeping endpoints pinned, then move endpoint retaining curve
                const lineObj = state.engine.drawShape(state.canvasId, vecLayer.id, {
                    kind: "line",
                    x: 40,
                    y: 100,
                    x2: 200,
                    y2: 100,
                    stroke: "#ff4081",
                    strokeWidth: 3
                });

                // Drag midpoint of line (t = 0.5) up to (120, 50) -> endpoints stay at (40,100) and (200,100)
                const bentLine = state.engine.deformVectorObject(state.canvasId, lineObj.id, {
                    mode: "bend_segment",
                    t: 0.5,
                    targetX: 120,
                    targetY: 50
                });
                expect(bentLine.x).toBe(40);
                expect(bentLine.y).toBe(100);
                expect(bentLine.x2).toBe(200);
                expect(bentLine.y2).toBe(100);
                expect(bentLine.cx).toBe(120);
                expect(bentLine.cy).toBe(0); // Since B(0.5) = 0.25*100 + 0.5*cy + 0.25*100 = 50 => cy = 0

                // Move right endpoint (pointIndex = 1) to (220, 120) while retaining the -100px vertical curve bend
                const movedEndLine = state.engine.deformVectorObject(state.canvasId, lineObj.id, {
                    mode: "move_endpoint",
                    pointIndex: 1,
                    targetX: 220,
                    targetY: 120
                });
                expect(movedEndLine.x).toBe(40);
                expect(movedEndLine.y).toBe(100);
                expect(movedEndLine.x2).toBe(220);
                expect(movedEndLine.y2).toBe(120);
                expect(Boolean(movedEndLine.cx !== undefined && movedEndLine.cy !== undefined)).toBe(true);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        suite.it("supports raster layer keyframe blending (intra-layer & cross-layer), visible JS code for all built-in presets, and custom JS blending presets persisted in .hacanvas & config", () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-raster-blend-"));
            try {
                const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                state.ensureCanvasOpen(40, 20, "#000000");

                // 1. All 14 categorized built-in raster blend presets must have readable, valid JavaScript source code and folder categories
                expect(BUILT_IN_RASTER_BLEND_PRESETS.length).toBe(14);
                for (const preset of BUILT_IN_RASTER_BLEND_PRESETS) {
                    expect(preset.builtIn).toBe(true);
                    expect(typeof preset.category).toBe("string");
                    expect((preset.category || "").length > 0).toBe(true);
                    expect(typeof preset.code).toBe("string");
                    expect(preset.code.length > 40).toBe(true);
                    const check = state.engine.validateRasterBlendScript(preset.code);
                    expect(check.valid).toBe(true);
                }

                // 2. Configure timeline (10 frames) and create 2 raster layers (Layer A = Red at frame 0, Blue at frame 8; Layer B = Green at frame 8)
                state.engine.configureTimeline(state.canvasId, { fps: 12, totalFrames: 10, loop: true });
                const rasLayerA = state.resolveActiveLayer("raster")!;
                const rasLayerB = state.engine.manageLayer(state.canvasId, "add", {
                    layerName: "Raster B",
                    layerType: "raster"
                }) as any;

                // Fill Layer A Frame 0 with pure Red (#ff0000), Frame 8 with pure Blue (#0000ff), and Layer B Frame 8 with pure Green (#00ff00)
                // 3. Intra-layer crossfade blend at Frame 4 (halfway between Frame 0 Red and Frame 8 Blue)
                state.engine.setRasterCelKeyframe(state.canvasId, {
                    layerId: rasLayerA.id,
                    frame: 0,
                    mode: "fill",
                    fillColor: "#ff0000",
                    endFrame: 8,
                    rasterBlendPresetId: "crossfade",
                    easing: "linear"
                });
                state.engine.setRasterCelKeyframe(state.canvasId, {
                    layerId: rasLayerA.id,
                    frame: 8,
                    mode: "fill",
                    fillColor: "#0000ff",
                    rasterBlendPresetId: "crossfade",
                    easing: "linear"
                });
                state.engine.setRasterCelKeyframe(state.canvasId, {
                    layerId: rasLayerB.id,
                    frame: 8,
                    mode: "fill",
                    fillColor: "#00ff00",
                    rasterBlendPresetId: "crossfade",
                    easing: "linear"
                });

                const cState1 = state.getCanvasState();
                const layerASpec1 = cState1.layers.find(l => l.id === rasLayerA.id)!;
                const midCrossfadeBuf = state.engine.resolveAnimatedRasterBuffer(cState1, layerASpec1, 4)!;
                // At frame 4 (t = 0.5), pixel (0,0) should be ~50% Red (~128) and ~50% Blue (~128)
                expect(midCrossfadeBuf[0] > 100 && midCrossfadeBuf[0] < 155).toBe(true);
                expect(midCrossfadeBuf[1]).toBe(0);
                expect(midCrossfadeBuf[2] > 100 && midCrossfadeBuf[2] < 155).toBe(true);

                // 4. Cross-layer keyframe blending: blend Layer A (Frame 0 Red) toward Layer B (Frame 8 Green)
                state.engine.setRasterCelKeyframe(state.canvasId, {
                    layerId: rasLayerA.id,
                    frame: 0,
                    endFrame: 8,
                    rasterBlendPresetId: "crossfade",
                    rasterBlendTargetLayerId: rasLayerB.id,
                    rasterBlendTargetFrame: 8,
                    easing: "linear"
                });
                const cState2 = state.getCanvasState();
                const layerASpec2 = cState2.layers.find(l => l.id === rasLayerA.id)!;
                const crossLayerBuf = state.engine.resolveAnimatedRasterBuffer(cState2, layerASpec2, 4)!;
                // Now at frame 4 (t = 0.5), Layer A blends Red (#ff0000) with Layer B's Green (#00ff00)!
                expect(crossLayerBuf[0] > 100 && crossLayerBuf[0] < 155).toBe(true);
                expect(crossLayerBuf[1] > 100 && crossLayerBuf[1] < 155).toBe(true);
                expect(crossLayerBuf[2]).toBe(0);

                // 5. Save and apply a Custom JavaScript Blending Preset and round-trip through .hacanvas
                const customJsCode = `
const total = width * height;
for (let p = 0; p < total; p++) {
    const i = p * 4;
    // Invert channel A and blend with B
    outBuf[i]     = Math.round((255 - bufA[i]) * (1 - t) + bufB[i] * t);
    outBuf[i + 1] = Math.round(bufA[i + 1] * (1 - t) + bufB[i + 1] * t);
    outBuf[i + 2] = Math.round(bufA[i + 2] * (1 - t) + bufB[i + 2] * t);
    outBuf[i + 3] = 255;
}`;
                const savedPreset = state.engine.saveCustomRasterBlendPreset(state.canvasId, {
                    name: "Invert Red Morph",
                    category: "Light & Chromatic",
                    description: "Inverts source red channel while morphing into target",
                    code: customJsCode
                });
                state.configManager.saveRasterBlendPreset(savedPreset);
                expect(state.configManager.listRasterBlendPresets().some(p => p.id === savedPreset.id)).toBe(true);

                // 6. Save a Custom Categorized GIMP Filter Preset and execute built-in GIMP filters across categories
                const customFilterCode = `
function boostBlueChannel(v, boost) {
    return helpers.clamp255(v + boost);
}
const boost = Number(params.boost ?? 50);
const total = width * height;
for (let p = 0; p < total; p++) {
    const i = p * 4;
    outBuf[i]     = srcBuf[i];
    outBuf[i + 1] = srcBuf[i + 1];
    outBuf[i + 2] = boostBlueChannel(srcBuf[i + 2], boost);
    outBuf[i + 3] = srcBuf[i + 3];
}`;
                const savedFilter = state.engine.saveCustomGimpFilterPreset(state.canvasId, {
                    name: "Sapphire Channel Boost",
                    category: "Colors/Custom",
                    description: "Custom JS filter with local function and helpers.clamp255",
                    parameterSchemas: [
                        { key: "boost", label: "Blue boost", type: "number", defaultValue: 50, min: 0, max: 255 }
                    ],
                    code: customFilterCode
                });
                state.configManager.saveGimpFilterPreset(savedFilter);

                for (const ft of ["whirl_pinch", "plasma", "cartoon", "edge_sobel", "sepia", savedFilter.id]) {
                    state.engine.rasterFilter(state.canvasId, rasLayerA.id, { filterType: ft, boost: 45 });
                }

                state.engine.setRasterCelKeyframe(state.canvasId, {
                    layerId: rasLayerA.id,
                    frame: 0,
                    endFrame: 8,
                    rasterBlendPresetId: savedPreset.id,
                    rasterBlendCustomCode: customJsCode,
                    rasterBlendTargetLayerId: rasLayerB.id,
                    rasterBlendTargetFrame: 8
                });

                const hacPath = path.join(tmpDir, "raster_blend_test.hacanvas");
                state.engine.saveCanvas(state.canvasId, hacPath);
                state.engine.importArtFile(hacPath, { canvasId: "reloaded_blend", mode: "new_canvas" });
                const reloadedPresets = state.engine.listRasterBlendPresets("reloaded_blend");
                expect(
                    reloadedPresets.some(
                        p =>
                            p.name === "Invert Red Morph" &&
                            p.category === "Light & Chromatic" &&
                            p.code.includes("255 - bufA[i]")
                    )
                ).toBe(true);

                const reloadedFilters = state.engine.listGimpFilterPresets("reloaded_blend");
                expect(
                    reloadedFilters.some(
                        f =>
                            f.name === "Sapphire Channel Boost" &&
                            f.category === "Colors/Custom" &&
                            f.code.includes("boostBlueChannel")
                    )
                ).toBe(true);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        suite.it(
            "supports non-destructive attached filters on layers, vector objects, and shared objects with object render caching, edit-time filter bypass, preview toggles, export rendering, and selective SVG/PDF rasterization",
            () => {
                const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haeditor-dynamic-filters-"));
                try {
                    const state = new EditorSessionState(tmpDir, path.join(tmpDir, "config"));
                    state.ensureCanvasOpen(120, 80, "#000000");

                    const rasLayer = state.resolveActiveLayer("raster")!;
                    const vecLayer = state.resolveActiveLayer("vector")!;

                    // 1. Paint raster layer at (10, 10) with pure Red (#ff0000) and attach an "invert" filter dynamically
                    state.engine.rasterStroke(state.canvasId, rasLayer.id, {
                        tool: "brush",
                        points: [{ x: 10, y: 10 }],
                        color: "#ff0000",
                        size: 20
                    });
                    const attachedRasFilter = state.engine.attachFilter(state.canvasId, {
                        targetType: "layer",
                        targetId: rasLayer.id,
                        filterType: "invert"
                    });
                    expect(attachedRasFilter.filterType).toBe("invert");
                    expect(attachedRasFilter.enabled).toBe(true);

                    // Underlying raw raster pixels must remain pure Red (#ff0000ff), while rendered layer/composite pixels are Cyan (#00ffffff)
                    const rawSample = state.engine.inspectPixels(
                        state.canvasId,
                        10,
                        10,
                        1,
                        1,
                        rasLayer.id,
                        0,
                        { rawRaster: true }
                    );
                    expect(rawSample.hex).toBe("#ff0000ff");

                    const renderedSample = state.engine.inspectPixels(
                        state.canvasId,
                        10,
                        10,
                        1,
                        1,
                        rasLayer.id
                    );
                    expect(renderedSample.hex).toBe("#00ffffff");

                    // 2. Toggle layer filter preview OFF -> interactive viewport shows raw Red (#ff0000ff), but export still renders Cyan (#00ffffff)
                    state.engine.setTargetFiltersEnabled(state.canvasId, {
                        targetType: "layer",
                        targetId: rasLayer.id,
                        enabled: false
                    });
                    const previewOffSample = state.engine.inspectPixels(state.canvasId, 10, 10, 1, 1);
                    expect(previewOffSample.hex).toBe("#ff0000ff");

                    const exportSampleWhilePreviewOff = state.engine.inspectPixels(
                        state.canvasId,
                        10,
                        10,
                        1,
                        1,
                        undefined,
                        0,
                        { forExport: true }
                    );
                    expect(exportSampleWhilePreviewOff.hex).toBe("#00ffffff");

                    // Also verify canvas-wide preview toggle (previewDynamicFilters = false)
                    state.engine.setTargetFiltersEnabled(state.canvasId, {
                        targetType: "layer",
                        targetId: rasLayer.id,
                        enabled: true
                    });
                    state.engine.setTargetFiltersEnabled(state.canvasId, {
                        targetType: "canvas",
                        enabled: false
                    });
                    const canvasPreviewOffSample = state.engine.inspectPixels(state.canvasId, 10, 10, 1, 1);
                    expect(canvasPreviewOffSample.hex).toBe("#ff0000ff");
                    state.engine.setTargetFiltersEnabled(state.canvasId, {
                        targetType: "canvas",
                        enabled: true
                    });

                    // 3. Attach filter directly to a Vector Object -> verify cached canvas rendering & edit-time filter bypass
                    const filteredRect = state.engine.drawShape(state.canvasId, vecLayer.id, {
                        kind: "rect",
                        x: 20,
                        y: 20,
                        width: 40,
                        height: 40,
                        fill: "#ff0000"
                    });
                    const unfilteredText = state.engine.drawText(state.canvasId, vecLayer.id, {
                        x: 70,
                        y: 40,
                        text: "Native Vector Label",
                        fontSize: 14,
                        fill: "#00ff00"
                    });
                    state.engine.attachFilter(state.canvasId, {
                        targetType: "object",
                        targetId: filteredRect.id,
                        filterType: "invert"
                    });

                    // Render twice and verify objectRenderCache evaluated the filter only once across multiple parent composites
                    const objRender1 = state.engine.inspectPixels(state.canvasId, 30, 30, 1, 1);
                    const objRender2 = state.engine.inspectPixels(state.canvasId, 30, 30, 1, 1);
                    expect(objRender1.hex).toBe("#00ffffff");
                    expect(objRender2.hex).toBe("#00ffffff");

                    const cacheStats = state.engine.getObjectCacheStats(state.canvasId, filteredRect.id);
                    expect(Boolean(cacheStats.entry)).toBe(true);
                    expect(cacheStats.entry!.hasFilteredCache).toBe(true);
                    expect(cacheStats.entry!.renderCount).toBe(1);
                    expect(cacheStats.entry!.filterEvalCount).toBe(1);

                    // Enter object editing mode -> filter rendering pauses during editing (shows unfiltered #ff0000ff)
                    state.setEditingObject(filteredRect.id, true);
                    expect(state.engine.isObjectEditing(state.canvasId, filteredRect.id)).toBe(true);
                    const duringEditSample = state.engine.inspectPixels(
                        state.canvasId,
                        30,
                        30,
                        1,
                        1,
                        vecLayer.id
                    );
                    expect(duringEditSample.hex).toBe("#ff0000ff");

                    // Exit object editing mode -> filter rendering resumes (#00ffffff)
                    state.setEditingObject(filteredRect.id, false);
                    const afterEditSample = state.engine.inspectPixels(
                        state.canvasId,
                        30,
                        30,
                        1,
                        1,
                        vecLayer.id
                    );
                    expect(afterEditSample.hex).toBe("#00ffffff");

                    // 4. Shared Object filter attachment and edit-time bypass
                    const sharedObj = state.engine.createSharedObject(state.canvasId, {
                        name: "Filtered Badge",
                        width: 30,
                        height: 30
                    });
                    const sharedId = sharedObj.id;
                    const sharedVecLayer = sharedObj.layers.find(l => l.type === "vector")!;
                    state.engine.drawShape(state.canvasId, sharedVecLayer.id, {
                        sharedObjectId: sharedId,
                        kind: "rect",
                        x: 0,
                        y: 0,
                        width: 30,
                        height: 30,
                        fill: "#0000ff"
                    });
                    state.engine.attachFilter(state.canvasId, {
                        targetType: "shared_object",
                        targetId: sharedId,
                        filterType: "invert"
                    });
                    const refInstance = state.engine.instantiateObjectRef(state.canvasId, sharedId, {
                        layerId: vecLayer.id,
                        x: 80,
                        y: 45
                    });

                    // Inverted #0000ff -> #ffff00ff
                    const sharedRendered = state.engine.inspectPixels(
                        state.canvasId,
                        90,
                        55,
                        1,
                        1,
                        vecLayer.id
                    );
                    expect(sharedRendered.hex).toBe("#ffff00ff");

                    // Enter in-place shared object edit -> bypasses filter on shared object (#0000ffff)
                    state.enterInPlaceSharedObjectEdit(sharedId, refInstance.id);
                    const sharedDuringEdit = state.engine.inspectPixels(
                        state.canvasId,
                        90,
                        55,
                        1,
                        1,
                        vecLayer.id
                    );
                    expect(sharedDuringEdit.hex).toBe("#0000ffff");
                    state.exitSharedObjectEdit();

                    // 5. Selective format conversion/rasterization on SVG & PDF export:
                    // Turn off preview in viewport and verify export STILL renders attached filters and selectively rasterizes only filtered objects
                    state.engine.setTargetFiltersEnabled(state.canvasId, {
                        targetType: "canvas",
                        enabled: false
                    });
                    const svgPath = path.join(tmpDir, "selective_export.svg");
                    const pdfPath = path.join(tmpDir, "selective_export.pdf");
                    state.engine.exportCanvas(state.canvasId, "svg", svgPath);
                    state.engine.exportCanvas(state.canvasId, "pdf", pdfPath);

                    const svgContent = fs.readFileSync(svgPath, "utf-8");
                    expect(svgContent.includes('data-rasterized-object="true"')).toBe(true);
                    expect(svgContent.includes("Native Vector Label")).toBe(true);
                    expect(svgContent.includes(`id="${unfilteredText.id}"`)).toBe(true);

                    const pdfContent = fs.readFileSync(pdfPath, "latin1");
                    expect(pdfContent.includes("/Subtype /Image")).toBe(true);
                    expect(pdfContent.includes("(Native Vector Label) Tj")).toBe(true);

                    // 6. Round-trip persistence in .hacanvas and baking raster layer filters
                    const hacPath = path.join(tmpDir, "dynamic_filters.hacanvas");
                    state.engine.saveCanvas(state.canvasId, hacPath);
                    state.engine.importArtFile(hacPath, { canvasId: "reloaded_dyn", mode: "new_canvas" });
                    expect(
                        state.engine.listAttachedFilters("reloaded_dyn", {
                            targetType: "layer",
                            targetId: rasLayer.id
                        }).attachedFilters.length
                    ).toBe(1);
                    expect(
                        state.engine.listAttachedFilters("reloaded_dyn", {
                            targetType: "object",
                            targetId: filteredRect.id
                        }).attachedFilters.length
                    ).toBe(1);
                    expect(
                        state.engine.listAttachedFilters("reloaded_dyn", {
                            targetType: "shared_object",
                            targetId: sharedId
                        }).attachedFilters.length
                    ).toBe(1);

                    // Bake raster layer filters -> raw raster becomes #00ffffff and attachedFilters stack is cleared
                    state.engine.bakeLayerFilters(state.canvasId, rasLayer.id);
                    expect(
                        state.engine.listAttachedFilters(state.canvasId, {
                            targetType: "layer",
                            targetId: rasLayer.id
                        }).attachedFilters.length
                    ).toBe(0);
                    const bakedRawSample = state.engine.inspectPixels(
                        state.canvasId,
                        10,
                        10,
                        1,
                        1,
                        rasLayer.id,
                        0,
                        { rawRaster: true }
                    );
                    expect(bakedRawSample.hex).toBe("#00ffffff");
                } finally {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                }
            }
        );
    });
}
