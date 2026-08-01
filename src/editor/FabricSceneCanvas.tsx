import { useCallback, useEffect, useRef } from "react";
import { ActiveSelection, Canvas, Circle, Rect, Textbox, Triangle } from "fabric";
import type { FabricObject } from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";

interface FabricSceneCanvasProps {
  scene: Scene;
  projectWidth: number;
  projectHeight: number;
  displayScale?: number;
  onSceneChange: (scene: Scene) => void;
  onSelectedLayerIdsChange: (layerIds: string[]) => void;
  selectedLayerIds: readonly string[];
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readPositionFromObject(obj: FabricObject): {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
} {
  const width = obj.width ?? 0;
  const height = obj.height ?? 0;
  const x = roundNumber((obj.left ?? 0) - width / 2);
  const y = roundNumber((obj.top ?? 0) - height / 2);

  return {
    x,
    y,
    width: roundNumber(width),
    height: roundNumber(height),
    scaleX: roundNumber(obj.scaleX ?? 1),
    scaleY: roundNumber(obj.scaleY ?? 1),
    rotation: roundNumber(obj.angle ?? 0),
  };
}

function updateLayerFromFabricObject(
  layer: Layer,
  object: FabricObject,
): Layer {
  const position = readPositionFromObject(object);

  if (layer.type === "text" && object instanceof Textbox) {
    return {
      ...layer,
      ...position,
      text: object.text ?? "",
      width: roundNumber(object.width),
      height: roundNumber(object.height),
    };
  }

  return {
    ...layer,
    ...position,
  };
}

function applyLayerToFabricObject(
  object: FabricObject,
  layer: Layer,
): void {
  object.set({
    left: layer.x + layer.width / 2,
    top: layer.y + layer.height / 2,
    width: layer.width,
    height: layer.height,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
  });

  if (layer.type === "rectangle" && object instanceof Rect) {
    const cornerRadius = Math.min(
      layer.cornerRadius,
      Math.min(layer.width, layer.height) / 2,
    );

    object.set({
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      rx: cornerRadius,
      ry: cornerRadius,
    });
    return;
  }

  if (layer.type === "circle" && object instanceof Circle) {
    object.set({
      radius: Math.min(layer.width, layer.height) / 2,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
    });
    return;
  }

  if (layer.type === "triangle" && object instanceof Triangle) {
    object.set({
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
    });
    return;
  }

  if (layer.type === "text" && object instanceof Textbox) {
    const characterSpacing = (layer.letterSpacing / layer.fontSize) * 1000;

    object.set({
      text: layer.text,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      fontStyle: layer.fontStyle,
      lineHeight: layer.lineHeight,
      charSpacing: characterSpacing,
      textAlign: layer.textAlign,
      fill: layer.fill,
      editable: !layer.locked,
    });
  }
}

function createFabricObjectForLayer(layer: Layer): FabricObject {
  let object: FabricObject;

  switch (layer.type) {
    case "rectangle":
      object = new Rect({ originX: "center", originY: "center" });
      break;
    case "circle":
      object = new Circle({ originX: "center", originY: "center" });
      break;
    case "triangle":
      object = new Triangle({ originX: "center", originY: "center" });
      break;
    case "text":
      object = new Textbox(layer.text, {
        originX: "center",
        originY: "center",
      });
      break;
  }

  applyLayerToFabricObject(object, layer);
  return object;
}

function isFabricObjectForLayer(
  object: FabricObject,
  layer: Layer,
): boolean {
  switch (layer.type) {
    case "rectangle":
      return object instanceof Rect;
    case "circle":
      return object instanceof Circle;
    case "triangle":
      return object instanceof Triangle;
    case "text":
      return object instanceof Textbox;
  }
}

function applySelectionToCanvas(
  canvas: Canvas,
  selectedLayerIds: readonly string[],
  layerIdToObject: ReadonlyMap<string, FabricObject>,
): void {
  const selectedLayerIdSet = new Set(selectedLayerIds);
  const selectedObjects = canvas
    .getObjects()
    .filter((object) => {
      for (const layerId of selectedLayerIdSet) {
        if (layerIdToObject.get(layerId) === object) {
          return true;
        }
      }

      return false;
    });

  if (selectedObjects.length === 0) {
    canvas.discardActiveObject();
    return;
  }

  if (selectedObjects.length === 1) {
    canvas.setActiveObject(selectedObjects[0]);
    return;
  }

  canvas.setActiveObject(new ActiveSelection(selectedObjects, { canvas }));
}

export function FabricSceneCanvas({
  scene,
  projectWidth,
  projectHeight,
  displayScale = 0.5,
  onSceneChange,
  onSelectedLayerIdsChange,
  selectedLayerIds,
}: FabricSceneCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const objectToLayerIdRef = useRef<Map<FabricObject, string>>(new Map());
  const sceneRef = useRef<Scene>(scene);
  const isApplyingSelectionRef = useRef(false);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const syncObjectsToScene = useCallback(
    (objects: readonly FabricObject[]): void => {
      const objectByLayerId = new Map<string, FabricObject>();

      for (const object of objects) {
        const layerId = objectToLayerIdRef.current.get(object);

        if (layerId) {
          objectByLayerId.set(layerId, object);
        }
      }

      if (objectByLayerId.size === 0) {
        return;
      }

      const currentScene = sceneRef.current;
      const updatedScene: Scene = {
        ...currentScene,
        layers: currentScene.layers.map((layer) => {
          const object = objectByLayerId.get(layer.id);
          return object ? updateLayerFromFabricObject(layer, object) : layer;
        }),
      };

      sceneRef.current = updatedScene;
      onSceneChange(updatedScene);
    },
    [onSceneChange],
  );

  const addFabricObject = useCallback(
    (canvas: Canvas, layer: Layer): FabricObject => {
      const object = createFabricObjectForLayer(layer);
      layerIdToObjectRef.current.set(layer.id, object);
      objectToLayerIdRef.current.set(object, layer.id);
      canvas.add(object);

      if (object instanceof Textbox) {
        object.on("editing:exited", () => {
          syncObjectsToScene([object]);
        });
      }

      return object;
    },
    [syncObjectsToScene],
  );

  useEffect(() => {
    const canvasElement = canvasElementRef.current;

    if (!canvasElement) {
      return;
    }

    const canvas = new Canvas(canvasElement, {
      width: projectWidth * displayScale,
      height: projectHeight * displayScale,
      selection: true,
      selectionKey: "shiftKey",
      preserveObjectStacking: true,
    });

    canvas.setViewportTransform([displayScale, 0, 0, displayScale, 0, 0]);
    fabricCanvasRef.current = canvas;
    const objectToLayerId = objectToLayerIdRef.current;
    const layerIdToObject = layerIdToObjectRef.current;
    objectToLayerId.clear();
    layerIdToObject.clear();

    const sortedLayers = [...sceneRef.current.layers].sort(
      (first, second) => first.zIndex - second.zIndex,
    );

    for (const layer of sortedLayers) {
      addFabricObject(canvas, layer);
    }

    const syncSelectedLayers = (): void => {
      if (isApplyingSelectionRef.current) {
        return;
      }

      const layerIds = canvas
        .getActiveObjects()
        .map((object) => objectToLayerIdRef.current.get(object))
        .filter((layerId): layerId is string => layerId !== undefined);

      onSelectedLayerIdsChange(layerIds);
    };

    canvas.on("object:modified", (event) => {
      const target = event.target;

      if (!target) {
        return;
      }

      if (target instanceof ActiveSelection) {
        const selectedObjects = target.getObjects();
        const selectedIds = selectedObjects
          .map((object) => objectToLayerIdRef.current.get(object))
          .filter((layerId): layerId is string => layerId !== undefined);

        queueMicrotask(() => {
          isApplyingSelectionRef.current = true;

          try {
            canvas.discardActiveObject();
            syncObjectsToScene(selectedObjects);
            applySelectionToCanvas(
              canvas,
              selectedIds,
              layerIdToObjectRef.current,
            );
            canvas.requestRenderAll();
          } finally {
            isApplyingSelectionRef.current = false;
          }
        });
        return;
      }

      syncObjectsToScene([target]);
    });

    canvas.on("selection:created", syncSelectedLayers);
    canvas.on("selection:updated", syncSelectedLayers);
    canvas.on("selection:cleared", syncSelectedLayers);
    canvas.on("mouse:down", (event) => {
      if (!event.target) {
        onSelectedLayerIdsChange([]);
      }
    });

    canvas.requestRenderAll();

    return () => {
      void canvas.dispose();
      fabricCanvasRef.current = null;
      objectToLayerId.clear();
      layerIdToObject.clear();
    };
  }, [
    addFabricObject,
    displayScale,
    onSelectedLayerIdsChange,
    projectHeight,
    projectWidth,
    scene.id,
    syncObjectsToScene,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const layerIdToObject = layerIdToObjectRef.current;
    const objectToLayerId = objectToLayerIdRef.current;
    const desiredLayerIds = new Set(scene.layers.map((layer) => layer.id));
    isApplyingSelectionRef.current = true;

    try {
      canvas.discardActiveObject();

      for (const [layerId, object] of layerIdToObject) {
        if (!desiredLayerIds.has(layerId)) {
          canvas.remove(object);
          layerIdToObject.delete(layerId);
          objectToLayerId.delete(object);
        }
      }

      const sortedLayers = [...scene.layers].sort(
        (first, second) => first.zIndex - second.zIndex,
      );

      sortedLayers.forEach((layer, index) => {
        let object = layerIdToObject.get(layer.id);

        if (object && !isFabricObjectForLayer(object, layer)) {
          canvas.remove(object);
          layerIdToObject.delete(layer.id);
          objectToLayerId.delete(object);
          object = undefined;
        }

        if (!object) {
          object = addFabricObject(canvas, layer);
        } else {
          applyLayerToFabricObject(object, layer);
        }

        canvas.moveObjectTo(object, index);
      });

      applySelectionToCanvas(canvas, selectedLayerIds, layerIdToObject);
      canvas.requestRenderAll();
    } finally {
      isApplyingSelectionRef.current = false;
    }
  }, [addFabricObject, scene, selectedLayerIds]);

  return (
    <div
      style={{
        width: projectWidth * displayScale,
        height: projectHeight * displayScale,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <canvas ref={canvasElementRef} />
    </div>
  );
}
