import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Eye, ExternalLink, UserPlus, Award, ArrowLeft, Undo2, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { CertificateUploadDialog } from '@/components/crew/CertificateUploadDialog';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, getCompanies, getFleets, getShips, getRanks } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import type { CrewRecommendationWithDetails, User as UserType, Company, Fleet, Ship, Rank } from '@/types/models';
import { useTabContext } from '@/contexts/TabContext';

const ITEMS_PER_PAGE = 20;

const calcAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const ALLOWED_ROLES = ['manning_agency', 'admin', 'system_admin'];

export default function MyRecommendationsPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [filtered, setFiltered] = useState<CrewRecommendationWithDetails[]>([]);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRec, setSelectedRec] = useState<CrewRecommendationWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [selectedRecForCert, setSelectedRecForCert] = useState<CrewRecommendationWithDetails | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [dateF, setDateF] = useState('all');
  const [ownerF, setOwnerF] = useState('all');
  const [fleetF, setFleetF] = useState('all');
  const [shipF, setShipF] = useState('all');
  const [rankF, setRankF] = useState('all');

  const permissions = usePermissions('my_recommendations');

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우 접근을 차단한다. loading 중에는 판단하지 않는다.
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { applyFilters(); }, [recommendations, search, statusF, dateF, ownerF, fleetF, shipF, rankF]);
  useEffect(() => {
    if (ownerF !== 'all') getFleets(ownerF).then(setFleets).catch(console.error);
    else getFleets().then(setFleets).catch(console.error);
    setFleetF('all');
  }, [ownerF]);
  useEffect(() => {
    getShips().then(all => {
      if (fleetF !== 'all') setShips(all.filter((s: Ship) => s.fleet_id === fleetF));
      else if (ownerF !== 'all') setShips(all.filter((s: Ship) => s.owner_id === ownerF));
      else setShips(all);
    }).catch(console.error);
    setShipF('all');
  }, [fleetF, ownerF]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, allCompanies, allFleets, allShips, allRanks] = await Promise.all([
        getCurrentUser(), getCompanies(), getFleets(), getShips(), getRanks(),
      ]);
      if (!user || !ALLOWED_ROLES.includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setCurrentUser(user);
      setCompanies(allCompanies.filter((c: Company) => c.type === 'owner'));
      setFleets(allFleets);
      setShips(allShips);
      setRanks(allRanks);
      if (!user?.company_id) return;
      // 결재 승인 시 자동으로 등록 선원 목록에 반영되므로, 등록 완료 여부와 무관하게
      // 추천 이력은 계속 보여준다(예전엔 등록되면 목록에서 사라져서 승인 직후 바로
      // 안 보이는 것처럼 느껴지는 문제가 있었음).
      const recs = await crewRecommendationService.getByManningAgency(user.company_id);
      setRecommendations(recs);
    } catch (e) {
      console.error('Failed to load recommendations:', e);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let data = [...recommendations];
    if (search) {
      const t = search.toLowerCase();
      data = data.filter(r =>
        r.crew_name.toLowerCase().includes(t) ||
        r.ship_name.toLowerCase().includes(t) ||
        r.rank_code?.toLowerCase().includes(t)
      );
    }
    if (statusF !== 'all') data = data.filter(r => r.status === statusF);
    if (ownerF !== 'all') data = data.filter(r => r.company_id === ownerF);
    if (fleetF !== 'all') data = data.filter(r => r.fleet_id === fleetF);
    if (shipF !== 'all') data = data.filter(r => r.ship_id === shipF);
    if (rankF !== 'all') data = data.filter(r => r.rank_id === rankF);
    if (dateF !== 'all') {
      const d = new Date();
      if (dateF === 'week') d.setDate(d.getDate() - 7);
      else if (dateF === 'month') d.setMonth(d.getMonth() - 1);
      else if (dateF === 'quarter') d.setMonth(d.getMonth() - 3);
      data = data.filter(r => new Date(r.created_at) >= d);
    }
    setFiltered(data);
    setPage(1);
  };

  const openDetail = (r: CrewRecommendationWithDetails) => { setSelectedRec(r); setViewMode('detail'); };

  const handleWithdraw = async (r: CrewRecommendationWithDetails) => {
    if (!confirm(`${r.crew_name}님의 추천을 철회하시겠습니까? 철회 이력은 목록에 남고, 같은 직급에 언제든 다시 추천할 수 있습니다.`)) return;
    try {
      await crewRecommendationService.updateStatus(r.id, 'withdrawn');
      if (selectedRec?.id === r.id) setSelectedRec({ ...selectedRec, status: 'withdrawn' });
      await loadData();
    } catch (e) {
      console.error(e);
      alert('철회 처리 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (r: CrewRecommendationWithDetails) => {
    if (!confirm(`${r.crew_name}님의 추천 건을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await crewRecommendationService.delete(r.id);
      if (selectedRec?.id === r.id) { setViewMode('list'); setSelectedRec(null); }
      await loadData();
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleReRecommend = (r: CrewRecommendationWithDetails) => {
    if (!r.job_posting_group_id) { alert('연결된 구인 공고를 찾을 수 없습니다.'); return; }
    // 재추천은 새 추천과 달리 이전에 추천했던 선원의 정보를 그대로 이어받아야 하므로,
    // 원본 추천 id를 넘겨 그 데이터를 불러와 채우게 한다.
    openNewTab(`/job-postings/${r.job_posting_group_id}/recommend/${r.rank_id}?from=${r.id}`, `${r.rank_code || ''} 선원 재추천`.trim(), true);
  };

  const openResume = async (r: CrewRecommendationWithDetails) => {
    if (!r.resume_files?.length) { alert('첨부된 이력서가 없습니다.'); return; }
    for (const f of r.resume_files) {
      const { data } = supabase.storage.from('documents').getPublicUrl(f.path);
      if (data?.publicUrl) window.open(data.publicUrl, '_blank');
    }
  };

  const sBadge = (s: string) => {
    if (s === 'pending') return <Badge variant="secondary" className="text-xs">검토 대기</Badge>;
    if (s === 'reviewed') return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">결재중</Badge>;
    if (s === 'accepted') return <Badge variant="default" className="text-xs bg-green-600">수락</Badge>;
    if (s === 'rejected') return <Badge variant="destructive" className="text-xs">거절</Badge>;
    if (s === 'withdrawn') return <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-300">철회됨</Badge>;
    return null;
  };

  const dc = (d: string) => {
    if (d === 'deck') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (d === 'engine') return 'bg-green-100 text-green-700 border-green-300';
    if (d === 'catering') return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const stats = {
    total: recommendations.length,
    pending: recommendations.filter(r => r.status === 'pending').length,
    reviewed: recommendations.filter(r => r.status === 'reviewed').length,
    accepted: recommendations.filter(r => r.status === 'accepted').length,
    rejected: recommendations.filter(r => r.status === 'rejected').length,
    withdrawn: recommendations.filter(r => r.status === 'withdrawn').length,
  };

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageRecs = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  if (loading) return <><div className="p-8 text-sm text-gray-500">로딩 중...</div></>;

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {viewMode === 'list' ? (
          <>
            <div className="mb-4 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">내 추천 선원 관리</h1>
                <p className="text-sm text-muted-foreground mt-1">우리 회사가 추천한 선원 목록을 관리합니다</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
              {[
                { label: '전체 추천', value: stats.total, color: 'border-blue-500', text: 'text-blue-600' },
                { label: '검토 대기', value: stats.pending, color: 'border-gray-400', text: 'text-gray-600' },
                { label: '결재중', value: stats.reviewed, color: 'border-blue-400', text: 'text-blue-500' },
                { label: '수락', value: stats.accepted, color: 'border-green-500', text: 'text-green-600' },
                { label: '거절', value: stats.rejected, color: 'border-red-500', text: 'text-red-600' },
                { label: '철회됨', value: stats.withdrawn, color: 'border-gray-300', text: 'text-gray-500' },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-lg shadow-sm p-3 border-l-4 ${s.color}`}>
                  <div className="text-xs text-gray-600">{s.label}</div>
                  <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* 필터 */}
            <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
              <div className="flex items-center gap-2 mb-2"><Filter className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-sm font-medium">필터</span></div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="md:col-span-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="선원명, 선박명, 직급 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
                  </div>
                </div>
                <Select value={ownerF} onValueChange={setOwnerF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주사" /></SelectTrigger><SelectContent><SelectItem value="all">전체 선주사</SelectItem>{companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>
                <Select value={fleetF} onValueChange={setFleetF} disabled={ownerF === 'all'}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="플릿" /></SelectTrigger><SelectContent><SelectItem value="all">전체 플릿</SelectItem>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent></Select>
                <Select value={shipF} onValueChange={setShipF} disabled={ownerF === 'all'}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박" /></SelectTrigger><SelectContent><SelectItem value="all">전체 선박</SelectItem>{ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
                <Select value={rankF} onValueChange={setRankF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급" /></SelectTrigger><SelectContent><SelectItem value="all">전체 직급</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.rank_code} - {r.name}</SelectItem>)}</SelectContent></Select>
                <Select value={statusF} onValueChange={setStatusF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="상태" /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="pending">검토 대기</SelectItem><SelectItem value="reviewed">결재중</SelectItem><SelectItem value="accepted">수락</SelectItem><SelectItem value="rejected">거절</SelectItem><SelectItem value="withdrawn">철회됨</SelectItem></SelectContent></Select>
                <Select value={dateF} onValueChange={setDateF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="기간" /></SelectTrigger><SelectContent><SelectItem value="all">전체 기간</SelectItem><SelectItem value="week">최근 1주일</SelectItem><SelectItem value="month">최근 1개월</SelectItem><SelectItem value="quarter">최근 3개월</SelectItem></SelectContent></Select>
              </div>
            </div>

            {/* 테이블 */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs py-2 w-20">상태</TableHead>
                    <TableHead className="text-xs py-2 w-32">선박 정보</TableHead>
                    <TableHead className="text-xs py-2 w-20">직급</TableHead>
                    <TableHead className="text-xs py-2">선원명</TableHead>
                    <TableHead className="text-xs py-2 w-12">나이</TableHead>
                    <TableHead className="text-xs py-2">희망 조건</TableHead>
                    <TableHead className="text-xs py-2 w-24">출국가능일</TableHead>
                    <TableHead className="text-xs py-2 w-24">추천일</TableHead>
                    <TableHead className="text-right text-xs py-2 w-48">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRecs.map(rec => (
                    <TableRow key={rec.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(rec)}>
                      <TableCell className="py-2">{sBadge(rec.status)}</TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm font-medium truncate max-w-[120px]">{rec.ship_name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {rec.company_name}{rec.fleet_name ? ` · ${rec.fleet_name}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        {rec.rank_code
                          ? <Badge variant="outline" className={`text-xs ${dc(rec.department)}`}>{rec.rank_code}</Badge>
                          : <Badge variant="outline" className="text-xs bg-gray-100 text-gray-400">-</Badge>}
                      </TableCell>
                      <TableCell className="py-2"><div className="text-sm font-medium">{rec.crew_name}</div></TableCell>
                      <TableCell className="py-2"><div className="text-xs text-muted-foreground">{calcAge(rec.crew_birth_date)}세</div></TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm">{rec.desired_currency} {rec.desired_salary.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{rec.desired_contract_months}개월</div>
                      </TableCell>
                      <TableCell className="text-xs py-2">{new Date(rec.available_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}</TableCell>
                      <TableCell className="text-xs py-2">{new Date(rec.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}</TableCell>
                      <TableCell className="text-right py-2">
                        <div className="flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          {rec.status === 'accepted' && permissions.canEdit && (
                            <>
                              <Button variant="default" size="sm" onClick={() => openNewTab(`/crew/input/${rec.id}`, '선원 상세입력', true)} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                                <UserPlus className="w-3.5 h-3.5 mr-1.5" />상세입력
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => { setSelectedRecForCert(rec); setCertDialogOpen(true); }} className="h-8 px-3 text-xs text-green-700 border-green-400 hover:bg-green-50">
                                <Award className="w-3.5 h-3.5 mr-1.5" />증서 등록
                              </Button>
                            </>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openDetail(rec)} className="h-8 px-3 text-xs">
                            <Eye className="w-3.5 h-3.5 mr-1.5" />상세
                          </Button>
                          {rec.resume_files?.length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => openResume(rec)} className="h-8 px-3 text-xs">
                              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />이력서
                            </Button>
                          )}
                          {rec.status === 'pending' && permissions.canEdit && (
                            <Button variant="outline" size="sm" onClick={() => handleWithdraw(rec)} className="h-8 px-3 text-xs text-orange-600 border-orange-300 hover:bg-orange-50">
                              <Undo2 className="w-3.5 h-3.5 mr-1.5" />철회
                            </Button>
                          )}
                          {(rec.status === 'withdrawn' || rec.status === 'rejected') && permissions.canCreate && (
                            <Button variant="default" size="sm" onClick={() => handleReRecommend(rec)} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                              <UserPlus className="w-3.5 h-3.5 mr-1.5" />재추천
                            </Button>
                          )}
                          {(rec.status === 'accepted' || rec.status === 'rejected' || rec.status === 'withdrawn') && permissions.canDelete && (
                            <Button variant="outline" size="sm" onClick={() => handleDelete(rec)} className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" />삭제
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pageRecs.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {search || statusF !== 'all' ? '검색 결과가 없습니다.' : '아직 추천한 선원이 없습니다.'}
                </div>
              )}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="mt-3 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem><PaginationPrevious onClick={() => page > 1 && setPage(page - 1)} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                        return <PaginationItem key={p}><PaginationLink onClick={() => setPage(p)} isActive={page === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
                      } else if (p === page - 2 || p === page + 2) {
                        return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
                      }
                      return null;
                    })}
                    <PaginationItem><PaginationNext onClick={() => page < totalPages && setPage(page + 1)} className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Detail view header */}
            <div className="flex items-center gap-3 mb-4">
              <Button variant="ghost" size="sm" onClick={() => { setViewMode('list'); setSelectedRec(null); }}>
                <ArrowLeft className="w-4 h-4 mr-1" />뒤로
              </Button>
              <div>
                <h1 className="text-2xl font-bold">추천 선원 상세 정보</h1>
              </div>
            </div>

            {/* Detail view content */}
            {selectedRec && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm font-medium">현재 상태</span>{sBadge(selectedRec.status)}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선원 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">직급</span><div className="mt-1">{selectedRec.rank_code ? <Badge className={dc(selectedRec.department)}>{selectedRec.rank_code}</Badge> : '-'}</div></div>
                      <div><span className="text-xs text-gray-600">성명</span><p className="text-sm font-medium">{selectedRec.crew_name}</p></div>
                      <div><span className="text-xs text-gray-600">생년월일</span><p className="text-sm font-medium">{new Date(selectedRec.crew_birth_date).toLocaleDateString('ko-KR')}</p></div>
                      <div><span className="text-xs text-gray-600">나이</span><p className="text-sm font-medium">{calcAge(selectedRec.crew_birth_date)}세</p></div>
                      <div><span className="text-xs text-gray-600">출국 가능일</span><p className="text-sm font-medium">{new Date(selectedRec.available_date).toLocaleDateString('ko-KR')}</p></div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선박 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">선주사</span><p className="text-sm font-medium">{selectedRec.company_name}</p></div>
                      <div><span className="text-xs text-gray-600">선박명</span><p className="text-sm font-medium">{selectedRec.ship_name}</p></div>
                      {selectedRec.fleet_name && <div><span className="text-xs text-gray-600">선대</span><p className="text-sm font-medium">{selectedRec.fleet_name}</p></div>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">희망 계약 조건</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">희망 급여</span><p className="text-sm font-medium">{selectedRec.desired_currency} {selectedRec.desired_salary.toLocaleString()}</p></div>
                      <div><span className="text-xs text-gray-600">희망 계약기간</span><p className="text-sm font-medium">{selectedRec.desired_contract_months}개월</p></div>
                    </div>
                  </div>

                  {selectedRec.remarks && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">비고</h3>
                      <div className="p-3 bg-gray-50 rounded-md"><p className="text-sm whitespace-pre-wrap">{selectedRec.remarks}</p></div>
                    </div>
                  )}

                  {selectedRec.resume_files?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">첨부 이력서</h3>
                      <div className="space-y-2">
                        {selectedRec.resume_files.map((f: { name: string; size: number; path: string }, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                            <div className="flex items-center gap-2">
                              <ExternalLink className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">{f.name}</span>
                              <span className="text-xs text-gray-500">({(f.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => openResume(selectedRec)} className="h-7">열기</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex justify-end gap-2 pt-4">
                    {selectedRec.status === 'accepted' && permissions.canEdit && (
                      <>
                        <Button variant="default" size="sm" onClick={() => openNewTab(`/crew/input/${selectedRec.id}`, '선원 상세입력', true)} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                          <UserPlus className="w-3.5 h-3.5 mr-1.5" />상세입력
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedRecForCert(selectedRec); setCertDialogOpen(true); }} className="h-8 px-3 text-xs text-green-700 border-green-400 hover:bg-green-50">
                          <Award className="w-3.5 h-3.5 mr-1.5" />증서 등록
                        </Button>
                      </>
                    )}
                    {selectedRec.status === 'pending' && permissions.canEdit && (
                      <Button variant="outline" size="sm" onClick={() => handleWithdraw(selectedRec)} className="h-8 px-3 text-xs text-orange-600 border-orange-300 hover:bg-orange-50">
                        <Undo2 className="w-3.5 h-3.5 mr-1.5" />철회
                      </Button>
                    )}
                    {(selectedRec.status === 'withdrawn' || selectedRec.status === 'rejected') && permissions.canCreate && (
                      <Button variant="default" size="sm" onClick={() => handleReRecommend(selectedRec)} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" />재추천
                      </Button>
                    )}
                    {(selectedRec.status === 'accepted' || selectedRec.status === 'rejected' || selectedRec.status === 'withdrawn') && permissions.canDelete && (
                      <Button variant="outline" size="sm" onClick={() => handleDelete(selectedRec)} className="h-8 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />삭제
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* 증서 등록 다이얼로그 */}
        {selectedRecForCert && (
          <CertificateUploadDialog
            open={certDialogOpen}
            onClose={(saved) => {
              setCertDialogOpen(false);
              setSelectedRecForCert(null);
              if (saved) loadData();
            }}
            recommendationId={selectedRecForCert.id}
            crewName={selectedRecForCert.crew_name}
            existingCertificates={
              typeof selectedRecForCert.certificates === 'string'
                ? JSON.parse(selectedRecForCert.certificates || '[]')
                : (selectedRecForCert.certificates || [])
            }
          />
        )}
      </div>
    </>
  );
}
