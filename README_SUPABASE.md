# Supabase postavljanje

1. Otvoriti Supabase projekat.
2. Ući u SQL Editor.
3. Kopirati sadržaj fajla `supabase/schema.sql`.
4. Pokrenuti SQL.
5. U `.env` dodati `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
6. Restartovati lokalni server nakon izmjene `.env` fajla.

Za demo verziju tabele su otvorene prema anon/publishable ključu. Za produkciju treba koristiti Supabase Auth i RLS policy-je po korisniku.
