import type { TFunction } from 'i18next';

// 관리자가 UI 구성 관리에서 영문명(label_en)을 지정했으면 그걸 쓰고, 없으면 개발자가
// 관리하는 번역 사전(t(label))으로 대체 번역한다 — 관리자가 라벨을 커스터마이즈해도
// 영문 전환이 끊기지 않도록.
export function resolveMenuLabel(label: string, labelEn: string | undefined, lang: string, t: TFunction): string {
  if (lang === 'en' && labelEn?.trim()) return labelEn.trim();
  return t(label);
}
