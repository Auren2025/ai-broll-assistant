interface EditorToolbarProps {
  isSaving: boolean;
  isSaveDisabled: boolean;
  onAddText: () => void;
  onAddRectangle: () => void;
  onOpenPreview: () => void;
  onSave: () => void;
}

export function EditorToolbar({
  isSaving,
  isSaveDisabled,
  onAddText,
  onAddRectangle,
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
