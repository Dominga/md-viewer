import { useStore } from "../state/store";
import { Icon } from "./Icons";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const openInEditor = useStore((s) => s.openInEditor);
  const editorLabel = useStore((s) => s.editorLabel);

  return (
    <div className="tabbar">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            role="tab"
            aria-selected={tab.path === activePath}
            className={`tab${tab.path === activePath ? " active" : ""}`}
            title={tab.path}
            onMouseDown={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                closeTab(tab.path);
              }
            }}
            onClick={() => setActive(tab.path)}
          >
            <Icon
              name={tab.kind === "image" ? "image" : "doc"}
              size={14}
              className={`tab-icon ${tab.kind}`}
            />
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              title="Close (Ctrl+W)"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.path);
              }}
            >
              <Icon name="close" size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="tabbar-actions">
        <button
          className="editor-button"
          disabled={!activePath || !editorLabel}
          title={
            editorLabel
              ? `Open in ${editorLabel} (Ctrl+E)`
              : "No editor found. Set $MDV_EDITOR or install VS Code."
          }
          onClick={() => void openInEditor()}
        >
          <Icon name="external" size={14} />
          <span>{editorLabel ? `Open in ${editorLabel}` : "Open in editor"}</span>
        </button>
      </div>
    </div>
  );
}
