import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import type { Rank } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';

export default function RanksPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);

  const permissions = usePermissions('ranks');

  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    rank_code: '',
    department: 'deck' as 'deck' | 'engine' | 'catering',
    rank_category: 'officer' as 'officer' | 'rating',
    stcw_requirement: '',
    display_order: 0,
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/login');
        return;
      }

      if (!['ship_manager', 'ship_owner'].includes(user.role)) {
        navigate('/dashboard');
        return;
      }

      setCurrentUser(user);
      loadData();
    };

    loadUser();
  }, [navigate]);

  const loadData = async () => {
    try {
      const { data: ranksData, error } = await supabase
        .from('ranks')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setRanks(ranksData || []);
    } catch (error) {
      console.error('Error loading ranks:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </>
    );
  }

  const resetForm = () => {
    const maxOrder = ranks.length > 0 ? Math.max(...ranks.map(r => r.display_order)) : 0;
    setFormData({
      name: '',
      rank_code: '',
      department: 'deck',
      rank_category: 'officer',
      stcw_requirement: '',
      display_order: maxOrder + 1,
    });
  };

  const openForm = (rank?: Rank) => {
    if (rank) {
      setFormData({
        name: rank.name,
        rank_code: rank.rank_code,
        department: rank.department,
        rank_category: rank.rank_category,
        stcw_requirement: (rank as unknown as Record<string, string>).stcw_requirement || '',
        display_order: rank.display_order,
      });
      setFormView({ id: rank.id });
    } else {
      resetForm();
      setFormView({});
    }
  };

  const closeForm = () => {
    setFormView(null);
  };

  const handleSave = async () => {
    const rankData = {
      name: formData.name,
      rank_code: formData.rank_code,
      department: formData.department,
      rank_category: formData.rank_category,
      stcw_requirement: formData.stcw_requirement,
      display_order: formData.display_order,
    };

    try {
      setSaving(true);
      if (formView?.id) {
        const { error } = await supabase
          .from('ranks')
          .update(rankData)
          .eq('id', formView.id);

        if (error) throw error;
      } else {
        const maxOrder = ranks.length > 0 ? Math.max(...ranks.map(r => r.display_order)) : 0;
        rankData.display_order = maxOrder + 1;

        const { error } = await supabase
          .from('ranks')
          .insert(rankData);

        if (error) throw error;
      }

      await loadData();
      closeForm();
    } catch (error) {
      console.error('Error saving rank:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('이 직급을 삭제하시겠습니까?')) {
      try {
        const { error } = await supabase
          .from('ranks')
          .delete()
          .eq('id', id);

        if (error) throw error;
        await loadData();
      } catch (error) {
        console.error('Error deleting rank:', error);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const moveRank = async (rankId: string, direction: 'up' | 'down') => {
    const currentIndex = ranks.findIndex(r => r.id === rankId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= ranks.length) return;

    const currentRank = ranks[currentIndex];
    const targetRank = ranks[targetIndex];

    try {
      await supabase
        .from('ranks')
        .update({ display_order: targetRank.display_order })
        .eq('id', currentRank.id);

      await supabase
        .from('ranks')
        .update({ display_order: currentRank.display_order })
        .eq('id', targetRank.id);

      await loadData();
    } catch (error) {
      console.error('Error moving rank:', error);
      alert('순서 변경 중 오류가 발생했습니다.');
    }
  };

  const groupedRanks = {
    deck: ranks.filter(r => r.department === 'deck'),
    engine: ranks.filter(r => r.department === 'engine'),
    catering: ranks.filter(r => r.department === 'catering'),
  };

  const departmentLabels = {
    deck: '갑판부',
    engine: '기관부',
    catering: '사무부',
  };

  const departmentColors = {
    deck: 'bg-blue-50 border-blue-200',
    engine: 'bg-gray-50 border-gray-200',
    catering: 'bg-green-50 border-green-200',
  };

  return (
    <ProtectedRoute resource="ranks">
      <>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {formView !== null && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  )}
                  <CardTitle className="text-base">
                    {formView !== null ? (formView.id ? '직급 수정' : '직급 추가') : '직급 관리'}
                  </CardTitle>
                </div>
                {formView !== null ? (
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4" />
                    {saving ? '저장 중...' : '저장'}
                  </Button>
                ) : (
                  permissions.canCreate && (
                    <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}>
                      <Plus className="w-4 h-4" />
                      직급 추가
                    </Button>
                  )
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {formView !== null ? (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="rank_code" className="text-sm">직급 코드 *</Label>
                      <Input
                        id="rank_code"
                        value={formData.rank_code}
                        onChange={(e) => setFormData({...formData, rank_code: e.target.value})}
                        placeholder="예: MSTR, C/O, 2/O"
                        className="h-9 text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-sm">직급명 *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="예: Master, Chief Officer"
                        className="h-9 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="department" className="text-sm">부서 *</Label>
                      <select
                        id="department"
                        value={formData.department}
                        onChange={(e) => setFormData({...formData, department: e.target.value as 'deck' | 'engine' | 'catering'})}
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                        required
                      >
                        <option value="deck">갑판부</option>
                        <option value="engine">기관부</option>
                        <option value="catering">사무부</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rank_category" className="text-sm">직급 구분 *</Label>
                      <select
                        id="rank_category"
                        value={formData.rank_category}
                        onChange={(e) => setFormData({...formData, rank_category: e.target.value as 'officer' | 'rating'})}
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                        required
                      >
                        <option value="officer">Officer (사관)</option>
                        <option value="rating">Rating (부원)</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="stcw_requirement" className="text-sm">STCW 요구사항 *</Label>
                    <Input
                      id="stcw_requirement"
                      value={formData.stcw_requirement}
                      onChange={(e) => setFormData({...formData, stcw_requirement: e.target.value})}
                      placeholder="예: STCW II/2"
                      className="h-9 text-sm"
                      required
                    />
                  </div>
                </div>
              ) : (
                <>
                  {ranks.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">
                      등록된 직급이 없습니다
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(groupedRanks).map(([department, departmentRanks]) => {
                        if (departmentRanks.length === 0) return null;
                        return (
                          <div key={department} className={`rounded-lg border p-3 ${departmentColors[department as keyof typeof departmentColors]}`}>
                            <h3 className="text-sm font-semibold mb-2 text-gray-700">
                              {departmentLabels[department as keyof typeof departmentLabels]} ({departmentRanks.length})
                            </h3>
                            <div className="rounded-md border bg-white overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-gray-50/50">
                                    <TableHead className="w-16 text-xs">순서</TableHead>
                                    <TableHead className="text-xs">직급 코드</TableHead>
                                    <TableHead className="text-xs">직급명</TableHead>
                                    <TableHead className="text-xs">구분</TableHead>
                                    <TableHead className="text-xs">STCW 요구사항</TableHead>
                                    {(permissions.canEdit || permissions.canDelete) && (
                                      <TableHead className="text-right text-xs w-28">작업</TableHead>
                                    )}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {departmentRanks.map((rank, index) => (
                                    <TableRow key={rank.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => openForm(rank)}>
                                      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                                        {permissions.canEdit && (
                                          <div className="flex gap-0.5">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 w-6 p-0"
                                              onClick={() => moveRank(rank.id, 'up')}
                                              disabled={index === 0}
                                            >
                                              <ChevronUp className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 w-6 p-0"
                                              onClick={() => moveRank(rank.id, 'down')}
                                              disabled={index === departmentRanks.length - 1}
                                            >
                                              <ChevronDown className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="font-bold text-sm py-2">{rank.rank_code}</TableCell>
                                      <TableCell className="font-medium text-sm py-2">{rank.name}</TableCell>
                                      <TableCell className="text-sm py-2">
                                        <Badge variant={rank.rank_category === 'officer' ? 'default' : 'secondary'} className="text-xs">
                                          {rank.rank_category === 'officer' ? '사관' : '부원'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm py-2">{(rank as unknown as Record<string, string>).stcw_requirement}</TableCell>
                                      {(permissions.canEdit || permissions.canDelete) && (
                                        <TableCell className="text-right py-2" onClick={(e) => e.stopPropagation()}>
                                          <div className="flex justify-end gap-1">
                                            {permissions.canDelete && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(rank.id)}
                                                className="gap-1 h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                                <span className="text-xs">삭제</span>
                                              </Button>
                                            )}
                                          </div>
                                        </TableCell>
                                      )}
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
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    </ProtectedRoute>
  );
}
