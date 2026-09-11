import ROLES from "../constants/roles";
import ROUTES from "../constants/routes";

export default function getDefaultRouteByRole(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return ROUTES.ADMIN_DASHBOARD;

    case ROLES.ADMIN:
      return ROUTES.ADMIN_DASHBOARD;

    case ROLES.MEMBER:
      return ROUTES.HOME;


    default:
      return ROUTES.HOME;
  }
}