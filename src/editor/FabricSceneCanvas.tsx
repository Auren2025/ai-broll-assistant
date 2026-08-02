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
import { scaleGroupChildren } from "../domain/groupOperations";
import type { Layer, Scene } from "../domain/sceneSchema";
import {
  MIN_TEXT_WIDTH,
  applyTextCase,
  computeTextBoxSize,
  getCharSpacing,
} from "./textMetrics";
import { computeSnapGuides, type SnapResult } from "./snapGuides";

type CornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

// Snap-to-alignment guides while dragging. The distances are defined in screen
// pixels and divided by the current viewport scale so the snap feels identical
// at every zoom level (the mature Fabric guideline approach).
const SNAP_MARGIN_SCREEN = 3;
const SNAP_HYSTERESIS_SCREEN = 1;
const SNAP_GUIDE_COLOR = "#ff4d5e";
const SPACING_GUIDE_COLOR = "#2b9bff";
// Drag motion below this many scene units per frame is treated as
// "intentional alignment" — snap engages freely. Above it, snap is held at
// arm's length so fast sweeps don't get yanked into candidates they pass
// through.
const DRAG_MOTION_AXIS_FLOOR = 1.5;

interface SnapGuides {
  vertical: number | null;
  horizontal: number | null;
  spacingX: {
    from: number;
    to: number;
    gap: number;
    anchor: number;
  } | null;
  spacingY: {
    from: number;
    to: number;
    gap: number;
    anchor: number;
  } | null;
  gapX: {
    value: number;
    side: "left" | "right" | "top" | "bottom";
    from: number;
    to: number;
    anchor: number;
  } | null;
  gapY: {
    value: number;
    side: "left" | "right" | "top" | "bottom";
    from: number;
    to: number;
    anchor: number;
  } | null;
}

interface HeldSnap {
  vertical: number | null;
  horizontal: number | null;
  spacingX: { from: number; to: number } | null;
  spacingY: { from: number; to: number } | null;
  gapX: { value: number; side: "left" | "right" | "top" | "bottom" } | null;
  gapY: { value: number; side: "left" | "right" | "top" | "bottom" } | null;
}

function drawGuideLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  fontSize: number,
): void {
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  const width = ctx.measureText(text).width;
  const padX = fontSize * 0.25;
  const height = fontSize * 1.2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillRect(x - width / 2 - padX, y - height / 2, width + padX * 2, height);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/**
 * Filter snap candidates down to the single closest non-dragged object on
 * each axis (plus canvas edges), suppressing snap-to-everything noise when
 * the scene has many layers. Returns the original list when the closest
 * object cannot be determined.
 */
function nearestObjectRects(
  dragged: { left: number; top: number; width: number; height: number },
  others: readonly { rect: { left: number; top: number; width: number; height: number } }[],
): { left: number; top: number; width: number; height: number }[] {
  let bestX: { rect: { left: number; top: number; width: number; height: number }; distance: number } | null = null;
  let bestY: { rect: { left: number; top: number; width: number; height: number }; distance: number } | null = null;
  const draggedCx = dragged.left + dragged.width / 2;
  const draggedCy = dragged.top + dragged.height / 2;
  for (const { rect } of others) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.abs(cx - draggedCx);
    const dy = Math.abs(cy - draggedCy);
    if (!bestX || dx < bestX.distance) bestX = { rect, distance: dx };
    if (!bestY || dy < bestY.distance) bestY = { rect, distance: dy };
  }
  const out: { left: number; top: number; width: number; height: number }[] = [];
  if (bestX) out.push(bestX.rect);
  if (bestY && bestY.rect !== bestX?.rect) out.push(bestY.rect);
  return out;
}

/**
 * Zero out snap deltas/guides on axes where the dragged object isn't
 * actually moving this frame. This stops the dragged from getting yanked
 * sideways (or vertically) when the user is mid-sweep on the other axis,
 * which is the dominant source of "snap feels like it grabs me" feedback.
 */
function applyAxisPreference(
  snap: SnapResult,
  dragDelta: { x: number; y: number },
  floor: number,
): SnapResult {
  const suppressX = Math.abs(dragDelta.x) < floor;
  const suppressY = Math.abs(dragDelta.y) < floor;
  return {
    x: suppressX
      ? { delta: 0, alignGuide: null, spacing: null, gap: null }
      : snap.x,
    y: suppressY
      ? { delta: 0, alignGuide: null, spacing: null, gap: null }
      : snap.y,
  };
}

function emptyHeldSnap(): HeldSnap {
  return {
    vertical: null,
    horizontal: null,
    spacingX: null,
    spacingY: null,
    gapX: null,
    gapY: null,
  };
}

function updateHeldSnap(
  heldRef: { current: HeldSnap },
  snap: SnapResult,
): void {
  // Reset held state on any axis where no snap engaged this frame. Snap is
  // intentionally non-sticky: once the dragged object leaves the snap range,
  // we don't carry over the previous guide. The engine's own hysteresis (via
  // threshold + hysteresis distance) still bridges the small jitter window
  // when a snap IS engaging — we only drop the lock when nothing is engaging.
  heldRef.current = {
    vertical: snap.x.alignGuide,
    horizontal: snap.y.alignGuide,
    spacingX: snap.x.spacing
      ? { from: snap.x.spacing.from, to: snap.x.spacing.to }
      : null,
    spacingY: snap.y.spacing
      ? { from: snap.y.spacing.from, to: snap.y.spacing.to }
      : null,
    gapX: snap.x.gap
      ? { value: snap.x.gap.value, side: snap.x.gap.side as "left" | "right" }
      : null,
    gapY: snap.y.gap
      ? { value: snap.y.gap.value, side: snap.y.gap.side as "top" | "bottom" }
      : null,
  };
}

function guidesFromSnap(snap: SnapResult): SnapGuides {
  return {
    vertical: snap.x.alignGuide,
    horizontal: snap.y.alignGuide,
    spacingX: snap.x.spacing,
    spacingY: snap.y.spacing,
    gapX: snap.x.gap,
    gapY: snap.y.gap,
  };
}

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

  setImageSource(src: string): void {
    if (this.imageSrc === src) {
      return;
    }
    this.imageSrc = src;
    this.imageLoadFailed = false;
    this.htmlImage = null;
    this.loadImage();
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
  zoom?: number;
  zoomCursorRef?: { current: { x: number; y: number } | null };
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

function readVisibleWidth(obj: FabricObject, minWidth = 1): number {
  return Math.max(
    minWidth,
    roundNumber((obj.width ?? 0) * Math.abs(obj.scaleX ?? 1)),
  );
}

function readVisibleHeight(obj: FabricObject, minHeight = 1): number {
  return Math.max(
    minHeight,
    roundNumber((obj.height ?? 0) * Math.abs(obj.scaleY ?? 1)),
  );
}

function updateLayerFromFabricObject(
  layer: Layer,
  object: FabricObject,
): Layer {
  if (layer.type === "group" && object instanceof FabricGroup) {
    const scaleX = Math.abs(object.scaleX ?? 1);
    const scaleY = Math.abs(object.scaleY ?? 1);
    const rescaled = scaleGroupChildren(layer, scaleX, scaleY);
    object.set({
      scaleX: 1,
      scaleY: 1,
      width: rescaled.width,
      height: rescaled.height,
    });
    object.setCoords();
    return {
      ...rescaled,
      x: roundNumber((object.left ?? 0) - rescaled.width / 2),
      y: roundNumber((object.top ?? 0) - rescaled.height / 2),
      rotation: roundNumber(object.angle ?? 0),
    };
  }

  const isText = layer.type === "text";
  const minWidth = isText ? MIN_TEXT_WIDTH : 1;
  const minHeight = isText ? 1 : 1;
  const width = readVisibleWidth(object, minWidth);
  const height = readVisibleHeight(object, minHeight);
  object.set({ scaleX: 1, scaleY: 1 });
  object.setCoords();

  return {
    ...layer,
    x: roundNumber((object.left ?? 0) - width / 2),
    y: roundNumber((object.top ?? 0) - height / 2),
    width,
    height,
    rotation: roundNumber(object.angle ?? 0),
  };
}

function updateChildLayerFromFabricObject(
  groupLayer: GroupLayer,
  childLayer: AtomicLayer,
  childObject: FabricObject,
): AtomicLayer {
  const isText = childLayer.type === "text";
  const width = readVisibleWidth(childObject, isText ? MIN_TEXT_WIDTH : 1);
  const height = readVisibleHeight(childObject);
  const position = getChildLayerPositionFromObject(
    groupLayer,
    width,
    height,
    childObject,
  );
  childObject.set({ scaleX: 1, scaleY: 1 });
  childObject.setCoords();
  return {
    ...childLayer,
    width,
    height,
    x: position.x,
    y: position.y,
    rotation: roundNumber(childObject.angle ?? 0),
  };
}

function applyLayerToFabricObject(
  object: FabricObject,
  layer: Layer,
  groupLayer: GroupLayer | undefined,
  projectId: string,
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
      width: layer.width,
      height: layer.height,
      scaleX: 1,
      scaleY: 1,
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
    scaleX: 1,
    scaleY: 1,
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
    object.setImageSource(buildAssetUrl(projectId, layer.src));
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
        applyLayerToFabricObject(childObject, child, layer, projectId);
      });
      object = group;
      break;
    }
  }

  applyLayerToFabricObject(object, layer, undefined, projectId);
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
  zoom = 1,
  zoomCursorRef,
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
  const snapGuidesRef = useRef<SnapGuides | null>(null);
  const heldSnapRef = useRef<HeldSnap>(emptyHeldSnap());
  // Last dragged bounding rect used to measure per-frame motion for axis
  // preference (only snap the axes the user is actually moving). We store
  // both position (left/top) for move drags and size (width/height) for
  // resize drags as separate axis signals on {x, y}.
  const lastDragRectRef = useRef<{ x: number; y: number } | null>(null);
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
            projectIdRef.current,
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
      heldSnapRef.current = emptyHeldSnap();
      lastDragRectRef.current = null;
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
                    projectIdRef.current,
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

    canvas.on("object:moving", (event) => {
      const target = event.target;
      if (!target) {
        snapGuidesRef.current = null;
        heldSnapRef.current = emptyHeldSnap();
        return;
      }
      if (target instanceof FabricLayerTextbox && target.isEditing) {
        snapGuidesRef.current = null;
        heldSnapRef.current = emptyHeldSnap();
        return;
      }
      // Hold Option/Alt while dragging to move freely without snapping.
      if (event.e.altKey) {
        snapGuidesRef.current = null;
        heldSnapRef.current = emptyHeldSnap();
        return;
      }

      const activeObjects = canvas.getActiveObjects();
      const activeSet = new Set<FabricObject>(activeObjects);
      const viewScale = canvas.viewportTransform[0];

      // Group child snapping: work in group-local coords (center-origin).
      // Restricted to axis-aligned groups so scene-space delta equals
      // local-space delta. Rotated groups skip snapping entirely (same as
      // before this change).
      if (target.parent instanceof FabricGroup) {
        const group = target.parent;
        const angle = Math.abs(group.angle ?? 0);
        const scaleX = Math.abs(group.scaleX ?? 1);
        const scaleY = Math.abs(group.scaleY ?? 1);
        if (angle > 1e-3 || Math.abs(scaleX - 1) > 1e-3 || Math.abs(scaleY - 1) > 1e-3) {
          snapGuidesRef.current = null;
          heldSnapRef.current = emptyHeldSnap();
          return;
        }
        const halfW = (group.width ?? 0) / 2;
        const halfH = (group.height ?? 0) / 2;
        const childHalfW = (target.width ?? 0) / 2;
        const childHalfH = (target.height ?? 0) / 2;
        const localLeft = (target.left ?? 0) - childHalfW;
        const localTop = (target.top ?? 0) - childHalfH;
        const draggedLocal = {
          left: localLeft,
          top: localTop,
          width: target.width ?? 0,
          height: target.height ?? 0,
        };
        const candidateX = [-halfW, 0, halfW];
        const candidateY = [-halfH, 0, halfH];
        const otherBoundsX: { start: number; end: number }[] = [];
        const otherBoundsY: { start: number; end: number }[] = [];
        for (const sibling of group.getObjects()) {
          if (sibling === target || activeSet.has(sibling)) continue;
          if (!sibling.visible) continue;
          const sw = sibling.width ?? 0;
          const sh = sibling.height ?? 0;
          const sl = (sibling.left ?? 0) - sw / 2;
          const st = (sibling.top ?? 0) - sh / 2;
          candidateX.push(sl, sl + sw / 2, sl + sw);
          candidateY.push(st, st + sh / 2, st + sh);
          otherBoundsX.push({ start: sl, end: sl + sw });
          otherBoundsY.push({ start: st, end: st + sh });
        }
        const held = heldSnapRef.current;
        const rawSnap = computeSnapGuides(
          draggedLocal,
          candidateX,
          candidateY,
          otherBoundsX,
          otherBoundsY,
          {
            threshold: SNAP_MARGIN_SCREEN / viewScale,
            hysteresis: SNAP_HYSTERESIS_SCREEN / viewScale,
            heldVertical: held.vertical,
            heldHorizontal: held.horizontal,
            heldSpacingX: held.spacingX,
            heldSpacingY: held.spacingY,
            heldGapX: held.gapX,
            heldGapY: held.gapY,
          },
        );
        const lastDrag = lastDragRectRef.current;
        const dragDelta = lastDrag
          ? { x: localLeft - lastDrag.x, y: localTop - lastDrag.y }
          : { x: 0, y: 0 };
        lastDragRectRef.current = { x: localLeft, y: localTop };
        const snap = applyAxisPreference(rawSnap, dragDelta, DRAG_MOTION_AXIS_FLOOR / viewScale);
        if (snap.x.delta !== 0) target.set({ left: (target.left ?? 0) + snap.x.delta });
        if (snap.y.delta !== 0) target.set({ top: (target.top ?? 0) + snap.y.delta });
        target.setCoords();
        updateHeldSnap(heldSnapRef, snap);
        snapGuidesRef.current = guidesFromSnap(snap);
        canvas.requestRenderAll();
        return;
      }

      const draggedRect = target.getBoundingRect();

      // Collect candidate objects, then filter to the nearest one per axis
      // (plus canvas). This avoids snap-to-everything noise when the scene
      // has many layers.
      const otherRects: { rect: { left: number; top: number; width: number; height: number } }[] = [];
      for (const object of canvas.getObjects()) {
        if (object === target || activeSet.has(object)) continue;
        if (!object.visible) continue;
        const rect = object.getBoundingRect();
        otherRects.push({ rect });
      }
      const nearest = nearestObjectRects(draggedRect, otherRects);
      const nearestSet = new Set(nearest);

      const candidateX = [projectWidth / 2, 0, projectWidth];
      const candidateY = [projectHeight / 2, 0, projectHeight];
      const otherBoundsX: { start: number; end: number }[] = [];
      const otherBoundsY: { start: number; end: number }[] = [];
      for (const { rect } of otherRects) {
        if (!nearestSet.has(rect)) continue;
        candidateX.push(
          rect.left,
          rect.left + rect.width / 2,
          rect.left + rect.width,
        );
        candidateY.push(
          rect.top,
          rect.top + rect.height / 2,
          rect.top + rect.height,
        );
        otherBoundsX.push({ start: rect.left, end: rect.left + rect.width });
        otherBoundsY.push({ start: rect.top, end: rect.top + rect.height });
      }

      const held = heldSnapRef.current;
      const rawSnap = computeSnapGuides(
        draggedRect,
        candidateX,
        candidateY,
        otherBoundsX,
        otherBoundsY,
        {
          threshold: SNAP_MARGIN_SCREEN / viewScale,
          hysteresis: SNAP_HYSTERESIS_SCREEN / viewScale,
          heldVertical: held.vertical,
          heldHorizontal: held.horizontal,
          heldSpacingX: held.spacingX,
          heldSpacingY: held.spacingY,
          heldGapX: held.gapX,
          heldGapY: held.gapY,
        },
      );

      // Axis preference: ignore snap on axes the user isn't actively moving.
      const lastDrag = lastDragRectRef.current;
      const dragDelta = lastDrag
        ? {
            x: draggedRect.left - lastDrag.x,
            y: draggedRect.top - lastDrag.y,
          }
        : { x: 0, y: 0 };
      lastDragRectRef.current = {
        x: draggedRect.left,
        y: draggedRect.top,
      };
      const snap = applyAxisPreference(
        rawSnap,
        dragDelta,
        DRAG_MOTION_AXIS_FLOOR / viewScale,
      );

      if (snap.x.delta !== 0) target.set({ left: (target.left ?? 0) + snap.x.delta });
      if (snap.y.delta !== 0) target.set({ top: (target.top ?? 0) + snap.y.delta });
      target.setCoords();

      // Lock / rebase the drag offsets so snapped axes hold the guide and
      // released axes continue following the pointer without a jump.
      const transform = canvas._currentTransform;
      if (transform) {
        const pointer = canvas.getScenePoint(event.e);
        transform.offsetX = pointer.x - (target.left ?? 0);
        transform.offsetY = pointer.y - (target.top ?? 0);
      }

      updateHeldSnap(heldSnapRef, snap);
      snapGuidesRef.current = guidesFromSnap(snap);
      canvas.requestRenderAll();
    });

    canvas.on("object:scaling", (event) => {
      const target = event.target;
      if (!target || target.parent instanceof FabricGroup) {
        snapGuidesRef.current = null;
        heldSnapRef.current = emptyHeldSnap();
        return;
      }
      if (event.e.altKey) {
        snapGuidesRef.current = null;
        heldSnapRef.current = emptyHeldSnap();
        return;
      }

      const activeObjects = canvas.getActiveObjects();
      const activeSet = new Set<FabricObject>(activeObjects);
      const viewScale = canvas.viewportTransform[0];

      // Build candidates from the nearest non-active object only.
      const otherRects: { rect: { left: number; top: number; width: number; height: number } }[] = [];
      for (const object of canvas.getObjects()) {
        if (object === target || activeSet.has(object)) continue;
        if (!object.visible) continue;
        otherRects.push({ rect: object.getBoundingRect() });
      }
      const draggedRect = target.getBoundingRect();
      const nearest = nearestObjectRects(draggedRect, otherRects);
      const nearestSet = new Set(nearest);

      const candidateX = [projectWidth / 2, 0, projectWidth];
      const candidateY = [projectHeight / 2, 0, projectHeight];
      const otherBoundsX: { start: number; end: number }[] = [];
      const otherBoundsY: { start: number; end: number }[] = [];
      for (const { rect } of otherRects) {
        if (!nearestSet.has(rect)) continue;
        candidateX.push(
          rect.left,
          rect.left + rect.width / 2,
          rect.left + rect.width,
        );
        candidateY.push(
          rect.top,
          rect.top + rect.height / 2,
          rect.top + rect.height,
        );
        otherBoundsX.push({ start: rect.left, end: rect.left + rect.width });
        otherBoundsY.push({ start: rect.top, end: rect.top + rect.height });
      }

      const held = heldSnapRef.current;
      const rawSnap = computeSnapGuides(
        draggedRect,
        candidateX,
        candidateY,
        otherBoundsX,
        otherBoundsY,
        {
          threshold: SNAP_MARGIN_SCREEN / viewScale,
          hysteresis: SNAP_HYSTERESIS_SCREEN / viewScale,
          heldVertical: held.vertical,
          heldHorizontal: held.horizontal,
          heldSpacingX: held.spacingX,
          heldSpacingY: held.spacingY,
          heldGapX: held.gapX,
          heldGapY: held.gapY,
        },
      );
      // Axis preference for resize: only snap on axes that are actually
      // changing size this frame.
      const lastDrag = lastDragRectRef.current;
      const dragDelta = lastDrag
        ? {
            x: draggedRect.width - lastDrag.x,
            y: draggedRect.height - lastDrag.y,
          }
        : { x: 0, y: 0 };
      lastDragRectRef.current = {
        x: draggedRect.width,
        y: draggedRect.height,
      };
      const snap = applyAxisPreference(
        rawSnap,
        dragDelta,
        DRAG_MOTION_AXIS_FLOOR / viewScale,
      );

      const intrinsicWidth = target.width ?? 0;
      const intrinsicHeight = target.height ?? 0;
      if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
        canvas.requestRenderAll();
        return;
      }
      // Snap the bbox outward by adjusting scale (Fabric scales around the
      // object center by default when scaleX/Y are set). For an axis-aligned
      // resize this gives a clean edge-aligned snap even though we don't know
      // which corner the user is dragging.
      const updates: { scaleX?: number; scaleY?: number } = {};
      if (snap.x.delta !== 0) {
        const newWidth = draggedRect.width + snap.x.delta;
        if (newWidth > 0) {
          updates.scaleX = newWidth / intrinsicWidth;
        }
      }
      if (snap.y.delta !== 0) {
        const newHeight = draggedRect.height + snap.y.delta;
        if (newHeight > 0) {
          updates.scaleY = newHeight / intrinsicHeight;
        }
      }
      if (Object.keys(updates).length > 0) {
        target.set(updates);
        target.setCoords();
      }

      updateHeldSnap(heldSnapRef, snap);
      snapGuidesRef.current = guidesFromSnap(snap);
      canvas.requestRenderAll();
    });

    canvas.on("selection:created", syncSelectedLayers);
    canvas.on("selection:updated", syncSelectedLayers);
    canvas.on("selection:cleared", syncSelectedLayers);
    const resolveHoverTarget = (
      target: FabricObject | null | undefined,
    ): FabricObject | null => {
      if (!target) return null;
      const parent = target.parent;
      return parent instanceof FabricGroup ? parent : target;
    };

    canvas.on("mouse:move", (event) => {
      const hoverTarget = resolveHoverTarget(event.target);
      if (hoverTarget === hoveredObjectRef.current) return;

      hoveredObjectRef.current = hoverTarget;
      onHoveredLayerIdChange(
        hoverTarget
          ? (objectToLayerIdRef.current.get(hoverTarget) ?? null)
          : null,
      );
      canvas.requestRenderAll();
    });
    canvas.on("mouse:out", () => {
      if (!hoveredObjectRef.current) return;

      hoveredObjectRef.current = null;
      onHoveredLayerIdChange(null);
      canvas.requestRenderAll();
    });
    canvas.on("after:render", ({ ctx }) => {
      const guides = snapGuidesRef.current;
      if (guides) {
        ctx.save();
        ctx.transform(
          canvas.viewportTransform[0],
          canvas.viewportTransform[1],
          canvas.viewportTransform[2],
          canvas.viewportTransform[3],
          canvas.viewportTransform[4],
          canvas.viewportTransform[5],
        );
        const hairline = 1 / displayScale;

        if (guides.vertical !== null) {
          ctx.strokeStyle = SNAP_GUIDE_COLOR;
          ctx.lineWidth = hairline;
          ctx.setLineDash([4 / displayScale, 4 / displayScale]);
          ctx.beginPath();
          ctx.moveTo(guides.vertical, 0);
          ctx.lineTo(guides.vertical, projectHeight);
          ctx.stroke();
        }

        if (guides.horizontal !== null) {
          ctx.strokeStyle = SNAP_GUIDE_COLOR;
          ctx.lineWidth = hairline;
          ctx.setLineDash([4 / displayScale, 4 / displayScale]);
          ctx.beginPath();
          ctx.moveTo(0, guides.horizontal);
          ctx.lineTo(projectWidth, guides.horizontal);
          ctx.stroke();
        }

        const labelFont = 12 / canvas.viewportTransform[0];
        const drawSpacing = (
          from: number,
          to: number,
          anchor: number,
          gap: number,
          vertical: boolean,
        ): void => {
          ctx.strokeStyle = SPACING_GUIDE_COLOR;
          ctx.lineWidth = hairline;
          ctx.setLineDash([4 / displayScale, 4 / displayScale]);
          if (vertical) {
            ctx.beginPath();
            ctx.moveTo(anchor, from);
            ctx.lineTo(anchor, to);
            ctx.stroke();
            drawGuideLabel(
              ctx,
              anchor,
              (from + to) / 2,
              String(Math.round(gap)),
              SPACING_GUIDE_COLOR,
              labelFont,
            );
          } else {
            ctx.beginPath();
            ctx.moveTo(from, anchor);
            ctx.lineTo(to, anchor);
            ctx.stroke();
            drawGuideLabel(
              ctx,
              (from + to) / 2,
              anchor,
              String(Math.round(gap)),
              SPACING_GUIDE_COLOR,
              labelFont,
            );
          }
        };
        if (guides.spacingX) {
          drawSpacing(
            guides.spacingX.from,
            guides.spacingX.to,
            guides.spacingX.anchor,
            guides.spacingX.gap,
            false,
          );
        }
        if (guides.spacingY) {
          drawSpacing(
            guides.spacingY.from,
            guides.spacingY.to,
            guides.spacingY.anchor,
            guides.spacingY.gap,
            true,
          );
        }
        if (guides.gapX) {
          drawSpacing(
            guides.gapX.from,
            guides.gapX.to,
            guides.gapX.anchor,
            guides.gapX.value,
            false,
          );
        }
        if (guides.gapY) {
          drawSpacing(
            guides.gapY.from,
            guides.gapY.to,
            guides.gapY.anchor,
            guides.gapY.value,
            true,
          );
        }

        ctx.restore();
      }

      const hoveredObject = hoveredObjectRef.current;
      if (
        !hoveredObject ||
        !hoveredObject.visible ||
        !canvas.getObjects().includes(hoveredObject) ||
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
    canvas.on("mouse:up", () => {
      heldSnapRef.current = emptyHeldSnap();
      lastDragRectRef.current = null;
      if (snapGuidesRef.current) {
        snapGuidesRef.current = null;
        canvas.requestRenderAll();
      }
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
      const measured = computeTextBoxSize({ ...textLayer, text: newText });
      target.set({ width: measured.width, height: measured.height });
      target.setCoords();

      onTextLayerChangeRef.current?.(
        layerId,
        newText,
        measured.width,
        measured.height,
      );
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

    const scale = displayScale * zoom;
    const cursor = zoomCursorRef?.current;
    const canvasElement = canvasElementRef.current;
    const rectBefore =
      cursor && canvasElement ? canvasElement.getBoundingClientRect() : null;

    canvas.setDimensions({
      width: projectWidth * scale,
      height: projectHeight * scale,
    });

    let panX = 0;
    let panY = 0;

    // Zoom toward the cursor: keep the scene point under the pointer fixed.
    if (cursor && canvasElement && rectBefore) {
      const currentScale = canvas.viewportTransform[0];
      const currentPanX = canvas.viewportTransform[4];
      const currentPanY = canvas.viewportTransform[5];
      const sceneX = (cursor.x - rectBefore.left - currentPanX) / currentScale;
      const sceneY = (cursor.y - rectBefore.top - currentPanY) / currentScale;
      const rectAfter = canvasElement.getBoundingClientRect();
      panX = cursor.x - rectAfter.left - sceneX * scale;
      panY = cursor.y - rectAfter.top - sceneY * scale;
    }

    canvas.setViewportTransform([scale, 0, 0, scale, panX, panY]);
    canvas.requestRenderAll();
  }, [
    displayScale,
    projectHeight,
    projectWidth,
    scene.id,
    zoom,
    zoomCursorRef,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const layerIdToObject = layerIdToObjectRef.current;
    const objectToLayerId = objectToLayerIdRef.current;
    const forgetObject = (object: FabricObject): void => {
      if (object instanceof FabricGroup) {
        object.getObjects().forEach((child) => {
          const childId = objectToLayerId.get(child);
          objectToLayerId.delete(child);
          if (childId && layerIdToObject.get(childId) === child) {
            layerIdToObject.delete(childId);
          }
        });
      }
      const layerId = objectToLayerId.get(object);
      objectToLayerId.delete(object);
      if (layerId && layerIdToObject.get(layerId) === object) {
        layerIdToObject.delete(layerId);
      }
    };
    const removeAndForget = (object: FabricObject): void => {
      canvas.remove(object);
      forgetObject(object);
      if (hoveredObjectRef.current === object) {
        hoveredObjectRef.current = null;
        onHoveredLayerIdChange(null);
      }
    };
    isApplyingSelectionRef.current = true;

    try {
      const activeObject = canvas.getActiveObject();
      const editingObject =
        activeObject instanceof FabricLayerTextbox && activeObject.isEditing
          ? activeObject
          : null;
      const editingLayerId = editingObject
        ? objectToLayerId.get(editingObject)
        : undefined;
      const editingSelection = editingObject
        ? {
            start: editingObject.selectionStart,
            end: editingObject.selectionEnd,
          }
        : null;
      if (!editingObject) {
        canvas.discardActiveObject();
      }
      canvas.backgroundColor = scene.backgroundColor ?? "transparent";

      const sortedLayers = [...scene.layers].sort(
        (first, second) => first.zIndex - second.zIndex,
      );
      const topLevelIds = new Set(sortedLayers.map((layer) => layer.id));
      const desiredLayerIds = new Set<string>();
      for (const layer of sortedLayers) {
        desiredLayerIds.add(layer.id);
        if (layer.type === "group") {
          layer.children.forEach((child) => desiredLayerIds.add(child.id));
        }
      }

      const hasStructuralMismatch = canvas.getObjects().some((object) => {
        const layerId = objectToLayerId.get(object);
        return layerId === undefined || !topLevelIds.has(layerId);
      });

      if (hasStructuralMismatch) {
        for (const object of [...canvas.getObjects()]) {
          canvas.remove(object);
        }
        objectToLayerId.clear();
        layerIdToObject.clear();
        hoveredObjectRef.current = null;
        onHoveredLayerIdChange(null);

        sortedLayers.forEach((layer) => {
          addFabricObject(canvas, layer);
        });

        applySelectionToCanvas(canvas, selectedLayerIds, layerIdToObject);

        if (editingLayerId) {
          const editingTarget = layerIdToObject.get(editingLayerId);
          if (
            editingTarget instanceof FabricLayerTextbox &&
            !editingTarget.isEditing &&
            editingTarget.editable
          ) {
            canvas.setActiveObject(editingTarget);
            editingTarget.enterEditing();
            editingTarget.selectionStart = editingSelection?.start ?? 0;
            editingTarget.selectionEnd = editingSelection?.end ?? 0;
            if (editingTarget.hiddenTextarea) {
              editingTarget._updateTextarea();
            }
          }
        }

        canvas.requestRenderAll();
        return;
      }

      for (const [layerId, object] of layerIdToObject) {
        if (!desiredLayerIds.has(layerId)) {
          removeAndForget(object);
        }
      }

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
          applyLayerToFabricObject(object, layer, undefined, projectIdRef.current);
          const sortedChildren = sortChildrenByZIndex(layer.children);
          object.getObjects().forEach((childObject, childIndex) => {
            const child = sortedChildren[childIndex];
            if (childObject === editingObject) {
              const selStart = editingObject.selectionStart;
              const selEnd = editingObject.selectionEnd;
              applyLayerToFabricObject(childObject, child, layer, projectIdRef.current);
              editingObject.selectionStart = selStart;
              editingObject.selectionEnd = selEnd;
              if (editingObject.hiddenTextarea) {
                editingObject._updateTextarea();
              }
            } else {
              applyLayerToFabricObject(childObject, child, layer, projectIdRef.current);
            }
          });
          object.setCoords();
        } else if (object === editingObject) {
          const selStart = editingObject.selectionStart;
          const selEnd = editingObject.selectionEnd;
          applyLayerToFabricObject(object, layer, undefined, projectIdRef.current);
          editingObject.selectionStart = selStart;
          editingObject.selectionEnd = selEnd;
          if (editingObject.hiddenTextarea) {
            editingObject._updateTextarea();
          }
        } else {
          applyLayerToFabricObject(object, layer, undefined, projectIdRef.current);
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
  }, [addFabricObject, onHoveredLayerIdChange, scene, selectedLayerIds]);

  return (
    <div
      style={{
        width: "max-content",
        overflow: "hidden",
        background: scene.backgroundColor ?? "transparent",
      }}
    >
      <canvas ref={canvasElementRef} />
    </div>
  );
}
