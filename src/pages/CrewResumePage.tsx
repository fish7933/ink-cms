import { useParams } from 'react-router-dom';
import CrewResumeSheet from '@/components/crew/CrewResumeSheet';

// 사이드바/헤더 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회).
export default function CrewResumePage() {
  const { id } = useParams<{ id: string }>();

  if (!id) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: 'red' }}>선원 ID 없음</div>;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; }

        .print-btn {
          position: fixed; top: 16px; right: 16px; z-index: 999;
          display: flex; gap: 8px;
          background: #1d4ed8; color: #fff;
          border: none; border-radius: 6px; padding: 8px 16px;
          font-size: 13px; cursor: pointer; font-weight: 600;
        }
        .print-btn:hover { background: #1e40af; }

        .resume-page-wrapper { max-width: 210mm; margin: 0 auto; padding: 10mm; }

        @media print {
          .print-btn { display: none !important; }
          .resume-page-wrapper { padding: 0; max-width: 100%; }
          @page { size: A4; margin: 10mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>
        인쇄 / PDF 저장
      </button>

      <div className="resume-page-wrapper">
        <CrewResumeSheet crewId={id} />
      </div>
    </>
  );
}
