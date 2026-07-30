import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBoardingScoreWeights, updateBoardingScoreWeights, DEFAULT_BOARDING_SCORE_WEIGHTS, type BoardingScoreWeights } from '@/services/crew-boarding-score.service';
import { useToast } from '@/hooks/use-toast';

const FIELDS: { key: keyof BoardingScoreWeights; label: string; hint: string }[] = [
  { key: 'shipType', label: '선종 경험', hint: '과거 승선했던 선종이 대상 선박과 같은지' },
  { key: 'size', label: '선박 사이즈 경험', hint: '과거 승선했던 선박 총톤수와 대상 선박의 근접도' },
  { key: 'route', label: '항로 경험', hint: '과거 승선했던 선박의 항로와 대상 선박 항로 일치 여부' },
  { key: 'evaluation', label: '기존 고과', hint: '확정된 승선평가 점수 평균' },
  { key: 'workYears', label: '근무년수', hint: '누적 승선 기간(연 단위, 체감 반영)' },
  { key: 'sameRank', label: '동직급 경력', hint: '지금 그 직급인지가 아니라, 실제 그 직급으로 승선해본 연차(체감 반영)' },
  { key: 'rest', label: '휴식 기간', hint: '마지막 하선일로부터 90일 지났을 때 최고점' },
  { key: 'desiredDate', label: '승선 희망일', hint: '선원이 등록한 희망일과 목표 승선일의 근접도' },
  { key: 'familiarity', label: '선박/플릿/선주사 친숙도', hint: '같은 선박 승선 경험이 최고점, 없으면 같은 플릿, 그것도 없으면 같은 선주사' },
  { key: 'age', label: '나이', hint: '30대(30~39세)가 최고점, 멀어질수록 감점' },
];

// 로테이션 승선 후보 추천 점수(crew-boarding-score.service.ts)의 요소별 가중치를 관리자가
// 조정하는 화면. 입력값 자체는 건드리지 않고(타이핑 도중 숫자가 튀는 문제 방지), 옆에
// "100 기준" 환산값만 실시간으로 보여준다 — 실제 채점(getBoardingScores)도 가중치의 절대값이
// 아니라 상대 비율로 나누기 때문에(weighted/weightSum), 저장된 합계가 100이든 125든 점수는
// 항상 0~100 기준으로 나온다.
export default function CrewBoardingScoreSettingsPage() {
  const { toast } = useToast();
  const [weights, setWeights] = useState<BoardingScoreWeights>(DEFAULT_BOARDING_SCORE_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setWeights(await getBoardingScoreWeights());
    } catch (e) {
      console.error(e);
      toast({ title: '불러오기 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateBoardingScoreWeights(weights);
      toast({ title: '저장 완료' });
    } catch (e) {
      console.error(e);
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const total = FIELDS.reduce((s, f) => s + (Number(weights[f.key]) || 0), 0);
  // 중요도(현재 가중치)가 높은 항목이 항상 위로 오도록 매 렌더마다 재정렬한다.
  const sortedFields = [...FIELDS].sort((a, b) => (Number(weights[b.key]) || 0) - (Number(weights[a.key]) || 0));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">승선 적합도 설정</CardTitle>
          <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving || loading}>
            <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
          </Button>
        </div>
        <p className="text-xs text-gray-500 pt-1">
          로테이션 승선 후보를 추천할 때 각 요소를 얼마나 중요하게 볼지 정합니다. 상대적인 비중이라 합이 꼭 100일 필요는 없고, 옆의 "100 기준" 값은 현재 입력값들을 100 기준으로 환산해 참고용으로 보여줍니다. 실제 적합도 점수는 합계와 무관하게 항상 0~100으로 계산됩니다.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : (
          <div className="space-y-3 max-w-xl">
            {sortedFields.map(f => {
              const raw = Number(weights[f.key]) || 0;
              const normalized = total > 0 ? Math.round((raw / total) * 1000) / 10 : 0;
              return (
                <div key={f.key} className="grid grid-cols-[1fr_90px_90px] items-center gap-3">
                  <div>
                    <Label className="text-xs">{f.label}</Label>
                    <p className="text-[11px] text-gray-400">{f.hint}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 text-sm"
                    value={weights[f.key]}
                    onChange={e => setWeights(w => ({ ...w, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                  />
                  <p className="text-xs text-gray-500 text-right">100 기준 {normalized}</p>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 pt-1">합계: {total}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
