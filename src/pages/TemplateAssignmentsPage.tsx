import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Filter, Building2, Layers, Ship as ShipIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser, getShips, getFleets, getCompanies } from '@/lib/store';
import type { Ship, Fleet, Company } from '@/types/models';
import Layout from '@/components/Layout';
import {
  getSalaryTemplates,
  getShipSalaryAssignments,
  getFleetSalaryAssignments,
  getOwnerSalaryAssignments,
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

export default function TemplateAssignmentsPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [ownerAssignments, setOwnerAssignments] = useState<OwnerAssignmentRow[]>([]);
  const [fleetAssignments, setFleetAssignments] = useState<FleetAssignmentRow[]>([]);
  const [shipAssignments, setShipAssignments] = useState<ShipAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('all');

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/login');
        return;
      }
      loadData();
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        templatesData,
        shipsData,
        fleetsData,
        companiesData,
        shipAssignmentsData,
        fleetAssignmentsData,
        ownerAssignmentsData,
      ] = await Promise.all([
        getSalaryTemplates(),
        getShips(),
        getFleets(),
        getCompanies(),
        getShipSalaryAssignments(),
        getFleetSalaryAssignments(),
        getOwnerSalaryAssignments(),
      ]);

      setTemplates(templatesData);

      const ownerCompanies = companiesData.filter((c: Company) => c.type === 'owner');

      // Build lookup maps
      const fleetMap = new Map<string, Fleet>();
      for (const f of fleetsData) {
        fleetMap.set(String(f.id), f);
      }

      const ownerMap = new Map<string, string>();
      for (const o of ownerCompanies) {
        ownerMap.set(String(o.id), o.name);
      }

      const shipMap = new Map<string, Ship>();
      for (const s of shipsData) {
        shipMap.set(String(s.id), s);
      }

      const templateMap = new Map<string, string>();
      for (const t of templatesData) {
        templateMap.set(String(t.id), t.name);
      }

      // Count fleets and ships per owner
      const fleetsPerOwner = new Map<string, number>();
      const shipsPerOwner = new Map<string, number>();
      for (const f of fleetsData) {
        const oid = String(f.owner_id);
        fleetsPerOwner.set(oid, (fleetsPerOwner.get(oid) || 0) + 1);
      }
      for (const s of shipsData) {
        const oid = String(s.owner_id);
        shipsPerOwner.set(oid, (shipsPerOwner.get(oid) || 0) + 1);
      }

      // Count ships per fleet
      const shipsPerFleet = new Map<string, number>();
      for (const s of shipsData) {
        if (s.fleet_id) {
          const fid = String(s.fleet_id);
          shipsPerFleet.set(fid, (shipsPerFleet.get(fid) || 0) + 1);
        }
      }

      // Enrich owner assignments
      const enrichedOwnerAssignments: OwnerAssignmentRow[] = ownerAssignmentsData.map((a: OwnerSalaryAssignment) => ({
        ...a,
        owner_name: ownerMap.get(String(a.owner_id)) || String(a.owner_id),
        template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
        fleet_count: fleetsPerOwner.get(String(a.owner_id)) || 0,
        ship_count: shipsPerOwner.get(String(a.owner_id)) || 0,
      }));
      enrichedOwnerAssignments.sort((a, b) => a.owner_name.localeCompare(b.owner_name, 'ko-KR'));

      // Enrich fleet assignments
      const enrichedFleetAssignments: FleetAssignmentRow[] = fleetAssignmentsData.map((a: FleetSalaryAssignment) => {
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
      enrichedFleetAssignments.sort((a, b) => {
        const ownerCmp = a.owner_name.localeCompare(b.owner_name, 'ko-KR');
        if (ownerCmp !== 0) return ownerCmp;
        return a.fleet_name.localeCompare(b.fleet_name, 'ko-KR');
      });

      // Enrich ship assignments
      const enrichedShipAssignments: ShipAssignmentRow[] = shipAssignmentsData.map((a: ShipSalaryAssignment) => {
        const ship = shipMap.get(String(a.ship_id));
        const fleet = ship?.fleet_id ? fleetMap.get(String(ship.fleet_id)) : null;
        const ownerId = fleet?.owner_id || ship?.owner_id;
        const ownerName = ownerId ? ownerMap.get(String(ownerId)) || '-' : '-';
        return {
          ...a,
          ship_name: ship?.name || String(a.ship_id),
          fleet_name: fleet?.name || null,
          owner_name: ownerName,
          template_name: templateMap.get(String(a.template_id)) || String(a.template_id),
        };
      });
      enrichedShipAssignments.sort((a, b) => {
        const ownerCmp = a.owner_name.localeCompare(b.owner_name, 'ko-KR');
        if (ownerCmp !== 0) return ownerCmp;
        const fleetA = a.fleet_name || '';
        const fleetB = b.fleet_name || '';
        const fleetCmp = fleetA.localeCompare(fleetB, 'ko-KR');
        if (fleetCmp !== 0) return fleetCmp;
        return a.ship_name.localeCompare(b.ship_name, 'ko-KR');
      });

      setOwnerAssignments(enrichedOwnerAssignments);
      setFleetAssignments(enrichedFleetAssignments);
      setShipAssignments(enrichedShipAssignments);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassignOwner = async (ownerId: string, templateId: string) => {
    if (!confirm('이 선주에서 템플릿 할당을 해제하시겠습니까?')) return;
    const success = await unassignTemplateFromOwner(ownerId, templateId);
    if (success) {
      await loadData();
    } else {
      alert('템플릿 할당 해제에 실패했습니다.');
    }
  };

  const handleUnassignFleet = async (fleetId: string, templateId: string) => {
    if (!confirm('이 플릿에서 템플릿 할당을 해제하시겠습니까?')) return;
    const success = await unassignTemplateFromFleet(fleetId, templateId);
    if (success) {
      await loadData();
    } else {
      alert('템플릿 할당 해제에 실패했습니다.');
    }
  };

  const handleUnassignShip = async (shipId: string, templateId: string) => {
    if (!confirm('이 선박에서 템플릿 할당을 해제하시겠습니까?')) return;
    const success = await unassignTemplateFromShip(shipId, templateId);
    if (success) {
      await loadData();
    } else {
      alert('템플릿 할당 해제에 실패했습니다.');
    }
  };

  // Filter by template
  const filteredOwner = selectedTemplate === 'all'
    ? ownerAssignments
    : ownerAssignments.filter(a => String(a.template_id) === selectedTemplate);

  const filteredFleet = selectedTemplate === 'all'
    ? fleetAssignments
    : fleetAssignments.filter(a => String(a.template_id) === selectedTemplate);

  const filteredShip = selectedTemplate === 'all'
    ? shipAssignments
    : shipAssignments.filter(a => String(a.template_id) === selectedTemplate);

  const totalCount = filteredOwner.length + filteredFleet.length + filteredShip.length;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
                <p className="text-xs text-gray-600 mt-1">
                  선주, 플릿, 선박에 할당된 급여 템플릿을 확인하고 관리하세요 (총 {totalCount}건)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="w-56 h-8 text-sm">
                    <SelectValue placeholder="템플릿 필터" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">모든 템플릿</SelectItem>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={String(template.id)} className="text-sm">
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-9">
                <TabsTrigger value="all" className="text-xs">
                  전체 ({totalCount})
                </TabsTrigger>
                <TabsTrigger value="owner" className="text-xs">
                  <Building2 className="h-3 w-3 mr-1" />
                  선주 ({filteredOwner.length})
                </TabsTrigger>
                <TabsTrigger value="fleet" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" />
                  플릿 ({filteredFleet.length})
                </TabsTrigger>
                <TabsTrigger value="ship" className="text-xs">
                  <ShipIcon className="h-3 w-3 mr-1" />
                  선박 ({filteredShip.length})
                </TabsTrigger>
              </TabsList>

              {/* All Tab */}
              <TabsContent value="all" className="mt-3">
                {totalCount === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    할당된 템플릿이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredOwner.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> 선주 레벨 할당
                        </h3>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">선주</TableHead>
                                <TableHead className="text-xs">템플릿</TableHead>
                                <TableHead className="text-xs">적용 범위</TableHead>
                                <TableHead className="text-xs">할당 일시</TableHead>
                                <TableHead className="text-xs w-20">작업</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredOwner.map((a) => (
                                <TableRow key={`owner-${a.id}`}>
                                  <TableCell className="font-medium text-sm">{a.owner_name}</TableCell>
                                  <TableCell>
                                    <Badge variant="default" className="text-xs">{a.template_name}</Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-600">
                                    {a.fleet_count}개 플릿, {a.ship_count}척 선박
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleUnassignOwner(String(a.owner_id), String(a.template_id))}
                                      className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span className="text-xs">해제</span>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {filteredFleet.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <Layers className="h-3 w-3" /> 플릿 레벨 할당
                        </h3>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">선주</TableHead>
                                <TableHead className="text-xs">플릿</TableHead>
                                <TableHead className="text-xs">템플릿</TableHead>
                                <TableHead className="text-xs">소속 선박</TableHead>
                                <TableHead className="text-xs">할당 일시</TableHead>
                                <TableHead className="text-xs w-20">작업</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredFleet.map((a) => (
                                <TableRow key={`fleet-${a.id}`}>
                                  <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                                  <TableCell className="font-medium text-sm">{a.fleet_name}</TableCell>
                                  <TableCell>
                                    <Badge variant="default" className="text-xs">{a.template_name}</Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-600">{a.ship_count}척</TableCell>
                                  <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleUnassignFleet(String(a.fleet_id), String(a.template_id))}
                                      className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span className="text-xs">해제</span>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {filteredShip.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                          <ShipIcon className="h-3 w-3" /> 선박 레벨 할당
                        </h3>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">선주</TableHead>
                                <TableHead className="text-xs">플릿</TableHead>
                                <TableHead className="text-xs">선박</TableHead>
                                <TableHead className="text-xs">템플릿</TableHead>
                                <TableHead className="text-xs">할당 일시</TableHead>
                                <TableHead className="text-xs w-20">작업</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredShip.map((a) => (
                                <TableRow key={`ship-${a.id}`}>
                                  <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                                  <TableCell className="text-sm text-gray-600">{a.fleet_name || '-'}</TableCell>
                                  <TableCell className="font-medium text-sm">{a.ship_name}</TableCell>
                                  <TableCell>
                                    <Badge variant="default" className="text-xs">{a.template_name}</Badge>
                                  </TableCell>
                                  <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleUnassignShip(String(a.ship_id), String(a.template_id))}
                                      className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span className="text-xs">해제</span>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Owner Tab */}
              <TabsContent value="owner" className="mt-3">
                {filteredOwner.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    선주 레벨에 할당된 템플릿이 없습니다.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">선주</TableHead>
                          <TableHead className="text-xs">템플릿</TableHead>
                          <TableHead className="text-xs">적용 범위</TableHead>
                          <TableHead className="text-xs">할당 일시</TableHead>
                          <TableHead className="text-xs w-20">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOwner.map((a) => (
                          <TableRow key={`owner-${a.id}`}>
                            <TableCell className="font-medium text-sm">{a.owner_name}</TableCell>
                            <TableCell>
                              <Badge variant="default" className="text-xs">{a.template_name}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-600">
                              {a.fleet_count}개 플릿, {a.ship_count}척 선박
                            </TableCell>
                            <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUnassignOwner(String(a.owner_id), String(a.template_id))}
                                className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">해제</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Fleet Tab */}
              <TabsContent value="fleet" className="mt-3">
                {filteredFleet.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    플릿 레벨에 할당된 템플릿이 없습니다.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">선주</TableHead>
                          <TableHead className="text-xs">플릿</TableHead>
                          <TableHead className="text-xs">템플릿</TableHead>
                          <TableHead className="text-xs">소속 선박</TableHead>
                          <TableHead className="text-xs">할당 일시</TableHead>
                          <TableHead className="text-xs w-20">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFleet.map((a) => (
                          <TableRow key={`fleet-${a.id}`}>
                            <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                            <TableCell className="font-medium text-sm">{a.fleet_name}</TableCell>
                            <TableCell>
                              <Badge variant="default" className="text-xs">{a.template_name}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-600">{a.ship_count}척</TableCell>
                            <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUnassignFleet(String(a.fleet_id), String(a.template_id))}
                                className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">해제</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Ship Tab */}
              <TabsContent value="ship" className="mt-3">
                {filteredShip.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    선박 레벨에 할당된 템플릿이 없습니다.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">선주</TableHead>
                          <TableHead className="text-xs">플릿</TableHead>
                          <TableHead className="text-xs">선박</TableHead>
                          <TableHead className="text-xs">템플릿</TableHead>
                          <TableHead className="text-xs">할당 일시</TableHead>
                          <TableHead className="text-xs w-20">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredShip.map((a) => (
                          <TableRow key={`ship-${a.id}`}>
                            <TableCell className="text-sm text-gray-600">{a.owner_name}</TableCell>
                            <TableCell className="text-sm text-gray-600">{a.fleet_name || '-'}</TableCell>
                            <TableCell className="font-medium text-sm">{a.ship_name}</TableCell>
                            <TableCell>
                              <Badge variant="default" className="text-xs">{a.template_name}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-600">{formatDate(a.assigned_at)}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUnassignShip(String(a.ship_id), String(a.template_id))}
                                className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">해제</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}