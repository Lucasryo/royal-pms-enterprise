import { UserPermissions, UserProfile } from '../types';

/**
 * Retorna true se o perfil tem a permissão indicada.
 * - admin sempre tem tudo.
 * - Se `profile.permissions` existe, é a fonte da verdade.
 * - Caso contrário, cai no `fallbackRoles` (compatibilidade com usuários antigos sem permissions).
 */
export function hasPermission(
  profile: UserProfile | null | undefined,
  key: keyof UserPermissions,
  fallbackRoles: string[] = []
): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.permissions && key in profile.permissions) {
    return !!profile.permissions[key];
  }
  return fallbackRoles.includes(profile.role);
}

/**
 * Helper específico para verificar se o usuário pode acessar uma "view" do app.
 * Cada view é associada a uma permissão (ou múltiplas com OR) + fallback por role.
 */
export function canAccessView(
  profile: UserProfile | null | undefined,
  view: string
): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;

  switch (view) {
    case 'dashboard':
      return hasPermission(profile, 'canViewDashboard', ['admin', 'manager', 'reservations', 'client', 'external_client', 'faturamento', 'reception', 'finance', 'eventos']);
    case 'reservations':
      return hasPermission(profile, 'canViewReservations', ['admin', 'manager', 'reservations', 'client', 'external_client']);
    case 'reception':
      return (
        hasPermission(profile, 'canPerformCheckIn', ['admin', 'manager', 'reception'])
        || hasPermission(profile, 'canViewHousekeeping', ['admin', 'manager', 'reception', 'housekeeping', 'maintenance'])
        || hasPermission(profile, 'canViewOperations', ['admin', 'manager', 'reception', 'reservations', 'housekeeping', 'maintenance'])
      );
    case 'maintenance':
      return hasPermission(profile, 'canViewOperations', ['admin', 'manager', 'maintenance', 'housekeeping', 'reception']);
    case 'admin-control':
      return hasPermission(profile, 'canViewStaff', ['manager']);
    case 'checkin':
      return hasPermission(profile, 'canPerformCheckIn', ['admin', 'manager', 'reception']);
    case 'events':
      return hasPermission(profile, 'canViewEvents', ['admin', 'reservations', 'finance', 'eventos']);
    case 'housekeeping':
      return hasPermission(profile, 'canViewHousekeeping', ['admin', 'manager', 'reception', 'reservations', 'housekeeping', 'maintenance']);
    case 'operations':
      return hasPermission(profile, 'canViewOperations', ['admin', 'manager', 'reception', 'reservations', 'faturamento', 'finance', 'eventos', 'restaurant', 'housekeeping', 'maintenance']);
    case 'pos':
      return hasPermission(profile, 'canViewPOS', ['admin', 'manager', 'reception', 'finance', 'faturamento', 'restaurant']);
    case 'professional':
      return hasPermission(profile, 'canViewProfessionalTools', ['admin', 'manager', 'reservations', 'faturamento', 'finance']);
    case 'guests':
      return hasPermission(profile, 'canViewGuests', ['admin', 'reservations']);
    case 'companies':
      return hasPermission(profile, 'canViewCompanies', ['admin', 'eventos']);
    case 'tracking':
      return hasPermission(profile, 'canViewTracking', ['admin', 'reservations', 'faturamento', 'finance', 'reception']);
    case 'finance':
      return hasPermission(profile, 'canViewFinance', ['admin', 'client', 'faturamento', 'finance']);
    case 'tariffs':
      return hasPermission(profile, 'canViewTariffs', ['admin', 'faturamento', 'reservations', 'finance']);
    case 'registration':
      return hasPermission(profile, 'canCreateUsers', ['admin', 'faturamento']);
    case 'staff':
      return hasPermission(profile, 'canViewStaff', ['admin']);
    case 'audit':
      return false;
    case 'prio-billing':
      return hasPermission(profile, 'canViewFinance', ['admin', 'faturamento', 'finance', 'manager']);
    case 'reports':
      return ['admin', 'manager', 'finance', 'faturamento'].includes(profile.role);
    case 'maintenance-qr':
      return ['admin', 'manager', 'maintenance', 'reception'].includes(profile.role);
    case 'profile':
      return true;
    default:
      return false;
  }
}
