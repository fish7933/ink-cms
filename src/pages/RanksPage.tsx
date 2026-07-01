import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import type { Rank } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTabContext } from '@/contexts/TabContext';

const EMPTY_FORM = { name: '', rank_code: '', department: 'deck' as 'deck'|'engine'|'catering', rank_category: 'officer' as 'officer'|'rating', stcw_requirement: '', display_order: 0 };
const DEPT_LABELS = { deck: '갑판부', engine: '기관부', catering: '사무부' };
const DEPT_COLORS = { deck: 'bg-blue-50 border-blue-200', engine: 'bg-gray-50 border-gray-200', catering: 'bg-green-50 border-green-200' };

export default function RanksPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner', 'admin'].includes(user.role)) { navigate('/dashboard'); return; }
      setCurrentUser(user);
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('ranks-data-changed', handler);
    return () => window.removeEventListener('ranks-data-changed', handler);
  }, [isFormMode]);

  useEffect(() => {
    if (editId && ranks.length > 0) {
      const r = ranks.find(r => r.id === editId);
      if (r) setFormData({ name: r.name, rank_code: r.rank_code, department: r.department, rank_category: r.rank_category, stcw_requirement: (r as Record<string, string>).stcw_requirement || '', display_order: r.display_order });
    }
    if (isNew) {
      const max = ranks.length > 0 ? Math.max(...ranks.map(r => r.display_order)) : 0;
      setFormData({ ...EMPTY_FORM, display_order: max + 1 });
    }
  }, [editId, isNew, ranks]);

  const loadData = async () => {
    try {
      const { data, error } = await supabase.from('ranks').select('*').order('display_order');
      if (error) throw error;
      setRanks(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = { name: formData.name, rank_code: formData.rank_code, department: formData.department, rank_category: formData.rank_category, stcw_requirement: formData.stcw_requirement, display_order: formData.display_order };
      if (editId) {
        const { error } = await supabase.from('ranks').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const max = ranks.length > 0 ? Math.max(...ranks.map(r => r.display_order)) : 0;
        const { error } = await supabase.from('ranks').insert({ ...payload, display_order: max + 1 });
        if (error) throw error;
      }
      window.dispatchEvent(new CustomEvent('ranks-data-changed'));
      closeTab(activeTabId!);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('ranks').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  const moveRank = async (rankId: string, dir: 'up'|'down') => {
    const idx = ranks.findIndex(r => r.id === rankId);
    if (idx === -1) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ranks.length) return;
    const a = ranks[idx], b = ranks[targetIdx];
    await supabase.from('ranks').update({ display_order: b.display_order }).eq('id', a.id);
    await supabase.from('ranks').update({ display_order: a.display_order }).eq('id', b.id);
    await loadData();
  };

  if (!currentUser || (loading && !isFormMode)) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  const grouped = { deck: ranks.filter(r => r.department === 'deck'), engine: ranks.filter(r => r.department === 'engine'), catering: ranks.filter(r => r.department === 'catering') };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">{isFormMode ? (editId ? '직급 수정' : '직급 추가') : '직급 관리'}</CardTitle>
            {isFormMode ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/ranks?mode=new', '직급 추가', true)}>
                <Plus className="w-4 h-4" />직급 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {isFormMode ? (
            <div className="space-y-3 pt-2 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">직급 코드 *</Label>
                  <Input value={formData.rank_code} onChange={e => setFormData({ ...formData, rank_code: e.target.value })} placeholder="예: MSTR, C/O" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">직급명 *</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="예: Master, Chief Officer" className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">부서 *</Label>
                  <select value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value as 'deck'|'engine'|'catering' })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="deck">갑판부</option><option value="engine">기관부</option><option value="catering">사무부</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">직급 구분 *</Label>
                  <select value={formData.rank_category} onChange={e => setFormData({ ...formData, rank_category: e.target.value as 'officer'|'rating' })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="officer">Officer (사관)</option><option value="rating">Rating (부원)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">STCW 요구사항</Label>
                <Input value={formData.stcw_requirement} onChange={e => setFormData({ ...formData, stcw_requirement: e.target.value })} placeholder="예: STCW II/2" className="h-9 text-sm" />
              </div>
            </div>
          ) : ranks.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">등록된 직급이 없습니다</div>
          ) : (
            <div className="space-y-3">
              {(Object.entries(grouped) as [keyof typeof grouped, Rank[]][]).map(([dept, deptRanks]) => {
                if (!deptRanks.length) return null;
                return (
                  <div key={dept} className={`rounded-lg border p-3 ${DEPT_COLORS[dept]}`}>
                    <h3 className="text-sm font-semibold mb-2 text-gray-700">{DEPT_LABELS[dept]} ({deptRanks.length})</h3>
                    <div className="rounded-md border bg-white overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="w-16 text-xs">순서</TableHead>
                            <TableHead className="text-xs">직급 코드</TableHead>
                            <TableHead className="text-xs">직급명</TableHead>
                            <TableHead className="text-xs">구분</TableHead>
                            <TableHead className="text-xs">STCW</TableHead>
                            <TableHead className="text-right text-xs w-20">작업</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deptRanks.map((rank, i) => (
                            <TableRow key={rank.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => openNewTab(`/ranks?id=${rank.id}`, `${rank.name} 수정`)}>
                              <TableCell className="py-2" onClick={e => e.stopPropagation()}>
                                <div className="flex gap-0.5">
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => moveRank(rank.id, 'up')} disabled={i === 0}><ChevronUp className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => moveRank(rank.id, 'down')} disabled={i === deptRanks.length - 1}><ChevronDown className="h-3.5 w-3.5" /></Button>
                                </div>
                              </TableCell>
                              <TableCell className="font-bold text-sm py-2">{rank.rank_code}</TableCell>
                              <TableCell className="font-medium text-sm py-2">{rank.name}</TableCell>
                              <TableCell className="text-sm py-2">
                                <Badge variant={rank.rank_category === 'officer' ? 'default' : 'secondary'} className="text-xs">{rank.rank_category === 'officer' ? '사관' : '부원'}</Badge>
                              </TableCell>
                              <TableCell className="text-sm py-2">{(rank as Record<string, string>).stcw_requirement}</TableCell>
                              <TableCell className="text-right py-2" onClick={e => e.stopPropagation()}>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(rank.id)} className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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
