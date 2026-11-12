import {
  Children,
  createContext,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useStore } from "../state/store";
import { isImage, isMarkdown, resolveLink } from "../lib/paths";
import { useAsset } from "../lib/assets";
import { api } from "../lib/api";
import { CodeBlock } from "./CodeBlock";
import { Icon } from "./Icons";

const DocPathContext = createContext<string>("");

/**
 * Sanitization schema: GitHub's defaults plus `id` (needed for heading anchors
 * produced by rehype-slug) and `className`.
 */
const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "id", "className"],
  },
};

/** Keep `file:` and `data:` image sources while dropping scriptable URLs. */
function urlTransform(url: string, key: string): string {
  const value = url.trim();
  if (/^(javascript|vbscript):/i.test(value)) return "";
  if (key === "href" && /^data:/i.test(value)) return "";
  return value;
}

function extractText(node: ReactNode): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as object)) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function Pre({ children }: { children?: ReactNode }) {
  const first = Children.toArray(children)[0] as
    | ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;
  if (!first || typeof first !== "object") return <pre>{children}</pre>;

  const className = typeof first.props?.className === "string" ? first.props.className : "";
  const lang = /language-([\w+#.-]+)/.exec(className)?.[1] ?? "";
  const code = extractText(first.props?.children).replace(/\n$/, "");
  return <CodeBlock code={code} lang={lang} />;
}

function InlineCode({ children, className }: { children?: ReactNode; className?: string }) {
  return <code className={`inline-code${className ? ` ${className}` : ""}`}>{children}</code>;
}

function ImageSkeleton({ label }: { label: string }) {
  return (
    <div className="image-skeleton" role="img" aria-label={label}>
      <Icon name="image" size={22} />
      <span>{label}</span>
    </div>
  );
}

function ImageFallback({ path, reason }: { path: string; reason: string }) {
  return (
    <div className="image-fallback" role="img" aria-label={`${reason}: ${path}`}>
      <Icon name="alert" size={18} />
      <div className="image-fallback-text">
        <strong>{reason}</strong>
        <code>{path || "(empty source)"}</code>
      </div>
    </div>
  );
}

function MarkdownImage({
  src,
  alt,
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  const docPath = useContext(DocPathContext);
  const root = useStore((state) => state.root);
  const fsTick = useStore((state) => state.fsTick);
  const setLightbox = useStore((state) => state.setLightbox);

  const external = !!src && /^(https?:|data:)/i.test(src);
  const resolved = useMemo(
    () => (!src || external ? null : resolveLink(docPath, src, root)),
    [docPath, src, root, external],
  );

  const { status, url } = useAsset(external ? null : resolved, fsTick);

  if (external) {
    return (
      <figure className="md-image">
        <img src={src} alt={alt ?? ""} title={title} loading="lazy" />
        {alt ? <figcaption>{alt}</figcaption> : null}
      </figure>
    );
  }

  if (!resolved) {
    return <ImageFallback path={src ?? ""} reason="Image is outside the vault" />;
  }

  if (status === "error") {
    return <ImageFallback path={resolved} reason="Image not found" />;
  }

  if (status === "loading" || !url) {
    return <ImageSkeleton label={alt || resolved} />;
  }

  return (
    <figure className="md-image">
      <button
        className="image-button"
        onClick={() => setLightbox({ url, alt: alt ?? "", path: resolved })}
        title="Click to enlarge"
      >
        <img src={url} alt={alt ?? ""} title={title} loading="lazy" />
      </button>
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  );
}

/** Small inline thumbnail shown next to links that point at a local image. */
function LinkThumb({ rel }: { rel: string }) {
  const fsTick = useStore((state) => state.fsTick);
  const { status, url } = useAsset(rel, fsTick);
  if (status !== "ready" || !url) return null;
  return <img className="link-thumb" src={url} alt="" />;
}

function scrollToAnchor(hash: string) {
  const raw = hash.replace(/^#/, "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep the raw value */
  }
  const target = document.getElementById(decoded) ?? document.getElementById(raw);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function MarkdownLink({
  href,
  children,
  title,
}: {
  href?: string;
  children?: ReactNode;
  title?: string;
}) {
  const docPath = useContext(DocPathContext);
  const root = useStore((state) => state.root);
  const openFile = useStore((state) => state.openFile);
  const showToast = useStore((state) => state.showToast);

  const anchor = !!href && href.startsWith("#");
  const external = !!href && /^(https?:|mailto:)/i.test(href);
  const resolved =
    href && !anchor && !external ? resolveLink(docPath, href, root) : null;
  const imageTarget = resolved && isImage(resolved) ? resolved : null;

  const onClick = async (event: React.MouseEvent) => {
    if (!href) return;

    if (anchor) {
      event.preventDefault();
      scrollToAnchor(href);
      return;
    }
    if (external) {
      event.preventDefault();
      try {
        await api.openExternal(href);
      } catch (error) {
        showToast(String(error), "error");
      }
      return;
    }

    event.preventDefault();
    if (!resolved) {
      showToast(`Link points outside the vault: ${href}`, "error");
      return;
    }
    try {
      const meta = await api.assetMeta(resolved);
      if (!meta.exists) {
        showToast(`File not found: ${resolved}`, "error");
        return;
      }
    } catch (error) {
      showToast(String(error), "error");
      return;
    }

    if (isMarkdown(resolved) || isImage(resolved)) {
      await openFile(resolved);
    } else {
      try {
        await api.openPathOs(resolved);
      } catch (error) {
        showToast(String(error), "error");
      }
    }
  };

  return (
    <a href={href} title={title} onClick={onClick} className={imageTarget ? "link-image" : undefined}>
      {children}
      {imageTarget ? <LinkThumb rel={imageTarget} /> : null}
    </a>
  );
}

export function MarkdownView({
  path,
  content,
  articleRef,
}: {
  path: string;
  content: string;
  articleRef: RefObject<HTMLDivElement | null>;
}) {
  const components = useMemo<Components>(
    () => ({
      pre: Pre as Components["pre"],
      code: InlineCode as Components["code"],
      img: MarkdownImage as Components["img"],
      a: MarkdownLink as Components["a"],
      table: ({ children }) => (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      ),
    }),
    [],
  );

  return (
    <DocPathContext.Provider value={path}>
      <article className="markdown" ref={articleRef}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSlug, [rehypeSanitize, sanitizeSchema]]}
          urlTransform={urlTransform}
          components={components}
        >
          {content}
        </Markdown>
      </article>
    </DocPathContext.Provider>
  );
}
