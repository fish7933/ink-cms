import { useState, useEffect } from 'react';
import { msg } from '@/lib/messages';
import { Plus, Trash2, Filter, Building2, Layers, Ship as ShipIcon, ArrowLeft, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Label } from '@/components/ui/label';
import { getShips, getFleets, getCompanies } from '@/lib/store';
import type { Ship, Fleet, Company } from '@/types/models';
import {
  getSalaryTemplates,
  getShipSalaryAssignments,
  getFleetSalaryAssignments,
  getOwnerSalaryAssignments,
  getEffectiveTemplateMapForShips,
  assignTemplateToShip,
  assignTemplateToFleet,
  assignTemplateToOwner,
  unassignTemplateFromShip,
  unassignTemplateFromFleet,
  unassignTemplateFromOwner,
  type SalaryTemplate,
  type ShipSalaryAssignment,
  type FleetSalaryAssignment,
  type OwnerSalaryAssignment,
} from '@/lib/salary-store';

interface OwnerAssignmentRow extends OwnerSalaryAssignment {
  owner_name: string;
  template_name: string;
}

interface FleetAssignmentRow extends FleetSalaryAssignment {
  fleet_name: string;
  owner_name: string;
  template_name: string;
}

interface ShipAssignmentRow extends ShipSalaryAssignment {
  ship_name: string;
  fleet_name: string | null;
  owner_name: string;
  template_name: string;
}

type AssignTarget = 'owner' | 'fleet' | 'ship';
const PAGE_SIZE = 20;

interface TemplateAssignmentsSectionProps {
  // 템플릿 목록의 "할당" 버튼에서 넘어올 때, 해당 템플릿이 미리 선택된 채로 할당 폼이 바로 열리도록 함
  prefillTemplateId?: string | null;
  onPrefillConsumed?: () => void;
}

// 급여 템플릿 관리 페이지의 "템플릿 할당" 탭 내용. 선주/플릿/선박에 템플릿을 배정/해제한다.
export default function TemplateAssignmentsSection({ prefillTemplateId, onPrefillConsumed }: TemplateAssignmentsSectionProps) {
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ownerAssignments, setOwnerAssignments] = useState<OwnerAssignmentRow[]>([]);
  const [fleetAssignments, setFleetAssignments] = useState<FleetAssignmentRow[]>([]);
  const [shipAssignments, setShipAssignments] = useState<ShipAssignmentRow[]>([]);
  // 우선순위(선박 > 플릿 > 선주)를 반영해 실제로 이 템플릿이 적용되는 선박들 (템플릿 id -> 선박 목록)
  const [effectiveShipsByTemplate, setEffectiveShipsByTemplate] = useState<Record<string, Ship[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('all');
  const [ownerPage, setOwnerPage] = useState(1);
  const [fleetPage, setFleetPage] = useState(1);
  const [shipPage, setShipPage] = useState(1);
  const [templatePage, setTemplatePage] = useState(1);
  // 템플릿별 탭에서 선주/플릿/선박 레벨 섹션 펼침 상태 ("{templateId}-owner" 등 키로 관리, 기본은 접힘)
  const [expandedLevelSections, setExpandedLevelSections] = useState<Set<string>>(new Set());
  const toggleLevelSection = (key: string) =>
    setExpandedLevelSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Set<string>>(new Set());
  const [selectedFleetIds, setSelectedFleetIds] = useState<Set<string>>(new Set());
  const [selectedShipIds, setSelectedShipIds] = useState<Set<string>>(new Set());

  const [formView, setFormView] = useState<{} | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget>('ship');
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [assignFleetId, setAssignFleetId] = useState('');
  const [assignShipId, setAssignShipId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    window.addEventListener('salary-template-data-changed', loadData);
    return () => window.removeEventListener('salary-template-data-changed', loadData);
  }, []);

  useEffect(() => {
    if (!prefillTemplateId) return;
    setAssignTarget('ship');
    setAssignTemplateId(prefillTemplateId);
    setAssignOwnerId('');
    setAssignFleetId('');
    setAssignShipId('');
    setFormView({});
    onPrefillConsumed?.();
  }, [prefillTemplateId]);

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

      setOwnerAssignments(ownerAssignmentsData.map((a: OwnerSalaryAssignment) => ({
        ...a,
        owner_name: ownerMap.get(String(a.owner_id)) || String(a.owner_id),
        template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
      })));

      setFleetAssignments(fleetAssignmentsData.map((a: FleetSalaryAssignment) => {
        const fleet = fleetMap.get(String(a.fleet_id));
        const ownerId = fleet?.owner_id ? String(fleet.owner_id) : '';
        return {
          ...a,
          fleet_name: fleet?.name || String(a.fleet_id),
          owner_name: ownerId ? ownerMap.get(ownerId) || '-' : '-',
          template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
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

      // 선박 > 플릿 > 선주 우선순위를 반영한, 각 템플릿이 실제로 최종 적용되는 선박 목록
      // (플릿/선주 단위로 배정되면 그 안의 비활성화 선박까지 계산상으로는 딸려오므로, 목록
      // 표시에서는 비활성화 선박을 제외한다 — 지금 선원이 타지 않는 배는 급여 청구 대상이
      // 아니므로 "적용 선박"에 보일 필요가 없음)
      const effectiveMap = await getEffectiveTemplateMapForShips(shipsData);
      const byTemplate: Record<string, Ship[]> = {};
      for (const ship of shipsData) {
        if (ship.is_active === false) continue;
        const tmpl = effectiveMap[ship.id];
        if (!tmpl) continue;
        const key = String(tmpl.id);
        if (!byTemplate[key]) byTemplate[key] = [];
        byTemplate[key].push(ship);
      }
      setEffectiveShipsByTemplate(byTemplate);
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

      const fleetNames = conflictFleets.map(a => ownerFleets.find(f => String(f.id) === String(a.fleet_id))?.name || '').filter(Boolean);
      const shipNames = conflictShips.map(a => ownerShips.find(s => String(s.id) === String(a.ship_id))?.name || '').filter(Boolean);
      if (!window.confirm(msg.salaryTemplate.ownerAssignConfirm(ownerName, templateName, fleetNames, shipNames))) return;
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

      const shipNames = conflictShips.map(a => fleetShips.find(s => String(s.id) === String(a.ship_id))?.name || '').filter(Boolean);
      if (!window.confirm(msg.salaryTemplate.fleetAssignConfirm(fleetName, templateName, shipNames))) return;
      for (const a of conflictShips) await unassignTemplateFromShip(String(a.ship_id), String(a.template_id));
      const existingFleet = await getFleetSalaryAssignments(assignFleetId);
      for (const a of existingFleet) await unassignTemplateFromFleet(String(a.fleet_id), String(a.template_id));
      success = !!(await assignTemplateToFleet(assignFleetId, assignTemplateId));

    } else if (assignTarget === 'ship') {
      if (!assignShipId) { alert('선박을 선택하세요.'); return; }
      const shipName = ships.find(s => String(s.id) === assignShipId)?.name || '';
      if (!window.confirm(msg.salaryTemplate.shipAssignConfirm(shipName, templateName))) return;
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

  const handleBulkUnassignOwner = async () => {
    if (selectedOwnerIds.size === 0) return;
    if (!confirm(`선택한 선주 할당 ${selectedOwnerIds.size}건을 해제하시겠습니까?`)) return;
    const rows = ownerAssignments.filter(a => selectedOwnerIds.has(a.id));
    await Promise.all(rows.map(a => unassignTemplateFromOwner(String(a.owner_id), String(a.template_id))));
    setSelectedOwnerIds(new Set());
    await loadData();
  };

  const handleBulkUnassignFleet = async () => {
    if (selectedFleetIds.size === 0) return;
    if (!confirm(`선택한 플릿 할당 ${selectedFleetIds.size}건을 해제하시겠습니까?`)) return;
    const rows = fleetAssignments.filter(a => selectedFleetIds.has(a.id));
    await Promise.all(rows.map(a => unassignTemplateFromFleet(String(a.fleet_id), String(a.template_id))));
    setSelectedFleetIds(new Set());
    await loadData();
  };

  const handleBulkUnassignShip = async () => {
    if (selectedShipIds.size === 0) return;
    if (!confirm(`선택한 선박 할당 ${selectedShipIds.size}건을 해제하시겠습니까?`)) return;
    const rows = shipAssignments.filter(a => selectedShipIds.has(a.id));
    await Promise.all(rows.map(a => unassignTemplateFromShip(String(a.ship_id), String(a.template_id))));
    setSelectedShipIds(new Set());
    await loadData();
  };

  const filteredOwner = selectedTemplate === 'all' ? ownerAssignments : ownerAssignments.filter(a => String(a.template_id) === selectedTemplate);
  const filteredFleet = selectedTemplate === 'all' ? fleetAssignments : fleetAssignments.filter(a => String(a.template_id) === selectedTemplate);
  const filteredShip = selectedTemplate === 'all' ? shipAssignments : shipAssignments.filter(a => String(a.template_id) === selectedTemplate);
  const totalCount = filteredOwner.length + filteredFleet.length + filteredShip.length;
  const ownerCompanies = companies.filter(c => c.type === 'owner');

  useEffect(() => { setOwnerPage(1); setFleetPage(1); setShipPage(1); }, [selectedTemplate]);
  useEffect(() => { setSelectedOwnerIds(new Set()); }, [ownerPage, selectedTemplate]);
  useEffect(() => { setSelectedFleetIds(new Set()); }, [fleetPage, selectedTemplate]);
  useEffect(() => { setSelectedShipIds(new Set()); }, [shipPage, selectedTemplate]);

  const pageOwner = filteredOwner.slice((ownerPage - 1) * PAGE_SIZE, ownerPage * PAGE_SIZE);
  const pageFleet = filteredFleet.slice((fleetPage - 1) * PAGE_SIZE, fleetPage * PAGE_SIZE);
  const pageShip = filteredShip.slice((shipPage - 1) * PAGE_SIZE, shipPage * PAGE_SIZE);
  const pageTemplates = templates.slice((templatePage - 1) * PAGE_SIZE, templatePage * PAGE_SIZE);

  const renderPager = (total: number, page: number, setPage: (p: number) => void) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div className="flex justify-center py-2">
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
    );
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const unassignBtn = (onClick: () => void) => (
    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onClick(); }} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
      <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">해제</span>
    </Button>
  );

  const ownerEffectiveShips = (a: OwnerAssignmentRow) =>
    (effectiveShipsByTemplate[String(a.template_id)] || []).filter(s => String(s.owner_id) === String(a.owner_id));
  const fleetEffectiveShips = (a: FleetAssignmentRow) =>
    (effectiveShipsByTemplate[String(a.template_id)] || []).filter(s => String(s.fleet_id) === String(a.fleet_id));

  // 특정 범위(선주/플릿 전체)에서 이 템플릿으로 최종 귀결되는 선박만 뽑아 뱃지로 표시 (다른 곳에 더 구체적으로 할당돼 제외된 선박은 자동으로 빠짐)
  // 할당된 선박은 일부만 보여주고 "외 N척"으로 생략하지 않고 전부 보여준다.
  const renderShipBadges = (shipList: Ship[]) => {
    if (shipList.length === 0) return <span className="text-xs text-gray-400">해당 선박 없음</span>;
    return (
      <div className="flex flex-wrap gap-1 max-w-md">
        {shipList.map(s => <Badge key={s.id} variant="outline" className="text-[10px] px-1.5 py-0">{s.name}</Badge>)}
      </div>
    );
  };

  const bulkBar = (count: number, onUnassign: () => void) => count === 0 ? null : (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-blue-50 border-blue-200 px-3 py-2 mb-2">
      <span className="text-xs text-blue-800">{count}건 선택됨</span>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={onUnassign}>
        <Trash2 className="h-3.5 w-3.5 mr-1" />선택 해제
      </Button>
    </div>
  );

  const headerCheckbox = (rows: { id: string }[], selected: Set<string>, setSelected: (s: Set<string>) => void) => (
    <TableHead className="w-8">
      <Checkbox
        checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
        onCheckedChange={checked => setSelected(checked ? new Set(rows.map(r => r.id)) : new Set())}
        disabled={rows.length === 0}
      />
    </TableHead>
  );

  const rowCheckbox = (id: string, selected: Set<string>, setSelected: (s: Set<string>) => void) => (
    <TableCell onClick={e => e.stopPropagation()}>
      <Checkbox
        checked={selected.has(id)}
        onCheckedChange={() => setSelected(new Set(selected.has(id) ? [...selected].filter(x => x !== id) : [...selected, id]))}
      />
    </TableCell>
  );

  const renderOwnerTable = (rows: OwnerAssignmentRow[], keyPrefix: string) => (
    <>
      {bulkBar(selectedOwnerIds.size, handleBulkUnassignOwner)}
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow>
            {headerCheckbox(rows, selectedOwnerIds, setSelectedOwnerIds)}
            <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">템플릿</TableHead>
            <TableHead className="text-xs">적용 범위</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map(a => (
            <TableRow key={`${keyPrefix}-${a.id}`}>
              {rowCheckbox(a.id, selectedOwnerIds, setSelectedOwnerIds)}
              <TableCell className="font-medium text-sm">{a.owner_name}</TableCell>
              <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
              <TableCell>{renderShipBadges(ownerEffectiveShips(a))}</TableCell>
              <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
              <TableCell>{unassignBtn(() => handleUnassignOwner(String(a.owner_id), String(a.template_id)))}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </>
  );

  const renderFleetTable = (rows: FleetAssignmentRow[], keyPrefix: string) => (
    <>
      {bulkBar(selectedFleetIds.size, handleBulkUnassignFleet)}
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow>
            {headerCheckbox(rows, selectedFleetIds, setSelectedFleetIds)}
            <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">플릿</TableHead><TableHead className="text-xs">템플릿</TableHead>
            <TableHead className="text-xs">소속 선박</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map(a => (
            <TableRow key={`${keyPrefix}-${a.id}`}>
              {rowCheckbox(a.id, selectedFleetIds, setSelectedFleetIds)}
              <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
              <TableCell className="font-medium text-sm">{a.fleet_name}</TableCell>
              <TableCell><Badge variant="default" className="text-xs">{a.template_name}</Badge></TableCell>
              <TableCell>{renderShipBadges(fleetEffectiveShips(a))}</TableCell>
              <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
              <TableCell>{unassignBtn(() => handleUnassignFleet(String(a.fleet_id), String(a.template_id)))}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </>
  );

  const renderShipTable = (rows: ShipAssignmentRow[], keyPrefix: string) => (
    <>
      {bulkBar(selectedShipIds.size, handleBulkUnassignShip)}
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow>
            {headerCheckbox(rows, selectedShipIds, setSelectedShipIds)}
            <TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">플릿</TableHead><TableHead className="text-xs">선박</TableHead>
            <TableHead className="text-xs">템플릿</TableHead><TableHead className="text-xs">할당 일시</TableHead><TableHead className="text-xs w-20">작업</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map(a => (
            <TableRow key={`${keyPrefix}-${a.id}`}>
              {rowCheckbox(a.id, selectedShipIds, setSelectedShipIds)}
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
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
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
                            {renderOwnerTable(pageOwner, 'o')}
                            {renderPager(filteredOwner.length, ownerPage, setOwnerPage)}
                          </div>
                        )}
                        {filteredFleet.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Layers className="h-3 w-3" />플릿 레벨</h3>
                            {renderFleetTable(pageFleet, 'f')}
                            {renderPager(filteredFleet.length, fleetPage, setFleetPage)}
                          </div>
                        )}
                        {filteredShip.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ShipIcon className="h-3 w-3" />선박 레벨</h3>
                            {renderShipTable(pageShip, 's')}
                            {renderPager(filteredShip.length, shipPage, setShipPage)}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  {/* 선주 */}
                  <TabsContent value="owner" className="mt-3">
                    {filteredOwner.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">선주 레벨에 할당된 템플릿이 없습니다.</div> : (
                      <>
                        {renderOwnerTable(pageOwner, 'o2')}
                        {renderPager(filteredOwner.length, ownerPage, setOwnerPage)}
                      </>
                    )}
                  </TabsContent>

                  {/* 플릿 */}
                  <TabsContent value="fleet" className="mt-3">
                    {filteredFleet.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">플릿 레벨에 할당된 템플릿이 없습니다.</div> : (
                      <>
                        {renderFleetTable(pageFleet, 'f2')}
                        {renderPager(filteredFleet.length, fleetPage, setFleetPage)}
                      </>
                    )}
                  </TabsContent>

                  {/* 선박 */}
                  <TabsContent value="ship" className="mt-3">
                    {filteredShip.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">선박 레벨에 할당된 템플릿이 없습니다.</div> : (
                      <>
                        {renderShipTable(pageShip, 's2')}
                        {renderPager(filteredShip.length, shipPage, setShipPage)}
                      </>
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
                    {pageTemplates.map(t => {
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

                          {/* 최종 적용 선박: 우선순위(선박 > 플릿 > 선주)를 반영해 이 템플릿이 실제로 적용되는 선박 전체 */}
                          <div className="px-4 py-3 bg-orange-50/40 border-b flex items-start gap-2">
                            <span className="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1 pt-0.5">
                              <ShipIcon className="h-3.5 w-3.5" />최종 적용 선박 ({(effectiveShipsByTemplate[String(t.id)] || []).length})
                            </span>
                            {renderShipBadges(effectiveShipsByTemplate[String(t.id)] || [])}
                          </div>

                          {tTotal === 0 ? (
                            <div className="text-center py-4 text-xs text-gray-400">할당된 대상 없음</div>
                          ) : (
                            <div className="divide-y">
                              {/* 선주 레벨 */}
                              {tOwner.length > 0 && (
                                <div className="px-4 py-3">
                                  <button type="button" onClick={() => toggleLevelSection(`${t.id}-owner`)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2 hover:text-gray-700">
                                    {expandedLevelSections.has(`${t.id}-owner`) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    <Building2 className="h-3.5 w-3.5" />선주 레벨 ({tOwner.length})
                                  </button>
                                  {expandedLevelSections.has(`${t.id}-owner`) && (
                                  <div className="space-y-1.5">
                                    {tOwner.map(a => (
                                      <div key={a.id} className="flex items-center justify-between bg-blue-50 rounded px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <Building2 className="h-3.5 w-3.5 text-blue-500" />
                                          <span className="text-sm font-medium">{a.owner_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {renderShipBadges(ownerEffectiveShips(a))}
                                          <span className="text-xs text-gray-400">{formatDate(a.assigned_at)}</span>
                                          {unassignBtn(() => handleUnassignOwner(String(a.owner_id), String(a.template_id)))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  )}
                                </div>
                              )}
                              {/* 플릿 레벨 */}
                              {tFleet.length > 0 && (
                                <div className="px-4 py-3">
                                  <button type="button" onClick={() => toggleLevelSection(`${t.id}-fleet`)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2 hover:text-gray-700">
                                    {expandedLevelSections.has(`${t.id}-fleet`) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    <Layers className="h-3.5 w-3.5" />플릿 레벨 ({tFleet.length})
                                  </button>
                                  {expandedLevelSections.has(`${t.id}-fleet`) && (
                                  <div className="space-y-1.5">
                                    {tFleet.map(a => (
                                      <div key={a.id} className="flex items-center justify-between bg-green-50 rounded px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <Layers className="h-3.5 w-3.5 text-green-600" />
                                          <span className="text-xs text-gray-400">{a.owner_name}</span>
                                          <span className="text-gray-300">&#8250;</span>
                                          <span className="text-sm font-medium">{a.fleet_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {renderShipBadges(fleetEffectiveShips(a))}
                                          <span className="text-xs text-gray-400">{formatDate(a.assigned_at)}</span>
                                          {unassignBtn(() => handleUnassignFleet(String(a.fleet_id), String(a.template_id)))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  )}
                                </div>
                              )}
                              {/* 선박 레벨 */}
                              {tShip.length > 0 && (
                                <div className="px-4 py-3">
                                  <button type="button" onClick={() => toggleLevelSection(`${t.id}-ship`)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2 hover:text-gray-700">
                                    {expandedLevelSections.has(`${t.id}-ship`) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    <ShipIcon className="h-3.5 w-3.5" />선박 레벨 ({tShip.length})
                                  </button>
                                  {expandedLevelSections.has(`${t.id}-ship`) && (
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
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {renderPager(templates.length, templatePage, setTemplatePage)}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
