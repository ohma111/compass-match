'use client';
// 開発用プレビュー専用: 初めての参加でランク帯を聞く場面
import { RankPrompt } from '@/components/RankPrompt';

export function RankPromptDemo() {
  return <RankPrompt verb="参加" onConfirmed={() => {}} />;
}
