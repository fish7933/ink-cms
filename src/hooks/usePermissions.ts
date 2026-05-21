import { useState, useEffect } from 'react';
import { getCurrentUser } from '@/lib/store';
import { getPermissionsByUserId } from '@/services/permission.service';
import type { Permission } from '@/types/permissions';

interface PermissionState {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isShipManager: boolean;
  isShipOwner: boolean;
  isManningCompany: boolean;
  isCrew: boolean;
}

export function usePermissions(resource: string): PermissionState {
  const [permissions, setPermissions] = useState<PermissionState>({
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    isShipManager: false,
    isShipOwner: false,
    isManningCompany: false,
    isCrew: false,
  });

  useEffect(() => {
    const loadPermissions = async () => {
      const user = await getCurrentUser();
      if (!user) return;

      // Set role flags
      const roleFlags = {
        isShipManager: user.role === 'ship_manager',
        isShipOwner: user.role === 'ship_owner',
        isManningCompany: user.role === 'manning_agency',
        isCrew: user.role === 'crew',
      };

      // Get permissions from database
      const userPermissions = await getPermissionsByUserId(user.id);
      const resourcePermission = userPermissions.find((p: Permission) => p.resource === resource);

      if (resourcePermission) {
        setPermissions({
          canView: resourcePermission.can_view,
          canCreate: resourcePermission.can_create,
          canEdit: resourcePermission.can_edit,
          canDelete: resourcePermission.can_delete,
          ...roleFlags,
        });
      } else {
        setPermissions({
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          ...roleFlags,
        });
      }
    };

    loadPermissions();
  }, [resource]);

  return permissions;
}