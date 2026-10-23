# HAEditor — Hybrid Raster (GIMP) & Vector (Inkscape) Studio

**HAEditor** is a desktop graphical studio built on **NW.js** and powered by [**`@nexustools/hacanvas`**](https://github.com/NexusTools/HACanvas) and [**`@nexustools/aitooling`**](https://github.com/NexusTools/AITooling). It combines **GIMP-grade raster layer painting, selections, and 85+ immediate & dynamic non-destructive pixel filters**, **Inkscape-grade SVG vector geometry, node/segment deformation, and Boolean path operations**, **Categorized Reusable Shared Objects (`<ObjectRef>`)** with **In-Place** and **Isolated Tab** editing, **Cubic-Bezier Curve & 27+ JS Raster Transition Animation Timelines**, and a **Multi-Provider Live-Streaming AI Studio Assistant** (`LM Studio`, `OpenAI`, `Anthropic Claude`, `Google Gemini`, `xAI Grok`, and custom endpoints).

---

## Highlights

- **🎨 Blank GIMP-Style Startup & Interactive HACanvas Splash Screen**:
  - Starts completely clean with no pre-populated canvas, layers, or shared objects.
  - Presents an informative **HACanvas Splash Screen** with one-click **✨ New** (`Ctrl+N`) and **📂 Open** (`Ctrl+O`) actions.
  - Document and Shared Object tabs feature **`×` close buttons** (`Ctrl+W`) that return to the splash screen when all tabs are closed.
- **🧰 Context-Sensitive Left Toolbox & Interactive Vector Node Deformation**:
  - Automatically displays **Vector / Inkscape tools** (9 tools: Select/Transform/Deform, Rectangle, Circle, Ellipse, Polygon, Star, Line, Bezier Path, Text) when a **Vector Layer** is active.
  - Automatically displays **Raster / GIMP tools** (8 tools: Paintbrush, Pencil, Airbrush, Eraser, Bucket Flood Fill, Gradient Fill, Rectangle Select, Ellipse Select) when a **Raster Layer** is active.
  - Interactive **Select / Transform / Deform (`V`)** tool supports bounding-box resize, rotation, skew handles, and **live segment bending & vertex deformation** (`deformVectorObject`) on lines, paths, polygons, stars, rectangles, circles, and ellipses.
- **✨ 85+ Immediate & Dynamic Non-Destructive GIMP Filters (`FiltersDockPanel`)**:
  - Apply any of the **85+ built-in or custom JavaScript GIMP filters** either **immediately** (`⚡ Apply Immediately`, mutating raster pixels in-place) or **dynamically** (`🔗 Attach Dynamic`, non-destructively attached to a raster layer, vector layer, individual vector object, or Shared Object).
  - Toggle **Preview Dynamic Filters** (`👁 Preview Filters`) globally or per layer/object (`fx` badge in `LayersDockPanel`), edit filter parameters live, reorder/remove attached filters, or **Bake** (`🔥 Bake`) dynamic filters into raster layer pixels.
  - Objects with attached filters render to a **cached offscreen canvas (`objectRenderCache`)** for fast compositing, automatically pause filter rendering while the object is being edited (`setObjectEditing`), and always render enabled filters upon export (with selective rasterization for `.svg` and `.pdf`).
- **🎞️ Animation Timeline, Cubic-Bezier Curve Editor & 27+ JS Raster Transitions**:
  - Full property keyframe animation (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `skewX`, `skewY`, `opacity`, `fill`, `stroke`, `d`, `points`) with interactive **Cubic-Bezier Curve Editor (`[x1, y1, x2, y2]`)** and custom curve presets.
  - Frame-by-frame raster cel keyframes and **27+ categorized JavaScript Raster Transition Blend Presets** (`Dissolve & Fade`, `Wipe & Sweep`, `Iris & Geometric`, `Light & Chromatic`, `Displacement & Optical`, `Custom`) with live JS source inspection (`Ctrl+Click` internal docs) and cross-layer blending.
- **📋 Full 15-Menu GIMP Menubar with Hover Auto-Opening**:
  - Modeled directly on GIMP's `menus/image-menu.xml.in`:
    `File | Edit | Select | View | Image | Layer | Colors | Tools | Filters | Vector | Shared Objects | Library | Windows | 🤖 AI Studio | Help`
- **🧩 Categorized Shared Objects (`<ObjectRef>`) & Cross-Project OS Library (`.haso`)**:
  - Organize reusable sub-canvases in nested slash categories (e.g. `UI/Badges/GoldStar`, `UI/Buttons/PrimaryCTA`).
  - Double-click any `<ObjectRef>` on the canvas to enter **In-Place Editing** or switch to an **Isolated Sub-Canvas Tab** with its own independent animation timeline and attached filter stack.
- **🤖 Multi-Provider AI Studio (`@nexustools/aitooling` + `@nexustools/hacanvas`)**:
  - Connects to **LM Studio (`http://localhost:1234`)** by default, and supports **OpenAI**, **Anthropic Claude**, **Google Gemini** (API Key & Google One OAuth), **xAI Grok**, and **Custom OpenAI / Claude endpoints**.
  - Supports **Fast Non-Reasoning (`➡️`)** and a **3-Level Brain Reasoning Dropdown (`🧠 Low`, `Medium`, `Max`)**.
  - Live-streams `<think>` / `reasoning_content` thoughts and partial JSON tool arguments (`parsePartialJson`) across **all 33 specialized AI canvas tools** covering every feature of the editor.

---

## Installation & Setup

`HAEditor` consumes `@nexustools/hacanvas` and `@nexustools/aitooling` as npm modules via `package.json`:

```bash
git clone -b master https://github.com/NexusTools/HAEditor.git
cd HAEditor
npm install
```

---

## Building, Running & Testing

```bash
# Compile TypeScript (src/ -> dist/)
npm run build

# Launch HAEditor in NW.js
npm start

# Run the automated NW.js <webview> + Engine Test Suite
npm test
```

---

## Documentation Index

- [**User Guide & Complete GIMP Menubar Reference (`docs/USER_GUIDE.md`)**](docs/USER_GUIDE.md)
- [**Multi-Provider AI Studio & Complete AI Tool Reference (`docs/AI_STUDIO_AND_TOOLS.md`)**](docs/AI_STUDIO_AND_TOOLS.md)
- [**Architecture, Class Hierarchies & Test Harness Guide (`docs/ARCHITECTURE_AND_TESTING.md`)**](docs/ARCHITECTURE_AND_TESTING.md)
- [**`@nexustools/hacanvas` Documentation**](https://github.com/NexusTools/HACanvas)
- [**`@nexustools/aitooling` Documentation**](https://github.com/NexusTools/AITooling)
