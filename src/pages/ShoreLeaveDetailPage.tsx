import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import { getUsers } from '@/services/user.service';
import { orgChartService } from '@/services/org-chart.service';
import { useTabContext } from '@/contexts/TabContext';
import { getLeaveBalance, getLeaveAdjustments, getLeaveRequestsByUser, getLeaveResets, deleteLeaveRequest, deleteLeaveAdjustment } from '@/services/shore-leave.service';
import { formatLeaveHours, type LeaveBalance } from '@/lib/leave-calc';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types/models';
import type { ShoreLeaveRequest, ShoreLeaveAdjustment, ShoreLeaveReset } from '@/types/shore-leave';

const SHORE_ROLES = ['ship_manager', 'admin', 'system_admin'];
const RESET_ROLES = ['admin', 'system_admin'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

type TimelineEntry =
  | { kind: 'request'; date: string; item: ShoreLeaveRequest }
  | { kind: 'adjustment'; date: string; item: ShoreLeaveAdjustment }
  | { kind: 'reset'; date: string; item: ShoreLeaveReset };

export default function ShoreLeaveDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { activeTabId, closeTab } = useTabContext();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [positionName, setPositionName] = useState<string | null>(null);
  const [balance, setBalance] = useState<LeaveBalance>({ legalAccruedHours: 0, companyGrantedHours: 0, accruedHours: 0, usedHours: 0, remainingHours: 0 });
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  const onBack = () => {
    if (activeTabId) closeTab(activeTabId);
    else navigate('/shore-leave-management');
  };

  useEffect(() => {
    const init = async () => {
      const me = await getCurrentUser();
      if (!me || !SHORE_ROLES.includes(me.role)) { navigate('/dashboard'); return; }
      setCurrentUser(me);
      if (!userId) { navigate('/shore-leave-management'); return; }
      await loadData(userId);
    };
    init();
  }, [userId, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async (id: string) => {
    setLoading(true);
    try {
      const [allUsers, members, requests, adjustments, resets] = await Promise.all([
        getUsers(),
        orgChartService.getOrgMembers(),
        getLeaveRequestsByUser(id),
        getLeaveAdjustments(id),
        getLeaveResets(id),
      ]);
      const user = allUsers.find(u => u.id === id) || null;
      setTargetUser(user);
      setPositionName(members.find(m => m.id === id)?.position_name || null);
      setBalance(await getLeaveBalance(id, user?.hire_date || null));

      const entries: TimelineEntry[] = [
        ...requests.map((item): TimelineEntry => ({ kind: 'request', date: item.created_at, item })),
        ...adjustments.map((item): TimelineEntry => ({ kind: 'adjustment', date: item.created_at, item })),
        ...resets.map((item): TimelineEntry => ({ kind: 'reset', date: item.created_at, item })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      setTimeline(entries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const canDelete = currentUser && RESET_ROLES.includes(currentUser.role);

  const handleDeleteRequest = async (r: ShoreLeaveRequest) => {
    if (!confirm(`${r.start_date} ~ ${r.end_date} 연차 신청 건을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteLeaveRequest(r.id);
      toast({ title: '삭제되었습니다.' });
      if (userId) await loadData(userId);
    } catch (e) {
      console.error(e);
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteAdjustment = async (a: ShoreLeaveAdjustment) => {
    if (!confirm(`${a.adjustment_type === 'grant' ? '회사 부여' : '수동 사용 입력'} 내역을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteLeaveAdjustment(a.id);
      toast({ title: '삭제되었습니다.' });
      if (userId) await loadData(userId);
    } catch (e) {
      console.error(e);
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  if (!targetUser) {
    return (
      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 mb-3"><ArrowLeft className="w-4 h-4 mr-1" />목록</Button>
        <p className="text-sm text-gray-400 text-center py-12">직원을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2"><ArrowLeft className="w-4 h-4 mr-1" />목록</Button>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">{positionName ? `${positionName} ` : ''}{targetUser.name} 연차 내역</h1>
            <p className="text-xs text-gray-500">{targetUser.hire_date ? `입사일 ${targetUser.hire_date}` : '입사일 미등록'}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">법정 발생</p>
            <p className="text-xl font-bold">{formatLeaveHours(balance.legalAccruedHours)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">회사 부여</p>
            <p className="text-xl font-bold">{formatLeaveHours(balance.companyGrantedHours)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">사용</p>
            <p className="text-xl font-bold text-gray-500">{formatLeaveHours(balance.usedHours)}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-xs text-blue-600">잔여</p>
            <p className="text-xl font-bold text-blue-700">{formatLeaveHours(balance.remainingHours)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">전체 내역</CardTitle></CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">내역이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {timeline.map(entry => {
                if (entry.kind === 'request') {
                  const r = entry.item;
                  return (
                    <div key={`req-${r.id}`} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-md text-sm">
                      <div>
                        <p className="font-medium">연차 신청 &middot; {r.start_date} ~ {r.end_date}</p>
                        <p className="text-xs text-gray-500">{r.reason || '-'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="font-semibold">{formatLeaveHours(r.hours)}</p>
                          <Badge className={`text-xs ${STATUS_LABELS[r.status]?.color}`}>{STATUS_LABELS[r.status]?.label}</Badge>
                        </div>
                        {canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 shrink-0" onClick={() => handleDeleteRequest(r)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        )}
                      </div>
                    </div>
                  );
                }
                if (entry.kind === 'adjustment') {
                  const a = entry.item;
                  const isGrant = a.adjustment_type === 'grant';
                  return (
                    <div key={`adj-${a.id}`} className={`flex items-center justify-between p-2.5 rounded-md text-sm ${isGrant ? 'bg-blue-50' : 'bg-orange-50'}`}>
                      <div>
                        <p className="font-medium">{isGrant ? '회사 부여' : '수동 사용 입력'} &middot; {new Date(a.created_at).toLocaleDateString('ko-KR')}</p>
                        <p className="text-xs text-gray-500">{a.reason || '-'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold ${isGrant ? 'text-blue-700' : 'text-orange-700'}`}>{isGrant ? '+' : '-'}{formatLeaveHours(a.hours)}</p>
                        {canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 shrink-0" onClick={() => handleDeleteAdjustment(a)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        )}
                      </div>
                    </div>
                  );
                }
                const rs = entry.item;
                return (
                  <div key={`reset-${rs.id}`} className="flex items-center justify-between p-2.5 rounded-md text-sm bg-red-50">
                    <div>
                      <p className="font-medium">{rs.reset_grants ? '사용/잔여/회사부여 초기화' : '사용/잔여 초기화'} &middot; {new Date(rs.created_at).toLocaleDateString('ko-KR')}</p>
                      <p className="text-xs text-gray-500">{rs.reason || '-'}</p>
                    </div>
                    <Badge className="text-xs bg-red-100 text-red-700">{rs.deleted_history ? '내역 삭제됨' : '내역 유지'}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
