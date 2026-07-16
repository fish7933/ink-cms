import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, Clock, CheckCircle, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getExpiringCertificates, calcExpiryStats, type CertExpiryItem, type CertExpiryStats } from '@/services/certificate-alert.service';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_CONFIG = {
  expired: { label: '만료됨', color: 'bg-red-100 text-red-700', icon: ShieldAlert, cardBg: 'bg-red-50 border-red-200' },
  critical: { label: '30일 이내', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle, cardBg: 'bg-orange-50 border-orange-200' },
  warning: { label: '60일 이내', color: 'bg-yellow-100 text-yellow-700', icon: Clock, cardBg: 'bg-yellow-50 border-yellow-200' },
  caution: { label: '90일 이내', color: 'bg-blue-100 text-blue-700', icon: Clock, cardBg: 'bg-blue-50 border-blue-200' },
  valid: { label: '유효', color: 'bg-green-100 text-green-700', icon: CheckCircle, cardBg: 'bg-green-50 border-green-200' },
};

export default function CertificateExpiryDashboardPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('certificate_expiry');
  const [items, setItems] = useState<CertExpiryItem[]>([]);
  const [stats, setStats] = useState<CertExpiryStats>({ expired: 0, critical: 0, warning: 0, caution: 0, valid: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getExpiringCertificates();
      setItems(data);
      setStats(calcExpiryStats(data));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return item.crew_name.toLowerCase().includes(t) || item.cert_name.toLowerCase().includes(t) || item.rank_name.toLowerCase().includes(t);
    }
    return true;
  });

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">증서 만료 현황</CardTitle>
            <p className="text-xs text-muted-foreground">선원 증서/자격증의 만료 현황을 확인합니다</p>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* 통계 카드 */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(key => {
                const cfg = STATUS_CONFIG[key];
                const Icon = cfg.icon;
                const count = stats[key];
                return (
                  <div
                    key={key}
                    className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${cfg.cardBg} ${statusFilter === key ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-600">{cfg.label}</p>
                        <p className="text-2xl font-bold">{count}</p>
                      </div>
                      <Icon className="w-6 h-6 opacity-60" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 검색 & 필터 */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input placeholder="선원명, 증서명, 직급으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="상태" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {(statusFilter !== 'all' || searchTerm) && (
                <Button variant="outline" size="sm" onClick={() => { setStatusFilter('all'); setSearchTerm(''); }} className="h-9 text-xs gap-1">
                  <X className="w-3 h-3" />초기화
                </Button>
              )}
            </div>

            {/* 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2">선원명</th>
                    <th className="text-left p-2">직급</th>
                    <th className="text-left p-2">증서명</th>
                    <th className="text-left p-2">증서번호</th>
                    <th className="text-left p-2">만료일</th>
                    <th className="text-right p-2">남은 일수</th>
                    <th className="text-center p-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">해당하는 증서가 없습니다.</td></tr>
                  ) : filteredItems.map((item, idx) => (
                    <tr
                      key={`${item.crew_id}-${idx}`}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/crew/${item.crew_id}`)}
                    >
                      <td className="p-2 font-medium">{item.crew_name}</td>
                      <td className="p-2">{item.rank_code || item.rank_name}</td>
                      <td className="p-2">{item.cert_name}</td>
                      <td className="p-2 text-gray-500">{item.cert_number || '-'}</td>
                      <td className="p-2">{item.expiry_date}</td>
                      <td className="p-2 text-right font-mono">
                        {item.days_remaining < 0
                          ? <span className="text-red-600 font-semibold">{Math.abs(item.days_remaining)}일 초과</span>
                          : <span>{item.days_remaining}일</span>
                        }
                      </td>
                      <td className="p-2 text-center">
                        <Badge className={`text-xs ${STATUS_CONFIG[item.status].color}`}>
                          {STATUS_CONFIG[item.status].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 text-right">총 {filteredItems.length}건</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
