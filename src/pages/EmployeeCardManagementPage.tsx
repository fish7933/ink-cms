import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getUsers, addUser, updateUser, deleteUser } from '@/services/user.service';
import { getCompanies } from '@/services/company.service';
import { getShorePositions } from '@/services/shore-position.service';
import type { User, Company, ShorePosition } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, UserCircle, RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const ROLE_LABELS: Record<string, string> = { ship_manager: '일반사용자', admin: '슈퍼관리자', system_admin: '시스템관리자' };
const ROLE_COLORS: Record<string, string> = { ship_manager: 'bg-blue-500', admin: 'bg-red-500', system_admin: 'bg-indigo-500' };
// 우리회사(선박관리사) 내부 직원 = 선박관리사 + 관리자 계정
export const EMPLOYEE_ROLES = ['ship_manager', 'admin', 'system_admin'];

type CompanyExt = Company & { company_type?: string };

const EMPTY_FORM = { username: '', password: '', name: '', email: '', role: 'ship_manager', company_id: '', position_id: '', hire_date: '', resignation_date: '', is_executive: false, resident_registration_number: '' };

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

type EmploymentStatus = 'active' | 'scheduled' | 'resigned';
function employmentStatus(resignationDate?: string | null): EmploymentStatus {
  if (!resignationDate) return 'active';
  return resignationDate <= today() ? 'resigned' : 'scheduled';
}
const STATUS_LABELS: Record<EmploymentStatus, { label: string; className: string }> = {
  active: { label: '재직', className: 'bg-green-100 text-green-700' },
  scheduled: { label: '퇴사예정', className: 'bg-amber-100 text-amber-700' },
  resigned: { label: '퇴사', className: 'bg-gray-200 text-gray-500' },
};

// 목록에서는 뒷자리를 가려서 보여준다 — 다이얼로그(의도적으로 연 화면)에서만 전체 값을 다룬다.
const maskRrn = (rrn?: string | null) => {
  if (!rrn) return '-';
  const digits = rrn.replace(/[^0-9]/g, '');
  if (digits.length < 7) return rrn;
  return `${digits.slice(0, 6)}-${digits[6]}${'*'.repeat(Math.max(0, digits.length - 7))}`;
};

// 사용자 그룹 관리에서 분리된 화면 — 선박관리사(+관리자) 계정은 실제로는 우리회사 직원이라
// 외부(선주/선원매닝사/선원) 사용자 관리와 분리해 "직원카드 관리"로 별도 관리한다.
export default function EmployeeCardManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<CompanyExt[]>([]);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | EmploymentStatus>('all');

  const permissions = usePermissions('user_groups');

  // 시스템관리자(system_admin)는 슈퍼관리자(admin) 계정을 수정/삭제할 수 없다
  const isProtectedFromCurrentUser = (target: User) =>
    currentUserRole === 'system_admin' && target.role === 'admin';

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setCurrentUserRole(user.role ?? null);
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    try {
      const [u, c, p] = await Promise.all([getUsers(), getCompanies(), getShorePositions()]);
      setUsers(u); setCompanies(c as CompanyExt[]); setPositions(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const mgmtCompany = () => companies.find(c => (c as CompanyExt).company_type === '선박관리사');

  const openAdd = () => {
    setEditId(null);
    setFormError('');
    setFormData({ ...EMPTY_FORM, company_id: mgmtCompany()?.id || '' });
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    if (isProtectedFromCurrentUser(u)) return;
    const eu = u as User & { username?: string; position_id?: string };
    setEditId(u.id);
    setFormError('');
    setFormData({
      username: eu.username || '',
      password: '',
      name: u.name,
      email: u.email,
      role: u.role,
      company_id: u.company_id || '',
      position_id: eu.position_id || '',
      hire_date: u.hire_date || '',
      resignation_date: u.resignation_date || '',
      is_executive: u.is_executive || false,
      resident_registration_number: u.resident_registration_number || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditId(null); setFormError(''); };

  const handleSave = async () => {
    setFormError('');
    if (!formData.name.trim()) { setFormError('이름을 입력하세요.'); return; }
    if (!formData.email.trim()) { setFormError('이메일을 입력하세요.'); return; }
    if (!editId && !formData.username.trim()) { setFormError('사용자명을 입력하세요.'); return; }
    if (!editId && !formData.password.trim()) { setFormError('비밀번호를 입력하세요.'); return; }
    try {
      setSaving(true);
      if (editId) {
        await updateUser(editId, {
          name: formData.name, email: formData.email,
          role: formData.role as User['role'],
          company_id: formData.company_id || null,
          position_id: formData.position_id || null,
          hire_date: formData.hire_date || null,
          resignation_date: formData.resignation_date || null,
          is_executive: formData.is_executive,
          resident_registration_number: formData.resident_registration_number || null,
          ...(formData.password ? { password: formData.password } : {}),
        });
      } else {
        await addUser({
          username: formData.username, password: formData.password,
          name: formData.name, email: formData.email,
          role: formData.role as User['role'],
          company_id: formData.company_id || null,
          position_id: formData.position_id || null,
          hire_date: formData.hire_date || null,
          resignation_date: formData.resignation_date || null,
          is_executive: formData.is_executive,
          resident_registration_number: formData.resident_registration_number || null,
        });
      }
      toast({ title: editId ? '수정 완료' : '등록 완료' });
      closeModal();
      await loadData();
    } catch (e: unknown) {
      setFormError((e as { message?: string })?.message || '저장 실패');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const target = users.find(u => u.id === id);
    if (target && isProtectedFromCurrentUser(target)) return;
    if (!confirm('이 직원을 삭제하시겠습니까?')) return;
    try {
      await deleteUser(id);
      await loadData();
      toast({ title: '삭제 완료' });
    } catch (e: unknown) {
      toast({ title: '삭제 실패', description: (e as { message?: string })?.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  const positionOrderById = new Map(positions.map(p => [p.id, p.display_order]));
  const employees = users
    .filter(u => EMPLOYEE_ROLES.includes(u.role))
    .filter(u => statusFilter === 'all' || employmentStatus(u.resignation_date) === statusFilter)
    .sort((a, b) => {
      const statusA = employmentStatus(a.resignation_date);
      const statusB = employmentStatus(b.resignation_date);
      // 퇴사자는 항상 맨 아래로 — 현재 활동 중인 인원이 위에서 바로 보이도록.
      if ((statusA === 'resigned') !== (statusB === 'resigned')) return statusA === 'resigned' ? 1 : -1;
      const posA = positionOrderById.get((a as User & { position_id?: string }).position_id || '') ?? Infinity;
      const posB = positionOrderById.get((b as User & { position_id?: string }).position_id || '') ?? Infinity;
      if (posA !== posB) return posA - posB;
      const hireA = a.hire_date ?? '9999-99-99';
      const hireB = b.hire_date ?? '9999-99-99';
      return hireA.localeCompare(hireB);
    });

  return (
    <>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle className="w-6 h-6" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">직원카드 관리</h1>
              <p className="text-sm text-gray-600">우리회사(선박관리사) 소속 직원 계정을 관리합니다</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5" />새로고침
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">직원 목록</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">총 {employees.length}명</p>
              </div>
              {permissions.canCreate && (
                <Button size="sm" className="gap-1.5 h-8" onClick={openAdd}>
                  <Plus className="w-3.5 h-3.5" />직원 추가
                </Button>
              )}
            </div>
            <div className="flex rounded-md border overflow-hidden w-fit mt-3">
              {(['all', 'active', 'scheduled', 'resigned'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`h-7 px-2.5 text-xs transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {f === 'all' ? '전체' : STATUS_LABELS[f].label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {employees.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">등록된 직원이 없습니다</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">사용자명</TableHead>
                      <TableHead className="text-xs">이름</TableHead>
                      <TableHead className="text-xs">이메일</TableHead>
                      <TableHead className="text-xs">직급</TableHead>
                      <TableHead className="text-xs">주민등록번호</TableHead>
                      <TableHead className="text-xs">구분</TableHead>
                      <TableHead className="text-xs">재직상태</TableHead>
                      <TableHead className="text-xs">역할</TableHead>
                      <TableHead className="text-right text-xs w-20">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(u => {
                      const eu = u as User & { username?: string; position_id?: string };
                      const position = positions.find(p => p.id === eu.position_id);
                      const protectedRow = isProtectedFromCurrentUser(u);
                      const canEditRow = permissions.canEdit && !protectedRow;
                      const canDeleteRow = permissions.canDelete && !protectedRow;
                      const status = employmentStatus(u.resignation_date);
                      return (
                        <TableRow key={u.id} className={`hover:bg-gray-50 ${canEditRow ? 'cursor-pointer' : ''} ${status === 'resigned' ? 'opacity-60' : ''}`} onClick={() => canEditRow && openEdit(u)}>
                          <TableCell className="font-medium text-sm">{eu.username || '-'}</TableCell>
                          <TableCell className="text-sm">{u.name}</TableCell>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell className="text-sm">{position?.name || '-'}</TableCell>
                          <TableCell className="text-sm font-mono text-gray-500">{maskRrn(u.resident_registration_number)}</TableCell>
                          <TableCell>
                            {u.is_executive
                              ? <Badge className="text-xs bg-amber-500">임원</Badge>
                              : <Badge variant="outline" className="text-xs text-gray-500">직원</Badge>}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${STATUS_LABELS[status].className}`}>{STATUS_LABELS[status].label}</Badge>
                            {status !== 'active' && u.resignation_date && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">{u.resignation_date}</span>
                            )}
                          </TableCell>
                          <TableCell><Badge className={`text-xs ${ROLE_COLORS[u.role] || 'bg-gray-500'}`}>{ROLE_LABELS[u.role] || u.role}</Badge></TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            {canDeleteRow && (
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(u.id)} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                            {protectedRow && (permissions.canEdit || permissions.canDelete) && (
                              <span className="text-xs text-gray-400">수정 불가</span>
                            )}
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
      </main>

      <Dialog open={modalOpen} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCircle className="w-5 h-5" />
              {editId ? '직원 정보 수정' : '직원 추가'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {formError && <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{formError}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">사용자명 * {editId && <span className="text-gray-400">(수정 불가)</span>}</Label>
                <Input value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} placeholder="로그인 ID" disabled={!!editId} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">비밀번호 {editId ? '(변경시만 입력)' : '*'}</Label>
                <Input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="비밀번호" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">이름 *</Label>
                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="실명" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">이메일 *</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">직급</Label>
              <Select value={formData.position_id || '_none'} onValueChange={v => setFormData({ ...formData, position_id: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— 선택 —</SelectItem>
                  {positions.map(p => <SelectItem key={p.id} value={String(p.id)} className="text-sm">{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">입사일 <span className="text-gray-400 font-normal">(연차·급여 일할계산 기준)</span></Label>
                <Input type="date" value={formData.hire_date} onChange={e => setFormData({ ...formData, hire_date: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">주민등록번호 <span className="text-gray-400 font-normal">(급여대장용)</span></Label>
                <Input value={formData.resident_registration_number} onChange={e => setFormData({ ...formData, resident_registration_number: e.target.value })} placeholder="000000-0000000" className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">퇴사일 <span className="text-gray-400 font-normal">(지정하면 그 날짜부터 로그인 차단, 휴가/급여 대상에서 제외됩니다)</span></Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={formData.resignation_date} onChange={e => setFormData({ ...formData, resignation_date: e.target.value })} className="h-8 text-sm flex-1" />
                {formData.resignation_date && (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => setFormData({ ...formData, resignation_date: '' })}>재직으로 되돌리기</Button>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={formData.is_executive} onCheckedChange={c => setFormData({ ...formData, is_executive: c === true })} />
              <span className="text-xs">임원 <span className="text-gray-400 font-normal">(체크 해제 시 일반 직원)</span></span>
            </label>

            <div className="flex items-center gap-2 pt-1">
              <Label className="text-xs">역할</Label>
              <Badge className={`text-xs ${ROLE_COLORS[formData.role] || 'bg-gray-500'}`}>{ROLE_LABELS[formData.role] || formData.role}</Badge>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeModal}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
