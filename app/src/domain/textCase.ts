import type { TextCaseSchema } from "./shapeTextSchema";
import type { z } from "zod";

export function applyTextCase(
  text: string,
  textCase: z.infer<typeof TextCaseSchema>,
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
