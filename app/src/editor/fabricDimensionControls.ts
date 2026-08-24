import { Control, controlsUtils, type FabricObject } from "fabric";

const resizeBoth = controlsUtils.wrapWithFireEvent(
  "resizing",
  controlsUtils.wrapWithFixedAnchor((eventData, transform, x, y) => {
    const widthChanged = controlsUtils.changeObjectWidth(
      eventData,
      transform,
      x,
      y,
    );
    const heightChanged = controlsUtils.changeObjectHeight(
      eventData,
      transform,
      x,
      y,
    );
    return widthChanged || heightChanged;
  }),
);

function resizeControl(
  x: number,
  y: number,
  actionHandler: Control["actionHandler"],
): Control {
  return new Control({
    x,
    y,
    actionName: "resizing",
    actionHandler,
    cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
  });
}

export function createDimensionResizeControls(): FabricObject["controls"] {
  const defaults = controlsUtils.createObjectDefaultControls();
  return {
    ml: resizeControl(-0.5, 0, controlsUtils.changeWidth),
    mr: resizeControl(0.5, 0, controlsUtils.changeWidth),
    mt: resizeControl(0, -0.5, controlsUtils.changeHeight),
    mb: resizeControl(0, 0.5, controlsUtils.changeHeight),
    tl: resizeControl(-0.5, -0.5, resizeBoth),
    tr: resizeControl(0.5, -0.5, resizeBoth),
    bl: resizeControl(-0.5, 0.5, resizeBoth),
    br: resizeControl(0.5, 0.5, resizeBoth),
    mtr: defaults.mtr,
  };
}
