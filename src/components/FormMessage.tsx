import type { ActionResult } from '@/lib/types';

export function FormMessage({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok) return <p className="alert-error" role="alert">{state.error}</p>;
  if (state.message) return <p className="alert-ok" role="status">{state.message}</p>;
  return null;
}
