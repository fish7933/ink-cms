import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { crewService } from '@/services/crew.service';
import { crewDisplayName } from '@/lib/utils';
import { getBoardingScoreDetail, type CrewBoardingScoreDetail } from '@/services/crew-boarding-score.service';

// 로테이션 승선 후보 목록에서 "적합도" 링크로 열리는 상세 분석 화면 — 요소별 점수/근거를 전부 보여준다.
export default function CrewBoardingFitDetailPage() {
  const { crewId } = useParams<{ crewId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shipId = searchParams.get('shipId') || '';
  const embarkDate = searchParams.get('embarkDate') || undefined;

  const [loading, setLoading] = useState(true);
  const [crewName, setCrewName] = useState('');
  const [rankLabel, setRankLabel] = useState('');
  const [shipName, setShipName] = useState('');
  const [detail, setDetail] = useState<CrewBoardingScoreDetail | null>(null);

  useEffect(() => {
    if (!crewId || !shipId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [crew, ship, scoreDetail] = await Promise.all([
        crewService.getById(crewId),
        supabase.from('ships').select('name').eq('id', shipId).maybeSingle(),
        getBoardingScoreDetail(crewId, { targetShipId: shipId, targetEmbarkDate: embarkDate }),
      ]);
      if (crew) {
        setCrewName(crewDisplayName(crew));
        if (crew.rank_id) {
          const { data: rank } = await supabase.from('ranks').select('rank_code, name').eq('id', crew.rank_id).maybeSingle();
          setRankLabel(rank?.rank_code || rank?.name || '');
        }
      }
      setShipName(ship.data?.name || '');
      setDetail(scoreDetail);
      setLoading(false);
    })();
  }, [crewId, shipId, embarkDate]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  if (!shipId || !detail) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 px-2 mb-3"><X className="w-4 h-4 mr-1" />닫기</Button>
        <p className="text-sm text-gray-400 text-center py-12">적합도 정보를 계산할 수 없습니다. 대상 선박 정보가 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8 px-2"><X className="w-4 h-4 mr-1" />닫기</Button>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {rankLabel && <span className="text-gray-500 font-normal mr-1">[{rankLabel}]</span>}
              {crewName} — 승선 적합도 분석
            </CardTitle>
            <span className="text-2xl font-bold text-emerald-700">{detail.score}점</span>
          </div>
          <p className="text-xs text-gray-500">대상 선박: {shipName || '-'}{embarkDate ? ` · 목표 승선일: ${embarkDate}` : ''}</p>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">요소</th>
                  <th className="text-center p-2 text-xs font-medium text-gray-600">가중치</th>
                  <th className="text-center p-2 text-xs font-medium text-gray-600">점수</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">근거</th>
                </tr>
              </thead>
              <tbody>
                {detail.factors.map(f => (
                  <tr key={f.key} className="border-b last:border-0">
                    <td className="p-2 font-medium whitespace-nowrap">{f.label}</td>
                    <td className="p-2 text-center text-gray-500">{f.weight}</td>
                    <td className="p-2 text-center">
                      {f.value === null ? (
                        <span className="text-gray-300">제외</span>
                      ) : (
                        <span className={f.value >= 0.7 ? 'text-emerald-700 font-semibold' : f.value >= 0.4 ? 'text-amber-600' : 'text-red-500'}>
                          {Math.round(f.value * 100)}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-gray-600 text-xs">{f.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 pt-2">"제외"로 표시된 요소는 비교할 이력/정보가 없어 채점에서 빠졌습니다(감점이 아닙니다) — 총점은 데이터가 있는 요소끼리만 가중평균한 값입니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}
