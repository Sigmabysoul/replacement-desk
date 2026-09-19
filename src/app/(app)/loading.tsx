export default function AppLoading() {
  return (
    <div className="grid gap-5 sm:gap-8 animate-pulse w-full max-w-full overflow-hidden">
      {/* Top progress bar for instant feedback */}
      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 shadow-sm animate-pulse" />

      {/* 1. Header/Hero Skeleton */}
      <div className="h-28 sm:h-32 w-full rounded-3xl border border-border/80 bg-card/60" />

      {/* 2. Search/Filter Skeleton */}
      <div className="h-12 w-full rounded-2xl border border-border/80 bg-card/60" />

      {/* 3. Dual Pipeline / Cards Skeleton */}
      <div className="grid gap-5 sm:gap-7 lg:grid-cols-2">
        <div className="h-64 w-full rounded-3xl border border-border bg-card/60 p-5">
          <div className="h-8 w-48 rounded-lg bg-muted mb-4" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted/50" />
            ))}
          </div>
        </div>

        <div className="h-64 w-full rounded-3xl border border-border bg-card/60 p-5">
          <div className="h-8 w-48 rounded-lg bg-muted mb-4" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted/50" />
            ))}
          </div>
        </div>
      </div>

      {/* 4. Feeds Skeletons */}
      <div className="grid gap-5 sm:gap-7 lg:grid-cols-2">
        <div className="h-48 rounded-3xl border border-border bg-card/60" />
        <div className="h-48 rounded-3xl border border-border bg-card/60" />
      </div>
    </div>
  );
}

