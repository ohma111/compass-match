'use client';

// チャットの新着の効果音。音のファイルは持たず、Web Audio で短い2音を鳴らす。
// iPhone などは、ページを一度でも触るまで音を出せないので、最初のタップで準備する。
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
    | typeof AudioContext
    | undefined;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** 最初の操作で音を出せるようにしておく */
export function primeChime() {
  const unlock = () => {
    try {
      void context()?.resume();
    } catch {}
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

export function playChime() {
  try {
    const c = context();
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const s = t + i * 0.12;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.15, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
      o.connect(g).connect(c.destination);
      o.start(s);
      o.stop(s + 0.2);
    }
  } catch {
    // 鳴らせなくても続ける
  }
}
