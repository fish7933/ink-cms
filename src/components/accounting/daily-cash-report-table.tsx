import type { DailyCashReportSnapshotSection } from '@/types/accounting';

const KIND_LABEL: Record<DailyCashReportSnapshotSection['kind'], string> = { bank_account: '통장', cash_register: '현금' };

interface DailyCashReportTableProps {
  sections: DailyCashReportSnapshotSection[];
  // 넘기면 거래 행을 클릭했을 때 해당 거래의 금전출납 수정 화면으로 이동할 수 있다.
  onTransactionClick?: (transactionId: string) => void;
}

// 자금일보 화면(DailyCashReportPage)과 기안문 작성 화면 미리보기, 결재 상세/인쇄 화면이 모두
// 같은 표를 보여줘야 하므로 실제 렌더링 마크업을 여기 한 곳에 모아 재사용한다.
export function DailyCashReportTable({ sections, onTransactionClick }: DailyCashReportTableProps) {
  const totalsByCurrency = new Map<string, number>();
  for (const s of sections) totalsByCurrency.set(s.currency, (totalsByCurrency.get(s.currency) || 0) + s.closing_balance);

  return (
    <div className="space-y-5">
      <div className="border rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '13%' }} />
            <col style={{ width: '42%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '23%' }} />
          </colgroup>
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-center p-2 text-xs font-medium text-gray-600">구분</th>
              <th className="text-center p-2 text-xs font-medium text-gray-600">계좌명</th>
              <th className="text-center p-2 text-xs font-medium text-gray-600">전일잔액</th>
              <th className="text-center p-2 text-xs font-medium text-gray-600">금일잔액</th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">등록된 통장/현금 시재가 없습니다.</td></tr>
            ) : sections.map(s => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-2 text-gray-500 truncate">{KIND_LABEL[s.kind]}</td>
                <td className="p-2 font-medium truncate" title={s.name}>{s.name}</td>
                <td className="p-2 text-right font-mono text-gray-400 truncate">{s.opening_balance.toLocaleString()} {s.currency}</td>
                <td className="p-2 text-right font-mono font-semibold truncate">{s.closing_balance.toLocaleString()} {s.currency}</td>
              </tr>
            ))}
          </tbody>
          {sections.length > 0 && (
            <tfoot className="bg-gray-50 border-t">
              {[...totalsByCurrency.entries()].map(([currency, total]) => (
                <tr key={currency}>
                  <td colSpan={3} className="p-2 font-semibold text-sm">합계 ({currency})</td>
                  <td className="p-2 text-right font-mono font-semibold truncate">{total.toLocaleString()} {currency}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      {sections.map(s => (
        <div key={s.id}>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">{s.name} ({s.currency})</p>
          <div className="border rounded-md overflow-hidden overflow-x-auto">
            <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-center p-2 font-medium text-gray-600">No.</th>
                  <th className="text-center p-2 font-medium text-gray-600">일자</th>
                  <th className="text-center p-2 font-medium text-gray-600">출금</th>
                  <th className="text-center p-2 font-medium text-gray-600">입금</th>
                  <th className="text-center p-2 font-medium text-gray-600">잔액</th>
                  <th className="text-center p-2 font-medium text-gray-600">상대거래처</th>
                  <th className="text-center p-2 font-medium text-gray-600">적요</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-gray-50/50">
                  <td className="p-2 text-center text-gray-500">0</td>
                  <td className="p-2 text-gray-500">전일이월</td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2 text-right font-mono truncate">{s.opening_balance.toLocaleString()} {s.currency}</td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                </tr>
                {s.transactions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-4 text-gray-400">이날 거래 내역이 없습니다.</td></tr>
                ) : s.transactions.map((t, i) => (
                  <tr
                    key={i}
                    className={`border-b last:border-0 ${onTransactionClick ? 'cursor-pointer hover:bg-blue-50/50' : ''}`}
                    onClick={() => onTransactionClick?.(t.id)}
                    title={onTransactionClick ? '클릭하면 금전출납에서 이 거래를 수정할 수 있습니다' : undefined}
                  >
                    <td className="p-2 text-center text-gray-500">{i + 1}</td>
                    <td className="p-2 truncate">{t.date}</td>
                    <td className="p-2 text-right font-mono text-red-600 truncate">{t.expense ? t.expense.toLocaleString() : ''}</td>
                    <td className="p-2 text-right font-mono text-blue-700 truncate">{t.income ? t.income.toLocaleString() : ''}</td>
                    <td className="p-2 text-right font-mono truncate">{t.balance.toLocaleString()} {s.currency}</td>
                    <td className="p-2 truncate" title={t.counterparty}>{t.counterparty}</td>
                    <td className="p-2 text-gray-500 truncate" title={t.description}>{t.description}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={2} className="p-2 font-semibold">합계</td>
                  <td className="p-2 text-right font-mono font-semibold text-red-600 truncate">{s.total_expense.toLocaleString()}</td>
                  <td className="p-2 text-right font-mono font-semibold text-blue-700 truncate">{s.total_income.toLocaleString()}</td>
                  <td className="p-2 text-right font-mono font-semibold truncate">{s.closing_balance.toLocaleString()} {s.currency}</td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
