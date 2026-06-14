-- Čišćenje svih aplikacijskih podataka iz Supabase baze.
-- Pokrenuti u Supabase SQL Editoru prije unosa novih demo podataka.
-- Redoslijed je bitan zbog foreign key veza.

DELETE FROM public.attachments;
DELETE FROM public.time_entries;
DELETE FROM public.comments;
DELETE FROM public.notifications;
DELETE FROM public.user_import_rows;
DELETE FROM public.user_import_batches;
DELETE FROM public.password_reset_requests;
DELETE FROM public.registration_requests;
DELETE FROM public.tickets;
DELETE FROM public.buildings;
DELETE FROM public.users;
