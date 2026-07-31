import type { Layer } from "../domain/sceneSchema";

export type EditableLayerPatch = Partial<
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

interface LayerPropertiesPanelProps {
  layer: Layer | null;
  onPatch: (patch: EditableLayerPatch) => void;
}

export function LayerPropertiesPanel({
  layer,
  onPatch,
}: LayerPropertiesPanelProps) {
  if (!layer) {
    return <p className="app-stage">Select a layer to view its properties.</p>;
  }

  return (
    <section aria-label="Layer properties">
      <h3>Layer properties</h3>

      <dl>
        <dt>ID</dt>
        <dd>{layer.id}</dd>

        <dt>Type</dt>
        <dd>{layer.type}</dd>

        <dt>X</dt>
        <dd>
          <input
            type="number"
            step={1}
            value={layer.x}
            aria-label="Layer X position"
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;

              if (!Number.isFinite(value)) {
                return;
              }

              onPatch({ x: value });
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
              const value = event.currentTarget.valueAsNumber;

              if (!Number.isFinite(value)) {
                return;
              }

              onPatch({ y: value });
            }}
          />
        </dd>

        <dt>Width</dt>
        <dd>{layer.width}</dd>

        <dt>Height</dt>
        <dd>{layer.height}</dd>

        <dt>Scale X</dt>
        <dd>{layer.scaleX}</dd>

        <dt>Scale Y</dt>
        <dd>{layer.scaleY}</dd>

        <dt>Rotation</dt>
        <dd>{layer.rotation}</dd>

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
              const value = event.currentTarget.valueAsNumber;

              if (!Number.isFinite(value)) {
                return;
              }

              onPatch({
                opacity: Math.min(1, Math.max(0, value)),
              });
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
              const value = event.currentTarget.valueAsNumber;

              if (!Number.isFinite(value)) {
                return;
              }

              onPatch({
                opacity: Math.min(1, Math.max(0, value)),
              });
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
