import { supabase } from '@/lib/supabase';
import { parseTableFieldValue } from '@/utils/table-field';
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
  referenceLabels?: string[];
}

// 결재 완료된 문서(특히 지출결의서 등 구조화 양식)를 총무팀 보관용 "시행문" 형식으로 출력하는 문서 본문.
// 인쇄 모달/독립 인쇄 페이지 양쪽에서 재사용된다.
export default function ApprovalDocumentIssuedSheet({ doc, documentType, company, positions, creatorPositionName, includeAttachments = false, leaveDetail, referenceLabels = [] }: Props) {
  const docNumber = `${documentType?.code || 'DOC'}-${new Date(doc.created_at).getFullYear()}-${doc.id.slice(0, 8).toUpperCase()}`;
  // 기안일(작성/상신일)과 시행일(결재 완료일)은 서로 다른 날짜다 — 기안일은 항상 created_at,
  // 시행일은 결재가 실제로 끝난 completed_at만 쓰고(완료 전이면 created_at으로 대체해 보여주지
  // 않는다), 결재 진행중인 문서를 시행일이 정해진 것처럼 잘못 표기하지 않도록 한다.
  const draftedDate = new Date(doc.created_at);
  const issuedDate = doc.completed_at ? new Date(doc.completed_at) : null;
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
        table.issued-fields { border-collapse: collapse; width: 100%; }
        table.issued-fields th, table.issued-fields td { border: 1px solid #999; padding: 8px 10px; font-size: 13px; text-align: left; }
        table.issued-fields th { background: #f5f5f5; font-weight: 600; width: 30%; white-space: nowrap; }
        table.issued-fields td.field-table-cell { padding: 4px; }
        table.issued-nested { border-collapse: collapse; width: 100%; }
        table.issued-nested > tbody > tr > td { border: 1px solid #999 !important; padding: 5px 7px; font-size: 12px; }
        table.approval-block { border-collapse: collapse; table-layout: auto; }
        table.approval-block th, table.approval-block td { border: 1px solid #999; text-align: center; font-size: 11px; padding: 5px 8px; white-space: nowrap; }
        table.approval-block th { background: #f5f5f5; font-weight: 600; }
        table.approval-block td.sign-cell { height: 40px; vertical-align: middle; }
        .issued-footer {
          margin-top: 48px;
          padding-top: 8px;
          border-top: 1px solid #ccc;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          font-size: 11px;
          color: #555;
        }
        .issued-footer > span:first-child { text-align: left; }
        .issued-footer > span:last-child { text-align: right; }
        @media print {
          body { margin: 0; }
          @page { size: A4 portrait; margin: 14mm 15mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* 하단 바(양식번호/회사명)가 매 페이지 하단에 고정되도록 — @page 여백(14mm) 안쪽에
             자리잡아 본문 내용과 겹치지 않는다. */
          .issued-footer { position: fixed; bottom: 6mm; left: 15mm; right: 15mm; margin-top: 0; }
        }
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

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <table style={{ flex: 1, fontSize: 13 }}>
          <tbody>
            <tr><td style={{ padding: '3px 0' }}><b>문서번호</b>&nbsp;&nbsp;{docNumber}</td></tr>
            <tr><td style={{ padding: '3px 0' }}><b>기안일자</b>&nbsp;&nbsp;{draftedDate.toLocaleDateString('ko-KR')}</td></tr>
            <tr><td style={{ padding: '3px 0' }}><b>시행일자</b>&nbsp;&nbsp;{issuedDate ? issuedDate.toLocaleDateString('ko-KR') : '결재 진행중'}</td></tr>
            <tr><td style={{ padding: '3px 0' }}><b>수신</b>&nbsp;&nbsp;{doc.recipient_org_unit_name || '총무팀 (보존)'}</td></tr>
            {referenceLabels.length > 0 && (
              <tr><td style={{ padding: '3px 0' }}><b>참조</b>&nbsp;&nbsp;{referenceLabels.join(', ')}</td></tr>
            )}
            <tr><td style={{ padding: '3px 0' }}><b>기안부서</b>&nbsp;&nbsp;{doc.org_unit_name || '-'}</td></tr>
          </tbody>
        </table>

        <div style={{ flexShrink: 0 }}>
          <div style={{ marginBottom: 4, fontSize: 11, color: '#555', textAlign: 'center' }}>결재{isDelegated && <span style={{ color: '#b91c1c', marginLeft: 4 }}>({lastStepPositionName} 전결)</span>}</div>
          <table className="approval-block">
            <thead>
              <tr>
                <th>기안</th>
                {doc.steps.map(s => <th key={s.id}>{positionOf(s.approver_label) || `${s.step_order}차 결재`}</th>)}
                {isDelegated && <th>{topPosition!.name}</th>}
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
        </div>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', margin: '22px 0 18px' }}>{doc.title}</div>

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
            {fields.map(f => {
              const raw = doc.form_data?.[f.key];
              const isEmpty = raw === null || raw === undefined || raw === '';
              if (f.type === 'table') {
                const grid = isEmpty ? [] : parseTableFieldValue(raw);
                return (
                  <tr key={f.key}>
                    <th>{f.label}</th>
                    <td className="field-table-cell">
                      {grid.length === 0 ? '-' : (
                        <table className="issued-nested">
                          <tbody>
                            {grid.map((row, r) => (
                              <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                );
              }
              const display = isEmpty ? '-' : f.type === 'number' ? `${Number(raw).toLocaleString('ko-KR')}원` : raw;
              return (
                <tr key={f.key}>
                  <th>{f.label}</th>
                  <td style={f.type === 'textarea' ? { whiteSpace: 'pre-wrap' } : undefined}>{display}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        doc.content && <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 2px' }}>{doc.content}</div>
      )}

      {doc.attachments.length > 0 && (
        <div style={{ fontSize: 13, marginTop: 18 }}>
          <b>붙임</b>
          {doc.attachments.map((a, i) => (
            <div key={i} style={{ marginLeft: 28 }}>{i + 1}. {a.name}</div>
          ))}
        </div>
      )}

      <div className="issued-footer">
        <span>{documentType?.code ? `양식번호 ${documentType.code}` : ''}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{company?.name || ''}</span>
        <span />
      </div>

      {/* 이미지만 각자 새 페이지에 인쇄물로 합쳐 넣는다. PDF는 iframe으로 끼워넣으면 뷰어의
          현재 화면(보통 첫 페이지)만 찍히고 스크롤바까지 인쇄되는 등 브라우저 인쇄와 근본적으로
          맞지 않아 제외한다 — PDF/기타 형식은 위 "붙임" 줄의 파일명 표기로 충분하고, 원본은
          화면(인쇄 전 미리보기)의 "새 탭에서 열기"로 따로 인쇄하게 한다. */}
      {includeAttachments && doc.attachments.map((a, i) => {
        const { data } = supabase.storage.from('documents').getPublicUrl(a.path);
        const url = data?.publicUrl;
        const isImage = a.type?.startsWith('image/');
        if (!(isImage && url)) return null;
        return (
          <div key={i} style={{ pageBreakBefore: 'always', paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>붙임 {i + 1}. {a.name}</p>
            <img src={url} alt={a.name} style={{ maxWidth: '100%' }} />
          </div>
        );
      })}
    </div>
  );
}
