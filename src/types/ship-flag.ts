export interface ShipFlag {
  id: string;
  code: string;
  name_ko: string;
  name_en: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SHIP_FLAGS: Omit<ShipFlag, 'id' | 'created_at' | 'updated_at'>[] = [
  { code: 'KR', name_ko: '대한민국', name_en: 'Korea, Republic of', is_active: true, display_order: 1 },
  { code: 'PA', name_ko: '파나마', name_en: 'Panama', is_active: true, display_order: 2 },
  { code: 'LR', name_ko: '라이베리아', name_en: 'Liberia', is_active: true, display_order: 3 },
  { code: 'MH', name_ko: '마셜 제도', name_en: 'Marshall Islands', is_active: true, display_order: 4 },
  { code: 'HK', name_ko: '홍콩', name_en: 'Hong Kong', is_active: true, display_order: 5 },
  { code: 'SG', name_ko: '싱가포르', name_en: 'Singapore', is_active: true, display_order: 6 },
  { code: 'MT', name_ko: '몰타', name_en: 'Malta', is_active: true, display_order: 7 },
  { code: 'BS', name_ko: '바하마', name_en: 'Bahamas', is_active: true, display_order: 8 },
  { code: 'CY', name_ko: '키프로스', name_en: 'Cyprus', is_active: true, display_order: 9 },
  { code: 'IM', name_ko: '맨 섬', name_en: 'Isle of Man', is_active: true, display_order: 10 },
  { code: 'CN', name_ko: '중국', name_en: 'China', is_active: true, display_order: 11 },
  { code: 'JP', name_ko: '일본', name_en: 'Japan', is_active: true, display_order: 12 },
  { code: 'NO', name_ko: '노르웨이', name_en: 'Norway', is_active: true, display_order: 13 },
  { code: 'GB', name_ko: '영국', name_en: 'United Kingdom', is_active: true, display_order: 14 },
  { code: 'GR', name_ko: '그리스', name_en: 'Greece', is_active: true, display_order: 15 },
];