'use strict';
/**
 * Essai des mises à jour, sans réseau :  npm run test:mises-a-jour
 * Un faux GitHub répond : bonne version, bon installateur pour chaque système, empreinte vérifiée,
 * fichier abîmé effacé, adresse étrangère refusée, version sans empreintes refusée.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const m = require('./updates');

const echecs = [];
const verifier = (nom, ok, detail = '') => { console.log(`${ok ? 'OK' : 'KO'} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) echecs.push(nom); };

const BASE = `https://github.com/${m.REPO}/releases/download/v1.1.0/`;
const installateur = Buffer.from('installateur de démonstration '.repeat(1000));
const empreinte = crypto.createHash('sha256').update(installateur).digest('hex');
const noms = ['Continuite-1.1.0-mac-arm64.dmg', 'Continuite-1.1.0-mac-x64.dmg', 'Continuite-1.1.0-windows-x64.exe', 'Continuite-1.1.0-linux-x86_64.AppImage', 'Continuite-1.1.0-linux-amd64.deb', 'Continuite-1.1.0-linux-arm64.deb', 'Continuite-1.1.0-linux-arm64.AppImage'];

function version({ sums = true, url = n => BASE + n, tag = 'v1.1.0', draft = false } = {}) {
  return {
    tag_name: tag, draft, html_url: `https://github.com/${m.REPO}/releases/tag/${tag}`, published_at: '2026-12-01T10:00:00Z', body: 'Nouveautés',
    assets: [...noms.map(n => ({ name: n, size: installateur.length, browser_download_url: url(n) })),
      ...(sums ? [{ name: 'SHA256SUMS.txt', size: 100, browser_download_url: url('SHA256SUMS.txt') }] : [])],
  };
}

// Un faux fetch : l'API, le fichier d'empreintes et l'installateur
function fauxFetch(reponseApi, { abime = false } = {}) {
  const appels = [];
  const f = async url => {
    appels.push(url);
    const corps = url === m.API_URL ? JSON.stringify(reponseApi)
      : url.endsWith('SHA256SUMS.txt') ? noms.map(n => `${empreinte}  ${n}`).join('\n')
      : abime ? Buffer.concat([installateur, Buffer.from('!')]) : installateur;
    const buf = Buffer.from(corps);
    return { ok: true, status: 200, headers: { get: () => String(buf.length) }, text: async () => buf.toString(), body: (async function* () { yield buf; })() };
  };
  f.appels = appels;
  return f;
}

(async () => {
  // Les versions
  verifier('1.1.0 > 1.0.0', m.compareVersions('1.1.0', '1.0.0') === 1);
  verifier('une bêta passe avant la version finale', m.compareVersions('1.1.0-beta.1', '1.1.0') === -1 && m.compareVersions('1.1.0-beta.2', '1.1.0-beta.1') === 1);
  verifier('« v1.0.0 » = « 1.0.0 »', m.compareVersions('v1.0.0', '1.0.0') === 0);

  // Le bon installateur pour chaque ordinateur
  const assets = noms.map(name => ({ name }));
  const cas = [['darwin', 'arm64', 'dmg', 'mac-arm64.dmg'], ['darwin', 'x64', 'dmg', 'mac-x64.dmg'], ['win32', 'x64', 'exe', 'windows-x64.exe'], ['win32', 'arm64', 'exe', 'windows-x64.exe'],
    ['linux', 'x64', 'AppImage', 'linux-x86_64.AppImage'], ['linux', 'x64', 'deb', 'linux-amd64.deb'], ['linux', 'arm64', 'deb', 'linux-arm64.deb']];
  for (const [platform, arch, format, attendu] of cas) {
    const a = m.pickAsset(assets, { platform, arch, format });
    verifier(`installateur ${platform} ${arch} ${format}`, a && a.name.endsWith(attendu), a && a.name);
  }

  // Une version plus récente est trouvée, puis gardée un jour
  const f = fauxFetch(version());
  const r = await m.check({ fetchImpl: f, current: '1.0.0', prefs: {}, sys: { platform: 'darwin', arch: 'arm64', format: 'dmg' } });
  verifier('nouvelle version trouvée', r.info.ok && r.info.newer && r.info.latest === '1.1.0' && r.info.asset?.name === 'Continuite-1.1.0-mac-arm64.dmg');
  const r2 = await m.check({ fetchImpl: f, current: '1.0.0', prefs: r.prefs, sys: { platform: 'darwin', arch: 'arm64' } });
  verifier('au plus une question par jour', r2.fromCache && f.appels.length === 1);
  verifier('« Ignorer cette version » est respecté', !m.shouldNotify(r.info, { ...r.prefs, skip: '1.1.0' }));
  verifier('« Plus tard » est respecté', !m.shouldNotify(r.info, { ...r.prefs, laterUntil: Date.now() + 1000 }));
  verifier('prévenir désactivé : silence', !m.shouldNotify(r.info, { ...r.prefs, auto: false }));
  const aJour = await m.check({ fetchImpl: fauxFetch(version({ tag: 'v1.0.0' })), current: '1.0.0', prefs: {}, force: true });
  verifier('déjà à jour : rien à proposer', aJour.info.ok && !aJour.info.newer);
  const brouillon = await m.check({ fetchImpl: fauxFetch(version({ draft: true })), current: '1.0.0', prefs: {}, force: true });
  verifier('un brouillon n\'est jamais proposé', !brouillon.info.ok);

  // Téléchargement : vérifié, abîmé, étranger, sans empreintes
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'continuite-maj-'));
  try {
    const sys = { platform: 'darwin', arch: 'arm64', format: 'dmg' };
    const ok = await m.download({ fetchImpl: fauxFetch(version()), release: r.prefs.release, sys, dir: dossier });
    verifier('téléchargé et vérifié', ok.ok && ok.sha256 === empreinte && fs.existsSync(ok.file));
    const abime = await m.download({ fetchImpl: fauxFetch(version(), { abime: true }), release: r.prefs.release, sys, dir: dossier });
    verifier('fichier abîmé : refusé et effacé', !abime.ok && /abîmé/.test(abime.error) && fs.readdirSync(dossier).length === 1);
    const etranger = m.slimRelease(version({ url: n => 'https://exemple.invalid/' + n }));
    verifier('adresse étrangère : installateur ignoré', etranger.assets.length === 0);
    const sansSums = m.slimRelease(version({ sums: false }));
    const refus = await m.download({ fetchImpl: fauxFetch(version({ sums: false })), release: sansSums, sys, dir: dossier });
    verifier('sans fichier d\'empreintes : refusé', !refus.ok && /empreintes/.test(refus.error));
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }

  if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
  console.log('\nMises à jour : tout est bon.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
