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
    });
  });

export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;
