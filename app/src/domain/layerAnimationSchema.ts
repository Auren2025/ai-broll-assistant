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
  "fade-and-move",
  "magic-move",
  "dissolve",
]);

export const FadeAndMoveDirectionSchema = z.enum([
  "left-to-right",
  "right-to-left",
  "top-to-bottom",
  "bottom-to-top",
]);

export const AnimationEasingSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
])

const AnimationTimingSchema = z.object({
  id: z.string().min(1),
  startFrame: z.number().int().min(0),
  durationInFrames: z.number().int().min(1),
  easing: AnimationEasingSchema,
});

export const FadeAndMoveAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("enter"),
  preset: z.literal("fade-and-move"),
  direction: FadeAndMoveDirectionSchema,
  travelDistance: z.number().finite().min(0).max(400),
}).strict();

export const MagicMoveAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("emphasis"),
  preset: z.literal("magic-move"),
  translateX: z.number().finite(),
  translateY: z.number().finite(),
  scale: z.number().finite().positive().max(10),
  opacity: z.number().finite().min(0).max(1),
}).strict();

export const DissolveAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("exit"),
  preset: z.literal("dissolve"),
}).strict();

export const LayerAnimationSchema = z.discriminatedUnion("preset", [
  FadeAndMoveAnimationSchema,
  MagicMoveAnimationSchema,
  DissolveAnimationSchema,
]);

export type AnimationPhase = z.infer<typeof AnimationPhaseSchema>;

export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;

export type AnimationEasing = z.infer<typeof AnimationEasingSchema>;

export type FadeAndMoveDirection = z.infer<typeof FadeAndMoveDirectionSchema>;

export type FadeAndMoveAnimation = z.infer<typeof FadeAndMoveAnimationSchema>;

export type MagicMoveAnimation = z.infer<typeof MagicMoveAnimationSchema>;

export type DissolveAnimation = z.infer<typeof DissolveAnimationSchema>;

export type LayerAnimation = z.infer<typeof LayerAnimationSchema>;

export const ANIMATION_PHASES: readonly AnimationPhase[] = [
  "enter",
  "emphasis",
  "exit",
] as const;
