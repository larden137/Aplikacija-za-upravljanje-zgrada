// Adapter između aplikacije i Supabase sloja.
// Supabase je jedini trajni izvor podataka.
// Memory cache postoji samo dok je stranica otvorena, jer ostatak aplikacije očekuje brze sinhrone metode.

import DBAsync from './db.js';

// Kolekcije koje aplikacija koristi kroz sve ekrane.
const CACHE_KEYS = [
  'users', 'tickets', 'buildings', 'comments', 'notifications', 'timeEntries', 'attachments',
  'registrationRequests', 'passwordResetRequests', 'userImportBatches', 'userImportRows'
];
// Stari ključ se koristi samo za jednokratnu migraciju podataka iz ranije lokalne verzije.
const LEGACY_STORAGE_KEY = 'zgrada_app_cache_v3';
const MIGRATION_FLAG_KEY = 'zgrada_supabase_migration_done_v1';

// Privremeni cache u memoriji; ne upisuje se u localStorage.
let cache = Object.fromEntries(CACHE_KEYS.map(key => [key, []]));
let isSynced = false;
let lastSyncError = null;

// Red čekanja za upise prema Supabase-u.
// Tiket mora biti stvarno upisan prije komentara, notifikacija i priloga, jer baza ima foreign key veze.
const pendingInserts = Object.fromEntries(CACHE_KEYS.map(key => [key, new Map()]));

// Duboka kopija se koristi kada treba vratiti prethodno stanje nakon neuspjelog upisa.
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Generiše ID kada novi zapis nema unaprijed dodijeljen ID.
function generateId(prefix = 'id') {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

// Provjerava da li stari lokalni cache uopšte sadrži korisne podatke.
function hasRows(data) {
  return data && CACHE_KEYS.some(key => Array.isArray(data[key]) && data[key].length > 0);
}

// Čita staru lokalnu verziju podataka samo radi migracije u Supabase.
function readLegacyLocalStorage() {
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return hasRows(parsed) ? parsed : null;
  } catch (error) {
    console.warn('Stari lokalni cache nije moguće pročitati:', error);
    return null;
  }
}

// Jednokratno prebacuje ranije lokalno spremljene podatke u Supabase.
async function migrateLegacyLocalStorageToSupabase() {
  const alreadyDone = localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
  if (alreadyDone) return;

  const legacy = readLegacyLocalStorage();
  if (!legacy) {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    return;
  }

  if (import.meta.env.DEV) console.info('Pokrenuta je migracija starih lokalnih podataka u Supabase.');

  // Redoslijed je bitan zbog foreign key veza.
  const order = ['users', 'buildings', 'tickets', 'comments', 'notifications', 'timeEntries', 'attachments', 'registrationRequests', 'passwordResetRequests', 'userImportBatches', 'userImportRows'];
  let failed = false;

  for (const collection of order) {
    const rows = Array.isArray(legacy[collection]) ? legacy[collection] : [];
    for (const row of rows) {
      const result = await DBAsync.upsert(collection, row);
      if (result?._syncError) failed = true;
    }
  }

  if (!failed) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    if (import.meta.env.DEV) console.info('Stari lokalni podaci su prebačeni u Supabase i uklonjeni iz browsera.');
  } else {
    console.warn('Migracija u Supabase nije potpuno uspjela, pa stari lokalni podaci nisu obrisani.');
  }
}

// Centralno bilježenje grešaka da se lakše vidi koja operacija nije prošla.
function notifySyncError(operation, collection, errorMessage) {
  lastSyncError = { operation, collection, errorMessage, at: new Date().toISOString() };
  console.error(`Supabase greška - ${operation} (${collection}):`, errorMessage);
  try {
    window.dispatchEvent(new CustomEvent('supabase-sync-error', { detail: lastSyncError }));
  } catch (_) {
    // U testnom okruženju window ne mora postojati, zato se ova greška sigurno ignoriše.
  }
}

async function syncFromSupabase() {
  if (import.meta.env.DEV) console.info('Sinhronizacija sa Supabase bazom je pokrenuta.');
  lastSyncError = null;

  for (const collection of CACHE_KEYS) {
    try {
      const rows = await DBAsync.findAll(collection);
      cache[collection] = Array.isArray(rows) ? rows : [];
    } catch (error) {
      notifySyncError('read', collection, error?.message || String(error));
    }
  }

  isSynced = true;
  if (import.meta.env.DEV) console.info('Sinhronizacija sa Supabase bazom je završena.');
}

const DB = {
  async _ensureSync() {
    if (!isSynced) await this.preload();
  },

  _lastSyncError() {
    return lastSyncError;
  },

  findAll(collection) {
    return cache[collection] || [];
  },

  find(collection, fn) {
    return (cache[collection] || []).filter(fn);
  },

  findOne(collection, fn) {
    return (cache[collection] || []).find(fn) || null;
  },

  findById(collection, id) {
    return (cache[collection] || []).find(item => item.id === id) || null;
  },

  insert(collection, item) {
    const localItem = {
      ...item,
      id: item.id || generateId(collection),
      createdAt: item.createdAt || new Date().toISOString()
    };

    cache[collection] = cache[collection] || [];
    cache[collection].push(localItem);

    const waits = [];

    // Povezani zapisi čekaju da tiket prvo postoji u Supabase-u.
    if (item.ticketId && pendingInserts.tickets?.has(item.ticketId)) {
      waits.push(pendingInserts.tickets.get(item.ticketId));
    }

    // Tiket čeka korisnika i zgradu ako se oni upravo ubacuju u istoj sesiji.
    if (collection === 'tickets') {
      if (item.stanarId && pendingInserts.users?.has(item.stanarId)) waits.push(pendingInserts.users.get(item.stanarId));
      if (item.buildingId && pendingInserts.buildings?.has(item.buildingId)) waits.push(pendingInserts.buildings.get(item.buildingId));
      if (item.assignedTo && pendingInserts.users?.has(item.assignedTo)) waits.push(pendingInserts.users.get(item.assignedTo));
    }

    const remotePromise = Promise.allSettled(waits)
      .then(() => DBAsync.insert(collection, localItem))
      .then(remoteItem => {
        if (!remoteItem || remoteItem._syncError) {
          cache[collection] = (cache[collection] || []).filter(row => row.id !== localItem.id);
          notifySyncError('insert', collection, remoteItem?._syncError || 'Upis nije prošao');
          return null;
        }
        const index = cache[collection].findIndex(row => row.id === localItem.id);
        if (index !== -1) cache[collection][index] = remoteItem;
        return remoteItem;
      })
      .catch(error => {
        cache[collection] = (cache[collection] || []).filter(row => row.id !== localItem.id);
        notifySyncError('insert', collection, error?.message || String(error));
        return null;
      })
      .finally(() => {
        pendingInserts[collection]?.delete(localItem.id);
      });

    pendingInserts[collection]?.set(localItem.id, remotePromise);

    return localItem;
  },

  update(collection, id, updates) {
    cache[collection] = cache[collection] || [];
    const index = cache[collection].findIndex(item => item.id === id);
    if (index === -1) return null;

    const previous = clone(cache[collection][index]);
    const localItem = {
      ...cache[collection][index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    cache[collection][index] = localItem;

    DBAsync.update(collection, id, updates).then(remoteItem => {
      if (!remoteItem || remoteItem._syncError) {
        const currentIndex = cache[collection].findIndex(row => row.id === id);
        if (currentIndex !== -1) cache[collection][currentIndex] = previous;
        notifySyncError('update', collection, remoteItem?._syncError || 'Ažuriranje nije prošlo');
        return;
      }
      const currentIndex = cache[collection].findIndex(row => row.id === id);
      if (currentIndex !== -1) cache[collection][currentIndex] = remoteItem;
    }).catch(error => {
      const currentIndex = cache[collection].findIndex(row => row.id === id);
      if (currentIndex !== -1) cache[collection][currentIndex] = previous;
      notifySyncError('update', collection, error?.message || String(error));
    });

    return localItem;
  },

  delete(collection, id) {
    const previousRows = clone(cache[collection] || []);
    cache[collection] = (cache[collection] || []).filter(item => item.id !== id);

    DBAsync.delete(collection, id).catch(error => {
      cache[collection] = previousRows;
      notifySyncError('delete', collection, error?.message || String(error));
    });
  },

  async seed() {
    // Automatski seed je namjerno isključen.
    // Aplikacija sada prikazuje isključivo podatke koji postoje u Supabase bazi.
    return;
  },

  async preload() {
    await migrateLegacyLocalStorageToSupabase();
    await syncFromSupabase();
  },

  async resync() {
    await syncFromSupabase();
  },

  clearMemoryCache() {
    cache = Object.fromEntries(CACHE_KEYS.map(key => [key, []]));
    isSynced = false;
  }
};

export default DB;
export { syncFromSupabase, migrateLegacyLocalStorageToSupabase };
