// assets/js/interface.js — Titre de l'app, ordre et visibilité des menus

const INTERFACE_DEFAUT = {
  titre: '', titreVisible: true, ordreMenu: [], masquesMenu: [], ordreAnalyse: [], masquesAnalyse: [],
  ordreEcritureSerie: [], masquesEcritureSerie: [], ordreEcritureEpisode: [], masquesEcritureEpisode: [],
  theme: 'sombre', suivreSysteme: false, couleurs: { sombre: {}, clair: {} },
  ordreEpisodes: [], masquesEpisodes: ['intrigue_C'], taillesEpisodes: {}, couleursEpisodes: { sombre: {}, clair: {} }, intrigues: [],
};
const INTERFACE_COULEURS_INTRIGUES = ['#f08fb0', '#c9b8ff', '#9be38f', '#ff9f9f', '#7fe0d4', '#d4a5ff', '#ffd27f', '#8fd3f4'];
const INTERFACE_THEME_KEY = 'lemenu_theme';

// Simulation de chaque déficience (Machado, 2009) : sert à calculer la correction
const DALTONISME = {
  protanopie: { nom: 'Protanopie (rouge)', simulation: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], report: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]] },
  deuteranopie: { nom: 'Deutéranopie (vert)', simulation: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], report: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]] },
  tritanopie: { nom: 'Tritanopie (bleu)', simulation: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]], report: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]] },
};
const POLICES_PROPOSEES = ['OpenDyslexic', 'Atkinson Hyperlegible', 'Arial', 'Verdana', 'Helvetica', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Courier New'];
const ACCESSIBILITE_DEFAUT = { daltonisme: '', intensite: 100, zoom: 100, contraste: false, espacement: false, animations: false, focus: false, cibles: false, soulignes: false, police: '', policeTitres: '', edPolice: '', edTaille: 13, edInterligne: 1.6, edLargeur: '' };
// La largeur du texte dans le brouillon (le reste de la page ne bouge pas)
const EDITEUR_LARGEURS = [['', 'Toute la colonne'], ['80ch', 'Large'], ['68ch', 'Moyenne'], ['58ch', 'Étroite (comme une page)']];

// [variable, libellé, valeur en sombre, valeur en clair]
const INTERFACE_COULEURS = [
  ['accent', 'Couleur principale', '#67cbac', '#15705a'],
  ['accent4', 'Couleur secondaire', '#4d9fff', '#1660c0'],
  ['accent2', 'Alertes', '#ff4d4d', '#bd1f1f'],
  ['bg', 'Fond', '#0a0a0a', '#f6f4ef'],
  ['bg2', 'Panneaux', '#111111', '#ffffff'],
  ['text', 'Texte', '#e8e8e0', '#1c1c1a'],
];

const Interface = {
  config: { ...INTERFACE_DEFAUT },

  async charger() {
    try {
      const notes = await api.get('analyse_notes');
      if (notes.interface) this.config = { ...INTERFACE_DEFAUT, ...JSON.parse(notes.interface) };
      this.config.couleurs = { sombre: {}, clair: {}, ...this.config.couleurs };
      this.config.couleursEpisodes = { sombre: {}, clair: {}, ...this.config.couleursEpisodes };
      this.config.accessibilite = { ...ACCESSIBILITE_DEFAUT, ...this.config.accessibilite };
      this._migrerVuesEcriture();
    } catch (e) {
      console.error('Réglages de l\'interface illisibles', e);
    }
    this.appliquer();
  },

  // Les anciennes vues regroupées reprennent la place de leur vue d'arrivée
  _migrerVuesEcriture() {
    const suite = { bord: 'reprendre', echos: 'memoire', fils: 'memoire', continuite: 'memoire', chronologie: 'plan' };
    ['EcritureSerie', 'EcritureEpisode'].forEach(groupe => {
      this.config[`ordre${groupe}`] = [...new Set(this.config[`ordre${groupe}`].map(k => suite[k] || k))];
      this.config[`masques${groupe}`] = this.config[`masques${groupe}`].map(k => (k === 'bord' ? 'reprendre' : k)).filter(k => !suite[k]);
    });
  },

  async enregistrer() {
    const res = await api.put('analyse_notes', { cle: 'interface', valeur: JSON.stringify(this.config) });
    if (res.error) toast(res.error, 'error');
  },

  // Applique un ordre enregistré ; les éléments ajoutés depuis restent à leur place, à la fin
  _ordonner(elements, ordre, cle) {
    const rang = id => {
      const i = ordre.indexOf(id);
      return i < 0 ? ordre.length : i;
    };
    return elements.map((el, i) => [el, i]).sort((a, b) => rang(cle(a[0])) - rang(cle(b[0])) || a[1] - b[1]).map(x => x[0]);
  },

  entreesMenu() {
    const boutons = [...document.querySelectorAll('#main-nav .nav-btn')];
    return this._ordonner(boutons, this.config.ordreMenu, b => b.dataset.tab);
  },

  vuesAnalyse() {
    return this._ordonner(ANALYSE_VUES, this.config.ordreAnalyse, v => v[0]);
  },

  vuesAnalyseVisibles() {
    return this.vuesAnalyse().filter(([k]) => !this.config.masquesAnalyse.includes(k));
  },

  vuesEcriture(groupe) {
    return this._ordonner(ECRITURE_VUES[groupe === 'EcritureEpisode' ? 'episode' : 'serie'], this.config[`ordre${groupe}`], v => v[0]);
  },

  vuesEcritureVisibles(portee) {
    const groupe = portee === 'episode' ? 'EcritureEpisode' : 'EcritureSerie';
    return this.vuesEcriture(groupe).filter(([k]) => !this.config[`masques${groupe}`].includes(k));
  },

  // Noir ou blanc, selon ce qui se lit le mieux sur cette couleur
  _texteSur(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#0a0a0a' : '#ffffff';
  },

  // « Système » : le thème suit celui de macOS, Windows ou Linux, et bascule avec lui
  _themeSysteme() {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre';
  },

  _ecouterSysteme() {
    if (this._ecouteSysteme || !window.matchMedia) return;
    this._ecouteSysteme = true;
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (!this.config.suivreSysteme) return;
      this.config.theme = this._themeSysteme();
      this.appliquerTheme();
      if (document.getElementById('interface-panel')) this.rendrePanel();
    });
  },

  appliquerTheme() {
    const racine = document.documentElement;
    if (this.config.suivreSysteme) this.config.theme = this._themeSysteme();
    this._ecouterSysteme();
    const { theme, couleurs } = this.config;
    const choix = couleurs[theme] || {};
    racine.dataset.theme = theme;
    [...INTERFACE_COULEURS.map(c => c[0]), 'accent3', 'bg3', 'bg4', 'border', 'border2', 'text2', 'text3', 'creux', 'sur-accent'].forEach(v => racine.style.removeProperty(`--${v}`));
    Object.entries(choix).forEach(([v, c]) => racine.style.setProperty(`--${v}`, c));
    if (choix.accent) {
      racine.style.setProperty('--accent3', choix.accent);
      racine.style.setProperty('--sur-accent', this._texteSur(choix.accent));
    }
    // Les nuances intermédiaires suivent le fond, les panneaux et le texte choisis
    if (choix.bg || choix.bg2 || choix.text) {
      const melange = (part, base = 'var(--bg2)') => `color-mix(in srgb, var(--text) ${part}%, ${base})`;
      Object.entries({ bg3: melange(6), bg4: melange(10), border: melange(14), border2: melange(20), text2: melange(60, 'var(--bg)'), text3: melange(40, 'var(--bg)'), creux: melange(4, 'var(--bg)') })
        .forEach(([v, c]) => racine.style.setProperty(`--${v}`, c));
    }
    this.appliquerAccessibilite();
    try { localStorage.setItem(cleProjet(INTERFACE_THEME_KEY), JSON.stringify({ theme, couleurs, accessibilite: this.config.accessibilite })); } catch (e) {}
  },

  // Reporte les couleurs mal perçues vers celles qui le sont (méthode de Fidaner)
  _matriceDaltonisme(type, intensite) {
    const { simulation: S, report: E } = DALTONISME[type];
    const identite = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const ecart = identite.map((ligne, i) => ligne.map((v, j) => v - S[i][j]));
    const correction = identite.map((ligne, i) => ligne.map((v, j) => v + E[i].reduce((a, e, k) => a + e * ecart[k][j], 0)));
    const t = intensite / 100;
    const m = correction.map((ligne, i) => ligne.map((v, j) => identite[i][j] + t * (v - identite[i][j])));
    return m.map(l => [...l, 0, 0].join(' ')).join(' ') + ' 0 0 0 1 0';
  },

  appliquerAccessibilite() {
    const a = { ...ACCESSIBILITE_DEFAUT, ...this.config.accessibilite };
    const racine = document.documentElement;
    ['contraste', 'espacement', 'animations', 'focus', 'cibles', 'soulignes'].forEach(o => racine.classList.toggle(`a11y-${o}`, Boolean(a[o])));
    racine.style.setProperty('--zoom-page', a.zoom / 100);

    let svg = document.getElementById('filtre-daltonisme-svg');
    if (a.daltonisme && DALTONISME[a.daltonisme]) {
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'filtre-daltonisme-svg';
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;width:0;height:0';
        svg.innerHTML = '<filter id="filtre-daltonisme" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>';
        document.documentElement.appendChild(svg);
      }
      svg.querySelector('feColorMatrix').setAttribute('values', this._matriceDaltonisme(a.daltonisme, a.intensite));
    }
    racine.classList.toggle('a11y-daltonisme', Boolean(a.daltonisme && DALTONISME[a.daltonisme]));
    racine.classList.toggle('a11y-gris', a.daltonisme === 'achromatopsie');

    const pile = nom => this._pilePolice(nom);
    racine.classList.toggle('a11y-police', Boolean(a.police));
    racine.classList.toggle('a11y-police-titres', Boolean(a.policeTitres));
    if (a.police) racine.style.setProperty('--police-choisie', pile(a.police));
    if (a.policeTitres) racine.style.setProperty('--police-titres', pile(a.policeTitres));
    // L'éditeur du brouillon : sa police, sa taille, son interligne et la largeur du texte
    const taille = Math.min(24, Math.max(11, Number(a.edTaille) || 13));
    const interligne = Math.min(2.4, Math.max(1.1, Number(a.edInterligne) || 1.6));
    racine.style.setProperty('--ed-police', a.edPolice ? pile(a.edPolice) : 'var(--font-mono)');
    racine.style.setProperty('--ed-taille', `${taille}px`);
    racine.style.setProperty('--ed-interligne', String(interligne));
    if (EDITEUR_LARGEURS.some(([k]) => k && k === a.edLargeur)) racine.style.setProperty('--ed-largeur', a.edLargeur);
    else racine.style.removeProperty('--ed-largeur');
    if ([a.police, a.policeTitres, a.edPolice].some(p => ['Atkinson Hyperlegible', 'OpenDyslexic'].includes(p))) this._chargerPolicesWeb();
  },

  _pilePolice(nom) {
    return nom ? `"${String(nom).replace(/"/g, '')}", sans-serif` : 'var(--font-mono)';
  },

  _chargerPolicesWeb() {
    if (document.getElementById('police-atkinson')) return;
    const lien = document.createElement('link');
    lien.id = 'police-atkinson';
    lien.rel = 'stylesheet';
    lien.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';
    document.head.appendChild(lien);
    const dyslexie = document.createElement('style');
    dyslexie.textContent = [400, 700].map(g => `@font-face { font-family: "OpenDyslexic"; font-weight: ${g}; font-display: swap; src: url("https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic@5.0.0/files/opendyslexic-latin-${g}-normal.woff2") format("woff2"); }`).join('\n');
    document.head.appendChild(dyslexie);
  },

  // ─── Sélecteur de police ─────────────────────────────────────────────────

  _champPolice(cle) {
    return document.querySelector(`.police-champ[data-cle="${cle}"]`);
  },

  ouvrirPolices(cle) {
    const champ = this._champPolice(cle);
    const menu = champ.querySelector('.police-menu');
    const dejaOuvert = !menu.hidden;
    this.fermerPolices();
    if (dejaOuvert) return;
    this._chargerPolicesWeb();
    menu.hidden = false;
    champ.querySelector('.police-bouton').setAttribute('aria-expanded', 'true');
    this.filtrerPolices(cle, '');
    menu.querySelector('input').focus();
    this._fermerAuClic = e => { if (!e.target.closest('.police-champ')) this.fermerPolices(); };
    document.addEventListener('mousedown', this._fermerAuClic);
  },

  fermerPolices() {
    document.querySelectorAll('.police-menu').forEach(m => { m.hidden = true; });
    document.querySelectorAll('.police-bouton').forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (this._fermerAuClic) document.removeEventListener('mousedown', this._fermerAuClic);
    this._fermerAuClic = null;
  },

  filtrerPolices(cle, recherche) {
    const champ = this._champPolice(cle);
    const q = recherche.trim();
    const actuelle = this.config.accessibilite?.[cle] || '';
    const garde = nom => nom.toLowerCase().includes(q.toLowerCase());
    const ligne = (nom, libelle = nom) => `<button type="button" role="option" class="police-option" aria-selected="${nom === actuelle}" data-police="${esc(nom)}" style="font-family:${esc(this._pilePolice(nom))}" onclick="Interface.choisirPolice('${cle}', this.dataset.police)">${esc(libelle)}${nom === actuelle ? '<span aria-hidden="true">✓</span>' : ''}</button>`;
    const groupe = (titre, liste) => (liste.length ? `<div class="police-groupe">${titre}</div>${liste.map(p => ligne(p)).join('')}` : '');
    const proposees = POLICES_PROPOSEES.filter(garde);
    const ordinateur = (this.policesOrdinateur || []).filter(p => garde(p) && !POLICES_PROPOSEES.includes(p));
    const exacte = [...POLICES_PROPOSEES, ...(this.policesOrdinateur || [])].some(p => p.toLowerCase() === q.toLowerCase());
    champ.querySelector('.police-liste').innerHTML = [
      !q ? ligne('', 'Police d\'origine') : '',
      groupe('Proposées', proposees),
      groupe('Sur cet ordinateur', ordinateur.slice(0, 300)),
      q && !exacte ? ligne(q, `Utiliser « ${q} »`) : '',
    ].join('');
    this._optionActive = -1;
  },

  clavierPolices(event, cle) {
    const options = [...this._champPolice(cle).querySelectorAll('.police-option')];
    if (event.key === 'Escape') {
      this.fermerPolices();
      this._champPolice(cle).querySelector('.police-bouton').focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!options.length) return;
      const sens = event.key === 'ArrowDown' ? 1 : -1;
      this._optionActive = (this._optionActive + sens + options.length) % options.length;
      options.forEach((o, i) => o.classList.toggle('active', i === this._optionActive));
      options[this._optionActive].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choix = options[Math.max(this._optionActive, 0)];
      if (choix) this.choisirPolice(cle, choix.dataset.police);
    }
  },

  choisirPolice(cle, nom) {
    this.fermerPolices();
    return this.setAccessibilite(cle, nom);
  },

  // ─── Accessibilité et typographie ────────────────────────────────────────

  rendreAccessibilite() {
    const panel = document.getElementById('accessibilite-panel');
    if (!panel) return;
    const a = { ...ACCESSIBILITE_DEFAUT, ...this.config.accessibilite };
    const types = [['', 'Aucune correction'], ...Object.entries(DALTONISME).map(([k, v]) => [k, v.nom]), ['achromatopsie', 'Achromatopsie (aucune couleur)']];
    const options = [
      ['contraste', 'Contraste renforcé', 'Textes secondaires plus foncés ou plus clairs, bordures plus marquées.'],
      ['espacement', 'Texte plus espacé', 'Plus d\'air entre les lettres, les mots et les lignes.'],
      ['cibles', 'Boutons plus grands', 'Zones de clic agrandies.'],
      ['soulignes', 'Liens soulignés', 'Pour les repérer sans passer par la couleur.'],
      ['focus', 'Focus clavier très visible', 'Grand contour sur l\'élément actif.'],
      ['animations', 'Réduire les animations', 'Retire les transitions et les effets de mouvement.'],
    ];
    const policeSelect = (cle, libelle) => `
      <div class="police-champ" data-cle="${cle}">
        <span class="settings-duration-title" id="police-titre-${cle}">${libelle}</span>
        <button type="button" class="police-bouton" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="police-titre-${cle}" style="font-family:${esc(this._pilePolice(a[cle]))}" onclick="Interface.ouvrirPolices('${cle}')">
          <span>${esc(a[cle] || 'Police d\'origine')}</span><span aria-hidden="true">▾</span>
        </button>
        <div class="police-menu" hidden>
          <input type="text" aria-label="Chercher une police" placeholder="Chercher ou taper une police…" oninput="Interface.filtrerPolices('${cle}', this.value)" onkeydown="Interface.clavierPolices(event, '${cle}')">
          <div class="police-liste" role="listbox" aria-label="${libelle}"></div>
        </div>
      </div>`;

    panel.innerHTML = `
      <div class="a11y-groupe">
        <div class="settings-duration-title">Vision des couleurs</div>
        <div class="interface-ligne">
          <select aria-label="Type de daltonisme" onchange="Interface.setAccessibilite('daltonisme', this.value)">
            ${types.map(([k, l]) => `<option value="${k}" ${a.daltonisme === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          ${DALTONISME[a.daltonisme] ? `<label class="interface-case" for="a11y-intensite">Intensité <strong>${a.intensite} %</strong></label>
            <input id="a11y-intensite" type="range" min="10" max="100" step="10" value="${a.intensite}" onchange="Interface.setAccessibilite('intensite', Number(this.value))">` : ''}
        </div>
        <p class="an-note">Les couleurs sont ajustées sur tout le site, y compris tes saisons et les graphiques.${a.daltonisme === 'achromatopsie' ? ' Sans couleur, tout passe en niveaux de gris et le contraste aide à distinguer les éléments.' : ''}</p>
      </div>
      <div class="a11y-groupe">
        <label class="settings-duration-title" for="a11y-zoom">Taille de tout le site : <strong>${a.zoom} %</strong></label>
        <input id="a11y-zoom" type="range" min="80" max="200" step="10" value="${a.zoom}" onchange="Interface.setAccessibilite('zoom', Number(this.value))">
      </div>
      <div class="a11y-options">
        ${options.map(([k, l, d]) => `<label class="interface-case a11y-option"><input type="checkbox" ${a[k] ? 'checked' : ''} onchange="Interface.setAccessibilite('${k}', this.checked)"> <span>${l}<small class="an-note">${d}</small></span></label>`).join('')}
      </div>
      <div class="a11y-groupe">
        <div class="settings-duration-title">Typographie de tout le site</div>
        <div class="a11y-polices">
          ${policeSelect('police', 'Texte')}
          ${policeSelect('policeTitres', 'Titres')}
        </div>
        <div class="interface-ligne">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Interface.chargerPolices()">Utiliser les polices de mon ordinateur</button>
          <span class="an-note">${this.policesOrdinateur ? `${this.policesOrdinateur.length} polices ajoutées aux deux listes.` : 'OpenDyslexic est conçue pour la dyslexie, Atkinson Hyperlegible pour la basse vision. Tu peux aussi taper le nom d\'une police installée.'}</span>
        </div>
      </div>
      <div class="a11y-groupe">
        <div class="settings-duration-title">L'éditeur du brouillon</div>
        <div class="a11y-polices">${policeSelect('edPolice', 'Police du brouillon')}</div>
        <div class="interface-ligne">
          <label class="interface-case" for="ed-taille">Taille <strong>${Number(a.edTaille) || 13} px</strong></label>
          <input id="ed-taille" type="range" min="11" max="24" step="1" value="${Number(a.edTaille) || 13}" onchange="Interface.setAccessibilite('edTaille', Number(this.value))">
          <label class="interface-case" for="ed-interligne">Interligne <strong>${Number(a.edInterligne) || 1.6}</strong></label>
          <input id="ed-interligne" type="range" min="1.1" max="2.4" step="0.1" value="${Number(a.edInterligne) || 1.6}" onchange="Interface.setAccessibilite('edInterligne', Number(this.value))">
          <label class="interface-case" for="ed-largeur">Largeur du texte</label>
          <select id="ed-largeur" onchange="Interface.setAccessibilite('edLargeur', this.value)">${EDITEUR_LARGEURS.map(([k, l]) => `<option value="${k}" ${a.edLargeur === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <p class="an-note">Seulement pour écrire : les PDF et les exports gardent leur propre mise en page.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="Interface.reinitialiserAccessibilite()">↺ Réinitialiser l'accessibilité et la typo</button>
    `;
  },

  setAccessibilite(cle, valeur) {
    this.config.accessibilite = { ...ACCESSIBILITE_DEFAUT, ...this.config.accessibilite, [cle]: valeur };
    this.appliquerTheme();
    this.rendreAccessibilite();
    return this.enregistrer();
  },

  async chargerPolices() {
    if (!window.queryLocalFonts) {
      toast('Ce navigateur ne peut pas lister les polices : tape directement le nom de la police.', 'info');
      return;
    }
    try {
      const polices = await window.queryLocalFonts();
      this.policesOrdinateur = [...new Set(polices.map(p => p.family))].sort((a, b) => a.localeCompare(b, 'fr'));
      this.rendreAccessibilite();
    } catch (e) {
      toast('Autorisation refusée : tu peux taper le nom de la police.', 'error');
    }
  },

  reinitialiserAccessibilite() {
    if (!confirm('Revenir à l\'accessibilité et à la typo de départ ?')) return;
    this.config.accessibilite = { ...ACCESSIBILITE_DEFAUT };
    this.appliquerTheme();
    this.rendreAccessibilite();
    return this.enregistrer();
  },

  appliquer() {
    const c = this.config;
    this.appliquerTheme();
    document.querySelector('.brand-name').textContent = c.titre || NOM_APP;
    document.querySelector('.brand-name').hidden = !c.titreVisible;
    document.title = c.titre || NOM_APP;

    const nav = document.getElementById('main-nav');
    this.entreesMenu().forEach(bouton => {
      bouton.style.display = c.masquesMenu.includes(bouton.dataset.tab) ? 'none' : '';
      nav.appendChild(bouton);
    });
  },

  // Sans onglet visible actif, on ouvre le premier du menu
  ongletVisible(tab) {
    if (!this.config.masquesMenu.includes(tab)) return tab;
    return this.entreesMenu().find(b => !this.config.masquesMenu.includes(b.dataset.tab))?.dataset.tab || 'settings';
  },

  // ─── Outil de Config ─────────────────────────────────────────────────────

  rendrePanel() {
    this.rendreAccessibilite();
    const panel = document.getElementById('interface-panel');
    if (!panel) return;
    const c = this.config;
    const menu = this.entreesMenu().map(b => [b.dataset.tab, b.textContent.trim().replace(/\s+/g, ' ')]);

    const couleurs = c.couleurs[c.theme] || {};
    const colonne = c.theme === 'clair' ? 3 : 2;

    panel.innerHTML = `
      <div class="interface-titre">
        <div class="settings-duration-title">Thème</div>
        <div class="interface-ligne">
          ${[['sombre', 'Sombre'], ['clair', 'Clair'], ['systeme', 'Système']].map(([k, l]) => {
            const actif = k === 'systeme' ? Boolean(c.suivreSysteme) : !c.suivreSysteme && c.theme === k;
            return `<button type="button" class="an-choix ${actif ? 'actif' : ''}" aria-pressed="${actif}" onclick="Interface.setTheme('${k}')">${l}</button>`;
          }).join('')}
        </div>
        <div class="interface-couleurs">
          ${INTERFACE_COULEURS.map(ligne => `
            <label class="interface-couleur"><input type="color" value="${couleurs[ligne[0]] || ligne[colonne]}" oninput="Interface.setCouleur('${ligne[0]}', this.value)" onchange="Interface.enregistrer()"> ${ligne[1]}</label>
          `).join('')}
          <button type="button" class="btn btn-secondary btn-sm" onclick="Interface.couleursDefaut()">↺ Réinitialiser les couleurs</button>
        </div>
      </div>
      <div class="interface-titre">
        <label class="settings-duration-title" for="interface-nom">Nom en haut de l'app</label>
        <div class="interface-ligne">
          <input id="interface-nom" type="text" value="${esc(c.titre)}" oninput="Interface.setTitre(this.value)" onchange="Interface.enregistrer()">
          <label class="interface-case"><input type="checkbox" ${c.titreVisible ? 'checked' : ''} onchange="Interface.setTitreVisible(this.checked)"> Afficher</label>
        </div>
      </div>
      <div class="interface-listes">
        ${this._liste('Menu du haut', menu, 'Menu')}
        ${this._liste('Liste de l\'Analyse', this.vuesAnalyse(), 'Analyse')}
        ${this._liste('Écriture : série et saisons', this.vuesEcriture('EcritureSerie'), 'EcritureSerie')}
        ${this._liste('Écriture : un épisode', this.vuesEcriture('EcritureEpisode'), 'EcritureEpisode')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="Interface.reinitialiser()">Réinitialiser</button>
    `;
  },

  _liste(titre, entrees, groupe) {
    const masques = this.config[`masques${groupe}`];
    return `
      <div>
        <div class="settings-duration-title">${titre}</div>
        ${entrees.map(([id, nom], i) => {
          const fixe = groupe === 'Menu' && id === 'settings';
          return `
            <div class="interface-entree" draggable="true" data-groupe="${groupe}" data-id="${id}"
              ondragstart="Interface.debutGlisser(event, this)" ondragover="Interface.survol(event, this)"
              ondragleave="this.classList.remove('avant', 'apres')" ondrop="Interface.deposer(event, this)" ondragend="Interface.finGlisser()">
              <span class="interface-poignee" aria-hidden="true">⠿</span>
              <label class="interface-case"><input type="checkbox" ${masques.includes(id) ? '' : 'checked'} ${fixe ? 'disabled title="Config reste toujours visible"' : ''} onchange="Interface.basculer('${groupe}', '${id}', this.checked)"> ${esc(nom)}</label>
              <div>
                <button type="button" class="btn btn-ghost btn-sm" aria-label="Monter ${esc(nom)}" ${i === 0 ? 'disabled' : ''} onclick="Interface.deplacer('${groupe}', '${id}', -1)">▲</button>
                <button type="button" class="btn btn-ghost btn-sm" aria-label="Descendre ${esc(nom)}" ${i === entrees.length - 1 ? 'disabled' : ''} onclick="Interface.deplacer('${groupe}', '${id}', 1)">▼</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  setTheme(theme) {
    this.config.suivreSysteme = theme === 'systeme';
    this.config.theme = theme === 'systeme' ? this._themeSysteme() : theme;
    this.appliquer();
    this.rendrePanel();
    return this.enregistrer();
  },

  setCouleur(variable, valeur) {
    this.config.couleurs[this.config.theme][variable] = valeur;
    this.appliquerTheme();
  },

  couleursDefaut() {
    if (!confirm('Revenir aux couleurs de départ, en sombre et en clair ?')) return;
    this.config.couleurs = { sombre: {}, clair: {} };
    this.appliquer();
    this.rendrePanel();
    return this.enregistrer();
  },

  setTitre(valeur) {
    this.config.titre = valeur;
    this.appliquer();
  },

  setTitreVisible(visible) {
    this.config.titreVisible = visible;
    this.appliquer();
    return this.enregistrer();
  },

  basculer(groupe, id, visible) {
    const cle = `masques${groupe}`;
    this.config[cle] = visible ? this.config[cle].filter(x => x !== id) : [...this.config[cle], id];
    if (groupe === 'Episodes') return this._tableauChange();
    this.appliquer();
    return this.enregistrer();
  },

  deplacer(groupe, id, sens) {
    const ids = this._idsGroupe(groupe);
    const i = ids.indexOf(id);
    [ids[i], ids[i + sens]] = [ids[i + sens], ids[i]];
    this.config[`ordre${groupe}`] = ids;
    if (groupe === 'Episodes') return this._tableauChange();
    this.appliquer();
    this.rendrePanel();
    return this.enregistrer();
  },

  _idsGroupe(groupe) {
    if (groupe === 'Episodes') return Episodes.colonnes().map(c => c.k);
    if (groupe.startsWith('Ecriture')) return this.vuesEcriture(groupe).map(v => v[0]);
    return groupe === 'Menu' ? this.entreesMenu().map(b => b.dataset.tab) : this.vuesAnalyse().map(v => v[0]);
  },

  // ─── Tableau Épisodes ────────────────────────────────────────────────────

  couleursIntrigues() {
    const couleurs = { A: '#67cbac', B: '#ffb454', C: '#4d9fff' };
    this.config.intrigues.forEach((l, i) => { couleurs[l] = INTERFACE_COULEURS_INTRIGUES[i % INTERFACE_COULEURS_INTRIGUES.length]; });
    return couleurs;
  },

  // Une couleur par thème : un texte clair choisi en sombre serait illisible en clair
  couleursColonnes() {
    return this.config.couleursEpisodes[this.config.theme];
  },

  _champCouleur(cle, nom) {
    const couleur = this.couleursColonnes()[cle];
    const defaut = this.config.theme === 'clair' ? '#2e2e2a' : '#b8b8b8';
    return `
      <input type="color" class="colonne-couleur" aria-label="Couleur du texte : ${esc(nom)}" value="${couleur || defaut}" oninput="Interface.setCouleurColonne('${cle}', this.value)" onchange="Interface.validerCouleurColonne()">
      <button type="button" class="an-mot-masquer" title="Couleur par défaut" aria-label="Couleur par défaut : ${esc(nom)}" style="visibility:${couleur ? 'visible' : 'hidden'}" onclick="Interface.effacerCouleurColonne('${cle}')">↺</button>
    `;
  },

  setCouleurColonne(cle, valeur) {
    this.couleursColonnes()[cle] = valeur;
    const style = document.getElementById('episodes-style');
    if (style) style.textContent = Episodes._styleTailles();
  },

  validerCouleurColonne() {
    this.rendreColonnes();
    return this.enregistrer();
  },

  effacerCouleurColonne(cle) {
    delete this.couleursColonnes()[cle];
    return this._tableauChange();
  },

  ouvrirColonnes() {
    modal.open('<div id="episodes-colonnes"></div>');
    this.rendreColonnes();
  },

  rendreColonnes() {
    const panel = document.getElementById('episodes-colonnes');
    if (!panel) return;
    const c = this.config;
    const colonnes = Episodes.colonnes();
    const derniere = c.intrigues[c.intrigues.length - 1] || (c.masquesEpisodes.includes('intrigue_C') ? null : 'C');
    panel.innerHTML = `
      <h2 class="an-titre">Personnaliser le tableau</h2>
      <p class="an-note">Coche, glisse et règle chaque colonne. Une taille vide ou ↺ garde la valeur générale. Les couleurs de texte sont propres à chaque thème.</p>
      <div class="interface-ligne">
        <label class="settings-duration-title" for="col-taille-generale">Taille générale du texte (px)</label>
        <input id="col-taille-generale" class="an-nombre" type="number" min="4" max="24" step="0.5" placeholder="6.5" value="${c.taillesEpisodes['*'] || ''}" onchange="Interface.setTaille('*', this.value)">
        <span class="settings-duration-title">Couleur générale du texte</span>
        ${this._champCouleur('*', 'tout le tableau')}
      </div>
      <div class="interface-ligne">
        <button type="button" class="btn btn-secondary btn-sm" onclick="Interface.ajouterIntrigue()">+ Ajouter une intrigue</button>
        ${derniere ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Interface.retirerIntrigue()">Retirer l'intrigue ${derniere}</button>` : ''}
      </div>
      <div class="colonnes-liste">
        ${colonnes.map((col, i) => `
          <div class="interface-entree" draggable="true" data-groupe="Episodes" data-id="${col.k}"
            ondragstart="Interface.debutGlisser(event, this)" ondragover="Interface.survol(event, this)"
            ondragleave="this.classList.remove('avant', 'apres')" ondrop="Interface.deposer(event, this)" ondragend="Interface.finGlisser()">
            <span class="interface-poignee" aria-hidden="true">⠿</span>
            <label class="interface-case"><input type="checkbox" ${c.masquesEpisodes.includes(col.k) ? '' : 'checked'} onchange="Interface.basculer('Episodes', '${col.k}', this.checked)"> ${esc(col.nom)}</label>
            <input class="an-nombre" type="number" min="4" max="40" step="0.5" aria-label="Taille de ${esc(col.nom)}" placeholder="px" value="${c.taillesEpisodes[col.k] || ''}" onchange="Interface.setTaille('${col.k}', this.value)">
            ${this._champCouleur(col.k, col.nom)}
            <div>
              <button type="button" class="btn btn-ghost btn-sm" aria-label="Monter ${esc(col.nom)}" ${i === 0 ? 'disabled' : ''} onclick="Interface.deplacer('Episodes', '${col.k}', -1)">▲</button>
              <button type="button" class="btn btn-ghost btn-sm" aria-label="Descendre ${esc(col.nom)}" ${i === colonnes.length - 1 ? 'disabled' : ''} onclick="Interface.deplacer('Episodes', '${col.k}', 1)">▼</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="Interface.reinitialiserColonnes()">Tableau d'origine</button>
    `;
  },

  _tableauChange() {
    Episodes.render();
    this.rendreColonnes();
    return this.enregistrer();
  },

  setTaille(colonne, valeur) {
    const px = parseFloat(valeur);
    if (px > 0) this.config.taillesEpisodes[colonne] = px;
    else delete this.config.taillesEpisodes[colonne];
    return this._tableauChange();
  },

  ajouterIntrigue() {
    const c = this.config;
    if (c.masquesEpisodes.includes('intrigue_C')) {
      c.masquesEpisodes = c.masquesEpisodes.filter(x => x !== 'intrigue_C');
    } else {
      const suivante = String.fromCharCode(68 + c.intrigues.length);
      if (suivante > 'Z') return;
      c.intrigues = [...c.intrigues, suivante];
    }
    return this._tableauChange();
  },

  // Le texte déjà saisi reste en base : il revient si l'intrigue est rajoutée
  retirerIntrigue() {
    const c = this.config;
    if (c.intrigues.length) c.intrigues = c.intrigues.slice(0, -1);
    else c.masquesEpisodes = [...c.masquesEpisodes, 'intrigue_C'];
    return this._tableauChange();
  },

  reinitialiserColonnes() {
    if (!confirm('Revenir au tableau d\'origine ? Les textes des intrigues restent enregistrés.')) return;
    Object.assign(this.config, { ordreEpisodes: [], masquesEpisodes: ['intrigue_C'], taillesEpisodes: {}, couleursEpisodes: { sombre: {}, clair: {} }, intrigues: [] });
    return this._tableauChange();
  },

  debutGlisser(event, ligne) {
    this._glisse = { groupe: ligne.dataset.groupe, id: ligne.dataset.id };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', ligne.dataset.id);
    ligne.classList.add('glisse');
  },

  _dessous(event, ligne) {
    const zone = ligne.getBoundingClientRect();
    return event.clientY > zone.top + zone.height / 2;
  },

  survol(event, ligne) {
    if (this._glisse?.groupe !== ligne.dataset.groupe || this._glisse.id === ligne.dataset.id) return;
    event.preventDefault();
    const dessous = this._dessous(event, ligne);
    ligne.classList.toggle('apres', dessous);
    ligne.classList.toggle('avant', !dessous);
  },

  deposer(event, ligne) {
    if (this._glisse?.groupe !== ligne.dataset.groupe || this._glisse.id === ligne.dataset.id) return;
    event.preventDefault();
    const { groupe, id } = this._glisse;
    const ids = this._idsGroupe(groupe).filter(x => x !== id);
    ids.splice(ids.indexOf(ligne.dataset.id) + (this._dessous(event, ligne) ? 1 : 0), 0, id);
    this.config[`ordre${groupe}`] = ids;
    if (groupe === 'Episodes') return this._tableauChange();
    this.appliquer();
    this.rendrePanel();
    return this.enregistrer();
  },

  finGlisser() {
    this._glisse = null;
    document.querySelectorAll('.interface-entree').forEach(l => l.classList.remove('glisse', 'avant', 'apres'));
  },

  async reinitialiser() {
    if (!confirm('Revenir au nom, à l\'ordre et aux menus d\'origine ?')) return;
    this.config = { ...INTERFACE_DEFAUT, couleurs: { sombre: {}, clair: {} } };
    localStorage.removeItem(cleProjet(INTERFACE_THEME_KEY));
    // L'ordre d'origine vient du HTML : on le retrouve au rechargement
    await api.put('analyse_notes', { cle: 'interface', valeur: null });
    location.reload();
  },
};

// Évite un flash sombre au rechargement, avant la lecture des réglages en base
try {
  const themeMemorise = JSON.parse(localStorage.getItem(cleProjet(INTERFACE_THEME_KEY)) || 'null');
  if (themeMemorise) {
    Interface.config = { ...Interface.config, ...themeMemorise };
    Interface.appliquerTheme();
  }
} catch (e) {}
