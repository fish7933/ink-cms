export interface SupervisorAssignment {
  id: string;
  supervisor_id: string;
  owner_id?: string;
  fleet_id?: string;
  ship_id?: string;
  assigned_by: string;
  assigned_at: string;
  notes?: string;
}

export interface SupervisorAssignmentWithDetails extends SupervisorAssignment {
  supervisor_name: string;
  supervisor_email: string;
  entity_type: 'owner' | 'fleet' | 'ship';
  entity_name: string;
  assigned_by_name: string;
}

export interface SupervisorCheck {
  is_supervisor: boolean;
  assignment_level?: 'owner' | 'fleet' | 'ship';
  assignment_id?: string;
}