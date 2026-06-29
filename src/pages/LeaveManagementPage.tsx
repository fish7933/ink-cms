import { useState, useEffect } from 'react';
import { Plus, Search, ArrowLeft, Save, Check, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLeaveRequests, addLeaveRequest, updateLeaveRequest, approveLeaveRequest, rejectLeaveRequest, deleteLeaveRequest } from '@/services/leave.service';
import type { LeaveRequestWithDetails } from '@/types/leave';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const LEAVE_TYPES = [
  { value: 'annual', label: '연차 휴가' }, { value: 'sick', label: '병가' }, { value: 'special', label: '특별 휴가' },
  { value: 'unpaid', label: '무급 휴가' }, { value: 'compensatory', label: '보상 휴가' }, { value: 'maternity', label: '출산 휴가' },
];
const LEAVE_TYPE_LABELS: Record<string, string> = Object.fromEntries(LEAVE_TYPES.map(t => [t.value, t.label]));
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '임시저장', color: 'bg-gray-100 text-gray-700' }, pending: { label: '대기', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' }, rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

interface CrewOption { id: string; name: string; rank: string; }

export default function LeaveManagementPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<LeaveRequestWithDetails[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [formView, setFormView] = useState<{ record?: LeaveRequestWithDetails } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ crew_member_id: '', leave_type: 'annual', start_date: '', end_date: '', total_days: '', reason: '', notes: '' });

  useEffect(() => {
    loadData();
    supabase.from('crew_members').select('id, name, rank').then(({ data }) => {
      if (data) setCrewOptions(data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' })));
    });
  }, []);

  const loadData = async () => { try { setLoading(true); setRequests(await getLeaveRequests()); } catch (e) { console.error(e); } finally { setLoading(false); } };

  const openForm = (record?: LeaveRequestWithDetails) => {
    if (record) {
      setForm({ crew_member_id: record.crew_member_id, leave_type: record.leave_type, start_date: record.start_date, end_date: record.end_date, total_days: record.total_days.toString(), reason: record.reason || '', notes: record.notes || '' });
    } else {
      setForm({ crew_member_id: '', leave_type: 'annual', start_date: '', end_date: '', total_days: '', reason: '', notes: '' });
    }
    setFormView({ record });
  };
  const closeForm = () => { setFormView(null); loadData(); };

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const diff = Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) setForm(prev => ({ ...prev, total_days: diff.toString() }));
    }
  }, [form.start_date, form.end_date]);

  const handleSave = async () => {
    if (!form.crew_member_id || !form.start_date || !form.end_date) { toast({ title: '필수 항목을 입력하세요', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const data = { crew_member_id: form.crew_member_id, leave_type: form.leave_type as LeaveRequestWithDetails['leave_type'], start_date: form.start_date, end_date: form.end_date, total_days: parseInt(form.total_days), reason: form.reason || undefined, status: 'pending' as const, notes: form.notes || undefined };
      if (formView?.record) { await updateLeaveRequest(formView.record.id, data); toast({ title: '수정 완료' }); }
      else { await addLeaveRequest(data); toast({ title: '등록 완료' }); }
      closeForm();
    } catch { toast({ title: '저장 실패', variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleApprove = async (id: string) => { try { await approveLeaveRequest(id, ''); toast({ title: '승인 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };
  const handleReject = async (id: string) => { const reason = prompt('반려 사유:'); if (reason === null) return; try { await rejectLeaveRequest(id, reason); toast({ title: '반려 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };
  const handleDelete = async (id: string) => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteLeaveRequest(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };

  const getCount = (status: string) => status === 'all' ? requests.length : requests.filter(r => r.status === status).length;
  const filtered = requests.filter(r => {
    if (activeTab !== 'all' && r.status !== activeTab) return false;
    if (searchTerm) { const t = searchTerm.toLowerCase(); return r.crew_name.toLowerCase().includes(t) || r.rank_name.toLowerCase().includes(t); }
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div>
                <CardTitle className="text-base">{formView !== null ? (formView.record ? '휴가 신청 수정' : '휴가 신청') : '휴가 관리'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{formView !== null ? '선원 휴가를 신청합니다' : '선원 휴가 신청 및 승인을 관리합니다'}</p>
              </div>
            </div>
            {formView !== null ? (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}</Button>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />휴가 신청</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {formView !== null ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">선원 *</Label>
                  <Select value={form.crew_member_id} onValueChange={v => setForm({ ...form, crew_member_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger><SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank})</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">휴가 유형 *</Label>
                  <Select value={form.leave_type} onValueChange={v => setForm({ ...form, leave_type: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">시작일 *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">종료일 *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">일수</Label><Input type="number" value={form.total_days} className="h-9 text-sm" readOnly /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">사유</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2} className="text-sm resize-none" /></div>
              <div className="space-y-1.5"><Label className="text-xs">비고</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            </div>
          ) : (
            <>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="선원명, 직급으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs h-7">전체 ({getCount('all')})</TabsTrigger>
                  <TabsTrigger value="pending" className="text-xs h-7">대기 ({getCount('pending')})</TabsTrigger>
                  <TabsTrigger value="approved" className="text-xs h-7">승인 ({getCount('approved')})</TabsTrigger>
                  <TabsTrigger value="rejected" className="text-xs h-7">반려 ({getCount('rejected')})</TabsTrigger>
                </TabsList>
                {['all', 'pending', 'approved', 'rejected'].map(tab => (
                  <TabsContent key={tab} value={tab} className="mt-2">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="text-left p-2">선원명</th><th className="text-left p-2">직급</th><th className="text-left p-2">유형</th><th className="text-left p-2">기간</th><th className="text-right p-2">일수</th><th className="text-left p-2">사유</th><th className="text-center p-2">상태</th><th className="text-center p-2">작업</th>
                      </tr></thead>
                      <tbody>
                        {filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : filtered.map(r => (
                          <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openForm(r)}>
                            <td className="p-2 font-medium">{r.crew_name}</td><td className="p-2">{r.rank_code || r.rank_name}</td>
                            <td className="p-2">{LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}</td><td className="p-2">{r.start_date} ~ {r.end_date}</td>
                            <td className="p-2 text-right">{r.total_days}일</td><td className="p-2 max-w-[150px] truncate">{r.reason || '-'}</td>
                            <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_LABELS[r.status]?.color || ''}`}>{STATUS_LABELS[r.status]?.label}</Badge></td>
                            <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-center gap-1">
                                {r.status === 'pending' && (<>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-green-600" onClick={() => handleApprove(r.id)}><Check className="h-3 w-3 mr-1" />승인</Button>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-red-600" onClick={() => handleReject(r.id)}><XCircle className="h-3 w-3 mr-1" />반려</Button>
                                </>)}
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleDelete(r.id)}>삭제</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
