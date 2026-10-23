# HAEditor Multi-Provider AI Studio & 26-Tool Reference

## 1. Overview

**HAEditor** includes a deeply integrated **Multi-Provider AI Studio Assistant** (`src/ui/panels/ai-assistant-dock-panel.ts`) built on [**`@nexustools/aitooling`**](https://github.com/NexusTools/AITooling) (`AiLiveChatController`, `AiReasoningControlsWidget`, `ProviderFactory`, `AiProviderRegistry`, `ContextualToolRegistry`) and [**`@nexustools/hacanvas`**](https://github.com/NexusTools/HACanvas) (`HaEditorAiToolRegistry`).

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

During SSE streaming from LM Studio:
- **Live Thinking Accordion**: Streams `delta.reasoning_content`, `delta.reasoning`, `delta.thought`, and `<think>...</think>` blocks into a collapsible reasoning card.
- **Live Tool Argument Preview (`parsePartialJson`)**: As `delta.tool_calls` stream in token-by-token, `parsePartialJson()` parses incomplete JSON strings on the fly to render live tool status labels (e.g., `⚡ Drawing star at (240, 150)...`) and parameter pills before the tool call finishes streaming.
- **Multi-Turn Tool Loop**: Automatically executes all tool calls against `EditorSessionState` / `HybridArtEngine`, re-renders the canvas live, injects visual PNG previews when `render_visual_snapshot` is called, and continues the conversation turn.

---

## 4. Complete Catalog of All 26 AI Tools (`HaEditorAiToolRegistry`)

All 26 tools inherit from `AbstractAiTool` (`src/ai/abstract-ai-tool.ts`):

### 4.1 Inspection & Multimodal Vision Tools (5)
1. `inspect_canvas_status`: Returns canvas dimensions, active mode, layer list, shared object count, and timeline status.
2. `inspect_scene_graph`: Returns the complete hierarchical scene graph of layers, vector objects, and `<ObjectRef>` instances.
3. `inspect_shared_objects_and_library`: Lists all project Shared Objects and cross-project OS Config Library entries.
4. `inspect_pixel_region`: Samples RGBA pixel statistics, average color, and histogram for any rectangular region.
5. `render_visual_snapshot`: Renders the canvas, a specific layer, or a Shared Object to a base64 PNG preview in the chat stream.

### 4.2 Canvas & Layer Management Tools (3)
6. `create_new_canvas`: Creates or resets the canvas with custom `width`, `height`, `backgroundColor`, and initial layers.
7. `resize_or_recolor_canvas`: Updates canvas dimensions or background color.
8. `manage_layer`: Adds, removes, duplicates, reorders, clears, or changes blend mode/opacity/visibility of vector and raster layers.

### 4.3 Vector / Inkscape Authoring Tools (7)
9. `draw_vector_shape`: Draws `rect`, `circle`, `ellipse`, `polygon`, `star`, or `line`.
10. `draw_vector_path`: Draws polylines, polygons, or SVG Bezier path `d` commands.
11. `draw_vector_text`: Places scalable vector text on a vector layer.
12. `modify_vector_object`: Moves, resizes, rotates, scales, or restyles any vector object or `<ObjectRef>`.
13. `delete_vector_object`: Removes a vector object from its layer.
14. `vector_boolean_or_path_op`: Runs `union`, `difference`, `intersection`, `exclusion`, `simplify`, or `offset`.
15. `select_and_switch_tool`: Selects vector objects and switches the active editor tool or options.

### 4.4 Raster / GIMP Painting, Selection & Filter Tools (4)
16. `paint_raster_stroke`: Paints a `brush`, `pencil`, `airbrush`, or `eraser` stroke along an array of `{x, y}` points.
17. `raster_fill`: Applies a `flood` bucket fill, `linear_gradient`, or `radial_gradient`.
18. `raster_selection`: Creates or modifies a `rect` or `ellipse` selection mask (`clear`, `invert`).
19. `apply_gimp_filter`: Applies `gaussian_blur`, `sharpen`, `invert`, `threshold`, `brightness_contrast`, or `drop_shadow`.

### 4.5 Shared Objects, Library, Animation & File I/O Tools (7)
20. `create_shared_object`: Creates a categorized Shared Object sub-canvas (e.g. `UI/Badges/GoldStar`).
21. `instantiate_shared_object_ref`: Places an `<ObjectRef>` instance on the main canvas or inside another Shared Object.
22. `switch_editing_context`: Enters `in_place` editing, `isolated_tab` editing, or returns to `main_canvas`.
23. `manage_reusable_library`: Saves Shared Objects to or imports them from the cross-project OS Config Library.
24. `configure_animation_timeline`: Configures `fps`, `durationFrames`, `loop`, `currentFrame`, and `onionSkin`.
25. `set_animation_keyframe`: Records property keyframes (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `opacity`, `fill`) at a specific frame.
26. `import_or_export_file`: Opens, imports, saves, or exports `.hacanvas`, `.psd`, `.xcf`, `.ai`, `.svg`, `.ora`, `.png`, `.gif`, `.bmp`, etc.
