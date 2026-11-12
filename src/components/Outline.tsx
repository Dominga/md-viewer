export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function Outline({
  items,
  activeId,
  onSelect,
}: {
  items: TocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="outline" aria-label="Outline">
      <div className="outline-title">Outline</div>
      <div className="outline-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={`outline-item level-${item.level}${item.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(item.id)}
            title={item.text}
          >
            {item.text}
          </button>
        ))}
      </div>
    </aside>
  );
}
