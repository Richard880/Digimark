import ROLE_PERMISSIONS from "../../../constants/rolePermissions";

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(permissions = [], permission) {
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions = [],
  requiredPermissions = []
) {
  return requiredPermissions.some((permission) =>
    permissions.includes(permission)
  );
}

export function hasAllPermissions(
  permissions = [],
  requiredPermissions = []
) {
  return requiredPermissions.every((permission) =>
    permissions.includes(permission)
  );
}