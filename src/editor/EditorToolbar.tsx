interface EditorToolbarProps {
  isSaving: boolean;
  isSaveDisabled: boolean;
  onAddText: () => void;
  onAddRectangle: () => void;
  onAddCircle: () => void;
  onAddTriangle: () => void;
  onOpenPreview: () => void;
  onSave: () => void;
}

export function EditorToolbar({
  isSaving,
  isSaveDisabled,
  onAddText,
  onAddRectangle,
  onAddCircle,
  onAddTriangle,
  onOpenPreview,
  onSave,
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
      </div>
      <div className="editor-toolbar-actions">
        <button
          className="button-secondary"
          type="button"
          onClick={onOpenPreview}
        >
          Open Preview
        </button>
        <button
          className="button-primary"
          type="button"
          disabled={isSaveDisabled}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
