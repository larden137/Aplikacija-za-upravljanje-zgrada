# ZgradaApp

Web aplikacija za evidenciju i obradu zahtjeva stanara u zgradama.

## Tehnologije

- HTML, CSS i JavaScript su odvojeni po fajlovima.
- Vite se koristi za lokalno pokretanje i produkcijski build.
- Supabase je glavni izvor podataka.
- Bootstrap i Bootstrap Icons se koriste za grid, forme, modale i ikonice.

## Lokalno pokretanje

```bash
npm install
npm run dev
```

## Environment varijable

U lokalnom `.env` fajlu ili u Vercel Environment Variables dodati:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

## Supabase

U Supabase SQL Editoru pokrenuti:

```text
supabase/schema.sql
```

Fajl kreira tabele, indekse, demo korisnike, demo zgrade i demo tikete.

## Demo nalozi

- admin@zgrada.ba / admin123
- povjerenik1@zgrada.ba / test123
- uposlenik1@zgrada.ba / test123
- stanar1@zgrada.ba / test123

## Deploy na Vercel

- Build command: `npm run build`
- Output directory: `dist`
- Framework preset: `Vite`

Prije deploy-a obavezno dodati `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` u Vercel Environment Variables.
