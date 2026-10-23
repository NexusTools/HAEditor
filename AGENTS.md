# HAEditor — Agent Architecture & Development Guidelines

## 1. Project Overview
`HAEditor` (`D:\AICore\workspace\haeditor`) is the standalone NW.js desktop graphical studio for creating, editing, animating, and inspecting `.hacanvas` hybrid vector + raster documents and reusable Shared Object libraries. It is powered directly by `@nexustools/hacanvas` (`D:\GitHub\hacanvas`).

Key features of `HAEditor`:
- **Interactive Hybrid Viewport**: Pan, zoom, grid overlay, checkerboard transparency, live selection handles, Bezier node & segment curve deformation handles (`NodeEditTool`), In-Place (`Double-Click`) and Isolated Tab editing of Shared Objects, and live non-destructive dynamic filter preview with automatic bypass while actively editing an object.
- **18 Interactive Viewport Tools**: Selection (`select_move`, `node_edit`, `rect_select`, `ellipse_select`, `lasso_select`, `magic_wand`), Raster Painting (`brush`, `pencil`, `airbrush`, `eraser`, `bucket_fill`, `eyedropper`), and Vector Creation (`rect`, `ellipse`, `polygon`, `star`, `line`, `pen`, `text`).
- **Dockable Studio Panels & Modals**: Layers & Objects tree (with per-layer and per-object `fx` dynamic filter badges and eye preview toggles), Categorized GIMP Filters Dock (`121+` presets + custom JS filter editor + Attach Dynamic vs. Apply Immediately mode), Categorized Keyframe Transitions Dock (`14+` presets + custom JS transition editor), Shared Object Library Dock, Undo History Dock, Document Metadata (EXIF/XMP) & Embedded Fonts Dock, and Timeline + Cubic-Bezier Curve Editor.
- **Integrated AI Studio (`AiAssistantPanel`)**: Connects to LM Studio or OpenAI-compatible multimodal LLMs/VLMs with real-time streaming tool calls across all **33 AI tools** from `@nexustools/hacanvas`.

---

## 2. Symlinked Live Development Workflow (1:1 Immediate Updates)
`HAEditor`, `@nexustools/hacanvas`, and `AICore` are developed together simultaneously using directory symlinks (Windows junctions):
- `D:\AICore\workspace\haeditor\node_modules\@nexustools\hacanvas` $\longrightarrow$ `D:\GitHub\hacanvas`
- `D:\AICore\node_modules\@nexustools\hacanvas` $\longrightarrow$ `D:\GitHub\hacanvas`

### Rules for Agents Working on `HAEditor` & `HACanvas`
1. **Direct 1:1 Updates via Symlink**: Because `node_modules/@nexustools/hacanvas` is a directory junction pointing directly to `D:\GitHub\hacanvas`, any changes built in `D:\GitHub\hacanvas` (`npm run build`) are immediately live in `HAEditor` and `AICore` with zero manual copying or `npm update` steps.
2. **Preserve the Symlink**: Never replace `node_modules/@nexustools/hacanvas` with a static folder copy. If `npm install` ever removes the junction, recreate it immediately:
   ```powershell
   New-Item -ItemType Junction -Path "D:\AICore\workspace\haeditor\node_modules\@nexustools\hacanvas" -Target "D:\GitHub\hacanvas"
   ```
3. **Build & Test Verification**:
   - When modifying `@nexustools/hacanvas` (`D:\GitHub\hacanvas`), run `npm run build` in `D:\GitHub\hacanvas` first.
   - Then run `npm run build` and `npm test` in `D:\AICore\workspace\haeditor`, and inspect `D:\AICore\workspace\haeditor\testrunner\test-results\desktop-tests.log` to verify all desktop integration tests pass (`Failed: 0`).

---

## 3. Strict Modular File Layout & "1 Class Per `.ts` File" Rule
To keep the `HAEditor` codebase clean, navigable, and maintainable, **every `.ts` file in `D:\AICore\workspace\haeditor\src\` MUST adhere to the 1-Class-Per-File rule and modular directory structure**:

### Core Rules
1. **Maximum 1 Exported Class Per `.ts` File**:
   - Every `.ts` file in `src/` MUST export **at most 1 class**.
   - Never combine multiple tools, UI panels, modals, or state classes into a single `.ts` file.
2. **Dedicated Folders by Responsibility**:
   - **Abstract Viewport Tool Base Classes (`src/tools/base/`)**:
     - [`src/tools/base/abstract-editor-tool-base.ts`](file:///D:/AICore/workspace/haeditor/src/tools/base/abstract-editor-tool-base.ts) — `AbstractEditorTool`
     - [`src/tools/base/abstract-raster-stroke-tool.ts`](file:///D:/AICore/workspace/haeditor/src/tools/base/abstract-raster-stroke-tool.ts) — `AbstractRasterStrokeTool`
     - [`src/tools/base/abstract-vector-shape-tool.ts`](file:///D:/AICore/workspace/haeditor/src/tools/base/abstract-vector-shape-tool.ts) — `AbstractVectorShapeTool`
     - [`src/tools/base/abstract-selection-drag-tool.ts`](file:///D:/AICore/workspace/haeditor/src/tools/base/abstract-selection-drag-tool.ts) — `AbstractSelectionDragTool`
     - [`src/tools/base/abstract-color-point-tool.ts`](file:///D:/AICore/workspace/haeditor/src/tools/base/abstract-color-point-tool.ts) — `AbstractColorPointTool`
   - **Concrete Viewport Tools (`src/tools/`)**:
     - Each interactive tool MUST be in its own file `src/tools/<tool-name>-tool.ts` (e.g. `select-move-tool.ts`, `node-edit-tool.ts`, `rect-select-tool.ts`, `ellipse-select-tool.ts`, `lasso-select-tool.ts`, `magic-wand-tool.ts`, `brush-tool.ts`, `pencil-tool.ts`, `airbrush-tool.ts`, `eraser-tool.ts`, `bucket-fill-tool.ts`, `eyedropper-tool.ts`, `rect-shape-tool.ts`, `ellipse-shape-tool.ts`, `polygon-shape-tool.ts`, `star-shape-tool.ts`, `line-shape-tool.ts`, `pen-path-tool.ts`, `text-tool.ts`) and registered in [`src/tools/editor-tool-registry.ts`](file:///D:/AICore/workspace/haeditor/src/tools/editor-tool-registry.ts).
   - **Observable Session State (`src/state/`)**:
     - [`src/state/abstract-observable-state.ts`](file:///D:/AICore/workspace/haeditor/src/state/abstract-observable-state.ts) — `AbstractObservableState`
     - [`src/state/editor-session-state.ts`](file:///D:/AICore/workspace/haeditor/src/state/editor-session-state.ts) — `EditorSessionState`
     - [`src/state/editor-state.ts`](file:///D:/AICore/workspace/haeditor/src/state/editor-state.ts) — Barrel re-export for state types and classes
   - **Top-Level UI Chrome & Viewport (`src/ui/`)**:
     - [`src/ui/top-menu-bar.ts`](file:///D:/AICore/workspace/haeditor/src/ui/top-menu-bar.ts) — `TopMenuBar`
     - [`src/ui/left-toolbox.ts`](file:///D:/AICore/workspace/haeditor/src/ui/left-toolbox.ts) — `LeftToolbox`
     - [`src/ui/canvas-viewport.ts`](file:///D:/AICore/workspace/haeditor/src/ui/canvas-viewport.ts) — `CanvasViewport`
     - [`src/ui/right-inspector-dock.ts`](file:///D:/AICore/workspace/haeditor/src/ui/right-inspector-dock.ts) — `RightInspectorDock`
     - [`src/ui/timeline-curve-panel.ts`](file:///D:/AICore/workspace/haeditor/src/ui/timeline-curve-panel.ts) — `TimelineAndCurvePanel`
     - [`src/ui/ai-assistant-panel.ts`](file:///D:/AICore/workspace/haeditor/src/ui/ai-assistant-panel.ts) — `AiAssistantPanel`
   - **Specialized Dock Panels (`src/ui/panels/`)**:
     - Each dock tab/panel MUST live in its own 1-class file under `src/ui/panels/` (`abstract-categorized-tree-panel.ts`, `gimp-filters-dock-panel.ts`, `raster-transitions-dock-panel.ts`, `history-dock-panel.ts`, `metadata-and-fonts-dock-panel.ts`).
   - **Modal Dialogs (`src/ui/modals/`)**:
     - Each modal dialog MUST live in its own 1-class file under `src/ui/modals/` (`ico-export-modal.ts`, `pdf-import-modal.ts`, `pdf-export-modal.ts`).
   - **AI Tool Re-Exports (`src/ai/`)**:
     - `HAEditor` consumes all AI tools directly from `@nexustools/hacanvas` via [`src/ai/haeditor-ai-tools.ts`](file:///D:/AICore/workspace/haeditor/src/ai/haeditor-ai-tools.ts) and [`src/ai/lmstudio-ai-service.ts`](file:///D:/AICore/workspace/haeditor/src/ai/lmstudio-ai-service.ts). When adding or updating AI tools, implement the tool in its own file inside `D:\GitHub\hacanvas\src\ai\tools\`.

---

## 4. Parity, Testing, & Documentation Guidelines
1. **UI + AI Tool Parity**: Every capability exposed in the `HAEditor` UI MUST also be exposed to the AI agent via `@nexustools/hacanvas` AI tools so the AI can inspect and perform every action a human user can perform.
2. **Automated NW.js Test Suite**: Always add or update tests in [`src/tests/HaEditorSuites.ts`](file:///D:/AICore/workspace/haeditor/src/tests/HaEditorSuites.ts) and verify via `npm test`.
3. **Documentation Maintenance**: Keep `README.md`, `docs/USER_GUIDE.md`, `docs/AI_STUDIO_AND_TOOLS.md`, and `docs/ARCHITECTURE_AND_TESTING.md` updated whenever features or tools change.
4. **No Assumptions**: Always ask the user for feedback if there is any ambiguity.
