import { AbstractUIComponent } from "../ui/abstract-ui-component.js";
import { AbstractAiStreamClient } from "@nexustools/hacanvas";

AbstractAiStreamClient.activeDocumentGetter = () => AbstractUIComponent.activeDocument;

export * from "@nexustools/hacanvas";
