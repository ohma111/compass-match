'use client';
import { startTransition } from 'react';

/**
 * <form action={...}> は送信が終わると入力欄を初期値に戻す (React 19)。
 * エラーで戻ってきたときに書いた内容が消えるので、onSubmit から自分で送る。
 * 使い方: const [state, dispatch, pending] = useActionState(action, null);
 *        <form onSubmit={keepForm(dispatch)}>
 */
export function keepForm(dispatch: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    let fd: FormData;
    try {
      fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter);
    } catch {
      fd = new FormData(form);
    }
    startTransition(() => dispatch(fd));
  };
}
