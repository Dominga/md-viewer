import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type TreeRow } from "../state/store";
import { Icon } from "./Icons";

function buildRows(
  listings: Record<string, ReturnType<typeof useStore.getState>["listings"][string]>,
  expanded: Record<string, boolean>,
  filter: string,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const query = filter.trim().toLowerCase();

  if (query) {
    for (const [dir, entries] of Object.entries(listings)) {
      for (const entry of entries) {
        if (entry.name.toLowerCase().includes(query)) {
          rows.push({ entry, depth: 0, hint: dir });
        }
      }
    }
    return rows.sort((a, b) =>
      a.entry.name.localeCompare(b.entry.name, undefined, { sensitivity: "base" }),
    );
  }

  const walk = (dir: string, depth: number) => {
    for (const entry of listings[dir] ?? []) {
      rows.push({ entry, depth });
      if (entry.is_dir && expanded[entry.path]) walk(entry.path, depth + 1);
    }
  };
  walk("", 0);
  return rows;
}

export function Sidebar() {
  const rootName = useStore((s) => s.rootName);
  const root = useStore((s) => s.root);
  const listings = useStore((s) => s.listings);
  const expanded = useStore((s) => s.expanded);
  const filter = useStore((s) => s.filter);
  const activePath = useStore((s) => s.activePath);
  const width = useStore((s) => s.sidebarWidth);
  const openVaultDialog = useStore((s) => s.openVaultDialog);
  const toggleDir = useStore((s) => s.toggleDir);
  const openFile = useStore((s) => s.openFile);
  const setFilter = useStore((s) => s.setFilter);
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const loadDir = useStore((s) => s.loadDir);

  const rows = useMemo(() => buildRows(listings, expanded, filter), [listings, expanded, filter]);
  const [selected, setSelected] = useState<string | null>(activePath);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(activePath);
  }, [activePath]);

  useEffect(() => {
    if (!activePath) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(activePath)}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activePath, rows.length]);

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: MouseEvent) => setSidebarWidth(startWidth + e.clientX - startX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!rows.length) return;
    const index = rows.findIndex((row) => row.entry.path === selected);
    const current = index >= 0 ? rows[index] : null;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = rows[Math.min(index + 1, rows.length - 1)] ?? rows[0];
      setSelected(next.entry.path);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const previous = rows[Math.max(index - 1, 0)] ?? rows[0];
      setSelected(previous.entry.path);
    } else if (event.key === "ArrowRight" && current) {
      event.preventDefault();
      if (current.entry.is_dir) {
        if (!expanded[current.entry.path]) toggleDir(current.entry.path);
        else setSelected(rows[index + 1]?.entry.path ?? selected);
      }
    } else if (event.key === "ArrowLeft" && current) {
      event.preventDefault();
      if (current.entry.is_dir && expanded[current.entry.path]) {
        toggleDir(current.entry.path);
      } else {
        const parent = current.entry.path.includes("/")
          ? current.entry.path.slice(0, current.entry.path.lastIndexOf("/"))
          : null;
        if (parent !== null) setSelected(parent);
      }
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      if (current.entry.is_dir) toggleDir(current.entry.path);
      else void openFile(current.entry.path);
    }
  };

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-header">
        <span className="vault-name" title={root ?? undefined}>
          {rootName ?? "No folder"}
        </span>
        <button className="icon-button" title="Open folder (Ctrl+O)" onClick={() => void openVaultDialog()}>
          <Icon name="folder-open" />
        </button>
        <button
          className="icon-button"
          title="Refresh"
          onClick={() => void loadDir("")}
        >
          <Icon name="refresh" />
        </button>
      </div>

      <div className="sidebar-filter">
        <Icon name="search" size={14} />
        <input
          value={filter}
          placeholder="Filter files"
          spellCheck={false}
          onChange={(event) => setFilter(event.target.value)}
        />
        {filter && (
          <button className="icon-button small" title="Clear" onClick={() => setFilter("")}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div
        className="tree"
        ref={listRef}
        tabIndex={0}
        role="tree"
        onKeyDown={onKeyDown}
        aria-label="Files"
      >
        {rows.length === 0 && (
          <div className="tree-empty">
            {filter ? "Nothing matches the filter" : "This folder is empty"}
          </div>
        )}
        {rows.map(({ entry, depth, hint }) => {
          const isDir = entry.is_dir;
          const isExpanded = !!expanded[entry.path];
          const isActive = entry.path === activePath;
          const isSelected = entry.path === selected;
          return (
            <div
              key={entry.path}
              data-path={entry.path}
              role="treeitem"
              aria-selected={isSelected}
              aria-expanded={isDir ? isExpanded : undefined}
              className={`tree-row${isActive ? " active" : ""}${isSelected ? " selected" : ""}`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => {
                setSelected(entry.path);
                if (isDir) toggleDir(entry.path);
                else void openFile(entry.path);
              }}
              title={hint ? `${hint}/${entry.name}` : entry.path}
            >
              <span className={`tree-chevron${isExpanded ? " open" : ""}`}>
                {isDir && <Icon name="chevron" size={12} />}
              </span>
              {isDir ? (
                <Icon name="folder" size={15} className="tree-icon folder-icon" />
              ) : entry.kind === "image" ? (
                <Icon name="image" size={15} className="tree-icon image-icon" />
              ) : (
                <Icon
                  name="doc"
                  size={15}
                  className={`tree-icon doc-icon${entry.kind === "md" ? " md-icon" : ""}`}
                />
              )}
              <span className="tree-label">{entry.name}</span>
            </div>
          );
        })}
      </div>

      <div className="resizer" onMouseDown={startResize} role="separator" aria-orientation="vertical" />
    </aside>
  );
}
