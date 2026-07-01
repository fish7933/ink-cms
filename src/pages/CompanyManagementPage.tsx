import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { getNationalities } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';
import { useTabContext } from '@/contexts/TabContext';

interface Company {
  id: string;
  name: string;
  type: string;
  country: string | null;
  manager_id: string | null;
  email: string | null;
  phone: string | null;
  officer_contract_months: number | null;
  rating_contract_months: number | null;
}

interface SystemUser { id: string; name: string; email: string; role: string; }

interface FormState {
  name: string; country: string; manager_id: string;
  email: string; phone: string;
  officer_contract_months: number | null; rating_contract_months: number | null;
}

const EMPTY_FORM: FormState = { name: '', country: '', manager_id: '', email: '', phone: '', officer_contract_months: null, rating_contract_months: null };

export default function CompanyManagementPage() {
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();
  const { toast } = useToast();

  const companyType = searchParams.get('type') || 'owner';
  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const pageTitle = companyType === 'owner' ? '선주사 관리' : '선원 매닝사 관리';
  const formTitle = isFormMode ? (editId ? (companyType === 'owner' ? '선주사 수정' : '매닝사 수정') : (companyType === 'owner' ? '선주사 등록' : '매닝사 등록')) : pageTitle;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSearch('');
    load();
  }, [companyType]);

  useEffect(() => {
    if (editId && companies.length > 0) {
      const c = companies.find(c => c.id === editId);
      if (c) setForm({ name: c.name, country: c.country || '', manager_id: c.manager_id || '', email: c.email || '', phone: c.phone || '', officer_contract_months: c.officer_contract_months, rating_contract_months: c.rating_contract_months });
    }
    if (isNew) setForm(EMPTY_FORM);
  }, [editId, isNew, companies]);

  async function load() {
    setLoading(true);
    const [{ data: cd, error }, { data: ud }, natData] = await Promise.all([
      supabase.from('companies').select('id,name,type,country,manager_id,email,phone,officer_contract_months,rating_contract_months').eq('type', companyType).order('name'),
      supabase.from('users').select('id,name,email,role').eq('role', companyType === 'owner' ? 'ship_owner' : 'manning_agency').order('name'),
      getNationalities(),
    ]);
    if (error) { toast({ title: '불러오기 실패', variant: 'destructive' }); }
    else { setCompanies((cd || []) as Company[]); }
    setUsers((ud || []) as SystemUser[]);
    setNationalities(natData);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ title: '회사명을 입력하세요', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), type: companyType, country: form.country || null, manager_id: form.manager_id || null, email: form.email || null, phone: form.phone || null, officer_contract_months: form.officer_contract_months || null, rating_contract_months: form.rating_contract_months || null, updated_at: new Date().toISOString() };
    let error;
    if (editId) {
      ({ error } = await supabase.from('companies').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('companies').insert([{ ...payload, created_at: new Date().toISOString() }]));
    }
    setSaving(false);
    if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editId ? '수정 완료' : '등록 완료' });
    closeTab(activeTabId!);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('companies').delete().eq('id', deleteId);
    setDeleteId(null);
    if (error) { toast({ title: '삭제 실패', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '삭제 완료' });
    load();
  }

  const userById = new Map(users.map(u => [u.id, u]));
  const natByCode = new Map(nationalities.map(n => [n.country_code, n]));

  const filtered = companies.filter(c => {
    const mgr = c.manager_id ? (userById.get(c.manager_id)?.name || '') : '';
    return c.name.toLowerCase().includes(search.toLowerCase()) || mgr.toLowerCase().includes(search.toLowerCase()) || (c.country || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <>
      <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{formTitle}</CardTitle>
              {isFormMode ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
                  </Button>
                </div>
              ) : (
                <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab(`/companies?type=${companyType}&mode=new`, `${companyType === 'owner' ? '선주사' : '매닝사'} 등록`, true)}>
                  <Plus className="w-4 h-4" />등록
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isFormMode ? (
              <div className="space-y-3 py-2 max-w-md">
                <div className="space-y-1">
                  <Label className="text-xs">회사명 *</Label>
                  <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="회사명 입력" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">국가</Label>
                    <Select value={form.country || '_none'} onValueChange={v => setForm(f => ({ ...f, country: v === '_none' ? '' : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="국가 선택" /></SelectTrigger>
                      <SelectContent>{nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_code})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">담당자</Label>
                    <Select value={form.manager_id || '_none'} onValueChange={v => setForm(f => ({ ...f, manager_id: v === '_none' ? '' : v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="담당자 선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— 미지정 —</SelectItem>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">이메일</Label><Input className="h-8 text-sm" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="이메일" /></div>
                  <div className="space-y-1"><Label className="text-xs">연락처</Label><Input className="h-8 text-sm" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="전화번호" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">사관 기본 계약(월)</Label><Input className="h-8 text-sm" type="number" min={1} value={form.officer_contract_months ?? ''} onChange={e => setForm(f => ({ ...f, officer_contract_months: e.target.value ? +e.target.value : null }))} placeholder="예: 6" /></div>
                  <div className="space-y-1"><Label className="text-xs">부원 기본 계약(월)</Label><Input className="h-8 text-sm" type="number" min={1} value={form.rating_contract_months ?? ''} onChange={e => setForm(f => ({ ...f, rating_contract_months: e.target.value ? +e.target.value : null }))} placeholder="예: 9" /></div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                    <Input className="pl-8 h-8 text-sm" placeholder="회사명, 담당자, 국가 검색..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <span className="text-xs text-gray-500 self-center">총 {filtered.length}개</span>
                </div>
                {loading ? (
                  <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="w-8 px-3 py-2 text-center text-xs font-medium text-gray-400">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">회사명</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">국가</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">담당자</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">이메일</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">연락처</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">사관(월)</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">부원(월)</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan={9} className="text-center py-10 text-sm text-gray-400">등록된 회사가 없습니다</td></tr>
                        ) : filtered.map((c, i) => {
                          const manager = c.manager_id ? userById.get(c.manager_id) : null;
                          return (
                            <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openNewTab(`/companies?type=${companyType}&id=${c.id}`, `${c.name} 수정`)}>
                              <td className="px-3 py-2 text-center text-xs text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 font-medium">{c.name}</td>
                              <td className="px-3 py-2 text-gray-600">{c.country ? (natByCode.get(c.country)?.country_name_ko ?? c.country) : '-'}</td>
                              <td className="px-3 py-2 text-gray-600">{manager ? <span>{manager.name} <span className="text-xs text-gray-400">({manager.email})</span></span> : '-'}</td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{c.email || '-'}</td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{c.phone || '-'}</td>
                              <td className="px-3 py-2 text-center text-gray-600">{c.officer_contract_months ?? '-'}</td>
                              <td className="px-3 py-2 text-center text-gray-600">{c.rating_contract_months ?? '-'}</td>
                              <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openNewTab(`/companies?type=${companyType}&id=${c.id}`, `${c.name} 수정`)}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => setDeleteId(c.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>이 회사를 삭제하면 복구할 수 없습니다. 계속하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
