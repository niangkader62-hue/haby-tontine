-- Permet d'envoyer une image (ex: recu de versement) dans un message,
-- comme c'etait deja possible pour les messages vocaux (audio_url).
-- A executer une fois dans l'editeur SQL Supabase.

alter table messages add column if not exists image_url text;
