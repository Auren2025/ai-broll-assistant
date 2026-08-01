import { useEffect, useRef } from "react";
import { ActiveSelection, Canvas, Rect, Textbox } from "fabric";
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
      stroke: layer.stroke ?? undefined,
      strokeWidth: layer.strokeWidth,
      rx: cornerRadius,
      ry: cornerRadius,
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

function applySelectionToCanvas(
  canvas: Canvas,
  selectedLayerIds: readonly string[],
  layerIdToObject: ReadonlyMap<string, FabricObject>,
): void {
  const selectedObjects = selectedLayerIds
    .map((layerId) => layerIdToObject.get(layerId))
    .filter((object): object is FabricObject => object !== undefined);

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

    const syncObjectsToScene = (objects: readonly FabricObject[]): void => {
      const objectByLayerId = new Map<string, FabricObject>();

      for (const object of objects) {
        const layerId = objectToLayerId.get(object);

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
    };

    const syncSelectedLayers = (): void => {
      if (isApplyingSelectionRef.current) {
        return;
      }

      const layerIds = canvas
        .getActiveObjects()
        .map((object) => objectToLayerId.get(object))
        .filter((layerId): layerId is string => layerId !== undefined);

      onSelectedLayerIdsChange(layerIds);
    };

    const sortedLayers = [...sceneRef.current.layers].sort(
      (first, second) => first.zIndex - second.zIndex,
    );

    for (const layer of sortedLayers) {
      if (layer.type === "rectangle") {
        const cornerRadius = Math.min(
          layer.cornerRadius,
          Math.min(layer.width, layer.height) / 2,
        );
        const rectangle = new Rect({
          left: layer.x + layer.width / 2,
          top: layer.y + layer.height / 2,
          width: layer.width,
          height: layer.height,
          scaleX: layer.scaleX,
          scaleY: layer.scaleY,
          angle: layer.rotation,
          opacity: layer.opacity,
          visible: layer.visible,
          fill: layer.fill,
          stroke: layer.stroke ?? undefined,
          strokeWidth: layer.strokeWidth,
          rx: cornerRadius,
          ry: cornerRadius,
          originX: "center",
          originY: "center",
          selectable: !layer.locked,
          evented: !layer.locked,
        });

        objectToLayerId.set(rectangle, layer.id);
        layerIdToObject.set(layer.id, rectangle);
        canvas.add(rectangle);
        continue;
      }

      const characterSpacing = (layer.letterSpacing / layer.fontSize) * 1000;
      const textbox = new Textbox(layer.text, {
        width: layer.width,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        lineHeight: layer.lineHeight,
        charSpacing: characterSpacing,
        textAlign: layer.textAlign,
        fill: layer.fill,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
        angle: layer.rotation,
        opacity: layer.opacity,
        visible: layer.visible,
        originX: "center",
        originY: "center",
        selectable: !layer.locked,
        evented: !layer.locked,
        editable: !layer.locked,
      });

      textbox.set({
        left: layer.x + layer.width / 2,
        top: layer.y + textbox.height / 2,
      });

      objectToLayerId.set(textbox, layer.id);
      layerIdToObject.set(layer.id, textbox);
      canvas.add(textbox);

      textbox.on("editing:exited", () => {
        syncObjectsToScene([textbox]);
      });
    }

    canvas.on("object:modified", (event) => {
      const target = event.target;

      if (!target) {
        return;
      }

      if (target instanceof ActiveSelection) {
        const selectedObjects = target.getObjects();
        const selectedIds = selectedObjects
          .map((object) => objectToLayerId.get(object))
          .filter((layerId): layerId is string => layerId !== undefined);

        queueMicrotask(() => {
          isApplyingSelectionRef.current = true;
          canvas.discardActiveObject();
          syncObjectsToScene(selectedObjects);
          applySelectionToCanvas(canvas, selectedIds, layerIdToObject);
          isApplyingSelectionRef.current = false;
          canvas.requestRenderAll();
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
    displayScale,
    onSceneChange,
    onSelectedLayerIdsChange,
    projectHeight,
    projectWidth,
    scene.id,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const layerIdToObject = layerIdToObjectRef.current;
    isApplyingSelectionRef.current = true;
    canvas.discardActiveObject();

    for (const layer of scene.layers) {
      const object = layerIdToObject.get(layer.id);

      if (object) {
        applyLayerToFabricObject(object, layer);
      }
    }

    applySelectionToCanvas(canvas, selectedLayerIds, layerIdToObject);
    isApplyingSelectionRef.current = false;
    canvas.requestRenderAll();
  }, [scene, selectedLayerIds]);

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
