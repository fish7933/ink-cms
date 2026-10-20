import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/pages/AllotmentManagementPage/en.json';
import { Plus, Search, Edit2, Trash2, ArrowLeft, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAllotments, addAllotment, updateAllotment, deleteAllotment, getRemittances, addRemittance } from '@/services/allotment.service';
import type { AllotmentWithDetails, Remittance } from '@/types/allotment';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

i18n.addResourceBundle('en', 'AllotmentManagementPage', en, true, true);

const TYPE_LABELS: Record<string, string> = { monthly: '정기 송금', bonus: '상여금', one_time: '일시', advance: '선지급' };
const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'SGD', 'PHP', 'IDR', 'INR'];
interface CrewOption { id: string; name: string; rank: string; }

export default function AllotmentManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation('AllotmentManagementPage');
  const permissions = usePermissions('allotment_management');
  const [allotments, setAllotments] = useState<AllotmentWithDetails[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('allotments');
  const [formView, setFormView] = useState<'allotment' | 'remittance' | null>(null);
  const [editingAllotment, setEditingAllotment] = useState<AllotmentWithDetails | undefined>();
  const [selectedAllotment, setSelectedAllotment] = useState<AllotmentWithDetails | undefined>();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ crew_member_id: '', allotment_type: 'monthly', beneficiary_name: '', beneficiary_relationship: '', bank_name: '', bank_branch: '', account_number: '', swift_code: '', amount: '', currency: 'USD', percentage_of_salary: '', effective_from: '', effective_to: '', notes: '' });
  const [remitForm, setRemitForm] = useState({ remittance_date: '', amount: '', currency: 'USD', exchange_rate: '', local_amount: '', local_currency: 'KRW', transaction_reference: '', notes: '' });

  useEffect(() => {
    supabase.from('crew_members').select('id, name, rank').then(({ data }) => { if (data) setCrewOptions(data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' }))); });
    loadData();
  }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => { try { setLoading(true); const [a, r] = await Promise.all([getAllotments(), getRemittances()]); setAllotments(a); setRemittances(r); } catch (e) { console.error(e); } finally { setLoading(false); } };

  const openAllotmentForm = (a?: AllotmentWithDetails) => {
    setEditingAllotment(a);
    if (a) setForm({ crew_member_id: a.crew_member_id, allotment_type: a.allotment_type, beneficiary_name: a.beneficiary_name, beneficiary_relationship: a.beneficiary_relationship || '', bank_name: a.bank_name, bank_branch: a.bank_branch || '', account_number: a.account_number, swift_code: a.swift_code || '', amount: a.amount.toString(), currency: a.currency, percentage_of_salary: a.percentage_of_salary?.toString() || '', effective_from: a.effective_from, effective_to: a.effective_to || '', notes: a.notes || '' });
    else setForm({ crew_member_id: '', allotment_type: 'monthly', beneficiary_name: '', beneficiary_relationship: '', bank_name: '', bank_branch: '', account_number: '', swift_code: '', amount: '', currency: 'USD', percentage_of_salary: '', effective_from: '', effective_to: '', notes: '' });
    setFormView('allotment');
  };

  const openRemitForm = (a: AllotmentWithDetails) => {
    setSelectedAllotment(a);
    setRemitForm({ remittance_date: new Date().toISOString().split('T')[0], amount: a.amount.toString(), currency: a.currency, exchange_rate: '', local_amount: '', local_currency: 'KRW', transaction_reference: '', notes: '' });
    setFormView('remittance');
  };

  const closeForm = () => { setFormView(null); setEditingAllotment(undefined); setSelectedAllotment(undefined); loadData(); };

  const handleSaveAllotment = async () => {
    if (!form.crew_member_id || !form.beneficiary_name || !form.bank_name || !form.account_number || !form.amount) { toast({ title: t('필수 항목을 입력하세요'), variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const data = { crew_member_id: form.crew_member_id, allotment_type: form.allotment_type as AllotmentWithDetails['allotment_type'], beneficiary_name: form.beneficiary_name, beneficiary_relationship: form.beneficiary_relationship || undefined, bank_name: form.bank_name, bank_branch: form.bank_branch || undefined, account_number: form.account_number, swift_code: form.swift_code || undefined, amount: parseFloat(form.amount), currency: form.currency, percentage_of_salary: form.percentage_of_salary ? parseFloat(form.percentage_of_salary) : undefined, effective_from: form.effective_from, effective_to: form.effective_to || undefined, is_active: true, notes: form.notes || undefined };
      if (editingAllotment) { await updateAllotment(editingAllotment.id, data); toast({ title: t('수정 완료') }); }
      else { await addAllotment(data); toast({ title: t('등록 완료') }); }
      closeForm();
    } catch { toast({ title: t('저장 실패'), variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleSaveRemittance = async () => {
    if (!selectedAllotment) return;
    try {
      setSaving(true);
      await addRemittance({ allotment_id: selectedAllotment.id, crew_member_id: selectedAllotment.crew_member_id, remittance_date: remitForm.remittance_date, amount: parseFloat(remitForm.amount), currency: remitForm.currency, exchange_rate: remitForm.exchange_rate ? parseFloat(remitForm.exchange_rate) : undefined, local_amount: remitForm.local_amount ? parseFloat(remitForm.local_amount) : undefined, local_currency: remitForm.local_currency || undefined, transaction_reference: remitForm.transaction_reference || undefined, status: 'completed', notes: remitForm.notes || undefined });
      toast({ title: t('송금 기록 완료') }); closeForm();
    } catch { toast({ title: t('저장 실패'), variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm(t('삭제하시겠습니까?'))) return; try { await deleteAllotment(id); toast({ title: t('삭제 완료') }); loadData(); } catch { toast({ title: t('실패'), variant: 'destructive' }); } };

  const filtered = allotments.filter(a => { if (!searchTerm) return true; const q = searchTerm.toLowerCase(); return a.crew_name.toLowerCase().includes(q) || a.beneficiary_name.toLowerCase().includes(q); });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  const formTitle = formView === 'remittance' ? t('송금 실행') : (editingAllotment ? t('송금 설정 수정') : t('송금 설정 등록'));

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div><CardTitle className="text-base">{formView !== null ? formTitle : t('송금 관리')}</CardTitle><p className="text-xs text-muted-foreground mt-1">{formView !== null ? '' : t('선원 송금(Allotment) 설정 및 이력을 관리합니다')}</p></div>
            </div>
            {formView === 'allotment' ? ((editingAllotment ? permissions.canEdit : permissions.canCreate) && <Button size="sm" className="gap-1.5 h-8" onClick={handleSaveAllotment} disabled={saving}><Save className="w-4 h-4" />{saving ? t('저장 중...') : t('저장')}</Button>)
              : formView === 'remittance' ? (permissions.canCreate && <Button size="sm" className="gap-1.5 h-8" onClick={handleSaveRemittance} disabled={saving}><Save className="w-4 h-4" />{saving ? t('저장 중...') : t('송금 기록')}</Button>)
              : (permissions.canCreate && <Button size="sm" className="gap-1.5 h-8" onClick={() => openAllotmentForm()}><Plus className="w-4 h-4" />{t('송금 설정')}</Button>)}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {formView === 'allotment' ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{t('선원 *')}</Label><Select value={form.crew_member_id} onValueChange={v => setForm({ ...form, crew_member_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('선원 선택')} /></SelectTrigger><SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('유형 *')}</Label><Select value={form.allotment_type} onValueChange={v => setForm({ ...form, allotment_type: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{t('수혜자 이름 *')}</Label><Input value={form.beneficiary_name} onChange={e => setForm({ ...form, beneficiary_name: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('관계')}</Label><Input value={form.beneficiary_relationship} onChange={e => setForm({ ...form, beneficiary_relationship: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{t('은행명 *')}</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('계좌번호 *')}</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{t('금액 *')}</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('통화')}</Label><Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('시작일 *')}</Label><Input type="date" value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">{t('비고')}</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            </div>
          ) : formView === 'remittance' ? (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-gray-50 rounded-lg text-xs"><span className="font-semibold">{t('수혜자:')}</span> {selectedAllotment?.beneficiary_name} · <span className="font-semibold">{t('은행:')}</span> {selectedAllotment?.bank_name} · <span className="font-semibold">{t('계좌:')}</span> {selectedAllotment?.account_number}</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{t('송금일 *')}</Label><Input type="date" value={remitForm.remittance_date} onChange={e => setRemitForm({ ...remitForm, remittance_date: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('금액 *')}</Label><Input type="number" step="0.01" value={remitForm.amount} onChange={e => setRemitForm({ ...remitForm, amount: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">{t('환율')}</Label><Input type="number" step="0.0001" value={remitForm.exchange_rate} onChange={e => setRemitForm({ ...remitForm, exchange_rate: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('현지 금액')}</Label><Input type="number" step="0.01" value={remitForm.local_amount} onChange={e => setRemitForm({ ...remitForm, local_amount: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">{t('참조번호')}</Label><Input value={remitForm.transaction_reference} onChange={e => setRemitForm({ ...remitForm, transaction_reference: e.target.value })} className="h-9 text-sm" /></div>
              </div>
            </div>
          ) : (
            <>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder={t('선원명, 수혜자명으로 검색...')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8"><TabsTrigger value="allotments" className="text-xs h-7">{t('송금 설정 ({{count}})', { count: allotments.length })}</TabsTrigger><TabsTrigger value="history" className="text-xs h-7">{t('송금 이력 ({{count}})', { count: remittances.length })}</TabsTrigger></TabsList>
                <TabsContent value="allotments" className="mt-2">
                  <table className="w-full text-xs"><thead><tr className="border-b bg-gray-50"><th className="text-left p-2">{t('선원명')}</th><th className="text-left p-2">{t('유형')}</th><th className="text-left p-2">{t('수혜자')}</th><th className="text-left p-2">{t('은행')}</th><th className="text-right p-2">{t('금액')}</th><th className="text-center p-2">{t('상태')}</th><th className="text-center p-2">{t('작업')}</th></tr></thead>
                    <tbody>{filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('데이터가 없습니다.')}</td></tr> : filtered.map(a => (
                      <tr key={a.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openAllotmentForm(a)}>
                        <td className="p-2 font-medium">{a.crew_name}</td><td className="p-2">{t(TYPE_LABELS[a.allotment_type])}</td><td className="p-2">{a.beneficiary_name}</td><td className="p-2">{a.bank_name}</td>
                        <td className="p-2 text-right font-mono">{a.amount.toLocaleString()} {a.currency}</td>
                        <td className="p-2 text-center">{a.is_active ? <Badge className="bg-green-100 text-green-700 text-xs">{t('활성')}</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">{t('비활성')}</Badge>}</td>
                        <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            {permissions.canCreate && (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-blue-600" onClick={() => openRemitForm(a)}>{t('송금 기록')}</Button>
                            )}
                            {permissions.canDelete && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(a.id)}><Trash2 className="h-3 w-3" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>))}</tbody></table>
                </TabsContent>
                <TabsContent value="history" className="mt-2">
                  <table className="w-full text-xs"><thead><tr className="border-b bg-gray-50"><th className="text-left p-2">{t('송금일')}</th><th className="text-right p-2">{t('금액')}</th><th className="text-left p-2">{t('통화')}</th><th className="text-right p-2">{t('환율')}</th><th className="text-right p-2">{t('현지금액')}</th><th className="text-left p-2">{t('참조번호')}</th><th className="text-center p-2">{t('상태')}</th></tr></thead>
                    <tbody>{remittances.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('송금 이력이 없습니다.')}</td></tr> : remittances.map(r => (
                      <tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-2">{r.remittance_date}</td><td className="p-2 text-right font-mono">{r.amount.toLocaleString()}</td><td className="p-2">{r.currency}</td><td className="p-2 text-right font-mono">{r.exchange_rate || '-'}</td><td className="p-2 text-right font-mono">{r.local_amount ? `${r.local_amount.toLocaleString()} ${r.local_currency || ''}` : '-'}</td><td className="p-2 text-gray-500">{r.transaction_reference || '-'}</td>
                        <td className="p-2 text-center"><Badge className={`text-xs ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.status === 'completed' ? t('완료') : r.status}</Badge></td>
                      </tr>))}</tbody></table>
                </TabsContent>
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
