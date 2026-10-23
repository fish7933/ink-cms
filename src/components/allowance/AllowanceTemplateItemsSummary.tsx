import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/components/AllowanceTemplateItemsSummary/en.json';
i18n.addResourceBundle('en', 'AllowanceTemplateItemsSummary', en, true, true);
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
  const { t } = useTranslation('AllowanceTemplateItemsSummary');
  const rankById = new Map(ranks.map(r => [r.id, r]));

  if (items.length === 0) {
    return <div className="text-center py-6 text-sm text-gray-400 border rounded-md">{t('등록된 항목이 없습니다.')}</div>;
  }

  const sorted = [...items].sort((a, b) => (a.allowance_item.display_order - b.allowance_item.display_order) || (a.rank_id || '').localeCompare(b.rank_id || ''));

  let prevItemId: string | null = null;

  return (
    <div className="rounded-md border overflow-x-auto no-scrollbar">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">{t('항목')}</TableHead>
            <TableHead className="text-xs">{t('종류')}</TableHead>
            <TableHead className="text-xs">{t('직급')}</TableHead>
            <TableHead className="text-xs">{t('지급방식')}</TableHead>
            <TableHead className="text-xs">{t('지급주체')}</TableHead>
            <TableHead className="text-xs text-right">{t('금액')}</TableHead>
            <TableHead className="text-xs">{t('지급 조건')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(row => {
            const isNewGroup = row.allowance_item_id !== prevItemId;
            prevItemId = row.allowance_item_id;
            const rank = row.rank_id ? rankById.get(row.rank_id) : null;
            const conditionBadges: string[] = [];
            if (row.max_payout_count != null) conditionBadges.push(t('최대 {{count}}회', { count: row.max_payout_count }));
            if (row.min_prior_contract_months != null) conditionBadges.push(t('직전계약 {{months}}개월+', { months: row.min_prior_contract_months }));
            if (row.max_gap_months != null) conditionBadges.push(t('재승선 {{months}}개월 이내', { months: row.max_gap_months }));
            return (
              <TableRow key={row.id} className={isNewGroup ? 'border-t-2' : ''}>
                <TableCell className="text-xs font-semibold">{isNewGroup ? row.allowance_item.name : ''}</TableCell>
                <TableCell className="text-xs text-gray-500">{row.kind === 'deduction' ? t('공제') : t('수당')}</TableCell>
                <TableCell className="text-xs text-gray-500">{rank ? `${rank.rank_code} (${rank.name})` : t('전 직급 공통')}</TableCell>
                <TableCell className="text-xs text-gray-400">{t(BASIS_LABEL[row.payment_basis])}</TableCell>
                <TableCell className="text-xs text-gray-400">{row.kind === 'allowance' ? t(METHOD_LABEL[row.payment_method]) : '-'}</TableCell>
                <TableCell className="text-xs text-right font-medium">{Number(row.amount).toLocaleString()} {row.currency}</TableCell>
                <TableCell className="text-xs">
                  {conditionBadges.length === 0 ? (
                    <span className="text-gray-300">-</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {conditionBadges.map(b => <Badge key={b} variant="outline" className="text-[10px] px-1.5 py-0 text-blue-700 border-blue-200 bg-blue-50">{b}</Badge>)}
                    </div>
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
