import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AllowanceTemplateItem, AllowanceItem } from '@/types/allowance';
import type { Rank } from '@/types/models';

const BASIS_LABEL: Record<string, string> = { monthly: '매월 지급', on_embark_once: '승선월 1회', disembark_settlement: '하선 시 정산' };
const METHOD_LABEL: Record<string, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };

interface AllowanceTemplateItemsSummaryProps {
  items: (AllowanceTemplateItem & { allowance_item: AllowanceItem })[];
  ranks?: Rank[];
}

// 읽기전용 템플릿 항목 표시 — 템플릿 상세/갱신 히스토리에서 재사용.
export default function AllowanceTemplateItemsSummary({ items, ranks = [] }: AllowanceTemplateItemsSummaryProps) {
  const rankById = new Map(ranks.map(r => [r.id, r]));

  if (items.length === 0) {
    return <div className="text-center py-6 text-sm text-gray-400 border rounded-md">등록된 항목이 없습니다.</div>;
  }

  const sorted = [...items].sort((a, b) => (a.allowance_item.display_order - b.allowance_item.display_order) || (a.rank_id || '').localeCompare(b.rank_id || ''));

  let prevItemId: string | null = null;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">항목</TableHead>
            <TableHead className="text-xs">종류</TableHead>
            <TableHead className="text-xs">직급</TableHead>
            <TableHead className="text-xs">지급방식</TableHead>
            <TableHead className="text-xs">지급주체</TableHead>
            <TableHead className="text-xs text-right">금액</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(row => {
            const isNewGroup = row.allowance_item_id !== prevItemId;
            prevItemId = row.allowance_item_id;
            const rank = row.rank_id ? rankById.get(row.rank_id) : null;
            return (
              <TableRow key={row.id} className={isNewGroup ? 'border-t-2' : ''}>
                <TableCell className="text-xs font-semibold">{isNewGroup ? row.allowance_item.name : ''}</TableCell>
                <TableCell className="text-xs text-gray-500">{row.kind === 'deduction' ? '공제' : '수당'}</TableCell>
                <TableCell className="text-xs text-gray-500">{rank ? `${rank.rank_code} (${rank.name})` : '전 직급 공통'}</TableCell>
                <TableCell className="text-xs text-gray-400">{BASIS_LABEL[row.payment_basis]}</TableCell>
                <TableCell className="text-xs text-gray-400">{row.kind === 'allowance' ? METHOD_LABEL[row.payment_method] : '-'}</TableCell>
                <TableCell className="text-xs text-right font-medium">{Number(row.amount).toLocaleString()} {row.currency}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
