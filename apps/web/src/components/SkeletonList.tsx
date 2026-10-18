export function SkeletonList() {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-line bg-surface p-3"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="flex gap-3">
            <div className="flex-1 space-y-2 py-1">
              <div className="h-2.5 w-24 rounded-full bg-soft" />
              <div className="h-4 w-11/12 rounded-md bg-soft" />
              <div className="h-3.5 w-4/5 rounded-md bg-soft" />
              <div className="h-2.5 w-2/5 rounded-full bg-soft" />
            </div>
            <div className="size-[86px] shrink-0 rounded-xl bg-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}
