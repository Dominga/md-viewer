import { useStore } from "../state/store";
import { Icon } from "./Icons";

export function Breadcrumbs() {
  const rootName = useStore((s) => s.rootName);
  const activePath = useStore((s) => s.activePath);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const toggleOutline = useStore((s) => s.toggleOutline);
  const outlineOpen = useStore((s) => s.outlineOpen);
  const toggleDir = useStore((s) => s.toggleDir);
  const setActive = useStore((s) => s.setActive);

  const segments = activePath ? activePath.split("/") : [];

  return (
    <div className="breadcrumbs">
      <button className="icon-button" title="Toggle sidebar (Ctrl+B)" onClick={toggleSidebar}>
        <Icon name="sidebar" />
      </button>

      <div className="breadcrumb-path">
        {activePath ? (
          <>
            <span className="crumb muted">{rootName}</span>
            {segments.map((segment, index) => {
              const isLast = index === segments.length - 1;
              const path = segments.slice(0, index + 1).join("/");
              return (
                <span key={path} className="crumb-group">
                  <span className="crumb-sep">›</span>
                  {isLast ? (
                    <span className="crumb current">{segment}</span>
                  ) : (
                    <button
                      className="crumb link"
                      onClick={() => {
                        toggleDir(path);
                        setActive(activePath);
                      }}
                    >
                      {segment}
                    </button>
                  )}
                </span>
              );
            })}
          </>
        ) : (
          <span className="crumb muted">{rootName ?? ""}</span>
        )}
      </div>

      <div className="breadcrumbs-actions">
        {activePath && (
          <button
            className={`icon-button${outlineOpen ? " active" : ""}`}
            title="Toggle outline"
            onClick={toggleOutline}
          >
            <Icon name="outline" />
          </button>
        )}
        <button
          className="icon-button"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </div>
    </div>
  );
}
