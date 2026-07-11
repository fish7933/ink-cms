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

      // admin/system_admin은 PermissionsPage에서 편집 대상이 아니라 항상 전체 권한을 가진다 (PermissionsPage.tsx의 isAdmin/isSystemAdmin 처리와 동일).
      const isFullAccessRole = user.role === 'admin' || user.role === 'system_admin';
      if (isFullAccessRole) {
        setPermissions({ canView: true, canCreate: true, canEdit: true, canDelete: true, ...roleFlags });
      } else if (resourcePermission) {
        setPermissions({
          canView: resourcePermission.can_view,
          canCreate: resourcePermission.can_create,
          canEdit: resourcePermission.can_edit,
          canDelete: resourcePermission.can_delete,
          ...roleFlags,
        });
      } else {
        // 위임된 권한 레코드가 없으면 추가/수정/삭제는 기본 거부. 다만 접속(canView)은 예외적으로
        // 기본 허용 — 그래야 관리자가 한 번도 손대지 않은 리소스의 메뉴가 갑자기 전부 숨겨지는
        // 회귀 없이, "명시적으로 접속을 끈 경우"에만 사이드바에서 사라진다. PermissionsPage의
        // 체크박스도 레코드가 없으면 접속만 체크된 상태로 표시되어 이 기본값과 일치한다.
        setPermissions({ canView: true, canCreate: false, canEdit: false, canDelete: false, ...roleFlags });
      }
    };

    loadPermissions();
  }, [resource]);

  return permissions;
}