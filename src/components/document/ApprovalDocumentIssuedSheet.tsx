import { supabase } from '@/lib/supabase';
import type { CompanyInfo } from '@/services/company-info.service';
import type { LeaveDetail } from '@/services/approval-document.service';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';

interface Props {
  doc: ApprovalDocumentWithDetails;
  documentType: ApprovalDocumentType | null;
  company: CompanyInfo | null;
  positions: ShorePosition[];
  creatorPositionName?: string | null;
  includeAttachments?: boolean;
  leaveDetail?: LeaveDetail | null;
}

// 결재 완료된 문서(특히 지출결의서 등 구조화 양식)를 총무팀 보관용 "시행문" 형식으로 출력하는 문서 본문.
// 인쇄 모달/독립 인쇄 페이지 양쪽에서 재사용된다.
export default function ApprovalDocumentIssuedSheet({ doc, documentType, company, positions, creatorPositionName, includeAttachments = false, leaveDetail }: Props) {
  const docNumber = `${documentType?.code || 'DOC'}-${new Date(doc.created_at).getFullYear()}-${doc.id.slice(0, 8).toUpperCase()}`;
  const issuedDate = doc.completed_at ? new Date(doc.completed_at) : new Date(doc.created_at);
  const fields = documentType?.field_schema || [];

  // 결재란에 표시되는 approver_label은 "부서명 · 직급명" 형태로 저장되어 있어, 그 중 직급(직책)만 뽑아 쓴다.
  const positionOf = (label?: string | null) => label?.split(' · ').pop()?.trim() || '';

  // 마지막 단계 결재자의 직급명을 최상위 직급(대표이사 등, display_order가 가장 작은 직급)과 비교해서,
  // 최상위 직급이 실제로 결재하지 않았다면 전결(위임 결재)이 일어난 것이므로 결재란에 표시해준다.
  const topPosition = positions.length > 0 ? [...positions].sort((a, b) => a.display_order - b.display_order)[0] : null;
  const lastStep = doc.steps[doc.steps.length - 1];
  const lastStepPositionName = positionOf(lastStep?.approver_label);
  const isDelegated = doc.status === 'approved' && !!topPosition && !!lastStepPositionName && lastStepPositionName !== topPosition.name;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4 portrait; margin: 14mm 15mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table.issued-fields { border-collapse: collapse; width: 100%; }
        table.issued-fields th, table.issued-fields td { border: 1px solid #999; padding: 8px 10px; font-size: 13px; text-align: left; }
        table.issued-fields th { background: #f5f5f5; font-weight: 600; width: 30%; white-space: nowrap; }
        table.approval-block { border-collapse: collapse; width: 100%; margin-top: 6px; table-layout: fixed; }
        table.approval-block th, table.approval-block td { border: 1px solid #999; text-align: center; font-size: 12px; padding: 6px 4px; }
        table.approval-block th { background: #f5f5f5; font-weight: 600; }
        table.approval-block td.sign-cell { height: 46px; vertical-align: middle; }
      `}</style>

      {company && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {company.logo_url && <img src={company.logo_url} alt="" style={{ height: 40 }} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 10.5, color: '#666', marginTop: 2 }}>
              {[company.address, company.phone && `Tel. ${company.phone}`, company.fax && `Fax. ${company.fax}`].filter(Boolean).join('  ·  ')}
            </div>
            {(company.email || company.website) && (
              <div style={{ fontSize: 10.5, color: '#666' }}>
                {[company.email, company.website].filter(Boolean).join('  ·  ')}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ margin: '10px 0 18px', borderBottom: '3px solid #1a1a1a' }} />

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
          {doc.attachments.length > 0 && (
            <tr>
              <td colSpan={2} style={{ padding: '3px 0' }}><b>붙임</b>&nbsp;&nbsp;{doc.attachments.map(a => a.name).join(', ')}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '20px 0' }}>{doc.title}</div>

      {leaveDetail ? (
        <table className="issued-fields">
          <tbody>
            <tr><th>휴가 종류</th><td>{leaveDetail.typeLabel}</td></tr>
            <tr><th>신청 기간</th><td>{leaveDetail.period}</td></tr>
            <tr><th>신청 시간</th><td>{leaveDetail.hoursLabel}</td></tr>
            <tr><th>사유</th><td>{leaveDetail.reason}</td></tr>
          </tbody>
        </table>
      ) : fields.length > 0 ? (
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

      <div style={{ marginTop: 36, marginBottom: 8, fontSize: 12, color: '#555' }}>결재{isDelegated && <span style={{ color: '#b91c1c', marginLeft: 6 }}>({lastStepPositionName} 전결)</span>}</div>
      <table className="approval-block">
        <thead>
          <tr>
            <th>기안</th>
            {doc.steps.map((s, i) => <th key={s.id}>{i === doc.steps.length - 1 ? '최종결재' : '중간결재'}</th>)}
            {isDelegated && <th>최종결재</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="sign-cell">
              <div>{creatorPositionName ? `${creatorPositionName} ` : ''}{doc.creator_name}</div>
              <div style={{ fontSize: 10, color: '#777' }}>{new Date(doc.created_at).toLocaleDateString('ko-KR')}</div>
            </td>
            {doc.steps.map((s, i) => {
              const isLast = i === doc.steps.length - 1;
              return (
                <td key={s.id} className="sign-cell">
                  <div>{positionOf(s.approver_label)} {s.approver_name}</div>
                  <div style={{ fontSize: 10, color: s.status === 'approved' ? '#1e40af' : '#999' }}>
                    {s.status === 'approved' ? '승인' : s.status === 'rejected' ? '반려' : '대기'}
                    {isLast && isDelegated ? ' (전결)' : ''}
                    {s.acted_at ? ` · ${new Date(s.acted_at).toLocaleDateString('ko-KR')}` : ''}
                  </div>
                </td>
              );
            })}
            {isDelegated && (
              <td className="sign-cell">
                <div style={{ fontWeight: 700, color: '#b91c1c' }}>전결</div>
              </td>
            )}
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', marginTop: 48, fontSize: 15, fontWeight: 600 }}>
        {company?.name || ''}
      </div>

      {includeAttachments && doc.attachments.map((a, i) => {
        const { data } = supabase.storage.from('documents').getPublicUrl(a.path);
        const url = data?.publicUrl;
        const isImage = a.type?.startsWith('image/');
        const isPdf = a.type === 'application/pdf';
        return (
          <div key={i} style={{ pageBreakBefore: 'always', paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>붙임 {i + 1}. {a.name}</p>
            {isImage && url ? (
              <img src={url} alt={a.name} style={{ maxWidth: '100%' }} />
            ) : isPdf && url ? (
              <iframe src={url} title={a.name} style={{ width: '100%', height: '1000px', border: '1px solid #ccc' }} />
            ) : (
              <p style={{ fontSize: 12, color: '#999' }}>이 파일 형식은 미리보기 인쇄를 지원하지 않습니다. 원본 파일은 결재함에서 별도로 확인해주세요.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
