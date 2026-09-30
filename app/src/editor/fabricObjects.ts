import { FabricObject, Group as FabricGroup, LayoutManager, FixedLayout, Point, Rect, Textbox, classRegistry, util } from "fabric";
import { getShapeTextContentBox } from "../domain/shapeTextLayout";
import type { ShapeText } from "../domain/shapeTextSchema";
import { imagePlacement } from "./imagePlacement";
import { IMAGE_CROP_GHOST_ALPHA } from "./imageCrop";
import { applyTextCase, getCharSpacing } from "./textMetrics";

export type CornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

/**
 * Decide which axis a Shift-held drag is locked to. Returns the axis the
 * dragged has been moving *more* along, or null if there is not yet
 * enough motion to decide.
 */
export function resolveShiftLockAxis(
  dragStart: { x: number; y: number },
  current: { x: number; y: number },
  motionFloor: number,
): "x" | "y" | null {
  const dx = Math.abs(current.x - dragStart.x);
  const dy = Math.abs(current.y - dragStart.y);
  if (dx < motionFloor && dy < motionFloor) return null;
  return dx >= dy ? "x" : "y";
}

export function roundedRectanglePath(
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

export function roundedTrianglePath(
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

export class FabricRoundedRectangleObject extends FabricObject {
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

export class FabricEllipseObject extends FabricObject {
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

export class FabricRoundedTriangleObject extends FabricObject {
  static type = "FabricRoundedTriangle";

  declare fillColor: string | null;
  declare strokeColor: string | null;
  declare shapeStrokeWidth: number;
  declare cornerRadius: number;

  override _render(ctx: CanvasRenderingContext2D): void {
    paintShape(
      ctx,
      () => roundedTrianglePath(ctx, this.width, this.height, this.cornerRadius ?? 0),
      this.fillColor,
      this.strokeColor,
      this.shapeStrokeWidth,
    );
  }
}

export class FabricArrowObject extends FabricObject {
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

export class FabricImageLayerObject extends FabricObject {
  static type = "FabricImageLayer";

  declare imageSrc: string;
  declare imageStrokeColor: string | null;
  declare imageStrokeWidth: number;
  declare imageCornerRadius: number;
  declare imageFit: "fill" | "contain" | "cover";
  declare imageFocalX: number;
  declare imageFocalY: number;
  declare imageZoom: number;
  declare imagePlaceholderColor: string;
  /**
   * Crop mode: the frame is locked and the whole image is shown dimmed
   * behind it so the user can pan/zoom the image inside the fixed frame.
   * Managed by the canvas, not persisted on the layer.
   */
  declare isCropping: boolean;

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
    this.imageFit =
      (options.imageFit as "fill" | "contain" | "cover" | undefined) ?? "fill";
    this.imageFocalX = (options.imageFocalX as number | undefined) ?? 0.5;
    this.imageFocalY = (options.imageFocalY as number | undefined) ?? 0.5;
    this.imageZoom = (options.imageZoom as number | undefined) ?? 1;
    this.isCropping = (options.isCropping as boolean | undefined) ?? false;
    this.imagePlaceholderColor =
      (options.imagePlaceholderColor as string | undefined) ?? "#d1d5db";
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

  /** Image placement in object-centered coordinates, or null before load. */
  getCropImagePlacement(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (!this.htmlImage) return null;
    return imagePlacement(
      this.imageFit,
      this.htmlImage.naturalWidth || this.htmlImage.width,
      this.htmlImage.naturalHeight || this.htmlImage.height,
      this.width,
      this.height,
      this.imageFocalX,
      this.imageFocalY,
      this.imageZoom,
    );
  }

  /**
   * Zoom-handle center/radius in object-centered coordinates, matching what
   * drawCropZoomHandle paints. Updated on every render while cropping.
   */
  cropZoomHandle: { x: number; y: number; radius: number } | null = null;

  /**
   * Convert a canvas-plane point (e.g. event.scenePoint) to the
   * object-centered local coordinates that _render draws in. Rotation
   * aware, so crop hit-testing works on rotated images.
   */
  toCropLocalPoint(scenePoint: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    const inverse = util.invertTransform(this.calcTransformMatrix());
    const local = util.transformPoint(
      new Point(scenePoint.x, scenePoint.y),
      inverse,
    );
    return { x: local.x, y: local.y };
  }

  private drawCropZoomHandle(ctx: CanvasRenderingContext2D): void {
    const unit = 1 / Math.max(this.canvas?.getZoom() ?? 1, 0.001);
    const radius = 11 * unit;
    const gap = 7 * unit;
    const cx = this.width / 2 + radius + gap;
    const cy = this.height / 2 + radius + gap;
    this.cropZoomHandle = { x: cx, y: cy, radius: radius + 5 * unit };

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2 * unit;
    ctx.strokeStyle = "#7147e8";
    ctx.stroke();
    // Magnifier glyph.
    const lensRadius = 4 * unit;
    const lensX = cx - 1.4 * unit;
    const lensY = cy - 1.4 * unit;
    ctx.beginPath();
    ctx.arc(lensX, lensY, lensRadius, 0, Math.PI * 2);
    ctx.lineWidth = 1.8 * unit;
    ctx.strokeStyle = "#7147e8";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX + lensRadius * 0.72, lensY + lensRadius * 0.72);
    ctx.lineTo(
      lensX + lensRadius * 0.72 + 3.6 * unit,
      lensY + lensRadius * 0.72 + 3.6 * unit,
    );
    ctx.lineWidth = 2.2 * unit;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#7147e8";
    ctx.stroke();
    ctx.restore();
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    if (w <= 0 || h <= 0) {
      return;
    }

    const cornerRadii = this.getEffectiveCornerRadii();
    const placement = this.getCropImagePlacement();
    const cropping = this.isCropping && placement !== null;

    if (cropping && this.htmlImage) {
      // Ghost pass: the whole image dimmed and unclipped, so the user sees
      // what lies outside the crop frame while panning/zooming.
      ctx.save();
      ctx.globalAlpha = IMAGE_CROP_GHOST_ALPHA;
      ctx.drawImage(
        this.htmlImage,
        placement.x,
        placement.y,
        placement.width,
        placement.height,
      );
      ctx.restore();
    }

    ctx.save();
    roundedRectanglePath(ctx, w, h, cornerRadii);
    ctx.clip();

    if (this.htmlImage && placement) {
      ctx.drawImage(
        this.htmlImage,
        placement.x,
        placement.y,
        placement.width,
        placement.height,
      );
    } else if (this.imageLoadFailed) {
      ctx.fillStyle = this.imageSrc ? "#d1d5db" : this.imagePlaceholderColor;
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

    if (cropping) {
      this.drawCropZoomHandle(ctx);
    } else {
      this.cropZoomHandle = null;
    }
  }
}

export class FabricLayerTextbox extends Textbox {
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

export class FabricShapeTextObject extends FabricGroup {
  static type = "FabricShapeText";

  readonly shapeObject: FabricRoundedRectangleObject | FabricEllipseObject;
  readonly textObject: FabricLayerTextbox;

  constructor(
    shapeObject: FabricRoundedRectangleObject | FabricEllipseObject,
    options: Record<string, unknown> = {},
  ) {
    const textObject = new FabricLayerTextbox("", {
      originX: "center",
      originY: "center",
      dynamicMinWidth: 0,
    });
    super([shapeObject, textObject], {
      ...options,
      layoutManager: new LayoutManager(new FixedLayout()),
      subTargetCheck: true,
      interactive: false,
      objectCaching: false,
    });
    this.shapeObject = shapeObject;
    this.textObject = textObject;
  }

  applyShapeText(shapeText: ShapeText, width: number, height: number): void {
    const box = getShapeTextContentBox(width, height, shapeText.padding);
    const text = this.textObject;
    const displayText = text.isEditing
      ? (text.text ?? shapeText.text)
      : applyTextCase(shapeText.text, shapeText.textCase);
    text.editSourceText = shapeText.text;
    text.set({
      text: displayText,
      width: Math.max(1, box.width),
      fontFamily: shapeText.fontFamily,
      fontSize: shapeText.fontSize,
      fontWeight: shapeText.fontWeight,
      fontStyle: shapeText.fontStyle,
      lineHeight: shapeText.lineHeight,
      charSpacing: getCharSpacing(shapeText.fontSize, shapeText.letterSpacing),
      textAlign: shapeText.textAlign,
      fill: shapeText.fillEnabled ? shapeText.fill : "transparent",
      stroke: shapeText.stroke,
      strokeWidth: shapeText.strokeWidth,
      paintFirst:
        shapeText.stroke && shapeText.strokeWidth > 0 ? "stroke" : "fill",
      editable: this.selectable,
      visible: box.width > 0 && box.height > 0,
    });
    text.initDimensions();
    const naturalHeight = text.height;
    const centerY =
      shapeText.verticalAlign === "top"
        ? -height / 2 + box.y + naturalHeight / 2
        : shapeText.verticalAlign === "bottom"
          ? height / 2 - box.y - naturalHeight / 2
          : 0;
    text.set({ left: 0, top: centerY });
    text.clipPath = new Rect({
      originX: "center",
      originY: "center",
      left: 0,
      top: -centerY,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    });
    text.dirty = true;
    text.setCoords();
  }
}

export function registerFabricObjectClasses(): void {
  classRegistry.setClass(FabricArrowObject);
  classRegistry.setClass(FabricRoundedRectangleObject);
  classRegistry.setClass(FabricEllipseObject);
  classRegistry.setClass(FabricRoundedTriangleObject);
  classRegistry.setClass(FabricLayerTextbox);
  classRegistry.setClass(FabricImageLayerObject);
  classRegistry.setClass(FabricShapeTextObject);
}
