// Glavni kontroler aplikacije.
// Ovaj fajl upravlja navigacijom, prikazom stranica, tiketima, zgradama, korisnicima i obavijestima.

import DB from './db-adapter.js';
import Auth from './auth.js';
import * as XLSX from 'xlsx';

const App = {
  currentPage: null,
  currentParams: {},
  previousPage: null,
  previousParams: {},
  _initialized: false,

  // ── OSNOVNE POSTAVKE ───────────────────────────────────────────────────

  // Statusi su prikazani korisniku čitljivim nazivima.
  STATUS_LABELS: {
    novi:'Novi', odobren:'Odobren', odbijen:'Odbijen',
    dodjeljen:'Dodijeljen', u_toku:'U toku', rijesen:'Riješen', zatvoren:'Zatvoren'
  },
  // Dozvoljeni tok statusa zavisi od uloge korisnika.
  STATUS_FLOW: {
    stanar:        { rijesen: ['zatvoren'] },
    povjerenik:    { novi: ['odobren','odbijen'] },
    uposlenik:     { dodjeljen: ['u_toku'], u_toku: ['rijesen'] },
    administrator: { novi:['odobren','odbijen'], odobren:['dodjeljen'], dodjeljen:['u_toku'], u_toku:['rijesen'], rijesen:['zatvoren'] }
  },
  // Kategorije pomažu da se zahtjevi grupišu po tipu problema.
  CATEGORIES: {
    lift:'Lift / Elevator', vodoinstalacije:'Vodoinstalacije', elektrika:'Elektrika',
    grijanje:'Grijanje / Hlađenje', ciscoca:'Čistoća', konstrukcija:'Konstrukcija',ostalo:'Ostalo'
  },
  // Prioritet određuje hitnost intervencije.
  PRIORITIES: { niska:'Niska', srednja:'Srednja', visoka:'Visoka', hitna:'Hitna' },
  // Uloge određuju koje ekrane i akcije korisnik može koristiti.
  ROLES: { administrator:'Administrator', povjerenik:'Povjerenik', uposlenik:'Uposlenik', stanar:'Stanar' },

  // ── POKRETANJE APLIKACIJE ───────────────────────────────────────────────

  // Pokretanje aplikacije: prvo se učitaju podaci iz Supabase-a, zatim se provjeri postojeća sesija.
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    await DB.preload();
    await DB.seed();

    if (await Auth.init()) {
      this.showApp();
      this.navigate('dashboard');
    } else {
      this.showLogin();
    }
    this._bindGlobal();
    this._startNotifPoller();
  },

  // Prikazuje ekran za prijavu kada korisnik nije prijavljen ili je sesija istekla.
  showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app-wrapper').style.display = 'none';
  },

  // Prikazuje glavni interfejs nakon uspješne prijave.
  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'flex';
    this.renderSidebar();
    this.updateNotifBadge();
  },

  // ── BOČNI MENI ──────────────────────────────────────────────────────────

  // Kreira bočni meni prema ulozi prijavljenog korisnika.
  renderSidebar() {
    const u = Auth.currentUser;
    if (!u) {
      this.showLogin();
      return;
    }
    const initials = (u.name || 'Korisnik').split(' ').map(n=>n[0]).join('').toUpperCase().substr(0,2);
    const navItems = this._getNavItems();

    document.getElementById('sidebar').innerHTML = `
      <div class="sidebar-logo" onclick="App.navigate('dashboard')">
        <i class="bi bi-buildings-fill"></i>
        <span>ZgradaApp</span>
      </div>
      <div class="sidebar-user">
        <div class="avatar avatar-${u.id}">${initials}</div>
        <div>
          <div class="user-name">${this.esc(u.name)}</div>
          <div class="user-role">${this.ROLES[u.role]}</div>
        </div>
      </div>
      <ul class="sidebar-nav" id="sidebar-nav">
        ${navItems.map(item => item.divider
          ? `<li><div class="sidebar-section-title">${item.label}</div></li>`
          : `<li id="nav-${item.id}">
              <a href="#" onclick="App.navigate('${item.id}');return false;">
                <i class="bi ${item.icon}"></i> ${item.label}
                ${item.badge ? `<span class="nav-badge" id="nav-badge-${item.id}"></span>` : ''}
              </a>
             </li>`
        ).join('')}
      </ul>
      <div class="sidebar-footer">
        <button onclick="App.doLogout()">
          <i class="bi bi-box-arrow-left"></i> Odjava
        </button>
      </div>`;
    this.updateNotifBadge();
    this._updateNavBadges();
  },

  // Vraća stavke menija; svaka uloga vidi samo module koji su joj potrebni.
  _getNavItems() {
    const role = Auth.currentUser?.role;
    if (!role) return [];
    const base = [
      { id:'dashboard',      icon:'bi-speedometer2',   label:'Dashboard' },
    ];
    if (role === 'stanar') return [...base,
      { divider:true, label:'Tiketi' },
      { id:'tickets',        icon:'bi-ticket-detailed', label:'Moji Tiketi' },
      { id:'new-ticket',     icon:'bi-plus-circle',     label:'Novi Zahtjev' },
      { divider:true, label:'Ostalo' },
      { id:'notifications',  icon:'bi-bell',            label:'Obavijesti', badge:true },
    ];
    if (role === 'povjerenik') return [...base,
      { divider:true, label:'Tiketi' },
      { id:'tickets',        icon:'bi-ticket-detailed', label:'Tiketi Zgrade',  badge:true },
      { divider:true, label:'Upravljanje' },
      { id:'buildings',      icon:'bi-buildings',       label:'Moje Zgrade' },
      { id:'notifications',  icon:'bi-bell',            label:'Obavijesti', badge:true },
    ];
    if (role === 'uposlenik') return [...base,
      { divider:true, label:'Zadaci' },
      { id:'tickets',        icon:'bi-ticket-detailed', label:'Moji Zadaci' },
      { id:'notifications',  icon:'bi-bell',            label:'Obavijesti', badge:true },
    ];
    // Meni za administratora ima sve module jer ova uloga upravlja cijelim sistemom.
    return [...base,
      { divider:true, label:'Tiketi' },
      { id:'tickets',        icon:'bi-ticket-detailed', label:'Svi Tiketi' },
      { id:'new-ticket',     icon:'bi-plus-circle',     label:'Novi Tiket' },
      { divider:true, label:'Upravljanje' },
      { id:'buildings',      icon:'bi-buildings',       label:'Zgrade' },
      { id:'users',          icon:'bi-people',          label:'Korisnici' },
      { id:'notifications',  icon:'bi-bell',            label:'Obavijesti', badge:true },
    ];
  },

  // Vizuelno označava trenutno aktivnu stavku u meniju.
  setActiveNav(id) {
    document.querySelectorAll('#sidebar-nav li').forEach(li => li.classList.remove('active'));
    const el = document.getElementById(`nav-${id}`);
    if (el) el.classList.add('active');
  },

  // Osvježava male brojače u meniju, npr. broj novih tiketa za povjerenika.
  _updateNavBadges() {
    const u = Auth.currentUser;
    // Povjerenik u meniju vidi broj novih tiketa koji čekaju obradu.
    if (u.role === 'povjerenik') {
      const pending = DB.find('tickets', t =>
        t.status === 'novi' && u.buildingIds.includes(t.buildingId)
      ).length;
      const el = document.getElementById('nav-badge-tickets');
      if (el) el.textContent = pending || '';
    }
  },

  // ── NAVIGACIJA ──────────────────────────────────────────────────────────

  // Jednostavan router: mijenja aktivnu stranicu i poziva odgovarajuću render funkciju.
  navigate(page, params = {}) {
    this.currentPage = page;
    this.currentParams = params;
    this.setActiveNav(page);

    const titles = {
      dashboard: 'Dashboard', tickets: 'Tiketi', 'new-ticket': 'Novi Tiket',
      'ticket-detail': 'Detalji Tiketa', buildings: 'Zgrade',
      users: 'Korisnici', notifications: 'Obavijesti', 'user-profile': 'Profil Korisnika'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none'; // Sakrijemo sve stranice prije prikaza tražene stranice.
    });
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      pageEl.style.display = 'block'; // Prikažemo samo aktivnu stranicu.
    }

    const renders = {
      dashboard:       () => this.renderDashboard(),
      tickets:         () => this.renderTickets(),
      'new-ticket':    () => this.renderNewTicket(),
      'ticket-detail': () => this.renderTicketDetail(params.id),
      buildings:       () => this.renderBuildings(),
      users:           () => this.renderUsers(),
      notifications:   () => this.renderNotifications(),
      'user-profile':  () => this.renderUserProfile(params.id),
    };
    renders[page]?.();
    this.closeSidebar();
  },

  // ── PRIJAVA I ODJAVA ────────────────────────────────────────────────────

  // Obrađuje submit forme za prijavu i prikazuje grešku ako podaci nisu ispravni.
  async doLogin(e) {
    e && e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;
    const err   = document.getElementById('login-error');
    err.style.display = 'none';
    const result = await Auth.login(email, pass);
    if (result.success) {
      this.showApp();
      this.navigate('dashboard');
    } else {
      err.textContent = result.message;
      err.style.display = 'block';
    }
  },

  // Popunjava demo nalog u login formi radi bržeg testiranja.
  fillDemo(email, pass) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-pass').value  = pass;
  },

  // Odjavljuje korisnika i vraća aplikaciju na login ekran.
  doLogout() {
    Auth.logout();
    this.showLogin();
  },

  // ── POČETNI PREGLED ─────────────────────────────────────────────────────

  // Preusmjerava dashboard na prikaz koji odgovara ulozi korisnika.
  renderDashboard() {
    const role = Auth.currentUser.role;
    const el = document.getElementById('page-dashboard');
    if (role === 'stanar')        el.innerHTML = this._stanarDashboard();
    else if (role === 'povjerenik') el.innerHTML = this._povjerenikDashboard();
    else if (role === 'uposlenik')  el.innerHTML = this._uposlenikDashboard();
    else                            el.innerHTML = this._adminDashboard();
    this._renderChart();
  },

  // Dashboard stanara prikazuje njegove tikete, statuse i zadnje obavijesti.
  _stanarDashboard() {
    const u = Auth.currentUser;
    const myTickets = DB.find('tickets', t => t.stanarId === u.id);
    const active = myTickets.filter(t => !['zatvoren','odbijen'].includes(t.status)).length;
    const resolved = myTickets.filter(t => t.status === 'zatvoren').length;
    const pending  = myTickets.filter(t => t.status === 'novi').length;
    const unread = DB.find('notifications', n => n.userId === u.id && !n.read).length;
    const building = DB.findById('buildings', u.buildingId);

    return `
      <div class="row g-3 mb-4">
        ${this._statCard('bi-ticket-detailed','Ukupno zahtjeva', myTickets.length, '#dbeafe','#2563eb')}
        ${this._statCard('bi-clock-history','Aktivni', active, '#ffedd5','#c2410c', "App._filterDashboardData('active')")}
        ${this._statCard('bi-check-circle','Zatvoreni', resolved, '#dcfce7','#15803d', "App._filterDashboardData('closed')")}
        ${this._statCard('bi-bell','Nepročitane obavijesti', unread, '#fef9c3','#854d0e', "App._filterDashboardData('unread')")}
      </div>
      <div class="row g-3">
        <div class="col-lg-8">
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-ticket-detailed me-2"></i>Moji Zahtjevi</h6>
              <button class="btn btn-primary btn-sm" onclick="App.navigate('new-ticket')">
                <i class="bi bi-plus"></i> Novi Zahtjev
              </button>
            </div>
            <div class="card-body-custom">
              ${myTickets.length === 0
                ? `<div class="empty-state"><i class="bi bi-inbox"></i><p>Nemate podnesenih zahtjeva.</p></div>`
                : `<table class="ticket-table">
                    <thead><tr>
                      <th>Zahtjev</th><th>Kategorija</th><th>Prioritet</th><th>Status</th><th>Datum</th>
                    </tr></thead>
                    <tbody>
                      ${myTickets.slice().reverse().map(t => `
                        <tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                          <td><span class="fw-600">${this.esc(t.title)}</span></td>
                          <td>${this.catIcon(t.category)} ${this.CATEGORIES[t.category]||t.category}</td>
                          <td>${this.priorityBadge(t.priority)}</td>
                          <td>${this.statusBadge(t.status)}</td>
                          <td class="text-tiny text-secondary">${this.fmtDate(t.createdAt)}</td>
                        </tr>`).join('')}
                    </tbody>
                   </table>`}
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          ${building ? `
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-building me-2"></i>Moja Zgrada</h6></div>
            <div class="p-3">
              <div class="fw-600">${this.esc(building.name)}</div>
              <div class="text-tiny text-secondary">${this.esc(building.address)}, ${this.esc(building.city)}</div>
              <div class="mt-2 text-tiny"><span class="text-secondary">Stan:</span> <strong>${this.esc(u.apartment||'—')}</strong></div>
              ${(() => { const pov = DB.findById('users', building.povjerenikId);
                return pov ? `<div class="mt-1 text-tiny"><span class="text-secondary">Povjerenik:</span> <strong>${this.esc(pov.name)}</strong></div>` : ''; })()}
            </div>
          </div>` : ''}
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-bell me-2"></i>Obavijesti</h6>
              <a href="#" onclick="App.navigate('notifications');return false" class="text-tiny text-primary">Sve</a>
            </div>
            <div class="card-body-custom">
              ${this._recentNotifs(u.id, 4)}
            </div>
          </div>
        </div>
      </div>`;
  },

  // Dashboard povjerenika prikazuje tikete zgrada za koje je zadužen.
  _povjerenikDashboard() {
    const u = Auth.currentUser;
    const myBuildingIds = u.buildingIds || [];
    const allTickets = DB.find('tickets', t => myBuildingIds.includes(t.buildingId));
    const pending  = allTickets.filter(t => t.status === 'novi').length;
    const active   = allTickets.filter(t => ['odobren','dodjeljen','u_toku'].includes(t.status)).length;
    const resolved = allTickets.filter(t => ['rijesen','zatvoren'].includes(t.status)).length;
    const unread   = DB.find('notifications', n => n.userId === u.id && !n.read).length;
    const buildings = myBuildingIds.map(bid => DB.findById('buildings', bid)).filter(Boolean);

    const awaitingApproval = allTickets.filter(t => t.status === 'novi');

    return `
      <div class="row g-3 mb-4">
        ${this._statCard('bi-hourglass-split','Na čekanju', pending, '#fef9c3','#854d0e', "App._filterDashboardData('pending')")}
        ${this._statCard('bi-arrow-repeat','Aktivni', active, '#ffedd5','#c2410c', "App._filterDashboardData('active')")}
        ${this._statCard('bi-check-circle','Zatvoreni', resolved, '#dcfce7','#15803d', "App._filterDashboardData('closed')")}
        ${this._statCard('bi-bell','Nepročitane obav.', unread, '#fce7f3','#be185d', "App._filterDashboardData('unread')")}
      </div>
      <div class="row g-3">
        <div class="col-lg-8">
          ${awaitingApproval.length > 0 ? `
          <div class="app-card mb-3">
            <div class="card-header-custom">
              <h6><i class="bi bi-exclamation-circle text-warning me-2"></i>Zahtjevi koji čekaju odobrenje</h6>
              <span class="badge bg-warning text-dark">${awaitingApproval.length}</span>
            </div>
            <div class="card-body-custom">
              <table class="ticket-table">
                <thead><tr><th>Zahtjev</th><th>Zgrada</th><th>Podnosilac</th><th>Prioritet</th><th>Datum</th><th></th></tr></thead>
                <tbody>
                  ${awaitingApproval.map(t => {
                    const b = DB.findById('buildings', t.buildingId);
                    const s = DB.findById('users', t.stanarId);
                    return `<tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                      <td class="fw-600">${this.esc(t.title)}</td>
                      <td>${this.esc(b?.name||'—')}</td>
                      <td>${this.esc(s?.name||'—')}</td>
                      <td>${this.priorityBadge(t.priority)}</td>
                      <td class="text-tiny text-secondary">${this.fmtDate(t.createdAt)}</td>
                      <td><span class="badge bg-warning text-dark">Na čekanju</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-ticket-detailed me-2"></i>Svi Tiketi Zgrada</h6>
              <a href="#" onclick="App.navigate('tickets');return false" class="btn btn-sm btn-outline-secondary">Vidi sve</a>
            </div>
            <div class="card-body-custom">
              ${allTickets.length === 0
                ? `<div class="empty-state"><i class="bi bi-inbox"></i><p>Nema tiketa.</p></div>`
                : `<table class="ticket-table">
                    <thead><tr><th>Zahtjev</th><th>Zgrada</th><th>Prioritet</th><th>Status</th><th>Datum</th></tr></thead>
                    <tbody>
                      ${allTickets.slice().reverse().slice(0,6).map(t => {
                        const b = DB.findById('buildings', t.buildingId);
                        return `<tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                          <td class="fw-600">${this.esc(t.title)}</td>
                          <td>${this.esc(b?.name||'—')}</td>
                          <td>${this.priorityBadge(t.priority)}</td>
                          <td>${this.statusBadge(t.status)}</td>
                          <td class="text-tiny text-secondary">${this.fmtDate(t.createdAt)}</td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                   </table>`}
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-buildings me-2"></i>Moje Zgrade</h6></div>
            <div class="p-3">
              ${buildings.map(b => {
                const bTickets = DB.find('tickets', t => t.buildingId === b.id);
                return `<div class="building-card mb-2 p-3" onclick="App.navigate('buildings')" style="cursor:pointer">
                  <div class="building-name">${this.esc(b.name)}</div>
                  <div class="building-addr">${this.esc(b.address)}, ${this.esc(b.city)}</div>
                  <div class="mt-2 d-flex gap-2 flex-wrap">
                    <span class="badge bg-secondary">${b.floors} spratova</span>
                    <span class="badge bg-secondary">${b.units} stanova</span>
                    <span class="badge bg-warning text-dark">${bTickets.filter(t=>t.status==='novi').length} na čekanju</span>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="app-card">
            <div class="card-header-custom"><h6><i class="bi bi-bell me-2"></i>Obavijesti</h6></div>
            <div class="card-body-custom">${this._recentNotifs(u.id, 4)}</div>
          </div>
        </div>
      </div>`;
  },

  // Dashboard uposlenika prikazuje dodijeljene zadatke i aktivne intervencije.
  _uposlenikDashboard() {
    const u = Auth.currentUser;
    const assigned = DB.find('tickets', t => t.assignedTo === u.id);
    const inProgress = assigned.filter(t => t.status === 'u_toku').length;
    const done = assigned.filter(t => ['rijesen','zatvoren'].includes(t.status)).length;
    const myTimes = DB.find('timeEntries', te => te.userId === u.id);
    const today = new Date().toISOString().split('T')[0];
    const todayHours = myTimes.filter(te => te.date === today).reduce((s,te) => s+te.hours, 0);
    const weekHours  = myTimes.reduce((s,te) => s+te.hours, 0);

    return `
      <div class="row g-3 mb-4">
        ${this._statCard('bi-list-task','Dodijeljeni zadaci', assigned.length, '#dbeafe','#2563eb')}
        ${this._statCard('bi-arrow-repeat','U toku', inProgress, '#ffedd5','#c2410c', "App._filterDashboardData('active')")}
        ${this._statCard('bi-check-circle','Završeni', done, '#dcfce7','#15803d', "App._filterDashboardData('closed')")}
        ${this._statCard('bi-clock','Sati danas', todayHours.toFixed(1)+'h', '#fce7f3','#be185d')}
      </div>
      <div class="row g-3">
        <div class="col-lg-8">
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-list-task me-2"></i>Moji Zadaci</h6>
              <a href="#" onclick="App.navigate('tickets');return false" class="btn btn-sm btn-outline-secondary">Vidi sve</a>
            </div>
            <div class="card-body-custom">
              ${assigned.length === 0
                ? `<div class="empty-state"><i class="bi bi-inbox"></i><p>Nemate dodijeljenih zadataka.</p></div>`
                : `<table class="ticket-table">
                    <thead><tr><th>Zadatak</th><th>Zgrada</th><th>Prioritet</th><th>Status</th><th>Datum</th></tr></thead>
                    <tbody>
                      ${assigned.filter(t=>!['rijesen','zatvoren'].includes(t.status)).map(t => {
                        const b = DB.findById('buildings', t.buildingId);
                        return `<tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                          <td class="fw-600">${this.esc(t.title)}</td>
                          <td>${this.esc(b?.name||'—')}</td>
                          <td>${this.priorityBadge(t.priority)}</td>
                          <td>${this.statusBadge(t.status)}</td>
                          <td class="text-tiny text-secondary">${this.fmtDate(t.createdAt)}</td>
                        </tr>`;
                      }).join('')}
                    </tbody>
                   </table>`}
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-clock me-2"></i>Evidencija Vremena</h6></div>
            <div class="p-3">
              <div class="d-flex justify-content-between mb-2">
                <span class="text-tiny text-secondary">Danas</span>
                <strong class="text-primary">${todayHours.toFixed(1)}h</strong>
              </div>
              <div class="d-flex justify-content-between">
                <span class="text-tiny text-secondary">Ukupno</span>
                <strong class="text-primary">${weekHours.toFixed(1)}h</strong>
              </div>
              <hr class="my-2">
              ${myTimes.slice().reverse().slice(0,3).map(te => {
                const t = DB.findById('tickets', te.ticketId);
                return `<div class="time-entry-item">
                  <span class="time-hours">${te.hours}h</span>
                  <div style="flex:1">
                    <div class="text-tiny fw-600">${t ? this.esc(t.title) : '—'}</div>
                    <div class="text-tiny text-secondary">${this.esc(te.description)}</div>
                  </div>
                  <div class="text-tiny text-secondary">${te.date}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="app-card">
            <div class="card-header-custom"><h6><i class="bi bi-bell me-2"></i>Obavijesti</h6></div>
            <div class="card-body-custom">${this._recentNotifs(u.id, 3)}</div>
          </div>
        </div>
      </div>`;
  },

  // Administratorski dashboard daje pregled cijelog sistema.
  _adminDashboard() {
    const tickets   = DB.findAll('tickets');
    const users     = DB.findAll('users');
    const buildings = DB.findAll('buildings');

    const byStatus = (s) => tickets.filter(t => t.status === s).length;
    const unread = DB.find('notifications', n => n.userId === Auth.currentUser.id && !n.read).length;

    return `
      <div class="row g-3 mb-4">
        ${this._statCard('bi-ticket-detailed','Ukupno tiketa', tickets.length, '#dbeafe','#2563eb')}
        ${this._statCard('bi-people','Korisnici', users.length, '#ede9fe','#5b21b6')}
        ${this._statCard('bi-buildings','Zgrade', buildings.length, '#d1fae5','#065f46')}
        ${this._statCard('bi-exclamation-triangle','Na čekanju', byStatus('novi'), '#fef9c3','#854d0e', "App._filterDashboardData('pending')")}
      </div>
      <div class="row g-3 mb-3">
        ${this._statCard('bi-check-circle','Riješeni', byStatus('rijesen')+byStatus('zatvoren'), '#dcfce7','#15803d', "App._filterDashboardData('closed')")}
        ${this._statCard('bi-arrow-repeat','U toku', byStatus('u_toku'), '#ffedd5','#c2410c', "App._filterDashboardData('active')")}
        ${this._statCard('bi-person-check','Dodijeljeni', byStatus('dodjeljen'), '#fce7f3','#be185d')}
        ${this._statCard('bi-x-circle','Odbijeni', byStatus('odbijen'), '#f1f5f9','#475569')}
      </div>
      <div class="row g-3">
        <div class="col-lg-8">
          <div class="app-card mb-3">
            <div class="card-header-custom">
              <h6><i class="bi bi-bar-chart me-2"></i>Tiketi po statusu</h6>
            </div>
            <div class="p-3"><canvas id="status-chart" height="140"></canvas></div>
          </div>
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-ticket-detailed me-2"></i>Najnoviji Tiketi</h6>
              <a href="#" onclick="App.navigate('tickets');return false" class="btn btn-sm btn-outline-secondary">Vidi sve</a>
            </div>
            <div class="card-body-custom">
              <table class="ticket-table">
                <thead><tr><th>Tiket</th><th>Zgrada</th><th>Prioritet</th><th>Status</th><th>Dodijeljeno</th></tr></thead>
                <tbody>
                  ${tickets.slice().reverse().slice(0,6).map(t => {
                    const b = DB.findById('buildings', t.buildingId);
                    const a = t.assignedTo ? DB.findById('users', t.assignedTo) : null;
                    return `<tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                      <td class="fw-600">${this.esc(t.title)}</td>
                      <td>${this.esc(b?.name||'—')}</td>
                      <td>${this.priorityBadge(t.priority)}</td>
                      <td>${this.statusBadge(t.status)}</td>
                      <td class="text-tiny">${a ? this.esc(a.name) : '<span class="text-secondary">—</span>'}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-lightning me-2"></i>Brze akcije</h6></div>
            <div class="p-3 d-grid gap-2">
              <button class="btn btn-primary btn-sm" onclick="App.navigate('new-ticket')"><i class="bi bi-plus me-1"></i>Novi Tiket</button>
              <button class="btn btn-outline-secondary btn-sm" onclick="App.navigate('users')"><i class="bi bi-person-plus me-1"></i>Novi Korisnik</button>
              <button class="btn btn-outline-secondary btn-sm" onclick="App.navigate('buildings')"><i class="bi bi-building-add me-1"></i>Nova Zgrada</button>
              <button class="btn btn-outline-secondary btn-sm" onclick="App.navigate('tickets')"><i class="bi bi-list-check me-1"></i>Upravljaj Tiketima</button>
            </div>
          </div>
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-people me-2"></i>Uposlenici</h6></div>
            <div class="p-3">
              ${users.filter(u=>u.role==='uposlenik').map(u => {
                const assigned = DB.find('tickets', t => t.assignedTo === u.id && !['rijesen','zatvoren'].includes(t.status)).length;
                return `<div class="d-flex align-items-center gap-2 mb-2">
                  <div class="avatar avatar-${u.id}">${u.name.split(' ').map(n=>n[0]).join('').substr(0,2)}</div>
                  <div style="flex:1">
                    <div class="text-tiny fw-600">${this.esc(u.name)}</div>
                    <div class="text-tiny text-secondary">${assigned} aktivnih zadataka</div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="app-card">
            <div class="card-header-custom"><h6><i class="bi bi-bell me-2"></i>Obavijesti</h6></div>
            <div class="card-body-custom">${this._recentNotifs(Auth.currentUser.id, 3)}</div>
          </div>
        </div>
      </div>`;
  },

  // Generiše jednu karticu sa statistikom na dashboardu.
  _statCard(icon, label, value, bgColor, iconColor, onclick) {
    return `<div class="col-6 col-md-3">
      <div class="stat-card" style="cursor:pointer" ${onclick ? `onclick="${onclick}"` : ''}>
        <div class="stat-icon" style="background:${bgColor}">
          <i class="bi ${icon}" style="color:${iconColor}"></i>
        </div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    </div>`;
  },

  // Prikazuje zadnje obavijesti za odabranog korisnika.
  _recentNotifs(userId, limit) {
    const notifs = DB.find('notifications', n => n.userId === userId)
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    if (!notifs.length) return `<div class="empty-state" style="padding:20px"><i class="bi bi-bell-slash"></i><p>Nema obavijesti.</p></div>`;
    return notifs.map(n => `
      <div class="notif-item ${n.read?'':'unread'}" onclick="App.markNotifRead('${n.id}','${n.ticketId}')">
        <div class="notif-icon ${n.read?'bg-light':'bg-primary bg-opacity-10'}">
          <i class="bi ${this._notifIcon(n.type)} ${n.read?'text-secondary':'text-primary'}"></i>
        </div>
        <div style="flex:1">
          <div class="notif-title">${this.esc(n.title)}</div>
          <div class="notif-time">${this.fmtDate(n.createdAt)}</div>
        </div>
        ${!n.read ? '<div class="notif-dot"></div>' : ''}
      </div>`).join('');
  },

  // Bira ikonicu obavijesti prema tipu događaja.
  _notifIcon(type) {
    return {
      status_changed:'bi-arrow-left-right', ticket_assigned:'bi-person-check',
      new_ticket:'bi-ticket-detailed', comment:'bi-chat-text',
      registration_request:'bi-person-plus', password_reset:'bi-key', user_import:'bi-file-earmark-spreadsheet'
    }[type] || 'bi-bell';
  },

  // Iscrtava grafikon statusa tiketa ako je Chart.js dostupan.
  _renderChart() {
    const canvas = document.getElementById('status-chart');
    if (!canvas) return;
    const tickets = DB.findAll('tickets');
    const statuses = Object.keys(this.STATUS_LABELS);
    const data = statuses.map(s => tickets.filter(t => t.status === s).length);
    const colors = ['#2563eb','#0369a1','#b91c1c','#854d0e','#c2410c','#15803d','#475569'];
    if (window.statusChart) window.statusChart.destroy();
    window.statusChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: statuses.map(s => this.STATUS_LABELS[s]),
        datasets: [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false }]
      },
      options: {
        responsive: true, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
                  x: { grid: { display: false } } }
      }
    });
  },

  // ── LISTA TIKETA ────────────────────────────────────────────────────────

  // Prikazuje listu tiketa filtriranu prema ulozi korisnika.
  renderTickets() {
    const u = Auth.currentUser;
    let tickets = DB.findAll('tickets');

    if (u.role === 'stanar')     tickets = tickets.filter(t => t.stanarId === u.id);
    if (u.role === 'povjerenik') tickets = tickets.filter(t => u.buildingIds.includes(t.buildingId));
    if (u.role === 'uposlenik')  tickets = tickets.filter(t => t.assignedTo === u.id);

    tickets = tickets.slice().reverse();

    const el = document.getElementById('page-tickets');
    el.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex gap-2 flex-wrap">
          <select class="form-select form-select-sm" id="filter-status" style="width:auto" onchange="App.filterTickets()">
            <option value="">Svi statusi</option>
            ${Object.entries(this.STATUS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <select class="form-select form-select-sm" id="filter-priority" style="width:auto" onchange="App.filterTickets()">
            <option value="">Svi prioriteti</option>
            ${Object.entries(this.PRIORITIES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          ${u.role !== 'stanar' ? `
          <select class="form-select form-select-sm" id="filter-building" style="width:auto" onchange="App.filterTickets()">
            <option value="">Sve zgrade</option>
            ${DB.findAll('buildings').map(b => `<option value="${b.id}">${this.esc(b.name)}</option>`).join('')}
          </select>` : ''}
          <input type="text" class="form-control form-control-sm" id="filter-search" placeholder="Pretraži..." style="width:200px" oninput="App.filterTickets()">
        </div>
        ${u.role === 'stanar' || u.role === 'administrator'
          ? `<button class="btn btn-primary btn-sm" onclick="App.navigate('new-ticket')"><i class="bi bi-plus me-1"></i>Novi Tiket</button>` : ''}
      </div>

      <div class="app-card">
        <div class="card-body-custom">
          <div id="tickets-table-wrap">
            ${this._ticketsTable(tickets)}
          </div>
        </div>
      </div>`;
    this._ticketRows = tickets;
  },

  // Generiše tabelu tiketa sa statusima, prioritetima i osnovnim informacijama.
  _ticketsTable(tickets) {
    const u = Auth.currentUser;
    if (!tickets.length) return `<div class="empty-state"><i class="bi bi-inbox"></i><p>Nema tiketa koji odgovaraju filtru.</p></div>`;
    return `<table class="ticket-table">
      <thead><tr>
        <th>#</th><th>Naslov</th>
        ${u.role !== 'stanar' ? '<th>Podnosilac</th>' : ''}
        <th>Zgrada</th><th>Kategorija</th><th>Prioritet</th><th>Status</th>
        ${u.role === 'administrator' ? '<th>Dodijeljeno</th>' : ''}
        <th>Datum</th>
      </tr></thead>
      <tbody>
        ${tickets.map((t,i) => {
          const b = DB.findById('buildings', t.buildingId);
          const s = DB.findById('users', t.stanarId);
          const a = t.assignedTo ? DB.findById('users', t.assignedTo) : null;
          return `<tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
            <td data-label="#" class="text-tiny text-secondary">${String(i+1).padStart(3,'0')}</td>
            <td data-label="Naslov">
              <div class="fw-600">${this.esc(t.title)}</div>
              <div class="text-tiny text-secondary">${this.catIcon(t.category)} ${this.CATEGORIES[t.category]||t.category}</div>
            </td>
            ${u.role !== 'stanar' ? `<td data-label="Podnosilac" class="text-tiny">${s ? this.esc(s.name) : '—'}</td>` : ''}
            <td data-label="Zgrada" class="text-tiny">${b ? this.esc(b.name) : '—'}</td>
            <td data-label="Kategorija">${this.catIcon(t.category)}</td>
            <td data-label="Prioritet">${this.priorityBadge(t.priority)}</td>
            <td data-label="Status">${this.statusBadge(t.status)}</td>
            ${u.role === 'administrator' ? `<td data-label="Dodijeljeno" class="text-tiny">${a ? this.esc(a.name) : '<span class="text-secondary">—</span>'}</td>` : ''}
            <td data-label="Datum" class="text-tiny text-secondary">${this.fmtDate(t.createdAt)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  },

  // Filtrira tikete po tekstu, statusu, prioritetu i kategoriji.
  filterTickets() {
    const status   = document.getElementById('filter-status')?.value   || '';
    const priority = document.getElementById('filter-priority')?.value  || '';
    const building = document.getElementById('filter-building')?.value  || '';
    const search   = document.getElementById('filter-search')?.value.toLowerCase() || '';

    const u = Auth.currentUser;
    let tickets = DB.findAll('tickets');
    if (u.role === 'stanar')     tickets = tickets.filter(t => t.stanarId === u.id);
    if (u.role === 'povjerenik') tickets = tickets.filter(t => u.buildingIds.includes(t.buildingId));
    if (u.role === 'uposlenik')  tickets = tickets.filter(t => t.assignedTo === u.id);

    if (status)   tickets = tickets.filter(t => t.status === status);
    if (priority) tickets = tickets.filter(t => t.priority === priority);
    if (building) tickets = tickets.filter(t => t.buildingId === building);
    if (search)   tickets = tickets.filter(t => t.title.toLowerCase().includes(search) || t.description.toLowerCase().includes(search));

    tickets = tickets.slice().reverse();
    document.getElementById('tickets-table-wrap').innerHTML = this._ticketsTable(tickets);
  },

  // ── DETALJI TIKETA ──────────────────────────────────────────────────────

  // Prikazuje detalje jednog tiketa: opis, status, komentare, priloge i istoriju promjena.
  renderTicketDetail(id) {
    if (!id) return;
    const t = DB.findById('tickets', id);
    if (!t) { this.navigate('tickets'); return; }
    const u      = Auth.currentUser;
    const building = DB.findById('buildings', t.buildingId);
    const stanar   = DB.findById('users', t.stanarId);
    const assigned = t.assignedTo ? DB.findById('users', t.assignedTo) : null;
    const comments = DB.find('comments', c => c.ticketId === id);
    const times    = DB.find('timeEntries', te => te.ticketId === id);
    const attachments = DB.find('attachments', a => a.ticketId === id);
    const isInternal  = Auth.hasRole('uposlenik','povjerenik','administrator');

    const visibleComments = isInternal ? comments : comments.filter(c => !c.isInternal);
    const totalHours = times.reduce((s,te) => s+te.hours, 0);

    const canApprove  = Auth.can('approve_ticket') && t.status === 'novi' &&
                        (u.role === 'administrator' || (u.buildingIds||[]).includes(t.buildingId));
    const canAssign   = Auth.can('assign_ticket') && t.status === 'odobren' && !t.assignedTo;
    const canReassign = Auth.can('assign_ticket') && ['dodjeljen','u_toku'].includes(t.status);
    const nextStatuses= (this.STATUS_FLOW[u.role]||{})[t.status] || [];
    const canClose    = Auth.can('close_ticket') && t.status === 'rijesen' && (u.role === 'administrator' || t.stanarId === u.id);

    const el = document.getElementById('page-ticket-detail');
    el.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" onclick="App.goBack('tickets')">
          <i class="bi bi-arrow-left me-1"></i>Nazad
        </button>
      </div>

      <!-- Header -->
      <div class="ticket-detail-header mb-3">
        <div class="d-flex align-items-start justify-content-between flex-wrap gap-2">
          <div style="flex:1">
            <div class="ticket-id-label">#${id.toUpperCase().substr(-6)}</div>
            <div class="ticket-title-large">${this.esc(t.title)}</div>
            <div class="d-flex flex-wrap gap-2 align-items-center">
              ${this.statusBadge(t.status)}
              ${this.priorityBadge(t.priority)}
              <span class="badge-status" style="background:#f1f5f9;color:#475569">
                <i class="bi bi-tag"></i> ${this.CATEGORIES[t.category]||t.category}
              </span>
              <span class="text-tiny text-secondary ms-1">
                Podneseno ${this.fmtDate(t.createdAt)}
              </span>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            ${canApprove ? `
              <button class="btn btn-success btn-sm" onclick="App.openApproveModal('${id}','odobren')"><i class="bi bi-check-lg me-1"></i>Odobri</button>
              <button class="btn btn-danger btn-sm"  onclick="App.openApproveModal('${id}','odbijen')"><i class="bi bi-x-lg me-1"></i>Odbij</button>` : ''}
            ${canAssign   ? `<button class="btn btn-warning btn-sm text-dark" onclick="App.openAssignModal('${id}')"><i class="bi bi-person-check me-1"></i>Dodijeli</button>` : ''}
            ${canReassign ? `<button class="btn btn-outline-warning btn-sm" onclick="App.openAssignModal('${id}')"><i class="bi bi-person-check me-1"></i>Preusmjeri</button>` : ''}
            ${nextStatuses.filter(s=>s!=='zatvoren').map(s =>
              `<button class="btn btn-primary btn-sm" onclick="App.changeStatus('${id}','${s}')">
                <i class="bi bi-arrow-right-circle me-1"></i>${this.STATUS_LABELS[s]}
              </button>`
            ).join('')}
            ${canClose ? `<button class="btn btn-secondary btn-sm" onclick="App.changeStatus('${id}','zatvoren')"><i class="bi bi-lock me-1"></i>Zatvori</button>` : ''}
          </div>
        </div>
        ${t.povjerenikNote ? `
          <div class="alert ${t.status==='odbijen'?'alert-danger':'alert-info'} mt-3 mb-0 py-2">
            <i class="bi bi-chat-quote me-2"></i><strong>Napomena povjerenika:</strong> ${this.esc(t.povjerenikNote)}
          </div>` : ''}
      </div>

      <div class="row g-3">
        <!-- Glavna kolona sa opisom tiketa, komentarima i radnim evidencijama. -->
        <div class="col-lg-8">
          <!-- Description -->
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-file-text me-2"></i>Opis problema</h6></div>
            <div class="p-3" style="font-size:.9rem;line-height:1.7;color:#374151">${this.esc(t.description)}</div>
          </div>

          <!-- Attachments -->
          <div class="app-card mb-3">
            <div class="card-header-custom">
              <h6><i class="bi bi-paperclip me-2"></i>Prilog / Fotografija</h6>
              <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('attach-input-${id}').click()">
                <i class="bi bi-upload me-1"></i>Dodaj
              </button>
              <input type="file" id="attach-input-${id}" class="d-none" accept="image/*,.pdf,.doc,.docx"
                     onchange="App.uploadAttachment('${id}', this)">
            </div>
            <div class="p-3" id="attachments-list">
              ${attachments.length === 0
                ? `<div class="text-tiny text-secondary">Nema priloženih fajlova.</div>`
                : attachments.map(a => `
                    <div class="attachment-item">
                      <i class="bi ${a.fileType?.startsWith('image')?'bi-image':'bi-file-earmark'}"></i>
                      <span class="attach-name">${this.esc(a.filename)}</span>
                      <span class="attach-size">${this.fmtFileSize(a.fileSize)}</span>
                      ${a.fileType?.startsWith('image') ? `<a href="${a.data}" target="_blank" class="btn btn-sm btn-outline-secondary py-0">Pregled</a>` : ''}
                    </div>`).join('')}
            </div>
          </div>

          <!-- Comments -->
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-chat-text me-2"></i>Komentari (${visibleComments.length})</h6></div>
            <div class="p-3" id="comments-list">
              ${visibleComments.length === 0
                ? `<div class="text-tiny text-secondary mb-3">Nema komentara.</div>`
                : visibleComments.map(c => {
                    return `<div class="comment-item ${c.isInternal?'internal':''}">
                      <div class="comment-meta d-flex align-items-center gap-2">
                        ${this.userLink(c.userId)}
                        ${c.isInternal ? '<span class="badge bg-warning text-dark">Interno</span>' : ''}
                        <span class="text-secondary">${this.fmtDate(c.createdAt)}</span>
                      </div>
                      <div class="comment-body">${this.esc(c.content)}</div>
                    </div>`;
                  }).join('')}
            </div>
            <div class="p-3 border-top">
              <div class="mb-2">
                <textarea class="form-control" id="comment-text" rows="3" placeholder="Napišite komentar..."></textarea>
              </div>
              <div class="d-flex gap-2 align-items-center">
                ${isInternal ? `<div class="form-check me-2">
                  <input class="form-check-input" type="checkbox" id="comment-internal">
                  <label class="form-check-label text-tiny" for="comment-internal">Interno (vidljivo samo zaposlenima)</label>
                </div>` : ''}
                <button class="btn btn-primary btn-sm ms-auto" onclick="App.addComment('${id}')">
                  <i class="bi bi-send me-1"></i>Pošalji
                </button>
              </div>
            </div>
          </div>

          <!-- Time entries (internal) -->
          ${isInternal ? `
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-clock me-2"></i>Evidencija Vremena (${totalHours.toFixed(1)}h ukupno)</h6>
              ${Auth.can('log_time') ? `<button class="btn btn-sm btn-outline-secondary" onclick="App.openTimeModal('${id}')">+ Dodaj</button>` : ''}
            </div>
            <div class="p-3" id="time-list">
              ${times.length === 0
                ? `<div class="text-tiny text-secondary">Nema evidentiranog vremena.</div>`
                : times.map(te => {
                    return `<div class="time-entry-item">
                      <span class="time-hours">${te.hours}h</span>
                      <div style="flex:1">
                        <div class="text-tiny fw-600">${this.esc(te.description)}</div>
                        <div class="text-tiny text-secondary">${this.userLink(te.userId)} • ${te.date}</div>
                      </div>
                    </div>`;
                  }).join('')}
            </div>
          </div>` : ''}
        </div>

        <!-- Sidebar -->
        <div class="col-lg-4">
          <div class="app-card mb-3">
            <div class="card-header-custom"><h6><i class="bi bi-info-circle me-2"></i>Detalji</h6></div>
            <div class="p-3" style="font-size:.83rem">
              ${this._detailRow('Zgrada', building ? `${this.esc(building.name)}, ${this.esc(building.city)}` : '—')}
              ${this._detailRow('Podnosilac', stanar ? this.esc(stanar.name) : '—')}
              ${stanar?.apartment ? this._detailRow('Stan', this.esc(stanar.apartment)) : ''}
              ${this._detailRow('Kategorija', `${this.catIcon(t.category)} ${this.CATEGORIES[t.category]||t.category}`)}
              ${this._detailRow('Prioritet', this.priorityBadge(t.priority))}
              ${this._detailRow('Status', this.statusBadge(t.status))}
              ${assigned ? this._detailRow('Dodijeljen', this.esc(assigned.name)) : ''}
              ${this._detailRow('Kreiran', this.fmtDate(t.createdAt))}
              ${t.updatedAt ? this._detailRow('Ažuriran', this.fmtDate(t.updatedAt)) : ''}
            </div>
          </div>

          <div class="app-card">
            <div class="card-header-custom"><h6><i class="bi bi-clock-history me-2"></i>Historija Statusa</h6></div>
            <div class="p-3">
              <ul class="status-timeline">
                ${(t.statusHistory||[]).map(sh => {
                  const by = DB.findById('users', sh.changedBy);
                  const initials = by?.name.split(' ').map(n=>n[0]).join('').substr(0,2)||'?';
                  return `<li>
                    <div class="timeline-dot status-${sh.status}">${this._statusIcon(sh.status)}</div>
                    <div class="timeline-content">
                      <div class="timeline-status">${this.STATUS_LABELS[sh.status]||sh.status}</div>
                      <div class="timeline-meta">${by ? this.esc(by.name) : '—'} • ${this.fmtDate(sh.changedAt)}</div>
                      ${sh.note ? `<div class="timeline-note">"${this.esc(sh.note)}"</div>` : ''}
                    </div>
                  </li>`;
                }).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Modals -->
      ${this._approveModal(id)}
      ${this._assignModal(id)}
      ${this._timeModal(id)}`;
  },

  // Pomoćni prikaz jednog reda u panelu detalja tiketa.
  _detailRow(label, value) {
    return `<div class="d-flex justify-content-between mb-2 pb-1" style="border-bottom:1px solid #f1f5f9">
      <span class="text-secondary">${label}</span>
      <span class="fw-600 text-end">${value}</span>
    </div>`;
  },

  // Vraća ikonicu koja najbolje opisuje trenutni status tiketa.
  _statusIcon(status) {
    return { novi:'<i class="bi bi-circle"></i>', odobren:'<i class="bi bi-check"></i>',
             odbijen:'<i class="bi bi-x"></i>', dodjeljen:'<i class="bi bi-person"></i>',
             u_toku:'<i class="bi bi-arrow-repeat"></i>', rijesen:'<i class="bi bi-check-all"></i>',
             zatvoren:'<i class="bi bi-lock"></i>' }[status] || '';
  },

  // Priprema modal za odobravanje ili odbijanje zahtjeva.
  _approveModal(ticketId) {
    return `<div class="modal fade" id="approveModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-3">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title" id="approveModalTitle">Odobri Zahtjev</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="approve-action">
            <div class="mb-3">
              <label class="form-label">Napomena (opcionalno)</label>
              <textarea class="form-control" id="approve-note" rows="3" placeholder="Unesite napomenu povjerenika..."></textarea>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Odustani</button>
            <button type="button" class="btn btn-primary" id="approve-confirm-btn" onclick="App.confirmApprove('${ticketId}')">Potvrdi</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Priprema modal za dodjelu tiketa uposleniku.
  _assignModal(ticketId) {
    const employees = DB.find('users', u => u.role === 'uposlenik' && u.active);
    return `<div class="modal fade" id="assignModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-3">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title">Dodijeli Zadatak</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Odaberite uposlenika</label>
              <select class="form-select" id="assign-user">
                <option value="">-- Odaberite --</option>
                ${employees.map(e => {
                  const active = DB.find('tickets', t => t.assignedTo === e.id && !['rijesen','zatvoren'].includes(t.status)).length;
                  return `<option value="${e.id}">${this.esc(e.name)} (${active} aktivnih)`;
                }).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Odustani</button>
            <button type="button" class="btn btn-primary" onclick="App.confirmAssign('${ticketId}')">Dodijeli</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Priprema modal za unos utrošenog vremena na intervenciji.
  _timeModal(ticketId) {
    return `<div class="modal fade" id="timeModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-3">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title">Evidentiranje Vremena</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label">Sati</label>
              <input type="number" class="form-control" id="time-hours" min="0.25" max="24" step="0.25" placeholder="npr. 2.5">
            </div>
            <div class="mb-3">
              <label class="form-label">Datum</label>
              <input type="date" class="form-control" id="time-date" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="mb-3">
              <label class="form-label">Opis rada</label>
              <textarea class="form-control" id="time-desc" rows="2" placeholder="Šta ste radili?"></textarea>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Odustani</button>
            <button type="button" class="btn btn-primary" onclick="App.confirmTime('${ticketId}')">Sačuvaj</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Otvara modal za potvrdu odluke povjerenika ili administratora.
  openApproveModal(ticketId, action) {
    document.getElementById('approve-action').value = action;
    document.getElementById('approveModalTitle').textContent = action === 'odobren' ? 'Odobri Zahtjev' : 'Odbij Zahtjev';
    document.getElementById('approve-confirm-btn').className = `btn btn-${action === 'odobren' ? 'success' : 'danger'}`;
    document.getElementById('approve-confirm-btn').textContent = action === 'odobren' ? 'Odobri' : 'Odbij';
    document.getElementById('approve-note').value = '';
    new bootstrap.Modal(document.getElementById('approveModal')).show();
  },

  // Sprema odluku o odobravanju ili odbijanju tiketa.
  confirmApprove(ticketId) {
    const action = document.getElementById('approve-action').value;
    const note   = document.getElementById('approve-note').value.trim();
    this.changeStatus(ticketId, action, note);
    bootstrap.Modal.getInstance(document.getElementById('approveModal')).hide();
  },

  // Otvara modal za dodjelu tiketa uposleniku.
  openAssignModal(ticketId) {
    document.getElementById('assign-user').value = '';
    new bootstrap.Modal(document.getElementById('assignModal')).show();
  },

  // Dodjeljuje tiket odabranom uposleniku i šalje obavijest.
  confirmAssign(ticketId) {
    const userId = document.getElementById('assign-user').value;
    if (!userId) { this.toast('Odaberite uposlenika.', 'warning'); return; }
    const ticket = DB.findById('tickets', ticketId);
    const employee = DB.findById('users', userId);
    DB.update('tickets', ticketId, {
      assignedTo: userId,
      status: 'dodjeljen',
      statusHistory: [...(ticket.statusHistory||[]), {
        status: 'dodjeljen', changedBy: Auth.currentUser.id,
        changedAt: new Date().toISOString(), note: `Dodjeljen ${employee.name}.`
      }]
    });
    this._notify(ticket.stanarId, 'status_changed', 'Tehničar dodijeljen',
      `Na vaš tiket "${ticket.title}" je dodijeljen tehničar ${employee.name}.`, ticketId);
    this._notify(userId, 'ticket_assigned', 'Novi zadatak dodijeljen',
      `Dodijeljen vam je tiket "${ticket.title}".`, ticketId);
    const modal = bootstrap.Modal.getInstance(document.getElementById('assignModal'));
    if (modal) modal.hide();
    this.toast('Tiket dodijeljen ' + employee.name + '.', 'success');
    setTimeout(() => {
      this.renderTicketDetail(ticketId);
      this.updateNotifBadge();
    }, 300);
  },

  // Otvara unos vremena za rad na konkretnom tiketu.
  openTimeModal(ticketId) {
    new bootstrap.Modal(document.getElementById('timeModal')).show();
  },

  // Sprema utrošene sate rada na tiketu.
  confirmTime(ticketId) {
    const hours = parseFloat(document.getElementById('time-hours').value);
    const date  = document.getElementById('time-date').value;
    const desc  = document.getElementById('time-desc').value.trim();
    if (!hours || hours <= 0) { this.toast('Unesite validne sate.', 'warning'); return; }
    if (!date)  { this.toast('Odaberite datum.', 'warning'); return; }
    if (!desc)  { this.toast('Unesite opis rada.', 'warning'); return; }
    DB.insert('timeEntries', { ticketId, userId: Auth.currentUser.id, hours, date, description: desc });
    bootstrap.Modal.getInstance(document.getElementById('timeModal')).hide();
    this.toast('Evidentirano ' + hours + 'h.', 'success');
    this.renderTicketDetail(ticketId);
  },

  // Mijenja status tiketa i upisuje promjenu u istoriju statusa.
  changeStatus(ticketId, newStatus, note = '') {
    const t = DB.findById('tickets', ticketId);
    if (!t) return;
    DB.update('tickets', ticketId, {
      status: newStatus,
      povjerenikNote: note || t.povjerenikNote,
      statusHistory: [...(t.statusHistory||[]), {
        status: newStatus, changedBy: Auth.currentUser.id,
        changedAt: new Date().toISOString(), note: note || null
      }]
    });
    const stanarMsg = {
      odobren:  `Vaš tiket "${t.title}" je odobren od povjerenika.`,
      odbijen:  `Vaš tiket "${t.title}" je odbijen. ${note ? 'Razlog: ' + note : ''}`,
      u_toku:   `Rad na vašem tiketu "${t.title}" je počeo.`,
      rijesen:  `Vaš tiket "${t.title}" je označen kao riješen.`,
      zatvoren: `Vaš tiket "${t.title}" je zatvoren.`,
    }[newStatus];
    if (stanarMsg) {
      this._notify(t.stanarId, 'status_changed', 'Status tiketa promijenjen', stanarMsg, ticketId);
    }
    this.toast(`Status promijenjen u: ${this.STATUS_LABELS[newStatus]}.`, 'success');
    setTimeout(() => {
      this.renderTicketDetail(ticketId);
      this.updateNotifBadge();
      this._updateNavBadges();
    }, 300);
  },

  // Dodaje komentar na tiket; interni komentari su vidljivi samo ovlaštenim ulogama.
  addComment(ticketId) {
    const content  = document.getElementById('comment-text').value.trim();
    const internal = document.getElementById('comment-internal')?.checked || false;
    if (!content) { this.toast('Unesite tekst komentara.', 'warning'); return; }
    DB.insert('comments', { ticketId, userId: Auth.currentUser.id, content, isInternal: internal });
    const t = DB.findById('tickets', ticketId);
    if (!internal && t.stanarId !== Auth.currentUser.id) {
      this._notify(t.stanarId, 'comment', 'Novi komentar',
        `${Auth.currentUser.name} je ostavio komentar na vaš tiket "${t.title}".`, ticketId);
    }
    this.toast('Komentar dodat.', 'success');
    this.renderTicketDetail(ticketId);
    this.updateNotifBadge();
  },

  // Dodaje prilog na tiket i čuva osnovne podatke o fajlu.
  uploadAttachment(ticketId, input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { this.toast('Fajl je prevelik. Max 5MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      DB.insert('attachments', {
        ticketId, userId: Auth.currentUser.id,
        filename: file.name, fileType: file.type,
        fileSize: file.size, data: e.target.result
      });
      this.toast('Prilog uploadovan.', 'success');
      this.renderTicketDetail(ticketId);
    };
    reader.readAsDataURL(file);
  },

  // ── KREIRANJE NOVOG TIKETA ──────────────────────────────────────────────

  // Prikazuje formu za kreiranje novog zahtjeva/tiketa.
  renderNewTicket() {
    const u = Auth.currentUser;
    const buildings = u.role === 'stanar'
      ? (u.buildingId ? [DB.findById('buildings', u.buildingId)] : [])
      : DB.findAll('buildings');

    const myBuilding = u.buildingId ? DB.findById('buildings', u.buildingId) : null;
    const myTickets = DB.find('tickets', t => t.stanarId === u.id).length;

    const el = document.getElementById('page-new-ticket');
    el.innerHTML = `
      <div class="row g-3 align-items-start">
        <div class="col-12 col-xxl-5 col-xl-6">
          <div class="app-card h-100">
            <div class="card-header-custom">
              <h6><i class="bi bi-plus-circle me-2"></i>Podnesi Novi Zahtjev</h6>
            </div>
            <div class="p-4">
              <form onsubmit="App.submitNewTicket(event)">
                <div class="mb-3">
                  <label class="form-label">Zgrada *</label>
                  <select class="form-select" id="nt-building" required>
                    <option value="">Odaberite zgradu</option>
                    ${buildings.filter(Boolean).map(b => `<option value="${b.id}">${this.esc(b.name)} - ${this.esc(b.address)}</option>`).join('')}
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Naslov zahtjeva *</label>
                  <input type="text" class="form-control" id="nt-title" required maxlength="100" placeholder="Kratko opišite problem...">
                </div>
                <div class="row g-3 mb-3">
                  <div class="col-md-6">
                    <label class="form-label">Kategorija *</label>
                    <select class="form-select" id="nt-category" required>
                      <option value="">Odaberite kategoriju</option>
                      ${Object.entries(this.CATEGORIES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Prioritet *</label>
                    <select class="form-select" id="nt-priority" required>
                      <option value="">Odaberite prioritet</option>
                      ${Object.entries(this.PRIORITIES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
                    </select>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Detaljni opis problema *</label>
                  <textarea class="form-control" id="nt-desc" rows="6" required placeholder="Opišite problem što detaljnije - kada je počelo, kako se manifestuje, da li je već prijavljeno ranije..."></textarea>
                </div>
                <div class="mb-4">
                  <label class="form-label">Prilog / Fotografija (opcionalno)</label>
                  <input type="file" class="form-control" id="nt-file" accept="image/*,.pdf">
                  <div class="form-text">Maksimalna veličina fajla: 5MB</div>
                </div>
                <div class="d-flex gap-2 flex-wrap">
                  <button type="submit" class="btn btn-primary"><i class="bi bi-send me-2"></i>Pošalji Zahtjev</button>
                  <button type="button" class="btn btn-light" onclick="App.navigate('tickets')">Odustani</button>
                </div>
              </form>
            </div>
          </div>
        </div>
        <div class="col-12 col-xxl-7 col-xl-6">
          <div class="page-side-stack">
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-info-circle me-2"></i>Prije slanja zahtjeva</h6></div>
              <div class="p-3">
                <div class="info-list">
                  <div class="info-list-item"><strong>1.</strong><span>Napiši jasan naslov kako bi povjerenik i administrator odmah razumjeli problem.</span></div>
                  <div class="info-list-item"><strong>2.</strong><span>U opisu navedi gdje se problem nalazi, koliko traje i da li utiče na više stanara.</span></div>
                  <div class="info-list-item"><strong>3.</strong><span>Ako imaš fotografiju ili dokument, dodaj prilog jer to ubrzava obradu zahtjeva.</span></div>
                </div>
              </div>
            </div>
            <div class="row g-3">
              <div class="col-12 col-lg-6">
                <div class="app-card h-100">
                  <div class="card-header-custom"><h6><i class="bi bi-person me-2"></i>Vaš profil</h6></div>
                  <div class="p-3">
                    <div class="focus-row"><span>Korisnik</span><strong>${this.esc(u.name)}</strong></div>
                    <div class="focus-row"><span>Uloga</span><strong>${this.esc(this.ROLES[u.role] || u.role)}</strong></div>
                    <div class="focus-row"><span>Vaši tiketi</span><strong>${myTickets}</strong></div>
                    <div class="focus-row" style="border-bottom:none"><span>Zgrada</span><strong>${this.esc(myBuilding?.name || 'Odabir iz forme')}</strong></div>
                  </div>
                </div>
              </div>
              <div class="col-12 col-lg-6">
                <div class="app-card h-100">
                  <div class="card-header-custom"><h6><i class="bi bi-diagram-3 me-2"></i>Tok obrade</h6></div>
                  <div class="p-3 small text-secondary">
                    <p class="mb-2"><strong>Novi zahtjev</strong> ide na pregled povjereniku ili administratoru.</p>
                    <p class="mb-2"><strong>Odobren</strong> zahtjev se može dodijeliti tehničaru.</p>
                    <p class="mb-0"><strong>Riješen</strong> tiket ostaje dostupan u vašoj evidenciji i historiji rada.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    if (u.role === 'stanar' && u.buildingId) {
      setTimeout(() => {
        const sel = document.getElementById('nt-building');
        if (sel) sel.value = u.buildingId;
      }, 50);
    }
  },

  // Validira formu i upisuje novi tiket u Supabase.
  submitNewTicket(e) {
    e.preventDefault();
    const buildingId = document.getElementById('nt-building').value;
    const title      = document.getElementById('nt-title').value.trim();
    const category   = document.getElementById('nt-category').value;
    const priority   = document.getElementById('nt-priority').value;
    const desc       = document.getElementById('nt-desc').value.trim();
    const u = Auth.currentUser;

    const ticket = DB.insert('tickets', {
      title, description: desc, buildingId, stanarId: u.id,
      category, priority, status: 'novi', assignedTo: null,
      povjerenikNote: null,
      statusHistory: [{ status: 'novi', changedBy: u.id, changedAt: new Date().toISOString(), note: null }]
    });

    const building = DB.findById('buildings', buildingId);
    if (building?.povjerenikId) {
      this._notify(building.povjerenikId, 'new_ticket', 'Novi zahtjev na čekanju',
        `${u.name} je podnio/la novi zahtjev: "${title}".`, ticket.id);
    }
    DB.find('users', usr => usr.role === 'administrator').forEach(adm => {
      this._notify(adm.id, 'new_ticket', 'Novi zahtjev', `Novi tiket: "${title}".`, ticket.id);
    });

    const fileInput = document.getElementById('nt-file');
    if (fileInput.files[0]) {
      const file = fileInput.files[0];
      if (file.size <= 5 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          DB.insert('attachments', {
            ticketId: ticket.id, userId: u.id,
            filename: file.name, fileType: file.type,
            fileSize: file.size, data: ev.target.result
          });
        };
        reader.readAsDataURL(file);
      }
    }

    this.toast('Zahtjev uspješno podnesen!', 'success');
    this.updateNotifBadge();
    this.navigate('ticket-detail', { id: ticket.id });
  },

  // ── BUILDINGS ─────────────────────────────────────────────────────────

  // Prikazuje pregled zgrada dostupnih trenutnom korisniku.
  renderBuildings() {
    const u = Auth.currentUser;
    const isAdmin = u.role === 'administrator';
    let buildings = DB.findAll('buildings');
    if (u.role === 'povjerenik') buildings = buildings.filter(b => u.buildingIds.includes(b.id));

    const el = document.getElementById('page-buildings');
    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div></div>
        ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="App.openBuildingModal()">
          <i class="bi bi-plus me-1"></i>Nova Zgrada</button>` : ''}
      </div>
      <div class="row g-3" id="buildings-grid">
        ${buildings.map(b => this._buildingCard(b)).join('')}
      </div>
      ${isAdmin ? this._buildingModal() : ''}`;
  },

  // Generiše jednu karticu zgrade sa osnovnim statistikama.
  _buildingCard(b) {
    const pov      = DB.findById('users', b.povjerenikId);
    const tickets  = DB.find('tickets', t => t.buildingId === b.id);
    const active   = tickets.filter(t => !['zatvoren','odbijen'].includes(t.status)).length;
    const pending  = tickets.filter(t => t.status === 'novi').length;
    const isAdmin  = Auth.is('administrator');
    return `<div class="col-12 col-md-6 col-xxl-6">
      <div class="building-card h-100">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div class="building-name">${this.esc(b.name)}</div>
            <div class="building-addr">${this.esc(b.address)}, ${this.esc(b.city)}</div>
          </div>
          ${isAdmin ? `<button class="btn btn-sm btn-outline-secondary" onclick="App.openBuildingModal('${b.id}')"><i class="bi bi-pencil"></i></button>` : ''}
        </div>
        <div class="row g-2 my-2 text-center">
          <div class="col-4">
            <div class="fw-700" style="font-size:1.2rem">${b.floors}</div>
            <div class="text-tiny text-secondary">Spratova</div>
          </div>
          <div class="col-4">
            <div class="fw-700" style="font-size:1.2rem">${b.units}</div>
            <div class="text-tiny text-secondary">Stanova</div>
          </div>
          <div class="col-4">
            <div class="fw-700" style="font-size:1.2rem">${active}</div>
            <div class="text-tiny text-secondary">Aktivnih</div>
          </div>
        </div>
        ${pov ? `<div class="d-flex align-items-center gap-2 mt-2 p-2 rounded" style="background:#f8fafc">
          <div class="avatar avatar-sm avatar-${pov.id}">${pov.name.split(' ').map(n=>n[0]).join('').substr(0,2)}</div>
          <div>
            <div class="text-tiny fw-600">${this.esc(pov.name)}</div>
            <div class="text-tiny text-secondary">Povjerenik</div>
          </div>
        </div>` : ''}
        <div class="d-flex gap-2 mt-3">
          ${pending > 0 ? `<span class="badge bg-warning text-dark">${pending} na čekanju</span>` : ''}
          <button class="btn btn-sm btn-outline-primary ms-auto" onclick="App.viewBuildingTickets('${b.id}')">
            Tiketi <i class="bi bi-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>`;
  },

  // Priprema modal za unos ili izmjenu zgrade.
  _buildingModal() {
    const povjerenici = DB.find('users', u => u.role === 'povjerenik' && u.active);
    return `<div class="modal fade" id="buildingModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-3">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title" id="buildingModalTitle">Nova Zgrada</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="bm-id">
            <div class="mb-3"><label class="form-label">Naziv *</label>
              <input type="text" class="form-control" id="bm-name" required></div>
            <div class="mb-3"><label class="form-label">Adresa *</label>
              <input type="text" class="form-control" id="bm-address" required></div>
            <div class="mb-3"><label class="form-label">Grad *</label>
              <input type="text" class="form-control" id="bm-city" required></div>
            <div class="row g-2 mb-3">
              <div class="col"><label class="form-label">Spratova</label>
                <input type="number" class="form-control" id="bm-floors" min="1" value="5"></div>
              <div class="col"><label class="form-label">Stanova</label>
                <input type="number" class="form-control" id="bm-units" min="1" value="20"></div>
            </div>
            <div class="mb-3"><label class="form-label">Povjerenik</label>
              <select class="form-select" id="bm-povjerenik">
                <option value="">-- Nije dodijeljen --</option>
                ${povjerenici.map(p => `<option value="${p.id}">${this.esc(p.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Odustani</button>
            <button type="button" class="btn btn-primary" onclick="App.saveBuilding()">Sačuvaj</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Otvara modal za novu zgradu ili postojeću zgradu.
  openBuildingModal(id) {
    const b = id ? DB.findById('buildings', id) : null;
    document.getElementById('buildingModalTitle').textContent = b ? 'Uredi Zgradu' : 'Nova Zgrada';
    document.getElementById('bm-id').value      = b?.id || '';
    document.getElementById('bm-name').value    = b?.name || '';
    document.getElementById('bm-address').value = b?.address || '';
    document.getElementById('bm-city').value    = b?.city || '';
    document.getElementById('bm-floors').value  = b?.floors || 5;
    document.getElementById('bm-units').value   = b?.units || 20;
    document.getElementById('bm-povjerenik').value = b?.povjerenikId || '';
    new bootstrap.Modal(document.getElementById('buildingModal')).show();
  },

  // Sprema zgradu u bazu i osvježava prikaz.
  saveBuilding() {
    const id      = document.getElementById('bm-id').value;
    const name    = document.getElementById('bm-name').value.trim();
    const address = document.getElementById('bm-address').value.trim();
    const city    = document.getElementById('bm-city').value.trim();
    const floors  = parseInt(document.getElementById('bm-floors').value) || 5;
    const units   = parseInt(document.getElementById('bm-units').value) || 20;
    const povjerenikId = document.getElementById('bm-povjerenik').value || null;
    if (!name || !address || !city) { this.toast('Popunite obavezna polja.', 'warning'); return; }

    if (id) {
      DB.update('buildings', id, { name, address, city, floors, units, povjerenikId });
      // Update povjerenik's buildingIds
      if (povjerenikId) {
        const pov = DB.findById('users', povjerenikId);
        if (pov && !pov.buildingIds.includes(id)) {
          DB.update('users', povjerenikId, { buildingIds: [...pov.buildingIds, id] });
        }
      }
      this.toast('Zgrada ažurirana.', 'success');
    } else {
      const b = DB.insert('buildings', { name, address, city, floors, units, povjerenikId });
      if (povjerenikId) {
        const pov = DB.findById('users', povjerenikId);
        if (pov) DB.update('users', povjerenikId, { buildingIds: [...(pov.buildingIds||[]), b.id] });
      }
      this.toast('Zgrada kreirana.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('buildingModal')).hide();
    this.renderBuildings();
  },

  // Filtrira prikaz tiketa na odabranu zgradu.
  viewBuildingTickets(buildingId) {
    this.navigate('tickets');
    setTimeout(() => {
      const sel = document.getElementById('filter-building');
      if (sel) { sel.value = buildingId; this.filterTickets(); }
    }, 100);
  },

  // ── USERS ─────────────────────────────────────────────────────────────

  // Prikazuje administraciju korisnika.
  renderUsers() {
    const users = DB.findAll('users');
    const el = document.getElementById('page-users');
    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="d-flex gap-2">
          <input type="text" class="form-control form-control-sm" id="user-search"
                 placeholder="Pretraži korisnike..." style="width:220px" oninput="App.filterUsers()">
          <select class="form-select form-select-sm" id="user-role-filter" style="width:auto" onchange="App.filterUsers()">
            <option value="">Sve role</option>
            ${Object.entries(this.ROLES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="App.openUserModal()">
          <i class="bi bi-person-plus me-1"></i>Novi Korisnik
        </button>
      </div>
      <div class="app-card">
        <div class="card-body-custom" id="users-table-wrap">
          ${this._usersTable(users)}
        </div>
      </div>
      ${this._userModal()}`;
  },

  // Generiše tabelu korisnika sa ulogama, statusom i akcijama.
  _usersTable(users) {
    if (!users.length) return `<div class="empty-state"><i class="bi bi-people"></i><p>Nema korisnika.</p></div>`;
    return `<table class="ticket-table">
      <thead><tr><th>Korisnik</th><th>Email</th><th>Uloga</th><th>Zgrada / Stan</th><th>Status</th><th>Akcije</th></tr></thead>
      <tbody>
        ${users.map(u => {
          const initials = u.name.split(' ').map(n=>n[0]).join('').substr(0,2).toUpperCase();
          const building = u.buildingId ? DB.findById('buildings', u.buildingId) : null;
          return `<tr onclick="App.navigate('user-profile',{id:'${u.id}'})" style="cursor:pointer">
            <td>
              <div class="d-flex align-items-center gap-2">
                <div class="avatar avatar-${u.id}">${initials}</div>
                <div>
                  <div class="fw-600">${this.esc(u.name)}</div>
                  <div class="text-tiny text-secondary">${u.phone||''}</div>
                </div>
              </div>
            </td>
            <td class="text-tiny">${this.esc(u.email)}</td>
            <td><span class="role-badge role-${u.role}">${this.ROLES[u.role]}</span></td>
            <td class="text-tiny">
              ${building ? this.esc(building.name) : (u.buildingIds?.length ? u.buildingIds.map(bid=>{const b=DB.findById('buildings',bid);return b?b.name:'?';}).join(', ') : '—')}
              ${u.apartment ? `<br><span class="text-secondary">${this.esc(u.apartment)}</span>` : ''}
            </td>
            <td>
              <span class="badge ${u.active?'bg-success':'bg-secondary'}">
                ${u.active ? 'Aktivan' : 'Neaktivan'}
              </span>
            </td>
            <td onclick="event.stopPropagation()">
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-secondary" onclick="App.openUserModal('${u.id}')">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-${u.active?'danger':'success'}"
                        onclick="App.toggleUser('${u.id}');App.navigate('user-profile',{id:'${u.id}'})">
                  <i class="bi bi-${u.active?'person-x':'person-check'}"></i>
                </button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  },

  // Filtrira korisnike po tekstu i ulozi.
  filterUsers() {
    const search = document.getElementById('user-search').value.toLowerCase();
    const role   = document.getElementById('user-role-filter').value;
    let users = DB.findAll('users');
    if (search) users = users.filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
    if (role)   users = users.filter(u => u.role === role);
    document.getElementById('users-table-wrap').innerHTML = this._usersTable(users);
  },

  // Priprema modal za unos ili izmjenu korisnika.
  _userModal() {
    const buildings = DB.findAll('buildings');
    return `<div class="modal fade" id="userModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 rounded-3">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title" id="userModalTitle">Novi Korisnik</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="um-id">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Ime i prezime *</label>
                <input type="text" class="form-control" id="um-name" required>
              </div>
              <div class="col-md-6">
                <label class="form-label">Email *</label>
                <input type="email" class="form-control" id="um-email" required>
              </div>
              <div class="col-md-6">
                <label class="form-label">Lozinka *</label>
                <input type="password" class="form-control" id="um-pass" placeholder="Ostavite prazno da ne mijenjate">
              </div>
              <div class="col-md-6">
                <label class="form-label">Telefon</label>
                <input type="text" class="form-control" id="um-phone">
              </div>
              <div class="col-md-6">
                <label class="form-label">Uloga *</label>
                <select class="form-select" id="um-role" required onchange="App.userModalRoleChange()">
                  ${Object.entries(this.ROLES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-6" id="um-building-wrap">
                <label class="form-label">Zgrada</label>
                <select class="form-select" id="um-building">
                  <option value="">-- Nema --</option>
                  ${buildings.map(b => `<option value="${b.id}">${this.esc(b.name)}</option>`).join('')}
                </select>
              </div>
              <div class="col-md-6" id="um-apartment-wrap">
                <label class="form-label">Stan / Broj stana</label>
                <input type="text" class="form-control" id="um-apartment" placeholder="npr. Stan 12">
              </div>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light" data-bs-dismiss="modal">Odustani</button>
            <button type="button" class="btn btn-primary" onclick="App.saveUser()">Sačuvaj</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Otvara modal za novog ili postojećeg korisnika.
  openUserModal(id) {
    const u = id ? DB.findById('users', id) : null;
    document.getElementById('userModalTitle').textContent = u ? 'Uredi Korisnika' : 'Novi Korisnik';
    document.getElementById('um-id').value        = u?.id || '';
    document.getElementById('um-name').value      = u?.name || '';
    document.getElementById('um-email').value     = u?.email || '';
    document.getElementById('um-phone').value     = u?.phone || '';
    document.getElementById('um-role').value      = u?.role || 'stanar';
    document.getElementById('um-building').value  = u?.buildingId || '';
    document.getElementById('um-apartment').value = u?.apartment || '';
    document.getElementById('um-pass').value      = '';
    new bootstrap.Modal(document.getElementById('userModal')).show();
    this.userModalRoleChange();
  },

  // Prilagođava polja forme prema odabranoj ulozi korisnika.
  userModalRoleChange() {
    const role = document.getElementById('um-role').value;
    const bWrap = document.getElementById('um-building-wrap');
    const aWrap = document.getElementById('um-apartment-wrap');
    if (bWrap) bWrap.style.display  = role === 'stanar' ? '' : 'none';
    if (aWrap) aWrap.style.display  = role === 'stanar' ? '' : 'none';
  },

  // Validira i sprema korisnički nalog.
  saveUser() {
    const id    = document.getElementById('um-id').value;
    const name  = document.getElementById('um-name').value.trim();
    const email = document.getElementById('um-email').value.trim();
    const pass  = document.getElementById('um-pass').value;
    const phone = document.getElementById('um-phone').value.trim();
    const role  = document.getElementById('um-role').value;
    const buildingId = document.getElementById('um-building')?.value || null;
    const apartment  = document.getElementById('um-apartment')?.value.trim() || null;
    if (!name || !email || !role) { this.toast('Popunite obavezna polja.', 'warning'); return; }

    const existing = DB.findOne('users', u => u.email === email && u.id !== id);
    if (existing) { this.toast('Korisnik s tim emailom već postoji.', 'error'); return; }

    if (id) {
      const updates = { name, email, phone, role, buildingId, apartment };
      if (pass) updates.password = pass;
      DB.update('users', id, updates);
      this.toast('Korisnik ažuriran.', 'success');
    } else {
      if (!pass) { this.toast('Unesite lozinku za novog korisnika.', 'warning'); return; }
      DB.insert('users', { name, email, password: pass, phone, role, buildingId, buildingIds: [], apartment, active: true });
      this.toast('Korisnik kreiran.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
    this.renderUsers();
  },

  // Aktivira ili deaktivira korisnika bez brisanja iz baze.
  toggleUser(id) {
    const u = DB.findById('users', id);
    if (!u) return;
    if (u.id === Auth.currentUser.id) { this.toast('Ne možete deaktivirati vlastiti nalog.', 'warning'); return; }
    DB.update('users', id, { active: !u.active });
    this.toast(u.active ? 'Korisnik deaktiviran.' : 'Korisnik aktiviran.', 'success');
    this.renderUsers();
  },

  // ── OBAVIJESTI ──────────────────────────────────────────────────────────

  // Prikazuje listu obavijesti trenutnog korisnika.
  renderNotifications() {
    const u = Auth.currentUser;
    const notifs = DB.find('notifications', n => n.userId === u.id)
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

    const unread = notifs.filter(n => !n.read);
    const ticketLinked = notifs.filter(n => n.ticketId).slice(0, 5);
    const latestUnread = unread.slice(0, 5);

    const el = document.getElementById('page-notifications');
    el.innerHTML = `
      <div class="row g-3 align-items-start">
        <div class="col-12 col-xxl-8">
          <div class="app-card page-fill h-100">
            <div class="card-header-custom">
              <h6><i class="bi bi-bell me-2"></i>Obavijesti (${unread.length} nepročitanih)</h6>
              ${unread.length ? `<button class="btn btn-sm btn-outline-secondary" onclick="App.markAllRead()"><i class="bi bi-check-all me-1"></i>Označi sve kao pročitano</button>` : ''}
            </div>
            <div class="card-body-custom">
              ${notifs.length === 0
                ? `<div class="empty-state"><i class="bi bi-bell-slash"></i><p>Nemate obavijesti.</p></div>`
                : notifs.map(n => `
                    <div class="notif-item ${n.read?'':'unread'}" onclick="App.markNotifRead('${n.id}','${n.ticketId || ''}')">
                      <div class="notif-icon ${n.read?'bg-light':'bg-primary bg-opacity-10'}">
                        <i class="bi ${this._notifIcon(n.type)} ${n.read?'text-secondary':'text-primary'}"></i>
                      </div>
                      <div style="flex:1">
                        <div class="notif-title">${this.esc(n.title)}</div>
                        <div class="notif-msg">${this.esc(n.message)}</div>
                        <div class="notif-time">${this.fmtDate(n.createdAt)}</div>
                      </div>
                      ${!n.read ? '<div class="notif-dot"></div>' : ''}
                    </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="col-12 col-xxl-4">
          <div class="page-side-stack desktop-sticky">
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-graph-up-arrow me-2"></i>Kratki pregled</h6></div>
              <div class="p-3">
                <div class="metrics-compact">
                  <div class="metric-box"><span>Ukupno</span><strong>${notifs.length}</strong></div>
                  <div class="metric-box"><span>Nepročitane</span><strong>${unread.length}</strong></div>
                  <div class="metric-box"><span>Povezane s tiketom</span><strong>${ticketLinked.length}</strong></div>
                  <div class="metric-box"><span>Korisnik</span><strong>${this.esc(u.name.split(' ')[0] || u.name)}</strong></div>
                </div>
              </div>
            </div>
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-lightning me-2"></i>Najnovije obavijesti</h6></div>
              <div class="p-3">
                ${(latestUnread.length ? latestUnread : ticketLinked).slice(0,5).map(item => `
                  <div class="mini-list-row" onclick="App.markNotifRead('${item.id}','${item.ticketId || ''}')">
                    <div class="notif-icon bg-primary bg-opacity-10"><i class="bi ${this._notifIcon(item.type)} text-primary"></i></div>
                    <div style="min-width:0"><div class="fw-600 text-truncate">${this.esc(item.title)}</div><div class="text-tiny text-secondary">${this.fmtDate(item.createdAt)}</div></div>
                  </div>`).join('') || '<div class="text-secondary small">Trenutno nema izdvojenih obavijesti.</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  // Označava obavijest kao pročitanu i po potrebi otvara povezani tiket.
  markNotifRead(notifId, ticketId) {
    DB.update('notifications', notifId, { read: true });
    this.updateNotifBadge();
    if (ticketId) this.navigate('ticket-detail', { id: ticketId });
    else this.renderNotifications();
  },

  // Označava sve obavijesti kao pročitane.
  markAllRead() {
    const u = Auth.currentUser;
    DB.find('notifications', n => n.userId === u.id && !n.read)
      .forEach(n => DB.update('notifications', n.id, { read: true }));
    this.updateNotifBadge();
    this.renderNotifications();
    this.toast('Sve obavijesti označene kao pročitane.', 'success');
  },

  // Osvježava broj nepročitanih obavijesti u topbaru i meniju.
  updateNotifBadge() {
    const u = Auth.currentUser;
    if (!u) return;
    const count = DB.find('notifications', n => n.userId === u.id && !n.read).length;
    const badge = document.getElementById('notif-badge-topbar');
    if (badge) {
      badge.textContent = count || '';
      badge.style.display = count ? '' : 'none';
    }
    const navBadge = document.getElementById('nav-badge-notifications');
    if (navBadge) navBadge.textContent = count || '';
  },

  // ── USER PROFILE ────────────────────────────────────────────────────────

  // Prikazuje profil korisnika i povezane zahtjeve.
  renderUserProfile(userId) {
    if (!userId) return this.navigate('users');
    const u = DB.findById('users', userId);
    if (!u) return this.navigate('users');
    const current = Auth.currentUser;
    const isAdmin = current.role === 'administrator';
    const isOwnProfile = current.id === userId;

    const initials = u.name.split(' ').map(n=>n[0]).join('').toUpperCase().substr(0,2);
    const building = u.buildingId ? DB.findById('buildings', u.buildingId) : null;

    let myTickets = u.role === 'stanar' ? DB.find('tickets', t => t.stanarId === userId) :
                    u.role === 'uposlenik' ? DB.find('tickets', t => t.assignedTo === userId) : [];

    const completedTickets = myTickets.filter(t => ['rijesen','zatvoren'].includes(t.status));
    const ongoingTickets = myTickets.filter(t => !['rijesen','zatvoren','odbijen'].includes(t.status));

    const el = document.getElementById('page-user-profile');
    el.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" onclick="App.navigate('${u.role === 'uposlenik' || u.role === 'povjerenik' || isAdmin ? 'users' : 'dashboard'}')">
          <i class="bi bi-arrow-left me-1"></i>Nazad
        </button>
      </div>

      <div class="row g-3">
        <!-- Glavni dio profila sa osnovnim podacima i aktivnostima. -->
        <div class="col-lg-8">
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-person me-2"></i>Profil Korisnika</h6>
            </div>
            <div class="p-4">
              <div class="d-flex align-items-start gap-3 mb-4">
                <div class="avatar avatar-lg avatar-${u.id}">${initials}</div>
                <div style="flex:1">
                  <div class="fw-700" style="font-size:1.3rem">${this.esc(u.name)}</div>
                  <div class="text-secondary mb-2">${this.ROLES[u.role]}</div>
                  <span class="badge ${u.active?'bg-success':'bg-secondary'}">
                    ${u.active ? 'Aktivan' : 'Neaktivan'}
                  </span>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
                <div style="border:1px solid #f1f5f9;border-radius:8px;padding:16px">
                  <div class="text-tiny text-secondary">Referenca</div>
                  <div class="fw-700" style="font-size:1.1rem;font-family:monospace">${this.esc(u.reference||'—')}</div>
                </div>
                <div style="border:1px solid #f1f5f9;border-radius:8px;padding:16px">
                  <div class="text-tiny text-secondary">Email</div>
                  <div class="fw-600">${this.esc(u.email)}</div>
                </div>
                <div style="border:1px solid #f1f5f9;border-radius:8px;padding:16px">
                  <div class="text-tiny text-secondary">Telefon</div>
                  <div class="fw-600">${this.esc(u.phone||'—')}</div>
                </div>
                <div style="border:1px solid #f1f5f9;border-radius:8px;padding:16px">
                  <div class="text-tiny text-secondary">Status</div>
                  <div class="fw-600">${u.active ? 'Aktivan' : 'Neaktivan'}</div>
                </div>
              </div>

              ${u.role === 'stanar' && building ? `
              <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
                <div class="text-tiny text-secondary mb-1">ZGRADA</div>
                <div class="fw-600">${this.esc(building.name)}</div>
                <div class="text-tiny text-secondary">${this.esc(building.address)}, ${this.esc(building.city)}</div>
                ${u.apartment ? `<div class="text-tiny mt-1"><strong>Stan:</strong> ${this.esc(u.apartment)}</div>` : ''}
              </div>` : ''}

              ${u.role === 'uposlenik' && u.hireYear ? `
              <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
                <div class="text-tiny text-secondary mb-1">POZICIJA</div>
                <div class="fw-600">${this.esc(u.position||'—')}</div>
                <div class="text-tiny text-secondary mt-1"><strong>Zaposlena od:</strong> ${u.hireYear}</div>
                <div class="text-tiny text-secondary"><strong>Staž:</strong> ${new Date().getFullYear() - u.hireYear} godina</div>
                ${u.bio ? `<div class="text-tiny mt-2" style="font-style:italic">${this.esc(u.bio)}</div>` : ''}
              </div>` : ''}

              ${u.role === 'povjerenik' && u.buildingIds?.length > 0 ? `
              <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
                <div class="text-tiny text-secondary mb-2">NADLEŽNE ZGRADE</div>
                <div>
                  ${u.buildingIds.map(bid => {
                    const b = DB.findById('buildings', bid);
                    return b ? `<div class="text-tiny mb-1"><i class="bi bi-building"></i> <strong>${this.esc(b.name)}</strong> - ${this.esc(b.city)}</div>` : '';
                  }).join('')}
                </div>
              </div>` : ''}
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="col-lg-4">
          ${u.role === 'stanar' ? `
          <div class="app-card mb-3">
            <div class="card-header-custom">
              <h6><i class="bi bi-ticket-detailed me-2"></i>Zahtjevi</h6>
              <span class="badge bg-primary">${myTickets.length}</span>
            </div>
            <div class="p-3">
              <div class="mb-2">
                <div class="text-tiny text-secondary">Aktivni</div>
                <div class="fw-700" style="font-size:1.3rem">${ongoingTickets.length}</div>
              </div>
              <div class="mb-3">
                <div class="text-tiny text-secondary">Gotovi</div>
                <div class="fw-700" style="font-size:1.3rem">${completedTickets.length}</div>
              </div>
              ${myTickets.length > 0 ? `
              <div style="border-top:1px solid #f1f5f9;padding-top:12px">
                <div class="text-tiny text-secondary mb-2"><strong>Zadnji zahtjevi</strong></div>
                ${myTickets.slice().reverse().slice(0,3).map(t => `
                  <div class="text-tiny mb-2 p-2 rounded" style="background:#f8fafc;cursor:pointer" onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                    <div class="fw-600">${this.esc(t.title)}</div>
                    <div class="text-secondary">${this.statusBadge(t.status)}</div>
                  </div>`).join('')}
              </div>` : ''}
            </div>
          </div>` : ''}

          ${u.role === 'uposlenik' ? `
          <div class="app-card mb-3">
            <div class="card-header-custom">
              <h6><i class="bi bi-list-task me-2"></i>Zadaci</h6>
              <span class="badge bg-primary">${myTickets.length}</span>
            </div>
            <div class="p-3">
              <div class="mb-2">
                <div class="text-tiny text-secondary">U toku</div>
                <div class="fw-700" style="font-size:1.3rem">${ongoingTickets.length}</div>
              </div>
              <div class="mb-3">
                <div class="text-tiny text-secondary">Riješeni</div>
                <div class="fw-700" style="font-size:1.3rem">${completedTickets.length}</div>
              </div>
              ${completedTickets.length > 0 ? `
              <div style="border-top:1px solid #f1f5f9;padding-top:12px">
                <div class="text-tiny text-secondary mb-2"><strong>Nedavno riješeni</strong></div>
                ${completedTickets.slice().reverse().slice(0,4).map(t => `
                  <div class="text-tiny mb-2 p-2 rounded" style="background:#f8fafc;cursor:pointer" onclick="App.navigate('ticket-detail',{id:'${t.id}'})">
                    <div class="fw-600">${this.esc(t.title)}</div>
                    <div class="text-secondary">${this.fmtDate(t.updatedAt)}</div>
                  </div>`).join('')}
              </div>` : ''}
            </div>
          </div>` : ''}

          ${isAdmin && !isOwnProfile ? `
          <div class="app-card">
            <div class="card-header-custom">
              <h6><i class="bi bi-gear me-2"></i>Akcije</h6>
            </div>
            <div class="p-3 d-grid gap-2">
              <button class="btn btn-sm btn-outline-secondary" onclick="App.openUserModal('${u.id}')">
                <i class="bi bi-pencil me-1"></i>Edituj
              </button>
              <button class="btn btn-sm btn-outline-${u.active?'danger':'success'}" onclick="App.toggleUser('${u.id}');App.navigate('user-profile',{id:'${u.id}'})">
                <i class="bi bi-${u.active?'person-x':'person-check'} me-1"></i>${u.active?'Deaktiviraj':'Aktiviraj'}
              </button>
            </div>
          </div>` : ''}
        </div>
      </div>

      ${this._userModal()}`;
  },

  // ── FILTERI SA POČETNOG PREGLEDA ────────────────────────────────────────

  // Iz dashboard kartice otvara listu tiketa koji odgovaraju odabranom tipu.
  _filterDashboardData(type) {
    const u = Auth.currentUser;
    if (type === 'pending') {
      // Show all pending tickets
      let tickets = DB.findAll('tickets');
      if (u.role === 'stanar') tickets = tickets.filter(t => t.stanarId === u.id);
      if (u.role === 'povjerenik') tickets = tickets.filter(t => u.buildingIds.includes(t.buildingId));
      if (u.role === 'uposlenik') tickets = tickets.filter(t => t.assignedTo === u.id);
      // Administrator vidi sve
      tickets = tickets.filter(t => t.status === 'novi');
      this.currentParams = {filterTickets: tickets};
      this._showFilteredTickets(tickets, 'Na čekanju');
    } else if (type === 'active') {
      let tickets = DB.findAll('tickets');
      if (u.role === 'stanar') tickets = tickets.filter(t => t.stanarId === u.id);
      if (u.role === 'povjerenik') tickets = tickets.filter(t => u.buildingIds.includes(t.buildingId));
      if (u.role === 'uposlenik') tickets = tickets.filter(t => t.assignedTo === u.id);
      // Administrator vidi sve
      tickets = tickets.filter(t => !['zatvoren','odbijen','rijesen'].includes(t.status));
      this._showFilteredTickets(tickets, 'Aktivni zahtjevi');
    } else if (type === 'closed') {
      let tickets = DB.findAll('tickets');
      if (u.role === 'stanar') tickets = tickets.filter(t => t.stanarId === u.id);
      if (u.role === 'povjerenik') tickets = tickets.filter(t => u.buildingIds.includes(t.buildingId));
      if (u.role === 'uposlenik') tickets = tickets.filter(t => t.assignedTo === u.id);
      // Administrator vidi sve
      tickets = tickets.filter(t => t.status === 'zatvoren');
      this._showFilteredTickets(tickets, 'Zatvoreni zahtjevi');
    } else if (type === 'unread') {
      const notifs = DB.find('notifications', n => n.userId === u.id && !n.read)
        .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      this.navigate('notifications');
      setTimeout(() => {
        // Filter to unread only
        const notifItems = document.querySelectorAll('.notif-item');
        notifItems.forEach(item => {
          if (!item.classList.contains('unread')) item.style.display = 'none';
        });
      }, 100);
    }
  },

  // Prikazuje filtrirane tikete u standardnoj tabeli.
  _showFilteredTickets(tickets, title) {
    // Sakrijemo sve stranice prije prikaza tražene stranice. and show a filtered results view
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    let filterPage = document.getElementById('page-filtered-tickets');
    if (!filterPage) {
      filterPage = document.createElement('div');
      filterPage.id = 'page-filtered-tickets';
      filterPage.className = 'page';
      document.getElementById('page-content').appendChild(filterPage);
    }
    filterPage.style.display = 'block';
    filterPage.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" onclick="App.navigate('dashboard')">
          <i class="bi bi-arrow-left me-1"></i>Nazad na dashboard
        </button>
      </div>
      <div class="app-card">
        <div class="card-header-custom">
          <h6><i class="bi bi-ticket-detailed me-2"></i>${title} (${tickets.length})</h6>
        </div>
        <div class="card-body-custom">
          ${tickets.length === 0
            ? `<div class="empty-state"><i class="bi bi-inbox"></i><p>Nema zahtjeva.</p></div>`
            : `<table class="ticket-table">
                <thead><tr><th>#</th><th>Naslov</th><th>Zgrada</th><th>Prioritet</th><th>Status</th><th>Datum</th></tr></thead>
                <tbody>
                  ${tickets.slice().reverse().map((t,i) => {
                    const b = DB.findById('buildings', t.buildingId);
                    return `<tr onclick="App.navigate('ticket-detail',{id:'${t.id}'})" style="cursor:pointer">
                      <td class="text-tiny text-secondary">${String(i+1).padStart(3,'0')}</td>
                      <td class="fw-600">${this.esc(t.title)}</td>
                      <td class="text-tiny">${b ? this.esc(b.name) : '—'}</td>
                      <td>${this.priorityBadge(t.priority)}</td>
                      <td>${this.statusBadge(t.status)}</td>
                      <td class="text-tiny text-secondary">${this.fmtDate(t.createdAt)}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>`}
        </div>
      </div>`;
  },


  // ── DORAĐENE FUNKCIONALNOSTI ZA FAKULTETSKI PROJEKAT ───────────────────

  // Centralna lista statičkih filtera koje dashboard kartice koriste.
  // Svaki klik sa dashboarda vodi na standardnu tabelu, ali sa jasno označenim kriterijem i dugmetom za povratak.
  _dashboardTicketSet(type) {
    const u = Auth.currentUser;
    let tickets = DB.findAll('tickets');
    if (u.role === 'stanar') tickets = tickets.filter(t => t.stanarId === u.id);
    if (u.role === 'povjerenik') tickets = tickets.filter(t => (u.buildingIds || []).includes(t.buildingId));
    if (u.role === 'uposlenik') tickets = tickets.filter(t => t.assignedTo === u.id);

    const labels = {
      allTickets: 'Svi tiketi', pending: 'Tiketi na čekanju', closed: 'Riješeni tiketi',
      active: 'Tiketi u toku', assigned: 'Dodijeljeni tiketi', rejected: 'Odbijeni tiketi'
    };
    if (type === 'pending') tickets = tickets.filter(t => t.status === 'novi');
    if (type === 'closed') tickets = tickets.filter(t => ['rijesen', 'zatvoren'].includes(t.status));
    if (type === 'active') tickets = tickets.filter(t => ['odobren', 'dodjeljen', 'u_toku'].includes(t.status));
    if (type === 'assigned') tickets = tickets.filter(t => t.status === 'dodjeljen');
    if (type === 'rejected') tickets = tickets.filter(t => t.status === 'odbijen');
    return { title: labels[type] || 'Tiketi', rows: tickets.slice().reverse() };
  },

  // Dashboard kartice pozivaju ovu metodu kako bi korisnik dobio pregled podataka bez ručnog podešavanja filtera.
  openDashboardTickets(type) {
    const result = this._dashboardTicketSet(type);
    this.navigate('tickets', { fromDashboard: true, dashboardTitle: result.title, dashboardRows: result.rows });
  },

  // Koristi se za kartice korisnika i zgrada; otvara standardni modul i prikazuje dugme za povratak.
  openDashboardModule(page, filter = null) {
    this.navigate(page, { fromDashboard: true, dashboardFilter: filter });
  },

  // Stara metoda je ostavljena kao javni alias jer je već pozivaju neke postojeće kartice u kodu.
  _filterDashboardData(type) {
    if (type === 'unread') {
      this.navigate('notifications', { fromDashboard: true, unreadOnly: true });
      return;
    }
    this.openDashboardTickets(type);
  },

  // Meni je proširen modulom za administratorske zahtjeve, a povjerenik dobija pregled stanara i import za svoje zgrade.
  _getNavItems() {
    const role = Auth.currentUser?.role;
    if (!role) return [];
    const base = [{ id:'dashboard', icon:'bi-speedometer2', label:'Dashboard' }];
    if (role === 'stanar') return [...base,
      { divider:true, label:'Tiketi' },
      { id:'tickets', icon:'bi-ticket-detailed', label:'Moji Tiketi' },
      { id:'new-ticket', icon:'bi-plus-circle', label:'Novi Zahtjev' },
      { divider:true, label:'Ostalo' },
      { id:'notifications', icon:'bi-bell', label:'Obavijesti', badge:true }
    ];
    if (role === 'povjerenik') return [...base,
      { divider:true, label:'Tiketi' },
      { id:'tickets', icon:'bi-ticket-detailed', label:'Tiketi Zgrade', badge:true },
      { divider:true, label:'Upravljanje' },
      { id:'buildings', icon:'bi-buildings', label:'Moje Zgrade' },
      { id:'users', icon:'bi-people', label:'Stanari i import' },
      { id:'notifications', icon:'bi-bell', label:'Obavijesti', badge:true }
    ];
    if (role === 'uposlenik') return [...base,
      { divider:true, label:'Zadaci' },
      { id:'tickets', icon:'bi-ticket-detailed', label:'Moji Zadaci' },
      { id:'notifications', icon:'bi-bell', label:'Obavijesti', badge:true }
    ];
    return [...base,
      { divider:true, label:'Tiketi' },
      { id:'tickets', icon:'bi-ticket-detailed', label:'Svi Tiketi' },
      { id:'new-ticket', icon:'bi-plus-circle', label:'Novi Tiket' },
      { divider:true, label:'Upravljanje' },
      { id:'buildings', icon:'bi-buildings', label:'Zgrade' },
      { id:'users', icon:'bi-people', label:'Korisnici' },
      { id:'admin-requests', icon:'bi-inboxes', label:'Zahtjevi', badge:true },
      { id:'notifications', icon:'bi-bell', label:'Obavijesti', badge:true }
    ];
  },

  // Router je proširen za stranicu administratorskih zahtjeva i za dashboard parametre.
  // Prije otvaranja nove stranice pamtimo prethodnu masku kako dugme Nazad vraća korisnika tamo odakle je došao.
  navigate(page, params = {}) {
    if (this.currentPage && page !== this.currentPage) {
      this.previousPage = this.currentPage;
      this.previousParams = this.currentParams || {};
    }
    this.currentPage = page;
    this.currentParams = params;
    this.setActiveNav(page);

    const titles = {
      dashboard: 'Dashboard', tickets: 'Tiketi', 'new-ticket': 'Novi Tiket',
      'ticket-detail': 'Detalji Tiketa', buildings: 'Zgrade', users: 'Korisnici',
      notifications: 'Obavijesti', 'user-profile': 'Profil Korisnika', 'admin-requests': 'Zahtjevi'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) { pageEl.classList.add('active'); pageEl.style.display = 'block'; }

    const renders = {
      dashboard: () => this.renderDashboard(),
      tickets: () => this.renderTickets(),
      'new-ticket': () => this.renderNewTicket(),
      'ticket-detail': () => this.renderTicketDetail(params.id),
      buildings: () => this.renderBuildings(),
      users: () => this.renderUsers(),
      notifications: () => this.renderNotifications(),
      'user-profile': () => this.renderUserProfile(params.id),
      'admin-requests': () => this.renderAdminRequests()
    };
    renders[page]?.();
    this.closeSidebar();
  },


  // Vraća korisnika na prethodnu masku. Ako historija nije dostupna, vraća na listu tiketa.
  goBack(fallback = 'tickets') {
    const page = this.previousPage || fallback;
    const params = this.previousParams || {};
    this.previousPage = null;
    this.previousParams = {};
    this.navigate(page, params);
  },

  // Administratorski dashboard je vizuelno proširen tako da velike rezolucije ne ostaju prazne.
  _adminDashboard() {
    const tickets = DB.findAll('tickets');
    const users = DB.findAll('users');
    const buildings = DB.findAll('buildings');
    const pendingRequests = this._pendingAdminWorkCount();
    const byStatus = (s) => tickets.filter(t => t.status === s).length;
    const activeStatuses = ['odobren', 'dodjeljen', 'u_toku'];
    const activeTickets = tickets.filter(t => activeStatuses.includes(t.status));
    const latestUsers = users.slice().reverse().slice(0, 5);

    return `
      <div class="dashboard-hero mb-4">
        <div>
          <p class="eyebrow">Pregled sistema</p>
          <h2>Upravljanje zgradama i zahtjevima stanara</h2>
          <p>Jedan pregled za tikete, zgrade, korisnike, zahtjeve za naloge i operativne obavijesti.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-light" onclick="App.navigate('new-ticket')"><i class="bi bi-plus-circle me-1"></i>Novi tiket</button>
          <button class="btn btn-outline-light" onclick="App.navigate('admin-requests')"><i class="bi bi-inboxes me-1"></i>Zahtjevi (${pendingRequests})</button>
        </div>
      </div>
      <div class="row g-3 mb-4 dashboard-grid-fill">
        ${this._statCard('bi-ticket-detailed','Ukupno tiketa', tickets.length, '#dbeafe','#2563eb', "App.openDashboardTickets('allTickets')")}
        ${this._statCard('bi-people','Korisnici', users.length, '#ede9fe','#5b21b6', "App.openDashboardModule('users')")}
        ${this._statCard('bi-buildings','Zgrade', buildings.length, '#d1fae5','#065f46', "App.openDashboardModule('buildings')")}
        ${this._statCard('bi-exclamation-triangle','Na čekanju', byStatus('novi'), '#fef9c3','#854d0e', "App.openDashboardTickets('pending')")}
        ${this._statCard('bi-check-circle','Riješeni', byStatus('rijesen')+byStatus('zatvoren'), '#dcfce7','#15803d', "App.openDashboardTickets('closed')")}
        ${this._statCard('bi-arrow-repeat','U toku', byStatus('u_toku'), '#ffedd5','#c2410c', "App.openDashboardTickets('active')")}
        ${this._statCard('bi-person-check','Dodijeljeni', byStatus('dodjeljen'), '#fce7f3','#be185d', "App.openDashboardTickets('assigned')")}
        ${this._statCard('bi-x-circle','Odbijeni', byStatus('odbijen'), '#f1f5f9','#475569', "App.openDashboardTickets('rejected')")}
      </div>
      <div class="row g-3 dashboard-main-grid">
        <div class="col-xl-8">
          <div class="app-card h-100">
            <div class="card-header-custom"><h6><i class="bi bi-bar-chart me-2"></i>Tiketi po statusu</h6></div>
            <div class="p-3 chart-tall"><canvas id="status-chart" height="170"></canvas></div>
          </div>
        </div>
        <div class="col-xl-4">
          <div class="app-card h-100">
            <div class="card-header-custom"><h6><i class="bi bi-lightning me-2"></i>Operativni fokus</h6></div>
            <div class="p-3">
              <div class="focus-row"><span>Aktivni tiketi</span><strong>${activeTickets.length}</strong></div>
              <div class="focus-row"><span>Novi zahtjevi</span><strong>${byStatus('novi')}</strong></div>
              <div class="focus-row"><span>Administratorski zahtjevi</span><strong>${pendingRequests}</strong></div>
              <div class="d-grid gap-2 mt-3">
                <button class="btn btn-primary btn-sm" onclick="App.navigate('admin-requests')">Pregled zahtjeva</button>
                <button class="btn btn-outline-secondary btn-sm" onclick="App.exportUsersToExcel()">Export korisnika</button>
                <button class="btn btn-outline-secondary btn-sm" onclick="App.exportBuildingsToExcel()">Export zgrada</button>
              </div>
            </div>
          </div>
        </div>
        <div class="col-xl-8">
          <div class="app-card">
            <div class="card-header-custom"><h6><i class="bi bi-ticket-detailed me-2"></i>Najnoviji tiketi</h6><button class="btn btn-sm btn-outline-secondary" onclick="App.openDashboardTickets('allTickets')">Vidi sve</button></div>
            <div class="card-body-custom">${this._ticketsTable(tickets.slice().reverse().slice(0, 8))}</div>
          </div>
        </div>
        <div class="col-xl-4">
          <div class="app-card">
            <div class="card-header-custom"><h6><i class="bi bi-person-lines-fill me-2"></i>Zadnji korisnici</h6><button class="btn btn-sm btn-outline-secondary" onclick="App.openDashboardModule('users')">Svi korisnici</button></div>
            <div class="p-3">${latestUsers.map(user => this._compactUserLine(user)).join('')}</div>
          </div>
        </div>
      </div>`;
  },

  // Statistička kartica je široka na velikim ekranima, ali se uredno slaže na tabletu i telefonu.
  _statCard(icon, label, value, bgColor, iconColor, onclick) {
    return `<div class="col-12 col-sm-6 col-xl-3">
      <div class="stat-card stat-card-clickable" ${onclick ? `onclick="${onclick}"` : ''}>
        <div class="stat-icon" style="background:${bgColor}"><i class="bi ${icon}" style="color:${iconColor}"></i></div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    </div>`;
  },

  // Sažet prikaz korisnika za dashboard i male bočne liste.
  _compactUserLine(user) {
    const initials = (user.name || '?').split(' ').map(n => n[0]).join('').substr(0,2).toUpperCase();
    return `<div class="mini-list-row" onclick="App.navigate('user-profile',{id:'${user.id}'})">
      <div class="avatar avatar-${user.id}">${initials}</div>
      <div><div class="fw-600">${this.esc(user.name)}</div><div class="text-tiny text-secondary">${this.ROLES[user.role] || user.role}</div></div>
    </div>`;
  },

  // Lista tiketa može prikazati normalni pregled ili rezultat dashboard kartice sa dugmetom za povratak.
  renderTickets() {
    const u = Auth.currentUser;
    let tickets = Array.isArray(this.currentParams.dashboardRows) ? this.currentParams.dashboardRows : DB.findAll('tickets');
    if (!this.currentParams.dashboardRows) {
      if (u.role === 'stanar') tickets = tickets.filter(t => t.stanarId === u.id);
      if (u.role === 'povjerenik') tickets = tickets.filter(t => (u.buildingIds || []).includes(t.buildingId));
      if (u.role === 'uposlenik') tickets = tickets.filter(t => t.assignedTo === u.id);
      tickets = tickets.slice().reverse();
    }

    const title = this.currentParams.dashboardTitle || 'Pregled tiketa';
    const visibleTickets = tickets.slice();
    const activeCount = visibleTickets.filter(t => ['novi','odobren','dodjeljen','u_toku'].includes(t.status)).length;
    const waitingCount = visibleTickets.filter(t => t.status === 'novi').length;
    const assignedCount = visibleTickets.filter(t => ['dodjeljen','u_toku'].includes(t.status)).length;
    const solvedCount = visibleTickets.filter(t => ['rijesen','zatvoren'].includes(t.status)).length;

    const el = document.getElementById('page-tickets');
    el.innerHTML = `
      ${this.currentParams.fromDashboard ? this._backToDashboardBar(title) : ''}
      <div class="toolbar-card mb-3">
        <div class="toolbar-left">
          <select class="form-select form-select-sm" id="filter-status" onchange="App.filterTickets()"><option value="">Svi statusi</option>${Object.entries(this.STATUS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select class="form-select form-select-sm" id="filter-priority" onchange="App.filterTickets()"><option value="">Svi prioriteti</option>${Object.entries(this.PRIORITIES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          ${u.role !== 'stanar' ? `<select class="form-select form-select-sm" id="filter-building" onchange="App.filterTickets()"><option value="">Sve zgrade</option>${DB.findAll('buildings').map(b => `<option value="${b.id}">${this.esc(b.name)}</option>`).join('')}</select>` : ''}
          <input type="text" class="form-control form-control-sm" id="filter-search" placeholder="Pretraži..." oninput="App.filterTickets()">
        </div>
        <div class="toolbar-right">
          ${(u.role === 'stanar' || u.role === 'administrator') ? `<button class="btn btn-primary btn-sm" onclick="App.navigate('new-ticket')"><i class="bi bi-plus me-1"></i>Novi Tiket</button>` : ''}
        </div>
      </div>

      <div class="row g-3 align-items-stretch">
        <div class="col-12 col-xxl-9">
          <div class="app-card page-fill h-100">
            <div class="card-body-custom" id="tickets-table-wrap">${this._ticketsTable(visibleTickets)}</div>
          </div>
        </div>
        <div class="col-12 col-xxl-3">
          <div class="page-side-stack desktop-sticky">
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-activity me-2"></i>Sažetak prikaza</h6></div>
              <div class="p-3">
                <div class="metrics-compact">
                  <div class="metric-box"><span>Ukupno</span><strong>${visibleTickets.length}</strong></div>
                  <div class="metric-box"><span>Aktivni</span><strong>${activeCount}</strong></div>
                  <div class="metric-box"><span>Na čekanju</span><strong>${waitingCount}</strong></div>
                  <div class="metric-box"><span>Dodijeljeni</span><strong>${assignedCount}</strong></div>
                  <div class="metric-box"><span>Riješeni</span><strong>${solvedCount}</strong></div>
                  <div class="metric-box"><span>Vaša uloga</span><strong>${this.esc(this.ROLES[u.role] || u.role)}</strong></div>
                </div>
              </div>
            </div>
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-lightning-charge me-2"></i>Brza napomena</h6></div>
              <div class="p-3 small text-secondary">
                <p class="mb-2">Koristi filtere iznad tabele kako bi brzo došao do tiketa po statusu, prioritetu ili zgradi.</p>
                <p class="mb-0">Klik na bilo koji red vodi direktno na detalje tiketa i dalju obradu.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  // Pregled zgrada dobija export/import alate za administratora i puniji grid na velikim ekranima.
  renderBuildings() {
    const u = Auth.currentUser;
    const isAdmin = u.role === 'administrator';
    let buildings = DB.findAll('buildings');
    if (u.role === 'povjerenik') buildings = buildings.filter(b => (u.buildingIds || []).includes(b.id));

    const buildingIds = buildings.map(b => b.id);
    const relatedTickets = DB.find('tickets', t => buildingIds.includes(t.buildingId));
    const pendingCount = relatedTickets.filter(t => t.status === 'novi').length;
    const activeCount = relatedTickets.filter(t => !['zatvoren','odbijen'].includes(t.status)).length;
    const unitsCount = buildings.reduce((sum, b) => sum + Number(b.units || 0), 0);
    const floorsCount = buildings.reduce((sum, b) => sum + Number(b.floors || 0), 0);

    const el = document.getElementById('page-buildings');
    el.innerHTML = `
      ${this.currentParams.fromDashboard ? this._backToDashboardBar('Zgrade') : ''}
      <div class="toolbar-card mb-3">
        <div class="toolbar-left"><input class="form-control form-control-sm" id="building-search" placeholder="Pretraži zgrade..." oninput="App.filterBuildings()"></div>
        <div class="toolbar-right">
          ${isAdmin ? `<button class="btn btn-outline-secondary btn-sm" onclick="App.downloadBuildingTemplate()"><i class="bi bi-download me-1"></i>Template</button>
          <label class="btn btn-outline-secondary btn-sm mb-0"><i class="bi bi-upload me-1"></i>Import<input type="file" class="d-none" accept=".xlsx,.xls" onchange="App.importBuildingsFromExcel(this)"></label>
          <button class="btn btn-outline-secondary btn-sm" onclick="App.exportBuildingsToExcel()"><i class="bi bi-file-earmark-excel me-1"></i>Export</button>
          <button class="btn btn-primary btn-sm" onclick="App.openBuildingModal()"><i class="bi bi-plus me-1"></i>Nova Zgrada</button>` : ''}
        </div>
      </div>

      <div class="row g-3 align-items-start">
        <div class="col-12 col-xxl-9">
          <div class="row g-3 buildings-grid-wide" id="buildings-grid">${buildings.map(b => this._buildingCard(b)).join('')}</div>
        </div>
        <div class="col-12 col-xxl-3">
          <div class="page-side-stack desktop-sticky">
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-buildings me-2"></i>Pregled fonda</h6></div>
              <div class="p-3">
                <div class="metrics-compact">
                  <div class="metric-box"><span>Zgrade</span><strong>${buildings.length}</strong></div>
                  <div class="metric-box"><span>Stanova</span><strong>${unitsCount}</strong></div>
                  <div class="metric-box"><span>Spratova</span><strong>${floorsCount}</strong></div>
                  <div class="metric-box"><span>Aktivni tiketi</span><strong>${activeCount}</strong></div>
                </div>
              </div>
            </div>
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-clipboard-data me-2"></i>Operativno stanje</h6></div>
              <div class="p-3">
                <div class="focus-row"><span>Na čekanju</span><strong>${pendingCount}</strong></div>
                <div class="focus-row"><span>Aktivna zgrada</span><strong>${buildings[0] ? this.esc(buildings[0].name) : '—'}</strong></div>
                <div class="focus-row" style="border-bottom:none"><span>Napomena</span><strong>${isAdmin ? 'Admin pristup' : 'Povjerenik pregled'}</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${isAdmin ? this._buildingModal() : ''}`;
  },

  // Pretraga zgrada radi bez novog poziva bazi jer su podaci već u memorijskom cache-u.
  filterBuildings() {
    const q = (document.getElementById('building-search')?.value || '').toLowerCase();
    let buildings = DB.findAll('buildings');
    const u = Auth.currentUser;
    if (u.role === 'povjerenik') buildings = buildings.filter(b => (u.buildingIds || []).includes(b.id));
    if (q) buildings = buildings.filter(b => `${b.name} ${b.address} ${b.city}`.toLowerCase().includes(q));
    document.getElementById('buildings-grid').innerHTML = buildings.map(b => this._buildingCard(b)).join('');
  },

  // Prikaz korisnika se prilagođava ulozi: administrator vidi sve, povjerenik samo stanare svojih zgrada.
  renderUsers() {
    const u = Auth.currentUser;
    const isAdmin = u.role === 'administrator';
    const isPovjerenik = u.role === 'povjerenik';
    let users = DB.findAll('users');
    if (isPovjerenik) users = users.filter(item => item.role === 'stanar' && (u.buildingIds || []).includes(item.buildingId));

    const activeCount = users.filter(item => item.active).length;
    const inactiveCount = users.filter(item => !item.active).length;
    const roleStats = Object.keys(this.ROLES).map(role => ({ role, count: users.filter(item => item.role === role).length })).filter(item => item.count > 0);

    const el = document.getElementById('page-users');
    el.innerHTML = `
      ${this.currentParams.fromDashboard ? this._backToDashboardBar(isAdmin ? 'Korisnici' : 'Stanari') : ''}
      <div class="toolbar-card mb-3">
        <div class="toolbar-left">
          <input type="text" class="form-control form-control-sm" id="user-search" placeholder="Pretraži korisnike..." oninput="App.filterUsers()">
          ${isAdmin ? `<select class="form-select form-select-sm" id="user-role-filter" onchange="App.filterUsers()"><option value="">Sve uloge</option>${Object.entries(this.ROLES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select>` : `<input type="hidden" id="user-role-filter" value="stanar">`}
        </div>
        <div class="toolbar-right">
          <button class="btn btn-outline-secondary btn-sm" onclick="App.downloadUserTemplate()"><i class="bi bi-download me-1"></i>Template</button>
          <label class="btn btn-outline-secondary btn-sm mb-0"><i class="bi bi-upload me-1"></i>${isPovjerenik ? 'Upload stanara' : 'Import'}<input type="file" class="d-none" accept=".xlsx,.xls" onchange="App.importUsersFromExcel(this)"></label>
          <button class="btn btn-outline-secondary btn-sm" onclick="App.exportUsersToExcel()"><i class="bi bi-file-earmark-excel me-1"></i>Export</button>
          ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="App.openUserModal()"><i class="bi bi-person-plus me-1"></i>Novi Korisnik</button>` : ''}
        </div>
      </div>
      ${isPovjerenik ? `<div class="alert alert-info small">Povjerenik može preuzeti template i uploadovati stanare samo za zgrade koje su mu dodijeljene. Upload ide administratoru na odobrenje.</div>` : ''}

      <div class="row g-3 align-items-stretch">
        <div class="col-12 col-xxl-9">
          <div class="app-card page-fill h-100"><div class="card-body-custom" id="users-table-wrap">${this._usersTable(users)}</div></div>
        </div>
        <div class="col-12 col-xxl-3">
          <div class="page-side-stack desktop-sticky">
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-people me-2"></i>Sažetak korisnika</h6></div>
              <div class="p-3">
                <div class="metrics-compact">
                  <div class="metric-box"><span>Ukupno</span><strong>${users.length}</strong></div>
                  <div class="metric-box"><span>Aktivni</span><strong>${activeCount}</strong></div>
                  <div class="metric-box"><span>Neaktivni</span><strong>${inactiveCount}</strong></div>
                  <div class="metric-box"><span>Prikaz</span><strong>${isAdmin ? 'Svi' : 'Stanari'}</strong></div>
                </div>
              </div>
            </div>
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-bar-chart me-2"></i>Raspodjela po ulozi</h6></div>
              <div class="p-3">
                ${roleStats.map(item => `<div class="focus-row"><span>${this.esc(this.ROLES[item.role] || item.role)}</span><strong>${item.count}</strong></div>`).join('') || '<div class="text-secondary small">Nema podataka za prikaz.</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>
      ${isAdmin ? this._userModal() : ''}`;
  },

  // Tabela korisnika sadrži dodatne kolone tražene u specifikaciji: poziciju, referencu, zgradu i status.
  _usersTable(users) {
    if (!users.length) return `<div class="empty-state"><i class="bi bi-people"></i><p>Nema korisnika.</p></div>`;
    return `<table class="ticket-table wide-table"><thead><tr><th>Korisnik</th><th>Email</th><th>Uloga</th><th>Pozicija</th><th>Referenca</th><th>Zgrada / Stan</th><th>Status</th><th>Akcije</th></tr></thead><tbody>
      ${users.map(user => {
        const initials = (user.name || '?').split(' ').map(n=>n[0]).join('').substr(0,2).toUpperCase();
        const building = user.buildingId ? DB.findById('buildings', user.buildingId) : null;
        const buildingNames = user.buildingIds?.length ? user.buildingIds.map(bid => DB.findById('buildings', bid)?.name || '?').join(', ') : '';
        return `<tr onclick="App.navigate('user-profile',{id:'${user.id}'})" style="cursor:pointer">
          <td data-label="Korisnik"><div class="d-flex align-items-center gap-2"><div class="avatar avatar-${user.id}">${initials}</div><div><div class="fw-600">${this.esc(user.name)}</div><div class="text-tiny text-secondary">${this.esc(user.phone || '')}</div></div></div></td>
          <td data-label="Email" class="text-tiny">${this.esc(user.email)}</td>
          <td data-label="Uloga"><span class="role-badge role-${user.role}">${this.ROLES[user.role] || user.role}</span></td>
          <td data-label="Pozicija" class="text-tiny">${user.role === 'uposlenik' ? this.esc(user.position || '—') : '—'}</td>
          <td data-label="Referenca" class="text-tiny">${user.role === 'stanar' ? this.esc(user.reference || '—') : this.esc(user.reference || '—')}</td>
          <td data-label="Zgrada / Stan" class="text-tiny">${building ? this.esc(building.name) : (buildingNames || '—')}${user.apartment ? `<br><span class="text-secondary">${this.esc(user.apartment)}</span>` : ''}</td>
          <td data-label="Status"><span class="badge ${user.active ? 'bg-success' : 'bg-secondary'}">${user.active ? 'Aktivan' : 'Neaktivan'}</span></td>
          <td data-label="Akcije" onclick="event.stopPropagation()"><div class="d-flex gap-1 justify-content-end">${Auth.is('administrator') ? `<button class="btn btn-sm btn-outline-secondary" onclick="App.openUserModal('${user.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-${user.active?'danger':'success'}" onclick="App.toggleUser('${user.id}')"><i class="bi bi-${user.active?'person-x':'person-check'}"></i></button>` : '<span class="text-secondary text-tiny">Pregled</span>'}</div></td>
        </tr>`;
      }).join('')}
    </tbody></table>`;
  },

  // Filtrira korisnike prema tekstu i ulozi, uz ograničenje da povjerenik vidi samo svoje stanare.
  filterUsers() {
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const role = document.getElementById('user-role-filter')?.value || '';
    const current = Auth.currentUser;
    let users = DB.findAll('users');
    if (current.role === 'povjerenik') users = users.filter(user => user.role === 'stanar' && (current.buildingIds || []).includes(user.buildingId));
    if (search) users = users.filter(user => `${user.name} ${user.email} ${user.reference || ''} ${user.phone || ''}`.toLowerCase().includes(search));
    if (role) users = users.filter(user => user.role === role);
    document.getElementById('users-table-wrap').innerHTML = this._usersTable(users);
  },

  // Modal korisnika je proširen poljima za poziciju, referencu i status naloga.
  _userModal() {
    const buildings = DB.findAll('buildings');
    return `<div class="modal fade" id="userModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 rounded-3">
      <div class="modal-header border-0 pb-0"><h5 class="modal-title" id="userModalTitle">Novi Korisnik</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body"><input type="hidden" id="um-id"><div class="row g-3">
        <div class="col-md-6"><label class="form-label">Ime i prezime *</label><input type="text" class="form-control" id="um-name" required></div>
        <div class="col-md-6"><label class="form-label">Email *</label><input type="email" class="form-control" id="um-email" required></div>
        <div class="col-md-6"><label class="form-label">Lozinka</label><input type="password" class="form-control" id="um-pass" placeholder="Ostavite prazno ako se ne mijenja"></div>
        <div class="col-md-6"><label class="form-label">Telefon</label><input type="text" class="form-control" id="um-phone"></div>
        <div class="col-md-6"><label class="form-label">Uloga *</label><select class="form-select" id="um-role" required onchange="App.userModalRoleChange()">${Object.entries(this.ROLES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="col-md-6"><label class="form-label">Status</label><select class="form-select" id="um-active"><option value="true">Aktivan</option><option value="false">Neaktivan</option></select></div>
        <div class="col-md-6" id="um-building-wrap"><label class="form-label">Zgrada</label><select class="form-select" id="um-building"><option value="">-- Nema --</option>${buildings.map(b => `<option value="${b.id}">${this.esc(b.name)}</option>`).join('')}</select></div>
        <div class="col-md-6" id="um-apartment-wrap"><label class="form-label">Stan / Broj stana</label><input type="text" class="form-control" id="um-apartment" placeholder="npr. Stan 12"></div>
        <div class="col-md-6" id="um-reference-wrap"><label class="form-label">Referenca</label><input type="text" class="form-control" id="um-reference" placeholder="Referenca sa računa / interna oznaka"></div>
        <div class="col-md-6" id="um-position-wrap"><label class="form-label">Pozicija</label><input type="text" class="form-control" id="um-position" placeholder="npr. Tehničar elektroinstalacija"></div>
      </div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Odustani</button><button type="button" class="btn btn-primary" onclick="App.saveUser()">Sačuvaj</button></div>
    </div></div></div>`;
  },

  // Otvara modal i popunjava ga postojećim podacima kada se uređuje korisnik.
  openUserModal(id) {
    const user = id ? DB.findById('users', id) : null;
    document.getElementById('userModalTitle').textContent = user ? 'Uredi Korisnika' : 'Novi Korisnik';
    document.getElementById('um-id').value = user?.id || '';
    document.getElementById('um-name').value = user?.name || '';
    document.getElementById('um-email').value = user?.email || '';
    document.getElementById('um-phone').value = user?.phone || '';
    document.getElementById('um-role').value = user?.role || 'stanar';
    document.getElementById('um-active').value = String(user?.active ?? true);
    document.getElementById('um-building').value = user?.buildingId || '';
    document.getElementById('um-apartment').value = user?.apartment || '';
    document.getElementById('um-reference').value = user?.reference || '';
    document.getElementById('um-position').value = user?.position || '';
    document.getElementById('um-pass').value = '';
    new bootstrap.Modal(document.getElementById('userModal')).show();
    this.userModalRoleChange();
  },

  // Polja se prikazuju prema ulozi da forma ostane jasna i bez viška informacija.
  userModalRoleChange() {
    const role = document.getElementById('um-role')?.value;
    const showStanar = role === 'stanar';
    const showEmployee = role === 'uposlenik';
    ['um-building-wrap', 'um-apartment-wrap', 'um-reference-wrap'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = showStanar ? '' : (id === 'um-reference-wrap' && role !== 'stanar' ? '' : 'none'); });
    const pos = document.getElementById('um-position-wrap');
    if (pos) pos.style.display = showEmployee ? '' : 'none';
  },

  // Spremanje korisnika radi osnovne provjere duplikata po emailu i referenci stanara.
  saveUser() {
    const id = document.getElementById('um-id').value;
    const name = document.getElementById('um-name').value.trim();
    const email = document.getElementById('um-email').value.trim().toLowerCase();
    const pass = document.getElementById('um-pass').value;
    const phone = document.getElementById('um-phone').value.trim();
    const role = document.getElementById('um-role').value;
    const active = document.getElementById('um-active').value === 'true';
    const buildingId = document.getElementById('um-building')?.value || null;
    const apartment = document.getElementById('um-apartment')?.value.trim() || null;
    const reference = document.getElementById('um-reference')?.value.trim() || null;
    const position = document.getElementById('um-position')?.value.trim() || null;
    if (!name || !email || !role) { this.toast('Popunite obavezna polja.', 'warning'); return; }
    if (DB.findOne('users', user => user.email?.toLowerCase() === email && user.id !== id)) { this.toast('Korisnik s tim emailom već postoji.', 'error'); return; }
    if (role === 'stanar' && reference && DB.findOne('users', user => user.reference === reference && user.id !== id)) { this.toast('Stanar sa tom referencom već postoji.', 'error'); return; }
    if (id) {
      const updates = { name, email, phone, role, buildingId: role === 'stanar' ? buildingId : null, apartment: role === 'stanar' ? apartment : null, reference, position: role === 'uposlenik' ? position : null, active };
      if (pass) updates.password = pass;
      DB.update('users', id, updates);
      this.toast('Korisnik je ažuriran.', 'success');
    } else {
      if (!pass) { this.toast('Unesite lozinku za novog korisnika.', 'warning'); return; }
      DB.insert('users', { name, email, password: pass, phone, role, buildingId: role === 'stanar' ? buildingId : null, buildingIds: [], apartment: role === 'stanar' ? apartment : null, reference, position: role === 'uposlenik' ? position : null, active });
      this.toast('Korisnik je kreiran.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('userModal'))?.hide();
    this.renderUsers();
  },

  // Otvara modal registracije i puni listu zgrada iz Supabase-a.
  openSignupModal() {
    const select = document.getElementById('su-building');
    if (select) select.innerHTML = '<option value="">Odaberite zgradu</option>' + DB.findAll('buildings').map(b => `<option value="${b.id}">${this.esc(b.name)} - ${this.esc(b.address)}</option>`).join('');
    new bootstrap.Modal(document.getElementById('signupModal')).show();
  },

  // Registracija ne kreira nalog odmah; zapis ide u tabelu zahtjeva i čeka administratora.
  submitSignupRequest(event) {
    event.preventDefault();
    const data = {
      name: document.getElementById('su-name').value.trim(),
      email: document.getElementById('su-email').value.trim().toLowerCase(),
      phone: document.getElementById('su-phone').value.trim(),
      password: document.getElementById('su-password').value,
      buildingId: document.getElementById('su-building').value,
      reference: document.getElementById('su-reference').value.trim(),
      apartment: document.getElementById('su-apartment').value.trim(),
      status: 'na_cekanju'
    };
    if (DB.findOne('users', u => u.email?.toLowerCase() === data.email) || DB.findOne('registrationRequests', r => r.email?.toLowerCase() === data.email && r.status === 'na_cekanju')) {
      this.toast('Za ovaj email već postoji nalog ili aktivan zahtjev.', 'warning'); return;
    }
    DB.insert('registrationRequests', data);
    DB.find('users', u => u.role === 'administrator').forEach(admin => this._notify(admin.id, 'registration_request', 'Novi zahtjev za registraciju', `${data.name} je poslao/la zahtjev za nalog.`, null));
    bootstrap.Modal.getInstance(document.getElementById('signupModal'))?.hide();
    document.getElementById('signup-form').reset();
    this.toast('Zahtjev je poslan administratoru.', 'success');
  },

  // Otvara modal za reset lozinke.
  openPasswordResetModal() {
    new bootstrap.Modal(document.getElementById('passwordResetModal')).show();
  },

  // Zahtjev za reset lozinke se evidentira u aplikaciji umjesto slanja pravog emaila.
  submitPasswordResetRequest(event) {
    event.preventDefault();
    const email = document.getElementById('pr-email').value.trim().toLowerCase();
    const user = DB.findOne('users', u => u.email?.toLowerCase() === email);
    if (!user) { this.toast('Nije pronađen korisnik sa tom email adresom.', 'warning'); return; }
    DB.insert('passwordResetRequests', { userId: user.id, email, status: 'na_cekanju' });
    DB.find('users', u => u.role === 'administrator').forEach(admin => this._notify(admin.id, 'password_reset', 'Zahtjev za reset lozinke', `${user.name} je zatražio/la novu lozinku.`, null));
    bootstrap.Modal.getInstance(document.getElementById('passwordResetModal'))?.hide();
    document.getElementById('password-reset-form').reset();
    this.toast('Zahtjev za reset lozinke je poslan administratoru.', 'success');
  },

  // Export korisnika u Excel koristi trenutno dostupne korisnike za ulogu koja je prijavljena.
  exportUsersToExcel() {
    const current = Auth.currentUser;
    let users = DB.findAll('users');
    if (current.role === 'povjerenik') users = users.filter(u => u.role === 'stanar' && (current.buildingIds || []).includes(u.buildingId));
    const rows = users.map(u => ({
      'Ime i prezime': u.name, 'Email': u.email, 'Uloga': this.ROLES[u.role] || u.role, 'Telefon': u.phone || '',
      'Pozicija': u.role === 'uposlenik' ? (u.position || '') : '', 'Referenca': u.reference || '',
      'Zgrada': DB.findById('buildings', u.buildingId)?.name || '', 'Stan': u.apartment || '', 'Status': u.active ? 'Aktivan' : 'Neaktivan'
    }));
    this._downloadWorkbook('korisnici.xlsx', 'Korisnici', rows);
  },

  // Template za korisnike daje povjereniku i administratoru tačne kolone za import.
  downloadUserTemplate() {
    const rows = [{ name:'Ime Prezime', email:'email@primjer.ba', phone:'061 000 000', role: Auth.is('povjerenik') ? 'stanar' : 'stanar', building:'Naziv zgrade', apartment:'Stan 1', reference:'REF-001', position:'', active:'ne' }];
    this._downloadWorkbook('template_korisnici.xlsx', 'Korisnici', rows);
  },

  // Import korisnika razlikuje administratora i povjerenika: administrator odmah unosi korisnike, povjerenik šalje batch na odobrenje.
  importUsersFromExcel(input) {
    const file = input.files?.[0];
    if (!file) return;
    this._readWorkbook(file).then(rows => {
      if (Auth.is('povjerenik')) this._createUserImportBatch(rows, file.name);
      else this._importUsersDirect(rows);
      input.value = '';
    }).catch(() => this.toast('Excel fajl nije moguće pročitati.', 'error'));
  },

  // Administratorov import provjerava duplikate po emailu i referenci prije upisa.
  _importUsersDirect(rows) {
    let imported = 0, skipped = 0;
    rows.forEach(row => {
      const user = this._normalizeUserRow(row);
      if (!user.name || !user.email) { skipped++; return; }
      if (DB.findOne('users', u => u.email?.toLowerCase() === user.email.toLowerCase() || (user.reference && u.reference === user.reference))) { skipped++; return; }
      DB.insert('users', { ...user, password: user.password || this._randomPassword(), active: user.active === true });
      imported++;
    });
    this.toast(`Import završen. Uvezeno: ${imported}, preskočeno: ${skipped}.`, imported ? 'success' : 'warning');
    this.renderUsers();
  },

  // Povjerenikov upload se sprema kao batch zahtjev. Korisnici se kreiraju tek nakon administratorskog odobrenja.
  _createUserImportBatch(rows, filename) {
    const current = Auth.currentUser;
    const allowedBuildings = current.buildingIds || [];
    const normalized = rows.map(row => this._normalizeUserRow(row)).filter(row => row.name && row.email);
    const validRows = normalized.filter(row => allowedBuildings.includes(row.buildingId));
    if (!validRows.length) { this.toast('Nema validnih redova za zgrade koje su vam dodijeljene.', 'warning'); return; }
    const batch = DB.insert('userImportBatches', { povjerenikId: current.id, status: 'na_cekanju', totalRows: validRows.length, importedRows: 0, sourceFile: filename });
    validRows.forEach(row => DB.insert('userImportRows', { batchId: batch.id, ...row, password: row.password || this._randomPassword(), status: 'na_cekanju', rawData: row }));
    DB.find('users', u => u.role === 'administrator').forEach(admin => this._notify(admin.id, 'user_import', 'Novi import stanara', `${current.name} je uploadovao/la ${validRows.length} stanara za odobrenje.`, null));
    this.toast('Import je poslan administratoru na odobrenje.', 'success');
  },

  // Normalizacija podržava nazive kolona na bosanskom i engleskom radi lakšeg popunjavanja template-a.
  _normalizeUserRow(row) {
    const get = (...keys) => keys.map(k => row[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
    const buildingName = String(get('building', 'Zgrada', 'zgrada')).trim();
    const building = DB.findOne('buildings', b => b.id === buildingName || b.name?.toLowerCase() === buildingName.toLowerCase());
    const roleRaw = String(get('role', 'Uloga', 'uloga') || 'stanar').toLowerCase();
    const activeRaw = String(get('active', 'Status', 'status') || '').toLowerCase();
    return {
      name: String(get('name', 'Ime i prezime', 'Korisnik', 'korisnik')).trim(),
      email: String(get('email', 'Email')).trim().toLowerCase(),
      phone: String(get('phone', 'Telefon', 'Broj telefona')).trim(),
      role: roleRaw.includes('admin') ? 'administrator' : roleRaw.includes('pov') ? 'povjerenik' : roleRaw.includes('upos') ? 'uposlenik' : 'stanar',
      buildingId: building?.id || '',
      apartment: String(get('apartment', 'Stan', 'stan')).trim(),
      reference: String(get('reference', 'Referenca', 'referenca')).trim(),
      position: String(get('position', 'Pozicija', 'pozicija')).trim(),
      password: String(get('password', 'Lozinka', 'lozinka')).trim(),
      active: ['aktivan', 'active', 'da', 'yes', 'true', '1'].includes(activeRaw)
    };
  },

  // Export zgrada u Excel služi za izvještaj i za kontrolu podataka koji su u bazi.
  exportBuildingsToExcel() {
    let buildings = DB.findAll('buildings');
    if (Auth.is('povjerenik')) buildings = buildings.filter(b => (Auth.currentUser.buildingIds || []).includes(b.id));
    const rows = buildings.map(b => ({ 'Naziv': b.name, 'Adresa': b.address, 'Grad': b.city, 'Poštanski broj': b.postalCode || '', 'Spratova': b.floors, 'Stanova': b.units, 'Povjerenik': DB.findById('users', b.povjerenikId)?.name || '' }));
    this._downloadWorkbook('zgrade.xlsx', 'Zgrade', rows);
  },

  // Template za zgrade ima kolone koje se direktno mapiraju na Supabase tabelu buildings.
  downloadBuildingTemplate() {
    this._downloadWorkbook('template_zgrade.xlsx', 'Zgrade', [{ name:'Naziv zgrade', address:'Adresa 1', city:'Sarajevo', postalCode:'71000', floors:8, units:32, povjerenikEmail:'povjerenik@email.ba' }]);
  },

  // Import zgrada provjerava duplikate po nazivu i adresi.
  importBuildingsFromExcel(input) {
    const file = input.files?.[0];
    if (!file) return;
    this._readWorkbook(file).then(rows => {
      let imported = 0, skipped = 0;
      rows.forEach(row => {
        const get = (...keys) => keys.map(k => row[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
        const name = String(get('name', 'Naziv', 'naziv')).trim();
        const address = String(get('address', 'Adresa', 'adresa')).trim();
        const city = String(get('city', 'Grad', 'grad') || 'Sarajevo').trim();
        if (!name || !address) { skipped++; return; }
        if (DB.findOne('buildings', b => b.name?.toLowerCase() === name.toLowerCase() && b.address?.toLowerCase() === address.toLowerCase())) { skipped++; return; }
        const povEmail = String(get('povjerenikEmail', 'Povjerenik email', 'povjerenik_email')).trim().toLowerCase();
        const pov = povEmail ? DB.findOne('users', u => u.email?.toLowerCase() === povEmail && u.role === 'povjerenik') : null;
        DB.insert('buildings', { name, address, city, postalCode: String(get('postalCode', 'Poštanski broj', 'postal_code')).trim(), floors: Number(get('floors', 'Spratova')) || 5, units: Number(get('units', 'Stanova')) || 20, povjerenikId: pov?.id || null });
        imported++;
      });
      input.value = '';
      this.toast(`Import zgrada završen. Uvezeno: ${imported}, preskočeno: ${skipped}.`, imported ? 'success' : 'warning');
      this.renderBuildings();
    }).catch(() => this.toast('Excel fajl nije moguće pročitati.', 'error'));
  },

  // Stranica za administratorske zahtjeve objedinjuje registracije, reset lozinke i import stanara.
  renderAdminRequests() {
    if (!Auth.is('administrator')) { this.navigate('dashboard'); return; }
    const registrations = DB.find('registrationRequests', r => r.status === 'na_cekanju');
    const resets = DB.find('passwordResetRequests', r => r.status === 'na_cekanju');
    const batches = DB.find('userImportBatches', b => b.status === 'na_cekanju');
    const totalPending = registrations.length + resets.length + batches.length;
    const el = document.getElementById('page-admin-requests');
    el.innerHTML = `
      <div class="dashboard-hero mb-3"><div><p class="eyebrow">Administracija</p><h2>Zahtjevi koji čekaju obradu</h2><p>Ovdje se odobravaju registracije, reset lozinke i import stanara koje dostavlja povjerenik.</p></div></div>
      <div class="row g-3 align-items-start">
        <div class="col-12 col-xxl-8">
          <div class="row g-3">
            <div class="col-12 col-lg-6">${this._requestCard('Registracije', 'bi-person-plus', registrations, item => this._registrationRequestRow(item))}</div>
            <div class="col-12 col-lg-6">${this._requestCard('Reset lozinke', 'bi-key', resets, item => this._resetRequestRow(item))}</div>
            <div class="col-12">${this._requestCard('Import stanara', 'bi-file-earmark-spreadsheet', batches, item => this._importBatchRow(item))}</div>
          </div>
        </div>
        <div class="col-12 col-xxl-4">
          <div class="page-side-stack desktop-sticky">
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-hourglass-split me-2"></i>Trenutni pregled</h6></div>
              <div class="p-3">
                <div class="metrics-compact">
                  <div class="metric-box"><span>Ukupno</span><strong>${totalPending}</strong></div>
                  <div class="metric-box"><span>Registracije</span><strong>${registrations.length}</strong></div>
                  <div class="metric-box"><span>Reseti</span><strong>${resets.length}</strong></div>
                  <div class="metric-box"><span>Importi</span><strong>${batches.length}</strong></div>
                </div>
              </div>
            </div>
            <div class="app-card">
              <div class="card-header-custom"><h6><i class="bi bi-shield-check me-2"></i>Napomena</h6></div>
              <div class="p-3 small text-secondary">
                <p class="mb-2">Prije odobrenja provjeri da li su email, referenca i zgrada ispravno uneseni.</p>
                <p class="mb-0">Kod importa stanara sistem preskače duplikate po emailu i referenci.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  // Zajednički okvir za listu zahtjeva, kako tri kolone imaju isti vizuelni ritam.
  _requestCard(title, icon, rows, rowRenderer) {
    return `<div class="app-card h-100"><div class="card-header-custom"><h6><i class="bi ${icon} me-2"></i>${title}</h6><span class="badge bg-primary">${rows.length}</span></div><div class="p-3 request-list">${rows.length ? rows.map(rowRenderer).join('') : '<div class="empty-state small-empty"><i class="bi bi-check-circle"></i><p>Nema zahtjeva.</p></div>'}</div></div>`;
  },

  _registrationRequestRow(req) {
    const building = DB.findById('buildings', req.buildingId);
    return `<div class="request-item"><div><strong>${this.esc(req.name)}</strong><div class="text-tiny text-secondary">${this.esc(req.email)} · ${this.esc(building?.name || '')}</div></div><div class="d-flex gap-1"><button class="btn btn-sm btn-success" onclick="App.approveRegistration('${req.id}')"><i class="bi bi-check"></i></button><button class="btn btn-sm btn-outline-danger" onclick="App.rejectRequest('registrationRequests','${req.id}')"><i class="bi bi-x"></i></button></div></div>`;
  },

  _resetRequestRow(req) {
    return `<div class="request-item"><div><strong>${this.esc(req.email)}</strong><div class="text-tiny text-secondary">Zahtjev za novu privremenu lozinku</div></div><div class="d-flex gap-1"><button class="btn btn-sm btn-success" onclick="App.approvePasswordReset('${req.id}')"><i class="bi bi-check"></i></button><button class="btn btn-sm btn-outline-danger" onclick="App.rejectRequest('passwordResetRequests','${req.id}')"><i class="bi bi-x"></i></button></div></div>`;
  },

  _importBatchRow(batch) {
    const pov = DB.findById('users', batch.povjerenikId);
    return `<div class="request-item"><div><strong>${batch.totalRows || 0} stanara</strong><div class="text-tiny text-secondary">${this.esc(pov?.name || 'Povjerenik')} · ${this.esc(batch.sourceFile || '')}</div></div><div class="d-flex gap-1"><button class="btn btn-sm btn-success" onclick="App.approveUserImport('${batch.id}')"><i class="bi bi-check"></i></button><button class="btn btn-sm btn-outline-danger" onclick="App.rejectRequest('userImportBatches','${batch.id}')"><i class="bi bi-x"></i></button></div></div>`;
  },

  // Odobrenjem registracije nastaje aktivan nalog stanara.
  approveRegistration(id) {
    const req = DB.findById('registrationRequests', id);
    if (!req) return;
    if (DB.findOne('users', u => u.email?.toLowerCase() === req.email?.toLowerCase())) { this.toast('Korisnik već postoji.', 'warning'); return; }
    DB.insert('users', { name: req.name, email: req.email, password: req.password, phone: req.phone, role: 'stanar', buildingId: req.buildingId, buildingIds: [], apartment: req.apartment, reference: req.reference, active: true });
    DB.update('registrationRequests', id, { status: 'odobren', reviewedBy: Auth.currentUser.id, reviewedAt: new Date().toISOString() });
    this.toast('Registracija je odobrena.', 'success');
    this.renderAdminRequests();
  },

  // Reset lozinke u demo verziji generiše privremenu lozinku i upisuje je u korisnički nalog.
  approvePasswordReset(id) {
    const req = DB.findById('passwordResetRequests', id);
    const user = req ? DB.findById('users', req.userId) : null;
    if (!req || !user) return;
    const newPassword = this._randomPassword();
    DB.update('users', user.id, { password: newPassword });
    DB.update('passwordResetRequests', id, { status: 'odobren', reviewedBy: Auth.currentUser.id, reviewedAt: new Date().toISOString(), newPassword });
    this.toast(`Nova privremena lozinka za ${user.email}: ${newPassword}`, 'success');
    this.renderAdminRequests();
  },

  // Odobrenjem batch importa korisnici se kreiraju kao neaktivni i mogu se posebno aktivirati nakon provjere.
  approveUserImport(batchId) {
    const batch = DB.findById('userImportBatches', batchId);
    if (!batch) return;
    const rows = DB.find('userImportRows', row => row.batchId === batchId && row.status === 'na_cekanju');
    let imported = 0, skipped = 0;
    rows.forEach(row => {
      if (DB.findOne('users', u => u.email?.toLowerCase() === row.email?.toLowerCase() || (row.reference && u.reference === row.reference))) { skipped++; DB.update('userImportRows', row.id, { status: 'preskocen' }); return; }
      DB.insert('users', { name: row.name, email: row.email, password: row.password || this._randomPassword(), phone: row.phone, role: 'stanar', buildingId: row.buildingId, buildingIds: [], apartment: row.apartment, reference: row.reference, active: false });
      DB.update('userImportRows', row.id, { status: 'odobren' });
      imported++;
    });
    DB.update('userImportBatches', batchId, { status: 'odobren', importedRows: imported, reviewedBy: Auth.currentUser.id, reviewedAt: new Date().toISOString(), errorMessage: skipped ? `${skipped} redova preskočeno zbog duplikata.` : null });
    this.toast(`Import odobren. Kreirano: ${imported}, preskočeno: ${skipped}.`, imported ? 'success' : 'warning');
    this.renderAdminRequests();
  },

  // Odbijanje se koristi za sve tipove zahtjeva jer imaju isti statusni model.
  rejectRequest(collection, id) {
    DB.update(collection, id, { status: 'odbijen', reviewedBy: Auth.currentUser.id, reviewedAt: new Date().toISOString() });
    this.toast('Zahtjev je odbijen.', 'success');
    this.renderAdminRequests();
  },

  // Brojač administratorskih obaveza prikazuje se na dashboardu i u meniju.
  _pendingAdminWorkCount() {
    return DB.find('registrationRequests', r => r.status === 'na_cekanju').length +
      DB.find('passwordResetRequests', r => r.status === 'na_cekanju').length +
      DB.find('userImportBatches', r => r.status === 'na_cekanju').length;
  },

  // U meniju se prikazuju brojevi novih tiketa i administratorskih zahtjeva.
  _updateNavBadges() {
    const u = Auth.currentUser;
    if (!u) return;
    if (u.role === 'povjerenik') {
      const pending = DB.find('tickets', t => t.status === 'novi' && (u.buildingIds || []).includes(t.buildingId)).length;
      const el = document.getElementById('nav-badge-tickets');
      if (el) el.textContent = pending || '';
    }
    if (u.role === 'administrator') {
      const el = document.getElementById('nav-badge-admin-requests');
      if (el) el.textContent = this._pendingAdminWorkCount() || '';
    }
  },

  // Pomoćni toolbar za prikaze koji su otvoreni iz dashboard kartica.
  _backToDashboardBar(title) {
    return `<div class="back-dashboard-bar"><button class="btn btn-sm btn-outline-secondary" onclick="App.navigate('dashboard')"><i class="bi bi-arrow-left me-1"></i>Nazad na dashboard</button><strong>${this.esc(title)}</strong></div>`;
  },

  // Čitanje Excel fajla je zajedničko za korisnike i zgrade.
  _readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
        } catch (error) { reject(error); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  // Kreira i preuzima Excel fajl iz liste JavaScript objekata.
  _downloadWorkbook(filename, sheetName, rows) {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Napomena: 'Nema podataka za export.' }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  },

  // Random lozinka se koristi za bulk import i administratorski reset lozinke.
  _randomPassword() {
    return `zg-${Math.random().toString(36).slice(2, 6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  },

  // ── HELPERS ────────────────────────────────────────────────────────────

  // Generiše link prema profilu korisnika.
  userLink(userId, showRole=false) {
    if (!userId) return '—';
    const u = DB.findById('users', userId);
    if (!u) return '—';
    const initials = u.name.split(' ').map(n=>n[0]).join('').toUpperCase().substr(0,2);
    return `<span class="user-link" onclick="App.navigate('user-profile',{id:'${userId}'})">
      <div class="avatar avatar-sm avatar-${u.id}">${initials}</div>
      <span>${this.esc(u.name)}${showRole ? ` <span class="text-secondary">(${this.ROLES[u.role]})</span>` : ''}</span>
    </span>`;
  },

  // Kreira obavijest za korisnika i povezuje je sa tiketom kada postoji.
  _notify(userId, type, title, message, ticketId) {
    if (!userId) return;
    DB.insert('notifications', { userId, type, title, message, ticketId, read: false });
  },

  // Periodično osvježava brojač obavijesti dok je aplikacija otvorena.
  _startNotifPoller() {
    setInterval(() => this.updateNotifBadge(), 30000);
  },

  // HTML oznaka za status tiketa.
  statusBadge(status) {
    return `<span class="badge-status status-${status}">${this.STATUS_LABELS[status]||status}</span>`;
  },

  // HTML oznaka za prioritet tiketa.
  priorityBadge(priority) {
    const labels = { niska:'Niska', srednja:'Srednja', visoka:'Visoka', hitna:'Hitna' };
    const icons  = { niska:'bi-arrow-down', srednja:'bi-dash', visoka:'bi-arrow-up', hitna:'bi-exclamation-triangle-fill' };
    return `<span class="badge-priority priority-${priority}"><i class="bi ${icons[priority]||''}"></i> ${labels[priority]||priority}</span>`;
  },

  // Ikonica kategorije tiketa.
  catIcon(cat) {
    const icons = {
      lift:'🛗', vodoinstalacije:'🔧', elektrika:'⚡', grijanje:'🌡️',
      ciscoca:'🧹', konstrukcija:'🏗️', ostalo:'📋'
    };
    return icons[cat] || '📋';
  },

  // Formatira datum u lokalni prikaz.
  fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)   return 'Prije nekoliko sekundi';
    if (diff < 3600) return `Prije ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `Prije ${Math.floor(diff/3600)} h`;
    if (diff < 86400*7) return `Prije ${Math.floor(diff/86400)} dan(a)`;
    return d.toLocaleDateString('bs-BA', { day:'2-digit', month:'2-digit', year:'numeric' });
  },

  // Formatira veličinu fajla u čitljiv oblik.
  fmtFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1024/1024).toFixed(1) + ' MB';
  },

  // Sigurno prikazuje tekst u HTML-u i smanjuje rizik od ubacivanja neželjenog koda.
  esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  // Prikazuje kratku toast poruku korisniku.
  toast(msg, type = 'info') {
    const icons = { success:'bi-check-circle-fill', error:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const div = document.createElement('div');
    div.className = `app-toast ${type}`;
    div.innerHTML = `<i class="bi ${icons[type]||'bi-info-circle-fill'}"></i> ${this.esc(msg)}`;
    document.getElementById('toast-container').appendChild(div);
    setTimeout(() => div.remove(), 3500);
  },

  // ── OTVARANJE I ZATVARANJE MENIJA ───────────────────────────────────────

  // Otvara ili zatvara sidebar na manjim ekranima.
  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
  },

  // Zatvara sidebar nakon odabira stavke na mobilnom prikazu.
  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
  },

  // ── GLOBAL BINDINGS ────────────────────────────────────────────────────

  // Povezuje globalne evente forme, dugmadi i responsive menija.
  _bindGlobal() {
    document.getElementById('login-form').addEventListener('submit', (e) => this.doLogin(e));
    document.getElementById('sidebar-toggle').addEventListener('click', () => this.toggleSidebar());
    document.getElementById('sidebar-overlay').addEventListener('click', () => this.closeSidebar());
    document.getElementById('notif-topbar-btn').addEventListener('click', () => this.navigate('notifications'));
  }
};

export default App;
