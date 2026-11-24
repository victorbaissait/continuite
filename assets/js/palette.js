// assets/js/palette.js — La palette de commandes (⌘K ou Ctrl+K) : quelques lettres pour aller n'importe où.
// Épisodes, personnages, onglets, vues, projets et commandes, dans une seule liste qu'on filtre en tapant.
'use strict';

// Ouvre un onglet et attend qu'il soit prêt (ses données chargées), comme un clic sur le menu
async function ouvrirOnglet(tab) {
  const bouton = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if (!bouton) return false;
  if (!bouton.classList.contains('active')) bouton.click();
  // Déjà affiché mais périmé (une donnée a changé ailleurs) : on le recharge, sinon on attendrait pour rien
  else if (typeof initializedTabs !== 'undefined' && !initializedTabs.has(tab) && typeof initTab === 'function') initTab(tab);
  for (let i = 0; i < 200; i++) {
    if (typeof initializedTabs === 'undefined' || initializedTabs.has(tab)) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
}

const Palette = {
  ouverte: false,
  elements: [],
  filtres: [],
  choisi: 0,

  init() {
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.basculer();
      }
    });
  },

  _plat: t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),

  basculer() {
    if (this.ouverte) this.fermer();
    else this.ouvrir();
  },

  async _elements() {
    const el = [];
    const ajouter = (groupe, label, action, detail = '', mots = '') => el.push({ groupe, label, detail, action, cle: this._plat(`${label} ${detail} ${groupe} ${mots}`) });

    // Commandes
    ajouter('Commande', 'Nouvel épisode', async () => { await ouvrirOnglet('episodes'); Episodes.openNewEpisode(); });
    ajouter('Commande', 'Nouveau personnage', async () => { await ouvrirOnglet('personnages'); Personnages.choisirVue?.('fiches'); Personnages.openForm(null); });
    ajouter('Commande', 'Rechercher dans la série', async () => { await ouvrirOnglet('recherche'); document.getElementById('recherche-input')?.focus(); });
    ajouter('Commande', 'Remplacer dans toute la série', async () => { await ouvrirOnglet('recherche'); RemplacementSerie.ouvert = true; RemplacementSerie.rendre(); document.getElementById('rs-chercher')?.focus(); });
    ajouter('Commande', 'Thème sombre', () => Interface.setTheme('sombre'));
    ajouter('Commande', 'Thème clair', () => Interface.setTheme('clair'));
    ajouter('Commande', 'Thème du système', () => Interface.setTheme('systeme'));
    if (window.bureau) {
      ajouter('Commande', 'Enregistrer la page en PDF', () => window.print());
      ajouter('Commande', 'Sauvegarder tous les projets maintenant', async () => { await ouvrirOnglet('settings'); Bureau._rendreCarte('maintenant'); });
      ajouter('Commande', 'Ouvrir une nouvelle fenêtre', () => window.bureau.fenetre?.());
      ajouter('Commande', 'Verrouiller l\'app', () => window.bureau.verrou?.('verrouiller'));
    }

    // Onglets
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => {
      if (b.offsetParent === null && getComputedStyle(b).display === 'none') return;
      ajouter('Onglet', b.textContent.trim().replace(/\s+/g, ' '), () => ouvrirOnglet(b.dataset.tab));
    });

    // Vues
    const vues = [
      // Les vues du type de projet ouvert (un roman n'a pas celles d'une série)
      ['Écriture', 'ecriture', (typeof Interface !== 'undefined' && Interface.vuesEcritureVisibles ? Interface.vuesEcritureVisibles('serie') : []), async k => { Ecriture.portee = 'serie'; Ecriture.vue = k; Ecriture.rendre(); }],
      ['Personnages', 'personnages', [['fiches', 'Fiches'], ['relations', 'Relations'], ['secrets', 'Qui sait quoi'], ['etats', 'États'], ['parcours', 'Parcours'], ['aveugle', 'Qui parle ?']], async k => Personnages.choisirVue(k)],
      ['Analyse', 'analyse', (typeof ANALYSE_VUES !== 'undefined' ? ANALYSE_VUES : []), async k => Analyse.aller(k)],
      ['Frise', 'frise', [['calendar', 'Calendrier'], ['timeline', 'Timeline'], ['reperes', 'Repères']], async k => Frise.setView(k)],
    ];
    for (const [nom, tab, liste, aller] of vues) {
      for (const [k, l] of liste) ajouter('Vue', `${nom} → ${l}`, async () => { await ouvrirOnglet(tab); await aller(k); });
    }

    // Les fonctions, par leur nom et leurs synonymes : on tape ce qu'on cherche, pas l'endroit où c'est rangé
    const brouillon = async () => { const eps = await DataStore.get('episodes').catch(() => []); const e = (Array.isArray(eps) ? eps : []).find(x => x.has_texte) || eps[0]; if (!e) return false; await ouvrirOnglet('ecriture'); await Ecriture.ouvrirBrouillon(Ecriture.epId || e.id); for (let i = 0; i < 40 && !document.getElementById('ec-brouillon'); i++) await new Promise(r => setTimeout(r, 100)); return true; };
    const serie = async vue => { await ouvrirOnglet('ecriture'); Ecriture.portee = 'serie'; Ecriture.vue = vue; Ecriture.rendre(); };
    const episode = async vue => { if (!(await brouillon())) return; Ecriture.portee = 'episode'; Ecriture.vue = vue; Ecriture.rendre(); };
    const config = async () => { await ouvrirOnglet('settings'); };
    const fonctions = [
      ['Chutier : les scènes coupées', async () => { await episode('versions'); for (let i = 0; i < 40 && !document.querySelector('.ver-barre'); i++) await new Promise(r => setTimeout(r, 100)); Versions.chutier(); }, 'scènes supprimées coupées anciennes versions récupérer'],
      ['Rejouer l\'écriture (film des versions)', async () => { await episode('versions'); for (let i = 0; i < 40 && !document.querySelector('.ver-barre'); i++) await new Promise(r => setTimeout(r, 100)); Versions.film(); }, 'historique évolution versions'],
      ['Prompteur', async () => { if (await brouillon()) Prompteur.depuisTexte(document.getElementById('ec-brouillon').value, Ecriture._titreEp()); }, 'défilement téléprompteur lire à voix haute enregistrer'],
      ['Sprint de 25 minutes', async () => { if (!(await brouillon())) return; if (!document.querySelector('.ec-focus')) Ecriture.basculerFocus(); Sprint.basculer(); }, 'chronomètre minuteur pomodoro séance'],
      ['Bruit de fond (pluie, café)', async () => { if (!(await brouillon())) return; if (!document.querySelector('.ec-focus')) Ecriture.basculerFocus(); Ambiance.suivante(); }, 'ambiance son concentration musique'],
      ['Contraintes d\'écriture', async () => { if (!(await brouillon())) return; Ecriture._contraintesOuvert = true; Ecriture._majContraintes(); document.getElementById('ec-contraintes')?.scrollIntoView({ block: 'center' }); }, 'oulipo règle jeu défi'],
      ['Écouter le brouillon à voix haute', async () => { if (await brouillon()) Ecriture.ecouter(); }, 'lire lecture voix synthèse'],
      ['Figer une version (révisions en couleur)', async () => { if (await brouillon()) Ecriture.figerRevisionBrouillon(); }, 'révision couleur bleue rose tournage'],
      ['Objets oubliés (fusils de Tchekhov)', async () => { Ecriture.memFiltre = 'objets'; await serie('memoire'); }, 'tchekhov objet accessoire jamais revenu'],
      ['Ton année d\'écriture', () => serie('annee'), 'bilan rétrospective statistiques'],
      ['Feuille de style', () => serie('style'), 'typographie guillemets apostrophes orthographe graphies noms'],
      ['Ouvertures et fins des épisodes', () => serie('accroches'), 'cold open teaser générique accroche dernière réplique fin répétée'],
      ['Lisibilité (pavés d\'action)', () => serie('lisibilite'), 'pavés densité dix premières pages'],
      ['Tension (roman)', () => serie('rythme'), 'courbe rythme suspense'],
      ['PDF à annoter', async () => { await serie('export'); for (let i = 0; i < 60 && !document.querySelector('#ec-export .an-carte'); i++) await new Promise(r => setTimeout(r, 100)); Export.pdfAnnoter(); }, 'relecture papier stylo marge numéros de ligne'],
      ['Dossier de présentation', async () => { await serie('export'); for (let i = 0; i < 60 && !document.querySelector('#ec-export .an-carte'); i++) await new Promise(r => setTimeout(r, 100)); Export.dossier(); }, 'pitch producteur éditeur one page'],
      ['Anachronismes', async () => { await ouvrirOnglet('frise'); Frise.setView('reperes'); }, 'époque date objet moderne'],
      ['Photo de casting', async () => { await ouvrirOnglet('personnages'); Personnages.choisirVue('fiches'); }, 'image comédien acteur fiche'],
      ['Registres de langue (tu, vous, argot)', async () => { await ouvrirOnglet('analyse'); Analyse.aller('voix'); }, 'tutoiement vouvoiement argot soutenu voix'],
      ['Absents des grandes scènes', async () => { await ouvrirOnglet('personnages'); Personnages.choisirVue('parcours'); }, 'repas fête réunion manque personnage'],
      ['Lecteurs : vue d\'ensemble', async () => { await ouvrirOnglet('lecteurs'); Lecteurs.basculerEnsemble(true); }, 'relance retours notes bêta-lecteurs'],
      ['Aide sur cet écran', () => Aide.ouvrir(), 'guide documentation f1 comment'],
    ];
    if (window.bureau) fonctions.push(
      ['Sauvegarde et chiffrement', config, 'sauvegarde automatique chiffrer mot de passe cloud restaurer'],
      ['Dossier surveillé', config, 'final draft word import automatique'],
      ['Raccourcis clavier', async () => { Bureau._raccourcisOuvert = true; await config(); }, 'touches clavier personnaliser'],
      ['Mes réglages dans un fichier', config, 'exporter importer réglages'],
    );
    for (const [l, action, mots] of fonctions) ajouter('Fonction', l, action, '', mots);

    // Épisodes, personnages, projets
    const [episodes, personnages, projets] = await Promise.all([
      DataStore.get('episodes').catch(() => []), DataStore.get('personnages').catch(() => []), api.get('projets').catch(() => []),
    ]);
    const code = e => `S${e.saison_numero ?? '?'}E${String(e.numero_episode ?? '?').padStart(2, '0')}`;
    for (const e of Array.isArray(episodes) ? episodes : []) {
      ajouter('Épisode', `${code(e)} — ${e.titre || 'Sans titre'}`, async () => { await ouvrirOnglet('ecriture'); Ecriture.ouvrirBrouillon(e.id); }, 'brouillon');
      ajouter('Fiche épisode', `${code(e)} — ${e.titre || 'Sans titre'}`, async () => { await ouvrirOnglet('episodes'); Episodes.openEdit(e.id); }, 'modifier');
    }
    for (const p of Array.isArray(personnages) ? personnages : []) {
      const nom = [p.prenom, p.nom].filter(Boolean).join(' ');
      if (nom) ajouter('Personnage', nom, async () => { await ouvrirOnglet('personnages'); Personnages.choisirVue?.('fiches'); Personnages.openForm(p.id); }, p.profession || '');
    }
    for (const p of Array.isArray(projets) ? projets : []) {
      if (p.slug === PROJET) continue;
      ajouter('Projet', `Ouvrir « ${p.nom} »`, () => Projets.changer(p.slug), p.type || '');
    }
    return el;
  },

  async ouvrir() {
    if (this.ouverte) return;
    this.ouverte = true;
    const fond = document.createElement('div');
    fond.className = 'pa-fond';
    fond.id = 'pa-fond';
    fond.innerHTML = `<div class="pa-boite" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <input id="pa-q" type="text" autocomplete="off" spellcheck="false" placeholder="Aller à… (épisode, personnage, vue, commande)" aria-label="Aller à" aria-controls="pa-liste">
      <ul id="pa-liste" class="pa-liste" role="listbox"><li class="pa-vide">Chargement…</li></ul>
      <p class="pa-aide"><kbd>↑</kbd><kbd>↓</kbd> choisir · <kbd>Entrée</kbd> ouvrir · <kbd>Échap</kbd> fermer</p>
    </div>`;
    fond.addEventListener('mousedown', e => { if (e.target === fond) this.fermer(); });
    document.body.appendChild(fond);
    const champ = document.getElementById('pa-q');
    champ.addEventListener('input', () => { this.choisi = 0; this.filtrer(champ.value); });
    champ.addEventListener('keydown', e => this._touche(e));
    champ.focus();
    this.elements = await this._elements();
    if (this.ouverte) this.filtrer(champ.value);
  },

  fermer() {
    this.ouverte = false;
    document.getElementById('pa-fond')?.remove();
  },

  filtrer(q) {
    const termes = this._plat(q).split(/\s+/).filter(Boolean);
    const score = x => {
      if (!termes.length) return x.groupe === 'Commande' || x.groupe === 'Onglet' ? 0 : 1;
      const label = this._plat(x.label);
      return (label.startsWith(termes[0]) ? 0 : 1) + (x.groupe === 'Fiche épisode' ? 0.5 : 0);
    };
    this.filtres = this.elements.filter(x => termes.every(t => x.cle.includes(t)))
      .map(x => ({ x, s: score(x) })).sort((a, b) => a.s - b.s).slice(0, 60).map(o => o.x);
    this.choisi = Math.min(this.choisi, Math.max(0, this.filtres.length - 1));
    this._rendre();
  },

  _rendre() {
    const liste = document.getElementById('pa-liste');
    if (!liste) return;
    liste.innerHTML = this.filtres.length ? this.filtres.map((x, i) => `<li role="option" id="pa-${i}" aria-selected="${i === this.choisi}" class="${i === this.choisi ? 'actif' : ''}" onmousedown="event.preventDefault(); Palette.lancer(${i})">
      <span class="pa-groupe">${esc(x.groupe)}</span><span class="pa-label">${esc(x.label)}</span>${x.detail ? `<span class="pa-detail">${esc(x.detail)}</span>` : ''}</li>`).join('')
      : '<li class="pa-vide">Rien ne correspond.</li>';
    document.getElementById('pa-q')?.setAttribute('aria-activedescendant', this.filtres.length ? `pa-${this.choisi}` : '');
    document.getElementById(`pa-${this.choisi}`)?.scrollIntoView({ block: 'nearest' });
  },

  _touche(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.fermer(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.choisi = Math.min(this.choisi + 1, this.filtres.length - 1); this._rendre(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.choisi = Math.max(this.choisi - 1, 0); this._rendre(); }
    else if (e.key === 'Enter') { e.preventDefault(); this.lancer(this.choisi); }
  },

  async lancer(i) {
    const x = this.filtres[i];
    if (!x) return;
    this.fermer();
    try { await x.action(); } catch (e) { toast(e.message || 'Impossible', 'error'); }
  },
};

Palette.init();
