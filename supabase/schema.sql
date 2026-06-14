-- ZgradaApp Supabase schema
-- Ovaj fajl kreira tabele, indekse i osnovne dozvole za fakultetsku/demo verziju aplikacije.
-- U produkciji treba preći na Supabase Auth i restriktivne RLS policy-je po korisniku.

-- ZgradaApp / Supabase setup
-- Non-destructive setup: ne briše postojeće podatke.
-- Pokreni cijeli fajl u Supabase SQL Editoru.

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'povjerenik', 'uposlenik', 'stanar')),
  building_id TEXT,
  building_ids TEXT[] DEFAULT '{}',
  apartment TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  reference TEXT,
  hire_year INTEGER,
  position TEXT,
  bio TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT,
  floors INTEGER DEFAULT 5,
  units INTEGER DEFAULT 20,
  povjerenik_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  stanar_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  building_id TEXT REFERENCES public.buildings(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novi',
  assigned_to TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  povjerenik_note TEXT,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ticket_id TEXT REFERENCES public.tickets(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.time_entries (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  hours NUMERIC(6,2) NOT NULL,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  data TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);



CREATE TABLE IF NOT EXISTS public.registration_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  building_id TEXT REFERENCES public.buildings(id) ON DELETE SET NULL,
  apartment TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'na_cekanju',
  reviewed_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'na_cekanju',
  new_password TEXT,
  reviewed_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_import_batches (
  id TEXT PRIMARY KEY,
  povjerenik_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'na_cekanju',
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  source_file TEXT,
  error_message TEXT,
  reviewed_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES public.user_import_batches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'stanar',
  building_id TEXT REFERENCES public.buildings(id) ON DELETE SET NULL,
  apartment TEXT,
  reference TEXT,
  position TEXT,
  password TEXT,
  status TEXT NOT NULL DEFAULT 'na_cekanju',
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_tickets_building_id ON public.tickets(building_id);
CREATE INDEX IF NOT EXISTS idx_tickets_stanar_id ON public.tickets(stanar_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON public.comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_ticket_id ON public.time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON public.attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON public.registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status ON public.password_reset_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_import_batches_status ON public.user_import_batches(status);
CREATE INDEX IF NOT EXISTS idx_user_import_rows_batch_id ON public.user_import_rows(batch_id);

-- RLS je uključen kako bi se u projektu vidjelo da su sigurnosna pravila dio dizajna baze.
-- Pošto ova akademska verzija ne koristi Supabase Auth, policy-ji su demo/permisivni za anon i authenticated role.
-- U produkciji bi se pravila vezala za auth.uid() i ulogu stvarnog prijavljenog korisnika.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_import_rows ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buildings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_import_batches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_import_rows TO anon, authenticated;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','buildings','tickets','comments','notifications','time_entries','attachments','registration_requests','password_reset_requests','user_import_batches','user_import_rows'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS demo_select_%s ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS demo_insert_%s ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS demo_update_%s ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS demo_delete_%s ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY demo_select_%s ON public.%I FOR SELECT TO anon, authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY demo_insert_%s ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY demo_update_%s ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY demo_delete_%s ON public.%I FOR DELETE TO anon, authenticated USING (true)', tbl, tbl);
  END LOOP;
END $$;


-- Sigurnosni ALTER izrazi omogućavaju da se fajl pokrene i nad već postojećom bazom.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS building_ids TEXT[] DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Demo podaci nisu uključeni u schema.sql.
-- Za unos demo podataka koristi zasebne SQL/Excel import fajlove.
