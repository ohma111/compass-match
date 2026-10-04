import { LoadingSignal } from './LoadingSignal';

/**
 * 読み込み中の骨組み。本物の画面と同じ寸法で置き、出てきたときに位置がずれないようにする。
 * 時間割は罫を左から引き、時刻の列を「--:--」で先に見せる。
 */
function Bar({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skel block ${className}`} />;
}

export function LoadingLabel() {
  return <LoadingSignal />;
}

function RowSkeleton({ i }: { i: number }) {
  return (
    <div className="relative grid grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[132px_minmax(0,1fr)]">
      <span aria-hidden className="rule-draw absolute inset-x-0 top-0 h-[2px] bg-ink" style={{ animationDelay: `${i * 60}ms` }} />
      <p aria-hidden className="type-time pt-3 text-[30px] text-ink/15 lg:pt-5 lg:text-[44px]">
        --:--
      </p>
      <div className="border-l border-ink/30 pt-3 pb-4 pl-3 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end lg:gap-8 lg:pt-5 lg:pb-6 lg:pl-6">
        <div>
          <Bar className="h-3 w-40" />
          <Bar className="mt-2.5 h-5 w-4/5 lg:h-6" />
          <Bar className="mt-2.5 h-3 w-3/5" />
        </div>
        <div className="mt-3 flex items-center gap-2.5 lg:mt-0">
          <div className="flex flex-1 gap-1 px-1.5">
            <Bar className="h-10 flex-1 [transform:skewX(var(--seat-skew))]" />
            <Bar className="h-10 flex-1 [transform:skewX(var(--seat-skew))]" />
            <Bar className="h-10 flex-1 [transform:skewX(var(--seat-skew))]" />
          </div>
          <Bar className="h-12 w-[7.5rem] lg:w-[8.5rem]" />
        </div>
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
      <LoadingSignal />
      <div>
        <Bar className="h-3 w-36" />
        <p aria-hidden className="type-poster mt-1 text-[64px] text-ink/10 lg:text-[112px]">
          TIME
          <br />
          TABLE
        </p>
        <div className="mt-4 flex gap-1.5 overflow-hidden lg:mt-6 lg:flex-wrap">
          {[4.5, 5.25, 6.5, 6].map((w, i) => (
            <span key={i} style={{ width: `${w}rem` }} className="shrink-0">
              <Bar className="h-11" />
            </span>
          ))}
        </div>
      </div>
      <div className="mt-5 border-b-2 border-ink/30 lg:mt-0">
        {Array.from({ length: 5 }, (_, i) => (
          <RowSkeleton key={i} i={i} />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div>
      <LoadingSignal />
      <Bar className="h-4 w-20" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
        <div>
          <Bar className="h-3 w-40" />
          <p aria-hidden className="type-poster mt-2 text-[88px] text-ink/10 sm:text-[120px] lg:text-[168px]">
            --:--
          </p>
          <Bar className="mt-4 h-7 w-4/5" />
          <Bar className="mt-3 h-4 w-1/2" />
        </div>
        <Bar className="h-20 self-end" />
      </div>
      <div className="relative mt-10 flex justify-between pt-3">
        <span aria-hidden className="rule-draw absolute inset-x-0 top-0 h-[2px] bg-ink" />
        <Bar className="h-5 w-20" />
        <Bar className="h-5 w-24" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5 px-5 sm:px-7">
        {[0, 1, 2].map((i) => (
          <Bar key={i} className="h-44 [transform:skewX(var(--seat-skew))] sm:h-52" />
        ))}
      </div>
      <Bar className="mx-auto mt-8 h-14 w-full max-w-md" />
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-xl">
      <LoadingSignal />
      <Bar className="h-9 w-40" />
      <div className="mt-6 border-b-2 border-ink/30">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="relative flex items-center gap-3 py-4">
            <span aria-hidden className="rule-draw absolute inset-x-0 top-0 h-[2px] bg-ink" style={{ animationDelay: `${i * 60}ms` }} />
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
