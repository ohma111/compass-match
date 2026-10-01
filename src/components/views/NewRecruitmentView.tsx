import { CreateRecruitmentForm } from '@/components/CreateRecruitmentForm';

/** 募集作成 (タップ式1画面) */
export function NewRecruitmentView({
  auth,
  serverNow,
  src,
  ownerName,
}: {
  auth: 'guest' | 'no-profile' | 'ready' | 'needs-rank';
  serverNow: string;
  src: string;
  ownerName?: string | null;
}) {
  return (
    <div>
      <div className="mb-7 lg:mb-10">
        <h1 className="font-display text-[26px] leading-tight lg:text-[40px]">募集する</h1>
        <p className="mt-2 text-sm text-slate">タップで選んで「募集する」を押すだけ。終わりの時刻は開始の1時間後になります。</p>
      </div>
      <CreateRecruitmentForm auth={auth} serverNow={serverNow} src={src} ownerName={ownerName} />
    </div>
  );
}
