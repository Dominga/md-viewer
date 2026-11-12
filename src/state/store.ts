import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, type Entry } from "../lib/api";
import { clearAssetCache, invalidateAsset } from "../lib/assets";
import { basename, dirname, extname } from "../lib/paths";

export type TabKind = "md" | "image" | "pdf" | "other";

export interface Tab {
  path: string;
  title: string;
  kind: TabKind;
}

export interface DocState {
  content: string;
  size: number;
  mtime: number;
  loading: boolean;
  error: string | null;
}

export interface TreeRow {
  entry: Entry;
  depth: number;
  /** Directory hint shown when the tree is filtered. */
  hint?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

export interface LightboxState {
  url: string;
  alt: string;
  path: string;
}

interface ViewerState {
  root: string | null;
  rootName: string | null;
  editorLabel: string | null;
  booted: boolean;

  listings: Record<string, Entry[]>;
  expanded: Record<string, boolean>;
  loadingDirs: Record<string, boolean>;

  tabs: Tab[];
  activePath: string | null;
  docs: Record<string, DocState>;

  filter: string;
  theme: "dark" | "light";
  sidebarOpen: boolean;
  sidebarWidth: number;
  outlineOpen: boolean;
  fsTick: number;
  toast: Toast | null;
  lightbox: LightboxState | null;

  init: () => Promise<void>;
  openVaultDialog: () => Promise<void>;
  openVault: (path: string, restore?: boolean) => Promise<void>;
  loadDir: (dir: string) => Promise<void>;
  toggleDir: (path: string) => void;
  reveal: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  loadDoc: (path: string, silent?: boolean) => Promise<void>;
  onFsChange: (paths: string[]) => void;
  openInEditor: (path?: string) => Promise<void>;
  setFilter: (value: string) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setSidebarWidth: (width: number) => void;
  showToast: (text: string, kind?: "info" | "error") => void;
  setLightbox: (state: LightboxState | null) => void;
}

const MD_EXT = ["md", "markdown", "mdown", "mkd", "mkdn"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"];

export function kindOfPath(path: string): TabKind {
  const ext = extname(path);
  if (MD_EXT.includes(ext)) return "md";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.dataset.theme = theme;
}

/** All directories leading to a path, e.g. `a/b/c.md` -> `["a", "a/b"]`. */
function ancestors(path: string): string[] {
  const parts = dirname(path).split("/").filter(Boolean);
  const result: string[] = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    result.push(acc);
  }
  return result;
}

export const useStore = create<ViewerState>()(
  persist(
    (set, get) => ({
      root: null,
      rootName: null,
      editorLabel: null,
      booted: false,

      listings: {},
      expanded: {},
      loadingDirs: {},

      tabs: [],
      activePath: null,
      docs: {},

      filter: "",
      theme: "dark",
      sidebarOpen: true,
      sidebarWidth: 280,
      outlineOpen: true,
      fsTick: 0,
      toast: null,
      lightbox: null,

      init: async () => {
        if (get().booted) return;
        set({ booted: true });
        applyTheme(get().theme);

        api
          .editorLabel()
          .then((label) => set({ editorLabel: label }))
          .catch(() => set({ editorLabel: null }));

        // The command line wins over the restored session. The backend records
        // it in `setup`, which may finish slightly after the first render, so
        // wait until it reports that the command line has been parsed.
        let startup = await api.takeStartup().catch(() => null);
        for (let attempt = 0; startup && !startup.ready && attempt < 40; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 25));
          startup = await api.takeStartup().catch(() => null);
        }

        if (startup?.root) {
          await get().openVault(startup.root, false);
          if (startup.file) await get().openFile(startup.file);
          return;
        }

        // A webview reload keeps the vault open in the backend; restore the
        // previous tabs in that case instead of starting from scratch.
        const current = await api.currentVault().catch(() => null);
        if (current) {
          await get().openVault(current.root, true);
          return;
        }

        const root = get().root;
        if (root) await get().openVault(root, true);
      },

      openVaultDialog: async () => {
        try {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const selected = await open({
            directory: true,
            multiple: false,
            title: "Open folder",
          });
          if (typeof selected === "string") {
            await get().openVault(selected, false);
          }
        } catch (error) {
          get().showToast(`Cannot open the folder: ${error}`, "error");
        }
      },

      openVault: async (path, restore = false) => {
        try {
          const info = await api.openVault(path);
          clearAssetCache();
          set({
            root: info.root,
            rootName: info.name,
            listings: {},
            loadingDirs: {},
            docs: {},
            lightbox: null,
            toast: null,
            ...(restore
              ? {}
              : { tabs: [], activePath: null, expanded: {}, filter: "" }),
          });

          await get().loadDir("");

          if (restore) {
            const expandedDirs = Object.keys(get().expanded);
            await Promise.all(
              expandedDirs
                .filter((dir) => !get().listings[dir])
                .map((dir) => get().loadDir(dir).catch(() => undefined)),
            );
            const tabs = get().tabs.filter((tab) => tab.kind === "md");
            await Promise.all(
              tabs.map((tab) => get().loadDoc(tab.path, true).catch(() => undefined)),
            );
            const active = get().activePath;
            if (active) get().reveal(active);
          }
        } catch (error) {
          set({ root: null, rootName: null, tabs: [], activePath: null, docs: {} });
          get().showToast(String(error), "error");
        }
      },

      loadDir: async (dir) => {
        if (get().loadingDirs[dir]) return;
        set((state) => ({ loadingDirs: { ...state.loadingDirs, [dir]: true } }));
        try {
          const entries = await api.listDir(dir);
          set((state) => ({
            listings: { ...state.listings, [dir]: entries },
          }));
        } catch (error) {
          get().showToast(`Cannot read "${dir || "/"}": ${error}`, "error");
        } finally {
          set((state) => ({ loadingDirs: { ...state.loadingDirs, [dir]: false } }));
        }
      },

      toggleDir: (path) => {
        const willOpen = !get().expanded[path];
        set((state) => ({
          expanded: { ...state.expanded, [path]: willOpen },
        }));
        if (willOpen && !get().listings[path]) void get().loadDir(path);
      },

      reveal: (path) => {
        const dirs = ancestors(path);
        if (dirs.length === 0) return;
        set((state) => {
          const expanded = { ...state.expanded };
          for (const dir of dirs) expanded[dir] = true;
          return { expanded };
        });
        for (const dir of dirs) {
          if (!get().listings[dir]) void get().loadDir(dir);
        }
      },

      openFile: async (path) => {
        const kind = kindOfPath(path);
        set((state) => {
          const exists = state.tabs.some((tab) => tab.path === path);
          const tabs = exists
            ? state.tabs
            : [...state.tabs, { path, title: basename(path), kind }];
          return { tabs, activePath: path };
        });
        get().reveal(path);
        if (kind === "md") await get().loadDoc(path);
      },

      closeTab: (path) => {
        const { tabs, activePath } = get();
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index === -1) return;
        const next = tabs.filter((tab) => tab.path !== path);
        let nextActive = activePath;
        if (activePath === path) {
          nextActive = next[Math.min(index, next.length - 1)]?.path ?? null;
        }
        set({ tabs: next, activePath: nextActive });
      },

      setActive: (path) => {
        set({ activePath: path });
        const tab = get().tabs.find((t) => t.path === path);
        if (tab?.kind === "md" && !get().docs[path]) void get().loadDoc(path);
      },

      loadDoc: async (path, silent = false) => {
        const previous = get().docs[path];
        if (!silent) {
          set((state) => ({
            docs: {
              ...state.docs,
              [path]: {
                content: previous?.content ?? "",
                size: previous?.size ?? 0,
                mtime: previous?.mtime ?? 0,
                loading: true,
                error: null,
              },
            },
          }));
        } else {
          set((state) => ({
            docs: {
              ...state.docs,
              [path]: {
                content: previous?.content ?? "",
                size: previous?.size ?? 0,
                mtime: previous?.mtime ?? 0,
                loading: false,
                error: null,
              },
            },
          }));
        }

        try {
          const doc = await api.readDoc(path);
          set((state) => ({
            docs: {
              ...state.docs,
              [path]: { ...doc, loading: false, error: null },
            },
          }));
        } catch (error) {
          set((state) => ({
            docs: {
              ...state.docs,
              [path]: {
                content: previous?.content ?? "",
                size: previous?.size ?? 0,
                mtime: previous?.mtime ?? 0,
                loading: false,
                error: String(error),
              },
            },
          }));
        }
      },

      onFsChange: (paths) => {
        const changed = new Set(paths);
        const dirs = new Set<string>();
        for (const path of paths) {
          invalidateAsset(path);
          dirs.add(dirname(path));
        }
        set((state) => ({ fsTick: state.fsTick + 1 }));

        for (const dir of dirs) {
          if (dir === "" || get().listings[dir]) void get().loadDir(dir);
        }
        for (const tab of get().tabs) {
          if (!changed.has(tab.path)) continue;
          if (tab.kind === "md") void get().loadDoc(tab.path, true);
        }
      },

      openInEditor: async (path) => {
        const target = path ?? get().activePath;
        if (!target) return;
        try {
          const label = await api.openInEditor(target);
          get().showToast(`Opened in ${label}`);
        } catch (error) {
          get().showToast(String(error), "error");
        }
      },

      setFilter: (value) => set({ filter: value }),

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      toggleOutline: () => set((state) => ({ outlineOpen: !state.outlineOpen })),

      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.min(460, Math.max(180, width)) }),

      showToast: (text, kind = "info") => {
        const id = Date.now();
        set({ toast: { id, text, kind } });
        window.setTimeout(() => {
          if (get().toast?.id === id) set({ toast: null });
        }, 4000);
      },

      setLightbox: (state) => set({ lightbox: state }),
    }),
    {
      name: "mdv:session:v1",
      partialize: (state) => ({
        root: state.root,
        tabs: state.tabs,
        activePath: state.activePath,
        expanded: state.expanded,
        theme: state.theme,
        sidebarWidth: state.sidebarWidth,
        sidebarOpen: state.sidebarOpen,
        outlineOpen: state.outlineOpen,
      }),
    },
  ),
);
