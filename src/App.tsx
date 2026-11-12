import { useEffect } from "react";
import { useStore } from "./state/store";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { Viewer } from "./components/Viewer";
import { StatusBar } from "./components/StatusBar";
import { Lightbox } from "./components/Lightbox";

export default function App() {
  const init = useStore((s) => s.init);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const root = useStore((s) => s.root);
  const toast = useStore((s) => s.toast);
  const lightbox = useStore((s) => s.lightbox);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  // Filesystem watcher events -> store refresh.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<string[]>("fs-change", (event) => {
          useStore.getState().onFsChange(event.payload);
        }).then((stop) => {
          if (disposed) stop();
          else unlisten = stop;
        }),
      )
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Global shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "o") {
        event.preventDefault();
        void state.openVaultDialog();
      } else if (mod && key === "b") {
        event.preventDefault();
        state.toggleSidebar();
      } else if (mod && key === "e") {
        event.preventDefault();
        void state.openInEditor();
      } else if (mod && key === "w") {
        event.preventDefault();
        if (state.activePath) state.closeTab(state.activePath);
      } else if (mod && key === "l") {
        event.preventDefault();
        state.toggleOutline();
      } else if (event.key === "Escape" && state.lightbox) {
        state.setLightbox(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app">
      <div className="workbench">
        {sidebarOpen && <Sidebar />}
        <main className="main">
          {root && <TabBar />}
          {root && <Breadcrumbs />}
          <Viewer />
        </main>
      </div>

      <StatusBar />

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {lightbox && (
        <Lightbox
          url={lightbox.url}
          alt={lightbox.alt}
          path={lightbox.path}
          onClose={() => useStore.getState().setLightbox(null)}
        />
      )}
    </div>
  );
}
