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
import type { AtomicLayer } from "../domain/atomicLayerSchema";
import type { GroupLayer } from "../domain/groupLayerSchema";
import type { Layer, Scene } from "../domain/sceneSchema";
import {
  MIN_TEXT_WIDTH,
  applyTextCase,
  getCharSpacing,
  getTextMeasurementOptions,
  measureNaturalTextSize,
  measureWrappedTextSize,
} from "./textMetrics";

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

class FabricImageLayerObject extends FabricObject {
  static type = "FabricImageLayer";

  declare imageSrc: string;
  declare imageStrokeColor: string | null;
  declare imageStrokeWidth: number;
  declare imageCornerRadius: number;

  private htmlImage: HTMLImageElement | null = null;
  private imageLoadFailed = false;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.imageSrc = (options.imageSrc as string | undefined) ?? "";
    this.imageStrokeColor =
      (options.imageStrokeColor as string | null | undefined) ?? null;
    this.imageStrokeWidth =
      (options.imageStrokeWidth as number | undefined) ?? 0;
    this.imageCornerRadius =
      (options.imageCornerRadius as number | undefined) ?? 0;
    this.loadImage();
  }

  private loadImage(): void {
    if (!this.imageSrc) {
      this.imageLoadFailed = true;
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      this.htmlImage = image;
      this.imageLoadFailed = false;
      this.dirty = true;
      if (this.canvas) {
        this.canvas.requestRenderAll();
      }
    };
    image.onerror = () => {
      this.htmlImage = null;
      this.imageLoadFailed = true;
      this.dirty = true;
      if (this.canvas) {
        this.canvas.requestRenderAll();
      }
    };
    image.src = this.imageSrc;
  }

  private getEffectiveCornerRadii(): CornerRadii {
    const maximum = Math.min(this.width, this.height) / 2;
    const radius = Math.max(
      0,
      Math.min(this.imageCornerRadius, maximum),
    );
    return {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    };
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    if (w <= 0 || h <= 0) {
      return;
    }

    const cornerRadii = this.getEffectiveCornerRadii();

    ctx.save();
    roundedRectanglePath(ctx, w, h, cornerRadii);
    ctx.clip();

    if (this.htmlImage) {
      ctx.drawImage(this.htmlImage, -w / 2, -h / 2, w, h);
    } else if (this.imageLoadFailed) {
      ctx.fillStyle = "#d1d5db";
      ctx.fillRect(-w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();

    if (this.imageStrokeColor && this.imageStrokeWidth > 0) {
      ctx.save();
      roundedRectanglePath(ctx, w, h, cornerRadii);
      ctx.strokeStyle = this.imageStrokeColor;
      ctx.lineWidth = this.imageStrokeWidth * 2;
      ctx.stroke();
      ctx.restore();
    }
  }
}

class FabricLayerTextbox extends Textbox {
  static type = "FabricLayerTextbox";

  declare editSourceText?: string;

  constructor(text: string, options: Record<string, unknown> = {}) {
    super(text, {
      ...options,
      dynamicMinWidth: 0,
    });
    this.editSourceText =
      (options.editSourceText as string | undefined) ?? text;
  }

  override enterEditingImpl(): void {
    if (this.editSourceText !== undefined && this.text !== this.editSourceText) {
      this.set({ text: this.editSourceText });
    }
    super.enterEditingImpl();
  }
}

classRegistry.setClass(FabricArrowObject);
classRegistry.setClass(FabricRoundedRectangleObject);
classRegistry.setClass(FabricEllipseObject);
classRegistry.setClass(FabricRoundedTriangleObject);
classRegistry.setClass(FabricLayerTextbox);
classRegistry.setClass(FabricImageLayerObject);

interface FabricSceneCanvasProps {
  scene: Scene;
  projectId: string;
  projectWidth: number;
  projectHeight: number;
  displayScale?: number;
  onSceneChange: (scene: Scene) => void;
  onSelectedLayerIdsChange: (layerIds: string[]) => void;
  onHoveredLayerIdChange: (layerId: string | null) => void;
  onContextMenuRequest: (x: number, y: number) => void;
  selectedLayerIds: readonly string[];
  pendingTextEditLayerId?: string | null;
  onPendingTextEditConsumed?: () => void;
  onTextLayerChange?: (
    layerId: string,
    text: string,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
}

function buildAssetUrl(projectId: string, src: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/${src}`;
}

function roundNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

const SCALE_PRECISION = 10000;
const MIN_SCALE = 1 / SCALE_PRECISION;

function roundScale(value: number): number {
  return Math.round(value * SCALE_PRECISION) / SCALE_PRECISION;
}

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, roundScale(value));
}

function findLayerByIdOrChild(scene: Scene, layerId: string): Layer | null {
  for (const layer of scene.layers) {
    if (layer.id === layerId) return layer;
    if (layer.type === "group") {
      const child = layer.children.find(
        (candidate) => candidate.id === layerId,
      );
      if (child) return child;
    }
  }
  return null;
}

function findParentGroupLayer(
  scene: Scene,
  layerId: string,
): GroupLayer | null {
  for (const layer of scene.layers) {
    if (
      layer.type === "group" &&
      layer.children.some((candidate) => candidate.id === layerId)
    ) {
      return layer;
    }
  }
  return null;
}

function sortChildrenByZIndex(
  children: readonly AtomicLayer[],
): AtomicLayer[] {
  return [...children].sort(
    (first, second) => first.zIndex - second.zIndex,
  );
}

function getChildLayerPositionFromObject(
  groupLayer: GroupLayer,
  childWidth: number,
  childHeight: number,
  childObject: FabricObject,
): { x: number; y: number } {
  const centerX = childObject.left ?? 0;
  const centerY = childObject.top ?? 0;
  return {
    x: roundNumber(centerX + groupLayer.width / 2 - childWidth / 2),
    y: roundNumber(centerY + groupLayer.height / 2 - childHeight / 2),
  };
}

function fabricChildrenMatch(
  fabricChildren: readonly FabricObject[],
  sceneChildren: readonly AtomicLayer[],
  objectToLayerId: ReadonlyMap<FabricObject, string>,
): boolean {
  return (
    fabricChildren.length === sceneChildren.length &&
    fabricChildren.every(
      (childObject, index) =>
        objectToLayerId.get(childObject) === sceneChildren[index].id,
    )
  );
}

function readTransformFromObject(
  obj: FabricObject,
  baseWidth: number,
  baseHeight: number,
): {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
} {
  const centerX = obj.left ?? 0;
  const centerY = obj.top ?? 0;
  const scaleX = clampScale(Math.abs(obj.scaleX ?? 1));
  const scaleY = clampScale(Math.abs(obj.scaleY ?? 1));
  const rotation = obj.angle ?? 0;

  return {
    x: roundNumber(centerX - baseWidth / 2),
    y: roundNumber(centerY - baseHeight / 2),
    scaleX,
    scaleY,
    rotation: roundNumber(rotation),
  };
}

function updateLayerFromFabricObject(
  layer: Layer,
  object: FabricObject,
): Layer {
  if (layer.type === "group" && object instanceof FabricGroup) {
    const objectScaleX = Math.abs(object.scaleX ?? 1);
    const objectScaleY = Math.abs(object.scaleY ?? 1);
    const rawScale =
      Math.abs(objectScaleX - layer.scaleX) >=
      Math.abs(objectScaleY - layer.scaleY)
        ? objectScaleX
        : objectScaleY;
    const scale = clampScale(rawScale);
    object.set({ scaleX: scale, scaleY: scale });
    object.setCoords();
    return {
      ...layer,
      x: roundNumber((object.left ?? 0) - layer.width / 2),
      y: roundNumber((object.top ?? 0) - layer.height / 2),
      scaleX: scale,
      scaleY: scale,
      rotation: roundNumber(object.angle ?? 0),
    };
  }

  if (layer.type === "text" && object instanceof FabricLayerTextbox) {
    const textWidth = Math.max(
      MIN_TEXT_WIDTH,
      roundNumber(object.width ?? 0),
    );
    const textHeight = Math.max(1, roundNumber(object.height ?? 0));
    const transform = readTransformFromObject(
      object,
      textWidth,
      textHeight,
    );
    return {
      ...layer,
      width: textWidth,
      height: textHeight,
      ...transform,
    };
  }

  const transform = readTransformFromObject(
    object,
    layer.width,
    layer.height,
  );
  return {
    ...layer,
    ...transform,
  };
}

function updateChildLayerFromFabricObject(
  groupLayer: GroupLayer,
  childLayer: AtomicLayer,
  childObject: FabricObject,
): AtomicLayer {
  const childWidth =
    childLayer.type === "text"
      ? Math.max(MIN_TEXT_WIDTH, roundNumber(childObject.width ?? 0))
      : childLayer.width;
  const childHeight =
    childLayer.type === "text"
      ? Math.max(1, roundNumber(childObject.height ?? 0))
      : childLayer.height;
  const position = getChildLayerPositionFromObject(
    groupLayer,
    childWidth,
    childHeight,
    childObject,
  );
  return {
    ...childLayer,
    ...(childLayer.type === "text"
      ? { width: childWidth, height: childHeight }
      : {}),
    x: position.x,
    y: position.y,
    scaleX: clampScale(Math.abs(childObject.scaleX ?? 1)),
    scaleY: clampScale(Math.abs(childObject.scaleY ?? 1)),
    rotation: roundNumber(childObject.angle ?? 0),
  };
}

function applyLayerToFabricObject(
  object: FabricObject,
  layer: Layer,
  groupLayer?: GroupLayer,
): void {
  const isChild = groupLayer !== undefined;
  const isLocked = layer.locked || (isChild ? groupLayer!.locked : false);

  object.set({
    borderColor: "#7147e8",
    borderScaleFactor: 2,
    cornerColor: "#ffffff",
    cornerSize: 9,
    cornerStrokeColor: "#7147e8",
    cornerStyle: "rect",
    transparentCorners: false,
    hoverCursor: isLocked ? "default" : "pointer",
    moveCursor: "move",
  });

  if (layer.type === "group" && object instanceof FabricGroup) {
    object.set({
      left: layer.x + layer.width / 2,
      top: layer.y + layer.height / 2,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      angle: layer.rotation,
      opacity: layer.opacityEnabled ? layer.opacity : 1,
      visible: layer.visible,
      selectable: !isLocked,
      evented: !isLocked,
      subTargetCheck: true,
      interactive: true,
    });
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    object.dirty = true;
    object.setCoords();
    return;
  }

  const left = isChild
    ? (layer as AtomicLayer).x +
      layer.width / 2 -
      (groupLayer as GroupLayer).width / 2
    : layer.x + layer.width / 2;
  const top = isChild
    ? (layer as AtomicLayer).y +
      layer.height / 2 -
      (groupLayer as GroupLayer).height / 2
    : layer.y + layer.height / 2;

  object.set({
    left,
    top,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    angle: layer.rotation,
    opacity: layer.opacityEnabled ? layer.opacity : 1,
    globalCompositeOperation:
      layer.blendMode === "normal" ? "source-over" : layer.blendMode,
    visible: layer.visible,
    selectable: !isLocked,
    evented: !isLocked,
    activeOn: isChild ? "up" : "down",
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
      width: layer.width,
      height: layer.height,
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
      width: layer.width,
      height: layer.height,
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
      width: layer.width,
      height: layer.height,
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
      width: layer.width,
      height: layer.height,
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

  if (layer.type === "text" && object instanceof FabricLayerTextbox) {
    const displayText = object.isEditing
      ? (object.text ?? layer.text)
      : applyTextCase(layer.text, layer.textCase);

    object.editSourceText = layer.text;

    if (object.text !== displayText) {
      object.set({ text: displayText });
    }

    object.set({
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      fontStyle: layer.fontStyle,
      lineHeight: layer.lineHeight,
      charSpacing: getCharSpacing(layer.fontSize, layer.letterSpacing),
      textAlign: layer.textAlign,
      fill: layer.fillEnabled ? layer.fill : "transparent",
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth,
      paintFirst: layer.stroke && layer.strokeWidth > 0 ? "stroke" : "fill",
      editable: !layer.locked,
    });

    object.set({
      width: layer.width,
      height: layer.height,
    });

    object.dirty = true;
    object.setCoords();
  }

  if (layer.type === "image" && object instanceof FabricImageLayerObject) {
    if (object.imageSrc !== layer.src) {
      object.set({ imageSrc: layer.src });
    }
    object.set({
      width: layer.width,
      height: layer.height,
      imageStrokeColor: layer.stroke,
      imageStrokeWidth: layer.strokeWidth,
      imageCornerRadius: layer.cornerRadius,
    });
    object.dirty = true;
    object.setCoords();
  }
}

function createFabricObjectForLayer(
  layer: Layer,
  projectId: string,
): FabricObject {
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
      object = new FabricLayerTextbox(layer.text, {
        originX: "center",
        originY: "center",
        editSourceText: layer.text,
      });
      break;
    case "arrow":
      object = new FabricArrowObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      });
      break;
    case "image":
      object = new FabricImageLayerObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
        imageSrc: buildAssetUrl(projectId, layer.src),
      });
      break;
    case "group": {
      const sortedChildren = sortChildrenByZIndex(layer.children);
      const childObjects = sortedChildren.map((child) =>
        createFabricObjectForLayer(child, projectId),
      );
      const group = new FabricGroup(childObjects, {
        originX: "center",
        originY: "center",
        width: layer.width,
        height: layer.height,
        layoutManager: new LayoutManager(new FixedLayout()),
        objectCaching: false,
      });
      group.getObjects().forEach((childObject, index) => {
        const child = sortedChildren[index];
        applyLayerToFabricObject(childObject, child, layer);
      });
      object = group;
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
      return object instanceof FabricLayerTextbox;
    case "arrow":
      return object instanceof FabricArrowObject;
    case "image":
      return object instanceof FabricImageLayerObject;
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
  projectId,
  projectWidth,
  projectHeight,
  displayScale = 0.5,
  onSceneChange,
  onSelectedLayerIdsChange,
  onHoveredLayerIdChange,
  onContextMenuRequest,
  selectedLayerIds,
  pendingTextEditLayerId,
  onPendingTextEditConsumed,
  onTextLayerChange,
}: FabricSceneCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const objectToLayerIdRef = useRef<Map<FabricObject, string>>(new Map());
  const hoveredObjectRef = useRef<FabricObject | null>(null);
  const sceneRef = useRef<Scene>(scene);
  const projectIdRef = useRef<string>(projectId);
  const contextMenuRequestRef = useRef(onContextMenuRequest);
  const isApplyingSelectionRef = useRef(false);
  const pendingTextEditRef = useRef<string | null>(null);
  const selectedLayerIdsRef = useRef<readonly string[]>(selectedLayerIds);
  const onPendingTextEditConsumedRef = useRef<
    (() => void) | undefined
  >(undefined);
  const onTextLayerChangeRef = useRef<
    ((layerId: string, text: string, width: number, height: number) => void) |
      undefined
  >(undefined);

  selectedLayerIdsRef.current = selectedLayerIds;

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    contextMenuRequestRef.current = onContextMenuRequest;
  }, [onContextMenuRequest]);

  useEffect(() => {
    pendingTextEditRef.current = pendingTextEditLayerId ?? null;
  }, [pendingTextEditLayerId]);

  useEffect(() => {
    onPendingTextEditConsumedRef.current = () => {
      onPendingTextEditConsumed?.();
    };
  }, [onPendingTextEditConsumed]);

  useEffect(() => {
    onTextLayerChangeRef.current = onTextLayerChange;
  }, [onTextLayerChange]);

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
          if (layer.type === "group") {
            const groupObject = objectByLayerId.get(layer.id);
            const nextGroup = groupObject
              ? updateLayerFromFabricObject(layer, groupObject)
              : layer;
            if (nextGroup.type !== "group") return nextGroup;
            let childChanged = false;
            const children = nextGroup.children.map((child) => {
              const childObject = objectByLayerId.get(child.id);
              if (!childObject) return child;
              childChanged = true;
              return updateChildLayerFromFabricObject(
                nextGroup,
                child,
                childObject,
              );
            });
            return childChanged ? { ...nextGroup, children } : nextGroup;
          }
          const object = objectByLayerId.get(layer.id);
          return object ? updateLayerFromFabricObject(layer, object) : layer;
        }),
      };

      sceneRef.current = updatedScene;
      onSceneChange(updatedScene);
    },
    [onSceneChange],
  );

  const registerTextEvents = useCallback(
    (canvas: Canvas, object: FabricObject): void => {
      if (!(object instanceof FabricLayerTextbox)) return;

      object.on("editing:exited", () => {
        const layerId = objectToLayerIdRef.current.get(object);
        if (!layerId) return;
        const currentScene = sceneRef.current;
        const layer = findLayerByIdOrChild(currentScene, layerId);
        const parentGroup = findParentGroupLayer(currentScene, layerId);
        if (layer) {
          applyLayerToFabricObject(
            object,
            layer,
            parentGroup ?? undefined,
          );
          object.setCoords();
          canvas.requestRenderAll();
        }
      });

      object.on("editing:entered", () => {
        const layerId = objectToLayerIdRef.current.get(object);
        if (!layerId) return;
        const currentScene = sceneRef.current;
        const layer = findLayerByIdOrChild(currentScene, layerId);
        if (!layer || layer.type !== "text") return;

        object.editSourceText = layer.text;
        if (object.text !== layer.text) {
          object.set({ text: layer.text });
        }
        if (object.hiddenTextarea && object.hiddenTextarea.value !== layer.text) {
          object.hiddenTextarea.value = layer.text;
          object.selectionStart = object.selectionEnd = layer.text.length;
          object._updateTextarea();
        }
      });
    },
    [],
  );

  const addFabricObject = useCallback(
    (canvas: Canvas, layer: Layer): FabricObject => {
      const object = createFabricObjectForLayer(layer, projectIdRef.current);
      layerIdToObjectRef.current.set(layer.id, object);
      objectToLayerIdRef.current.set(object, layer.id);

      if (layer.type === "group" && object instanceof FabricGroup) {
        const sortedChildren = sortChildrenByZIndex(layer.children);
        object.getObjects().forEach((childObject, index) => {
          const child = sortedChildren[index];
          if (child) {
            layerIdToObjectRef.current.set(child.id, childObject);
            objectToLayerIdRef.current.set(childObject, child.id);
          }
        });
      }

      canvas.add(object);

      registerTextEvents(canvas, object);
      if (object instanceof FabricGroup) {
        object.getObjects().forEach((childObject) => {
          registerTextEvents(canvas, childObject);
        });
      }

      return object;
    },
    [registerTextEvents],
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
      if (isApplyingSelectionRef.current || promoteGroupId !== null) {
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

        const spaces = new Set(
          selectedObjects.map((object) => {
            const parent = object.parent;
            if (parent instanceof FabricGroup) {
              return objectToLayerIdRef.current.get(parent) ?? "scene";
            }
            return "scene";
          }),
        );

        queueMicrotask(() => {
          isApplyingSelectionRef.current = true;

          try {
            canvas.discardActiveObject();

            if (spaces.size > 1) {
              const currentScene = sceneRef.current;
              for (const selectedObject of selectedObjects) {
                const layerId = objectToLayerIdRef.current.get(selectedObject);
                if (!layerId) continue;
                const layer = findLayerByIdOrChild(currentScene, layerId);
                const parentGroup = findParentGroupLayer(currentScene, layerId);
                if (layer) {
                  applyLayerToFabricObject(
                    selectedObject,
                    layer,
                    parentGroup ?? undefined,
                  );
                }
              }
            } else {
              syncObjectsToScene(selectedObjects);
            }

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
    canvas.on("mouse:over", (event) => {
      const target = event.target;
      if (!target || target === hoveredObjectRef.current) return;

      hoveredObjectRef.current = target;
      onHoveredLayerIdChange(objectToLayerIdRef.current.get(target) ?? null);
      canvas.requestRenderAll();
    });
    canvas.on("mouse:out", (event) => {
      if (event.target !== hoveredObjectRef.current) return;

      hoveredObjectRef.current = null;
      onHoveredLayerIdChange(null);
      canvas.requestRenderAll();
    });
    canvas.on("after:render", ({ ctx }) => {
      const hoveredObject = hoveredObjectRef.current;
      if (
        !hoveredObject ||
        !hoveredObject.visible ||
        canvas.getActiveObjects().includes(hoveredObject)
      ) {
        return;
      }

      hoveredObject._renderControls(ctx, {
        borderColor: "#7147e8",
        hasBorders: true,
        hasControls: false,
      });
    });
    canvas.on("mouse:dblclick", (event) => {
      const selectedObject =
        selectedLayerIdsRef.current.length === 1
          ? layerIdToObjectRef.current.get(selectedLayerIdsRef.current[0])
          : undefined;
      const selectedChildWasHit =
        selectedObject?.parent instanceof FabricGroup &&
        selectedObject.containsPoint(event.scenePoint);
      const childObject = selectedChildWasHit
        ? selectedObject
        : [...(event.subTargets ?? []), event.target]
            .reverse()
            .find((candidate) => candidate?.parent instanceof FabricGroup);
      if (!childObject) return;
      const childId = objectToLayerIdRef.current.get(childObject);
      const child = childId
        ? findLayerByIdOrChild(sceneRef.current, childId)
        : undefined;
      if (!child || child.locked) return;
      canvas.setActiveObject(childObject);
      onSelectedLayerIdsChange([child.id]);
      if (childObject instanceof FabricLayerTextbox) {
        childObject.enterEditing();
        childObject.selectAll();
      }
      canvas.requestRenderAll();
    });

    let promoteGroupId: string | null = null;
    canvas.on("mouse:down:before", (event) => {
      const target = event.target;
      if (!target || target === canvas.getActiveObject()) {
        promoteGroupId = null;
        return;
      }
      const targetId = objectToLayerIdRef.current.get(target);
      if (targetId && selectedLayerIdsRef.current.includes(targetId)) {
        promoteGroupId = null;
        return;
      }
      const parent = target.parent;
      promoteGroupId =
        parent instanceof FabricGroup
          ? objectToLayerIdRef.current.get(parent) ?? null
          : null;
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
        return;
      }
      if (promoteGroupId) {
        const groupObject = layerIdToObjectRef.current.get(promoteGroupId);
        if (groupObject) {
          canvas.setActiveObject(groupObject);
          onSelectedLayerIdsChange([promoteGroupId]);
          canvas._currentTransform = null;
          canvas._setupCurrentTransform(pointerEvent, groupObject, false);
          canvas.requestRenderAll();
        }
      }
    });
    canvas.on("mouse:up", () => {
      if (!promoteGroupId) {
        return;
      }
      const groupId = promoteGroupId;
      const groupObject = layerIdToObjectRef.current.get(groupId);
      const activeObject = canvas.getActiveObject();
      if (
        activeObject &&
        activeObject.parent instanceof FabricGroup &&
        groupObject
      ) {
        canvas.setActiveObject(groupObject);
        onSelectedLayerIdsChange([groupId]);
        canvas.requestRenderAll();
      }
      promoteGroupId = null;
    });

    canvas.on("text:changed", (event) => {
      const target = event.target;
      if (!(target instanceof FabricLayerTextbox)) return;
      if (!target.isEditing) return;
      const layerId = objectToLayerIdRef.current.get(target);
      if (!layerId) return;

      const textLayer = findLayerByIdOrChild(
        sceneRef.current,
        layerId,
      );
      if (!textLayer || textLayer.type !== "text") return;

      const newText = target.text ?? textLayer.text;
      target.editSourceText = newText;
      const displayText = applyTextCase(newText, textLayer.textCase);
      const opts = getTextMeasurementOptions(textLayer);
      let nextWidth: number;
      let nextHeight: number;

      switch (textLayer.autoResize) {
        case "both": {
          const measured = measureNaturalTextSize(displayText, opts);
          nextWidth = measured.width;
          nextHeight = measured.height;
          break;
        }
        case "height": {
          nextWidth = textLayer.width;
          const measured = measureNaturalTextSize(displayText, opts);
          const wrapped = measureWrappedTextSize(displayText, opts, textLayer.width);
          if (wrapped.height > measured.height) {
            nextHeight = wrapped.height;
          } else {
            nextHeight = measured.height;
          }
          break;
        }
        case "fixed":
          nextWidth = textLayer.width;
          nextHeight = textLayer.height;
          break;
      }

      target.set({ width: nextWidth, height: nextHeight });
      target.setCoords();

      onTextLayerChangeRef.current?.(layerId, newText, nextWidth, nextHeight);
    });

    canvas.requestRenderAll();

    return () => {
      hoveredObjectRef.current = null;
      onHoveredLayerIdChange(null);
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
    onHoveredLayerIdChange,
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
    const desiredLayerIds = new Set<string>();
    for (const layer of scene.layers) {
      desiredLayerIds.add(layer.id);
      if (layer.type === "group") {
        layer.children.forEach((child) => desiredLayerIds.add(child.id));
      }
    }
    const forgetObject = (object: FabricObject): void => {
      const childIds: string[] = [];
      if (object instanceof FabricGroup) {
        object.getObjects().forEach((child) => {
          const id = objectToLayerId.get(child);
          if (id) childIds.push(id);
          objectToLayerId.delete(child);
        });
      }
      objectToLayerId.delete(object);
      childIds.forEach((id) => layerIdToObject.delete(id));
    };
    const removeAndForget = (object: FabricObject): void => {
      canvas.remove(object);
      const id = objectToLayerId.get(object) ?? "";
      if (id) layerIdToObject.delete(id);
      forgetObject(object);
    };
    isApplyingSelectionRef.current = true;

    try {
      const activeObject = canvas.getActiveObject();
      const editingObject =
        activeObject instanceof FabricLayerTextbox && activeObject.isEditing
          ? activeObject
          : null;
      if (!editingObject) {
        canvas.discardActiveObject();
      }
      canvas.backgroundColor = scene.backgroundColor ?? "transparent";

      for (const [layerId, object] of layerIdToObject) {
        if (!desiredLayerIds.has(layerId)) {
          removeAndForget(object);
        }
      }

      const sortedLayers = [...scene.layers].sort(
        (first, second) => first.zIndex - second.zIndex,
      );

      sortedLayers.forEach((layer, index) => {
        let object = layerIdToObject.get(layer.id);

        if (object && !isFabricObjectForLayer(object, layer)) {
          removeAndForget(object);
          object = undefined;
        }

        if (
          object &&
          layer.type === "group" &&
          object instanceof FabricGroup
        ) {
          const sortedChildren = sortChildrenByZIndex(layer.children);
          if (
            !fabricChildrenMatch(
              object.getObjects(),
              sortedChildren,
              objectToLayerId,
            )
          ) {
            removeAndForget(object);
            object = undefined;
          }
        }

        if (!object) {
          object = addFabricObject(canvas, layer);
        } else if (
          layer.type === "group" &&
          object instanceof FabricGroup
        ) {
          applyLayerToFabricObject(object, layer);
          const sortedChildren = sortChildrenByZIndex(layer.children);
          object.getObjects().forEach((childObject, childIndex) => {
            const child = sortedChildren[childIndex];
            if (childObject === editingObject) {
              const selStart = editingObject.selectionStart;
              const selEnd = editingObject.selectionEnd;
              applyLayerToFabricObject(childObject, child, layer);
              editingObject.selectionStart = selStart;
              editingObject.selectionEnd = selEnd;
              if (editingObject.hiddenTextarea) {
                editingObject._updateTextarea();
              }
            } else {
              applyLayerToFabricObject(childObject, child, layer);
            }
          });
          object.setCoords();
        } else if (object === editingObject) {
          const selStart = editingObject.selectionStart;
          const selEnd = editingObject.selectionEnd;
          applyLayerToFabricObject(object, layer);
          editingObject.selectionStart = selStart;
          editingObject.selectionEnd = selEnd;
          if (editingObject.hiddenTextarea) {
            editingObject._updateTextarea();
          }
        } else {
          applyLayerToFabricObject(object, layer);
        }

        canvas.moveObjectTo(object, index);
      });

      if (!editingObject) {
        applySelectionToCanvas(canvas, selectedLayerIds, layerIdToObject);
      }

      const pendingId = pendingTextEditRef.current;
      if (pendingId) {
        const target = layerIdToObject.get(pendingId);
        if (
          target instanceof FabricLayerTextbox &&
          !target.isEditing &&
          target.editable
        ) {
          canvas.setActiveObject(target);
          target.enterEditing();
          target.selectAll();
        }
        pendingTextEditRef.current = null;
        onPendingTextEditConsumedRef.current?.();
      }

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
