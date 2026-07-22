import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
// 서브픽셀 반올림 오차를 흡수할 여유값.
const ROUNDING_TOLERANCE_PX = 2;
// 인쇄 폭(@page 좌우 여백 15mm×2 제외)과 동일하게 맞춰야 측정한 높이가 실제 인쇄 결과와 일치한다.
const PRINT_CONTENT_WIDTH = '180mm';

interface Block {
  key: string;
  content: ReactNode;
  // 첨부 이미지처럼 항상 새 페이지에서 시작해야 하는 블록.
  forceOwnPage?: boolean;
}

interface BuildBlocksArgs {
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

// 시행문 본문(footer 제외)을 페이지 배치 단위인 "블록" 목록으로 만든다. 각 블록은 그 자체로
// 하나의 독립된 세로 조각이라, 아래에서 실측한 높이를 기준으로 페이지 경계를 우리가 직접
// 정할 수 있다(브라우저의 자체 표 페이지네이션에 기대지 않는다).
function buildBlocks({ doc, documentType, company, creatorPositionName, includeAttachments, leaveDetail, referenceLabels, docNumber, draftedDate, issuedDate, fields, positionOf, topPosition, lastStepPositionName, isDelegated }: BuildBlocksArgs): Block[] {
  const blocks: Block[] = [];

  if (company) {
    blocks.push({
      key: 'company',
      content: (
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
      ),
    });
  }

  blocks.push({ key: 'divider', content: <div style={{ borderBottom: '3px solid #1a1a1a' }} /> });

  blocks.push({
    key: 'docinfo',
    content: (
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
    ),
  });

  blocks.push({ key: 'title', content: <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>{doc.title}</div> });

  if (leaveDetail) {
    blocks.push({
      key: 'leave',
      content: (
        <table className="issued-fields">
          <tbody>
            <tr><th>휴가 종류</th><td>{leaveDetail.typeLabel}</td></tr>
            <tr><th>신청 기간</th><td>{leaveDetail.period}</td></tr>
            <tr><th>신청 시간</th><td>{leaveDetail.hoursLabel}</td></tr>
            <tr><th>사유</th><td>{leaveDetail.reason}</td></tr>
          </tbody>
        </table>
      ),
    });
  } else if (fields.length > 0) {
    groupFields(fields).forEach((g, gi) => {
      if (g.kind === 'table') {
        const raw = doc.form_data?.[g.field.key];
        const isEmpty = raw === null || raw === undefined || raw === '';
        // 표 필드는 라벨(양식 제목)을 따로 보여주지 않고 표 자체만 그대로 보여준다 —
        // 라벨이 표 내용과 중복돼 보인다는 피드백에 따라 제거.
        if (!isEmpty) {
          blocks.push({
            key: `field-${gi}`,
            content: <div className="issued-table-block" dangerouslySetInnerHTML={{ __html: sanitizeTableHtml(String(raw)) }} />,
          });
        }
      } else {
        blocks.push({
          key: `field-${gi}`,
          content: (
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
          ),
        });
      }
    });
  } else if (doc.content) {
    blocks.push({
      key: 'content',
      content: <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '10px 2px' }}>{doc.content}</div>,
    });
  }

  if (doc.attachments.length > 0) {
    blocks.push({
      key: 'attachments',
      content: (
        <div style={{ fontSize: 13 }}>
          <b>붙임</b>
          {doc.attachments.map((a, i) => (
            <div key={i} style={{ marginLeft: 28 }}>{i + 1}. {a.name}</div>
          ))}
        </div>
      ),
    });
  }

  // 이미지만 각자 새 페이지에 인쇄물로 합쳐 넣는다. PDF는 iframe으로 끼워넣으면 뷰어의 현재
  // 화면(보통 첫 페이지)만 찍히고 스크롤바까지 인쇄되는 등 브라우저 인쇄와 근본적으로 맞지
  // 않아 제외한다 — PDF/기타 형식은 위 "붙임" 줄의 파일명 표기로 충분하고, 원본은 화면(인쇄
  // 전 미리보기)의 "새 탭에서 열기"로 따로 인쇄하게 한다.
  if (includeAttachments) {
    doc.attachments.forEach((a, i) => {
      const { data } = supabase.storage.from('documents').getPublicUrl(a.path);
      const url = data?.publicUrl;
      const isImage = a.type?.startsWith('image/');
      if (!(isImage && url)) return;
      blocks.push({
        key: `img-${i}`,
        forceOwnPage: true,
        content: (
          <>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>붙임 {i + 1}. {a.name}</p>
            <img src={url} alt={a.name} style={{ maxWidth: '100%' }} />
          </>
        ),
      });
    });
  }

  return blocks;
}

function FooterRow({ documentType, company }: { documentType: ApprovalDocumentType | null; company: CompanyInfo | null }) {
  return (
    <div className="issued-footer">
      <span>{documentType?.code ? `양식번호 ${documentType.code}` : ''}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{company?.name || ''}</span>
      <span />
    </div>
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

  const blocks = buildBlocks({ doc, documentType, company, creatorPositionName, includeAttachments, leaveDetail, referenceLabels, docNumber, draftedDate, issuedDate, fields, positionOf, topPosition, lastStepPositionName, isDelegated });

  // "footer가 매 페이지 하단에 오게" 하려고 브라우저의 표 자동 페이지네이션(<tfoot> 반복)에
  // 기대는 방식을 두 번 시도했지만 둘 다 브라우저가 실제로 어디서 페이지를 끊을지 예측/보정하려
  // 한 것이라 어긋났다(특히 마지막 페이지 — 내용이 다 채우지 못한 만큼을 빈 여백 행으로
  // 메꾸려 했더니 페이지당 실사용 가능 높이 추정이 살짝만 어긋나도 불필요한 빈 페이지가 하나
  // 더 생겼다). 그래서 방향을 바꿔, 페이지 경계 자체를 브라우저에 맡기지 않고 우리가 직접
  // 정한다: 각 콘텐츠 블록의 높이를 화면 밖에서 실측해 "한 페이지에 들어갈 만큼"씩 직접
  // 묶고(bucketing), 각 묶음을 완전히 분리된 하나의 페이지 div로 렌더링한다. 각 페이지 div는
  // 항상 실제 페이지보다 작거나 같도록 우리가 보장하므로, 그 안에서는 원래 검증됐던 단순한
  // "flex column + min-height + footer margin-top:auto" 방식이 안전하게 매번 통한다.
  const blockNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const footerMeasureRef = useRef<HTMLDivElement>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][] | null>(null);

  useLayoutEffect(() => {
    const footerEl = footerMeasureRef.current;
    if (!footerEl) return;

    const recompute = () => {
      const footerHeightPx = footerEl.getBoundingClientRect().height;
      if (footerHeightPx <= 0) return;
      const usablePageHeightPx = PAGE_CONTENT_HEIGHT_PX - footerHeightPx;

      const newPages: Block[][] = [[]];
      let currentHeight = 0;
      for (const b of blocks) {
        const node = blockNodesRef.current.get(b.key);
        const h = node ? node.getBoundingClientRect().height : 0;
        let currentPage = newPages[newPages.length - 1];

        if (b.forceOwnPage && currentPage.length > 0) {
          newPages.push([]);
          currentPage = newPages[newPages.length - 1];
          currentHeight = 0;
        } else if (currentHeight + h > usablePageHeightPx + ROUNDING_TOLERANCE_PX && currentPage.length > 0) {
          newPages.push([]);
          currentPage = newPages[newPages.length - 1];
          currentHeight = 0;
        }

        currentPage.push(b);
        currentHeight += h;

        if (b.forceOwnPage) {
          newPages.push([]);
          currentHeight = 0;
        }
      }
      while (newPages.length > 1 && newPages[newPages.length - 1].length === 0) newPages.pop();

      setPages(newPages);
    };

    recompute();
    // 이미지 로딩 등으로 실제 렌더링 높이가 나중에 바뀔 수 있어 계속 관찰한다.
    const ro = new ResizeObserver(recompute);
    if (hiddenContainerRef.current) ro.observe(hiddenContainerRef.current);
    ro.observe(footerEl);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .issued-block { padding-bottom: 14px; }
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
          /* 각 페이지는 우리가 이미 실제 페이지보다 작거나 같게 나눠뒀으므로, 짧으면 남는
             공간만큼 footer를 flex로 그 페이지 맨 아래까지 밀어내기만 하면 된다. */
          .issued-print-page { display: flex; flex-direction: column; min-height: 269mm; }
          .issued-footer { margin-top: auto; page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {pages && pages.map((pageBlocks, pageIndex) => (
        <div
          key={pageIndex}
          className="issued-print-page"
          style={{ pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto' }}
        >
          <div>
            {pageBlocks.map(b => <div key={b.key} className="issued-block">{b.content}</div>)}
          </div>
          <FooterRow documentType={documentType} company={company} />
        </div>
      ))}

      {/* 측정 전용 사본 — 실제 인쇄 폭(180mm = A4 폭에서 좌우 여백 15mm×2 제외, 위 @page와
          일치)으로 화면 밖에 블록별로 렌더링해 각 블록이 인쇄 시 실제로 차지할 높이를 잰다.
          화면 미리보기 폭(위 800px)에서 그대로 재면 줄바꿈이 달라져 실제 인쇄 결과와 어긋난다.
          footer도 같은 폭으로 따로 재는데, footer 자신의 높이만큼은 매 페이지에서 본문 몫이
          줄어들기 때문이다. */}
      <div aria-hidden ref={hiddenContainerRef} style={{ position: 'fixed', left: -99999, top: 0, width: PRINT_CONTENT_WIDTH, visibility: 'hidden' }}>
        {blocks.map(b => (
          <div
            key={b.key}
            className="issued-block"
            ref={el => {
              if (el) blockNodesRef.current.set(b.key, el);
              else blockNodesRef.current.delete(b.key);
            }}
          >
            {b.content}
          </div>
        ))}
        <div ref={footerMeasureRef}>
          <FooterRow documentType={documentType} company={company} />
        </div>
      </div>
    </div>
  );
}
