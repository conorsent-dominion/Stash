import type { TagWithCount } from '../lib/types.js';

interface TagFilterProps {
  tags: TagWithCount[];
  activeTag: string | null;
  total: number;
  onSelect: (slug: string | null) => void;
}

export function TagFilter({ tags, activeTag, total, onSelect }: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Chip label="Все" count={total} active={activeTag === null} onClick={() => onSelect(null)} />
      {tags.map((tag) => (
        <Chip
          key={tag.slug}
          label={tag.name}
          count={tag.itemCount}
          active={activeTag === tag.slug}
          onClick={() => onSelect(activeTag === tag.slug ? null : tag.slug)}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function Chip({ label, count, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-[0.97] ${
        active
          ? 'border-accent bg-accent text-accent-ink shadow-sm'
          : 'border-line bg-surface text-ink'
      }`}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      <span className={`text-[11px] tabular-nums ${active ? 'opacity-70' : 'text-muted'}`}>
        {count}
      </span>
    </button>
  );
}
