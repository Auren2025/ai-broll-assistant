export type AlignmentAction =
  | "left"
  | "horizontal-center"
  | "right"
  | "top"
  | "vertical-center"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

export const ALIGNMENT_BUTTONS = [
  { action: "left", label: "Align left", icon: "⊢" },
  {
    action: "horizontal-center",
    label: "Align horizontal center",
    icon: "↔",
  },
  { action: "right", label: "Align right", icon: "⊣" },
  { action: "top", label: "Align top", icon: "⊤" },
  {
    action: "vertical-center",
    label: "Align vertical center",
    icon: "↕",
  },
  { action: "bottom", label: "Align bottom", icon: "⊥" },
] as const satisfies readonly {
  action: AlignmentAction;
  label: string;
  icon: string;
}[];

export const DISTRIBUTION_BUTTONS = [
  {
    action: "distribute-horizontal",
    label: "Distribute horizontally",
  },
  {
    action: "distribute-vertical",
    label: "Distribute vertically",
  },
] as const satisfies readonly {
  action: AlignmentAction;
  label: string;
}[];
