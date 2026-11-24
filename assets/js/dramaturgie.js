// assets/js/dramaturgie.js — Les états des personnages au fil des épisodes :
// ce qui change pour chacun (blessé, en couple, brouillé, parti) et ce qui le contredit dans les scripts
'use strict';

const ETATS_TYPES = {
  situation: { l: 'Situation', aide: 'Un rappel pendant l\'écriture : blessé, en couple, au chômage…' },
  absent: { l: 'Absent', aide: 'Il ne doit pas parler : en voyage, en prison, à l\'hôpital…' },
  brouille: { l: 'Brouillé', aide: 'Avec un autre personnage : une scène commune est à vérifier.' },
};

const Etats = {
  d: null,
  choisi: null,

  async monter(slot) {
    this.slot = slot;
    if (!this.d) slot.innerHTML = '<p class="an-note">Lecture des scripts…</p>';
    try {
      this.d = await api.get('etats');
    } catch (e) {
      if (slot.isConnected) slot.innerHTML = '<p class="an-note">Impossible de lire les états.</p>';
      return;
    }
    if (!this.d.etats.some(s => s.id === this.choisi)) this.choisi = this.d.etats[0]?.id || null;
    this.rendre();
  },

  _ep(id) {
    return this.d.episodes.find(e => e.id === +id);
  },

  _couleur(nom) {
    return couleurSure(this.d.personnages.find(p => p.nom === nom)?.couleur, 'var(--text3)');
  },

  // Les états en cours à un épisode : commencés avant ou à cet épisode, pas encore finis
  actifs(d, epId) {
    const rang = new Map(d.episodes.map(e => [e.id, e.rang]));
    const ici = rang.get(+epId);
    if (ici === undefined) return [];
    return d.etats.filter(s => rang.has(s.debut) && rang.get(s.debut) <= ici && (s.fin === null || !rang.has(s.fin) || ici < rang.get(s.fin)));
  },

  _resume(s) {
    const t = s.texte || ETATS_TYPES[s.type].l.toLowerCase();
    return s.type === 'brouille' ? `${t} (avec ${s.avec})` : t;
  },

  _periode(s) {
    const a = this._ep(s.debut), b = s.fin ? this._ep(s.fin) : null;
    return `${a ? a.code : '?'} → ${b ? `${b.code} (exclu)` : 'la fin'}`;
  },

  _alertes(s) {
    return this.d.alertes.filter(a => a.etat === s.id);
  },

  rendre() {
    const slot = this.slot;
    if (!slot?.isConnected || !this.d) return;
    const etats = this.d.etats;
    if (!etats.length) {
      slot.innerHTML = `<div class="empty-state"><div class="empty-icon">🩹</div><div class="empty-title">Aucun état noté</div>
        <div class="empty-sub">Note ce qui change pour un personnage et pendant combien d'épisodes : Paul a le bras cassé, Marie est partie à Lyon, Léa et Tom sont fâchés. L'app le rappelle dans la Mémoire de l'écriture, et signale un absent qui parle ou deux brouillés qui partagent une scène.</div>
        <button type="button" class="btn btn-primary" onclick="Etats.creer()">+ Noter un état</button></div>`;
      return;
    }
    const eps = this.d.episodes;
    const rang = new Map(eps.map(e => [e.id, e.rang]));
    // La frise se resserre sur les épisodes où il y a des états, avec un peu de marge
    const bornes = etats.flatMap(x => [rang.get(x.debut), x.fin && rang.has(x.fin) ? rang.get(x.fin) : eps.length]).filter(v => v !== undefined);
    const lo = Math.max(0, Math.min(...bornes) - 2), hi = Math.min(eps.length, Math.max(...bornes) + 2);
    const n = Math.max(hi - lo, 1);
    const pos = id => Math.min(100, Math.max(0, ((rang.has(id) ? rang.get(id) : eps.length) - lo) * 100 / n));
    // Quelques épisodes en repères sous la frise
    const pas = Math.max(1, Math.ceil(n / 6));
    const reperes = eps.slice(lo, hi).filter((e, i) => i % pas === 0);
    const parPerso = new Map();
    etats.forEach(s => parPerso.set(s.nom, [...(parPerso.get(s.nom) || []), s]));
    const nbAlertes = this.d.alertes.length;
    const s = etats.find(x => x.id === this.choisi) || etats[0];

    slot.innerHTML = `
      <div class="ct-grille et-grille">
        <section class="ct-zone" aria-label="États des personnages">
          <div class="ct-entete">
            <h3 class="an-label">États · ${etats.length}${nbAlertes ? ` · <span class="ec-orange">${nbAlertes} à vérifier</span>` : ''}</h3>
            <button type="button" class="btn btn-secondary btn-sm" onclick="Etats.creer()">+ État</button>
          </div>
          <div class="et-frise">
            ${[...parPerso.entries()].map(([nom, liste]) => `
              <div class="et-perso">
                <span class="et-nom"><span class="sc-pastille" style="background:${this._couleur(nom)}"></span>${esc(nom)}</span>
                <div class="et-piste">${liste.map(x => {
                  const g = pos(x.debut), dr = x.fin ? pos(x.fin) : 100;
                  const al = this._alertes(x).length;
                  return `<button type="button" class="et-bande et-${x.type} ${x.id === s.id ? 'actif' : ''}" style="left:${g.toFixed(2)}%;width:${Math.max(dr - g, 0.8).toFixed(2)}%" title="${esc(`${this._resume(x)} · ${this._periode(x)}`)}" aria-pressed="${x.id === s.id}" onclick="Etats.choisir('${x.id}')"><span>${esc(this._resume(x))}${al ? ' ⚠' : ''}</span></button>`;
                }).join('')}</div>
              </div>`).join('')}
            <div class="et-perso et-axe"><span class="et-nom"></span><div class="et-piste">${reperes.map(e => `<span style="left:${pos(e.id).toFixed(2)}%">${esc(e.code)}</span>`).join('')}</div></div>
          </div>
          <div class="an-ligne an-note">${Object.entries(ETATS_TYPES).map(([k, t]) => `<span><span class="et-puce et-${k}"></span> ${t.l} : ${esc(t.aide)}</span>`).join('')}</div>
        </section>
        <aside class="ct-zone et-detail" aria-label="État choisi">${this._detail(s)}</aside>
      </div>`;
  },

  _optionsEps(valeur, vide) {
    let saison = null;
    let html = vide ? `<option value="">${esc(vide)}</option>` : '';
    this.d.episodes.forEach(e => {
      if (e.saison !== saison) { html += `${saison !== null ? '</optgroup>' : ''}<optgroup label="Saison ${e.saison}">`; saison = e.saison; }
      html += `<option value="${e.id}" ${e.id === valeur ? 'selected' : ''}>${esc(e.code)}${e.titre ? ` · ${esc(e.titre.slice(0, 40))}` : ''}</option>`;
    });
    return html + (saison !== null ? '</optgroup>' : '');
  },

  _optionsNoms(valeur, vide) {
    const noms = this.d.personnages.map(p => p.nom);
    if (valeur && !noms.includes(valeur)) noms.unshift(valeur);
    return `<option value="">${esc(vide)}</option>${noms.map(nom => `<option value="${esc(nom)}" ${nom === valeur ? 'selected' : ''}>${esc(nom)}</option>`).join('')}`;
  },

  _detail(s) {
    const alertes = this._alertes(s);
    const quoi = s.type === 'absent' ? `${s.nom} parle alors qu'il est noté absent` : `${s.nom} et ${s.avec} partagent une scène`;
    return `
      <div class="ct-entete"><h3 class="an-label">${esc(s.nom || 'Nouvel état')}</h3><button type="button" class="btn btn-ghost btn-sm" onclick="Etats.retirer()">Supprimer</button></div>
      <div class="et-form">
        <label class="an-label" for="et-nom">Personnage</label>
        <select id="et-nom" onchange="Etats.modifier({ nom: this.value })">${this._optionsNoms(s.nom, 'Choisir…')}</select>
        <label class="an-label" for="et-type">Type</label>
        <select id="et-type" onchange="Etats.modifier({ type: this.value })">${Object.entries(ETATS_TYPES).map(([k, t]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${t.l}</option>`).join('')}</select>
        ${s.type === 'brouille' ? `<label class="an-label" for="et-avec">Avec</label>
        <select id="et-avec" onchange="Etats.modifier({ avec: this.value })">${this._optionsNoms(s.avec, 'Choisir…')}</select>` : ''}
        <label class="an-label" for="et-texte">Ce qui se passe</label>
        <input id="et-texte" type="text" maxlength="200" placeholder="${s.type === 'absent' ? 'Parti à Lyon' : s.type === 'brouille' ? 'Fâchés depuis la dispute du vase' : 'A le bras dans le plâtre'}" value="${esc(s.texte)}" onchange="Etats.modifier({ texte: this.value })">
        <label class="an-label" for="et-debut">À partir de</label>
        <select id="et-debut" onchange="Etats.modifier({ debut: Number(this.value) })">${this._optionsEps(s.debut)}</select>
        <label class="an-label" for="et-fin">Cesse à</label>
        <select id="et-fin" onchange="Etats.modifier({ fin: Number(this.value) || null })">${this._optionsEps(s.fin, "Dure jusqu'à la fin")}</select>
      </div>
      <p class="an-note">${esc(ETATS_TYPES[s.type].aide)} L'épisode où l'état cesse n'en fait plus partie.</p>
      ${s.type === 'situation' ? '' : alertes.length ? `
        <h3 class="an-label ec-orange">À vérifier · ${alertes.length} épisode${alertes.length > 1 ? 's' : ''}</h3>
        <ul class="ec-liste">${alertes.map(a => `<li><span>${esc(this._ep(a.ep)?.code || '?')} · sc. ${a.i} · ${esc(a.slug)}</span><span class="an-note">${a.n > 1 ? `${a.n} scènes` : '1 scène'}</span></li>`).join('')}</ul>
        <p class="an-note">${esc(quoi)}. Si c'est voulu (un appel, une réconciliation), raccourcis l'état.</p>`
        : '<p class="an-note">Rien ne le contredit dans les scripts.</p>'}`;
  },

  choisir(id) {
    this.choisi = id;
    this.rendre();
  },

  async _envoyer(corps) {
    const res = await api.post('etats', corps).catch(() => ({ error: 'Le serveur ne répond pas.' }));
    if (res?.error) { toast(res.error, 'error'); this.rendre(); return null; }
    this.d = res;
    // La Mémoire de l'écriture relira les états à sa prochaine ouverture
    if (typeof Ecriture !== 'undefined') Ecriture._et = undefined;
    return res;
  },

  async creer() {
    // Un nouvel état part du personnage choisi, ou du plus présent, au premier épisode
    const avant = this.d.etats.find(x => x.id === this.choisi);
    const nom = avant?.nom || this.d.personnages[0]?.nom || '';
    const debut = this.d.episodes[0]?.id;
    if (!nom || !debut) { toast('Il faut d\'abord des épisodes et des personnages', 'error'); return; }
    const ids = new Set(this.d.etats.map(x => x.id));
    if (!await this._envoyer({ action: 'creer', nom, debut, texte: '' })) return;
    this.choisi = this.d.etats.find(x => !ids.has(x.id))?.id || this.choisi;
    this.rendre();
    document.getElementById('et-texte')?.focus();
  },

  async modifier(champs) {
    const s = this.d.etats.find(x => x.id === this.choisi);
    if (!s) return;
    // Passer à « brouillé » demande un partenaire : le premier autre personnage, à changer ensuite
    if (champs.type === 'brouille' && !s.avec) champs.avec = this.d.personnages.find(p => p.nom !== s.nom)?.nom || '';
    if (await this._envoyer({ action: 'modifier', id: s.id, ...champs })) this.rendre();
  },

  async retirer() {
    const s = this.d.etats.find(x => x.id === this.choisi);
    if (!s || !confirm(`Supprimer l'état « ${this._resume(s)} » de ${s.nom} ?`)) return;
    if (await this._envoyer({ action: 'retirer', id: s.id })) {
      this.choisi = this.d.etats[0]?.id || null;
      this.rendre();
    }
  },
};
