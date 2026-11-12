import type { SVGProps } from "react";

export type IconName =
  | "chevron"
  | "chevron-down"
  | "folder"
  | "folder-open"
  | "doc"
  | "image"
  | "close"
  | "search"
  | "refresh"
  | "external"
  | "sun"
  | "moon"
  | "copy"
  | "check"
  | "alert"
  | "sidebar"
  | "outline"
  | "arrow-left"
  | "arrow-right";

function glyph(name: IconName) {
  switch (name) {
    case "chevron":
      return <path d="M6 4l4 4-4 4" />;
    case "chevron-down":
      return <path d="M4 6l4 4 4-4" />;
    case "folder":
      return (
        <path d="M2 4.6A1.6 1.6 0 013.6 3h2.1c.45 0 .87.19 1.17.52L8 4.9h4.4A1.6 1.6 0 0114 6.5v5A1.6 1.6 0 0112.4 13H3.6A1.6 1.6 0 012 11.4V4.6z" />
      );
    case "folder-open":
      return (
        <>
          <path d="M2 11.5V4.6A1.6 1.6 0 013.6 3h2.1c.45 0 .87.19 1.17.52L8 4.9h4.4A1.6 1.6 0 0114 6.5v1" />
          <path d="M2.2 12.6l1.5-5a1 1 0 01.97-.74h9.1a1 1 0 01.97 1.26l-1.2 4.2a1 1 0 01-.96.72H3.2a1 1 0 01-.99-1.24z" />
        </>
      );
    case "doc":
      return (
        <>
          <path d="M3.5 2.6A1.1 1.1 0 014.6 1.5h4.6L12.5 5v8.9a1.1 1.1 0 01-1.1 1.1H4.6a1.1 1.1 0 01-1.1-1.1V2.6z" />
          <path d="M9 1.6V5.2h3.4" />
        </>
      );
    case "image":
      return (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.6" />
          <circle cx="5.8" cy="6.6" r="1.1" />
          <path d="M2.6 12.4l3.2-3.1 2.3 2.3 2-2 3.3 3.2" />
        </>
      );
    case "close":
      return <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />;
    case "search":
      return (
        <>
          <circle cx="6.9" cy="6.9" r="4.2" />
          <path d="M10.2 10.2L14 14" />
        </>
      );
    case "refresh":
      return (
        <>
          <path d="M13.2 8a5.2 5.2 0 11-1.6-3.75" />
          <path d="M13.2 2.8v3.4h-3.4" />
        </>
      );
    case "external":
      return (
        <>
          <path d="M9.2 2.5h4.3v4.3M13.4 2.6L7.6 8.4" />
          <path d="M11.4 9.2v3.3a1.4 1.4 0 01-1.4 1.4H3.6a1.4 1.4 0 01-1.4-1.4V6a1.4 1.4 0 011.4-1.4h3.2" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx="8" cy="8" r="3.1" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
        </>
      );
    case "moon":
      return <path d="M13.4 9.6A5.7 5.7 0 116.4 2.6a4.6 4.6 0 007 7z" />;
    case "copy":
      return (
        <>
          <rect x="5.4" y="5.4" width="8" height="8" rx="1.5" />
          <path d="M10.6 5.4V4.1a1.6 1.6 0 00-1.6-1.6H4.1a1.6 1.6 0 00-1.6 1.6v4.9a1.6 1.6 0 001.6 1.6h1.3" />
        </>
      );
    case "check":
      return <path d="M3 8.6l3 3 7-7.2" />;
    case "alert":
      return (
        <>
          <path d="M8 2.2l6 10.9H2L8 2.2z" />
          <path d="M8 6.3v2.9M8 11.3v.1" />
        </>
      );
    case "sidebar":
      return (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.6" />
          <path d="M6.4 3v10" />
        </>
      );
    case "outline":
      return <path d="M3 4.2h10M3 8h6.6M3 11.8h8.6" />;
    case "arrow-left":
      return <path d="M9.5 3.5L5 8l4.5 4.5" />;
    case "arrow-right":
      return <path d="M6.5 3.5L11 8l-4.5 4.5" />;
    default:
      return null;
  }
}

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {glyph(name)}
    </svg>
  );
}
