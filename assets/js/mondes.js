// assets/js/mondes.js — Projet portable, carte des lieux, monde inventé et graphe des relations

// « Saisons », « Livres », « Actes »… selon les mots choisis pour le projet
const motNiveau = (pluriel = false) => {
  const m = (typeof Roman !== 'undefined' && Roman.haut) || { s: 'saison', p: 'saisons' };
  const w = pluriel ? m.p : m.s;
  return w.charAt(0).toUpperCase() + w.slice(1);
};

const octetsLisibles = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : n >= 1024 ? `${Math.round(n / 1024)} Ko` : `${n} o`);

const PORTABLE_MOTS = { dessins: ['dessin', 'dessins'], photos: ['photo', 'photos'], voix: ['voix', 'voix'], cartes: ['carte', 'cartes'] };

// ─── Projet portable : un seul fichier .lemenu pour tout emporter ───────────

const Portable = {
  tailles: null,
  garder: { dessins: true, photos: true, voix: true, cartes: true },
  recu: null,
  mode: 'nouveau',
  nom: '',
  envoi: false,
  portee: 'tout',

  async rendrePanel() {
    const slot = document.getElementById('portable-panel');
    if (!slot) return;
    try {
      const r = await fetch(`${API_BASE}projets/portable&slug=${encodeURIComponent(PROJET)}`);
      this.tailles = r.ok ? await r.json() : null;
    } catch (e) {
      this.tailles = null;
    }
    if (this.portee[0] === 's' && !this.tailles?.saisons?.some(x => `s${x.numero}` === this.portee)) this.portee = 'tout';
    this.rendre();
  },

  _total() {
    const t = this.tailles;
    if (!t) return 0;
    return t.textes.taille + t.reglages.taille + ['dessins', 'photos', 'voix', 'cartes'].reduce((s, g) => s + (this.garder[g] ? t[g].taille : 0), 0);
  },

  regler(g, v) {
    this.garder[g] = v;
    this.rendre();
  },

  _lienExport() {
    const p = ['dessins', 'photos', 'voix', 'cartes'].map(g => `&${g}=${this.garder[g] ? 1 : 0}`).join('');
    return `${API_BASE}projets/exporter&slug=${encodeURIComponent(PROJET)}${p}&portee=${this.portee}`;
  },

  rendre() {
    const slot = document.getElementById('portable-panel');
    if (!slot) return;
    const t = this.tailles;
    const ligne = (g, label) => {
      const n = t?.[g]?.nombre || 0;
      return `<label class="mep-coche"><input type="checkbox" ${this.garder[g] && n ? 'checked' : ''} ${n ? '' : 'disabled'} onchange="Portable.regler('${g}', this.checked)"><span>${label} (${n})<small>${octetsLisibles(t?.[g]?.taille || 0)}</small></span></label>`;
    };
    const r = this.recu;
    const nomActuel = t?.nom || 'ce projet';
    slot.innerHTML = `
      <div class="pt-grille">
        <section class="pt-bloc" aria-labelledby="pt-exp-titre">
          <h3 id="pt-exp-titre" class="an-label">Exporter « ${esc(nomActuel)} »</h3>
          ${t ? `
            <p class="an-note">Les textes, les analyses et les réglages sont toujours dans le fichier (${octetsLisibles(t.textes.taille + t.reglages.taille)}, ${t.textes.episodes} ${t.textes.episodes > 1 ? 'unités' : 'unité'}).</p>
            <label class="an-label" for="pt-portee">Ce que contient le fichier</label>
            <select id="pt-portee" onchange="Portable.portee = this.value; Portable.rendre()">
              <option value="tout" ${this.portee === 'tout' ? 'selected' : ''}>Tout le projet</option>
              ${(t.saisons || []).filter(x => x.episodes).map(x => `<option value="s${x.numero}" ${this.portee === `s${x.numero}` ? 'selected' : ''}>Seulement ${esc(x.nom || `${motNiveau()} ${x.numero}`)} (${x.episodes} ${x.episodes > 1 ? 'unités' : 'unité'})</option>`).join('')}
              <option value="bible" ${this.portee === 'bible' ? 'selected' : ''}>La bible et le monde, sans aucun texte</option>
            </select>
            ${this.portee !== 'tout' ? `<p class="an-note">${this.portee === 'bible' ? 'Personnages, décors, relations, cartes, encyclopédie, chronologie et secrets, sans les épisodes : de quoi faire écrire un coauteur dans ton univers.' : 'Les autres saisons restent ici. Les dessins et les voix ne partent que pour les épisodes gardés ; les analyses se recalculent à l\'ouverture.'}</p>` : ''}
            ${ligne('dessins', 'Dessins du storyboard')}
            ${ligne('photos', 'Photos du casting et fiches dessinées')}
            ${ligne('voix', 'Voix enregistrées')}
            ${ligne('cartes', 'Cartes et mondes inventés')}
            <div class="pt-total"><span>Un seul fichier</span><strong>${esc(nomActuel)}${this.portee === 'tout' ? '' : this.portee === 'bible' ? ' - bible' : ` - S${esc(this.portee.slice(1))}`}.lemenu · ${this.portee === 'tout' ? octetsLisibles(this._total()) : 'plus léger que le projet entier'}</strong></div>
            <a class="btn btn-primary btn-sm" href="${esc(this._lienExport())}" download>⬇ Exporter le projet</a>
            <p class="an-note">Laisse les dessins ou les voix à la maison pour un envoi plus léger : les textes restent complets.</p>
          ` : '<p class="an-note">Impossible de mesurer le projet pour l\'instant.</p>'}
        </section>
        <section class="pt-bloc" aria-labelledby="pt-imp-titre">
          <h3 id="pt-imp-titre" class="an-label">Importer un projet</h3>
          <label class="pt-depot" ondragover="event.preventDefault(); this.classList.add('survol')" ondragleave="this.classList.remove('survol')" ondrop="event.preventDefault(); this.classList.remove('survol'); Portable.recevoir(event.dataTransfer.files[0])">
            <input type="file" accept=".lemenu,application/zip" onchange="Portable.recevoir(this.files[0]); this.value = ''">
            <span>${this.envoi ? 'Lecture du fichier…' : 'Dépose un fichier .lemenu ici, ou clique pour le choisir'}</span>
          </label>
          ${r ? `
            <div class="pt-apercu">
              <strong>${esc(r.nom)}</strong>
              <span class="an-note">${esc(Projets._resume({ ...r, storyboard: false }))}${['dessins', 'photos', 'voix', 'cartes'].filter(g => r.contenu[g]).map(g => ` · ${r.contenu[g]} ${PORTABLE_MOTS[g][r.contenu[g] > 1 ? 1 : 0]}`).join('')}${r.date ? ` · exporté le ${esc(new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}</span>
              <span class="pt-ok">✓ Fichier complet : ${r.elements} élément(s), ${octetsLisibles(r.taille)}${r.ignores ? ` · ${r.ignores} fichier(s) inconnu(s) laissé(s) de côté` : ''}</span>
            </div>
            <span class="an-label">Ce que tu en fais</span>
            <div class="an-ligne" role="group" aria-label="Mode d'import">
              <button type="button" class="an-choix ${this.mode === 'nouveau' ? 'actif' : ''}" aria-pressed="${this.mode === 'nouveau'}" onclick="Portable.choisirMode('nouveau')">Nouveau projet</button>
              <button type="button" class="an-choix ${this.mode === 'remplacer' ? 'actif' : ''}" aria-pressed="${this.mode === 'remplacer'}" onclick="Portable.choisirMode('remplacer')">Remplacer « ${esc(nomActuel)} »</button>
            </div>
            ${this.mode === 'nouveau' ? `
              <label class="an-label" for="pt-nom">Nom du nouveau projet</label>
              <input id="pt-nom" type="text" maxlength="80" value="${esc(this.nom)}" oninput="Portable.nom = this.value">
              <p class="an-note">${r.existe ? `Un projet s'appelle déjà « ${esc(r.nom)} » : celui-ci s'ajoute à côté, rien n'est touché.` : 'Il s\'ajoute à côté de tes projets.'}</p>
            ` : `<p class="an-note pt-attention">« ${esc(nomActuel)} » sera remplacé par le fichier. L'ancienne version part dans la corbeille des projets : tu peux la restaurer.</p>`}
            <div class="an-ligne">
              <button type="button" class="btn btn-primary btn-sm" ${this.envoi ? 'disabled' : ''} onclick="Portable.importer()">${this.mode === 'nouveau' ? 'Importer comme nouveau projet' : `Remplacer « ${esc(nomActuel)} »`}</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="Portable.annuler()">Annuler</button>
            </div>
          ` : ''}
        </section>
      </div>`;
  },

  choisirMode(m) {
    this.mode = m;
    this.rendre();
  },

  annuler() {
    this.recu = null;
    this.rendre();
  },

  async recevoir(fichier) {
    if (!fichier || this.envoi) return;
    const limite = this.tailles?.limite || 512 * 1048576;
    if (fichier.size > limite) { toast(`Le fichier fait ${octetsLisibles(fichier.size)} : ce serveur accepte ${octetsLisibles(limite)} au plus (post_max_size dans php.ini). Exporte-le sans les dessins ou les voix, ou augmente la limite.`, 'error'); return; }
    this.envoi = true;
    this.rendre();
    try {
      const r = await fetch(`${API_BASE}projets/apercu_import`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fichier });
      const j = await r.json().catch(() => ({ error: 'Le serveur n\'a pas pu lire le fichier (trop lourd ?).' }));
      if (!r.ok || j.error) throw new Error(j.error || 'Fichier refusé.');
      this.recu = j;
      this.nom = j.existe ? `${j.nom} (importé)` : j.nom;
      this.mode = 'nouveau';
    } catch (e) {
      this.recu = null;
      toast(e.message, 'error');
    }
    this.envoi = false;
    this.rendre();
  },

  async importer() {
    const r = this.recu;
    if (!r || this.envoi) return;
    const nomActuel = this.tailles?.nom || 'ce projet';
    if (this.mode === 'remplacer' && !confirm(`Remplacer « ${nomActuel} » par « ${r.nom} » ? L'ancienne version ira dans la corbeille des projets.`)) return;
    this.envoi = true;
    this.rendre();
    if (typeof Ecriture !== 'undefined') await Ecriture.viderNotes();
    const res = await api.post('projets/importer', { jeton: r.jeton, mode: this.mode, slug: PROJET, nom: this.mode === 'nouveau' ? this.nom.trim() : '' }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    this.envoi = false;
    if (res.error) {
      toast(res.error, 'error');
      if (/plus là|abîmée/.test(res.error)) this.recu = null;
      this.rendre();
      return;
    }
    this.recu = null;
    if (this.mode === 'remplacer') {
      toast('Projet remplacé.');
      location.reload();
      return;
    }
    toast(`« ${res.nom} » est importé.`);
    this.rendre();
    if (typeof Projets !== 'undefined') {
      await Projets.charger?.();
      Projets.rendrePanel?.();
      if (confirm(`Ouvrir « ${res.nom} » maintenant ?`)) Projets.changer(res.slug);
    }
  },
};

// ─── Carte des lieux : une image, des épingles, les scènes de chaque lieu ───

const Cartes = {
  cartes: [],
  places: [],
  saisons: [],
  saison: 0,
  id: null,
  scenes: { lieux: {}, trajets: {} },
  choisi: null,
  placer: null,
  pile: [],
  fiche: null,
  _mondes: new Map(),
  _histoires: new Map(),
  vueMonde: 'carte',
  personne: null,
  _encyclos: new Map(),
  trajet: '',
  noms: true,
  mode: 'epingler',
  affichage: 'epingles',
  rejeu: null,
  _charge: false,

  _img: f => `${API_BASE}cartes/image&f=${encodeURIComponent(f)}`,

  carte() {
    return this.cartes.find(c => c.id === this.id) || null;
  },

  async monter(slot) {
    this.slot = slot;
    slot.innerHTML = '<p class="an-note">Chargement des cartes…</p>';
    try {
      const d = await api.get('cartes');
      this.cartes = d.cartes || [];
      this.places = d.places || [];
      this.saisons = d.saisons || [];
      if (!this.carte()) this.id = this.cartes[0]?.id || null;
      if (this.saison && !this.saisons.some(s => +s.numero === this.saison)) this.saison = 0;
      await this._chargerScenes();
    } catch (e) {
      slot.innerHTML = '<p class="an-note">Impossible de charger les cartes.</p>';
      return;
    }
    this.rendre();
  },

  async _chargerScenes() {
    try {
      this.scenes = await api.get(`cartes/scenes&saison=${this.saison}`);
    } catch (e) {
      this.scenes = { lieux: {}, trajets: {}, sequence: [], episodes: [] };
    }
    if (this.rejeu && !this._scenesRejeu().length) this.arreterRejeu();
  },

  // Où se trouve un lieu sur cette carte : son épingle, ou celle du plan détaillé qui le contient
  _position(c, cle, prof = 0) {
    const ep = c?.epingles || {};
    if (ep[cle]) return ep[cle];
    if (prof > 2) return null;
    for (const p of Object.values(ep)) {
      const sous = p.sous && this.cartes.find(x => x.id === p.sous);
      if (sous && this._position(sous, cle, prof + 1)) return p;
    }
    return null;
  },

  _couleurPerso(nom) {
    let h = 0;
    for (const ch of nom) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return MONDE_ROYAUMES[h % MONDE_ROYAUMES.length];
  },

  // Un personnage qui traverse la carte entre deux scènes collées : « juste après » à l'autre bout,
  // ou « au même moment » ailleurs
  _teleportations(c) {
    const seq = this.scenes.sequence || [];
    const immediat = /SUITE|CONTINU|JUSTE APR[EÈ]S|INSTANTS?|SECONDES?|IMM[EÉ]DIATEMENT|^\s*APR[EÈ]S\s*$/;
    const meme = /M[EÊ]ME MOMENT|PENDANT CE TEMPS|SIMULTAN/;
    const alertes = [];
    for (let k = 1; k < seq.length; k++) {
      const [ep, , slug, cles, persos] = seq[k];
      const [epA, , , clesA, persosA] = seq[k - 1];
      if (ep !== epA) continue;
      const temps = (slug.split(/—|--| - /).slice(1).join(' ') || '').toUpperCase();
      const simultane = meme.test(temps);
      if (/AVANT/.test(temps) || (!simultane && !immediat.test(temps))) continue;
      const A = clesA.map(x => this._position(c, x)).filter(Boolean);
      const B = cles.map(x => this._position(c, x)).filter(Boolean);
      if (!A.length || !B.length || cles.some(x => clesA.includes(x))) continue;
      const d = Math.min(...A.flatMap(a => B.map(b => Math.hypot(a.x - b.x, a.y - b.y))));
      if (simultane ? d < 0.02 : d < 0.35) continue;
      const qui = persos.filter(p => persosA.includes(p));
      if (!qui.length) continue;
      const e = (this.scenes.episodes || []).find(x => x.id === ep);
      const rang = seq.slice(0, k + 1).filter(x => x[0] === ep).length;
      alertes.push({ k, ep, code: e?.code || '', rang, qui, de: this._place(clesA[0])?.nom || '?', vers: this._place(cles[0])?.nom || '?', temps: temps.trim(), simultane });
    }
    return alertes;
  },

  _scenesRejeu() {
    return this.rejeu ? (this.scenes.sequence || []).filter(x => x[0] === this.rejeu.ep) : [];
  },

  rejouer(ep, rang = 1) {
    clearTimeout(this._minuteurRejeu);
    if (!ep) { this.arreterRejeu(); return; }
    this.rejeu = { ep: +ep, k: Math.max(0, rang - 1), lecture: false };
    this.trajet = '';
    this.rendre();
  },

  arreterRejeu() {
    clearTimeout(this._minuteurRejeu);
    this.rejeu = null;
    this.rendre();
  },

  pas(d) {
    if (!this.rejeu) return;
    const n = this._scenesRejeu().length;
    this.rejeu.k = Math.max(0, Math.min(n - 1, this.rejeu.k + d));
    if (this.rejeu.k >= n - 1 && d > 0 && this.rejeu.lecture) this.rejeu.lecture = false;
    this.rendre();
  },

  lecture() {
    if (!this.rejeu) return;
    const n = this._scenesRejeu().length;
    if (!this.rejeu.lecture && this.rejeu.k >= n - 1) this.rejeu.k = 0;
    this.rejeu.lecture = !this.rejeu.lecture;
    this.rendre();
  },

  _suiteRejeu() {
    clearTimeout(this._minuteurRejeu);
    if (!this.rejeu?.lecture) return;
    this._minuteurRejeu = setTimeout(() => {
      if (!this.rejeu?.lecture || !this.slot?.isConnected || !document.getElementById('ct-plan')) { if (this.rejeu) this.rejeu.lecture = false; return; }
      this.pas(1);
    }, 1600);
  },

  // Les personnages de la scène, posés près du lieu où ils sont ; ils partent de là où ils étaient
  _pionsRejeu(c) {
    const scenes = this._scenesRejeu();
    const sc = scenes[this.rejeu.k];
    if (!sc) return { html: '', ici: new Set() };
    const ici = new Set(sc[3]);
    const lieu = sc[3].map(x => this._position(c, x)).find(Boolean);
    if (!lieu) return { html: '', ici };
    const avant = p => {
      for (let j = this.rejeu.k - 1; j >= 0; j--) if (scenes[j][4].includes(p)) return scenes[j][3].map(x => this._position(c, x)).find(Boolean);
      return null;
    };
    const html = sc[4].slice(0, 10).map((p, n) => {
      const ang = (n / Math.max(1, Math.min(10, sc[4].length))) * Math.PI * 2 - Math.PI / 2;
      const x = lieu.x + Math.cos(ang) * 0.035, y = lieu.y + Math.sin(ang) * 0.05;
      const de = avant(p) || { x, y };
      return `<span class="ct-pion" style="left:${de.x * 100}%;top:${de.y * 100}%;--c:${this._couleurPerso(p)}" data-x="${x * 100}" data-y="${y * 100}" title="${esc(p)}"><span>${esc(p.slice(0, 2))}</span></span>`;
    }).join('');
    return { html, ici };
  },

  _barreRejeu(c) {
    const eps = (this.scenes.episodes || []);
    if (!eps.length) return '';
    const scenes = this._scenesRejeu();
    const sc = scenes[this.rejeu?.k ?? -1];
    const nomLieux = sc ? sc[3].map(x => this._place(x)?.nom).filter(Boolean).join(', ') : '';
    const absent = sc && !sc[3].some(x => this._position(c, x));
    return `<div class="ct-rejeu" role="group" aria-label="Rejouer un épisode">
      <label class="an-label" for="ct-rejeu-ep">Rejouer</label>
      <select id="ct-rejeu-ep" onchange="Cartes.rejouer(this.value)">
        <option value="">Choisir un épisode…</option>
        ${eps.map(e => `<option value="${e.id}" ${this.rejeu?.ep === e.id ? 'selected' : ''}>${esc(e.code)}${e.titre ? ` · ${esc(e.titre.slice(0, 40))}` : ''}</option>`).join('')}
      </select>
      ${this.rejeu ? `
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Scène précédente" onclick="Cartes.pas(-1)" ${this.rejeu.k ? '' : 'disabled'}>◀</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Cartes.lecture()">${this.rejeu.lecture ? '⏸ Pause' : '▶ Lecture'}</button>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Scène suivante" onclick="Cartes.pas(1)" ${this.rejeu.k < scenes.length - 1 ? '' : 'disabled'}>▶</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.arreterRejeu()">Fermer</button>
        <p class="ct-rejeu-scene" role="status"><strong>Scène ${this.rejeu.k + 1}/${scenes.length}</strong> · ${esc(sc?.[2] || '')}${nomLieux ? ` <span class="an-note">→ ${esc(nomLieux)}</span>` : ''}${absent ? ' <span class="an-note">(lieu absent de cette carte)</span>' : ''}${sc?.[4].length ? `<br><span class="an-note">${esc(sc[4].join(', '))}</span>` : ''}</p>` : ''}
    </div>`;
  },

  _niveau(n) {
    const s = this.saisons.find(x => +x.numero === +n);
    return s?.nom || `S${n}`;
  },

  _place(cle) {
    return this.places.find(p => p.cle === cle);
  },

  rendre() {
    const slot = this.slot;
    if (!slot?.isConnected) return;
    const c = this.carte();
    if (c && c.monde && this.mode === 'dessiner') {
      slot.innerHTML = this._barre(c) + '<div id="monde-vue"></div>';
      Monde.monter(document.getElementById('monde-vue'), c);
      return;
    }
    if (c?.monde && !this._mondes.has(c.id)) {
      this._chargerMonde(c.id).then(() => this.rendre());
      return;
    }
    slot.innerHTML = this._barre(c) + (c ? this._carte(c) : this._vide());
    this._brancher();
  },

  // Le monde dessiné (ses villes, ses royaumes, ses noms) et les fiches de son encyclopédie
  async _chargerMonde(id) {
    let etat = null, fiches = {};
    try {
      const [d, f, h] = await Promise.all([api.get(`cartes/monde&id=${id}`), api.get(`cartes/encyclo&id=${id}`), api.get(`cartes/histoire&id=${id}`)]);
      this._histoires.set(id, { evenements: h?.evenements || [], gens: h?.gens || [] });
      etat = Monde.lire(d);
      fiches = f && typeof f === 'object' && !Array.isArray(f) ? f : {};
    } catch (e) {}
    const elements = [];
    if (etat) {
      etat.royaumes.forEach(k => {
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < etat.r.length; i++) if (etat.r[i] === k.id) { sx += i % MONDE_L; sy += Math.floor(i / MONDE_L); n++; }
        elements.push({ cle: `r:${k.id}`, type: 'royaume', nom: k.nom, couleur: k.couleur, x: n ? (sx / n + 0.5) / MONDE_L : null, y: n ? (sy / n + 0.5) / MONDE_H : null });
      });
      etat.villes.forEach(v => elements.push({ cle: `v:${v.id}`, type: v.capitale ? 'capitale' : 'ville', nom: v.nom, x: v.x / MONDE_L, y: v.y / MONDE_H }));
      etat.noms.forEach(v => elements.push({ cle: `n:${v.id}`, type: v.mer ? 'mer' : 'nom', nom: v.texte, x: v.x / MONDE_L, y: v.y / MONDE_H }));
    }
    this._mondes.set(id, { titre: etat?.titre || '', elements });
    this._encyclos.set(id, fiches);
  },

  _barre(c) {
    const pil = (on, l, action, titre = '') => `<button type="button" class="an-choix ${on ? 'actif' : ''}" aria-pressed="${on}" ${titre ? `title="${esc(titre)}"` : ''} onclick="${action}">${esc(l)}</button>`;
    return `
      <div class="ct-barre">
        <div class="an-ligne" role="group" aria-label="Cartes">
          ${this.cartes.map(x => pil(x.id === this.id, (x.monde ? '✦ ' : '') + x.nom, `Cartes.ouvrir('${x.id}')`)).join('')}
          <label class="btn btn-ghost btn-sm ct-fichier">+ Carte depuis une image<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Cartes.nouvelle(this.files[0]); this.value = ''"></label>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.nouveauMonde()">+ Monde inventé</button>
        </div>
        ${c ? `<div class="an-ligne" role="group" aria-label="Saison">
          <span class="an-label">${esc(motNiveau(true))}</span>
          ${pil(this.saison === 0, 'Toutes', 'Cartes.choisirSaison(0)')}
          ${this.saisons.map(s => pil(this.saison === +s.numero, `${s.numero}`, `Cartes.choisirSaison(${+s.numero})`, s.nom)).join('')}
        </div>` : ''}
      </div>`;
  },

  _vide() {
    return `<div class="empty-state">
      <div class="empty-icon">⌖</div>
      <div class="empty-title">Aucune carte</div>
      <div class="empty-sub">Pose le plan d'une ville, d'un appartement ou d'un niveau de jeu, puis épingle tes lieux dessus. Ou invente un monde de toutes pièces.</div>
    </div>`;
  },

  _carte(c) {
    const ep = c.epingles || {};
    const lieux = this.scenes.lieux || {};
    const max = Math.max(1, ...Object.keys(ep).map(k => lieux[k]?.scenes.length || 0));
    const choisi = this.choisi && this._place(this.choisi) ? this.choisi : null;
    const rejeu = this.rejeu ? this._pionsRejeu(c) : null;
    const chaleur = this.affichage === 'chaleur' && !rejeu;
    // La chaleur ne suit qu'une teinte : plus un décor sert, plus son halo est dense et large
    const halos = chaleur ? Object.entries(ep).filter(([k]) => this._place(k)).map(([k, p]) => {
      const n = lieux[k]?.scenes.length || 0;
      const r = n ? Math.sqrt(n / max) : 0;
      return `<span class="ct-halo" style="left:${p.x * 100}%;top:${p.y * 100}%;--r:${Math.round(40 + 150 * r)}px;--a:${(0.18 + 0.62 * r).toFixed(2)}"></span>`;
    }).join('') : '';
    const pins = Object.entries(ep).filter(([k]) => this._place(k)).map(([k, p]) => {
      const n = lieux[k]?.scenes.length || 0;
      const t = Math.round(16 + 22 * Math.sqrt(n / max));
      const pl = this._place(k);
      const plan = p.sous && this.cartes.some(x => x.id === p.sous);
      const etat = rejeu ? (rejeu.ici.has(k) || (p.sous && [...rejeu.ici].some(x => !ep[x] && this._position(c, x) === p)) ? 'rejeu-ici' : 'rejeu-loin') : '';
      return `<button type="button" class="ct-pin ${etat} ${k === choisi ? 'actif' : ''} ${n ? '' : 'vide'} ${pl.type === 'jeu' ? 'jeu' : ''} ${plan ? 'a-plan' : ''}" data-cle="${k}" ${plan ? `data-sous="${p.sous}"` : ''} style="left:${p.x * 100}%;top:${p.y * 100}%;--t:${t}px" aria-label="${esc(pl.nom)} : ${n} scène(s)${plan ? ', a un plan détaillé (double-clic pour l\'ouvrir)' : ''}">
        <span class="ct-rond">${plan ? '<span class="ct-badge" aria-hidden="true">↘</span>' : ''}</span>${this.noms ? `<span class="ct-nom">${esc(pl.nom)}</span>` : ''}</button>`;
    }).join('');
    const monde = c.monde ? this._mondes.get(c.id) : null;
    const fiches = c.monde ? this._encyclos.get(c.id) || {} : {};
    const reperes = monde ? monde.elements.filter(x => x.x !== null && x.type !== 'royaume').map(x => `<button type="button" class="ct-element ${x.type} ${this._remplie(fiches[x.cle]) ? 'rempli' : ''} ${this.fiche === x.cle ? 'actif' : ''}" data-fiche="${x.cle}" style="left:${x.x * 100}%;top:${x.y * 100}%" aria-label="Fiche de ${esc(x.nom)}" title="${esc(x.nom)} : ouvrir sa fiche"></button>`).join('') : '';
    // Le trajet relie, dans l'ordre des scènes, les lieux épinglés où passe le personnage
    const etapes = this.trajet && !rejeu ? (this.scenes.trajets?.[this.trajet] || []).map(k => this._position(c, k)).filter((p, i, t) => p && p !== t[i - 1]) : [];
    const trajet = etapes.length > 1 ? `<svg class="ct-trajet" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${['halo', 'trait'].map(c => `<polyline class="${c}" points="${etapes.map(p => `${p.x * 1000},${p.y * 1000}`).join(' ')}" vector-effect="non-scaling-stroke"/>`).join('')}</svg>` : '';
    const teleports = this._teleportations(c);
    const peuUtilises = Object.keys(ep).filter(k => this._place(k) && this._place(k).type === 'decor').map(k => [k, lieux[k]?.scenes.length || 0]).filter(([, n]) => n <= 1).sort((a, b) => a[1] - b[1]);
    const restants = this.places.filter(p => !ep[p.cle]);
    const persos = Object.keys(this.scenes.trajets || {}).sort((a, b) => (this.scenes.trajets[b].length - this.scenes.trajets[a].length) || a.localeCompare(b));
    const titreSaison = this.saison ? this._niveau(this.saison) : 'toutes saisons';
    return `
      <div class="ct-grille">
        <section class="ct-zone" aria-label="Carte ${esc(c.nom)}">
          <div class="ct-entete">
            <div class="ct-ariane">
              ${this.pile.length ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.remonter()">← ${esc(this.cartes.find(x => x.id === this.pile[this.pile.length - 1])?.nom || 'Retour')}</button>` : ''}
              <h3 class="an-label">${this.pile.map(id => `${esc(this.cartes.find(x => x.id === id)?.nom || '')} › `).join('')}${esc(c.nom)} · ${esc(titreSaison)}</h3>
            </div>
            <div class="an-ligne">
              ${c.monde ? '<button type="button" class="btn btn-secondary btn-sm" onclick="Cartes.dessiner()">✎ Dessiner le monde</button>' : `<label class="btn btn-ghost btn-sm ct-fichier">Changer l'image<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Cartes.image(this.files[0]); this.value = ''"></label>`}
              <button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.renommer()">Renommer</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.retirer()">Supprimer</button>
            </div>
          </div>
          ${c.monde ? `<div class="an-ligne vues-onglet" role="group" aria-label="Vue du monde">${[['carte', 'Carte'], ['frise', 'Chronologie'], ['familles', 'Familles']].map(([k, l]) => `<button type="button" class="an-choix ${this.vueMonde === k ? 'actif' : ''}" aria-pressed="${this.vueMonde === k}" onclick="Cartes.choisirVueMonde('${k}')">${l}</button>`).join('')}</div>` : ''}
          ${c.monde && this.vueMonde === 'frise' ? this._frise(c) : c.monde && this.vueMonde === 'familles' ? this._familles(c) : c.fichier ? `
            <div class="ct-plan ${this.placer ? 'pose' : ''}" id="ct-plan">
              <img src="${this._img(c.fichier)}" alt="" draggable="false">
              ${halos}${reperes}${trajet}${pins}${rejeu ? rejeu.html : ''}
              ${this.placer ? `<p class="ct-consigne" role="status">Clique sur la carte pour poser « ${esc(this._place(this.placer)?.nom || '')} ». <button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); Cartes.placer = null; Cartes.rendre()">Annuler</button></p>` : ''}
            </div>` : `<div class="ct-sans">${c.monde ? '<p>Ce monde n\'est pas encore dessiné.</p><button type="button" class="btn btn-primary btn-sm" onclick="Cartes.dessiner()">✎ Dessiner le monde</button>' : `<p>Cette carte n'a pas encore d'image.</p><label class="btn btn-primary btn-sm ct-fichier">Choisir une image<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Cartes.image(this.files[0]); this.value = ''"></label>`}</div>`}
          <div class="an-ligne">
            <label class="an-label" for="ct-trajet">Trajet</label>
            <select id="ct-trajet" onchange="Cartes.trajet = this.value; Cartes.rendre()">
              <option value="">Aucun</option>
              ${persos.map(p => `<option value="${esc(p)}" ${p === this.trajet ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
            <button type="button" class="an-choix ${this.noms ? 'actif' : ''}" aria-pressed="${this.noms}" onclick="Cartes.noms = !Cartes.noms; Cartes.rendre()">Noms des lieux</button>
            <button type="button" class="an-choix ${this.affichage === 'chaleur' ? 'actif' : ''}" aria-pressed="${this.affichage === 'chaleur'}" onclick="Cartes.affichage = Cartes.affichage === 'chaleur' ? 'epingles' : 'chaleur'; Cartes.rendre()">Chaleur des décors</button>
          </div>
          ${c.fichier && (!c.monde || this.vueMonde === 'carte') ? this._barreRejeu(c) : ''}
          <p class="an-note">La taille d'une épingle suit le nombre de scènes jouées dans ce lieu sur la période choisie. Glisse une épingle pour la déplacer. « Trajet » relie les lieux d'un personnage dans l'ordre où il y va. « Rejouer » allume les lieux d'un épisode scène par scène.${chaleur ? ' Chaleur : plus le halo est dense, plus le décor sert.' : ''}</p>
        </section>
        <aside class="ct-cote">
          ${this.fiche && monde?.elements.some(x => x.cle === this.fiche) ? this._fiche(c, this.fiche) : choisi ? this._detail(choisi) : `<section class="ct-bloc"><p class="an-note">Clique sur une épingle pour voir les scènes jouées dans ce lieu et qui y va.${monde ? ' Clique sur une ville ou un nom du monde pour ouvrir sa fiche.' : ''}</p></section>`}
          ${monde ? this._encyclopedie(c, monde, fiches) : ''}
          ${teleports.length ? `<section class="ct-bloc gr-alerte eteint" aria-labelledby="ct-tele">
            <h3 id="ct-tele" class="an-label">⚠ Trajets impossibles (${teleports.length})</h3>
            ${teleports.slice(0, 6).map(t => `<p><button type="button" class="ct-lien" onclick="Cartes.rejouer(${t.ep}, ${t.rang})">${esc(t.code)} · sc. ${t.rang - 1} → ${t.rang}</button><br><strong>${esc(t.qui.slice(0, 3).join(', '))}</strong> : ${esc(t.de)} → ${esc(t.vers)}<br><span class="an-note">${t.simultane ? 'au même moment, dans deux lieux différents.' : `« ${esc(t.temps.toLowerCase())} », mais à l'autre bout de la carte.`}</span></p>`).join('')}
            ${teleports.length > 6 ? `<p class="an-note">… et ${teleports.length - 6} autres.</p>` : ''}
          </section>` : ''}
          ${chaleur ? `<section class="ct-bloc" aria-labelledby="ct-peu">
            <h3 id="ct-peu" class="an-label">Décors qui servent peu (${peuUtilises.length})</h3>
            ${peuUtilises.length ? `<ul class="ct-scenes">${peuUtilises.slice(0, 20).map(([k, n]) => `<li><button type="button" class="ct-lien" onclick="Cartes.choisi = '${k}'; Cartes.rendre()">${esc(this._place(k).nom)}</button> <span class="an-note">${n ? 'une seule scène' : 'aucune scène'}</span></li>`).join('')}</ul><p class="an-note">Un décor construit pour une seule scène coûte cher : à fusionner avec un autre ?</p>` : '<p class="an-note">Chaque décor épinglé sert au moins deux fois.</p>'}
          </section>` : ''}
          <section class="ct-bloc" aria-labelledby="ct-restants">
            <h3 id="ct-restants" class="an-label">Pas encore sur la carte (${restants.length})</h3>
            ${restants.length ? `<div class="ct-liste">${restants.map(p => `<button type="button" class="ct-a-poser ${this.placer === p.cle ? 'actif' : ''}" aria-pressed="${this.placer === p.cle}" onclick="Cartes.aPoser('${p.cle}')"><span>⌖</span>${esc(p.nom)}${p.type === 'jeu' ? '<small>lieu du jeu</small>' : ''}${lieux[p.cle] ? `<small>${lieux[p.cle].scenes.length} sc.</small>` : ''}</button>`).join('')}</div>
              <p class="an-note">Choisis un lieu, puis clique sur la carte pour l'épingler.</p>` : `<p class="an-note">${this.places.length ? 'Tous les lieux sont épinglés.' : 'Aucun décor pour l\'instant : ajoute-les dans la liste des décors.'}</p>`}
          </section>
        </aside>
      </div>`;
  },

  choisirVueMonde(v) {
    this._viderFiches();
    this.vueMonde = v;
    this.placer = null;
    this.rendre();
  },

  _histoire(c) {
    if (!this._histoires.has(c.id)) this._histoires.set(c.id, { evenements: [], gens: [] });
    return this._histoires.get(c.id);
  },

  // Une année négative se lit « avant » : -120 → 120 av.
  _an(n) {
    return n < 0 ? `${-n} av.` : `An ${n}`;
  },

  // Les éléments du monde qu'un événement peut toucher, et les royaumes d'une famille
  _elementsMonde(c, types) {
    return (this._mondes.get(c.id)?.elements || []).filter(x => !types || types.includes(x.type));
  },

  // Chaque retouche part une demi-seconde après la dernière frappe ; l'état local fait foi entre-temps
  _noterHistoire(c, maj, redessiner = true) {
    const h = this._histoire(c);
    maj(h);
    if (redessiner) this.rendre();
    clearTimeout(this._minuteurHistoire);
    const id = c.id;
    this._minuteurHistoire = setTimeout(async () => {
      const r = await api.post('cartes', { action: 'histoire', id, histoire: this._histoires.get(id) }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
      if (r.error) { toast(r.error, 'error'); return; }
      const etat = document.getElementById('ct-h-etat');
      if (etat) etat.textContent = 'Enregistré';
    }, 500);
  },

  ajouterEvenement() {
    const c = this.carte();
    const an = document.getElementById('ct-ev-an')?.value.trim();
    const titre = document.getElementById('ct-ev-titre')?.value.trim();
    if (!c || an === '' || !/^-?\d{1,6}$/.test(an || '')) { toast('Indique une année (un nombre, négatif pour « avant »).', 'error'); return; }
    if (!titre) { toast('Donne un titre à l\'événement.', 'error'); return; }
    const lieu = document.getElementById('ct-ev-lieu')?.value || '';
    this._noterHistoire(c, h => {
      if (h.evenements.length >= 300) { toast('300 événements au plus.', 'error'); return; }
      h.evenements.push({ id: idMonde(), an: +an, titre: titre.slice(0, 120), texte: '', lieu });
      h.evenements.sort((a, b) => a.an - b.an);
    });
  },

  modifierEvenement(id, champ, valeur, redessiner = false) {
    const c = this.carte();
    if (!c) return;
    this._noterHistoire(c, h => {
      const e = h.evenements.find(x => x.id === id);
      if (!e) return;
      if (champ === 'an') { if (!/^-?\d{1,6}$/.test(String(valeur).trim())) return; e.an = +valeur; h.evenements.sort((a, b) => a.an - b.an); }
      else e[champ] = String(valeur).slice(0, champ === 'texte' ? 2000 : 120);
    }, redessiner);
  },

  retirerEvenement(id) {
    const c = this.carte();
    if (c) this._noterHistoire(c, h => { h.evenements = h.evenements.filter(x => x.id !== id); });
  },

  _frise(c) {
    const h = this._histoire(c);
    const evs = h.evenements;
    const elements = this._elementsMonde(c);
    const nomEl = k => elements.find(x => x.cle === k)?.nom || '';
    const options = sel => `<option value="">Aucun lieu</option>${elements.map(x => `<option value="${x.cle}" ${x.cle === sel ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}`;
    // La frise est à l'échelle du temps : deux événements proches dans les années le sont à l'écran
    let axe = '';
    if (evs.length) {
      const min = evs[0].an, max = evs[evs.length - 1].an, ecart = Math.max(1, max - min);
      const X = an => 40 + 920 * (evs.length === 1 ? 0.5 : (an - min) / ecart);
      axe = `<svg class="ct-frise" viewBox="0 0 1000 170" role="img" aria-label="Chronologie de ${esc(c.nom)}, de ${esc(this._an(min))} à ${esc(this._an(max))}">
        <line x1="30" y1="85" x2="970" y2="85" class="axe"/>
        ${evs.map((e, i) => { const x = X(e.an), haut = i % 2 === 0, y = haut ? 48 : 122, ancre = x < 160 ? 'start' : x > 840 ? 'end' : 'middle', tx = ancre === 'start' ? x - 6 : ancre === 'end' ? x + 6 : x; return `<g class="ev" tabindex="0" role="button" aria-label="${esc(this._an(e.an))} : ${esc(e.titre)}" onclick="document.getElementById('ct-ev-${e.id}')?.scrollIntoView({ block: 'center' }); document.getElementById('ct-ev-${e.id}')?.focus()">
          <line x1="${x}" y1="85" x2="${x}" y2="${haut ? 58 : 112}" class="tige"/><circle cx="${x}" cy="85" r="6"/>
          <text x="${tx}" y="${y - (haut ? 16 : 0)}" text-anchor="${ancre}" class="an">${esc(this._an(e.an))}</text>
          <text x="${tx}" y="${y + (haut ? 0 : 17)}" text-anchor="${ancre}">${esc(e.titre.length > 24 ? e.titre.slice(0, 23) + '…' : e.titre)}</text></g>`; }).join('')}
      </svg>`;
    }
    return `<div class="ct-histoire">
      ${axe || '<p class="an-note">Pas encore d\'événement. Ajoute la fondation d\'une ville, une guerre, un couronnement…</p>'}
      <div class="ct-ev-ajout" role="group" aria-label="Nouvel événement">
        <input id="ct-ev-an" type="number" step="1" placeholder="Année" aria-label="Année (négative pour avant)">
        <input id="ct-ev-titre" type="text" maxlength="120" placeholder="Fondation de Valmont" aria-label="Titre de l'événement" onkeydown="if (event.key === 'Enter') Cartes.ajouterEvenement()">
        <select id="ct-ev-lieu" aria-label="Lieu du monde">${options('')}</select>
        <button type="button" class="btn btn-primary btn-sm" onclick="Cartes.ajouterEvenement()">+ Ajouter</button>
      </div>
      ${evs.length ? `<ol class="ct-ev-liste">${evs.map(e => `<li>
        <div class="ct-ev-tete">
          <input type="number" step="1" value="${e.an}" aria-label="Année" onchange="Cartes.modifierEvenement('${e.id}', 'an', this.value, true)">
          <input id="ct-ev-${e.id}" type="text" maxlength="120" value="${esc(e.titre)}" aria-label="Titre" oninput="Cartes.modifierEvenement('${e.id}', 'titre', this.value)" onchange="Cartes.rendre()">
          <select aria-label="Lieu" onchange="Cartes.modifierEvenement('${e.id}', 'lieu', this.value, true)">${options(e.lieu)}</select>
          <button type="button" class="btn btn-ghost btn-sm" aria-label="Supprimer ${esc(e.titre)}" onclick="Cartes.retirerEvenement('${e.id}')">✕</button>
        </div>
        <textarea rows="2" maxlength="2000" placeholder="Ce qui s'est passé, et ce qu'il en reste dans la série…" aria-label="Récit" oninput="Cartes.modifierEvenement('${e.id}', 'texte', this.value)">${esc(e.texte)}</textarea>
        ${e.lieu && nomEl(e.lieu) ? `<button type="button" class="ct-lien" onclick="Cartes.vueMonde = 'carte'; Cartes.ouvrirFiche('${e.lieu}')">⌖ ${esc(nomEl(e.lieu))}</button>` : ''}
      </li>`).join('')}</ol>` : ''}
      <p class="an-note" id="ct-h-etat" role="status"></p>
    </div>`;
  },

  // Générations : un enfant est sous ses parents ; un conjoint sans parents rejoint la génération de l'autre
  _generations(gens) {
    const parId = new Map(gens.map(g => [g.id, g]));
    const gen = new Map();
    const calc = (g, prof = 0) => {
      if (gen.has(g.id)) return gen.get(g.id);
      if (prof > 60) return 0;
      const v = g.parents.length ? Math.max(...g.parents.map(p => parId.get(p)).filter(Boolean).map(p => calc(p, prof + 1) + 1)) : 0;
      gen.set(g.id, v);
      return v;
    };
    gens.forEach(g => calc(g));
    for (let tour = 0; tour < 3; tour++) gens.forEach(g => {
      const c = parId.get(g.conjoint);
      if (c && !g.parents.length && gen.get(c.id) > gen.get(g.id)) gen.set(g.id, gen.get(c.id));
    });
    return gen;
  },

  _familles(c) {
    const h = this._histoire(c);
    const gens = h.gens;
    const royaumes = this._elementsMonde(c, ['royaume']);
    const sel = gens.find(g => g.id === this.personne) || null;
    let arbre = '<p class="an-note">Pas encore de famille. Ajoute un ancêtre, puis ses enfants.</p>';
    if (gens.length) {
      const gen = this._generations(gens);
      const nb = Math.max(...gen.values()) + 1;
      const rangs = Array.from({ length: nb }, (_, i) => gens.filter(g => gen.get(g.id) === i));
      const L = 150, H = 50, EX = 24, EY = 70;
      const x = new Map();
      // Chaque génération se range sous ses parents, les couples côte à côte
      rangs.forEach((r, i) => {
        const centre = g => g.parents.length ? g.parents.reduce((s, p) => s + (x.get(p) ?? 0), 0) / g.parents.length : (x.get(g.conjoint) ?? Infinity);
        if (i) r.sort((a, b) => centre(a) - centre(b));
        const range = [];
        r.forEach(g => { if (range.includes(g)) return; range.push(g); const cj = r.find(o => o.id === g.conjoint && !range.includes(o)); if (cj) range.push(cj); });
        rangs[i] = range;
        range.forEach((g, k) => x.set(g.id, k * (L + EX)));
      });
      const largeur = Math.max(...rangs.map(r => r.length)) * (L + EX);
      rangs.forEach(r => { const dec = (largeur - r.length * (L + EX)) / 2; r.forEach(g => x.set(g.id, x.get(g.id) + dec)); });
      const y = g => 20 + gen.get(g.id) * (H + EY);
      const parId = new Map(gens.map(g => [g.id, g]));
      const traits = [];
      gens.forEach(g => {
        const cj = parId.get(g.conjoint);
        if (cj && g.id < cj.id && gen.get(cj.id) === gen.get(g.id)) traits.push(`<line class="union" x1="${Math.min(x.get(g.id), x.get(cj.id)) + L}" y1="${y(g) + H / 2}" x2="${Math.max(x.get(g.id), x.get(cj.id))}" y2="${y(g) + H / 2}"/>`);
        const ps = g.parents.map(p => parId.get(p)).filter(Boolean);
        if (!ps.length) return;
        const px = ps.reduce((s, p) => s + x.get(p.id) + L / 2, 0) / ps.length;
        const py = Math.max(...ps.map(p => y(p))) + H;
        const cx = x.get(g.id) + L / 2, cy = y(g), mi = py + EY / 2;
        traits.push(`<path class="filiation" d="M${px},${py} V${mi} H${cx} V${cy}"/>`);
      });
      const boites = gens.map(g => {
        const r = royaumes.find(k => k.cle === g.royaume);
        const dates = g.naissance !== null || g.mort !== null ? `${g.naissance !== null ? this._an(g.naissance) : '?'} – ${g.mort !== null ? this._an(g.mort) : ''}` : '';
        return `<g class="pers ${g.id === this.personne ? 'actif' : ''}" tabindex="0" role="button" aria-label="${esc(g.nom)}${dates ? ', ' + esc(dates) : ''}" onclick="Cartes.choisirPersonne('${g.id}')" onkeydown="if (event.key === 'Enter') Cartes.choisirPersonne('${g.id}')">
          <rect x="${x.get(g.id)}" y="${y(g)}" width="${L}" height="${H}" rx="6" style="${r ? `stroke:${esc(r.couleur)}` : ''}"/>
          <text x="${x.get(g.id) + L / 2}" y="${y(g) + 21}" text-anchor="middle" class="nom">${esc(g.nom.length > 18 ? g.nom.slice(0, 17) + '…' : g.nom)}${g.perso ? ' ★' : ''}</text>
          <text x="${x.get(g.id) + L / 2}" y="${y(g) + 38}" text-anchor="middle" class="dates">${esc(dates || (r ? r.nom : ''))}</text></g>`;
      }).join('');
      arbre = `<div class="ct-arbre-cadre"><svg class="ct-arbre" viewBox="-10 0 ${largeur + 20} ${nb * (H + EY) + 10}" style="width:100%;min-width:${Math.min(largeur + 20, 1400)}px" role="img" aria-label="Arbre des familles de ${esc(c.nom)}">${traits.join('')}${boites}</svg></div>`;
    }
    const opts = (val, exclure) => `<option value="">—</option>${gens.filter(g => g.id !== exclure).map(g => `<option value="${g.id}" ${g.id === val ? 'selected' : ''}>${esc(g.nom)}</option>`).join('')}`;
    const persosProjet = [...new Set([...(this._persos || []), ...Object.keys(this.scenes.trajets || {})])].sort((a, b) => a.localeCompare(b));
    const enfants = sel ? gens.filter(g => g.parents.includes(sel.id)) : [];
    return `<div class="ct-histoire">
      ${arbre}
      <div class="ct-ev-ajout" role="group" aria-label="Nouvelle personne">
        <input id="ct-g-nom" type="text" maxlength="60" placeholder="Nom (ex. : Aldric le Vieux)" aria-label="Nom" onkeydown="if (event.key === 'Enter') Cartes.ajouterPersonne()">
        <select id="ct-g-parent" aria-label="Enfant de">${opts(sel?.id || '', '').replace('<option value="">—</option>', '<option value="">Sans parent connu</option>')}</select>
        <button type="button" class="btn btn-primary btn-sm" onclick="Cartes.ajouterPersonne()">+ Ajouter</button>
      </div>
      ${sel ? `<section class="ct-bloc ct-personne" aria-labelledby="ct-g-titre">
        <div class="ct-entete"><h3 id="ct-g-titre" class="ct-titre">${esc(sel.nom)}</h3><button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.retirerPersonne('${sel.id}')">Supprimer</button></div>
        <div class="ct-g-grille">
          <label>Nom<input type="text" maxlength="60" value="${esc(sel.nom)}" oninput="Cartes.modifierPersonne('${sel.id}', 'nom', this.value)" onchange="Cartes.rendre()"></label>
          <label>Personnage de la série<select onchange="Cartes.modifierPersonne('${sel.id}', 'perso', this.value, true)"><option value="">Aucun</option>${persosProjet.map(n => `<option ${n === sel.perso ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label>Parent 1<select onchange="Cartes.modifierParent('${sel.id}', 0, this.value)">${opts(sel.parents[0] || '', sel.id)}</select></label>
          <label>Parent 2<select onchange="Cartes.modifierParent('${sel.id}', 1, this.value)">${opts(sel.parents[1] || '', sel.id)}</select></label>
          <label>Conjoint<select onchange="Cartes.modifierPersonne('${sel.id}', 'conjoint', this.value, true)">${opts(sel.conjoint, sel.id)}</select></label>
          <label>Royaume<select onchange="Cartes.modifierPersonne('${sel.id}', 'royaume', this.value, true)"><option value="">Aucun</option>${royaumes.map(r => `<option value="${r.cle}" ${r.cle === sel.royaume ? 'selected' : ''}>${esc(r.nom)}</option>`).join('')}</select></label>
          <label>Naissance<input type="number" step="1" value="${sel.naissance ?? ''}" onchange="Cartes.modifierPersonne('${sel.id}', 'naissance', this.value, true)"></label>
          <label>Mort<input type="number" step="1" value="${sel.mort ?? ''}" onchange="Cartes.modifierPersonne('${sel.id}', 'mort', this.value, true)"></label>
        </div>
        ${enfants.length ? `<p class="an-note">Enfants : ${enfants.map(g => esc(g.nom)).join(', ')}</p>` : ''}
      </section>` : '<p class="an-note">Clique sur une personne de l\'arbre pour lui donner ses parents, son conjoint, ses dates. ★ : c\'est un personnage de la série.</p>'}
      <p class="an-note" id="ct-h-etat" role="status"></p>
    </div>`;
  },

  choisirPersonne(id) {
    this.personne = this.personne === id ? null : id;
    this.rendre();
  },

  ajouterPersonne() {
    const c = this.carte();
    const nom = document.getElementById('ct-g-nom')?.value.trim();
    if (!c || !nom) { toast('Donne un nom.', 'error'); return; }
    const parent = document.getElementById('ct-g-parent')?.value || '';
    const id = idMonde();
    this._noterHistoire(c, h => {
      if (h.gens.length >= 200) { toast('200 personnes au plus.', 'error'); return; }
      h.gens.push({ id, nom: nom.slice(0, 60), perso: '', parents: parent && h.gens.some(g => g.id === parent) ? [parent] : [], conjoint: '', naissance: null, mort: null, royaume: h.gens.find(g => g.id === parent)?.royaume || '' });
      this.personne = id;
    });
  },

  modifierPersonne(id, champ, valeur, redessiner = false) {
    const c = this.carte();
    if (!c) return;
    this._noterHistoire(c, h => {
      const g = h.gens.find(x => x.id === id);
      if (!g) return;
      if (champ === 'naissance' || champ === 'mort') { const v = String(valeur).trim(); g[champ] = /^-?\d{1,6}$/.test(v) ? +v : null; return; }
      if (champ === 'conjoint') {
        // Un couple se note des deux côtés ; l'ancien conjoint est libéré
        h.gens.forEach(o => { if (o.conjoint === id || (o.id === g.conjoint)) o.conjoint = ''; });
        if (valeur && valeur !== id) { const o = h.gens.find(x => x.id === valeur); if (o) { h.gens.forEach(z => { if (z.conjoint === o.id) z.conjoint = ''; }); o.conjoint = id; g.conjoint = o.id; } }
        else g.conjoint = '';
        return;
      }
      g[champ] = String(valeur).slice(0, 60);
    }, redessiner);
  },

  // Un parent ne peut pas être son propre descendant : l'arbre tournerait en rond
  modifierParent(id, rang, valeur) {
    const c = this.carte();
    if (!c) return;
    const h = this._histoire(c);
    const descend = (de, cherche, prof = 0) => prof < 60 && h.gens.some(g => g.parents.includes(de) && (g.id === cherche || descend(g.id, cherche, prof + 1)));
    if (valeur && (valeur === id || descend(id, valeur))) { toast('Impossible : ce serait son propre ancêtre.', 'error'); this.rendre(); return; }
    this._noterHistoire(c, h2 => {
      const g = h2.gens.find(x => x.id === id);
      if (!g) return;
      const p = [...g.parents];
      p[rang] = valeur;
      g.parents = [...new Set(p.filter(Boolean))];
    });
  },

  retirerPersonne(id) {
    const c = this.carte();
    const g = c && this._histoire(c).gens.find(x => x.id === id);
    if (!g || !confirm(`Retirer ${g.nom} de l'arbre ? Ses enfants restent, sans ce parent.`)) return;
    this.personne = null;
    this._noterHistoire(c, h => {
      h.gens = h.gens.filter(x => x.id !== id);
      h.gens.forEach(x => { x.parents = x.parents.filter(p => p !== id); if (x.conjoint === id) x.conjoint = ''; });
    });
  },

  _detail(cle) {
    const pl = this._place(cle);
    const l = this.scenes.lieux?.[cle];
    const persos = Object.entries(l?.persos || {});
    const scenes = l?.scenes || [];
    return `<section class="ct-bloc" aria-labelledby="ct-detail">
      <h3 id="ct-detail" class="ct-titre">${esc(pl.nom)}</h3>
      <p class="an-note">${scenes.length} scène(s)${this.saison ? ` en ${esc(this._niveau(this.saison))}` : ''}</p>
      ${persos.length ? `<span class="an-label">Qui y va</span><p class="ct-persos">${persos.slice(0, 12).map(([n, k]) => `<button type="button" class="ct-perso ${n === this.trajet ? 'actif' : ''}" onclick="Cartes.trajet = ${esc(JSON.stringify(n))}; Cartes.rendre()">${Analyse._puce(n)}${esc(n)} <small>${k}</small></button>`).join('')}</p>` : ''}
      ${scenes.length ? `<span class="an-label">Scènes</span><ol class="ct-scenes">${scenes.slice(0, 40).map(s => `<li><strong>${esc(s.code)}</strong> · ${esc(s.slugline || s.titre || `scène ${s.scene + 1}`)}</li>`).join('')}${scenes.length > 40 ? `<li class="an-note">… et ${scenes.length - 40} autres</li>` : ''}</ol>` : '<p class="an-note">Aucune scène détectée dans ce lieu sur cette période.</p>'}
      ${this._choixPlan(`Cartes.lier('${cle}', this.value)`, (this.carte()?.epingles || {})[cle]?.sous || '', `Cartes.nouveauPlan('${cle}', this.files[0]); this.value = ''`)}
      <button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.desepingler('${cle}')">Retirer l'épingle</button>
    </section>`;
  },

  // Le plan détaillé d'un lieu ou d'une ville : une autre carte du projet, ou une nouvelle depuis une image
  _choixPlan(changer, sous, nouveau) {
    const autres = this.cartes.filter(x => x.id !== this.id);
    const existe = sous && this.cartes.some(x => x.id === sous);
    return `<div class="ct-plan-lie">
      <label class="an-label" for="ct-sous">Plan détaillé</label>
      <div class="an-ligne">
        <select id="ct-sous" onchange="${changer}">
          <option value="">Aucun</option>
          ${autres.map(x => `<option value="${x.id}" ${x.id === sous ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}
        </select>
        ${existe ? `<button type="button" class="btn btn-secondary btn-sm" onclick="Cartes.ouvrirSous('${sous}')">Ouvrir le plan ↘</button>` : `<label class="btn btn-ghost btn-sm ct-fichier">+ Depuis une image<input type="file" accept="image/png,image/jpeg,image/webp" onchange="${nouveau}"></label>`}
      </div>
    </div>`;
  },

  _remplie(f) {
    return !!f && !!(f.bref || f.histoire || f.coutumes || f.plan || f.persos?.length || f.lieux?.length);
  },

  _encyclopedie(c, monde, fiches) {
    const groupes = [['royaume', 'Royaumes'], ['capitale', 'Capitales'], ['ville', 'Villes'], ['mer', 'Mers'], ['nom', 'Autres noms']];
    const remplies = monde.elements.filter(x => this._remplie(fiches[x.cle])).length;
    return `<section class="ct-bloc" aria-labelledby="ct-encyclo">
      <h3 id="ct-encyclo" class="an-label">Encyclopédie de ${esc(monde.titre || c.nom)} (${remplies}/${monde.elements.length})</h3>
      ${monde.elements.length ? groupes.map(([t, l]) => {
        const liste = monde.elements.filter(x => x.type === t);
        return liste.length ? `<span class="an-label ct-encyclo-groupe">${l}</span><div class="ct-encyclo-liste">${liste.map(x => `<button type="button" class="ct-encyclo-el ${this.fiche === x.cle ? 'actif' : ''}" aria-pressed="${this.fiche === x.cle}" onclick="Cartes.ouvrirFiche('${x.cle}')">${x.couleur ? `<span class="an-puce" style="background:${esc(x.couleur)}"></span>` : ''}${esc(x.nom)}${this._remplie(fiches[x.cle]) ? '<small>●</small>' : ''}</button>`).join('')}</div>` : '';
      }).join('') : '<p class="an-note">Ce monde n\'a encore ni royaume, ni ville, ni nom.</p>'}
      <p class="an-note">● : la fiche est commencée. Les royaumes, villes et noms se créent en dessinant le monde.</p>
    </section>`;
  },

  _fiche(c, cle) {
    const el = this._mondes.get(c.id).elements.find(x => x.cle === cle);
    const f = { bref: '', histoire: '', coutumes: '', persos: [], lieux: [], plan: '', ...(this._encyclos.get(c.id)?.[cle] || {}) };
    const type = { royaume: 'Royaume', capitale: 'Capitale', ville: 'Ville', mer: 'Mer', nom: 'Lieu' }[el.type];
    const tousPersos = [...new Set([...(this._persos || []), ...Object.keys(this.scenes.trajets || {})])].filter(n => !f.persos.includes(n)).sort((a, b) => a.localeCompare(b));
    const lieux = this.scenes.lieux || {};
    const cles = JSON.stringify(cle);
    return `<section class="ct-bloc ct-fiche" aria-labelledby="ct-fiche-titre">
      <div class="ct-entete"><h3 id="ct-fiche-titre" class="ct-titre">${esc(el.nom)}</h3><span class="an-label">${type}</span></div>
      <label class="an-label" for="ct-f-bref">En bref</label>
      <input id="ct-f-bref" type="text" maxlength="200" value="${esc(f.bref)}" placeholder="Port marchand tenu par la guilde des sels" oninput="Cartes.noterFiche('bref', this.value)">
      <label class="an-label" for="ct-f-hist">Histoire</label>
      <textarea id="ct-f-hist" rows="5" maxlength="8000" placeholder="Fondation, guerres, dynasties, ce qui s'y est passé…" oninput="Cartes.noterFiche('histoire', this.value)">${esc(f.histoire)}</textarea>
      <label class="an-label" for="ct-f-cout">Langue et coutumes</label>
      <textarea id="ct-f-cout" rows="3" maxlength="3000" placeholder="Langue, fêtes, croyances, façons de parler…" oninput="Cartes.noterFiche('coutumes', this.value)">${esc(f.coutumes)}</textarea>
      <span class="an-label">Qui y vit</span>
      <div class="ct-persos">${f.persos.map(n => `<button type="button" class="ct-perso" title="Retirer" onclick="Cartes.retirerDeFiche('persos', ${esc(JSON.stringify(n))})">${Analyse._puce(n)}${esc(n)} ×</button>`).join('') || '<span class="an-note">Personne pour l\'instant.</span>'}</div>
      ${tousPersos.length ? `<select aria-label="Ajouter un personnage" onchange="if (this.value) Cartes.ajouterAFiche('persos', this.value)"><option value="">+ Ajouter un personnage</option>${tousPersos.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>` : ''}
      <span class="an-label">Lieux de l'histoire</span>
      <div class="ct-liste">${f.lieux.filter(k => this._place(k)).map(k => `<div class="ct-fiche-lieu"><button type="button" class="ct-a-poser" onclick="Cartes.fiche = null; Cartes.choisi = '${k}'; Cartes.rendre()">⌖ ${esc(this._place(k).nom)}<small>${lieux[k]?.scenes.length || 0} sc.</small></button><button type="button" class="btn btn-ghost btn-sm" aria-label="Retirer ${esc(this._place(k).nom)}" onclick="Cartes.retirerDeFiche('lieux', '${k}')">×</button></div>`).join('') || '<span class="an-note">Relie cette fiche aux décors où se jouent ses scènes.</span>'}</div>
      <select aria-label="Relier un lieu" onchange="if (this.value) Cartes.ajouterAFiche('lieux', this.value)"><option value="">+ Relier un lieu</option>${this.places.filter(p => !f.lieux.includes(p.cle)).map(p => `<option value="${p.cle}">${esc(p.nom)}</option>`).join('')}</select>
      ${(() => {
        const h = this._histoires.get(c.id) || { evenements: [], gens: [] };
        const evs = h.evenements.filter(e => e.lieu === cle);
        const gens = h.gens.filter(g => g.royaume === cle);
        return (evs.length ? `<span class="an-label">Dans la chronologie</span><ul class="ct-scenes">${evs.map(e => `<li><strong>${esc(this._an(e.an))}</strong> · ${esc(e.titre)}</li>`).join('')}</ul>` : '')
          + (gens.length ? `<span class="an-label">Familles</span><p class="ct-persos">${gens.map(g => `<button type="button" class="ct-perso" onclick="Cartes.personne = '${g.id}'; Cartes.choisirVueMonde('familles')">${esc(g.nom)}</button>`).join('')}</p>` : '');
      })()}
      ${el.type !== 'royaume' ? this._choixPlan(`Cartes.noterFiche('plan', this.value, true)`, f.plan, `Cartes.nouveauPlanFiche(this.files[0]); this.value = ''`) : ''}
      <div class="an-ligne"><button type="button" class="btn btn-ghost btn-sm" onclick="Cartes.fiche = null; Cartes.rendre()">Fermer la fiche</button><span class="an-note" id="ct-fiche-etat" role="status"></span></div>
    </section>`;
  },

  async ouvrirFiche(cle) {
    this._viderFiches();
    this.fiche = this.fiche === cle ? null : cle;
    this.choisi = null;
    if (!this._persos) {
      try { this._persos = (await DataStore.get('personnages')).map(p => (p.prenom || p.nom_affichage || '').trim()).filter(Boolean); } catch (e) { this._persos = []; }
    }
    this.rendre();
  },

  // La fiche s'enregistre toute seule, peu après la dernière frappe ; chaque fiche a son propre envoi en attente
  noterFiche(champ, valeur, tout = false) {
    const c = this.carte(), cle = this.fiche;
    if (!c || !cle) return;
    const fiches = this._encyclos.get(c.id) || {};
    fiches[cle] = { bref: '', histoire: '', coutumes: '', persos: [], lieux: [], plan: '', ...(fiches[cle] || {}), [champ]: valeur };
    this._encyclos.set(c.id, fiches);
    const etat = document.getElementById('ct-fiche-etat');
    if (etat) etat.textContent = 'Modifié…';
    this._attentes ??= new Map();
    const k = `${c.id}|${cle}`;
    clearTimeout(this._attentes.get(k));
    if (tout) this._envoyerFiche(c.id, cle, true);
    else this._attentes.set(k, setTimeout(() => this._envoyerFiche(c.id, cle), 600));
  },

  async _envoyerFiche(id, cle, redessiner = false) {
    this._attentes?.delete(`${id}|${cle}`);
    // Ce qui part est l'état local du moment : rien de ce qui est tapé pendant l'envoi n'est écrasé au retour
    const fiche = (this._encyclos.get(id) || {})[cle] || null;
    const r = await api.post('cartes', { action: 'fiche', id, cle, fiche }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    if (r.error) { toast(r.error, 'error'); return; }
    const e = document.getElementById('ct-fiche-etat');
    if (e && this.fiche === cle && !this._attentes?.has(`${id}|${cle}`)) e.textContent = 'Enregistré';
    if (redessiner) this.rendre();
  },

  // Avant de quitter une fiche ou une carte, ce qui attend part tout de suite
  _viderFiches() {
    (this._attentes || new Map()).forEach((minuteur, k) => {
      clearTimeout(minuteur);
      const [id, cle] = k.split('|');
      this._envoyerFiche(id, cle);
    });
  },

  ajouterAFiche(champ, valeur) {
    const f = (this._encyclos.get(this.id) || {})[this.fiche] || {};
    const liste = [...(f[champ] || [])];
    if (!liste.includes(valeur)) liste.push(valeur);
    this.noterFiche(champ, liste, true);
  },

  retirerDeFiche(champ, valeur) {
    const f = (this._encyclos.get(this.id) || {})[this.fiche] || {};
    this.noterFiche(champ, (f[champ] || []).filter(x => x !== valeur), true);
  },

  async nouveauPlanFiche(fichier) {
    const c = await this._planDepuisImage(fichier, this._mondes.get(this.id)?.elements.find(x => x.cle === this.fiche)?.nom);
    if (c) this.noterFiche('plan', c.id, true);
  },

  async _planDepuisImage(fichier, nom) {
    let img;
    try { img = await this._lireImage(fichier); } catch (e) { toast(e.message, 'error'); return null; }
    const c = await this._envoyer({ action: 'creer', nom: `Plan de ${nom || 'ce lieu'}`.slice(0, 60) });
    if (!c) return null;
    this.cartes.push(c);
    if (!(await this._envoyer({ action: 'image', id: c.id, ...img }))) {
      await this._envoyer({ action: 'retirer', id: c.id });
      this.rendre();
      return null;
    }
    return c;
  },

  async nouveauPlan(cle, fichier) {
    const c = await this._planDepuisImage(fichier, this._place(cle)?.nom);
    if (c) await this.lier(cle, c.id);
  },

  async lier(cle, sous) {
    const c = this.carte();
    if (c && (await this._envoyer({ action: 'lier', id: c.id, cle, sous }))) this.rendre();
  },

  ouvrirSous(id) {
    if (!this.cartes.some(x => x.id === id) || id === this.id) return;
    this._viderFiches();
    this.pile.push(this.id);
    this.id = id;
    this.choisi = this.fiche = this.placer = null;
    this.mode = 'epingler';
    this.rendre();
  },

  remonter() {
    this._viderFiches();
    const id = this.pile.pop();
    if (id && this.cartes.some(x => x.id === id)) this.id = id;
    this.choisi = this.fiche = this.placer = null;
    this.rendre();
  },

  _brancher() {
    const plan = document.getElementById('ct-plan');
    if (!plan) return;
    // Les pions partent de leur lieu précédent et glissent jusqu'à la scène
    const pions = plan.querySelectorAll('.ct-pion');
    if (pions.length) {
      void plan.offsetWidth;
      pions.forEach(p => { p.style.left = `${p.dataset.x}%`; p.style.top = `${p.dataset.y}%`; });
    }
    this._suiteRejeu();
    const pos = e => {
      const r = plan.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
    };
    plan.addEventListener('click', e => {
      const el = e.target.closest('.ct-element');
      if (el && !this.placer) { this.ouvrirFiche(el.dataset.fiche); return; }
      if (!this.placer || e.target.closest('.ct-pin, .ct-consigne')) return;
      const p = pos(e);
      this.epingler(this.placer, p.x, p.y);
    });
    plan.querySelectorAll('.ct-pin').forEach(pin => {
      pin.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const depart = { x: e.clientX, y: e.clientY };
        let bouge = false;
        pin.setPointerCapture(e.pointerId);
        const move = ev => {
          if (!bouge && Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) < 4) return;
          bouge = true;
          const p = pos(ev);
          pin.style.left = `${p.x * 100}%`;
          pin.style.top = `${p.y * 100}%`;
        };
        const fin = ev => {
          pin.removeEventListener('pointermove', move);
          pin.removeEventListener('pointerup', fin);
          pin.removeEventListener('pointercancel', fin);
          if (bouge) {
            const p = pos(ev);
            this.epingler(pin.dataset.cle, p.x, p.y, true);
          } else {
            // Le premier clic redessine la carte : le double-clic natif se perdrait, on le reconnaît ici
            const avant = this._dernierClic;
            this._dernierClic = { cle: pin.dataset.cle, t: Date.now() };
            if (pin.dataset.sous && avant?.cle === pin.dataset.cle && Date.now() - avant.t < 450) {
              this._dernierClic = null;
              this.ouvrirSous(pin.dataset.sous);
              return;
            }
            this.choisi = pin.dataset.cle;
            this.fiche = null;
            this.rendre();
          }
        };
        pin.addEventListener('pointermove', move);
        pin.addEventListener('pointerup', fin);
        pin.addEventListener('pointercancel', fin);
      });
      // Au clavier, Entrée ouvre le lieu
      pin.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this.choisi = pin.dataset.cle;
        this.rendre();
      });
    });
  },

  async _envoyer(corps) {
    const r = await api.post('cartes', corps).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    if (r.error) { toast(r.error, 'error'); return null; }
    if (r.cartes) this.cartes = r.cartes;
    return r;
  },

  async ouvrir(id) {
    this._viderFiches();
    this.id = id;
    this.pile = [];
    this.fiche = null;
    this.choisi = null;
    this.placer = null;
    this.mode = 'epingler';
    this.rendre();
  },

  async choisirSaison(n) {
    this.saison = n;
    await this._chargerScenes();
    this.rendre();
  },

  _lireImage(fichier) {
    return new Promise((ok, ko) => {
      if (!fichier) return ko(new Error('Aucun fichier.'));
      if (!fichier.size) return ko(new Error('Ce fichier est vide.'));
      if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) return ko(new Error('Image PNG, JPEG ou WebP seulement.'));
      if (fichier.size > 12 * 1048576) return ko(new Error('Image trop lourde (12 Mo au plus).'));
      const lecteur = new FileReader();
      lecteur.onload = () => ok({ type: fichier.type, donnees: String(lecteur.result).split(',')[1] });
      lecteur.onerror = () => ko(new Error('Lecture impossible.'));
      lecteur.readAsDataURL(fichier);
    });
  },

  async nouvelle(fichier) {
    let img;
    try { img = await this._lireImage(fichier); } catch (e) { toast(e.message, 'error'); return; }
    const nom = (fichier.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 60) || 'Nouvelle carte';
    const c = await this._envoyer({ action: 'creer', nom });
    if (!c) return;
    this.cartes.push(c);
    if (!(await this._envoyer({ action: 'image', id: c.id, ...img }))) {
      await this._envoyer({ action: 'retirer', id: c.id });
      this.rendre();
      return;
    }
    this.id = c.id;
    this.pile = [];
    this.rendre();
  },

  async nouveauMonde() {
    const c = await this._envoyer({ action: 'creer', monde: true, nom: 'Monde inventé' });
    if (!c) return;
    this.cartes.push(c);
    this.id = c.id;
    this.mode = 'dessiner';
    this.rendre();
  },

  dessiner() {
    this.mode = 'dessiner';
    this.rendre();
  },

  async image(fichier) {
    const c = this.carte();
    if (!c) return;
    let img;
    try { img = await this._lireImage(fichier); } catch (e) { toast(e.message, 'error'); return; }
    if (await this._envoyer({ action: 'image', id: c.id, ...img })) this.rendre();
  },

  async renommer() {
    const c = this.carte();
    if (!c) return;
    const nom = prompt('Nom de la carte', c.nom);
    if (nom === null || !nom.trim()) return;
    if (await this._envoyer({ action: 'renommer', id: c.id, nom: nom.trim() })) this.rendre();
  },

  async retirer() {
    const c = this.carte();
    if (!c || !confirm(`Supprimer la carte « ${c.nom} » et ses épingles ? Les lieux eux-mêmes ne sont pas touchés.`)) return;
    (this._attentes || new Map()).forEach((minuteur, k) => {
      if (!k.startsWith(`${c.id}|`)) return;
      clearTimeout(minuteur);
      this._attentes.delete(k);
    });
    if (await this._envoyer({ action: 'retirer', id: c.id })) {
      this.pile = this.pile.filter(x => this.cartes.some(k => k.id === x));
      this.id = this.pile.pop() || this.cartes[0]?.id || null;
      this.choisi = this.fiche = null;
      this.rendre();
    }
  },

  aPoser(cle) {
    this.placer = this.placer === cle ? null : cle;
    this.rendre();
  },

  async epingler(cle, x, y, deplace = false) {
    const c = this.carte();
    if (!c) return;
    if (await this._envoyer({ action: 'epingler', id: c.id, cle, x, y })) {
      if (!deplace) this.choisi = cle;
      this.placer = null;
      this.rendre();
    }
  },

  async desepingler(cle) {
    const c = this.carte();
    if (!c) return;
    if (await this._envoyer({ action: 'epingler', id: c.id, cle, x: null })) {
      this.choisi = null;
      this.rendre();
    }
  },
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && Cartes.placer) {
    Cartes.placer = null;
    Cartes.rendre();
  }
});

// ─── Monde inventé : un générateur de carte, puis des retouches au pinceau ──

const MONDE_L = 192, MONDE_H = 128, MONDE_ECHELLE = 6;
const MONDE_STYLES = {
  parchemin: { mer: [[-1, '#a3aa98'], [-0.3, '#b3b8a4'], [-0.06, '#c4c5ae']], terre: [[0, '#e9dcb8'], [0.25, '#e2d1a6'], [0.5, '#cfb987'], [0.7, '#b59d6d']], encre: '#4a3520', eau: '#6f7f8c', texte: '#3b2a17', foret: '#6b6a3a', route: '#7a4b2a', fond: '#e9dcb8' },
  atlas: { mer: [[-1, '#3d6f96'], [-0.3, '#5b8fb5'], [-0.06, '#86b4d2']], terre: [[0, '#cfd9a3'], [0.2, '#a9c27f'], [0.45, '#c8b27a'], [0.7, '#a58d66']], encre: '#2a3a2a', eau: '#3d6f96', texte: '#1f2a1f', foret: '#3f6b3a', route: '#8b3a2a', fond: '#86b4d2' },
  nuit: { mer: [[-1, '#07101f'], [-0.3, '#0b1830'], [-0.06, '#12234a']], terre: [[0, '#1f2b3f'], [0.25, '#26354d'], [0.5, '#30415c'], [0.7, '#3c4f6e']], encre: '#9fb7e8', eau: '#4d7fbf', texte: '#e8e8e0', foret: '#4f7f6a', route: '#e8a85c', fond: '#12234a' },
};
const MONDE_ROYAUMES = ['#c0504d', '#4f81bd', '#9bbb59', '#8064a2', '#f79646', '#4bacc6', '#d4a017', '#a5527a'];
const MONDE_OUTILS = [['terre', 'Terre'], ['mer', 'Mer'], ['montagne', 'Montagnes'], ['foret', 'Forêts'], ['riviere', 'Rivière'], ['route', 'Route'], ['ville', 'Ville'], ['royaume', 'Royaume'], ['nom', 'Nom'], ['gomme', 'Gomme']];

// Un hasard qui se rejoue : la même graine redonne le même monde
function hasardGraine(graine) {
  let a = 0;
  for (const ch of String(graine)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 1) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bruitValeur(graine) {
  const h = hasardGraine(graine);
  const n = 256, table = new Float32Array(n * n);
  for (let i = 0; i < table.length; i++) table[i] = h() * 2 - 1;
  const v = (x, y) => table[((y & 255) << 8) | (x & 255)];
  const lisse = t => t * t * (3 - 2 * t);
  const bruit = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = lisse(x - x0), fy = lisse(y - y0);
    const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, octaves = 5) => {
    let s = 0, amp = 1, f = 1, tot = 0;
    for (let o = 0; o < octaves; o++) { s += bruit(x * f + o * 17.3, y * f - o * 9.1) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  };
}

const SYLLABES = { debut: ['Bel', 'Car', 'Dor', 'El', 'Fal', 'Gal', 'Hal', 'Is', 'Kar', 'Lor', 'Mar', 'Nor', 'Or', 'Pel', 'Quel', 'Ros', 'Sar', 'Tor', 'Val', 'Ys', 'Zan', 'Ar', 'Bri', 'Cor', 'Ess'], milieu: ['', '', 'a', 'e', 'i', 'o', 'an', 'el', 'is', 'or', 'ur', 'en'], fin: ['mont', 'port', 'val', 'dor', 'heim', 'grad', 'ance', 'ia', 'or', 'ys', 'ac', 'brück', 'mir', 'oth', 'ante', 'eau', 'ville', 'ard'] };

// Un identifiant court et stable pour qu'une fiche d'encyclopédie suive sa ville ou son nom
const idMonde = () => Math.random().toString(36).slice(2, 10);
function idDepuis(v) {
  let h = 0;
  for (const ch of `${v.nom || v.texte}|${Math.round(v.x * 10)}|${Math.round(v.y * 10)}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).slice(0, 10);
}

function nomInvente(h) {
  const p = l => l[Math.floor(h() * l.length)];
  return p(SYLLABES.debut) + p(SYLLABES.milieu) + p(SYLLABES.fin);
}

const Monde = {
  etat: null,
  carte: null,
  outil: 'terre',
  pinceau: 6,
  royaume: 1,
  annulations: [],
  sale: false,

  _vierge(graine, terres) {
    return {
      v: 1, graine, terres, style: 'parchemin',
      calques: { royaumes: true, routes: true, noms: true, decor: true },
      h: new Float32Array(MONDE_L * MONDE_H), f: new Uint8Array(MONDE_L * MONDE_H), r: new Uint8Array(MONDE_L * MONDE_H),
      rivieres: [], routes: [], villes: [], noms: [], royaumes: [], titre: '',
    };
  },

  generer(graine, terres) {
    const e = this._vierge(graine, terres);
    if (this.etat) { e.style = this.etat.style; e.calques = { ...this.etat.calques }; }
    const b = bruitValeur(graine), b2 = bruitValeur(graine + '-forets'), h = hasardGraine(graine + '-villes');
    const freq = terres === 'archipel' ? 0.045 : terres === 'pangee' ? 0.022 : 0.03;
    for (let y = 0; y < MONDE_H; y++) {
      for (let x = 0; x < MONDE_L; x++) {
        const dx = (x / MONDE_L - 0.5) * 2, dy = (y / MONDE_H - 0.5) * 2;
        const d = Math.sqrt(dx * dx * 0.9 + dy * dy * 1.1);
        const n = b(x * freq, y * freq, 6);
        let v;
        if (terres === 'archipel') v = n * 1.25 + 0.02 - d * 0.42 - (d > 0.9 ? (d - 0.9) * 1.2 : 0);
        else if (terres === 'pangee') v = n * 0.75 + 0.62 - d * d * 1.05;
        else v = n * 0.9 + 0.42 - d * 0.95;
        e.h[y * MONDE_L + x] = Math.max(-1, Math.min(1, v));
        if (v > 0.04 && v < 0.5 && b2(x * 0.06, y * 0.06, 3) > 0.12) e.f[y * MONDE_L + x] = 1;
      }
    }
    // Des villes sur la terre basse, assez loin les unes des autres
    const terre = [];
    for (let i = 0; i < e.h.length; i++) if (e.h[i] > 0.05 && e.h[i] < 0.45) terre.push(i);
    const villes = [];
    for (let essai = 0; essai < 400 && villes.length < 9 && terre.length; essai++) {
      const i = terre[Math.floor(h() * terre.length)];
      const x = i % MONDE_L, y = Math.floor(i / MONDE_L);
      if (x < 8 || y < 8 || x > MONDE_L - 8 || y > MONDE_H - 8) continue;
      if (villes.some(v => Math.hypot(v.x - x, v.y - y) < 22)) continue;
      villes.push({ id: idMonde(), x: x + 0.5, y: y + 0.5, nom: nomInvente(h), capitale: false });
    }
    e.villes = villes;
    // Des royaumes autour de quelques capitales, partagés en plus proche voisin sur la terre
    const nbRoy = Math.min(villes.length, terres === 'archipel' ? 3 : 4);
    for (let k = 0; k < nbRoy; k++) {
      villes[k].capitale = true;
      e.royaumes.push({ id: k + 1, nom: `Royaume de ${villes[k].nom}`, couleur: MONDE_ROYAUMES[k] });
    }
    if (nbRoy) {
      for (let i = 0; i < e.h.length; i++) {
        if (e.h[i] <= 0) continue;
        const x = i % MONDE_L, y = Math.floor(i / MONDE_L);
        let best = 0, bd = Infinity;
        for (let k = 0; k < nbRoy; k++) {
          const dd = Math.hypot(villes[k].x - x, villes[k].y - y) * (1 + 0.25 * b(x * 0.08 + k * 7, y * 0.08));
          if (dd < bd) { bd = dd; best = k + 1; }
        }
        if (bd < 60) e.r[i] = best;
      }
    }
    // Des routes : chaque ville rejoint la plus proche déjà reliée
    const reliees = villes.length ? [villes[0]] : [];
    villes.slice(1).forEach(v => {
      let p = reliees[0], pd = Infinity;
      reliees.forEach(o => { const dd = Math.hypot(o.x - v.x, o.y - v.y); if (dd < pd) { pd = dd; p = o; } });
      if (pd < 70) e.routes.push(this._courbe([[p.x, p.y], [v.x, v.y]], h));
      reliees.push(v);
    });
    // Des rivières qui descendent des hauteurs jusqu'à la mer
    const sommets = [];
    for (let i = 0; i < e.h.length; i++) if (e.h[i] > 0.5) sommets.push(i);
    for (let k = 0; k < 5 && sommets.length; k++) {
      let i = sommets[Math.floor(h() * sommets.length)];
      const trace = [];
      for (let pas = 0; pas < 300; pas++) {
        const x = i % MONDE_L, y = Math.floor(i / MONDE_L);
        trace.push([x + 0.5, y + 0.5]);
        if (e.h[i] <= 0) break;
        let suivant = i, bas = e.h[i] + 0.002;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= MONDE_L || ny >= MONDE_H) continue;
          const j = ny * MONDE_L + nx;
          if (e.h[j] < bas) { bas = e.h[j]; suivant = j; }
        }
        if (suivant === i) break;
        i = suivant;
      }
      if (trace.length > 8 && e.h[i] <= 0) e.rivieres.push(trace.filter((_, n) => n % 2 === 0 || n === trace.length - 1));
    }
    e.titre = terres === 'archipel' ? `Archipel de ${nomInvente(h)}` : `Terres de ${nomInvente(h)}`;
    return e;
  },

  // Un trait droit devient légèrement sinueux, comme tracé à la main
  _courbe(points, h) {
    const [a, b] = [points[0], points[points.length - 1]];
    const res = [];
    for (let t = 0; t <= 6; t++) {
      const k = t / 6, j = t === 0 || t === 6 ? 0 : (h() - 0.5) * 3;
      res.push([a[0] + (b[0] - a[0]) * k + j, a[1] + (b[1] - a[1]) * k - j]);
    }
    return res;
  },

  // ── Sauvegarde compacte : hauteurs sur un octet, puis base64 ──
  _b64(octets) {
    let s = '';
    for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(s);
  },
  _deb64(s, n) {
    try {
      const bin = atob(String(s || ''));
      if (bin.length !== n) return null;
      const o = new Uint8Array(n);
      for (let i = 0; i < n; i++) o[i] = bin.charCodeAt(i);
      return o;
    } catch (e) { return null; }
  },

  serialiser(e) {
    const h8 = new Uint8Array(e.h.length);
    for (let i = 0; i < e.h.length; i++) h8[i] = Math.round((Math.max(-1, Math.min(1, e.h[i])) + 1) * 127.5);
    const arrondir = l => l.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    return {
      v: 1, l: MONDE_L, haut: MONDE_H, graine: e.graine, terres: e.terres, style: e.style, calques: e.calques, titre: e.titre,
      h: this._b64(h8), f: this._b64(e.f), r: this._b64(e.r),
      rivieres: e.rivieres.map(arrondir), routes: e.routes.map(arrondir), villes: e.villes, noms: e.noms, royaumes: e.royaumes,
    };
  },

  lire(d) {
    if (!d || d.v !== 1 || d.l !== MONDE_L || d.haut !== MONDE_H) return null;
    const n = MONDE_L * MONDE_H;
    const h8 = this._deb64(d.h, n), f = this._deb64(d.f, n), r = this._deb64(d.r, n);
    if (!h8 || !f || !r) return null;
    const e = this._vierge(String(d.graine || 'monde').slice(0, 24), ['archipel', 'continent', 'pangee'].includes(d.terres) ? d.terres : 'continent');
    for (let i = 0; i < n; i++) e.h[i] = h8[i] / 127.5 - 1;
    e.f = f; e.r = r;
    const points = l => (Array.isArray(l) ? l.filter(t => Array.isArray(t) && t.length > 1).map(t => t.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))) : []);
    e.style = MONDE_STYLES[d.style] ? d.style : 'parchemin';
    e.calques = { royaumes: true, routes: true, noms: true, decor: true, ...(d.calques || {}) };
    e.titre = String(d.titre || '');
    e.rivieres = points(d.rivieres);
    e.routes = points(d.routes);
    e.villes = (Array.isArray(d.villes) ? d.villes : []).filter(v => v && isFinite(v.x) && isFinite(v.y)).map(v => ({ id: typeof v.id === 'string' && /^[a-z0-9]{1,12}$/.test(v.id) ? v.id : idDepuis(v), x: +v.x, y: +v.y, nom: String(v.nom || ''), capitale: !!v.capitale }));
    e.noms = (Array.isArray(d.noms) ? d.noms : []).filter(v => v && isFinite(v.x) && isFinite(v.y)).map(v => ({ id: typeof v.id === 'string' && /^[a-z0-9]{1,12}$/.test(v.id) ? v.id : idDepuis(v), x: +v.x, y: +v.y, texte: String(v.texte || ''), mer: !!v.mer }));
    e.royaumes = (Array.isArray(d.royaumes) ? d.royaumes : []).filter(k => k && k.id > 0 && k.id < 256).map(k => ({ id: +k.id, nom: String(k.nom || ''), couleur: /^#[0-9a-f]{6}$/i.test(k.couleur) ? k.couleur : MONDE_ROYAUMES[(k.id - 1) % 8] }));
    return e;
  },

  _copie(e) {
    return { ...e, h: e.h.slice(), f: e.f.slice(), r: e.r.slice(), rivieres: e.rivieres.map(t => t.map(p => [...p])), routes: e.routes.map(t => t.map(p => [...p])), villes: e.villes.map(v => ({ ...v })), noms: e.noms.map(v => ({ ...v })), royaumes: e.royaumes.map(k => ({ ...k })), calques: { ...e.calques } };
  },

  async monter(slot, carte) {
    this.slot = slot;
    this.carte = carte;
    this.annulations = [];
    this.sale = false;
    slot.innerHTML = '<p class="an-note">Ouverture du monde…</p>';
    let d = null;
    try { d = await api.get(`cartes/monde&id=${carte.id}`); } catch (e) {}
    this.etat = this.lire(d) || this.generer(Math.random().toString(36).slice(2, 8), 'continent');
    if (!this.lire(d)) this.sale = true;
    this.royaume = this.etat.royaumes[0]?.id || 1;
    this.rendre();
  },

  rendre() {
    const e = this.etat;
    const pil = (on, l, action) => `<button type="button" class="an-choix ${on ? 'actif' : ''}" aria-pressed="${on}" onclick="${action}">${esc(l)}</button>`;
    this.slot.innerHTML = `
      <div class="mo-grille">
        <section class="mo-zone" aria-label="Monde inventé">
          <div class="ct-entete">
            <h3 class="an-label">${esc(this.carte.nom)}</h3>
            <div class="an-ligne">
              <button type="button" class="btn btn-ghost btn-sm" ${this.annulations.length ? '' : 'disabled'} onclick="Monde.annuler()">↶ Annuler</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="Monde.telecharger()">⬇ Image</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="Monde.enregistrer(false)">${this.sale ? 'Enregistrer' : 'Enregistré'}</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="Monde.enregistrer(true)">Épingler les lieux →</button>
            </div>
          </div>
          <div class="mo-toile"><canvas id="mo-canvas" width="${MONDE_L * MONDE_ECHELLE}" height="${MONDE_H * MONDE_ECHELLE}" aria-label="Carte du monde ${esc(e.titre)}"></canvas></div>
          <p class="an-note">${this._aide()}</p>
        </section>
        <aside class="mo-cote">
          <section class="ct-bloc" aria-labelledby="mo-gen">
            <h3 id="mo-gen" class="an-label">Générer</h3>
            <div class="an-ligne" role="group" aria-label="Forme des terres">
              ${[['archipel', 'Archipel'], ['continent', 'Continent'], ['pangee', 'Pangée']].map(([k, l]) => pil(e.terres === k, l, `Monde.regenerer(null, '${k}')`)).join('')}
            </div>
            <div class="an-ligne">
              <label class="an-label" for="mo-graine">Graine</label>
              <input id="mo-graine" type="text" maxlength="24" value="${esc(e.graine)}" class="mo-graine" onchange="Monde.regenerer(this.value.trim() || 'monde', null)">
              <button type="button" class="btn btn-ghost btn-sm" onclick="Monde.regenerer(Math.random().toString(36).slice(2, 8), null)" title="Un autre monde au hasard">⟳ Au hasard</button>
            </div>
            <p class="an-note">La même graine redonne toujours le même monde. Générer efface les retouches.</p>
          </section>
          <section class="ct-bloc" aria-labelledby="mo-style">
            <h3 id="mo-style" class="an-label">Style</h3>
            <div class="an-ligne" role="group" aria-label="Style">
              ${[['parchemin', 'Parchemin'], ['atlas', 'Atlas'], ['nuit', 'Nuit']].map(([k, l]) => pil(e.style === k, l, `Monde.regler('style', '${k}')`)).join('')}
            </div>
            <label class="an-label" for="mo-titre">Titre de la carte</label>
            <input id="mo-titre" type="text" maxlength="60" value="${esc(e.titre)}" onchange="Monde.regler('titre', this.value)">
          </section>
          <section class="ct-bloc" aria-labelledby="mo-outils">
            <h3 id="mo-outils" class="an-label">Outils</h3>
            <div class="mo-outils" role="group" aria-label="Outil">${MONDE_OUTILS.map(([k, l]) => pil(this.outil === k, l, `Monde.choisirOutil('${k}')`)).join('')}</div>
            <div class="an-ligne" role="group" aria-label="Taille du pinceau">
              <span class="an-label">Pinceau</span>
              ${[[3, 'Fin'], [6, 'Moyen'], [11, 'Large']].map(([k, l]) => pil(this.pinceau === k, l, `Monde.pinceau = ${k}; Monde.rendre()`)).join('')}
            </div>
          </section>
          <section class="ct-bloc" aria-labelledby="mo-roy">
            <h3 id="mo-roy" class="an-label">Royaumes</h3>
            <div class="mo-royaumes">
              ${e.royaumes.map(k => `<div class="mo-royaume ${this.royaume === k.id ? 'actif' : ''}">
                <button type="button" class="mo-pastille" style="background:${k.couleur}" aria-label="Peindre ${esc(k.nom)}" aria-pressed="${this.royaume === k.id && this.outil === 'royaume'}" onclick="Monde.royaume = ${k.id}; Monde.choisirOutil('royaume')"></button>
                <input type="text" maxlength="40" value="${esc(k.nom)}" aria-label="Nom du royaume" onchange="Monde.nommerRoyaume(${k.id}, this.value)">
                <button type="button" class="btn btn-ghost btn-sm" aria-label="Retirer ${esc(k.nom)}" onclick="Monde.retirerRoyaume(${k.id})">×</button>
              </div>`).join('')}
            </div>
            ${e.royaumes.length < 8 ? '<button type="button" class="btn btn-ghost btn-sm" onclick="Monde.ajouterRoyaume()">+ Royaume</button>' : ''}
          </section>
          <section class="ct-bloc" aria-labelledby="mo-calques">
            <h3 id="mo-calques" class="an-label">Calques</h3>
            ${[['royaumes', 'Royaumes'], ['routes', 'Routes'], ['noms', 'Noms'], ['decor', 'Rose des vents et échelle']].map(([k, l]) => `<label class="mep-coche"><input type="checkbox" ${e.calques[k] ? 'checked' : ''} onchange="Monde.calque('${k}', this.checked)"><span>${l}</span></label>`).join('')}
          </section>
          ${e.villes.length ? `<section class="ct-bloc" aria-labelledby="mo-villes">
            <h3 id="mo-villes" class="an-label">Villes (${e.villes.length})</h3>
            <div class="mo-villes">${e.villes.map((v, i) => `<input type="text" maxlength="30" value="${esc(v.nom)}" aria-label="Nom de la ville ${i + 1}" onchange="Monde.nommerVille(${i}, this.value)">`).join('')}</div>
          </section>` : ''}
        </aside>
      </div>`;
    this.canvas = document.getElementById('mo-canvas');
    this.dessiner();
    this._brancher();
  },

  _aide() {
    return ({
      terre: 'Peins pour faire sortir la terre de la mer.', mer: 'Peins pour noyer la terre.', montagne: 'Peins pour élever des montagnes.',
      foret: 'Peins des forêts sur la terre.', riviere: 'Trace une rivière du bout du pinceau.', route: 'Trace une route entre deux villes.',
      ville: 'Clique pour fonder une ville : un nom lui est inventé, change-le dans la liste.', royaume: 'Peins les terres du royaume choisi dans la liste.',
      nom: 'Clique pour écrire un nom sur la carte : une mer, une forêt, une chaîne de montagnes.', gomme: 'Efface forêts, royaumes, villes, noms, routes et rivières sous le pinceau.',
    })[this.outil];
  },

  _memo() {
    this.annulations.push(this._copie(this.etat));
    if (this.annulations.length > 25) this.annulations.shift();
    this.sale = true;
  },

  annuler() {
    const e = this.annulations.pop();
    if (!e) return;
    this.etat = e;
    this.sale = true;
    this.rendre();
  },

  regenerer(graine, terres) {
    const e = this.etat;
    graine = graine == null ? null : String(graine).trim().slice(0, 24) || 'monde';
    if (terres != null && !['archipel', 'continent', 'pangee'].includes(terres)) terres = null;
    if (this.sale && this.annulations.length && !confirm('Générer un nouveau monde efface tes retouches. Continuer ? (Annuler reste possible.)')) return;
    this._memo();
    this.etat = this.generer(graine ?? e.graine, terres ?? e.terres);
    this.royaume = this.etat.royaumes[0]?.id || 1;
    this.rendre();
  },

  regler(cle, v) {
    if (cle === 'style' && !MONDE_STYLES[v]) return;
    this._memo();
    this.etat[cle] = cle === 'titre' ? String(v).slice(0, 60) : v;
    this.rendre();
  },

  calque(cle, v) {
    this.etat.calques[cle] = v;
    this.sale = true;
    this.dessiner();
  },

  choisirOutil(k) {
    this.outil = k;
    this.rendre();
  },

  nommerRoyaume(id, nom) {
    const k = this.etat.royaumes.find(x => x.id === id);
    if (!k) return;
    this._memo();
    k.nom = nom.trim().slice(0, 40) || k.nom;
    this.dessiner();
  },

  ajouterRoyaume() {
    const pris = new Set(this.etat.royaumes.map(k => k.id));
    let id = 1;
    while (pris.has(id)) id++;
    this._memo();
    this.etat.royaumes.push({ id, nom: `Royaume de ${nomInvente(hasardGraine(this.etat.graine + id))}`, couleur: MONDE_ROYAUMES[(id - 1) % 8] });
    this.royaume = id;
    this.outil = 'royaume';
    this.rendre();
  },

  retirerRoyaume(id) {
    this._memo();
    this.etat.royaumes = this.etat.royaumes.filter(k => k.id !== id);
    for (let i = 0; i < this.etat.r.length; i++) if (this.etat.r[i] === id) this.etat.r[i] = 0;
    this.rendre();
  },

  nommerVille(i, nom) {
    const v = this.etat.villes[i];
    if (!v) return;
    this._memo();
    v.nom = nom.trim().slice(0, 30) || v.nom;
    this.dessiner();
  },

  // ── Pinceau ──
  _peindre(cx, cy) {
    const e = this.etat, r = this.pinceau;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MONDE_H - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MONDE_L - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        const k = 1 - d / r, i = y * MONDE_L + x;
        if (this.outil === 'terre') e.h[i] = Math.min(0.45, Math.max(e.h[i], -0.05) + 0.12 * k);
        else if (this.outil === 'mer') { e.h[i] = Math.max(-0.6, Math.min(e.h[i], 0.05) - 0.12 * k); if (e.h[i] <= 0) { e.f[i] = 0; e.r[i] = 0; } }
        else if (this.outil === 'montagne') e.h[i] = Math.min(1, Math.max(e.h[i], 0.1) + 0.1 * k);
        else if (this.outil === 'foret') { if (e.h[i] > 0) e.f[i] = 1; }
        else if (this.outil === 'royaume') { if (e.h[i] > 0) e.r[i] = this.royaume; }
        else if (this.outil === 'gomme') { e.f[i] = 0; e.r[i] = 0; }
      }
    }
    if (this.outil === 'gomme') {
      const loin = p => Math.hypot(p[0] - cx, p[1] - cy) > r;
      e.villes = e.villes.filter(v => loin([v.x, v.y]));
      e.noms = e.noms.filter(v => loin([v.x, v.y]));
      e.rivieres = e.rivieres.filter(t => t.every(loin));
      e.routes = e.routes.filter(t => t.every(loin));
    }
  },

  _brancher() {
    const cv = this.canvas;
    const pos = ev => {
      const b = cv.getBoundingClientRect();
      return [(ev.clientX - b.left) / b.width * MONDE_L, (ev.clientY - b.top) / b.height * MONDE_H];
    };
    let trace = null, actif = false, attente = false;
    const redessiner = () => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => { attente = false; this.dessiner(trace); });
    };
    cv.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const [x, y] = pos(ev);
      if (this.outil === 'ville') {
        this._memo();
        this.etat.villes.push({ id: idMonde(), x, y, nom: nomInvente(hasardGraine(this.etat.graine + x + y)), capitale: false });
        this.rendre();
        return;
      }
      if (this.outil === 'nom') {
        const texte = prompt('Nom à écrire sur la carte (une mer, une forêt, des montagnes…)');
        if (!texte || !texte.trim()) return;
        this._memo();
        const i = Math.floor(y) * MONDE_L + Math.floor(x);
        this.etat.noms.push({ id: idMonde(), x, y, texte: texte.trim().slice(0, 40), mer: (this.etat.h[i] ?? 0) <= 0 });
        this.dessiner();
        return;
      }
      cv.setPointerCapture(ev.pointerId);
      this._memo();
      actif = true;
      if (this.outil === 'riviere' || this.outil === 'route') trace = [[x, y]];
      else { this._peindre(x, y); redessiner(); }
    });
    cv.addEventListener('pointermove', ev => {
      if (!actif) return;
      const [x, y] = pos(ev);
      if (trace) {
        const d = trace[trace.length - 1];
        if (Math.hypot(d[0] - x, d[1] - y) > 1.5) trace.push([x, y]);
      } else this._peindre(x, y);
      redessiner();
    });
    const fin = () => {
      if (!actif) return;
      actif = false;
      if (trace && trace.length > 1) (this.outil === 'riviere' ? this.etat.rivieres : this.etat.routes).push(trace);
      else if (trace) this.annulations.pop();
      trace = null;
      this.rendre();
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
  },

  // ── Rendu ──
  _teinte(bandes, v) {
    let c = bandes[0][1];
    for (const [s, col] of bandes) if (v >= s) c = col;
    return c;
  },

  _rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  },

  dessiner(trace = null) {
    const cv = this.canvas;
    if (!cv?.isConnected) return;
    const e = this.etat, st = MONDE_STYLES[e.style], ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, S = MONDE_ECHELLE;
    // Le relief se lit pixel par pixel, légèrement déformé pour que les côtes tremblent comme à la plume
    if (!this._warp || this._warpGraine !== e.graine) {
      const b = bruitValeur(e.graine + '-plume');
      this._warp = new Float32Array(MONDE_L * MONDE_H * 2);
      for (let y = 0; y < MONDE_H; y++) for (let x = 0; x < MONDE_L; x++) {
        this._warp[(y * MONDE_L + x) * 2] = b(x * 0.35, y * 0.35, 2) * 0.9;
        this._warp[(y * MONDE_L + x) * 2 + 1] = b(x * 0.35 + 40, y * 0.35, 2) * 0.9;
      }
      this._warpGraine = e.graine;
    }
    const echant = (tab, gx, gy) => {
      const x = Math.max(0, Math.min(MONDE_L - 1.001, gx - 0.5)), y = Math.max(0, Math.min(MONDE_H - 1.001, gy - 0.5));
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * MONDE_L + x0;
      return tab[i] * (1 - fx) * (1 - fy) + tab[i + 1] * fx * (1 - fy) + tab[i + MONDE_L] * (1 - fx) * fy + tab[i + MONDE_L + 1] * fx * fy;
    };
    // Le fond (relief, côtes, frontières, forêts, montagnes) ne change pas quand on pose une ville
    // ou un nom : on le garde de côté, et seul le reste se redessine
    const cle = this._cleFond(e, W, H);
    if (this._fondCle !== cle || !this._fond) {
    const fond = this._fond?.width === W && this._fond?.height === H ? this._fond : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = fond.getContext('2d');
    const img = ctx.createImageData(W, H), px = img.data;
    const mer = st.mer.map(([s, c]) => [s, this._rgb(c)]), terre = st.terre.map(([s, c]) => [s, this._rgb(c)]);
    const roy = new Map(e.royaumes.map(k => [k.id, this._rgb(k.couleur)]));
    const encre = this._rgb(st.encre);
    const masque = new Uint8Array(W * H);
    for (let py = 0; py < H; py++) {
      for (let pxx = 0; pxx < W; pxx++) {
        const gx = (pxx + 0.5) / S, gy = (py + 0.5) / S;
        const ci = Math.min(MONDE_H - 1, Math.floor(gy)) * MONDE_L + Math.min(MONDE_L - 1, Math.floor(gx));
        const v = echant(e.h, gx + this._warp[ci * 2], gy + this._warp[ci * 2 + 1]);
        const o = (py * W + pxx) * 4;
        let c;
        if (v > 0) {
          masque[py * W + pxx] = 1;
          c = this._teinte(terre, v);
          const r = e.calques.royaumes ? e.r[ci] : 0;
          if (r && roy.has(r)) {
            const rc = roy.get(r), a = e.style === 'nuit' ? 0.22 : 0.18;
            px[o] = c[0] * (1 - a) + rc[0] * a; px[o + 1] = c[1] * (1 - a) + rc[1] * a; px[o + 2] = c[2] * (1 - a) + rc[2] * a;
          } else { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; }
        } else {
          c = this._teinte(mer, v);
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
        }
        px[o + 3] = 255;
      }
    }
    // Le trait de côte, et une ligne d'eau plus claire qui le double au large
    for (let py = 1; py < H - 1; py++) {
      for (let pxx = 1; pxx < W - 1; pxx++) {
        const i = py * W + pxx;
        const bord = masque[i] !== masque[i + 1] || masque[i] !== masque[i + W];
        if (bord) {
          const o = i * 4;
          px[o] = encre[0]; px[o + 1] = encre[1]; px[o + 2] = encre[2];
          if (masque[i]) { const o2 = (i - 1) * 4; px[o2] = (px[o2] + encre[0]) / 2; px[o2 + 1] = (px[o2 + 1] + encre[1]) / 2; px[o2 + 2] = (px[o2 + 2] + encre[2]) / 2; }
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Frontières des royaumes en pointillés
    if (e.calques.royaumes) {
      ctx.save();
      ctx.strokeStyle = st.encre;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let y = 0; y < MONDE_H - 1; y++) for (let x = 0; x < MONDE_L - 1; x++) {
        const i = y * MONDE_L + x, a = e.r[i];
        if (e.h[i] <= 0) continue;
        if (a !== e.r[i + 1] && e.h[i + 1] > 0) { ctx.moveTo((x + 1) * S, y * S); ctx.lineTo((x + 1) * S, (y + 1) * S); }
        if (a !== e.r[i + MONDE_L] && e.h[i + MONDE_L] > 0) { ctx.moveTo(x * S, (y + 1) * S); ctx.lineTo((x + 1) * S, (y + 1) * S); }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Forêts et montagnes dessinées comme sur les vieilles cartes
    const hz = hasardGraine(e.graine + '-symboles');
    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let y = 1; y < MONDE_H; y += 3) for (let x = (y % 6 === 1 ? 1 : 3); x < MONDE_L; x += 3) {
      const i = y * MONDE_L + x, jx = (hz() - 0.5) * S * 1.4, jy = (hz() - 0.5) * S;
      if (e.h[i] > 0.55) continue;
      if (e.f[i] && e.h[i] > 0) {
        const cx = x * S + jx, cy = y * S + jy;
        ctx.fillStyle = st.foret;
        ctx.strokeStyle = st.encre;
        ctx.beginPath();
        ctx.arc(cx, cy - 3, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy + 1);
        ctx.lineTo(cx, cy + 5);
        ctx.stroke();
      }
    }
    for (let y = 2; y < MONDE_H; y += 3) for (let x = (y % 6 === 2 ? 1 : 3); x < MONDE_L; x += 4) {
      const v = e.h[y * MONDE_L + x];
      if (v <= 0.55) continue;
      const cx = x * S + (hz() - 0.5) * S * 2, cy = y * S + (hz() - 0.5) * S, t = 7 + (v - 0.55) * 22;
      ctx.fillStyle = this._teinte(st.terre, 0.75);
      ctx.strokeStyle = st.encre;
      ctx.beginPath();
      ctx.moveTo(cx - t, cy + t * 0.5);
      ctx.lineTo(cx, cy - t * 0.7);
      ctx.lineTo(cx + t, cy + t * 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - t * 0.7);
      ctx.lineTo(cx + t * 0.35, cy + t * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this._fond = fond;
    this._fondCle = cle;
    }
    ctx.drawImage(this._fond, 0, 0);

    const ligne = (pts, couleur, largeur, tirets = []) => {
      if (pts.length < 2) return;
      ctx.save();
      ctx.strokeStyle = couleur;
      ctx.lineWidth = largeur;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.setLineDash(tirets);
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
      for (let k = 1; k < pts.length - 1; k++) {
        const mx = (pts[k][0] + pts[k + 1][0]) / 2 * S, my = (pts[k][1] + pts[k + 1][1]) / 2 * S;
        ctx.quadraticCurveTo(pts[k][0] * S, pts[k][1] * S, mx, my);
      }
      const z = pts[pts.length - 1];
      ctx.lineTo(z[0] * S, z[1] * S);
      ctx.stroke();
      ctx.restore();
    };
    e.rivieres.forEach(t => ligne(t, st.eau, 2.2));
    if (e.calques.routes) e.routes.forEach(t => ligne(t, st.route, 1.6, [6, 4]));
    if (trace) ligne(trace, this.outil === 'riviere' ? st.eau : st.route, 2, this.outil === 'route' ? [6, 4] : []);

    // Noms : royaumes au centre de leurs terres, villes, puis noms libres
    const ecrire = (texte, x, y, taille, opts = {}) => {
      ctx.save();
      ctx.font = `${opts.italique ? 'italic ' : ''}${opts.gras ? '700 ' : ''}${taille}px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (opts.espace) ctx.letterSpacing = `${opts.espace}px`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = e.style === 'nuit' ? 'rgba(7,16,31,.85)' : 'rgba(255,250,235,.7)';
      ctx.strokeText(texte, x, y);
      ctx.fillStyle = opts.couleur || st.texte;
      ctx.fillText(texte, x, y);
      ctx.restore();
    };
    if (e.calques.noms) {
      if (e.calques.royaumes) {
        e.royaumes.forEach(k => {
          let sx = 0, sy = 0, n = 0;
          for (let i = 0; i < e.r.length; i++) if (e.r[i] === k.id) { sx += i % MONDE_L; sy += Math.floor(i / MONDE_L); n++; }
          if (n > 30) ecrire(k.nom.toUpperCase(), (sx / n + 0.5) * S, (sy / n + 0.5) * S - 18, 13, { espace: 3, couleur: e.style === 'nuit' ? k.couleur : st.texte });
        });
      }
      e.noms.forEach(t => ecrire(t.texte, t.x * S, t.y * S, t.mer ? 15 : 13, { italique: true, espace: t.mer ? 2 : 1, couleur: t.mer ? st.eau : st.texte }));
    }
    e.villes.forEach(v => {
      ctx.save();
      ctx.fillStyle = v.capitale ? st.route : (e.style === 'nuit' ? '#e8e8e0' : '#fffaf0');
      ctx.strokeStyle = st.encre;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (v.capitale) ctx.rect(v.x * S - 4.5, v.y * S - 4.5, 9, 9);
      else ctx.arc(v.x * S, v.y * S, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (e.calques.noms) ecrire(v.nom, v.x * S, v.y * S + 13, v.capitale ? 13 : 11, { gras: v.capitale });
    });
    if (e.calques.noms && e.titre) ecrire(e.titre, W / 2, 26, 20, { italique: true, espace: 2 });

    if (e.calques.decor) this._rose(ctx, W - 70, H - 80, st);
    if (e.calques.decor) this._echelle(ctx, 28, H - 30, st);
    // Un cadre double, comme une carte imprimée
    ctx.save();
    ctx.strokeStyle = st.encre;
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(9, 9, W - 18, H - 18);
    ctx.restore();
  },

  // Une empreinte rapide de tout ce qui compose le fond
  _cleFond(e, W, H) {
    let h = 2166136261;
    const mele = v => { h ^= v; h = Math.imul(h, 16777619); };
    for (let i = 0; i < e.h.length; i++) mele((e.h[i] * 4096) | 0);
    for (let i = 0; i < e.f.length; i++) mele(e.f[i]);
    if (e.calques.royaumes) for (let i = 0; i < e.r.length; i++) mele(e.r[i]);
    return `${h >>> 0}|${e.graine}|${e.style}|${W}x${H}|${e.calques.royaumes ? e.royaumes.map(k => k.id + k.couleur).join(',') : '-'}`;
  },

  _rose(ctx, x, y, st) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = st.encre;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const long = k % 2 === 0 ? 44 : 24;
      ctx.save();
      ctx.rotate(k * Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, -long);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = st.encre;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -long);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = st.fond;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = st.texte;
    ctx.font = '700 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -50);
    ctx.restore();
  },

  _echelle(ctx, x, y, st) {
    ctx.save();
    ctx.strokeStyle = st.encre;
    ctx.fillStyle = st.encre;
    ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.rect(x + k * 30, y, 30, 6);
      if (k % 2 === 0) ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = st.texte;
    ctx.font = '11px Georgia, serif';
    ctx.fillText('0', x - 3, y - 4);
    ctx.fillText('100 lieues', x + 98, y - 4);
    ctx.restore();
  },

  _image() {
    const webp = this.canvas.toDataURL('image/webp', 0.92);
    return webp.startsWith('data:image/webp') ? { type: 'image/webp', donnees: webp.split(',')[1] } : { type: 'image/png', donnees: this.canvas.toDataURL('image/png').split(',')[1] };
  },

  telecharger() {
    const a = document.createElement('a');
    a.href = this.canvas.toDataURL('image/png');
    a.download = `${(this.etat.titre || this.carte.nom || 'monde').replace(/[\\/:*?"<>|]+/g, ' ')}.png`;
    a.click();
  },

  async enregistrer(epingler) {
    const id = this.carte.id;
    const r1 = await Cartes._envoyer({ action: 'monde', id, etat: this.serialiser(this.etat) });
    if (!r1) return;
    const r2 = await Cartes._envoyer({ action: 'image', id, ...this._image() });
    if (!r2) return;
    this.sale = false;
    this.annulations = [];
    Cartes._mondes.delete(id);
    if (epingler) {
      Cartes.mode = 'epingler';
      Cartes.rendre();
    } else {
      toast('Monde enregistré.');
      this.rendre();
    }
  },
};

// ─── Graphe des relations : qui parle à qui, saison par saison ──────────────

const Graphe = {
  d: null,
  saisons: new Set(),
  exclus: new Set(),
  duo: null,
  focus: '',
  nombre: 10,
  vue: 'reseau',

  async monter(slot) {
    this.slot = slot;
    slot.innerHTML = '<p class="an-note">Calcul des relations…</p>';
    try {
      this.d = await api.get('graphe');
      this._cacheRencontres = null;
    } catch (e) {
      slot.innerHTML = '<p class="an-note">Impossible de calculer les relations.</p>';
      return;
    }
    // Les épisodes qui ont des répliques, rangés dans l'ordre de la série
    const parlent = new Set(this.d.noeuds.map(n => n[0]));
    this._eps = this.d.episodes.filter(e => parlent.has(e.id));
    this._parSaison = this.d.saisons.map(x => ({ ...x, ...this._agreger(this._eps.filter(e => e.saison === x.numero).map(e => e.id)) })).filter(x => x.noeuds.length);
    const nums = new Set(this._parSaison.map(x => x.numero));
    this.saisons = new Set([...this.saisons].filter(n => nums.has(n)));
    if (!this.saisons.size && this._parSaison.length) this.saisons.add(this._parSaison[this._parSaison.length - 1].numero);
    this._positions = null;
    this.rendre();
  },

  // Additionne les répliques et les duos d'une liste d'épisodes
  _agreger(ids) {
    const garde = new Set(ids);
    const noeuds = new Map(), liens = new Map();
    this.d.noeuds.forEach(([e, nom, r]) => { if (garde.has(e)) noeuds.set(nom, (noeuds.get(nom) || 0) + r); });
    this.d.liens.forEach(([e, a, b, r, sc]) => {
      if (!garde.has(e)) return;
      const k = `${a}|${b}`, l = liens.get(k) || { a, b, repliques: 0, scenes: 0 };
      l.repliques += r;
      l.scenes += sc;
      liens.set(k, l);
    });
    return { ids, noeuds: [...noeuds].map(([nom, repliques]) => ({ nom, repliques })), liens: [...liens.values()] };
  },

  _pleines() {
    return this._parSaison || [];
  },

  // La période regardée : les saisons choisies, moins les épisodes décochés
  _selection() {
    const ids = this._eps.filter(e => this.saisons.has(e.saison) && !this.exclus.has(e.id)).map(e => e.id);
    const agg = this._agreger(ids);
    const nums = [...this.saisons].sort((a, b) => a - b);
    const dans = this._eps.filter(e => this.saisons.has(e.saison)).length;
    const nomS = n => this.d.saisons.find(x => x.numero === n)?.nom || `${motNiveau()} ${n}`;
    let titre = nums.length === 1 ? nomS(nums[0]) : nums.length === this._parSaison.length && nums.length > 2 ? `Toutes les ${motNiveau(true).toLowerCase()}` : `${motNiveau(true)} ${nums.join(', ')}`;
    if (ids.length < dans) titre += ` · ${ids.length} épisode${ids.length > 1 ? 's' : ''} sur ${dans}`;
    // On compare à la saison d'avant quand une saison entière est choisie, sinon aux épisodes qui précèdent la période
    let avant = null;
    if (nums.length === 1 && ids.length === dans) {
      const i = this._parSaison.findIndex(x => x.numero === nums[0]);
      if (i > 0) avant = { ...this._parSaison[i - 1], titre: nomS(this._parSaison[i - 1].numero) };
    } else if (ids.length) {
      const debut = this._eps.findIndex(e => e.id === ids[0]);
      const prec = this._eps.slice(Math.max(0, debut - ids.length), debut).map(e => e.id);
      if (prec.length >= Math.min(3, ids.length)) avant = { ...this._agreger(prec), titre: `les ${prec.length} épisode${prec.length > 1 ? 's' : ''} d'avant` };
    }
    return { ...agg, titre, avant };
  },

  _total(s) {
    return s.liens.reduce((t, l) => t + l.repliques, 0) || 1;
  },

  // Les personnages retenus : les plus bavards de chaque saison, pour que les ronds ne bougent pas d'une saison à l'autre
  _retenus() {
    const set = new Map();
    this._pleines().forEach(s => [...s.noeuds].sort((a, b) => b.repliques - a.repliques).slice(0, this.nombre).forEach(n => set.set(n.nom, (set.get(n.nom) || 0) + n.repliques)));
    return [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(this.nombre, 4) + 6).map(([n]) => n);
  },

  // Une disposition par ressorts, calculée une fois sur toutes les saisons
  _disposer(noms) {
    const cle = noms.join('|');
    if (this._positions?.cle === cle) return this._positions.p;
    const poids = new Map();
    this._pleines().forEach(s => {
      const tot = this._total(s);
      s.liens.forEach(l => { const k = l.a < l.b ? `${l.a}|${l.b}` : `${l.b}|${l.a}`; poids.set(k, (poids.get(k) || 0) + l.repliques / tot); });
    });
    const p = new Map(noms.map((n, i) => [n, { x: 500 + 300 * Math.cos(i / noms.length * Math.PI * 2), y: 300 + 200 * Math.sin(i / noms.length * Math.PI * 2) }]));
    const maxP = Math.max(1e-6, ...poids.values());
    for (let it = 0; it < 400; it++) {
      const f = new Map(noms.map(n => [n, { x: 0, y: 0 }]));
      const temp = 1 - it / 400;
      for (let a = 0; a < noms.length; a++) for (let b = a + 1; b < noms.length; b++) {
        const A = p.get(noms[a]), B = p.get(noms[b]);
        let dx = A.x - B.x, dy = A.y - B.y;
        const d = Math.max(20, Math.hypot(dx, dy));
        dx /= d; dy /= d;
        const rep = 60000 / (d * d);
        const w = (poids.get(noms[a] < noms[b] ? `${noms[a]}|${noms[b]}` : `${noms[b]}|${noms[a]}`) || 0) / maxP;
        const att = Math.sqrt(w) * (d - 190) * 0.05;
        const fa = f.get(noms[a]), fb = f.get(noms[b]);
        fa.x += (rep - att) * dx; fa.y += (rep - att) * dy;
        fb.x -= (rep - att) * dx; fb.y -= (rep - att) * dy;
      }
      noms.forEach(n => {
        const q = p.get(n), g = f.get(n);
        g.x += (500 - q.x) * 0.012; g.y += (300 - q.y) * 0.018;
        const m = Math.hypot(g.x, g.y), lim = 18 * temp + 0.5;
        q.x += m > lim ? g.x / m * lim : g.x;
        q.y += m > lim ? g.y / m * lim : g.y;
        q.x = Math.max(70, Math.min(930, q.x));
        q.y = Math.max(45, Math.min(555, q.y));
      });
    }
    this._positions = { cle, p };
    return p;
  },

  // Ce qui a changé depuis la saison d'avant, en part des répliques partagées pour comparer des saisons de longueurs différentes
  _alertes(s, noms) {
    const avant = s.avant;
    const part = (sa, a, b) => {
      const l = sa?.liens.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      return l ? l.repliques / this._total(sa) : 0;
    };
    const dedans = n => noms.includes(n);
    const res = { eteints: [], nouveaux: [], isoles: [] };
    if (avant) {
      avant.liens.filter(l => dedans(l.a) && dedans(l.b)).forEach(l => {
        const p0 = part(avant, l.a, l.b), p1 = part(s, l.a, l.b);
        const presents = s.noeuds.some(n => n.nom === l.a) && s.noeuds.some(n => n.nom === l.b);
        if (p0 >= 0.04 && p1 < p0 * 0.4 && presents) res.eteints.push({ a: l.a, b: l.b, p0, p1 });
      });
      s.liens.filter(l => dedans(l.a) && dedans(l.b)).forEach(l => {
        const p0 = part(avant, l.a, l.b), p1 = part(s, l.a, l.b);
        if (p1 >= 0.04 && p0 < 0.01) res.nouveaux.push({ a: l.a, b: l.b, p0, p1 });
      });
    }
    const totRep = s.noeuds.reduce((t, n) => t + n.repliques, 0) || 1;
    s.noeuds.filter(n => dedans(n.nom) && n.repliques / totRep >= 0.015).forEach(n => {
      const liens = s.liens.filter(l => l.a === n.nom || l.b === n.nom);
      const partage = liens.reduce((t, l) => t + l.repliques, 0) / this._total(s);
      if (liens.length <= 1 || partage < 0.02) res.isoles.push({ nom: n.nom, repliques: n.repliques, liens: liens.length });
    });
    res.eteints.sort((a, b) => b.p0 - a.p0);
    res.nouveaux.sort((a, b) => b.p1 - a.p1);
    return { ...res, avant };
  },

  _couleur(nom) {
    const p = this.d.personnages.find(x => x.nom === nom);
    return p?.couleur && !/^#888888$/i.test(p.couleur) ? p.couleur : Analyse._couleur(nom);
  },

  rendre() {
    const slot = this.slot;
    if (!slot?.isConnected) return;
    const pleines = this._pleines();
    if (!pleines.length) {
      slot.innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div><div class="empty-title">Pas encore de relations</div><div class="empty-sub">Le graphe se dessine à partir des répliques : importe ou écris des textes pour le voir apparaître.</div></div>`;
      return;
    }
    const s = this._selection();
    if (!s.ids.length) {
      slot.innerHTML = this._barre(s) + '<div class="ct-bloc"><p class="an-note">Aucun épisode retenu : recoche au moins un épisode dans la liste.</p></div>';
      return;
    }
    const noms = this._retenus().filter(n => pleines.some(x => x.noeuds.some(m => m.nom === n)));
    const pos = this._disposer(noms);
    const al = this._alertes(s, noms);
    const nomSaison = x => x.titre;
    const pil = (on, l, action, titre = '') => `<button type="button" class="an-choix ${on ? 'actif' : ''}" aria-pressed="${on}" ${titre ? `title="${esc(titre)}"` : ''} onclick="${action}">${esc(l)}</button>`;
    const rep = new Map(s.noeuds.map(n => [n.nom, n.repliques]));
    const maxRep = Math.max(1, ...noms.map(n => rep.get(n) || 0));
    const liens = s.liens.filter(l => noms.includes(l.a) && noms.includes(l.b));
    const maxL = Math.max(1, ...liens.map(l => l.repliques));
    const voit = l => !this.focus || l.a === this.focus || l.b === this.focus;
    const eteint = new Set(al.eteints.map(x => `${x.a}|${x.b}`));
    const nouveau = new Set(al.nouveaux.map(x => `${x.a}|${x.b}`));
    const traits = [
      // Les duos éteints restent visibles en pointillés, à l'épaisseur qu'ils avaient avant
      ...al.eteints.filter(x => voit(x) && !liens.some(l => (l.a === x.a && l.b === x.b) || (l.a === x.b && l.b === x.a))).map(x => {
        const A = pos.get(x.a), B = pos.get(x.b);
        return this._trait(x.a, x.b, A, B, 'gr-eteint', 2, `${x.a} et ${x.b} : duo qui s'éteint`);
      }),
      ...liens.filter(voit).map(l => {
        const A = pos.get(l.a), B = pos.get(l.b), k = `${l.a}|${l.b}`;
        const cls = eteint.has(k) || eteint.has(`${l.b}|${l.a}`) ? 'gr-eteint' : nouveau.has(k) || nouveau.has(`${l.b}|${l.a}`) ? 'gr-nouveau' : '';
        return this._trait(l.a, l.b, A, B, `gr-lien ${cls}`, (1 + 13 * l.repliques / maxL).toFixed(1), `${l.a} et ${l.b} : ${l.repliques} répliques dans ${l.scenes} scène(s) partagée(s). Clic : son évolution`);
      }),
    ].join('');
    const isoles = new Set(al.isoles.map(x => x.nom));
    // Un personnage absent de la saison garde sa place, mais ne s'affiche pas
    const ronds = noms.filter(n => rep.get(n)).map(n => {
      const q = pos.get(n), v = rep.get(n), r = 9 + 26 * Math.sqrt(v / maxRep);
      const terne = this.focus && n !== this.focus && !liens.some(l => (l.a === n && l.b === this.focus) || (l.b === n && l.a === this.focus));
      return `<g class="gr-noeud ${terne ? 'terne' : ''} ${isoles.has(n) ? 'isole' : ''}" tabindex="0" role="button" aria-label="${esc(n)} : ${v} répliques" onclick="Graphe.choisir(${esc(JSON.stringify(n))})" onkeydown="if (event.key === 'Enter') Graphe.choisir(${esc(JSON.stringify(n))})">
        <circle cx="${q.x}" cy="${q.y}" r="${r.toFixed(1)}" fill="${esc(this._couleur(n))}"><title>${esc(n)} : ${v} répliques</title></circle>
        <text x="${q.x}" y="${(q.y + r + 15).toFixed(1)}" text-anchor="middle">${esc(n)}</text></g>`;
    }).join('');
    const carte = (titre, cls, corps) => `<section class="ct-bloc gr-alerte ${cls}"><h3 class="an-label">${titre}</h3>${corps}</section>`;
    const pct = x => `${Math.round(x * 100)} %`;
    slot.innerHTML = `
      ${this._barre(s)}
      <div class="ct-grille">
        <section class="ct-zone" aria-label="Qui parle à qui">
          <div class="ct-entete">
            <h3 class="an-label">Qui parle à qui · ${esc(nomSaison(s))}</h3>
            <div class="an-ligne">
              <label class="an-label" for="gr-nombre">Personnages</label>
              <select id="gr-nombre" onchange="Graphe.nombre = +this.value; Graphe._positions = null; Graphe.rendre()">${[6, 8, 10, 14, 20].map(n => `<option value="${n}" ${n === this.nombre ? 'selected' : ''}>${n} par ${esc(Roman?.haut?.s || 'saison')}</option>`).join('')}</select>
            </div>
          </div>
          ${this.vue === 'reseau' ? `<svg class="gr-svg" viewBox="0 0 1000 600" role="img" aria-label="Réseau des personnages en ${esc(nomSaison(s))}">${traits}${ronds}</svg>` : this.vue === 'presence' ? this._presence(s, noms) : this.vue === 'rencontres' ? this._grilleRencontres(s, noms) : this._tableau(s, al.avant, noms)}
          ${this.duo ? this._courbe(s) : ''}
          <div class="an-ligne" role="group" aria-label="Filtrer par personnage">
            ${pil(!this.focus, 'Tout le monde', "Graphe.choisir('')")}
            ${noms.filter(n => rep.get(n)).map(n => pil(this.focus === n, n, `Graphe.choisir(${esc(JSON.stringify(n))})`)).join('')}
          </div>
          <p class="an-note">L'épaisseur d'un trait suit le nombre de répliques dites dans les scènes que deux personnages partagent ; la taille d'un rond, ses répliques. En pointillés orange : un duo qui s'éteint. En vert : un duo nouveau.</p>
        </section>
        <aside class="ct-cote">
          ${this.vue === 'presence' ? this._oublis(s, noms) : ''}
          ${this.vue === 'rencontres' ? this._listeRencontres(s, noms) : ''}
          ${al.avant ? `<section class="ct-bloc"><p class="an-note">Comparé à ${esc(al.avant.titre)}.</p></section>` : '<section class="ct-bloc"><p class="an-note">Rien avant cette période : les changements apparaîtront à partir de la suivante.</p></section>'}
          ${al.avant ? carte('Duo qui s\'éteint', 'eteint', al.eteints.length ? al.eteints.slice(0, 4).map(x => `<p>${this._lienDuo(x.a, x.b)}<br><span class="an-note">${pct(x.p0)} des répliques partagées avant (${esc(al.avant.titre)}), ${pct(x.p1)} maintenant. Voulu, ou oublié ?</span></p>`).join('') : '<p class="an-note">Aucun : les duos tiennent.</p>') : ''}
          ${al.avant ? carte('Nouveau duo', 'nouveau', al.nouveaux.length ? al.nouveaux.slice(0, 4).map(x => `<p>${this._lienDuo(x.a, x.b)}<br><span class="an-note">${pct(x.p1)} des répliques partagées, presque rien avant.</span></p>`).join('') : '<p class="an-note">Pas de nouvelle relation sur cette période.</p>') : ''}
          ${carte('Isolé', 'isole', al.isoles.length ? al.isoles.slice(0, 4).map(x => `<p><strong>${esc(x.nom)}</strong><br><span class="an-note">${x.repliques} répliques, mais ${x.liens ? 'un seul partenaire de scène' : 'aucune scène partagée'}.</span></p>`).join('') : '<p class="an-note">Personne n\'est laissé seul.</p>')}
        </aside>
      </div>`;
  },

  // Part des scènes de chaque épisode où apparaît chacun : une case vide, c'est un épisode sans lui
  _parts(s) {
    const garde = new Set(s.ids);
    const parts = new Map();
    (this.d.presences || []).forEach(([e, nom, n]) => {
      if (!garde.has(e)) return;
      const tot = this.d.episodes.find(x => x.id === e)?.scenes || 0;
      if (!parts.has(nom)) parts.set(nom, new Map());
      parts.get(nom).set(e, tot ? n / tot : 0);
    });
    return parts;
  },

  _presence(s, noms) {
    const parts = this._parts(s);
    const eps = this._eps.filter(e => s.ids.includes(e.id));
    const plusieurs = new Set(eps.map(e => e.saison)).size > 1;
    const lignes = noms.filter(n => !this.focus || n === this.focus);
    const moy = n => { const m = parts.get(n); return m ? eps.reduce((t, e) => t + (m.get(e.id) || 0), 0) / Math.max(1, eps.length) : 0; };
    // Une seule teinte, de plus en plus dense : la case dit la part des scènes de l'épisode
    const fond = v => v ? `background: color-mix(in srgb, var(--accent) ${Math.round(15 + 85 * v)}%, transparent)` : '';
    return `<div class="an-table gr-presence"><table>
      <thead><tr><th scope="col">Personnage</th><th scope="col">Moyenne</th>${eps.map(e => `<th scope="col" title="${esc(e.titre || '')} · ${e.scenes} scène(s)">${esc(plusieurs ? e.code : e.code.replace(/^S\d+E?/i, '') || e.code)}</th>`).join('')}</tr></thead>
      <tbody>${lignes.map(n => `<tr><th scope="row"><span class="an-puce" style="background:${esc(this._couleur(n))}"></span>${esc(n)}</th><td>${Math.round(moy(n) * 100)} %</td>
        ${eps.map(e => { const v = parts.get(n)?.get(e.id) || 0; return `<td class="gr-case ${v ? '' : 'vide'}" style="${fond(v)}" title="${esc(n)} · ${esc(e.code)} : ${Math.round(v * 100)} % des scènes">${v ? '' : '·'}</td>`; }).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="an-note">Chaque case : la part des scènes de l'épisode où le personnage apparaît. Plus elle est foncée, plus il est là. Un point : il n'y est pas.</p>`;
  },

  // Pour chaque paire : jamais une scène ensemble, ou depuis combien d'épisodes où ils sont là tous les deux.
  // L'histoire compte jusqu'à la fin de la période choisie, pas au-delà
  _rencontres(s, noms) {
    const cle = `${s.ids.join(',')}|${noms.join('|')}`;
    if (this._cacheRencontres?.cle === cle) return this._cacheRencontres.r;
    const rang = new Map(this._eps.map((e, i) => [e.id, i]));
    const fin = Math.max(...s.ids.map(id => rang.get(id) ?? -1));
    const presents = new Map();
    const noter = (ep, nom) => { const i = rang.get(ep); if (i === undefined || i > fin) return; if (!presents.has(nom)) presents.set(nom, new Set()); presents.get(nom).add(i); };
    (this.d.presences || []).forEach(([ep, nom, n]) => { if (n > 0) noter(ep, nom); });
    this.d.noeuds.forEach(([ep, nom]) => noter(ep, nom));
    const ensemble = new Map();
    this.d.liens.forEach(([ep, a, b, , sc]) => {
      const i = rang.get(ep);
      if (i === undefined || i > fin || !sc) return;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!ensemble.has(k)) ensemble.set(k, []);
      ensemble.get(k).push(i);
    });
    const paires = [];
    const liste = noms.slice(0, 14);
    for (let x = 0; x < liste.length; x++) for (let y = x + 1; y < liste.length; y++) {
      const [a, b] = liste[x] < liste[y] ? [liste[x], liste[y]] : [liste[y], liste[x]];
      const pa = presents.get(a) || new Set(), pb = presents.get(b) || new Set();
      if (pa.size < 3 || pb.size < 3) continue;
      const communs = [...pa].filter(i => pb.has(i)).sort((m, n) => m - n);
      const fois = [...new Set(ensemble.get(`${a}|${b}`) || [])].sort((m, n) => m - n);
      const poids = Math.min(pa.size, pb.size);
      if (!fois.length) { paires.push({ a, b, jamais: true, communs: communs.length, poids }); continue; }
      const dernier = fois[fois.length - 1];
      // Le plus long trou passé : des épisodes où ils sont là tous les deux, sans se croiser
      let trou = 0;
      for (let k = 1; k < fois.length; k++) trou = Math.max(trou, communs.filter(i => i > fois[k - 1] && i < fois[k]).length);
      paires.push({ a, b, jamais: false, fois: fois.length, dernier: this._eps[dernier], depuis: communs.filter(i => i > dernier).length, episodes: fin - dernier, trou });
    }
    this._cacheRencontres = { cle, r: paires };
    return paires;
  },

  _grilleRencontres(s, noms) {
    const paires = this._rencontres(s, noms);
    const liste = noms.slice(0, 14).filter(n => paires.some(p => p.a === n || p.b === n));
    if (liste.length < 2) return '<p class="an-note">Pas assez de personnages présents sur la durée pour comparer leurs rencontres.</p>';
    const trouver = (a, b) => paires.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    const max = Math.max(1, ...paires.filter(p => !p.jamais).map(p => p.depuis));
    const cellule = (a, b) => {
      if (a === b) return '<td class="gr-r-soi" aria-hidden="true"></td>';
      const p = trouver(a, b);
      if (!p) return '<td class="gr-case vide">·</td>';
      const titre = p.jamais ? `${a} et ${b} : jamais une scène ensemble (${p.communs} épisode(s) où ils sont là tous les deux)` : `${a} et ${b} : dernière scène ensemble en ${p.dernier.code} ; depuis, ${p.depuis} épisode(s) où ils sont là tous les deux sans se croiser`;
      const fond = p.jamais ? '' : `background: color-mix(in srgb, var(--orange) ${Math.round(8 + 80 * p.depuis / max)}%, transparent)`;
      return `<td class="gr-case gr-r ${p.jamais ? 'jamais' : ''}" style="${fond}"><button type="button" title="${esc(titre)}" aria-label="${esc(titre)}" onclick="Graphe.ouvrirDuo(${esc(JSON.stringify(p.a))}, ${esc(JSON.stringify(p.b))})">${p.jamais ? '∅' : p.depuis || ''}</button></td>`;
    };
    return `<div class="an-table gr-presence gr-rencontres"><table>
      <thead><tr><th scope="col"></th>${liste.map(n => `<th scope="col" title="${esc(n)}">${esc(n.slice(0, 8))}</th>`).join('')}</tr></thead>
      <tbody>${liste.map(a => `<tr><th scope="row"><span class="an-puce" style="background:${esc(this._couleur(a))}"></span>${esc(a)}</th>${liste.map(b => cellule(a, b)).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="an-note">Chaque case : le nombre d'épisodes où les deux personnages sont là, mais sans partager une scène, depuis leur dernière scène ensemble. Plus elle est orange, plus ça fait longtemps. ∅ : jamais une scène ensemble. Clique pour voir l'évolution du duo.</p>`;
  },

  _listeRencontres(s, noms) {
    const paires = this._rencontres(s, noms);
    // Deux petits rôles vus une fois ne font pas une rencontre manquée : on garde ceux qui comptent
    const jamais = paires.filter(p => p.jamais && p.poids >= 5).sort((x, y) => y.communs - x.communs || y.poids - x.poids);
    const loin = paires.filter(p => !p.jamais && p.depuis >= 3).sort((x, y) => y.depuis - x.depuis);
    const trous = paires.filter(p => !p.jamais && p.trou >= 5 && p.trou > p.depuis).sort((x, y) => y.trou - x.trou);
    return `<section class="ct-bloc gr-alerte nouveau"><h3 class="an-label">Jamais une scène ensemble (${jamais.length})</h3>
        ${jamais.length ? jamais.slice(0, 8).map(p => `<p>${this._lienDuo(p.a, p.b)}<br><span class="an-note">${p.communs ? `Tous les deux dans ${p.communs} épisode${p.communs > 1 ? 's' : ''}, sans jamais se croiser.` : 'Jamais dans le même épisode.'} Une rencontre à écrire ?</span></p>`).join('') : '<p class="an-note">Tous les personnages réguliers se sont déjà croisés.</p>'}
      </section>
      <section class="ct-bloc gr-alerte eteint"><h3 class="an-label">Pas vus ensemble depuis longtemps (${loin.length})</h3>
        ${loin.length ? loin.slice(0, 8).map(p => `<p>${this._lienDuo(p.a, p.b)}<br><span class="an-note">Dernière scène ensemble en ${esc(p.dernier.code)}. Depuis, ${p.depuis} épisode${p.depuis > 1 ? 's' : ''} où ils sont là tous les deux sans se croiser (${p.episodes} épisode${p.episodes > 1 ? 's' : ''} en tout).</span></p>`).join('') : '<p class="an-note">Aucun duo ne s\'est perdu de vue plus de deux épisodes.</p>'}
      </section>
      ${trous.length ? `<section class="ct-bloc gr-alerte"><h3 class="an-label">Longs silences passés</h3>
        ${trous.slice(0, 5).map(p => `<p>${this._lienDuo(p.a, p.b)}<br><span class="an-note">Ils sont restés ${p.trou} épisodes côte à côte sans une scène ensemble, avant de se retrouver.</span></p>`).join('')}
      </section>` : ''}`;
  },

  // Ceux qu'on perd de vue : au moins trois épisodes de suite sans eux, alors qu'ils étaient là avant
  _oublis(s, noms) {
    const parts = this._parts(s);
    const eps = this._eps.filter(e => s.ids.includes(e.id));
    const oublis = [];
    noms.forEach(n => {
      const m = parts.get(n) || new Map();
      let vu = false, trou = [], pire = [];
      eps.forEach(e => {
        if (m.get(e.id)) { if (vu && trou.length > pire.length) pire = trou; vu = true; trou = []; }
        else if (vu) trou = [...trou, e];
      });
      const fin = trou.length >= 3 && trou.length >= pire.length;
      if (trou.length > pire.length) pire = trou;
      if (pire.length >= 3) oublis.push({ n, de: pire[0].code, a: pire[pire.length - 1].code, nb: pire.length, fin });
    });
    oublis.sort((a, b) => b.nb - a.nb);
    return `<section class="ct-bloc gr-alerte eteint"><h3 class="an-label">Perdus de vue</h3>
      ${oublis.length ? oublis.slice(0, 6).map(o => `<p><strong>${esc(o.n)}</strong><br><span class="an-note">${o.fin ? `n'apparaît plus depuis ${esc(o.de)} (${o.nb} épisodes). Parti pour de bon ?` : `${o.nb} épisodes sans apparaître, de ${esc(o.de)} à ${esc(o.a)}. Voulu, ou oublié ?`}</span></p>`).join('') : '<p class="an-note">Personne ne disparaît plus de deux épisodes de suite.</p>'}
    </section>`;
  },

  _tableau(s, avant, noms) {
    const liens = s.liens.filter(l => noms.includes(l.a) && noms.includes(l.b) && (!this.focus || l.a === this.focus || l.b === this.focus)).sort((a, b) => b.repliques - a.repliques);
    const tot = this._total(s), totA = avant ? this._total(avant) : 1;
    const partAvant = l => {
      const x = avant?.liens.find(m => (m.a === l.a && m.b === l.b) || (m.a === l.b && m.b === l.a));
      return x ? x.repliques / totA : 0;
    };
    return `<div class="an-table gr-table"><table><thead><tr><th scope="col">Duo</th><th scope="col">Répliques</th><th scope="col">Scènes</th><th scope="col">Part</th>${avant ? '<th scope="col">Avant</th>' : ''}</tr></thead><tbody>
      ${liens.slice(0, 40).map(l => { const p = l.repliques / tot, p0 = partAvant(l); return `<tr><td>${this._lienDuo(l.a, l.b, false)}</td><td>${l.repliques}</td><td>${l.scenes}</td><td>${Math.round(p * 100)} %</td>${avant ? `<td>${Math.round(p0 * 100)} % ${p > p0 * 1.5 && p - p0 > 0.02 ? '↑' : p < p0 * 0.6 && p0 - p > 0.02 ? '↓' : ''}</td>` : ''}</tr>`; }).join('') || '<tr><td colspan="5">Aucun duo.</td></tr>'}
    </tbody></table></div>`;
  },

  _barre(s) {
    const pleines = this._pleines();
    const pil = (on, l, action, titre = '') => `<button type="button" class="an-choix ${on ? 'actif' : ''}" aria-pressed="${on}" ${titre ? `title="${esc(titre)}"` : ''} onclick="${action}">${esc(l)}</button>`;
    const toutes = pleines.every(x => this.saisons.has(x.numero));
    const seule = this.saisons.size === 1 ? pleines.findIndex(x => this.saisons.has(x.numero)) : -1;
    const eps = this._eps.filter(e => this.saisons.has(e.saison));
    const gardes = eps.filter(e => !this.exclus.has(e.id)).length;
    const parSaison = [...this.saisons].sort((a, b) => a - b).map(n => {
      const liste = eps.filter(e => e.saison === n);
      return `<fieldset class="gr-eps-saison"><legend>${esc(this.d.saisons.find(x => x.numero === n)?.nom || `${motNiveau()} ${n}`)}
          <button type="button" class="btn btn-ghost btn-sm" onclick="Graphe.cocherSaison(${n}, true)">Tous</button><button type="button" class="btn btn-ghost btn-sm" onclick="Graphe.cocherSaison(${n}, false)">Aucun</button></legend>
        <div class="gr-eps-liste">${liste.map(e => `<label class="gr-ep" title="${esc(e.titre)}"><input type="checkbox" ${this.exclus.has(e.id) ? '' : 'checked'} onchange="Graphe.cocherEpisode(${e.id}, this.checked)"><span>${esc(e.code)}</span>${e.titre ? `<small>${esc(e.titre)}</small>` : ''}</label>`).join('')}</div></fieldset>`;
    }).join('');
    return `
      <div class="ct-barre">
        <div class="an-ligne" role="group" aria-label="Vue">
          ${pil(this.vue === 'reseau', 'Réseau', "Graphe.vue = 'reseau'; Graphe.rendre()")}
          ${pil(this.vue === 'tableau', 'Tableau', "Graphe.vue = 'tableau'; Graphe.rendre()")}
          ${pil(this.vue === 'presence', 'Présence', "Graphe.vue = 'presence'; Graphe.rendre()")}
          ${pil(this.vue === 'rencontres', 'Rencontres', "Graphe.vue = 'rencontres'; Graphe.rendre()")}
        </div>
        <div class="an-ligne" role="group" aria-label="${esc(motNiveau(true))} (plusieurs choix possibles)">
          <span class="an-label">${esc(motNiveau(true))}</span>
          ${pleines.length > 1 ? pil(toutes, 'Toutes', 'Graphe.toutesSaisons()') : ''}
          ${pleines.map(x => pil(this.saisons.has(x.numero), `${x.numero}`, `Graphe.basculerSaison(${x.numero})`, `${x.nom || ''} · clic : ajouter ou retirer`)).join('')}
        </div>
        ${pleines.length > 1 ? `<div class="an-ligne"><input type="range" class="gr-curseur" min="0" max="${pleines.length - 1}" value="${Math.max(0, seule)}" aria-label="Une seule ${esc(motNiveau().toLowerCase())}" oninput="Graphe.choisirSaison(Graphe._pleines()[this.value].numero)"><span class="an-note">Le curseur montre une ${esc(motNiveau().toLowerCase())} à la fois ; les boutons en ajoutent ou en retirent.</span></div>` : ''}
        <details class="gr-eps" ${this._epsOuvert ? 'open' : ''} ontoggle="Graphe._epsOuvert = this.open">
          <summary>Épisodes retenus : ${gardes} sur ${eps.length}${this.exclus.size && gardes < eps.length ? ' · <button type="button" class="btn btn-ghost btn-sm" onclick="event.preventDefault(); Graphe.toutRecocher()">Tout recocher</button>' : ''}</summary>
          ${parSaison}
        </details>
      </div>`;
  },

  _existe(n) {
    return this._pleines().some(x => x.numero === n);
  },

  choisirSaison(n) {
    if (!this._existe(n)) return;
    this.saisons = new Set([n]);
    this.rendre();
  },

  basculerSaison(n) {
    if (!this._existe(n)) return;
    if (this.saisons.has(n)) {
      if (this.saisons.size > 1) this.saisons.delete(n);
    } else this.saisons.add(n);
    this.rendre();
  },

  toutesSaisons() {
    const toutes = this._pleines().every(x => this.saisons.has(x.numero));
    this.saisons = toutes ? new Set([this._pleines().at(-1).numero]) : new Set(this._pleines().map(x => x.numero));
    this.rendre();
  },

  cocherEpisode(id, garder) {
    garder ? this.exclus.delete(id) : this.exclus.add(id);
    this.rendre();
  },

  cocherSaison(n, garder) {
    this._eps.filter(e => e.saison === n).forEach(e => (garder ? this.exclus.delete(e.id) : this.exclus.add(e.id)));
    this.rendre();
  },

  toutRecocher() {
    this.exclus.clear();
    this.rendre();
  },

  // Un trait cliquable : une cible large et invisible sous le trait visible
  _trait(a, b, A, B, cls, largeur, titre) {
    const args = esc(JSON.stringify([a, b]));
    const actif = this.duo && ((this.duo.a === a && this.duo.b === b) || (this.duo.a === b && this.duo.b === a));
    return `<g class="gr-trait ${actif ? 'actif' : ''}" tabindex="0" role="button" aria-label="${esc(titre)}" onclick="Graphe.ouvrirDuo(...${args})" onkeydown="if (event.key === 'Enter') Graphe.ouvrirDuo(...${args})">
      <line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="gr-cible"/>
      <line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="${cls}" stroke-width="${largeur}"><title>${esc(titre)}</title></line></g>`;
  },

  _lienDuo(a, b, gras = true) {
    return `<button type="button" class="gr-duo-lien ${gras ? 'gras' : ''}" onclick="Graphe.ouvrirDuo(${esc(JSON.stringify(a))}, ${esc(JSON.stringify(b))})">${esc(a)} et ${esc(b)}</button>`;
  },

  ouvrirDuo(a, b) {
    this.duo = this.duo && this.duo.a === a && this.duo.b === b ? null : { a, b };
    this.rendre();
    if (this.duo) document.getElementById('gr-courbe')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },

  // L'évolution d'un duo, épisode par épisode, sur toute la série ; la période choisie reste en pleine couleur
  _courbe(s) {
    const { a, b } = this.duo;
    const parEp = new Map(), parle = new Map();
    this.d.liens.forEach(([e, x, y, r, sc]) => { if ((x === a && y === b) || (x === b && y === a)) parEp.set(e, { r: (parEp.get(e)?.r || 0) + r, sc: (parEp.get(e)?.sc || 0) + sc }); });
    this.d.noeuds.forEach(([e, nom]) => { if (nom === a || nom === b) parle.set(e, (parle.get(e) || 0) | (nom === a ? 1 : 2)); });
    const choisis = new Set(s.ids);
    const eps = this.duoPeriode ? this._eps.filter(e => choisis.has(e.id)) : this._eps;
    const max = Math.max(1, ...eps.map(e => parEp.get(e.id)?.r || 0));
    const L = 1000, H = 150, w = L / Math.max(1, eps.length);
    let barres = '', reperes = '', etiquettes = '', saison = null;
    eps.forEach((e, i) => {
      const v = parEp.get(e.id);
      if (e.saison !== saison) {
        saison = e.saison;
        reperes += `<line x1="${(i * w).toFixed(1)}" y1="0" x2="${(i * w).toFixed(1)}" y2="${H}" class="gr-c-sep"/>`;
        etiquettes += `<span style="left:${(i / eps.length * 100).toFixed(2)}%">${this.duoPeriode ? esc(e.code) : e.saison}</span>`;
      }
      const h = v ? Math.max(2, v.r / max * (H - 8)) : 0;
      const tous = parle.get(e.id) === 3;
      const titre = `${e.code}${e.titre ? ` · ${e.titre}` : ''} : ${v ? `${v.r} répliques dans ${v.sc} scène(s) ensemble` : tous ? 'tous les deux présents, aucune scène ensemble' : 'pas tous les deux dans l\'épisode'}`;
      barres += `<rect x="${(i * w + w * 0.1).toFixed(2)}" y="${(H - h).toFixed(1)}" width="${Math.max(0.6, w * 0.8).toFixed(2)}" height="${h.toFixed(1)}" class="gr-c-barre ${choisis.has(e.id) ? '' : 'hors'}"><title>${esc(titre)}</title></rect>`;
      if (!v && tous) barres += `<rect x="${(i * w + w * 0.1).toFixed(2)}" y="${H - 3}" width="${Math.max(0.6, w * 0.8).toFixed(2)}" height="3" class="gr-c-manque ${choisis.has(e.id) ? '' : 'hors'}"><title>${esc(titre)}</title></rect>`;
    });
    // Repères : dernière scène ensemble, plus long silence alors que les deux sont là
    const avec = eps.filter(e => parEp.has(e.id));
    const dernier = avec[avec.length - 1];
    let silence = { n: 0 }, cours = null;
    eps.forEach(e => {
      if (parEp.has(e.id)) { cours = null; return; }
      if (parle.get(e.id) !== 3) return;
      cours = cours ? { ...cours, fin: e, n: cours.n + 1 } : { debut: e, fin: e, n: 1 };
      if (cours.n > silence.n) silence = cours;
    });
    const totalPeriode = s.ids.reduce((t, id) => t + (parEp.get(id)?.r || 0), 0);
    const epsPeriode = s.ids.filter(id => parEp.has(id)).length;
    return `<section class="gr-courbe" id="gr-courbe" aria-labelledby="gr-courbe-titre">
      <div class="ct-entete">
        <h3 id="gr-courbe-titre" class="an-label">${esc(a)} et ${esc(b)}, épisode par épisode</h3>
        <div class="an-ligne">
          <button type="button" class="an-choix ${this.duoPeriode ? '' : 'actif'}" aria-pressed="${!this.duoPeriode}" onclick="Graphe.duoPeriode = false; Graphe.rendre()">Toute la série</button>
          <button type="button" class="an-choix ${this.duoPeriode ? 'actif' : ''}" aria-pressed="${!!this.duoPeriode}" onclick="Graphe.duoPeriode = true; Graphe.rendre()">La période</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Graphe.ouvrirDuo(${esc(JSON.stringify(a))}, ${esc(JSON.stringify(b))})">Fermer</button>
        </div>
      </div>
      <svg class="gr-c-svg" viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" role="img" aria-label="Répliques partagées par ${esc(a)} et ${esc(b)} dans chaque épisode">${reperes}${barres}</svg>
      <div class="gr-c-saisons" aria-hidden="true">${etiquettes}</div>
      <p class="an-note">Sur la période choisie : ${totalPeriode} répliques dans ${epsPeriode} épisode(s) sur ${s.ids.length}.
        ${dernier ? ` Dernière scène ensemble : <strong>${esc(dernier.code)}</strong>.` : ' Jamais dans la même scène.'}
        ${silence.n >= 2 ? ` Plus long silence alors qu'ils sont tous les deux là : <strong>${silence.n} épisodes</strong> (${esc(silence.debut.code)} → ${esc(silence.fin.code)}).` : ''}
        Les traits rouges au pied du graphe marquent ces épisodes sans scène commune ; en gris, hors de la période choisie.</p>
    </section>`;
  },

  choisir(nom) {
    this.focus = this.focus === nom ? '' : nom;
    this.rendre();
  },
};
