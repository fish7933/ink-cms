import { useState, useEffect } from 'react';
import { Plus, Search, X, Check, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LeaveRequestDialog from '@/components/crew/LeaveRequestDialog';
import { getLeaveRequests, approveLeaveRequest, rejectLeaveRequest, deleteLeaveRequest } from '@/services/leave.service';
import type { LeaveRequestWithDetails } from '@/types/leave';
import { useToast } from '@/hooks/use-toast';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '연차', sick: '병가', special: '특별', unpaid: '무급', compensatory: '보상', maternity: '출산',
};
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '임시저장', color: 'bg-gray-100 text-gray-700' },
  pending: { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

export default function LeaveManagementPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<LeaveRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LeaveRequestWithDetails | undefined>();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getLeaveRequests();
      setRequests(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const getCount = (status: string) => status === 'all' ? requests.length : requests.filter(r => r.status === status).length;

  const filtered = requests.filter(r => {
    if (activeTab !== 'all' && r.status !== activeTab) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return r.crew_name.toLowerCase().includes(t) || r.rank_name.toLowerCase().includes(t);
    }
    return true;
  });

  const handleApprove = async (id: string) => {
    try {
      await approveLeaveRequest(id, '');
      toast({ title: '승인 완료' });
      loadData();
    } catch { toast({ title: '승인 실패', variant: 'destructive' }); }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('반려 사유를 입력하세요:');
    if (reason === null) return;
    try {
      await rejectLeaveRequest(id, reason);
      toast({ title: '반려 완료' });
      loadData();
    } catch { toast({ title: '반려 실패', variant: 'destructive' }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 휴가 신청을 삭제하시겠습니까?')) return;
    try {
      await deleteLeaveRequest(id);
      toast({ title: '삭제 완료' });
      loadData();
    } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  if (loading) {
    return <><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div></>;
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">휴가 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">선원 휴가 신청 및 승인을 관리합니다</p>
              </div>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditingRecord(undefined); setDialogOpen(true); }}>
                <Plus className="w-4 h-4" />휴가 신청
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input placeholder="선원명, 직급으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs h-7">전체 ({getCount('all')})</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs h-7">대기 ({getCount('pending')})</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs h-7">승인 ({getCount('approved')})</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs h-7">반려 ({getCount('rejected')})</TabsTrigger>
              </TabsList>

              {['all', 'pending', 'approved', 'rejected'].map(tab => (
                <TabsContent key={tab} value={tab} className="mt-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="text-left p-2">선원명</th>
                        <th className="text-left p-2">직급</th>
                        <th className="text-left p-2">유형</th>
                        <th className="text-left p-2">기간</th>
                        <th className="text-right p-2">일수</th>
                        <th className="text-left p-2">사유</th>
                        <th className="text-center p-2">상태</th>
                        <th className="text-center p-2">작업</th>
                      </tr></thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan={8} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr>
                        ) : filtered.map(r => (
                          <tr key={r.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{r.crew_name}</td>
                            <td className="p-2">{r.rank_code || r.rank_name}</td>
                            <td className="p-2">{LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}</td>
                            <td className="p-2">{r.start_date} ~ {r.end_date}</td>
                            <td className="p-2 text-right">{r.total_days}일</td>
                            <td className="p-2 max-w-[150px] truncate">{r.reason || '-'}</td>
                            <td className="p-2 text-center">
                              <Badge className={`text-xs ${STATUS_LABELS[r.status]?.color || ''}`}>{STATUS_LABELS[r.status]?.label || r.status}</Badge>
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex justify-center gap-1">
                                {r.status === 'pending' && (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-green-600" onClick={() => handleApprove(r.id)}><Check className="h-3 w-3 mr-1" />승인</Button>
                                    <Button variant="ghost" size="sm" className="h-6 px-2 text-red-600" onClick={() => handleReject(r.id)}><XCircle className="h-3 w-3 mr-1" />반려</Button>
                                  </>
                                )}
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleDelete(r.id)}>삭제</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <LeaveRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} record={editingRecord} onSuccess={loadData} />
    </>
  );
}
