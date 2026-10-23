# HAEditor User Guide & GIMP Menubar Reference

## 1. Starting Up: The HACanvas Splash Screen & Closeable Tabs

When **HAEditor** launches, it starts completely blank—just like GIMP—with no pre-created layers, images, or shared objects, and no open tabs:
- **✨ New (`#btn-splash-new-canvas` / `Ctrl+N`)**: Opens the **Create New Hybrid Canvas** dialog with one-click dimension presets (`Standard 640×420`, `HD 720p`, `Full HD 1080p`, `Square 512×512`, `UI Icon 128×128`, `Pixel Sprite 64×64`), background color picker, and layer template selector (`Hybrid Raster + Vector`, `Vector Only`, `Raster Only`).
- **📂 Open (`#btn-splash-open-file` / `Ctrl+O`)**: Opens the interactive **GIMP File Browser** with quick-access bookmarks (`Project Root`, `Shared Library`, `Home`, `Desktop`, `Documents`, `Downloads`), file format filter dropdown, and live file size metadata.
- **Closeable Tabs (`×`)**:
  - Once a canvas is created or opened, `#tab-main-canvas` appears in the viewport tab bar with an **`×` close button** (`Ctrl+W`). Clicking `×` closes the document and returns to the HACanvas Splash Screen.
  - Opening any Shared Object in an **Isolated Tab** adds a tab with its own **`×` close button**.

---

## 2. Context-Sensitive Left Toolbox

The **Left Toolbox** (`#ha-left-toolbox`) dynamically displays tools matching the currently selected layer's type in the **Layers & Blend Modes** dock panel:

### 2.1 Editing a Vector Layer (`VECTOR / INKSCAPE` Context)
When a `VEC` layer is selected, the Left Toolbox displays a cyan `✒️ <Layer Name>` badge and the **9 Vector Tools**:
| Icon | Tool | Shortcut | Description |
| :---: | :--- | :---: | :--- |
| `↖` | **Select / Move / In-Place Edit** | `V` | Click to select, Shift+Click to multi-select for Boolean ops, drag to move, or **double-click any `<ObjectRef>`** to edit it In-Place. |
| `▭` | **Draw Rectangle** | `U` | Drag to draw a vector rectangle with fill, stroke, and stroke width. |
| `⚪` | **Draw Circle** | `O` | Drag to draw a parametric circle. |
| `⬭` | **Draw Ellipse** | `L` | Drag to draw a parametric ellipse. |
| `⬡` | **Draw Polygon** | `Y` | Drag to draw an $N$-sided regular polygon (`Points/Sides` option in top bar). |
| `⭐` | **Draw Star** | `S` | Drag to draw a star with configurable `Points/Sides` and `Inner Radius`. |
| `╱` | **Draw Line** | `I` | Drag to draw a straight vector line segment. |
| `✒️` | **Draw Path / Curve** | `P` | Freehand/polyline vector path tool with `Close Path` option. |
| `🔤` | **Vector Text** | `T` | Click to place scalable SVG typography (`Text`, `Font Size`, `Color`). |

### 2.2 Editing a Raster Layer (`RASTER / GIMP` Context)
When a `RAS` layer is selected, the Left Toolbox displays a gold `🖌️ <Layer Name>` badge and the **8 Raster & Selection Tools**:
| Icon | Tool | Shortcut | Description |
| :---: | :--- | :---: | :--- |
| `🖌️` | **Paintbrush** | `B` | Soft/adjustable anti-aliased GIMP brush stroke (`Color`, `Size`, `Hardness`, `Opacity`). |
| `✏️` | **Pencil (Hard Edge)** | `N` | Crisp 100% hard-edge pixel art pencil. |
| `💨` | **Airbrush (Soft)** | `A` | Feathered low-hardness airbrush stroke. |
| `🧽` | **Eraser** | `E` | Erases alpha channel pixels along the stroke path. |
| `🪣` | **Bucket Flood Fill** | `G` | Contiguous flood fill with configurable `Tolerance` (`0–255`). |
| `🌈` | **Gradient Fill** | `D` | Drag across canvas to render a `Linear Gradient` or `Radial Gradient` from Foreground to Background color. |
| `⬚` | **Rectangle Select** | `R` | Drag to create a rectangular marching-ants pixel selection mask. |
| `◯` | **Ellipse Select** | `C` | Drag to create an elliptical marching-ants pixel selection mask. |

---

## 3. Complete 15-Menu GIMP Menubar Reference

1. **`File`**:
   - `New...` (`Ctrl+N`), `Create` (`From Clipboard`, `Sample Art Templates`), `Open...` (`Ctrl+O`), `Open as Layers...` (`Ctrl+Alt+O`), `Open Recent`, `Import` (`Import as New Canvas`, `Import as Layers into Current Canvas`, `Import as Reusable Shared Object`, `Import into Active Shared Object`), `Save` (`Ctrl+S`), `Save As...` (`Shift+Ctrl+S`), `Save a Copy...`, `Revert`, `Export As...` (`Ctrl+E`), `Export By Format` (`.PNG`, `.SVG`, `.GIF`, `.ORA`, `.BMP`, `.TGA`, `.PCX`, `.ICO`, `.PPM`, `.FARBFELD`, `.SPRITESHEET`), `Copy Image Location`, `Close View` (`Ctrl+W`), `Quit` (`Ctrl+Q`).
2. **`Edit`**:
   - `Undo <Action>` (`Ctrl+Z`), `Redo <Action>` (`Ctrl+Y`), `Strong Undo` (`Ctrl+Shift+Z`), `Strong Redo` (`Ctrl+Shift+Y`), `Undo History...`, `Clear Undo History`, `Cut` (`Ctrl+X`), `Copy` (`Ctrl+C`), `Copy Visible` (`Ctrl+Shift+C`), `Paste` (`Ctrl+V`), `Paste In Place` (`Ctrl+Alt+V`), `Paste Into Selection`, `Paste as` (`New Layer`, `New Layer In Place`, `New Image`, `New Shared Object`), `Buffer` (`Cut Named...`, `Copy Named...`, `Copy Visible Named...`, `Paste Named`), `Clear` (`Delete`), `Fill with Foreground Color` (`Ctrl+,`), `Fill with Background Color` (`Ctrl+.`), `Fill with Pattern` (`Ctrl+;`), `Fill Selection Outline...`, `Fill Path...`, `Stroke Selection...`, `Stroke Path...`, `Preferences...`, `Keyboard Shortcuts...`.
3. **`Select`**:
   - `Select All Canvas` (`Ctrl+A`), `Clear Selection` (`Ctrl+Shift+A`), `Invert Selection Mask` (`Ctrl+I`), `Float` (`Shift+Ctrl+L`), `By Color` (`Shift+O`), `From Path` (`Shift+V`), `To Path`, `Feather...`, `Shrink...`, `Grow...`, `Border...`.
4. **`View`**:
   - `Zoom` (`Revert Zoom`, `Zoom Out`, `Zoom In`, `Fit Image in Window`, `Fill Window`, `Zoom to Selection`, `400%` down to `12.5%`, `Other Zoom...`), `Flip & Rotate` (`Reset Flip & Rotate`, `Flip Horizontally`, `Flip Vertically`, `Rotate 15° CW/CCW`, `Rotate 90° CW/CCW`, `Rotate 180°`, `Other Rotation...`), `Center Image in Window` (`Shift+J`), `Show All`, `Dot for Dot`, `Show Selection` (`Ctrl+T`), `Show Layer Boundary`, `Show Canvas Boundary`, `Show Guides` (`Shift+Ctrl+T`), `Show Grid`, `Show Sample Points`, `Snap to Guides`, `Snap to Grid`, `Snap to Canvas Edges`, `Snap to Active Path`, `Padding Color`, `Show Menubar`, `Show Rulers`, `Show Scrollbars`, `Show Statusbar`.
5. **`Image`**:
   - `Duplicate` (`Ctrl+D`), `Mode` (`RGB`, `Grayscale`, `Indexed...`), `Transform` (`Flip Horizontally`, `Flip Vertically`, `Rotate 90° CW`, `Rotate 90° CCW`, `Rotate 180°`), `Canvas Size...`, `Scale Image...`, `Crop to Selection`, `Crop to Content`, `Merge Visible Layers...` (`Ctrl+M`), `Flatten Image`, `Guides` (`New Guide by Percent...`, `New Guide...`, `New Guides from Selection`, `Remove All Guides`), `Configure Grid...`, `Image Properties`.
6. **`Layer`**:
   - `New Raster Layer...` (`Ctrl+Shift+N`), `New Vector Layer...`, `New from Visible`, `Duplicate Layer` (`Ctrl+Shift+D`), `Anchor Layer` (`Ctrl+H`), `Merge Down`, `Delete Layer`, `Stack` (`Select Previous Layer`, `Select Next Layer`, `Select Top Layer`, `Select Bottom Layer`, `Raise Layer`, `Lower Layer`, `Layer to Top`, `Layer to Bottom`), `Mask`, `Transparency` (`Threshold Alpha...`, `Alpha to Selection`), `Transform` (`Flip Horizontally`, `Flip Vertically`, `Rotate 90° CW/CCW`, `Rotate 180°`, `Offset...`), `Layer to Image Size`, `Scale Layer...`, `Crop to Selection`, `Crop to Content`.
7. **`Colors`**:
   - `Color Balance...`, `Hue-Saturation...`, `Brightness-Contrast...`, `Levels...`, `Curves...`, `Threshold...`, `Posterize...`, `Invert`, `Desaturate` (`Luminance`, `Sepia Tone`), `Auto` (`White Balance / Stretch Contrast`).
8. **`Tools`**:
   - `Selection Tools`, `Paint Tools (GIMP)`, `Vector & Path Tools (Inkscape)`, `Default Colors` (`D`), `Swap Colors` (`X`).
9. **`Filters`**:
   - `Repeat Last` (`Ctrl+F`), plus all registered GIMP Pixel Filters (`Gaussian Blur`, `Sharpen`, `Invert`, `Threshold`, `Brightness / Contrast`, `Drop Shadow`).
10. **`Vector`**:
    - `Boolean Union` (`Ctrl++`), `Boolean Difference` (`Ctrl+-`), `Boolean Intersection` (`Ctrl+*`), `Boolean Exclusion` (`Ctrl+^`), `Simplify Vector Path` (`Ctrl+L`), `Outset / Expand Vector Path (+4px)`.
11. **`Shared Objects`**:
    - `Create New Shared Object...`, `Exit Shared Object Edit Mode (Return to Main Canvas)`.
12. **`Library`**:
    - `OS Config Dir`, `Browse & Choose Library Folder...`, `Reset Library Folder to Default OS Config Directory`.
13. **`Windows`**:
    - `Dockable Dialogs`, `Toolbox` (`Ctrl+B`), `Hide Docks` (`Tab`), `Single-Window Mode`.
14. **`🤖 AI Studio`**:
    - `LM Studio Server`, `Configure LM Studio Server & Model...`, `Browse All 26 AI Canvas Tools...`, plus guided 1-click AI authoring prompts.
15. **`Help`**:
    - `Keyboard Shortcuts Reference...` (`F1`), `Open Undo History...`, `Browse All 26 AI Studio Tools...`, `About HAEditor`.
