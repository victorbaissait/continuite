// assets/js/secrets.js — Qui sait quoi : les secrets de la série, qui les apprend, quand,
// et les répliques qui en parlent avant que le personnage ne le sache

const Secrets = {
  d: null,
  choisi: null,
  ajout: { nom: '', ep: '' },
  epPublic: '',
  epIronie: null,

  async monter(slot) {
    this.slot = slot;
    if (!this.d) slot.innerHTML = '<p class="an-note">Lecture des scripts…</p>';
    await this.charger();
  },

  async charger() {
    try {
      this.d = await api.get('secrets');
    } catch (e) {
      if (this.slot?.isConnected) this.slot.innerHTML = '<p class="an-note">Impossible de lire les secrets.</p>';
      return;
    }
    if (!this.d.secrets.some(s => s.id === this.choisi)) this.choisi = this.d.secrets[0]?.id || null;
    this.rendre();
  },

  _secret() {
    return this.d?.secrets.find(s => s.id === this.choisi) || null;
  },

  _ep(id) {
    return this.d.episodes.find(e => e.id === +id);
  },

  // « S01E03 · sc. 2 », lisible partout
  _moment(q) {
    if (q === 'depart') return 'dès le départ';
    const e = this._ep(q.ep);
    return e ? `${e.code} · sc. ${q.i}` : 'épisode supprimé';
  },

  _couleur(nom) {
    return this.d.personnages.find(p => p.nom === nom)?.couleur || 'var(--text3)';
  },

  // Les colonnes du tableau : les personnages qui savent quelque chose, puis les principaux
  _colonnes() {
    const notes = new Set(this.d.secrets.flatMap(s => Object.keys(s.savent)));
    const presents = this.d.personnages.filter(p => p.scenes > 0).map(p => p.nom);
    return [...new Set([...this.d.personnages.map(p => p.nom).filter(n => notes.has(n)), ...presents.slice(0, 8)])].slice(0, 14);
  },

  rendre() {
    const slot = this.slot;
    if (!slot?.isConnected || !this.d) return;
    const secrets = this.d.secrets;
    const an = this.d.analyse || {};
    if (!secrets.length) {
      slot.innerHTML = `<div class="empty-state"><div class="empty-icon">🤫</div><div class="empty-title">Aucun secret noté</div>
        <div class="empty-sub">Note une information que tous les personnages ne connaissent pas (« Paul a cassé le vase »), avec quelques mots-clés. L'app cherche ensuite dans les répliques qui en parle, et signale ceux qui en parlent avant de l'avoir appris.</div>
        <button type="button" class="btn btn-primary" onclick="Secrets.creer()">+ Noter un secret</button></div>`;
      return;
    }
    const cols = this._colonnes();
    const nbAlertes = s => (an[s.id]?.alertes.filter(a => a.type === 'tot').length || 0) + (an[s.id]?.absents.length || 0);
    const tableau = `<div class="an-table sc-table"><table>
      <thead><tr><th scope="col">Secret</th><th scope="col" class="sc-public">Public</th>${cols.map(n => `<th scope="col"><span class="sc-pastille" style="background:${esc(this._couleur(n))}"></span>${esc(n)}</th>`).join('')}</tr></thead>
      <tbody>${secrets.map(s => `<tr class="${s.id === this.choisi ? 'actif' : ''}">
        <th scope="row"><button type="button" class="sc-ligne" onclick="Secrets.choisir('${s.id}')" aria-pressed="${s.id === this.choisi}">${esc(s.texte)}${nbAlertes(s) ? ` <span class="sc-alerte" title="Incohérences à vérifier">⚠ ${nbAlertes(s)}</span>` : ''}</button></th>
        <td class="sc-public ${s.public ? 'sait' : ''}">${s.public ? esc(s.public === 'depart' ? '●' : this._moment(s.public).split(' · ')[0]) : '·'}</td>
        ${cols.map(n => { const q = s.savent[n]; return `<td class="${q ? 'sait' : ''}">${q ? esc(q === 'depart' ? '●' : this._moment(q).split(' · ')[0]) : '<span aria-label="ne sait pas">·</span>'}</td>`; }).join('')}
      </tr>`).join('')}</tbody></table></div>`;
    slot.innerHTML = `
      <div class="ct-grille sc-grille">
        <div class="sc-colonne">
        <section class="ct-zone" aria-label="Qui sait quoi">
          <div class="ct-entete">
            <h3 class="an-label">Qui sait quoi · ${secrets.length} secret${secrets.length > 1 ? 's' : ''}</h3>
            <button type="button" class="btn btn-secondary btn-sm" onclick="Secrets.creer()">+ Secret</button>
          </div>
          ${tableau}
          <p class="an-note">● : le sait dès le départ. Un code d'épisode : l'apprend dans cet épisode. « Public » : quand le spectateur l'apprend. Clique sur un secret pour noter qui le sait et voir les répliques qui en parlent.</p>
        </section>
        ${this._ironie()}
        </div>
        <aside class="ct-cote">${this._detail()}</aside>
      </div>`;
  },

  _detail() {
    const s = this._secret();
    if (!s) return '<section class="ct-bloc"><p class="an-note">Choisis un secret.</p></section>';
    const a = this.d.analyse?.[s.id] || { alertes: [], suggestions: [], absents: [], mentions: 0 };
    const lieu = x => `${esc(x.code)} · sc. ${x.i}${x.slug ? ` <span class="an-note">${esc(x.slug)}</span>` : ''}`;
    const json = v => esc(JSON.stringify(v));
    const savent = Object.entries(s.savent);
    const ep = this._ep(this.ajout.ep);
    const tot = a.alertes.filter(x => x.type === 'tot');
    const jamais = a.alertes.filter(x => x.type === 'jamais');
    return `
      <section class="ct-bloc">
        <label class="an-label" for="sc-texte">Le secret</label>
        <textarea id="sc-texte" rows="2" maxlength="300" onchange="Secrets.modifier({ texte: this.value })">${esc(s.texte)}</textarea>
        <label class="an-label" for="sc-mots">Mots-clés, séparés par des virgules</label>
        <input id="sc-mots" type="text" value="${esc(s.mots.join(', '))}" placeholder="vase, cassé" onchange="Secrets.modifier({ mots: this.value })">
        <p class="an-note">${s.mots.length ? `${a.mentions} réplique${a.mentions > 1 ? 's' : ''} en parle${a.mentions > 1 ? 'nt' : ''}.` : 'Sans mot-clé, l’app ne peut pas chercher les répliques qui en parlent.'}</p>
        <button type="button" class="btn btn-ghost btn-sm sc-retirer" onclick="Secrets.retirer()">Supprimer ce secret</button>
      </section>
      <section class="ct-bloc" aria-labelledby="sc-pub">
        <h3 id="sc-pub" class="an-label">Le public l'apprend</h3>
        <p class="an-note">${s.public ? `<strong>${esc(this._moment(s.public))}</strong>` : 'Pas encore noté.'}</p>
        <div class="sc-ajout">
          <select id="sc-pub-ep" aria-label="Quand le public l'apprend" onchange="Secrets.epPublic = this.value; Secrets.rendre()">
            <option value="" ${this.epPublic === '' ? 'selected' : ''}>Dès le départ</option>
            ${this.d.episodes.filter(e => e.scenes.length).map(e => `<option value="${e.id}" ${+this.epPublic === e.id ? 'selected' : ''}>${esc(e.code)}${e.titre ? ` · ${esc(e.titre.slice(0, 40))}` : ''}</option>`).join('')}
          </select>
          ${this._ep(this.epPublic) ? `<select id="sc-pub-scene" aria-label="Scène">${this._ep(this.epPublic).scenes.map(x => `<option value="${x.i}">sc. ${x.i} · ${esc(x.slug.slice(0, 50))}</option>`).join('')}</select>` : ''}
          <div class="an-ligne">
            <button type="button" class="btn btn-primary btn-sm" onclick="Secrets.noterPublic()">Noter</button>
            ${s.public ? '<button type="button" class="btn btn-ghost btn-sm" onclick="Secrets.public(null)">Le public ne le sait pas</button>' : ''}
          </div>
        </div>
      </section>
      <section class="ct-bloc" aria-labelledby="sc-qui">
        <h3 id="sc-qui" class="an-label">Qui le sait (${savent.length})</h3>
        ${savent.length ? `<ul class="sc-liste">${savent.map(([n, q]) => `<li><span class="sc-pastille" style="background:${esc(this._couleur(n))}"></span><strong>${esc(n)}</strong> <span class="an-note">${esc(this._moment(q))}</span>
          <button type="button" class="btn btn-ghost btn-sm" aria-label="${esc(n)} ne le sait plus" onclick="Secrets.savoir(${json(n)}, null)">✕</button></li>`).join('')}</ul>` : '<p class="an-note">Personne pour l\'instant.</p>'}
        <div class="sc-ajout">
          <select id="sc-nom" aria-label="Personnage" onchange="Secrets.ajout.nom = this.value">
            <option value="">Personnage…</option>
            ${this.d.personnages.filter(p => !s.savent[p.nom] && (p.scenes || p.couleur)).map(p => `<option ${p.nom === this.ajout.nom ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}
          </select>
          <select id="sc-ep" aria-label="Quand" onchange="Secrets.ajout.ep = this.value; Secrets.rendre()">
            <option value="">Dès le départ</option>
            ${this.d.episodes.filter(e => e.scenes.length).map(e => `<option value="${e.id}" ${+this.ajout.ep === e.id ? 'selected' : ''}>${esc(e.code)}${e.titre ? ` · ${esc(e.titre.slice(0, 40))}` : ''}</option>`).join('')}
          </select>
          ${ep ? `<select id="sc-scene" aria-label="Scène">${ep.scenes.map(x => `<option value="${x.i}">sc. ${x.i} · ${esc(x.slug.slice(0, 50))}${this.ajout.nom && !x.qui.includes(this.ajout.nom) ? ' (absent)' : ''}</option>`).join('')}</select>` : ''}
          <button type="button" class="btn btn-primary btn-sm" onclick="Secrets.noter()">Noter</button>
        </div>
      </section>
      ${tot.length || a.absents.length ? `<section class="ct-bloc gr-alerte eteint" aria-labelledby="sc-inc">
        <h3 id="sc-inc" class="an-label">⚠ À vérifier</h3>
        ${tot.map(x => `<p><strong>${esc(x.nom)}</strong> en parle en ${lieu(x)} mais ne l'apprend qu'en ${esc(this._moment(s.savent[x.nom]))}.<br><q class="sc-extrait">${esc(x.extrait)}</q>
          <br><button type="button" class="btn btn-ghost btn-sm" onclick="Secrets.savoir(${json(x.nom)}, ${json({ ep: x.ep, i: x.i })})">Il l'apprend plutôt ici</button></p>`).join('')}
        ${a.absents.map(x => `<p><strong>${esc(x.nom)}</strong> : noté${x.code ? ` en ${esc(x.code)}` : ''}, mais ${esc(x.raison)}.</p>`).join('')}
      </section>` : ''}
      ${jamais.length ? `<section class="ct-bloc gr-alerte" aria-labelledby="sc-jamais">
        <h3 id="sc-jamais" class="an-label">En parlent sans être notés</h3>
        ${jamais.slice(0, 8).map(x => `<p><strong>${esc(x.nom)}</strong> · ${lieu(x)}<br><q class="sc-extrait">${esc(x.extrait)}</q>
          <br><button type="button" class="btn btn-ghost btn-sm" onclick="Secrets.savoir(${json(x.nom)}, 'depart')">Le savait déjà</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Secrets.savoir(${json(x.nom)}, ${json({ ep: x.ep, i: x.i })})">L'apprend ici</button></p>`).join('')}
      </section>` : ''}
      ${a.suggestions.length ? `<section class="ct-bloc gr-alerte nouveau" aria-labelledby="sc-sugg">
        <h3 id="sc-sugg" class="an-label">L'ont peut-être entendu</h3>
        ${a.suggestions.slice(0, 8).map(x => `<p><strong>${esc(x.nom)}</strong> est là quand ${esc(x.par)} en parle, en ${lieu(x)}.<br><q class="sc-extrait">${esc(x.extrait)}</q>
          <br><button type="button" class="btn btn-ghost btn-sm" onclick="Secrets.savoir(${json(x.nom)}, ${json({ ep: x.ep, i: x.i })})">L'apprend ici</button></p>`).join('')}
      </section>` : ''}`;
  },

  // La tension de chaque épisode : la part de ses scènes où le public en sait plus qu'un personnage présent
  _ironie() {
    const ir = this.d.ironie || [];
    if (!this.d.secrets.some(s => s.public)) {
      return '<section class="ct-zone" aria-label="Ironie dramatique"><h3 class="an-label">Ironie dramatique</h3><p class="an-note">Note quand le public apprend chaque secret (dans la fiche du secret) : l’app montrera les scènes où le spectateur en sait plus que les personnages présents. C\'est le moteur des quiproquos.</p></section>';
    }
    const max = Math.max(...ir.map(x => x.scenes.length / Math.max(1, x.total)), 0.01);
    const choisi = ir.find(x => x.ep === this.epIronie) || ir.reduce((a, b) => (b.scenes.length > (a?.scenes.length ?? -1) ? b : a), null);
    const texte = id => this.d.secrets.find(s => s.id === id)?.texte || '';
    const plats = ir.filter(x => !x.scenes.length).length;
    // Une barre par épisode, à hauteur de la part de scènes sous tension ; une seule teinte
    const barres = ir.map(x => {
      const v = x.scenes.length / Math.max(1, x.total), e = this._ep(x.ep);
      return `<button type="button" class="sc-barre ${x === choisi ? 'actif' : ''}" style="--h:${Math.round(4 + 96 * v / max)}%" aria-pressed="${x === choisi}" title="${esc(e?.code || '')} : ${x.scenes.length} scène(s) sur ${x.total} avec ironie" onclick="Secrets.epIronie = ${x.ep}; Secrets.rendre()"><span class="sr-only">${esc(e?.code || '')}</span></button>`;
    }).join('');
    const ep = choisi && this._ep(choisi.ep);
    return `<section class="ct-zone" aria-label="Ironie dramatique">
      <div class="ct-entete"><h3 class="an-label">Ironie dramatique</h3><span class="an-note">${plats} épisode${plats > 1 ? 's' : ''} sans aucune scène où le public en sait plus</span></div>
      <div class="sc-courbe" role="group" aria-label="Part des scènes sous tension, épisode par épisode">${barres}</div>
      ${ep ? `<h4 class="an-label">${esc(ep.code)}${ep.titre ? ` · ${esc(ep.titre)}` : ''} : ${choisi.scenes.length} scène${choisi.scenes.length > 1 ? 's' : ''} sur ${choisi.total}</h4>
        ${choisi.scenes.length ? `<ul class="sc-liste sc-tension">${choisi.scenes.map(sc => `<li><strong>sc. ${sc.i}</strong> <span class="an-note">${esc(sc.slug)}</span>${sc.ecarts.map(([id, noms]) => `<br>${esc(noms.join(', '))} ${noms.length > 1 ? 'ne savent' : 'ne sait'} pas que « ${esc(texte(id))} »`).join('')}</li>`).join('')}</ul>` : '<p class="an-note">Ici, le public n\'en sait jamais plus que les personnages : un secret à lui confier plus tôt ?</p>'}` : ''}
      <p class="an-note">Chaque barre : la part des scènes de l'épisode où le public connaît un secret qu'un personnage présent ignore. Clique pour voir lesquelles.</p>
    </section>`;
  },

  public(quand) {
    const s = this._secret();
    if (s) this._envoyer({ action: 'public', id: s.id, quand });
  },

  noterPublic() {
    const ep = document.getElementById('sc-pub-ep')?.value;
    const quand = ep ? { ep: +ep, i: +(document.getElementById('sc-pub-scene')?.value || 0) } : 'depart';
    this.epPublic = '';
    this.public(quand);
  },

  choisir(id) {
    this.choisi = id;
    this.ajout = { nom: '', ep: '' };
    this.epPublic = '';
    this.rendre();
  },

  async _envoyer(corps) {
    if (this._occupe) return null;
    this._occupe = true;
    try {
      const r = await api.post('secrets', corps).catch(() => ({ error: 'Le serveur ne répond pas.' }));
      if (r.error) { toast(r.error, 'error'); return null; }
      await this.charger();
      return r;
    } finally {
      this._occupe = false;
    }
  },

  async creer() {
    const texte = prompt('Le secret, en une phrase (ex. : Paul a cassé le vase)');
    if (texte === null || !texte.trim()) return;
    const mots = prompt('Quelques mots-clés que les personnages diraient en en parlant, séparés par des virgules', '') || '';
    const avant = new Set(this.d?.secrets.map(s => s.id));
    if (await this._envoyer({ action: 'creer', texte: texte.trim(), mots: mots.split(',') })) {
      this.choisi = this.d.secrets.find(s => !avant.has(s.id))?.id || this.choisi;
      this.rendre();
    }
  },

  modifier(champs) {
    const s = this._secret();
    if (s) this._envoyer({ action: 'modifier', id: s.id, ...champs });
  },

  async retirer() {
    const s = this._secret();
    if (!s || !confirm(`Supprimer le secret « ${s.texte} » ?`)) return;
    this.choisi = null;
    await this._envoyer({ action: 'retirer', id: s.id });
  },

  savoir(nom, quand) {
    const s = this._secret();
    if (s) this._envoyer({ action: 'savoir', id: s.id, nom, quand });
  },

  noter() {
    const nom = document.getElementById('sc-nom')?.value;
    if (!nom) { toast('Choisis un personnage.', 'error'); return; }
    const ep = document.getElementById('sc-ep')?.value;
    const quand = ep ? { ep: +ep, i: +(document.getElementById('sc-scene')?.value || 0) } : 'depart';
    this.ajout = { nom: '', ep: '' };
    this.savoir(nom, quand);
  },
};

// ─── Repères du calendrier : fêtes hors saison, jour de la semaine, chevauchements, âges, anniversaires ───

const Reperes = {
  d: null,

  async monter(slot) {
    this.slot = slot;
    slot.innerHTML = '<p class="an-note">Lecture des scripts…</p>';
    try {
      this.d = await api.get('calendrier');
    } catch (e) {
      slot.innerHTML = '<p class="an-note">Impossible de lire le calendrier.</p>';
      return;
    }
    this.rendre();
  },

  _code(id) {
    const e = this.d.episodes[id];
    if (!e) return '?';
    return typeof Roman !== 'undefined' && Roman.code && e.n ? Roman.code(e.s, e.n) : e.code;
  },

  _date(d) {
    return new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  },

  _moment(k) {
    return (typeof Frise !== 'undefined' && Frise.MOMENTS[k]?.label.toLowerCase()) || k;
  },

  _texte(a) {
    const c = id => `<strong>${esc(this._code(id))}</strong>`;
    switch (a.type) {
      case 'fete': {
        const de = /^le /.test(a.fete) ? a.fete.replace(/^le /, 'du ') : /^les /.test(a.fete) ? a.fete.replace(/^les /, 'des ') : /^[aeiouyhéèêâ]/i.test(a.fete) ? `d'${a.fete}` : `de ${a.fete}`;
        return `${c(a.ep)} se passe en ${esc(a.mois)}, mais on y parle ${esc(de)}.`;
      }
      case 'jour': return `${c(a.ep)} est daté un ${esc(a.vrai)}, mais on y dit qu'on est ${esc(a.dit)}.`;
      case 'chevauche': return `${c(a.ep)} et ${c(a.autre)} se passent tous deux le ${esc(this._date(a.date))}, ${esc(this._moment(a.moment))} : ${esc(a.qui.join(', '))} ${a.qui.length > 1 ? 'sont' : 'est'} dans les deux.`;
      case 'age': return `${esc(a.nom)} dit avoir ${a.dit} ans en ${c(a.ep)}, et avait déjà ${a.ditAvant} ans en ${c(a.avant)} : il ou elle en aurait plutôt ${a.attendu}.`;
      default: return '';
    }
  },

  rendre() {
    const slot = this.slot;
    if (!slot?.isConnected || !this.d) return;
    const d = this.d;
    if (!d.periode) {
      slot.innerHTML = `<div class="empty-state"><div class="empty-icon">⊷</div><div class="empty-title">Aucun épisode daté</div><div class="empty-sub">Donne une date dans l'histoire aux épisodes (dans leur fiche) : l’app vérifiera les fêtes, les jours de la semaine, les âges et les anniversaires.</div></div>`;
      return;
    }
    const groupes = [['fete', 'Fêtes et saisons hors de leur moment'], ['jour', 'Jour de la semaine'], ['chevauche', 'Deux épisodes au même moment'], ['age', 'Âges qui ne suivent pas le temps']];
    const json = v => esc(JSON.stringify(v));
    slot.innerHTML = `
      <div class="ct-grille">
        <div class="sc-colonne">
          <section class="ct-zone">
            <div class="ct-entete"><h3 class="an-label">Repères · du ${esc(this._date(d.periode.debut))} au ${esc(this._date(d.periode.fin))}</h3>
              ${d.ecartes ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Reperes.ecarter('', true)">Rétablir les ${d.ecartes} point(s) écarté(s)</button>` : ''}</div>
            <p class="an-note">L'app compare ce que disent les scripts aux dates des épisodes. ${d.sansDate ? `${d.sansDate} épisode(s) sans date ne sont pas vérifiés.` : ''} La continuité vérifie déjà les âges des fiches et les dates qui reculent.</p>
          </section>
          ${d.alertes.length ? groupes.map(([t, titre]) => {
            const liste = d.alertes.filter(a => a.type === t);
            return liste.length ? `<section class="ct-bloc gr-alerte eteint"><h3 class="an-label">${titre} (${liste.length})</h3>
              ${liste.map(a => `<p>${this._texte(a)}${a.extrait ? `<q class="sc-extrait">${esc(a.extrait)}</q>` : ''}<button type="button" class="btn btn-ghost btn-sm" onclick="Reperes.ecarter(${json(a.cle)})">Écarter</button></p>`).join('')}</section>` : '';
          }).join('') : '<section class="ct-bloc"><p class="an-note">Rien ne cloche : les fêtes, les jours et les âges tombent juste.</p></section>'}
        </div>
        <aside class="ct-cote">
          <section class="ct-bloc" aria-labelledby="rp-anniv">
            <h3 id="rp-anniv" class="an-label">Anniversaires pendant la série (${d.anniversaires.length})</h3>
            ${d.anniversaires.length ? `<ul class="sc-liste sc-tension">${d.anniversaires.map(a => `<li><strong>${esc(a.nom)}</strong> a ${a.age} ans · ${esc(this._date(a.date))}<br><span class="an-note">${a.eps.length ? `Ce jour-là : ${a.eps.map(id => esc(this._code(id))).join(', ')}.` : 'Aucun épisode ce jour-là.'} ${a.fete ? `On en parle en ${esc(this._code(a.fete))}.` : 'Personne n\'en parle : une idée d\'épisode ?'}</span></li>`).join('')}</ul>` : '<p class="an-note">Donne une date de naissance aux personnages (dans leur fiche) pour voir leurs anniversaires tomber dans la série.</p>'}
          </section>
        </aside>
      </div>`;
  },

  async ecarter(cle, tout = false) {
    const r = await api.post('calendrier', tout ? { tout: true } : { cle }).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    if (r.error) { toast(r.error, 'error'); return; }
    await this.monter(this.slot);
  },
};
