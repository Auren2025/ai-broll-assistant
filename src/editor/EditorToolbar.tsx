interface EditorToolbarProps {
  isAddSceneDisabled: boolean;
  isCreatingScene: boolean;
  onAddText: () => void;
  onAddImage: () => void;
  onAddRectangle: () => void;
  onAddCircle: () => void;
  onAddTriangle: () => void;
  onAddArrow: () => void;
  onAddScene: () => void;
  onOpenPreview: () => void;
}

export function EditorToolbar({
  isAddSceneDisabled,
  isCreatingScene,
  onAddText,
  onAddImage,
  onAddRectangle,
  onAddCircle,
  onAddTriangle,
  onAddArrow,
  onAddScene,
  onOpenPreview,
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
          title="Add image"
          onClick={onAddImage}
        >
          <span className="tool-symbol">▣</span>
          Image
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
          className="button-secondary"
          type="button"
          disabled={isAddSceneDisabled}
          title={
            isAddSceneDisabled
              ? "Please wait for the current operation"
              : "Add a new scene"
          }
          aria-label="Add scene"
          onClick={onAddScene}
        >
          {isCreatingScene ? "Adding…" : "Add Scene"}
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={onOpenPreview}
        >
          Open Preview
        </button>
      </div>
    </div>
  );
}