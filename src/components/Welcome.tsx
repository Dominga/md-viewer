import { useStore } from "../state/store";
import { Icon } from "./Icons";

export function Welcome() {
  const root = useStore((s) => s.root);
  const openVaultDialog = useStore((s) => s.openVaultDialog);

  if (root) {
    return (
      <div className="welcome">
        <div className="welcome-inner">
          <Icon name="doc" size={30} />
          <h2>No file is open</h2>
          <p>Pick a Markdown file in the sidebar, or press `Ctrl+O` to open another folder.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo">
          <span>MD</span>
        </div>
        <h1>MD Viewer</h1>
        <p className="welcome-tagline">
          A fast, read-only Markdown viewer for local folders.
        </p>

        <button className="button primary" onClick={() => void openVaultDialog()}>
          <Icon name="folder-open" size={15} />
          Open folder
        </button>

        <div className="welcome-keys">
          <div>
            <kbd>Ctrl</kbd>
            <kbd>O</kbd>
            <span>open folder</span>
          </div>
          <div>
            <kbd>Ctrl</kbd>
            <kbd>B</kbd>
            <span>toggle sidebar</span>
          </div>
          <div>
            <kbd>Ctrl</kbd>
            <kbd>E</kbd>
            <span>open in editor</span>
          </div>
        </div>
      </div>
    </div>
  );
}
