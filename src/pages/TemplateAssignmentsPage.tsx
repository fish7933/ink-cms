import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Filter, Building2, Layers, Ship as ShipIcon, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { getCurrentUser, getShips, getFleets, getCompanies } from '@/lib/store';
import type { Ship, Fleet, Company } from '@/types/models';
import {
  getSalaryTemplates,
  getShipSalaryAssignments,
  getFleetSalaryAssignments,
  getOwnerSalaryAssignments,
  assignTemplateToShip,
  assignTemplateToFleet,
  assignTemplateToOwner,
  unassignTemplateFromShip,
  unassignTemplateFromFleet,
  unassignTemplateFromOwner,
  cleanupLowerLevelAssignments,
  type SalaryTemplate,
  type ShipSalaryAssignment,
  type FleetSalaryAssignment,
  type OwnerSalaryAssignment,
} from '@/lib/salary-store';

interface OwnerAssignmentRow extends OwnerSalaryAssignment {
  owner_name: string;
  template_name: string;
  fleet_count: number;
  ship_count: number;
}

interface FleetAssignmentRow extends FleetSalaryAssignment {
  fleet_name: string;
  owner_name: string;
  template_name: string;
  ship_count: number;
}

interface ShipAssignmentRow extends ShipSalaryAssignment {
  ship_name: string;
  fleet_name: string | null;
  owner_name: string;
  template_name: string;
}

type AssignTarget = 'owner' | 'fleet' | 'ship';

export default function TemplateAssignmentsPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ownerAssignments, setOwnerAssignments] = useState<OwnerAssignmentRow[]>([]);
  const [fleetAssignments, setFleetAssignments] = useState<FleetAssignmentRow[]>([]);
  const [shipAssignments, setShipAssignments] = useState<ShipAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('all');

  const [formView, setFormView] = useState<{ id?: string; record?: any } | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget>('ship');
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [assignFleetId, setAssignFleetId] = useState('');
  const [assignShipId, setAssignShipId] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      loadData();
    };
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesData, shipsData, fleetsData, companiesData, shipAssignmentsData, fleetAssignmentsData, ownerAssignmentsData] = await Promise.all([
        getSalaryTemplates(), getShips(), getFleets(), getCompanies(),
        getShipSalaryAssignments(), getFleetSalaryAssignments(), getOwnerSalaryAssignments(),
      ]);

      setTemplates(templatesData);
      setShips(shipsData);
      setFleets(fleetsData);
      setCompanies(companiesData);

      const ownerCompaniesData = companiesData.filter((c: Company) => c.type === 'owner');
      const fleetMap = new Map<string, Fleet>(fleetsData.map(f => [String(f.id), f]));
      const ownerMap = new Map<string, string>(ownerCompaniesData.map((o: Company) => [String(o.id), o.name]));
      const shipMap = new Map<string, Ship>(shipsData.map(s => [String(s.id), s]));
      const templateMap = new Map<string, string>(templatesData.map(t => [String(t.id), t.name]));

      const fleetsPerOwner = new Map<string, number>();
      const shipsPerOwner = new Map<string, number>();
      const shipsPerFleet = new Map<string, number>();
      for (const f of fleetsData) { const o = String(f.owner_id); fleetsPerOwner.set(o, (fleetsPerOwner.get(o)||0)+1); }
      for (const s of shipsData) {
        const o = String(s.owner_id); shipsPerOwner.set(o, (shipsPerOwner.get(o)||0)+1);
        if (s.fleet_id) { const f = String(s.fleet_id); shipsPerFleet.set(f, (shipsPerFleet.get(f)||0)+1); }
      }

      setOwnerAssignments(ownerAssignmentsData.map((a: OwnerSalaryAssignment) => ({
        ...a,
        owner_name: ownerMap.get(String(a.owner_id)) || String(a.owner_id),
        template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
        fleet_count: fleetsPerOwner.get(String(a.owner_id)) || 0,
        ship_count: shipsPerOwner.get(String(a.owner_id)) || 0,
      })));

      setFleetAssignments(fleetAssignmentsData.map((a: FleetSalaryAssignment) => {
        const fleet = fleetMap.get(String(a.fleet_id));
        const ownerId = fleet?.owner_id ? String(fleet.owner_id) : '';
        return {
          ...a,
          fleet_name: fleet?.name || String(a.fleet_id),
          owner_name: ownerId ? ownerMap.get(ownerId) || '-' : '-',
          template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
          ship_count: shipsPerFleet.get(String(a.fleet_id)) || 0,
        };
      }));

      setShipAssignments(shipAssignmentsData.map((a: ShipSalaryAssignment) => {
        const ship = shipMap.get(String(a.ship_id));
        const fleet = ship?.fleet_id ? fleetMap.get(String(ship.fleet_id)) : null;
        const ownerId = fleet?.owner_id || ship?.owner_id;
        return {
          ...a,
          ship_name: ship?.name || String(a.ship_id),
          fleet_name: fleet?.name || null,
          owner_name: ownerId ? ownerMap.get(String(ownerId)) || '-' : '-',
          template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
        };
      }));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAssignForm = () => {
    setAssignTarget('ship');
    setAssignTemplateId(templates[0]?.id || '');
    setAssignOwnerId('');
    setAssignFleetId('');
    setAssignShipId('');
    setFormView({});
  };

  const handleAssign = async () => {
    if (!assignTemplateId) { alert('템플릿을 선택하세요.'); return; }
    let success = false;
    const templateName = templates.find(t => String(t.id) === assignTemplateId)?.name || '';

    if (assignTarget === 'owner') {
      if (!assignOwnerId) { alert('선주를 선택하세요.'); return; }
      const ownerName = ownerCompanies.find(c => String(c.id) === assignOwnerId)?.name || '';
      const ownerFleets = fleets.filter(f => String(f.owner_id) === assignOwnerId);
      const ownerFleetIds = ownerFleets.map(f => String(f.id));
      const allFleetAssigns = await getFleetSalaryAssignments();
      const conflictFleets = allFleetAssigns.filter(a => ownerFleetIds.includes(String(a.fleet_id)));
      const ownerShips = ships.filter(s => String(s.owner_id) === assignOwnerId);
      const ownerShipIds = ownerShips.map(s => String(s.id));
      const allShipAssigns = await getShipSalaryAssignments();
      const conflictShips = allShipAssigns.filter(a => ownerShipIds.includes(String(a.ship_id)));

      let msg = `"${ownerName}" 선주에 "${templateName}" 템플릿을 할당하시겠습니까?\n\n`;
      if (conflictFleets.length > 0 || conflictShips.length > 0) {
        const fleetNames = conflictFleets.map(a => ownerFleets.find(f => String(f.id) === String(a.fleet_id))?.name || '').filter(Boolean);
        const shipNames = conflictShips.map(a => ownerShips.find(s => String(s.id) === String(a.ship_id))?.name || '').filter(Boolean);
        if (fleetNames.length > 0) msg += `이미 템플릿이 할당된 플릿:\n${fleetNames.map(n => `  - ${n}`).join('\n')}\n\n`;
        if (shipNames.length > 0) msg += `이미 템플릿이 할당된 선박:\n${shipNames.map(n => `  - ${n}`).join('\n')}\n\n`;
        msg += `[확인] 기존 플릿/선박 할당을 모두 삭제하고 선주 레벨로 통일합니다.\n[취소] 진행하지 않습니다.`;
      } else {
        msg += `[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.`;
      }
      if (!window.confirm(msg)) return;
      for (const a of conflictFleets) await unassignTemplateFromFleet(String(a.fleet_id), String(a.template_id));
      for (const a of conflictShips) await unassignTemplateFromShip(String(a.ship_id), String(a.template_id));
      const existingOwner = await getOwnerSalaryAssignments(assignOwnerId);
      for (const a of existingOwner) await unassignTemplateFromOwner(String(a.owner_id), String(a.template_id));
      success = !!(await assignTemplateToOwner(assignOwnerId, assignTemplateId));

    } else if (assignTarget === 'fleet') {
      if (!assignFleetId) { alert('플릿을 선택하세요.'); return; }
      const fleetName = fleets.find(f => String(f.id) === assignFleetId)?.name || '';
      const fleetShips = ships.filter(s => String(s.fleet_id) === assignFleetId);
      const fleetShipIds = fleetShips.map(s => String(s.id));
      const allShipAssigns = await getShipSalaryAssignments();
      const conflictShips = allShipAssigns.filter(a => fleetShipIds.includes(String(a.ship_id)));

      let msg = `"${fleetName}" 플릿에 "${templateName}" 템플릿을 할당하시겠습니까?\n\n`;
      if (conflictShips.length > 0) {
        const shipNames = conflictShips.map(a => fleetShips.find(s => String(s.id) === String(a.ship_id))?.name || '').filter(Boolean);
        msg += `이미 템플릿이 할당된 선박:\n${shipNames.map(n => `  - ${n}`).join('\n')}\n\n`;
        msg += `[확인] 기존 선박 할당을 모두 삭제하고 플릿 레벨로 통일합니다.\n[취소] 진행하지 않습니다.`;
      } else {
        msg += `[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.`;
      }
      if (!window.confirm(msg)) return;
      for (const a of conflictShips) await unassignTemplateFromShip(String(a.ship_id), String(a.template_id));
      const existingFleet = await getFleetSalaryAssignments(assignFleetId);
      for (const a of existingFleet) await unassignTemplateFromFleet(String(a.fleet_id), String(a.template_id));
      success = !!(await assignTemplateToFleet(assignFleetId, assignTemplateId));

    } else if (assignTarget === 'ship') {
      if (!assignShipId) { alert('선박을 선택하세요.'); return; }
      const shipName = ships.find(s => String(s.id) === assignShipId)?.name || '';
      const msg = `"${shipName}" 선박에 "${templateName}" 템플릿을 할당하시겠습니까?\n\n[확인] 할당을 진행합니다.\n[취소] 진행하지 않습니다.`;
      if (!window.confirm(msg)) return;
      const existing = await getShipSalaryAssignments(assignShipId);
      for (const a of existing) await unassignTemplateFromShip(String(a.ship_id), String(a.template_id));
      success = !!(await assignTemplateToShip(assignShipId, assignTemplateId));
    }

    if (success) { setFormView(null); await loadData(); }
    else alert('할당에 실패했습니다.');
  };

  const handleUnassignOwner = async (ownerId: string, templateId: string) => {
    if (!confirm('할당을 해제하시겠습니까?')) return;
    if (await unassignTemplateFromOwner(ownerId, templateId)) await loadData();
    else alert('해제에 실패했습니다.');
  };

  const handleUnassignFleet = async (fleetId: string, templateId: string) => {
    if (!confirm('할당을 해제하시겠습니까?')) return;
    if (await unassignTemplateFromFleet(fleetId, templateId)) await loadData();
    else alert('해제에 실패했습니다.');
  };

  const handleUnassignShip = async (shipId: string, templateId: string) => {
    if (!confirm('할당을 해제하시겠습니까?')) return;
    if (await unassignTemplateFromShip(shipId, templateId)) await loadData();
    else alert('해제에 실패했습니다.');
  };

  const filteredOwner = selectedTemplate === 'all' ? ownerAssignments : ownerAssignments.filter(a => String(a.template_id) === selectedTemplate);
  const filteredFleet = selectedTemplate === 'all' ? fleetAssignments : fleetAssignments.filter(a => String(a.template_id) === selectedTemplate);
  const filteredShip = selectedTemplate === 'all' ? shipAssignments : shipAssignments.filter(a => String(a.template_id) === selectedTemplate);
  const totalCount = filteredOwner.length + filteredFleet.length + filteredShip.length;
  const ownerCompanies = companies.filter(c => c.type === 'owner');

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const unassignBtn = (onClick: () => void) => (
    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onClick(); }} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
      <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">해제</span>
    </Button>
  );

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              {formView !== null ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={() => setFormView(null)}>
                      <ArrowLeft className="h-4 w-4" />뒤로
                    </Button>
                    <CardTitle className="text-base">템플릿 할당</CardTitle>
                  </div>
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleAssign}>
                    <Save className="h-4 w-4" />할당
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <CardTitle className="text-base">템플릿 할당 현황</CardTitle>
                    <p className="text-xs text-gray-600 mt-1">선주, 플릿, 선박에 할당된 급여 템플릿을 관리하세요</p>
                  </div>
                  <Button size="sm" className="gap-1.5 h-8" onClick={openAssignForm}>
                    <Plus className="h-4 w-4" />템플릿 할당
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {formView !== null ? (
              /* ── Inline Form ── */
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">할당 레벨</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['owner', 'fleet', 'ship'] as AssignTarget[]).map(t => (
                      <button key={t} type="button"
                        onClick={() => { setAssignTarget(t); setAssignOwnerId(''); setAssignFleetId(''); setAssignShipId(''); }}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors
                          ${assignTarget === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      >
                        {t === 'owner' && <><Building2 className="h-3.5 w-3.5" />선주</>}
                        {t === 'fleet' && <><Layers className="h-3.5 w-3.5" />플릿</>}
                        {t === 'ship' && <><ShipIcon className="h-3.5 w-3.5" />선박</>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">선주 <span className="text-red-500">*</span></Label>
                  <Select value={assignOwnerId} onValueChange={v => { setAssignOwnerId(v); setAssignFleetId(''); setAssignShipId(''); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주 선택" /></SelectTrigger>
                    <SelectContent>
                      {ownerCompanies.map(c => <SelectItem key={c.id} value={String(c.id)} className="text-sm">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(assignTarget === 'fleet' || assignTarget === 'ship') && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      플릿 {assignTarget === 'fleet' && <span className="text-red-500">*</span>}
                      {assignTarget === 'ship' && <span className="text-gray-400 font-normal">(선택)</span>}
                    </Label>
                    <Select value={assignFleetId} onValueChange={v => { setAssignFleetId(v); setAssignShipId(''); }} disabled={!assignOwnerId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={assignOwnerId ? '플릿 선택' : '선주를 먼저 선택하세요'} /></SelectTrigger>
                      <SelectContent>
                        {assignTarget === 'ship' && <SelectItem value="none" className="text-sm text-gray-400">플릿 없음</SelectItem>}
                        {fleets.filter(f => String(f.owner_id) === assignOwnerId).map(f => (
                          <SelectItem key={f.id} value={String(f.id)} className="text-sm">{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {assignTarget === 'ship' && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">선박 <span className="text-red-500">*</span></Label>
                    <Select value={assignShipId} onValueChange={setAssignShipId} disabled={!assignOwnerId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={assignOwnerId ? '선박 선택' : '선주를 먼저 선택하세요'} /></SelectTrigger>
                      <SelectContent>
                        {ships.filter(s => {
                          if (!assignOwnerId) return false;
                          if (assignFleetId && assignFleetId !== 'none') return String(s.fleet_id) === assignFleetId;
                          return String(s.owner_id) === assignOwnerId;
                        }).map(s => (
                          <SelectItem key={s.id} value={String(s.id)} className="text-sm">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-sm">급여 템플릿 <span className="text-red-500">*</span></Label>
                  <Select value={assignTemplateId} onValueChange={setAssignTemplateId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="템플릿 선택" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={String(t.id)} className="text-sm">{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {assignTarget !== 'ship' && (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                    {assignTarget === 'owner'
                      ? '선주 레벨 할당 시 소속 플릿/선박의 기존 할당 처리 여부를 확인합니다.'
                      : '플릿 레벨 할당 시 소속 선박의 기존 할당 처리 여부를 확인합니다.'}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormView(null)} className="h-8">취소</Button>
                  <Button type="button" size="sm" onClick={handleAssign} className="h-8">할당</Button>
                </div>
              </div>
            ) : (
              /* ── List View ── */
              <>
                {/* 상위 탭: 대상별 / 템플릿별 */}
                <Tabs defaultValue="by-target" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-9 mb-4">
                    <TabsTrigger value="by-target" className="text-xs">대상별 (선주 · 플릿 · 선박)</TabsTrigger>
                    <TabsTrigger value="by-template" className="text-xs">템플릿별</TabsTrigger>
                  </TabsList>

                  {/* ── 대상별 탭 ── */}
                  <TabsContent value="by-target">
                    <div className="flex items-center gap-2 mb-3">
                      <Filter className="h-4 w-4 text-gray-400" />
                      <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                        <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="템플릿 필터" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">모든 템플릿</SelectItem>
                          {templates.map(t => <SelectItem key={t.id} value={String(t.id)} className="text-sm">{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-gray-400">총 {totalCount}건</span>
                    </div>

                    <Tabs defaultValue="all">
                      <TabsList className="grid w-full grid-cols-4 h-8">
                        <TabsTrigger value="all" className="text-xs">전체 ({totalCount})</TabsTrigger>
                        <TabsTrigger value="owner" className="text-xs"><Building2 className="h-3 w-3 mr-1" />선주 ({filteredOwner.length})</TabsTrigger>
                        <TabsTrigger value="fleet" className="text-xs"><Layers className="h-3 w-3 mr-1" />플릿 ({filteredFleet.length})</TabsTrigger>
                        <TabsTrigger value="ship" className="text-xs"><ShipIcon className="h-3 w-3 mr-1" />선박 ({filteredShip.length})</TabsTrigger>
                      </TabsList>

                      {/* 전체 */}
                      <TabsContent value="all" className="mt-3">
                        {totalCount === 0 ? (
                          <div className="text-center py-8 text-sm text-gray-500">할당된 템플릿이 없습니다.</div>
                        ) : (
                          <div className="space-y-4">
                            {filteredOwner.length > 0 && (
                              <div>
                                <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Building2 className="h-3 w-3" />선주 레벨</h3>
                                <div className="rounded-md border">
                                  <Table>
                                    <TableHeader><TableRow>
                                      <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">템플릿</TableHead>
                                      <TableHead className="text-xs">적용 범위</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>{filteredOwner.map(a => (
                                      <TableRow key={`o-${a.id}`}>
                                        <TableCell className="font-medium text-sm">{a.owner_name}</TableCell>
                                        <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
                                        <TableCell className="text-xs text-gray-600">{a.fleet_count}개 플릿 · {a.ship_count}척</TableCell>
                                        <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                        <TableCell>{unassignBtn(() => handleUnassignOwner(String(a.owner_id), String(a.template_id)))}</TableCell>
                                      </TableRow>
                                    ))}</TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                            {filteredFleet.length > 0 && (
                              <div>
                                <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Layers className="h-3 w-3" />플릿 레벨</h3>
                                <div className="rounded-md border">
                                  <Table>
                                    <TableHeader><TableRow>
                                      <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">플릿</TableHead><TableHead className="text-xs">템플릿</TableHead>
                                      <TableHead className="text-xs">소속 선박</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>{filteredFleet.map(a => (
                                      <TableRow key={`f-${a.id}`}>
                                        <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                                        <TableCell className="font-medium text-sm">{a.fleet_name}</TableCell>
                                        <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
                                        <TableCell className="text-xs text-gray-600">{a.ship_count}척</TableCell>
                                        <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                        <TableCell>{unassignBtn(() => handleUnassignFleet(String(a.fleet_id), String(a.template_id)))}</TableCell>
                                      </TableRow>
                                    ))}</TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                            {filteredShip.length > 0 && (
                              <div>
                                <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ShipIcon className="h-3 w-3" />선박 레벨</h3>
                                <div className="rounded-md border">
                                  <Table>
                                    <TableHeader><TableRow>
                                      <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">플릿</TableHead><TableHead className="text-xs">선박</TableHead>
                                      <TableHead className="text-xs">템플릿</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>{filteredShip.map(a => (
                                      <TableRow key={`s-${a.id}`}>
                                        <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                                        <TableCell className="text-sm text-gray-600">{a.fleet_name || '-'}</TableCell>
                                        <TableCell className="font-medium text-sm">{a.ship_name}</TableCell>
                                        <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
                                        <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                        <TableCell>{unassignBtn(() => handleUnassignShip(String(a.ship_id), String(a.template_id)))}</TableCell>
                                      </TableRow>
                                    ))}</TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </TabsContent>

                      {/* 선주 */}
                      <TabsContent value="owner" className="mt-3">
                        {filteredOwner.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">선주 레벨에 할당된 템플릿이 없습니다.</div> : (
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader><TableRow>
                                <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">템플릿</TableHead>
                                <TableHead className="text-xs">적용 범위</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
                              </TableRow></TableHeader>
                              <TableBody>{filteredOwner.map(a => (
                                <TableRow key={`o2-${a.id}`}>
                                  <TableCell className="font-medium text-sm">{a.owner_name}</TableCell>
                                  <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
                                  <TableCell className="text-xs text-gray-600">{a.fleet_count}개 플릿 · {a.ship_count}척</TableCell>
                                  <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                  <TableCell>{unassignBtn(() => handleUnassignOwner(String(a.owner_id), String(a.template_id)))}</TableCell>
                                </TableRow>
                              ))}</TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* 플릿 */}
                      <TabsContent value="fleet" className="mt-3">
                        {filteredFleet.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">플릿 레벨에 할당된 템플릿이 없습니다.</div> : (
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader><TableRow>
                                <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">플릿</TableHead><TableHead className="text-xs">템플릿</TableHead>
                                <TableHead className="text-xs">소속 선박</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
                              </TableRow></TableHeader>
                              <TableBody>{filteredFleet.map(a => (
                                <TableRow key={`f2-${a.id}`}>
                                  <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                                  <TableCell className="font-medium text-sm">{a.fleet_name}</TableCell>
                                  <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
                                  <TableCell className="text-xs text-gray-600">{a.ship_count}척</TableCell>
                                  <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                  <TableCell>{unassignBtn(() => handleUnassignFleet(String(a.fleet_id), String(a.template_id)))}</TableCell>
                                </TableRow>
                              ))}</TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>

                      {/* 선박 */}
                      <TabsContent value="ship" className="mt-3">
                        {filteredShip.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">선박 레벨에 할당된 템플릿이 없습니다.</div> : (
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader><TableRow>
                                <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">플릿</TableHead><TableHead className="text-xs">선박</TableHead>
                                <TableHead className="text-xs">템플릿</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
                              </TableRow></TableHeader>
                              <TableBody>{filteredShip.map(a => (
                                <TableRow key={`s2-${a.id}`}>
                                  <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                                  <TableCell className="text-sm text-gray-600">{a.fleet_name || '-'}</TableCell>
                                  <TableCell className="font-medium text-sm">{a.ship_name}</TableCell>
                                  <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
                                  <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                  <TableCell>{unassignBtn(() => handleUnassignShip(String(a.ship_id), String(a.template_id)))}</TableCell>
                                </TableRow>
                              ))}</TableBody>
                            </Table>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* ── 템플릿별 탭 ── */}
                  <TabsContent value="by-template">
                    {templates.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-500">등록된 템플릿이 없습니다.</div>
                    ) : (
                      <div className="space-y-4">
                        {templates.map(t => {
                          const tOwner = ownerAssignments.filter(a => String(a.template_id) === String(t.id));
                          const tFleet = fleetAssignments.filter(a => String(a.template_id) === String(t.id));
                          const tShip = shipAssignments.filter(a => String(a.template_id) === String(t.id));
                          const tTotal = tOwner.length + tFleet.length + tShip.length;

                          return (
                            <div key={t.id} className="border rounded-lg overflow-hidden">
                              {/* 템플릿 헤더 */}
                              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                                <div className="flex items-center gap-3">
                                  <Badge variant="default" className="text-xs">{t.name}</Badge>
                                  <span className="text-xs text-gray-500">{t.currency}</span>
                                  {t.description && <span className="text-xs text-gray-400">{t.description}</span>}
                                </div>
                                <span className="text-xs text-gray-400">총 {tTotal}건 할당</span>
                              </div>

                              {tTotal === 0 ? (
                                <div className="text-center py-4 text-xs text-gray-400">할당된 대상 없음</div>
                              ) : (
                                <div className="divide-y">
                                  {/* 선주 레벨 */}
                                  {tOwner.length > 0 && (
                                    <div className="px-4 py-3">
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                                        <Building2 className="h-3.5 w-3.5" />선주 레벨 ({tOwner.length})
                                      </div>
                                      <div className="space-y-1.5">
                                        {tOwner.map(a => (
                                          <div key={a.id} className="flex items-center justify-between bg-blue-50 rounded px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <Building2 className="h-3.5 w-3.5 text-blue-500" />
                                              <span className="text-sm font-medium">{a.owner_name}</span>
                                              <span className="text-xs text-gray-500">{a.fleet_count}개 플릿 · {a.ship_count}척</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-400">{formatDate(a.assigned_at)}</span>
                                              {unassignBtn(() => handleUnassignOwner(String(a.owner_id), String(a.template_id)))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* 플릿 레벨 */}
                                  {tFleet.length > 0 && (
                                    <div className="px-4 py-3">
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                                        <Layers className="h-3.5 w-3.5" />플릿 레벨 ({tFleet.length})
                                      </div>
                                      <div className="space-y-1.5">
                                        {tFleet.map(a => (
                                          <div key={a.id} className="flex items-center justify-between bg-green-50 rounded px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <Layers className="h-3.5 w-3.5 text-green-600" />
                                              <span className="text-xs text-gray-400">{a.owner_name}</span>
                                              <span className="text-gray-300">&#8250;</span>
                                              <span className="text-sm font-medium">{a.fleet_name}</span>
                                              <span className="text-xs text-gray-500">{a.ship_count}척</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-400">{formatDate(a.assigned_at)}</span>
                                              {unassignBtn(() => handleUnassignFleet(String(a.fleet_id), String(a.template_id)))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* 선박 레벨 */}
                                  {tShip.length > 0 && (
                                    <div className="px-4 py-3">
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                                        <ShipIcon className="h-3.5 w-3.5" />선박 레벨 ({tShip.length})
                                      </div>
                                      <div className="space-y-1.5">
                                        {tShip.map(a => (
                                          <div key={a.id} className="flex items-center justify-between bg-orange-50 rounded px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <ShipIcon className="h-3.5 w-3.5 text-orange-500" />
                                              <span className="text-xs text-gray-400">{a.owner_name}</span>
                                              {a.fleet_name && <><span className="text-gray-300">&#8250;</span><span className="text-xs text-gray-400">{a.fleet_name}</span></>}
                                              <span className="text-gray-300">&#8250;</span>
                                              <span className="text-sm font-medium">{a.ship_name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-400">{formatDate(a.assigned_at)}</span>
                                              {unassignBtn(() => handleUnassignShip(String(a.ship_id), String(a.template_id)))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
