import { z } from "zod";

export const SubtitleCueSchema = z
  .object({
    id: z.string().regex(/^cue-\d{3,}$/),
    index: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    text: z.string().trim().min(1),
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endMs <= cue.startMs) {
      context.addIssue({
        code: "custom",
        message: "endMs must be greater than startMs",
        path: ["endMs"],
      });
    }
  });

export const SubtitleCueListSchema = z
  .array(SubtitleCueSchema)
  .min(1)
  .superRefine((cues, context) => {
    const ids = new Set<string>();
    const indexes = new Set<number>();

    cues.forEach((cue, index) => {
      if (ids.has(cue.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate cue id: ${cue.id}`,
          path: [index, "id"],
        });
      } else {
        ids.add(cue.id);
      }

      if (indexes.has(cue.index)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate cue index: ${cue.index}`,
          path: [index, "index"],
        });
      } else {
        indexes.add(cue.index);
      }

      const previous = cues[index - 1];
      if (!previous) return;

      if (cue.index <= previous.index) {
        context.addIssue({
          code: "custom",
          message:
            `Cue index ${cue.index} must be greater than previous cue index ` +
            `${previous.index}`,
          path: [index, "index"],
        });
      }

      if (cue.startMs < previous.startMs) {
        context.addIssue({
          code: "custom",
          message:
            `Cue starts at ${cue.startMs}ms before previous cue start ` +
            `${previous.startMs}ms; cues must be chronological`,
          path: [index, "startMs"],
        });
      } else if (cue.startMs < previous.endMs) {
        context.addIssue({
          code: "custom",
          message:
            `Cue starts at ${cue.startMs}ms before previous cue ends at ` +
            `${previous.endMs}ms; overlapping cues are not supported`,
          path: [index, "startMs"],
        });
      }
    });
  });

export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;
