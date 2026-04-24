import { UserProfile, UserRole, ViewType } from '../types';
import { DEFAULT_PERMISSIONS } from './defaultPermissions';
import { canAccessView } from './permissions';

export type AppView = ViewType;

export const APP_VIEW_LABELS: Record<AppView, string> = {
  dashboard: 'Painel',
  reservations: 'Reservas',
  reception: 'Recepcao',
  maintenance: 'Manutencao',
  'admin-control': 'Admin',
  checkin: 'Check-in/out',
  housekeeping: 'Governanca',
  operations: 'Operacoes',
  pos: 'POS Restaurante',
  professional: 'Gestao Pro',
  events: 'Eventos',
  guests: 'Hospedes',
  companies: 'Empresas',
  tracking: 'Rastreio',
  finance: 'Financas',
  tariffs: 'Tarifas',
  registration: 'Cadastro',
  staff: 'Equipe',
  audit: 'Auditoria',
  profile: 'Perfil',
  settings: 'Configuracoes',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  reservations: 'Reservas',
  reception: 'Recepcao',
  faturamento: 'Faturamento',
  finance: 'Financeiro',
  eventos: 'Eventos',
  restaurant: 'Restaurante',
  housekeeping: 'Governanca',
  maintenance: 'Manutencao',
  manager: 'Gerente',
  client: 'Cliente',
  external_client: 'Cliente Externo',
};

export const ROLE_HOME_VIEW: Record<UserRole, AppView> = {
  admin: 'dashboard',
  reservations: 'reservations',
  reception: 'reception',
  faturamento: 'finance',
  finance: 'finance',
  eventos: 'events',
  restaurant: 'pos',
  housekeeping: 'reception',
  maintenance: 'maintenance',
  manager: 'dashboard',
  client: 'dashboard',
  external_client: 'reservations',
};

export const ACCESS_MATRIX_ROLES: UserRole[] = ['client', 'external_client', 'reservations', 'faturamento', 'restaurant', 'housekeeping', 'maintenance', 'manager'];
export const ACCESS_MATRIX_VIEWS: AppView[] = ['dashboard', 'reservations', 'reception', 'maintenance', 'pos', 'events', 'finance', 'admin-control'];

export type AccessActionKey =
  | 'requestReservation'
  | 'seeFinancialDocuments'
  | 'runCheckIn'
  | 'runCheckOut'
  | 'operatePOS'
  | 'manageFinancePipeline'
  | 'seeTracking';

export const ACCESS_ACTION_LABELS: Record<AccessActionKey, string> = {
  requestReservation: 'Solicitar reserva',
  seeFinancialDocuments: 'Ver documentos financeiros',
  runCheckIn: 'Realizar check-in',
  runCheckOut: 'Realizar check-out',
  operatePOS: 'Operar POS/restaurante',
  manageFinancePipeline: 'Operar faturamento',
  seeTracking: 'Ver rastreio operacional',
};

export function buildProfileForAccessCheck(role: UserRole): UserProfile {
  return {
    id: `access-${role}`,
    name: ROLE_LABELS[role],
    email: `${role}@royalpms.local`,
    role,
    company_id: ['client', 'external_client', 'reservations'].includes(role) ? 'demo-company' : undefined,
    permissions: DEFAULT_PERMISSIONS[role],
  };
}

export function getAccessibleViewsForRole(role: UserRole): AppView[] {
  const profile = buildProfileForAccessCheck(role);
  return ACCESS_MATRIX_VIEWS.filter((view) => canAccessView(profile, view));
}

export function getAccessActionsForRole(role: UserRole): Record<AccessActionKey, boolean> {
  const profile = buildProfileForAccessCheck(role);
  const permissions = profile.permissions || DEFAULT_PERMISSIONS[role];

  return {
    requestReservation: permissions.canCreateReservations,
    seeFinancialDocuments: permissions.canViewFinance && (permissions.canDownloadFiles || role === 'client'),
    runCheckIn: permissions.canPerformCheckIn,
    runCheckOut: permissions.canPerformCheckOut,
    operatePOS: permissions.canManagePOS,
    manageFinancePipeline: permissions.canViewFinance && permissions.canUploadFiles,
    seeTracking: permissions.canViewTracking,
  };
}
