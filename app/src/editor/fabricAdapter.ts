import {
  ActiveSelection,
  Canvas,
  FabricObject,
  FixedLayout,
  Group as FabricGroup,
  LayoutManager,
} from "fabric";
import { getAssetUrl } from "../api/projectApi";
import type { AtomicLayer } from "../domain/atomicLayerSchema";
import type { GroupLayer } from "../domain/groupLayerSchema";
import { scaleGroupChildren } from "../domain/groupOperations";
import type { Layer, Scene } from "../domain/sceneSchema";
import { createDimensionResizeControls } from "./fabricDimensionControls";
import {
  FabricArrowObject,
  FabricEllipseObject,
  FabricImageLayerObject,
  FabricLayerTextbox,
  FabricRoundedRectangleObject,
  FabricRoundedTriangleObject,
  FabricShapeTextObject,
} from "./fabricObjects";
import {
  getChildLayerPositionFromObject,
  readVisibleHeight,
  readVisibleWidth,
  roundNumber,
  sortChildrenByZIndex,
} from "./magicMove";
import {
  MIN_TEXT_WIDTH,
  applyTextCase,
  getCharSpacing,
} from "./textMetrics";

export function updateLayerFromFabricObject(
  layer: Layer,
  object: FabricObject,
): Layer {
  if (
    layer.type === "group" &&
    object instanceof FabricGroup &&
    !(object instanceof FabricShapeTextObject)
  ) {
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
  const minHeight = 1;
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

export function updateChildLayerFromFabricObject(
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

export function applyLayerToFabricObject(
  object: FabricObject,
  layer: Layer,
  groupLayer: GroupLayer | undefined,
  projectId: string,
): void {
  const isChild = groupLayer !== undefined;
  const isLocked = layer.locked || (isChild ? groupLayer!.locked : false);

  if (layer.type !== "group" && layer.type !== "text") {
    object.controls = createDimensionResizeControls();
    object.lockScalingFlip = true;
  }

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

  if (
    (layer.type === "rectangle" || layer.type === "circle") &&
    object instanceof FabricShapeTextObject
  ) {
    const left = isChild
      ? layer.x + layer.width / 2 - (groupLayer as GroupLayer).width / 2
      : layer.x + layer.width / 2;
    const top = isChild
      ? layer.y + layer.height / 2 - (groupLayer as GroupLayer).height / 2
      : layer.y + layer.height / 2;
    object.set({
      left,
      top,
      width: layer.width,
      height: layer.height,
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
    const shapeObject = object.shapeObject;
    shapeObject.set({ width: layer.width, height: layer.height, left: 0, top: 0 });
    if (
      layer.type === "rectangle" &&
      shapeObject instanceof FabricRoundedRectangleObject
    ) {
      const cornerRadii = layer.cornerEnabled
        ? (layer.cornerRadii ?? {
            topLeft: layer.cornerRadius,
            topRight: layer.cornerRadius,
            bottomRight: layer.cornerRadius,
            bottomLeft: layer.cornerRadius,
          })
        : { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
      shapeObject.set({
        fillColor: layer.fillEnabled ? layer.fill : null,
        strokeColor: layer.stroke,
        shapeStrokeWidth: layer.strokeWidth,
        cornerRadii,
      });
      object.applyShapeText(layer.shapeText, layer.width, layer.height);
    } else if (
      layer.type === "circle" &&
      shapeObject instanceof FabricEllipseObject
    ) {
      shapeObject.set({
        fillColor: layer.fillEnabled ? layer.fill : null,
        strokeColor: layer.stroke,
        shapeStrokeWidth: layer.strokeWidth,
        donut: layer.donut,
        sweep: layer.sweep,
        startAngle: layer.startAngle,
      });
      object.applyShapeText(layer.shapeText, layer.width, layer.height);
      object.textObject.visible = layer.donut === 0 && layer.sweep === 360;
    }
    shapeObject.dirty = true;
    object.dirty = true;
    object.setCoords();
    return;
  }

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
    object.setImageSource(layer.src ? getAssetUrl(projectId, layer.src) : "");
    object.set({
      width: layer.width,
      height: layer.height,
      imageStrokeColor: layer.stroke,
      imageStrokeWidth: layer.strokeWidth,
      imageCornerRadius: layer.cornerRadius,
      imageFit: layer.fit,
      imagePlaceholderColor: layer.placeholderColor,
    });
    object.dirty = true;
    object.setCoords();
  }
}

export function createFabricObjectForLayer(
  layer: Layer,
  projectId: string,
): FabricObject {
  let object: FabricObject;

  switch (layer.type) {
    case "rectangle":
      object = new FabricShapeTextObject(new FabricRoundedRectangleObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      }), { originX: "center", originY: "center" });
      break;
    case "circle":
      object = new FabricShapeTextObject(new FabricEllipseObject({
        originX: "center",
        originY: "center",
        objectCaching: false,
      }), { originX: "center", originY: "center" });
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
        imageSrc: layer.src ? getAssetUrl(projectId, layer.src) : "",
        imageFit: layer.fit,
        imagePlaceholderColor: layer.placeholderColor,
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

export function isFabricObjectForLayer(
  object: FabricObject,
  layer: Layer,
): boolean {
  switch (layer.type) {
    case "rectangle":
      return object instanceof FabricShapeTextObject && object.shapeObject instanceof FabricRoundedRectangleObject;
    case "circle":
      return object instanceof FabricShapeTextObject && object.shapeObject instanceof FabricEllipseObject;
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

export function applySelectionToCanvas(
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


void ({} as Scene);