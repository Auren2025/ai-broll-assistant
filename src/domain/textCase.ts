import type { TextLayer } from "./textLayerSchema";

export function applyTextCase(
  text: string,
  textCase: TextLayer["textCase"],
): string {
  switch (textCase) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    default:
      return text;
  }
}
