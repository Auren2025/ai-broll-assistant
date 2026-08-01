import { useCallback, useEffect, useRef } from "react";
import {
  ActiveSelection,
  Canvas,
  FabricObject,
  Group as FabricGroup,
  FixedLayout,
  LayoutManager,
  Textbox,
  classRegistry,
} from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";

type CornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

function roundedRectanglePath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radii: CornerRadii,
): void {
  const maximum = Math.min(width, height) / 2;
  const topLeft = Math.min(radii.topLeft, maximum);
  const topRight = Math.min(radii.topRight, maximum);
  const bottomRight = Math.min(radii.bottomRight, maximum);
  const bottomLeft = Math.min(radii.bottomLeft, maximum);
  const left = -width / 2;
  const top = -height / 2;
  const right = width / 2;
  const bottom = height / 2;

  ctx.beginPath();
  ctx.moveTo(left + topLeft, top);
  ctx.lineTo(right - topRight, top);
  ctx.quadraticCurveTo(right, top, right, top + topRight);
  ctx.lineTo(right, bottom - bottomRight);
  ctx.quadraticCurveTo(right, bottom, right - bottomRight, bottom);
  ctx.lineTo(left + bottomLeft, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - bottomLeft);
  ctx.lineTo(left, top + topLeft);
  ctx.quadraticCurveTo(left, top, left + topLeft, top);
  ctx.closePath();
}

function roundedTrianglePath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
): void {
  const points = [
    { x: 0, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y);
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y);
    const previousUnit = {
      x: (previous.x - point.x) / previousLength,
      y: (previous.y - point.y) / previousLength,
    };
    const nextUnit = {
      x: (next.x - point.x) / nextLength,
      y: (next.y - point.y) / nextLength,
    };
    const angle = Math.acos(
      Math.min(
        1,
        Math.max(-1, previousUnit.x * nextUnit.x + previousUnit.y * nextUnit.y),
      ),
    );
    const tangentScale = Math.tan(angle / 2);
    const requestedDistance = tangentScale > 0 ? radius / tangentScale : 0;
    const distance = Math.min(
      requestedDistance,
      previousLength / 2,
      nextLength / 2,
    );
    const effectiveRadius = distance * tangentScale;
    return {
      point,
      radius: effectiveRadius,
      entry: {
        x: point.x + previousUnit.x * distance,
        y: point.y + previousUnit.y * distance,
      },
      exit: {
        x: point.x + nextUnit.x * distance,
        y: point.y + nextUnit.y * distance,
      },
    };
  });

  ctx.beginPath();
  ctx.moveTo(corners[0].entry.x, corners[0].entry.y);
  for (const corner of corners) {
    ctx.arcTo(
      corner.point.x,
      corner.point.y,
      corner.exit.x,
      corner.exit.y,
      corner.radius,
    );
    const nextCorner = corners[(corners.indexOf(corner) + 1) % corners.length];
    ctx.lineTo(nextCorner.entry.x, nextCorner.entry.y);
  }
  ctx.closePath();
}

function paintShape(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  fill: string | null,
  stroke: string | null,
  strokeWidth: number,
): void {
  ctx.save();
  path();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
  }

  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth * 2;
    ctx.save();
    ctx.clip("evenodd");
    path();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

class FabricRoundedRectangleObject extends FabricObject {
  static type = "FabricRoundedRectangle";

  declare fillColor: string | null;
  declare strokeColor: string | null;
  declare shapeStrokeWidth: number;
  declare cornerRadii: CornerRadii;

  override _render(ctx: CanvasRenderingContext2D): void {
    paintShape(
      ctx,
      () => roundedRectanglePath(ctx, this.width, this.height, this.cornerRadii),
      this.fillColor,
      this.strokeColor,
      this.shapeStrokeWidth,
    );
  }
}

class FabricEllipseObject extends FabricObject {
  static type = "FabricEllipse";

  declare fillColor: string | null;
  declare strokeColor: string | null;
  declare shapeStrokeWidth: number;
  declare donut: number;
  declare sweep: number;
  declare startAngle: number;

  private ellipsePath(ctx: CanvasRenderingContext2D): void {
    const outerX = this.width / 2;
    const outerY = this.height / 2;
    const innerX = outerX * this.donut;
    const innerY = outerY * this.donut;
    const start = ((this.startAngle - 90) * Math.PI) / 180;
    const end = start + (this.sweep * Math.PI) / 180;

    ctx.beginPath();
    ctx.ellipse(0, 0, outerX, outerY, 0, start, end);
    if (innerX > 0 && innerY > 0) {
      ctx.ellipse(0, 0, innerX, innerY, 0, end, start, true);
    } else if (this.sweep < 360) {
      ctx.lineTo(0, 0);
    }
    ctx.closePath();
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    paintShape(
      ctx,
      () => this.ellipsePath(ctx),
      this.fillColor,
      this.strokeColor,
      this.shapeStrokeWidth,
    );
  }
}

class FabricRoundedTriangleObject extends FabricObject {
  static type = "FabricRoundedTriangle";

  declare fillColor: string | null;
  declare strokeColor: string | null;
  declare shapeStrokeWidth: number;
  declare cornerRadius: number;

  override _render(ctx: CanvasRenderingContext2D): void {
    paintShape(
      ctx,
      () => roundedTrianglePath(ctx, this.width, this.height, this.cornerRadius),
      this.fillColor,
      this.strokeColor,
      this.shapeStrokeWidth,
    );
  }
}

class FabricArrowObject extends FabricObject {
  static type = "FabricArrow";

  declare stroke: string;
  declare strokeWidth: number;
  declare arrowHeadSize: number;
  declare arrowStartStyle: "none" | "triangle" | "line" | "diamond" | "circle";
  declare arrowEndStyle: "none" | "triangle" | "line" | "diamond" | "circle";

  private renderArrowHead(
    ctx: CanvasRenderingContext2D,
    side: "start" | "end",
    style: "triangle" | "line" | "diamond" | "circle",
    size: number,
  ): void {
    const direction = side === "start" ? -1 : 1;
    const tipX = direction * (this.width / 2);
    const innerX = tipX - direction * size;

    const halfSize = size / 2;

    if (style === "line") {
      ctx.strokeStyle = this.stroke;
      ctx.lineWidth = this.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(innerX, -halfSize);
      ctx.lineTo(tipX, 0);
      ctx.lineTo(innerX, halfSize);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = this.stroke;
    ctx.beginPath();
    if (style === "diamond") {
      const middleX = tipX - direction * (size / 2);
      ctx.moveTo(tipX, 0);
      ctx.lineTo(middleX, -halfSize);
      ctx.lineTo(innerX, 0);
      ctx.lineTo(middleX, halfSize);
    } else if (style === "circle") {
      const centerX = tipX - direction * (size / 2);
      ctx.arc(centerX, 0, size / 2, 0, Math.PI * 2);
    } else {
      ctx.moveTo(tipX, 0);
      ctx.lineTo(innerX, -halfSize);
      ctx.lineTo(innerX, halfSize);
    }
    ctx.closePath();
    ctx.fill();
  }

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.stroke = (options.stroke as string | undefined) ?? "#1f2937";
    this.strokeWidth = (options.strokeWidth as number | undefined) ?? 6;
    this.arrowHeadSize = (options.arrowHeadSize as number | undefined) ?? 24;
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const sw = this.strokeWidth;
    const ah = Math.max(0, Math.min(this.arrowHeadSize, w / 2));

    if (w <= 0 || h <= 0) {
      return;
    }

    ctx.save();
    ctx.fillStyle = this.stroke;

    const startInset = this.arrowStartStyle !== "none" ? ah : 0;
    const endInset = this.arrowEndStyle !== "none" ? ah : 0;
    const shaftWidth = w - startInset - endInset;

    if (sw > 0 && shaftWidth > 0) {
      ctx.fillRect(-w / 2 + startInset, -sw / 2, shaftWidth, sw);
    }

    if (ah > 0 && this.arrowStartStyle !== "none") {
      this.renderArrowHead(ctx, "start", this.arrowStartStyle, ah);
    }
    if (ah > 0 && this.arrowEndStyle !== "none") {
      this.renderArrowHead(ctx, "end", this.arrowEndStyle, ah);
    }

    ctx.restore();
  }
}

classRegistry.setClass(FabricArrowObject);
classRegistry.setClass(FabricRoundedRectangleObject);
classRegistry.setClass(FabricEllipseObject);
classRegistry.setClass(FabricRoundedTriangleObject);

interface FabricSceneCanvasProps {
  scene: Scene;
  projectWidth: number;
  projectHeight: number;
  displayScale?: number;
  onSceneChange: (scene: Scene) => void;
  onSelectedLayerIdsChange: (layerIds: string[]) => void;
  onContextMenuRequest: (x: number, y: number) => void;
  selectedLayerIds: readonly string[];
}

function roundNumber(value: number): number {
  return Math.round(value * 10) / 10;
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
  const width = (obj.width ?? 0) * Math.abs(obj.scaleX ?? 1);
  const height = (obj.height ?? 0) * Math.abs(obj.scaleY ?? 1);
  const x = roundNumber((obj.left ?? 0) - width / 2);
  const y = roundNumber((obj.top ?? 0) - height / 2);

  obj.set({
    width,
    height,
    scaleX: 1,
    scaleY: 1,
  });
  obj.setCoords();

  return {
    x,
    y,
    width: roundNumber(width),
    height: roundNumber(height),
    scaleX: 1,
    scaleY: 1,
    rotation: roundNumber(obj.angle ?? 0),
  };
}

function updateLayerFromFabricObject(
  layer: Layer,
  object: FabricObject,
): Layer {
  if (layer.type === "group" && object instanceof FabricGroup) {
    const objectScaleX = Math.abs(object.scaleX ?? 1);
    const objectScaleY = Math.abs(object.scaleY ?? 1);
    const scale =
      Math.abs(objectScaleX - layer.scaleX) >=
      Math.abs(objectScaleY - layer.scaleY)
        ? objectScaleX
        : objectScaleY;
    object.set({ scaleX: scale, scaleY: scale });
    object.setCoords();
    return {
      ...layer,
      x: roundNumber((object.left ?? 0) - layer.width / 2),
      y: roundNumber((object.top ?? 0) - layer.height / 2),
      scaleX: roundNumber(scale),
      scaleY: roundNumber(scale),
      rotation: roundNumber(object.angle ?? 0),
    };
  }

  const position = readPositionFromObject(object);

  if (layer.type === "text" && object instanceof Textbox) {
    return {
      ...layer,
      ...position,
      text: layer.textCase === "normal" ? (object.text ?? "") : layer.text,
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
  if (layer.type === "group" && object instanceof FabricGroup) {
    object.set({
      left: layer.x + layer.width / 2,
      top: layer.y + layer.height / 2,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      angle: layer.rotation,
      opacity: layer.opacityEnabled ? layer.opacity : 1,
      visible: layer.visible,
      selectable: !layer.locked,
      evented: !layer.locked,
      subTargetCheck: true,
      interactive: false,
    });
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    object.dirty = true;
    object.setCoords();
    return;
  }

  object.set({
    left: layer.x + layer.width / 2,
    top: layer.y + layer.height / 2,
    width: layer.width,
    height: layer.height,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.rotation,
    opacity: layer.opacityEnabled ? layer.opacity : 1,
    globalCompositeOperation:
      layer.blendMode === "normal" ? "source-over" : layer.blendMode,
    visible: layer.visible,
    selectable: !layer.locked,
    evented: !layer.locked,
  });

  if (
    layer.type === "rectangle" &&
    object instanceof FabricRoundedRectangleObject
  ) {
    const cornerRadii = layer.cornerEnabled
      ? (layer.cornerRadii ?? {
          topLeft: layer.cornerRadius,
          topRight: layer.cornerRadius,
          bottomRight: layer.cornerRadius,
          bottomLeft: layer.cornerRadius,
        })
      : { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
    object.set({
      fillColor: layer.fillEnabled ? layer.fill : null,
      strokeColor: layer.stroke,
      shapeStrokeWidth: layer.strokeWidth,
      cornerRadii,
    });
    object.dirty = true;
    object.setCoords();
    return;
  }

  if (layer.type === "circle" && object instanceof FabricEllipseObject) {
    object.set({
      fillColor: layer.fillEnabled ? layer.fill : null,
      strokeColor: layer.stroke,
      shapeStrokeWidth: layer.strokeWidth,
      donut: layer.donut,
      sweep: layer.sweep,
      startAngle: layer.startAngle,
    });
    object.dirty = true;
    object.setCoords();
    return;
  }

  if (
    layer.type === "triangle" &&
    object instanceof FabricRoundedTriangleObject
  ) {
    object.set({
      fillColor: layer.fillEnabled ? layer.fill : null,
      strokeColor: layer.stroke,
      shapeStrokeWidth: layer.strokeWidth,
      cornerRadius: layer.cornerEnabled ? layer.cornerRadius : 0,
    });
    object.dirty = true;
    object.setCoords();
    return;
  }

  if (layer.type === "arrow" && object instanceof FabricArrowObject) {
    object.set({
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      arrowHeadSize: layer.arrowHeadSize,
      arrowStartStyle: layer.arrowStartStyle,
      arrowEndStyle: layer.arrowEndStyle,
    });
    object.dirty = true;
    object.setCoords();
    return;
  }

  if (layer.type === "text" && object instanceof Textbox) {
    const characterSpacing = (layer.letterSpacing / layer.fontSize) * 1000;

    const displayText =
      layer.textCase === "uppercase"
        ? layer.text.toUpperCase()
        : layer.textCase === "lowercase"
          ? layer.text.toLowerCase()
          : layer.text;

    object.set({
      text: displayText,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      fontStyle: layer.fontStyle,
      lineHeight: layer.lineHeight,
      charSpacing: characterSpacing,
      textAlign: layer.textAlign,
      fill: layer.fillEnabled ? layer.fill : "transparent",
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      paintFirst: "fill",
      editable: !layer.locked,
    });
  }
}

function createFabricObjectForLayer(layer: Layer): FabricObject {
  let object: FabricObject;

  switch (layer.type) {
    case "rectangle":
      object = new FabricRoundedRectangleObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      });
      break;
    case "circle":
      object = new FabricEllipseObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      });
      break;
    case "triangle":
      object = new FabricRoundedTriangleObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      });
      break;
    case "text":
      object = new Textbox(layer.text, {
        originX: "center",
        originY: "center",
      });
      break;
    case "arrow":
      object = new FabricArrowObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      });
      break;
    case "group": {
      const children = [...layer.children]
        .sort((first, second) => first.zIndex - second.zIndex)
        .map((child) => createFabricObjectForLayer(child));
      object = new FabricGroup(children, {
        originX: "center",
        originY: "center",
        width: layer.width,
        height: layer.height,
        layoutManager: new LayoutManager(new FixedLayout()),
        objectCaching: false,
      });
      break;
    }
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
      return object instanceof FabricRoundedRectangleObject;
    case "circle":
      return object instanceof FabricEllipseObject;
    case "triangle":
      return object instanceof FabricRoundedTriangleObject;
    case "text":
      return object instanceof Textbox;
    case "arrow":
      return object instanceof FabricArrowObject;
    case "group":
      return object instanceof FabricGroup;
  }
}

function applySelectionToCanvas(
  canvas: Canvas,
  selectedLayerIds: readonly string[],
  layerIdToObject: ReadonlyMap<string, FabricObject>,
): void {
  const selectedObjects = [
    ...new Set(
      selectedLayerIds.flatMap((layerId) => {
        const directObject = layerIdToObject.get(layerId);
        return directObject ? [directObject] : [];
      }),
    ),
  ];

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
  onContextMenuRequest,
  selectedLayerIds,
}: FabricSceneCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const objectToLayerIdRef = useRef<Map<FabricObject, string>>(new Map());
  const sceneRef = useRef<Scene>(scene);
  const contextMenuRequestRef = useRef(onContextMenuRequest);
  const isApplyingSelectionRef = useRef(false);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    contextMenuRequestRef.current = onContextMenuRequest;
  }, [onContextMenuRequest]);

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
      if (layer.type === "group" && object instanceof FabricGroup) {
        const children = [...layer.children].sort(
          (first, second) => first.zIndex - second.zIndex,
        );
        object.getObjects().forEach((childObject, index) => {
          const child = children[index];
          if (child) objectToLayerIdRef.current.set(childObject, child.id);
        });
      }
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
      backgroundColor: sceneRef.current.backgroundColor ?? "transparent",
      fireRightClick: true,
      selection: true,
      selectionKey: "shiftKey",
      stopContextMenu: true,
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

    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      contextMenuRequestRef.current(event.clientX, event.clientY);
    };
    canvas.upperCanvasEl.addEventListener("contextmenu", handleContextMenu, true);

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
    canvas.on("mouse:dblclick", (event) => {
      const childObject = event.subTargets?.[0];
      if (!childObject) return;
      const childId = objectToLayerIdRef.current.get(childObject);
      const child = childId
        ? sceneRef.current.layers
            .flatMap((layer) =>
              layer.type === "group" ? layer.children : [],
            )
            .find((candidate) => candidate.id === childId)
        : undefined;
      if (child && !child.locked) onSelectedLayerIdsChange([child.id]);
    });
    canvas.on("mouse:down", (event) => {
      const pointerEvent = event.e as MouseEvent;
      if (pointerEvent.button === 2) {
        pointerEvent.preventDefault();
        contextMenuRequestRef.current(
          pointerEvent.clientX,
          pointerEvent.clientY,
        );
        return;
      }
      if (!event.target) {
        onSelectedLayerIdsChange([]);
      }
    });

    canvas.requestRenderAll();

    return () => {
      canvas.upperCanvasEl.removeEventListener("contextmenu", handleContextMenu, true);
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
    const forgetObject = (object: FabricObject): void => {
      objectToLayerId.delete(object);
      if (object instanceof FabricGroup) {
        object.getObjects().forEach((child) => objectToLayerId.delete(child));
      }
    };
    isApplyingSelectionRef.current = true;

    try {
      canvas.discardActiveObject();
      canvas.backgroundColor = scene.backgroundColor ?? "transparent";

      for (const [layerId, object] of layerIdToObject) {
        if (!desiredLayerIds.has(layerId)) {
          canvas.remove(object);
          layerIdToObject.delete(layerId);
          forgetObject(object);
        }
      }

      const sortedLayers = [...scene.layers].sort(
        (first, second) => first.zIndex - second.zIndex,
      );

      sortedLayers.forEach((layer, index) => {
        let object = layerIdToObject.get(layer.id);

        if (object && layer.type === "group") {
          canvas.remove(object);
          layerIdToObject.delete(layer.id);
          forgetObject(object);
          object = undefined;
        }

        if (object && !isFabricObjectForLayer(object, layer)) {
          canvas.remove(object);
          layerIdToObject.delete(layer.id);
          forgetObject(object);
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
        background: scene.backgroundColor ?? "transparent",
      }}
    >
      <canvas ref={canvasElementRef} />
    </div>
  );
}
