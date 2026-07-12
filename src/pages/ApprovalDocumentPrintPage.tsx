import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { approvalDocumentService } from '@/services/approval-document.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import { getShorePositions } from '@/services/shore-position.service';
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
  const [includeAttachments, setIncludeAttachments] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [docs, types, companyInfo, shorePositions] = await Promise.all([
        approvalDocumentService.getDocumentDetails([id]),
        approvalDocumentService.getDocumentTypes(true),
        getCompanyInfo().catch(() => null),
        getShorePositions().catch(() => []),
      ]);
      const found = docs[0] || null;
      setDoc(found);
      setDocType(found ? types.find(t => t.id === found.document_type_id) || null : null);
      setCompany(companyInfo);
      setPositions(shorePositions);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  if (unauthorized) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  if (!doc) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>문서를 찾을 수 없습니다.</div>;

  return (
    <div style={{ padding: '28px 36px 48px' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
        }
      `}</style>
      <div className="print-actions" style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
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
      <ApprovalDocumentIssuedSheet doc={doc} documentType={docType} company={company} positions={positions} includeAttachments={includeAttachments} />
    </div>
  );
}
