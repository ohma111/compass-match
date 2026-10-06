import { CreateRecruitmentForm } from '@/components/CreateRecruitmentForm';

/** 募集作成 (タップ式1画面) */
export function NewRecruitmentView({
  auth,
  serverNow,
  src,
  ownerName,
  discord = '',
}: {
  auth: 'guest' | 'no-profile' | 'ready';
  serverNow: string;
  src: string;
  ownerName?: string | null;
  discord?: string;
}) {
  return (
    <div>
      <div className="mb-8 lg:mb-12">
        <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[40px]">募集する</h1>
      </div>
      <CreateRecruitmentForm auth={auth} serverNow={serverNow} src={src} ownerName={ownerName} discord={discord} />
    </div>
  );
}
