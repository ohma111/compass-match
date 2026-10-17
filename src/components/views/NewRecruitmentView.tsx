import Link from '@/components/Link';
import { CreateRecruitmentForm } from '@/components/CreateRecruitmentForm';
import type { PlayRole } from '@/lib/constants';

/** 募集作成 (タップ式1画面) */
export function NewRecruitmentView({
  auth,
  serverNow,
  src,
  ownerName,
  discord = '',
  ownerRoles = [],
}: {
  auth: 'guest' | 'no-profile' | 'ready';
  serverNow: string;
  src: string;
  ownerName?: string | null;
  discord?: string;
  ownerRoles?: PlayRole[];
}) {
  return (
    <div>
      <div className="mb-8 lg:mb-12">
        <h1 className="font-black tracking-[-0.01em] text-[26px] leading-tight lg:text-[40px]">募集する</h1>
        <Link href="/guide" className="mt-2 inline-flex min-h-11 items-center text-[13px] font-bold text-slate underline underline-offset-4 decoration-ink/40 hover:text-ink">
          使い方
        </Link>
      </div>
      <CreateRecruitmentForm auth={auth} serverNow={serverNow} src={src} ownerName={ownerName} discord={discord} ownerRoles={ownerRoles} />
    </div>
  );
}
