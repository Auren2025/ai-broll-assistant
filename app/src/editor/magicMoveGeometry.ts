export interface GeometryPoint {
  x: number;
  y: number;
}

export interface LayerGeometry extends GeometryPoint {
  width: number;
  height: number;
}

export interface GroupGeometry extends LayerGeometry {
  rotation: number;
}

export interface MagicMovePath {
  start: GeometryPoint;
  end: GeometryPoint;
}

function rotate(point: GeometryPoint, degrees: number): GeometryPoint {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function getLayerCenter(
  layer: LayerGeometry,
  parentGroup?: GroupGeometry,
): GeometryPoint {
  const localCenter = {
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2,
  };
  if (!parentGroup) return localCenter;

  const groupCenter = {
    x: parentGroup.x + parentGroup.width / 2,
    y: parentGroup.y + parentGroup.height / 2,
  };
  const centerFromGroupCenter = rotate(
    {
      x: localCenter.x - parentGroup.width / 2,
      y: localCenter.y - parentGroup.height / 2,
    },
    parentGroup.rotation,
  );
  return {
    x: groupCenter.x + centerFromGroupCenter.x,
    y: groupCenter.y + centerFromGroupCenter.y,
  };
}

export function getMagicMovePath(
  layer: LayerGeometry,
  translation: GeometryPoint,
  parentGroup?: GroupGeometry,
): MagicMovePath {
  const start = getLayerCenter(layer, parentGroup);
  const sceneTranslation = parentGroup
    ? rotate(translation, parentGroup.rotation)
    : translation;
  return {
    start,
    end: {
      x: start.x + sceneTranslation.x,
      y: start.y + sceneTranslation.y,
    },
  };
}

export function getMagicMoveTranslationForEndpoint(
  layer: LayerGeometry,
  endpoint: GeometryPoint,
  parentGroup?: GroupGeometry,
): GeometryPoint {
  const start = getLayerCenter(layer, parentGroup);
  const sceneTranslation = {
    x: endpoint.x - start.x,
    y: endpoint.y - start.y,
  };
  return parentGroup
    ? rotate(sceneTranslation, -parentGroup.rotation)
    : sceneTranslation;
}
