import { z } from "zod"

// Animation rules:
// - startFrame is the animation's local start frame inside the layer's scene
//   timeline; it is not the global project frame. The scene's own
//   startFrame (see SceneSchema) carries the absolute timeline offset.
// - durationInFrames is the number of frames the animation lasts.
// - startFrame doubles as a delay: an animation that should not begin at
//   scene-local frame 0 simply has startFrame > 0.
// - phase restricts what the animation does: enter plays once at the
//   beginning, emphasis plays once in the middle, exit plays once at the
//   end. There is no looping or auto-play configuration.
// - preset picks from a fixed Keynote-style set; arbitrary strings are
//   not allowed.
// - easing picks from a fixed CSS-inspired set; arbitrary easing strings
//   are not allowed.

export const AnimationPhaseSchema = z.enum([
  "enter",
  "emphasis",
  "exit",
]);

export const AnimationPresetSchema = z.enum([
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "scale",
]);

export const AnimationEasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
])

export const LayerAnimationSchema = z
  .object({
    id: z.string().min(1),
    phase: AnimationPhaseSchema,
    preset: AnimationPresetSchema,
    startFrame: z.number().int().min(0),
    durationInFrames: z.number().int().min(1),
    easing: AnimationEasingSchema,
  })
  .strict();

export type AnimationPhase = z.infer<typeof AnimationPhaseSchema>;

export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;

export type AnimationEasing = z.infer<typeof AnimationEasingSchema>;

export type LayerAnimation = z.infer<typeof LayerAnimationSchema>;

export const ANIMATION_PHASES: readonly AnimationPhase[] = [
  "enter",
  "emphasis",
  "exit",
] as const;
