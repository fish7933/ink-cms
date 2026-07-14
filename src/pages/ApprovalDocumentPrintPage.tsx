import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { approvalDocumentService, getLeaveDetail, type LeaveDetail } from '@/services/approval-document.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import { getShorePositions } from '@/services/shore-position.service';
import { orgChartService } from '@/services/org-chart.service';
import ApprovalDocumentIssuedSheet from '@/components/document/ApprovalDocumentIssuedSheet';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회).
// 별도 브라우저 탭에서 열려서, 인쇄하거나 닫아도 원래 작업 중이던 탭/화면에는 전혀 영향을 주지 않는다.
export default function ApprovalDocumentPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [doc, setDoc] = useState<ApprovalDocumentWithDetails | null>(null);
  const [docType, setDocType] = useState<ApprovalDocumentType | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [creatorPositionName, setCreatorPositionName] = useState<string | null>(null);
  const [leaveDetail, setLeaveDetail] = useState<LeaveDetail | null>(null);
  const [includeAttachments, setIncludeAttachments] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [docs, types, companyInfo, shorePositions, members] = await Promise.all([
        approvalDocumentService.getDocumentDetails([id]),
        approvalDocumentService.getDocumentTypes(true),
        getCompanyInfo().catch(() => null),
        getShorePositions().catch(() => []),
        orgChartService.getOrgMembers().catch(() => []),
      ]);
      const found = docs[0] || null;
      setDoc(found);
      setDocType(found ? types.find(t => t.id === found.document_type_id) || null : null);
      setCompany(companyInfo);
      setPositions(shorePositions);
      setCreatorPositionName(found ? members.find(m => m.id === found.created_by)?.position_name || null : null);
      setLeaveDetail(await getLeaveDetail(found?.reference_type ?? null, found?.reference_id ?? null).catch(() => null));
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  if (unauthorized) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  if (!doc) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>문서를 찾을 수 없습니다.</div>;

  // PDF 등 이미지가 아닌 첨부파일은 시행문 인쇄물에 함께 합쳐 넣지 않는다(iframe 인쇄가
  // 첫 페이지만 찍히는 등 브라우저 인쇄와 맞지 않음) — 대신 여기서 새 탭으로 열어 원본
  // 뷰어로 따로 인쇄할 수 있게 한다.
  const nonImageAttachments = doc.attachments.filter(a => !a.type?.startsWith('image/'));
  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  return (
    <div className="print-page-wrapper" style={{ padding: '28px 36px 48px' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
          .print-page-wrapper { padding: 0 !important; }
        }
      `}</style>
      <div className="print-actions" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
          {doc.attachments.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#444', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeAttachments} onChange={e => setIncludeAttachments(e.target.checked)} />
              첨부파일({doc.attachments.length}개)도 함께 출력
            </label>
          )}
          <button
            onClick={() => window.print()}
            style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
          >
            인쇄 / PDF 저장
          </button>
        </div>
        {nonImageAttachments.length > 0 && (
          <div style={{ fontSize: 12, color: '#666', textAlign: 'right' }}>
            PDF 등은 함께 인쇄되지 않습니다. 새 탭에서 열어 따로 인쇄해주세요:{' '}
            {nonImageAttachments.map((a, i) => (
              <span key={i}>
                <button
                  onClick={() => openAttachment(a.path)}
                  style={{ color: '#2563eb', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
                >
                  {a.name}
                </button>
                {i < nonImageAttachments.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}
      </div>
      <ApprovalDocumentIssuedSheet doc={doc} documentType={docType} company={company} positions={positions} creatorPositionName={creatorPositionName} includeAttachments={includeAttachments} leaveDetail={leaveDetail} />
    </div>
  );
}
