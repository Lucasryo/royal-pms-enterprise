export type UserRole = 'master' | 'property';
export type StorageCondition = 'ambiente' | 'refrigerado' | 'congelado';
export type ValidityUnit = 'hours' | 'days';

export const STORAGE_CONDITION_LABELS: Record<StorageCondition, string> = {
  ambiente: 'Ambiente',
  refrigerado: 'Refrigerado',
  congelado: 'Congelado',
};

export const VALIDITY_UNIT_LABELS: Record<ValidityUnit, string> = {
  hours: 'horas',
  days: 'dias',
};

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  company_id: string | null;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  category: string | null;
  default_storage_condition: StorageCondition;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductShelfLife {
  id: string;
  product_id: string;
  storage_condition: StorageCondition;
  validity_value: number;
  validity_unit: ValidityUnit;
  created_at: string;
  updated_at: string;
}

export interface ProductWithShelfLives extends Product {
  product_shelf_lives: ProductShelfLife[];
}

export interface LabelPrint {
  id: string;
  company_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  storage_condition: StorageCondition;
  manipulation_at: string;
  expiry_at: string;
  responsible_name: string;
  quantity: number;
  printed_by: string | null;
  printed_at: string;
  created_at: string;
}

export interface Photo {
  id: string;
  company_id: string;
  storage_path: string;
  original_name: string | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  created_at: string;
}
