import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Filter, Building2, Layers, Ship as ShipIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getCurrentUser, getShips, getFleets, getCompanies } from '@/lib/store';
import type { Ship, Fleet, Company } from '@/types/models';
import Layout from '@/components/Layout';
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

  // 할당 다이얼로그
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget>('ship');
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [assignTargetId, setAssignTargetId] = useState('');

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
      const [
        templatesData, shipsData, fleetsData, companiesData,
        shipAssignmentsData, fleetAssignmentsData, ownerAssignmentsData,
      ] = await Promise.all([
        getSalaryTemplates(), getShips(), getFleets(), getCompanies(),
        getShipSalaryAssignments(), getFleetSalaryAssignments(), getOwnerSalaryAssignments(),
      ]);

      setTemplates(templatesData);
      setShips(shipsData);
      setFleets(fleetsData);
      setCompanies(companiesData);

      const ownerCompanies = companiesData.filter((c: Company) => c.type === 'owner');
      const fleetMap = new Map<string, Fleet>(fleetsData.map(f => [String(f.id), f]));
      const ownerMap = new Map<string, string>(ownerCompanies.map((o: Company) => [String(o.id), o.name]));
      const shipMap = new Map<string, Ship>(shipsData.map(s => [String(s.id), s]));
      const templateMap = new Map<string, string>(templatesData.map(t => [String(t.id), t.name]));

      const fleetsPerOwner = new Map<string, number>();
      const shipsPerOwner = new Map<string, number>();
      const shipsPerFleet = new Map<string, number>();

      for (const f of fleetsData) {
        const oid = String(f.owner_id);
        fleetsPerOwner.set(oid, (fleetsPerOwner.get(oid) || 0) + 1);
      }
      for (const s of shipsData) {
        const oid = String(s.owner_id);
        shipsPerOwner.set(oid, (shipsPerOwner.get(oid) || 0) + 1);
        if (s.fleet_id) {
          const fid = String(s.fleet_id);
          shipsPerFleet.set(fid, (shipsPerFleet.get(fid) || 0) + 1);
        }
      }

      const enrichedOwner: OwnerAssignmentRow[] = ownerAssignmentsData.map((a: OwnerSalaryAssignment) => ({
        ...a,
        owner_name: ownerMap.get(String(a.owner_id)) || String(a.owner_id),
        template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
        fleet_count: fleetsPerOwner.get(String(a.owner_id)) || 0,
        ship_count: shipsPerOwner.get(String(a.owner_id)) || 0,
      }));

      const enrichedFleet: FleetAssignmentRow[] = fleetAssignmentsData.map((a: FleetSalaryAssignment) => {
        const fleet = fleetMap.get(String(a.fleet_id));
        const ownerId = fleet?.owner_id ? String(fleet.owner_id) : '';
        return {
          ...a,
          fleet_name: fleet?.name || String(a.fleet_id),
          owner_name: ownerId ? ownerMap.get(ownerId) || '-' : '-',
          template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
          ship_count: shipsPerFleet.get(String(a.fleet_id)) || 0,
        };
      });

      const enrichedShip: ShipAssignmentRow[] = shipAssignmentsData.map((a: ShipSalaryAssignment) => {
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
      });

      setOwnerAssignments(enrichedOwner);
      setFleetAssignments(enrichedFleet);
      setShipAssignments(enrichedShip);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAssignDialog = () => {
    setAssignTarget('ship');
    setAssignTemplateId(templates[0]?.id || '');
    setAssignTargetId('');
    setAssignDialogOpen(true);
  };

const handleAssign = async () => {
    if (!assignTemplateId || !assignTargetId) { alert('모든 항목을 선택하세요.'); return; }
    let success = false;

    if (assignTarget === 'ship') {
      // 해당 선박의 기존 할당 모두 제거 후 새로 할당
      const existing = await getShipSalaryAssignments(assignTargetId);
      for (const a of existing) {
        await unassignTemplateFromShip(String(a.ship_id), String(a.template_id));
      }
      success = !!(await assignTemplateToShip(assignTargetId, assignTemplateId));
    } else if (assignTarget === 'fleet') {
      // 해당 플릿 소속 선박의 선박 레벨 할당 제거 후 플릿 할당
      const { removedShips } = await cleanupLowerLevelAssignments('fleet', assignTargetId);
      const existing = await getFleetSalaryAssignments(assignTargetId);
      for (const a of existing) {
        await unassignTemplateFromFleet(String(a.fleet_id), String(a.template_id));
      }
      success = !!(await assignTemplateToFleet(assignTargetId, assignTemplateId));
      if (success && removedShips > 0) {
        alert(`선박 레벨 할당 ${removedShips}건이 자동으로 해제되었습니다.`);
      }
    } else if (assignTarget === 'owner') {
      // 해당 선주 소속 플릿/선박 레벨 할당 모두 제거 후 선주 할당
      const { removedShips, removedFleets } = await cleanupLowerLevelAssignments('owner', assignTargetId);
      const existing = await getOwnerSalaryAssignments(assignTargetId);
      for (const a of existing) {
        await unassignTemplateFromOwner(String(a.owner_id), String(a.template_id));
      }
      success = !!(await assignTemplateToOwner(assignTargetId, assignTemplateId));
      if (success && (removedShips > 0 || removedFleets > 0)) {
        alert(`하위 레벨 할당 해제: 플릿 ${removedFleets}건, 선박 ${removedShips}건`);
      }
    }

    if (success) { setAssignDialogOpen(false); await loadData(); }
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
    <Button size="sm" variant="ghost" onClick={onClick} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
      <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">해제</span>
    </Button>
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">템플릿 할당 현황</CardTitle>
                <p className="text-xs text-gray-600 mt-1">선주, 플릿, 선박에 할당된 급여 템플릿을 관리하세요 (총 {totalCount}건)</p>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="템플릿 필터" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">모든 템플릿</SelectItem>
                    {templates.map(t => <SelectItem key={t.id} value={String(t.id)} className="text-sm">{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="gap-1.5 h-8" onClick={openAssignDialog}>
                  <Plus className="h-4 w-4" />템플릿 할당
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-9">
                <TabsTrigger value="all" className="text-xs">전체 ({totalCount})</TabsTrigger>
                <TabsTrigger value="owner" className="text-xs"><Building2 className="h-3 w-3 mr-1" />선주 ({filteredOwner.length})</TabsTrigger>
                <TabsTrigger value="fleet" className="text-xs"><Layers className="h-3 w-3 mr-1" />플릿 ({filteredFleet.length})</TabsTrigger>
                <TabsTrigger value="ship" className="text-xs"><ShipIcon className="h-3 w-3 mr-1" />선박 ({filteredShip.length})</TabsTrigger>
              </TabsList>

              {/* 전체 탭 */}
              <TabsContent value="all" className="mt-3">
                {totalCount === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">할당된 템플릿이 없습니다.</div>
                ) : (
                  <div className="space-y-4">
                    {filteredOwner.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Building2 className="h-3 w-3" /> 선주 레벨</h3>
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
                                <TableCell className="text-xs text-gray-600">{a.fleet_count}개 플릿, {a.ship_count}척</TableCell>
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
                        <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Layers className="h-3 w-3" /> 플릿 레벨</h3>
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
                        <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ShipIcon className="h-3 w-3" /> 선박 레벨</h3>
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

              {/* 선주 탭 */}
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
                          <TableCell className="text-xs text-gray-600">{a.fleet_count}개 플릿, {a.ship_count}척</TableCell>
                          <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                          <TableCell>{unassignBtn(() => handleUnassignOwner(String(a.owner_id), String(a.template_id)))}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* 플릿 탭 */}
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

              {/* 선박 탭 */}
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
          </CardContent>
        </Card>

        {/* 할당 다이얼로그 */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">템플릿 할당</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm">할당 대상 레벨</Label>
                <Select value={assignTarget} onValueChange={v => { setAssignTarget(v as AssignTarget); setAssignTargetId(''); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ship" className="text-sm"><div className="flex items-center gap-2"><ShipIcon className="h-3.5 w-3.5" />선박</div></SelectItem>
                    <SelectItem value="fleet" className="text-sm"><div className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" />플릿</div></SelectItem>
                    <SelectItem value="owner" className="text-sm"><div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />선주</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">
                  {assignTarget === 'ship' ? '선박 선택' : assignTarget === 'fleet' ? '플릿 선택' : '선주 선택'}
                </Label>
                <Select value={assignTargetId} onValueChange={setAssignTargetId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택하세요" /></SelectTrigger>
                  <SelectContent>
                    {assignTarget === 'ship' && ships.map(s => (
                      <SelectItem key={s.id} value={String(s.id)} className="text-sm">{s.name}</SelectItem>
                    ))}
                    {assignTarget === 'fleet' && fleets.map(f => (
                      <SelectItem key={f.id} value={String(f.id)} className="text-sm">{f.name}</SelectItem>
                    ))}
                    {assignTarget === 'owner' && ownerCompanies.map(c => (
                      <SelectItem key={c.id} value={String(c.id)} className="text-sm">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">급여 템플릿 선택</Label>
                <Select value={assignTemplateId} onValueChange={setAssignTemplateId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="템플릿 선택" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)} className="text-sm">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setAssignDialogOpen(false)} className="h-8">취소</Button>
              <Button type="button" size="sm" onClick={handleAssign} className="h-8">할당</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}