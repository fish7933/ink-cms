import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface Company {
  id: string;
  name: string;
  type: string;
  country: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  officer_contract_months: number | null;
  rating_contract_months: number | null;
}

const EMPTY_FORM: Omit<Company, 'id'> = {
  name: '',
  type: '',
  country: '',
  contact_person: '',
  email: '',
  phone: '',
  officer_contract_months: null,
  rating_contract_months: null,
};

export default function CompanyManagementPage() {
  const [searchParams] = useSearchParams();
  const companyType = searchParams.get('type') || 'owner';
  const { toast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<Omit<Company, 'id'>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const pageTitle = companyType === 'owner' ? '선주사 관리' : '선원 매닝사 관리';

  useEffect(() => {
    setSearch('');
    load();
  }, [companyType]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('id,name,type,country,contact_person,email,phone,officer_contract_months,rating_contract_months')
      .eq('type', companyType)
      .order('name');
    if (error) { toast({ title: '불러오기 실패', variant: 'destructive' }); }
    else { setCompanies((data || []) as Company[]); }
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, type: companyType });
    setDialogOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({ name: c.name, type: c.type, country: c.country || '', contact_person: c.contact_person || '', email: c.email || '', phone: c.phone || '', officer_contract_months: c.officer_contract_months, rating_contract_months: c.rating_contract_months });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ title: '회사명을 입력하세요', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), type: companyType, country: form.country || null, contact_person: form.contact_person || null, email: form.email || null, phone: form.phone || null, officer_contract_months: form.officer_contract_months || null, rating_contract_months: form.rating_contract_months || null, updated_at: new Date().toISOString() };
    let error;
    if (editing) {
      ({ error } = await supabase.from('companies').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('companies').insert([{ ...payload, created_at: new Date().toISOString() }]));
    }
    setSaving(false);
    if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? '수정 완료' : '등록 완료' });
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('companies').delete().eq('id', deleteId);
    setDeleteId(null);
    if (error) { toast({ title: '삭제 실패', description: error.message, variant: 'destructive' }); return; }
    toast({ title: '삭제 완료' });
    load();
  }

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_person || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.country || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{pageTitle}</CardTitle>
              <Button size="sm" className="gap-1.5 h-8" onClick={openAdd}>
                <Plus className="w-4 h-4" />등록
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">사관 계약(월)</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-600">부원 계약(월)</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-10 text-sm text-gray-400">등록된 회사가 없습니다</td></tr>
                    ) : filtered.map((c, i) => (
                      <tr key={c.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 text-center text-xs text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-gray-600">{c.country || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{c.contact_person || '-'}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{c.email || '-'}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{c.phone || '-'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{c.officer_contract_months ?? '-'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{c.rating_contract_months ?? '-'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '수정' : '등록'} — {pageTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">회사명 *</Label>
              <Input className="h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="회사명 입력" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">국가</Label>
                <Input className="h-8 text-sm" value={form.country || ''} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="예: 대한민국" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">담당자</Label>
                <Input className="h-8 text-sm" value={form.contact_person || ''} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="담당자명" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">이메일</Label>
                <Input className="h-8 text-sm" type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="이메일" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">연락처</Label>
                <Input className="h-8 text-sm" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="전화번호" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">사관 기본 계약(월)</Label>
                <Input className="h-8 text-sm" type="number" min={1} value={form.officer_contract_months ?? ''} onChange={e => setForm(f => ({ ...f, officer_contract_months: e.target.value ? +e.target.value : null }))} placeholder="예: 6" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">부원 기본 계약(월)</Label>
                <Input className="h-8 text-sm" type="number" min={1} value={form.rating_contract_months ?? ''} onChange={e => setForm(f => ({ ...f, rating_contract_months: e.target.value ? +e.target.value : null }))} placeholder="예: 9" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
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
