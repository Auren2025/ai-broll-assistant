import type { TextLayer } from "../domain/textLayerSchema";

export interface TextRenderLayout {
  /** Whether the text wraps at the layer's fixed width. */
  wraps: boolean;
  /** "max-content" when the text auto-sizes width (both mode), else the
   * layer's stored width is used. */
  widthMode: "max-content" | "fixed";
  /** Whether the height is locked to the layer's stored height (fixed mode
   * uses it for vertical alignment). Auto-grow modes use "auto". */
  fixedHeight: boolean;
}

/**
 * Maps a text layer's autoResize mode to the CSS layout Remotion must use so
 * it matches the Fabric adapter's measurement (textMetrics.computeTextBoxSize):
 *
 *   both   — natural single-line size: no wrapping, box fits the text.
 *   height — fixed width, wraps, height grows to fit content.
 *   fixed  — fixed width and height; verticalAlign positions the text within
 *            the box. Text is never clipped in any mode (Fabric Textbox draws
 *            in full even beyond its box height).
 */
export function getTextRenderLayout(
  autoResize: TextLayer["autoResize"],
): TextRenderLayout {
  switch (autoResize) {
    case "both":
      return { wraps: false, widthMode: "max-content", fixedHeight: false };
    case "height":
      return { wraps: true, widthMode: "fixed", fixedHeight: false };
    case "fixed":
      return { wraps: true, widthMode: "fixed", fixedHeight: true };
  }
}
