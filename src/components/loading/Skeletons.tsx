/** 読み込み中の骨組み。本物の画面と同じ寸法で置き、出てきたときに位置がずれないようにする */

function Bar({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skel block ${className}`} />;
}

export function LoadingLabel() {
  return (
    <p role="status" className="sr-only">
      読み込み中
    </p>
  );
}

export function HomeSkeleton() {
  return (
    <div>
      <LoadingLabel />
      <div className="flex items-end justify-between gap-3">
        <Bar className="h-8 w-56" />
        <Bar className="h-6 w-24" />
      </div>
      <div className="mt-5 flex gap-2 overflow-hidden">
        {[4.5, 5.75, 7, 6.5].map((w, i) => (
          <span key={i} style={{ width: `${w}rem` }} className="shrink-0">
            <Bar className="h-11" />
          </span>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} delay={i * 70} />
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="sheet skel-card px-4 pt-4 pb-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex justify-between">
        <Bar className="h-7 w-28" />
        <Bar className="h-4 w-14" />
      </div>
      <Bar className="mt-4 h-5 w-4/5" />
      <Bar className="mt-2 h-4 w-1/3" />
      <Bar className="mt-4 h-4 w-3/5" />
      <div className="mt-4 flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          <Bar className="skel-seat h-11 flex-1" />
          <Bar className="skel-seat h-11 flex-1" />
          <Bar className="skel-seat h-11 flex-1" />
        </div>
        <Bar className="h-11 w-[8.75rem]" />
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div>
      <LoadingLabel />
      <Bar className="h-4 w-20" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
        <div>
          <Bar className="h-4 w-16" />
          <Bar className="mt-3 h-14 w-64" />
          <Bar className="mt-3 h-4 w-40" />
          <Bar className="mt-5 h-7 w-4/5" />
          <Bar className="mt-3 h-5 w-1/2" />
        </div>
        <Bar className="h-20 self-end" />
      </div>
      <div className="mt-10 flex justify-between">
        <Bar className="h-5 w-20" />
        <Bar className="h-5 w-24" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 lg:gap-6">
        {[0, 1, 2].map((i) => (
          <Bar key={i} className="skel-seat aspect-[4/5] lg:aspect-[5/4]" />
        ))}
      </div>
      <Bar className="mx-auto mt-8 h-14 w-full max-w-md" />
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-xl">
      <LoadingLabel />
      <Bar className="h-9 w-40" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="sheet skel-card flex items-center gap-3 p-4" style={{ animationDelay: `${i * 70}ms` }}>
            <Bar className="size-10 shrink-0" />
            <div className="flex-1">
              <Bar className="h-4 w-3/5" />
              <Bar className="mt-2 h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
