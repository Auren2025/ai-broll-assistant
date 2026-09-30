import type { ComponentProps } from "react";
import type { Project } from "../domain/projectSchema";
import type { Layer, Scene } from "../domain/sceneSchema";
import { LayerAnimationPanel } from "./LayerAnimationPanel";
import { LayerPropertiesPanel, MultiLayerPropertiesPanel } from "./LayerPropertiesPanel";
import { ScenePropertiesPanel } from "./ScenePropertiesPanel";
import type { InspectorScope } from "./useEditorSelection";

interface EditorInspectorProps {
  project: Project;
  scene: Scene;
  maximumDurationInFrames: number;
  selection: {
    tab: "design" | "animate";
    scope: InspectorScope;
    layerIds: string[];
    layer: Layer | null;
    isGroupChild: boolean;
    animationId: string | null;
    canGroup: boolean;
  };
  actions: {
    setTab: (tab: "design" | "animate") => void;
    onProjectChange: ComponentProps<typeof ScenePropertiesPanel>["onProjectChange"];
    onSceneChange: ComponentProps<typeof ScenePropertiesPanel>["onSceneChange"];
    onAlign: ComponentProps<typeof MultiLayerPropertiesPanel>["onAlign"];
    onGroup: () => void;
    onDuplicate: () => void;
    onReorder: ComponentProps<typeof MultiLayerPropertiesPanel>["onReorder"];
    onPatch: ComponentProps<typeof LayerPropertiesPanel>["onPatch"];
    onReplaceImage: () => void;
    onDeleteLayer: () => void;
    onAnimationSelect: (id: string | null) => void;
    onAnimationsChange: ComponentProps<typeof LayerAnimationPanel>["onAnimationsChange"];
  };
}

export function EditorInspector({
  project, scene, maximumDurationInFrames, selection, actions,
}: EditorInspectorProps) {
  return (
    <aside className="sidebar sidebar-right">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector">
        <button type="button" role="tab" aria-selected={selection.tab === "design"}
          className={selection.tab === "design" ? "is-active" : ""}
          onClick={() => actions.setTab("design")}>Design</button>
        <button type="button" role="tab" aria-selected={selection.tab === "animate"}
          className={selection.tab === "animate" ? "is-active" : ""}
          onClick={() => actions.setTab("animate")}>Animate</button>
      </div>
      <div className="inspector-scroll">
        {selection.tab === "design" ? (
          selection.scope === "scene" ? (
            <ScenePropertiesPanel key={scene.id} scene={scene} project={project}
              maximumDurationInFrames={maximumDurationInFrames}
              onProjectChange={actions.onProjectChange} onSceneChange={actions.onSceneChange} />
          ) : selection.layerIds.length > 1 ? (
            <MultiLayerPropertiesPanel selectionCount={selection.layerIds.length}
              canGroup={selection.canGroup} onAlign={actions.onAlign}
              onGroup={actions.onGroup} onDuplicate={actions.onDuplicate}
              onReorder={actions.onReorder} />
          ) : (
            <LayerPropertiesPanel key={`${scene.id}:${selection.layer?.id ?? ""}`}
              layer={selection.layer} projectId={project.id} onPatch={actions.onPatch}
              onAlign={actions.onAlign} onReplaceImage={actions.onReplaceImage}
              onDuplicate={actions.onDuplicate} onReorder={actions.onReorder}
              onDeleteLayer={actions.onDeleteLayer} />
          )
        ) : (
          <LayerAnimationPanel
            layer={selection.layerIds.length === 1 ? selection.layer : null}
            readOnlyReason={selection.isGroupChild
              ? "Group members inherit animation from their top-level group." : null}
            fps={project.fps} sceneDurationInFrames={scene.durationInFrames}
            selectedAnimationId={selection.animationId}
            onAnimationSelect={actions.onAnimationSelect}
            onAnimationsChange={actions.onAnimationsChange} />
        )}
      </div>
    </aside>
  );
}
