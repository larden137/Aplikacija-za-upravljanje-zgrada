# Supabase postavljanje

1. Otvoriti Supabase projekat.
2. Ući u SQL Editor.
3. Kopirati sadržaj fajla `supabase/schema.sql`.
4. Pokrenuti SQL.
5. U `.env` dodati `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
6. Restartovati lokalni server nakon izmjene `.env` fajla.

SQL fajl uključuje RLS i demo policy-je za `anon` i `authenticated` role kako bi akademska verzija mogla raditi bez Supabase Auth modula. Za stvarnu produkciju policy-je treba suziti po korisniku i ulozi, uz Supabase Auth.
