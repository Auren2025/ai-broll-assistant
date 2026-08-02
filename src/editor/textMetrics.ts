import { Text as FabricText, Textbox } from "fabric";
import type { TextLayer } from "../domain/textLayerSchema";
import { applyTextCase } from "../domain/textCase";

export const MIN_TEXT_WIDTH = 20;

export interface TextMeasurementOptions {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  lineHeight: number;
  letterSpacing: number;
}

export interface TextBoxSize {
  width: number;
  height: number;
}

export { applyTextCase } from "../domain/textCase";

export function getCharSpacing(
  fontSize: number,
  letterSpacing: number,
): number {
  return fontSize > 0 ? (letterSpacing / fontSize) * 1000 : 0;
}

export function getTextMeasurementOptions(
  layer: Pick<
    TextLayer,
    "fontFamily" | "fontSize" | "fontWeight" | "fontStyle" | "lineHeight" | "letterSpacing"
  >,
): TextMeasurementOptions {
  return {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
  };
}

export function measureNaturalTextSize(
  text: string,
  opts: TextMeasurementOptions,
): TextBoxSize {
  const probe = new FabricText(text, {
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight,
    fontStyle: opts.fontStyle,
    lineHeight: opts.lineHeight,
    charSpacing: getCharSpacing(opts.fontSize, opts.letterSpacing),
  });
  return {
    width: Math.max(MIN_TEXT_WIDTH, Math.ceil(probe.width ?? 0)),
    height: Math.max(1, Math.ceil(probe.height ?? 0)),
  };
}

export function measureWrappedTextSize(
  text: string,
  opts: TextMeasurementOptions,
  wrapWidth: number,
): TextBoxSize {
  const safeWidth = Math.max(MIN_TEXT_WIDTH, wrapWidth);
  const probe = new Textbox(text, {
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight,
    fontStyle: opts.fontStyle,
    lineHeight: opts.lineHeight,
    charSpacing: getCharSpacing(opts.fontSize, opts.letterSpacing),
    width: safeWidth,
    dynamicMinWidth: 0,
  });
  return {
    width: safeWidth,
    height: Math.max(1, Math.ceil(probe.height ?? 0)),
  };
}

export function computeTextBoxSize(layer: TextLayer): TextBoxSize {
  const opts = getTextMeasurementOptions(layer);
  const displayText = applyTextCase(layer.text, layer.textCase);
  switch (layer.autoResize) {
    case "both":
      return measureNaturalTextSize(displayText, opts);
    case "height":
      return measureWrappedTextSize(displayText, opts, layer.width);
    case "fixed":
      return { width: layer.width, height: layer.height };
  }
}
