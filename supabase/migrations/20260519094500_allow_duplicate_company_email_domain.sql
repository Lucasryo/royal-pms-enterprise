-- Multiple company cards / cost centers can share the same corporate domain.
-- The parser resolves collisions by CNPJ, aliases and extracted company name.

DROP INDEX IF EXISTS public.uq_companies_email_domain;

CREATE INDEX IF NOT EXISTS idx_companies_email_domain
  ON public.companies (LOWER(email_domain))
  WHERE email_domain IS NOT NULL;
