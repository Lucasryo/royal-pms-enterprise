-- Allow corporate clients to read only the tariffs linked to their own company.

drop policy if exists tariffs_select_linked_client_company on public.tariffs;
create policy tariffs_select_linked_client_company
  on public.tariffs for select to authenticated
  using (
    company_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.company_id = tariffs.company_id
    )
  );
