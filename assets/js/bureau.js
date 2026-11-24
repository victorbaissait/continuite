// assets/js/bureau.js — Ce que l'app de bureau ajoute à la page : menus et raccourcis, PDF direct,
// projets partagés ouverts par double-clic ou glissés sur la fenêtre, sauvegarde automatique, mises à jour.
// Dans un navigateur (MAMP), window.bureau n'existe pas : rien ne change.
'use strict';

const Bureau = {
  actif: Boolean(window.bureau),
  reglages: null,
  infos: null,

  init() {
    if (!this.actif) return;
    document.documentElement.classList.add('app-bureau');
    window.bureau.onCommande((nom, valeur) => this.commande(nom, valeur).catch(e => toast(e.message || 'Commande impossible', 'error')));
    this._pdfDirect();
    this._glisserDeposer();
    this._concentrationPleinEcran();
    this._carteReglages();
    this._plusieursFenetres();
    this._dictionnaire();
  },

  // ─── Les noms de la série dans le dictionnaire du correcteur (au démarrage, puis en revenant sur la fenêtre) ───

  _dictionnaire() {
    let dernier = 0;
    const envoyer = this._envoyerDictionnaire = async (force = false) => {
      if (!window.bureau.dictionnaire || (!force && Date.now() - dernier < 30000)) return;
      dernier = Date.now();
      const [persos, lieux] = await Promise.all([DataStore.get('personnages').catch(() => []), DataStore.get('lieux').catch(() => [])]);
      const mots = new Set();
      const decouper = t => String(t || '').split(/[\s,.;:!?()«»"/]+/).forEach(m => { m = m.replace(/^['’-]+|['’-]+$/g, ''); if (m.length > 1) mots.add(m); });
      for (const p of Array.isArray(persos) ? persos : []) [p.prenom, p.nom, p.surnom].forEach(decouper);
      for (const l of Array.isArray(lieux) ? lieux : []) decouper(l.nom);
      return mots.size ? window.bureau.dictionnaire([...mots]) : 0;
    };
    this._prete().then(envoyer).catch(() => {});
    window.addEventListener('focus', () => envoyer().catch(() => {}));
  },

  // ─── Plusieurs fenêtres : chacune enregistre en partant, et se remet à jour en revenant ───

  _plusieursFenetres() {
    // Une fenêtre ouverte sur un épisode (« Autre fenêtre » dans le brouillon)
    const m = location.hash.match(/^#brouillon=(\d+)$/);
    if (m) {
      history.replaceState(null, '', location.pathname);
      this._prete().then(async () => { await ouvrirOnglet('ecriture'); Ecriture.ouvrirBrouillon(Number(m[1])); });
    }
    // En quittant la fenêtre, ce qui attendait d'être enregistré part tout de suite
    window.addEventListener('blur', () => { if (typeof Ecriture !== 'undefined' && Ecriture._notesAttente) Ecriture.viderNotes?.(); });
    // En revenant, le brouillon affiché est relu : il a pu changer dans une autre fenêtre
    window.addEventListener('focus', () => this._resynchroniser().catch(() => {}));
  },

  async _resynchroniser() {
    if (typeof Ecriture === 'undefined' || !Ecriture.epId) return;
    const champ = document.getElementById('ec-brouillon');
    if (!champ || Object.keys(Ecriture._notesAttente || {}).length) return;
    const cle = `brouillon:${Ecriture.epId}`;
    const notes = await api.get('analyse_notes');
    const ailleurs = notes?.[cle] ?? '';
    if (ailleurs === champ.value) return;
    Ecriture.notes[cle] = ailleurs;
    const commentaires = `commentaires:${Ecriture.epId}`;
    if (notes?.[commentaires] !== undefined) Ecriture.notes[commentaires] = notes[commentaires];
    else delete Ecriture.notes[commentaires];
    Ecriture.rendreVue();
    toast('Ce brouillon a changé dans une autre fenêtre : il est à jour.', 'info');
  },

  // Même chose qu'un clic sur le menu, en attendant que l'onglet soit prêt (palette.js)
  _ouvrirOnglet(tab) {
    return ouvrirOnglet(tab);
  },

  // Une commande arrivée pendant le démarrage attend que l'app ait affiché son premier onglet
  _prete() {
    return window.appPrete ? Promise.resolve() : new Promise(r => window.addEventListener('app-prete', r, { once: true }));
  },

  async commande(nom, valeur) {
    await this._prete();
    if (nom === 'onglet') {
      if (!(await this._ouvrirOnglet(String(valeur)))) toast('Cet onglet est masqué (Config → Interface).', 'info');
    } else if (nom === 'recherche' || nom === 'chercher') {
      await this._ouvrirOnglet('recherche');
      if (nom === 'chercher' && typeof Recherche !== 'undefined') Recherche.setQuery(String(valeur || ''));
      document.getElementById('recherche-input')?.focus();
    } else if (nom === 'nouvel-episode') {
      await this._ouvrirOnglet('episodes');
      if (typeof Episodes !== 'undefined') Episodes.openNewEpisode();
    } else if (nom === 'concentration') {
      if (document.getElementById('ec-atelier') && typeof Ecriture !== 'undefined') Ecriture.basculerFocus();
      else toast('Le mode concentration se lance depuis le brouillon d\'un épisode : Écriture → Brouillon.', 'info');
    } else if (nom === 'fichier-projet') {
      await this.recevoirProjet(valeur);
    } else if (nom === 'palette') {
      Palette.basculer();
    } else if (nom === 'aide') {
      if (typeof Aide !== 'undefined') Aide.ouvrir();
    } else if (nom === 'surveillance') {
      this._scriptRepris(valeur);
    } else if (nom === 'sauvegarde-faite') {
      if (valeur?.ok) toast(`Sauvegarde faite : ${valeur.projets} projet(s).`);
      this._rendreCarte();
    }
  },

  // ─── PDF direct : les fenêtres d'impression de l'app deviennent un fichier PDF ───

  _pdfDirect() {
    const ouvrir = window.open.bind(window);
    // Les exports écrivent leur document dans une fenêtre vide ; ici, ce document part en PDF
    window.open = (url, cible, ...reste) => {
      if ((url === '' || url === undefined || url === 'about:blank') && (cible === '_blank' || cible === undefined)) {
        let html = '';
        let envoye = false;
        const envoyer = () => {
          if (envoye) return;
          envoye = true;
          const titre = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || document.title).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
          window.bureau.pdf(html, titre).then(r => { if (r?.ok) toast('PDF enregistré.'); }).catch(e => toast(`PDF impossible : ${e.message}`, 'error'));
        };
        return {
          document: { write: t => { html += String(t); }, writeln: t => { html += String(t) + '\n'; }, open: () => {}, close: envoyer, title: '' },
          focus: () => {}, print: envoyer, close: () => {}, closed: false,
        };
      }
      return ouvrir(url, cible, ...reste);
    };
    // « Imprimer / PDF » sur la page elle-même (bible, plan) : la page telle qu'elle s'imprime
    window.print = () => window.bureau.pdf(null, document.title).then(r => { if (r?.ok) toast('PDF enregistré.'); });
  },

  // ─── Projets partagés : glisser un fichier .continuite sur la fenêtre, ou double-clic (le menu passe par recevoirProjet) ───

  _estProjet: nom => /\.(continuite|lemenu)$/i.test(String(nom || '')),

  _glisserDeposer() {
    const fichierDe = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file');
    window.addEventListener('dragover', e => { if (fichierDe(e)) e.preventDefault(); });
    window.addEventListener('drop', async e => {
      if (!e.dataTransfer?.files?.length) return;
      // Les champs qui acceptent un fichier (images, scripts) gardent leur comportement
      if (e.target instanceof Element && e.target.closest('input[type=file], .pt-depot, [data-depot]')) return;
      e.preventDefault();
      const f = [...e.dataTransfer.files].find(x => this._estProjet(x.name));
      if (!f) { toast('Glisse ici un projet partagé (.continuite). Les scripts s\'importent depuis l\'onglet Épisodes.', 'info'); return; }
      await this._ouvrirOnglet('settings');
      await this._attendrePortable();
      await Portable.recevoir(f);
      document.getElementById('portable-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  },

  async _attendrePortable() {
    for (let i = 0; i < 60 && (typeof Portable === 'undefined' || !document.getElementById('portable-panel') || !Portable.tailles); i++) await new Promise(r => setTimeout(r, 50));
  },

  async recevoirProjet(j) {
    if (!j || j.error) { toast(j?.error || 'Ce fichier n\'a pas pu être lu.', 'error'); return; }
    await this._ouvrirOnglet('settings');
    await this._attendrePortable();
    Portable.recu = j;
    Portable.nom = j.existe ? `${j.nom} (importé)` : j.nom;
    Portable.mode = 'nouveau';
    Portable.rendre();
    document.getElementById('portable-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`« ${j.nom} » est prêt à être importé : vérifie puis valide.`, 'info');
  },

  // ─── Mode concentration : en plus de l'éditeur sur toute la fenêtre, le vrai plein écran ───

  _concentrationPleinEcran() {
    if (typeof Ecriture === 'undefined' || !Ecriture.basculerFocus) return;
    const original = Ecriture.basculerFocus.bind(Ecriture);
    Ecriture.basculerFocus = (...a) => {
      const r = original(...a);
      const actif = Boolean(document.querySelector('.ec-atelier.ec-focus'));
      if (actif && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      if (!actif && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      return r;
    };
    // Sortir du plein écran (Échap) quitte aussi le mode concentration
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && document.querySelector('.ec-atelier.ec-focus')) original();
    });
  },

  // ─── Config : sauvegarde automatique et mises à jour ───

  _carteReglages() {
    if (typeof Settings === 'undefined') return;
    const init = Settings.init.bind(Settings);
    Settings.init = async (...a) => {
      const r = await init(...a);
      const grille = document.querySelector('#tab-settings .settings-layout');
      if (grille && !document.getElementById('bureau-panel')) {
        const carte = document.createElement('div');
        carte.className = 'settings-card';
        carte.innerHTML = '<div class="settings-card-header">App de bureau</div><div class="settings-card-body" id="bureau-panel"><p class="an-note">Lecture…</p></div>';
        grille.prepend(carte);
      }
      this._rendreCarte();
      return r;
    };
  },

  async _rendreCarte(action, valeur) {
    const slot = document.getElementById('bureau-panel');
    if (!slot) return;
    [this.reglages, this.infos, this.verrouEtat, this.surveille] = await Promise.all([window.bureau.sauvegarde(action || 'lire', valeur), this.infos ? Promise.resolve(this.infos) : window.bureau.infos(), window.bureau.verrou('etat'),
      window.bureau.surveillance ? window.bureau.surveillance('lire', PROJET) : null]);
    const r = this.reglages || {};
    if (r.error) toast(r.error, 'error');
    const i = this.infos || {};
    const res = r.resultat;
    const quand = d => new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    const freq = [['non', 'Jamais'], ['jour', 'Une fois par jour'], ['fermeture', 'À chaque fermeture']];
    slot.innerHTML = `
      <h3 class="an-label">Sauvegarde automatique</h3>
      <p class="settings-card-subtitle">Chaque projet est enregistré en entier (textes, réglages, dessins, voix, cartes) dans un dossier de ton choix : iCloud, Dropbox, un disque externe… Un fichier .continuite se rouvre d'un double-clic.</p>
      <div class="bu-ligne">
        <span class="bu-dossier">${r.dossier ? esc(r.dossier) : '<em>Aucun dossier choisi</em>'}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Bureau._rendreCarte('choisir')">${r.dossier ? 'Changer de dossier' : 'Choisir un dossier'}</button>
        ${r.dossier ? '<button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._rendreCarte(\'montrer\')">Ouvrir</button>' : ''}
      </div>
      <div class="bu-ligne">
        <label class="an-label" for="bu-frequence">Quand</label>
        <select id="bu-frequence" ${r.dossier ? '' : 'disabled'} onchange="Bureau._rendreCarte('regler', { frequence: this.value })">${freq.map(([k, l]) => `<option value="${k}" ${r.frequence === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="an-label" for="bu-garder">Garder</label>
        <select id="bu-garder" ${r.dossier ? '' : 'disabled'} onchange="Bureau._rendreCarte('regler', { garder: Number(this.value) })">${[3, 5, 10, 20, 50].map(n => `<option value="${n}" ${r.garder === n ? 'selected' : ''}>${n} copies par projet</option>`).join('')}</select>
        <button type="button" class="btn btn-primary btn-sm" ${r.dossier && !r.enCours ? '' : 'disabled'} onclick="this.disabled = true; this.textContent = 'Sauvegarde…'; Bureau._rendreCarte('maintenant')">${r.enCours ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</button>
      </div>
      <p class="an-note">${res ? (res.ok
        ? `Dernière sauvegarde : ${quand(res.date)} · ${res.projets} projet(s) · ${octetsLisibles(res.octets)}${res.effaces ? ` · ${res.effaces} ancienne(s) copie(s) effacée(s)` : ''}.`
        : `<span class="ec-orange">Dernière sauvegarde incomplète (${quand(res.date)}) : ${esc((res.erreurs || []).join(' · '))}</span>`) : 'Aucune sauvegarde pour l\'instant.'}</p>
      ${r.dossier ? `<div class="bu-ligne">${r.chiffre
        ? `<span>🔒 Sauvegardes chiffrées. Le mot de passe est rangé dans le trousseau de cet ordinateur.</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._rendreCarte('chiffrer')">Changer le mot de passe</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="if (confirm('Les prochaines sauvegardes ne seront plus chiffrées. Celles déjà faites le restent. Continuer ?')) Bureau._rendreCarte('dechiffrer')">Ne plus chiffrer</button>`
        : `<button type="button" class="btn btn-secondary btn-sm" onclick="Bureau._rendreCarte('chiffrer')">Chiffrer les sauvegardes…</button>
          <span class="an-note">Utile si le dossier est dans un cloud : sans le mot de passe, personne ne peut ouvrir les fichiers. Perdu, il ne se retrouve pas.</span>`}</div>` : ''}
      ${r.dossier ? `<details class="bu-restaurer" ${this._restaurerOuvert ? 'open' : ''} ontoggle="Bureau._basculerRestaurer(this.open)">
        <summary class="an-label">Restaurer ou comparer une sauvegarde</summary>
        <div id="bu-liste">${this._htmlListe()}</div>
      </details>` : ''}
      ${this._htmlSurveillance()}
      ${this._htmlVerrou()}
      ${this._htmlRaccourcis()}
      ${this._htmlReglagesFichier()}
      <h3 class="an-label">Mises à jour</h3>
      <div class="bu-ligne">
        <span>Version ${esc(i.version || '?')}</span>
        <label class="interface-case"><input type="checkbox" ${i.majAuto ? 'checked' : ''} onchange="Bureau._majAuto(this.checked)"> Prévenir quand une nouvelle version sort</label>
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.bureau.maj('verifier')">Rechercher maintenant</button>
      </div>
      <p class="an-note">Une seule question à GitHub, au plus une fois par jour : quelle est la dernière version ? Rien n'est envoyé, rien ne s'installe sans ton accord, et le fichier téléchargé est vérifié avant d'être ouvert.</p>`;
  },

  // ─── Raccourcis clavier : on clique, on tape les touches ───

  _htmlRaccourcis() {
    if (!window.bureau.raccourcis) return '';
    const l = this.raccourcisListe;
    if (!l) { window.bureau.raccourcis('lire').then(r => { this.raccourcisListe = r?.liste || []; this._rendreCarte(); }); return ''; }
    const joli = t => !t ? '—' : (this.infos?.plateforme === 'darwin'
      ? t.replace(/CmdOrCtrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥').replace(/Ctrl\+/g, '⌃').replace(/Up|Down|Left|Right/g, k => ({ Up: '↑', Down: '↓', Left: '←', Right: '→' }[k]))
      : t.replace(/CmdOrCtrl/g, 'Ctrl'));
    return `<details class="bu-restaurer" ${this._raccourcisOuvert ? 'open' : ''} ontoggle="Bureau._raccourcisOuvert = this.open">
      <summary class="an-label">Raccourcis clavier</summary>
      <p class="an-note">Clique sur un raccourci, puis tape les touches voulues (avec ⌘ ou Ctrl, Alt, Maj). Échap annule.</p>
      <ul class="ec-liste bu-raccourcis">${l.map((r, i) => `<li><span>${esc(r.nom)}</span><span>
        <button type="button" class="btn btn-secondary btn-sm bu-touche" id="bu-touche-${i}" onclick="Bureau._capturer(${i})">${esc(this._capture === i ? 'Tape les touches…' : joli(r.touches))}</button>
        ${r.touches !== r.defaut ? `<button type="button" class="ec-lien" onclick="Bureau._raccourci('defaut', ${i})">d'origine (${esc(joli(r.defaut))})</button>` : ''}
        ${r.touches ? `<button type="button" class="ec-lien" onclick="Bureau._raccourci('regler', ${i}, '')">aucun</button>` : ''}</span></li>`).join('')}</ul>
      <button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._raccourci('defaut', -1)">Tout remettre d'origine</button>
    </details>`;
  },

  _capturer(i) {
    this._capture = i;
    this._rendreCarte();
    const ecouter = e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { fin(); return; }
      const touche = this._toucheDe(e);
      if (!touche) return;
      fin();
      this._raccourci('regler', i, touche);
    };
    const fin = () => { document.removeEventListener('keydown', ecouter, true); this._capture = null; this._rendreCarte(); };
    document.addEventListener('keydown', ecouter, true);
  },

  // Une touche du clavier en raccourci de menu Electron (« CmdOrCtrl+Shift+E »), ou rien si elle ne suffit pas
  _toucheDe(e) {
    const c = e.code || '';
    const noms = { Comma: ',', Period: '.', Semicolon: ';', Slash: '/', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Quote: "'",
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter' };
    const k = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F([1-9]|1[0-2])$/.test(c) ? c : noms[c];
    if (!k) return '';
    const mods = [(e.metaKey || e.ctrlKey) && 'CmdOrCtrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
    if (!mods.length && !/^F\d+$/.test(k)) return '';
    return [...mods, k].join('+');
  },

  async _raccourci(action, i, touches) {
    const r = this.raccourcisListe?.[i];
    const res = await window.bureau.raccourcis(action, action === 'defaut' ? { id: r ? r.id : '' } : { id: r.id, touches });
    if (res?.error) toast(res.error, 'error');
    if (res?.liste) this.raccourcisListe = res.liste;
    this._rendreCarte();
  },

  // ─── Les réglages dans un fichier : pour les retrouver sur un autre ordinateur ou dans un autre projet ───

  _htmlReglagesFichier() {
    return `<h3 class="an-label">Tes réglages dans un fichier</h3>
      <p class="settings-card-subtitle">L'apparence, l'accessibilité, les onglets, les objectifs, la mise en page, la feuille de style et les raccourcis du projet ouvert, dans un petit fichier. Aucun texte ni personnage dedans.</p>
      <div class="bu-ligne">
        <button type="button" class="btn btn-secondary btn-sm" onclick="Bureau.exporterReglages()">Enregistrer mes réglages…</button>
        <label class="btn btn-secondary btn-sm ct-fichier">Reprendre des réglages…<input type="file" accept=".json,application/json" onchange="Bureau.importerReglages(this.files[0]); this.value = ''"></label>
      </div>`;
  },

  REGLAGES_NOTES: ['interface', 'objectifs', 'mise-en-page', 'feuille-style', 'intrigues'],

  async exporterReglages() {
    const notes = {};
    const toutes = await api.get('analyse_notes').catch(() => ({}));
    for (const cle of this.REGLAGES_NOTES) if (toutes && typeof toutes[cle] === 'string' && toutes[cle]) notes[cle] = toutes[cle];
    if (!notes.interface && typeof Interface !== 'undefined') notes.interface = JSON.stringify(Interface.config);
    const raccourcis = window.bureau.raccourcis ? ((await window.bureau.raccourcis('lire'))?.liste || []).filter(r => r.touches !== r.defaut).map(r => ({ id: r.id, touches: r.touches })) : [];
    const fichier = { format: 'continuite-reglages', version: 1, cree_le: new Date().toISOString(), notes, raccourcis };
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(fichier, null, 2)], { type: 'application/json' }));
    lien.download = 'Réglages Continuité.json';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
  },

  async importerReglages(f) {
    if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch (e) { toast('Ce fichier n\'est pas un fichier de réglages.', 'error'); return; }
    if (!d || d.format !== 'continuite-reglages' || typeof d.notes !== 'object') { toast('Ce fichier n\'est pas un fichier de réglages de Continuité.', 'error'); return; }
    const notes = Object.entries(d.notes || {}).filter(([cle, v]) => this.REGLAGES_NOTES.includes(cle) && typeof v === 'string' && v.length < 500000);
    for (const [, v] of notes) { try { JSON.parse(v); } catch (e) { toast('Le fichier de réglages est abîmé.', 'error'); return; } }
    if (!confirm(`Reprendre ces réglages dans le projet ouvert ? (${notes.map(([c]) => c).join(', ') || 'rien'}${Array.isArray(d.raccourcis) && d.raccourcis.length ? ', raccourcis' : ''}) Tes textes ne changent pas.`)) return;
    for (const [cle, valeur] of notes) await api.put('analyse_notes', { cle, valeur });
    if (window.bureau.raccourcis && Array.isArray(d.raccourcis)) {
      for (const r of d.raccourcis.slice(0, 50)) if (r && typeof r.id === 'string' && typeof r.touches === 'string') await window.bureau.raccourcis('regler', { id: r.id, touches: r.touches });
    }
    toast('Réglages repris : l\'app se recharge.', 'success');
    setTimeout(() => location.reload(), 800);
  },

  // ─── Le dossier surveillé du projet ouvert ───

  _htmlSurveillance() {
    if (!window.bureau.surveillance) return '';
    const r = this.surveille || {};
    const quand = d => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const code = j => `S${j.saison}E${String(j.numero).padStart(2, '0')}`;
    const statut = { importe: 'importé', remplace: 'repris (ancien texte dans les Versions)', erreur: 'illisible' };
    return `<h3 class="an-label">Dossier surveillé</h3>
      <p class="settings-card-subtitle">Tu écris dans Final Draft, Word, Fountain, Montage… ? Choisis le dossier de tes scripts : quand un fichier change, l'app reprend son texte dans l'épisode. Le nom du fichier donne l'épisode (« S2E05 », « 2x05 » ou « Saison 2 épisode 5 »). L'ancien texte reste dans les Versions de l'épisode ; les fichiers « old », « copie » ou « ancien » sont laissés de côté. Au premier passage, seuls les épisodes encore vides sont remplis.</p>
      <div class="bu-ligne">
        <span class="bu-dossier">${r.dossier ? esc(r.dossier) : '<em>Aucun dossier surveillé pour ce projet</em>'}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Bureau._surveiller('choisir')">${r.dossier ? 'Changer' : 'Choisir un dossier'}</button>
        ${r.dossier ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._surveiller('maintenant')">Vérifier maintenant</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._surveiller('montrer')">Ouvrir</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._surveiller('retirer')">Arrêter</button>` : ''}
      </div>
      ${r.journal && r.journal.length ? `<ul class="ec-liste bu-sauvegardes">${r.journal.slice(0, 8).map(j => `<li><span><strong>${code(j)}</strong> · ${esc(j.nom)}</span><span class="an-note">${esc(statut[j.statut] || j.statut)}${j.erreur ? ` : ${esc(j.erreur)}` : ''} · ${esc(quand(j.date))}</span></li>`).join('')}</ul>` : ''}`;
  },

  async _surveiller(action) {
    if (action === 'choisir' || action === 'maintenant') toast(action === 'choisir' ? 'Choix du dossier…' : 'Vérification du dossier…', 'info');
    this.surveille = await window.bureau.surveillance(action, PROJET);
    if (action !== 'montrer') this._rendreCarte();
  },

  // Un script vient d'être repris depuis le dossier surveillé (par n'importe quelle fenêtre)
  _scriptRepris(ev) {
    if (!ev || (ev.projet || '') !== (PROJET || '')) return;
    const code = `S${ev.saison}E${String(ev.numero).padStart(2, '0')}`;
    if (ev.statut === 'erreur') { toast(`${code} : « ${ev.nom} » illisible (${ev.erreur})`, 'error'); return; }
    window.DataStore?.invalidateForMutation('upload');
    toast(ev.statut === 'remplace' ? `${code} repris depuis « ${ev.nom} » ; l'ancien texte est dans les Versions.` : `${code} importé depuis « ${ev.nom} ».`, 'success');
    if (document.getElementById('bureau-panel')) this._rendreCarte();
  },

  // ─── Restaurer : la liste des sauvegardes ; « Ouvrir » passe par l'aperçu d'import (remplacer, nouveau, comparer et fusionner) ───

  async _basculerRestaurer(ouvert) {
    this._restaurerOuvert = ouvert;
    if (!ouvert) return;
    const r = await window.bureau.sauvegarde('liste');
    this._liste = r?.liste || [];
    const slot = document.getElementById('bu-liste');
    if (slot) slot.innerHTML = this._htmlListe();
  },

  _htmlListe() {
    const l = this._liste;
    if (!l) return '<p class="an-note">Lecture du dossier…</p>';
    if (!l.length) return '<p class="an-note">Aucune sauvegarde dans ce dossier pour l\'instant.</p>';
    const quand = d => new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    return `<p class="an-note">« Ouvrir » montre la sauvegarde dans l'import, plus bas : tu choisis alors de la comparer et de fusionner avec le projet ouvert, de remplacer le projet, ou d'en faire un nouveau.</p>
      <ul class="ec-liste bu-sauvegardes">${l.slice(0, 100).map((x, i) => `<li><span>${x.chiffre ? '🔒 ' : ''}<strong>${esc(x.projet)}</strong> · ${esc(quand(x.date))}</span><span class="an-note">${octetsLisibles(x.taille)} <button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._ouvrirSauvegarde(${i})">Ouvrir</button></span></li>`).join('')}</ul>`;
  },

  async _ouvrirSauvegarde(i) {
    const x = this._liste?.[i];
    if (!x) return;
    const r = await window.bureau.sauvegarde('ouvrir', { fichier: x.fichier });
    if (r?.error) toast(r.error, 'error');
  },

  // ─── Le verrou : un mot de passe pour ouvrir l'app ───

  _htmlVerrou() {
    const v = this.verrouEtat || {};
    const minutes = [[0, 'Jamais'], [5, 'Après 5 minutes'], [15, 'Après 15 minutes'], [30, 'Après 30 minutes'], [60, 'Après 1 heure']];
    return `<h3 class="an-label">Mot de passe</h3>
      <p class="settings-card-subtitle">L'app demande ce mot de passe à l'ouverture. Ce n'est pas un chiffrement : les fichiers de tes projets restent lisibles sur le disque. Pour les protéger aussi, active FileVault (Mac) ou BitLocker (Windows). Un mot de passe oublié ne se retrouve pas : garde-le en lieu sûr.</p>
      ${v.actif ? `
        <div class="bu-ligne">
          <input id="bu-ancien" type="password" autocomplete="current-password" placeholder="Mot de passe actuel" aria-label="Mot de passe actuel">
          <input id="bu-nouveau" type="password" autocomplete="new-password" placeholder="Nouveau (laisser vide pour le garder)" aria-label="Nouveau mot de passe">
        </div>
        <div class="bu-ligne">
          <label class="an-label" for="bu-minutes">Verrouiller sans activité</label>
          <select id="bu-minutes">${minutes.map(([m, l]) => `<option value="${m}" ${v.minutes === m ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label class="interface-case"><input id="bu-veille" type="checkbox" ${v.veille ? 'checked' : ''}> Quand l'ordinateur se met en veille ou se verrouille</label>
        </div>
        <div class="bu-ligne">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Bureau._verrou('changer')">Enregistrer</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Bureau._verrou('retirer')">Retirer le mot de passe</button>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.bureau.verrou('verrouiller')">Verrouiller maintenant</button>
        </div>`
      : `<div class="bu-ligne">
          <input id="bu-nouveau" type="password" autocomplete="new-password" placeholder="Mot de passe (4 caractères au moins)" aria-label="Nouveau mot de passe">
          <input id="bu-confirme" type="password" autocomplete="new-password" placeholder="Le même, encore une fois" aria-label="Confirmer le mot de passe">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Bureau._verrou('activer')">Activer le mot de passe</button>
        </div>`}`;
  },

  async _verrou(action) {
    const val = id => document.getElementById(id)?.value ?? '';
    let demande;
    if (action === 'activer') {
      if (val('bu-nouveau') !== val('bu-confirme')) { toast('Les deux mots de passe ne sont pas les mêmes.', 'error'); return; }
      demande = { nouveau: val('bu-nouveau') };
    } else if (action === 'retirer') {
      if (!val('bu-ancien')) { toast('Écris le mot de passe actuel pour le retirer.', 'info'); document.getElementById('bu-ancien')?.focus(); return; }
      demande = { ancien: val('bu-ancien'), retirer: true };
    } else {
      demande = { ancien: val('bu-ancien'), nouveau: val('bu-nouveau') || undefined, minutes: Number(val('bu-minutes')), veille: Boolean(document.getElementById('bu-veille')?.checked) };
    }
    const r = await window.bureau.verrou('changer', demande);
    if (r?.error) { toast(r.error, 'error'); return; }
    toast(action === 'activer' ? 'Mot de passe activé : il sera demandé à la prochaine ouverture.' : action === 'retirer' ? 'Mot de passe retiré.' : 'Réglages du mot de passe enregistrés.');
    this._rendreCarte();
  },

  async _majAuto(actif) {
    const r = await window.bureau.maj('auto', actif);
    if (this.infos) this.infos.majAuto = r?.majAuto;
  },
};

// Chargé avant app.js : les ajouts sont en place avant que le premier onglet ne s'affiche
Bureau.init();
