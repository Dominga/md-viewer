import { useMemo } from "react";
import { useStore } from "../state/store";
import { countWords, formatBytes, readingTime } from "../lib/format";
import { Icon } from "./Icons";

export function StatusBar() {
  const rootName = useStore((s) => s.rootName);
  const activePath = useStore((s) => s.activePath);
  const tabs = useStore((s) => s.tabs);
  const docs = useStore((s) => s.docs);
  const editorLabel = useStore((s) => s.editorLabel);
  const openInEditor = useStore((s) => s.openInEditor);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const tab = tabs.find((item) => item.path === activePath) ?? null;
  const doc = activePath ? docs[activePath] : undefined;

  const words = useMemo(
    () => (tab?.kind === "md" && doc?.content ? countWords(doc.content) : 0),
    [tab?.kind, doc?.content],
  );

  return (
    <footer className="statusbar">
      <div className="status-left">
        <span className="status-vault" title={activePath ?? undefined}>
          {rootName ?? "No folder"}
          {activePath ? `  ›  ${activePath}` : ""}
        </span>
      </div>

      <div className="status-right">
        {tab?.kind === "md" && doc?.content ? (
          <>
            <span>{words.toLocaleString()} words</span>
            <span>{readingTime(words)}</span>
            <span>{formatBytes(doc.size)}</span>
          </>
        ) : null}

        <button
          className="status-editor"
          disabled={!activePath || !editorLabel}
          title={editorLabel ? `Open in ${editorLabel}` : "No editor detected"}
          onClick={() => void openInEditor()}
        >
          <Icon name="external" size={12} />
          {editorLabel ?? "No editor"}
        </button>

        <button className="status-theme" title="Toggle theme" onClick={toggleTheme}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={12} />
        </button>
      </div>
    </footer>
  );
}
