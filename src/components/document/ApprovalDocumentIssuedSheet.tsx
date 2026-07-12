import type { CompanyInfo } from '@/services/company-info.service';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';

interface Props {
  doc: ApprovalDocumentWithDetails;
  documentType: ApprovalDocumentType | null;
  company: CompanyInfo | null;
}

// 결재 완료된 문서(특히 지출결의서 등 구조화 양식)를 총무팀 보관용 "시행문" 형식으로 출력하는 문서 본문.
// 인쇄 모달/독립 인쇄 페이지 양쪽에서 재사용된다.
export default function ApprovalDocumentIssuedSheet({ doc, documentType, company }: Props) {
  const docNumber = `${documentType?.code || 'DOC'}-${new Date(doc.created_at).getFullYear()}-${doc.id.slice(0, 8).toUpperCase()}`;
  const issuedDate = doc.completed_at ? new Date(doc.completed_at) : new Date(doc.created_at);
  const fields = documentType?.field_schema || [];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4 portrait; margin: 20mm 18mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table.issued-fields { border-collapse: collapse; width: 100%; }
        table.issued-fields th, table.issued-fields td { border: 1px solid #999; padding: 8px 10px; font-size: 13px; text-align: left; }
        table.issued-fields th { background: #f5f5f5; font-weight: 600; width: 30%; white-space: nowrap; }
        table.approval-block { border-collapse: collapse; width: 100%; margin-top: 6px; }
        table.approval-block th, table.approval-block td { border: 1px solid #999; text-align: center; font-size: 12px; padding: 6px 4px; }
        table.approval-block th { background: #f5f5f5; font-weight: 600; }
        table.approval-block td.sign-cell { height: 46px; vertical-align: middle; }
      `}</style>

      {(company?.name || company?.logo_url) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {company.logo_url && <img src={company.logo_url} alt="" style={{ height: 32 }} />}
          <span style={{ fontSize: 14, fontWeight: 600 }}>{company.name}</span>
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '18px 0 24px', paddingBottom: 14, borderBottom: '3px solid #1a1a1a' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: 12, margin: 0 }}>시 행 문</h1>
      </div>

      <table style={{ width: '100%', fontSize: 13, marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={{ padding: '3px 0' }}><b>문서번호</b>&nbsp;&nbsp;{docNumber}</td>
            <td style={{ padding: '3px 0', textAlign: 'right' }}><b>시행일자</b>&nbsp;&nbsp;{issuedDate.toLocaleDateString('ko-KR')}</td>
          </tr>
          <tr>
            <td style={{ padding: '3px 0' }}><b>수신</b>&nbsp;&nbsp;총무팀 (보존)</td>
            <td style={{ padding: '3px 0', textAlign: 'right' }}><b>기안부서</b>&nbsp;&nbsp;{doc.org_unit_name || '-'}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '20px 0' }}>{doc.title}</div>

      {fields.length > 0 ? (
        <table className="issued-fields">
          <tbody>
            {fields.map(f => (
              <tr key={f.key}>
                <th>{f.label}</th>
                <td>{doc.form_data?.[f.key] ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        doc.content && <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 2px' }}>{doc.content}</div>
      )}

      {doc.attachments.length > 0 && (
        <div style={{ fontSize: 12.5, marginTop: 14 }}>
          <b>붙임</b>&nbsp;&nbsp;{doc.attachments.map(a => a.name).join(', ')}
        </div>
      )}

      <div style={{ marginTop: 36, marginBottom: 8, fontSize: 12, color: '#555' }}>결재</div>
      <table className="approval-block">
        <thead>
          <tr>
            <th style={{ width: 80 }}>기안</th>
            {doc.steps.map(s => <th key={s.id}>{s.approver_label || `${s.step_order}차 결재`}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="sign-cell">
              <div>{doc.creator_name}</div>
              <div style={{ fontSize: 10, color: '#777' }}>{new Date(doc.created_at).toLocaleDateString('ko-KR')}</div>
            </td>
            {doc.steps.map(s => (
              <td key={s.id} className="sign-cell">
                <div>{s.approver_name}</div>
                <div style={{ fontSize: 10, color: s.status === 'approved' ? '#1e40af' : '#999' }}>
                  {s.status === 'approved' ? '승인' : s.status === 'rejected' ? '반려' : '대기'}
                  {s.acted_at ? ` · ${new Date(s.acted_at).toLocaleDateString('ko-KR')}` : ''}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', marginTop: 48, fontSize: 15, fontWeight: 600 }}>
        {company?.name || ''}
      </div>
    </div>
  );
}
