import { useEffect, useState, type ReactNode } from "react";
import { getAssetUrl } from "../api/projectApi";
import type { ZOrderAction } from "../domain/groupOperations";
import type { ImageFit } from "../domain/imageLayerSchema";
import type { Layer } from "../domain/sceneSchema";
import type { TextLayer } from "../domain/textLayerSchema";
import type { ShapeText } from "../domain/shapeTextSchema";
import {
  ABUTMENT_BUTTONS,
  ALIGNMENT_BUTTONS,
  DISTRIBUTION_BUTTONS,
  type AlignmentAction,
} from "./alignment";
import { BufferedNumberInput } from "./BufferedNumberInput";
import type { EditableLayerPatch } from "./layerEditing";
import { fitFrameToImageSize, matchingImageSize } from "./imageSizing";
import { IMAGE_CROP_ZOOM_MAX, IMAGE_CROP_ZOOM_MIN } from "./imageCrop";

const FONT_OPTIONS: { label: string; options: string[] }[] = [
  {
    label: "English Sans-serif",
    options: ["Inter", "Helvetica", "Arial"],
  },
  {
    label: "Code",
    options: ["MonaspaceNeonNF-Regular", "MonaspaceRadonNF-Regular"],
  },
  {
    label: "中文",
    options: [
      "YouSheBiaoTiYuan",
      "YouSheBiaoTiHei",
      "PingFang SC",
      "Source Han Serif CN",
    ],
  },
];

interface LayerPropertiesPanelProps {
  layer: Layer | null;
  projectId: string;
  onPatch: (patch: EditableLayerPatch) => void;
  onAlign: (action: AlignmentAction) => void;
  onReplaceImage: () => void;
  onReorder: (action: ZOrderAction) => void;
  isGroupChild: boolean;
  onImageCropEnter: (layerId: string) => void;
  onImageCropExit: () => void;
  croppingLayerId: string | null;
}

function LayerSizeControls({
  layer,
  projectId,
  onPatch,
}: {
  layer: Layer;
  projectId: string;
  onPatch: (patch: EditableLayerPatch) => void;
}) {
  const [keepImageProportions, setKeepImageProportions] = useState(true);
  const [sourceSize, setSourceSize] = useState<{
    url: string;
    aspectRatio: number | null;
  } | null>(null);
  const imageSrc = layer.type === "image" ? layer.src : null;
  const imageUrl = imageSrc ? getAssetUrl(projectId, imageSrc) : null;

  useEffect(() => {
    if (!imageUrl) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) {
        setSourceSize({
          url: imageUrl,
          aspectRatio:
            image.naturalWidth > 0 && image.naturalHeight > 0
              ? image.naturalWidth / image.naturalHeight
              : null,
        });
      }
    };
    image.onerror = () => {
      if (active) setSourceSize({ url: imageUrl, aspectRatio: null });
    };
    image.src = imageUrl;
    return () => {
      active = false;
    };
  }, [imageUrl]);

  const sourceReady = !imageUrl || sourceSize?.url === imageUrl;
  const aspectRatio =
    layer.type === "image" && layer.fit !== "cover" &&
    imageSrc && sourceReady && sourceSize?.aspectRatio
      ? sourceSize.aspectRatio
      : layer.width / layer.height;

  function changeSize(dimension: "width" | "height", value: number): void {
    const size = Math.max(1, value);
    if (layer.type === "image" && keepImageProportions) {
      onPatch(matchingImageSize(dimension, size, aspectRatio));
    } else {
      onPatch({ [dimension]: size });
    }
  }

  return (
    <>
      <div className="layer-design-row">
        <span>Size</span>
        <div className="layer-double-input">
          <BufferedNumberInput min="1" step="1" aria-label="Layer width" value={layer.width} disabled={layer.type === "image" && keepImageProportions && !sourceReady} onValueChange={(value) => changeSize("width", value)} />
          <BufferedNumberInput min="1" step="1" aria-label="Layer height" value={layer.height} disabled={layer.type === "image" && keepImageProportions && !sourceReady} onValueChange={(value) => changeSize("height", value)} />
        </div>
      </div>
      {layer.type === "image" ? (
        <label className="layer-design-row layer-image-aspect-row">
          <span>Ratio</span>
          <span className="layer-image-aspect-control">
            <input
              type="checkbox"
              aria-label="Keep image proportions"
              title={layer.fit === "cover" ? "Keep the crop frame ratio while resizing" : "Match the source image ratio while resizing"}
              checked={keepImageProportions}
              onChange={(event) => setKeepImageProportions(event.currentTarget.checked)}
            />
            {layer.fit === "cover" ? "Keep frame ratio" : "Keep proportions"}
          </span>
        </label>
      ) : null}
    </>
  );
}

/** Loads the natural pixel size of an image asset for the inspector. */
function useImageNaturalSize(
  projectId: string,
  src: string | null,
): { naturalWidth: number; naturalHeight: number } | null {
  const imageUrl = src ? getAssetUrl(projectId, src) : null;
  const [size, setSize] = useState<{
    url: string;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);
  useEffect(() => {
    if (!imageUrl) {
      setSize(null);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) {
        setSize(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? {
              url: imageUrl,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
            }
            : null,
        );
      }
    };
    image.onerror = () => {
      if (active) {
        setSize(null);
      }
    };
    image.src = imageUrl;
    return () => {
      active = false;
    };
  }, [imageUrl]);
  return size && imageUrl && size.url === imageUrl ? size : null;
}

/** Zoom slider with buffered draft: commits once per drag (one undo step). */
function ImageZoomSlider({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (zoom: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null) {
      onCommit(draft);
      setDraft(null);
    }
  };
  return (
    <div className="layer-design-row">
      <span>Zoom</span>
      <div className="layer-zoom-control">
        <input
          type="range"
          min={IMAGE_CROP_ZOOM_MIN}
          max={IMAGE_CROP_ZOOM_MAX}
          step={0.1}
          aria-label="Image crop zoom"
          value={shown}
          onChange={(event) => setDraft(Number(event.currentTarget.value))}
          onPointerUp={commit}
          onBlur={commit}
        />
        <span>{Math.round(shown * 100)}%</span>
      </div>
    </div>
  );
}

function LayerStackIcon({ count, highlight }: { count: 2 | 3; highlight: number }) {  const centers = count === 3 ? [8.5, 13.5, 18.5] : [11, 16];
  return (
    <svg viewBox="0 0 24 30" width="20" height="25" aria-hidden="true">
      {centers.map((cy, index) => (
        <path
          key={cy}
          d={`M12 ${cy - 3.5}l7.5 3.5-7.5 3.5-7.5-3.5z`}
          fill="currentColor"
          opacity={index === highlight ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}

const ARRANGE_GROUPS: {
  groupLabel: string;
  buttons: { action: ZOrderAction; label: string; title: string; icon: ReactNode }[];
}[] = [
  {
    groupLabel: "Back / Front",
    buttons: [
      { action: "back", label: "Back", title: "Send to back", icon: <LayerStackIcon count={3} highlight={2} /> },
      { action: "front", label: "Front", title: "Bring to front", icon: <LayerStackIcon count={3} highlight={0} /> },
    ],
  },
  {
    groupLabel: "Backward / Forward",
    buttons: [
      { action: "backward", label: "Backward", title: "Send backward", icon: <LayerStackIcon count={2} highlight={1} /> },
      { action: "forward", label: "Forward", title: "Bring forward", icon: <LayerStackIcon count={2} highlight={0} /> },
    ],
  },
];

function ArrangeControls({ onReorder }: { onReorder: (action: ZOrderAction) => void }) {
  return (
    <div className="layer-arrange-groups" role="group" aria-label="Layer z-order">
      {ARRANGE_GROUPS.map((group) => (
        <div key={group.groupLabel} className="layer-arrange-segment" role="group" aria-label={group.groupLabel}>
          {group.buttons.map((button) => (
            <button
              key={button.action}
              type="button"
              title={button.title}
              aria-label={button.title}
              onClick={() => onReorder(button.action)}
            >
              {button.icon}
              <span>{button.label}</span>
            </button>
          ))}
        </div>
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
            {button.icon}
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

function ShapeTextControls({
  value,
  onChange,
}: {
  value: ShapeText;
  onChange: (value: ShapeText) => void;
}) {
  const patch = (next: Partial<ShapeText>) => onChange({ ...value, ...next });
  return (
    <section className="layer-design-section layer-text-section">
      <h4>Shape Text</h4>
      <label className="layer-design-row"><span>Content</span><textarea aria-label="Shape text content" value={value.text} onChange={(event) => patch({ text: event.currentTarget.value })} /></label>
      <label className="layer-design-row"><span>Font Family</span><select aria-label="Shape text font family" value={value.fontFamily} onChange={(event) => patch({ fontFamily: event.currentTarget.value })}>{FONT_OPTIONS.map((group) => (<optgroup key={group.label} label={group.label}>{group.options.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>))}</select></label>
      <label className="layer-design-row"><span>Style</span><select aria-label="Shape text style" value={`${value.fontStyle}-${value.fontWeight}`} onChange={(event) => { const [fontStyle, weight] = event.currentTarget.value.split("-"); patch({ fontStyle: fontStyle as ShapeText["fontStyle"], fontWeight: Number(weight) }); }}><option value="normal-400">Regular 400</option><option value="italic-400">Italic 400</option><option value="normal-500">Medium 500</option><option value="normal-600">Semi Bold 600</option><option value="normal-700">Bold 700</option><option value="normal-800">Extra Bold 800</option></select></label>
      <div className="layer-design-row"><span>Size</span><div className="layer-full-input"><BufferedNumberInput min="1" aria-label="Shape text font size" value={value.fontSize} onValueChange={(fontSize) => patch({ fontSize: Math.max(1, fontSize) })} /></div></div>
      <div className="layer-design-row"><span>Text align</span><SegmentedControl value={value.textAlign} label="Shape text align" options={[{ value: "left", label: "Left aligned", icon: "≡" }, { value: "center", label: "Center aligned", icon: "≡" }, { value: "right", label: "Right aligned", icon: "≡" }]} onChange={(textAlign) => patch({ textAlign })} /></div>
      <div className="layer-design-row"><span>Vertical align</span><SegmentedControl value={value.verticalAlign} label="Shape text vertical align" options={[{ value: "top", label: "Top", icon: "⊤" }, { value: "middle", label: "Middle", icon: "↕" }, { value: "bottom", label: "Bottom", icon: "⊥" }]} onChange={(verticalAlign) => patch({ verticalAlign })} /></div>
      <div className="layer-design-row"><span>Line height</span><div className="layer-single-input layer-wide-input"><BufferedNumberInput min="1" aria-label="Shape text line height" value={Math.round(value.lineHeight * 100)} onValueChange={(lineHeight) => patch({ lineHeight: Math.max(0.01, lineHeight / 100) })} /><span>%</span></div></div>
      <div className="layer-design-row"><span>Letter spacing</span><div className="layer-single-input layer-wide-input"><BufferedNumberInput aria-label="Shape text letter spacing" value={value.letterSpacing} onValueChange={(letterSpacing) => patch({ letterSpacing })} /><span>px</span></div></div>
      <div className="layer-design-row"><span>Case</span><SegmentedControl value={value.textCase} label="Shape text case" options={[{ value: "normal", label: "Normal", icon: "Aa" }, { value: "uppercase", label: "Uppercase", icon: "AA" }, { value: "lowercase", label: "Lowercase", icon: "aa" }]} onChange={(textCase) => patch({ textCase })} /></div>
      <div className="layer-design-row"><span>Padding</span><div className="layer-full-input"><BufferedNumberInput min="0" aria-label="Shape text padding" value={value.padding} onValueChange={(padding) => patch({ padding: Math.max(0, padding) })} /></div></div>
      <label className="layer-design-row layer-checkbox-row"><span>Fill</span><input type="checkbox" aria-label="Enable shape text fill" checked={value.fillEnabled} onChange={(event) => patch({ fillEnabled: event.currentTarget.checked })} /></label>
      <div className="layer-design-row"><span>Text fill</span><ColorControl value={value.fill} label="Shape text fill" onChange={(fill) => patch({ fill })} /></div>
      <div className="layer-design-row"><span>Text stroke</span><ColorControl value={value.stroke ?? "#000000"} label="Shape text stroke" onChange={(stroke) => patch({ stroke })} /></div>
      <div className="layer-design-row"><span>Stroke width</span><div className="layer-full-input"><BufferedNumberInput min="0" aria-label="Shape text stroke width" value={value.strokeWidth} onValueChange={(strokeWidth) => patch({ strokeWidth: Math.max(0, strokeWidth), stroke: strokeWidth > 0 ? (value.stroke ?? "#000000") : value.stroke })} /></div></div>
    </section>
  );
}

function LayerNameInput({
  layer,
  onPatch,
}: {
  layer: Layer;
  onPatch: (patch: EditableLayerPatch) => void;
}) {
  const [input, setInput] = useState(layer.name);

  useEffect(() => {
    setInput(layer.name);
  }, [layer.id, layer.name]);

  return (
    <input
      className="layer-design-name-input"
      type="text"
      aria-label="Layer name"
      title={`${layer.type} layer`}
      maxLength={120}
      value={input}
      onChange={(event) => {
        const value = event.currentTarget.value;
        setInput(value);
        const name = value.trim();
        if (name.length > 0) onPatch({ name });
      }}
      onBlur={() => setInput(layer.name)}
    />
  );
}

export function LayerPropertiesPanel({
  layer,
  projectId,
  onPatch,
  onAlign,
  onReplaceImage,
  onReorder,
  isGroupChild,
  onImageCropEnter,
  onImageCropExit,
  croppingLayerId,
}: LayerPropertiesPanelProps) {
  // Hook before the early return: hooks must run unconditionally.
  const imageNaturalSize = useImageNaturalSize(
    projectId,
    layer?.type === "image" ? layer.src : null,
  );
  if (!layer) return <p className="app-stage">Select a layer to view its properties.</p>;

  const isText = layer.type === "text";
  const isRectangle = layer.type === "rectangle";
  const isCircle = layer.type === "circle";
  const isTriangle = layer.type === "triangle";
  const isImage = layer.type === "image";
  const isGroup = layer.type === "group";
  const shapeText = isRectangle || isCircle ? layer.shapeText : null;
  const isCroppingThis = isImage && croppingLayerId === layer.id;

  function handleFitFrameToImage() {
    // Contain mode: shrink the frame to the visible image rect, dropping
    // the transparent padding. The frame center stays fixed.
    if (!isImage || !imageNaturalSize) return;
    const fitted = fitFrameToImageSize(
      layer.width,
      layer.height,
      imageNaturalSize.naturalWidth,
      imageNaturalSize.naturalHeight,
    );
    if (!fitted) return;
    onPatch({
      x: layer.x + (layer.width - fitted.width) / 2,
      y: layer.y + (layer.height - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    });
  }
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
        <LayerNameInput layer={layer} onPatch={onPatch} />
      </header>

      <LayerAlignmentControls selectionCount={1} onAlign={onAlign} />

      <section className="layer-design-section layer-arrange-section">
        <h4>Arrange</h4>
        <ArrangeControls onReorder={onReorder} />
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
        <LayerSizeControls key={layer.id} layer={layer} projectId={projectId} onPatch={onPatch} />
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
        </section>
      ) : null}

      {isCircle ? (
        <section className="layer-design-section">
          <h4>Ellipse</h4>
          <div className="layer-design-row"><span>Donut</span><div className="layer-single-input"><BufferedNumberInput min="0" max="100" disabled={layer.shapeText.text.trim().length > 0} aria-label="Ellipse donut" value={Math.round(layer.donut * 100)} onValueChange={(value) => onPatch({ donut: Math.min(1, Math.max(0, value / 100)) })} /><span>%</span></div></div>
          <div className="layer-design-row"><span>Sweep</span><div className="layer-single-input"><BufferedNumberInput min="0" max="100" disabled={layer.shapeText.text.trim().length > 0} aria-label="Ellipse sweep" value={Math.round((layer.sweep / 360) * 100)} onValueChange={(value) => onPatch({ sweep: Math.min(360, Math.max(0, value * 3.6)) })} /><span>%</span></div></div>
          <div className="layer-design-row"><span>Start angle</span><div className="layer-single-input"><BufferedNumberInput aria-label="Ellipse start angle" value={layer.startAngle} onValueChange={(value) => onPatch({ startAngle: value })} /><span>°</span></div></div>
        </section>
      ) : null}

      {isText ? (
        <section className="layer-design-section layer-text-section">
          <h4>Text</h4>
          <label className="layer-design-row"><span>Font Family</span><select aria-label="Font family" value={layer.fontFamily} onChange={(event) => onPatch({ fontFamily: event.currentTarget.value })}>{FONT_OPTIONS.map((group) => (<optgroup key={group.label} label={group.label}>{group.options.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>))}</select></label>
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

      {shapeText && (isRectangle || (isCircle && layer.donut === 0 && layer.sweep === 360)) ? (
        <ShapeTextControls value={shapeText} onChange={(nextShapeText) => onPatch({ shapeText: nextShapeText })} />
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
          <label className="layer-design-row">
            <span>Fit</span>
            <select
              aria-label="Image fit"
              value={layer.fit}
              onChange={(event) => onPatch({ fit: event.currentTarget.value as ImageFit })}
            >
              <option value="contain">Contain</option>
              <option value="cover">Crop to fill</option>
              <option value="fill">Stretch</option>
            </select>
          </label>
          {layer.fit === "cover" ? (
            <ImageZoomSlider
              value={layer.zoom}
              onCommit={(zoom) => onPatch({ zoom })}
            />
          ) : null}
          {isCroppingThis ? (
            <button
              type="button"
              className="layer-image-replace"
              onClick={onImageCropExit}
            >
              Done cropping
            </button>
          ) : (
            <>
              {layer.fit === "contain" ? (
                <button
                  type="button"
                  className="layer-image-replace"
                  onClick={handleFitFrameToImage}
                  disabled={layer.src === null || imageNaturalSize === null}
                  title="Shrink the frame to the visible image, removing empty padding"
                >
                  Fit frame to image
                </button>
              ) : null}
              <button
                type="button"
                className="layer-image-replace"
                onClick={() => onImageCropEnter(layer.id)}
                disabled={layer.src === null || layer.locked || isGroupChild}
                title={isGroupChild
                  ? "Ungroup the image first to crop it"
                  : "Double-click the image on canvas to enter as well"}
              >
                Crop image
              </button>
            </>
          )}
          {layer.src === null ? (
            <div className="layer-design-row layer-paint-row">
              <span>Placeholder color</span>
              <ColorControl
                value={layer.placeholderColor}
                label="Image placeholder color"
                onChange={(placeholderColor) => onPatch({ placeholderColor })}
              />
            </div>
          ) : null}
          <div className="layer-design-row"><span>Source</span><strong className="layer-image-source">{layer.src ?? "Not loaded"}</strong></div>
          <button
            type="button"
            className="layer-image-replace"
            onClick={onReplaceImage}
          >
            {layer.src === null ? "Load image…" : "Replace image…"}
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
