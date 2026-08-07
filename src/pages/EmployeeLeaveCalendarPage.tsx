import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, getUsers } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { getAllLeaveRequests } from '@/services/shore-leave.service';
import { getAllSickLeaveRequests } from '@/services/sick-leave.service';
import { usePermissions } from '@/hooks/usePermissions';
import LeaveStatusCalendar, { type LeaveCalendarEntry } from '@/components/leave/LeaveStatusCalendar';

const SHORE_ROLES = ['ship_manager', 'admin', 'system_admin'];

// 육상 직원 전체가 공유해서 보는 휴가 현황 캘린더 — 승인된 연차/질병휴가와 상신중인 건을 함께
// 보여준다. 관리 기능(부여/차감/초기화 등)은 없고 조회 전용.
export default function EmployeeLeaveCalendarPage() {
  const navigate = useNavigate();
  const [positionByUser, setPositionByUser] = useState<Map<string, string | null>>(new Map());
  const [entries, setEntries] = useState<LeaveCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const permissions = usePermissions('shore_leave_calendar');

  useEffect(() => {
    const init = async () => {
      const me = await getCurrentUser();
      if (!me || !SHORE_ROLES.includes(me.role)) { navigate('/dashboard'); return; }
      try {
        const [allUsers, members, leaveRequests, sickRequests] = await Promise.all([
          getUsers(),
          orgChartService.getOrgMembers(),
          getAllLeaveRequests(),
          getAllSickLeaveRequests(),
        ]);
        setPositionByUser(new Map(members.map(m => [m.id, m.position_name])));
        const exemptUserIds = new Set(allUsers.filter(u => u.is_leave_exempt).map(u => u.id));
        setEntries([
          ...leaveRequests
            .filter(r => (r.status === 'approved' || r.status === 'pending') && !exemptUserIds.has(r.user_id))
            .map(r => ({ id: r.id, user_id: r.user_id, user_name: r.user_name, kind: 'annual' as const, status: r.status, start_date: r.start_date, end_date: r.end_date, start_time: r.start_time, end_time: r.end_time })),
          ...sickRequests
            .filter(r => r.status === 'approved' || r.status === 'pending')
            .map(r => ({ id: r.id, user_id: r.user_id, user_name: r.user_name, kind: 'sick' as const, status: r.status, start_date: r.start_date, end_date: r.end_date, start_time: r.start_time, end_time: r.end_time })),
        ]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">직원 휴가 현황</h1>
          <p className="text-sm text-gray-500">전 직원의 연차/질병휴가 사용 현황을 함께 볼 수 있는 캘린더입니다. 승인된 건과 상신 후 결재중인 건이 함께 표시됩니다.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">휴가 현황 캘린더</CardTitle></CardHeader>
        <CardContent>
          <LeaveStatusCalendar entries={entries} positionByUser={positionByUser} />
        </CardContent>
      </Card>
    </div>
  );
}
