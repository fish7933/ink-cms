import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 선원 표시 이름 — 외국적 선원은 이름(한국어)이 없고 이름(영문)만 있는 경우가 대부분이라
// (한국어 이름은 국적이 대한민국일 때만 입력받음), 목록/헤더 등에서 이름을 보여줄 땐 항상
// 이 헬퍼로 폴백 순서(한국어 → 영문)를 통일해서 쓴다.
export function crewDisplayName(crew: { name?: string | null; name_english?: string | null }): string {
  return crew.name || crew.name_english || '';
}
