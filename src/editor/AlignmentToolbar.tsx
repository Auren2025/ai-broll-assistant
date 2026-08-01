export type AlignmentAction =
  | "left"
  | "horizontal-center"
  | "right"
  | "top"
  | "vertical-center"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

interface AlignmentToolbarProps {
  selectionCount: number;
  onAlign: (action: AlignmentAction) => void;
}

const ALIGNMENT_BUTTONS: readonly {
  action: AlignmentAction;
  label: string;
  symbol: string;
  distribution?: boolean;
}[] = [
  { action: "left", label: "Align left", symbol: "⊢" },
  { action: "horizontal-center", label: "Align horizontal center", symbol: "↔" },
  { action: "right", label: "Align right", symbol: "⊣" },
  { action: "top", label: "Align top", symbol: "⊤" },
  { action: "vertical-center", label: "Align vertical center", symbol: "↕" },
  { action: "bottom", label: "Align bottom", symbol: "⊥" },
  {
    action: "distribute-horizontal",
    label: "Distribute horizontally",
    symbol: "⋯",
    distribution: true,
  },
  {
    action: "distribute-vertical",
    label: "Distribute vertically",
    symbol: "⋮",
    distribution: true,
  },
];

export function AlignmentToolbar({
  selectionCount,
  onAlign,
}: AlignmentToolbarProps) {
  return (
    <div className="alignment-toolbar" aria-label="Layer alignment toolbar">
      {ALIGNMENT_BUTTONS.map((button, index) => (
        <button
          className={index === 3 || index === 6 ? "has-separator" : ""}
          key={button.action}
          type="button"
          title={button.label}
          aria-label={button.label}
          disabled={
            selectionCount === 0 ||
            (button.distribution === true && selectionCount < 3)
          }
          onClick={() => onAlign(button.action)}
        >
          {button.symbol}
        </button>
      ))}
    </div>
  );
}
