import {
  ArrowToolIcon,
  CircleToolIcon,
  ImageFrameToolIcon,
  RectangleToolIcon,
  RedoToolIcon,
  TextToolIcon,
  TriangleToolIcon,
  UndoToolIcon,
} from "./toolbarIcons";

interface EditorToolbarProps {
  isAddSceneDisabled: boolean;
  isCreatingScene: boolean;
  isSlideProject: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isPreviewActive: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePreview: () => void;
  onOpenPreviewWindow: () => void;
  onAddText: () => void;
  onAddImage: () => void;
  onAddRectangle: () => void;
  onAddCircle: () => void;
  onAddTriangle: () => void;
  onAddArrow: () => void;
  onAddScene: () => void;
}

export function EditorToolbar({
  isAddSceneDisabled,
  isCreatingScene,
  isSlideProject,
  canUndo,
  canRedo,
  isPreviewActive,
  onUndo,
  onRedo,
  onTogglePreview,
  onOpenPreviewWindow,
  onAddText,
  onAddImage,
  onAddRectangle,
  onAddCircle,
  onAddTriangle,
  onAddArrow,
  onAddScene,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar" aria-label="Editor toolbar">
      <div className="editor-tool-group">
        <button
          className="editor-tool is-active"
          type="button"
          aria-pressed="true"
          title="Select"
        >
          <span className="tool-symbol">↖</span>
          Select
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Add text"
          aria-label="Add text"
          onClick={onAddText}
        >
          <TextToolIcon />
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Add image placeholder"
          aria-label="Add image placeholder"
          onClick={onAddImage}
        >
          <ImageFrameToolIcon />
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Add rectangle"
          aria-label="Add rectangle"
          onClick={onAddRectangle}
        >
          <RectangleToolIcon />
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Add circle"
          aria-label="Add circle"
          onClick={onAddCircle}
        >
          <CircleToolIcon />
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Add triangle"
          aria-label="Add triangle"
          onClick={onAddTriangle}
        >
          <TriangleToolIcon />
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Add arrow"
          aria-label="Add arrow"
          onClick={onAddArrow}
        >
          <ArrowToolIcon />
        </button>
      </div>
      <div className="editor-toolbar-actions">
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
          onClick={onUndo}
        >
          <UndoToolIcon />
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
          onClick={onRedo}
        >
          <RedoToolIcon />
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={onAddScene}
          disabled={isAddSceneDisabled}
          title={
            isAddSceneDisabled
              ? "Please wait for the current operation"
              : `Add a new ${isSlideProject ? "page" : "scene"}`
          }
          aria-label={isSlideProject ? "Add page" : "Add scene"}
        >
          {isCreatingScene ? "Adding…" : isSlideProject ? "Add Page" : "Add Scene"}
        </button>
        <button
          className={`editor-tool${isPreviewActive ? " is-active" : ""}`}
          type="button"
          aria-pressed={isPreviewActive}
          title={isPreviewActive ? "Back to editing" : "Preview the scene"}
          onClick={onTogglePreview}
        >
          {isPreviewActive ? (
            <>
              <span className="tool-symbol">✎</span>
              Edit
            </>
          ) : (
            <>
              <span className="tool-symbol">▶</span>
              Preview
            </>
          )}
        </button>
        <button
          className="editor-tool editor-tool-icon"
          type="button"
          title="Open always-on-top preview window"
          aria-label="Open always-on-top preview window"
          onClick={onOpenPreviewWindow}
        >
          <span className="tool-symbol">↗</span>
        </button>
      </div>
    </div>
  );
}
