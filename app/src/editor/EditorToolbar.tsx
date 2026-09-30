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
          className="editor-tool"
          type="button"
          title="Add text"
          onClick={onAddText}
        >
          <span className="tool-symbol">T</span>
          Text
        </button>
        <button
          className="editor-tool"
          type="button"
          title="Add image placeholder"
          onClick={onAddImage}
        >
          <span className="tool-symbol">▣</span>
          Image Frame
        </button>
        <button
          className="editor-tool"
          type="button"
          title="Add rectangle"
          onClick={onAddRectangle}
        >
          <span className="tool-symbol">□</span>
          Rectangle
        </button>
        <button
          className="editor-tool"
          type="button"
          title="Add circle"
          onClick={onAddCircle}
        >
          <span className="tool-symbol">○</span>
          Circle
        </button>
        <button
          className="editor-tool"
          type="button"
          title="Add triangle"
          onClick={onAddTriangle}
        >
          <span className="tool-symbol">△</span>
          Triangle
        </button>
        <button
          className="editor-tool"
          type="button"
          title="Add arrow"
          onClick={onAddArrow}
        >
          <span className="tool-symbol">⇨</span>
          Arrow
        </button>
      </div>
      <div className="editor-toolbar-actions">
        <button
          className="editor-tool"
          type="button"
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
          onClick={onUndo}
        >
          <span className="tool-symbol">↩</span>
          Undo
        </button>
        <button
          className="editor-tool"
          type="button"
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
          onClick={onRedo}
        >
          <span className="tool-symbol">↪</span>
          Redo
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
