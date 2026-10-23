import { AbstractDockPanel, type DockActionButton } from "./abstract-dock-panel.js";
import type { ContextMenuManager } from "../context-menu.js";
import type { ModalDialogManager } from "../modal-dialog.js";
import type { EditorSessionState } from "../../state/editor-state.js";
import type { AiReasoningLevel, HaAiProviderId } from "@nexustools/hacanvas";
import {
    AiLiveChatController,
    GoogleOAuthManager
} from "@nexustools/aitooling";
import { HaEditorAiToolRegistry } from "../../ai/abstract-ai-tool.js";
import {
    LmStudioAiClient,
    type AiChatMessage,
    type AiReasoningMode
} from "../../ai/lm-studio-client.js";

/**
 * GIMP-style Dockable AI Studio Assistant Panel (`AiAssistantDockPanel extends AbstractDockPanel`)
 * powered by `@nexustools/aitooling` (`AiLiveChatController` + multi-provider `LmStudioAiClient`)
 * and `@nexustools/hacanvas` (`HaEditorAiToolRegistry`).
 *
 * Features:
 * - Multi-provider support: LM Studio (`http://localhost:1234` default), OpenAI, Anthropic Claude,
 *   Google Gemini (API Key & Google One OAuth), xAI Grok, Custom OpenAI, Custom Claude, and custom code providers
 * - Full tool support (26 tools across inspect, canvas, layer, vector, raster, filter, shared objects, library, animation, file I/O)
 * - Live-rendering partial JSON tool generation (`parsePartialJson`) with live canvas updates after every tool call
 * - Non-reasoning mode (`➡️` Fast Send button) AND Reasoning mode (`🧠` Brain button with dropdown for `low`, `medium`, `max`)
 */
export class AiAssistantDockPanel extends AbstractDockPanel {
    public readonly panelId = "panel-ai-assistant";
    public readonly panelTitle = "AI Studio Assistant";
    public readonly panelIcon = "🤖";

    private readonly modal: ModalDialogManager;
    public readonly aiClient: LmStudioAiClient;
    public readonly chatController: AiLiveChatController<EditorSessionState>;

    private initializedDom = false;

    constructor(
        containerEl: HTMLElement,
        state: EditorSessionState,
        contextMenu: ContextMenuManager,
        modal: ModalDialogManager
    ) {
        super(containerEl, state, contextMenu);
        this.modal = modal;
        this.aiClient = new LmStudioAiClient(state, () =>
            this.containerEl?.getAttribute("data-lm-studio-url")
        );
        const cfg = this.state.configManager.getConfig();
        this.chatController = new AiLiveChatController<EditorSessionState>({
            doc: this.doc,
            state: this.state,
            aiClient: this.aiClient,
            toolRegistry: HaEditorAiToolRegistry as any,
            defaultReasoningLevel: cfg.defaultReasoningLevel || "medium",
            starterPrompts: [
                {
                    label: "🔍 Inspect Scene",
                    prompt: "Inspect the current canvas scene graph and summarize all layers, vector shapes, and shared objects.",
                    title: "Ask AI to inspect the canvas scene graph"
                },
                {
                    label: "⭐ Draw Cyan Star",
                    prompt: "Draw a glowing cyan 5-point vector star at (280, 140) with radius 45 and white stroke.",
                    title: "Ask AI to draw a vector star"
                },
                {
                    label: "🎨 Paint Gradient",
                    prompt: "Fill the raster layer with a linear gradient from #1a103c to #00d4ff.",
                    title: "Ask AI to paint a gradient on the raster layer"
                },
                {
                    label: "✨ Blur & Shadow",
                    prompt: "Apply a GIMP drop shadow filter (radius 4, offsetX 5, offsetY 5) to the raster layer.",
                    title: "Ask AI to apply a GIMP filter"
                },
                {
                    label: "🧩 New Shared Badge",
                    prompt: "Create a new Shared Object named 'UI/Badges/RubyShield' (96x96), draw a red polygon shield inside it, and place it on the canvas at (420, 220).",
                    title: "Ask AI to create & instantiate a Shared Object"
                },
                {
                    label: "🎞️ Animate Pulse",
                    prompt: "Configure the timeline to 12 FPS with 16 frames and animate the star's rotation from 0 to 360 degrees.",
                    title: "Ask AI to create keyframe animation"
                }
            ],
            onReasoningLevelChange: (level) => {
                this.state.configManager.updateConfig({ defaultReasoningLevel: level });
            },
            onAfterToolExecuted: () => {
                this.state.notify();
            },
            onStatusChange: (status) => {
                this.state.setStatus(status);
            }
        });
    }

    public get messages(): AiChatMessage[] {
        return this.chatController.messages;
    }

    public set messages(val: AiChatMessage[]) {
        this.chatController.messages = val;
    }

    public get selectedReasoningLevel(): AiReasoningLevel {
        return this.chatController.selectedReasoningLevel;
    }

    public set selectedReasoningLevel(val: AiReasoningLevel) {
        this.chatController.selectedReasoningLevel = val;
    }

    public get lastUsedReasoningMode(): AiReasoningMode {
        return this.chatController.lastUsedReasoningMode;
    }

    public get isStreaming(): boolean {
        return this.chatController.isStreaming;
    }

    protected override getHeaderActions(): DockActionButton[] {
        return [
            {
                id: "btn-ai-settings",
                label: "AI Provider",
                icon: "⚙️",
                title: "Configure AI Service Provider (LM Studio, OpenAI, Claude, Gemini, Grok, Custom)",
                onClick: () => this.openLmStudioSettingsDialog()
            },
            {
                id: "btn-ai-tools-list",
                label: "Tools",
                icon: "🧰",
                title: "View all 26 AI Canvas Tools available in HACanvas",
                onClick: () => this.openToolsCatalogDialog()
            },
            {
                id: "btn-ai-clear",
                label: "Clear",
                icon: "🗑️",
                title: "Reset AI Conversation",
                onClick: () => this.clearConversation()
            }
        ];
    }

    public override render(): void {
        if (!this.initializedDom || !this.containerEl.contains(this.chatController.chatContainerEl)) {
            super.render();
            this.initializedDom = true;
            return;
        }
        this.chatController.updateHeaderBadge();
    }

    protected override renderPanelBody(bodyEl: HTMLElement): void {
        this.chatController.mount(bodyEl);
    }

    public selectReasoningLevel(level: AiReasoningLevel, sendIfInputPresent = true): void {
        this.chatController.selectReasoningLevel(level, sendIfInputPresent);
    }

    public clearConversation(): void {
        this.chatController.clearConversation();
    }

    public abortActiveStream(): void {
        this.chatController.abortActiveStream();
    }

    public promptFromAction(promptText: string, autoSendMode?: AiReasoningMode): void {
        this.isCollapsed = false;
        if (!this.initializedDom) {
            this.render();
        }
        this.chatController.inputEl.value = promptText;
        this.chatController.inputEl.focus();
        if (autoSendMode) {
            void this.chatController.sendMessage(autoSendMode);
        }
    }

    public formatMarkdown(md: string): string {
        return this.chatController.formatMarkdown(md);
    }

    public async sendMessage(reasoningMode: AiReasoningMode = "none", explicitText?: string): Promise<void> {
        await this.chatController.sendMessage(reasoningMode, explicitText);
    }

    /**
     * Opens a multi-provider AI configuration dialog supporting all services from `@nexustools/aitooling`:
     * - LM Studio (`http://localhost:1234` default)
     * - OpenAI (`gpt-4o`, `gpt-4o-mini`, `o3-mini`, `gpt-4-turbo`)
     * - Anthropic Claude (`claude-3-7-sonnet-latest`, `claude-3-5-sonnet-20241022`)
     * - Google Gemini (API Key & Google One OAuth)
     * - xAI Grok (`grok-2`, `grok-4.7`)
     * - Custom OpenAI / Custom Claude endpoints & custom code providers
     */
    public openLmStudioSettingsDialog(): void {
        const cfg = this.state.configManager.getConfig();
        this.modal.openFormDialog({
            title: "🤖 Multi-Provider AI Studio Settings",
            subtitle:
                "Connect HAEditor to LM Studio (local default), OpenAI, Anthropic Claude, Google Gemini, xAI Grok, or any custom AI endpoint via @nexustools/aitooling.",
            presets: [
                {
                    label: "LM Studio Default (localhost:1234)",
                    icon: "🏠",
                    values: { activeProvider: "lmstudio", lmStudioUrl: "http://localhost:1234", aiModel: "local-model" }
                },
                {
                    label: "OpenAI (GPT-4o)",
                    icon: "🟢",
                    values: { activeProvider: "openai", openaiModel: "gpt-4o" }
                },
                {
                    label: "Anthropic Claude (3.7 Sonnet)",
                    icon: "🟠",
                    values: { activeProvider: "claude", claudeModel: "claude-3-7-sonnet-latest" }
                },
                {
                    label: "Google Gemini (2.5 Pro)",
                    icon: "🔵",
                    values: { activeProvider: "gemini", geminiModel: "gemini-2.5-pro" }
                },
                {
                    label: "xAI Grok (Grok-2)",
                    icon: "⚫",
                    values: { activeProvider: "grok", grokModel: "grok-2" }
                }
            ],
            fields: [
                {
                    key: "activeProvider",
                    label: "Active AI Service Provider",
                    type: "select",
                    defaultValue: cfg.activeProvider || "lmstudio",
                    options: AiLiveChatController.getProviderSelectOptions()
                },
                {
                    key: "lmStudioUrl",
                    label: "Server Endpoint URL",
                    type: "text",
                    defaultValue: cfg.lmStudioUrl || "http://localhost:1234",
                    placeholder: "http://localhost:1234",
                    visibleWhen: { fieldKey: "activeProvider", equals: ["lmstudio", "custom-openai"] }
                },
                {
                    key: "aiModel",
                    label: "Model Identifier",
                    type: "text",
                    defaultValue: cfg.aiModel || "local-model",
                    placeholder: "local-model",
                    visibleWhen: (vals) =>
                        !["openai", "claude", "custom-claude", "gemini", "gemini-googleone", "grok"].includes(
                            vals.activeProvider
                        ),
                    quickChips: [
                        { label: "Currently Loaded Model (local-model)", value: "local-model" },
                        { label: "Qwen 2.5 / 3 Coder", value: "qwen2.5-coder" },
                        { label: "DeepSeek R1", value: "deepseek-r1" }
                    ]
                },
                {
                    key: "openaiApiKey",
                    label: "OpenAI API Key",
                    type: "text",
                    defaultValue: cfg.openaiApiKey || "",
                    placeholder: "sk-...",
                    visibleWhen: { fieldKey: "activeProvider", equals: ["openai", "custom-openai"] }
                },
                {
                    key: "openaiModel",
                    label: "OpenAI Model",
                    type: "text",
                    defaultValue: cfg.openaiModel || "gpt-4o",
                    visibleWhen: { fieldKey: "activeProvider", equals: "openai" },
                    quickChips: [
                        { label: "gpt-4o", value: "gpt-4o" },
                        { label: "gpt-4o-mini", value: "gpt-4o-mini" },
                        { label: "o3-mini", value: "o3-mini" }
                    ]
                },
                {
                    key: "customClaudeUrl",
                    label: "Custom Anthropic Claude Endpoint URL",
                    type: "text",
                    defaultValue: cfg.customClaudeUrl || "https://api.anthropic.com",
                    placeholder: "https://api.anthropic.com",
                    visibleWhen: { fieldKey: "activeProvider", equals: "custom-claude" }
                },
                {
                    key: "claudeApiKey",
                    label: "Anthropic Claude API Key",
                    type: "text",
                    defaultValue: cfg.claudeApiKey || "",
                    placeholder: "sk-ant-...",
                    visibleWhen: { fieldKey: "activeProvider", equals: ["claude", "custom-claude"] }
                },
                {
                    key: "claudeModel",
                    label: "Anthropic Claude Model",
                    type: "text",
                    defaultValue: cfg.claudeModel || "claude-3-7-sonnet-latest",
                    visibleWhen: { fieldKey: "activeProvider", equals: ["claude", "custom-claude"] },
                    quickChips: [
                        { label: "claude-3-7-sonnet-latest", value: "claude-3-7-sonnet-latest" },
                        { label: "claude-3-5-sonnet-20241022", value: "claude-3-5-sonnet-20241022" }
                    ]
                },
                {
                    key: "geminiApiKey",
                    label: "Google Gemini API Key",
                    type: "text",
                    defaultValue: cfg.geminiApiKey || "",
                    placeholder: "AIza...",
                    visibleWhen: { fieldKey: "activeProvider", equals: "gemini" }
                },
                {
                    key: "geminiModel",
                    label: "Google Gemini Model",
                    type: "text",
                    defaultValue: cfg.geminiModel || "gemini-2.5-pro",
                    visibleWhen: { fieldKey: "activeProvider", equals: ["gemini", "gemini-googleone"] },
                    quickChips: [
                        { label: "gemini-2.5-pro", value: "gemini-2.5-pro" },
                        { label: "gemini-2.5-flash", value: "gemini-2.5-flash" }
                    ]
                },
                {
                    key: "grokApiKey",
                    label: "xAI Grok API Key",
                    type: "text",
                    defaultValue: cfg.grokApiKey || "",
                    placeholder: "xai-...",
                    visibleWhen: { fieldKey: "activeProvider", equals: "grok" }
                },
                {
                    key: "grokModel",
                    label: "xAI Grok Model",
                    type: "text",
                    defaultValue: cfg.grokModel || "grok-2",
                    visibleWhen: { fieldKey: "activeProvider", equals: "grok" },
                    quickChips: [
                        { label: "grok-2", value: "grok-2" },
                        { label: "grok-4.7", value: "grok-4.7" }
                    ]
                },
                {
                    key: "defaultReasoningLevel",
                    label: "Default Brain (🧠) Reasoning Level",
                    type: "select",
                    defaultValue: cfg.defaultReasoningLevel || "medium",
                    options: [
                        { label: "🧠 Low — Fast thinking for quick single-step edits", value: "low" },
                        { label: "🧠 Medium — Balanced thinking for multi-step artwork", value: "medium" },
                        { label: "🧠 Max — Deepest reasoning for complex scenes & animations", value: "max" }
                    ]
                }
            ],
            submitLabel: "Save AI Settings",
            onSubmit: (vals) => {
                const level = (
                    vals.defaultReasoningLevel === "low" ||
                    vals.defaultReasoningLevel === "medium" ||
                    vals.defaultReasoningLevel === "max"
                        ? vals.defaultReasoningLevel
                        : "medium"
                ) as AiReasoningLevel;
                const provider = (vals.activeProvider || "lmstudio") as HaAiProviderId;

                this.state.configManager.updateConfig({
                    activeProvider: provider,
                    lmStudioUrl: (vals.lmStudioUrl || "http://localhost:1234").trim(),
                    aiModel: (vals.aiModel || "local-model").trim(),
                    openaiApiKey: (vals.openaiApiKey || "").trim(),
                    openaiModel: (vals.openaiModel || "gpt-4o").trim(),
                    claudeApiKey: (vals.claudeApiKey || "").trim(),
                    claudeModel: (vals.claudeModel || "claude-3-7-sonnet-latest").trim(),
                    customClaudeUrl: (vals.customClaudeUrl || "https://api.anthropic.com").trim(),
                    geminiApiKey: (vals.geminiApiKey || "").trim(),
                    geminiModel: (vals.geminiModel || "gemini-2.5-pro").trim(),
                    grokApiKey: (vals.grokApiKey || "").trim(),
                    grokModel: (vals.grokModel || "grok-2").trim(),
                    defaultReasoningLevel: level
                });

                if (provider === "gemini-googleone" && !this.state.configManager.getConfig().geminiOAuthTokens) {
                    const oauth = new GoogleOAuthManager();
                    void oauth.startOAuthFlow().then((tokens) => {
                        this.state.configManager.updateConfig({ geminiOAuthTokens: tokens });
                        this.state.setStatus("Google One OAuth sign-in completed for Gemini.");
                    }).catch(() => {});
                }

                this.selectedReasoningLevel = level;
                this.render();
                this.state.setStatus(
                    `Saved AI settings (provider: ${provider}, reasoning: ${level}).`
                );
            }
        });
    }

    /**
     * Shows a user-friendly interactive catalog of all 26 AI tools so the user can see everything
     * the AI can do and click any tool to populate a guided prompt.
     */
    public openToolsCatalogDialog(): void {
        const allTools = HaEditorAiToolRegistry.getAllTools();
        this.modal.openFormDialog({
            title: `🧰 AI Tool Catalog (${allTools.length} Built-In Tools)`,
            subtitle:
                "Pick any tool below to insert a ready-to-use prompt into the AI Studio Assistant, or just ask in plain English!",
            fields: [
                {
                    key: "selectedTool",
                    label: "Available AI Canvas & Artwork Tools",
                    type: "select",
                    defaultValue: allTools[0]?.name || "inspect_scene_graph",
                    options: allTools.map(t => ({
                        label: `${t.icon} ${t.name} (${t.category.toUpperCase()}) — ${t.description.slice(0, 75)}...`,
                        value: t.name
                    })),
                    description: "The AI automatically chains these tools together when you ask it to create or edit artwork."
                }
            ],
            submitLabel: "Insert Prompt for Tool",
            onSubmit: (vals) => {
                const tool = HaEditorAiToolRegistry.getTool(vals.selectedTool);
                if (tool) {
                    this.promptFromAction(`Use the ${tool.name} tool to help me with the current canvas.`);
                }
            }
        });
    }
}
