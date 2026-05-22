import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '@/context/AuthContext';
import type { Company } from './types';

/**
 * Resolve a empresa "ativa" para uma pagina.
 * - Usuario property: fixado na propria empresa.
 * - Usuario master: pode escolher entre todas as empresas.
 */
export function useCompanyScope() {
  const { profile, isMaster } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>(profile?.company_id ?? '');

  useEffect(() => {
    if (isMaster) {
      supabase
        .from('companies')
        .select('*')
        .eq('active', true)
        .order('name')
        .then(({ data }) => {
          const list = (data as Company[] | null) ?? [];
          setCompanies(list);
          setCompanyId((prev) => prev || list[0]?.id || '');
        });
    } else if (profile?.company_id) {
      supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .then(({ data }) => setCompanies((data as Company[] | null) ?? []));
    }
  }, [isMaster, profile?.company_id]);

  const companyName = companies.find((c) => c.id === companyId)?.name ?? '';

  return { isMaster, companies, companyId, setCompanyId, companyName };
}
