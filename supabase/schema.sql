-- ZgradaApp Supabase schema
-- Ovaj fajl kreira tabele, indekse, demo podatke i osnovne dozvole za fakultetsku/demo verziju aplikacije.
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

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_tickets_building_id ON public.tickets(building_id);
CREATE INDEX IF NOT EXISTS idx_tickets_stanar_id ON public.tickets(stanar_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON public.comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_ticket_id ON public.time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON public.attachments(ticket_id);

-- Demo/fakultetska verzija: frontend koristi anon/publishable ključ za čitanje i upis.
-- Za stvarnu produkciju ovdje uključiti RLS i napisati policy-je vezane za Supabase Auth korisnika.
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buildings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO anon, authenticated;

-- Demo korisnici. ON CONFLICT čuva postojeće ID-jeve i ažurira demo podatke ako ih ponovo pokreneš.
INSERT INTO public.users (id, name, email, password, role, building_id, building_ids, apartment, active, reference, hire_year, position, bio, phone, created_at)
VALUES
('u1', 'Haris Hodžić', 'admin@zgrada.ba', 'admin123', 'administrator', NULL, ARRAY[]::TEXT[], NULL, TRUE, 'ADM-2017-001', 2017, 'Sistem Administrator', 'Odgovoran za cjelokupno funkcionisanje platforme.', '061 111 222', NOW() - INTERVAL '30 days'),
('u2', 'Alma Begić', 'povjerenik1@zgrada.ba', 'test123', 'povjerenik', NULL, ARRAY['b1','b2']::TEXT[], NULL, TRUE, 'POV-2019-001', 2019, NULL, NULL, NULL, NOW() - INTERVAL '29 days'),
('u3', 'Mirza Kovač', 'povjerenik2@zgrada.ba', 'test123', 'povjerenik', NULL, ARRAY['b3']::TEXT[], NULL, TRUE, 'POV-2020-002', 2020, NULL, NULL, NULL, NOW() - INTERVAL '28 days'),
('u4', 'Amira Džaferović', 'stanar1@zgrada.ba', 'test123', 'stanar', 'b1', ARRAY[]::TEXT[], 'Stan 12', TRUE, 'ZG-B1-0012', NULL, NULL, NULL, NULL, NOW() - INTERVAL '27 days'),
('u5', 'Senad Muratović', 'stanar2@zgrada.ba', 'test123', 'stanar', 'b1', ARRAY[]::TEXT[], 'Stan 24', TRUE, 'ZG-B1-0024', NULL, NULL, NULL, NULL, NOW() - INTERVAL '26 days'),
('u6', 'Lejla Hasanović', 'stanar3@zgrada.ba', 'test123', 'stanar', 'b2', ARRAY[]::TEXT[], 'Stan 5', TRUE, 'ZG-B2-0005', NULL, NULL, NULL, NULL, NOW() - INTERVAL '25 days'),
('u7', 'Dino Ćatić', 'stanar4@zgrada.ba', 'test123', 'stanar', 'b3', ARRAY[]::TEXT[], 'Stan 8', TRUE, 'ZG-B3-0008', NULL, NULL, NULL, NULL, NOW() - INTERVAL '24 days'),
('u8', 'Emir Tahić', 'uposlenik1@zgrada.ba', 'test123', 'uposlenik', NULL, ARRAY[]::TEXT[], NULL, TRUE, 'EMP-2018-001', 2018, 'Tehničar elektroinstalacija', NULL, NULL, NOW() - INTERVAL '23 days'),
('u9', 'Dina Omerović', 'uposlenik2@zgrada.ba', 'test123', 'uposlenik', NULL, ARRAY[]::TEXT[], NULL, TRUE, 'EMP-2019-002', 2019, 'Vodoinstalater', NULL, NULL, NOW() - INTERVAL '22 days'),
('u10', 'Kemal Bašić', 'uposlenik3@zgrada.ba', 'test123', 'uposlenik', NULL, ARRAY[]::TEXT[], NULL, TRUE, 'EMP-2020-003', 2020, 'Čistač', NULL, NULL, NOW() - INTERVAL '21 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  building_id = EXCLUDED.building_id,
  building_ids = EXCLUDED.building_ids,
  apartment = EXCLUDED.apartment,
  active = EXCLUDED.active,
  reference = EXCLUDED.reference,
  hire_year = EXCLUDED.hire_year,
  position = EXCLUDED.position,
  bio = EXCLUDED.bio,
  phone = EXCLUDED.phone;

INSERT INTO public.buildings (id, name, address, city, postal_code, floors, units, povjerenik_id, created_at)
VALUES
('b1', 'Trg heroja 5', 'Trg heroja 5', 'Sarajevo', '71000', 10, 40, 'u2', NOW() - INTERVAL '20 days'),
('b2', 'Bulevar Mire 8', 'Bulevar Mire 8', 'Sarajevo', '71000', 8, 32, 'u2', NOW() - INTERVAL '19 days'),
('b3', 'Ferhadija 12', 'Ferhadija 12', 'Sarajevo', '71000', 6, 24, 'u3', NOW() - INTERVAL '18 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  postal_code = EXCLUDED.postal_code,
  floors = EXCLUDED.floors,
  units = EXCLUDED.units,
  povjerenik_id = EXCLUDED.povjerenik_id;

INSERT INTO public.tickets (id, title, description, stanar_id, building_id, category, priority, status, assigned_to, povjerenik_note, status_history, created_at)
VALUES
('t001', 'Oštećen poštanski sandučić - stan 7', 'Sandučić je slomljen.', 'u4', 'b1', 'konstrukcija', 'niska', 'novi', NULL, NULL, jsonb_build_array(jsonb_build_object('status','novi','changedBy','u4','changedAt',(NOW() - INTERVAL '1 day')::TEXT,'note',NULL)), NOW() - INTERVAL '1 day'),
('t002', 'Kvar na liftu - ne radi od juče', 'Lift je u kvaru.', 'u5', 'b1', 'lift', 'visoka', 'u_toku', 'u8', NULL, jsonb_build_array(jsonb_build_object('status','u_toku','changedBy','u8','changedAt',(NOW() - INTERVAL '5 days')::TEXT,'note',NULL)), NOW() - INTERVAL '5 days'),
('t003', 'Problem s centralnim grijanjem - hladni radijatori', 'Grijanje ne radi.', 'u4', 'b1', 'grijanje', 'srednja', 'odobren', NULL, NULL, jsonb_build_array(jsonb_build_object('status','odobren','changedBy','u2','changedAt',(NOW() - INTERVAL '1 day')::TEXT,'note',NULL)), NOW() - INTERVAL '1 day'),
('t004', 'Oštećena ulazna vrata zgrade - brava ne radi', 'Vrata ne zatvaraju.', 'u5', 'b2', 'konstrukcija', 'visoka', 'dodjeljen', 'u8', NULL, jsonb_build_array(jsonb_build_object('status','dodjeljen','changedBy','u1','changedAt',(NOW() - INTERVAL '3 days')::TEXT,'note',NULL)), NOW() - INTERVAL '3 days'),
('t005', 'Curenje vode u hodniku 2. sprat', 'Voda curi iz plafona.', 'u6', 'b2', 'vodoinstalacije', 'visoka', 'odobren', NULL, NULL, jsonb_build_array(jsonb_build_object('status','odobren','changedBy','u2','changedAt',(NOW() - INTERVAL '2 days')::TEXT,'note',NULL)), NOW() - INTERVAL '2 days'),
('t006', 'Kvar na pumpi za vodu - gornji spratovi bez pritiska', 'Nema vode na gornjim spratovima.', 'u4', 'b3', 'vodoinstalacije', 'hitna', 'zatvoren', 'u9', NULL, jsonb_build_array(jsonb_build_object('status','zatvoren','changedBy','u4','changedAt',(NOW() - INTERVAL '13 days')::TEXT,'note',NULL)), NOW() - INTERVAL '13 days'),
('t007', 'Vodovodna cijev pukla u podrumu zgrade', 'Voda curi u podrumu.', 'u5', 'b3', 'vodoinstalacije', 'hitna', 'u_toku', 'u9', NULL, jsonb_build_array(jsonb_build_object('status','u_toku','changedBy','u9','changedAt',(NOW() - INTERVAL '2 days')::TEXT,'note',NULL)), NOW() - INTERVAL '2 days'),
('t008', 'Buka od susjednog stana - noćna buka', 'Smetaju noćne buke.', 'u7', 'b3', 'ostalo', 'niska', 'odbijen', NULL, 'Nije predmet tehničkog održavanja.', jsonb_build_array(jsonb_build_object('status','odbijen','changedBy','u3','changedAt',(NOW() - INTERVAL '26 days')::TEXT,'note','Nije predmet tehničkog održavanja.')), NOW() - INTERVAL '26 days'),
('t009', 'Kvar na električnom priključku - iskre', 'Vidim iskre kod priključka.', 'u5', 'b1', 'elektrika', 'hitna', 'rijesen', 'u8', NULL, jsonb_build_array(jsonb_build_object('status','rijesen','changedBy','u8','changedAt',(NOW() - INTERVAL '8 days')::TEXT,'note',NULL)), NOW() - INTERVAL '8 days'),
('t010', 'Vodovodna instalacija - curenje ispod umivaonika', 'Curi ispod umivaonika.', 'u6', 'b2', 'vodoinstalacije', 'srednja', 'rijesen', 'u9', NULL, jsonb_build_array(jsonb_build_object('status','rijesen','changedBy','u9','changedAt',(NOW() - INTERVAL '5 days')::TEXT,'note',NULL)), NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  stanar_id = EXCLUDED.stanar_id,
  building_id = EXCLUDED.building_id,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  assigned_to = EXCLUDED.assigned_to,
  povjerenik_note = EXCLUDED.povjerenik_note,
  status_history = EXCLUDED.status_history;
