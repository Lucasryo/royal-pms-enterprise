-- =====================================================================
-- 0003_storage.sql  —  Bucket privado de fotos + politicas de Storage
-- Caminho dos arquivos: {company_id}/{uuid}.{ext}
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Acesso permitido quando a 1a pasta do caminho e a empresa do usuario,
-- ou quando o usuario e master.

create policy photos_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_master()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy photos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (
      public.is_master()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );

create policy photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_master()
      or (storage.foldername(name))[1] = public.current_company_id()::text
    )
  );
