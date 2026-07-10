import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Minus, History, Paperclip, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getUsers } from '@/services/user.service';
import { orgChartService } from '@/services/org-chart.service';
import { useTabContext } from '@/contexts/TabContext';
import {
  getLeaveBalance, addLeaveAdjustment, resetLeaveUsage,
} from '@/services/shore-leave.service';
import { getAllSickLeaveRequests } from '@/services/sick-leave.service';
import { formatLeaveHours, HOURS_PER_DAY } from '@/lib/leave-calc';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types/models';
import type { SickLeaveRequestWithDetails } from '@/types/sick-leave';

const SHORE_ROLES = ['ship_manager', 'admin', 'system_admin'];
const RESET_ROLES = ['admin', 'system_admin'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

interface Row {
  user: User;
  positionName: string | null;
  legalAccruedHours: number;
  companyGrantedHours: number;
  accruedHours: number;
  usedHours: number;
  remainingHours: number;
}

export default function ShoreLeaveManagementPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [sickRequests, setSickRequests] = useState<SickLeaveRequestWithDetails[]>([]);
  const [positionByUser, setPositionByUser] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);

  const [adjustDialog, setAdjustDialog] = useState<{ user: User; type: 'grant' | 'manual_use' } | null>(null);
  const [adjustForm, setAdjustForm] = useState({ days: '0', hoursExtra: '0', reason: '' });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  const [resetDialog, setResetDialog] = useState<Row | null>(null);
  const [resetForm, setResetForm] = useState({ reason: '', deleteHistory: false });
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const me = await getCurrentUser();
      if (!me || !SHORE_ROLES.includes(me.role)) { navigate('/dashboard'); return; }
      setCurrentUser(me);
      await loadData();
    };
    init();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    try {
      const [allUsers, members, sick] = await Promise.all([
        getUsers(),
        orgChartService.getOrgMembers(),
        getAllSickLeaveRequests(),
      ]);
      const posMap = new Map(members.map(m => [m.id, m.position_name]));
      setPositionByUser(posMap);
      setSickRequests(sick);

      const shoreUsers = allUsers.filter(u => SHORE_ROLES.includes(u.role));
      const computed = await Promise.all(shoreUsers.map(async u => {
        const balance = await getLeaveBalance(u.id, u.hire_date || null);
        return { user: u, positionName: posMap.get(u.id) || null, ...balance };
      }));
      setRows(computed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (user: User) => {
    openNewTab(`/shore-leave-management/${user.id}`, `${user.name} 연차 내역`);
  };

  const openAdjust = (user: User, type: 'grant' | 'manual_use') => {
    setAdjustForm({ days: '0', hoursExtra: '0', reason: '' });
    setAdjustDialog({ user, type });
  };

  const adjustTotalHours = (parseFloat(adjustForm.days) || 0) * HOURS_PER_DAY + (parseFloat(adjustForm.hoursExtra) || 0);

  const submitAdjust = async () => {
    if (!adjustDialog || !currentUser) return;
    if (adjustTotalHours <= 0) { toast({ title: '일수/시간을 확인하세요.', variant: 'destructive' }); return; }
    if (!adjustForm.reason.trim()) { toast({ title: '사유를 입력하세요.', variant: 'destructive' }); return; }
    try {
      setAdjustSubmitting(true);
      await addLeaveAdjustment({
        user_id: adjustDialog.user.id,
        adjustment_type: adjustDialog.type,
        hours: adjustTotalHours,
        reason: adjustForm.reason,
        created_by: currentUser.id,
      });
      toast({ title: adjustDialog.type === 'grant' ? '연차가 부여되었습니다.' : '연차 사용이 입력되었습니다.' });
      setAdjustDialog(null);
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '처리 실패', variant: 'destructive' });
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const openReset = (row: Row) => {
    setResetForm({ reason: '', deleteHistory: false });
    setResetDialog(row);
  };

  const submitReset = async () => {
    if (!resetDialog || !currentUser) return;
    if (resetDialog.usedHours <= 0) { toast({ title: '초기화할 사용 내역이 없습니다.', variant: 'destructive' }); return; }
    if (!resetForm.reason.trim()) { toast({ title: '사유를 입력하세요.', variant: 'destructive' }); return; }
    try {
      setResetSubmitting(true);
      await resetLeaveUsage({
        user_id: resetDialog.user.id,
        delete_history: resetForm.deleteHistory,
        reason: resetForm.reason,
        created_by: currentUser.id,
      });
      toast({ title: '사용/잔여 연차가 초기화되었습니다.' });
      setResetDialog(null);
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '초기화 실패', variant: 'destructive' });
    } finally {
      setResetSubmitting(false);
    }
  };

  const sickTotalsByUser = new Map<string, number>();
  for (const r of sickRequests) {
    if (r.status !== 'approved') continue;
    sickTotalsByUser.set(r.user_id, (sickTotalsByUser.get(r.user_id) || 0) + Number(r.hours));
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">육상 직원 연차 관리</h1>
          <p className="text-sm text-gray-500">근로기준법에 따라 자동 발생하는 법정 연차와 회사가 재량으로 부여한 연차를 구분해서 관리하며, 승인된 신청 내역/수동 사용 입력을 반영해 잔여 연차를 계산합니다.</p>
        </div>
      </div>

      <Tabs defaultValue="annual">
        <TabsList>
          <TabsTrigger value="annual">연차 관리</TabsTrigger>
          <TabsTrigger value="sick">질병휴가 현황</TabsTrigger>
        </TabsList>

        <TabsContent value="annual" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">직원별 연차 현황</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">입사일</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">법정 발생</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">회사 부여</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">사용</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">잔여</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600 w-64">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-400">등록된 육상 직원이 없습니다</td></tr>
                    ) : rows.map(r => (
                      <tr key={r.user.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{r.positionName ? `${r.positionName} ` : ''}{r.user.name}</td>
                        <td className="p-2 text-gray-500">
                          {r.user.hire_date || <span className="text-red-500">미등록</span>}
                        </td>
                        <td className="p-2 text-center">{formatLeaveHours(r.legalAccruedHours)}</td>
                        <td className="p-2 text-center text-blue-600">{r.companyGrantedHours > 0 ? formatLeaveHours(r.companyGrantedHours) : '-'}</td>
                        <td className="p-2 text-center text-gray-500">{formatLeaveHours(r.usedHours)}</td>
                        <td className="p-2 text-center font-semibold text-blue-700">{formatLeaveHours(r.remainingHours)}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => openDetail(r.user)}>
                              <History className="w-3 h-3" />내역
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 text-blue-600" onClick={() => openAdjust(r.user, 'grant')}>
                              <Plus className="w-3 h-3" />회사 부여
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 text-orange-600" onClick={() => openAdjust(r.user, 'manual_use')}>
                              <Minus className="w-3 h-3" />사용 입력
                            </Button>
                            {currentUser && RESET_ROLES.includes(currentUser.role) && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 text-red-600" onClick={() => openReset(r)}>
                                <RotateCcw className="w-3 h-3" />초기화
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sick" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">직원별 누적 질병휴가(승인 기준)</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">누적 사용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={2} className="text-center py-8 text-gray-400">데이터가 없습니다</td></tr>
                    ) : rows.map(r => (
                      <tr key={r.user.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{r.positionName ? `${r.positionName} ` : ''}{r.user.name}</td>
                        <td className="p-2 text-center">{formatLeaveHours(sickTotalsByUser.get(r.user.id) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">질병휴가 신청 내역 (전체)</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2">이름</th>
                      <th className="text-left p-2">기간</th>
                      <th className="text-center p-2">일수/시간</th>
                      <th className="text-left p-2">사유</th>
                      <th className="text-center p-2">상태</th>
                      <th className="text-center p-2">증빙</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sickRequests.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400">신청 내역이 없습니다</td></tr>
                    ) : sickRequests.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="p-2 font-medium">{positionByUser.get(r.user_id) ? `${positionByUser.get(r.user_id)} ` : ''}{r.user_name}</td>
                        <td className="p-2">{r.start_date} ~ {r.end_date}</td>
                        <td className="p-2 text-center">{formatLeaveHours(r.hours)}</td>
                        <td className="p-2 text-gray-500">{r.reason || '-'}</td>
                        <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_LABELS[r.status]?.color}`}>{STATUS_LABELS[r.status]?.label}</Badge></td>
                        <td className="p-2 text-center">
                          {r.attachments && r.attachments.length > 0 ? (
                            <details className="inline-block text-left">
                              <summary className="cursor-pointer text-blue-600 inline-flex items-center gap-1 list-none"><Paperclip className="w-3 h-3" />{r.attachments.length}</summary>
                              <div className="mt-1 space-y-0.5">
                                {r.attachments.map(a => (
                                  <a key={a.path} href={supabase.storage.from('documents').getPublicUrl(a.path).data.publicUrl} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline truncate max-w-[160px]">{a.name}</a>
                                ))}
                              </div>
                            </details>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 직원별 연차 내역 */}
      {/* 수동 부여 / 사용 입력 */}
      <Dialog open={!!adjustDialog} onOpenChange={open => !open && setAdjustDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustDialog?.user.name}님 {adjustDialog?.type === 'grant' ? '연차 회사 부여' : '연차 수동 사용 입력'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">일수</Label><Input type="number" step="0.5" min="0" value={adjustForm.days} onChange={e => setAdjustForm({ ...adjustForm, days: e.target.value })} className="h-9 text-sm" disabled={adjustSubmitting} /></div>
              <div className="space-y-1.5"><Label className="text-xs">시간</Label><Input type="number" step="0.5" min="0" max="23.5" value={adjustForm.hoursExtra} onChange={e => setAdjustForm({ ...adjustForm, hoursExtra: e.target.value })} className="h-9 text-sm" disabled={adjustSubmitting} /></div>
            </div>
            <p className="text-xs text-gray-500">합계: <span className="font-medium text-gray-700">{formatLeaveHours(adjustTotalHours)}</span></p>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 *</Label>
              <Textarea value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} rows={2} className="text-sm resize-none" disabled={adjustSubmitting} placeholder={adjustDialog?.type === 'grant' ? '예: 포상휴가, 창립기념일 특별연차' : '예: 소급 반영 - 결재 없이 사용한 연차'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(null)} disabled={adjustSubmitting}>취소</Button>
            <Button onClick={submitAdjust} disabled={adjustSubmitting}>{adjustSubmitting ? '처리 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 사용/잔여 초기화 (시스템관리자 이상) */}
      <Dialog open={!!resetDialog} onOpenChange={open => !open && setResetDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{resetDialog?.user.name}님 연차 사용/잔여 초기화</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-md text-sm">
              <p className="text-xs text-gray-500">현재 사용</p>
              <p className="font-semibold text-orange-600">{resetDialog && formatLeaveHours(resetDialog.usedHours)}</p>
              <p className="text-xs text-gray-400 mt-1">초기화하면 사용이 0으로, 잔여는 발생(법정+회사부여) 그대로 복원됩니다. 회사 부여분은 영향받지 않습니다.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 *</Label>
              <Textarea value={resetForm.reason} onChange={e => setResetForm({ ...resetForm, reason: e.target.value })} rows={2} className="text-sm resize-none" disabled={resetSubmitting} placeholder="예: 연차 재산정으로 인한 초기화" />
            </div>
            <label className="flex items-start gap-2 p-2.5 border rounded-md cursor-pointer">
              <Checkbox checked={resetForm.deleteHistory} onCheckedChange={c => setResetForm({ ...resetForm, deleteHistory: c === true })} disabled={resetSubmitting} className="mt-0.5" />
              <span className="text-xs">
                <span className="font-medium text-red-600">내역까지 삭제</span>
                <span className="block text-gray-500 mt-0.5">체크하면 초기화 이전의 연차 신청/수동 사용 입력 내역 자체를 삭제합니다. 되돌릴 수 없습니다. 체크하지 않으면 내역은 그대로 남고 잔여 계산에서만 제외됩니다.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)} disabled={resetSubmitting}>취소</Button>
            <Button variant="destructive" onClick={submitReset} disabled={resetSubmitting}>{resetSubmitting ? '처리 중...' : '초기화'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
