import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { MarkdownView } from "./Markdown";
import { Outline, type TocItem } from "./Outline";
import { Welcome } from "./Welcome";
import { formatBytes } from "../lib/format";
import { useAsset } from "../lib/assets";
import { api } from "../lib/api";
import { Icon } from "./Icons";

function ImagePane({ path }: { path: string }) {
  const fsTick = useStore((s) => s.fsTick);
  const showToast = useStore((s) => s.showToast);
  const { status, url } = useAsset(path, fsTick);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [fit, setFit] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .assetMeta(path)
      .then((meta) => {
        if (alive) setSize(meta.exists ? meta.size : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path, fsTick]);

  // Dimensions belong to the previous file once the tab changes.
  useEffect(() => {
    setDims(null);
    setFit(true);
  }, [path]);

  const openExternal = () =>
    api.openPathOs(path).catch((error) => showToast(String(error), "error"));

  return (
    <div className="image-pane">
      <div className="image-toolbar">
        <span className="image-path" title={path}>
          {path}
        </span>
        <div className="image-toolbar-right">
          <span className="image-meta">
            {dims ? `${dims.w} × ${dims.h}` : ""}
            {dims && size != null ? " · " : ""}
            {size != null ? formatBytes(size) : ""}
          </span>
          <button className="button ghost" onClick={() => setFit((value) => !value)}>
            {fit ? "Actual size" : "Fit to window"}
          </button>
          <button className="button ghost" onClick={() => void openExternal()}>
            <Icon name="external" size={13} />
            Open
          </button>
        </div>
      </div>

      <div className={`image-stage${fit ? " fit" : ""}`}>
        {status === "ready" && url ? (
          <img
            src={url}
            alt={path}
            onLoad={(event) =>
              setDims({
                w: event.currentTarget.naturalWidth,
                h: event.currentTarget.naturalHeight,
              })
            }
          />
        ) : status === "error" ? (
          <div className="pane-message error">
            <Icon name="alert" size={22} />
            <span>Cannot load this image</span>
            <code>{path}</code>
          </div>
        ) : (
          <div className="pane-message">Loading…</div>
        )}
      </div>
    </div>
  );
}

function UnsupportedPane({ path }: { path: string }) {
  const showToast = useStore((s) => s.showToast);
  return (
    <div className="pane-message">
      <Icon name="doc" size={28} />
      <span>This file type is not rendered in the viewer.</span>
      <code>{path}</code>
      <button
        className="button"
        onClick={() => api.openPathOs(path).catch((error) => showToast(String(error), "error"))}
      >
        Open with system app
      </button>
    </div>
  );
}

export function Viewer() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const docs = useStore((s) => s.docs);
  const outlineOpen = useStore((s) => s.outlineOpen);
  const fsTick = useStore((s) => s.fsTick);

  const tab = tabs.find((item) => item.path === activePath) ?? null;
  const doc = activePath ? docs[activePath] : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<string, number>>({});
  const lastPath = useRef<string | null>(null);
  const tocRef = useRef<TocItem[]>([]);
  const rafRef = useRef(0);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Restore the scroll offset per tab.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (lastPath.current && lastPath.current !== activePath) {
      positions.current[lastPath.current] = element.scrollTop;
    }
    element.scrollTop = activePath ? (positions.current[activePath] ?? 0) : 0;
    lastPath.current = activePath;
  }, [activePath]);

  // Build the outline from the rendered DOM so anchors always match.
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article || !tab || tab.kind !== "md") {
      tocRef.current = [];
      setToc([]);
      return;
    }
    const items = Array.from(
      article.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]"),
    )
      .map((heading) => ({
        id: heading.id,
        text: (heading.textContent ?? "").trim(),
        level: Number(heading.tagName.slice(1)),
      }))
      .filter((item) => item.text.length > 0);
    tocRef.current = items;
    setToc(items);
    setActiveId(items[0]?.id ?? null);
  }, [doc?.content, tab?.path, fsTick, tab]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (activePath) positions.current[activePath] = element.scrollTop;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const container = scrollRef.current;
      if (!container) return;
      let current: string | null = null;
      for (const item of tocRef.current) {
        const node = document.getElementById(item.id);
        if (!node) continue;
        const offset =
          node.getBoundingClientRect().top - container.getBoundingClientRect().top;
        if (offset <= 90) current = item.id;
        else break;
      }
      setActiveId(current);
    });
  }, [activePath]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const scrollToId = (id: string) => {
    const container = scrollRef.current;
    const node = articleRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!container || !node) return;
    const top =
      node.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      24;
    container.scrollTo({ top, behavior: "smooth" });
  };

  if (!tab) return <Welcome />;
  if (tab.kind === "image") return <ImagePane path={tab.path} />;
  if (tab.kind === "pdf" || tab.kind === "other") return <UnsupportedPane path={tab.path} />;

  return (
    <div className="viewer">
      <div className="viewer-scroll" ref={scrollRef} onScroll={handleScroll}>
        {doc?.error ? (
          <div className="pane-message error">
            <Icon name="alert" size={22} />
            <span>Cannot open this file</span>
            <code>{doc.error}</code>
          </div>
        ) : doc && doc.content ? (
          <MarkdownView path={tab.path} content={doc.content} articleRef={articleRef} />
        ) : (
          <div className="pane-message">Loading…</div>
        )}
      </div>

      {outlineOpen && toc.length > 1 && (
        <Outline items={toc} activeId={activeId} onSelect={scrollToId} />
      )}
    </div>
  );
}
