import { useEffect, useRef } from "react";
import { Canvas, Rect, Textbox } from "fabric";
import type { FabricObject } from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";

interface FabricSceneCanvasProps {
  scene: Scene;
  projectWidth: number;
  projectHeight: number;
  displayScale?: number;
  onSceneChange: (scene: Scene) => void;
  onSelectedLayerChange: (layerId: string | null) => void;
  selectedLayerId: string | null;
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

export function FabricSceneCanvas({
  scene,
  projectWidth,
  projectHeight,
  displayScale = 0.5,
  onSceneChange,
  onSelectedLayerChange,
  selectedLayerId,
}: FabricSceneCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const sceneRef = useRef<Scene>(scene);

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
      selection: false,
      preserveObjectStacking: true,
    });

    canvas.setViewportTransform([displayScale, 0, 0, displayScale, 0, 0]);

    fabricCanvasRef.current = canvas;

    const objectToLayerId = new Map<FabricObject, string>();
    const layerIdToObject = layerIdToObjectRef.current;
    layerIdToObject.clear();

    const syncLayerFromObject = (
      layerId: string,
      object: FabricObject,
    ): void => {
      const currentScene = sceneRef.current;
      const position = readPositionFromObject(object);

      const updatedLayers: Layer[] = currentScene.layers.map((layer) => {
        if (layer.id !== layerId) {
          return layer;
        }

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
      });

      const updatedScene: Scene = {
        ...currentScene,
        layers: updatedLayers,
      };

      sceneRef.current = updatedScene;
      onSceneChange(updatedScene);
    };

    const syncSelectedLayer = (): void => {
      const active = canvas.getActiveObject();

      if (!active) {
        onSelectedLayerChange(null);
        return;
      }

      const layerId = objectToLayerId.get(active);

      if (layerId !== undefined) {
        onSelectedLayerChange(layerId);
        return;
      }

      onSelectedLayerChange(null);
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
        syncLayerFromObject(layer.id, textbox);
      });
    }

    canvas.on("object:modified", (event) => {
      const target = event.target;

      if (!target) {
        return;
      }

      const layerId = objectToLayerId.get(target);

      if (!layerId) {
        return;
      }

      syncLayerFromObject(layerId, target);
    });

    canvas.on("selection:created", syncSelectedLayer);
    canvas.on("selection:updated", syncSelectedLayer);
    canvas.on("selection:cleared", syncSelectedLayer);

    canvas.requestRenderAll();

    return () => {
      void canvas.dispose();
      fabricCanvasRef.current = null;
      layerIdToObject.clear();
    };
  }, [
    displayScale,
    onSceneChange,
    onSelectedLayerChange,
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

    for (const layer of scene.layers) {
      const object = layerIdToObject.get(layer.id);

      if (!object) {
        continue;
      }

      applyLayerToFabricObject(object, layer);
    }

    canvas.requestRenderAll();
  }, [scene]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    if (selectedLayerId === null) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      return;
    }

    const object = layerIdToObjectRef.current.get(selectedLayerId);

    if (!object) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      return;
    }

    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  }, [selectedLayerId]);

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
