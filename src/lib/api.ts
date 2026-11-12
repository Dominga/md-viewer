import { invoke } from "@tauri-apps/api/core";

export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: number;
  kind: "dir" | "md" | "image" | "pdf" | "other";
}

export interface Doc {
  content: string;
  size: number;
  mtime: number;
}

export interface AssetMeta {
  exists: boolean;
  size: number;
  mime: string;
}

export interface VaultInfo {
  root: string;
  name: string;
}

/**
 * Thin, typed wrapper around the Tauri commands. This is the only module that
 * talks to the backend, which keeps the UI independent of the IPC layer.
 */
export const api = {
  openVault: (path: string) => invoke<VaultInfo>("open_vault", { path }),
  listDir: (rel: string) => invoke<Entry[]>("list_dir", { rel }),
  readDoc: (rel: string) => invoke<Doc>("read_doc", { rel }),
  assetMeta: (rel: string) => invoke<AssetMeta>("asset_meta", { rel }),
  readAsset: (rel: string) => invoke<ArrayBuffer>("read_asset", { rel }),
  openInEditor: (rel: string) => invoke<string>("open_in_editor", { rel }),
  editorLabel: () => invoke<string | null>("editor_label"),
  openExternal: (url: string) => invoke<void>("open_external", { url }),
  openPathOs: (rel: string) => invoke<void>("open_path_os", { rel }),
  takePendingFile: () => invoke<string | null>("take_pending_file"),
  currentVault: () => invoke<VaultInfo | null>("current_vault"),
};
