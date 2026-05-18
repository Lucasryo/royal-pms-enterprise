ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_email_domain
  ON companies(LOWER(email_domain)) WHERE email_domain IS NOT NULL;

UPDATE companies SET email_domain = 'petrobras.com.br'
  WHERE LOWER(name) LIKE '%petrobras%' AND email_domain IS NULL;
