(() => {
  'use strict';

  // Keep the library, worker, notation font and SoundFont on the same release.
  const ALPHATAB_BASE = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.9.0/dist/';
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries([
    'score-list', 'score-count', 'score-search', 'library-status', 'file-input',
    'score-title', 'score-description', 'score-status', 'audio-status', 'play-pause',
    'stop', 'position', 'speed', 'loop', 'clear-range', 'zoom', 'track-panel',
    'track-list', 'score-viewport', 'notation', 'empty-state', 'download-source', 'download-pdf',
    'open-download', 'support-dialog', 'download-title', 'download-hint', 'payment-image',
    'payment-caption', 'save-payment'
  ].map(id => [id, byId(id)]));
  let catalog = [];
  let selectedId = null;
  let api = null;
  let libraryPromise = null;
  let requestId = 0;
  let controller = null;
  let localUrl = null;

  function setStatus(element, message, error = false) {
    element.textContent = message;
    element.classList.toggle('error', error);
  }

  function setPlaybackEnabled(enabled) {
    for (const id of ['play-pause', 'stop', 'speed', 'loop']) ui[id].disabled = !enabled;
    ui['track-list'].querySelectorAll('[data-audio]').forEach(input => { input.disabled = !enabled; });
  }

  function formatTime(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function loadLibrary() {
    if (window.alphaTab) return Promise.resolve(window.alphaTab);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => finish(new Error('AlphaTab 加载超时')), 30000);
      function finish(error) {
        window.clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          libraryPromise = null;
          reject(error);
        } else {
          resolve(window.alphaTab);
        }
      }
      script.src = `${ALPHATAB_BASE}alphaTab.min.js`;
      script.onload = () => finish(window.alphaTab ? null : new Error('AlphaTab 未能初始化'));
      script.onerror = () => finish(new Error('无法连接 AlphaTab CDN，请检查网络后重新打开乐谱'));
      document.head.append(script);
    });
    return libraryPromise;
  }

  function beginLoad(title, id) {
    const token = ++requestId;
    controller?.abort();
    controller = new AbortController();
    if (api) {
      api.destroy();
      api = null;
    }
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = null;
    selectedId = id;
    renderCatalog();
    setPlaybackEnabled(false);
    ui.zoom.disabled = ui['clear-range'].disabled = true;
    ui.speed.value = ui.zoom.value = '1';
    ui.loop.setAttribute('aria-pressed', 'false');
    ui['play-pause'].textContent = '▶ 播放';
    ui.position.textContent = '00:00 / 00:00';
    ui['score-title'].textContent = title;
    ui['score-description'].textContent = '';
    ui['open-download'].disabled = true;
    ui['download-title'].textContent = '正在打开乐谱…';
    ui['download-hint'].hidden = false;
    ui['download-hint'].textContent = '加载完成后即可下载。';
    ui['track-panel'].hidden = true;
    ui['track-list'].replaceChildren();
    for (const id of ['download-source', 'download-pdf']) {
      ui[id].hidden = true;
      ui[id].removeAttribute('href');
    }
    ui.notation.replaceChildren();
    ui['score-viewport'].scrollTop = ui['score-viewport'].scrollLeft = 0;
    ui['score-viewport'].setAttribute('aria-busy', 'true');
    ui['empty-state'].hidden = false;
    ui['empty-state'].querySelector('h3').textContent = '正在打开乐谱…';
    ui['empty-state'].querySelector('p').textContent = '首次使用需要加载乐谱引擎和音源，请稍候。';
    setStatus(ui['score-status'], '正在加载乐谱引擎与文件…');
    setStatus(ui['audio-status'], '');
    return token;
  }

  function showLoadError(error, token) {
    if (token !== requestId || error.name === 'AbortError') return;
    console.error('Score load failed:', error);
    setPlaybackEnabled(false);
    ui['score-viewport'].setAttribute('aria-busy', 'false');
    setStatus(ui['score-status'], error.message || '乐谱加载失败，请重新打开。', true);
    setStatus(ui['audio-status'], '');
    ui['empty-state'].hidden = false;
    ui['empty-state'].querySelector('h3').textContent = '这份乐谱暂时无法打开';
    ui['empty-state'].querySelector('p').textContent = '请检查文件是否完整、格式是否受支持，或选择另一份乐谱。';
    ui['download-title'].textContent = '乐谱加载失败';
    ui['download-hint'].textContent = '请重新选择一份乐谱。';
  }

  function createTracks(instance, score) {
    const visibleTracks = new Set([score.tracks[0].index]);
    for (const track of score.tracks) {
      const row = document.createElement('div');
      row.className = 'track-row';
      function checkbox(text, checked, onChange, audio = false) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        if (audio) {
          input.dataset.audio = '';
          input.disabled = !instance.isReadyForPlayback;
        }
        input.addEventListener('change', () => onChange(input));
        label.append(input, document.createTextNode(text));
        row.append(label);
      }
      checkbox(track.name || `音轨 ${track.index + 1}`, visibleTracks.has(track.index), input => {
        if (input.checked) visibleTracks.add(track.index);
        else visibleTracks.delete(track.index);
        if (!visibleTracks.size) {
          visibleTracks.add(track.index);
          input.checked = true;
          setStatus(ui['score-status'], '至少保留一条音轨显示。');
          return;
        }
        instance.renderTracks(score.tracks.filter(item => visibleTracks.has(item.index)));
      });
      checkbox('独奏', false, input => instance.changeTrackSolo([track], input.checked), true);
      checkbox('静音', false, input => instance.changeTrackMute([track], input.checked), true);
      ui['track-list'].append(row);
    }
    ui['track-panel'].hidden = false;
  }

  function displayScore(alphaTab, bytes, metadata, token) {
    if (token !== requestId) return;
    const host = document.createElement('div');
    ui.notation.replaceChildren(host);
    const instance = new alphaTab.AlphaTabApi(host, {
      core: { scriptFile: `${ALPHATAB_BASE}alphaTab.min.js`, fontDirectory: `${ALPHATAB_BASE}font/` },
      player: {
        enablePlayer: true,
        enableCursor: true,
        enableSeekToClick: true,
        enablePlaybackRangeSelection: true,
        soundFont: `${ALPHATAB_BASE}soundfont/sonivox.sf2`,
        scrollElement: ui['score-viewport']
      }
    });
    api = instance;
    let scoreLoaded = false;
    let failed = false;
    const current = () => token === requestId && api === instance && !failed;
    instance.scoreLoaded.on(score => {
      if (!current()) return;
      if (!score.tracks.length) {
        failed = true;
        showLoadError(new Error('这份乐谱没有可显示的音轨。'), token);
        return;
      }
      scoreLoaded = true;
      ui['score-title'].textContent = metadata.title || score.title || '未命名乐谱';
      ui['score-description'].textContent = [metadata.artist || score.artist, metadata.description].filter(Boolean).join(' · ');
      ui['empty-state'].hidden = true;
      ui.zoom.disabled = ui['clear-range'].disabled = false;
      createTracks(instance, score);
      if (metadata.localFile) localUrl = URL.createObjectURL(metadata.localFile);
      ui['download-source'].href = localUrl || metadata.file;
      ui['download-source'].download = metadata.filename || '';
      ui['download-source'].hidden = false;
      ui['open-download'].disabled = false;
      ui['download-title'].textContent = ui['score-title'].textContent;
      ui['download-hint'].hidden = Boolean(metadata.pdf);
      ui['download-hint'].textContent = '此曲目提供原谱下载，暂无 PDF。';
      if (metadata.pdf) {
        ui['download-pdf'].href = metadata.pdf;
        ui['download-pdf'].hidden = false;
      }
      setStatus(ui['score-status'], '正在排版乐谱…');
      setStatus(ui['audio-status'], '正在准备音源…');
    });
    instance.postRenderFinished.on(() => {
      if (!current() || !scoreLoaded) return;
      ui['score-viewport'].setAttribute('aria-busy', 'false');
      setStatus(ui['score-status'], '乐谱已载入');
    });
    instance.soundFontLoad.on(event => {
      if (!current()) return;
      const progress = event.total > 0 ? ` ${Math.round(event.loaded / event.total * 100)}%` : '';
      setStatus(ui['audio-status'], `正在加载音源${progress}…`);
    });
    instance.playerReady.on(() => {
      if (!current() || !scoreLoaded) return;
      setPlaybackEnabled(true);
      setStatus(ui['audio-status'], '音源就绪，可以播放');
    });
    instance.playerStateChanged.on(event => {
      if (!current()) return;
      ui['play-pause'].textContent = event.state === alphaTab.synth.PlayerState.Playing ? 'Ⅱ 暂停' : '▶ 播放';
    });
    instance.playerPositionChanged.on(event => {
      if (current()) ui.position.textContent = `${formatTime(event.currentTime)} / ${formatTime(event.endTime)}`;
    });
    instance.error.on(error => {
      if (!current()) return;
      failed = true;
      if (!scoreLoaded) showLoadError(new Error('无法解析这份乐谱，请确认文件格式与内容。'), token);
      else {
        console.error('AlphaTab error:', error);
        ui['score-viewport'].setAttribute('aria-busy', 'false');
        setStatus(ui['audio-status'], '谱面或音频加载失败，请检查网络后重新打开乐谱。', true);
        setPlaybackEnabled(false);
      }
    });
    if (!instance.load(bytes) && !failed) throw new Error('无法读取这份乐谱，请检查文件格式。');
  }

  // Paths in the catalog are relative to this directory, including on project Pages sites.
  function catalogUrl(path) {
    const directory = new URL('./', window.location.href);
    const url = new URL(path, directory);
    if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname)) {
      throw new Error('曲目文件与 PDF 须放在 scores 目录内。');
    }
    return url.href;
  }

  async function openEntry(entry) {
    const token = beginLoad(entry.title, entry.id);
    try {
      const file = catalogUrl(entry.file);
      const [alphaTab, bytes] = await Promise.all([
        loadLibrary(),
        fetch(file, { signal: controller.signal }).then(response => {
          if (!response.ok) throw new Error(`乐谱文件加载失败（HTTP ${response.status}），请检查文件路径。`);
          return response.arrayBuffer();
        })
      ]);
      displayScore(alphaTab, bytes, { ...entry, file, pdf: entry.pdf ? catalogUrl(entry.pdf) : null }, token);
    } catch (error) { showLoadError(error, token); }
  }

  async function openLocal(file) {
    const token = beginLoad(file.name, null);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    try {
      const [alphaTab, bytes] = await Promise.all([loadLibrary(), file.arrayBuffer()]);
      displayScore(alphaTab, bytes, { filename: file.name, localFile: file, description: '本地乐谱 · 仅在当前浏览器中打开' }, token);
    } catch (error) { showLoadError(error, token); }
  }

  function renderCatalog() {
    const query = ui['score-search'].value.trim().toLocaleLowerCase();
    const entries = catalog.filter(entry => [entry.title, entry.artist, ...(entry.tags || [])].join(' ').toLocaleLowerCase().includes(query));
    ui['score-count'].textContent = `${catalog.length} 首`;
    ui['score-list'].replaceChildren();
    for (const entry of entries) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-item';
      button.setAttribute('aria-current', String(entry.id === selectedId));
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const detail = document.createElement('span');
      detail.textContent = [entry.artist, ...(entry.tags || [])].filter(Boolean).join(' · ') || 'Guitar Pro 乐谱';
      button.append(title, detail);
      button.addEventListener('click', () => {
        const hash = `#${new URLSearchParams({ score: entry.id })}`;
        if (location.hash === hash) openEntry(entry);
        else location.hash = hash;
      });
      li.append(button);
      ui['score-list'].append(li);
    }
    setStatus(ui['library-status'], !catalog.length ? '谱架还空着，更多谱子会陆续放到这里。你也可以先打开一份本地乐谱。' : !entries.length ? '没有找到匹配的乐谱，试试其他关键词。' : `找到 ${entries.length} 首乐谱`);
  }

  function openFromHash() {
    const id = new URLSearchParams(location.hash.slice(1)).get('score');
    const entry = catalog.find(item => item.id === id);
    if (entry) openEntry(entry);
    else if (id) setStatus(ui['library-status'], '未找到链接中的曲目，请从谱架重新选择。', true);
  }

  for (const id of ['open-file', 'open-file-empty']) byId(id).addEventListener('click', () => ui['file-input'].click());
  function openSupport(focusDonation) {
    ui['support-dialog'].showModal();
    document.body.classList.add('dialog-open');
    if (focusDonation) byId('donate-heading').focus({ preventScroll: true });
  }
  ui['open-download'].addEventListener('click', () => openSupport(false));
  byId('open-support').addEventListener('click', () => openSupport(true));
  ui['support-dialog'].addEventListener('close', () => document.body.classList.remove('dialog-open'));
  ui['support-dialog'].addEventListener('click', event => {
    const rect = ui['support-dialog'].getBoundingClientRect();
    if (event.target === ui['support-dialog'] &&
        (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) {
      ui['support-dialog'].close();
    }
  });
  for (const [method, name, filename] of [['wechat', '微信', 'wechat-pay.png'], ['alipay', '支付宝', 'alipay.jpg']]) {
    byId(`pay-${method}`).addEventListener('click', () => {
      byId('pay-wechat').setAttribute('aria-pressed', String(method === 'wechat'));
      byId('pay-alipay').setAttribute('aria-pressed', String(method === 'alipay'));
      ui['payment-image'].src = `./assets/${filename}`;
      ui['payment-image'].alt = `${name}打赏收款码`;
      ui['payment-caption'].textContent = `使用${name}扫一扫，点击图片查看大图，或保存后识别`;
      byId('view-payment').href = `./assets/${filename}`;
      ui['save-payment'].href = `./assets/${filename}`;
      ui['save-payment'].download = filename;
    });
  }
  ui['file-input'].addEventListener('change', () => {
    const file = ui['file-input'].files[0];
    ui['file-input'].value = '';
    if (file) openLocal(file);
  });
  ui['score-search'].addEventListener('input', renderCatalog);
  ui['play-pause'].addEventListener('click', () => api?.playPause());
  ui.stop.addEventListener('click', () => api?.stop());
  ui.speed.addEventListener('change', () => { if (api) api.playbackSpeed = Number(ui.speed.value); });
  ui.loop.addEventListener('click', () => {
    if (!api) return;
    api.isLooping = !api.isLooping;
    ui.loop.setAttribute('aria-pressed', String(api.isLooping));
  });
  ui['clear-range'].addEventListener('click', () => {
    if (!api) return;
    api.playbackRange = null;
    api.clearPlaybackRangeHighlight();
    setStatus(ui['score-status'], '选段已清除，将播放整首乐谱。');
  });
  ui.zoom.addEventListener('change', () => {
    if (!api) return;
    api.settings.display.scale = Number(ui.zoom.value);
    api.updateSettings();
    api.render();
  });
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('pagehide', () => {
    // Keep the API intact when the browser caches this page for back navigation.
    api?.pause();
  });

  async function initCatalog() {
    try {
      const response = await fetch('./catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`曲目列表加载失败（HTTP ${response.status}）`);
      const data = await response.json();
      const ids = new Set();
      if (!Array.isArray(data)) throw new Error('曲目列表格式错误');
      for (const entry of data) {
        if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id) ||
            typeof entry.title !== 'string' || !entry.title.trim() || typeof entry.file !== 'string' || !entry.file.trim() ||
            (entry.artist != null && typeof entry.artist !== 'string') ||
            (entry.description != null && typeof entry.description !== 'string') ||
            (entry.tags != null && (!Array.isArray(entry.tags) || entry.tags.some(tag => typeof tag !== 'string'))) ||
            (entry.pdf != null && typeof entry.pdf !== 'string')) throw new Error('曲目列表格式错误，请检查必填字段和重复 ID');
        ids.add(entry.id);
        catalogUrl(entry.file);
        if (entry.pdf) catalogUrl(entry.pdf);
      }
      catalog = data;
      renderCatalog();
      // A local file chosen while the catalog loaded takes precedence.
      if (requestId === 0) {
        if (location.hash) openFromHash();
        else if (catalog.length) location.hash = new URLSearchParams({ score: catalog[0].id }).toString();
      }
    } catch (error) {
      setStatus(ui['library-status'], `${error.message}。仍可打开本地乐谱。`, true);
    }
  }
  initCatalog();
})();
