import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getUsers, addUser, updateUser, deleteUser } from '@/services/user.service';
import { getCompanies } from '@/services/company.service';
import { getShorePositions } from '@/services/shore-position.service';
import type { User, Company, ShorePosition } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, UserCircle, Save } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTabContext } from '@/contexts/TabContext';

const ROLE_LABELS: Record<string, string> = { ship_owner: '선주', ship_manager: '선박관리사', manning_agency: '선원매닝사', crew: '선원', admin: '관리자' };
const ROLE_COLORS: Record<string, string> = { ship_owner: 'bg-purple-500', ship_manager: 'bg-blue-500', manning_agency: 'bg-green-500', crew: 'bg-gray-500', admin: 'bg-red-500' };

export default function UserGroupManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const defaultRole = searchParams.get('role') || 'crew';
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [formData, setFormData] = useState({
    username: '', password: '', name: '', email: '',
    role: defaultRole as string, company_id: '', position_id: '',
  });

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin'].includes(user.role)) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (editId && users.length > 0) {
      const u = users.find(u => u.id === editId);
      if (u) setFormData({ username: u.username, password: '', name: u.name, email: u.email, role: u.role, company_id: u.company_id || '', position_id: u.position_id || '' });
    }
    if (isNew) setFormData({ username: '', password: '', name: '', email: '', role: defaultRole, company_id: '', position_id: '' });
  }, [editId, isNew, users, defaultRole]);

  const loadData = async () => {
    try {
      const [u, c, p] = await Promise.all([getUsers(), getCompanies(), getShorePositions()]);
      setUsers(u); setCompanies(c); setPositions(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setFormError('');
    if (['ship_owner', 'manning_agency'].includes(formData.role) && !formData.company_id) {
      setFormError('소속 회사를 선택해주세요.'); return;
    }
    try {
      setSaving(true);
      if (editId) {
        await updateUser(editId, { name: formData.name, email: formData.email, role: formData.role as User['role'], company_id: formData.company_id || null, position_id: formData.position_id || null, ...(formData.password ? { password: formData.password } : {}) });
      } else {
        await addUser({ username: formData.username, password: formData.password, name: formData.name, email: formData.email, role: formData.role as User['role'], company_id: formData.company_id || null, position_id: formData.position_id || null });
      }
      closeTab(activeTabId!);
    } catch (e) { setFormError('저장 중 오류가 발생했습니다.'); console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 사용자를 삭제하시겠습니까?')) return;
    try { await deleteUser(id); await loadData(); }
    catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  const getCompanyOptions = () => {
    if (formData.role === 'ship_owner') return companies.filter(c => c.type === 'owner');
    if (formData.role === 'manning_agency') return companies.filter(c => c.type === 'manning');
    if (formData.role === 'ship_manager') return companies.filter(c => c.type === 'owner');
    return [];
  };

  const renderTable = (role: string) => {
    const roleUsers = users.filter(u => u.role === role);
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-base">{ROLE_LABELS[role] || role} 관리</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">총 {roleUsers.length}명</p>
            </div>
            <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab(`/user-groups?mode=new&role=${role}`, `${ROLE_LABELS[role] || role} 추가`, true)}>
              <Plus className="w-3.5 h-3.5" />{ROLE_LABELS[role] || role} 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {roleUsers.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">등록된 {ROLE_LABELS[role] || role}이 없습니다</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">사용자명</TableHead>
                    <TableHead className="text-xs">이름</TableHead>
                    <TableHead className="text-xs">이메일</TableHead>
                    <TableHead className="text-xs">소속</TableHead>
                    <TableHead className="text-xs">역할</TableHead>
                    <TableHead className="text-right text-xs w-20">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleUsers.map(u => {
                    const company = companies.find(c => c.id === u.company_id);
                    return (
                      <TableRow key={u.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openNewTab(`/user-groups?id=${u.id}`, `${u.name} 수정`)}>
                        <TableCell className="font-medium text-sm">{u.username}</TableCell>
                        <TableCell className="text-sm">{u.name}</TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell className="text-sm">{u.role === 'ship_manager' || u.role === 'admin' ? 'INK' : (company ? company.name : '-')}</TableCell>
                        <TableCell><Badge className={`text-xs ${ROLE_COLORS[u.role] || 'bg-gray-500'}`}>{ROLE_LABELS[u.role] || u.role}</Badge></TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(u.id)} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading && !isFormMode) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      {isFormMode ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <UserCircle className="w-5 h-5" />
                <div>
                  <CardTitle className="text-base">{editId ? '사용자 수정' : `${ROLE_LABELS[formData.role] || formData.role} 추가`}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{editId ? '사용자 정보를 수정합니다' : '새로운 사용자를 등록합니다'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3 pt-2 max-w-lg">
              {formError && <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">사용자명 * {editId && <span className="text-gray-500">(수정 불가)</span>}</Label>
                  <Input value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="로그인 ID" disabled={!!editId} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">비밀번호 {editId ? '(변경시에만 입력)' : '*'}</Label>
                  <Input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="비밀번호" className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">이름 *</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="실명" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">이메일 *</Label>
                  <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" className="h-9 text-sm" />
                </div>
              </div>
              {formData.role === 'ship_manager' || formData.role === 'admin' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">소속 회사</Label>
                    <Input value="INK" disabled className="h-9 text-sm bg-gray-50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">직급</Label>
                    <Select value={formData.position_id} onValueChange={v => setFormData({ ...formData, position_id: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급을 선택하세요" /></SelectTrigger>
                      <SelectContent>{positions.map(p => <SelectItem key={p.id} value={String(p.id)} className="text-sm">{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ) : getCompanyOptions().length > 0 ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">소속 회사 *</Label>
                  <Select value={formData.company_id} onValueChange={v => setFormData({ ...formData, company_id: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="회사를 선택하세요" /></SelectTrigger>
                    <SelectContent>{getCompanyOptions().map(c => <SelectItem key={c.id} value={String(c.id)} className="text-sm">{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs">역할</Label>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${ROLE_COLORS[formData.role] || 'bg-gray-500'}`}>{ROLE_LABELS[formData.role] || formData.role}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <UserCircle className="w-6 h-6" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">사용자 그룹 관리</h1>
              <p className="text-sm text-gray-600">선주, 선박관리사, 선원매닝사, 선원을 그룹별로 관리합니다</p>
            </div>
          </div>
          <Tabs defaultValue="ship_manager" className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-9">
              {['ship_manager','ship_owner','manning_agency','crew'].map(role => (
                <TabsTrigger key={role} value={role} className="text-sm">
                  {ROLE_LABELS[role]} ({users.filter(u => u.role === role).length})
                </TabsTrigger>
              ))}
            </TabsList>
            {['ship_manager','ship_owner','manning_agency','crew'].map(role => (
              <TabsContent key={role} value={role} className="mt-3">{renderTable(role)}</TabsContent>
            ))}
          </Tabs>
        </>
      )}
    </main>
  );
}
