import type { ChangeEvent } from 'react';
import { CloseIcon, SearchIcon } from './Icons.js';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder="Поиск по заметкам и заголовкам"
        aria-label="Поиск по закладкам"
        className="h-11 w-full appearance-none rounded-2xl border border-line bg-surface pl-10 pr-10 text-[16px] text-ink shadow-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted transition active:bg-soft"
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
