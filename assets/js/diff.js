// assets/js/diff.js
// Comparateur de versions d'épisodes — style diffchecker.com

const Diff = {

  init() {
    this.render();
  },

  render() {
    const tab = document.getElementById('diff-vue');
    tab.innerHTML = `
      <div class="section-header">
        <div class="section-title">⊶ Comparateur de versions</div>
        <div class="section-actions">
          <button class="btn btn-ghost btn-sm" onclick="Diff.clearAll()" title="Tout effacer">✕ Effacer</button>
        </div>
      </div>

      <div class="diff-workspace">
        <!-- Panneaux d'upload / saisie -->
        <div class="diff-inputs">
          <div class="diff-panel diff-panel-left">
            <div class="diff-panel-header">
              <span class="diff-version-badge diff-badge-old">VERSION A</span>
              <span class="diff-panel-label" id="label-a">Version originale</span>
              <div class="diff-panel-actions">
                <label class="btn btn-ghost btn-sm diff-upload-btn" title="Uploader un fichier texte">
                  ↑ Fichier
                  <input type="file" accept=".txt,.fountain,.fdx,.md,.rtf,.pdf" onchange="Diff.loadFile(event,'a')" hidden>
                </label>
                <button class="btn btn-ghost btn-sm" onclick="Diff.clearPanel('a')">✕</button>
              </div>
            </div>
            <textarea
              id="diff-input-a"
              class="diff-textarea"
              placeholder="Collez ici la version A de votre script…&#10;&#10;Ou uploadez un fichier .txt / .fountain / .pdf"
              spellcheck="false"
              oninput="Diff.onInput()"
            ></textarea>
            <div class="diff-panel-footer">
              <span id="stats-a" class="diff-stats">—</span>
            </div>
          </div>

          <div class="diff-divider">
            <button class="btn btn-primary diff-compare-btn" onclick="Diff.compare()" id="compare-btn">
              <span class="diff-compare-icon">⇌</span>
              Comparer
            </button>
            <button class="btn btn-ghost btn-sm diff-swap-btn" onclick="Diff.swap()" title="Inverser A et B">⇅</button>
          </div>

          <div class="diff-panel diff-panel-right">
            <div class="diff-panel-header">
              <span class="diff-version-badge diff-badge-new">VERSION B</span>
              <span class="diff-panel-label" id="label-b">Nouvelle version</span>
              <div class="diff-panel-actions">
                <label class="btn btn-ghost btn-sm diff-upload-btn" title="Uploader un fichier texte">
                  ↑ Fichier
                  <input type="file" accept=".txt,.fountain,.fdx,.md,.rtf,.pdf" onchange="Diff.loadFile(event,'b')" hidden>
                </label>
                <button class="btn btn-ghost btn-sm" onclick="Diff.clearPanel('b')">✕</button>
              </div>
            </div>
            <textarea
              id="diff-input-b"
              class="diff-textarea"
              placeholder="Collez ici la version B de votre script…&#10;&#10;Ou uploadez un fichier .txt / .fountain / .pdf"
              spellcheck="false"
              oninput="Diff.onInput()"
            ></textarea>
            <div class="diff-panel-footer">
              <span id="stats-b" class="diff-stats">—</span>
            </div>
          </div>
        </div>

        <!-- Barre de contrôles résultat -->
        <div class="diff-controls" id="diff-controls" style="display:none">
          <div class="diff-controls-left">
            <span class="diff-summary" id="diff-summary"></span>
          </div>
          <div class="diff-controls-right">
            <label class="diff-toggle-label">
              <input type="checkbox" id="diff-inline-toggle" onchange="Diff.toggleMode()" checked>
              <span class="diff-toggle-track"><span class="diff-toggle-thumb"></span></span>
              Vue côte à côte
            </label>
            <label class="diff-toggle-label">
              <input type="checkbox" id="diff-context-toggle" onchange="Diff.rerender()" checked>
              <span class="diff-toggle-track"><span class="diff-toggle-thumb"></span></span>
              Contexte
            </label>
            <button class="btn btn-ghost btn-sm" onclick="Diff.copyResult()" title="Copier le diff en texte">⎘ Copier</button>
          </div>
        </div>

        <!-- Résultat diff -->
        <div id="diff-result" class="diff-result"></div>
      </div>
    `;

    this._updateStats('a');
    this._updateStats('b');
  },

  // ── Chargement fichier ───────────────────────────────────────────────────
  loadFile(event, side) {
    const file = event.target.files[0];
    if (!file) return;
    const label = document.getElementById(`label-${side}`);
    const isPDF = file.name.toLowerCase().endsWith('.pdf');

    if (isPDF) {
      label.textContent = '⏳ Extraction PDF…';
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const pdfjsLib = window['pdfjs-dist/build/pdf'];
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'assets/vendor/pdfjs/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
          const lines = [];

          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1 });
            const pageW = viewport.width;

            // 1. Grouper les items par ligne (même Y arrondi)
            const byY = {};
            for (const item of content.items) {
              if (!item.str.trim()) continue;
              const y = Math.round(item.transform[5]);
              if (!byY[y]) byY[y] = [];
              byY[y].push(item);
            }

            // 2. Trier les lignes de haut en bas (Y décroissant en PDF)
            const sortedYs = Object.keys(byY).map(Number).sort((a, b) => b - a);

            for (const y of sortedYs) {
              const items = byY[y].sort((a, b) => a.transform[4] - b.transform[4]);
              const text = items.map(i => i.str).join(' ').trim();
              if (!text) continue;

              // 3. Détecter le type de bloc via position X et style
              const x = items[0].transform[4]; // position X du premier mot
              const xPct = x / pageW; // position relative 0→1

              // Heuristiques Fountain / script FR
              const isUpper = text === text.toUpperCase() && /[A-ZÀ-Ü]{2,}/.test(text);
              const isSceneHeader = isUpper && /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/.test(text);
              const isTransition = isUpper && (text.endsWith(':') || /FONDU|COUPE|CUT|SMASH/.test(text));
              const isCentered = xPct > 0.35 && xPct < 0.65;
              const isDialogue = xPct > 0.2 && xPct < 0.75 && !isUpper;
              const isCharacter = isUpper && isCentered && !isSceneHeader && !isTransition;
              const isParenthetical = text.startsWith('(') && text.endsWith(')');

              let formatted = '';
              if (isSceneHeader) {
                formatted = '\n' + text + '\n';
              } else if (isTransition) {
                formatted = '\n' + ' '.repeat(40) + text + '\n';
              } else if (isCharacter) {
                formatted = '\n' + ' '.repeat(22) + text;
              } else if (isParenthetical) {
                formatted = ' '.repeat(16) + text;
              } else if (isDialogue) {
                formatted = ' '.repeat(10) + text;
              } else {
                // Action / description
                formatted = text;
              }
              lines.push(formatted);
            }
            // Séparateur de page
            lines.push('\n— Page ' + p + ' —\n');
          }

          document.getElementById(`diff-input-${side}`).value = lines.join('\n');
          label.textContent = `${file.name} (${pdf.numPages} p.)`;
          this._updateStats(side);
          this.onInput();
        } catch (err) {
          console.error(err);
          label.textContent = '⚠ Erreur lecture PDF';
          if (typeof toast !== 'undefined') toast('Impossible de lire ce PDF', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        document.getElementById(`diff-input-${side}`).value = e.target.result;
        label.textContent = file.name;
        this._updateStats(side);
        this.onInput();
      };
      reader.readAsText(file, 'UTF-8');
    }
    event.target.value = '';
  },

  onInput() {
    this._updateStats('a');
    this._updateStats('b');
    // Si un résultat est déjà affiché, on le remet à zéro
    if (document.getElementById('diff-result').innerHTML) {
      document.getElementById('diff-result').innerHTML = '';
      document.getElementById('diff-controls').style.display = 'none';
    }
  },

  _updateStats(side) {
    const ta = document.getElementById(`diff-input-${side}`);
    const el = document.getElementById(`stats-${side}`);
    if (!ta || !el) return;
    const text = ta.value;
    if (!text.trim()) { el.textContent = '—'; return; }
    const lines = text.split('\n').length;
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    el.textContent = `${lines} lignes · ${words} mots · ${chars} car.`;
  },

  clearPanel(side) {
    document.getElementById(`diff-input-${side}`).value = '';
    document.getElementById(`label-${side}`).textContent = side === 'a' ? 'Version originale' : 'Nouvelle version';
    this._updateStats(side);
    this.onInput();
  },

  clearAll() {
    this.clearPanel('a');
    this.clearPanel('b');
    document.getElementById('diff-result').innerHTML = '';
    document.getElementById('diff-controls').style.display = 'none';
  },

  swap() {
    const ta = document.getElementById('diff-input-a');
    const tb = document.getElementById('diff-input-b');
    const la = document.getElementById('label-a');
    const lb = document.getElementById('label-b');
    [ta.value, tb.value] = [tb.value, ta.value];
    [la.textContent, lb.textContent] = [lb.textContent, la.textContent];
    this._updateStats('a');
    this._updateStats('b');
    this.onInput();
  },

  toggleMode() {
    this.rerender();
  },

  // ── Algorithme LCS / diff ────────────────────────────────────────────────
  _computeDiff(linesA, linesB) {
    // Myers diff simplifié via LCS
    const n = linesA.length, m = linesB.length;
    // dp[i][j] = longueur LCS
    const dp = Array.from({length: n+1}, () => new Uint16Array(m+1));
    for (let i = n-1; i >= 0; i--) {
      for (let j = m-1; j >= 0; j--) {
        if (linesA[i] === linesB[j]) dp[i][j] = dp[i+1][j+1] + 1;
        else dp[i][j] = Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    // backtrack
    const ops = []; // {type: 'eq'|'del'|'ins', lineA, lineB, text}
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && linesA[i] === linesB[j]) {
        ops.push({type: 'eq', lineA: i+1, lineB: j+1, text: linesA[i]});
        i++; j++;
      } else if (j < m && (i >= n || dp[i][j+1] >= dp[i+1][j])) {
        ops.push({type: 'ins', lineA: null, lineB: j+1, text: linesB[j]});
        j++;
      } else {
        ops.push({type: 'del', lineA: i+1, lineB: null, text: linesA[i]});
        i++;
      }
    }
    return ops;
  },

  // Diff inline mot-à-mot pour les lignes modifiées adjacentes
  _inlineWordDiff(textA, textB) {
    const wordsA = textA.split(/(\s+)/);
    const wordsB = textB.split(/(\s+)/);
    const ops = this._computeDiff(wordsA, wordsB);
    let htmlA = '', htmlB = '';
    for (const op of ops) {
      const esc = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      if (op.type === 'eq') { htmlA += esc(op.text); htmlB += esc(op.text); }
      else if (op.type === 'del') htmlA += `<mark class="diff-word-del">${esc(op.text)}</mark>`;
      else htmlB += `<mark class="diff-word-ins">${esc(op.text)}</mark>`;
    }
    return {htmlA, htmlB};
  },

  _lastResult: null,

  compare() {
    const textA = document.getElementById('diff-input-a').value;
    const textB = document.getElementById('diff-input-b').value;
    if (!textA.trim() && !textB.trim()) {
      if (typeof toast !== 'undefined') toast('Les deux zones sont vides', 'error');
      return;
    }
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const ops = this._computeDiff(linesA, linesB);
    this._lastResult = {ops, linesA, linesB};
    this.rerender();
  },

  rerender() {
    if (!this._lastResult) return;
    const {ops, linesA, linesB} = this._lastResult;
    const sideBySide = document.getElementById('diff-inline-toggle').checked;
    const showContext = document.getElementById('diff-context-toggle').checked;
    const CONTEXT = 3;

    const added = ops.filter(o => o.type === 'ins').length;
    const removed = ops.filter(o => o.type === 'del').length;
    const equal = ops.filter(o => o.type === 'eq').length;

    // Résumé
    document.getElementById('diff-summary').innerHTML =
      `<span class="diff-badge-stat diff-stat-eq">${equal} identiques</span>` +
      `<span class="diff-badge-stat diff-stat-del">−${removed} supprimées</span>` +
      `<span class="diff-badge-stat diff-stat-ins">+${added} ajoutées</span>`;
    document.getElementById('diff-controls').style.display = 'flex';

    if (sideBySide) {
      this._renderSideBySide(ops, linesA, linesB, showContext, CONTEXT);
    } else {
      this._renderUnified(ops, showContext, CONTEXT);
    }
  },

  _renderSideBySide(ops, linesA, linesB, showContext, CONTEXT) {
    // Apparier les suppressions/ajouts consécutifs pour l'inline word diff
    const paired = this._pairOps(ops);

    // Déterminer les indices "intéressants"
    let html = `<table class="diff-table diff-side-by-side">
      <colgroup><col class="diff-col-num"><col class="diff-col-content"><col class="diff-col-num"><col class="diff-col-content"></colgroup>
      <thead><tr>
        <th colspan="2" class="diff-th diff-th-a">VERSION A</th>
        <th colspan="2" class="diff-th diff-th-b">VERSION B</th>
      </tr></thead><tbody>`;

    const relevant = new Set();
    paired.forEach((op, idx) => {
      if (op.type !== 'eq') {
        for (let k = Math.max(0, idx-CONTEXT); k <= Math.min(paired.length-1, idx+CONTEXT); k++) relevant.add(k);
      }
    });

    let skip = false;
    for (let idx = 0; idx < paired.length; idx++) {
      if (showContext && !relevant.has(idx)) {
        if (!skip) {
          html += `<tr class="diff-skip-row"><td colspan="4"><span class="diff-skip-label">· · ·</span></td></tr>`;
          skip = true;
        }
        continue;
      }
      skip = false;
      const op = paired[idx];
      const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

      if (op.type === 'eq') {
        html += `<tr class="diff-row-eq">
          <td class="diff-num">${op.lineA}</td><td class="diff-cell diff-cell-eq">${esc(op.text)}</td>
          <td class="diff-num">${op.lineB}</td><td class="diff-cell diff-cell-eq">${esc(op.text)}</td>
        </tr>`;
      } else if (op.type === 'del') {
        html += `<tr class="diff-row-del">
          <td class="diff-num">${op.lineA}</td><td class="diff-cell diff-cell-del">${esc(op.text)}</td>
          <td class="diff-num diff-num-empty"></td><td class="diff-cell diff-cell-empty"></td>
        </tr>`;
      } else if (op.type === 'ins') {
        html += `<tr class="diff-row-ins">
          <td class="diff-num diff-num-empty"></td><td class="diff-cell diff-cell-empty"></td>
          <td class="diff-num">${op.lineB}</td><td class="diff-cell diff-cell-ins">${esc(op.text)}</td>
        </tr>`;
      } else if (op.type === 'chg') {
        const {htmlA, htmlB} = this._inlineWordDiff(op.textA, op.textB);
        html += `<tr class="diff-row-chg">
          <td class="diff-num">${op.lineA}</td><td class="diff-cell diff-cell-del diff-cell-chg">${htmlA}</td>
          <td class="diff-num">${op.lineB}</td><td class="diff-cell diff-cell-ins diff-cell-chg">${htmlB}</td>
        </tr>`;
      }
    }
    html += '</tbody></table>';
    document.getElementById('diff-result').innerHTML = html;
  },

  _renderUnified(ops, showContext, CONTEXT) {
    let html = `<table class="diff-table diff-unified">
      <colgroup><col class="diff-col-num"><col class="diff-col-num"><col class="diff-col-content"></colgroup>
      <thead><tr><th class="diff-th">A</th><th class="diff-th">B</th><th class="diff-th">Contenu</th></tr></thead><tbody>`;

    const relevant = new Set();
    ops.forEach((op, idx) => {
      if (op.type !== 'eq') {
        for (let k = Math.max(0, idx-CONTEXT); k <= Math.min(ops.length-1, idx+CONTEXT); k++) relevant.add(k);
      }
    });

    let skip = false;
    for (let idx = 0; idx < ops.length; idx++) {
      if (showContext && !relevant.has(idx)) {
        if (!skip) {
          html += `<tr class="diff-skip-row"><td colspan="3"><span class="diff-skip-label">· · ·</span></td></tr>`;
          skip = true;
        }
        continue;
      }
      skip = false;
      const op = ops[idx];
      const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      if (op.type === 'eq') {
        html += `<tr class="diff-row-eq"><td class="diff-num">${op.lineA}</td><td class="diff-num">${op.lineB}</td><td class="diff-cell diff-cell-eq">${esc(op.text)}</td></tr>`;
      } else if (op.type === 'del') {
        html += `<tr class="diff-row-del"><td class="diff-num">${op.lineA}</td><td class="diff-num diff-num-empty"></td><td class="diff-cell diff-cell-del">− ${esc(op.text)}</td></tr>`;
      } else if (op.type === 'ins') {
        html += `<tr class="diff-row-ins"><td class="diff-num diff-num-empty"></td><td class="diff-num">${op.lineB}</td><td class="diff-cell diff-cell-ins">+ ${esc(op.text)}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    document.getElementById('diff-result').innerHTML = html;
  },

  // Apparie suppressions/ajouts consécutifs en opérations 'chg'
  _pairOps(ops) {
    const result = [];
    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'del' && i+1 < ops.length && ops[i+1].type === 'ins') {
        result.push({type: 'chg', lineA: ops[i].lineA, lineB: ops[i+1].lineB, textA: ops[i].text, textB: ops[i+1].text});
        i += 2;
      } else {
        result.push(ops[i]);
        i++;
      }
    }
    return result;
  },

  copyResult() {
    if (!this._lastResult) return;
    const {ops} = this._lastResult;
    let out = '';
    for (const op of ops) {
      if (op.type === 'del') out += `- ${op.text}\n`;
      else if (op.type === 'ins') out += `+ ${op.text}\n`;
      else out += `  ${op.text}\n`;
    }
    navigator.clipboard.writeText(out).then(() => {
      if (typeof toast !== 'undefined') toast('Diff copié dans le presse-papier', 'success');
    });
  }
};
