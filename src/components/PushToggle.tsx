'use client';
import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { deletePushSubscriptionAction, savePushSubscriptionAction } from '@/app/actions';

type State = 'loading' | 'unsupported' | 'ios-home' | 'denied' | 'off' | 'on';

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * この端末にプッシュ通知を送るかどうか。
 * iPhone はホーム画面に追加したアプリからしか通知を受け取れない (iOS 16.4 以降) ので、その場合は追加の手順を出す。
 */
export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(isIos() && !isStandalone() ? 'ios-home' : 'unsupported');
        return;
      }
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const res = await fetch('/api/push/key');
      if (!res.ok) throw new Error('key');
      const { publicKey } = (await res.json()) as { publicKey: string };
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscriptionAction({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      if (!r.ok) {
        await sub.unsubscribe();
        setMsg(r.error);
        return;
      }
      setState('on');
    } catch {
      setMsg('通知をオンにできませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <div className="h-12" aria-hidden />;

  return (
    <div className="space-y-2">
      {state === 'on' ? (
        <button type="button" onClick={turnOff} disabled={busy} className="btn-outline w-full">
          <BellOff className="size-4" aria-hidden />
          この端末の通知をオフ
        </button>
      ) : state === 'off' ? (
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary w-full">
          <BellRing className="size-4" aria-hidden />
          {busy ? '設定中…' : 'この端末に通知を送る'}
        </button>
      ) : state === 'ios-home' ? (
        <div className="border-2 border-ink p-3 text-[13px] leading-relaxed">
          <p className="font-black">iPhone で通知を受け取るには</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>Safari の共有ボタン → 「ホーム画面に追加」</li>
            <li>ホーム画面のコンパスマッチを開く</li>
            <li>マイページでこのボタンを押す</li>
          </ol>
        </div>
      ) : state === 'denied' ? (
        <p className="text-[13px] text-slate">通知がブロックされています。端末の設定で、このサイトの通知を許可してください。</p>
      ) : (
        <p className="text-[13px] text-slate">このブラウザは通知に対応していません。</p>
      )}
      {msg && <p className="text-[13px] font-bold text-signal-deep" role="alert">{msg}</p>}
    </div>
  );
}
