import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import {
  PREVIEW_CHANNEL_NAME,
  type PreviewStateMessage,
  type PreviewSyncMessage,
} from "./previewChannel";
import { PreviewWindow } from "./PreviewWindow";

interface DocumentPictureInPictureApi {
  readonly window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

function getDocumentPictureInPicture(): DocumentPictureInPictureApi | undefined {
  return (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi })
    .documentPictureInPicture;
}

function copyStyleSheets(targetDocument: Document): void {
  for (const styleSheet of document.styleSheets) {
    try {
      const style = targetDocument.createElement("style");
      style.textContent = Array.from(styleSheet.cssRules, (rule) => rule.cssText).join("\n");
      targetDocument.head.append(style);
    } catch {
      if (!styleSheet.href) continue;
      const link = targetDocument.createElement("link");
      link.rel = "stylesheet";
      link.href = styleSheet.href;
      link.media = styleSheet.media.mediaText;
      targetDocument.head.append(link);
    }
  }
}

export function usePreviewWindow(project: Project | null, scene: Scene | null, isDirty: boolean) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const windowRef = useRef<Window | null>(null);
  const stateRef = useRef<PreviewStateMessage | null>(null);

  const state: PreviewStateMessage | null = useMemo(() => project && scene
    ? { type: "state", project, scene, isDirty }
    : null, [project, scene, isDirty]);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<PreviewSyncMessage>) => {
      if (event.data.type === "ready" && stateRef.current) {
        channel.postMessage(stateRef.current);
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (state) channelRef.current?.postMessage(state);
  }, [state]);

  return useCallback(() => {
    const existingPreview = windowRef.current;
    if (existingPreview && !existingPreview.closed) {
      existingPreview.focus();
      if (stateRef.current) channelRef.current?.postMessage(stateRef.current);
      return;
    }

    const openPopup = (): void => {
      const previewWindow = window.open(
        "/preview", "ai-broll-preview", "popup=yes,width=960,height=600,resizable=yes",
      );
      windowRef.current = previewWindow;
      previewWindow?.focus();
    };
    const pictureInPicture = getDocumentPictureInPicture();
    if (!pictureInPicture) {
      openPopup();
      return;
    }

    void pictureInPicture.requestWindow({ width: 960, height: 600 })
      .then((previewWindow) => {
        windowRef.current = previewWindow;
        previewWindow.document.title = "AI-Broll Preview";
        copyStyleSheets(previewWindow.document);
        const rootElement = previewWindow.document.createElement("div");
        rootElement.id = "root";
        previewWindow.document.body.style.margin = "0";
        previewWindow.document.body.append(rootElement);
        const previewRoot = createRoot(rootElement);
        previewRoot.render(<PreviewWindow hostWindow={previewWindow} />);
        previewWindow.addEventListener("pagehide", () => {
          if (windowRef.current === previewWindow) windowRef.current = null;
          previewRoot.unmount();
        }, { once: true });
        previewWindow.focus();
      })
      .catch(openPopup);
  }, []);
}
