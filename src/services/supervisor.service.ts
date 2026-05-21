import { supabase } from '@/lib/supabase';
import type { SupervisorAssignment, SupervisorAssignmentWithDetails, SupervisorCheck } from '@/types/supervisor';

class SupervisorService {
  /**
   * Check if a user is a supervisor for a specific ship
   * Checks hierarchy: ship -> fleet -> owner
   */
  async isSupervisorForShip(userId: string, shipId: string): Promise<SupervisorCheck> {
    try {
      console.log('🔍 [isSupervisorForShip] Checking permission for user:', userId, 'ship:', shipId);
      
      // Get ship details to check fleet and owner
      const { data: ship, error: shipError } = await supabase
        .from('ships')
        .select('id, fleet_id, owner_id')
        .eq('id', shipId)
        .single();

      if (shipError || !ship) {
        console.log('❌ [isSupervisorForShip] Ship not found');
        return { is_supervisor: false };
      }

      console.log('📋 [isSupervisorForShip] Ship details:', ship);

      // Check ship-level assignment
      const { data: shipAssignment } = await supabase
        .from('supervisor_assignments')
        .select('id')
        .eq('supervisor_id', userId)
        .eq('ship_id', shipId)
        .maybeSingle();

      console.log('🔍 [isSupervisorForShip] Ship-level assignment:', shipAssignment);

      if (shipAssignment) {
        console.log('✅ [isSupervisorForShip] Permission granted at ship level');
        return {
          is_supervisor: true,
          assignment_level: 'ship',
          assignment_id: shipAssignment.id,
        };
      }

      // Check fleet-level assignment (if ship has a fleet)
      if (ship.fleet_id) {
        const { data: fleetAssignment } = await supabase
          .from('supervisor_assignments')
          .select('id')
          .eq('supervisor_id', userId)
          .eq('fleet_id', ship.fleet_id)
          .maybeSingle();

        console.log('🔍 [isSupervisorForShip] Fleet-level assignment:', fleetAssignment);

        if (fleetAssignment) {
          console.log('✅ [isSupervisorForShip] Permission granted at fleet level');
          return {
            is_supervisor: true,
            assignment_level: 'fleet',
            assignment_id: fleetAssignment.id,
          };
        }
      }

      // Check owner-level assignment
      const { data: ownerAssignment } = await supabase
        .from('supervisor_assignments')
        .select('id')
        .eq('supervisor_id', userId)
        .eq('owner_id', ship.owner_id)
        .maybeSingle();

      console.log('🔍 [isSupervisorForShip] Owner-level assignment:', ownerAssignment);

      if (ownerAssignment) {
        console.log('✅ [isSupervisorForShip] Permission granted at owner level');
        return {
          is_supervisor: true,
          assignment_level: 'owner',
          assignment_id: ownerAssignment.id,
        };
      }

      console.log('❌ [isSupervisorForShip] No permission found');
      return { is_supervisor: false };
    } catch (error) {
      console.error('❌ [isSupervisorForShip] Error checking supervisor status:', error);
      return { is_supervisor: false };
    }
  }

  /**
   * Get all supervisor assignments with details
   */
  async getAllAssignments(): Promise<SupervisorAssignmentWithDetails[]> {
    try {
      const { data: assignments, error } = await supabase
        .from('supervisor_assignments')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      if (!assignments || assignments.length === 0) return [];

      // Get supervisor details
      const supervisorIds = [...new Set(assignments.map(a => a.supervisor_id))];
      const { data: supervisors } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', supervisorIds);

      const supervisorMap = new Map(supervisors?.map(s => [s.id, s]) || []);

      // Get assigned_by details
      const assignedByIds = [...new Set(assignments.map(a => a.assigned_by))];
      const { data: assignedByUsers } = await supabase
        .from('users')
        .select('id, name')
        .in('id', assignedByIds);

      const assignedByMap = new Map(assignedByUsers?.map(u => [u.id, u]) || []);

      // Get entity details
      const ownerIds = assignments.filter(a => a.owner_id).map(a => a.owner_id!);
      const fleetIds = assignments.filter(a => a.fleet_id).map(a => a.fleet_id!);
      const shipIds = assignments.filter(a => a.ship_id).map(a => a.ship_id!);

      const [ownersRes, fleetsRes, shipsRes] = await Promise.all([
        ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : { data: [] },
        fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
        shipIds.length > 0 ? supabase.from('ships').select('id, name').in('id', shipIds) : { data: [] },
      ]);

      const ownerMap = new Map(ownersRes.data?.map(o => [o.id, o.name]) || []);
      const fleetMap = new Map(fleetsRes.data?.map(f => [f.id, f.name]) || []);
      const shipMap = new Map(shipsRes.data?.map(s => [s.id, s.name]) || []);

      // Map assignments with details
      return assignments.map(assignment => {
        const supervisor = supervisorMap.get(assignment.supervisor_id);
        const assignedBy = assignedByMap.get(assignment.assigned_by);

        let entity_type: 'owner' | 'fleet' | 'ship';
        let entity_name: string;

        if (assignment.owner_id) {
          entity_type = 'owner';
          entity_name = ownerMap.get(assignment.owner_id) || 'Unknown';
        } else if (assignment.fleet_id) {
          entity_type = 'fleet';
          entity_name = fleetMap.get(assignment.fleet_id) || 'Unknown';
        } else {
          entity_type = 'ship';
          entity_name = shipMap.get(assignment.ship_id!) || 'Unknown';
        }

        return {
          ...assignment,
          supervisor_name: supervisor?.name || 'Unknown',
          supervisor_email: supervisor?.email || '',
          entity_type,
          entity_name,
          assigned_by_name: assignedBy?.name || 'Unknown',
        };
      });
    } catch (error) {
      console.error('Error getting supervisor assignments:', error);
      throw error;
    }
  }

  /**
   * Get assignments for a specific supervisor
   */
  async getAssignmentsBySupervisor(supervisorId: string): Promise<SupervisorAssignmentWithDetails[]> {
    try {
      const allAssignments = await this.getAllAssignments();
      return allAssignments.filter(a => a.supervisor_id === supervisorId);
    } catch (error) {
      console.error('Error getting supervisor assignments:', error);
      throw error;
    }
  }

  /**
   * Create a new supervisor assignment
   */
  async createAssignment(
    supervisorId: string,
    entityType: 'owner' | 'fleet' | 'ship',
    entityId: string,
    assignedBy: string,
    notes?: string
  ): Promise<SupervisorAssignment> {
    try {
      const assignment: Partial<SupervisorAssignment> = {
        supervisor_id: supervisorId,
        assigned_by: assignedBy,
        notes,
      };

      if (entityType === 'owner') {
        assignment.owner_id = entityId;
      } else if (entityType === 'fleet') {
        assignment.fleet_id = entityId;
      } else {
        assignment.ship_id = entityId;
      }

      const { data, error } = await supabase
        .from('supervisor_assignments')
        .insert(assignment)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating supervisor assignment:', error);
      throw error;
    }
  }

  /**
   * Delete a supervisor assignment
   */
  async deleteAssignment(assignmentId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('supervisor_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting supervisor assignment:', error);
      throw error;
    }
  }

  /**
   * Get all ship managers (potential supervisors)
   */
  async getShipManagers(): Promise<Array<{ id: string; name: string; email: string }>> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('role', 'ship_manager')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting ship managers:', error);
      throw error;
    }
  }

  /**
   * Get ships that a supervisor has access to
   */
  async getSupervisedShips(supervisorId: string): Promise<string[]> {
    try {
      console.log('🔍 [getSupervisedShips] Getting ships for supervisor:', supervisorId);
      
      const { data: assignments, error } = await supabase
        .from('supervisor_assignments')
        .select('owner_id, fleet_id, ship_id')
        .eq('supervisor_id', supervisorId);

      if (error) throw error;
      if (!assignments || assignments.length === 0) {
        console.log('⚠️ [getSupervisedShips] No assignments found');
        return [];
      }

      console.log('📋 [getSupervisedShips] Assignments:', assignments);

      const shipIds: string[] = [];

      for (const assignment of assignments) {
        if (assignment.ship_id) {
          // Direct ship assignment
          console.log('✅ [getSupervisedShips] Direct ship assignment:', assignment.ship_id);
          shipIds.push(assignment.ship_id);
        } else if (assignment.fleet_id) {
          // Fleet assignment - get all ships in fleet
          console.log('🔍 [getSupervisedShips] Fleet assignment:', assignment.fleet_id);
          const { data: ships } = await supabase
            .from('ships')
            .select('id')
            .eq('fleet_id', assignment.fleet_id);
          
          if (ships) {
            console.log('✅ [getSupervisedShips] Ships in fleet:', ships.length);
            shipIds.push(...ships.map(s => s.id));
          }
        } else if (assignment.owner_id) {
          // Owner assignment - get all ships for owner
          console.log('🔍 [getSupervisedShips] Owner assignment:', assignment.owner_id);
          const { data: ships } = await supabase
            .from('ships')
            .select('id')
            .eq('owner_id', assignment.owner_id);
          
          if (ships) {
            console.log('✅ [getSupervisedShips] Ships for owner:', ships.length);
            shipIds.push(...ships.map(s => s.id));
          }
        }
      }

      const uniqueShipIds = [...new Set(shipIds)];
      console.log('📊 [getSupervisedShips] Total unique ships:', uniqueShipIds.length);
      return uniqueShipIds;
    } catch (error) {
      console.error('❌ [getSupervisedShips] Error getting supervised ships:', error);
      throw error;
    }
  }

  /**
   * Get owners (companies) that a supervisor has access to
   */
  async getSupervisedOwners(supervisorId: string): Promise<string[]> {
    try {
      console.log('🔍 [getSupervisedOwners] Getting owners for supervisor:', supervisorId);
      
      const { data: assignments, error } = await supabase
        .from('supervisor_assignments')
        .select('owner_id, fleet_id, ship_id')
        .eq('supervisor_id', supervisorId);

      if (error) throw error;
      if (!assignments || assignments.length === 0) {
        console.log('⚠️ [getSupervisedOwners] No assignments found');
        return [];
      }

      console.log('📋 [getSupervisedOwners] Assignments:', assignments);

      const ownerIds: string[] = [];

      for (const assignment of assignments) {
        if (assignment.owner_id) {
          // Direct owner assignment
          console.log('✅ [getSupervisedOwners] Direct owner assignment:', assignment.owner_id);
          ownerIds.push(assignment.owner_id);
        } else if (assignment.fleet_id) {
          // Fleet assignment - get owner of the fleet
          console.log('🔍 [getSupervisedOwners] Fleet assignment:', assignment.fleet_id);
          const { data: fleet } = await supabase
            .from('fleets')
            .select('owner_id')
            .eq('id', assignment.fleet_id)
            .single();
          
          if (fleet?.owner_id) {
            console.log('✅ [getSupervisedOwners] Owner from fleet:', fleet.owner_id);
            ownerIds.push(fleet.owner_id);
          }
        } else if (assignment.ship_id) {
          // Ship assignment - get owner of the ship
          console.log('🔍 [getSupervisedOwners] Ship assignment:', assignment.ship_id);
          const { data: ship } = await supabase
            .from('ships')
            .select('owner_id')
            .eq('id', assignment.ship_id)
            .single();
          
          if (ship?.owner_id) {
            console.log('✅ [getSupervisedOwners] Owner from ship:', ship.owner_id);
            ownerIds.push(ship.owner_id);
          }
        }
      }

      const uniqueOwnerIds = [...new Set(ownerIds)];
      console.log('📊 [getSupervisedOwners] Total unique owners:', uniqueOwnerIds.length);
      console.log('📋 [getSupervisedOwners] Owner IDs:', uniqueOwnerIds);
      return uniqueOwnerIds;
    } catch (error) {
      console.error('❌ [getSupervisedOwners] Error getting supervised owners:', error);
      throw error;
    }
  }

  /**
   * Get fleets that a supervisor has access to
   */
  async getSupervisedFleets(supervisorId: string): Promise<string[]> {
    try {
      console.log('🔍 [getSupervisedFleets] Getting fleets for supervisor:', supervisorId);
      
      const { data: assignments, error } = await supabase
        .from('supervisor_assignments')
        .select('owner_id, fleet_id, ship_id')
        .eq('supervisor_id', supervisorId);

      if (error) throw error;
      if (!assignments || assignments.length === 0) {
        console.log('⚠️ [getSupervisedFleets] No assignments found');
        return [];
      }

      console.log('📋 [getSupervisedFleets] Assignments:', assignments);

      const fleetIds: string[] = [];

      for (const assignment of assignments) {
        if (assignment.fleet_id) {
          // Direct fleet assignment
          console.log('✅ [getSupervisedFleets] Direct fleet assignment:', assignment.fleet_id);
          fleetIds.push(assignment.fleet_id);
        } else if (assignment.owner_id) {
          // Owner assignment - get all fleets for owner
          console.log('🔍 [getSupervisedFleets] Owner assignment:', assignment.owner_id);
          const { data: fleets } = await supabase
            .from('fleets')
            .select('id')
            .eq('owner_id', assignment.owner_id);
          
          if (fleets) {
            console.log('✅ [getSupervisedFleets] Fleets for owner:', fleets.length);
            fleetIds.push(...fleets.map(f => f.id));
          }
        } else if (assignment.ship_id) {
          // Ship assignment - get fleet of the ship
          console.log('🔍 [getSupervisedFleets] Ship assignment:', assignment.ship_id);
          const { data: ship } = await supabase
            .from('ships')
            .select('fleet_id')
            .eq('id', assignment.ship_id)
            .single();
          
          if (ship?.fleet_id) {
            console.log('✅ [getSupervisedFleets] Fleet from ship:', ship.fleet_id);
            fleetIds.push(ship.fleet_id);
          }
        }
      }

      const uniqueFleetIds = [...new Set(fleetIds)];
      console.log('📊 [getSupervisedFleets] Total unique fleets:', uniqueFleetIds.length);
      return uniqueFleetIds;
    } catch (error) {
      console.error('❌ [getSupervisedFleets] Error getting supervised fleets:', error);
      throw error;
    }
  }
}

export const supervisorService = new SupervisorService();

/**
 * Check if a user has supervisor permission for a specific entity
 */
export async function checkSupervisorPermission(
  userId: string,
  ownerId: string,
  fleetId?: string,
  shipId?: string
): Promise<boolean> {
  console.log('🔍 [checkSupervisorPermission] Checking permission:', {
    userId,
    ownerId,
    fleetId,
    shipId,
  });

  try {
    // Check owner-level permission
    const { data: ownerAssignment } = await supabase
      .from('supervisor_assignments')
      .select('id')
      .eq('supervisor_id', userId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (ownerAssignment) {
      console.log('✅ [checkSupervisorPermission] Permission granted at owner level');
      return true;
    }

    // Check fleet-level permission
    if (fleetId) {
      const { data: fleetAssignment } = await supabase
        .from('supervisor_assignments')
        .select('id')
        .eq('supervisor_id', userId)
        .eq('fleet_id', fleetId)
        .maybeSingle();

      if (fleetAssignment) {
        console.log('✅ [checkSupervisorPermission] Permission granted at fleet level');
        return true;
      }
    }

    // Check ship-level permission
    if (shipId) {
      const { data: shipAssignment } = await supabase
        .from('supervisor_assignments')
        .select('id')
        .eq('supervisor_id', userId)
        .eq('ship_id', shipId)
        .maybeSingle();

      if (shipAssignment) {
        console.log('✅ [checkSupervisorPermission] Permission granted at ship level');
        return true;
      }
    }

    console.log('❌ [checkSupervisorPermission] No permission found');
    return false;
  } catch (error) {
    console.error('❌ [checkSupervisorPermission] Error:', error);
    return false;
  }
}