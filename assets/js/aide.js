// assets/js/aide.js — L'aide intégrée : le « ? » (ou F1) ouvre le passage du guide qui parle de l'écran affiché.
// Le guide (docs/GUIDE.md) est lu sur place, sans connexion ; son texte est échappé avant d'être mis en forme.
'use strict';

const Aide = {
  guide: null,

  // Chaque onglet a son passage du guide ; certains en ajoutent un second
  SECTIONS: {
    episodes: ['### Épisodes', '### Importer des textes'], ecriture: ['### Écriture'], personnages: ['### Personnages'], decors: ['### Décors'],
    frise: ['### Frise'], themes: ['### Thèmes'], suivi: ['### Suivi'], analyse: ['### Analyse'], batch: ['### Batch'], recherche: ['### Recherche'],
    journal: ['### Journal'], lecteurs: ['### Lecteurs'], settings: ['### Config', '## L\'app de bureau'],
  },

  init() {
    // Un bouton rond, en bas à droite : il ne prend pas de place dans la barre des onglets, déjà pleine
    if (!document.getElementById('aide-bouton')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'aide-bouton';
      b.className = 'nav-aide';
      b.textContent = '?';
      b.title = 'Aide sur cet écran (F1)';
      b.setAttribute('aria-label', 'Aide sur cet écran');
      b.addEventListener('click', () => this.ouvrir());
      document.body.appendChild(b);
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'F1' || ((e.metaKey || e.ctrlKey) && e.key === '?')) { e.preventDefault(); this.ouvrir(); }
    });
  },

  async _lire() {
    if (this.guide) return this.guide;
    const r = await fetch('docs/GUIDE.md', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Le guide est introuvable.');
    this.guide = await r.text();
    return this.guide;
  },

  // Le passage qui commence au titre donné, jusqu'au prochain titre du même niveau (ou plus haut)
  _section(md, titre) {
    const lignes = md.split('\n');
    const debut = lignes.findIndex(l => l.trim() === titre);
    if (debut < 0) return '';
    const niveau = titre.match(/^#+/)[0].length;
    let fin = lignes.length;
    for (let i = debut + 1; i < lignes.length; i++) {
      const m = lignes[i].match(/^(#+)\s/);
      if (m && m[1].length <= niveau) { fin = i; break; }
    }
    return lignes.slice(debut, fin).join('\n');
  },

  // Ce que l'écran affiche : l'onglet, et la vue choisie dedans (pour surligner le paragraphe qui en parle)
  _ecran() {
    const tab = document.querySelector('.nav-btn.active')?.dataset.tab || 'episodes';
    let vue = '';
    try {
      if (tab === 'ecriture' && typeof Ecriture !== 'undefined') {
        const toutes = typeof ECRITURE_VUES !== 'undefined' ? [...ECRITURE_VUES.serie, ...ECRITURE_VUES.episode] : [];
        vue = (toutes.find(([k]) => k === Ecriture.vue) || [])[1] || '';
      } else if (tab === 'personnages' && typeof Personnages !== 'undefined') {
        vue = { fiches: 'Fiches', relations: 'Relations', secrets: 'Qui sait quoi', etats: 'États', parcours: 'Parcours' }[Personnages.vue] || '';
      } else if (tab === 'analyse' && typeof Analyse !== 'undefined' && typeof ANALYSE_VUES !== 'undefined') {
        vue = (ANALYSE_VUES.find(([k]) => k === Analyse.vue) || [])[1] || '';
      } else if (tab === 'lecteurs' && typeof Lecteurs !== 'undefined' && Lecteurs.ensembleOuvert) {
        vue = 'Vue d\'ensemble';
      }
    } catch (e) { /* vue inconnue : l'onglet suffit */ }
    return { tab, vue };
  },

  // Un Markdown simple (titres, listes, tableaux, gras, code, liens) ; tout est échappé d'abord
  _html(md, surligner = '') {
    const plat = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cible = surligner ? plat(surligner) : '';
    const enLigne = t => esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, texte, url) => `<a href="${url}" target="_blank" rel="noopener">${texte}</a>`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    const sortie = [];
    const lignes = md.split('\n');
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (/^```/.test(l)) {
        const bloc = [];
        for (i++; i < lignes.length && !/^```/.test(lignes[i]); i++) bloc.push(lignes[i]);
        sortie.push(`<pre><code>${esc(bloc.join('\n'))}</code></pre>`);
        continue;
      }
      const titre = l.match(/^(#{1,4})\s+(.*)$/);
      if (titre) { sortie.push(`<h${Math.min(4, titre[1].length + 1)}>${enLigne(titre[2])}</h${Math.min(4, titre[1].length + 1)}>`); continue; }
      if (/^\|/.test(l)) {
        const rangs = [];
        for (; i < lignes.length && /^\|/.test(lignes[i]); i++) if (!/^\|[\s|:-]+\|$/.test(lignes[i])) rangs.push(lignes[i].replace(/^\||\|$/g, '').split('|').map(c => enLigne(c.trim())));
        i--;
        sortie.push(`<table class="an-table"><tbody>${rangs.map((r, k) => `<tr>${r.map(c => (k ? `<td>${c}</td>` : `<th scope="col">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      const puce = l.match(/^(\s*)[-*]\s+(.*)$/);
      if (puce) {
        const marque = cible && plat(puce[2]).includes(cible) ? ' class="aide-ici"' : '';
        sortie.push(`<ul${puce[1].length ? ' class="aide-sous"' : ''}><li${marque}>${enLigne(puce[2])}</li></ul>`);
        continue;
      }
      if (/^---+$/.test(l.trim())) continue;
      if (l.trim()) sortie.push(`<p${cible && plat(l).includes(cible) ? ' class="aide-ici"' : ''}>${enLigne(l)}</p>`);
    }
    return sortie.join('\n').replace(/<\/ul>\n<ul( class="aide-sous")?>/g, '');
  },

  async ouvrir(tout = false) {
    let md;
    try { md = await this._lire(); } catch (e) { toast(e.message, 'error'); return; }
    const { tab, vue } = this._ecran();
    const sections = tout ? [md] : (this.SECTIONS[tab] || []).map(t => this._section(md, t)).filter(Boolean);
    if (!tout && tab === 'settings' && !window.bureau) sections.pop();
    const corps = sections.length ? sections.map(s => this._html(s, vue)).join('<hr>') : '<p class="an-note">Rien dans le guide pour cet écran.</p>';
    modal.open(`<div class="aide" role="document">
      <div class="aide-entete"><strong>Aide${!tout && vue ? ` · ${esc(vue)}` : ''}</strong>
        <span>${tout ? '' : '<button type="button" class="btn btn-ghost btn-sm" onclick="Aide.ouvrir(true)">Tout le guide</button>'}</span></div>
      <div class="aide-texte">${corps}</div></div>`);
    setTimeout(() => document.querySelector('.aide .aide-ici')?.scrollIntoView({ block: 'center' }), 50);
  },
};

Aide.init();
