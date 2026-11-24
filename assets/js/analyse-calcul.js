// assets/js/analyse-calcul.js — Recalcule toute l'analyse pour un ensemble d'épisodes libre.
// Reprend la logique de handleAnalyse (api/routes.php).
(function (root) {
  function combinaisons(arr, r) {
    if (r > arr.length || r === 0) return [];
    if (r === arr.length) return [arr.slice()];
    if (r === 1) return arr.map((x) => [x]);
    const res = [];
    const reste = arr.slice(1);
    for (const sub of combinaisons(reste, r - 1)) res.push([arr[0], ...sub]);
    for (const sub of combinaisons(reste, r)) res.push(sub);
    return res;
  }

  function listerMots(d, freq, nbEpisodes) {
    return [...freq.entries()].sort((a, b) => b[1] - a[1])
      .map(([i, n]) => ({ i, mot: d.vocab[i], nb: n, ep: nbEpisodes.get(i), verbe: d.verbesSet.has(i) }));
  }

  // Classement limité aux dialogues d'un personnage
  function motsPersonnage(d, eps, perso) {
    const freq = new Map(), nbEpisodes = new Map();
    for (const e of eps) {
      const w = e.vw?.[perso];
      if (!w) continue;
      for (let i = 0; i < w.length; i += 2) {
        freq.set(w[i], (freq.get(w[i]) || 0) + w[i + 1]);
        nbEpisodes.set(w[i], (nbEpisodes.get(w[i]) || 0) + 1);
      }
    }
    return listerMots(d, freq, nbEpisodes);
  }

  // Mots, répliques et vocabulaire de chaque personnage sur les épisodes choisis
  function agregerParole(eps) {
    const parole = new Map();
    for (const e of eps) {
      for (const nom in e.vr) {
        if (!parole.has(nom)) parole.set(nom, { nom, repliques: 0, mots: 0, compte: new Map() });
        const p = parole.get(nom);
        p.repliques += e.vr[nom][0];
        p.mots += e.vr[nom][1];
        const w = e.vw[nom];
        for (let i = 0; i < w.length; i += 2) p.compte.set(w[i], (p.compte.get(w[i]) || 0) + w[i + 1]);
      }
    }
    return parole;
  }

  // Mots d'un personnage, classés par fréquence ou par écart avec la référence
  function lexique(d, parole, nom, options) {
    const p = parole.get(nom);
    if (!p) return [];
    const reference = [...parole.values()].filter((x) => x.nom !== nom && (!options.reference || x.nom === options.reference));
    const totalReference = reference.reduce((a, x) => a + x.mots, 0) || 1;
    const prenoms = new Set(d.persos.filter((x) => x.g !== 'x').map((x) => x.n.split(' ')[0].toLowerCase()));
    const liste = [];
    for (const [i, n] of p.compte) {
      const mot = d.vocab[i];
      if (n < options.occurrences || mot.length < options.lettres || prenoms.has(mot)) continue;
      if (!options.verbes && d.verbesSet.has(i)) continue;
      if (options.masque(mot)) continue;
      const ailleurs = reference.reduce((a, x) => a + (x.compte.get(i) || 0), 0);
      liste.push({ mot, affiche: d.accents[i] || mot, n, ailleurs, score: ((n / p.mots) / ((ailleurs + 1) / totalReference)) * Math.log(n + 1) });
    }
    return liste.sort(options.mode === 'frequence' ? (a, b) => b.n - a.n : (a, b) => b.score - a.score);
  }

  // Qui emploie ce mot, et à quel rythme pour 1 000 mots
  function quiDit(d, parole, indexMot) {
    return [...parole.values()].filter((p) => p.compte.get(indexMot))
      .map((p) => ({ nom: p.nom, n: p.compte.get(indexMot), taux: (p.compte.get(indexMot) * 1000) / p.mots, mots: p.mots }))
      .sort((a, b) => b.n - a.n);
  }

  // Épisodes où un mot est prononcé, et par qui
  function episodesMot(eps, indexMot) {
    const liste = [];
    for (const e of eps) {
      const qui = [];
      for (const nom in e.vw) {
        const w = e.vw[nom];
        for (let i = 0; i < w.length; i += 2) {
          if (w[i] === indexMot) {
            qui.push({ nom, nb: w[i + 1] });
            break;
          }
        }
      }
      if (qui.length) liste.push({ e, nb: qui.reduce((a, x) => a + x.nb, 0), qui: qui.sort((a, b) => b.nb - a.nb) });
    }
    return liste;
  }

  // Répartition d'un mot par saison et ses épisodes les plus marqués
  function detailMot(d, eps, indexMot, perso) {
    const saisons = {}, episodes = [];
    for (const e of eps) {
      const w = perso ? e.vw?.[perso] : e.w;
      if (!w) continue;
      for (let i = 0; i < w.length; i += 2) {
        if (w[i] !== indexMot) continue;
        saisons[e.sa] = (saisons[e.sa] || 0) + w[i + 1];
        episodes.push({ e, nb: w[i + 1] });
        break;
      }
    }
    episodes.sort((a, b) => b.nb - a.nb);
    return { saisons, episodes };
  }

  function preparer(d) {
    d.verbesSet = new Set(d.verbes);
    d.parId = new Map(d.eps.map((e) => [e.id, e]));
    d.saisonCouleur = Object.fromEntries(d.saisons.map((s) => [s.n, s.c]));
    return d;
  }

  function analyser(d, ids) {
    const choisis = new Set(ids);
    const eps = d.eps.filter((e) => choisis.has(e.id));
    const nb = eps.length;
    const parPerso = new Map();
    const themes = new Map();
    const combos = new Map();
    const freq = new Map();
    const nbEpisodes = new Map();

    const totalRepliques = eps.reduce((s, e) => s + e.r, 0);
    const totalMots = eps.reduce((s, e) => s + e.m, 0);

    for (const e of eps) {
      for (const [pi, r, present] of e.pr) {
        if (!parPerso.has(pi)) {
          parPerso.set(pi, { id: pi, nom: d.persos[pi].n, g: d.persos[pi].g, total_repliques: 0, nb_presences: 0, duree: 0 });
        }
        const p = parPerso.get(pi);
        p.total_repliques += r;
        p.nb_presences += present;
        if (present && e.r > 0 && d.persos[pi].g !== 'x') p.duree += (e.d * r) / e.r;
      }
      for (const t of e.th) themes.set(t, (themes.get(t) || 0) + 1);
      for (let i = 0; i < e.w.length; i += 2) {
        freq.set(e.w[i], (freq.get(e.w[i]) || 0) + e.w[i + 1]);
        nbEpisodes.set(e.w[i], (nbEpisodes.get(e.w[i]) || 0) + 1);
      }

      const presents = e.pr.filter((x) => x[2] && d.persos[x[0]].g !== 'x');
      const repl = new Map(presents.map((x) => [d.persos[x[0]].n, x[1]]));
      const noms = [...repl.keys()].sort();
      const scenes = e.sc.map((s) => new Set(s[3].map((pi) => d.persos[pi].n)));
      for (let t = 2; t <= Math.min(noms.length, 6); t++) {
        for (const c of combinaisons(noms, t)) {
          const cle = c.join('||');
          if (!combos.has(cle)) combos.set(cle, { persos: c, taille: t, nb_episodes: 0, nb_repliques: 0, nb_scenes: 0, duree_min: 0 });
          const x = combos.get(cle);
          x.nb_episodes++;
          for (const n of c) x.nb_repliques += repl.get(n) || 0;
          if (scenes.length && e.d > 0 && e.m > 0) {
            e.sc.forEach((s, i) => {
              if (c.every((n) => scenes[i].has(n))) {
                x.nb_scenes++;
                x.duree_min += e.d * (s[0] / e.m);
              }
            });
          }
        }
      }
    }

    const personnages = [...parPerso.values()].map((p) => ({
      ...p,
      duree: Math.round(p.duree),
      pct_presence: nb ? Math.round((p.nb_presences / nb) * 100) : 0,
      pct_repliques: totalRepliques ? Math.round((p.total_repliques / totalRepliques) * 100) : 0,
    })).sort((a, b) => b.total_repliques - a.total_repliques);
    const index = new Map(personnages.map((p) => [p.nom, p]));

    const listeCombos = [...combos.values()]
      .map((c) => {
        const st = c.persos.map((n) => index.get(n)).filter(Boolean);
        return {
          ...c,
          duree_min: Math.round(c.duree_min),
          moyPresence: st.length ? Math.round(st.reduce((s, p) => s + p.pct_presence, 0) / st.length) : null,
          moyRepliques: st.length ? Math.round(st.reduce((s, p) => s + p.pct_repliques, 0) / st.length) : null,
        };
      })
      .sort((a, b) => a.taille - b.taille || b.nb_episodes - a.nb_episodes);

    const paires = new Set(listeCombos.filter((c) => c.taille === 2).map((c) => c.persos.join('||')));
    const actifs = personnages.filter((p) => p.nb_presences > 0 && p.g !== 'x');
    const jamais = [];
    for (let i = 0; i < actifs.length; i++) {
      for (let j = i + 1; j < actifs.length; j++) {
        const a = actifs[i].nom, b = actifs[j].nom;
        if (!paires.has(a < b ? `${a}||${b}` : `${b}||${a}`)) jamais.push([a, b]);
      }
    }

    const mots = listerMots(d, freq, nbEpisodes);

    return {
      nb,
      eps,
      totalRepliques,
      totalMots,
      avancement: nb ? Math.round(eps.reduce((s, e) => s + e.av, 0) / nb) : 0,
      pages: eps.reduce((s, e) => s + e.p, 0),
      finals: eps.reduce((s, e) => s + e.fin, 0),
      personnages,
      themes: [...themes.entries()].sort((a, b) => b[1] - a[1]).map(([i, n]) => ({ ...d.themes[i], nb: n })),
      combos: listeCombos,
      jamais,
      mots,
      avecScenes: eps.filter((e) => e.sc.length),
    };
  }

  function voix(d, eps) {
    const stats = d.voixPersos.map((k) => ({ k, repl: 0, mots: 0, compte: {} }));
    for (const e of eps) {
      for (const s of stats) {
        const v = e.vx[s.k];
        if (!v) continue;
        s.repl += v[0];
        s.mots += v[1];
        for (const i in v[2]) s.compte[i] = (s.compte[i] || 0) + v[2][i];
      }
    }
    const total = stats.reduce((a, s) => a + s.mots, 0);
    const exclus = new Set(['euh', 'toi', 'moi', 'hein', 'ben', 'bah']);
    for (const p of d.persos) {
      if (p.g === 'p' || p.g === 'r') exclus.add(p.n.split(' ')[0].toLowerCase());
    }
    return stats.map((s) => {
      const autres = total - s.mots;
      const liste = Object.entries(s.compte)
        .filter(([i, c]) => c >= 3 && !exclus.has(d.voixMots[i]))
        .map(([i, c]) => {
          const o = stats.reduce((a, x) => (x === s ? a : a + (x.compte[i] || 0)), 0);
          return { mot: d.voixMots[i], n: c, score: ((c / s.mots) / ((o + 1) / Math.max(autres, 1))) * Math.log(c) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .sort((a, b) => b.n - a.n);
      return { nom: s.k, mots: s.mots, long: s.repl ? s.mots / s.repl : 0, liste };
    });
  }

  function expressions(d, eps, perso) {
    const miennes = new Set(d.mesExpressions);
    return d.phrases.map((texte, i) => {
      let total = 0;
      const qui = {}, saison = {}, episodes = [];
      for (const e of eps) {
        const x = e.ex[i];
        if (!x) continue;
        let dansEpisode = 0;
        for (const k in x) {
          if (perso && k !== perso) continue;
          dansEpisode += x[k];
          qui[k] = (qui[k] || 0) + x[k];
          saison[e.sa] = (saison[e.sa] || 0) + x[k];
        }
        if (dansEpisode) {
          total += dansEpisode;
          episodes.push({ e, nb: dansEpisode });
        }
      }
      episodes.sort((a, b) => b.nb - a.nb);
      const parPerso = Object.entries(qui).sort((a, b) => b[1] - a[1]);
      return { i, texte, ep: episodes.length, total, qui: parPerso.slice(0, 2).map((x) => x[0]), parPerso, saison, episodes, mienne: miennes.has(texte) };
    }).filter((x) => x.total > 0 || x.mienne);
  }

  // Reprend les fiches de l'onglet Décors, limitées aux épisodes choisis
  function decors(d, eps) {
    return d.lieux.map((l) => {
      const cle = String(l.id);
      const x = { ...l, nb_episodes: 0, nb_scenes: 0, nb_repliques: 0, mots: 0, duree: 0, pasEncore: 0, parEp: [] };
      for (const e of eps) {
        const v = e.li[cle];
        if (!v) continue;
        if (v[0] === 2) x.pasEncore++;
        if (v[0] === 1) x.nb_episodes++;
        x.nb_scenes += v[1];
        x.nb_repliques += v[2];
        x.mots += v[3];
        x.duree += v[4];
        if (v[0] === 1 || v[1] > 0) x.parEp.push({ e, statut: v[0], scenes: v[1], repliques: v[2], persos: v[5] });
      }
      return x;
    });
  }

  function detailDecor(d, x, saison) {
    const persos = {}, co = {};
    for (const { e, statut, persos: pp } of x.parEp) {
      if (statut !== 1 || (saison !== 'all' && String(e.sa) !== String(saison))) continue;
      for (const n in pp) persos[n] = (persos[n] || 0) + pp[n];
      for (const lid in e.li) {
        if (lid === String(x.id) || !e.li[lid][1]) continue;
        if (!co[lid]) co[lid] = { nom: d.lieux.find((l) => String(l.id) === lid).n, nb_episodes: 0, nb_scenes: 0 };
        co[lid].nb_episodes++;
        co[lid].nb_scenes += e.li[lid][1];
      }
    }
    return {
      persos: Object.entries(persos).sort((a, b) => b[1] - a[1]),
      co: Object.values(co).sort((a, b) => b.nb_scenes - a.nb_scenes),
    };
  }

  const api = { preparer, analyser, voix, expressions, decors, detailDecor, motsPersonnage, detailMot, agregerParole, lexique, quiDit, episodesMot };
  if (typeof module !== "undefined") module.exports = api;
  else root.AnalyseCalcul = api;
})(typeof window !== 'undefined' ? window : globalThis);
