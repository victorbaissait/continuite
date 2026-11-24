// assets/js/genres.js — Les vues propres au théâtre, à la pub et au jeu vidéo, dans l'onglet Écriture
'use strict';

const PUB_DUREES = [6, 10, 15, 20, 30, 45, 60];

const Genres = {
  donnees: null,
  acte: null,
  chapitre: null,
  lieu: null,

  vue() {
    return '<div class="an-vue" id="ec-genre"><p class="an-note">Lecture…</p></div>';
  },

  async ouvrir() {
    const source = { theatre: 'ecriture_theatre', pub: 'ecriture_pub', jeu: 'ecriture_jeu' }[Roman.type];
    this.donnees = await api.get(source);
    this.rendre();
  },

  rendre() {
    const slot = document.getElementById('ec-genre');
    if (!slot || !this.donnees) return;
    const vues = {
      presence: () => this._presence(), distribution: () => this._distribution(), parole: () => this._parole(), didascalies: () => this._didascalies(),
      campagne: () => this._campagne(), spot: () => this._spot(),
      carte: () => this._carte(), enigmes: () => this._enigmes(), dialogues: () => this._dialogues(), inventaire: () => this._inventaire(),
    };
    slot.innerHTML = vues[Ecriture.vue] ? vues[Ecriture.vue]() : '';
  },

  _vide(texte) {
    return `<section class="an-carte"><p class="an-note">${texte}</p></section>`;
  },

  _note(cle) {
    return objetNote(Ecriture.notes[cle]);
  },

  _pilules(liste, actuel, action) {
    return `<div class="ec-modes" role="group">${liste.map(([v, l]) => `<button type="button" class="ec-mode ${String(v) === String(actuel) ? 'actif' : ''}" aria-pressed="${String(v) === String(actuel)}" onclick="${action}(${JSON.stringify(v).replace(/"/g, '&quot;')})">${esc(l)}</button>`).join('')}</div>`;
  },

  // ─── Théâtre ─────────────────────────────────────────────────────────────

  _actes() {
    const ids = new Set(Ecriture.ensemble().map(e => e.id));
    return this.donnees.actes.map(a => ({ ...a, scenes: a.scenes.filter(s => ids.has(s.id)) })).filter(a => a.scenes.length);
  },

  choisirActe(n) {
    this.acte = n;
    this.rendre();
  },

  _presence() {
    const actes = this._actes();
    if (!actes.length) return this._vide('Aucune scène dans ce choix. Importe la pièce dans Config → Projets.');
    const a = actes.find(x => x.n === this.acte) || actes[0];
    this.acte = a.n;
    const noms = this.donnees.noms.filter(n => a.scenes.some(s => s.presents.includes(n)));
    // Muet longtemps : en scène sans parler trois scènes de suite ou plus
    const alertes = [];
    noms.forEach(n => {
      let suite = 0, debut = 0;
      a.scenes.forEach((s, i) => {
        if (s.muets.includes(n)) { if (!suite) debut = i; suite++; } else suite = 0;
        if (suite === 3) alertes.push(['Muet longtemps', `${n}, scènes ${a.scenes[debut].n} à ${s.n}`, 'En scène sans dire un mot pendant trois scènes : une entrée ou une sortie oubliée dans les didascalies ?']);
      });
    });
    a.scenes.slice(1).forEach((s, i) => {
      const avant = a.scenes[i];
      avant.sorties.filter(n => s.entrees.includes(n)).forEach(n => alertes.push(['Sortie et retour', `${n}, scènes ${avant.n} → ${s.n}`, 'Il sort et rentre d\'une scène à l\'autre : à prévoir si son comédien joue aussi un autre rôle.']));
    });
    const peuplee = [...a.scenes].sort((x, y) => y.presents.length - x.presents.length)[0];
    if (peuplee) alertes.push(['Scène la plus peuplée', `${peuplee.presents.length} personnages`, `Scène ${peuplee.n} : ${peuplee.presents.join(', ')}.`]);
    const implicites = a.scenes.reduce((t, s) => t + s.sans_entree.length, 0);
    return `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Qui est en scène · acte ${a.n}</h2>${actes.length > 1 ? this._pilules(actes.map(x => [x.n, `Acte ${x.n}`]), a.n, 'Genres.choisirActe') : ''}</div>
        <div class="an-table"><table class="th-grille">
          <thead><tr><th scope="col">Personnage</th>${a.scenes.map(s => `<th scope="col">${Ecriture._lien(`sc. ${s.n}`, 'ouvrirEpisode', s.id)}</th>`).join('')}</tr></thead>
          <tbody>${noms.map(n => `<tr><td>${esc(n)}</td>${a.scenes.map(s => {
            const parle = s.parle[n] !== undefined, muet = s.muets.includes(n);
            return `<td><span class="th-case ${parle ? 'parle' : muet ? 'muet' : ''}" title="Scène ${s.n} : ${parle ? `parle (${s.parle[n]} mots)` : muet ? 'en scène, muet' : 'hors scène'}${s.entrees.includes(n) ? ' · entre' : ''}${s.sorties.includes(n) ? ' · sort' : ''}"></span></td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="an-note">Case pleine : le personnage parle. Hachurée : en scène sans parler, d'après les didascalies « entre », « reste », « sort » et la liste des présents sous le titre de la scène. Vide : hors scène.${implicites ? ` ${implicites} entrée(s) sans didascalie : le personnage parle sans qu'on l'ait vu entrer.` : ''}</p>
      </section>
      <div class="sb-controles">${alertes.slice(0, 6).map(([t, v, d]) => `<section class="an-carte"><span class="an-label">${esc(t)}</span><strong class="sb-chiffre ${t === 'Scène la plus peuplée' ? '' : 'ec-orange'}">${esc(v)}</strong><p class="an-note vo-brut">${esc(d)}</p></section>`).join('')}</div>
    `;
  },

  // Deux rôles jamais en scène ensemble peuvent être joués par le même comédien
  _distribution() {
    const scenes = this._actes().flatMap(a => a.scenes);
    if (!scenes.length) return this._vide('Aucune scène dans ce choix.');
    const noms = this.donnees.noms.filter(n => scenes.some(s => s.presents.includes(n)));
    const ensemble = (a, b) => scenes.some(s => s.presents.includes(a) && s.presents.includes(b));
    const serre = (a, b) => scenes.some((s, i) => i && ((s.presents.includes(a) && scenes[i - 1].presents.includes(b)) || (s.presents.includes(b) && scenes[i - 1].presents.includes(a))));
    // Coloriage glouton : les rôles les plus chargés d'abord
    const ordre = [...noms].sort((a, b) => noms.filter(x => ensemble(a, x)).length - noms.filter(x => ensemble(b, x)).length).reverse();
    const groupes = [];
    ordre.forEach(n => {
      const g = groupes.find(gr => gr.every(x => !ensemble(x, n) && !serre(x, n))) || groupes.find(gr => gr.every(x => !ensemble(x, n)));
      if (g) g.push(n);
      else groupes.push([n]);
    });
    const paires = [];
    for (let i = 0; i < noms.length; i++) for (let j = i + 1; j < noms.length; j++) {
      const a = noms[i], b = noms[j];
      paires.push({ a, b, etat: ensemble(a, b) ? 'impossible' : serre(a, b) ? 'serré' : 'possible' });
    }
    return `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Une distribution possible</h2><span class="an-note">${groupes.length} comédien(s) pour ${noms.length} rôle(s)</span></div>
          <ul class="ec-liste">${groupes.map((g, i) => `<li><span>Comédien ${i + 1}</span><span class="vo-brut">${esc(g.join(' + '))}</span></li>`).join('')}</ul>
          <p class="an-note">Deux rôles vont ensemble s'ils ne sont jamais en scène en même temps ; on évite aussi qu'un rôle sorte juste avant que l'autre entre, pour laisser le temps de changer de costume.</p>
        </section>
        <section class="an-carte">
          <h2 class="an-titre">Rôle par rôle</h2>
          <ul class="ec-liste">${paires.filter(p => p.etat !== 'impossible').slice(0, 20).map(p => `<li><span class="vo-brut">${esc(p.a)} + ${esc(p.b)}</span><span class="${p.etat === 'serré' ? 'ec-orange' : ''}">${p.etat === 'serré' ? 'possible, changement rapide' : 'possible'}</span></li>`).join('') || '<li><span>Aucun doublage possible : tous les rôles se croisent.</span></li>'}</ul>
        </section>
      </div>
    `;
  },

  _parole() {
    const actes = this._actes();
    if (!actes.length) return this._vide('Aucune scène dans ce choix.');
    const total = {};
    actes.forEach(a => a.scenes.forEach(s => Object.entries(s.parle).forEach(([n, m]) => { total[n] = (total[n] || 0) + m; })));
    const somme = Object.values(total).reduce((x, y) => x + y, 0) || 1;
    const liste = Object.entries(total).sort((a, b) => b[1] - a[1]);
    // Une minute pour 150 mots dits, plus le jeu muet indiqué par les didascalies
    const duree = a => a.scenes.reduce((t, s) => t + s.mots / 150 + s.mots_did / 300, 0);
    const minutes = m => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : m < 1 ? 'moins d\'une minute' : `${Math.round(m)} min`);
    return `
      <section class="an-carte">
        <h2 class="an-titre">Temps de parole</h2>
        <div class="ec-rythme">${liste.map(([n, m]) => `<div class="ec-rythme-ligne"><span>${Ecriture._lien(esc(n), 'voirPerso', n)}</span><div class="ec-rythme-barre" aria-hidden="true"><i style="width:${Math.round(100 * m / liste[0][1])}%"></i></div><span>${Math.round(100 * m / somme)} % · ${m.toLocaleString('fr-FR')} mots</span></div>`).join('')}</div>
      </section>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Durée de représentation</h2><span class="an-note">environ ${minutes(actes.reduce((t, a) => t + duree(a), 0))} sans entracte</span></div>
        <ul class="ec-liste">${actes.map(a => `<li><span>Acte ${a.n} · ${a.scenes.length} scène(s)</span><span>${minutes(duree(a))}</span></li>`).join('')}</ul>
        <p class="an-note">Environ 150 mots dits par minute, plus le temps du jeu muet décrit dans les didascalies.</p>
      </section>
      ${this._fatigue(actes, liste.map(([n]) => n))}
    `;
  },

  // La fatigue du comédien : sa plus longue tirade, et le plus long moment passé en scène sans sortir
  _fatigue(actes, noms) {
    const minutes = mots => Math.round(mots / 150);
    const lignes = noms.map(n => {
      let tirade = { mots: 0, ou: '' };
      let suite = { scenes: 0, mots: 0, ou: '' };
      actes.forEach(a => {
        let cours = { scenes: 0, mots: 0, debut: null };
        a.scenes.forEach(sc => {
          const t = (sc.tirade || {})[n] || 0;
          if (t > tirade.mots) tirade = { mots: t, ou: `acte ${a.n}, scène ${sc.n}` };
          // En scène sans sortir : la présence continue, jusqu'à ce qu'il sorte ou que la scène suivante ne le compte plus
          if (sc.presents.includes(n)) {
            if (!cours.scenes) cours.debut = sc.n;
            cours.scenes++;
            cours.mots += sc.mots + sc.mots_did / 2;
            if (cours.scenes > suite.scenes || (cours.scenes === suite.scenes && cours.mots > suite.mots)) suite = { scenes: cours.scenes, mots: cours.mots, ou: `acte ${a.n}, scènes ${cours.debut} à ${sc.n}` };
            if (sc.sorties.includes(n)) cours = { scenes: 0, mots: 0, debut: null };
          } else cours = { scenes: 0, mots: 0, debut: null };
        });
      });
      return { n, tirade, suite };
    }).filter(x => x.tirade.mots || x.suite.scenes);
    if (!lignes.length) return '';
    const lourd = x => x.tirade.mots >= 250 || minutes(x.suite.mots) >= 25;
    return `<section class="an-carte">
      <div class="an-entete"><h2 class="an-titre">La fatigue des comédiens</h2><span class="an-note">${lignes.filter(lourd).length} rôle(s) à surveiller</span></div>
      <p class="an-note">Pour chaque rôle : sa plus longue tirade (à apprendre d'un seul bloc), et le plus long moment passé en scène sans sortir, en temps de jeu estimé. Au-delà de 250 mots d'affilée, ou de 25 minutes sans pause, le comédien n'a pas le temps de souffler ni de se changer.</p>
      <div class="an-table"><table><thead><tr><th scope="col">Rôle</th><th scope="col">Plus longue tirade</th><th scope="col">En scène sans sortir</th></tr></thead>
      <tbody>${lignes.map(x => `<tr class="${lourd(x) ? 'ec-orange' : ''}"><td>${esc(x.n)}</td><td>${x.tirade.mots ? `${x.tirade.mots} mots · ${esc(x.tirade.ou)}` : '—'}</td><td>${x.suite.scenes} scène(s), environ ${minutes(x.suite.mots) || 'moins d\'une'} min · ${esc(x.suite.ou)}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  },

  _didascalies() {
    const scenes = this._actes().flatMap(a => a.scenes.map(s => ({ ...s, acte: a.n })));
    if (!scenes.length) return this._vide('Aucune scène dans ce choix.');
    return `
      <section class="an-carte">
        <h2 class="an-titre">Didascalies, scène par scène</h2>
        <div class="an-table"><table>
          <thead><tr><th scope="col">Scène</th><th scope="col">Mots dits</th><th scope="col">Didascalies</th><th scope="col">Part</th><th scope="col">Entrent</th><th scope="col">Sortent</th></tr></thead>
          <tbody>${scenes.map(s => {
            const part = Math.round(100 * s.mots_did / ((s.mots + s.mots_did) || 1));
            return `<tr class="${part > 40 ? 'ec-orange' : ''}"><td>${Ecriture._lien(`Acte ${s.acte}, sc. ${s.n}`, 'ouvrirEpisode', s.id)}</td><td>${s.mots}</td><td>${s.mots_did}</td><td>${part} %</td><td class="vo-brut">${esc(s.entrees.join(', ') || '—')}</td><td class="vo-brut">${esc(s.sorties.join(', ') || '—')}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
        <p class="an-note">Au-delà de 40 % de didascalies, la scène se joue surtout sans paroles : à vérifier avec la mise en scène.</p>
      </section>
    `;
  },

  // ─── Pub ─────────────────────────────────────────────────────────────────

  _dureeVisee(id) {
    const v = Number(Ecriture.notes[`pub-duree:${id}`]);
    return PUB_DUREES.includes(v) ? v : (Roman.forme === 'reseaux' ? 15 : 30);
  },

  setDuree(id, v) {
    Ecriture.noterPlusTard(`pub-duree:${id}`, String(v));
    this.rendre();
  },

  _brief(sa) {
    return this._note(`pub-brief:${sa}`);
  },

  setBrief(sa, cle, valeur) {
    const b = this._brief(sa);
    b[cle] = String(valeur).slice(0, 200);
    Ecriture.noterPlusTard(`pub-brief:${sa}`, JSON.stringify(b));
    this.rendre();
  },

  // Les contrôles d'un spot, partagés par la vue Campagne et la vue du spot
  _controles(spot, e) {
    const visee = this._dureeVisee(e.id);
    const plans = spot.plans;
    const marque = (this._brief(e.sa).marque || '').trim().toLowerCase();
    const parles = plans.filter(p => p.mots);
    const tempsParle = parles.reduce((t, p) => t + p.duree, 0);
    const debit = tempsParle ? plans.reduce((t, p) => t + p.mots, 0) / tempsParle : 0;
    let citee = null, fois = 0;
    if (marque) plans.forEach(p => p.sons.forEach(([type, , t]) => { if (type !== 'son' && t.toLowerCase().includes(marque)) { fois++; if (citee === null) citee = p.debut; } }));
    const dernier = plans[plans.length - 1];
    const mention = plans.find(p => p.mots_mention);
    return [
      ['Durée', spot.total > visee ? `${spot.total - visee} s de trop` : spot.total < visee - 3 ? `${visee - spot.total} s de libre` : 'tient', spot.total > visee],
      ['Débit des voix', debit ? `${(Math.round(debit * 10) / 10).toLocaleString('fr-FR')} mots/s${debit > 3 ? ' · trop rapide' : ''}` : 'aucune voix', debit > 3],
      ['Marque citée', marque ? (fois ? `${fois} fois, d'abord à ${citee} s` : 'jamais') : 'à renseigner dans le brief', marque && !fois],
      ['Packshot final', dernier?.packshot ? `présent · ${dernier.duree} s` : 'absent', !dernier?.packshot],
      ['Mention légale', mention ? (mention.mots ? 'présente · lue pendant que la voix parle' : 'présente') : 'absente', !mention || Boolean(mention.mots)],
    ];
  },

  _spotsCampagne() {
    return Ecriture.ensemble().filter(e => this.donnees.spots[e.id]);
  },

  _campagne() {
    const eps = this._spotsCampagne();
    if (!eps.length) return this._vide('Aucun spot dans ce choix. Importe les scripts dans Config → Projets.');
    const campagnes = [...new Set(eps.map(e => e.sa))];
    return campagnes.map(sa => {
      const b = this._brief(sa);
      const spots = eps.filter(e => e.sa === sa);
      return `
        <section class="an-carte">
          <h2 class="an-titre">${esc(Roman.traduire(`Saison ${sa}`))}</h2>
          <div class="an-table"><table>
            <thead><tr><th scope="col">Spot</th><th scope="col">Titre</th><th scope="col">Plans</th><th scope="col">Durée</th><th scope="col">Visée</th><th scope="col">À revoir</th></tr></thead>
            <tbody>${spots.map(e => {
              const s = this.donnees.spots[e.id];
              const ko = this._controles(s, e).filter(c => c[2]).map(c => c[0]);
              return `<tr><td>${Ecriture._lien(esc(Ecriture._code(e)), 'ouvrirSpot', e.id)}</td><td>${esc(e.t || 'Sans titre')}</td><td>${s.plans.length}</td><td class="${s.total > this._dureeVisee(e.id) ? 'ec-orange' : ''}">${s.total} s</td><td>${this._dureeVisee(e.id)} s</td><td class="${ko.length ? 'ec-orange' : ''}">${esc(ko.join(', ') || 'rien')}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
          <p class="an-label">Brief</p>
          <div class="mep-grille vo-brut">${[['cible', 'Cible'], ['message', 'Message'], ['ton', 'Ton'], ['marque', 'Marque (pour la compter dans les voix)']].map(([k, l]) => `<label class="mep-champ"><span class="an-label">${l}</span><input type="text" maxlength="200" value="${esc(b[k] || '')}" onchange="Genres.setBrief(${sa}, '${k}', this.value)"></label>`).join('')}</div>
        </section>`;
    }).join('');
  },

  _spot() {
    const e = Ecriture.ordre[Ecriture.rang.get(Ecriture.epId)];
    const s = e && this.donnees.spots[e.id];
    if (!s) return this._vide('Pas encore de script pour ce spot : écris-le dans le Brouillon (« IMAGE : », « VO : »…).');
    const visee = this._dureeVisee(e.id);
    const garde = s.plans.filter(p => p.garder);
    const court = garde.reduce((t, p) => t + p.duree, 0);
    const dernier = s.plans[s.plans.length - 1];
    const muets = s.plans.filter(p => !p.sons.length).length;
    const larges = s.plans.filter(p => p.large).length;
    const declinaisons = [
      [`Version courte (${garde.length} plan(s) à garder)`, garde.length ? `${court} s` : 'aucun plan marqué [garder]', !garde.length],
      ['6 s pour les réseaux', dernier?.packshot ? `packshot seul · ${dernier.duree} s` : 'pas de packshot à reprendre', !dernier?.packshot],
      ['Format vertical 9:16', larges ? `${larges} plan(s) large(s) à recadrer` : 'rien à recadrer', larges > 0],
      ['Radio', muets ? `${muets} plan(s) sans son à remplacer` : 'tout passe au son', muets > 0],
    ];
    return `
      <div class="an-ligne pub-durees"><span class="an-label">Durée visée</span>${this._pilules(PUB_DUREES.map(d => [d, `${d} s`]), visee, `Genres.setDuree.bind(Genres, ${e.id})`)}</div>
      <div class="sb-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Script · image et son</h2><strong class="${s.total > visee ? 'ec-orange' : ''}">${s.total} s / ${visee} s</strong></div>
          <div class="pub-script">
            <span class="an-label">Temps</span><span class="an-label">Image</span><span class="an-label">Son</span>
            ${s.plans.map(p => `<span class="pub-t">${p.debut}–${p.debut + p.duree} s${p.garder ? '<br><small>garder</small>' : ''}</span><span class="vo-brut">${esc(p.image || '—')}</span><span class="vo-brut">${p.sons.map(([type, qui, t]) => `<span class="${type === 'mention' ? 'ec-orange' : ''}"><strong>${esc(qui)}</strong> ${esc(t)}</span>`).join('<br>') || '—'}</span>`).join('')}
          </div>
          <p class="an-note">Le temps d'un plan vient de ce qui s'y dit, à ${String(this.donnees.debit).replace('.', ',')} mots par seconde ; une mention à l'écran se lit à ${this.donnees.mention} mots par seconde ; « (3 s) » dans l'image fixe un minimum.</p>
        </section>
        <div class="sb-detail">
          <section class="an-carte"><h2 class="an-titre">Contrôles</h2><ul class="ec-liste">${this._controles(s, e).map(([l, v, ko]) => `<li class="${ko ? 'ec-orange' : ''}"><span>${l}</span><span>${esc(v)}</span></li>`).join('')}</ul></section>
          <section class="an-carte"><h2 class="an-titre">Déclinaisons</h2><ul class="ec-liste">${declinaisons.map(([l, v, ko]) => `<li class="${ko ? 'ec-orange' : ''}"><span>${l}</span><span>${esc(v)}</span></li>`).join('')}</ul>
            <p class="an-note">« [garder] » dans l'image marque un plan qui reste dans la version courte.</p></section>
        </div>
      </div>
      ${this._marque(s, e)}
    `;
  },

  // La marque à l'écran : à quelle seconde elle est nommée ou montrée pour la première fois
  _marque(s, e) {
    const noms = String(Ecriture.notes?.['pub-marque'] || '').split(',').map(x => x.trim()).filter(Boolean);
    const plat = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const trouve = p => noms.length && [p.image || '', ...p.sons.map(x => x[2] || '')].some(t => noms.some(n => plat(t).includes(plat(n))));
    const total = s.plans.reduce((t, p) => Math.max(t, p.debut + p.duree), 0) || 1;
    const premier = s.plans.find(trouve);
    const fois = s.plans.filter(trouve).length;
    const tard = premier && premier.debut > total * 0.66;
    return `<section class="an-carte">
      <div class="an-entete"><h2 class="an-titre">La marque à l'écran</h2>
        <label class="an-ligne"><span class="an-label">Marque, produit</span><input type="text" value="${esc(noms.join(', '))}" placeholder="Nom de la marque, du produit…" aria-label="Noms de la marque et du produit" onchange="Ecriture.note('pub-marque', this.value).then(() => Genres.rendre())"></label></div>
      ${!noms.length ? '<p class="an-note">Écris le nom de la marque et du produit (séparés par des virgules) : l\'app cherche quand le spot les montre ou les dit.</p>'
        : !premier ? '<p class="ec-orange">La marque n\'est ni montrée ni dite dans ce spot.</p>'
        : `<div class="marque-frise" role="img" aria-label="Moments où la marque apparaît">${s.plans.map(p => `<span style="flex:${p.duree} 1 0" class="${trouve(p) ? 'oui' : ''}" title="${p.debut}–${p.debut + p.duree} s"></span>`).join('')}</div>
          <p class="${tard ? 'ec-orange' : ''}">Première apparition à <strong>${premier.debut} s</strong> sur ${total} s, dans ${fois} plan(s) sur ${s.plans.length}.${tard ? ' C\'est tard : un spot qu\'on zappe ne l\'aura jamais montrée.' : premier.debut <= 3 ? ' Dès les premières secondes.' : ''}</p>`}
    </section>`;
  },

  // ─── Jeu vidéo ───────────────────────────────────────────────────────────

  _chapitres() {
    const ids = new Set(Ecriture.ensemble().map(e => e.id));
    return this.donnees.chapitres.filter(c => c.lieux.some(l => ids.has(l.id)));
  },

  _chapitreCourant() {
    const liste = this._chapitres();
    const c = liste.find(x => x.n === this.chapitre) || liste[0];
    if (c) this.chapitre = c.n;
    return { c, liste };
  },

  choisirChapitre(n) {
    this.chapitre = n;
    this.lieu = null;
    this.rendre();
  },

  choisirLieu(id) {
    this.lieu = Number(id);
    this.rendre();
  },

  _enteteChapitre(c, liste) {
    return liste.length > 1 ? `<div class="an-ligne">${this._pilules(liste.map(x => [x.n, Roman.traduire(`Saison ${x.n}`)]), c.n, 'Genres.choisirChapitre')}</div>` : '';
  },

  // Les lieux rangés par distance au départ, en suivant les passages
  _disposition(c) {
    const index = new Map(c.lieux.map((l, i) => [l.nom.toLowerCase(), i]));
    const prof = new Array(c.lieux.length).fill(-1);
    prof[0] = 0;
    const file = [0];
    while (file.length) {
      const i = file.shift();
      c.lieux[i].sorties.forEach(s => {
        const j = index.get(s.vers.toLowerCase());
        if (j !== undefined && prof[j] < 0) { prof[j] = prof[i] + 1; file.push(j); }
      });
    }
    const max = Math.max(0, ...prof);
    prof.forEach((p, i) => { if (p < 0) prof[i] = max + 1; });
    const colonnes = Math.max(...prof) + 1;
    const parCol = {};
    return c.lieux.map((l, i) => {
      const col = prof[i];
      parCol[col] = (parCol[col] || 0) + 1;
      const dans = c.lieux.filter((x, k) => prof[k] === col).length;
      return { x: 8 + (84 * col) / Math.max(1, colonnes - 1), y: (100 * parCol[col]) / (dans + 1) };
    });
  },

  // Les mots à traduire : tout le texte du jeu, par chapitre et par type, pour estimer une traduction
  _aTraduire() {
    const chapitres = this.donnees?.jeu?.chapitres || [];
    if (!chapitres.length) return '';
    const mots = t => (String(t || '').match(/[\p{L}\p{N}]+/gu) || []).length;
    const parQui = {};
    const lignes = chapitres.map(c => {
      let dialogues = 0, choix = 0, descriptions = 0, objets = 0;
      c.lieux.forEach(l => {
        descriptions += mots(l.description) + mots(l.nom);
        objets += (l.objets || []).reduce((t, o) => t + mots(typeof o === 'string' ? o : o?.nom), 0);
        (l.dialogue || []).forEach(d => { const n = mots(d.texte); if (d.type === 'choix') choix += n; else { dialogues += n; parQui[d.qui] = (parQui[d.qui] || 0) + n; } });
      });
      return { n: c.n, titre: c.titre || '', dialogues, choix, descriptions, objets, total: dialogues + choix + descriptions + objets };
    });
    const total = lignes.reduce((t, l) => t + l.total, 0);
    return `<section class="an-carte">
      <div class="an-entete"><h2 class="an-titre">Mots à traduire</h2><span class="an-note">${total.toLocaleString('fr-FR')} mots dans tout le jeu</span></div>
      <p class="an-note">Pour demander un devis de traduction ou prévoir l'enregistrement des voix : les mots de chaque chapitre, par type de texte, et ceux de chaque personnage. Les descriptions longues des lieux ne sont comptées qu'en partie (240 premiers caractères).</p>
      <div class="an-table"><table><thead><tr><th scope="col">Chapitre</th><th scope="col">Dialogues</th><th scope="col">Choix</th><th scope="col">Lieux</th><th scope="col">Objets</th><th scope="col">Total</th></tr></thead>
      <tbody>${lignes.map(l => `<tr><td>${esc(String(l.n))}${l.titre ? ` · ${esc(l.titre)}` : ''}</td><td>${l.dialogues}</td><td>${l.choix}</td><td>${l.descriptions}</td><td>${l.objets}</td><td><strong>${l.total}</strong></td></tr>`).join('')}</tbody></table></div>
      <p class="an-note">Par personnage (voix à enregistrer) : ${Object.entries(parQui).sort((a, b) => b[1] - a[1]).map(([q, n]) => `${esc(q)} ${n}`).join(' · ') || '—'}</p>
    </section>`;
  },

  _carte() {
    const { c, liste } = this._chapitreCourant();
    if (!c) return this._vide('Aucun lieu dans ce choix. Importe le script du jeu dans Config → Projets.');
    const pos = this._disposition(c);
    const index = new Map(c.lieux.map((l, i) => [l.nom.toLowerCase(), i]));
    const sel = c.lieux.find(l => l.id === this.lieu) || c.lieux[0];
    const liens = c.lieux.flatMap((l, i) => l.sorties.map(s => [i, index.get(s.vers.toLowerCase()), s.si.length > 0]).filter(([, j]) => j !== undefined));
    const entrer = c.lieux.flatMap(l => l.sorties.filter(s => s.vers.toLowerCase() === sel.nom.toLowerCase()).map(s => (s.si.length ? `depuis ${l.nom}, avec ${s.si.join(' + ')}` : `depuis ${l.nom}`)));
    const inutiles = c.objets.filter(o => o.trouve.length && !o.sert.length);
    const impossibles = c.objets.filter(o => o.sert.length && !o.obtenu);
    // Le plus grave d'abord : un joueur coincé, puis ce qu'il ne peut pas atteindre
    const alertes = [
      ...(c.blocages || []).map(b => ['Blocage possible', b.objet, `Il disparaît quand on s'en sert (${b.consomme.join(', ')}), mais il sert aussi ailleurs (${b.usages.join(', ')}) : un joueur qui l'utilise au mauvais endroit reste coincé.`]),
      ...c.lieux.filter(l => !l.atteint).map(l => ['Lieu inaccessible', l.nom, 'Aucun chemin n\'y mène avec les objets que le joueur peut trouver.']),
      ...impossibles.map(o => ['Objet introuvable', o.nom, `Il est demandé (${o.sert.join(', ')}) mais le joueur ne peut jamais l'avoir : la suite est bloquée.`]),
      ...inutiles.map(o => ['Objet jamais utilisé', o.nom, `Trouvé ${o.trouve.join(', ')}, utilisé nulle part. Objet décoratif, ou énigme oubliée ?`]),
      ...c.orphelines.map(o => ['Sortie vers nulle part', `${o.de} → ${o.vers}`, 'Ce lieu n\'existe pas dans le chapitre : nom mal écrit ?']),
    ];
    return `
      ${this._enteteChapitre(c, liste)}
      <div class="sb-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Carte des lieux</h2><span class="an-note">${c.lieux.length} lieux · ${c.objets.length} objets · ≈ ${c.minutes} min de jeu</span></div>
          <svg class="jeu-carte" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${liens.map(([i, j, cond]) => `<line x1="${pos[i].x}" y1="${pos[i].y}" x2="${pos[j].x}" y2="${pos[j].y}" class="${cond ? 'cond' : ''}"/>`).join('')}</svg>
          <div class="jeu-noeuds">${c.lieux.map((l, i) => `<button type="button" class="jeu-lieu ${l.atteint ? '' : 'jamais'} ${l.id === sel.id ? 'actif' : ''}" style="left:${pos[i].x}%;top:${pos[i].y}%" onclick="Genres.choisirLieu(${l.id})">${esc(l.nom)}</button>`).join('')}</div>
          <p class="an-note">Trait plein : passage libre. Trait orange : il faut un objet. Lieu grisé : jamais atteignable. Le départ est le premier lieu du chapitre.</p>
        </section>
        <section class="an-carte sb-detail">
          <div class="an-entete"><h2 class="an-titre">${esc(sel.nom)}</h2>${Ecriture._lien('Ouvrir', 'ouvrirEpisode', sel.id)}</div>
          ${sel.description ? `<p class="an-note vo-brut">${esc(sel.description)}</p>` : ''}
          <span class="an-label">Pour y entrer</span><p class="vo-brut sb-texte">${esc(sel === c.lieux[0] ? 'C\'est le départ.' : entrer.join(' · ') || 'Aucun passage n\'y mène.')}</p>
          <span class="an-label">Ce qu'on y trouve</span><p class="vo-brut sb-texte">${esc([...sel.objets, ...sel.donne.map(d => `${d.objet} (dialogue)`)].join(', ') || 'rien')}</p>
          <span class="an-label">Sorties</span><p class="vo-brut sb-texte">${esc(sel.sorties.map(s => s.vers + (s.si.length ? ` (avec ${s.si.join(' + ')})` : '')).join(', ') || 'aucune')}</p>
          <span class="an-label">Personnages</span><p class="vo-brut sb-texte">${esc(sel.persos.join(', ') || 'personne')}</p>
        </section>
      </div>
      <div class="sb-controles">${alertes.slice(0, 8).map(([t, v, d]) => `<section class="an-carte"><span class="an-label">${esc(t)}</span><strong class="sb-chiffre ec-orange vo-brut">${esc(v)}</strong><p class="an-note">${esc(d)}</p></section>`).join('') || '<section class="an-carte"><p class="an-note">Tout est atteignable, et chaque objet sert quelque part.</p></section>'}</div>
    `;
  },

  _enigmes() {
    const { c, liste } = this._chapitreCourant();
    if (!c) return this._vide('Aucun lieu dans ce choix.');
    const faites = new Set(c.etapes.filter(e => e.type === 'combo').map(e => `${e.lieu}|${e.texte}`));
    const restees = c.lieux.flatMap(l => l.combos.filter(x => !faites.has(`${l.nom}|${x.titre}`)).map(x => ({ l, x })));
    const fermees = c.lieux.filter(l => l.atteint).flatMap(l => l.sorties.filter(s => s.si.length && s.existe && !c.lieux.find(x => x.nom.toLowerCase() === s.vers.toLowerCase())?.atteint).map(s => ({ l, s })));
    return `
      ${this._enteteChapitre(c, liste)}
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Le chemin du joueur</h2><span class="an-note">${c.etapes.length} étape(s) pour aller au bout de ce qui est atteignable</span></div>
        <ol class="jeu-etapes">${c.etapes.map(e => `<li><span class="vo-brut"><strong>${esc(e.lieu)}</strong> · ${esc(e.texte)}</span><span class="an-note vo-brut">avec ${esc(e.avec.join(' + '))}${e.donne ? ` → ${esc(e.donne)}` : ''}</span></li>`).join('') || '<li class="an-note">Aucune énigme ni passage à débloquer : tout est libre.</li>'}</ol>
      </section>
      ${restees.length || fermees.length ? `<section class="an-carte"><h2 class="an-titre">Jamais résolu</h2><ul class="ec-liste">
        ${restees.map(({ l, x }) => `<li class="ec-orange"><span class="vo-brut">${esc(l.nom)} · ${esc(x.titre)}</span><span class="vo-brut">il manque ${esc(x.entree.filter(o => !c.inventaire.includes(o)).join(' + ') || 'l\'accès au lieu')}</span></li>`).join('')}
        ${fermees.map(({ l, s }) => `<li class="ec-orange"><span class="vo-brut">${esc(l.nom)} → ${esc(s.vers)}</span><span class="vo-brut">il manque ${esc(s.si.filter(o => !c.inventaire.includes(o)).join(' + '))}</span></li>`).join('')}
      </ul></section>` : ''}
    `;
  },

  _dialogues() {
    const { c, liste } = this._chapitreCourant();
    if (!c) return this._vide('Aucun lieu dans ce choix.');
    const avec = c.lieux.filter(l => l.dialogue.length);
    if (!avec.length) return this._enteteChapitre(c, liste) + this._vide('Aucun dialogue dans ce chapitre. Dans un lieu : « NOM : réplique », puis « >> choix » pour les réponses du joueur.');
    const sel = avec.find(l => l.id === this.lieu) || avec[0];
    const inv = new Set(c.inventaire);
    let coupe = -1;
    const lignes = sel.dialogue.map(d => {
      // Une condition jamais remplie ferme la branche et tout ce qui est en retrait dessous
      if (coupe >= 0 && d.niv <= coupe) coupe = -1;
      const ferme = coupe >= 0 || d.si.some(o => !inv.has(o));
      if (coupe < 0 && d.si.some(o => !inv.has(o))) coupe = d.niv;
      return `<div class="jeu-ligne ${d.type} ${ferme ? 'ec-orange' : ''}" style="padding-left:${d.niv * 20}px"><span class="an-note">${d.type === 'choix' ? '»' : esc(d.qui)}</span><span class="vo-brut">${d.si.length ? `<em>[si ${esc(d.si.join(' + '))}]</em> ` : ''}${esc(d.texte)}</span></div>`;
    });
    const fermees = sel.dialogue.filter(d => d.si.some(o => !inv.has(o))).length;
    return `
      ${this._enteteChapitre(c, liste)}
      <div class="an-ligne">${this._pilules(avec.map(l => [l.id, l.nom]), sel.id, 'Genres.choisirLieu')}</div>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Dialogue · ${esc(sel.nom)}</h2><span class="an-note">${sel.dialogue.length} ligne(s)${fermees ? ` · <span class="ec-orange">${fermees} branche(s) jamais atteinte(s)</span>` : ''}</span></div>
        <div class="jeu-dialogue">${lignes.join('')}</div>
        <p class="an-note">En orange : une branche qu'aucun joueur ne peut atteindre, parce que l'objet de sa condition ne s'obtient nulle part dans le chapitre.</p>
      </section>
      ${this._aTraduire()}
    `;
  },

  _inventaire() {
    const { c, liste } = this._chapitreCourant();
    if (!c) return this._vide('Aucun lieu dans ce choix.');
    return `
      ${this._enteteChapitre(c, liste)}
      <section class="an-carte">
        <h2 class="an-titre">Inventaire</h2>
        <div class="an-table"><table>
          <thead><tr><th scope="col">Objet</th><th scope="col">Où on le trouve</th><th scope="col">À quoi il sert</th><th scope="col">Le joueur l'a</th></tr></thead>
          <tbody>${c.objets.map(o => `<tr class="${(!o.obtenu && o.sert.length) || (!o.sert.length && o.trouve.length) ? 'ec-orange' : ''}"><td class="vo-brut">${esc(o.nom)}</td><td class="vo-brut">${esc(o.trouve.join(', ') || 'nulle part')}</td><td class="vo-brut">${esc(o.sert.join(', ') || 'à rien')}</td><td>${o.obtenu ? 'oui' : 'jamais'}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="an-note">En orange : un objet demandé que le joueur ne peut jamais avoir, ou un objet qui ne sert à rien.</p>
      </section>
    `;
  },
};
