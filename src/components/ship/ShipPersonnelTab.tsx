import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getAssignmentsByEntity } from '@/services/assignment.service';

interface ShipPersonnelTabProps {
  shipId?: string;
  ownerId?: string;
  fleetId?: string;
}

interface PersonInfo {
  id: string;
  name: string;
  email: string;
}

interface SupervisorInfo extends PersonInfo {
  assignment_level: 'ship' | 'fleet' | 'owner';
}

const LEVEL_LABELS = { ship: '선박 직접 할당', fleet: '선대 할당', owner: '선주사 할당' };
const LEVEL_COLORS = { ship: 'bg-blue-100 text-blue-700', fleet: 'bg-green-100 text-green-700', owner: 'bg-purple-100 text-purple-700' };

export function ShipPersonnelTab({ shipId, ownerId, fleetId }: ShipPersonnelTabProps) {
  const [ownerManagers, setOwnerManagers] = useState<PersonInfo[]>([]);
  const [ownerManagerLevel, setOwnerManagerLevel] = useState<'ship' | 'fleet' | 'owner' | null>(null);
  const [ownerManagerSourceName, setOwnerManagerSourceName] = useState('');
  const [supervisors, setSupervisors] = useState<SupervisorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPersonnel();
  }, [shipId, ownerId, fleetId]);

  const resolveUsers = async (userIds: string[]): Promise<PersonInfo[]> => {
    if (userIds.length === 0) return [];
    const { data } = await supabase.from('users').select('id, name, email').in('id', userIds);
    return (data || []).map(u => ({ id: u.id, name: u.name || u.email, email: u.email }));
  };

  const loadPersonnel = async () => {
    setLoading(true);
    try {
      // 선주 담당자: assignments 테이블 (role=owner_manager), 우선순위 선박 > 플릿 > 선주사 (ManagerAssignmentPage와 동일 로직)
      let level: 'ship' | 'fleet' | 'owner' | null = null;
      let sourceName = '';
      let asgns: { user_id: string }[] = [];

      if (shipId) {
        const shipAsgns = await getAssignmentsByEntity('ship', shipId);
        if (shipAsgns.length > 0) { asgns = shipAsgns; level = 'ship'; }
      }
      if (asgns.length === 0 && fleetId) {
        const fleetAsgns = await getAssignmentsByEntity('fleet', fleetId);
        if (fleetAsgns.length > 0) {
          asgns = fleetAsgns;
          level = 'fleet';
          const { data: fleet } = await supabase.from('fleets').select('name').eq('id', fleetId).single();
          sourceName = fleet?.name || '상위 플릿';
        }
      }
      if (asgns.length === 0 && ownerId) {
        const ownerAsgns = await getAssignmentsByEntity('owner', ownerId);
        if (ownerAsgns.length > 0) {
          asgns = ownerAsgns;
          level = 'owner';
          const { data: owner } = await supabase.from('companies').select('name').eq('id', ownerId).single();
          sourceName = owner?.name || '상위 선주사';
        }
      }
      setOwnerManagerLevel(level);
      setOwnerManagerSourceName(sourceName);
      setOwnerManagers(await resolveUsers(asgns.map(a => a.user_id)));

      // 선박관리사 감독 (supervisor_assignments 테이블)
      const supervisorList: SupervisorInfo[] = [];

      if (shipId) {
        const { data: shipAssignments } = await supabase.from('supervisor_assignments').select('supervisor_id').eq('ship_id', shipId);
        if (shipAssignments?.length) {
          const users = await resolveUsers(shipAssignments.map(a => a.supervisor_id));
          users.forEach(u => supervisorList.push({ ...u, assignment_level: 'ship' }));
        }
      }
      if (fleetId) {
        const { data: fleetAssignments } = await supabase.from('supervisor_assignments').select('supervisor_id').eq('fleet_id', fleetId);
        if (fleetAssignments?.length) {
          const users = await resolveUsers(fleetAssignments.map(a => a.supervisor_id));
          users.forEach(u => { if (!supervisorList.find(s => s.id === u.id)) supervisorList.push({ ...u, assignment_level: 'fleet' }); });
        }
      }
      if (ownerId) {
        const { data: ownerAssignments } = await supabase.from('supervisor_assignments').select('supervisor_id').eq('owner_id', ownerId);
        if (ownerAssignments?.length) {
          const users = await resolveUsers(ownerAssignments.map(a => a.supervisor_id));
          users.forEach(u => { if (!supervisorList.find(s => s.id === u.id)) supervisorList.push({ ...u, assignment_level: 'owner' }); });
        }
      }
      setSupervisors(supervisorList);
    } catch (error) {
      console.error('Error loading personnel:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentLevelBadge = (level: 'ship' | 'fleet' | 'owner') => (
    <Badge variant="secondary" className={`text-xs ${LEVEL_COLORS[level]}`}>{LEVEL_LABELS[level]}</Badge>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-500">담당자 정보를 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 선주 담당자 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-purple-600" />
            <Label className="text-sm font-semibold">선주 담당자 (Ship Owner Contact)</Label>
          </div>
          {ownerManagers.length > 0 ? (
            <div className="space-y-2">
              {ownerManagerLevel && ownerManagerLevel !== 'ship' && (
                <p className="text-xs text-gray-400">
                  {ownerManagerLevel === 'fleet' ? '선대' : '선주사'} 담당자가 자동 적용됩니다 ({ownerManagerSourceName})
                </p>
              )}
              {ownerManagers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                  {ownerManagerLevel && getAssignmentLevelBadge(ownerManagerLevel)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">담당자가 지정되지 않았습니다</div>
          )}
        </CardContent>
      </Card>

      {/* 선박관리사 담당자 (감독) */}
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

      {/* Information Note */}
      <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-md border border-blue-200">
        <p className="font-medium text-blue-900 mb-1">담당자 구분</p>
        <ul className="list-disc list-inside space-y-1 text-blue-800">
          <li><strong>선주 담당자:</strong> 선박 소유자 측의 담당자 (선주 사용자 관리 화면에서 배정, ship_owner 역할)</li>
          <li><strong>선박관리사 담당자:</strong> 선박 관리 감독자 (ship_manager 역할, 선박관리사 담당자 화면에서 배정)</li>
        </ul>
        <p className="mt-2 text-blue-800">
          <strong>우선순위:</strong> 선박 직접 배정 → 선대 배정 → 선주사 배정
        </p>
      </div>
    </div>
  );
}
