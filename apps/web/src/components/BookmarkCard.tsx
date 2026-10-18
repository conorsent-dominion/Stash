import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { domainOf, gradientFor, relativeDate } from '../lib/format.js';
import { hapticTap, openExternal } from '../lib/telegram.js';
import type { Bookmark } from '../lib/types.js';
import { TrashIcon } from './Icons.js';

interface BookmarkCardProps {
  item: Bookmark;
  onDelete: (id: string) => void;
  onTagClick: (slug: string) => void;
}

export function BookmarkCard({ item, onDelete, onTagClick }: BookmarkCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.preview) && !imageFailed;

  const open = () => {
    hapticTap();
    openExternal(item.url);
  };

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Открыть ${item.title}`}
      onClick={open}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      className="group cursor-pointer rounded-2xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition active:scale-[0.992] active:bg-soft/40"
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="max-w-[10rem] truncate font-medium text-muted">{domainOf(item.url)}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.createdAt} className="shrink-0">
              {relativeDate(item.createdAt)}
            </time>
          </div>

          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink">
            {item.title}
          </h3>

          {item.userNote && (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-muted">
              {item.userNote}
            </p>
          )}

          <div className="mt-2 flex min-h-6 items-center gap-1.5">
            {item.tags.slice(0, 2).map((tag) => (
              <button
                key={tag.slug}
                type="button"
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  hapticTap();
                  onTagClick(tag.slug);
                }}
                className="max-w-[7rem] truncate rounded-md bg-soft px-1.5 py-0.5 text-[10.5px] font-medium text-muted transition active:bg-line"
              >
                #{tag.name}
              </button>
            ))}
            {item.tags.length > 2 && (
              <span className="text-[10.5px] text-muted">+{item.tags.length - 2}</span>
            )}

            <button
              type="button"
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                hapticTap();
                onDelete(item.id);
              }}
              aria-label={`Удалить ${item.title}`}
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted/70 transition hover:text-ink active:bg-soft"
            >
              <TrashIcon className="size-[15px]" />
            </button>
          </div>
        </div>

        <div className="shrink-0">
          {showImage ? (
            <img
              src={item.preview!}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="size-[86px] rounded-xl bg-soft object-cover"
            />
          ) : (
            <div
              className={`grid size-[86px] place-items-center rounded-xl bg-linear-to-br ${gradientFor(
                domainOf(item.url),
              )}`}
            >
              <span className="text-lg font-semibold text-white/90">
                {domainOf(item.url).slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
