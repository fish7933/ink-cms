import { useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sanitizeTableHtml } from '@/utils/table-field';
import type { CompanyInfo } from '@/services/company-info.service';
import type { LeaveDetail } from '@/services/approval-document.service';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType, DocumentFormField } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';

// 표(table) 필드는 다른 필드처럼 "왼쪽 라벨 + 오른쪽 내용" 한 줄에 넣으면 폭이 좁아져 보기 나쁘므로,
// 연속된 일반 필드는 한 표로 묶고 표 필드는 라벨을 소제목으로 둔 채 전체 폭 블록으로 따로 뺀다.
type FieldGroup = { kind: 'rows'; fields: DocumentFormField[] } | { kind: 'table'; field: DocumentFormField };
function groupFields(fields: DocumentFormField[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  for (const f of fields) {
    if (f.type === 'table') {
      groups.push({ kind: 'table', field: f });
    } else {
      const last = groups[groups.length - 1];
      if (last && last.kind === 'rows') last.fields.push(f);
      else groups.push({ kind: 'rows', fields: [f] });
    }
  }
  return groups;
}

// A4(297mm) 세로에서 상하 여백(14mm×2, 아래 @page 설정과 일치)을 뺀 실제 인쇄 가능 높이.
// mm→px 변환은 CSS 스펙상 1mm = 96/25.4px로 고정이라, 화면에서 렌더링해 측정한 px 값과
// 실제 인쇄 시 px 환산이 항상 정확히 일치한다.
const PX_PER_MM = 96 / 25.4;
const PAGE_CONTENT_HEIGHT_PX = 269 * PX_PER_MM;
// 브라우저마다 서브픽셀 반올림 오차가 있어, 내용이 페이지 경계에 딱 걸치면 그 오차 때문에
// 불필요한 빈 페이지가 하나 더 끼어들 수 있다 — 이를 흡수할 여유값.
const ROUNDING_TOLERANCE_PX = 3;
// 인쇄 폭(@page 좌우 여백 15mm×2 제외)과 동일하게 맞춰야 측정한 높이가 실제 인쇄 결과와 일치한다.
const PRINT_CONTENT_WIDTH = '180mm';

interface BodyProps {
  doc: ApprovalDocumentWithDetails;
  documentType: ApprovalDocumentType | null;
  company: CompanyInfo | null;
  creatorPositionName?: string | null;
  includeAttachments: boolean;
  leaveDetail?: LeaveDetail | null;
  referenceLabels: string[];
  docNumber: string;
  draftedDate: Date;
  issuedDate: Date | null;
  fields: DocumentFormField[];
  positionOf: (label?: string | null) => string;
  topPosition: ShorePosition | null;
  lastStepPositionName: string;
  isDelegated: boolean;
}

// 시행문 본문(footer 제외) — 화면에 실제로 보여줄 사본과, 실제 인쇄 폭 기준 높이를 재기 위한
// 화면 밖 사본 양쪽에 동일하게 쓰인다.
function IssuedSheetBody({ doc, documentType, company, creatorPositionName, includeAttachments, leaveDetail, referenceLabels, docNumber, draftedDate, issuedDate, fields, positionOf, topPosition, lastStepPositionName, isDelegated }: BodyProps) {
  return (
    <>
      {company && (
        <tr><td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        </td></tr>
      )}

      <tr><td style={{ paddingBottom: 18 }}>
        <div style={{ borderBottom: '3px solid #1a1a1a' }} />
      </td></tr>

      <tr><td>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <table style={{ flex: 1, fontSize: 13 }}>
            <tbody>
              <tr><td style={{ padding: '3px 0' }}><b>문서번호</b>&nbsp;&nbsp;{docNumber}</td></tr>
              <tr><td style={{ padding: '3px 0' }}><b>기안일시</b>&nbsp;&nbsp;{draftedDate.toLocaleDateString('ko-KR')} {draftedDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</td></tr>
              <tr><td style={{ padding: '3px 0' }}><b>시행일시</b>&nbsp;&nbsp;{issuedDate ? `${issuedDate.toLocaleDateString('ko-KR')} ${issuedDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '결재 진행중'}</td></tr>
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
      </td></tr>

      <tr><td>
        <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>{doc.title}</div>
      </td></tr>

      {leaveDetail ? (
        <tr><td>
          <table className="issued-fields">
            <tbody>
              <tr><th>휴가 종류</th><td>{leaveDetail.typeLabel}</td></tr>
              <tr><th>신청 기간</th><td>{leaveDetail.period}</td></tr>
              <tr><th>신청 시간</th><td>{leaveDetail.hoursLabel}</td></tr>
              <tr><th>사유</th><td>{leaveDetail.reason}</td></tr>
            </tbody>
          </table>
        </td></tr>
      ) : fields.length > 0 ? (
        groupFields(fields).map((g, gi) => {
          if (g.kind === 'table') {
            const raw = doc.form_data?.[g.field.key];
            const isEmpty = raw === null || raw === undefined || raw === '';
            // 표 필드는 라벨(양식 제목)을 따로 보여주지 않고 표 자체만 그대로 보여준다 —
            // 라벨이 표 내용과 중복돼 보인다는 피드백에 따라 제거.
            return isEmpty ? null : (
              <tr key={gi}><td>
                <div className="issued-table-block" dangerouslySetInnerHTML={{ __html: sanitizeTableHtml(String(raw)) }} />
              </td></tr>
            );
          }
          return (
            <tr key={gi}><td>
              <table className="issued-fields">
                <tbody>
                  {g.fields.map(f => {
                    const raw = doc.form_data?.[f.key];
                    const isEmpty = raw === null || raw === undefined || raw === '';
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
            </td></tr>
          );
        })
      ) : (
        doc.content && (
          <tr><td>
            <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 2px' }}>{doc.content}</div>
          </td></tr>
        )
      )}

      {doc.attachments.length > 0 && (
        <tr><td>
          <div style={{ fontSize: 13 }}>
            <b>붙임</b>
            {doc.attachments.map((a, i) => (
              <div key={i} style={{ marginLeft: 28 }}>{i + 1}. {a.name}</div>
            ))}
          </div>
        </td></tr>
      )}

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
          <tr key={i} style={{ pageBreakBefore: 'always' }}><td style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>붙임 {i + 1}. {a.name}</p>
            <img src={url} alt={a.name} style={{ maxWidth: '100%' }} />
          </td></tr>
        );
      })}
    </>
  );
}

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

  const bodyProps: BodyProps = { doc, documentType, company, creatorPositionName, includeAttachments, leaveDetail, referenceLabels, docNumber, draftedDate, issuedDate, fields, positionOf, topPosition, lastStepPositionName, isDelegated };

  // 표+tfoot만으로는 마지막 페이지에서 footer가 본문 바로 뒤(페이지 하단이 아니라)에 붙는다 —
  // tfoot은 표가 실제로 페이지 경계에서 끊길 때만 "그 경계 지점"에 반복되는 것이지, 매 페이지를
  // 하단까지 채워주는 게 아니기 때문이다(내용이 마지막 페이지를 다 채우지 못하면 그만큼 빈틈이
  // 안 채워진 채 footer가 바로 따라붙는다). 그래서 본문 뒤에 "다음 페이지 경계까지의 나머지
  // 높이"만큼 빈 여백 행을 추가로 넣어, 매 페이지(마지막 페이지 포함)가 항상 꽉 차서 그 다음에
  // 오는 tfoot이 실제로 각 페이지 맨 하단에 오도록 만든다.
  const measureRef = useRef<HTMLTableSectionElement>(null);
  const [spacerPx, setSpacerPx] = useState(0);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const recompute = () => {
      const contentHeightPx = el.getBoundingClientRect().height;
      if (contentHeightPx <= 0) return;
      const pages = Math.max(1, Math.ceil((contentHeightPx - ROUNDING_TOLERANCE_PX) / PAGE_CONTENT_HEIGHT_PX));
      const spacer = pages * PAGE_CONTENT_HEIGHT_PX - contentHeightPx;
      setSpacerPx(spacer > 0 ? spacer : 0);
    };

    recompute();
    // 이미지 로딩 등으로 실제 렌더링 높이가 나중에 바뀔 수 있어 계속 관찰한다.
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, documentType, company, positions, creatorPositionName, includeAttachments, leaveDetail, referenceLabels]);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        table.issued-fields { border-collapse: collapse; width: 100%; }
        table.issued-fields th, table.issued-fields td { border: 1px solid #999; padding: 8px 10px; font-size: 13px; text-align: left; }
        table.issued-fields th { background: #f5f5f5; font-weight: 600; width: 30%; white-space: nowrap; }
        .issued-table-block { overflow-x: auto; max-width: 100%; }
        .issued-table-block table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .issued-table-block td, .issued-table-block th {
          padding: 4px 7px; font-size: 12px;
          overflow-wrap: break-word; word-break: break-word; white-space: normal !important;
        }
        table.approval-block { border-collapse: collapse; table-layout: auto; }
        table.approval-block th, table.approval-block td { border: 1px solid #999; text-align: center; font-size: 11px; padding: 5px 8px; white-space: nowrap; }
        table.approval-block th { background: #f5f5f5; font-weight: 600; }
        table.approval-block td.sign-cell { height: 40px; vertical-align: middle; }
        /* 본문 전체를 표 하나로 감싸고 footer를 <tfoot>에 둔다 — 표가 인쇄 중 여러 페이지에 걸쳐
           나뉘면 브라우저(Chrome/Firefox 모두)가 tfoot 행을 나뉘는 매 페이지 하단에 반복해서
           그려준다. 다만 이것만으로는 "각 페이지 끝까지 내용이 꽉 찼을 때"만 footer가 정확히
           하단에 오므로, 아래 .issued-print-spacer(JS로 계산한 여백 행)로 매 페이지를 실제 페이지
           높이만큼 채워 넣는다. */
        table.issued-page-table { width: 100%; border-collapse: collapse; }
        table.issued-page-table > tbody > tr > td { border: none; padding: 0 0 14px; vertical-align: top; }
        table.issued-page-table > tfoot > tr > td { border: none; padding: 0; }
        .issued-print-spacer { display: none; }
        .issued-footer {
          margin-top: 10px;
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
          .issued-print-spacer { display: table-row-group; }
          .issued-footer { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      <table className="issued-page-table">
        <tbody>
          <IssuedSheetBody {...bodyProps} />
        </tbody>
        {spacerPx > 0 && (
          <tbody className="issued-print-spacer">
            <tr><td style={{ height: spacerPx, padding: 0 }} /></tr>
          </tbody>
        )}
        <tfoot>
          <tr><td>
            <div className="issued-footer">
              <span>{documentType?.code ? `양식번호 ${documentType.code}` : ''}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{company?.name || ''}</span>
              <span />
            </div>
          </td></tr>
        </tfoot>
      </table>

      {/* 측정 전용 사본 — 실제 인쇄 폭(180mm = A4 폭에서 좌우 여백 15mm×2 제외, 위 @page와
          일치)으로 화면 밖에 렌더링해 인쇄 시 실제로 차지할 높이를 정확히 잰다. 화면 미리보기
          폭(위 800px)에서 그대로 재면 줄바꿈이 달라져 실제 인쇄 결과와 어긋난다. */}
      <table aria-hidden style={{ position: 'fixed', left: -99999, top: 0, width: PRINT_CONTENT_WIDTH, visibility: 'hidden' }}>
        <tbody ref={measureRef}>
          <IssuedSheetBody {...bodyProps} />
        </tbody>
      </table>
    </div>
  );
}
