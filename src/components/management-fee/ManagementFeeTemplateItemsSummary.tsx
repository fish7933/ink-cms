import { Badge } from '@/components/ui/badge';
import type { ManagementFeeTemplateItem, ManagementFeeItem } from '@/lib/management-fee-store';
import type { Nationality } from '@/types/nationality';

const BILLING_BASIS_LABEL: Record<string, string> = {
  monthly: '월정기(일할)',
  one_time: '1회성(승선월)',
  actual_cost: '실비(수기)',
};

interface ManagementFeeTemplateItemsSummaryProps {
  items: (ManagementFeeTemplateItem & { fee_item: ManagementFeeItem })[];
  nationalities?: Nationality[];
}

// 읽기전용 템플릿 항목 표시 — 템플릿 상세/갱신 히스토리에서 재사용
export default function ManagementFeeTemplateItemsSummary({ items, nationalities = [] }: ManagementFeeTemplateItemsSummaryProps) {
  const nationalityNameByCode = new Map(nationalities.map(n => [n.country_code, n.country_name_ko]));

  const groups = new Map<string, { feeItem: ManagementFeeItem; rows: ManagementFeeTemplateItem[] }>();
  for (const item of items) {
    const key = item.fee_item_id;
    const g = groups.get(key) || { feeItem: item.fee_item, rows: [] };
    g.rows.push(item);
    groups.set(key, g);
  }

  if (groups.size === 0) {
    return <div className="text-center py-6 text-sm text-gray-400 border rounded-md">등록된 청구 항목이 없습니다.</div>;
  }

  return (
    <div className="space-y-3">
      {[...groups.values()].map(g => {
        const cap = g.rows.find(r => r.ship_cap_amount != null);
        return (
          <div key={g.feeItem.id} className="border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
              <span className="text-sm font-semibold">{g.feeItem.name}</span>
              {cap && (
                <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
                  선박당 월 상한 {Number(cap.ship_cap_amount).toLocaleString()} {cap.currency}
                </Badge>
              )}
            </div>
            <div className="divide-y">
              {g.rows.map(row => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-1.5 text-xs">
                  <span className="text-gray-500 w-16">
                    {row.rank_category === 'officer' ? '사관' : row.rank_category === 'rating' ? '부원' : '직급 전체'}
                  </span>
                  <span className="text-gray-500 w-20">
                    {row.nationality_code ? (nationalityNameByCode.get(row.nationality_code) || row.nationality_code) : '국적 전체'}
                  </span>
                  <span className="text-gray-500 w-24">{row.ship_type || '선종 전체'}</span>
                  <span className="text-gray-400">{BILLING_BASIS_LABEL[row.billing_basis]}</span>
                  <span className="ml-auto font-medium">
                    {row.billing_basis === 'actual_cost' ? '수기 입력' : `${Number(row.amount).toLocaleString()} ${row.currency}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
