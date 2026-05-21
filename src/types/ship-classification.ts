export interface ShipType {
  id: string;
  name: string;
  name_ko: string;
  category: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ShipSizeClassification {
  id: string;
  name: string;
  name_ko: string;
  ship_type_id?: number;
  min_gt?: number;
  max_gt?: number;
  min_dwt?: number;
  max_dwt?: number;
  dwt_gt_ratio?: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export const SHIP_CATEGORIES = [
  { value: '화물선', label: '화물선' },
  { value: '탱커', label: '탱커' },
  { value: '여객선', label: '여객선' },
  { value: '해양플랜트', label: '해양플랜트' },
  { value: '해양지원선', label: '해양지원선' },
  { value: '예인선', label: '예인선' },
  { value: '작업선', label: '작업선' },
  { value: '특수선', label: '특수선' },
  { value: '어선', label: '어선' },
  { value: '레저선박', label: '레저선박' },
  { value: '관공선', label: '관공선' },
  { value: '기타선박', label: '기타선박' },
];

export const CATEGORY_COLORS: Record<string, string> = {
  '화물선': 'bg-amber-100 text-amber-800',
  '탱커': 'bg-blue-100 text-blue-800',
  '여객선': 'bg-pink-100 text-pink-800',
  '해양플랜트': 'bg-indigo-100 text-indigo-800',
  '해양지원선': 'bg-teal-100 text-teal-800',
  '예인선': 'bg-orange-100 text-orange-800',
  '작업선': 'bg-yellow-100 text-yellow-800',
  '특수선': 'bg-purple-100 text-purple-800',
  '어선': 'bg-cyan-100 text-cyan-800',
  '레저선박': 'bg-rose-100 text-rose-800',
  '관공선': 'bg-emerald-100 text-emerald-800',
  '기타선박': 'bg-gray-100 text-gray-800',
};

export const DEFAULT_SHIP_TYPES: Omit<ShipType, 'id' | 'created_at' | 'updated_at'>[] = [];
export const DEFAULT_SIZE_CLASSIFICATIONS: Omit<ShipSizeClassification, 'id' | 'created_at' | 'updated_at'>[] = [];