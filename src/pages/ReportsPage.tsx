import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getCrewStatusSummary, getCrewByNationality, getCrewByRank, getShipCrewDistribution,
  type StatusSummary, type NationalitySummary, type RankSummary, type ShipCrewSummary,
} from '@/services/reports.service';
import { getExpiringCertificates, calcExpiryStats, type CertExpiryStats } from '@/services/certificate-alert.service';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  registered: { label: '등록', color: 'bg-gray-500' },
  available: { label: '대기', color: 'bg-blue-500' },
  on_board: { label: '승선', color: 'bg-green-500' },
  on_leave: { label: '휴가', color: 'bg-yellow-500' },
  retired: { label: '퇴직', color: 'bg-red-500' },
  unknown: { label: '미지정', color: 'bg-gray-300' },
};

const DEPT_COLORS: Record<string, string> = {
  deck: 'bg-blue-100 text-blue-700',
  engine: 'bg-orange-100 text-orange-700',
  catering: 'bg-green-100 text-green-700',
};

function BarChart({ items, maxCount }: { items: { label: string; count: number; color?: string }[]; maxCount: number }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-20 text-right truncate">{item.label}</span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${item.color || 'bg-blue-500'}`} style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }} />
          </div>
          <span className="text-xs font-mono w-8 text-right">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('reports_dashboard');
  const [statusSummary, setStatusSummary] = useState<StatusSummary[]>([]);
  const [nationalitySummary, setNationalitySummary] = useState<NationalitySummary[]>([]);
  const [rankSummary, setRankSummary] = useState<RankSummary[]>([]);
  const [shipCrewSummary, setShipCrewSummary] = useState<ShipCrewSummary[]>([]);
  const [certStats, setCertStats] = useState<CertExpiryStats>({ expired: 0, critical: 0, warning: 0, caution: 0, valid: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [status, nat, rank, ship, certs] = await Promise.all([
          getCrewStatusSummary(),
          getCrewByNationality(),
          getCrewByRank(),
          getShipCrewDistribution(),
          getExpiringCertificates(),
        ]);
        setStatusSummary(status);
        setNationalitySummary(nat);
        setRankSummary(rank);
        setShipCrewSummary(ship);
        setCertStats(calcExpiryStats(certs));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const totalCrew = statusSummary.reduce((sum, s) => sum + s.count, 0);

  if (loading) {
    return <><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div></>;
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">통계 대시보드</h2>
          <p className="text-xs text-gray-500">선원 관리 현황을 한눈에 확인합니다</p>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-gray-500">전체 선원</p><p className="text-2xl font-bold">{totalCrew}</p></CardContent></Card>
          {statusSummary.slice(0, 4).map(s => (
            <Card key={s.status}><CardContent className="p-4 text-center">
              <p className="text-xs text-gray-500">{STATUS_LABELS[s.status]?.label || s.status}</p>
              <p className="text-2xl font-bold">{s.count}</p>
            </CardContent></Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 선원 상태별 분포 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">선원 상태별 분포</CardTitle></CardHeader>
            <CardContent>
              <BarChart
                items={statusSummary.map(s => ({
                  label: STATUS_LABELS[s.status]?.label || s.status,
                  count: s.count,
                  color: STATUS_LABELS[s.status]?.color || 'bg-gray-400',
                }))}
                maxCount={Math.max(...statusSummary.map(s => s.count), 1)}
              />
            </CardContent>
          </Card>

          {/* 국적별 분포 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">국적별 분포</CardTitle></CardHeader>
            <CardContent>
              <BarChart
                items={nationalitySummary.slice(0, 10).map(n => ({ label: n.nationality, count: n.count }))}
                maxCount={Math.max(...nationalitySummary.map(n => n.count), 1)}
              />
            </CardContent>
          </Card>

          {/* 직급별 분포 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">직급별 분포</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {rankSummary.slice(0, 12).map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge className={`text-xs ${DEPT_COLORS[r.department] || 'bg-gray-100 text-gray-700'}`}>{r.rank_code}</Badge>
                    <span className="text-xs flex-1 truncate">{r.rank_name}</span>
                    <span className="text-xs font-mono">{r.count}명</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 선박별 인원 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">선박별 승선 인원</CardTitle></CardHeader>
            <CardContent>
              {shipCrewSummary.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">승선 중인 선원이 없습니다</p>
              ) : (
                <BarChart
                  items={shipCrewSummary.slice(0, 10).map(s => ({ label: s.ship_name, count: s.crew_count, color: 'bg-cyan-500' }))}
                  maxCount={Math.max(...shipCrewSummary.map(s => s.crew_count), 1)}
                />
              )}
            </CardContent>
          </Card>

          {/* 증서 만료 현황 */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">증서 만료 현황 요약</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-3">
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                  <p className="text-xs text-red-600">만료됨</p><p className="text-xl font-bold text-red-700">{certStats.expired}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-center">
                  <p className="text-xs text-orange-600">30일 이내</p><p className="text-xl font-bold text-orange-700">{certStats.critical}</p>
                </div>
                <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                  <p className="text-xs text-yellow-600">60일 이내</p><p className="text-xl font-bold text-yellow-700">{certStats.warning}</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                  <p className="text-xs text-blue-600">90일 이내</p><p className="text-xl font-bold text-blue-700">{certStats.caution}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                  <p className="text-xs text-green-600">유효</p><p className="text-xl font-bold text-green-700">{certStats.valid}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
