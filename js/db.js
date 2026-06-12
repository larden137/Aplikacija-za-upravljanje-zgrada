// Supabase sloj za rad sa bazom.
// Aplikacija interno koristi camelCase nazive polja, dok Supabase tabele koriste snake_case.
// Ovdje se zato radi mapiranje polja prije slanja u bazu i nakon čitanja iz baze.

import { createClient } from '@supabase/supabase-js';

// Vite environment varijable se čitaju iz .env fajla lokalno, odnosno iz Vercel Environment Variables u produkciji.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

// Klijent se kreira samo ako su URL i ključ dostupni; tako build ne puca ako .env još nije podešen.
export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Mapiranje logičkih kolekcija iz aplikacije na stvarne nazive tabela u Supabase-u.
const COLLECTION_TO_TABLE = {
  users: 'users',
  buildings: 'buildings',
  tickets: 'tickets',
  comments: 'comments',
  notifications: 'notifications',
  timeEntries: 'time_entries',
  attachments: 'attachments',
  registrationRequests: 'registration_requests',
  passwordResetRequests: 'password_reset_requests',
  userImportBatches: 'user_import_batches',
  userImportRows: 'user_import_rows'
};

// Mapiranje camelCase polja iz JavaScript-a na snake_case kolone u bazi.
const FIELD_TO_DB = {
  buildingId: 'building_id',
  buildingIds: 'building_ids',
  postalCode: 'postal_code',
  hireYear: 'hire_year',
  povjerenikId: 'povjerenik_id',
  stanarId: 'stanar_id',
  assignedTo: 'assigned_to',
  povjerenikNote: 'povjerenik_note',
  statusHistory: 'status_history',
  userId: 'user_id',
  ticketId: 'ticket_id',
  isInternal: 'is_internal',
  fileType: 'file_type',
  fileSize: 'file_size',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  requestedBy: 'requested_by',
  requestedAt: 'requested_at',
  reviewedBy: 'reviewed_by',
  reviewedAt: 'reviewed_at',
  newPassword: 'new_password',
  buildingName: 'building_name',
  batchId: 'batch_id',
  povjerenikId: 'povjerenik_id',
  totalRows: 'total_rows',
  importedRows: 'imported_rows',
  errorMessage: 'error_message',
  sourceFile: 'source_file',
  rawData: 'raw_data'
};

// Obrnuto mapiranje se koristi kada podaci dolaze iz Supabase-a nazad u aplikaciju.
const DB_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_DB).map(([k, v]) => [v, k]));

// Vraća naziv tabele za traženu kolekciju.
function tableName(collection) {
  return COLLECTION_TO_TABLE[collection] || collection;
}

// Preimenuje ključeve objekta bez mijenjanja originalnog objekta.
function mapKeys(row, dictionary) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [dictionary[key] || key, value])
  );
}

// Priprema jedan zapis za slanje u Supabase.
function toDb(row) {
  return mapKeys(row, FIELD_TO_DB);
}

// Vraća jedan zapis iz Supabase formata u format aplikacije.
function fromDb(row) {
  return mapKeys(row, DB_TO_FIELD);
}

// Vraća listu zapisa iz Supabase formata u format aplikacije.
function fromDbMany(rows) {
  return Array.isArray(rows) ? rows.map(fromDb) : [];
}

// Pomoćna funkcija za demo podatke, kako bi datumi izgledali realnije.
function nowMinusDays(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Demo podaci koji se ubacuju samo ako je Supabase baza prazna.
export function getDemoData() {
  const users = [
    { id: 'u1', name: 'Haris Hodžić', email: 'admin@zgrada.ba', password: 'admin123', role: 'administrator', buildingIds: [], active: true, reference: 'ADM-2017-001', hireYear: 2017, position: 'Sistem Administrator', bio: 'Odgovoran za cjelokupno funkcionisanje platforme.', phone: '061 111 222', createdAt: nowMinusDays(30) },
    { id: 'u2', name: 'Alma Begić', email: 'povjerenik1@zgrada.ba', password: 'test123', role: 'povjerenik', buildingIds: ['b1', 'b2'], active: true, reference: 'POV-2019-001', hireYear: 2019, createdAt: nowMinusDays(29) },
    { id: 'u3', name: 'Mirza Kovač', email: 'povjerenik2@zgrada.ba', password: 'test123', role: 'povjerenik', buildingIds: ['b3'], active: true, reference: 'POV-2020-002', hireYear: 2020, createdAt: nowMinusDays(28) },
    { id: 'u4', name: 'Amira Džaferović', email: 'stanar1@zgrada.ba', password: 'test123', role: 'stanar', buildingId: 'b1', buildingIds: [], apartment: 'Stan 12', active: true, reference: 'ZG-B1-0012', createdAt: nowMinusDays(27) },
    { id: 'u5', name: 'Senad Muratović', email: 'stanar2@zgrada.ba', password: 'test123', role: 'stanar', buildingId: 'b1', buildingIds: [], apartment: 'Stan 24', active: true, reference: 'ZG-B1-0024', createdAt: nowMinusDays(26) },
    { id: 'u6', name: 'Lejla Hasanović', email: 'stanar3@zgrada.ba', password: 'test123', role: 'stanar', buildingId: 'b2', buildingIds: [], apartment: 'Stan 5', active: true, reference: 'ZG-B2-0005', createdAt: nowMinusDays(25) },
    { id: 'u7', name: 'Dino Ćatić', email: 'stanar4@zgrada.ba', password: 'test123', role: 'stanar', buildingId: 'b3', buildingIds: [], apartment: 'Stan 8', active: true, reference: 'ZG-B3-0008', createdAt: nowMinusDays(24) },
    { id: 'u8', name: 'Emir Tahić', email: 'uposlenik1@zgrada.ba', password: 'test123', role: 'uposlenik', buildingIds: [], active: true, reference: 'EMP-2018-001', hireYear: 2018, position: 'Tehničar elektroinstalacija', createdAt: nowMinusDays(23) },
    { id: 'u9', name: 'Dina Omerović', email: 'uposlenik2@zgrada.ba', password: 'test123', role: 'uposlenik', buildingIds: [], active: true, reference: 'EMP-2019-002', hireYear: 2019, position: 'Vodoinstalater', createdAt: nowMinusDays(22) },
    { id: 'u10', name: 'Kemal Bašić', email: 'uposlenik3@zgrada.ba', password: 'test123', role: 'uposlenik', buildingIds: [], active: true, reference: 'EMP-2020-003', hireYear: 2020, position: 'Čistač', createdAt: nowMinusDays(21) }
  ];

  const buildings = [
    { id: 'b1', name: 'Trg heroja 5', address: 'Trg heroja 5', city: 'Sarajevo', postalCode: '71000', floors: 10, units: 40, povjerenikId: 'u2', createdAt: nowMinusDays(20) },
    { id: 'b2', name: 'Bulevar Mire 8', address: 'Bulevar Mire 8', city: 'Sarajevo', postalCode: '71000', floors: 8, units: 32, povjerenikId: 'u2', createdAt: nowMinusDays(19) },
    { id: 'b3', name: 'Ferhadija 12', address: 'Ferhadija 12', city: 'Sarajevo', postalCode: '71000', floors: 6, units: 24, povjerenikId: 'u3', createdAt: nowMinusDays(18) }
  ];

  const history = (status, changedBy, days, note = null) => [
    { status, changedBy, changedAt: nowMinusDays(days), note }
  ];

  const tickets = [
    { id: 't001', title: 'Oštećen poštanski sandučić - stan 7', description: 'Sandučić je slomljen.', stanarId: 'u4', buildingId: 'b1', category: 'konstrukcija', priority: 'niska', status: 'novi', assignedTo: null, povjerenikNote: null, statusHistory: history('novi', 'u4', 1), createdAt: nowMinusDays(1) },
    { id: 't002', title: 'Kvar na liftu - ne radi od juče', description: 'Lift je u kvaru.', stanarId: 'u5', buildingId: 'b1', category: 'lift', priority: 'visoka', status: 'u_toku', assignedTo: 'u8', povjerenikNote: null, statusHistory: history('u_toku', 'u8', 5), createdAt: nowMinusDays(5) },
    { id: 't003', title: 'Problem s centralnim grijanjem - hladni radijatori', description: 'Grijanje ne radi.', stanarId: 'u4', buildingId: 'b1', category: 'grijanje', priority: 'srednja', status: 'odobren', assignedTo: null, povjerenikNote: null, statusHistory: history('odobren', 'u2', 1), createdAt: nowMinusDays(1) },
    { id: 't004', title: 'Oštećena ulazna vrata zgrade - brava ne radi', description: 'Vrata ne zatvaraju.', stanarId: 'u5', buildingId: 'b2', category: 'konstrukcija', priority: 'visoka', status: 'dodjeljen', assignedTo: 'u8', povjerenikNote: null, statusHistory: history('dodjeljen', 'u1', 3), createdAt: nowMinusDays(3) },
    { id: 't005', title: 'Curenje vode u hodniku 2. sprat', description: 'Voda curi iz plafona.', stanarId: 'u6', buildingId: 'b2', category: 'vodoinstalacije', priority: 'visoka', status: 'odobren', assignedTo: null, povjerenikNote: null, statusHistory: history('odobren', 'u2', 2), createdAt: nowMinusDays(2) },
    { id: 't006', title: 'Kvar na pumpi za vodu - gornji spratovi bez pritiska', description: 'Nema vode na gornjim spratovima.', stanarId: 'u4', buildingId: 'b3', category: 'vodoinstalacije', priority: 'hitna', status: 'zatvoren', assignedTo: 'u9', povjerenikNote: null, statusHistory: history('zatvoren', 'u4', 13), createdAt: nowMinusDays(13) },
    { id: 't007', title: 'Vodovodna cijev pukla u podrumu zgrade', description: 'Voda curi u podrumu.', stanarId: 'u5', buildingId: 'b3', category: 'vodoinstalacije', priority: 'hitna', status: 'u_toku', assignedTo: 'u9', povjerenikNote: null, statusHistory: history('u_toku', 'u9', 2), createdAt: nowMinusDays(2) },
    { id: 't008', title: 'Buka od susjednog stana - noćna buka', description: 'Smetaju noćne buke.', stanarId: 'u7', buildingId: 'b3', category: 'ostalo', priority: 'niska', status: 'odbijen', assignedTo: null, povjerenikNote: 'Nije predmet tehničkog održavanja.', statusHistory: history('odbijen', 'u3', 26, 'Nije predmet tehničkog održavanja.'), createdAt: nowMinusDays(26) },
    { id: 't009', title: 'Kvar na električnom priključku - iskre', description: 'Vidim iskre kod priključka.', stanarId: 'u5', buildingId: 'b1', category: 'elektrika', priority: 'hitna', status: 'rijesen', assignedTo: 'u8', povjerenikNote: null, statusHistory: history('rijesen', 'u8', 8), createdAt: nowMinusDays(8) },
    { id: 't010', title: 'Vodovodna instalacija - curenje ispod umivaonika', description: 'Curi ispod umivaonika.', stanarId: 'u6', buildingId: 'b2', category: 'vodoinstalacije', priority: 'srednja', status: 'rijesen', assignedTo: 'u9', povjerenikNote: null, statusHistory: history('rijesen', 'u9', 5), createdAt: nowMinusDays(5) }
  ];

  return {
    users,
    buildings,
    tickets,
    comments: [],
    notifications: [],
    timeEntries: [],
    attachments: [],
    registrationRequests: [],
    passwordResetRequests: [],
    userImportBatches: [],
    userImportRows: []
  };
}

// Grupni upsert se koristi za prvo punjenje demo podataka.
export async function upsertMany(collection, rows) {
  if (!supabase || rows.length === 0) return [];
  const { data, error } = await supabase
    .from(tableName(collection))
    .upsert(rows.map(toDb), { onConflict: 'id' })
    .select('*');

  if (error) {
    console.error(`Greška pri upsert operaciji (${collection}):`, error);
    return [];
  }
  return fromDbMany(data);
}

const DB = {
  // ── FIND/READ ──
  async findAll(collection) {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from(tableName(collection))
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`Greška pri čitanju iz baze (${collection}):`, error);
      return [];
    }
    return fromDbMany(data);
  },

  async find(collection, filterFn) {
    const data = await this.findAll(collection);
    return data.filter(filterFn);
  },

  async findOne(collection, filterFn) {
    const data = await this.findAll(collection);
    return data.find(filterFn) || null;
  },

  async findById(collection, id) {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from(tableName(collection))
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`Greška pri čitanju zapisa po ID-u (${collection}):`, error);
      return null;
    }
    return data ? fromDb(data) : null;
  },

  // ── INSERT ──
  async insert(collection, item) {
    if (!supabase) return { ...item };

    const payload = {
      ...item,
      id: item.id || crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      createdAt: item.createdAt || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(tableName(collection))
      .insert([toDb(payload)])
      .select('*')
      .single();

    if (error) {
      console.error(`Greška pri upisu u bazu (${collection}):`, error);
      return { ...payload, _syncError: error.message };
    }
    return fromDb(data);
  },


  // ── UPSERT ──
  async upsert(collection, item) {
    if (!supabase) return { ...item, _syncError: 'Supabase is not configured' };

    const payload = {
      ...item,
      id: item.id || crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      createdAt: item.createdAt || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(tableName(collection))
      .upsert([toDb(payload)], { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      console.error(`Greška pri upsert operaciji (${collection}):`, error);
      return { ...payload, _syncError: error.message };
    }
    return fromDb(data);
  },

  async upsertMany(collection, rows) {
    return upsertMany(collection, rows);
  },

  // ── UPDATE ──
  async update(collection, id, updates) {
    if (!supabase) return { id, ...updates };

    const payload = { ...updates, updatedAt: new Date().toISOString() };
    const { data, error } = await supabase
      .from(tableName(collection))
      .update(toDb(payload))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error(`Greška pri ažuriranju baze (${collection}):`, error);
      return { id, ...payload, _syncError: error.message };
    }
    return fromDb(data);
  },

  // ── DELETE ──
  async delete(collection, id) {
    if (!supabase) return;

    const { error } = await supabase
      .from(tableName(collection))
      .delete()
      .eq('id', id);

    if (error) console.error(`Greška pri brisanju iz baze (${collection}):`, error);
  },

  // ── SEED (samo prvi put) ──
  async seed() {
    const existing = await this.findAll('users');
    if (existing.length > 0) return existing;

    const demo = getDemoData();
    await upsertMany('users', demo.users);
    await upsertMany('buildings', demo.buildings);
    await upsertMany('tickets', demo.tickets);

    if (import.meta.env.DEV) console.info('Baza je popunjena početnim demo podacima.');
    return demo.users;
  }
};

export default DB;
