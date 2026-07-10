-- A coller dans un nouvel onglet SQL Editor -> RUN
-- Sans danger : ajoute juste ce qui manque

alter table messages add column if not exists audio_url text;

-- Nouvel espace de stockage pour les messages vocaux
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do nothing;

drop policy if exists "audio_public_read" on storage.objects;
create policy "audio_public_read" on storage.objects for select using (bucket_id = 'audio');

drop policy if exists "audio_authenticated_upload" on storage.objects;
create policy "audio_authenticated_upload" on storage.objects for insert with check (bucket_id = 'audio' and auth.role() = 'authenticated');
