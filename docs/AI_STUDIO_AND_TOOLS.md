# HAEditor Multi-Provider AI Studio & 33-Tool Reference

## 1. Overview

**HAEditor** includes a deeply integrated **Multi-Provider AI Studio Assistant** (`src/ui/panels/ai-assistant-dock-panel.ts`) built on [**`@nexustools/aitooling`**](https://github.com/NexusTools/AITooling) (`AiLiveChatController`, `AiReasoningControlsWidget`, `ProviderFactory`, `AiProviderRegistry`, `ContextualToolRegistry`) and [**`@nexustools/hacanvas`**](https://github.com/NexusTools/HACanvas) (`HaCanvasAiToolRegistry` / `HaEditorAiToolRegistry`).

It supports connecting to any of the following AI services:
- **LM Studio (`lm_studio`)** — Default local server at `http://localhost:1234` (`POST /v1/chat/completions` and `GET /v1/models`).
- **OpenAI (`openai`)** — `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `gpt-4-turbo`.
- **Anthropic Claude (`claude`)** — `claude-3-7-sonnet-latest`, `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`.
- **Google Gemini (`gemini`)** — `gemini-2.5-flash`, `gemini-2.5-pro` via API Key or **Google One OAuth** (`GoogleOAuthManager`).
- **xAI Grok (`grok`)** — `grok-2`, `grok-2-1212`, `grok-beta`.
- **Custom OpenAI (`custom_openai`) & Custom Claude (`custom_claude`)** — Any custom endpoint speaking OpenAI or Anthropic protocols.
- **Custom Code Providers** — Any programmatic provider registered with `AiProviderRegistry.registerProvider()` or `ProviderFactory.registerCustomProvider()`.

Your active provider, endpoint, API key, model, and default reasoning level are persisted automatically via `HaEditorConfigManager`.

---

## 2. Fast Non-Reasoning (`➡️`) vs. 3-Level Brain Reasoning (`🧠`)

The AI Studio chat bar offers two distinct send controls:
1. **Fast Non-Reasoning Send (`➡️` button or `Enter`)**:
   - Sends `reasoning_effort: "none"` and `max_reasoning_tokens: 0` for immediate, zero-latency tool invocation.
2. **Brain Reasoning Button (`🧠`) with 3-Level Dropdown (`#ha-ai-brain-dropdown`)**:
   - Clicking `🧠` opens a selector with three reasoning levels:
     - **⚡ Low Reasoning (`#ha-ai-reasoning-low`)**: Sends `reasoning_effort: "low"`, `reasoning_level: "low"`, `max_reasoning_tokens: 1024`.
     - **🧠 Medium Reasoning (`#ha-ai-reasoning-medium`)**: Sends `reasoning_effort: "medium"`, `reasoning_level: "medium"`, `max_reasoning_tokens: 4096`.
     - **🔮 Max Reasoning (`#ha-ai-reasoning-max`)**: Sends `reasoning_effort: "high"`, `reasoning_level: "max"`, `max_reasoning_tokens: 16384`.

---

## 3. Live-Streamed Reasoning & Partial JSON Tool Rendering

During SSE streaming from LM Studio or cloud providers:
- **Live Thinking Accordion**: Streams `delta.reasoning_content`, `delta.reasoning`, `delta.thought`, and `<think>...</think>` blocks into a collapsible reasoning card.
- **Live Tool Argument Preview (`parsePartialJson`)**: As `delta.tool_calls` stream in token-by-token, `parsePartialJson()` parses incomplete JSON strings on the fly to render live tool status labels (e.g., `⚡ Deforming vector rect_1 segment 0...`) and parameter pills before the tool call finishes streaming.
- **Multi-Turn Tool Loop**: Automatically executes all tool calls against `EditorSessionState` / `HybridArtEngine`, re-renders the canvas live, injects visual PNG previews when `capture_canvas_snapshot` is called, and continues the conversation turn.

---

## 4. Complete Catalog of All 33 AI Tools (`HaCanvasAiToolRegistry`)

Every AI tool is implemented in its own modular `.ts` file inside `hacanvas/src/ai/tools/<tool-name>-ai-tool.ts` extending `AbstractAiTool` (`hacanvas/src/ai/abstract-ai-tool-base.ts`):

### 4.1 Inspection & Multimodal Vision Tools (7)
1. **`inspect_canvas_status`** (`src/ai/tools/inspect-canvas-status-ai-tool.ts`):
   - Inspects canvas dimensions, DPI, background color, global `previewDynamicFilters` state, active editing mode (`none`, `in_place`, `isolated_tab`), active layer, all layers with their **active attached dynamic filters & settings**, selected objects, current frame, animation summary, document metadata, embedded fonts, undo/redo stacks, and tool options.
2. **`inspect_scene_graph`** (`src/ai/tools/inspect-scene-graph-ai-tool.ts`):
   - Returns the complete hierarchical scene graph of layers, vector objects, `<ObjectRef>` instances, attached dynamic filters (with `label`, `category`, `gimpProcedure`, `parameterSchemas`, `defaultParams`, `activeParams`), and timeline tracks.
3. **`inspect_layer`** (`src/ai/tools/inspect-layer-details-ai-tool.ts`):
   - Deep-inspects a specific vector or raster layer: vector objects with their bounding boxes, deformable nodes/segments, and object-level attached filters, or raster pixel statistics, cel frames, raster blend transition settings, and full `attachedFilters` details (`filterType`, `label`, `category`, `gimpProcedure`, `enabled`, `params`, `defaultParams`, `activeParams`, `parameterSchemas`).
4. **`inspect_animation_timeline`** (`src/ai/tools/inspect-animation-timeline-ai-tool.ts`):
   - Comprehensively inspects the animation timeline for the Main Canvas or a Shared Object, returning `fps`, `durationFrames`, `loop`, `loopBackToFrame`, all property & `rasterCel` tracks, per-keyframe easing curves (`easing`, `curvePresetId`, `curvePresetName`, `curveControlPoints`, `sampledEasingCurve` at $t \in \{0, 0.25, 0.5, 0.75, 1\}$), raster transition scripts/presets (`rasterBlendPresetId`, `rasterBlendPresetName`, `rasterBlendCategory`, `rasterBlendCustomCode`), cross-layer blend targets, raster layer cel summaries, and all built-in/custom curve & transition presets.
5. **`inspect_pixels`** (`src/ai/tools/inspect-pixels-ai-tool.ts`):
   - Samples RGBA pixel values, bounding boxes, and color histograms from any `(x, y)` coordinate or rectangular region.
6. **`inspect_shared_objects_and_library`** (`src/ai/tools/inspect-shared-objects-and-library-ai-tool.ts`):
   - Lists all Shared Objects on the active canvas (including their attached filters and animation timelines) and all reusable entries in the persistent OS Shared Object Library.
7. **`capture_canvas_snapshot`** (`src/ai/tools/capture-canvas-snapshot-ai-tool.ts`):
   - Renders the composite canvas, a specific layer, an object, a shared object, a cropped region, or a multi-frame animation contact sheet to a PNG image (supporting `forExport` and `previewFilters` flags) and injects it into multimodal vision context.

### 4.2 Canvas & Layer Management Tools (4)
8. **`create_new_canvas`** (`src/ai/tools/create-new-canvas-ai-tool.ts`):
   - Creates or resets the canvas with custom `width`, `height`, `backgroundColor`, and default vector/raster layers.
9. **`set_canvas_properties`** (`src/ai/tools/set-canvas-properties-ai-tool.ts`):
   - Updates canvas `width`, `height`, `dpi`, `backgroundColor`, `previewDynamicFilters`, `currentFrame`, `onionSkin`, `zoom`, or default tool options.
10. **`create_layer`** (`src/ai/tools/create-layer-ai-tool.ts`):
    - Creates a new `"vector"` or `"raster"` layer on the Main Canvas or inside a Shared Object.
11. **`modify_layer`** (`src/ai/tools/modify-layer-ai-tool.ts`):
    - Renames, reorders (`move_up`, `move_down`, `move_to_index`), duplicates, merges down, flattens, clears, deletes, or updates `visible`, `locked`, `opacity`, `blendMode`, `offsetX`, `offsetY`, `startFrame`, `endFrame`, and `filtersEnabled` on any layer.

### 4.3 Vector / Inkscape Authoring & Deformation Tools (6)
12. **`draw_vector_shape`** (`src/ai/tools/draw-vector-shape-ai-tool.ts`):
    - Draws geometric vector shapes (`rect`, `circle`, `ellipse`, `polygon`, `star`, `line`, including quadratic curved lines with `cx`/`cy` and frame visibility ranges `startFrame`/`endFrame`).
13. **`draw_bezier_path`** (`src/ai/tools/draw-bezier-path-ai-tool.ts`):
    - Draws freehand polylines, closed polygons, or full SVG Bezier path `d` commands.
14. **`draw_vector_text`** (`src/ai/tools/draw-vector-text-ai-tool.ts`):
    - Places editable vector text with `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `letterSpacing`, `fontId`, `fill`, `stroke`, and `strokeWidth`.
15. **`modify_vector_object`** (`src/ai/tools/modify-vector-object-ai-tool.ts`):
    - Updates position, size, radii, endpoints, curve control points (`cx`, `cy`), `rotation`, `skewX`, `skewY`, `scaleX`, `scaleY`, `fill`, `stroke`, `opacity`, `text`, `startFrame`, `endFrame`, `filtersEnabled`, or deletes any vector object.
16. **`deform_vector_object`** (`src/ai/tools/deform-vector-object-ai-tool.ts`):
    - Deforms any existing vector line, path, polygon, star, rectangle, circle, or ellipse:
      - `bend_segment`: Bends/curves a line or shape edge through `(targetX, targetY)` at parameter `t` while keeping endpoints pinned (automatically converts geometric shapes to editable vertex/segment geometry).
      - `move_endpoint`: Moves a vertex or endpoint (`pointIndex`) to `(targetX, targetY)` while retaining existing curve handles.
      - `straighten_segment`: Resets a curved line or segment back to straight.
      - `add_vertex`: Inserts a new vertex on `segmentIndex` at `t` (or `(targetX, targetY)`).
      - `remove_vertex`: Deletes vertex `pointIndex` from a deformable shape/path.
      - `convert_to_path`: Explicitly converts any geometric shape (`rect`, `circle`, `ellipse`, `polygon`, `star`, `line`) into an editable vertex/path representation.
      - `inspect_nodes`: Returns all vertices, segments, control points, and bounding box of the vector object.
17. **`boolean_path_operation`** (`src/ai/tools/boolean-path-operation-ai-tool.ts`):
    - Executes Inkscape CSG boolean operations (`union`, `difference`, `intersection`, `exclusion`), path `offset`, or path `simplify`.

### 4.4 Raster / GIMP Painting, Selection & Dynamic Filter Tools (5)
18. **`select_region`** (`src/ai/tools/select-region-ai-tool.ts`):
    - Creates or modifies selection masks (`rect`, `ellipse`, `all`, `none`, `invert`, `feather`, `grow`, `shrink`, `border`).
19. **`paint_raster_stroke`** (`src/ai/tools/paint-raster-stroke-ai-tool.ts`):
    - Paints a GIMP `brush`, `pencil`, `airbrush`, or `eraser` stroke along an array of `{x, y}` coordinates on a raster layer or animation cel.
20. **`raster_fill`** (`src/ai/tools/raster-fill-ai-tool.ts`):
    - Performs a `flood` bucket fill, `linear_gradient`, or `radial_gradient` on a raster layer or animation cel.
21. **`apply_gimp_filter`** (`src/ai/tools/apply-gimp-filter-ai-tool.ts`):
    - Applies or manages any of the **121+ built-in GIMP filters** or custom JS filters in either immediate destructive mode or non-destructive dynamic mode:
      - `immediate`: Immediately mutates pixels on a raster layer.
      - `attach`: Non-destructively attaches a filter to a layer, shared object, or vector object.
      - `update_attached`: Modifies parameters, enabled state, or stack index of an attached filter.
      - `bake`: Permanently bakes an attached filter (or all attached filters) into a raster layer's pixels.
      - `remove` / `clear`: Removes one or all attached filters from a target.
      - `toggle_preview`: Toggles viewport filter preview globally (`previewDynamicFilters`) or per-target (`filtersEnabled`).
      - `list_attached`: Returns all attached filters and their enriched schemas/settings on a target.
22. **`configure_gimp_filter_preset`** (`src/ai/tools/configure-gimp-filter-preset-ai-tool.ts`):
    - Lists, inspects, validates, creates/saves, or deletes custom JavaScript GIMP filter presets (`GimpFilterPreset`), and queries `GIMP_JS_INTERNAL_DOCS`.

### 4.5 Shared Objects & Persistent OS Library Tools (3)
23. **`create_shared_object`** (`src/ai/tools/create-shared-object-ai-tool.ts`):
    - Creates a new categorized Shared Object sub-canvas (`objects/<id>.xml`) and optionally instantiates an `<ObjectRef>` on the Main Canvas.
24. **`manage_shared_object`** (`src/ai/tools/manage-shared-object-ai-tool.ts`):
    - Instantiates `<ObjectRef>` references, enters `in_place` or `isolated_tab` editing, exits editing back to the Main Canvas, renames/recategorizes, resizes, or deletes a Shared Object.
25. **`shared_object_library`** (`src/ai/tools/shared-object-library-ai-tool.ts`):
    - Lists, saves, imports, renames/recategorizes, or deletes reusable Shared Objects in the cross-project OS Config Library (`~/.config/haeditor/library` / `%APPDATA%\haeditor\library`), and manages custom library directories.

### 4.6 Animation Timeline, Curves & Raster Transitions Tools (4)
26. **`configure_timeline`** (`src/ai/tools/configure-timeline-ai-tool.ts`):
    - Configures `fps`, `durationFrames`, `loop`, `loopBackToFrame`, `currentFrame`, and `onionSkin`, or adds/duplicates/deletes frames.
27. **`set_animation_keyframe`** (`src/ai/tools/set-animation-keyframe-ai-tool.ts`):
    - Sets, updates, or deletes property keyframes (`x`, `y`, `x2`, `y2`, `cx`, `cy`, `width`, `height`, `r`, `rx`, `ry`, `scaleX`, `scaleY`, `rotation`, `skewX`, `skewY`, `opacity`, `fill`, `stroke`, `d`, `points`, `rasterCel`) with easing curves and raster blend transitions, or clears an entire track.
28. **`configure_animation_curve`** (`src/ai/tools/configure-animation-curve-ai-tool.ts`):
    - Lists, inspects/evaluates, saves, deletes, or applies cubic-Bezier movement/interpolation curves (`[x1, y1, x2, y2]`) to keyframes or raster layers.
29. **`configure_raster_keyframe_blend`** (`src/ai/tools/configure-raster-keyframe-blend-ai-tool.ts`):
    - Lists, inspects, validates, saves, deletes, or applies JavaScript raster keyframe blending transitions (`BUILT_IN_RASTER_BLEND_PRESETS` or custom JS code) and cross-layer blend targets.

### 4.7 File I/O, Metadata, Fonts & Transform Tools (4)
30. **`open_or_import_file`** (`src/ai/tools/open-or-import-file-ai-tool.ts`):
    - Opens or imports any supported artwork file (`.hacanvas`, `.psd`/`.psb`, `.xcf`, `.ai`, `.pdf`, `.svg`, `.ora`, `.png`, `.gif`, `.bmp`, `.tga`, `.pcx`, `.ico`/`.cur`, `.ppm`/`.pgm`/`.pbm`/`.pam`, `.ff`, `.xbm`, `.jpg`, `.webp`, `.tiff`) as a new canvas, appended layers, or into a Shared Object.
31. **`save_or_export_artwork`** (`src/ai/tools/save-and-export-artwork-ai-tool.ts`):
    - Saves native `.hacanvas` ZIP+XML packages or exports to any format (`png`, `svg`, `pdf`, `gif`, `bmp`, `tga`, `ppm`, `ico`, `cur`, `ff`, `ora`, `jpg`, `webp`, `tiff`, `sprite_sheet`) with format-specific options (`icoLayers`, `layersAsPages`, `embedFonts`, `exportScope`, `columns`, `padding`, `metadata`, etc.).
32. **`manage_metadata_and_fonts`** (`src/ai/tools/manage-document-metadata-and-fonts-ai-tool.ts`):
    - Inspects, updates, or clears document EXIF/XMP/GPS metadata (`title`, `author`, `description`, `keywords`, `copyright`, `rating`, `gps`, camera fields, `custom`), and lists, embeds (`.ttf`/`.otf`/`.woff` or synthesized minimal TrueType), or removes embedded document fonts.
33. **`undo_redo_and_transform`** (`src/ai/tools/undo-redo-and-transform-ai-tool.ts`):
    - Performs `undo`, `redo`, `inspect_history`, canvas/layer rotation (`rotate_90_cw`, `rotate_90_ccw`, `rotate_180`), horizontal/vertical flips (`flip_h`, `flip_v`), `crop_to_selection`, `autocrop`, color adjustments (`desaturate`, `color_balance`, `hue_saturation`, `levels`, `curves`, `posterize`), and `duplicate_object`.
