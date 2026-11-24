// assets/js/app.js — Initialisation & routing

const TAB_STORAGE_KEY = 'sitcomwriter_active_tab';

document.addEventListener('DOMContentLoaded', async () => {
  await Projets.charger();
  await Interface.charger();

  // Navigation par onglets
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
      localStorage.setItem(cleProjet(TAB_STORAGE_KEY), tab);
      initTab(tab);
    });
  });

  // Fermeture modal
  document.getElementById('modal-close').addEventListener('click', () => modal.close());

  // Restaurer l'onglet actif ou démarrer sur 'episodes'
  let savedTab = localStorage.getItem(cleProjet(TAB_STORAGE_KEY)) || 'episodes';
  if (!document.getElementById('tab-' + savedTab)) savedTab = 'episodes';
  savedTab = Interface.ongletVisible(savedTab);
  localStorage.setItem(cleProjet(TAB_STORAGE_KEY), savedTab);
  switchTab(savedTab);
  await initTab(savedTab);
});

function switchTab(tab) {
  const tabEl = document.getElementById('tab-' + tab);
  if (!tabEl) return;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  tabEl.classList.add('active');
}

const initializedTabs = new Set();

const TAB_DATA_DEPENDENCIES = {
  episodes: ['episodes', 'saisons', 'personnages', 'themes', 'lieux', 'upload', 'reanalyse', 'batch'],
  ecriture: ['episodes', 'personnages', 'saisons', 'lieux', 'themes', 'promesses', 'upload', 'decors_auto', 'reanalyse', 'batch', 'noms'],
  personnages: ['personnages', 'episodes', 'personnage_moments', 'personnage_signatures', 'reanalyse', 'batch', 'noms'],
  decors: ['lieux', 'episodes', 'personnages', 'decors_auto', 'upload', 'reanalyse', 'batch', 'noms'],
  frise: ['frise', 'episodes'],
  themes: ['themes', 'episodes', 'saisons', 'promesses', 'batch'],
  analyse: ['episodes', 'personnages', 'saisons', 'lieux', 'themes', 'frise', 'upload', 'decors_auto', 'reanalyse', 'batch', 'noms'],
  miroirs: ['episodes', 'saisons', 'themes'],
  suivi: ['episodes', 'saisons'],
  batch: ['episodes', 'saisons', 'personnages', 'themes', 'lieux', 'batch', 'reanalyse'],
  recherche: ['episodes', 'saisons', 'personnages', 'themes', 'lieux'],
  settings: ['saisons', 'personnages', 'lieux', 'episodes', 'themes', 'batch', 'upload', 'reanalyse', 'decors_auto'],
  journal: ['journal'],
  lecteurs: ['lecteurs', 'episodes'],
};

window.addEventListener('lemenu:data-mutated', (event) => {
  const resource = event.detail?.resource;
  if (!resource) return;

  Object.entries(TAB_DATA_DEPENDENCIES).forEach(([tab, dependencies]) => {
    if (dependencies.includes(resource)) initializedTabs.delete(tab);
  });
});

async function initTab(tab) {
  // La sélection d'épisodes est partagée entre Analyse et Décors
  if (initializedTabs.has(tab) && (tab === 'analyse' || tab === 'decors')) Analyse.synchroniser(tab);
  if (initializedTabs.has(tab) && tab === 'ecriture') Ecriture.rendreVue();

  const alwaysRefresh = ['journal', 'lecteurs'];
  if (initializedTabs.has(tab) && !alwaysRefresh.includes(tab)) return;

  try {
    switch (tab) {
      case 'episodes':    await Episodes.init(); break;
      case 'ecriture':    await Ecriture.init(); break;
      case 'personnages': await Personnages.init(); break;
      case 'decors':      await Decors.init(); break;
      case 'frise':       await Frise.init(); break;
      case 'themes':      await Themes.init(); break;
      case 'analyse':     await Analyse.init(); break;
      case 'miroirs':     await Miroirs.init(); break;
      case 'suivi':       await Suivi.init(); break;
      case 'journal':     await JournalTab.init(); break;
      case 'lecteurs':    await Lecteurs.init(); break;
      case 'batch':       await Batch.init(); break;
      case 'recherche':   await Recherche.init(); break;
      case 'settings':    await Settings.init(); break;
    }
    initializedTabs.add(tab);
  } catch (e) {
    console.error('Erreur initialisation onglet', tab, e);
    document.getElementById('tab-' + tab).innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠</div>
        <div class="empty-title">Erreur de connexion</div>
        <div class="empty-sub">Impossible de charger les données. Vérifiez que le serveur PHP est actif.<br><code style="color:var(--accent2);font-size:11px">${esc(e.message)}</code></div>
      </div>
    `;
  }
}
