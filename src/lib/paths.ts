/** Path helpers. Vault paths always use `/` and are relative to the vault root. */

export const MARKDOWN_EXT = ["md", "markdown", "mdown", "mkd", "mkdn"];
export const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"];

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

export function isMarkdown(path: string): boolean {
  return MARKDOWN_EXT.includes(extname(path));
}

export function isImage(path: string): boolean {
  return IMAGE_EXT.includes(extname(path));
}

/** Collapse `.`/`..`, reject paths that climb above the root. */
export function normalize(input: string): string | null {
  const stack: string[] = [];
  for (const raw of input.replace(/\\/g, "/").split("/")) {
    const seg = raw.trim();
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join("/");
}

/**
 * Resolve a link from a Markdown document to a vault-relative path.
 * Supports relative links, root-absolute links (`/img/x.png`), `file://` URLs
 * and percent-encoded names. Returns `null` when the target escapes the vault.
 */
export function resolveLink(
  docPath: string,
  href: string,
  vaultRoot: string | null,
): string | null {
  let raw = href.trim();
  const hashIndex = raw.search(/[?#]/);
  if (hashIndex !== -1) raw = raw.slice(0, hashIndex);
  if (!raw) return null;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep the raw value when it is not valid percent-encoding */
  }
  raw = raw.replace(/\\/g, "/");

  if (raw.startsWith("file://")) {
    const absolute = raw.slice("file://".length);
    if (vaultRoot && absolute.startsWith(vaultRoot.replace(/\/$/, "") + "/")) {
      return normalize(absolute.slice(vaultRoot.replace(/\/$/, "").length + 1));
    }
    return null;
  }
  if (raw.startsWith("/")) return normalize(raw);
  return normalize(`${dirname(docPath)}/${raw}`);
}
