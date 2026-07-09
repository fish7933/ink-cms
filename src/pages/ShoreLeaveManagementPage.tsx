import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/store';
import { getUsers } from '@/services/user.service';
import { getUsedLeaveDays } from '@/services/shore-leave.service';
import { calculateLeaveBalance } from '@/lib/leave-calc';
import type { User } from '@/types/models';

const ROLE_LABELS: Record<string, string> = { ship_manager: '선박관리사', admin: '슈퍼관리자', system_admin: '시스템관리자' };
const SHORE_ROLES = ['ship_manager', 'admin', 'system_admin'];

interface Row {
  user: User;
  accrued: number;
  used: number;
  remaining: number;
}

export default function ShoreLeaveManagementPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser || !SHORE_ROLES.includes(currentUser.role)) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    try {
      const users = (await getUsers()).filter(u => SHORE_ROLES.includes(u.role));
      const computed = await Promise.all(users.map(async u => {
        const used = u.hire_date ? await getUsedLeaveDays(u.id) : 0;
        const balance = u.hire_date ? calculateLeaveBalance(u.hire_date, used) : { accrued: 0, used: 0, remaining: 0 };
        return { user: u, ...balance };
      }));
      setRows(computed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">육상 직원 연차 관리</h1>
          <p className="text-sm text-gray-500">근로기준법 기준 발생 연차와 승인된 연차 사용 내역으로 잔여 연차를 계산합니다.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">직원별 연차 현황</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">역할</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">입사일</th>
                  <th className="text-center p-2 text-xs font-medium text-gray-600">발생</th>
                  <th className="text-center p-2 text-xs font-medium text-gray-600">사용</th>
                  <th className="text-center p-2 text-xs font-medium text-gray-600">잔여</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">등록된 육상 직원이 없습니다</td></tr>
                ) : rows.map(r => (
                  <tr key={r.user.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-medium">{r.user.name}</td>
                    <td className="p-2 text-gray-500">{ROLE_LABELS[r.user.role] || r.user.role}</td>
                    <td className="p-2 text-gray-500">
                      {r.user.hire_date || <span className="text-red-500">미등록</span>}
                    </td>
                    <td className="p-2 text-center">{r.accrued}일</td>
                    <td className="p-2 text-center text-gray-500">{r.used}일</td>
                    <td className="p-2 text-center font-semibold text-blue-700">{r.remaining}일</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
