# Čista Supabase verzija

U ovoj verziji su uklonjena dva izvora starih demo podataka:

1. Aplikacija više ne poziva automatski `DB.seed()` pri pokretanju.
2. Login demo nalozi više nisu zakucani u `index.html`, nego se prikazuju iz Supabase tabele `users`.

Ako želiš potpuno čistu aplikaciju:

1. U Supabase SQL Editoru pokreni `supabase/00_ocisti_sve_podatke.sql`.
2. Zatim ubaci nove korisnike/zgrade/tikete kroz Excel import ili kroz seed SQL iz demo paketa.
3. U browseru uradi hard refresh. Ako se i dalje vidi stara sesija, obriši sessionStorage/localStorage za domenu aplikacije.

Napomena: ako pokreneš stari `schema.sql` iz ranijih verzija projekta, on je ranije imao demo INSERT podatke. Ovaj `schema.sql` ih više nema.
