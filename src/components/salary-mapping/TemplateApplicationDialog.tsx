import { useState, useEffect } from 'react';
import { msg as messages } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentUser } from '@/lib/store';
import { CheckCircle2, Building2, Layers, Ship as ShipIcon, Info, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  assignTemplateToOwner,
  assignTemplateToFleet,
  assignTemplateToShip,
  getOwnerSalaryAssignments,
  getFleetSalaryAssignments,
  getShipSalaryAssignments,
  cleanupLowerLevelAssignments,
} from '@/lib/salary-store';
import { supabase } from '@/lib/supabase';
import type { Company, Fleet, Ship } from '@/types/models';

interface EnrichedFleet extends Fleet {
  owner_name?: string;
}

interface EnrichedShip extends Ship {
  fleet_name?: string;
  owner_name?: string;
}

interface TemplateApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
  onSuccess?: () => void;
}

export default function TemplateApplicationDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  onSuccess,
}: TemplateApplicationDialogProps) {
  const [owners, setOwners] = useState<Company[]>([]);
  const [allFleets, setAllFleets] = useState<EnrichedFleet[]>([]);
  const [allShips, setAllShips] = useState<EnrichedShip[]>([]);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [selectedFleetId, setSelectedFleetId] = useState<string>('');
  const [selectedShipId, setSelectedShipId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Existing assignments for this template (template-specific)
  const [existingOwnerIds, setExistingOwnerIds] = useState<Set<string>>(new Set());
  const [existingFleetIds, setExistingFleetIds] = useState<Set<string>>(new Set());
  const [existingShipIds, setExistingShipIds] = useState<Set<string>>(new Set());

  // All existing assignments across ALL templates (for global duplicate check)
  const [allOwnerAssignmentMap, setAllOwnerAssignmentMap] = useState<Map<string, string>>(new Map());
  const [allFleetAssignmentMap, setAllFleetAssignmentMap] = useState<Map<string, string>>(new Map());
  const [allShipAssignmentMap, setAllShipAssignmentMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (open) {
      loadData();
      setSelectedOwnerId('');
      setSelectedFleetId('');
      setSelectedShipId('');
      setSuccessMessage('');
    }
  }, [open]);

  // Reset fleet/ship when owner changes
  useEffect(() => {
    setSelectedFleetId('');
    setSelectedShipId('');
  }, [selectedOwnerId]);

  // Reset ship when fleet changes
  useEffect(() => {
    setSelectedShipId('');
  }, [selectedFleetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ownersRes, fleetsRes, shipsRes, ownerAssignments, fleetAssignments, shipAssignments] = await Promise.all([
        supabase.from('companies').select('*').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('*').order('name'),
        supabase.from('ships').select('*').order('name'),
        getOwnerSalaryAssignments(),
        getFleetSalaryAssignments(),
        getShipSalaryAssignments(),
      ]);

      // Also fetch all templates for name lookup
      const { data: templatesData } = await supabase.from('salary_templates').select('id, name');
      const templateNameMap = new Map<string, string>();
      (templatesData || []).forEach((t: { id: number | string; name: string }) => {
        templateNameMap.set(String(t.id), t.name);
      });

      const ownersData: Company[] = ownersRes.data || [];
      const fleetsData: Fleet[] = fleetsRes.data || [];
      const shipsData: Ship[] = shipsRes.data || [];

      // Build lookup maps
      const ownerMap = new Map<string, string>();
      for (const o of ownersData) {
        ownerMap.set(String(o.id), o.name);
      }

      const fleetMap = new Map<string, Fleet>();
      for (const f of fleetsData) {
        fleetMap.set(String(f.id), f);
      }

      // Enrich fleets
      const enrichedFleets: EnrichedFleet[] = fleetsData.map(f => ({
        ...f,
        owner_name: f.owner_id ? ownerMap.get(String(f.owner_id)) || '' : '',
      }));

      // Enrich ships
      const enrichedShips: EnrichedShip[] = shipsData.map(s => {
        const fleet = s.fleet_id ? fleetMap.get(String(s.fleet_id)) : null;
        return {
          ...s,
          fleet_name: fleet?.name || '',
          owner_name: s.owner_id ? ownerMap.get(String(s.owner_id)) || '' : '',
        };
      });

      setOwners(ownersData);
      setAllFleets(enrichedFleets);
      setAllShips(enrichedShips);

      // Set existing assignments for THIS template
      setExistingOwnerIds(new Set(
        ownerAssignments.filter(a => String(a.template_id) === String(templateId)).map(a => String(a.owner_id))
      ));
      setExistingFleetIds(new Set(
        fleetAssignments.filter(a => String(a.template_id) === String(templateId)).map(a => String(a.fleet_id))
      ));
      setExistingShipIds(new Set(
        shipAssignments.filter(a => String(a.template_id) === String(templateId)).map(a => String(a.ship_id))
      ));

      // Build global assignment maps (entity_id -> template_name) for ALL templates
      const ownerAMap = new Map<string, string>();
      ownerAssignments.forEach(a => {
        ownerAMap.set(String(a.owner_id), templateNameMap.get(String(a.template_id)) || String(a.template_id));
      });
      setAllOwnerAssignmentMap(ownerAMap);

      const fleetAMap = new Map<string, string>();
      fleetAssignments.forEach(a => {
        fleetAMap.set(String(a.fleet_id), templateNameMap.get(String(a.template_id)) || String(a.template_id));
      });
      setAllFleetAssignmentMap(fleetAMap);

      const shipAMap = new Map<string, string>();
      shipAssignments.forEach(a => {
        shipAMap.set(String(a.ship_id), templateNameMap.get(String(a.template_id)) || String(a.template_id));
      });
      setAllShipAssignmentMap(shipAMap);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtered fleets for selected owner
  const ownerFleets = allFleets.filter(f => String(f.owner_id) === selectedOwnerId);

  // Get all ships belonging to a specific owner (through fleet or direct owner_id)
  const getOwnerShips = (): EnrichedShip[] => {
    if (!selectedOwnerId) return [];
    return allShips.filter(s => {
      if (s.fleet_id) {
        const fleet = allFleets.find(f => String(f.id) === String(s.fleet_id));
        if (fleet && String(fleet.owner_id) === selectedOwnerId) return true;
      }
      if (String(s.owner_id) === selectedOwnerId) return true;
      return false;
    });
  };

  // Filtered ships for selected fleet
  const getFleetShips = (): EnrichedShip[] => {
    if (!selectedFleetId) return [];
    return allShips.filter(s => String(s.fleet_id) === selectedFleetId);
  };

  // Available ships depends on whether fleet is selected
  const availableShips = selectedFleetId ? getFleetShips() : getOwnerShips();

  // Check if the current selection is already assigned (to any template)
  const isDuplicateAssignment = (): { isDuplicate: boolean; existingTemplateName: string } => {
    if (!selectedOwnerId) return { isDuplicate: false, existingTemplateName: '' };

    if (selectedShipId) {
      const existing = allShipAssignmentMap.get(selectedShipId);
      if (existing) return { isDuplicate: true, existingTemplateName: existing };
    } else if (selectedFleetId) {
      const existing = allFleetAssignmentMap.get(selectedFleetId);
      if (existing) return { isDuplicate: true, existingTemplateName: existing };
    } else {
      const existing = allOwnerAssignmentMap.get(selectedOwnerId);
      if (existing) return { isDuplicate: true, existingTemplateName: existing };
    }

    return { isDuplicate: false, existingTemplateName: '' };
  };

  const duplicateCheck = isDuplicateAssignment();

  // Check if lower-level assignments exist that will be cleaned up
  const getLowerLevelCleanupInfo = (): { hasLowerAssignments: boolean; details: string[] } => {
    const details: string[] = [];

    if (selectedShipId || !selectedOwnerId) {
      return { hasLowerAssignments: false, details };
    }

    if (selectedFleetId) {
      // Fleet assignment: check if any ships in this fleet have assignments
      const fleetShips = getFleetShips();
      const assignedShips = fleetShips.filter(s => allShipAssignmentMap.has(String(s.id)));
      if (assignedShips.length > 0) {
        const shipNames = assignedShips.map(s => {
          const tmplName = allShipAssignmentMap.get(String(s.id)) || '';
          return `${s.name} (${tmplName})`;
        });
        details.push(messages.salaryTemplate.shipAutoRelease(assignedShips.length, shipNames.join(', ')));
      }
    } else {
      // Owner assignment: check fleets and ships under this owner
      const ownerFleetsList = allFleets.filter(f => String(f.owner_id) === selectedOwnerId);
      const assignedFleets = ownerFleetsList.filter(f => allFleetAssignmentMap.has(String(f.id)));
      if (assignedFleets.length > 0) {
        const fleetNames = assignedFleets.map(f => {
          const tmplName = allFleetAssignmentMap.get(String(f.id)) || '';
          return `${f.name} (${tmplName})`;
        });
        details.push(messages.salaryTemplate.fleetAutoRelease(assignedFleets.length, fleetNames.join(', ')));
      }

      const ownerShips = getOwnerShips();
      const assignedShips = ownerShips.filter(s => allShipAssignmentMap.has(String(s.id)));
      if (assignedShips.length > 0) {
        const shipNames = assignedShips.map(s => {
          const tmplName = allShipAssignmentMap.get(String(s.id)) || '';
          return `${s.name} (${tmplName})`;
        });
        details.push(messages.salaryTemplate.shipAutoRelease(assignedShips.length, shipNames.join(', ')));
      }
    }

    return { hasLowerAssignments: details.length > 0, details };
  };

  const cleanupInfo = getLowerLevelCleanupInfo();

  // Get description of what will be assigned
  const getAssignmentDescription = () => {
    if (!selectedOwnerId) return null;

    const owner = owners.find(o => String(o.id) === selectedOwnerId);
    const ownerName = owner?.name || '';

    if (selectedShipId) {
      const ship = allShips.find(s => String(s.id) === selectedShipId);
      return {
        level: 'ship' as const,
        icon: <ShipIcon className="h-4 w-4" />,
        title: '선박 할당',
        description: `"${ship?.name}" 선박에만 템플릿이 할당됩니다.`,
      };
    }

    if (selectedFleetId) {
      const fleet = allFleets.find(f => String(f.id) === selectedFleetId);
      const fleetShips = getFleetShips();
      return {
        level: 'fleet' as const,
        icon: <Layers className="h-4 w-4" />,
        title: '플릿 할당',
        description: messages.salaryTemplate.assignedToOwnerFleet(ownerName, fleet?.name || '', fleetShips.length),
      };
    }

    // Owner level
    const ownerShips = getOwnerShips();
    const ownerFleetCount = ownerFleets.length;

    return {
      level: 'owner' as const,
      icon: <Building2 className="h-4 w-4" />,
      title: '선주 할당',
      description: messages.salaryTemplate.assignedToOwner(ownerName, ownerFleetCount, ownerShips.length),
    };
  };

  const assignmentInfo = getAssignmentDescription();

  const handleSubmit = async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    if (!selectedOwnerId) {
      alert('선주를 선택해주세요.');
      return;
    }

    // Block duplicate assignment
    if (duplicateCheck.isDuplicate) {
      alert(messages.salaryTemplate.duplicateTemplate(duplicateCheck.existingTemplateName || ''));
      return;
    }

    setSubmitting(true);
    try {
      let result = null;

      if (selectedShipId) {
        // Ship-level assignment: no cleanup needed
        result = await assignTemplateToShip(selectedShipId, templateId);
      } else if (selectedFleetId) {
        // Fleet-level assignment: cleanup ship-level assignments for ships in this fleet
        const cleanup = await cleanupLowerLevelAssignments('fleet', selectedFleetId);
        if (cleanup.removedShips > 0) {
          console.log(`Cleaned up ${cleanup.removedShips} ship-level assignments for fleet ${selectedFleetId}`);
        }
        result = await assignTemplateToFleet(selectedFleetId, templateId);
      } else {
        // Owner-level assignment: cleanup fleet and ship-level assignments for this owner
        const cleanup = await cleanupLowerLevelAssignments('owner', selectedOwnerId);
        if (cleanup.removedFleets > 0 || cleanup.removedShips > 0) {
          console.log(`Cleaned up ${cleanup.removedFleets} fleet and ${cleanup.removedShips} ship-level assignments for owner ${selectedOwnerId}`);
        }
        result = await assignTemplateToOwner(selectedOwnerId, templateId);
      }

      if (result) {
        const levelText = selectedShipId ? '선박' : selectedFleetId ? '플릿' : '선주';
        let successMsg = messages.salaryTemplate.assignSuccess(levelText);
        if (cleanupInfo.hasLowerAssignments) {
          successMsg += ` (하위 레벨 할당이 자동 해제되었습니다)`;
        }
        setSuccessMessage(successMsg);

        // Reload existing assignments
        await loadData();

        // Reset selections for next assignment
        setSelectedOwnerId('');
        setSelectedFleetId('');
        setSelectedShipId('');

        onSuccess?.();
      } else {
        alert('템플릿 할당에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('템플릿 할당 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">템플릿 할당: {templateName}</DialogTitle>
          <DialogDescription className="text-sm">
            선주를 선택한 후, 필요에 따라 플릿이나 선박을 추가 선택하세요. 할당은 계속 추가할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-gray-500">데이터 로딩 중...</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Info Box */}
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-800">
                <div className="space-y-1">
                  <div><strong>선주만 선택</strong> → 해당 선주의 모든 플릿, 모든 선박에 할당 (하위 레벨 할당 자동 해제)</div>
                  <div><strong>선주 + 플릿 선택</strong> → 해당 플릿의 모든 선박에 할당 (소속 선박 할당 자동 해제)</div>
                  <div><strong>선주 + 플릿 + 선박 선택</strong> → 해당 선박에만 할당</div>
                </div>
              </AlertDescription>
            </Alert>

            {successMessage && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-sm text-green-800">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* Step 1: Select Owner */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">선주 선택 *</Label>
              <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="선주를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map(owner => {
                    const assignedTemplate = allOwnerAssignmentMap.get(String(owner.id));
                    return (
                      <SelectItem key={owner.id} value={String(owner.id)}>
                        <div className="flex items-center gap-2">
                          <span>{owner.name}</span>
                          {assignedTemplate && (
                            <span className="text-xs text-green-600 font-medium">({assignedTemplate})</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Select Fleet (optional) */}
            {selectedOwnerId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  플릿 선택 <span className="text-gray-400 font-normal">(선택사항 - 미선택시 선주 전체 할당)</span>
                </Label>
                {ownerFleets.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">해당 선주에 등록된 플릿이 없습니다.</p>
                ) : (
                  <Select
                    value={selectedFleetId || 'none'}
                    onValueChange={(val) => setSelectedFleetId(val === 'none' ? '' : val)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="플릿 선택 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함 (선주 전체)</SelectItem>
                      {ownerFleets.map(fleet => {
                        const assignedTemplate = allFleetAssignmentMap.get(String(fleet.id));
                        return (
                          <SelectItem key={fleet.id} value={String(fleet.id)}>
                            <div className="flex items-center gap-2">
                              <span>{fleet.name}</span>
                              {assignedTemplate && (
                                <span className="text-xs text-green-600 font-medium">({assignedTemplate})</span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Step 3: Select Ship (optional) */}
            {selectedOwnerId && selectedFleetId && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  선박 선택 <span className="text-gray-400 font-normal">(선택사항 - 미선택시 플릿 전체 할당)</span>
                </Label>
                {availableShips.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">해당 플릿에 등록된 선박이 없습니다.</p>
                ) : (
                  <Select
                    value={selectedShipId || 'none'}
                    onValueChange={(val) => setSelectedShipId(val === 'none' ? '' : val)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="선박 선택 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함 (플릿 전체)</SelectItem>
                      {availableShips.map(ship => {
                        const assignedTemplate = allShipAssignmentMap.get(String(ship.id));
                        return (
                          <SelectItem key={ship.id} value={String(ship.id)}>
                            <div className="flex items-center gap-2">
                              <span>{ship.name}</span>
                              {assignedTemplate && (
                                <span className="text-xs text-green-600 font-medium">({assignedTemplate})</span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Assignment Preview */}
            {assignmentInfo && (
              <Alert className={duplicateCheck.isDuplicate ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}>
                <div className="flex items-start gap-2">
                  {duplicateCheck.isDuplicate ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> : assignmentInfo.icon}
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">{assignmentInfo.title}</div>
                    <div className="text-xs text-gray-600">{assignmentInfo.description}</div>
                    {duplicateCheck.isDuplicate && (
                      <div className="text-xs text-yellow-700 mt-1 font-medium">
                        ⚠️ 이미 &quot;{duplicateCheck.existingTemplateName}&quot; 템플릿이 할당되어 있습니다. 기존 할당을 해제한 후 다시 시도해주세요.
                      </div>
                    )}
                  </div>
                </div>
              </Alert>
            )}

            {/* Lower-level cleanup warning */}
            {cleanupInfo.hasLowerAssignments && !duplicateCheck.isDuplicate && (
              <Alert className="bg-orange-50 border-orange-200">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-xs text-orange-800">
                  <div className="font-semibold mb-1">⚠️ 하위 레벨 할당 자동 해제 안내</div>
                  <div className="space-y-0.5">
                    {cleanupInfo.details.map((detail, idx) => (
                      <div key={idx}>• {detail}</div>
                    ))}
                  </div>
                  <div className="mt-1 text-orange-700 font-medium">
                    상위 레벨 할당 시 해당 하위 할당은 자동으로 해제됩니다.
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} size="sm">
            닫기
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedOwnerId || duplicateCheck.isDuplicate}
            size="sm"
          >
            {submitting ? '할당 중...' : '할당'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}