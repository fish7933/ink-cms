import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import CrewBoardingFitDetail from '@/components/rotation/CrewBoardingFitDetail';

// 로테이션 승선 후보 목록에서 "적합도" 링크로 열리는 상세 분석 화면 — 요소별 점수/근거를 전부 보여준다.
export default function CrewBoardingFitDetailPage() {
  const { crewId } = useParams<{ crewId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shipId = searchParams.get('shipId') || '';
  const embarkDate = searchParams.get('embarkDate') || undefined;
  const rankId = searchParams.get('rankId') || undefined;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 px-2"><X className="w-4 h-4 mr-1" />닫기</Button>
      {crewId && <CrewBoardingFitDetail crewId={crewId} shipId={shipId} embarkDate={embarkDate} rankId={rankId} />}
    </div>
  );
}
