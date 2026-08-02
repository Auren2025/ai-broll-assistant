import { useEffect, useState } from "react";
import type { ZOrderAction } from "../domain/groupOperations";
import type { RectangleLayer } from "../domain/rectangleLayerSchema";
import type { Layer } from "../domain/sceneSchema";
import type { TextLayer } from "../domain/textLayerSchema";
import {
  ABUTMENT_BUTTONS,
  ALIGNMENT_BUTTONS,
  DISTRIBUTION_BUTTONS,
  type AlignmentAction,
} from "./alignment";
import { BufferedNumberInput } from "./BufferedNumberInput";

export type EditableLayerPatch = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  opacityEnabled: boolean;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: TextLayer["fontStyle"];
  lineHeight: number;
  letterSpacing: number;
  textAlign: TextLayer["textAlign"];
  verticalAlign: TextLayer["verticalAlign"];
  autoResize: TextLayer["autoResize"];
  textCase: TextLayer["textCase"];
  kerningPairs: boolean;
  ligatures: boolean;
  fill: string;
  fillEnabled: boolean;
  stroke: string | null;
  strokeWidth: number;
  cornerEnabled: boolean;
  cornerRadius: number;
  cornerRadii: RectangleLayer["cornerRadii"];
  donut: number;
  sweep: number;
  startAngle: number;
  arrowHeadSize: number;
  arrowStartStyle: "none" | "triangle" | "line" | "diamond" | "circle";
  arrowEndStyle: "none" | "triangle" | "line" | "diamond" | "circle";
  src: string;
}>;

interface LayerPropertiesPanelProps {
  layer: Layer | null;
  onPatch: (patch: EditableLayerPatch) => void;
  onAlign: (action: AlignmentAction) => void;
  onReplaceImage: () => void;
  onDuplicate: () => void;
  onReorder: (action: ZOrderAction) => void;
  onDeleteLayer: () => void;
}

const ARRANGE_BUTTONS: { action: ZOrderAction; label: string; icon: string }[] =
  [
    { action: "back", label: "Send to back", icon: "⏮" },
    { action: "backward", label: "Send backward", icon: "◀" },
    { action: "forward", label: "Bring forward", icon: "▶" },
    { action: "front", label: "Bring to front", icon: "⏭" },
  ];

function ArrangeControls({ onReorder }: { onReorder: (action: ZOrderAction) => void }) {
  return (
    <div className="layer-arrange-row" role="group" aria-label="Layer z-order">
      {ARRANGE_BUTTONS.map((button) => (
        <button
          key={button.action}
          type="button"
          title={button.label}
          aria-label={button.label}
          onClick={() => onReorder(button.action)}
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
}

function LayerAlignmentControls({
  selectionCount,
  onAlign,
}: {
  selectionCount: number;
  onAlign: (action: AlignmentAction) => void;
}) {
  const target = selectionCount === 1 ? "canvas" : "selected layers";

  return (
    <div className="layer-align-row" aria-label="Layer alignment controls">
      {ALIGNMENT_BUTTONS.map((button) => {
        const label = `${button.label} to ${target}`;
        return (
          <button
            key={button.action}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onAlign(button.action)}
          >
            {button.icon}
          </button>
        );
      })}
    </div>
  );
}

function LayerAbutmentControls({
  selectionCount,
  onAlign,
}: {
  selectionCount: number;
  onAlign: (action: AlignmentAction) => void;
}) {
  return (
    <div className="layer-align-row" aria-label="Layer abutment controls">
      {ABUTMENT_BUTTONS.map((button) => {
        const disabled = selectionCount < 2;
        return (
          <button
            key={button.action}
            type="button"
            title={button.label}
            aria-label={button.label}
            disabled={disabled}
            onClick={() => onAlign(button.action)}
          >
            {button.icon}
          </button>
        );
      })}
    </div>
  );
}

function LayerDistributionControls({
  selectionCount,
  onAlign,
}: {
  selectionCount: number;
  onAlign: (action: AlignmentAction) => void;
}) {
  return (
    <div className="layer-distribute-row" aria-label="Layer distribution controls">
      {DISTRIBUTION_BUTTONS.map((button) => {
        const disabled = selectionCount < 3;
        return (
          <button
            key={button.action}
            type="button"
            title={button.label}
            aria-label={button.label}
            disabled={disabled}
            onClick={() => onAlign(button.action)}
          >
            {button.label}
          </button>
        );
      })}
    </div>
  );
}

export function MultiLayerPropertiesPanel({
  selectionCount,
  canGroup,
  onAlign,
  onGroup,
  onDuplicate,
  onReorder,
}: {
  selectionCount: number;
  canGroup: boolean;
  onAlign: (action: AlignmentAction) => void;
  onGroup: () => void;
  onDuplicate: () => void;
  onReorder: (action: ZOrderAction) => void;
}) {
  return (
    <section className="layer-design-panel" aria-label="Multiple layer properties">
      <header className="layer-design-header multi-layer-design-header">
        <span className="layer-design-type-icon" aria-hidden="true">◇</span>
        <h3>{selectionCount} layers selected</h3>
      </header>

      <LayerAlignmentControls
        selectionCount={selectionCount}
        onAlign={onAlign}
      />

      <LayerAbutmentControls
        selectionCount={selectionCount}
        onAlign={onAlign}
      />

      <LayerDistributionControls
        selectionCount={selectionCount}
        onAlign={onAlign}
      />

      <section className="layer-design-section selection-actions-section">
        <h4>Selection</h4>
        <button
          type="button"
          className="selection-group-button"
          disabled={!canGroup}
          onClick={onGroup}
        >
          Group
          <span>⌘G</span>
        </button>
        <button
          type="button"
          className="selection-group-button selection-ghost-button"
          onClick={onDuplicate}
        >
          Duplicate
          <span>⌘D</span>
        </button>
      </section>

      <section className="layer-design-section layer-arrange-section">
        <h4>Arrange</h4>
        <ArrangeControls onReorder={onReorder} />
      </section>
    </section>
  );
}

function ColorControl({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const [input, setInput] = useState(value.replace(/^#/, "").toUpperCase());

  useEffect(() => {
    setInput(value.replace(/^#/, "").toUpperCase());
  }, [value]);

  function update(nextInput: string): void {
    setInput(nextInput);
    const normalized = `#${nextInput.replace(/^#/, "")}`;
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) onChange(normalized.toLowerCase());
  }

  return (
    <div className="layer-color-control">
      <input
        type="text"
        aria-label={`${label} hex color`}
        maxLength={7}
        value={input}
        onChange={(event) => update(event.currentTarget.value)}
        onBlur={() => setInput(value.replace(/^#/, "").toUpperCase())}
      />
      <input
        type="color"
        aria-label={`Choose ${label.toLowerCase()}`}
        value={value}
        onChange={(event) => update(event.currentTarget.value)}
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T;
  label: string;
  options: readonly { value: T; label: string; icon: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="layer-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.value}
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export function LayerPropertiesPanel({
  layer,
  onPatch,
  onAlign,
  onReplaceImage,
  onDuplicate,
  onReorder,
  onDeleteLayer,
}: LayerPropertiesPanelProps) {
  if (!layer) return <p className="app-stage">Select a layer to view its properties.</p>;

  const isText = layer.type === "text";
  const isRectangle = layer.type === "rectangle";
  const isCircle = layer.type === "circle";
  const isTriangle = layer.type === "triangle";
  const isImage = layer.type === "image";
  const isGroup = layer.type === "group";
  const hasFill = isText || isRectangle || isCircle || layer.type === "triangle";
  const hasStroke = !isGroup;
  const stroke = isGroup ? null : layer.stroke;
  const strokeWidth = isGroup ? 0 : layer.strokeWidth;
  const fill = isGroup || layer.type === "arrow" || isImage ? "#000000" : layer.fill;
  const fillEnabled = isGroup || layer.type === "arrow" || isImage ? false : layer.fillEnabled;

  return (
    <section className="layer-design-panel" aria-label="Layer properties">
      <header className="layer-design-header">
        <span className={`layer-design-type-icon layer-icon-${layer.type}`} aria-hidden="true">
          {layer.type === "text" ? "T" : layer.type === "circle" ? "○" : layer.type === "triangle" ? "△" : layer.type === "group" ? "◇" : layer.type === "image" ? "▣" : layer.type === "arrow" ? "→" : "□"}
        </span>
        <h3>{layer.type.charAt(0).toUpperCase() + layer.type.slice(1)}</h3>
      </header>

      <LayerAlignmentControls selectionCount={1} onAlign={onAlign} />

      <section className="layer-design-section layer-arrange-section">
        <h4>Arrange</h4>
        <ArrangeControls onReorder={onReorder} />
        <div className="layer-actions-row">
          <button type="button" onClick={onDuplicate}>
            <span>Duplicate</span><kbd>⌘D</kbd>
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={onDeleteLayer}
          >
            Delete
          </button>
        </div>
      </section>

      <section className="layer-design-section layer-layout-section">
        <h4>Layout</h4>
        <div className="layer-design-row">
          <span>Position</span>
          <div className="layer-double-input">
            <BufferedNumberInput step="1" aria-label="Layer X position" value={layer.x} onValueChange={(value) => onPatch({ x: value })} />
            <BufferedNumberInput step="1" aria-label="Layer Y position" value={layer.y} onValueChange={(value) => onPatch({ y: value })} />
          </div>
        </div>
        <div className="layer-design-row">
          <span>Size</span>
          <div className="layer-double-input">
            <BufferedNumberInput min="1" step="1" aria-label="Layer width" value={layer.width} onValueChange={(value) => onPatch({ width: Math.max(1, value) })} />
            <BufferedNumberInput min="1" step="1" aria-label="Layer height" value={layer.height} onValueChange={(value) => onPatch({ height: Math.max(1, value) })} />
          </div>
        </div>
        <div className="layer-design-row">
          <span>Angle</span>
          <div className="layer-single-input">
            <BufferedNumberInput step="1" aria-label="Layer rotation" value={layer.rotation} onValueChange={(value) => onPatch({ rotation: value })} />
            <span>°</span>
          </div>
        </div>
      </section>

      {isGroup ? (
        <section className="layer-design-section">
          <h4>Group</h4>
          <div className="layer-design-row"><span>Layers</span><strong>{layer.children.length}</strong></div>
          <p className="layer-group-hint">Group resizing keeps its aspect ratio.</p>
        </section>
      ) : null}

      {isCircle ? (
        <section className="layer-design-section">
          <h4>Ellipse</h4>
          <div className="layer-design-row"><span>Donut</span><div className="layer-single-input"><BufferedNumberInput min="0" max="100" aria-label="Ellipse donut" value={Math.round(layer.donut * 100)} onValueChange={(value) => onPatch({ donut: Math.min(1, Math.max(0, value / 100)) })} /><span>%</span></div></div>
          <div className="layer-design-row"><span>Sweep</span><div className="layer-single-input"><BufferedNumberInput min="0" max="100" aria-label="Ellipse sweep" value={Math.round((layer.sweep / 360) * 100)} onValueChange={(value) => onPatch({ sweep: Math.min(360, Math.max(0, value * 3.6)) })} /><span>%</span></div></div>
          <div className="layer-design-row"><span>Start angle</span><div className="layer-single-input"><BufferedNumberInput aria-label="Ellipse start angle" value={layer.startAngle} onValueChange={(value) => onPatch({ startAngle: value })} /><span>°</span></div></div>
        </section>
      ) : null}

      {isText ? (
        <section className="layer-design-section layer-text-section">
          <h4>Text</h4>
          <label className="layer-design-row"><span>Font Family</span><select aria-label="Font family" value={layer.fontFamily} onChange={(event) => onPatch({ fontFamily: event.currentTarget.value })}><option>Arial</option><option>Inter</option><option>Montserrat</option><option>Helvetica</option><option>Georgia</option><option>Courier New</option></select></label>
          <label className="layer-design-row"><span>Style</span><select aria-label="Font style" value={`${layer.fontStyle}-${layer.fontWeight}`} onChange={(event) => { const [fontStyle, weight] = event.currentTarget.value.split("-"); onPatch({ fontStyle: fontStyle as TextLayer["fontStyle"], fontWeight: Number(weight) }); }}><option value="normal-400">Regular 400</option><option value="italic-400">Italic 400</option><option value="normal-500">Medium 500</option><option value="normal-600">Semi Bold 600</option><option value="normal-700">Bold 700</option><option value="normal-800">Extra Bold 800</option></select></label>
          <div className="layer-design-row"><span>Size</span><div className="layer-full-input"><BufferedNumberInput min="1" aria-label="Font size" value={layer.fontSize} onValueChange={(value) => onPatch({ fontSize: Math.max(1, value) })} /></div></div>
          <div className="layer-design-row"><span>Text align</span><SegmentedControl value={layer.textAlign} label="Text align" options={[{ value: "left", label: "Left aligned", icon: "≡" }, { value: "center", label: "Center aligned", icon: "≡" }, { value: "right", label: "Right aligned", icon: "≡" }]} onChange={(textAlign) => onPatch({ textAlign })} /></div>
          <div className="layer-design-row"><span>Vertical align</span><SegmentedControl value={layer.verticalAlign} label="Vertical align" options={[{ value: "top", label: "Top", icon: "⊤" }, { value: "middle", label: "Middle", icon: "↕" }, { value: "bottom", label: "Bottom", icon: "⊥" }]} onChange={(verticalAlign) => onPatch({ verticalAlign })} /></div>
          <div className="layer-design-row"><span>Auto resize</span><SegmentedControl value={layer.autoResize} label="Auto resize" options={[{ value: "both", label: "Fluid width and height", icon: "↔" }, { value: "height", label: "Fluid height", icon: "↕" }, { value: "fixed", label: "Fixed size", icon: "□" }]} onChange={(autoResize) => onPatch({ autoResize })} /></div>
          <div className="layer-design-row"><span>Line height</span><div className="layer-single-input layer-wide-input"><BufferedNumberInput min="1" aria-label="Line height" value={Math.round(layer.lineHeight * 100)} onValueChange={(value) => onPatch({ lineHeight: Math.max(0.01, value / 100) })} /><span>%</span></div></div>
          <div className="layer-design-row"><span>Letter spacing</span><div className="layer-single-input layer-wide-input"><BufferedNumberInput aria-label="Letter spacing" value={layer.letterSpacing} onValueChange={(value) => onPatch({ letterSpacing: value })} /><span>%</span></div></div>
          <div className="layer-design-row"><span>Case</span><SegmentedControl value={layer.textCase} label="Case" options={[{ value: "normal", label: "Normal", icon: "Aa" }, { value: "uppercase", label: "Uppercase", icon: "AA" }, { value: "lowercase", label: "Lowercase", icon: "aa" }]} onChange={(textCase) => onPatch({ textCase })} /></div>
          <label className="layer-design-row layer-checkbox-row"><span>Kerning pairs</span><input type="checkbox" aria-label="Kerning pairs" checked={layer.kerningPairs} onChange={(event) => onPatch({ kerningPairs: event.currentTarget.checked })} /></label>
          <label className="layer-design-row layer-checkbox-row"><span>Ligatures</span><input type="checkbox" aria-label="Ligatures" checked={layer.ligatures} onChange={(event) => onPatch({ ligatures: event.currentTarget.checked })} /></label>
        </section>
      ) : null}

      <section className="layer-design-section layer-opacity-section">
        <div className="layer-toggle-value-row layer-opacity-row">
          <strong>Opacity</strong>
          <div className={`layer-single-input layer-wide-input${layer.opacityEnabled ? "" : " is-disabled"}`}><BufferedNumberInput min="0" max="100" aria-label="Layer opacity" disabled={!layer.opacityEnabled} value={Math.round(layer.opacity * 100)} onValueChange={(value) => onPatch({ opacity: Math.min(1, Math.max(0, value / 100)) })} /><span>%</span></div>
          <input type="checkbox" aria-label="Enable layer opacity" checked={layer.opacityEnabled} onChange={(event) => onPatch({ opacityEnabled: event.currentTarget.checked })} />
        </div>
      </section>

      {isRectangle || isTriangle ? (
        <section className="layer-design-section layer-corner-section">
          <div className="layer-toggle-value-row layer-corner-row">
            <strong>Corner</strong>
            <div className={`layer-corner-main${isTriangle ? " is-single" : ""}${layer.cornerEnabled ? "" : " is-disabled"}`}>
              <BufferedNumberInput value={layer.cornerRadius} min={0} disabled={!layer.cornerEnabled} aria-label="Corner radius" onValueChange={(value) => onPatch({ cornerRadius: Math.max(0, value), ...(isRectangle ? { cornerRadii: layer.cornerRadii ? { topLeft: Math.max(0, value), topRight: Math.max(0, value), bottomRight: Math.max(0, value), bottomLeft: Math.max(0, value) } : null } : {}) })} />
              {isRectangle ? <button type="button" disabled={!layer.cornerEnabled} aria-label={layer.cornerRadii ? "Uniform corners" : "Independent corners"} className={layer.cornerRadii ? "is-active" : ""} onClick={() => onPatch({ cornerRadii: layer.cornerRadii ? null : { topLeft: layer.cornerRadius, topRight: layer.cornerRadius, bottomRight: layer.cornerRadius, bottomLeft: layer.cornerRadius } })}>⌗</button> : null}
            </div>
            <input type="checkbox" aria-label="Enable layer corners" checked={layer.cornerEnabled} onChange={(event) => onPatch({ cornerEnabled: event.currentTarget.checked })} />
          </div>
          {isRectangle && layer.cornerRadii ? (
            <div className={`layer-corner-grid${layer.cornerEnabled ? "" : " is-disabled"}`}>
              {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => <BufferedNumberInput key={corner} value={layer.cornerRadii?.[corner] ?? 0} min={0} disabled={!layer.cornerEnabled} aria-label={`${corner} corner radius`} onValueChange={(value) => { if (layer.cornerRadii) onPatch({ cornerRadii: { ...layer.cornerRadii, [corner]: Math.max(0, value) } }); }} />)}
            </div>
          ) : null}
        </section>
      ) : null}

      {isImage ? (
        <section className="layer-design-section layer-corner-section">
          <div className="layer-toggle-value-row layer-corner-row">
            <strong>Corner radius</strong>
            <div className="layer-corner-main is-single">
              <BufferedNumberInput
                value={layer.cornerRadius}
                min={0}
                aria-label="Image corner radius"
                onValueChange={(value) => onPatch({ cornerRadius: Math.max(0, value) })}
              />
            </div>
          </div>
          <div className="layer-design-row"><span>Source</span><strong className="layer-image-source">{layer.src}</strong></div>
          <button
            type="button"
            className="layer-image-replace"
            onClick={onReplaceImage}
          >
            Replace image…
          </button>
        </section>
      ) : null}

      {hasFill ? (
        <section className="layer-design-section layer-paint-section">
          <div className="layer-section-title"><h4>Fill</h4><input type="checkbox" aria-label="Enable layer fill" checked={fillEnabled} onChange={(event) => onPatch({ fillEnabled: event.currentTarget.checked })} /></div>
          {fillEnabled ? <div className="layer-design-row layer-paint-row"><span>Color</span><ColorControl value={fill} label="Layer fill" onChange={(nextFill) => onPatch({ fill: nextFill })} /></div> : null}
        </section>
      ) : null}

      {hasStroke ? (
        <section className="layer-design-section layer-paint-section">
          <div className="layer-section-title"><h4>Stroke</h4><input type="checkbox" aria-label="Enable layer stroke" checked={stroke != null} onChange={(event) => onPatch({ stroke: event.currentTarget.checked ? "#000000" : null, strokeWidth: event.currentTarget.checked ? Math.max(1, strokeWidth) : strokeWidth })} /></div>
          {stroke != null ? (
            <>
              <div className="layer-design-row"><span>Weight</span><div className="layer-full-input"><BufferedNumberInput value={strokeWidth} min={0} aria-label="Layer stroke width" onValueChange={(value) => onPatch({ strokeWidth: Math.max(0, value) })} /></div></div>
              <div className="layer-design-row layer-paint-row"><span>Color</span><ColorControl value={stroke} label="Layer stroke" onChange={(nextStroke) => onPatch({ stroke: nextStroke })} /></div>
            </>
          ) : null}
        </section>
      ) : null}

      {layer.type === "arrow" ? <section className="layer-design-section"><h4>Arrow</h4><label className="layer-design-row"><span>Start style</span><select aria-label="Start arrowhead style" value={layer.arrowStartStyle} onChange={(event) => onPatch({ arrowStartStyle: event.currentTarget.value as "none" | "triangle" | "line" | "diamond" | "circle" })}><option value="none">None</option><option value="triangle">Triangle</option><option value="line">Line</option><option value="diamond">Diamond</option><option value="circle">Circle</option></select></label><label className="layer-design-row"><span>End style</span><select aria-label="End arrowhead style" value={layer.arrowEndStyle} onChange={(event) => onPatch({ arrowEndStyle: event.currentTarget.value as "none" | "triangle" | "line" | "diamond" | "circle" })}><option value="none">None</option><option value="triangle">Triangle</option><option value="line">Line</option><option value="diamond">Diamond</option><option value="circle">Circle</option></select></label><div className="layer-design-row"><span>Head size</span><div className="layer-full-input"><BufferedNumberInput min="4" aria-label="Arrow head size" value={layer.arrowHeadSize} onValueChange={(value) => onPatch({ arrowHeadSize: Math.max(4, value) })} /></div></div></section> : null}
    </section>
  );
}
