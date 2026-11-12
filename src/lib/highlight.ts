import { createHighlighter, type Highlighter } from "shiki";

const LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "css",
  "diff",
  "docker",
  "go",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kotlin",
  "lua",
  "md",
  "php",
  "python",
  "ruby",
  "rust",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "xml",
  "yaml",
];

let highlighterPromise: Promise<Highlighter> | null = null;
const renderCache = new Map<string, string>();

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ["github-dark", "github-light"],
    langs: LANGUAGES,
  });
  return highlighterPromise;
}

const ALIASES: Record<string, string> = {
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  console: "bash",
  javascript: "js",
  typescript: "ts",
  yml: "yaml",
  markdown: "md",
  py: "python",
  rs: "rust",
  "c++": "cpp",
  "c#": "csharp",
  golang: "go",
  dockerfile: "docker",
  jsonc: "json",
};

/**
 * Highlight a fenced code block. Falls back to plain text for unknown
 * languages and returns `null` while the highlighter is still loading.
 */
export async function highlight(
  code: string,
  lang: string,
  dark: boolean,
): Promise<string | null> {
  const normalized = ALIASES[lang] ?? lang;
  const theme = dark ? "github-dark" : "github-light";
  const key = `${theme}\u0000${normalized}\u0000${code}`;
  const cached = renderCache.get(key);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  const use = loaded.includes(normalized) ? normalized : "text";

  const html = highlighter.codeToHtml(code, { lang: use, theme });
  if (renderCache.size > 300) renderCache.clear();
  renderCache.set(key, html);
  return html;
}

export const SHIKI_THEME_BACKGROUND: Record<"github-dark" | "github-light", string> = {
  "github-dark": "#0d1117",
  "github-light": "#ffffff",
};
