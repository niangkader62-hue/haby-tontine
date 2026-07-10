-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : cree juste un espace de stockage pour les photos

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_public_read" on storage.objects for select using (bucket_id = 'photos');

drop policy if exists "photos_authenticated_upload" on storage.objects;
create policy "photos_authenticated_upload" on storage.objects for insert with check (bucket_id = 'photos' and auth.role() = 'authenticated');

drop policy if exists "photos_authenticated_update" on storage.objects;
create policy "photos_authenticated_update" on storage.objects for update using (bucket_id = 'photos' and auth.role() = 'authenticated');
