import { z } from "zod"

// Animation rules:
// - startFrame is the animation's local start frame inside the layer's scene
//   timeline; it is not the global project frame. The scene's own
//   startFrame (see SceneSchema) carries the absolute timeline offset.
// - durationInFrames is the number of frames the animation lasts.
// - startFrame doubles as a delay: an animation that should not begin at
//   scene-local frame 0 simply has startFrame > 0.
// - phase restricts what the animation does: enter introduces the layer,
//   emphasis changes its relative state, and exit removes it. Their exact
//   scene-local starts are narration-driven rather than fixed to thirds.
//   There is no looping or auto-play configuration.
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
  "line-draw",
  "wipe",
  "dissolve-in",
  "scale-in",
  "scale-big",
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

export const LineDrawDirectionSchema = z.enum([
  "clockwise",
  "counterclockwise",
  "start-to-end",
  "end-to-start",
]);

export const WipeDirectionSchema = z.enum([
  "left-to-right",
  "right-to-left",
  "top-to-bottom",
  "bottom-to-top",
  "top-left-to-bottom-right",
  "top-right-to-bottom-left",
  "bottom-left-to-top-right",
  "bottom-right-to-top-left",
]);

export const ScaleDirectionSchema = z.enum(["up", "down"]);

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

export const LineDrawAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("enter"),
  preset: z.literal("line-draw"),
  direction: LineDrawDirectionSchema,
}).strict();

export const WipeAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("enter"),
  preset: z.literal("wipe"),
  direction: WipeDirectionSchema,
}).strict();

export const DissolveInAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("enter"),
  preset: z.literal("dissolve-in"),
}).strict();

export const ScaleInAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("enter"),
  preset: z.literal("scale-in"),
  direction: ScaleDirectionSchema,
  bounce: z.boolean(),
}).strict();

export const ScaleBigAnimationSchema = AnimationTimingSchema.extend({
  phase: z.literal("enter"),
  preset: z.literal("scale-big"),
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
  LineDrawAnimationSchema,
  WipeAnimationSchema,
  DissolveInAnimationSchema,
  ScaleInAnimationSchema,
  ScaleBigAnimationSchema,
  MagicMoveAnimationSchema,
  DissolveAnimationSchema,
]);

export type AnimationPhase = z.infer<typeof AnimationPhaseSchema>;

export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;

export type AnimationEasing = z.infer<typeof AnimationEasingSchema>;

export type FadeAndMoveDirection = z.infer<typeof FadeAndMoveDirectionSchema>;

export type LineDrawDirection = z.infer<typeof LineDrawDirectionSchema>;

export type WipeDirection = z.infer<typeof WipeDirectionSchema>;

export type ScaleDirection = z.infer<typeof ScaleDirectionSchema>;

export type FadeAndMoveAnimation = z.infer<typeof FadeAndMoveAnimationSchema>;

export type LineDrawAnimation = z.infer<typeof LineDrawAnimationSchema>;

export type WipeAnimation = z.infer<typeof WipeAnimationSchema>;

export type DissolveInAnimation = z.infer<typeof DissolveInAnimationSchema>;

export type ScaleInAnimation = z.infer<typeof ScaleInAnimationSchema>;

export type ScaleBigAnimation = z.infer<typeof ScaleBigAnimationSchema>;

export type MagicMoveAnimation = z.infer<typeof MagicMoveAnimationSchema>;

export type DissolveAnimation = z.infer<typeof DissolveAnimationSchema>;

export type LayerAnimation = z.infer<typeof LayerAnimationSchema>;

export const ANIMATION_PHASES: readonly AnimationPhase[] = [
  "enter",
  "emphasis",
  "exit",
] as const;
