// Modul za prijavu i odjavu korisnika.
// U ovoj demo verziji korisnici se čitaju iz Supabase tabele `users`, a sesija se pamti samo kroz ID korisnika.

import DB from './db-adapter.js';

const SESSION_KEY = 'zgrada_session';

const Auth = {
  // Trenutno prijavljeni korisnik; ostatak aplikacije preko ovoga zna koja je uloga aktivna.
  currentUser: null,

  // Kod pokretanja aplikacije pokušavamo obnoviti sesiju iz sessionStorage-a.
  async init() {
    if (DB._ensureSync) await DB._ensureSync();

    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return false;

    try {
      const session = JSON.parse(saved);
      const user = await DB.findById('users', session.id);
      if (!user || !user.active) {
        this.logout();
        return false;
      }

      this.currentUser = user;
      return true;
    } catch (error) {
      console.warn('Sesija nije ispravna i bit će obrisana:', error);
      this.logout();
      return false;
    }
  },

  // Prijava poredi uneseni email i lozinku sa korisnicima iz Supabase-a.
  // Za produkciju bi se ovdje koristio Supabase Auth, ali za fakultetsku/demo verziju ovo je jednostavnije za prezentaciju.
  async login(email, password) {
    if (DB._ensureSync) await DB._ensureSync();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPassword = String(password || '').trim();

    const users = await DB.findAll('users');
    const user = users.find(item =>
      String(item.email || '').toLowerCase() === normalizedEmail &&
      String(item.password || '').trim() === normalizedPassword &&
      item.active
    );

    if (!user) {
      return { success: false, message: 'Pogrešan email ili lozinka.' };
    }

    this.currentUser = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id }));
    return { success: true, user };
  },

  // Odjava briše samo aktivnu browser sesiju, dok podaci u Supabase-u ostaju netaknuti.
  logout() {
    this.currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
  },

  // Provjerava da li trenutno prijavljeni korisnik ima jednu od traženih uloga.
  // Koristi se za prikaz dugmadi i akcija koje nisu dostupne svim korisnicima.
  hasRole(...roles) {
    if (!this.currentUser?.role) return false;
    return roles.includes(this.currentUser.role);
  },

  // Kraći naziv za provjeru jedne uloge; koristi se na mjestima gdje treba čitljiviji kod.
  is(role) {
    return this.hasRole(role);
  },

  // Centralna mapa prava po ulogama.
  // Ovako je lakše održavati pravila, jer se promjene ne rade na više mjesta u aplikaciji.
  can(permission) {
    const permissionsByRole = {
      administrator: ['approve_ticket', 'assign_ticket', 'close_ticket', 'log_time'],
      povjerenik: ['approve_ticket'],
      uposlenik: ['log_time'],
      stanar: ['close_ticket']
    };

    const role = this.currentUser?.role;
    return Boolean(role && permissionsByRole[role]?.includes(permission));
  },

  // Nakon izmjene profila osvježavamo korisnika iz baze da se u sidebaru prikažu najnoviji podaci.
  async refresh() {
    if (!this.currentUser) return null;
    this.currentUser = await DB.findById('users', this.currentUser.id) || this.currentUser;
    return this.currentUser;
  }
};

export default Auth;
