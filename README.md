# HAEditor — Hybrid Raster (GIMP) & Vector (Inkscape) Studio

**HAEditor** is a desktop graphical studio built on **NW.js** and powered by [**`@nexustools/hacanvas`**](https://github.com/NexusTools/HACanvas) and [**`@nexustools/aitooling`**](https://github.com/NexusTools/AITooling). It combines **GIMP-grade raster layer painting, selections, and pixel filters**, **Inkscape-grade SVG vector geometry and Boolean path operations**, **Categorized Reusable Shared Objects (`<ObjectRef>`)** with **In-Place** and **Isolated Tab** editing, and a **Multi-Provider Live-Streaming AI Studio Assistant** (`LM Studio`, `OpenAI`, `Anthropic Claude`, `Google Gemini`, `xAI Grok`, and custom endpoints).

---

## Highlights

- **🎨 Blank GIMP-Style Startup & Interactive HACanvas Splash Screen**:
  - Starts completely clean with no pre-populated canvas, layers, or shared objects.
  - Presents an informative **HACanvas Splash Screen** with one-click **✨ New** (`Ctrl+N`) and **📂 Open** (`Ctrl+O`) actions.
  - Document and Shared Object tabs feature **`×` close buttons** (`Ctrl+W`) that return to the splash screen when all tabs are closed.
- **🧰 Context-Sensitive Left Toolbox**:
  - Automatically displays **Vector / Inkscape tools** (9 tools: Select/Transform, Rectangle, Circle, Ellipse, Polygon, Star, Line, Bezier Path, Text) when a **Vector Layer** is active.
  - Automatically displays **Raster / GIMP tools** (8 tools: Paintbrush, Pencil, Airbrush, Eraser, Bucket Flood Fill, Gradient Fill, Rectangle Select, Ellipse Select) when a **Raster Layer** is active.
  - Remembers your last-used tool per layer context (`lastVectorToolId` & `lastRasterToolId`).
- **📋 Full 15-Menu GIMP Menubar with Hover Auto-Opening**:
  - Modeled directly on GIMP's `menus/image-menu.xml.in`:
    `File | Edit | Select | View | Image | Layer | Colors | Tools | Filters | Vector | Shared Objects | Library | Windows | 🤖 AI Studio | Help`
  - Hovering across top-level menu buttons while any menu is open immediately switches menus, and hovering over submenu rows (`Create`, `Import`, `Paste as`, `Buffer`, `Zoom`, `Transform`, `Stack`, etc.) auto-opens nested submenus.
- **🧩 Categorized Shared Objects (`<ObjectRef>`) & Cross-Project OS Library (`.haso`)**:
  - Organize reusable sub-canvases in nested slash categories (e.g. `UI/Badges/GoldStar`, `UI/Buttons/PrimaryCTA`).
  - Double-click any `<ObjectRef>` on the canvas to enter **In-Place Editing** (darkening the surrounding canvas while editing its internal vector/raster layers in local coordinates), or switch to an **Isolated Sub-Canvas Tab** with an `×` close button.
  - Save and import reusable Shared Objects across projects via your OS Config Library (`~/.config/haeditor/library/` or `%APPDATA%/HAEditor/library/`).
- **🤖 Multi-Provider AI Studio (`@nexustools/aitooling` + `@nexustools/hacanvas`)**:
  - Connects to **LM Studio (`http://localhost:1234`)** by default, and supports **OpenAI**, **Anthropic Claude**, **Google Gemini** (API Key & Google One OAuth), **xAI Grok**, **Custom OpenAI / Claude endpoints**, and custom code providers.
  - Supports **Fast Non-Reasoning (`➡️`)** and a **3-Level Brain Reasoning Dropdown (`🧠 Low`, `Medium`, `Max`)**.
  - Live-streams `<think>` / `reasoning_content` thoughts and partial JSON tool arguments (`parsePartialJson`) across **26 specialized canvas tools** covering every feature of the editor.

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
- [**Multi-Provider AI Studio & 26-Tool Reference (`docs/AI_STUDIO_AND_TOOLS.md`)**](docs/AI_STUDIO_AND_TOOLS.md)
- [**Architecture, Class Hierarchies & Test Harness Guide (`docs/ARCHITECTURE_AND_TESTING.md`)**](docs/ARCHITECTURE_AND_TESTING.md)
- [**`@nexustools/hacanvas` Documentation**](https://github.com/NexusTools/HACanvas)
- [**`@nexustools/aitooling` Documentation**](https://github.com/NexusTools/AITooling)
