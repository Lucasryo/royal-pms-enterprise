export type ViewType =
  | 'dashboard'
  | 'reservations'
  | 'reception'
  | 'maintenance'
  | 'admin-control'
  | 'checkin'
  | 'guests'
  | 'companies'
  | 'finance'
  | 'staff'
  | 'tariffs'
  | 'tracking'
  | 'registration'
  | 'events'
  | 'housekeeping'
  | 'operations'
  | 'pos'
  | 'professional'
  | 'audit'
  | 'profile'
  | 'prio-billing';

export interface HotelEvent {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  hall_name: string;
  event_type: string;
  attendees_count: number;
  total_value: number;
  status: 'planned' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';
  items_included: string;
  client_profile?: string;
  client_category?: 'Pessoa física' | 'Empresa' | 'Agência';
  check_info?: string;
  staff_roadmap?: string;
  important_notes?: string;
  created_at: string;
  created_by: string;
  company_id?: string;
  os_number: string;
  cancelled_at?: string;
  cancelled_by?: string;
  cancel_reason?: string;
}

export type UserRole =
  | 'admin'
  | 'client'
  | 'external_client'
  | 'reservations'
  | 'faturamento'
  | 'reception'
  | 'finance'
  | 'eventos'
  | 'restaurant'
  | 'housekeeping'
  | 'maintenance'
  | 'manager';

export interface Tariff {
  id: string;
  company_name: string;
  base_rate: number;
  percentage: number;
  room_type: 'single' | 'duplo' | 'triplo' | 'quadruplo';
  category: 'executivo' | 'master' | 'suite presidencial';
  description: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  cnpj: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: 'active' | 'inactive';
}

export interface UserPermissions {
  canViewDashboard: boolean;
  canViewReservations: boolean;
  canCreateReservations: boolean;
  canEditReservations: boolean;
  canCancelReservations: boolean;
  canPrintVouchers: boolean;
  canPerformCheckIn: boolean;
  canPerformCheckOut: boolean;
  canCreateWalkIn: boolean;
  canManageFolio: boolean;
  canRemoveFolioCharges: boolean;
  canReopenAccounts: boolean;
  canTransferRoom: boolean;
  canTransferCharges: boolean;
  canIssueHospitalityStatement: boolean;
  canViewEvents: boolean;
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canCancelEvents: boolean;
  canViewGuests: boolean;
  canViewCompanies: boolean;
  canCreateCompanies: boolean;
  canViewFinance: boolean;
  canUploadFiles: boolean;
  canDownloadFiles: boolean;
  canViewStaff: boolean;
  canCreateUsers: boolean;
  canViewTariffs: boolean;
  canEditTariffs: boolean;
  canViewTracking: boolean;
  canViewBankAccounts: boolean;
  canViewHousekeeping: boolean;
  canManageHousekeeping: boolean;
  canViewOperations: boolean;
  canManageOperations: boolean;
  canViewPOS: boolean;
  canManagePOS: boolean;
  canViewProfessionalTools: boolean;
  canManageProfessionalTools: boolean;
}

export interface Room {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  housekeeping_status: 'clean' | 'dirty' | 'inspected' | 'out_of_order';
  maintenance_notes?: string;
  last_cleaned_at?: string;
  is_virtual?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id?: string;
  photo_url?: string;
  phone?: string;
  company_name?: string;
  permissions?: UserPermissions;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string | Record<string, unknown>;
  timestamp: string;
  type: 'upload' | 'download' | 'delete' | 'user_create' | 'company_create' | 'login' | 'update' | 'create';
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  link?: string;
}

export interface FiscalFile {
  id: string;
  company_id?: string;
  companyId?: string; // Alias for company_id
  type: string;
  period: string;
  original_name: string;
  originalName?: string; // Alias for original_name
  storage_path: string;
  storagePath?: string; // Alias for storage_path
  upload_date: string;
  uploadDate?: string; // Alias for upload_date
  uploader_id: string;
  uploaderId?: string; // Alias for uploader_id
  download_url?: string;
  downloadUrl?: string; // Alias for download_url
  due_date?: string;
  dueDate?: string; // Alias for due_date
  viewed_by_client?: boolean;
  viewedByClient?: boolean; // Alias for viewed_by_client
  viewed_at?: string;
  viewedAt?: string; // Alias for viewed_at
  viewed_by_admin?: boolean;
  amount?: number;
  category?: string;
  status?: 'PENDING' | 'PAID' | 'CANCELLED';
  cancelled_at?: string;
  cancelledAt?: string; // Alias for cancelled_at
  cancelled_by?: string;
  cancelledBy?: string; // Alias for cancelled_by
  cancel_reason?: string;
  cancelReason?: string; // Alias for cancel_reason
  proof_url?: string;
  proofUrl?: string; // Alias for proof_url
  proofDate?: string; // Alias for proof_date
  proof_date?: string;
  dispute_reason?: string;
  disputeReason?: string; // Alias for dispute_reason
  dispute_images?: string[];
  dispute_at?: string;
  disputeAt?: string; // Alias for dispute_at
  dispute_response?: string;
  disputeResponse?: string; // Alias for dispute_response
  dispute_resolved_at?: string;
  disputeResolvedAt?: string; // Alias for dispute_resolved_at
  is_deleted?: boolean;
  deleted_at?: string;
  deletedAt?: string; // Alias for deleted_at
  deleted_by?: string;
  deletedBy?: string; // Alias for deleted_by
  billing_notifications_sent?: string[];
  tracking_stage?: 'reception' | 'reservations' | 'finance' | 'completed';
  tracking_status?: 'ok' | 'blocked' | 'pending';
  tracking_notes?: string;
  tracking_updated_at?: string;
  tracking_updated_by?: string;
  nh?: string;
  event_os_number?: string;
  reservation_code?: string;
}

export interface Reservation {
  id: string;
  guest_name: string;
  room_number?: string;
  check_in: string;
  check_out: string;
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  company_id: string;
  total_amount: number;
  created_at: string;
  reservation_code: string;
  cost_center: string;
  billing_obs?: string;
  tariff: number;
  category: string;
  guests_per_uh: number;
  contact_phone: string;
  contact_email?: string;
  source?: string;
  adults?: number;
  children?: number;
  iss_tax: number;
  service_tax: number;
  payment_method: 'BILLED' | 'VIRTUAL_CARD';
  fiscal_data?: string;
  billing_info?: string;
  requested_by?: string;
}

export interface ReservationRequest extends Omit<Reservation, 'id' | 'status'> {
  id?: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
}

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  doc_number: string;
  category?: string;
}

export interface BankStatement {
  id: string;
  name: string;
  period?: string;
  transactions: BankTransaction[];
  created_at: string;
  created_by: string;
}

export interface BankAccount {
  id: string;
  institution: string;
  bank_name: string;
  agency: string;
  account: string;
  pix_key: string;
  is_default?: boolean;
}

export interface MaintenanceTicket {
  id: string;
  room_id?: string;
  room_number?: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  assigned_to?: string;
  reported_by?: string;
  due_at?: string;
  resolved_at?: string;
  started_at?: string;
  status_reason?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface LostFoundItem {
  id: string;
  room_number?: string;
  guest_name?: string;
  item_name: string;
  description?: string;
  status: 'stored' | 'claimed' | 'discarded';
  storage_location?: string;
  found_by?: string;
  claimed_by?: string;
  found_at: string;
  resolved_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ShiftHandover {
  id: string;
  shift_date: string;
  shift_name: 'manha' | 'tarde' | 'noite';
  summary: string;
  open_items?: string;
  created_by?: string;
  created_at: string;
}
