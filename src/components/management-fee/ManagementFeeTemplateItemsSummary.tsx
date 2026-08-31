import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ManagementFeeTemplateItem, ManagementFeeItem } from '@/lib/management-fee-store';
import type { Nationality } from '@/types/nationality';

const BILLING_BASIS_LABEL: Record<string, string> = {
  monthly: '월정기(일할)',
  monthly_flat: '월정기(전액)',
  one_time: '1회성(승선월)',
  actual_cost: '실비(수기)',
};

interface ManagementFeeTemplateItemsSummaryProps {
  items: (ManagementFeeTemplateItem & { fee_item: ManagementFeeItem })[];
  nationalities?: Nationality[];
}

// 읽기전용 템플릿 항목 표시 — 급여 템플릿의 직급×항목 매트릭스 표처럼, 청구 항목 전체를
// 하나의 표로 한눈에 볼 수 있게 한다. 템플릿 상세/갱신 히스토리에서 재사용.
export default function ManagementFeeTemplateItemsSummary({ items, nationalities = [] }: ManagementFeeTemplateItemsSummaryProps) {
  const nationalityNameByCode = new Map(nationalities.map(n => [n.country_code, n.country_name_ko]));

  if (items.length === 0) {
    return <div className="text-center py-6 text-sm text-gray-400 border rounded-md">등록된 청구 항목이 없습니다.</div>;
  }

  const capByFeeItem = new Map<string, ManagementFeeTemplateItem>();
  for (const item of items) {
    if (item.ship_cap_amount != null && !capByFeeItem.has(item.fee_item_id)) capByFeeItem.set(item.fee_item_id, item);
  }

  const sorted = [...items].sort((a, b) => (a.fee_item.display_order - b.fee_item.display_order) || (a.rank_category || '').localeCompare(b.rank_category || ''));

  let prevFeeItemId: string | null = null;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">청구 항목</TableHead>
            <TableHead className="text-xs">직급구분</TableHead>
            <TableHead className="text-xs">국적</TableHead>
            <TableHead className="text-xs">과금 방식</TableHead>
            <TableHead className="text-xs text-right">금액</TableHead>
            <TableHead className="text-xs">상한</TableHead>
            <TableHead className="text-xs">부가세</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(row => {
            const isNewGroup = row.fee_item_id !== prevFeeItemId;
            prevFeeItemId = row.fee_item_id;
            const cap = capByFeeItem.get(row.fee_item_id);
            return (
              <TableRow key={row.id} className={isNewGroup ? 'border-t-2' : ''}>
                <TableCell className="text-xs font-semibold">{isNewGroup ? row.fee_item.name : ''}</TableCell>
                <TableCell className="text-xs text-gray-500">
                  {row.rank_category === 'officer' ? '사관' : row.rank_category === 'rating' ? '부원' : '전체'}
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {row.nationality_code ? (nationalityNameByCode.get(row.nationality_code) || row.nationality_code) : '전체'}
                </TableCell>
                <TableCell className="text-xs text-gray-400">{BILLING_BASIS_LABEL[row.billing_basis]}</TableCell>
                <TableCell className="text-xs text-right font-medium">
                  {row.billing_basis === 'actual_cost' ? <span className="text-gray-400 font-normal">수기 입력</span> : `${Number(row.amount).toLocaleString()} ${row.currency}`}
                </TableCell>
                <TableCell className="text-xs">
                  {isNewGroup && cap ? (
                    <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                      {Number(cap.ship_cap_amount).toLocaleString()} {cap.currency}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs">
                  {row.is_vat_applicable && (
                    <Badge variant="outline" className="text-[10px] text-teal-700 border-teal-300 bg-teal-50">대상</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
