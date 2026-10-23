import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AbstractUIComponent } from "./abstract-ui-component.js";

export interface PromptFieldSpec {
    key: string;
    label: string;
    defaultValue: string;
    placeholder?: string;
    description?: string;
    type?: "text" | "number" | "color" | "select";
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ label: string; value: string }>;
    quickChips?: Array<{ label: string; value: string }>;
    visibleWhen?:
        | {
              fieldKey: string;
              equals: string | string[];
          }
        | ((values: Record<string, string>) => boolean);
}

export interface FormPresetOption {
    label: string;
    icon?: string;
    values: Record<string, string>;
}

export interface ErrorDialogOptions {
    title: string;
    message: string;
    details?: string;
}

export interface FileFilterOption {
    label: string;
    extensions: string[]; // empty array = all files (*.*)
}

export interface FileBrowserDialogOptions {
    title: string;
    subtitle?: string;
    mode: "open" | "save" | "directory";
    submitLabel?: string;
    initialDir?: string;
    initialFileName?: string;
    defaultExtension?: string;
    filters?: FileFilterOption[];
    extraBookmarks?: Array<{ label: string; icon: string; dirPath: string }>;
    onSubmit: (fullFilePath: string) => void;
}

const DEFAULT_ARTWORK_FILTERS: FileFilterOption[] = [
    {
        label: "All Supported Artwork (.hacanvas, .ai, .psd, .xcf, .ora, .svg, .png, .jpg, .gif, .bmp, .tga, ...)",
        extensions: [
            ".hacanvas", ".aicz", ".ai", ".psd", ".psb", ".xcf", ".ora", ".svg",
            ".png", ".bmp", ".gif", ".tga", ".pcx", ".ico", ".cur",
            ".ppm", ".pgm", ".pbm", ".pnm", ".pam", ".ff", ".farbfeld", ".xbm",
            ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".haso"
        ]
    },
    { label: "All Files (*.*)", extensions: [] },
    { label: "HAEditor Hybrid Canvas (.hacanvas, .aicz)", extensions: [".hacanvas", ".aicz"] },
    { label: "Adobe Illustrator Artwork (.ai)", extensions: [".ai"] },
    { label: "Adobe Photoshop Document (.psd, .psb)", extensions: [".psd", ".psb"] },
    { label: "GIMP XCF Image (.xcf)", extensions: [".xcf"] },
    { label: "Scalable Vector Graphics (.svg)", extensions: [".svg"] },
    { label: "OpenRaster Archive (.ora)", extensions: [".ora"] },
    {
        label: "Raster Image Formats (.png, .jpg, .gif, .bmp, .tga, .pcx, .ico, .ppm, .ff, .xbm, .tiff)",
        extensions: [
            ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tga", ".pcx", ".ico", ".cur",
            ".ppm", ".pgm", ".pbm", ".pnm", ".pam", ".ff", ".farbfeld", ".xbm", ".webp", ".tif", ".tiff"
        ]
    },
    { label: "HAEditor Shared Object Library Item (.haso)", extensions: [".haso", ".hacanvas"] }
];

/**
 * Custom modal dialog manager for `workspace/haeditor` inheriting from `AbstractUIComponent`.
 * Provides both GIMP-style interactive File Browser dialogs (with Places sidebar, directory table,
 * format filter dropdown, and native OS file dialog button) and form dialogs.
 */
export class ModalDialogManager extends AbstractUIComponent {
    private activeBackdrop: HTMLElement | null = null;
    private lastBrowsedDir: string = process.cwd();

    constructor(containerEl?: HTMLElement) {
        super(containerEl || (AbstractUIComponent.activeDocument?.body ?? document.body));
    }

    public override render(): void {}

    /**
     * Opens a GIMP-style File Browser dialog for opening, importing, saving, or exporting files.
     */
    public openFileBrowserDialog(options: FileBrowserDialogOptions): void {
        this.closeDialog();

        const filters = options.filters && options.filters.length > 0 ? options.filters : DEFAULT_ARTWORK_FILTERS;
        let activeFilterIdx = 0;

        let currentDir = options.initialDir || this.lastBrowsedDir || process.cwd();
        try {
            if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
                currentDir = process.cwd();
            }
        } catch {
            currentDir = process.cwd();
        }

        const backdrop = this.createElement("div", "ha-modal-backdrop", undefined, {
            id: "ha-modal-backdrop"
        });
        const card = this.createElement("div", "ha-modal-card ha-file-browser-card", undefined, {
            id: "ha-file-browser-dialog"
        });

        // Header
        const header = this.createElement("div", "ha-modal-header ha-fb-header");
        const titleSpan = this.createElement("span", undefined, options.title);
        const closeXBtn = this.createElement("button", "ha-icon-btn", "✕", {
            title: "Close (Esc)",
            type: "button"
        });
        closeXBtn.addEventListener("click", () => this.closeDialog());
        header.append(titleSpan, closeXBtn);

        const subtitleBanner = options.subtitle
            ? this.createElement("div", "ha-modal-subtitle-banner", options.subtitle)
            : null;

        // Top Navigation Bar (Up, Home, Editable Path Bar, Native OS File Picker button)
        const navBar = this.createElement("div", "ha-fb-navbar");
        const upBtn = this.createElement("button", "ha-btn ha-btn-secondary ha-btn-sm", "⬆️ Parent Folder", {
            id: "ha-fb-btn-up",
            title: "Go to Parent Directory",
            type: "button"
        });
        const pathInput = this.createElement("input", "ha-input ha-fb-path-input", undefined, {
            id: "ha-fb-dir-input",
            type: "text",
            value: currentDir,
            title: "Current Folder Path"
        });
        const goBtn = this.createElement("button", "ha-btn ha-btn-secondary ha-btn-sm", "Open Folder", {
            id: "ha-fb-btn-go",
            title: "Navigate to typed folder path",
            type: "button"
        });
        const nativePickerBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary ha-btn-sm",
            "🪟 System File Dialog...",
            {
                id: "ha-fb-btn-native",
                title: "Open native Windows Explorer file chooser",
                type: "button"
            }
        );
        const hiddenFileInput = this.createElement("input", undefined, undefined, {
            type: "file",
            style: "display:none"
        });
        if (options.mode === "save") {
            hiddenFileInput.setAttribute("nwsaveas", options.initialFileName || "artwork.hacanvas");
        } else if (options.mode === "directory") {
            hiddenFileInput.setAttribute("nwdirectory", "");
        }
        const activeExts = filters[activeFilterIdx]?.extensions || [];
        if (options.mode !== "directory" && activeExts.length > 0) {
            hiddenFileInput.setAttribute("accept", activeExts.join(","));
        }

        navBar.append(upBtn, pathInput, goBtn, nativePickerBtn, hiddenFileInput);

        // Main Split Area: Left Places Sidebar + Right File/Folder Table
        const splitBody = this.createElement("div", "ha-fb-split-body");
        const placesSidebar = this.createElement("div", "ha-fb-places");
        const placesHeader = this.createElement("div", "ha-fb-places-header", "PLACES");
        placesSidebar.appendChild(placesHeader);

        const homeDir = os.homedir();
        const places: Array<{ label: string; icon: string; dirPath: string }> = [
            ...(options.extraBookmarks || []),
            { label: "Workspace", icon: "🎨", dirPath: process.cwd() },
            { label: "Home", icon: "🏠", dirPath: homeDir },
            { label: "Desktop", icon: "🖥️", dirPath: path.join(homeDir, "Desktop") },
            { label: "Documents", icon: "📄", dirPath: path.join(homeDir, "Documents") },
            { label: "Pictures", icon: "🖼️", dirPath: path.join(homeDir, "Pictures") },
            { label: "Downloads", icon: "⬇️", dirPath: path.join(homeDir, "Downloads") }
        ];

        if (process.platform === "win32") {
            for (const letter of ["C", "D", "E", "F", "G"]) {
                const driveRoot = `${letter}:\\`;
                try {
                    if (fs.existsSync(driveRoot)) {
                        places.push({ label: `Drive (${letter}:)`, icon: "💽", dirPath: driveRoot });
                    }
                } catch {
                    // Ignore inaccessible drive
                }
            }
        }

        // Right File Table Container
        const tableWrap = this.createElement("div", "ha-fb-table-wrap");
        const tableHeader = this.createElement("div", "ha-fb-table-header");
        tableHeader.append(
            this.createElement("span", "ha-fb-col-name", "Name"),
            this.createElement("span", "ha-fb-col-type", "Type"),
            this.createElement("span", "ha-fb-col-size", "Size")
        );
        const fileListEl = this.createElement("div", "ha-fb-file-list", undefined, {
            id: "ha-fb-file-list"
        });
        tableWrap.append(tableHeader, fileListEl);
        splitBody.append(placesSidebar, tableWrap);

        // Bottom Controls: File Name Input + Format Filter Select + Cancel / Submit Buttons
        const bottomArea = this.createElement("div", "ha-fb-bottom-area");

        const nameRow = this.createElement("div", "ha-fb-control-row");
        const nameLbl = this.createElement(
            "label",
            "ha-fb-control-label",
            options.mode === "directory" ? "Selected Folder:" : "File Name:"
        );
        const fileNameInput = this.createElement("input", "ha-input ha-fb-filename-input", undefined, {
            id: "ha-fb-filename-input",
            "data-field-key": "filePath",
            type: "text",
            value: options.mode === "directory" ? currentDir : (options.initialFileName || ""),
            placeholder:
                options.mode === "directory"
                    ? "Browse to a folder above and click Select Folder..."
                    : options.mode === "save"
                      ? "Enter file name (e.g. artwork.hacanvas)..."
                      : "Click a file in the list above (or double-click to open immediately)..."
        });
        nameRow.append(nameLbl, fileNameInput);

        const filterRow = this.createElement("div", "ha-fb-control-row");
        const filterLbl = this.createElement("label", "ha-fb-control-label", "Format Filter:");
        const filterSelect = this.createElement("select", "ha-select ha-fb-filter-select", undefined, {
            id: "ha-fb-filter-select"
        });
        filters.forEach((f, idx) => {
            const opt = this.createElement("option", undefined, f.label, { value: String(idx) });
            if (idx === activeFilterIdx) opt.selected = true;
            filterSelect.appendChild(opt);
        });
        filterRow.append(filterLbl, filterSelect);
        if (options.mode === "directory") {
            filterRow.style.display = "none";
        }

        const footer = this.createElement("div", "ha-modal-footer ha-fb-footer");
        const statusInfo = this.createElement("span", "ha-fb-status-info", currentDir);
        const btnGroup = this.createElement("div", "ha-fb-btn-group");
        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Cancel", {
            id: "ha-modal-cancel",
            type: "button"
        });
        const submitBtn = this.createElement(
            "button",
            "ha-btn ha-btn-primary",
            options.submitLabel ||
                (options.mode === "directory" ? "Select This Folder" : options.mode === "save" ? "Save" : "Open"),
            {
                id: "ha-modal-submit",
                type: "button"
            }
        );
        btnGroup.append(cancelBtn, submitBtn);
        footer.append(statusInfo, btnGroup);

        bottomArea.append(nameRow, filterRow, footer);

        const formatBytes = (bytes: number): string => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        };

        const iconForExtension = (ext: string): string => {
            if (ext === ".hacanvas" || ext === ".aicz" || ext === ".haso") return "📦";
            if (ext === ".ai" || ext === ".svg") return "✒️";
            if (ext === ".psd" || ext === ".psb" || ext === ".xcf" || ext === ".ora") return "🗂️";
            return "🖼️";
        };

        const resolveFinalPath = (): string => {
            if (options.mode === "directory") {
                const rawDir = fileNameInput.value.trim();
                if (!rawDir) return currentDir;
                return path.isAbsolute(rawDir) ? rawDir : path.join(currentDir, rawDir);
            }
            const rawVal = fileNameInput.value.trim();
            if (!rawVal) return "";
            let resolved = path.isAbsolute(rawVal) ? rawVal : path.join(currentDir, rawVal);
            if (options.mode === "save" && options.defaultExtension && !path.extname(resolved)) {
                resolved += options.defaultExtension.startsWith(".")
                    ? options.defaultExtension
                    : `.${options.defaultExtension}`;
            }
            return resolved;
        };

        const submitSelectedFile = () => {
            const finalPath = resolveFinalPath();
            if (!finalPath) return;
            if (options.mode !== "directory") {
                try {
                    if (fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory()) {
                        navigateTo(finalPath);
                        fileNameInput.value = "";
                        return;
                    }
                } catch {
                    // Proceed with file submission
                }
            }
            this.lastBrowsedDir = currentDir;
            this.closeDialog();
            options.onSubmit(finalPath);
        };

        const renderDirectoryListing = () => {
            pathInput.value = currentDir;
            statusInfo.textContent = currentDir;
            if (options.mode === "directory") {
                fileNameInput.value = currentDir;
            }
            fileListEl.innerHTML = "";

            // Always show `.. (Parent Folder)` at the top when not at filesystem root
            const parentDir = path.dirname(currentDir);
            if (parentDir && parentDir !== currentDir) {
                const upRow = this.createElement("div", "ha-fb-row ha-fb-row-dir", undefined, {
                    "data-entry-name": "..",
                    "data-entry-type": "dir"
                });
                upRow.append(
                    this.createElement("span", "ha-fb-col-name", "📁 .. (Parent Folder)"),
                    this.createElement("span", "ha-fb-col-type", "Parent"),
                    this.createElement("span", "ha-fb-col-size", "—")
                );
                upRow.addEventListener("click", () => navigateTo(parentDir));
                fileListEl.appendChild(upRow);
            }

            let entries: fs.Dirent[] = [];
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            } catch (err: any) {
                const errRow = this.createElement(
                    "div",
                    "ha-fb-empty-msg",
                    `Unable to read directory: ${err?.message || err}`
                );
                fileListEl.appendChild(errRow);
                return;
            }

            const allowedExts = filters[activeFilterIdx]?.extensions || [];
            const dirs: fs.Dirent[] = [];
            const files: fs.Dirent[] = [];

            for (const entry of entries) {
                if (entry.name.startsWith(".")) continue;
                if (entry.isDirectory()) {
                    dirs.push(entry);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (allowedExts.length === 0 || allowedExts.includes(ext)) {
                        files.push(entry);
                    }
                }
            }

            dirs.sort((a, b) => a.name.localeCompare(b.name));
            files.sort((a, b) => a.name.localeCompare(b.name));

            if (dirs.length === 0 && files.length === 0) {
                fileListEl.appendChild(
                    this.createElement("div", "ha-fb-empty-msg", "No matching files or folders in this directory.")
                );
                return;
            }

            for (const d of dirs) {
                const fullDirPath = path.join(currentDir, d.name);
                const row = this.createElement("div", "ha-fb-row ha-fb-row-dir", undefined, {
                    "data-entry-name": d.name,
                    "data-entry-type": "dir"
                });
                row.append(
                    this.createElement("span", "ha-fb-col-name", `📁 ${d.name}`),
                    this.createElement("span", "ha-fb-col-type", "Folder"),
                    this.createElement("span", "ha-fb-col-size", "—")
                );
                row.addEventListener("click", () => {
                    navigateTo(fullDirPath);
                });
                fileListEl.appendChild(row);
            }

            for (const f of files) {
                const fullFilePath = path.join(currentDir, f.name);
                const ext = path.extname(f.name).toLowerCase();
                let sizeStr = "";
                try {
                    const st = fs.statSync(fullFilePath);
                    sizeStr = formatBytes(st.size);
                } catch {
                    sizeStr = "";
                }

                const row = this.createElement("div", "ha-fb-row ha-fb-row-file", undefined, {
                    "data-entry-name": f.name,
                    "data-entry-path": fullFilePath,
                    "data-entry-type": "file"
                });
                row.append(
                    this.createElement("span", "ha-fb-col-name", `${iconForExtension(ext)} ${f.name}`),
                    this.createElement("span", "ha-fb-col-type", (ext.replace(/^\./, "") || "FILE").toUpperCase()),
                    this.createElement("span", "ha-fb-col-size", sizeStr)
                );
                row.addEventListener("click", () => {
                    fileListEl.querySelectorAll(".ha-fb-row.selected").forEach(el => el.classList.remove("selected"));
                    row.classList.add("selected");
                    fileNameInput.value = f.name;
                    statusInfo.textContent = `${fullFilePath} (${sizeStr})`;
                });
                row.addEventListener("dblclick", () => {
                    fileNameInput.value = f.name;
                    submitSelectedFile();
                });
                fileListEl.appendChild(row);
            }
        };

        const navigateTo = (targetDir: string) => {
            const resolved = path.resolve(targetDir);
            try {
                if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
                    currentDir = resolved;
                    this.lastBrowsedDir = currentDir;
                    renderDirectoryListing();
                }
            } catch {
                // Ignore invalid path
            }
        };

        for (const place of places) {
            try {
                if (!fs.existsSync(place.dirPath)) continue;
            } catch {
                continue;
            }
            const placeBtn = this.createElement(
                "button",
                "ha-fb-place-btn",
                `${place.icon} ${place.label}`,
                {
                    title: place.dirPath,
                    type: "button"
                }
            );
            placeBtn.addEventListener("click", () => navigateTo(place.dirPath));
            placesSidebar.appendChild(placeBtn);
        }

        upBtn.addEventListener("click", () => {
            const parent = path.dirname(currentDir);
            if (parent && parent !== currentDir) {
                navigateTo(parent);
            }
        });

        goBtn.addEventListener("click", () => navigateTo(pathInput.value.trim()));
        pathInput.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                navigateTo(pathInput.value.trim());
            }
        });

        filterSelect.addEventListener("change", () => {
            activeFilterIdx = Number(filterSelect.value) || 0;
            renderDirectoryListing();
        });

        nativePickerBtn.addEventListener("click", () => {
            hiddenFileInput.click();
        });

        hiddenFileInput.addEventListener("change", () => {
            const files = hiddenFileInput.files;
            if (files && files.length > 0) {
                const picked = files[0] as File & { path?: string };
                const pickedPath = picked.path || picked.name;
                if (pickedPath) {
                    this.lastBrowsedDir = path.dirname(pickedPath);
                    this.closeDialog();
                    options.onSubmit(pickedPath);
                }
            }
        });

        cancelBtn.addEventListener("click", () => this.closeDialog());
        submitBtn.addEventListener("click", submitSelectedFile);

        fileNameInput.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                submitSelectedFile();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.closeDialog();
            }
        });

        card.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                this.closeDialog();
            }
        });

        if (subtitleBanner) {
            card.append(header, subtitleBanner, navBar, splitBody, bottomArea);
        } else {
            card.append(header, navBar, splitBody, bottomArea);
        }
        backdrop.appendChild(card);
        this.containerEl.appendChild(backdrop);
        this.activeBackdrop = backdrop;

        renderDirectoryListing();
        fileNameInput.focus();
    }

    public openFormDialog(options: {
        title: string;
        subtitle?: string;
        presets?: FormPresetOption[];
        fields: PromptFieldSpec[];
        submitLabel?: string;
        customPreview?: (api: {
            getValues: () => Record<string, string>;
            setValues: (vals: Record<string, string>) => void;
            onChange: (listener: (values: Record<string, string>) => void) => void;
        }) => HTMLElement;
        onSubmit: (values: Record<string, string>) => void;
    }): void {
        this.closeDialog();

        const backdrop = this.createElement("div", "ha-modal-backdrop", undefined, {
            id: "ha-modal-backdrop"
        });
        const card = this.createElement(
            "div",
            options.customPreview ? "ha-modal-card ha-modal-card-with-preview" : "ha-modal-card"
        );
        const header = this.createElement("div", "ha-modal-header ha-fb-header");
        const titleSpan = this.createElement("span", undefined, options.title);
        const closeXBtn = this.createElement("button", "ha-icon-btn", "✕", {
            title: "Close (Esc)",
            type: "button"
        });
        closeXBtn.addEventListener("click", () => this.closeDialog());
        header.append(titleSpan, closeXBtn);

        const body = this.createElement("div", "ha-modal-body");

        if (options.subtitle) {
            body.appendChild(this.createElement("div", "ha-modal-subtitle-banner", options.subtitle));
        }

        const valueSetters: Record<string, (val: string) => void> = {};
        const valueGetters: Record<string, () => string> = {};
        const conditionalRows: Array<{ field: PromptFieldSpec; rowEl: HTMLElement }> = [];
        const changeListeners: Array<(values: Record<string, string>) => void> = [];
        let firstFocusable: HTMLElement | null = null;

        const collectValues = (): Record<string, string> => {
            const currentValues: Record<string, string> = {};
            for (const [k, getter] of Object.entries(valueGetters)) {
                currentValues[k] = getter();
            }
            return currentValues;
        };

        const refreshFieldVisibility = () => {
            const currentValues = collectValues();
            for (const { field, rowEl } of conditionalRows) {
                const rule = field.visibleWhen;
                if (!rule) continue;
                let visible = true;
                if (typeof rule === "function") {
                    visible = Boolean(rule(currentValues));
                } else {
                    const actual = currentValues[rule.fieldKey] ?? "";
                    visible = Array.isArray(rule.equals)
                        ? rule.equals.includes(actual)
                        : actual === rule.equals;
                }
                rowEl.style.display = visible ? "" : "none";
                rowEl.setAttribute("data-field-visible", visible ? "true" : "false");
            }
            for (const fn of changeListeners) {
                fn(currentValues);
            }
        };

        if (options.presets && options.presets.length > 0) {
            const presetBox = this.createElement("div", "ha-modal-presets-box");
            const presetLbl = this.createElement("span", "ha-modal-presets-label", "Quick Presets:");
            presetBox.appendChild(presetLbl);
            const pillsRow = this.createElement("div", "ha-modal-presets-row");
            for (const p of options.presets) {
                const btn = this.createElement(
                    "button",
                    "ha-modal-preset-pill",
                    `${p.icon ? p.icon + " " : ""}${p.label}`,
                    { type: "button" }
                );
                btn.addEventListener("click", () => {
                    for (const [k, v] of Object.entries(p.values)) {
                        if (valueSetters[k]) valueSetters[k](v);
                    }
                    refreshFieldVisibility();
                });
                pillsRow.appendChild(btn);
            }
            presetBox.appendChild(pillsRow);
            body.appendChild(presetBox);
        }

        const fieldsHost = options.customPreview
            ? this.createElement("div", "ha-modal-fields-column")
            : body;

        for (const field of options.fields) {
            const row = this.createElement("div", "ha-modal-field-row", undefined, {
                "data-row-field-key": field.key
            });
            if (field.visibleWhen) {
                conditionalRows.push({ field, rowEl: row });
            }
            const label = this.createElement("label", "ha-modal-label", field.label);
            row.appendChild(label);

            if (field.description) {
                row.appendChild(this.createElement("div", "ha-modal-field-desc", field.description));
            }

            if (field.type === "select" && field.options && field.options.length > 0) {
                const sel = this.createElement("select", "ha-select ha-modal-input", undefined, {
                    "data-field-key": field.key
                });
                for (const opt of field.options) {
                    const oEl = this.createElement("option", undefined, opt.label, { value: opt.value });
                    if (opt.value === field.defaultValue) oEl.selected = true;
                    sel.appendChild(oEl);
                }
                sel.addEventListener("change", () => refreshFieldVisibility());
                valueGetters[field.key] = () => sel.value;
                valueSetters[field.key] = (v: string) => {
                    sel.value = v;
                    refreshFieldVisibility();
                };
                row.appendChild(sel);
                if (!firstFocusable) firstFocusable = sel;
            } else if (field.type === "color") {
                const colorRow = this.createElement("div", "ha-modal-color-row");
                const initialHex = /^#[0-9a-fA-F]{6}$/.test(field.defaultValue) ? field.defaultValue : "#181a24";
                const colorPicker = this.createElement("input", "ha-color-input ha-modal-color-swatch", undefined, {
                    type: "color",
                    value: initialHex,
                    title: "Click to pick color visually"
                });
                const textInp = this.createElement("input", "ha-input ha-modal-input", undefined, {
                    type: "text",
                    "data-field-key": field.key,
                    value: field.defaultValue,
                    placeholder: field.placeholder || "#181a24 or transparent"
                });
                colorPicker.addEventListener("input", () => {
                    textInp.value = colorPicker.value;
                    refreshFieldVisibility();
                });
                textInp.addEventListener("input", () => {
                    if (/^#[0-9a-fA-F]{6}$/.test(textInp.value.trim())) {
                        colorPicker.value = textInp.value.trim();
                    }
                    refreshFieldVisibility();
                });
                valueGetters[field.key] = () => textInp.value.trim();
                valueSetters[field.key] = (v: string) => {
                    textInp.value = v;
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) colorPicker.value = v;
                    refreshFieldVisibility();
                };
                colorRow.append(colorPicker, textInp);
                row.appendChild(colorRow);
                if (!firstFocusable) firstFocusable = textInp;
            } else if (field.type === "number") {
                const numRow = this.createElement("div", "ha-modal-number-row");
                const minVal = field.min ?? 16;
                const maxVal = field.max ?? 4096;
                const stepVal = field.step ?? 1;
                const rangeInp = this.createElement("input", "ha-range ha-modal-range", undefined, {
                    type: "range",
                    min: String(minVal),
                    max: String(maxVal),
                    step: String(stepVal),
                    value: field.defaultValue
                });
                const numInp = this.createElement("input", "ha-input ha-modal-input ha-modal-num-box", undefined, {
                    type: "number",
                    "data-field-key": field.key,
                    min: String(minVal),
                    max: String(maxVal),
                    step: String(stepVal),
                    value: field.defaultValue
                });
                rangeInp.addEventListener("input", () => {
                    numInp.value = rangeInp.value;
                    refreshFieldVisibility();
                });
                numInp.addEventListener("input", () => {
                    rangeInp.value = numInp.value;
                    refreshFieldVisibility();
                });
                valueGetters[field.key] = () => numInp.value.trim();
                valueSetters[field.key] = (v: string) => {
                    numInp.value = v;
                    rangeInp.value = v;
                    refreshFieldVisibility();
                };
                numRow.append(rangeInp, numInp);
                row.appendChild(numRow);
                if (!firstFocusable) firstFocusable = numInp;
            } else {
                const input = this.createElement("input", "ha-input ha-modal-input", undefined, {
                    type: "text",
                    "data-field-key": field.key,
                    value: field.defaultValue,
                    placeholder: field.placeholder || ""
                });
                input.addEventListener("input", () => refreshFieldVisibility());
                valueGetters[field.key] = () => input.value.trim();
                valueSetters[field.key] = (v: string) => {
                    input.value = v;
                    refreshFieldVisibility();
                };
                row.appendChild(input);
                if (!firstFocusable) firstFocusable = input;
            }

            if (field.quickChips && field.quickChips.length > 0) {
                const chipsRow = this.createElement("div", "ha-modal-quick-chips");
                for (const chip of field.quickChips) {
                    const chipBtn = this.createElement("button", "ha-modal-chip-btn", chip.label, {
                        type: "button",
                        title: `Use "${chip.value}"`
                    });
                    chipBtn.addEventListener("click", () => {
                        if (valueSetters[field.key]) valueSetters[field.key](chip.value);
                    });
                    chipsRow.appendChild(chipBtn);
                }
                row.appendChild(chipsRow);
            }

            fieldsHost.appendChild(row);
        }

        if (options.customPreview) {
            const splitWrap = this.createElement("div", "ha-modal-split-preview-layout");
            const previewEl = options.customPreview({
                getValues: collectValues,
                setValues: (vals: Record<string, string>) => {
                    for (const [k, v] of Object.entries(vals)) {
                        if (valueSetters[k]) {
                            valueSetters[k](v);
                        }
                    }
                    refreshFieldVisibility();
                },
                onChange: (listener: (values: Record<string, string>) => void) => {
                    changeListeners.push(listener);
                }
            });
            splitWrap.append(fieldsHost, previewEl);
            body.appendChild(splitWrap);
        }

        refreshFieldVisibility();

        const footer = this.createElement("div", "ha-modal-footer");
        const cancelBtn = this.createElement("button", "ha-btn ha-btn-secondary", "Cancel", {
            id: "ha-modal-cancel",
            type: "button"
        });
        const submitBtn = this.createElement("button", "ha-btn ha-btn-primary", options.submitLabel || "Confirm", {
            id: "ha-modal-submit",
            type: "button"
        });

        const submitForm = () => {
            const values: Record<string, string> = {};
            for (const [k, getter] of Object.entries(valueGetters)) {
                values[k] = getter();
            }
            this.closeDialog();
            options.onSubmit(values);
        };

        cancelBtn.addEventListener("click", () => this.closeDialog());
        submitBtn.addEventListener("click", submitForm);

        card.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submitForm();
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.closeDialog();
            }
        });

        footer.append(cancelBtn, submitBtn);
        card.append(header, body, footer);
        backdrop.appendChild(card);
        this.containerEl.appendChild(backdrop);
        this.activeBackdrop = backdrop;

        if (firstFocusable && "focus" in firstFocusable) {
            firstFocusable.focus();
            if ("select" in firstFocusable && typeof (firstFocusable as HTMLInputElement).select === "function") {
                (firstFocusable as HTMLInputElement).select();
            }
        }
    }

    /**
     * Opens an Error / Alert Modal Dialog (`#ha-error-dialog`) when an operation fails
     * (such as pasting from an empty clipboard or failing to fetch an image from a clipboard URL).
     */
    public openErrorDialog(options: ErrorDialogOptions): void {
        this.closeDialog();

        const backdrop = this.createElement("div", "ha-modal-backdrop", undefined, {
            id: "ha-modal-backdrop"
        });
        const card = this.createElement("div", "ha-modal-card ha-error-modal-card", undefined, {
            id: "ha-error-dialog",
            role: "alertdialog",
            "aria-modal": "true"
        });

        const header = this.createElement("div", "ha-modal-header ha-fb-header");
        const titleSpan = this.createElement("span", "ha-error-dialog-title", `⚠️ ${options.title}`, {
            id: "ha-error-dialog-title"
        });
        const closeXBtn = this.createElement("button", "ha-icon-btn", "✕", {
            id: "ha-error-close-x",
            title: "Close (Esc)",
            type: "button"
        });
        closeXBtn.addEventListener("click", () => this.closeDialog());
        header.append(titleSpan, closeXBtn);

        const body = this.createElement("div", "ha-modal-body");
        const msgBox = this.createElement("div", "ha-error-dialog-message", options.message, {
            id: "ha-error-dialog-message",
            style: "white-space: pre-wrap; word-break: break-word; color: #f0f4ff; font-size: 13px; line-height: 1.5; padding: 10px 12px; background: rgba(255, 77, 109, 0.12); border: 1px solid rgba(255, 77, 109, 0.4); border-radius: 6px;"
        });
        body.appendChild(msgBox);

        if (options.details) {
            const detailsBox = this.createElement("div", "ha-error-dialog-details", options.details, {
                id: "ha-error-dialog-details",
                style: "margin-top: 10px; padding: 8px 10px; background: #10121b; border: 1px solid #2b2f42; border-radius: 5px; font-family: monospace; font-size: 11px; color: #ff8fa3; white-space: pre-wrap; word-break: break-all; max-height: 140px; overflow-y: auto;"
            });
            body.appendChild(detailsBox);
        }

        const footer = this.createElement("div", "ha-modal-footer");
        const okBtn = this.createElement("button", "ha-btn ha-btn-primary", "OK", {
            id: "ha-error-dialog-ok",
            type: "button"
        });
        okBtn.addEventListener("click", () => this.closeDialog());

        card.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                this.closeDialog();
            }
        });

        footer.appendChild(okBtn);
        card.append(header, body, footer);
        backdrop.appendChild(card);
        this.containerEl.appendChild(backdrop);
        this.activeBackdrop = backdrop;

        okBtn.focus();
    }

    public closeDialog(): void {
        if (this.activeBackdrop) {
            this.activeBackdrop.remove();
            this.activeBackdrop = null;
        }
    }
}
