import type { ReactNode } from 'react';
import { openExternal } from '../lib/telegram.js';
import { BookmarkIcon, SearchIcon, SparkIcon, TelegramIcon } from './Icons.js';

interface EmptyStateProps {
  kind: 'empty' | 'search' | 'error';
  message?: string;
  botUrl?: string;
  onReset?: () => void;
  onRetry?: () => void;
}

export function EmptyState({ kind, message, botUrl, onReset, onRetry }: EmptyStateProps) {
  if (kind === 'error') {
    return (
      <Shell
        icon={<SparkIcon className="size-6" />}
        title="Что-то пошло не так"
        description={message ?? 'Не удалось загрузить закладки.'}
      >
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink transition active:scale-[0.98]"
          >
            Попробовать снова
          </button>
        )}
      </Shell>
    );
  }

  if (kind === 'search') {
    return (
      <Shell
        icon={<SearchIcon className="size-6" />}
        title="Ничего не нашлось"
        description="Попробуйте другой запрос или сбросьте фильтры."
      >
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="h-10 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink transition active:scale-[0.98]"
          >
            Сбросить фильтры
          </button>
        )}
      </Shell>
    );
  }

  return (
    <Shell
      icon={<BookmarkIcon className="size-6" />}
      title="Библиотека пока пуста"
      description="Перешли боту ссылку с заметкой и хэштегами — она появится здесь через пару секунд."
    >
      {botUrl && (
        <button
          type="button"
          onClick={() => openExternal(botUrl)}
          className="flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink transition active:scale-[0.98]"
        >
          <TelegramIcon className="size-4" />
          Открыть бота
        </button>
      )}
    </Shell>
  );
}

interface ShellProps {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

function Shell({ icon, title, description, children }: ShellProps) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-soft text-muted">{icon}</div>
      <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-muted">{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
