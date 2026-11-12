import { useEffect, useState } from 'react';
import { getDailyReportById } from '@/services/accounting-daily-report.service';
import type { DailyCashReport } from '@/types/accounting';

interface Props {
  reportId: string;
}

const KIND_LABEL: Record<string, string> = { bank_account: '통장', cash_register: '현금' };
const fmt = (n: number) => n.toLocaleString();

// 자금일보(경리 일보) 상세 — 결재함/기안함에서 내용을 열었을 때 doc.content에는 계좌별
// "금일 잔액"만 적혀 있어 실제 어떤 지출/입금이 있었는지 알 수 없다. reference_id로
// getDailyReportById를 따로 불러와 데스크탑(ApprovalDocumentIssuedSheet)과 같은 데이터를
// 쓰되, 넓은 표 대신 거래 한 건당 한 줄의 세로 리스트로 단순화해 보여준다.
export default function DailyCashReportMobileView({ reportId }: Props) {
  const [report, setReport] = useState<DailyCashReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDailyReportById(reportId).then(setReport).finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return <div className="text-sm text-gray-400">불러오는 중...</div>;

  const sections = report?.snapshot || [];
  if (sections.length === 0) return <div className="text-sm text-gray-400">내용 없음</div>;

  return (
    <div className="space-y-3">
      {sections.map(s => (
        <div key={s.id} className="rounded-lg border border-gray-100 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{s.name} ({s.currency})</span>
            <span className="text-[11px] text-gray-400">{KIND_LABEL[s.kind] || s.kind}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400 mt-0.5">
            <span>전일잔액 {fmt(s.opening_balance)}</span>
            <span>금일잔액 {fmt(s.closing_balance)}</span>
          </div>
          {s.transactions.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
              {s.transactions.map(t => (
                <div key={t.id} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">{t.date}</span>
                    {/* 한국 시세 표기 관행(상승·수입=빨강, 하락·지출=파랑)을 따른다. */}
                    <span className={`truncate ${t.expense ? 'text-blue-600' : 'text-red-600'}`}>
                      {t.expense ? `-${fmt(t.expense)}` : `+${fmt(t.income)}`}
                    </span>
                  </div>
                  {(t.counterparty || t.description) && (
                    <div className="text-gray-400 truncate">
                      {t.counterparty}{t.counterparty && t.description ? ' · ' : ''}{t.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
