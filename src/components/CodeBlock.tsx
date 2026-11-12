import { useEffect, useState } from "react";
import { highlight } from "../lib/highlight";
import { copyText } from "../lib/clipboard";
import { useStore } from "../state/store";
import { Icon } from "./Icons";

const COPIED_TIMEOUT = 1600;

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const theme = useStore((state) => state.theme);
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    highlight(code, lang, theme === "dark")
      .then((result) => {
        if (alive) setHtml(result);
      })
      .catch(() => {
        if (alive) setHtml(null);
      });
    return () => {
      alive = false;
    };
  }, [code, lang, theme]);

  const onCopy = async () => {
    if (!(await copyText(code))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_TIMEOUT);
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang || "text"}</span>
        <button className="code-copy" onClick={() => void onCopy()} title="Copy code">
          <Icon name={copied ? "check" : "copy"} size={13} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {html ? (
        // Shiki output is generated from the document itself and is safe to inject.
        <div className="code-body shiki" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="code-body">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
