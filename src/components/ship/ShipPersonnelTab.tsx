import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { User, Users, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User as UserType } from '@/types/models';

interface ShipPersonnelTabProps {
  shipId?: string;
  ownerId?: string;
  fleetId?: string;
  managerId?: string;
}

interface SupervisorInfo {
  id: string;
  name: string;
  email: string;
  assignment_level: 'ship' | 'fleet' | 'owner';
}

export function ShipPersonnelTab({ shipId, ownerId, fleetId, managerId }: ShipPersonnelTabProps) {
  const [ownerContact, setOwnerContact] = useState<UserType | null>(null);
  const [fleetContact, setFleetContact] = useState<UserType | null>(null);
  const [shipManager, setShipManager] = useState<UserType | null>(null);
  const [supervisors, setSupervisors] = useState<SupervisorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPersonnel();
  }, [shipId, ownerId, fleetId, managerId]);

  const loadPersonnel = async () => {
    setLoading(true);
    try {
      // Load ship manager (담당자)
      if (managerId) {
        const { data: manager } = await supabase
          .from('users')
          .select('*')
          .eq('id', managerId)
          .single();
        setShipManager(manager);
      }

      // Load owner contact
      if (ownerId) {
        const { data: owner } = await supabase
          .from('companies')
          .select('manager_id')
          .eq('id', ownerId)
          .single();

        if (owner?.manager_id) {
          const { data: ownerUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', owner.manager_id)
            .single();
          setOwnerContact(ownerUser);
        }
      }

      // Load fleet contact
      if (fleetId) {
        const { data: fleet } = await supabase
          .from('fleets')
          .select('manager_id')
          .eq('id', fleetId)
          .single();

        if (fleet?.manager_id) {
          const { data: fleetUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', fleet.manager_id)
            .single();
          setFleetContact(fleetUser);
        }
      }

      // Load supervisors (감독) - ship managers assigned to this ship
      const supervisorList: SupervisorInfo[] = [];

      // Ship-level supervisors
      if (shipId) {
        const { data: shipAssignments, error: shipError } = await supabase
          .from('supervisor_assignments')
          .select('supervisor_id')
          .eq('ship_id', shipId);

        console.log('Ship-level assignments:', shipAssignments, shipError);

        if (shipAssignments && shipAssignments.length > 0) {
          const supervisorIds = shipAssignments.map(a => a.supervisor_id);
          const { data: supervisorUsers } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', supervisorIds);

          if (supervisorUsers) {
            supervisorUsers.forEach(user => {
              supervisorList.push({
                id: user.id,
                name: user.name || user.email,
                email: user.email,
                assignment_level: 'ship',
              });
            });
          }
        }
      }

      // Fleet-level supervisors
      if (fleetId) {
        const { data: fleetAssignments, error: fleetError } = await supabase
          .from('supervisor_assignments')
          .select('supervisor_id')
          .eq('fleet_id', fleetId);

        console.log('Fleet-level assignments:', fleetAssignments, fleetError);

        if (fleetAssignments && fleetAssignments.length > 0) {
          const supervisorIds = fleetAssignments.map(a => a.supervisor_id);
          const { data: supervisorUsers } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', supervisorIds);

          if (supervisorUsers) {
            supervisorUsers.forEach(user => {
              if (!supervisorList.find(s => s.id === user.id)) {
                supervisorList.push({
                  id: user.id,
                  name: user.name || user.email,
                  email: user.email,
                  assignment_level: 'fleet',
                });
              }
            });
          }
        }
      }

      // Owner-level supervisors
      if (ownerId) {
        const { data: ownerAssignments, error: ownerError } = await supabase
          .from('supervisor_assignments')
          .select('supervisor_id')
          .eq('owner_id', ownerId);

        console.log('Owner-level assignments:', ownerAssignments, ownerError);

        if (ownerAssignments && ownerAssignments.length > 0) {
          const supervisorIds = ownerAssignments.map(a => a.supervisor_id);
          const { data: supervisorUsers } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', supervisorIds);

          if (supervisorUsers) {
            supervisorUsers.forEach(user => {
              if (!supervisorList.find(s => s.id === user.id)) {
                supervisorList.push({
                  id: user.id,
                  name: user.name || user.email,
                  email: user.email,
                  assignment_level: 'owner',
                });
              }
            });
          }
        }
      }

      console.log('Final supervisor list:', supervisorList);
      setSupervisors(supervisorList);
    } catch (error) {
      console.error('Error loading personnel:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentLevelBadge = (level: 'ship' | 'fleet' | 'owner') => {
    const labels = {
      ship: '선박 직접 할당',
      fleet: '선대 할당',
      owner: '선주사 할당',
    };
    const colors = {
      ship: 'bg-blue-100 text-blue-700',
      fleet: 'bg-green-100 text-green-700',
      owner: 'bg-purple-100 text-purple-700',
    };
    return (
      <Badge variant="secondary" className={`text-xs ${colors[level]}`}>
        {labels[level]}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-500">담당자 정보를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ship Manager (담당자) */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-blue-600" />
            <Label className="text-sm font-semibold">선주사 담당자 (Ship Owner Contact)</Label>
          </div>
          {shipManager ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{shipManager.name || shipManager.email}</p>
                  <p className="text-xs text-gray-500">{shipManager.email}</p>
                </div>
                <Badge className="bg-blue-600 text-white text-xs">선박 담당자</Badge>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              {fleetContact ? (
                <div>
                  <p className="text-xs text-gray-400 mb-1">선대 담당자가 자동 적용됩니다</p>
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <p className="text-sm font-medium">{fleetContact.name || fleetContact.email}</p>
                      <p className="text-xs text-gray-500">{fleetContact.email}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">선대 담당자</Badge>
                  </div>
                </div>
              ) : ownerContact ? (
                <div>
                  <p className="text-xs text-gray-400 mb-1">선주사 담당자가 자동 적용됩니다</p>
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <p className="text-sm font-medium">{ownerContact.name || ownerContact.email}</p>
                      <p className="text-xs text-gray-500">{ownerContact.email}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">선주사 담당자</Badge>
                  </div>
                </div>
              ) : (
                '담당자가 지정되지 않았습니다'
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supervisors (감독) */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-green-600" />
            <Label className="text-sm font-semibold">선박관리사 담당자 (Ship Manager Supervisors)</Label>
          </div>
          {supervisors.length > 0 ? (
            <div className="space-y-2">
              {supervisors.map((supervisor) => (
                <div key={supervisor.id} className="flex items-center justify-between p-2 border rounded-md">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{supervisor.name}</p>
                    <p className="text-xs text-gray-500">{supervisor.email}</p>
                  </div>
                  {getAssignmentLevelBadge(supervisor.assignment_level)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-4">
              할당된 선박관리사 감독이 없습니다
              <p className="text-xs text-gray-400 mt-2">
                선박관리사 역할의 사용자를 이 선박, 선대 또는 선주사에 할당하면 여기에 표시됩니다
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owner Contact */}
      {ownerContact && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-purple-600" />
              <Label className="text-sm font-semibold">선주사 대표 연락처</Label>
            </div>
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <p className="text-sm font-medium">{ownerContact.name || ownerContact.email}</p>
                <p className="text-xs text-gray-500">{ownerContact.email}</p>
              </div>
              <Badge variant="outline" className="text-xs">선주사</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information Note */}
      <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-md border border-blue-200">
        <p className="font-medium text-blue-900 mb-1">담당자 구분</p>
        <ul className="list-disc list-inside space-y-1 text-blue-800">
          <li><strong>선주사 담당자:</strong> 선박 소유자 측의 담당자 (ship_owner 역할)</li>
          <li><strong>선박관리사 담당자:</strong> 선박 관리 감독자 (ship_manager 역할, supervisor_assignments 테이블에서 관리)</li>
        </ul>
        <p className="mt-2 text-blue-800">
          <strong>우선순위:</strong> 선박 담당자 → 선대 담당자 → 선주사 담당자
        </p>
      </div>
    </div>
  );
}