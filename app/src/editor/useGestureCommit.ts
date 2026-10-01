import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  ActiveSelection,
  Canvas,
  FabricObject,
  Group as FabricGroup,
} from "fabric";
import type { Scene } from "../domain/sceneSchema";
import { hugGroupToChildren } from "../domain/groupOperations";
import {
  applyLayerToFabricObject,
  applySelectionToCanvas,
  updateChildLayerFromFabricObject,
  updateLayerFromFabricObject,
} from "./fabricAdapter";
import {
  findLayerByIdOrChild,
  findParentGroupLayer,
} from "./fabricLayerLookup";
import {
  FabricLayerTextbox,
  FabricShapeTextObject,
} from "./fabricObjects";

/** The subset of fabric's object:modified event the commit handling reads. */
export interface GestureModifiedEvent {
  target?: FabricObject | null;
}

interface UseGestureCommitOptions {
  objectToLayerIdRef: RefObject<Map<FabricObject, string>>;
  layerIdToObjectRef: RefObject<Map<string, FabricObject>>;
  sceneRef: RefObject<Scene>;
  projectIdRef: RefObject<string>;
  lockedAxisRef: RefObject<"x" | "y" | null>;
  lockOriginRef: RefObject<{ left: number; top: number } | null>;
  isApplyingSelectionRef: RefObject<boolean>;
  onSceneChange: (scene: Scene) => void;
  onDrillGestureEnd: (canvas: Canvas) => void;
}

export interface GestureCommitApi {
  /**
   * Commit fabric objects back to the scene schema: rebuild the affected
   * layers from the objects and report the updated scene. Groups whose
   * children changed are re-hugged to their children.
   */
  syncObjectsToScene: (objects: readonly FabricObject[]) => void;
  /**
   * object:modified handler: a move/scale/rotate gesture finished. Commits
   * the target to the scene; a multi-selection spanning several spaces
   * reverts to the schema instead (cross-space moves are not supported).
   */
  handleGestureModified: (event: GestureModifiedEvent, canvas: Canvas) => void;
}

/**
 * Owns the gesture-commit path: when a canvas gesture (move, scale,
 * rotate) finishes, the fabric objects are written back into the scene
 * schema via onSceneChange. All returned callbacks are referentially
 * stable.
 */
export function useGestureCommit(
  options: UseGestureCommitOptions,
): GestureCommitApi {
  const {
    objectToLayerIdRef,
    layerIdToObjectRef,
    sceneRef,
    projectIdRef,
    lockedAxisRef,
    lockOriginRef,
    isApplyingSelectionRef,
    onSceneChange,
    onDrillGestureEnd,
  } = options;

  const onSceneChangeRef = useRef(onSceneChange);
  useEffect(() => {
    onSceneChangeRef.current = onSceneChange;
  }, [onSceneChange]);

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
            return childChanged
              ? hugGroupToChildren({ ...nextGroup, children })
              : nextGroup;
          }
          const object = objectByLayerId.get(layer.id);
          return object ? updateLayerFromFabricObject(layer, object) : layer;
        }),
      };

      sceneRef.current = updatedScene;
      onSceneChangeRef.current(updatedScene);
    },
    [objectToLayerIdRef, sceneRef],
  );

  const handleGestureModified = useCallback(
    (event: GestureModifiedEvent, canvas: Canvas): void => {
      lockedAxisRef.current = null;
      lockOriginRef.current = null;
      const target = event.target;

      if (!target) {
        return;
      }
      if (
        target instanceof FabricLayerTextbox &&
        target.parent instanceof FabricShapeTextObject
      ) return;

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
            onDrillGestureEnd(canvas);
            canvas.requestRenderAll();
          } finally {
            isApplyingSelectionRef.current = false;
          }
        });
        return;
      }

      syncObjectsToScene([target]);
      onDrillGestureEnd(canvas);
    },
    [
      isApplyingSelectionRef,
      layerIdToObjectRef,
      lockOriginRef,
      lockedAxisRef,
      objectToLayerIdRef,
      onDrillGestureEnd,
      projectIdRef,
      sceneRef,
      syncObjectsToScene,
    ],
  );

  return {
    syncObjectsToScene,
    handleGestureModified,
  };
}
