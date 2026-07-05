import { supabase } from '@/lib/supabase';
import type { OrgUnit, OrgMember, OrgUnitNode, ApprovalChainStep } from '@/types/org-chart';

// 조직도에 들어가는 내부 직원 역할 — 우리회사(선박관리사) 소속 로그인 계정만 대상으로 한다.
const INTERNAL_ROLES = ['ship_manager', 'admin', 'system_admin'];

// 부서별 소속 인원 맵 — 한 사람이 여러 부서에 동시에 속할 수 있으므로 member.org_unit_ids를 펼쳐서 구성한다.
function buildMembersByUnit(members: OrgMember[]): Map<string, OrgMember[]> {
  const membersByUnit = new Map<string, OrgMember[]>();
  for (const m of members) {
    for (const unitId of m.org_unit_ids) {
      if (!membersByUnit.has(unitId)) membersByUnit.set(unitId, []);
      membersByUnit.get(unitId)!.push(m);
    }
  }
  return membersByUnit;
}

// 부서 소속 인원 중 직급 순위가 가장 높은(=position_order가 가장 낮은) 사람을 찾는다.
function findMostSeniorMember(unitMembers: OrgMember[]): OrgMember | undefined {
  return [...unitMembers]
    .filter(m => m.position_order !== null)
    .sort((a, b) => (a.position_order as number) - (b.position_order as number))[0];
}

export const orgChartService = {
  async getOrgUnits(): Promise<OrgUnit[]> {
    const { data, error } = await supabase
      .from('org_units')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getOrgMembers(): Promise<OrgMember[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, position_id, is_active')
      .in('role', INTERNAL_ROLES)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;

    const [{ data: positions }, { data: memberships }] = await Promise.all([
      supabase.from('shore_positions').select('id, name, display_order'),
      supabase.from('org_unit_members').select('user_id, org_unit_id'),
    ]);
    const posMap = new Map((positions || []).map(p => [p.id, p]));
    const unitsByUser = new Map<string, string[]>();
    for (const m of (memberships || [])) {
      if (!unitsByUser.has(m.user_id)) unitsByUser.set(m.user_id, []);
      unitsByUser.get(m.user_id)!.push(m.org_unit_id);
    }

    return (data || []).map(u => {
      const pos = u.position_id ? posMap.get(u.position_id) : undefined;
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        position_id: u.position_id,
        position_name: pos?.name || null,
        position_order: pos?.display_order ?? null,
        org_unit_ids: unitsByUser.get(u.id) || [],
      };
    });
  },

  async createOrgUnit(input: { name: string; parent_id: string | null; display_order?: number }): Promise<OrgUnit> {
    const { data, error } = await supabase
      .from('org_units')
      .insert({
        name: input.name,
        parent_id: input.parent_id,
        display_order: input.display_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateOrgUnit(id: string, updates: Partial<Pick<OrgUnit, 'name' | 'parent_id' | 'head_user_id' | 'display_order' | 'is_active'>>): Promise<OrgUnit> {
    const { data, error } = await supabase
      .from('org_units')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteOrgUnit(id: string): Promise<void> {
    const { error } = await supabase.from('org_units').delete().eq('id', id);
    if (error) throw error;
  },

  // 한 사람을 여러 부서에 소속시킬 수 있으므로 "추가"만 하고 기존 소속은 건드리지 않는다.
  async addMembership(userId: string, orgUnitId: string): Promise<void> {
    const { error } = await supabase
      .from('org_unit_members')
      .upsert({ user_id: userId, org_unit_id: orgUnitId }, { onConflict: 'org_unit_id,user_id' });
    if (error) throw error;
  },

  async removeMembership(userId: string, orgUnitId: string): Promise<void> {
    const { error } = await supabase
      .from('org_unit_members')
      .delete()
      .eq('user_id', userId)
      .eq('org_unit_id', orgUnitId);
    if (error) throw error;
  },

  /**
   * 부서(units) + 구성원(members)을 트리로 조립하고, 각 부서의 부서장을 결정한다.
   * 부서장: head_user_id가 명시돼 있으면 그 사람, 아니면 소속 인원 중 직급 순위가
   * 가장 높은 사람을 자동으로 부서장으로 간주한다. 한 사람이 여러 부서의 부서장이거나
   * 한 부서의 부서장이면서 다른 부서의 팀원일 수 있다.
   */
  buildTree(units: OrgUnit[], members: OrgMember[]): OrgUnitNode[] {
    const membersByUnit = buildMembersByUnit(members);
    const membersById = new Map(members.map(m => [m.id, m]));

    const resolveHead = (unit: OrgUnit): { name: string | null; positionName: string | null; explicit: boolean } => {
      if (unit.head_user_id) {
        const m = membersById.get(unit.head_user_id);
        return { name: m?.name || null, positionName: m?.position_name || null, explicit: true };
      }
      const senior = findMostSeniorMember(membersByUnit.get(unit.id) || []);
      return { name: senior?.name || null, positionName: senior?.position_name || null, explicit: false };
    };

    const nodeById = new Map<string, OrgUnitNode>();
    for (const unit of units) {
      const head = resolveHead(unit);
      nodeById.set(unit.id, {
        ...unit,
        head_name: head.name,
        head_position_name: head.positionName,
        head_is_explicit: head.explicit,
        members: membersByUnit.get(unit.id) || [],
        children: [],
      });
    }

    const roots: OrgUnitNode[] = [];
    for (const unit of units) {
      const node = nodeById.get(unit.id)!;
      if (unit.parent_id && nodeById.has(unit.parent_id)) {
        nodeById.get(unit.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  },

  /**
   * 특정 부서를 기준으로, 그 부서장부터 상위 부서장을 거쳐 최상위 부서장까지
   * 결재라인을 자동으로 구성한다. 부서장이 없는 단계는 건너뛰고, 같은 사람이
   * 연속으로 나오면(겸직 등) 한 번만 포함한다.
   *
   * authorityThresholdOrder(전결규정)를 주면, 어떤 단계의 결재자가 그 직급
   * 순위(position_order) 이상(=숫자가 같거나 작음, 즉 더 선임)이면 그 자리에서
   * 결재라인을 종결하고 더 이상 상위 부서로 올라가지 않는다. 단, 그 부서에
   * 결재자를 확정할 수 없으면(부서장 미지정 + 소속 인원도 없음) 이 단계는
   * 그냥 건너뛰고 상위 부서로 계속 올라간다 — 전결 대상이 없으니 당연한 동작.
   */
  buildApprovalChain(
    startUnitId: string,
    units: OrgUnit[],
    members: OrgMember[],
    authorityThresholdOrder?: number,
  ): ApprovalChainStep[] {
    const unitsById = new Map(units.map(u => [u.id, u]));
    const membersById = new Map(members.map(m => [m.id, m]));
    const membersByUnit = buildMembersByUnit(members);

    const resolveHeadId = (unit: OrgUnit): string | null => {
      if (unit.head_user_id) return unit.head_user_id;
      const senior = findMostSeniorMember(membersByUnit.get(unit.id) || []);
      return senior?.id || null;
    };

    const chain: ApprovalChainStep[] = [];
    let current: OrgUnit | undefined = unitsById.get(startUnitId);
    let guard = 0;
    while (current && guard < 50) {
      guard++;
      const headId = resolveHeadId(current);
      if (headId) {
        const headMember = membersById.get(headId);
        const last = chain[chain.length - 1];
        if (!last || last.approver_id !== headId) {
          chain.push({
            approver_id: headId,
            approver_name: headMember?.name || '알 수 없음',
            approver_role: `${current.name}${headMember?.position_name ? ' · ' + headMember.position_name : ''}`,
            org_unit_id: current.id,
            org_unit_name: current.name,
          });
        }
        if (
          authorityThresholdOrder !== undefined &&
          headMember?.position_order != null &&
          headMember.position_order <= authorityThresholdOrder
        ) {
          break; // 전결 처리 — 여기서 결재라인 종결
        }
      }
      current = current.parent_id ? unitsById.get(current.parent_id) : undefined;
    }
    return chain;
  },
};
