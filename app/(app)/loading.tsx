export default function AppLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top loading bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden">
        <div className="h-full bg-wk-red animate-loading-bar" />
      </div>

      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded animate-shimmer" />
        <div className="h-8 w-48 rounded animate-shimmer" />
        <div className="h-3 w-32 rounded animate-shimmer" />
      </div>

      {/* Content skeleton — cards */}
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-white/15 rounded-full animate-shimmer" />
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <div className="h-3 w-20 rounded animate-shimmer" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="px-5 py-5 border-b border-white/5 last:border-0 flex items-center gap-3">
            <div className="h-4 w-4 rounded animate-shimmer shrink-0" />
            <div className="flex-1 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-5 w-7 rounded-sm animate-shimmer shrink-0" />
                <div className="h-4 w-24 rounded animate-shimmer" />
              </div>
              <div className="h-7 w-16 rounded animate-shimmer shrink-0" />
              <div className="flex-1 flex items-center gap-3 justify-end">
                <div className="h-4 w-24 rounded animate-shimmer" />
                <div className="h-5 w-7 rounded-sm animate-shimmer shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Second card */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <div className="h-3 w-32 rounded animate-shimmer" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="px-5 py-2.5 border-b border-white/5 last:border-0 flex items-center gap-3">
            <div className="h-3 w-4 rounded animate-shimmer shrink-0" />
            <div className="h-4 w-5 rounded-sm animate-shimmer shrink-0" />
            <div className="h-3 flex-1 rounded animate-shimmer" />
            <div className="h-3 w-10 rounded animate-shimmer shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
