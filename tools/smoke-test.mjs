#!/usr/bin/env node

import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const baseUrl = (process.env.LEMENU_BASE_URL || 'http://localhost:8888/lemenu/').replace(/\/?$/, '/');
const phpBin = process.env.PHP_BIN || '/Applications/MAMP/bin/php/php8.3.30/bin/php';
// App de bureau : son serveur PHP demande le secret du lancement (APP_SECRET)
const secret = process.env.APP_SECRET ? { 'x-app-secret': process.env.APP_SECRET } : {};
const shouldRunBrowser = process.argv.includes('--browser') || process.env.SMOKE_BROWSER === '1';

const checks = [];

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  const icon = ok ? 'OK' : 'KO';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function fetchText(url) {
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, { headers: secret }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolvePromise({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        text: body,
      }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error(`Timeout sur ${url}`));
    });
  });
}

// L'analyse est en POST : un simple GET ne verrait pas ses erreurs
function postJson(path, data) {
  return new Promise((resolvePromise, reject) => {
    const payload = JSON.stringify(data);
    const parsed = new URL(baseUrl + path);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: 'POST',
      headers: { ...secret, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolvePromise({ status: res.statusCode, text: body }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error(`Timeout sur ${path}`)));
    req.end(payload);
  });
}

async function checkAnalyse() {
  const episodes = JSON.parse((await fetchText(baseUrl + 'api/index.php?path=episodes')).text);
  const ids = episodes.filter(e => e.has_texte).slice(0, 3).map(e => e.id);
  const res = await postJson('api/index.php?path=analyse', { episode_ids: ids });
  let parsed = null;
  try { parsed = JSON.parse(res.text); } catch (e) {}
  const ok = res.status === 200 && Array.isArray(parsed?.par_personnage) && parsed.par_personnage.length > 0;
  record('POST analyse', ok, `${res.status} · ${ok ? parsed.par_personnage.length + ' personnages' : res.text.slice(0, 120)}`);
  if (!ok) throw new Error('POST analyse a échoué');
}

async function checkUrl(path, expectsJson = true) {
  const url = path.startsWith('http') ? path : baseUrl + path.replace(/^\/+/, '');
  const res = await fetchText(url);
  const text = res.text;
  let ok = res.ok;
  if (ok && expectsJson) {
    try { JSON.parse(text); }
    catch (e) {
      ok = false;
      record(`API ${path}`, false, `JSON invalide (${e.message})`);
      return;
    }
  }
  record(`HTTP ${path}`, ok, `${res.status} · ${text.length} octets`);
  if (!ok) throw new Error(`${path} a répondu ${res.status}`);
}

function checkCommand(name, command, args) {
  const res = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  const ok = res.status === 0;
  record(name, ok, (res.stderr || res.stdout || '').trim().split('\n').slice(-1)[0] || '');
  if (!ok) throw new Error(`${name} a échoué`);
}

async function runBrowserSmoke() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (e) {
    const required = process.env.SMOKE_BROWSER_REQUIRED === '1';
    record('Navigateur onglets', !required, 'Playwright absent, test navigateur ignoré');
    if (required) throw e;
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  for (const tab of ['episodes', 'personnages', 'decors', 'themes', 'analyse', 'batch', 'recherche']) {
    await page.click(`.nav-btn[data-tab="${tab}"]`);
    await page.waitForTimeout(700);
    const hasContent = await page.$eval(`#tab-${tab}`, el => el.classList.contains('active') && el.innerText.trim().length > 0);
    record(`Onglet ${tab}`, hasContent);
  }

  record('Console navigateur', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  if (errors.length) throw new Error('Erreurs console navigateur');
}

async function main() {
  console.log(`Smoke test — ${baseUrl}`);

  if (existsSync(phpBin)) {
    checkCommand('PHP lint api/routes.php', phpBin, ['-l', 'api/routes.php']);
    checkCommand('PHP lint api/db.php', phpBin, ['-l', 'api/db.php']);
    checkCommand('PHP lint api/noms.php', phpBin, ['-l', 'api/noms.php']);
    checkCommand('PHP lint api/analyse_data.php', phpBin, ['-l', 'api/analyse_data.php']);
    checkCommand('PHP lint api/sauvegardes.php', phpBin, ['-l', 'api/sauvegardes.php']);
  } else {
    record('PHP lint', true, 'PHP_BIN introuvable, lint ignoré');
  }

  const jsFiles = readdirSync(join(root, 'assets/js')).filter(file => file.endsWith('.js'));
  for (const file of jsFiles) {
    checkCommand(`JS syntax ${file}`, 'node', ['--check', join('assets/js', file)]);
  }

  await checkUrl('', false);
  // Des épisodes et des personnages pris dans le projet ouvert, quel qu'il soit
  const lireJson = async chemin => { try { return JSON.parse((await fetchText(baseUrl + chemin)).text); } catch { return []; } };
  const avecTexte = (await lireJson('api/index.php?path=episodes')).filter(e => e.has_texte).map(e => e.id);
  const ep = avecTexte[Math.floor(avecTexte.length / 4)] || 1;
  const [a, b] = (await lireJson('api/index.php?path=personnages')).map(p => p.prenom).filter(Boolean);
  const nom = encodeURIComponent(a || 'Paul'), autre = encodeURIComponent(b || 'Marie');
  for (const endpoint of [
    'api/index.php?path=saisons',
    'api/index.php?path=episodes',
    'api/index.php?path=personnages',
    'api/index.php?path=lieux',
    'api/index.php?path=themes',
    'api/index.php?path=stats/decors',
    'api/index.php?path=stats/batch',
    'api/index.php?path=stats/personnages',
    'api/index.php?path=maintenance',
    'api/index.php?path=noms',
    'api/index.php?path=sauvegardes',
    'api/index.php?path=analyse_data',
    'api/index.php?path=analyse_notes',
    'api/index.php?path=ecriture_data',
    'api/index.php?path=ecriture_gags',
    'api/index.php?path=ecriture_depouillement',
    `api/index.php?path=ecriture_versions&episode=${ep}`,
    `api/index.php?path=ecriture_episode&episode=${ep}`,
    `api/index.php?path=ecriture_lecteurs&episode=${ep}`,
    `api/index.php?path=ecriture_recherche&q=et&limite=5`,
    `api/index.php?path=ecriture_perso&nom=${nom}`,
    `api/index.php?path=ecriture_echange&a=${nom}&b=${autre}`,
    `api/index.php?path=ecriture_scene&episode=${ep}&scene=2`,
    `api/index.php?path=ecriture_commun&a=${avecTexte[0] || 1}&b=${avecTexte[1] || 2}`,
  ]) {
    await checkUrl(endpoint, true);
  }

  await checkAnalyse();

  if (shouldRunBrowser) await runBrowserSmoke();
  else record('Navigateur onglets', true, 'ignoré (ajouter --browser si Playwright est installé)');

  const failed = checks.filter(c => !c.ok);
  if (failed.length) {
    console.error(`\n${failed.length} vérification(s) en échec.`);
    process.exit(1);
  }

  console.log(`\n${checks.length} vérification(s) OK.`);
}

main().catch(err => {
  console.error(`\nSmoke test échoué : ${err.message}`);
  process.exit(1);
});
