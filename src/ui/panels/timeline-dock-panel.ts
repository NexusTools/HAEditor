import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuManager } from "../context-menu.js";
import type { EditorSessionState } from "../../state/editor-state.js";

/**
 * Animation Timeline & Keyframe Dock Panel inheriting from `AbstractDockPanel`.
 */
export class TimelineDockPanel extends AbstractDockPanel {
    public readonly panelId = "ha-timeline-panel";
    public readonly panelTitle = "Animation Timeline";
    public readonly panelIcon = "🎬";
    private playTimer: ReturnType<typeof setInterval> | null = null;

    constructor(containerEl: HTMLElement, state: EditorSessionState, contextMenu: ContextMenuManager) {
        super(containerEl, state, contextMenu);
    }

    protected override getHeaderActions(): DockActionButton[] {
        return [
            {
                id: "btn-timeline-play",
                label: this.state.isPlayingAnimation ? "Pause" : "Play",
                icon: this.state.isPlayingAnimation ? "⏸️" : "▶️",
                title: "Play / Pause Animation Timeline",
                onClick: () => this.togglePlay()
            },
            {
                id: "btn-timeline-onion",
                label: this.state.onionSkin ? "Onion: ON" : "Onion: OFF",
                icon: "🧅",
                title: "Toggle Onion-Skin Previous Frame Overlay",
                onClick: () => {
                    this.state.onionSkin = !this.state.onionSkin;
                    this.state.notify();
                }
            },
            {
                id: "btn-timeline-add-frame",
                label: "+Frame",
                icon: "➕",
                title: "Add Frame to Timeline",
                onClick: () => {
                    const cState = this.state.getCanvasState();
                    this.state.engine.configureTimeline(this.state.canvasId, {
                        totalFrames: cState.timeline.totalFrames + 1
                    });
                    this.state.notify();
                }
            }
        ];
    }

    private togglePlay(): void {
        this.state.isPlayingAnimation = !this.state.isPlayingAnimation;
        if (this.state.isPlayingAnimation) {
            const cState = this.state.getCanvasState();
            const intervalMs = Math.max(40, Math.round(1000 / (cState.timeline.fps || 12)));
            this.playTimer = setInterval(() => {
                const st = this.state.getCanvasState();
                this.state.currentFrame = (this.state.currentFrame + 1) % Math.max(1, st.timeline.totalFrames);
                this.state.notify();
            }, intervalMs);
        } else if (this.playTimer) {
            clearInterval(this.playTimer);
            this.playTimer = null;
        }
        this.state.notify();
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        const cState = this.state.getCanvasState();
        const totalFrames = Math.max(1, cState.timeline.totalFrames);

        const strip = this.createElement("div", "ha-timeline-strip");
        for (let f = 0; f < totalFrames; f++) {
            const hasKeyframe = cState.timeline.keyframes.some(kf => kf.frame === f);
            const cell = this.createElement(
                "button",
                `ha-timeline-frame-cell ${this.state.currentFrame === f ? "active" : ""} ${hasKeyframe ? "has-keyframe" : ""}`,
                `${f}`,
                {
                    "data-frame-index": String(f),
                    title: `Frame ${f}${hasKeyframe ? " (Keyframe)" : ""}`,
                    type: "button"
                }
            );
            cell.addEventListener("click", () => {
                this.state.currentFrame = f;
                this.state.notify();
            });
            strip.appendChild(cell);
        }

        const keyframeBtn = this.createElement(
            "button",
            "ha-btn ha-btn-secondary",
            "🔑 Keyframe Selected Object @ Frame",
            {
                id: "btn-add-keyframe",
                type: "button"
            }
        );
        keyframeBtn.addEventListener("click", () => {
            const objId = this.state.selectedObjectIds[0];
            if (!objId) {
                this.state.setStatus("Select a vector object or <ObjectRef> first to record a keyframe.");
                return;
            }
            const layers = this.state.getActiveContainerLayers();
            for (const l of layers) {
                const obj = l.objects.find(o => o.id === objId);
                if (obj) {
                    this.state.engine.setKeyframe(this.state.canvasId, {
                        targetId: obj.id,
                        frame: this.state.currentFrame,
                        easing: "easeInOut",
                        properties: {
                            x: obj.x ?? 0,
                            y: obj.y ?? 0,
                            rotation: obj.rotation ?? 0,
                            scaleX: obj.scaleX ?? 1,
                            scaleY: obj.scaleY ?? 1,
                            opacity: obj.opacity ?? 1
                        }
                    });
                    this.state.setStatus(`Recorded keyframe for "${obj.id}" at frame ${this.state.currentFrame}.`);
                    return;
                }
            }
        });

        bodyEl.append(strip, keyframeBtn);
    }
}
