-- Allow multiple company cards / cost centers to share the same fiscal CNPJ.
-- The reservation parser still uses CNPJ as a strong signal, but the PMS must
-- be able to represent different cost centers under the same legal entity.

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_cnpj_key;

CREATE INDEX IF NOT EXISTS idx_companies_cnpj
  ON public.companies (cnpj)
  WHERE cnpj IS NOT NULL;
