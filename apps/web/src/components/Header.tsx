import { initials, plural } from '../lib/format.js';

interface HeaderProps {
  name: string;
  total: number;
  loading: boolean;
}

export function Header({ name, total, loading }: HeaderProps) {
  return (
    <header className="px-4 pb-2 pt-[calc(0.85rem_+_env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            Личная библиотека
          </p>
          <h1 className="mt-0.5 text-[27px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            Закладки
          </h1>
        </div>

        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-sky-400 via-blue-500 to-indigo-600 text-sm font-semibold text-white shadow-sm ring-2 ring-surface">
          {initials(name)}
        </div>
      </div>

      <p className="mt-1 text-[13px] text-muted">
        {loading && total === 0
          ? 'Собираем библиотеку…'
          : `${total} ${plural(total, 'закладка', 'закладки', 'закладок')}`}
      </p>
    </header>
  );
}

