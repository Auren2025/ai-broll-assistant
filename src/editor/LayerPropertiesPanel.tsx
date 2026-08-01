import type { Layer } from "../domain/sceneSchema";

type CommonEditableLayerPatch = Partial<
  Pick<
    Layer,
    | "x"
    | "y"
    | "width"
    | "height"
    | "scaleX"
    | "scaleY"
    | "rotation"
    | "opacity"
  >
>;

type TextEditableLayerPatch = {
  text: string;
};

type ShapeEditableLayerPatch = {
  fill?: string;
  stroke?: string | null;
  strokeWidth?: number;
};

type LineEditableLayerPatch = {
  stroke?: string;
  strokeWidth?: number;
};

type ArrowEditableLayerPatch = {
  stroke?: string;
  strokeWidth?: number;
  arrowHeadSize?: number;
};

export type EditableLayerPatch =
  | CommonEditableLayerPatch
  | TextEditableLayerPatch
  | ShapeEditableLayerPatch
  | LineEditableLayerPatch
  | ArrowEditableLayerPatch;

interface LayerPropertiesPanelProps {
  layer: Layer | null;
  selectionCount: number;
  onPatch: (patch: EditableLayerPatch) => void;
}

export function LayerPropertiesPanel({
  layer,
  selectionCount,
  onPatch,
}: LayerPropertiesPanelProps) {
  if (selectionCount > 1) {
    return (
      <p className="app-stage multiple-selection-message">
        Multiple layers selected: {selectionCount}
      </p>
    );
  }

  if (!layer) {
    return <p className="app-stage">Select a layer to view its properties.</p>;
  }

  const currentLayer = layer;

  function patchPosition(property: "x" | "y", value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    onPatch({
      [property]: value,
    });
  }

  function patchScale(property: "scaleX" | "scaleY", value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    onPatch({
      [property]: Math.max(0.01, value),
    });
  }

  function patchRotation(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    onPatch({
      rotation: value,
    });
  }

  function patchOpacity(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    onPatch({
      opacity: Math.min(1, Math.max(0, value)),
    });
  }

  function patchStrokeWidth(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }

    if (
      currentLayer.type === "line" ||
      currentLayer.type === "arrow"
    ) {
      onPatch({
        strokeWidth: Math.max(1, value),
      });
      return;
    }

    onPatch({
      strokeWidth: Math.max(0, value),
    });
  }

  function patchArrowHeadSize(value: number): void {
    if (!Number.isFinite(value) || currentLayer.type !== "arrow") {
      return;
    }

    onPatch({
      arrowHeadSize: Math.max(4, value),
    });
  }

  const isFilledShape =
    layer.type === "rectangle" ||
    layer.type === "circle" ||
    layer.type === "triangle";
  const isStrokedShape =
    isFilledShape || layer.type === "line" || layer.type === "arrow";
  const isArrow = layer.type === "arrow";
  const filledShapeStrokePlaceholder = isFilledShape ? "None" : undefined;

  return (
    <section className="inspector-panel" aria-label="Layer properties">
      <h3>Transform & appearance</h3>

      <dl className="property-grid">
        <dt>ID</dt>
        <dd>{layer.id}</dd>

        <dt>Type</dt>
        <dd>{layer.type}</dd>

        {layer.type === "text" ? (
          <>
            <dt>Text</dt>
            <dd>
              <textarea
                value={layer.text}
                aria-label="Layer text content"
                rows={4}
                onChange={(event) => {
                  onPatch({
                    text: event.currentTarget.value,
                  });
                }}
              />
            </dd>
          </>
        ) : null}

        {isFilledShape ? (
          <>
            <dt>Fill</dt>
            <dd>
              <input
                type="text"
                value={layer.fill}
                aria-label="Layer fill color"
                onChange={(event) => {
                  onPatch({ fill: event.currentTarget.value });
                }}
              />
            </dd>
          </>
        ) : null}

        {isStrokedShape ? (
          <>
            <dt>Stroke</dt>
            <dd>
              <input
                type="text"
                value={isFilledShape ? (layer.stroke ?? "") : layer.stroke}
                placeholder={filledShapeStrokePlaceholder}
                aria-label="Layer stroke color"
                onChange={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (isFilledShape) {
                    onPatch({ stroke: value === "" ? null : value });
                  } else {
                    onPatch({ stroke: value === "" ? "#000000" : value });
                  }
                }}
              />
            </dd>

            <dt>Stroke width</dt>
            <dd>
              <input
                type="number"
                min={isFilledShape ? 0 : 1}
                step={1}
                value={layer.strokeWidth}
                aria-label="Layer stroke width"
                onChange={(event) => {
                  patchStrokeWidth(event.currentTarget.valueAsNumber);
                }}
              />
            </dd>
          </>
        ) : null}

        {isArrow ? (
          <>
            <dt>Arrow head size</dt>
            <dd>
              <input
                type="number"
                min={4}
                step={1}
                value={layer.arrowHeadSize}
                aria-label="Arrow head size"
                onChange={(event) => {
                  patchArrowHeadSize(event.currentTarget.valueAsNumber);
                }}
              />
            </dd>
          </>
        ) : null}

        <dt>X</dt>
        <dd>
          <input
            type="number"
            step={1}
            value={layer.x}
            aria-label="Layer X position"
            onChange={(event) => {
              patchPosition("x", event.currentTarget.valueAsNumber);
            }}
          />
        </dd>

        <dt>Y</dt>
        <dd>
          <input
            type="number"
            step={1}
            value={layer.y}
            aria-label="Layer Y position"
            onChange={(event) => {
              patchPosition("y", event.currentTarget.valueAsNumber);
            }}
          />
        </dd>

        <dt>Width</dt>
        <dd>{layer.width}</dd>

        <dt>Height</dt>
        <dd>{layer.height}</dd>

        <dt>Scale X</dt>
        <dd>
          <input
            type="number"
            min={0.01}
            step={0.05}
            value={layer.scaleX}
            aria-label="Layer horizontal scale"
            onChange={(event) => {
              patchScale("scaleX", event.currentTarget.valueAsNumber);
            }}
          />
        </dd>

        <dt>Scale Y</dt>
        <dd>
          <input
            type="number"
            min={0.01}
            step={0.05}
            value={layer.scaleY}
            aria-label="Layer vertical scale"
            onChange={(event) => {
              patchScale("scaleY", event.currentTarget.valueAsNumber);
            }}
          />
        </dd>

        <dt>Rotation</dt>
        <dd>
          <input
            type="number"
            step={1}
            value={layer.rotation}
            aria-label="Layer rotation"
            onChange={(event) => {
              patchRotation(event.currentTarget.valueAsNumber);
            }}
          />
        </dd>

        <dt>Opacity</dt>
        <dd>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity}
            aria-label="Layer opacity slider"
            onChange={(event) => {
              patchOpacity(event.currentTarget.valueAsNumber);
            }}
          />

          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity}
            aria-label="Layer opacity value"
            onChange={(event) => {
              patchOpacity(event.currentTarget.valueAsNumber);
            }}
          />
        </dd>

        <dt>Z-index</dt>
        <dd>{layer.zIndex}</dd>

        <dt>Visible</dt>
        <dd>{layer.visible ? "Yes" : "No"}</dd>

        <dt>Locked</dt>
        <dd>{layer.locked ? "Yes" : "No"}</dd>
      </dl>
    </section>
  );
}
