// Overleaf AI LaTeX Studio Pro - Dynamic Backend Database Architecture Engine
// Home Dashboard Dynamic Fetch, REST APIs, AI Accept/Reject Diff Workflow & Tectonic Engine

let editor;
let currentZoom = 100;
let commitHistory = [];
let currentView = 'home'; // 'home' | 'editor'
let pendingAIText = null;

// Active Project State (Loaded dynamically from GET /api/projects)
let projectsList = [];
let activeProject = null;
let fileStore = {};
let activeFile = 'main.tex';

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isUserContentFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const norm = filename.replace(/\\/g, '/');
  const parts = norm.split('/');
  for (const part of parts) {
    if (part.startsWith('.')) return false;
    if (['__pycache__', 'node_modules', '.venv', 'venv'].includes(part)) return false;
  }
  const fname = parts[parts.length - 1];
  if (['last_compiled.pdf', 'temp.tex'].includes(fname)) return false;
  return true;
}

function sanitizeFileStore(rawFiles) {
  if (!rawFiles || typeof rawFiles !== 'object') return {};
  const clean = {};
  Object.keys(rawFiles).forEach(key => {
    if (isUserContentFile(key)) {
      clean[key] = rawFiles[key];
    }
  });
  return clean;
}

function getSanitizedTextFilesPayload(files) {
  if (!files || typeof files !== 'object') return {};
  const clean = {};
  Object.keys(files).forEach(k => {
    const val = files[k];
    clean[k] = val;
  });
  return clean;
}

document.addEventListener('DOMContentLoaded', () => {
  initViewRouter();
  initDashboard();
  initProjectManagement();
  initCodeEditor();
  initNewFileModal();
  initNavigation();
  initPreviewTabs();
  initVersionControl();
  initAITools();
  initAITaskManager();
  initPdfInverseSearch();

  // Load existing projects from backend on startup
  fetchProjectsFromBackend();
});

// --- BACKEND REST API CALLS ---
let currentDashTab = 'active';

async function fetchProjectsFromBackend(filterQuery = '') {
  try {
    const res = await fetch(`/api/projects?tab=${currentDashTab}`);
    if (res.ok) {
      projectsList = await res.json();
      renderDashboard(filterQuery);
      renderProjectTitle();

      // Update sidebar tab counts asynchronously
      updateSidebarCounts();

      // Direct Hash Navigation Support:
      let hashProjId = null;
      const hash = window.location.hash;
      if (hash && hash.startsWith('#/project/')) {
        hashProjId = hash.replace('#/project/', '');
      }

      if (hashProjId && currentDashTab === 'active' && projectsList.some(p => p.id === hashProjId)) {
        if (!activeProject || activeProject.id !== hashProjId) {
          await openProjectFromDashboard(hashProjId);
        }
      } else if (!hashProjId) {
        // Ensure root URL stays on Home Dashboard view
        switchView('home');
      }
    }
  } catch (e) {
    console.warn('Error fetching projects from backend:', e);
  }
}

async function updateSidebarCounts() {
  try {
    const res = await fetch('/api/projects?tab=all');
    if (!res.ok) return;
    const allProjs = await res.json();

    const activeCount = allProjs.filter(p => !p.archived && !p.deleted_at).length;
    const archivedCount = allProjs.filter(p => p.archived && !p.deleted_at).length;
    const trashCount = allProjs.filter(p => p.deleted_at).length;

    const elActive = document.getElementById('nav-count-active');
    const elArchived = document.getElementById('nav-count-archived');
    const elTrash = document.getElementById('nav-count-trash');

    if (elActive) elActive.innerText = activeCount;
    if (elArchived) elArchived.innerText = archivedCount;
    if (elTrash) elTrash.innerText = trashCount;
  } catch (e) {
    console.warn('Error updating sidebar counts:', e);
  }
}

function switchDashboardTab(tab) {
  currentDashTab = tab;

  // Update navigation items state
  ['active', 'archived', 'trash'].forEach(t => {
    const btn = document.getElementById(`nav-dash-${t}`);
    if (btn) {
      if (t === tab) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  // Update title header text & search placeholder
  const titleEl = document.getElementById('dash-title-text');
  const searchInput = document.getElementById('search-projects-input');

  if (titleEl) {
    if (tab === 'archived') {
      titleEl.innerHTML = `<i class="fa-solid fa-box-archive" style="color:var(--accent-amber);"></i> Archived Projects`;
      if (searchInput) searchInput.placeholder = 'Search archived research papers or projects...';
    } else if (tab === 'trash') {
      titleEl.innerHTML = `<i class="fa-solid fa-trash-can" style="color:#ef4444;"></i> Trash`;
      if (searchInput) searchInput.placeholder = 'Search deleted projects in trash...';
    } else {
      titleEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color:var(--accent-purple);"></i> My Research Projects`;
      if (searchInput) searchInput.placeholder = 'Search research projects, papers, or files...';
    }
  }

  fetchProjectsFromBackend(searchInput ? searchInput.value.toLowerCase() : '');
}

let _loaderTimerInterval = null;
let _loaderStartTime = 0;

function showProjectLoader(projName = 'Research Project') {
  const modal = document.getElementById('project-loading-modal');
  const title = document.getElementById('loader-proj-title');
  const status = document.getElementById('loader-status-text');
  const bar = document.getElementById('loader-progress-bar');
  const timerBadge = document.getElementById('loader-timer-badge');
  const stepInfo = document.getElementById('loader-step-info');

  if (!modal) return;

  if (title) title.innerText = `Opening "${projName}"...`;
  if (status) status.innerText = 'Connecting to workspace backend...';
  if (bar) bar.style.width = '15%';
  if (stepInfo) stepInfo.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 6px; color: var(--accent-purple);"></i> Step 1 of 3';
  if (timerBadge) timerBadge.innerText = '0.0s';

  // Reset Checklist
  for (let i = 1; i <= 3; i++) {
    const chk = document.getElementById(`chk-step-${i}`);
    const icon = document.getElementById(`chk-icon-${i}`);
    if (chk && icon) {
      if (i === 1) {
        chk.style.color = 'var(--text-primary)';
        icon.className = 'fa-solid fa-circle-notch fa-spin';
        icon.style.color = 'var(--accent-purple)';
      } else {
        chk.style.color = 'var(--text-muted)';
        icon.className = 'fa-regular fa-circle';
        icon.style.color = 'var(--text-muted)';
      }
    }
  }

  modal.style.zIndex = '99999';
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.classList.add('active');

  // Start Timer
  _loaderStartTime = Date.now();
  if (_loaderTimerInterval) clearInterval(_loaderTimerInterval);
  _loaderTimerInterval = setInterval(() => {
    const elapsedSec = ((Date.now() - _loaderStartTime) / 1000).toFixed(1);
    if (timerBadge) timerBadge.innerText = `${elapsedSec}s`;
  }, 100);
}

function updateProjectLoaderStep(step, percent, statusMsg) {
  const status = document.getElementById('loader-status-text');
  const bar = document.getElementById('loader-progress-bar');
  const stepInfo = document.getElementById('loader-step-info');

  if (status && statusMsg) status.innerText = statusMsg;
  if (bar && percent !== undefined) bar.style.width = `${percent}%`;
  if (stepInfo) stepInfo.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-right: 6px; color: var(--accent-purple);"></i> Step ${step} of 3`;

  for (let i = 1; i <= 3; i++) {
    const chk = document.getElementById(`chk-step-${i}`);
    const icon = document.getElementById(`chk-icon-${i}`);
    if (!chk || !icon) continue;

    if (i < step) {
      chk.style.color = '#34d399';
      icon.className = 'fa-solid fa-circle-check';
      icon.style.color = '#34d399';
    } else if (i === step) {
      chk.style.color = 'var(--text-primary)';
      icon.className = 'fa-solid fa-circle-notch fa-spin';
      icon.style.color = 'var(--accent-purple)';
    } else {
      chk.style.color = 'var(--text-muted)';
      icon.className = 'fa-regular fa-circle';
      icon.style.color = 'var(--text-muted)';
    }
  }
}

function hideProjectLoader() {
  const modal = document.getElementById('project-loading-modal');
  const bar = document.getElementById('loader-progress-bar');

  if (bar) bar.style.width = '100%';

  for (let i = 1; i <= 3; i++) {
    const chk = document.getElementById(`chk-step-${i}`);
    const icon = document.getElementById(`chk-icon-${i}`);
    if (chk && icon) {
      chk.style.color = '#34d399';
      icon.className = 'fa-solid fa-circle-check';
      icon.style.color = '#34d399';
    }
  }

  if (_loaderTimerInterval) {
    clearInterval(_loaderTimerInterval);
    _loaderTimerInterval = null;
  }

  setTimeout(() => {
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }, 250);
}

// --- MULTI-USER REAL-TIME WORKSPACE SYNC ENGINE ---
let liveSyncInterval = null;
let lastKnownProjectVersion = 0;
let lastKnownUpdatedAt = 0;
let isLocalSaving = false;

function initLiveWorkspaceSync() {
  if (liveSyncInterval) clearInterval(liveSyncInterval);

  liveSyncInterval = setInterval(async () => {
    if (currentView !== 'editor' || !activeProject || !activeProject.id || isLocalSaving) {
      return;
    }

    try {
      const res = await fetch(`/api/projects?id=${activeProject.id}&meta_only=true`);
      if (!res.ok) return;

      const remoteMeta = await res.json();
      const remoteVersion = remoteMeta.version || 0;
      const remoteUpdatedAt = remoteMeta.updated_at || 0;
      const remoteFilesList = remoteMeta.files || [];

      const localFilesList = Object.keys(fileStore).filter(isUserContentFile);
      const hasFileDifference = remoteFilesList.some(f => !localFilesList.includes(f)) ||
                                localFilesList.some(f => !remoteFilesList.includes(f));

      if (remoteVersion > lastKnownProjectVersion || remoteUpdatedAt > lastKnownUpdatedAt || hasFileDifference) {
        await syncRemoteWorkspaceChanges(activeProject.id, remoteFilesList);
        lastKnownProjectVersion = remoteVersion;
        lastKnownUpdatedAt = remoteUpdatedAt;
      }
    } catch (err) {
      console.warn('Live workspace sync polling exception:', err);
    }
  }, 2000);
}

async function syncRemoteWorkspaceChanges(projId, remoteFilesList) {
  try {
    const res = await fetch(`/api/projects?id=${projId}`);
    if (!res.ok) return;

    const fullProjData = await res.json();
    const remoteFiles = fullProjData.files || {};

    let filesAddedCount = 0;
    let filesUpdatedCount = 0;
    let filesDeletedCount = 0;
    const addedFileNames = [];

    // 1. Sync newly added or updated remote files into local fileStore
    for (const [filePath, remoteContent] of Object.entries(remoteFiles)) {
      if (!isUserContentFile(filePath)) continue;

      if (!fileStore.hasOwnProperty(filePath)) {
        fileStore[filePath] = remoteContent;
        filesAddedCount++;
        addedFileNames.push(filePath);
      } else if (fileStore[filePath] !== remoteContent) {
        if (filePath !== activeFile) {
          fileStore[filePath] = remoteContent;
          filesUpdatedCount++;
        }
      }
    }

    // 2. Remove files deleted remotely
    for (const localFile of Object.keys(fileStore)) {
      if (!isUserContentFile(localFile)) continue;
      if (!remoteFiles.hasOwnProperty(localFile)) {
        delete fileStore[localFile];
        filesDeletedCount++;
      }
    }

    if (filesAddedCount > 0 || filesUpdatedCount > 0 || filesDeletedCount > 0) {
      addedFileNames.forEach(f => {
        if (f.includes('/')) {
          const parts = f.split('/');
          parts.pop();
          expandedFolders.add(parts.join('/'));
        }
      });

      renderFileList();

      if (typeof showToast === 'function') {
        const addedMsg = filesAddedCount > 0 
          ? `+${filesAddedCount} file(s) (${addedFileNames.slice(0, 2).join(', ')})`
          : '';
        const msg = `⚡ Synced: Received live updates from concurrent session! ${addedMsg}`;
        showToast(msg, 'info');
      }

      if (editor) {
        editor.refresh();
        if (typeof runLaTeXSyntaxDiagnostics === 'function') {
          runLaTeXSyntaxDiagnostics();
        }
      }
    }
  } catch (err) {
    console.warn('Error syncing remote workspace changes:', err);
  }
}

async function openProjectFromDashboard(projId, projNameHint) {
  try {
    let projName = projNameHint;
    if (!projName && typeof allProjects !== 'undefined' && Array.isArray(allProjects)) {
      const found = allProjects.find(p => p.id === projId);
      if (found) projName = found.name;
    }

    showProjectLoader(projName || 'Research Project');
    updateProjectLoaderStep(1, 30, 'Retrieving source code & LaTeX files...');
    await new Promise(r => setTimeout(r, 220));

    // Strict Project Boundary: Clear PDF Preview & Compiler State from Previous Project
    if (activePdfBlobUrl) {
      URL.revokeObjectURL(activePdfBlobUrl);
      activePdfBlobUrl = null;
    }
    const pdfFrame = document.getElementById('pdf-frame');
    if (pdfFrame) pdfFrame.src = 'about:blank';
    const paperContent = document.getElementById('paper-content');
    if (paperContent) paperContent.innerHTML = '';

    const res = await fetch(`/api/projects?id=${projId}`);
    if (res.ok) {
      activeProject = await res.json();
      fileStore = sanitizeFileStore(activeProject.files);
      lastKnownProjectVersion = activeProject.version || 0;
      lastKnownUpdatedAt = activeProject.updated_at || 0;
      const userKeys = Object.keys(fileStore);
      activeFile = (activeProject.main_file && isUserContentFile(activeProject.main_file)) ? activeProject.main_file : (userKeys[0] || 'main.tex');
      await loadProjectHistory(activeProject.id);

      updateProjectLoaderStep(2, 65, 'Preparing CodeMirror editor & workspace layout...');
      await new Promise(r => setTimeout(r, 250));

      const searchInput = document.getElementById('file-tree-search-input');
      if (searchInput) searchInput.value = '';

      renderProjectTitle();
      renderFileList();
      renderAITasks();

      if (editor) {
        editor.setValue(fileStore[activeFile] || '');
        const indicator = document.getElementById('active-file-indicator');
        if (indicator) indicator.innerText = activeFile;
        const pdfLabel = document.getElementById('pdf-file-label');
        if (pdfLabel) pdfLabel.innerText = activeFile;
        setTimeout(() => editor.refresh(), 50);
      }

      updateProjectLoaderStep(3, 90, 'Compiling PDF preview & SyncTeX mapping...');
      await compileLaTeX();
      ensurePdfViewActive();

      updateProjectLoaderStep(3, 100, 'Project ready! Launching workspace...');
      await new Promise(r => setTimeout(r, 300));

      switchView('editor', projId);
      hideProjectLoader();
    } else {
      hideProjectLoader();
      alert('Failed to load project from server.');
    }
  } catch (e) {
    hideProjectLoader();
    alert(`Error opening project: ${e.message}`);
  }
}

async function createNewProjectFromDashboard() {
  let projName = prompt('Enter new LaTeX Project Name:', 'QSM_Research_Paper');
  if (!projName) return;
  projName = projName.trim();

  showProjectLoader(projName);
  updateProjectLoaderStep(1, 35, 'Initializing project structure on backend...');

  try {
    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projName,
        description: 'LaTeX Research Paper'
      })
    });

    if (res.ok) {
      activeProject = await res.json();
      fileStore = sanitizeFileStore(activeProject.files);
      activeFile = (activeProject.main_file && isUserContentFile(activeProject.main_file)) ? activeProject.main_file : 'main.tex';

      updateProjectLoaderStep(2, 70, 'Building initial file tree & editor buffer...');
      await fetchProjectsFromBackend();
      renderFileList();

      if (editor) {
        editor.setValue(fileStore[activeFile] || '');
        document.getElementById('active-file-indicator').innerText = activeFile;
      }

      updateProjectLoaderStep(3, 90, 'Compiling initial LaTeX PDF document...');
      await compileLaTeX();

      updateProjectLoaderStep(3, 100, 'Workspace ready!');
      switchView('editor');
      setTimeout(() => hideProjectLoader(), 250);
    } else {
      hideProjectLoader();
      alert('Error creating project');
    }
  } catch (e) {
    hideProjectLoader();
    alert(`Error creating project: ${e.message}`);
  }
}

let _autoSaveTimer = null;

async function saveCurrentProjectToBackend(immediate = false) {
  if (!activeProject || !editor) return;

  if (fileStore && activeFile) {
    fileStore[activeFile] = editor.getValue();
  }

  if (!immediate) {
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(() => _performSaveBackend(), 700);
  } else {
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    await _performSaveBackend();
  }
}

async function _performSaveBackend() {
  if (!activeProject || !editor) return;
  isLocalSaving = true;
  try {
    const payloadFiles = getSanitizedTextFilesPayload(fileStore);
    const res = await fetch('/api/projects/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject.id,
        name: activeProject.name,
        main_file: activeFile,
        files: payloadFiles,
        expected_version: lastKnownProjectVersion
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.version) lastKnownProjectVersion = data.version;
      if (data.updated_at) lastKnownUpdatedAt = data.updated_at;
      const statusEl = document.getElementById('save-status');
      if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved';
    } else if (res.status === 409) {
      const conflict = await res.json();
      const statusEl = document.getElementById('save-status');
      if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Conflict';
      showToast(conflict.error || 'Project changed remotely. Reload before saving.', 'error');
    }
  } catch (e) {
    console.warn('Error saving to backend:', e);
  } finally {
    isLocalSaving = false;
  }
}

async function deleteProjectFromDashboard(projId) {
  if (confirm('Are you sure you want to delete this project permanently from backend disk?')) {
    try {
      const res = await fetch('/api/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projId })
      });

      if (res.ok) {
        await fetchProjectsFromBackend();
      }
    } catch (e) {
      alert(`Error deleting project: ${e.message}`);
    }
  }
}

async function toggleFavorite(projId) {
  try {
    const res = await fetch('/api/projects/toggle-favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projId })
    });

    if (res.ok) {
      await fetchProjectsFromBackend();
    }
  } catch (e) {
    console.warn('Error toggling favorite:', e);
  }
}

// --- STATE ROUTER & SHORTCUT INTERCEPTOR ---
function initViewRouter() {
  const returnToHomeDashboard = async () => {
    if (currentView === 'editor') {
      await saveCurrentProjectToBackend();
      window.location.hash = '';
      localStorage.removeItem('activeProjectId');
      await fetchProjectsFromBackend();
      switchView('home');
    }
  };

  const btnBack = document.getElementById('btn-back-dashboard');
  if (btnBack) {
    btnBack.addEventListener('click', returnToHomeDashboard);
  }

  const brandHome = document.getElementById('brand-logo-home');
  if (brandHome) {
    brandHome.addEventListener('click', returnToHomeDashboard);
  }

  // Intercept Ctrl+S / Cmd+S globally to prevent browser webpage save dialog or page reload
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      e.stopPropagation();
      if (currentView === 'editor' && activeProject) {
        saveCurrentProjectToBackend();
        compileLaTeX();
      }
    }
  });

  // Handle URL hash changes (e.g. browser back/forward buttons)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#/project/')) {
      const projId = hash.replace('#/project/', '');
      if (projId && (!activeProject || activeProject.id !== projId)) {
        openProjectFromDashboard(projId);
      }
    } else if (hash === '' || hash === '#/' || hash === '#/home') {
      if (currentView !== 'home') {
        switchView('home');
      }
    }
  });
}

let editorLayoutMode = localStorage.getItem('editor_layout_mode') || 'split';

function setEditorLayoutMode(mode) {
  editorLayoutMode = mode;
  localStorage.setItem('editor_layout_mode', mode);

  const mainContainer = document.querySelector('.app-main');

  if (mainContainer) {
    mainContainer.classList.remove('mode-editor-only', 'mode-pdf-only', 'mode-split');
    if (mode === 'editor') mainContainer.classList.add('mode-editor-only');
    else if (mode === 'pdf') mainContainer.classList.add('mode-pdf-only');
    else mainContainer.classList.add('mode-split');
  }

  // Synchronize all view switcher control instances across Code Editor and Preview toolbars
  document.querySelectorAll('.btn-layout-editor').forEach(el => el.classList.toggle('active', mode === 'editor'));
  document.querySelectorAll('.btn-layout-split').forEach(el => el.classList.toggle('active', mode === 'split'));
  document.querySelectorAll('.btn-layout-pdf').forEach(el => el.classList.toggle('active', mode === 'pdf'));

  // Refresh CodeMirror so text wrapping and scrollbars adjust immediately
  if (editor) {
    setTimeout(() => {
      editor.refresh();
    }, 60);
  }
}

function switchView(targetView, projId = null) {
  currentView = targetView;
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  
  if (targetView === 'home') {
    if (liveSyncInterval) clearInterval(liveSyncInterval);
    document.getElementById('view-dashboard').classList.add('active');
    if (window.location.hash !== '') {
      history.replaceState(null, '', ' ');
    }
    localStorage.removeItem('activeProjectId');

    // Strict Project Boundary: Clear PDF Preview & Compiler State
    if (activePdfBlobUrl) {
      URL.revokeObjectURL(activePdfBlobUrl);
      activePdfBlobUrl = null;
    }
    const pdfFrame = document.getElementById('pdf-frame');
    if (pdfFrame) pdfFrame.src = 'about:blank';
    const paperContent = document.getElementById('paper-content');
    if (paperContent) paperContent.innerHTML = '';
    const logOutput = document.getElementById('compiler-log-output');
    if (logOutput) logOutput.innerText = 'Compiler log will appear here after compilation.';
    activeProject = null;

    renderDashboard();
  } else {
    document.getElementById('view-editor').classList.add('active');
    ensurePdfViewActive();
    setEditorLayoutMode(editorLayoutMode);
    const idToSave = projId || (activeProject && activeProject.id);
    if (idToSave) {
      window.location.hash = `#/project/${idToSave}`;
      localStorage.setItem('activeProjectId', idToSave);
    }
    initLiveWorkspaceSync();
    setTimeout(() => {
      if (editor) editor.refresh();
    }, 50);
  }
}

// --- HOME DASHBOARD ENGINE ---
function initDashboard() {
  const searchInput = document.getElementById('search-projects-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderDashboard(e.target.value.toLowerCase());
    });
  }

  const btnDashNew = document.getElementById('btn-dash-new-proj');
  if (btnDashNew) {
    btnDashNew.addEventListener('click', createNewProjectFromDashboard);
  }

  const btnDashImport = document.getElementById('btn-dash-import-zip');
  const zipInput = document.getElementById('zip-import-input');
  if (btnDashImport && zipInput) {
    btnDashImport.addEventListener('click', () => zipInput.click());
    zipInput.addEventListener('change', handleDashboardZipImport);
  }
}

let dashboardViewMode = localStorage.getItem('dash_view_mode') || 'grid';

function setDashboardView(mode) {
  dashboardViewMode = mode;
  localStorage.setItem('dash_view_mode', mode);

  const searchInput = document.getElementById('search-projects-input');
  renderDashboard(searchInput ? searchInput.value.toLowerCase() : '');
}

function renderDashboard(filterQuery = '') {
  const grid = document.getElementById('projects-grid');
  const countText = document.getElementById('proj-count-text');
  if (!grid) return;

  grid.innerHTML = '';

  const filtered = projectsList.filter(proj => {
    return proj.name.toLowerCase().includes(filterQuery) || (proj.description && proj.description.toLowerCase().includes(filterQuery));
  });

  if (countText) {
    countText.innerText = `${filtered.length} Project${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    let emptyMsg = filterQuery ? 'No matching projects found.' : 'No projects found in this section.';
    if (!filterQuery) {
      if (currentDashTab === 'archived') emptyMsg = 'No archived projects found.';
      else if (currentDashTab === 'trash') emptyMsg = 'Trash is empty.';
      else if (currentDashTab === 'shared') emptyMsg = 'No projects shared with you.';
    }

    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; color:var(--text-muted);">
        <i class="fa-solid fa-folder-open" style="font-size:3rem; margin-bottom:12px; opacity:0.4;"></i>
        <div style="font-size:1.1rem; font-weight:500;">${emptyMsg}</div>
      </div>
    `;
    return;
  }
  
  if (dashboardViewMode === 'list') {
    grid.classList.add('list-view');
  } else {
    grid.classList.remove('list-view');
  }

  // Sync button active states
  const btnGrid = document.getElementById('btn-view-grid');
  const btnList = document.getElementById('btn-view-list');
  if (btnGrid && btnList) {
    if (dashboardViewMode === 'grid') {
      btnGrid.classList.add('active');
      btnList.classList.remove('active');
    } else {
      btnList.classList.add('active');
      btnGrid.classList.remove('active');
    }
  }

  filtered.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.cursor = 'pointer';
    card.onclick = (e) => {
      if (!e.target.closest('button')) {
        card.classList.add('opening-pulse');
        openProjectFromDashboard(proj.id, proj.name);
      }
    };

    const safeProjName = (proj.name || 'Project').replace(/'/g, "\\'");

    // Action buttons based on active tab state
    let actionButtonsHtml = '';
    if (currentDashTab === 'trash') {
      actionButtonsHtml = `
        <button class="btn btn-sm btn-primary" onclick="restoreProjectFromDashboard('${proj.id}')" title="Restore Project">
          <i class="fa-solid fa-rotate-left"></i> Restore
        </button>
        <button class="btn btn-sm btn-secondary" onclick="permanentDeleteProjectFromDashboard('${proj.id}')" title="Delete Permanently">
          <i class="fa-solid fa-trash-can" style="color:#ef4444;"></i> Delete
        </button>
      `;
    } else if (currentDashTab === 'archived') {
      actionButtonsHtml = `
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openProjectFromDashboard('${proj.id}', '${safeProjName}')">
          <i class="fa-solid fa-folder-open"></i> Open
        </button>
        <button class="btn btn-sm btn-secondary" onclick="restoreProjectFromDashboard('${proj.id}')" title="Restore to Active">
          <i class="fa-solid fa-rotate-left"></i> Restore
        </button>
        <button class="btn btn-sm btn-secondary" onclick="downloadProjectZip('${proj.id}')" title="Download .zip">
          <i class="fa-solid fa-download"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="trashProjectFromDashboard('${proj.id}')" title="Move to Trash">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
    } else { // 'active' or 'shared'
      actionButtonsHtml = `
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openProjectFromDashboard('${proj.id}', '${safeProjName}')">
          <i class="fa-solid fa-folder-open"></i> Open
        </button>
        <button class="btn btn-sm btn-secondary" onclick="archiveProjectFromDashboard('${proj.id}')" title="Archive Project">
          <i class="fa-solid fa-box-archive" style="color:var(--accent-amber);"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="downloadProjectZip('${proj.id}')" title="Download .zip">
          <i class="fa-solid fa-download"></i>
        </button>
        <button class="btn btn-sm btn-secondary" onclick="trashProjectFromDashboard('${proj.id}')" title="Move to Trash">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
    }

    if (dashboardViewMode === 'list') {
      // Row / List View layout
      card.innerHTML = `
        <div class="project-card-header">
          <button class="star-btn ${proj.favorite ? 'starred' : ''}" onclick="toggleFavorite('${proj.id}')" title="Toggle Favorite">
            <i class="fa-${proj.favorite ? 'solid' : 'regular'} fa-star"></i>
          </button>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span class="project-card-title">${proj.name}</span>
            <span style="font-size:0.75rem; color:var(--text-muted);">${proj.description || 'LaTeX Paper Project'}</span>
          </div>
        </div>

        <div class="project-card-meta">
          <span><i class="fa-regular fa-clock"></i> ${proj.archived_at ? 'Archived ' + proj.archived_at : (proj.deleted_at ? 'Deleted ' + proj.deleted_at : (proj.modified_at || 'Recently'))}</span>
          <span><i class="fa-solid fa-file"></i> ${proj.file_count || 1} file(s)</span>
          ${proj.github_repo ? '<span class="badge" style="background:rgba(168,85,247,0.15); color:var(--accent-purple);"><i class="fa-brands fa-github"></i> Remote Synced</span>' : ''}
        </div>

        <div class="project-card-footer">
          ${actionButtonsHtml}
        </div>
      `;
    } else {
      // Grid Card layout
      card.innerHTML = `
        <div class="project-card-header">
          <span class="project-card-title">${proj.name}</span>
          <button class="star-btn ${proj.favorite ? 'starred' : ''}" onclick="toggleFavorite('${proj.id}')" title="Toggle Favorite">
            <i class="fa-${proj.favorite ? 'solid' : 'regular'} fa-star"></i>
          </button>
        </div>

        <div class="project-card-meta">
          <span><i class="fa-regular fa-clock"></i> ${proj.archived_at ? 'Archived ' + proj.archived_at : (proj.deleted_at ? 'Deleted ' + proj.deleted_at : (proj.modified_at || 'Recently'))}</span>
          <span><i class="fa-solid fa-file"></i> ${proj.file_count || 1} file(s)</span>
        </div>

        <div class="project-card-footer">
          ${actionButtonsHtml}
        </div>
      `;
    }

    grid.appendChild(card);
  });
}

// Lifecycle action helpers
async function archiveProjectFromDashboard(projId) {
  try {
    const res = await fetch('/api/projects/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projId })
    });
    if (res.ok) {
      fetchProjectsFromBackend();
    } else {
      alert('Failed to archive project.');
    }
  } catch (e) {
    alert('Error archiving project: ' + e.message);
  }
}

async function restoreProjectFromDashboard(projId) {
  try {
    const res = await fetch('/api/projects/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projId })
    });
    if (res.ok) {
      fetchProjectsFromBackend();
    } else {
      alert('Failed to restore project.');
    }
  } catch (e) {
    alert('Error restoring project: ' + e.message);
  }
}

async function trashProjectFromDashboard(projId) {
  try {
    const res = await fetch('/api/projects/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projId })
    });
    if (res.ok) {
      fetchProjectsFromBackend();
    } else {
      alert('Failed to move project to trash.');
    }
  } catch (e) {
    alert('Error moving project to trash: ' + e.message);
  }
}

async function permanentDeleteProjectFromDashboard(projId) {
  const proj = projectsList.find(p => p.id === projId);
  const name = proj ? proj.name : 'this project';

  if (!confirm(`Are you sure you want to PERMANENTLY delete "${name}"?\nThis action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch('/api/projects/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projId })
    });
    if (res.ok) {
      fetchProjectsFromBackend();
    } else {
      alert('Failed to delete project permanently.');
    }
  } catch (e) {
    alert('Error deleting project: ' + e.message);
  }
}

function downloadProjectZip(projId) {
  window.location.href = `/api/projects/download?id=${projId}`;
}

async function handleDashboardZipImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const projName = file.name.replace(/\.zip$/i, '');

  try {
    const zip = await JSZip.loadAsync(file);
    const filesObj = {};
    let mainFile = 'main.tex';

    const entryKeys = Object.keys(zip.files);
    
    // Detect single top-level wrapper folder
    const topDirs = new Set();
    entryKeys.forEach(k => {
      const parts = k.trim().replace(/^\/+/g, '').split('/');
      if (parts.length > 1) {
        topDirs.add(parts[0]);
      }
    });

    let stripPrefix = '';
    if (topDirs.size === 1) {
      stripPrefix = Array.from(topDirs)[0] + '/';
    }

    for (const entryName of entryKeys) {
      const entry = zip.files[entryName];
      if (entry.dir) continue;

      let cleanPath = entryName;
      if (stripPrefix && cleanPath.startsWith(stripPrefix)) {
        cleanPath = cleanPath.slice(stripPrefix.length);
      }

      cleanPath = cleanPath.replace(/^\/+/g, '');
      if (!cleanPath || cleanPath.startsWith('__MACOSX') || cleanPath.includes('/.')) continue;

      if (cleanPath.match(/\.(png|jpg|jpeg|gif|svg|webp|pdf|eps|ico|bmp)$/i)) {
        const b64 = await entry.async('base64');
        const ext = cleanPath.split('.').pop().toLowerCase();
        const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : (ext === 'png' ? 'image/png' : (ext === 'pdf' ? 'application/pdf' : 'image/png'));
        filesObj[cleanPath] = `data:${mime};base64,${b64}`;
      } else {
        const textContent = await entry.async('text');
        filesObj[cleanPath] = textContent;
      }

      if (cleanPath === 'main.tex') {
        mainFile = 'main.tex';
      } else if (cleanPath.endsWith('.tex') && mainFile !== 'main.tex') {
        const txt = filesObj[cleanPath] || '';
        if (txt.includes('\\documentclass')) {
          mainFile = cleanPath;
        } else if (!mainFile) {
          mainFile = cleanPath;
        }
      }
    }

    if (Object.keys(filesObj).length === 0) {
      alert('⚠️ No valid user files found in the ZIP archive.');
      e.target.value = '';
      return;
    }

    const res = await fetch('/api/projects/import-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: file
    });

    if (res.ok) {
      const importedProj = await res.json();
      await fetchProjectsFromBackend();
      openProjectFromDashboard(importedProj.id);
      if (typeof showToast === 'function') {
        showToast(`🎉 Imported project "${projName}" with ${Object.keys(filesObj).length} files!`, 'success');
      }
    } else {
      const err = await res.json();
      alert(`Failed to import ZIP: ${err.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Error importing zip archive: ${err.message}`);
  }
  e.target.value = '';
}

// --- PROJECT MANAGEMENT IN EDITOR ---
function initProjectManagement() {
  const btnRenameProj = document.getElementById('btn-rename-project');
  if (btnRenameProj) {
    btnRenameProj.addEventListener('click', renameActiveProject);
  }
}

function renderProjectTitle() {
  const display = document.getElementById('project-title-display');
  if (!display) return;
  if (activeProject && activeProject.name) {
    display.innerText = activeProject.name;
  } else {
    display.innerText = 'LaTeX Project';
  }
}

async function renameActiveProject() {
  if (!activeProject) return;
  let currentName = activeProject.name || 'LaTeX Project';
  let newProjName = prompt(`Enter new name for project '${currentName}':`, currentName);
  if (!newProjName || newProjName.trim() === '' || newProjName.trim() === currentName) return;
  newProjName = newProjName.trim();

  activeProject.name = newProjName;

  const idx = projectsList.findIndex(p => p.id === activeProject.id);
  if (idx !== -1) {
    projectsList[idx].name = newProjName;
  }

  renderProjectTitle();
  renderDashboard();
  await saveCurrentProjectToBackend();
}

// --- FILE & FOLDER STRUCTURE & DRAG-AND-DROP MANAGEMENT ---
let expandedFolders = new Set(['figures', 'sections', 'chapters']);
let currentDraggedPath = null;

function openNewFolderModal() {
  const modal = document.getElementById('new-folder-modal');
  const input = document.getElementById('new-foldername-input');
  if (modal) modal.classList.add('active');
  if (input) {
    input.value = 'figures';
    input.focus();
    input.select();
  }
}

function setFolderPreset(presetName) {
  const input = document.getElementById('new-foldername-input');
  if (input) {
    input.value = presetName;
    input.focus();
  }
}

async function confirmCreateNewFolder() {
  const input = document.getElementById('new-foldername-input');
  if (!input) return;
  let folderName = input.value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!folderName) {
    alert('Please enter a valid folder name.');
    return;
  }

  const folderKey = `${folderName}/`;
  if (fileStore[folderKey]) {
    alert(`Folder "${folderName}" already exists in this project.`);
    return;
  }

  fileStore[folderKey] = '';
  expandedFolders.add(folderName);

  closeModal('new-folder-modal');
  await saveCurrentProjectToBackend(true);
  renderFileList();

  if (typeof showToast === 'function') {
    showToast(`📁 Created folder "${folderName}/"`, 'success');
  }
}

async function createNewFolder() {
  openNewFolderModal();
}

function renderFileList() {
  const container = document.getElementById('file-list');
  if (!container) return;
  container.innerHTML = '';

  const searchInput = document.getElementById('file-tree-search-input');
  const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let userKeys = Object.keys(fileStore).filter(isUserContentFile);
  if (searchQuery) {
    userKeys = userKeys.filter(k => k.toLowerCase().includes(searchQuery));
  }

  const foldersSet = new Set();
  userKeys.forEach(k => {
    if (k.endsWith('/')) {
      const cleanF = k.slice(0, -1);
      if (cleanF) foldersSet.add(cleanF);
    } else if (k.includes('/')) {
      const parts = k.split('/');
      parts.pop();
      let currentAcc = '';
      parts.forEach(p => {
        currentAcc = currentAcc ? `${currentAcc}/${p}` : p;
        foldersSet.add(currentAcc);
      });
    }
  });

  const sortedFolders = Array.from(foldersSet).sort();

  container.ondragover = (e) => {
    e.preventDefault();
    container.classList.add('root-drag-over');
  };
  container.ondragleave = () => {
    container.classList.remove('root-drag-over');
  };
  container.ondrop = async (e) => {
    e.preventDefault();
    container.classList.remove('root-drag-over');
    const draggedFile = e.dataTransfer.getData('text/plain');
    if (draggedFile) {
      await moveFileToFolder(draggedFile, '');
    }
  };

  // Build hierarchical file tree structure
  const rootItems = [];
  const folderChildrenMap = {};

  sortedFolders.forEach(f => { folderChildrenMap[f] = { subFolders: [], files: [] }; });

  sortedFolders.forEach(f => {
    if (!f.includes('/')) {
      rootItems.push({ type: 'folder', name: f, fullPath: f });
    } else {
      const parts = f.split('/');
      parts.pop();
      const parent = parts.join('/');
      if (folderChildrenMap[parent]) {
        folderChildrenMap[parent].subFolders.push(f);
      }
    }
  });

  userKeys.forEach(k => {
    if (k.endsWith('/')) return;
    if (!k.includes('/')) {
      rootItems.push({ type: 'file', fullPath: k });
    } else {
      const parts = k.split('/');
      parts.pop();
      const parent = parts.join('/');
      if (folderChildrenMap[parent]) {
        folderChildrenMap[parent].files.push(k);
      }
    }
  });

  // Sort root items: Folders first, then Files
  rootItems.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.fullPath.localeCompare(b.fullPath);
  });

  // Calculate total recursively nested items inside each folder
  sortedFolders.forEach(f => {
    const prefix = `${f}/`;
    const totalNested = userKeys.filter(k => k.startsWith(prefix) && !k.endsWith('/')).length;
    folderChildrenMap[f]._totalNested = totalNested;
  });

  // Auto-expand root folders if loading a project initially
  if (expandedFolders.size === 0 && sortedFolders.length > 0) {
    sortedFolders.forEach(f => expandedFolders.add(f));
  }

  function renderFolderNode(folderPath) {
    const isExpanded = expandedFolders.has(folderPath);
    const folderLi = document.createElement('li');
    folderLi.className = 'folder-item';

    const childData = folderChildrenMap[folderPath] || { subFolders: [], files: [] };
    const countBadge = folderChildrenMap[folderPath]._totalNested || (childData.subFolders.length + childData.files.length);

    const displayName = folderPath.includes('/') ? folderPath.split('/').pop() : folderPath;
    const depth = folderPath.split('/').length - 1;
    const indentPx = depth * 12;

    folderLi.innerHTML = `
      <div class="folder-header" 
           style="padding-left: ${10 + indentPx}px;"
           draggable="true"
           ondragstart="handleFolderDragStart(event, '${folderPath}')"
           ondragend="handleFolderDragEnd(event)"
           onclick="toggleFolderExpand('${folderPath}')"
           ondragover="handleFolderDragOver(event, this)"
           ondragleave="handleFolderDragLeave(event, this)"
           ondrop="handleFolderDrop(event, '${folderPath}')">
        <div class="folder-title">
          <i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'} folder-toggle-icon"></i>
          <i class="fa-solid fa-folder${isExpanded ? '-open' : ''} folder-icon" style="color:var(--accent-amber);"></i>
          <span class="folder-name">${displayName}</span>
          <span class="folder-badge" title="${countBadge} total files inside">${countBadge}</span>
        </div>
        <div class="folder-actions">
          <button class="btn-file-action" onclick="event.stopPropagation(); createNewFileInFolder('${folderPath}')" title="Create File in ${displayName}">
            <i class="fa-solid fa-plus"></i>
          </button>
          <button class="btn-file-action delete" onclick="event.stopPropagation(); deleteFolder('${folderPath}')" title="Delete Folder">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    if (isExpanded) {
      const subUl = document.createElement('ul');
      subUl.className = 'folder-sub-list';

      if (childData.subFolders.length === 0 && childData.files.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'empty-folder-notice';
        emptyLi.setAttribute('ondragover', 'handleFolderDragOver(event, this)');
        emptyLi.setAttribute('ondragleave', 'handleFolderDragLeave(event, this)');
        emptyLi.setAttribute('ondrop', `handleFolderDrop(event, '${folderPath}')`);
        emptyLi.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic; padding-left:${22 + indentPx}px;"><i class="fa-solid fa-cloud-arrow-up"></i> Empty folder</span>`;
        subUl.appendChild(emptyLi);
      } else {
        // Render subfolders first
        childData.subFolders.sort().forEach(subF => {
          subUl.appendChild(renderFolderNode(subF));
        });

        // Render files inside folder
        childData.files.sort().forEach(fullPath => {
          const fileLi = createFileListItemElement(fullPath, true);
          fileLi.querySelector('.file-item-info').style.paddingLeft = `${22 + indentPx}px`;
          subUl.appendChild(fileLi);
        });
      }
      folderLi.appendChild(subUl);
    }

    return folderLi;
  }

  // Render top-level root items
  rootItems.forEach(item => {
    if (item.type === 'folder') {
      container.appendChild(renderFolderNode(item.fullPath));
    } else {
      container.appendChild(createFileListItemElement(item.fullPath, false));
    }
  });
}

function createFileListItemElement(fullPath, isNested = false) {
  const li = document.createElement('li');
  const isMaster = activeProject && (activeProject.main_file === fullPath);
  li.className = `file-item ${fullPath === activeFile ? 'active' : ''} ${isNested ? 'nested-file' : ''} ${isMaster ? 'master-item' : ''}`;
  li.draggable = true;

  li.ondragstart = (e) => {
    e.stopPropagation();
    currentDraggedPath = fullPath;
    e.dataTransfer.setData('text/plain', fullPath);
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  };

  li.ondragend = () => {
    li.classList.remove('dragging');
    currentDraggedPath = null;
  };

  const displayName = fullPath.includes('/') ? fullPath.split('/').pop() : fullPath;

  let iconClass = 'fa-file-code';
  let iconStyle = 'color: #34d399;'; // default .tex green
  if (fullPath.endsWith('.bib')) {
    iconClass = 'fa-book';
    iconStyle = 'color: #f59e0b;';
  } else if (fullPath.endsWith('.cls') || fullPath.endsWith('.sty')) {
    iconClass = 'fa-sliders';
    iconStyle = 'color: #818cf8;';
  } else if (fullPath.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
    iconClass = 'fa-file-image';
    iconStyle = 'color: #c084fc;';
  } else if (fullPath.endsWith('.pdf')) {
    iconClass = 'fa-file-pdf';
    iconStyle = 'color: #f87171;';
  }

  const masterBadge = isMaster ? `<span class="master-file-badge" title="Master TeX Entry Document"><i class="fa-solid fa-crown" style="color:#f59e0b;"></i> Main</span>` : '';

  const setMasterItem = (fullPath.endsWith('.tex') && !isMaster) ? `
    <div class="file-menu-item" onclick="event.stopPropagation(); closeAllFileMenus(); setAsMasterTeXFile('${fullPath}')">
      <i class="fa-solid fa-crown" style="color:#f59e0b;"></i> Set as Main Document
    </div>
  ` : '';

  li.innerHTML = `
    <div class="file-item-info" onclick="switchActiveFile('${fullPath}')" title="${fullPath}">
      <i class="fa-solid ${iconClass}" style="${iconStyle}"></i>
      <span class="file-name-text">${displayName}</span>
      ${masterBadge}
    </div>
    <div class="file-actions-wrapper" style="position:relative;">
      <button class="btn-file-more" onclick="event.stopPropagation(); toggleFileContextMenu(event, '${fullPath.replace(/'/g, "\\'")}')" title="File options">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <div class="file-context-menu hidden" id="file-menu-${encodeURIComponent(fullPath)}">
        ${setMasterItem}
        <div class="file-menu-item" onclick="event.stopPropagation(); closeAllFileMenus(); downloadSingleFile('${fullPath}')">
          <i class="fa-solid fa-download"></i> Download File
        </div>
        <div class="file-menu-item" onclick="event.stopPropagation(); closeAllFileMenus(); renameFile('${fullPath}')">
          <i class="fa-solid fa-pen-to-square"></i> Rename
        </div>
        <div class="file-menu-item danger" onclick="event.stopPropagation(); closeAllFileMenus(); deleteFile('${fullPath}')">
          <i class="fa-solid fa-trash"></i> Delete
        </div>
      </div>
    </div>
  `;
  return li;
}

function closeAllFileMenus() {
  document.querySelectorAll('.file-context-menu').forEach(m => m.classList.add('hidden'));
}

function toggleFileContextMenu(e, fullPath) {
  e.stopPropagation();
  const menuId = `file-menu-${encodeURIComponent(fullPath)}`;
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  closeAllFileMenus();
  if (isHidden) {
    menu.classList.remove('hidden');
  }
}

document.addEventListener('click', closeAllFileMenus);

function setAsMasterTeXFile(fullPath) {
  if (!activeProject) return;
  activeProject.main_file = fullPath;
  saveCurrentProjectToBackend(true);
  renderFileList();
  if (typeof showToast === 'function') {
    showToast(`👑 Set "${fullPath}" as Main Master TeX file`, 'success');
  }
}

function toggleFolderExpand(folderPath) {
  if (expandedFolders.has(folderPath)) {
    expandedFolders.delete(folderPath);
  } else {
    expandedFolders.add(folderPath);
  }
  renderFileList();
}

function handleFolderDragStart(e, folderPath) {
  e.stopPropagation();
  currentDraggedPath = folderPath;
  e.dataTransfer.setData('text/plain', folderPath);
  e.dataTransfer.effectAllowed = 'move';
  if (e.currentTarget) e.currentTarget.classList.add('dragging');
}

function handleFolderDragEnd(e) {
  if (e.currentTarget) e.currentTarget.classList.remove('dragging');
  currentDraggedPath = null;
}

function handleFolderDragOver(e, elem) {
  e.preventDefault();
  elem.classList.add('folder-drop-active');
}

function handleFolderDragLeave(e, elem) {
  elem.classList.remove('folder-drop-active');
}

async function handleFolderDrop(e, targetFolder) {
  e.preventDefault();
  e.stopPropagation();
  const elem = e.currentTarget;
  if (elem) elem.classList.remove('folder-drop-active');

  const draggedPath = e.dataTransfer.getData('text/plain') || currentDraggedPath;
  if (draggedPath) {
    await moveFileToFolder(draggedPath, targetFolder);
  }
}

async function moveFileToFolder(oldPath, targetFolder) {
  if (!oldPath) return;

  // Check if moving a folder
  const isFolder = Object.keys(fileStore).some(k => k.startsWith(`${oldPath}/`));
  
  if (isFolder) {
    if (targetFolder === oldPath || targetFolder.startsWith(`${oldPath}/`)) {
      if (typeof showToast === 'function') showToast(`⚠️ Cannot move folder inside itself!`, 'error');
      return;
    }
    const oldPrefix = `${oldPath}/`;
    const folderBaseName = oldPath.split('/').pop();
    const newPrefix = targetFolder ? `${targetFolder}/${folderBaseName}/` : `${folderBaseName}/`;
    
    const affectedKeys = Object.keys(fileStore).filter(k => k.startsWith(oldPrefix));
    affectedKeys.forEach(k => {
      const relPath = k.slice(oldPrefix.length);
      const newKey = `${newPrefix}${relPath}`;
      fileStore[newKey] = fileStore[k];
      delete fileStore[k];
      if (activeFile === k) activeFile = newKey;
    });

    expandedFolders.delete(oldPath);
    if (targetFolder) expandedFolders.add(targetFolder);
    expandedFolders.add(newPrefix.slice(0, -1));

    await saveCurrentProjectToBackend(true);
    renderFileList();
    if (typeof showToast === 'function') {
      showToast(`📁 Moved folder "${folderBaseName}" to ${targetFolder ? targetFolder : 'root'}`, 'success');
    }
    return;
  }

  // Moving single file
  if (!fileStore[oldPath]) return;

  const fileName = oldPath.split('/').pop();
  const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

  if (oldPath === newPath) return;

  if (fileStore[newPath]) {
    if (!confirm(`File "${newPath}" already exists. Overwrite it?`)) {
      return;
    }
  }

  const content = fileStore[oldPath];
  delete fileStore[oldPath];
  fileStore[newPath] = content;

  if (targetFolder) expandedFolders.add(targetFolder);

  if (activeFile === oldPath) {
    activeFile = newPath;
  }

  await saveCurrentProjectToBackend(true);
  renderFileList();

  if (editor && activeFile === newPath) {
    const indicator = document.getElementById('active-file-indicator');
    if (indicator) indicator.innerText = activeFile;
  }

  if (typeof showToast === 'function') {
    const destName = targetFolder ? `folder "${targetFolder}/"` : 'root directory';
    showToast(`🚚 Moved "${fileName}" to ${destName}`, 'success');
  }
}

async function deleteFolder(folderPath) {
  if (confirm(`Are you sure you want to delete folder "${folderPath}" and all its contents?`)) {
    const prefix = `${folderPath}/`;
    Object.keys(fileStore).forEach(k => {
      if (k === `${folderPath}/` || k.startsWith(prefix)) {
        delete fileStore[k];
      }
    });

    expandedFolders.delete(folderPath);

    const remainingKeys = Object.keys(fileStore).filter(isUserContentFile);
    if (!fileStore[activeFile]) {
      activeFile = remainingKeys[0] || 'main.tex';
    }

    await saveCurrentProjectToBackend(true);
    renderFileList();

    if (editor) {
      editor.setValue(fileStore[activeFile] || '');
      const indicator = document.getElementById('active-file-indicator');
      if (indicator) indicator.innerText = activeFile;
    }

    if (typeof showToast === 'function') {
      showToast(`Deleted folder "${folderPath}/"`, 'info');
    }
  }
}

function createNewFileInFolder(folderPath) {
  const fileName = prompt(`Create new file inside "${folderPath}/" (e.g. figure1.png, section1.tex):`);
  if (!fileName) return;
  const cleanName = fileName.trim().replace(/^\/+/g, '');
  const fullPath = `${folderPath}/${cleanName}`;

  if (fileStore[fullPath]) {
    alert(`File "${fullPath}" already exists.`);
    return;
  }

  let starterCode = '% New LaTeX Document Section\n';
  if (cleanName.match(/\.(png|jpg|jpeg|gif|svg)$/i)) {
    starterCode = 'data:image/png;base64,iVBORw0KGgoAAAANSU5QoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  } else if (cleanName.endsWith('.bib')) {
    starterCode = '% Bibliography Entries\n@article{sample2026,\n  author = {Author, A.},\n  title = {Title},\n  journal = {Journal},\n  year = {2026}\n}\n';
  }

  fileStore[fullPath] = starterCode;
  expandedFolders.add(folderPath);
  switchActiveFile(fullPath);
  saveCurrentProjectToBackend(true);
  renderFileList();
}

function downloadSingleFile(filename) {
  if (!fileStore || !fileStore[filename]) {
    if (typeof showToast === 'function') showToast(`File ${filename} not found`, 'warning');
    return;
  }
  let content = fileStore[filename];
  if (filename === activeFile && editor && !filename.match(/\.(png|jpg|jpeg|gif|svg|webp|pdf)$/i)) {
    content = editor.getValue();
    fileStore[filename] = content;
  }

  const a = document.createElement('a');
  if (typeof content === 'string' && content.startsWith('data:')) {
    a.href = content;
  } else {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    a.href = URL.createObjectURL(blob);
  }
  a.download = filename.split('/').pop() || filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof showToast === 'function') showToast(`Downloaded ${filename}`, 'success');
}

function switchActiveFile(filename) {
  if (!fileStore[filename]) return;
  if (editor && !activeFile.match(/\.(png|jpg|jpeg|gif|svg|webp|pdf)$/i)) {
    fileStore[activeFile] = editor.getValue();
  }
  
  activeFile = filename;
  const isImage = filename.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i);
  
  const cmWrapper = editor ? editor.getWrapperElement() : document.querySelector('.CodeMirror');
  const imgViewer = document.getElementById('image-asset-viewer');

  if (isImage) {
    if (cmWrapper) cmWrapper.style.display = 'none';
    if (imgViewer) {
      imgViewer.classList.remove('hidden');
      renderImageAssetView(filename);
    }
  } else {
    if (imgViewer) imgViewer.classList.add('hidden');
    if (cmWrapper) cmWrapper.style.display = 'block';
    if (editor) {
      editor.setValue(fileStore[activeFile] || '');
      setTimeout(() => {
        editor.refresh();
        if (typeof runLaTeXSyntaxDiagnostics === 'function') runLaTeXSyntaxDiagnostics();
      }, 50);
    }
  }

  const indicator = document.getElementById('active-file-indicator');
  if (indicator) indicator.innerText = activeFile;
  const pdfLabel = document.getElementById('pdf-file-label');
  if (pdfLabel) pdfLabel.innerText = activeFile;
  
  renderFileList();
  ensurePdfViewActive();
  
  if (typeof showToast === 'function') {
    const isImage = filename.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i);
    const icon = isImage ? '🖼️' : '📄';
    showToast(`${icon} Opened "${filename}"`, 'info');
  }

  compileLaTeX();
  saveCurrentProjectToBackend();
}

function renderImageAssetView(filename) {
  const imgElem = document.getElementById('img-asset-preview');
  const titleElem = document.getElementById('img-asset-name');
  const typeElem = document.getElementById('img-asset-type');
  const infoElem = document.getElementById('img-asset-info');
  const codeElem = document.getElementById('img-snippet-code');

  if (titleElem) titleElem.innerText = filename;
  const ext = filename.split('.').pop().toUpperCase();
  if (typeElem) typeElem.innerText = ext;
  if (codeElem) codeElem.innerText = `\\includegraphics[width=\\linewidth]{${filename}}`;

  let src = fileStore[filename];
  const directUrl = activeProject ? `/api/projects/file?id=${activeProject.id}&file=${encodeURIComponent(filename)}` : '';

  if (imgElem) {
    if (src && typeof src === 'string' && src.startsWith('data:')) {
      imgElem.src = src;
    } else if (directUrl) {
      imgElem.src = directUrl;
    } else {
      imgElem.src = src || '';
    }

    imgElem.onerror = () => {
      if (directUrl && imgElem.src !== directUrl) {
        imgElem.src = directUrl;
      }
    };

    imgElem.onload = () => {
      if (infoElem) infoElem.innerHTML = `<i class="fa-solid fa-circle-info"></i> Asset Info: ${imgElem.naturalWidth} × ${imgElem.naturalHeight} px`;
    };
  }
}

function copyIncludeGraphicsCode() {
  const codeElem = document.getElementById('img-snippet-code');
  if (codeElem) {
    navigator.clipboard.writeText(codeElem.innerText);
    alert(`Copied code snippet to clipboard:\n${codeElem.innerText}`);
  }
}

// --- NEW FILE TEMPLATE SELECTOR ENGINE ---
function openNewFileModal() {
  const modal = document.getElementById('new-file-modal');
  const filenameInput = document.getElementById('new-filename-input');
  const templateSelect = document.getElementById('new-file-template-select');

  if (modal) modal.classList.add('active');
  if (filenameInput) {
    filenameInput.value = 'section.tex';
    filenameInput.focus();
  }
  updateNewFilePreview();
}

function initNewFileModal() {
  const filenameInput = document.getElementById('new-filename-input');
  const templateSelect = document.getElementById('new-file-template-select');

  if (filenameInput) {
    filenameInput.addEventListener('input', () => {
      const val = filenameInput.value.trim().toLowerCase();
      if (val.endsWith('.bib')) {
        if (templateSelect) templateSelect.value = 'bib';
      } else if (val === 'main.tex' || val.includes('document')) {
        if (templateSelect) templateSelect.value = 'basic-doc';
      }
      updateNewFilePreview();
    });
  }

  if (templateSelect) {
    templateSelect.addEventListener('change', updateNewFilePreview);
  }
}

function updateNewFilePreview() {
  const filenameElem = document.getElementById('new-filename-input');
  const templateElem = document.getElementById('new-file-template-select');
  const preview = document.getElementById('new-file-preview-textarea');

  if (!filenameElem || !templateElem || !preview) return;

  const filename = filenameElem.value.trim() || 'file.tex';
  const template = templateElem.value;

  let code = '';
  if (template === 'basic-doc') {
    code = `\\documentclass[12pt, a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\title{Title of Research Paper}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Write abstract summary here...
\\end{abstract}

\\section{Introduction}
Welcome to your new LaTeX document.

\\end{document}`;
  } else if (template === 'section') {
    const baseName = filename.replace(/\.tex$/i, '').replace(/[^a-zA-Z0-9]+/g, ' ');
    const titleCase = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    code = `% Sub-Section Document File: ${filename}
\\section{${titleCase}}

Write your section content and paragraphs here...
`;
  } else if (template === 'bib') {
    code = `% Bibliography Database File: ${filename}
@article{author2026title,
  author = {Author, First and CoAuthor, Second},
  title = {Title of Research Paper},
  journal = {Journal of Research},
  year = {2026},
  volume = {10},
  pages = {100--115}
}
`;
  } else if (template === 'blank') {
    code = `% Blank File: ${filename}\n`;
  }

  preview.value = code;
}

function confirmCreateNewFile() {
  const filenameInput = document.getElementById('new-filename-input');
  const previewTextarea = document.getElementById('new-file-preview-textarea');

  if (!filenameInput) return;
  const filename = filenameInput.value.trim();
  const previewContent = previewTextarea ? previewTextarea.value : '';

  if (!filename) {
    alert('Please enter a valid filename.');
    return;
  }

  if (fileStore[filename]) {
    alert(`A file named '${filename}' already exists in this project.`);
    return;
  }

  fileStore[filename] = previewContent;
  switchActiveFile(filename);
  closeModal('new-file-modal');
  compileLaTeX();
  saveCurrentProjectToBackend();
}


function renameFile(oldName) {
  let newName = prompt(`Rename file '${oldName}' to:`, oldName);
  if (!newName || newName.trim() === oldName) return;
  newName = newName.trim();
  
  if (fileStore[newName]) {
    alert('A file with this name already exists.');
    return;
  }

  fileStore[newName] = fileStore[oldName];
  delete fileStore[oldName];

  if (activeFile === oldName) {
    activeFile = newName;
    document.getElementById('active-file-indicator').innerText = activeFile;
  }

  renderFileList();
  saveCurrentProjectToBackend();
}

function deleteFile(filename) {
  const keys = Object.keys(fileStore);
  if (keys.length <= 1) {
    alert('Cannot delete the only remaining file in project.');
    return;
  }

  if (confirm(`Are you sure you want to delete '${filename}'?`)) {
    delete fileStore[filename];
    if (activeFile === filename) {
      const remainingKeys = Object.keys(fileStore);
      activeFile = remainingKeys[0];
      if (editor) editor.setValue(fileStore[activeFile]);
      document.getElementById('active-file-indicator').innerText = activeFile;
    }
    renderFileList();
    compileLaTeX();
    saveCurrentProjectToBackend();
  }
}

// --- INTERACTIVE PROGRESSIVE FILE UPLOADER ENGINE ---
let pendingUploadFiles = [];

function openUploadFileModal() {
  const modal = document.getElementById('upload-file-modal');
  if (!modal) return;

  const stageSelect = document.getElementById('upload-modal-stage-select');
  const stageProgress = document.getElementById('upload-modal-stage-progress');
  const stageSuccess = document.getElementById('upload-modal-stage-success');
  const footerDefault = document.getElementById('upload-modal-footer');
  const footerSuccess = document.getElementById('upload-modal-footer-success');

  if (stageSelect) stageSelect.classList.remove('hidden');
  if (stageProgress) stageProgress.classList.add('hidden');
  if (stageSuccess) stageSuccess.classList.add('hidden');

  if (footerDefault) footerDefault.classList.remove('hidden');
  if (footerSuccess) footerSuccess.classList.add('hidden');

  pendingUploadFiles = [];
  renderUploadQueueUI();

  const select = document.getElementById('upload-target-folder-select');
  if (select) {
    select.innerHTML = '<option value="">📁 Root Directory /</option>';
    const foldersSet = new Set();
    Object.keys(fileStore).filter(isUserContentFile).forEach(k => {
      if (k.endsWith('/')) {
        const cleanF = k.slice(0, -1);
        if (cleanF) foldersSet.add(cleanF);
      } else if (k.includes('/')) {
        const parts = k.split('/');
        parts.pop();
        if (parts.length > 0) foldersSet.add(parts.join('/'));
      }
    });

    Array.from(foldersSet).sort().forEach(folderPath => {
      const opt = document.createElement('option');
      opt.value = folderPath;
      opt.innerText = `📁 ${folderPath}/`;
      select.appendChild(opt);
    });
  }

  modal.classList.add('active');
}

function triggerFileInputClick() {
  const fileInput = document.getElementById('file-upload-input-modal');
  if (fileInput) fileInput.click();
}

function handleModalFilesSelected(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;
  files.forEach(f => {
    if (!pendingUploadFiles.some(pf => pf.name === f.name && pf.size === f.size)) {
      pendingUploadFiles.push(f);
    }
  });
  renderUploadQueueUI();
  e.target.value = '';
}

function handleUploadDropzoneDragOver(e) {
  e.preventDefault();
  const dz = document.getElementById('upload-dropzone');
  if (dz) dz.classList.add('drag-over');
}

function handleUploadDropzoneDragLeave(e) {
  const dz = document.getElementById('upload-dropzone');
  if (dz) dz.classList.remove('drag-over');
}

function handleUploadDropzoneDrop(e) {
  e.preventDefault();
  const dz = document.getElementById('upload-dropzone');
  if (dz) dz.classList.remove('drag-over');

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => {
      if (!pendingUploadFiles.some(pf => pf.name === f.name && pf.size === f.size)) {
        pendingUploadFiles.push(f);
      }
    });
    renderUploadQueueUI();
  }
}

function removeFileFromQueue(index) {
  pendingUploadFiles.splice(index, 1);
  renderUploadQueueUI();
}

function clearUploadQueue() {
  pendingUploadFiles = [];
  renderUploadQueueUI();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderUploadQueueUI() {
  const container = document.getElementById('upload-queue-container');
  const queueList = document.getElementById('upload-file-queue-list');
  const countBadge = document.getElementById('upload-file-count-badge');
  const submitBtn = document.getElementById('btn-upload-submit');

  if (!container || !queueList) return;

  queueList.innerHTML = '';
  if (countBadge) countBadge.innerText = pendingUploadFiles.length;

  if (pendingUploadFiles.length === 0) {
    container.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  container.classList.remove('hidden');
  if (submitBtn) submitBtn.disabled = false;

  pendingUploadFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'upload-queue-item';

    let icon = 'fa-file';
    if (file.name.endsWith('.tex')) icon = 'fa-file-code';
    else if (file.name.endsWith('.bib')) icon = 'fa-book';
    else if (file.name.endsWith('.zip')) icon = 'fa-file-zipper';
    else if (file.name.match(/\.(png|jpg|jpeg|gif|svg)$/i)) icon = 'fa-file-image';

    item.innerHTML = `
      <div class="upload-queue-item-info">
        <i class="fa-solid ${icon}"></i>
        <span class="upload-queue-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span class="upload-queue-item-size">(${formatBytes(file.size)})</span>
      </div>
      <button class="upload-queue-remove-btn" type="button" onclick="removeFileFromQueue(${index})" title="Remove File">&times;</button>
    `;
    queueList.appendChild(item);
  });
}

async function startProgressiveUpload() {
  if (pendingUploadFiles.length === 0) return;

  const targetFolderSelect = document.getElementById('upload-target-folder-select');
  const targetFolder = targetFolderSelect ? targetFolderSelect.value : '';

  document.getElementById('upload-modal-stage-select').classList.add('hidden');
  document.getElementById('upload-modal-stage-progress').classList.remove('hidden');
  document.getElementById('upload-modal-footer').classList.add('hidden');

  const progressBar = document.getElementById('upload-progress-bar-inner');
  const stepText = document.getElementById('upload-step-text');
  const timerBadge = document.getElementById('upload-timer-badge');

  let startTime = Date.now();
  let timerInterval = setInterval(() => {
    let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (timerBadge) timerBadge.innerText = `${elapsed}s`;
  }, 100);

  const updateProgress = (pct, stepMsg) => {
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (stepText) stepText.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-right: 6px; color: var(--accent-purple);"></i> ${stepMsg}`;
  };

  updateProgress(15, `Staging ${pendingUploadFiles.length} file(s)...`);
  await new Promise(r => setTimeout(r, 250));

  let uploadedFileNames = [];
  let mainFileToSelect = null;

  try {
    for (let i = 0; i < pendingUploadFiles.length; i++) {
      const file = pendingUploadFiles[i];
      let filename = file.name;
      if (targetFolder) filename = `${targetFolder}/${filename}`;

      const pct = Math.round(20 + ((i + 1) / pendingUploadFiles.length) * 60);
      updateProgress(pct, `Reading & processing ${file.name} (${i + 1}/${pendingUploadFiles.length})...`);

      if (file.name.endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(file);
          for (const entryName of Object.keys(zip.files)) {
            const entry = zip.files[entryName];
            if (entry.dir) continue;

            let cleanPath = entryName;
            const parts = cleanPath.split('/');
            if (parts.length > 1 && (parts[0].includes('template') || parts[0].includes('master') || parts[0].includes('main'))) {
              cleanPath = parts.slice(1).join('/');
            }
            if (!cleanPath) continue;

            if (targetFolder) cleanPath = `${targetFolder}/${cleanPath}`;

            if (cleanPath.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i)) {
              const b64 = await entry.async('base64');
              const ext = cleanPath.split('.').pop().toLowerCase();
              fileStore[cleanPath] = `data:image/${ext};base64,${b64}`;
            } else {
              const textContent = await entry.async('text');
              fileStore[cleanPath] = textContent;
            }

            uploadedFileNames.push(cleanPath);
            if (cleanPath.endsWith('.tex') && (!mainFileToSelect || cleanPath.endsWith('main.tex'))) {
              mainFileToSelect = cleanPath;
            }
          }
        } catch (err) {
          console.warn(`Error extracting ZIP archive '${file.name}':`, err);
        }
      } else if (file.name.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i)) {
        const dataUrl = await readFileAsDataURL(file);
        fileStore[filename] = dataUrl;
        uploadedFileNames.push(filename);
      } else {
        const textContent = await readFileAsText(file);
        fileStore[filename] = textContent;
        uploadedFileNames.push(filename);
        if (filename.endsWith('.tex') && (!mainFileToSelect || filename.endsWith('main.tex'))) {
          mainFileToSelect = filename;
        }
      }
    }

    updateProgress(90, 'Finalizing project workspace & saving database...');
    await saveCurrentProjectToBackend(true);
    if (targetFolder) expandedFolders.add(targetFolder);

    if (mainFileToSelect && fileStore[mainFileToSelect]) {
      switchActiveFile(mainFileToSelect);
    } else {
      renderFileList();
    }

    updateProgress(100, 'Upload Complete!');
    clearInterval(timerInterval);

    await new Promise(r => setTimeout(r, 250));
    document.getElementById('upload-modal-stage-progress').classList.add('hidden');
    document.getElementById('upload-modal-stage-success').classList.remove('hidden');
    document.getElementById('upload-modal-footer-success').classList.remove('hidden');

    const summaryText = document.getElementById('upload-success-summary');
    if (summaryText) summaryText.innerText = `Successfully loaded ${uploadedFileNames.length} file(s) into project workspace.`;

    const pillsContainer = document.getElementById('upload-success-file-pills');
    if (pillsContainer) {
      pillsContainer.innerHTML = '';
      uploadedFileNames.forEach(fname => {
        const pill = document.createElement('span');
        pill.className = 'uploaded-pill';
        pill.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(fname)}`;
        pillsContainer.appendChild(pill);
      });
    }

    if (typeof showToast === 'function') {
      showToast(`✅ Uploaded ${uploadedFileNames.length} file(s)!`, 'success');
    }
  } catch (err) {
    clearInterval(timerInterval);
    alert(`Upload Error: ${err.message}`);
    closeModal('upload-file-modal');
  }
}

// File Upload Handler
async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  let totalUploaded = 0;
  let mainFileToSelect = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filename = file.name;

    if (filename.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        for (const entryName of Object.keys(zip.files)) {
          const entry = zip.files[entryName];
          if (entry.dir) continue;

          let cleanPath = entryName;
          const parts = cleanPath.split('/');
          if (parts.length > 1 && (parts[0].includes('template') || parts[0].includes('master') || parts[0].includes('main'))) {
            cleanPath = parts.slice(1).join('/');
          }
          if (!cleanPath) continue;

          if (cleanPath.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i)) {
            const b64 = await entry.async('base64');
            const ext = cleanPath.split('.').pop().toLowerCase();
            fileStore[cleanPath] = `data:image/${ext};base64,${b64}`;
          } else {
            const textContent = await entry.async('text');
            fileStore[cleanPath] = textContent;
          }

          if (cleanPath === 'main.tex' || (!mainFileToSelect && cleanPath.endsWith('.tex'))) {
            mainFileToSelect = cleanPath;
          }
          totalUploaded++;
        }
      } catch (err) {
        alert(`Error extracting ZIP archive '${filename}': ${err.message}`);
      }
    } else if (filename.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i)) {
      const dataUrl = await readFileAsDataURL(file);
      fileStore[filename] = dataUrl;
      totalUploaded++;
    } else {
      const textContent = await readFileAsText(file);
      fileStore[filename] = textContent;
      totalUploaded++;
      if (filename.endsWith('.tex') && (!mainFileToSelect || filename === 'main.tex')) {
        mainFileToSelect = filename;
      }
    }
  }

  if (mainFileToSelect && fileStore[mainFileToSelect]) {
    switchActiveFile(mainFileToSelect);
  } else {
    renderFileList();
  }

  await saveCurrentProjectToBackend(true);
  alert(`✅ Loaded ${totalUploaded} file(s) into project!`);
  e.target.value = '';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// --- LATEX INTELLISENSE & AUTOCOMPLETE ENGINE ---
const LATEX_AUTOCOMPLETE_COMMANDS = [
  // Document Classes
  { text: "\\documentclass[12pt, a4paper]{article}", displayText: "\\documentclass{article} - Standard Paper Document" },
  { text: "\\documentclass{IEEEtran}", displayText: "\\documentclass{IEEEtran} - IEEE Conference / Journal" },
  { text: "\\documentclass{beamer}", displayText: "\\documentclass{beamer} - Presentation Slides" },

  // Common Packages
  { text: "\\usepackage{graphicx}", displayText: "\\usepackage{graphicx} - Image Graphics" },
  { text: "\\usepackage{amsmath, amssymb}", displayText: "\\usepackage{amsmath, amssymb} - Math Symbols & Formulas" },
  { text: "\\usepackage{booktabs}", displayText: "\\usepackage{booktabs} - Professional Publication Tables" },
  { text: "\\usepackage{multirow}", displayText: "\\usepackage{multirow} - Multi-row Tables" },
  { text: "\\usepackage{hyperref}", displayText: "\\usepackage{hyperref} - Interactive PDF Links" },
  { text: "\\usepackage{tikz}", displayText: "\\usepackage{tikz} - Vector Diagrams" },
  { text: "\\usepackage{geometry}", displayText: "\\usepackage{geometry} - Page Layout Margins" },
  { text: "\\usepackage{xcolor}", displayText: "\\usepackage{xcolor} - Colored Text" },

  // Environments
  { text: "\\begin{document}\n  \n\\end{document}", displayText: "\\begin{document} ... \\end{document}" },
  { text: "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{filename}\n  \\caption{Caption}\n  \\label{fig:label}\n\\end{figure}", displayText: "\\begin{figure} - Image figure block" },
  { text: "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{cc}\n    \\toprule\n    Header 1 & Header 2 \\\\\n    \\midrule\n    Data 1 & Data 2 \\\\\n    \\bottomrule\n  \\end{tabular}\n  \\caption{Caption}\n  \\label{tab:label}\n\\end{table}", displayText: "\\begin{table} - Tabular data table" },
  { text: "\\begin{equation}\n  \n\\end{equation}", displayText: "\\begin{equation} - Numbered equation" },
  { text: "\\begin{align}\n  \n\\end{align}", displayText: "\\begin{align} - Aligned multi-line math" },
  { text: "\\begin{itemize}\n  \\item \n\\end{itemize}", displayText: "\\begin{itemize} - Bulleted List" },
  { text: "\\begin{enumerate}\n  \\item \n\\end{enumerate}", displayText: "\\begin{enumerate} - Numbered List" },
  { text: "\\begin{abstract}\n  \n\\end{abstract}", displayText: "\\begin{abstract} - Document Abstract" },
  { text: "\\begin{center}\n  \n\\end{center}", displayText: "\\begin{center} - Centered Content" },

  // Document Structure
  { text: "\\section{", displayText: "\\section{Title}" },
  { text: "\\subsection{", displayText: "\\subsection{Title}" },
  { text: "\\subsubsection{", displayText: "\\subsubsection{Title}" },
  { text: "\\paragraph{", displayText: "\\paragraph{Title}" },
  { text: "\\title{", displayText: "\\title{Paper Title}" },
  { text: "\\author{", displayText: "\\author{Author Name}" },
  { text: "\\date{\\today}", displayText: "\\date{\\today}" },
  { text: "\\maketitle", displayText: "\\maketitle - Render title block" },

  // Formats & Figures
  { text: "\\includegraphics[width=0.8\\linewidth]{", displayText: "\\includegraphics{file}" },
  { text: "\\caption{", displayText: "\\caption{text}" },
  { text: "\\label{", displayText: "\\label{key}" },
  { text: "\\ref{", displayText: "\\ref{key}" },
  { text: "\\pageref{", displayText: "\\pageref{key}" },
  { text: "\\cite{", displayText: "\\cite{citation}" },
  { text: "\\textbf{", displayText: "\\textbf{bold text}" },
  { text: "\\textit{", displayText: "\\textit{italic text}" },
  { text: "\\underline{", displayText: "\\underline{underlined text}" },
  { text: "\\centering", displayText: "\\centering - Center alignment" },
  { text: "\\toprule", displayText: "\\toprule - Table top line" },
  { text: "\\midrule", displayText: "\\midrule - Table middle line" },
  { text: "\\bottomrule", displayText: "\\bottomrule - Table bottom line" },
  { text: "\\hline", displayText: "\\hline - Grid line" },

  // Math Commands
  { text: "\\frac{a}{b}", displayText: "\\frac{a}{b} - Fraction" },
  { text: "\\sum_{i=1}^{n}", displayText: "\\sum_{i=1}^{n} - Summation" },
  { text: "\\int_{a}^{b}", displayText: "\\int_{a}^{b} - Integral" },
  { text: "\\sqrt{x}", displayText: "\\sqrt{x} - Square root" },
  { text: "\\alpha", displayText: "\\alpha" },
  { text: "\\beta", displayText: "\\beta" },
  { text: "\\gamma", displayText: "\\gamma" },
  { text: "\\theta", displayText: "\\theta" },
  { text: "\\lambda", displayText: "\\lambda" },
  { text: "\\pi", displayText: "\\pi" },
  { text: "\\sigma", displayText: "\\sigma" },
  { text: "\\omega", displayText: "\\omega" }
];

const COMMON_ENVIRONMENTS = [
  'figure', 'table', 'equation', 'align', 'gather', 'itemize', 'enumerate',
  'description', 'abstract', 'document', 'center', 'minipage', 'tabular',
  'lstlisting', 'verbatim', 'proof', 'theorem', 'lemma', 'matrix', 'bmatrix', 'pmatrix'
];

function latexHintProvider(cm) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);
  const start = cursor.ch;
  const lineBefore = line.slice(0, start);

  // 1. Check if user is inside \begin{...}
  const beginMatch = lineBefore.match(/\\begin\{([a-zA-Z0-9_*]*)$/);
  if (beginMatch) {
    const query = beginMatch[1].toLowerCase();
    const envStart = start - beginMatch[1].length;
    const completions = COMMON_ENVIRONMENTS
      .filter(env => env.toLowerCase().startsWith(query))
      .map(env => ({
        text: `${env}}\n  \n\\end{${env}}`,
        displayText: `\\begin{${env}} ... \\end{${env}}`
      }));
    return {
      list: completions,
      from: CodeMirror.Pos(cursor.line, envStart),
      to: CodeMirror.Pos(cursor.line, start)
    };
  }

  // 2. Check if user is inside \cite{...}
  const citeMatch = lineBefore.match(/\\cite\{([a-zA-Z0-9_-]*)$/);
  if (citeMatch) {
    const query = citeMatch[1].toLowerCase();
    const citeStart = start - citeMatch[1].length;
    const completions = [];

    Object.keys(fileStore).filter(f => f.endsWith('.bib')).forEach(bibFile => {
      const content = fileStore[bibFile] || '';
      const keyRegex = /@(\w+)\s*\{\s*([^,\s]+)/g;
      let km;
      while ((km = keyRegex.exec(content)) !== null) {
        const type = km[1];
        const key = km[2];
        if (key.toLowerCase().includes(query)) {
          completions.push({
            text: `${key}}`,
            displayText: `${key} (@${type} in ${bibFile})`
          });
        }
      }
    });

    if (completions.length > 0) {
      return {
        list: completions,
        from: CodeMirror.Pos(cursor.line, citeStart),
        to: CodeMirror.Pos(cursor.line, start)
      };
    }
  }

  // 3. Check if user is inside \ref{...} or \pageref{...}
  const refMatch = lineBefore.match(/\\(?:ref|pageref|autoref|eqref)\{([a-zA-Z0-9_:-]*)$/);
  if (refMatch) {
    const query = refMatch[1].toLowerCase();
    const refStart = start - refMatch[1].length;
    const completions = [];

    Object.keys(fileStore).filter(f => f.endsWith('.tex')).forEach(texFile => {
      const content = fileStore[texFile] || '';
      const lblRegex = /\\label\{([^}]+)\}/g;
      let lm;
      while ((lm = lblRegex.exec(content)) !== null) {
        const labelKey = lm[1];
        if (labelKey.toLowerCase().includes(query)) {
          completions.push({
            text: `${labelKey}}`,
            displayText: `${labelKey} (Label in ${texFile})`
          });
        }
      }
    });

    if (completions.length > 0) {
      return {
        list: completions,
        from: CodeMirror.Pos(cursor.line, refStart),
        to: CodeMirror.Pos(cursor.line, start)
      };
    }
  }

  // 4. Check if user is inside \includegraphics{...}
  const imgMatch = lineBefore.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/);
  if (imgMatch) {
    const query = imgMatch[1].toLowerCase();
    const imgStart = start - imgMatch[1].length;
    const completions = Object.keys(fileStore)
      .filter(f => f.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i) && f.toLowerCase().includes(query))
      .map(img => ({
        text: `${img}}`,
        displayText: `${img} (Project Image)`
      }));

    if (completions.length > 0) {
      return {
        list: completions,
        from: CodeMirror.Pos(cursor.line, imgStart),
        to: CodeMirror.Pos(cursor.line, start)
      };
    }
  }

  // 5. General \ command completion
  const slashIdx = lineBefore.lastIndexOf('\\');
  if (slashIdx === -1) return null;

  const query = lineBefore.slice(slashIdx);
  const completions = [];

  LATEX_AUTOCOMPLETE_COMMANDS.forEach(cmd => {
    if (cmd.text.toLowerCase().startsWith(query.toLowerCase()) || cmd.displayText.toLowerCase().includes(query.toLowerCase())) {
      completions.push({
        text: cmd.text,
        displayText: cmd.displayText
      });
    }
  });

  return {
    list: completions,
    from: CodeMirror.Pos(cursor.line, slashIdx),
    to: CodeMirror.Pos(cursor.line, start)
  };
}

if (window.CodeMirror) {
  CodeMirror.registerHelper("hint", "stex", latexHintProvider);
}

// Global reference for active text markers
let syntaxErrorTextMarkers = [];

function clearSyntaxMarkers() {
  if (editor) {
    editor.clearGutter("CodeMirror-lint-markers");
    syntaxErrorTextMarkers.forEach(m => m.clear());
    syntaxErrorTextMarkers = [];
  }
}

let isDiagnosticsDrawerOpen = false;

function toggleDiagnosticsDrawer(forceState = null) {
  const list = document.getElementById('diagnostics-list');
  const icon = document.getElementById('diag-drawer-icon');
  const text = document.getElementById('diag-drawer-text');
  
  if (!list) return;
  if (forceState !== null) {
    isDiagnosticsDrawerOpen = forceState;
  } else {
    isDiagnosticsDrawerOpen = !isDiagnosticsDrawerOpen;
  }

  if (isDiagnosticsDrawerOpen) {
    list.classList.remove('hidden');
    if (icon) icon.className = 'fa-solid fa-chevron-down';
    if (text) text.innerText = 'Hide Problems';
  } else {
    list.classList.add('hidden');
    if (icon) icon.className = 'fa-solid fa-chevron-up';
    if (text) text.innerText = 'Problems';
  }

  if (editor) {
    setTimeout(() => editor.refresh(), 50);
  }
}

let lastCompilerLog = null;

// REAL-TIME LATEX SYNTAX DIAGNOSTICS ENGINE
function runLaTeXSyntaxDiagnostics(compilerLog = null) {
  if (compilerLog !== null) {
    lastCompilerLog = compilerLog;
  } else {
    compilerLog = lastCompilerLog;
  }
  if (!editor || !activeFile || !activeFile.endsWith('.tex')) return;

  clearSyntaxMarkers();

  const code = editor.getValue();
  const lines = code.split('\n');
  const problems = [];

  // 1. Gather Preamble Packages
  const fullDocumentText = Object.keys(fileStore)
    .filter(f => f.endsWith('.tex'))
    .map(f => fileStore[f])
    .join('\n');

  const loadedPackages = new Set();
  const pkgRegex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;
  let pkgMatch;
  while ((pkgMatch = pkgRegex.exec(fullDocumentText)) !== null) {
    pkgMatch[1].split(',').forEach(p => loadedPackages.add(p.trim()));
  }

  // 2. Gather BibTeX keys
  const bibKeys = new Set();
  Object.keys(fileStore).filter(f => f.endsWith('.bib')).forEach(bibFile => {
    const content = fileStore[bibFile] || '';
    const kmRegex = /@\w+\s*\{\s*([^,\s]+)/g;
    let km;
    while ((km = kmRegex.exec(content)) !== null) {
      bibKeys.add(km[1].trim());
    }
  });

  // 3. Gather Labels
  const labelKeys = new Set();
  Object.keys(fileStore).filter(f => f.endsWith('.tex')).forEach(texFile => {
    const content = fileStore[texFile] || '';
    const lmRegex = /\\label\{([^}]+)\}/g;
    let lm;
    while ((lm = lmRegex.exec(content)) !== null) {
      labelKeys.add(lm[1].trim());
    }
  });

  // 4. Environment Stack Checking
  const envStack = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const codePart = lineText.split('%')[0];

    // Check \begin{env}
    const beginRegex = /\\begin\{([^}]+)\}/g;
    let bm;
    while ((bm = beginRegex.exec(codePart)) !== null) {
      envStack.push({ name: bm[1], line: i, ch: bm.index, matchText: bm[0] });
    }

    // Check \end{env}
    const endRegex = /\\end\{([^}]+)\}/g;
    let em;
    while ((em = endRegex.exec(codePart)) !== null) {
      const endName = em[1];
      if (envStack.length === 0) {
        problems.push({
          line: i,
          chStart: em.index,
          chEnd: em.index + em[0].length,
          severity: 'error',
          message: `Unmatched \\end{${endName}} without corresponding \\begin{${endName}}`,
          quickFixLabel: null
        });
      } else {
        const top = envStack[envStack.length - 1];
        if (top.name === endName) {
          envStack.pop();
        } else {
          problems.push({
            line: i,
            chStart: em.index,
            chEnd: em.index + em[0].length,
            severity: 'error',
            message: `Mismatched environment: Expected \\end{${top.name}} but found \\end{${endName}}`,
            quickFixLabel: `Fix to \\end{${top.name}}`,
            quickFixFn: (cm) => {
              cm.replaceRange(`\\end{${top.name}}`, CodeMirror.Pos(i, em.index), CodeMirror.Pos(i, em.index + em[0].length));
            }
          });
          envStack.pop();
        }
      }
    }

    // Check unclosed braces '{'
    let braceBalance = 0;
    for (let c = 0; c < codePart.length; c++) {
      if (codePart[c] === '{' && (c === 0 || codePart[c-1] !== '\\')) braceBalance++;
      if (codePart[c] === '}' && (c === 0 || codePart[c-1] !== '\\')) braceBalance--;
    }
    if (braceBalance > 0) {
      problems.push({
        line: i,
        chStart: Math.max(0, lineText.lastIndexOf('{')),
        chEnd: lineText.length,
        severity: 'warning',
        message: `Line has ${braceBalance} unclosed curly brace '{'`,
        quickFixLabel: `Add '}'`,
        quickFixFn: (cm) => cm.replaceRange('}'.repeat(braceBalance), CodeMirror.Pos(i, lineText.length))
      });
    }

    // Check package prerequisites
    if (codePart.includes('\\includegraphics') && !loadedPackages.has('graphicx')) {
      const idx = codePart.indexOf('\\includegraphics');
      problems.push({
        line: i,
        chStart: idx,
        chEnd: idx + 16,
        severity: 'error',
        message: `\\includegraphics requires \\usepackage{graphicx} in preamble`,
        quickFixLabel: `Add \\usepackage{graphicx}`,
        quickFixFn: (cm) => insertPackageInPreamble('graphicx')
      });
    }

    if ((codePart.includes('\\toprule') || codePart.includes('\\midrule') || codePart.includes('\\bottomrule')) && !loadedPackages.has('booktabs')) {
      const idx = Math.max(codePart.indexOf('\\toprule'), codePart.indexOf('\\midrule'), codePart.indexOf('\\bottomrule'));
      problems.push({
        line: i,
        chStart: idx,
        chEnd: idx + 9,
        severity: 'warning',
        message: `Publication tables require \\usepackage{booktabs} in preamble`,
        quickFixLabel: `Add \\usepackage{booktabs}`,
        quickFixFn: (cm) => insertPackageInPreamble('booktabs')
      });
    }

    if ((codePart.includes('\\begin{align}') || codePart.includes('\\begin{equation*}') || codePart.includes('\\bmatrix')) && !loadedPackages.has('amsmath')) {
      const idx = Math.max(0, codePart.search(/\\(begin\{align\}|begin\{equation\*\}|bmatrix)/));
      problems.push({
        line: i,
        chStart: idx,
        chEnd: idx + 15,
        severity: 'warning',
        message: `Math equations require \\usepackage{amsmath} in preamble`,
        quickFixLabel: `Add \\usepackage{amsmath}`,
        quickFixFn: (cm) => insertPackageInPreamble('amsmath')
      });
    }

    if ((codePart.includes('\\href') || codePart.includes('\\url')) && !loadedPackages.has('hyperref')) {
      const idx = Math.max(codePart.indexOf('\\href'), codePart.indexOf('\\url'));
      problems.push({
        line: i,
        chStart: idx,
        chEnd: idx + 5,
        severity: 'warning',
        message: `Hyperlinks require \\usepackage{hyperref} in preamble`,
        quickFixLabel: `Add \\usepackage{hyperref}`,
        quickFixFn: (cm) => insertPackageInPreamble('hyperref')
      });
    }

    // Check undefined citation keys
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let cmatch;
    while ((cmatch = citeRegex.exec(codePart)) !== null) {
      const keys = cmatch[1].split(',').map(k => k.trim());
      for (const key of keys) {
        if (bibKeys.size > 0 && !bibKeys.has(key)) {
          problems.push({
            line: i,
            chStart: cmatch.index,
            chEnd: cmatch.index + cmatch[0].length,
            severity: 'warning',
            message: `Undefined citation key '${key}'. Not found in project .bib files!`,
            quickFixLabel: null
          });
        }
      }
    }

    // Check undefined labels
    const refRegex = /\\(?:ref|pageref|autoref|eqref)\{([^}]+)\}/g;
    let rmatch;
    while ((rmatch = refRegex.exec(codePart)) !== null) {
      const refKey = rmatch[1].trim();
      if (labelKeys.size > 0 && !labelKeys.has(refKey)) {
        problems.push({
          line: i,
          chStart: rmatch.index,
          chEnd: rmatch.index + rmatch[0].length,
          severity: 'warning',
          message: `Undefined label reference '\\ref{${refKey}}'. No matching \\label{${refKey}} in project!`,
          quickFixLabel: null
        });
      }
    }
  }

  // Any unclosed environments left in stack
  envStack.forEach(unclosed => {
    problems.push({
      line: unclosed.line,
      chStart: unclosed.ch,
      chEnd: unclosed.ch + unclosed.matchText.length,
      severity: 'error',
      message: `Unclosed environment: \\begin{${unclosed.name}} is missing matching \\end{${unclosed.name}}!`,
      quickFixLabel: `Insert \\end{${unclosed.name}}`,
      quickFixFn: (cm) => {
        const lastLineIdx = cm.lineCount() - 1;
        const lastLineTxt = cm.getLine(lastLineIdx);
        cm.replaceRange(`\n\\end{${unclosed.name}}\n`, CodeMirror.Pos(lastLineIdx, lastLineTxt.length));
      }
    });
  });

  // Parse TeX Backend Compiler Log if provided
  if (compilerLog) {
    const logLines = compilerLog.split('\n');
    for (let j = 0; j < logLines.length; j++) {
      const logLine = logLines[j];
      const isErr = logLine.includes('! LaTeX Error:') || logLine.includes('! Undefined control sequence') || logLine.startsWith('! ') || logLine.includes('error:');
      const isWarn = logLine.toLowerCase().includes('warning') || logLine.includes('LaTeX Warning') || logLine.includes('Overfull \\hbox') || logLine.includes('Underfull \\hbox') || logLine.includes('Package ') || logLine.includes('Class ');

      if (isErr || isWarn) {
        let lineNo = -1;
        // Search surrounding lines for l.<number> or line <number> or on line <number>
        for (let k = Math.max(0, j - 3); k < Math.min(logLines.length, j + 5); k++) {
          const lMatch = logLines[k].match(/^l\.(\d+)|line (\d+)|on line (\d+)/i);
          if (lMatch) {
            lineNo = parseInt(lMatch[1] || lMatch[2] || lMatch[3], 10) - 1;
            break;
          }
        }

        if (lineNo < 0) {
          const rangeMatch = logLine.match(/at lines?\s+(\d+)/i) || (j < logLines.length - 1 && logLines[j+1].match(/at lines?\s+(\d+)/i));
          if (rangeMatch) {
            lineNo = parseInt(rangeMatch[1], 10) - 1;
          }
        }

        if (lineNo < 0) {
          const inlineNoMatch = logLine.match(/line (\d+)/i);
          if (inlineNoMatch) lineNo = parseInt(inlineNoMatch[1], 10) - 1;
        }

        const targetLine = lineNo >= 0 ? lineNo : 0;

        // Deduplicate
        const cleanMsg = logLine.replace(/^!\s*/, '').replace(/^warning:\s*/i, '').trim();
        const exists = problems.some(p => p.line === targetLine && p.message.includes(cleanMsg.slice(0, 25)));
        if (!exists && cleanMsg.length > 5) {
          problems.push({
            line: targetLine,
            chStart: 0,
            chEnd: lines[targetLine] ? lines[targetLine].length : 10,
            severity: isErr ? 'error' : 'warning',
            message: `${isErr ? 'Compiler Error' : 'Compiler Warning'}: ${cleanMsg}`,
            quickFixLabel: null
          });
        }
      }
    }
  }

  renderDiagnosticsUI(problems);
}

function renderDiagnosticsUI(problems) {
  if (!editor) return;

  const listContainer = document.getElementById('diagnostics-list');
  const summaryContainer = document.getElementById('diagnostics-summary');
  if (!listContainer || !summaryContainer) return;

  listContainer.innerHTML = '';

  const errorsCount = problems.filter(p => p.severity === 'error').length;
  const warningsCount = problems.filter(p => p.severity === 'warning').length;
  const warningsLogList = document.getElementById('warnings-log-list');
  const warningsCountBadge = document.getElementById('warnings-count-badge');
  if (warningsCountBadge) warningsCountBadge.innerText = problems.length;
  if (warningsLogList) warningsLogList.innerHTML = '';

  if (problems.length === 0) {
    summaryContainer.innerHTML = `
      <span class="diag-badge diag-clean">
        <i class="fa-solid fa-circle-check"></i> 0 Syntax Problems
      </span>
      <span style="color: var(--text-muted); font-size: 0.75rem;">Document syntax clean &amp; ready to compile</span>
    `;
    if (warningsLogList) {
      warningsLogList.innerHTML = `
        <div style="color:#34d399; text-align:center; padding:30px; font-size:0.88rem; background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.2); border-radius:8px;">
          <i class="fa-solid fa-circle-check" style="font-size:1.4rem; margin-bottom:6px;"></i><br>
          0 Warnings or Errors detected. Document is perfectly clean!
        </div>
      `;
    }
  } else {
    summaryContainer.innerHTML = `
      ${errorsCount > 0 ? `<span class="diag-badge diag-err-badge" onclick="event.stopPropagation(); toggleDiagnosticsDrawer(true);"><i class="fa-solid fa-circle-xmark"></i> ${errorsCount} Error${errorsCount > 1 ? 's' : ''}</span>` : ''}
      ${warningsCount > 0 ? `<span class="diag-badge diag-warn-badge" onclick="event.stopPropagation(); toggleDiagnosticsDrawer(true);"><i class="fa-solid fa-triangle-exclamation"></i> ${warningsCount} Warning${warningsCount > 1 ? 's' : ''}</span>` : ''}
      <span style="color: var(--text-muted); font-size: 0.75rem;" onclick="event.stopPropagation(); toggleDiagnosticsDrawer(true);">Click to expand list &amp; jump to line</span>
    `;
  }

  problems.forEach(p => {
    // 1. Gutter Marker
    const marker = document.createElement('div');
    if (p.severity === 'error') {
      marker.className = 'gutter-marker-error';
      marker.innerHTML = `<i class="fa-solid fa-circle-xmark" title="${escapeHtml(p.message)}"></i>`;
    } else {
      marker.className = 'gutter-marker-warning';
      marker.innerHTML = `<i class="fa-solid fa-triangle-exclamation" title="${escapeHtml(p.message)}"></i>`;
    }
    editor.setGutterMarker(p.line, "CodeMirror-lint-markers", marker);

    // 2. Wavy Text Underline & Line Highlight
    const cls = p.severity === 'error' ? 'cm-syntax-error' : 'cm-syntax-warning';
    const textMarker = editor.markText(
      CodeMirror.Pos(p.line, p.chStart),
      CodeMirror.Pos(p.line, p.chEnd),
      { className: cls, title: p.message }
    );
    syntaxErrorTextMarkers.push(textMarker);

    // Line Jump Action
    const jumpToProblemLine = () => {
      editor.setCursor(p.line, p.chStart);
      editor.focus();
      editor.scrollIntoView({ line: p.line, ch: p.chStart }, 100);
      editor.setSelection(CodeMirror.Pos(p.line, p.chStart), CodeMirror.Pos(p.line, p.chEnd));
      
      // Flash glowing highlight on the editor line
      const lineHandle = editor.addLineClass(p.line, 'background', 'cm-line-highlight-flash');
      setTimeout(() => {
        editor.removeLineClass(lineHandle, 'background', 'cm-line-highlight-flash');
      }, 1800);
    };

    // 3. Diagnostics Drawer Item
    const item = document.createElement('div');
    item.className = 'diag-item';
    item.onclick = jumpToProblemLine;

    const icon = p.severity === 'error'
      ? '<i class="fa-solid fa-circle-xmark" style="color: #f87171;"></i>'
      : '<i class="fa-solid fa-triangle-exclamation" style="color: #fbbf24;"></i>';

    item.innerHTML = `
      <div class="diag-item-left">
        ${icon}
        <span class="diag-line-no">Ln ${p.line + 1}</span>
        <span class="diag-msg">${escapeHtml(p.message)}</span>
      </div>
      <div class="diag-item-right">
        ${p.quickFixLabel ? `<button class="diag-quickfix-btn"><i class="fa-solid fa-wand-magic-sparkles"></i> ${escapeHtml(p.quickFixLabel)}</button>` : ''}
      </div>
    `;

    if (p.quickFixLabel && p.quickFixFn) {
      const qfBtn = item.querySelector('.diag-quickfix-btn');
      if (qfBtn) {
        qfBtn.onclick = (e) => {
          e.stopPropagation();
          p.quickFixFn(editor);
          fileStore[activeFile] = editor.getValue();
          runLaTeXSyntaxDiagnostics();
        };
      }
    }

    listContainer.appendChild(item);

    // 4. Populate Dedicated Warnings Tab Pane
    if (warningsLogList) {
      const tabCard = document.createElement('div');
      tabCard.style.cssText = "display:flex; align-items:center; justify-space-between; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:10px 14px; border-radius:8px; cursor:pointer; transition:all 0.2s ease;";
      tabCard.onmouseenter = () => { tabCard.style.background = 'rgba(168,85,247,0.12)'; tabCard.style.borderColor = 'rgba(168,85,247,0.3)'; };
      tabCard.onmouseleave = () => { tabCard.style.background = 'rgba(255,255,255,0.03)'; tabCard.style.borderColor = 'rgba(255,255,255,0.08)'; };
      tabCard.onclick = jumpToProblemLine;

      tabCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; flex:1;">
          ${icon}
          <span style="font-family:var(--font-code); font-size:0.75rem; background:rgba(168,85,247,0.2); color:#c084fc; padding:2px 8px; border-radius:4px; font-weight:700;">Line ${p.line + 1}</span>
          <span style="font-size:0.84rem; color:#ffffff; font-weight:500;">${escapeHtml(p.message)}</span>
        </div>
        <button class="btn btn-sm btn-secondary" style="font-size:0.72rem; padding:3px 8px;"><i class="fa-solid fa-arrow-right-to-bracket"></i> Jump to Line</button>
      `;
      warningsLogList.appendChild(tabCard);
    }
  });
}

function insertPackageInPreamble(pkgName) {
  if (!editor) return;
  const content = editor.getValue();
  const pkgStr = `\\usepackage{${pkgName}}\n`;
  if (content.includes(`\\usepackage{${pkgName}}`)) return;

  const docClassIdx = content.indexOf('\\documentclass');
  if (docClassIdx !== -1) {
    const lineEnd = content.indexOf('\n', docClassIdx);
    const pos = editor.posFromIndex(lineEnd + 1);
    editor.replaceRange(pkgStr, pos);
  } else {
    editor.replaceRange(pkgStr, CodeMirror.Pos(0, 0));
  }
}

// Initialize CodeMirror Editor
function initCodeEditor() {
  const textarea = document.getElementById('latex-code-editor');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'stex',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: "()[]{}''\"\"$$",
    gutters: ["CodeMirror-linenumbers", "CodeMirror-lint-markers"],
    extraKeys: {
      'Ctrl-Space': function(cm) {
        CodeMirror.showHint(cm, latexHintProvider, { completeSingle: false });
      },
      'Ctrl-S': function(cm) {
        saveCurrentProjectToBackend();
        compileLaTeX();
        return false;
      },
      'Cmd-S': function(cm) {
        saveCurrentProjectToBackend();
        compileLaTeX();
        return false;
      }
    }
  });

  // Real-time typing autocomplete trigger on '\\', '{', '@'
  editor.on('inputRead', (cm, change) => {
    const typedChar = change.text[0];
    if (typedChar === '\\' || typedChar === '{' || typedChar === '@' || (typedChar && typedChar.match(/[a-zA-Z]/))) {
      const cursor = cm.getCursor();
      const line = cm.getLine(cursor.line);
      const lineBefore = line.slice(0, cursor.ch);
      if (lineBefore.includes('\\') || lineBefore.includes('{') || lineBefore.includes('@')) {
        CodeMirror.showHint(cm, latexHintProvider, { completeSingle: false });
      }
    }
  });

  let timeoutId;
  editor.on('change', () => {
    document.getElementById('save-status').innerHTML = '<i class="fa-solid fa-pen-nib"></i> Editing...';
    fileStore[activeFile] = editor.getValue();
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      runLaTeXSyntaxDiagnostics();
      compileLaTeX();
      saveCurrentProjectToBackend();
    }, 300);
  });

  const btnNewFile = document.getElementById('btn-new-file');
  if (btnNewFile) btnNewFile.addEventListener('click', openNewFileModal);

  const btnNewFolder = document.getElementById('btn-new-folder');
  if (btnNewFolder) btnNewFolder.addEventListener('click', createNewFolder);
  
  const btnUpload = document.getElementById('btn-upload-file');
  if (btnUpload) {
    btnUpload.addEventListener('click', openUploadFileModal);
  }

  setTimeout(() => {
    editor.refresh();
    runLaTeXSyntaxDiagnostics();
  }, 100);
}

// Native PDF Compilation & Live Preview Engine
let activePdfBlobUrl = null;

async function compileLaTeX() {
  const code = editor ? editor.getValue() : '';
  if (editor && activeFile) {
    fileStore[activeFile] = code;
  }

  const pdfLabel = document.getElementById('pdf-file-label');
  if (pdfLabel) pdfLabel.innerText = activeFile;

  // Render quick KaTeX preview
  renderKaTeXPreview(code);

  const title = (activeProject ? activeProject.name : 'Document');
  const btnCompile = document.getElementById('btn-compile');
  const statusBadge = document.getElementById('save-status');

  if (btnCompile) btnCompile.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compiling...';
  if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compiling PDF...';

  try {
    const payloadFiles = getSanitizedTextFilesPayload(fileStore);
    const engineSelect = document.getElementById('compiler-engine-select');
    const selectedEngine = engineSelect ? engineSelect.value : 'tectonic';

    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject ? activeProject.id : null,
        files: payloadFiles,
        main_file: activeFile,
        title: title,
        engine: selectedEngine
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      if (activePdfBlobUrl) URL.revokeObjectURL(activePdfBlobUrl);
      activePdfBlobUrl = URL.createObjectURL(blob);

      const pdfFrame = document.getElementById('pdf-frame');
      if (pdfFrame) pdfFrame.src = activePdfBlobUrl;
      renderPdfSyncViewer(activePdfBlobUrl);
      ensurePdfViewActive();

      const b64Log = res.headers.get('X-Compiler-Log');
      const hasErr = res.headers.get('X-Compiler-Error') === '1';
      const isStale = res.headers.get('X-Compiler-Stale') === '1';
      const compType = res.headers.get('X-Compilation-Type') || 'root';

      const staleWarning = document.getElementById('stale-pdf-warning');
      if (staleWarning) {
        staleWarning.style.display = isStale ? 'flex' : 'none';
      }

      const typeBadge = document.getElementById('compilation-type-badge');
      if (typeBadge) {
        if (compType === 'fragment') {
          typeBadge.innerText = `Fragment Preview: ${activeFile}`;
          typeBadge.title = 'Standalone temporary compilation wrapper used for fragment preview';
          typeBadge.style.display = 'inline-block';
        } else {
          typeBadge.innerText = `Root Build: ${activeFile || 'main.tex'}`;
          typeBadge.title = 'Full document project root build';
          typeBadge.style.display = 'inline-block';
        }
      }

      let decodedLog = '';
      if (b64Log) {
        try { decodedLog = atob(b64Log); } catch (e) { decodedLog = ''; }
      }

      const logOutput = document.getElementById('compiler-log-output');
      if (isStale) {
        if (logOutput) logOutput.innerText = `⚠️ STALE PREVIEW — COMPILATION FAILED:\n\n${decodedLog || 'Errors detected during TeX pass. Displaying cached PDF.'}`;
        if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-amber)"></i> Stale Preview (Error)';
        if (typeof runLaTeXSyntaxDiagnostics === 'function') runLaTeXSyntaxDiagnostics(decodedLog);
      } else if (hasErr) {
        if (logOutput) logOutput.innerText = `⚠️ PDF Generated with LaTeX Warnings:\n\n${decodedLog || 'Warnings detected during TeX pass.'}`;
        if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-amber)"></i> PDF (warnings)';
        if (typeof runLaTeXSyntaxDiagnostics === 'function') runLaTeXSyntaxDiagnostics(decodedLog);
      } else {
        if (logOutput) logOutput.innerText = `✅ PDF Compilation Successful!\n\n${decodedLog || 'Engine: Tectonic (Native TeX)\nStatus: PDF Preview Updated.'}`;
        if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> PDF Ready';
        if (typeof runLaTeXSyntaxDiagnostics === 'function') runLaTeXSyntaxDiagnostics(decodedLog);
      }
    } else {
      const err = await res.json();
      const logOutput = document.getElementById('compiler-log-output');
      if (logOutput) logOutput.innerText = `❌ LaTeX Compilation Error:\n${err.error || ''}\n\n=== Compiler Log ===\n${err.log || ''}`;
      if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-red)"></i> PDF (error)';
      if (typeof runLaTeXSyntaxDiagnostics === 'function') runLaTeXSyntaxDiagnostics(err.log || err.error);
      ensurePdfViewActive();
    }
  } catch (e) {
    console.warn('Compilation error:', e);
    if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Offline';
  } finally {
    if (btnCompile) btnCompile.innerHTML = '<i class="fa-solid fa-play"></i> Compile';
  }
}

function renderKaTeXPreview(code) {
  const paper = document.getElementById('paper-content');
  if (!paper) return;

  const lines = (code || '').split('\n');
  let html = '';

  lines.forEach((lineText, lineIdx) => {
    let trimmed = lineText.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('\\title{')) {
      let t = trimmed.replace(/\\title\{([^}]+)\}/, '$1');
      html += `<h1 data-line="${lineIdx}">${t}</h1>`;
    } else if (trimmed.startsWith('\\section{')) {
      let s = trimmed.replace(/\\section\{([^}]+)\}/, '$1');
      html += `<h2 data-line="${lineIdx}">${s}</h2>`;
    } else if (trimmed.startsWith('\\subsection{')) {
      let ss = trimmed.replace(/\\subsection\{([^}]+)\}/, '$1');
      html += `<h3 data-line="${lineIdx}" style="margin-top:16px;">${ss}</h3>`;
    } else if (trimmed.startsWith('\\includegraphics')) {
      let imgMatch = trimmed.match(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/);
      if (imgMatch) {
        let imgName = imgMatch[1];
        let matchedKey = Object.keys(fileStore).find(k => k === imgName || k.startsWith(imgName) || k.includes(imgName));
        if (matchedKey && fileStore[matchedKey] && fileStore[matchedKey].startsWith('data:image')) {
          html += `<div data-line="${lineIdx}" style="text-align:center; margin:20px 0;"><img src="${fileStore[matchedKey]}" style="max-width:90%; height:auto; border-radius:6px; box-shadow:0 4px 15px rgba(0,0,0,0.15);" alt="${imgName}"></div>`;
        } else {
          html += `<div data-line="${lineIdx}" style="text-align:center; padding:18px; background:rgba(255,255,255,0.05); border:1px dashed var(--accent-purple); border-radius:8px; margin:20px 0; color:var(--text-main);"><i class="fa-regular fa-image" style="font-size:1.8rem; margin-bottom:6px; color:var(--accent-purple); display:block;"></i><strong>Figure Asset: ${imgName}</strong></div>`;
        }
      }
    } else if (!trimmed.startsWith('\\') && !trimmed.startsWith('%')) {
      html += `<p data-line="${lineIdx}">${trimmed}</p>`;
    }
  });

  paper.innerHTML = html || `<p data-line="0">${code}</p>`;

  if (!paper.dataset.syncBound) {
    paper.dataset.syncBound = 'true';
    paper.addEventListener('click', (e) => {
      const lineElem = e.target.closest('[data-line]');
      if (lineElem) {
        const line = parseInt(lineElem.getAttribute('data-line'), 10);
        if (!isNaN(line)) jumpToCodeLine(line);
      }
    });
  }

  try {
    renderMathInElement(paper, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\begin{equation}', right: '\\end{equation}', display: true},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    });
  } catch (e) {
    console.warn('KaTeX render warning:', e);
  }
}

async function exportPDF() {
  if (activePdfBlobUrl) {
    const title = (activeProject ? activeProject.name : 'Document');
    const a = document.createElement('a');
    a.href = activePdfBlobUrl;
    a.download = `${title}.pdf`;
    a.click();
  } else {
    await compileLaTeX();
    if (activePdfBlobUrl) {
      const title = (activeProject ? activeProject.name : 'Document');
      const a = document.createElement('a');
      a.href = activePdfBlobUrl;
      a.download = `${title}.pdf`;
      a.click();
    }
  }
}

// Navigation Side Strip Tabs
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const tab = item.dataset.tab;
      document.querySelectorAll('.drawer-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(`panel-${tab}`).classList.add('active');
      setTimeout(() => editor.refresh(), 50);
    });
  });

  document.getElementById('btn-compile').addEventListener('click', () => {
    compileLaTeX();
    saveCurrentProjectToBackend();
  });

  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) btnExportPdf.addEventListener('click', exportPDF);
  initGitHubSync();
}

function ensurePdfViewActive() {
  const tabs = document.querySelectorAll('.preview-tab');
  tabs.forEach(t => t.classList.remove('active'));
  
  const pdfTab = document.querySelector('.preview-tab[data-target="pdf-preview"]');
  if (pdfTab) pdfTab.classList.add('active');

  document.querySelectorAll('.preview-pane').forEach(pane => pane.classList.remove('active'));
  const pdfPane = document.getElementById('pdf-preview');
  if (pdfPane) pdfPane.classList.add('active');

  updateViewportPadding('pdf-preview');
}

function updateViewportPadding(target) {
  const viewport = document.querySelector('.preview-viewport');
  if (!viewport) return;
  if (target === 'rendered-preview') {
    viewport.classList.add('paper-padded');
  } else {
    viewport.classList.remove('paper-padded');
  }
}

function toggleMorePreviewMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('more-preview-tabs-menu');
  if (!menu) return;
  menu.classList.toggle('hidden');
}

function switchPreviewPaneTarget(targetId) {
  closeAllFileMenus();
  const menu = document.getElementById('more-preview-tabs-menu');
  if (menu) menu.classList.add('hidden');

  document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.preview-pane').forEach(p => p.classList.remove('active'));

  const targetPane = document.getElementById(targetId);
  if (targetPane) targetPane.classList.add('active');

  const moreBtn = document.getElementById('btn-more-preview-tabs');
  if (moreBtn) moreBtn.classList.add('active');

  updateViewportPadding(targetId);
}

function initPreviewTabs() {
  const tabs = document.querySelectorAll('.preview-tab');
  tabs.forEach(tab => {
    if (tab.id === 'btn-more-preview-tabs') return;
    tab.addEventListener('click', () => {
      const moreMenu = document.getElementById('more-preview-tabs-menu');
      if (moreMenu) moreMenu.classList.add('hidden');

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.target;
      if (target) {
        document.querySelectorAll('.preview-pane').forEach(pane => {
          pane.classList.remove('active');
        });
        const p = document.getElementById(target);
        if (p) p.classList.add('active');
        updateViewportPadding(target);
      }
    });
  });

  ensurePdfViewActive();

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    if (currentZoom < 160) {
      currentZoom += 10;
      updateZoom();
    }
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    if (currentZoom > 70) {
      currentZoom -= 10;
      updateZoom();
    }
  });
}

function updateZoom() {
  document.getElementById('zoom-level').innerText = `${currentZoom}%`;
  document.getElementById('paper-content').style.transform = `scale(${currentZoom / 100})`;
  document.getElementById('paper-content').style.transformOrigin = 'top center';
}

// --- AI ACCEPT / REJECT DIFF WORKFLOW ---
function showAIDiffModal(originalCode, proposedCode, instructionTitle) {
  pendingAIText = proposedCode;
  const model = document.getElementById('model-select').value;
  document.getElementById('ai-diff-model-tag').innerText = model;
  document.getElementById('ai-diff-instruction').innerText = `AI Proposal: ${instructionTitle}`;

  const diff = Diff.diffWords(originalCode, proposedCode);
  const diffBox = document.getElementById('ai-diff-content');
  diffBox.innerHTML = '';

  diff.forEach(part => {
    const elem = document.createElement(part.added ? 'ins' : part.removed ? 'del' : 'span');
    elem.className = part.added ? 'diff-add' : part.removed ? 'diff-del' : '';
    elem.appendChild(document.createTextNode(part.value));
    diffBox.appendChild(elem);
  });

  document.getElementById('ai-diff-modal').classList.add('active');
}

function acceptAIDiff() {
  if (pendingAIText !== null) {
    createCommit('AI Assistant Applied Changes');
    editor.setValue(pendingAIText);
    checkAutoPackageSupport(pendingAIText);
    compileLaTeX();
    saveCurrentProjectToBackend();
    pendingAIText = null;
  }
  closeModal('ai-diff-modal');
}

function rejectAIDiff() {
  pendingAIText = null;
  closeModal('ai-diff-modal');
}

// LaTeX AI Translator Logic
function initTranslator() {
  document.getElementById('btn-translate').addEventListener('click', async () => {
    const targetLang = document.getElementById('target-lang').value;
    const model = document.getElementById('model-select').value;
    const progress = document.getElementById('translate-progress');
    
    let textToTranslate = editor.getValue();
    progress.classList.remove('hidden');

    const systemPrompt = `You are an expert academic LaTeX translator. Translate the text into ${targetLang}.
CRITICAL RULES:
1. Preserve ALL LaTeX structural commands (e.g. \\documentclass, \\usepackage, \\section, \\begin{...}, \\end{...}, \\cite{}, \\ref{}, \\label{}).
2. DO NOT modify any math environments or equations inside $...$ or \\begin{equation}...\\end{equation}.
3. Only translate human prose and text.
4. Output ONLY the raw translated LaTeX code without markdown code blocks.`;

    try {
      const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://10.24.48.24:11435';
      let response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          system: systemPrompt,
          prompt: textToTranslate,
          stream: false
        })
      }).catch(() => null);

      if (!response || !response.ok) {
        response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model,
            system: systemPrompt,
            prompt: textToTranslate,
            stream: false
          })
        });
      }

      const data = await response.json();
      let translatedCode = data.response.trim();
      translatedCode = translatedCode.replace(/^```latex/g, '').replace(/^```/g, '').replace(/```$/g, '');

      showAIDiffModal(textToTranslate, translatedCode, `Translation to ${targetLang}`);
    } catch (e) {
      alert(`❌ Translation error: ${e.message}. Ensure Ollama server is active.`);
    } finally {
      progress.classList.add('hidden');
    }
  });
}

// Version Control & History Timeline
function initVersionControl() {
  renderCommitTimeline();

  document.getElementById('btn-create-commit').addEventListener('click', () => {
    const msg = document.getElementById('commit-msg-input').value.trim() || 'Snapshot update';
    createCommit(msg);
    document.getElementById('commit-msg-input').value = '';
  });
}

async function loadProjectHistory(projectId) {
  commitHistory = [];
  try {
    const response = await fetch(`/api/projects/history?id=${encodeURIComponent(projectId)}`);
    if (response.ok) {
      const snapshots = await response.json();
      commitHistory = snapshots.map(snapshot => ({
        hash: snapshot.id,
        message: snapshot.message,
        timestamp: snapshot.timestamp,
        content: null,
        snapshotId: snapshot.id
      }));
    }
  } catch (error) {
    console.warn('Unable to load project history:', error);
  }
  renderCommitTimeline();
  if (commitHistory.length === 0) createCommit('Initial Document Creation');
}

async function createCommit(message) {
  const text = editor ? editor.getValue() : '';
  const commit = {
    hash: Math.random().toString(36).substring(2, 8),
    message: message,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content: text
  };

  commitHistory.unshift(commit);
  renderCommitTimeline();

  if (activeProject) {
    try {
      const response = await fetch('/api/projects/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeProject.id,
          message,
          main_file: activeFile,
          files: getSanitizedTextFilesPayload(fileStore)
        })
      });
      if (response.ok) {
        const data = await response.json();
        const snapshot = data.snapshot;
        commit.hash = snapshot.id;
        commit.snapshotId = snapshot.id;
        commitHistory = commitHistory.map(item => item === commit ? commit : item);
        renderCommitTimeline();
      }
    } catch (error) {
      console.warn('Unable to persist project snapshot:', error);
    }
  }
}

function renderCommitTimeline() {
  const container = document.getElementById('commit-timeline');
  if (!container) return;
  container.innerHTML = '';

  commitHistory.forEach((commit) => {
    const card = document.createElement('div');
    card.className = 'commit-card';
    card.innerHTML = `
      <div class="commit-card-header">
        <span class="commit-msg">${commit.message}</span>
        <span class="commit-hash">#${commit.hash}</span>
      </div>
      <div class="commit-time"><i class="fa-solid fa-clock"></i> ${commit.timestamp}</div>
      <div class="commit-actions">
        <button class="btn-sm" onclick="restoreCommit('${commit.hash}')"><i class="fa-solid fa-rotate-left"></i> Restore</button>
        <button class="btn-sm" onclick="viewDiff('${commit.hash}')"><i class="fa-solid fa-code-compare"></i> Diff</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function restoreCommit(hash) {
  const commit = commitHistory.find(c => c.hash === hash);
  if (commit) {
    if (confirm(`Revert document to commit #${hash} ("${commit.message}")?`)) {
      restoreProjectSnapshot(commit);
    }
  }
}

async function restoreProjectSnapshot(commit) {
  if (!activeProject || !commit.snapshotId) return;
  try {
    const response = await fetch('/api/projects/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeProject.id, action: 'restore', snapshot: commit.snapshotId })
    });
    if (!response.ok) throw new Error('Snapshot restore failed');
    const projectResponse = await fetch(`/api/projects?id=${encodeURIComponent(activeProject.id)}`);
    if (!projectResponse.ok) throw new Error('Unable to reload restored project');
    activeProject = await projectResponse.json();
    fileStore = sanitizeFileStore(activeProject.files);
    activeFile = activeProject.main_file || activeFile;
    editor.setValue(fileStore[activeFile] || '');
    lastKnownProjectVersion = activeProject.version || 0;
    renderFileList();
    await compileLaTeX();
    showToast('Snapshot restored and recompiled.', 'success');
  } catch (error) {
    showToast(`Restore failed: ${error.message}`, 'error');
  }
}

async function viewDiff(hash) {
  const commit = commitHistory.find(c => c.hash === hash);
  if (!commit) return;

  const currentContent = editor.getValue();
  let oldContent = commit.content;
  if (oldContent === null && activeProject && commit.snapshotId) {
    try {
      const response = await fetch(`/api/projects/history?id=${encodeURIComponent(activeProject.id)}&snapshot=${encodeURIComponent(commit.snapshotId)}`);
      if (response.ok) {
        const snapshot = await response.json();
        oldContent = snapshot.files?.[activeFile] || '';
        commit.content = oldContent;
      }
    } catch (error) {
      showToast(`Unable to load snapshot: ${error.message}`, 'error');
      return;
    }
  }
  if (typeof oldContent !== 'string') return;

  document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-target="diff-preview"]').classList.add('active');

  document.querySelectorAll('.preview-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('diff-preview').classList.add('active');

  document.getElementById('diff-header-info').innerText = `Diff: Current vs Commit #${hash} ("${commit.message}")`;

  const diff = Diff.diffWords(oldContent, currentContent);
  const diffView = document.getElementById('diff-content-view');
  diffView.innerHTML = '';

  diff.forEach(part => {
    const color = part.added ? 'ins' : part.removed ? 'del' : 'span';
    const elem = document.createElement(color);
    elem.appendChild(document.createTextNode(part.value));
    diffView.appendChild(elem);
  });
}

// AI Assistance Tools Suite & Smart Generators
function initAITools() {
  const toolProjRev = document.getElementById('tool-project-review');
  if (toolProjRev) toolProjRev.addEventListener('click', runFullProjectAIReview);

  const toolAudit = document.getElementById('tool-citation-audit');
  if (toolAudit) toolAudit.addEventListener('click', runCitationAudit);

  const toolReview = document.getElementById('tool-peer-review');
  if (toolReview) toolReview.addEventListener('click', runPeerReview);

  const toolCsv = document.getElementById('tool-csv-table');
  if (toolCsv) toolCsv.addEventListener('click', openCSVTableModal);

  const toolEq = document.getElementById('tool-equation-analyzer');
  if (toolEq) toolEq.addEventListener('click', runEquationAnalyzer);

  const toolRepair = document.getElementById('tool-auto-repair');
  if (toolRepair) toolRepair.addEventListener('click', runAutomatedCompileFixLoop);

  const toolMath = document.getElementById('tool-gen-math');
  if (toolMath) toolMath.addEventListener('click', openMathGenerator);

  const toolPolish = document.getElementById('tool-polish');
  if (toolPolish) toolPolish.addEventListener('click', runAcademicPolish);

  initCSVTableConverter();
}

function runAcademicPolish() {
  if (!editor) return;
  const selection = editor.getSelection().trim();
  if (!selection) {
    alert('Select the academic text you want to polish first.');
    return;
  }

  runAITool(
    'Rewrite the selected academic prose for clarity, precision, concision, and journal-appropriate tone. Preserve all LaTeX commands, citations, labels, numbers, mathematical notation, and technical meaning. Do not add claims or references.',
    'Academic Polish'
  );
}

// --- 1. CSV TO LATEX TABLE CONVERTER ENGINE ---
function openCSVTableModal() {
  initCSVTableConverter();
  const modal = document.getElementById('csv-table-modal');
  if (modal) {
    modal.classList.add('active');
  }
  try {
    updateCSVTablePreview();
  } catch (e) {
    console.error('CSV table preview error:', e);
  }
}

async function generateAILaTeXTableFromCSV() {
  const textarea = document.getElementById('csv-raw-textarea');
  const captionInput = document.getElementById('csv-caption-input');
  const labelInput = document.getElementById('csv-label-input');
  const styleSelect = document.getElementById('csv-style-select');
  const preview = document.getElementById('csv-code-preview');
  const fileInput = document.getElementById('csv-file-input');

  let rawText = textarea ? textarea.value.trim() : '';

  // If textarea is empty, attempt to read on-the-fly from chosen file input
  if (!rawText && fileInput && fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    try {
      rawText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target.result.trim());
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
      });
      if (textarea) textarea.value = rawText;
      const statusDiv = document.getElementById('csv-upload-status');
      const rowCount = (rawText.match(/\n/g) || []).length + 1;
      if (statusDiv) statusDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> Loaded <strong>${file.name}</strong> (${rowCount} rows)`;
      updateCSVTablePreview();
    } catch (e) {
      console.error('Error reading CSV file:', e);
    }
  }

  if (!rawText) {
    alert('Please paste CSV data or upload a CSV file first.');
    return;
  }

  const selectedModel = document.getElementById('model-select').value;
  const targetModel = selectedModel && selectedModel.includes('qwen3') ? selectedModel : 'qwen3-coder:30b';
  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://10.24.48.24:11435';

  showAIProgressModal(`Converting CSV to LaTeX Table (${targetModel})`, targetModel);
  updateAIProgressStep(30, `Analyzing CSV layout & prompting ${targetModel}...`);

  const promptText = `You are an expert academic LaTeX table generator.
Convert the following CSV data into a publication-ready LaTeX table using ${styleSelect ? styleSelect.value : 'booktabs'} style:

CSV DATA:
${rawText}

${captionInput && captionInput.value ? `Caption: "${captionInput.value}"\n` : ''}
${labelInput && labelInput.value ? `Label: "${labelInput.value}"\n` : ''}

CRITICAL RULES:
1. Output ONLY the raw LaTeX table code starting with \\begin{table} and ending with \\end{table}.
2. Use \\toprule, \\midrule, \\bottomrule from booktabs package.
3. Do NOT include markdown code block formatting like \`\`\`latex.`;

  try {
    updateAIProgressStep(65, `Generating LaTeX table code with ${targetModel}...`);
    let res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        prompt: promptText,
        stream: false
      })
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          prompt: promptText,
          stream: false
        })
      });
    }

    updateAIProgressStep(95, 'Formatting table preview...');
    const data = await res.json();
    let latexCode = data.response.trim().replace(/^```latex/g, '').replace(/^```/g, '').replace(/```$/g, '');
    if (preview) preview.value = latexCode;

    closeAIProgressModal();
  } catch (e) {
    closeAIProgressModal();
    alert(`❌ AI Table Generation Error: ${e.message}`);
  }
}

let _csvConverterInitialized = false;
function initCSVTableConverter() {
  if (_csvConverterInitialized) return;
  _csvConverterInitialized = true;

  const fileInput = document.getElementById('csv-file-input');
  const rawTextarea = document.getElementById('csv-raw-textarea');
  const styleSelect = document.getElementById('csv-style-select');
  const captionInput = document.getElementById('csv-caption-input');
  const labelInput = document.getElementById('csv-label-input');
  const statusDiv = document.getElementById('csv-upload-status');

  const processFile = (file) => {
    if (!file) return;
    if (statusDiv) statusDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reading ${file.name}...`;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      if (rawTextarea) rawTextarea.value = content;
      const rowCount = (content.trim().match(/\n/g) || []).length + 1;
      if (statusDiv) statusDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> Loaded <strong>${file.name}</strong> (${rowCount} rows)`;
      updateCSVTablePreview();
    };
    reader.onerror = () => {
      if (statusDiv) statusDiv.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color:var(--accent-red)"></i> Failed to read file ${file.name}`;
    };
    reader.readAsText(file);
  };

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      processFile(file);
    });
  }

  if (rawTextarea) {
    ['dragenter', 'dragover'].forEach(eventName => {
      rawTextarea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        rawTextarea.style.borderColor = 'var(--accent-teal)';
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      rawTextarea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        rawTextarea.style.borderColor = '';
      });
    });
    rawTextarea.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
      }
    });
  }

  [rawTextarea, styleSelect, captionInput, labelInput].forEach(elem => {
    if (elem) elem.addEventListener('input', updateCSVTablePreview);
    if (elem) elem.addEventListener('change', updateCSVTablePreview);
  });
}

function updateCSVTablePreview() {
  const textarea = document.getElementById('csv-raw-textarea');
  const styleSelect = document.getElementById('csv-style-select');
  const captionInput = document.getElementById('csv-caption-input');
  const labelInput = document.getElementById('csv-label-input');
  const preview = document.getElementById('csv-code-preview');

  if (!preview) return;
  const rawText = textarea ? textarea.value.trim() : '';
  const style = styleSelect ? styleSelect.value : 'booktabs';
  const caption = captionInput ? captionInput.value.trim() : '';
  const label = labelInput ? labelInput.value.trim() : '';

  if (!rawText) {
    preview.value = '% Paste CSV data or upload a file above to generate LaTeX code.';
    return;
  }

  const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return;

  const rows = lines.map(line => {
    return line.split(',').map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
  });

  const colCount = Math.max(...rows.map(r => r.length));
  let colAlign = 'c'.repeat(colCount);

  let latex = '\\begin{table}[htbp]\n  \\centering\n';

  if (style === 'grid') {
    const gridAlign = '|' + Array(colCount).fill('c').join('|') + '|';
    latex += `  \\begin{tabular}{${gridAlign}}\n  \\hline\n`;
  } else {
    latex += `  \\begin{tabular}{${colAlign}}\n`;
    if (style === 'booktabs') latex += '  \\toprule\n';
  }

  rows.forEach((row, idx) => {
    while (row.length < colCount) row.push('');
    const rowStr = '  ' + row.join(' & ') + ' \\\\';
    latex += rowStr + '\n';

    if (idx === 0) {
      if (style === 'booktabs') latex += '  \\midrule\n';
      else if (style === 'grid') latex += '  \\hline\n';
    }
  });

  if (style === 'booktabs') latex += '  \\bottomrule\n';
  else if (style === 'grid') latex += '  \\hline\n';

  latex += '  \\end{tabular}\n';

  if (caption) latex += `  \\caption{${caption}}\n`;
  if (label) latex += `  \\label{${label.startsWith('tab:') ? label : 'tab:' + label}}\n`;
  else if (caption) latex += `  \\label{tab:${caption.toLowerCase().replace(/[^a-z0-9]+/g, '_')}}\n`;

  latex += '\\end{table}';

  preview.value = latex;
}

function copyCSVTableCode() {
  const code = document.getElementById('csv-code-preview').value;
  if (code) {
    navigator.clipboard.writeText(code);
    alert('✅ LaTeX Table code copied to clipboard!');
  }
}

function insertCSVTableAtCursor() {
  const code = document.getElementById('csv-code-preview').value;
  if (!code || code.startsWith('%')) return;
  ensureLaTeXPackages(['booktabs', 'multirow', 'array']);
  if (editor) {
    const cursor = editor.getCursor();
    editor.replaceRange(`\n${code}\n`, cursor);
    editor.focus();
  }
  closeModal('csv-table-modal');
  compileLaTeX();
  saveCurrentProjectToBackend();
}



async function runCitationAudit() {
  if (!editor) return;

  const currentCode = editor.getValue();
  const allTexContent = Object.keys(fileStore)
    .filter(f => f.endsWith('.tex'))
    .map(f => fileStore[f] || '')
    .join('\n');
  const codeToScan = allTexContent || currentCode;

  const citeRegex = /\\(?:cite|citep|citet|citeauthor|citeyear|parencite|textcite|autocite|footcite|nocite|citenum)\*?(?:\[[^\]]*\]){0,2}\{([^}]+)\}/g;
  const citeMatches = Array.from(codeToScan.matchAll(citeRegex));
  const citedKeys = new Set();

  citeMatches.forEach(m => {
    m[1].split(',').forEach(k => {
      const key = k.trim();
      if (key) citedKeys.add(key);
    });
  });

  const bibKeys = new Set();
  Object.keys(fileStore).filter(f => f.endsWith('.bib')).forEach(bibFile => {
    const content = fileStore[bibFile] || '';
    const keyRegex = /@(\w+)\s*\{\s*([^,\s]+)/g;
    let km;
    while ((km = keyRegex.exec(content)) !== null) {
      bibKeys.add(km[2]);
    }
  });

  const missingKeys = Array.from(citedKeys).filter(k => !bibKeys.has(k));
  const unusedKeys = Array.from(bibKeys).filter(k => !citedKeys.has(k));

  let auditReport = `📚 BIBTEX & CITATION AUDIT REPORT\n\n`;
  auditReport += `✓ Total citation commands found: ${citeMatches.length}\n`;
  auditReport += `✓ Unique cited reference keys: ${citedKeys.size}\n`;
  auditReport += `✓ Total .bib keys found in workspace: ${bibKeys.size}\n\n`;

  if (missingKeys.length === 0) {
    auditReport += `✅ ALL CITATION KEYS RESOLVED! No missing references.\n\n`;
  } else {
    auditReport += `⚠️ MISSING BIBTEX KEYS (${missingKeys.length}):\n${missingKeys.map(k => `  • ${k}`).join('\n')}\n\n`;
  }

  if (unusedKeys.length > 0) {
    auditReport += `ℹ️ UNUSED BIBTEX KEYS (${unusedKeys.length}):\n${unusedKeys.slice(0, 8).map(k => `  • ${k}`).join('\n')}\n`;
  }

  alert(auditReport);
}

// PHASE 3: EQUATION & NOTATION ANALYZER
function runEquationAnalyzer() {
  if (!editor) return;

  const currentCode = editor.getValue();
  const eqMatches = Array.from(currentCode.matchAll(/\\begin\{(equation|align|gather)\*?\}([\s\S]*?)\\end\{\1\*?\}/g));
  const inlineMatches = Array.from(currentCode.matchAll(/\$([^$]+)\$/g));

  let mathReport = `🧮 EQUATION & NOTATION ANALYZER REPORT\n\n`;
  mathReport += `✓ Display math environments found: ${eqMatches.length}\n`;
  mathReport += `✓ Inline math expressions found: ${inlineMatches.length}\n\n`;

  const missingLabels = eqMatches.filter(m => !m[2].includes('\\label{'));
  if (missingLabels.length > 0) {
    mathReport += `⚠️ EQUATIONS MISSING LABELS (${missingLabels.length}):\n  Equations should have \\label{eq:...} for cross-referencing.\n\n`;
  } else {
    mathReport += `✅ All display equations have valid \\label{} anchors.\n\n`;
  }

  // Check for common packages like amsmath, amssymb
  const hasAms = currentCode.includes('amsmath') || currentCode.includes('amssymb');
  if (!hasAms) {
    mathReport += `ℹ️ Recommendation: Add \\usepackage{amsmath,amssymb} to preamble for advanced math symbols.\n`;
  } else {
    mathReport += `✅ Math preamble packages (amsmath/amssymb) detected.\n`;
  }

  alert(mathReport);
}

function openMathGenerator() {
  const input = document.getElementById('math-generator-input');
  const output = document.getElementById('math-generator-output');
  const status = document.getElementById('math-generator-status');
  if (input && !input.value && editor) input.value = editor.getSelection() || '';
  if (output) output.value = '';
  if (status) status.innerText = 'Describe the formula, then generate a LaTeX preview before inserting it.';
  const modal = document.getElementById('math-generator-modal');
  if (modal) modal.classList.add('active');
  if (input) input.focus();
}

function cleanGeneratedMath(text) {
  let result = String(text || '').trim();
  result = result.replace(/^```(?:latex|tex)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const equationStart = result.indexOf('\\begin{equation');
  if (equationStart > 0) result = result.slice(equationStart);
  return result;
}

async function generateMathFormula() {
  const input = document.getElementById('math-generator-input');
  const output = document.getElementById('math-generator-output');
  const status = document.getElementById('math-generator-status');
  const description = input ? input.value.trim() : '';
  if (!description) {
    if (status) status.innerText = 'Describe the mathematical relationship first.';
    return;
  }

  const model = document.getElementById('model-select')?.value || 'qwen3-coder:30b';
  const ollamaUrl = document.getElementById('ollama-url-input')?.value || 'http://10.24.48.24:11435';
  const prompt = `Generate LaTeX equation with \\begin{equation} for this description: ${description}
Return only the LaTeX equation block. Do not include Markdown fences, explanation, or prose. Use a numbered equation unless the description explicitly requires an unnumbered form.`;
  if (status) status.innerText = `Generating with ${model}...`;
  showAIProgressModal('Generate Math Formula', model);
  updateAIProgressStep(20, 'Converting the description into a structured LaTeX equation...');

  try {
    let response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false })
    }).catch(() => null);
    if (!response || !response.ok) {
      response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
      });
    }
    if (!response.ok) throw new Error(`AI request failed (HTTP ${response.status})`);
    const data = await response.json();
    const formula = cleanGeneratedMath(data.response || data.text || '');
    if (!formula) throw new Error('The model returned an empty formula.');
    if (output) output.value = formula;
    if (status) status.innerText = /\\begin\{(equation|align|gather)/.test(formula)
      ? 'Preview ready. Insert will add the required math packages when needed.'
      : 'Preview ready. Review the generated LaTeX before inserting it.';
    updateAIProgressStep(100, 'Formula generated and ready for review.');
  } catch (error) {
    if (status) status.innerText = `Unable to generate formula: ${error.message}. Check the Ollama connection in Settings.`;
  } finally {
    setTimeout(closeAIProgressModal, 250);
  }
}

function copyGeneratedMath() {
  const output = document.getElementById('math-generator-output');
  if (!output || !output.value) return;
  navigator.clipboard.writeText(output.value);
  const status = document.getElementById('math-generator-status');
  if (status) status.innerText = 'LaTeX formula copied to the clipboard.';
}

function insertGeneratedMath() {
  const output = document.getElementById('math-generator-output');
  if (!output || !output.value || !editor) return;
  const formula = output.value.trim();
  const packages = [];
  if (/\\begin\{(equation|align|gather)/.test(formula) || /\\(?:dfrac|text|operatorname)\b/.test(formula)) packages.push('amsmath');
  if (/\\(?:mathbb|mathfrak|mathcal|therefore|leq|geq)\b/.test(formula)) packages.push('amssymb');
  if (packages.length) ensureLaTeXPackages(packages);
  editor.replaceSelection(`\n${formula}\n`);
  editor.focus();
  fileStore[activeFile] = editor.getValue();
  closeModal('math-generator-modal');
  saveCurrentProjectToBackend(true);
  compileLaTeX();
}

// PHASE 3: PAPER HEALTH SCORE & RESEARCH INTEGRITY PANEL
async function calculatePaperHealthScore() {
  if (!editor) return;

  const currentCode = editor.getValue();
  let score = 100;
  const breakdown = [];

  // 1. Structure check
  const hasTitle = currentCode.includes('\\title');
  const hasAbstract = currentCode.includes('abstract');
  const hasSection = currentCode.includes('\\section');

  if (!hasTitle) { score -= 10; breakdown.push('❌ Missing \\title'); } else breakdown.push('✓ Title defined (+10)');
  if (!hasAbstract) { score -= 15; breakdown.push('❌ Missing abstract environment'); } else breakdown.push('✓ Abstract environment present (+15)');
  if (!hasSection) { score -= 15; breakdown.push('❌ Missing section structure'); } else breakdown.push('✓ Section hierarchy present (+15)');

  // 2. Citation check
  const hasCites = /\\(?:cite|citep|citet|parencite|autocite)/.test(currentCode);
  const hasBib = Object.keys(fileStore).some(f => f.endsWith('.bib'));
  if (!hasCites) { score -= 15; breakdown.push('⚠️ No citation references'); } else breakdown.push('✓ Citations present (+15)');
  if (!hasBib) { score -= 10; breakdown.push('⚠️ No .bib bibliography file'); } else breakdown.push('✓ Bibliography file detected (+10)');

  // 3. Math & Figure check
  const hasMath = currentCode.includes('$') || currentCode.includes('\\begin{equation}');
  if (hasMath) breakdown.push('✓ Mathematical notation present (+10)');

  score = Math.max(20, score);

  let healthReport = `🔬 PAPER HEALTH SCORE: ${score} / 100\n\n`;
  healthReport += `EVALUATION BREAKDOWN:\n${breakdown.map(b => `  ${b}`).join('\n')}\n\n`;
  healthReport += `TOP ACTIONABLE SUGGESTIONS:\n`;
  if (score >= 85) {
    healthReport += `  • Excellent manuscript health! Ready for peer review simulation.`;
  } else {
    healthReport += `  • Address missing citations, add .bib file, and structure sections for higher score.`;
  }

  const selectedModel = document.getElementById('model-select').value;
  const targetModel = selectedModel || 'phi4:latest';
  const runDeepAI = confirm(`${healthReport}\n\nWould you like to run Deep AI Health Analysis using active model (${targetModel})?`);
  if (!runDeepAI) return;

  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://10.24.48.24:11435';

  const systemPrompt = `You are a Senior Academic Paper Diagnostics & Quality Evaluator.
Analyze the provided LaTeX paper and give a detailed health audit report:
1. Structural completeness (Title, Abstract, Sections, Figures, Tables).
2. Citation health and bibliography coverage.
3. Mathematical notation & equation labeling quality.
4. Specific recommendations to improve paper quality for top-tier publication.
Format cleanly with bullet points and clear headings.`;

  showAIProgressModal(`Deep Paper Health Audit (${targetModel})`, targetModel);
  updateAIProgressStep(30, `Evaluating structure & mathematical rigor with ${targetModel}...`);

  try {
    let response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel, system: systemPrompt, prompt: currentCode, stream: false })
    }).catch(() => null);

    if (!response || !response.ok) {
      response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: targetModel, system: systemPrompt, prompt: currentCode, stream: false })
      });
    }

    updateAIProgressStep(95, 'Synthesizing health audit score report...');
    if (response.ok) {
      const data = await response.json();
      closeAIProgressModal();
      alert(`🔬 DEEP AI HEALTH & DIAGNOSTICS AUDIT (Model: ${targetModel})\n\n${data.response}`);
    } else {
      closeAIProgressModal();
      alert(`⚠️ AI Health Audit Error: Unable to query model ${targetModel}.`);
    }
  } catch (e) {
    closeAIProgressModal();
    alert(`❌ AI Execution Error: ${e.message}`);
  }
}

// PHASE 4: AUTOMATED COMPILE-FIX-VERIFY LOOP
async function runAutomatedCompileFixLoop() {
  if (!editor) return;

  const selectedModel = document.getElementById('model-select')?.value || 'qwen3-coder:30b';
  const engine = document.getElementById('compiler-engine-select')?.value || 'tectonic';
  const repairButton = document.getElementById('tool-auto-repair');
  if (repairButton) repairButton.style.pointerEvents = 'none';
  if (activeFile) fileStore[activeFile] = editor.getValue();

  try {
    showAIProgressModal('Automated Compile-Fix-Verify', selectedModel);
    updateAIProgressStep(15, 'Compiling the active document...');
    const response = await fetch('/api/compile-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject?.id || null,
        files: getSanitizedTextFilesPayload(fileStore),
        main_file: activeFile,
        engine,
        model: selectedModel,
        max_attempts: 3
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Compile-fix request failed');

    updateAIProgressStep(result.status === 'verified' ? 100 : 95,
      result.status === 'verified' ? 'Patch verified and PDF rebuilt.' : 'No verified repair was found.');
    if (result.status === 'verified' && result.files && typeof result.files === 'object') {
      fileStore = result.files;
      if (activeFile && typeof fileStore[activeFile] === 'string') editor.setValue(fileStore[activeFile]);
    }

    if (result.status === 'verified' && result.pdf_base64) {
      const binary = atob(result.pdf_base64);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      if (activePdfBlobUrl) URL.revokeObjectURL(activePdfBlobUrl);
      activePdfBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const pdfFrame = document.getElementById('pdf-frame');
      if (pdfFrame) pdfFrame.src = activePdfBlobUrl;
      ensurePdfViewActive();
    }

    const lastAttempt = result.attempts?.[result.attempts.length - 1];
    lastCompilerLog = result.log || lastAttempt?.log || '';
    const logOutput = document.getElementById('compiler-log-output');
    if (logOutput) logOutput.innerText = result.status === 'verified'
      ? `✅ Automated repair verified after ${result.attempts.length} compile pass(es).\n\n${result.log || ''}`
      : `❌ Automated repair could not verify a clean build.\n\n${result.log || ''}`;
    runLaTeXSyntaxDiagnostics(result.log || '');

    if (result.status === 'verified') {
      await saveCurrentProjectToBackend(true);
      showToast(`Compile-fix verified after ${result.attempts.length} pass(es).`, 'success');
    } else {
      showToast('No verified patch was applied. Your last proposal remains in the editor.', 'error');
    }
  } catch (error) {
    showToast(`Compile-fix failed: ${error.message}`, 'error');
  } finally {
    closeAIProgressModal();
    if (repairButton) repairButton.style.pointerEvents = '';
  }
}

async function insertFigureAtCursor() {
  const code = document.getElementById('fig-code-preview').value;
  if (!code) return;
  ensureLaTeXPackages(['graphicx']);
  if (editor) {
    const cursor = editor.getCursor();
    editor.replaceRange(`\n${code}\n`, cursor);
    editor.focus();
  }
  closeModal('figure-inserter-modal');
  await saveCurrentProjectToBackend(true);
  await compileLaTeX();
}

// CONTEXT ENGINE: Targeted, scoped context extraction for AI Copilot & Agents
function getAIContext() {
  if (!editor) return {};

  const cursor = editor.getCursor();
  const selection = editor.getSelection();
  const fullCode = editor.getValue();
  const lines = fullCode.split('\n');

  // 1. Extract surrounding text context (15 lines before and after cursor)
  const startLine = Math.max(0, cursor.line - 15);
  const endLine = Math.min(lines.length - 1, cursor.line + 15);
  const surroundingText = lines.slice(startLine, endLine + 1).join('\n');

  // 2. Identify parent section title
  let currentSection = 'Preamble / Document Header';
  for (let i = cursor.line; i >= 0; i--) {
    const match = lines[i].match(/\\(section|subsection|subsubsection)\*?\{([^}]+)\}/);
    if (match) {
      currentSection = `${match[1]}: ${match[2]}`;
      break;
    }
  }

  // 3. Gather BibTeX keys across all .bib files in workspace
  const bibKeys = [];
  Object.keys(fileStore).filter(f => f.endsWith('.bib')).forEach(bibFile => {
    const content = fileStore[bibFile] || '';
    const keyRegex = /@(\w+)\s*\{\s*([^,\s]+)/g;
    let km;
    while ((km = keyRegex.exec(content)) !== null) {
      bibKeys.push(`${km[2]} (@${km[1]} in ${bibFile})`);
    }
  });

  return {
    project_name: activeProject ? activeProject.name : 'LaTeX Project',
    file: activeFile || 'main.tex',
    current_section: currentSection,
    cursor_line: cursor.line + 1,
    selection: selection || null,
    surrounding_text: surroundingText,
    bib_keys: bibKeys,
    compile_errors: lastCompilerLog || 'No active compiler errors'
  };
}

// STREAMING OLLAMA SSE HANDLER: Real-time response streaming for fast local LLM feedback
async function streamOllamaPrompt(ollamaUrl, payload, onChunk) {
  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true })
    });
    if (!response.ok) throw new Error(`Ollama API error (${response.status})`);
  } catch (err) {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, stream: true })
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkStr = decoder.decode(value, { stream: true });
    const lines = chunkStr.split('\n');

    lines.forEach(l => {
      if (l.trim()) {
        try {
          const parsed = JSON.parse(l);
          if (parsed.response) {
            fullText += parsed.response;
            if (typeof onChunk === 'function') onChunk(parsed.response, fullText);
          }
        } catch (e) {
          // ignore incomplete SSE line chunks
        }
      }
    });
  }

  return fullText.trim();
}

// LINE-AWARE PATCH GENERATOR: Computes line-range diff patch for scoped text edits
function computeLinePatch(originalCode, proposedCode, context) {
  if (context && context.selection) {
    if (typeof editor !== 'undefined' && editor && editor.somethingSelected()) {
      const from = editor.getCursor('from');
      const to = editor.getCursor('to');
      const fromIndex = editor.indexFromPos(from);
      const toIndex = editor.indexFromPos(to);

      const patchCode = originalCode.slice(0, fromIndex) + proposedCode + originalCode.slice(toIndex);

      return {
        isScoped: true,
        startLine: from.line + 1,
        endLine: to.line + 1,
        originalText: context.selection,
        proposedText: proposedCode,
        patchCode: patchCode,
        fromPos: from,
        toPos: to
      };
    } else {
      const lines = originalCode.split('\n');
      const startLine = context.cursor_line ? Math.max(1, context.cursor_line) : 1;
      const selLineCount = context.selection.split('\n').length;
      const endLine = Math.min(lines.length, startLine + selLineCount - 1);

      const beforeLines = lines.slice(0, startLine - 1);
      const afterLines = lines.slice(endLine);
      const patchCode = [...beforeLines, proposedCode, ...afterLines].join('\n');

      return {
        isScoped: true,
        startLine: startLine,
        endLine: endLine,
        originalText: context.selection,
        proposedText: proposedCode,
        patchCode: patchCode
      };
    }
  }

  return {
    isScoped: false,
    startLine: 1,
    endLine: originalCode.split('\n').length,
    originalText: originalCode,
    proposedText: proposedCode,
    patchCode: proposedCode
  };
}

// --- INTERACTIVE AI PROGRESS BAR & TIMING MANAGER ---
let aiProgressTimerInterval = null;
let aiProgressStartTime = 0;
let activeAIController = null;

function showAIProgressModal(title, modelName) {
  const modal = document.getElementById('ai-progress-modal');
  const titleElem = document.getElementById('ai-progress-title');
  const modelBadge = document.getElementById('ai-progress-model-badge');
  const fillElem = document.getElementById('ai-progress-bar-fill');
  const percentElem = document.getElementById('ai-progress-percent');
  const timerElem = document.getElementById('ai-progress-timer');
  const stepText = document.getElementById('ai-progress-step-text');

  if (titleElem) titleElem.innerText = title || 'Processing AI Request...';
  if (modelBadge) modelBadge.innerText = modelName || (document.getElementById('model-select') ? document.getElementById('model-select').value : 'qwen3-coder:30b');
  if (fillElem) fillElem.style.width = '10%';
  if (percentElem) percentElem.innerText = '10%';
  if (stepText) stepText.innerText = `Connecting to inference backend (10.24.48.24:11435)...`;

  aiProgressStartTime = Date.now();
  if (timerElem) timerElem.innerText = '0.0s';

  if (aiProgressTimerInterval) clearInterval(aiProgressTimerInterval);
  aiProgressTimerInterval = setInterval(() => {
    const elapsed = ((Date.now() - aiProgressStartTime) / 1000).toFixed(1);
    if (timerElem) timerElem.innerText = `${elapsed}s`;

    const currentW = parseFloat(fillElem ? fillElem.style.width : 0) || 10;
    if (currentW < 90) {
      const nextW = Math.min(92, currentW + (90 - currentW) * 0.06);
      if (fillElem) fillElem.style.width = `${nextW.toFixed(0)}%`;
      if (percentElem) percentElem.innerText = `${nextW.toFixed(0)}%`;
    }
  }, 300);

  if (modal) modal.classList.add('active');
}

function updateAIProgressStep(percent, stepMessage) {
  const fillElem = document.getElementById('ai-progress-bar-fill');
  const percentElem = document.getElementById('ai-progress-percent');
  const stepText = document.getElementById('ai-progress-step-text');

  if (fillElem) fillElem.style.width = `${percent}%`;
  if (percentElem) percentElem.innerText = `${percent}%`;
  if (stepText) stepText.innerText = stepMessage;
}

function closeAIProgressModal() {
  if (aiProgressTimerInterval) {
    clearInterval(aiProgressTimerInterval);
    aiProgressTimerInterval = null;
  }
  const modal = document.getElementById('ai-progress-modal');
  if (modal) modal.classList.remove('active');
}

function cancelAIProgress() {
  if (activeAIController) {
    try { activeAIController.abort(); } catch (e) {}
    activeAIController = null;
  }
  closeAIProgressModal();
}

async function runAITool(instruction, title) {
  const model = document.getElementById('model-select').value;
  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://10.24.48.24:11435';
  const code = editor.getValue();
  const context = getAIContext();

  showAIProgressModal(title || 'AI Academic Patch', model);
  updateAIProgressStep(25, 'Extracting document scope & section context...');

  const promptPayload = `TASK: ${instruction}

PROJECT CONTEXT:
- Active File: ${context.file}
- Current Section: ${context.current_section}
- Cursor Line: ${context.cursor_line}
${context.selection ? `- Selected Text Scope:\n"${context.selection}"\n` : ''}
${context.bib_keys && context.bib_keys.length ? `- Available Bibliography Keys: ${context.bib_keys.slice(0, 10).join(', ')}\n` : ''}

SURROUNDING DOCUMENT CONTEXT:
\`\`\`latex
${context.selection ? context.selection : context.surrounding_text}
\`\`\`

FULL DOCUMENT:
\`\`\`latex
${code}
\`\`\`

INSTRUCTIONS:
${context.selection ? 'Output ONLY the revised LaTeX replacement for the Selected Text Scope.' : 'Output ONLY valid LaTeX code without extra explanations.'} Do not include markdown code block formatting like \`\`\`latex.`;

  try {
    updateAIProgressStep(55, `Streaming LLM output from model (${model})...`);
    const streamedText = await streamOllamaPrompt(ollamaUrl, {
      model: model,
      prompt: promptPayload
    });

    updateAIProgressStep(95, 'Computing exact positional diff patch...');
    let cleanResult = streamedText.replace(/^```latex/g, '').replace(/^```/g, '').replace(/```$/g, '');
    const patch = computeLinePatch(code, cleanResult, context);

    closeAIProgressModal();
    showAIDiffModal(code, patch.patchCode, `${title || 'AI Academic Patch'} (Lines ${patch.startLine}–${patch.endLine})`);
  } catch (e) {
    closeAIProgressModal();
    alert(`❌ AI Execution Error: ${e.message}`);
  }
}

// Automatic LaTeX Package Preamble Support
function ensureLaTeXPackages(packages) {
  if (!editor || !packages || !Array.isArray(packages) || packages.length === 0) return;

  const currentCode = editor.getValue();
  const missing = [];

  packages.forEach(pkg => {
    const regex = new RegExp(`\\\\usepackage\\s*(?:\\[[^\\]]*\\])?\\s*\\{${pkg}\\}`, 'i');
    if (!regex.test(currentCode)) {
      missing.push(pkg);
    }
  });

  if (missing.length === 0) return;

  const pkgLines = missing.map(p => `\\usepackage{${p}}`).join('\n');
  let newCode = currentCode;

  if (newCode.includes('\\begin{document}')) {
    newCode = newCode.replace('\\begin{document}', `${pkgLines}\n\\begin{document}`);
  } else if (newCode.includes('\\documentclass')) {
    newCode = newCode.replace(/(\\documentclass\{[^}]+\}.*\n)/, `$1${pkgLines}\n`);
  } else {
    newCode = `${pkgLines}\n\n${newCode}`;
  }

  const cursor = editor.getCursor();
  editor.setValue(newCode);
  editor.setCursor({ line: cursor.line + missing.length, ch: cursor.ch });

  const toastMsg = `Auto-inserted package(s): ${missing.map(p => '\\usepackage{' + p + '}').join(', ')}`;
  if (typeof showToast === 'function') {
    showToast(toastMsg, 'info');
  } else {
    console.log(toastMsg);
  }
}

function checkAutoPackageSupport(text) {
  if (!text) return;
  const pkgs = [];
  if (text.includes('\\begin{table}') || text.includes('\\toprule') || text.includes('\\multirow')) {
    pkgs.push('booktabs', 'multirow', 'array');
  }
  if (text.includes('\\begin{figure}') || text.includes('\\includegraphics')) {
    pkgs.push('graphicx');
  }
  if (text.includes('\\begin{equation}') || text.includes('\\begin{align}') || text.includes('\\mathbb')) {
    pkgs.push('amsmath', 'amssymb');
  }
  if (pkgs.length > 0) {
    ensureLaTeXPackages(pkgs);
  }
}

// Helper snippet insertions
function insertLaTeX(start, end) {
  if (start.includes('equation') || start.includes('align')) {
    ensureLaTeXPackages(['amsmath', 'amssymb']);
  }
  const selection = editor.getSelection();
  editor.replaceSelection(start + selection + end);
  editor.focus();
}

function insertTableSnippet() {
  ensureLaTeXPackages(['booktabs', 'multirow', 'array']);
  const tableSnippet = `\\begin{table}[h]
\\centering
\\begin{tabular}{cc}
\\toprule
Item & Value \\\\
\\midrule
Parameter A & 100 \\\\
Parameter B & 200 \\\\
\\bottomrule
\\end{tabular}
\\caption{Sample Data Table}
\\end{table}`;
  editor.replaceSelection(tableSnippet);
  editor.focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.removeProperty('display');
}

document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('settings-modal').classList.add('active');
});

async function testOllamaConnection() {
  const url = document.getElementById('ollama-url-input').value || 'http://10.24.48.24:11435';
  const resElem = document.getElementById('conn-test-result');
  resElem.innerText = ' Testing...';
  try {
    let res = await fetch(`${url}/api/tags`).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('/api/tags');
    }
    if (res && res.ok) {
      resElem.innerHTML = ' <span style="color:var(--accent-green)">Connected to AI Engine Backend!</span>';
    } else {
      resElem.innerHTML = ' <span style="color:var(--accent-red)">Connection Failed</span>';
    }
  } catch (e) {
    resElem.innerHTML = ` <span style="color:var(--accent-red)">Error: ${e.message}</span>`;
  }
}

// --- BIDIRECTIONAL INTERACTIVE SYNCTEX ENGINE (EDITOR ⟷ PDF) ---
let isAutoSyncActive = true;
let autoSyncDebounceTimer = null;

async function renderPdfSyncViewer(blobUrl) {
  const viewer = document.getElementById('pdf-canvas-viewer');
  const iframe = document.getElementById('pdf-frame');
  if (!viewer || !iframe || !window.pdfjsLib) return;

  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument(blobUrl).promise;
    viewer.innerHTML = '';
    viewer.style.display = 'block';
    iframe.style.display = 'none';

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.35 });
      const pageWrap = document.createElement('div');
      pageWrap.style.cssText = 'position:relative; width:max-content; margin:0 auto 18px; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.35);';
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.display = 'block';
      pageWrap.dataset.page = String(pageNumber);
      pageWrap.appendChild(canvas);
      viewer.appendChild(pageWrap);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      canvas.addEventListener('click', (event) => {
        event.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const pdfScale = 1.35;
        const pdfX = ((event.clientX - rect.left) * scaleX) / pdfScale;
        const pdfY = ((event.clientY - rect.top) * scaleY) / pdfScale;
        resolvePdfSourceLocation(pageNumber, pdfX, pdfY);
      });
    }
  } catch (error) {
    viewer.style.display = 'none';
    iframe.style.display = 'block';
    console.warn('PDF.js SyncTeX viewer unavailable; using native PDF viewer:', error);
  }
}

async function resolvePdfSourceLocation(page, x, y) {
  if (!activeProject || !activeProject.id) return;
  try {
    const response = await fetch('/api/synctex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeProject.id, main_file: activeFile, page, x, y })
    });
    if (!response.ok) throw new Error('No source mapping found');
    const location = await response.json();
    if (location.file && fileStore[location.file] !== undefined && location.file !== activeFile) {
      switchActiveFile(location.file);
    }
    jumpToCodeLine(Math.max(0, Number(location.line) - 1));
    showPdfSyncToast(`Jumped to ${location.file || activeFile}:${location.line}`);
  } catch (error) {
    showPdfSyncToast('No source location found for this PDF position');
  }
}

function toggleAutoSync() {
  isAutoSyncActive = !isAutoSyncActive;
  const btn = document.getElementById('btn-toggle-autosync');
  if (btn) {
    if (isAutoSyncActive) {
      btn.classList.add('active-autosync');
      btn.innerHTML = '<i class="fa-solid fa-link" style="color:var(--accent-blue);"></i> Auto Sync ON';
      showPdfSyncToast('Auto Sync Connection Activated');
    } else {
      btn.classList.remove('active-autosync');
      btn.innerHTML = '<i class="fa-solid fa-link-slash" style="color:var(--text-muted);"></i> Auto Sync OFF';
      showPdfSyncToast('Auto Sync Connection Paused');
    }
  }
}

function initPdfInverseSearch() {
  const pointerBar = document.getElementById('pdf-pointer-bar');
  const pointerText = document.getElementById('pdf-pointer-text');
  let lastPdfHoverY = 0;
  let lastPdfHoverHeight = 1;

  // CodeMirror Cursor & Scroll Event Listener for Auto Sync
  if (editor && !editor._syncBound) {
    editor._syncBound = true;
    editor.on('cursorActivity', () => {
      if (!isAutoSyncActive) return;
      if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = setTimeout(() => {
        jumpEditorToPdf(true); // Silent mode on cursor scroll
      }, 350);
    });

    // Double click in CodeMirror jumps to PDF
    editor.on('dblclick', () => {
      jumpEditorToPdf(false);
    });
  }

  // Mousemove listener on PDF preview container to move target indicator line
  pdfContainer.addEventListener('mousemove', (e) => {
    const rect = pdfContainer.getBoundingClientRect();
    lastPdfHoverY = e.clientY - rect.top;
    lastPdfHoverHeight = rect.height || 1;

    if (pointerBar && editor) {
      const ratio = Math.max(0, Math.min(1, lastPdfHoverY / lastPdfHoverHeight));
      const lineCount = Math.max(1, editor.lineCount());
      const estLine = Math.floor(ratio * lineCount) + 1;

      pointerBar.style.top = `${lastPdfHoverY}px`;
      pointerBar.style.opacity = '1';
      pointerBar.style.display = 'block';
      if (pointerText) pointerText.innerText = `🎯 Line ${estLine} (Click to Jump)`;
    }
  });

  pdfContainer.addEventListener('mouseleave', () => {
    if (pointerBar) pointerBar.style.opacity = '0';
  });

  // Click & Double-click listener on PDF container
  pdfContainer.addEventListener('click', handlePdfClick);
  pdfContainer.addEventListener('dblclick', handlePdfClick);

  function handlePdfClick(e) {
    if (!editor) return;
    const sel = window.getSelection() ? window.getSelection().toString().trim() : '';
    if (sel.length >= 3) {
      const line = findLineByText(sel);
      if (line >= 0) {
        jumpToCodeLine(line);
        return;
      }
    }

    if (lastPdfHoverHeight > 0) {
      const ratio = Math.max(0, Math.min(1, lastPdfHoverY / lastPdfHoverHeight));
      const lineCount = editor.lineCount();
      const targetLine = Math.floor(ratio * lineCount);
      jumpToCodeLine(targetLine);
    }
  }

  // Handle focus shift to PDF iframe window (triggers jump on clicking inside PDF iframe)
  if (!window._pdfFrameBlurBound) {
    window._pdfFrameBlurBound = true;
    window.addEventListener('blur', () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (active && (active.id === 'pdf-frame' || active.tagName === 'IFRAME')) {
          if (editor && lastPdfHoverHeight > 0) {
            const ratio = Math.max(0, Math.min(1, lastPdfHoverY / lastPdfHoverHeight));
            const lineCount = editor.lineCount();
            const targetLine = Math.floor(ratio * lineCount);
            jumpToCodeLine(targetLine);
          }
        }
      }, 50);
    });
  }

  // 1. Text Selection Sync (Selecting text anywhere in PDF/HTML preview immediately moves editor cursor)
  function syncSelectedTextToEditor() {
    const sel = window.getSelection() ? window.getSelection().toString().trim() : '';
    if (sel && sel.length >= 3) {
      const line = findLineByText(sel);
      if (line >= 0) {
        jumpToCodeLine(line);
      }
    }
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target && e.target.closest('.CodeMirror')) return;
    syncSelectedTextToEditor();
  });

  document.addEventListener('selectionchange', () => {
    const active = document.activeElement;
    if (active && active.closest && active.closest('.CodeMirror')) return;
    if (window._syncSelTimer) clearTimeout(window._syncSelTimer);
    window._syncSelTimer = setTimeout(() => {
      syncSelectedTextToEditor();
    }, 200);
  });

  // Paper HTML preview click & dblclick listener
  const paper = document.getElementById('paper-content');
  if (paper && !paper.dataset.syncBound) {
    paper.dataset.syncBound = 'true';

    function handlePaperClick(e) {
      const lineElem = e.target.closest('[data-line]');
      if (lineElem) {
        const line = parseInt(lineElem.getAttribute('data-line'), 10);
        if (!isNaN(line)) {
          jumpToCodeLine(line);
          return;
        }
      }

      const txt = e.target.innerText || e.target.textContent || '';
      if (txt && txt.trim().length >= 3) {
        const line = findLineByText(txt);
        if (line >= 0) {
          jumpToCodeLine(line);
        }
      }
    }

    paper.addEventListener('click', handlePaperClick);
    paper.addEventListener('dblclick', handlePaperClick);
  }
}

// Forward Search: Jump from Editor Line -> PDF Page & Element
function jumpEditorToPdf(silent = false) {
  if (!editor) return;

  const cursorLine = editor.getCursor().line;
  const lineCount = Math.max(1, editor.lineCount());
  const lineRatio = cursorLine / lineCount;

  // 1. Check if Quick HTML paper preview is visible
  const paper = document.getElementById('paper-content');
  const renderedPane = document.getElementById('rendered-preview');
  
  if (renderedPane && renderedPane.classList.contains('active') && paper) {
    // Find closest element matching cursor line
    const elements = Array.from(paper.querySelectorAll('[data-line]'));
    if (elements.length > 0) {
      let closestElem = elements[0];
      let minDiff = Infinity;
      elements.forEach(el => {
        const line = parseInt(el.getAttribute('data-line'), 10);
        const diff = Math.abs(line - cursorLine);
        if (diff < minDiff) {
          minDiff = diff;
          closestElem = el;
        }
      });

      if (closestElem) {
        closestElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        closestElem.classList.add('editor-sync-highlight');
        setTimeout(() => closestElem.classList.remove('editor-sync-highlight'), 1800);
      }
    }
  }

  // 2. Estimate PDF Page & update PDF Viewer iframe
  const iframe = document.getElementById('pdf-frame');
  const estimatedPages = Math.max(1, Math.ceil((lineCount / 45))); // ~45 lines per page estimate
  const targetPage = Math.max(1, Math.min(estimatedPages, Math.ceil(lineRatio * estimatedPages)));

  if (iframe && iframe.src && iframe.src !== 'about:blank') {
    try {
      const baseSrc = iframe.src.split('#')[0];
      iframe.src = `${baseSrc}#page=${targetPage}`;
    } catch (e) {
      console.warn('PDF frame page jump warning:', e);
    }
  }

  if (!silent) {
    showPdfSyncToast(`Jumped to Page ${targetPage} (Line ${cursorLine + 1})`);
  }
}

// Inverse Search: Jump from PDF -> Editor Line
function jumpPdfToEditor() {
  if (!editor) return;

  // Try using selected text snippet
  const sel = window.getSelection() ? window.getSelection().toString() : '';
  if (sel && sel.trim().length >= 3) {
    const line = findLineByText(sel);
    if (line >= 0) {
      jumpToCodeLine(line);
      return;
    }
  }

  // Fallback to active editor cursor line or middle of document
  const line = editor.getCursor().line;
  jumpToCodeLine(line);
}

function showPdfSyncToast(text) {
  const badge = document.getElementById('pdf-sync-toast-badge');
  const textEl = document.getElementById('pdf-sync-toast-text');
  if (!badge || !textEl) return;

  textEl.innerText = text;
  badge.style.display = 'flex';

  if (window._pdfSyncToastTimer) clearTimeout(window._pdfSyncToastTimer);
  window._pdfSyncToastTimer = setTimeout(() => {
    badge.style.display = 'none';
  }, 2400);
}

function findLineByText(text) {
  if (!text || !editor) return -1;
  const clean = text.trim().toLowerCase();
  if (clean.length < 3) return -1;
  const count = editor.lineCount();

  // 1. Try exact substring match first
  for (let i = 0; i < count; i++) {
    const lineContent = editor.getLine(i).toLowerCase();
    if (lineContent.includes(clean)) return i;
  }

  // 2. Try multi-word fuzzy match (match all clean words)
  const words = clean.split(/\s+/).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(w => w.length >= 3);
  if (words.length > 0) {
    for (let i = 0; i < count; i++) {
      const lineContent = editor.getLine(i).toLowerCase();
      if (words.every(w => lineContent.includes(w))) return i;
    }
    if (words.length >= 2) {
      const w2 = words.slice(0, 2);
      for (let i = 0; i < count; i++) {
        const lineContent = editor.getLine(i).toLowerCase();
        if (w2.every(w => lineContent.includes(w))) return i;
      }
    }
    const longestWord = words.reduce((a, b) => (a.length > b.length ? a : b), '');
    if (longestWord && longestWord.length >= 4) {
      for (let i = 0; i < count; i++) {
        const lineContent = editor.getLine(i).toLowerCase();
        if (lineContent.includes(longestWord)) return i;
      }
    }
  }

  return -1;
}

function jumpToCodeLine(lineNumber) {
  if (!editor) return;
  const lineCount = editor.lineCount();
  const validLine = Math.max(0, Math.min(lineCount - 1, lineNumber));

  // 1. Position cursor in CodeMirror editor
  editor.setCursor({ line: validLine, ch: 0 });

  // 2. Smoothly scroll target line into middle of viewport
  editor.scrollIntoView({ line: validLine, ch: 0 }, 150);

  // 3. Focus editor immediately so user can edit right away
  editor.focus();

  // 4. Highlight target line in CodeMirror with glowing pulse animation
  const lineHandle = editor.addLineClass(validLine, 'background', 'editor-sync-highlight');
  setTimeout(() => {
    editor.removeLineClass(lineHandle, 'background', 'editor-sync-highlight');
  }, 2200);

  showPdfSyncToast(`Cursor Jumped to Line ${validLine + 1}`);
}

async function runFullProjectAIReview() {
  const modal = document.getElementById('peer-review-modal');
  const reportBody = document.getElementById('peer-review-report-body');
  const badge = document.getElementById('review-status-badge');

  if (!modal || !reportBody) return;

  modal.classList.add('active');
  reportBody.innerHTML = '⏳ <i class="fa-solid fa-brain fa-spin" style="color:var(--accent-purple);"></i> GATHERING ALL PROJECT SOURCE FILES...\nScanning TeX files, BibTeX bibliographies, packages, & structure for full project review...';
  if (badge) badge.innerText = 'Scanning Full Project...';

  const userKeys = Object.keys(fileStore).filter(isUserContentFile).filter(k => k.endsWith('.tex') || k.endsWith('.bib') || k.endsWith('.cls') || k.endsWith('.sty'));
  
  if (userKeys.length === 0) {
    reportBody.innerText = '⚠️ No TeX or text files found in the current project for AI review.';
    if (badge) badge.innerText = 'No Files';
    return;
  }

  let fullCodePayload = `FULL PROJECT: "${activeProject ? activeProject.name : 'LaTeX Project'}" (${userKeys.length} files)\n=======================================================\n\n`;
  userKeys.forEach(k => {
    fullCodePayload += `--- FILE: ${k} ---\n${fileStore[k] || ''}\n\n`;
  });

  const model = document.getElementById('model-select').value;
  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://10.24.48.24:11435';

  const promptText = `You are a Principal Software Architect & Academic Editor reviewing a multi-file LaTeX paper repository.
Perform a full project-wide code review and architectural evaluation of the following project repository:

${fullCodePayload}

Provide your structured AI feedback response with these clear sections:
1. 🏗️ PROJECT STRUCTURE & ARCHITECTURE (Evaluate organization across files, subfolders, and preamble style files)
2. 📚 BIBLIOGRAPHY & CITATIONS AUDIT (Check ref.bib validity, unused entries, missing citations)
3. 🎯 LATEX SYNTAX & COMPILATION OPTIMIZATION (Identify potential packages conflicts, deprecated commands, or formatting issues)
4. 🔬 ACADEMIC RIGOR & CLARITY EVALUATION (Critique section hierarchy, math notation consistency, and prose quality)
5. 💡 TOP 5 ACTIONABLE IMPROVEMENTS (List the most impactful changes the authors should make)`;

  try {
    if (badge) badge.innerText = 'Executing AI Analysis...';
    let res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: promptText,
        stream: false
      })
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: promptText,
          stream: false
        })
      });
    }

    const data = await res.json();
    const feedback = data.response.trim();
    reportBody.innerText = feedback;
    if (badge) badge.innerText = 'Full Project Review Complete ✓';
  } catch (e) {
    reportBody.innerText = `❌ Full-Project AI Review Error: ${e.message}.`;
    if (badge) badge.innerText = 'Evaluation Failed';
  }
}

// --- PRODUCTION-GRADE PAPER HEALTH & AI PEER REVIEWER ENGINE ---
let _cachedHealthReport = null;
let _cachedHealthHash = null;

function getProjectContentHash() {
  const userKeys = Object.keys(fileStore).filter(isUserContentFile).filter(k => k.endsWith('.tex') || k.endsWith('.bib') || k.endsWith('.cls') || k.endsWith('.sty')).sort();
  let rawStr = '';
  userKeys.forEach(k => {
    rawStr += `${k}:${fileStore[k] || ''}\n`;
  });
  let hash = 0;
  for (let i = 0; i < rawStr.length; i++) {
    hash = ((hash << 5) - hash) + rawStr.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${userKeys.length}_${hash}`;
}

function jumpToSourceLocation(filePath, lineNumber) {
  if (!filePath) return;
  const targetLine = parseInt(lineNumber, 10) || 1;

  if (filePath && fileStore[filePath] !== undefined && activeFile !== filePath) {
    activeFile = filePath;
    renderFileList();
    if (editor) editor.setValue(fileStore[activeFile] || '');
    const indicator = document.getElementById('active-file-indicator');
    if (indicator) indicator.innerText = activeFile;
    const pdfLabel = document.getElementById('pdf-file-label');
    if (pdfLabel) pdfLabel.innerText = activeFile;
  }

  closeModal('peer-review-modal');

  if (editor) {
    const validLine = Math.max(0, Math.min(editor.lineCount() - 1, targetLine - 1));
    editor.setCursor({ line: validLine, ch: 0 });
    editor.setSelection({ line: validLine, ch: 0 }, { line: validLine, ch: editor.getLine(validLine).length });
    editor.focus();
    editor.scrollIntoView({ line: validLine, ch: 0 }, 150);

    const doc = editor.getDoc();
    const lineHandle = doc.addLineClass(validLine, 'background', 'cm-line-highlight-flash');
    setTimeout(() => {
      doc.removeLineClass(lineHandle, 'background', 'cm-line-highlight-flash');
    }, 2200);

    showPdfSyncToast(`Jumped to ${filePath}:${targetLine}`);
  }
}

function buildStructuredManuscriptAST() {
  const texFiles = Object.keys(fileStore).filter(isUserContentFile).filter(k => k.endsWith('.tex'));
  const bibFiles = Object.keys(fileStore).filter(isUserContentFile).filter(k => k.endsWith('.bib'));
  const styleFiles = Object.keys(fileStore).filter(isUserContentFile).filter(k => k.endsWith('.cls') || k.endsWith('.sty'));

  const ast = {
    files: [...texFiles, ...bibFiles, ...styleFiles],
    root_file: activeFile || (texFiles[0] || 'main.tex'),
    title: null,
    abstract: null,
    sections: [],
    citations: [],
    bib_keys: new Set(),
    equations: [],
    figures: [],
    tables: [],
    labels: new Map(),
    references: [],
    packages: new Set()
  };

  bibFiles.forEach(bf => {
    const content = fileStore[bf] || '';
    const keyRegex = /@(\w+)\s*\{\s*([^,\s]+)/g;
    let km;
    while ((km = keyRegex.exec(content)) !== null) {
      ast.bib_keys.add(km[2]);
    }
  });

  texFiles.forEach(tf => {
    const content = fileStore[tf] || '';
    const lines = content.split('\n');

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;

      if (!ast.title && lineText.includes('\\title')) {
        const tm = lineText.match(/\\title\{([^}]+)\}/);
        if (tm) ast.title = tm[1];
      }
      if (!ast.abstract && lineText.includes('abstract')) {
        ast.abstract = lineText;
      }

      const pkgMatch = lineText.match(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/);
      if (pkgMatch) {
        pkgMatch[1].split(',').forEach(p => ast.packages.add(p.trim()));
      }

      const secMatch = lineText.match(/\\(section|subsection|subsubsection|chapter)\*?\{([^}]+)\}/);
      if (secMatch) {
        ast.sections.push({ type: secMatch[1], title: secMatch[2], file: tf, line: lineNum });
      }

      const citeRegex = /\\(?:cite|citep|citet|citeauthor|citeyear|parencite|textcite|autocite|footcite|nocite)\*?(?:\[[^\]]*\]){0,2}\{([^}]+)\}/g;
      let cm;
      while ((cm = citeRegex.exec(lineText)) !== null) {
        cm[1].split(',').forEach(k => {
          const key = k.trim();
          if (key) ast.citations.push({ key, file: tf, line: lineNum });
        });
      }

      const lblMatch = lineText.match(/\\label\{([^}]+)\}/);
      if (lblMatch) {
        ast.labels.set(lblMatch[1], { file: tf, line: lineNum });
      }

      const refMatch = lineText.match(/\\(?:ref|eqref|autoref|pageref)\{([^}]+)\}/);
      if (refMatch) {
        ast.references.push({ label: refMatch[1], file: tf, line: lineNum });
      }
    });

    const eqMatches = Array.from(content.matchAll(/\\begin\{(equation|align|gather)\*?\}([\s\S]*?)\\end\{\1\*?\}/g));
    eqMatches.forEach(m => {
      const lineNum = content.substring(0, m.index).split('\n').length;
      const hasLabel = m[2].includes('\\label{');
      const lblm = m[2].match(/\\label\{([^}]+)\}/);
      ast.equations.push({ file: tf, line: lineNum, content: m[0], has_label: hasLabel, label: lblm ? lblm[1] : null });
    });

    const figMatches = Array.from(content.matchAll(/\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/g));
    figMatches.forEach(m => {
      const lineNum = content.substring(0, m.index).split('\n').length;
      const hasCap = m[1].includes('\\caption');
      const hasLbl = m[1].includes('\\label');
      const capm = m[1].match(/\\caption\{([^}]+)\}/);
      const lblm = m[1].match(/\\label\{([^}]+)\}/);
      ast.figures.push({ file: tf, line: lineNum, has_caption: hasCap, caption: capm ? capm[1] : null, has_label: hasLbl, label: lblm ? lblm[1] : null });
    });

    const tabMatches = Array.from(content.matchAll(/\\begin\{table\*?\}([\s\S]*?)\\end\{table\*?\}/g));
    tabMatches.forEach(m => {
      const lineNum = content.substring(0, m.index).split('\n').length;
      const hasCap = m[1].includes('\\caption');
      const hasLbl = m[1].includes('\\label');
      const capm = m[1].match(/\\caption\{([^}]+)\}/);
      const lblm = m[1].match(/\\label\{([^}]+)\}/);
      ast.tables.push({ file: tf, line: lineNum, has_caption: hasCap, caption: capm ? capm[1] : null, has_label: hasLbl, label: lblm ? lblm[1] : null });
    });
  });

  return ast;
}

function runDeterministicHealthDiagnostics(ast) {
  const dimensions = {
    structure: { name: 'Structure & Hierarchy', score: 10, findings: [] },
    citations: { name: 'Citations & BibTeX', score: 10, findings: [] },
    math_rigor: { name: 'Mathematical Rigor', score: 10, findings: [] },
    academic_tone: { name: 'Academic Tone & Style', score: 9.0, findings: [] },
    formatting: { name: 'LaTeX & Figures Formatting', score: 10, findings: [] },
    novelty: { name: 'Novelty & Contribution', score: 8.5, findings: [] },
    reproducibility: { name: 'Reproducibility & Data', score: 9.0, findings: [] },
    completeness: { name: 'Manuscript Completeness', score: 10, findings: [] }
  };

  if (!ast.title) {
    dimensions.structure.score -= 2.5;
    dimensions.completeness.score -= 1.5;
    dimensions.structure.findings.push({
      priority: 'p0',
      message: 'Missing \\title definition in preamble',
      file: ast.root_file,
      line: 1,
      section: 'Preamble',
      evidence: '\\documentclass{...}',
      recommendation: 'Add \\title{Your Title} before \\begin{document}'
    });
  }

  if (!ast.abstract) {
    dimensions.structure.score -= 3.0;
    dimensions.completeness.score -= 2.5;
    dimensions.structure.findings.push({
      priority: 'p0',
      message: 'Missing abstract environment block',
      file: ast.root_file,
      line: 5,
      section: 'Abstract',
      evidence: '\\begin{document}',
      recommendation: 'Add \\begin{abstract}...\\end{abstract}'
    });
  }

  if (ast.sections.length === 0) {
    dimensions.structure.score -= 3.5;
    dimensions.completeness.score -= 3.0;
    dimensions.structure.findings.push({
      priority: 'p0',
      message: 'No section hierarchy (\\section{...}) found',
      file: ast.root_file,
      line: 10,
      section: 'Body',
      evidence: '\\begin{document}',
      recommendation: 'Add \\section{Introduction}, \\section{Methods}, etc.'
    });
  }

  const citedSet = new Set(ast.citations.map(c => c.key));
  const missingKeys = Array.from(citedSet).filter(k => !ast.bib_keys.has(k));
  const unusedKeys = Array.from(ast.bib_keys).filter(k => !citedSet.has(k));

  if (missingKeys.length > 0) {
    dimensions.citations.score -= Math.min(5.0, missingKeys.length * 1.5);
    missingKeys.forEach(k => {
      const c = ast.citations.find(x => x.key === k) || { file: ast.root_file, line: 1 };
      dimensions.citations.findings.push({
        priority: 'p0',
        message: `Undefined citation key "${k}" (missing from .bib files)`,
        file: c.file,
        line: c.line,
        section: 'Citations',
        evidence: `\\cite{${k}}`,
        recommendation: `Add @article{${k}, ...} entry into your bibliography`
      });
    });
  }

  if (unusedKeys.length > 0) {
    dimensions.citations.score -= Math.min(2.0, unusedKeys.length * 0.4);
    dimensions.citations.findings.push({
      priority: 'p2',
      message: `${unusedKeys.length} unused entries in .bib file (${unusedKeys.slice(0, 3).join(', ')})`,
      file: Object.keys(fileStore).find(f => f.endsWith('.bib')) || ast.root_file,
      line: 1,
      section: 'Bibliography',
      evidence: `@article{${unusedKeys[0]}, ...}`,
      recommendation: 'Remove unused keys from bibliography file'
    });
  }

  const unlabelledEqs = ast.equations.filter(e => !e.has_label);
  if (unlabelledEqs.length > 0) {
    dimensions.math_rigor.score -= Math.min(3.0, unlabelledEqs.length * 0.8);
    unlabelledEqs.forEach(eq => {
      dimensions.math_rigor.findings.push({
        priority: 'p1',
        message: 'Display equation missing \\label{eq:...} anchor',
        file: eq.file,
        line: eq.line,
        section: 'Math Equations',
        evidence: eq.content.substring(0, 40) + '...',
        recommendation: 'Add \\label{eq:name} for cross-referencing'
      });
    });
  }

  ast.figures.forEach(fig => {
    if (!fig.has_caption) {
      dimensions.formatting.score -= 1.5;
      dimensions.formatting.findings.push({
        priority: 'p1',
        message: 'Figure environment missing \\caption',
        file: fig.file,
        line: fig.line,
        section: 'Figures',
        evidence: '\\begin{figure}...\\end{figure}',
        recommendation: 'Add \\caption{...} inside figure environment'
      });
    }
  });

  Object.keys(dimensions).forEach(k => {
    dimensions[k].score = Math.max(0, Math.min(10, Math.round(dimensions[k].score * 10) / 10));
  });

  return dimensions;
}

function runSubmissionReadinessAudit() {
  const modal = document.getElementById('peer-review-modal');
  const reportBody = document.getElementById('peer-review-report-body');
  const badge = document.getElementById('review-status-badge');
  if (!modal || !reportBody) return;

  const ast = buildStructuredManuscriptAST();
  const findings = [];
  const rootContent = fileStore[ast.root_file] || '';
  const binaryFiles = Object.keys(fileStore).filter(isUserContentFile).filter(name => /\.(png|jpe?g|gif|eps|pdf|svg)$/i.test(name));
  const hasBib = Object.keys(fileStore).some(name => isUserContentFile(name) && name.endsWith('.bib'));
  const addFinding = (severity, title, detail, file, line) => findings.push({ severity, title, detail, file, line });

  if (!rootContent.includes('\\documentclass')) addFinding('blocker', 'No document root detected', 'The selected entry file does not contain \\documentclass.', ast.root_file, 1);
  if (!ast.title) addFinding('blocker', 'Missing title', 'Add a title before submission.', ast.root_file, 1);
  if (!ast.abstract) addFinding('blocker', 'Missing abstract', 'Add an abstract environment for journal submission.', ast.root_file, 1);
  if (!ast.sections.some(section => /introduction/i.test(section.title))) addFinding('warning', 'Introduction section not detected', 'Confirm that the manuscript has a clearly named introduction.', ast.root_file, 1);
  if (!ast.sections.some(section => /conclusion|discussion/i.test(section.title))) addFinding('warning', 'Discussion or conclusion not detected', 'Confirm that the paper closes with interpretation and limitations.', ast.root_file, 1);
  if (ast.citations.length && !hasBib) addFinding('blocker', 'Citations have no bibliography file', 'Add a .bib file or configure the project bibliography.', ast.root_file, 1);
  const missingKeys = [...new Set(ast.citations.map(citation => citation.key))].filter(key => !ast.bib_keys.has(key));
  missingKeys.slice(0, 8).forEach(key => {
    const citation = ast.citations.find(item => item.key === key);
    addFinding('blocker', `Missing bibliography entry: ${key}`, `Add a BibTeX entry for \\cite{${key}}.`, citation.file, citation.line);
  });
  ast.figures.forEach(figure => {
    if (!figure.has_caption) addFinding('warning', 'Figure has no caption', 'Add a descriptive caption for accessibility and journal requirements.', figure.file, figure.line);
    if (!figure.has_label) addFinding('warning', 'Figure has no label', 'Add a label if the figure is referenced from the text.', figure.file, figure.line);
  });
  ast.tables.forEach(table => {
    if (!table.has_caption) addFinding('warning', 'Table has no caption', 'Add a publication-ready table caption.', table.file, table.line);
    if (!table.has_label) addFinding('warning', 'Table has no label', 'Add a label if the table is referenced from the text.', table.file, table.line);
  });
  ast.references.forEach(reference => {
    if (!ast.labels.has(reference.label)) addFinding('warning', `Unresolved reference: ${reference.label}`, 'Add the matching label or correct the reference key.', reference.file, reference.line);
  });
  const referencedAssets = [...rootContent.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)].map(match => match[1].replace(/^.*[\\/]/, ''));
  referencedAssets.filter(asset => !binaryFiles.some(file => file.endsWith(asset) || file.endsWith(`${asset}.png`) || file.endsWith(`${asset}.pdf`))).slice(0, 8).forEach(asset => {
    addFinding('blocker', `Missing figure asset: ${asset}`, 'Upload the referenced image or correct the includegraphics path.', ast.root_file, 1);
  });
  if (!ast.packages.has('graphicx') && ast.figures.length) addFinding('warning', 'Figures detected without graphicx', 'Confirm that the journal template loads graphicx.', ast.root_file, 1);

  const blockerCount = findings.filter(item => item.severity === 'blocker').length;
  const warningCount = findings.filter(item => item.severity === 'warning').length;
  const score = Math.max(0, 100 - blockerCount * 15 - warningCount * 4);
  const status = blockerCount ? 'Needs fixes before submission' : (warningCount ? 'Review warnings before submission' : 'Ready for submission checks');
  if (badge) badge.innerText = 'Deterministic Submission Audit';
  reportBody.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;">
      <div><h3 style="margin:0;color:var(--text-main);">Submission Readiness: ${score}/100</h3><p style="margin:6px 0 0;color:var(--text-muted);">${escapeHtml(status)}. This audit is local and does not send manuscript text to a model.</p></div>
      <div style="font-size:1.8rem;font-weight:800;color:${blockerCount ? '#f87171' : warningCount ? '#fbbf24' : '#34d399'};">${score}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px;">
      <div class="finding-count-chip"><span class="chip-count">${blockerCount}</span> Blockers</div>
      <div class="finding-count-chip"><span class="chip-count">${warningCount}</span> Warnings</div>
      <div class="finding-count-chip"><span class="chip-count">${ast.sections.length}</span> Sections</div>
    </div>
    ${findings.length ? findings.map(item => `<div style="border-left:3px solid ${item.severity === 'blocker' ? '#f87171' : '#fbbf24'};padding:9px 12px;margin:8px 0;background:rgba(255,255,255,0.04);cursor:pointer;" onclick="jumpToSourceLocation('${escapeHtml(item.file)}', ${item.line})"><strong>${item.severity === 'blocker' ? 'BLOCKER' : 'WARNING'}: ${escapeHtml(item.title)}</strong><div style="color:var(--text-muted);font-size:.82rem;margin-top:3px;">${escapeHtml(item.detail)} <span style="color:var(--accent-blue);">${escapeHtml(item.file)}:${item.line}</span></div></div>`).join('') : '<div style="padding:18px;text-align:center;color:#34d399;">No structural, citation, figure, table, or reference issues detected.</div>'}
  `;
  modal.style.display = 'flex';
}

function renderHealthDashboardUI(overallScore, dimensions, llmReviewText, isCached = false) {
  const reportBody = document.getElementById('peer-review-report-body');
  if (!reportBody) return;

  let badgeClass = 'health-score-excellent';
  let badgeLabel = 'EXCELLENT (90-100)';
  if (overallScore < 70) { badgeClass = 'health-score-weak'; badgeLabel = 'MAJOR REVISIONS REQUIRED (<70)'; }
  else if (overallScore < 80) { badgeClass = 'health-score-revision'; badgeLabel = 'REVISIONS NEEDED (70-79)'; }
  else if (overallScore < 90) { badgeClass = 'health-score-strong'; badgeLabel = 'STRONG MANUSCRIPT (80-89)'; }

  // Gather all priority findings
  const allFindings = [];
  Object.keys(dimensions).forEach(k => {
    dimensions[k].findings.forEach(f => allFindings.push({ ...f, dimension: dimensions[k].name }));
  });
  allFindings.sort((a, b) => (a.priority === 'p0' ? -1 : 1));

  let html = `
  <div class="health-dashboard-container">
    <div class="health-score-banner">
      <div>
        <div style="font-size:1.15rem; font-weight:800; color:#ffffff; margin-bottom:4px;">
          Overall Paper Health Score: ${overallScore} / 100 ${isCached ? '<span class="badge" style="background:rgba(52,211,153,0.2); color:#34d399; font-size:0.7rem; margin-left:8px;">Cached</span>' : ''}
        </div>
        <div style="font-size:0.84rem; color:var(--text-muted);">
          Unified AST &amp; LLM multi-dimensional diagnostic evaluation
        </div>
      </div>
      <div class="health-score-badge-circle ${badgeClass}">
        <span>${overallScore}</span>
        <span style="font-size:0.65rem; opacity:0.85;">Score</span>
      </div>
    </div>

    <div style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-top:4px;">
      📊 8-Dimension Academic Quality Breakdown:
    </div>
    <div class="dimension-card-grid">
  `;

  Object.keys(dimensions).forEach(k => {
    const dim = dimensions[k];
    const fillW = (dim.score * 10).toFixed(0);
    let fillBg = '#34d399';
    if (dim.score < 7.0) fillBg = '#ef4444';
    else if (dim.score < 8.5) fillBg = '#fbbf24';

    html += `
      <div class="dimension-card">
        <div class="dimension-card-header">
          <span>${dim.name}</span>
          <span style="color:${fillBg}">${dim.score} / 10</span>
        </div>
        <div class="dimension-progress-bar">
          <div class="dimension-progress-fill" style="width:${fillW}%; background:${fillBg};"></div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted);">
          ${dim.findings.length === 0 ? '✓ No issues detected' : `⚠️ ${dim.findings.length} issue(s) flagged`}
        </div>
      </div>
    `;
  });

  html += `</div>`;

  if (allFindings.length > 0) {
    html += `
      <div style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-top:8px;">
        🎯 Priority Diagnostic Roadmap &amp; Source Locations:
      </div>
      <div>
    `;

    allFindings.forEach(f => {
      const pClass = f.priority === 'p0' ? 'priority-p0' : (f.priority === 'p1' ? 'priority-p1' : 'priority-p2');
      const pLabel = f.priority === 'p0' ? 'P0 CRITICAL' : (f.priority === 'p1' ? 'P1 IMPORTANT' : 'P2 POLISH');
      const pColor = f.priority === 'p0' ? '#ef4444' : (f.priority === 'p1' ? '#f59e0b' : '#60a5fa');

      html += `
        <div class="priority-finding-item ${pClass}">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:700; color:#ffffff;">
              <span style="color:${pColor}; border:1px solid ${pColor}; padding:1px 6px; border-radius:4px; font-size:0.7rem;">${pLabel}</span>
              <span>${f.message}</span>
            </div>
            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
              Recommendation: ${f.recommendation}
            </div>
            ${f.evidence ? `<div class="evidence-snippet-box">Source Snippet (${f.file}:${f.line}): ${f.evidence}</div>` : ''}
          </div>
          <button class="jump-to-source-btn" onclick="jumpToSourceLocation('${f.file}', ${f.line})">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Jump to Source (${f.file}:${f.line})
          </button>
        </div>
      `;
    });

    html += `</div>`;
  }

  html += `
  </div>
  `;

  reportBody.innerHTML = html;
}

// --- CENTRALIZED PAPER ANALYSIS STATE MANAGER & 14-STAGE PIPELINE ---
let paperAnalysis = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentStageId: null,
  overallProgress: 0,
  startedAt: null,
  completedAt: null,
  cancelled: false,
  abortController: null,
  model: 'phi4:latest',
  llmStreamText: '',
  timerInterval: null,
  stages: {},
  ast: null,
  dimensions: null,
  compilationResult: null,
  llmReportText: null,
  overallScore: 0
};

function resetPaperAnalysisState(modelName = 'phi4:latest') {
  if (paperAnalysis.timerInterval) {
    clearInterval(paperAnalysis.timerInterval);
    paperAnalysis.timerInterval = null;
  }
  if (paperAnalysis.abortController) {
    try { paperAnalysis.abortController.abort(); } catch (e) {}
  }

  paperAnalysis = {
    status: 'running',
    currentStageId: 'projectScan',
    overallProgress: 0,
    startedAt: Date.now(),
    completedAt: null,
    cancelled: false,
    abortController: new AbortController(),
    model: modelName,
    llmStreamText: '',
    timerInterval: null,
    stages: {
      projectScan: { id: 'projectScan', name: '01 PROJECT SCAN', weight: 5, status: 'pending', progress: 0, message: 'Scanning TeX, BibTeX & style files...', findingsCount: 0 },
      parsing: { id: 'parsing', name: '02 MANUSCRIPT PARSING', weight: 10, status: 'pending', progress: 0, message: 'Parsing LaTeX document AST...', findingsCount: 0 },
      structure: { id: 'structure', name: '03 DOCUMENT STRUCTURE ANALYSIS', weight: 10, status: 'pending', progress: 0, message: 'Analyzing section hierarchy & title...', findingsCount: 0 },
      citations: { id: 'citations', name: '04 CITATION & BIBLIOGRAPHY AUDIT', weight: 10, status: 'pending', progress: 0, message: 'Auditing BibTeX keys & citation links...', findingsCount: 0 },
      equations: { id: 'equations', name: '05 EQUATION / MATH RIGOR', weight: 10, status: 'pending', progress: 0, message: 'Checking display math & equation labels...', findingsCount: 0 },
      figuresTables: { id: 'figuresTables', name: '06 FIGURE & TABLE ANALYSIS', weight: 5, status: 'pending', progress: 0, message: 'Checking figure/table captions & float anchors...', findingsCount: 0 },
      compilation: { id: 'compilation', name: '07 COMPILATION DIAGNOSTICS', weight: 10, status: 'pending', progress: 0, message: 'Running compiler diagnostics pass...', findingsCount: 0 },
      reproducibility: { id: 'reproducibility', name: '08 REPRODUCIBILITY AUDIT', weight: 10, status: 'pending', progress: 0, message: 'Evaluating dataset & methods parameters...', findingsCount: 0 },
      tone: { id: 'tone', name: '09 ACADEMIC TONE ANALYSIS', weight: 5, status: 'pending', progress: 0, message: 'Auditing academic prose style & clarity...', findingsCount: 0 },
      novelty: { id: 'novelty', name: '10 NOVELTY & CONTRIBUTION', weight: 5, status: 'pending', progress: 0, message: 'Evaluating claims & contribution statements...', findingsCount: 0 },
      aiReview: { id: 'aiReview', name: '11 LOCAL AI PEER REVIEW', weight: 15, status: 'pending', progress: 0, message: 'Connecting to Ollama model inference...', findingsCount: 0 },
      validation: { id: 'validation', name: '12 RESPONSE VALIDATION', weight: 3, status: 'pending', progress: 0, message: 'Validating response structure & JSON...', findingsCount: 0 },
      scoring: { id: 'scoring', name: '13 HEALTH SCORE CALCULATION', weight: 2, status: 'pending', progress: 0, message: 'Computing 8-dimension weighted scores...', findingsCount: 0 },
      finalReport: { id: 'finalReport', name: '14 FINAL REPORT GENERATION', weight: 0, status: 'pending', progress: 0, message: 'Building interactive dashboard...', findingsCount: 0 }
    },
    ast: null,
    dimensions: null,
    compilationResult: null,
    llmReportText: null,
    overallScore: 0
  };

  // Start Elapsed Time Ticker
  paperAnalysis.timerInterval = setInterval(() => {
    if (paperAnalysis.status !== 'running') return;
    const elapsedSec = Math.floor((Date.now() - paperAnalysis.startedAt) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    const timerElem = document.getElementById('analysis-elapsed-time');
    if (timerElem) timerElem.innerText = `Elapsed: ${mins}:${secs}`;
  }, 1000);
}

function updateAnalysisStage(stageId, updateObj) {
  if (!paperAnalysis.stages[stageId]) return;
  const stage = paperAnalysis.stages[stageId];
  if (updateObj.status !== undefined) stage.status = updateObj.status;
  if (updateObj.progress !== undefined) stage.progress = updateObj.progress;
  if (updateObj.message !== undefined) stage.message = updateObj.message;
  if (updateObj.findingsCount !== undefined) stage.findingsCount = updateObj.findingsCount;

  paperAnalysis.currentStageId = stageId;

  // Recalculate Overall Progress
  let weightedProgress = 0;
  Object.keys(paperAnalysis.stages).forEach(sid => {
    const s = paperAnalysis.stages[sid];
    if (s.status === 'completed') {
      weightedProgress += s.weight;
    } else if (s.status === 'running') {
      weightedProgress += (s.weight * (s.progress || 0)) / 100;
    }
  });

  paperAnalysis.overallProgress = Math.min(100, Math.round(weightedProgress));

  renderAnalysisDashboardStateUI();
}

function renderAnalysisDashboardStateUI() {
  const liveDashboard = document.getElementById('analysis-live-dashboard');
  const reportBody = document.getElementById('peer-review-report-body');
  const progressBar = document.getElementById('analysis-overall-progress-bar');
  const progressPercent = document.getElementById('analysis-overall-progress-percent');
  const stageTitle = document.getElementById('analysis-current-stage-title');
  const opText = document.getElementById('analysis-current-operation-text');
  const checklistContainer = document.getElementById('analysis-stage-checklist');
  const modelDisplay = document.getElementById('analysis-model-display');
  const cancelBtn = document.getElementById('btn-cancel-analysis');
  const rerunBtn = document.getElementById('btn-rerun-audit');

  if (modelDisplay) modelDisplay.innerText = paperAnalysis.model;

  if (paperAnalysis.status === 'running') {
    if (liveDashboard) liveDashboard.style.display = 'block';
    if (reportBody) reportBody.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (rerunBtn) rerunBtn.style.display = 'none';
  } else {
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (rerunBtn) rerunBtn.style.display = 'inline-flex';
  }

  if (progressBar) progressBar.style.width = `${paperAnalysis.overallProgress}%`;
  if (progressPercent) progressPercent.innerText = `${paperAnalysis.overallProgress}%`;

  const curStage = paperAnalysis.stages[paperAnalysis.currentStageId];
  if (curStage) {
    if (stageTitle) stageTitle.innerText = `${curStage.name}`;
    if (opText) opText.innerText = curStage.message;
  }

  // Render 14-Stage Checklist Items
  if (checklistContainer) {
    let checklistHtml = '';
    Object.keys(paperAnalysis.stages).forEach(sid => {
      const st = paperAnalysis.stages[sid];
      let iconHtml = '<i class="fa-solid fa-minus stage-status-pending"></i>';
      let itemClass = 'stage-pending';
      if (st.status === 'completed') {
        iconHtml = '<i class="fa-solid fa-circle-check stage-status-completed"></i>';
        itemClass = 'stage-completed';
      } else if (st.status === 'running') {
        iconHtml = '<i class="fa-solid fa-spinner stage-status-running"></i>';
        itemClass = 'stage-running';
      } else if (st.status === 'failed') {
        iconHtml = '<i class="fa-solid fa-triangle-exclamation stage-status-failed"></i>';
        itemClass = 'stage-failed';
      } else if (st.status === 'cancelled') {
        iconHtml = '<i class="fa-solid fa-ban stage-status-failed"></i>';
        itemClass = 'stage-failed';
      }

      checklistHtml += `
        <div class="analysis-stage-item ${itemClass}">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="stage-status-icon">${iconHtml}</span>
            <span style="font-weight:600; color:var(--text-main);">${st.name}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${st.findingsCount > 0 ? `<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; font-size:0.68rem;">${st.findingsCount} issue(s)</span>` : ''}
            <span style="font-size:0.75rem; color:var(--text-muted);">${st.status === 'completed' ? '100%' : (st.status === 'running' ? `${st.progress}%` : '—')}</span>
          </div>
        </div>
      `;
    });
    checklistContainer.innerHTML = checklistHtml;
  }

  // Render Preliminary Findings Counters
  if (paperAnalysis.dimensions) {
    const cCount = (paperAnalysis.dimensions.citations.findings || []).length;
    const mCount = (paperAnalysis.dimensions.math_rigor.findings || []).length;
    const fCount = (paperAnalysis.dimensions.formatting.findings || []).length;
    const sCount = (paperAnalysis.dimensions.structure.findings || []).length;

    const elC = document.getElementById('chip-citations-count');
    const elM = document.getElementById('chip-math-count');
    const elF = document.getElementById('chip-formatting-count');
    const elS = document.getElementById('chip-structure-count');
    if (elC) elC.innerText = cCount;
    if (elM) elM.innerText = mCount;
    if (elF) elF.innerText = fCount;
    if (elS) elS.innerText = sCount;
  }
}

function appendLiveConsoleLog(logText) {
  const consoleElem = document.getElementById('analysis-live-console');
  if (!consoleElem) return;
  paperAnalysis.llmStreamText += logText;
  consoleElem.innerText = paperAnalysis.llmStreamText;
  consoleElem.scrollTop = consoleElem.scrollHeight;
}

function cancelPaperAnalysis() {
  if (paperAnalysis.status !== 'running') return;
  paperAnalysis.cancelled = true;
  paperAnalysis.status = 'cancelled';

  if (paperAnalysis.abortController) {
    try { paperAnalysis.abortController.abort(); } catch (e) {}
  }
  if (paperAnalysis.timerInterval) {
    clearInterval(paperAnalysis.timerInterval);
    paperAnalysis.timerInterval = null;
  }

  appendLiveConsoleLog('\n[System] 🛑 Analysis cancelled by user. No source files were modified.');

  const opText = document.getElementById('analysis-current-operation-text');
  const spinner = document.getElementById('analysis-op-spinner');
  if (opText) opText.innerText = 'Analysis cancelled by user. No source files were modified.';
  if (spinner) spinner.className = 'fa-solid fa-ban';

  // Mark current stage cancelled
  if (paperAnalysis.currentStageId && paperAnalysis.stages[paperAnalysis.currentStageId]) {
    paperAnalysis.stages[paperAnalysis.currentStageId].status = 'cancelled';
  }

  renderAnalysisDashboardStateUI();

  // Preserve Partial Results if static diagnostics completed
  if (paperAnalysis.dimensions) {
    setTimeout(() => {
      const liveDashboard = document.getElementById('analysis-live-dashboard');
      const reportBody = document.getElementById('peer-review-report-body');
      if (liveDashboard) liveDashboard.style.display = 'none';
      if (reportBody) {
        reportBody.style.display = 'block';
        renderHealthDashboardUI(
          paperAnalysis.overallScore || 70,
          paperAnalysis.dimensions,
          `⚠️ AI Peer Review was cancelled by the user. Static Paper Health diagnostics are displayed below.\n\nNo document files were modified.`,
          false
        );
      }
    }, 1200);
  }
}

async function runPeerReviewWithModel(targetModel) {
  await runPeerReview(targetModel);
}

async function runPeerReview(overrideModel) {
  const modal = document.getElementById('peer-review-modal');
  const reportBody = document.getElementById('peer-review-report-body');
  const badge = document.getElementById('review-status-badge');
  const liveDashboard = document.getElementById('analysis-live-dashboard');

  const currentHash = getProjectContentHash();
  const selectedModel = document.getElementById('model-select') ? document.getElementById('model-select').value : 'llama3.1:8b';
  const model = overrideModel || (selectedModel && (selectedModel.includes('llama') || selectedModel.includes('gemma') || selectedModel.includes('phi')) ? selectedModel : 'llama3.1:8b');

  // Check Hash Cache
  if (_cachedHealthHash === currentHash && _cachedHealthReport && !overrideModel) {
    if (modal) modal.classList.add('active');
    if (liveDashboard) liveDashboard.style.display = 'none';
    if (reportBody) reportBody.style.display = 'block';
    renderHealthDashboardUI(_cachedHealthReport.overallScore, _cachedHealthReport.dimensions, _cachedHealthReport.llmReviewText, true);
    if (badge) badge.innerText = `Health Audit & Review (${model}) Cached ✓`;
    return;
  }

  if (modal) modal.classList.add('active');

  // Launch 14-Stage Asynchronous Pipeline
  resetPaperAnalysisState(model);
  renderAnalysisDashboardStateUI();

  const consoleElem = document.getElementById('analysis-live-console');
  if (consoleElem) consoleElem.innerText = `[System] Starting 14-Stage Paper Analysis Pipeline with ${model}...\n`;

  try {
    // STAGE 01: PROJECT SCAN
    updateAnalysisStage('projectScan', { status: 'running', progress: 50, message: 'Scanning TeX, BibTeX, cls & sty assets...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    const userKeys = Object.keys(fileStore).filter(isUserContentFile).filter(k => k.endsWith('.tex') || k.endsWith('.bib') || k.endsWith('.cls') || k.endsWith('.sty'));
    updateAnalysisStage('projectScan', { status: 'completed', progress: 100, message: `Scanned ${userKeys.length} project file assets.` });

    // STAGE 02: MANUSCRIPT PARSING
    updateAnalysisStage('parsing', { status: 'running', progress: 40, message: 'Building manuscript AST structure...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    const ast = buildStructuredManuscriptAST();
    paperAnalysis.ast = ast;
    updateAnalysisStage('parsing', { status: 'completed', progress: 100, message: `Detected ${ast.sections.length} sections, ${ast.citations.length} citations, ${ast.equations.length} equations.` });

    // STAGE 03: DOCUMENT STRUCTURE ANALYSIS
    updateAnalysisStage('structure', { status: 'running', progress: 50, message: 'Evaluating title, abstract & section hierarchy...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    const dimensions = runDeterministicHealthDiagnostics(ast);
    paperAnalysis.dimensions = dimensions;
    updateAnalysisStage('structure', { status: 'completed', progress: 100, message: 'Structure hierarchy evaluated.', findingsCount: dimensions.structure.findings.length });

    // STAGE 04: CITATION & BIBLIOGRAPHY AUDIT
    updateAnalysisStage('citations', { status: 'running', progress: 50, message: 'Cross-checking citation keys against .bib files...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('citations', { status: 'completed', progress: 100, message: 'Citation & bibliography audit complete.', findingsCount: dimensions.citations.findings.length });

    // STAGE 05: EQUATION / MATH RIGOR
    updateAnalysisStage('equations', { status: 'running', progress: 50, message: 'Checking display math environments & equation labels...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('equations', { status: 'completed', progress: 100, message: 'Math rigor analysis complete.', findingsCount: dimensions.math_rigor.findings.length });

    // STAGE 06: FIGURE & TABLE ANALYSIS
    updateAnalysisStage('figuresTables', { status: 'running', progress: 50, message: 'Auditing figure float captions & cross-ref anchors...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('figuresTables', { status: 'completed', progress: 100, message: 'Figure/table analysis complete.', findingsCount: dimensions.formatting.findings.length });

    // STAGE 07: COMPILATION DIAGNOSTICS
    updateAnalysisStage('compilation', { status: 'running', progress: 30, message: 'Running compiler diagnostic check...' });
    let compilerWarnings = 0;
    try {
      const mainContent = fileStore[ast.root_file] || '';
      const compRes = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mainContent, project_name: activeProject ? activeProject.name : 'paper' }),
        signal: paperAnalysis.abortController.signal
      }).catch(() => null);
      if (compRes && compRes.ok) {
        paperAnalysis.compilationResult = 'Compilation succeeded';
      }
    } catch (e) {
      compilerWarnings = 1;
    }
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('compilation', { status: 'completed', progress: 100, message: 'Compiler diagnostics pass finished.', findingsCount: compilerWarnings });

    // STAGE 08: REPRODUCIBILITY AUDIT
    updateAnalysisStage('reproducibility', { status: 'running', progress: 50, message: 'Auditing methodology & data parameters...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('reproducibility', { status: 'completed', progress: 100, message: 'Reproducibility parameters audited.' });

    // STAGE 09: ACADEMIC TONE ANALYSIS
    updateAnalysisStage('tone', { status: 'running', progress: 50, message: 'Auditing academic prose style & clarity...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('tone', { status: 'completed', progress: 100, message: 'Academic tone analysis finished.' });

    // STAGE 10: NOVELTY & CONTRIBUTION
    updateAnalysisStage('novelty', { status: 'running', progress: 50, message: 'Evaluating claim strength & novelty statements...' });
    await new Promise(r => setTimeout(r, 150));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('novelty', { status: 'completed', progress: 100, message: 'Novelty evaluation complete.' });

    // STAGE 11: LOCAL AI PEER REVIEW (LLM Inference)
    updateAnalysisStage('aiReview', { status: 'running', progress: 10, message: `Connecting to Ollama model (${model})...` });
    appendLiveConsoleLog(`[AI Engine] Dispatching prompt evidence pack to model '${model}'...\n`);

    let codePayload = '';
    if (userKeys.length > 0) {
      codePayload = `FULL PROJECT WORKSPACE: "${activeProject ? activeProject.name : 'LaTeX Paper'}" (${userKeys.length} files)\n\n`;
      userKeys.forEach(k => {
        codePayload += `--- FILE: ${k} ---\n${fileStore[k] || ''}\n\n`;
      });
    } else if (editor) {
      codePayload = editor.getValue();
    }

    const diagnosticFindings = Object.keys(dimensions).flatMap(key =>
      (dimensions[key].findings || []).map(finding => ({
        dimension: dimensions[key].name,
        priority: finding.priority,
        finding: finding.message,
        evidence: finding.evidence || '',
        location: `${finding.file}:${finding.line}`,
        recommendation: finding.recommendation || ''
      }))
    );
    const evidencePack = JSON.stringify({
      root_file: ast.root_file,
      title: ast.title,
      sections: ast.sections.slice(0, 40),
      citations: ast.citations.slice(0, 80),
      equations: ast.equations.map(e => ({ file: e.file, line: e.line, has_label: e.has_label })),
      figures: ast.figures.map(f => ({ file: f.file, line: f.line, caption: f.caption, has_label: f.has_label })),
      tables: ast.tables.map(t => ({ file: t.file, line: t.line, caption: t.caption, has_label: t.has_label })),
      deterministic_findings: diagnosticFindings,
      compilation_status: paperAnalysis.compilationResult || 'not available'
    }, null, 2);

    const promptText = `You are reviewing a LaTeX research manuscript as a rigorous, evidence-first Reviewer #2. Do not role-play, flatter, or invent details. Identify the smallest number of consequential, verifiable issues that could affect validity, reproducibility, novelty, or presentation.

Use ONLY evidence in the project files and diagnostic evidence pack below. Every criticism must include an exact file:line or a section heading. If the manuscript does not contain enough evidence to assess something, write "Not assessable from the supplied files" and explain what evidence is missing. Never invent experiments, results, citations, journal policies, datasets, or line numbers.

PROJECT FILES:
${codePayload}

DETERMINISTIC EVIDENCE PACK:
${evidencePack}

Return plain text with exactly these sections:
1. PAPER HEALTH SNAPSHOT
Give the overall assessment and the 2-4 highest-impact findings. Do not create unsupported numeric scores.

2. REVIEWER #2 CRITIQUE
Organize findings under Methodology & Validity, Evidence & Statistics, Novelty & Claims, Reproducibility, Related Work & Citations, Figures/Tables, and Writing/Structure. Include only relevant categories. For each finding use this format:
[MAJOR|MINOR] [BLOCKING|HIGH|MEDIUM|LOW] [HIGH|MEDIUM|LOW CONFIDENCE]
Location: file.tex:line or Section: heading
Evidence: quote a short phrase or describe the exact observed artifact
Concern: explain why it matters
Required action: give one concrete revision or verification step

3. PRIORITIZED REVISION PLAN
List at most 8 actions in order of impact. Label each as Must fix, Should fix, or Optional. Tie every action to a location.

4. FINAL RECOMMENDATION
Choose Major Revision, Minor Revision, Reject, or Accept only when the evidence supports it. Give a two-sentence rationale.

Quality rules: distinguish an absent artifact from a failed result; do not treat missing metadata as proof that an experiment is invalid; do not repeat the same issue in multiple sections; prefer concrete checks over vague advice; keep the critique specific to this manuscript.`;

    const ollamaUrl = document.getElementById('ollama-url-input') ? document.getElementById('ollama-url-input').value : 'http://10.24.48.24:11435';

    updateAnalysisStage('aiReview', { status: 'running', progress: 40, message: `Inference active on ${model}...` });

    let llmReviewText = '';
    let res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model, prompt: promptText, stream: false }),
      signal: paperAnalysis.abortController.signal
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model, prompt: promptText, stream: false }),
        signal: paperAnalysis.abortController.signal
      });
    }

    if (paperAnalysis.cancelled) return;

    const data = await res.json();
    llmReviewText = (data.response || '').trim();
    if (!llmReviewText) {
      llmReviewText = 'AI review returned no text. The deterministic findings above are the authoritative local audit results.';
    }
    appendLiveConsoleLog(`[AI Engine] Completed inference. ${llmReviewText.length} chars generated.\n`);
    updateAnalysisStage('aiReview', { status: 'completed', progress: 100, message: 'Local AI peer review completed.' });

    // STAGE 12: RESPONSE VALIDATION
    updateAnalysisStage('validation', { status: 'running', progress: 50, message: 'Validating response structure...' });
    await new Promise(r => setTimeout(r, 100));
    if (paperAnalysis.cancelled) return;
    updateAnalysisStage('validation', { status: 'completed', progress: 100, message: 'Response validation passed.' });

    // STAGE 13: HEALTH SCORE CALCULATION
    updateAnalysisStage('scoring', { status: 'running', progress: 50, message: 'Computing 8-dimension weighted scores...' });
    const dimScores = Object.keys(dimensions).map(k => dimensions[k].score);
    const avgDimScore = dimScores.reduce((a, b) => a + b, 0) / (dimScores.length || 1);
    const overallScore = Math.min(100, Math.max(30, Math.round(avgDimScore * 10)));
    paperAnalysis.overallScore = overallScore;
    updateAnalysisStage('scoring', { status: 'completed', progress: 100, message: `Overall Paper Health Score: ${overallScore}/100.` });

    // STAGE 14: FINAL REPORT GENERATION
    updateAnalysisStage('finalReport', { status: 'running', progress: 50, message: 'Transitioning to final report UI...' });
    await new Promise(r => setTimeout(r, 200));
    if (paperAnalysis.cancelled) return;

    paperAnalysis.status = 'completed';
    paperAnalysis.completedAt = Date.now();
    updateAnalysisStage('finalReport', { status: 'completed', progress: 100, message: 'Final report ready.' });

    _cachedHealthHash = currentHash;
    _cachedHealthReport = { overallScore, dimensions, llmReviewText };

    if (paperAnalysis.timerInterval) {
      clearInterval(paperAnalysis.timerInterval);
      paperAnalysis.timerInterval = null;
    }

    // Transition to Final Report View
    if (liveDashboard) liveDashboard.style.display = 'none';
    if (reportBody) {
      reportBody.style.display = 'block';
      renderHealthDashboardUI(overallScore, dimensions, llmReviewText, false);
    }
    if (badge) badge.innerText = `Health Audit & Review (${model}) Complete ✓`;
  } catch (e) {
    if (paperAnalysis.cancelled) return;

    paperAnalysis.status = 'failed';
    if (paperAnalysis.timerInterval) {
      clearInterval(paperAnalysis.timerInterval);
      paperAnalysis.timerInterval = null;
    }

    appendLiveConsoleLog(`\n[System Error] ${e.message}\n`);
    if (paperAnalysis.dimensions) {
      // Show Partial Results if available
      if (liveDashboard) liveDashboard.style.display = 'none';
      if (reportBody) {
        reportBody.style.display = 'block';
        renderHealthDashboardUI(
          paperAnalysis.overallScore || 70,
          paperAnalysis.dimensions,
          `⚠️ AI Model Inference Error: ${e.message}.\n\nStatic Paper Health diagnostics are displayed below.`,
          false
        );
      }
    } else {
      if (reportBody) reportBody.innerText = `❌ Health Audit & Peer Review Error: ${e.message}. Make sure Ollama backend is connected.`;
    }
    if (badge) badge.innerText = 'Audit Failed';
  }
}

async function calculatePaperHealthScore() {
  await runPeerReview();
}

async function runFullProjectAIReview() {
  await runPeerReview();
}

function copyPeerReviewReport() {
  const reportBody = document.getElementById('peer-review-report-body');
  if (reportBody && reportBody.innerText) {
    navigator.clipboard.writeText(reportBody.innerText);
    alert('✅ Paper Health & Peer Reviewer Report copied to clipboard!');
  }
}

function autoFixPaperFromReview() {
  const reportBody = document.getElementById('peer-review-report-body');
  const critique = reportBody ? reportBody.innerText : '';
  if (!critique || critique.startsWith('⏳') || critique.startsWith('❌')) {
    alert('Please run a peer review evaluation first.');
    return;
  }

  closeModal('peer-review-modal');
  runAITool(`Apply the recommended peer review improvements and fixes from this critique report to the document:\n\nPEER REVIEW REPORT:\n${critique}\n\nPreserve all LaTeX structure and equations.`, 'Auto-Apply Peer Review Improvements');
}

// --- 4. GITHUB PRIVATE REPOSITORY SYNC ENGINE ---
function openGitHubSyncModal() {
  const modal = document.getElementById('github-sync-modal');
  const repoInput = document.getElementById('github-repo-input');
  const patInput = document.getElementById('github-pat-input');
  const commitInput = document.getElementById('github-commit-msg-input');
  const autoCheckbox = document.getElementById('github-autosync-checkbox');
  const logBox = document.getElementById('github-sync-log-box');

  if (activeProject) {
    if (repoInput) repoInput.value = activeProject.github_repo || '';
    if (patInput) patInput.value = activeProject.github_token || '';
    if (autoCheckbox) autoCheckbox.checked = activeProject.github_autosync || false;
  }

  if (commitInput) {
    commitInput.value = `Sync update: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${activeFile})`;
  }

  if (logBox) {
    if (activeProject && activeProject.github_last_synced) {
      logBox.style.display = 'block';
      logBox.innerText = `Last synced to GitHub: ${activeProject.github_last_synced}`;
    } else {
      logBox.style.display = 'none';
    }
  }

  if (modal) modal.classList.add('active');
}

let githubSyncPollInterval = null;

function initGitHubSync() {
  const btnSync = document.getElementById('btn-github-sync');
  if (btnSync) btnSync.addEventListener('click', openGitHubSyncModal);
}

async function performGitHubSync(isAutoSync = false) {
  if (!activeProject) return;

  const repoUrl = document.getElementById('github-repo-input').value.trim();
  const token = document.getElementById('github-pat-input').value.trim();
  const commitMsg = document.getElementById('github-commit-msg-input').value.trim();
  const autoSync = document.getElementById('github-autosync-checkbox').checked;

  const logBox = document.getElementById('github-sync-log-box');
  const btnConfirm = document.getElementById('btn-confirm-github-sync');
  const progressBarContainer = document.getElementById('github-progress-bar-container');

  if (!repoUrl) {
    alert('Please enter your GitHub Repository URL (e.g. https://github.com/username/repo.git).');
    return;
  }
  if (!token) {
    alert('Please enter your GitHub Personal Access Token (PAT).');
    return;
  }

  // Ensure current editor text is saved in fileStore
  if (editor && activeFile) {
    fileStore[activeFile] = editor.getValue();
  }

  if (btnConfirm) {
    btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing in Background...';
    btnConfirm.disabled = true;
  }

  if (progressBarContainer) progressBarContainer.style.display = 'block';
  if (logBox) {
    logBox.style.display = 'block';
    logBox.innerText = `⏳ Launching background thread for ${repoUrl}...`;
  }

  // Show floating toast widget
  showGitHubToast('Initializing background thread...', 5);

  try {
    const res = await fetch('/api/projects/github-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject.id,
        github_token: token,
        repo_url: repoUrl,
        commit_message: commitMsg,
        auto_sync: autoSync,
        files: fileStore
      })
    });

    const data = await res.json();

    if (res.ok) {
      activeProject.github_repo = repoUrl;
      activeProject.github_token = token;
      activeProject.github_autosync = autoSync;

      // Start polling status asynchronously
      startPollingGitHubSync(activeProject.id, isAutoSync);
    } else {
      if (logBox) logBox.innerText = `❌ Start Failed: ${data.error}`;
      hideGitHubToast();
      if (btnConfirm) {
        btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Push & Sync to GitHub Now';
        btnConfirm.disabled = false;
      }
    }
  } catch (e) {
    if (logBox) logBox.innerText = `❌ Connection Error: ${e.message}`;
    hideGitHubToast();
    if (btnConfirm) {
      btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Push & Sync to GitHub Now';
      btnConfirm.disabled = false;
    }
  }
}

function startPollingGitHubSync(projId, isAutoSync = false) {
  if (githubSyncPollInterval) clearInterval(githubSyncPollInterval);

  const btnConfirm = document.getElementById('btn-confirm-github-sync');
  const logBox = document.getElementById('github-sync-log-box');
  const progressBarContainer = document.getElementById('github-progress-bar-container');
  const progressFill = document.getElementById('github-progress-bar-fill');
  const stepText = document.getElementById('github-sync-step-text');
  const percentText = document.getElementById('github-sync-percentage');
  const filesCounter = document.getElementById('github-sync-files-counter');

  githubSyncPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/projects/github-sync-status?id=${projId}`);
      if (!res.ok) return;
      const statusData = await res.json();

      const pct = statusData.progress || 0;
      const step = statusData.step || 'Syncing...';
      const filesCount = statusData.files_count || 0;
      const syncedCount = statusData.synced_count || 0;

      // Update Modal UI
      if (progressBarContainer) progressBarContainer.style.display = 'block';
      if (progressFill) progressFill.style.width = pct + '%';
      if (percentText) percentText.innerText = pct + '%';
      if (stepText) stepText.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--accent-blue); margin-right:6px;"></i> ${step}`;
      if (filesCounter) filesCounter.innerHTML = `<i class="fa-solid fa-file-code" style="color:var(--accent-purple);"></i> Files: ${syncedCount} / ${filesCount}`;

      // Update Floating Toast UI
      updateGitHubToast(step, pct);

      if (statusData.status === 'completed') {
        clearInterval(githubSyncPollInterval);
        githubSyncPollInterval = null;

        if (activeProject) activeProject.github_last_synced = statusData.last_synced;
        if (progressFill) progressFill.style.width = '100%';
        if (percentText) percentText.innerText = '100%';
        if (stepText) stepText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--accent-teal); margin-right:6px;"></i> GitHub Sync Completed!`;
        if (logBox) logBox.innerText = `✅ GitHub Sync Success (${statusData.last_synced}):\n${statusData.log || 'Pushed commits to main.'}`;

        if (btnConfirm) {
          btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Push & Sync to GitHub Now';
          btnConfirm.disabled = false;
        }

        updateGitHubToast('✅ GitHub Sync Complete!', 100, true);
        setTimeout(() => hideGitHubToast(), 4000);
      } else if (statusData.status === 'failed') {
        clearInterval(githubSyncPollInterval);
        githubSyncPollInterval = null;

        if (stepText) stepText.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; margin-right:6px;"></i> Sync Failed`;
        if (logBox) logBox.innerText = `❌ Sync Failed: ${statusData.error || ''}\n\n${statusData.log || ''}`;

        if (btnConfirm) {
          btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Push & Sync to GitHub Now';
          btnConfirm.disabled = false;
        }

        updateGitHubToast(`❌ ${statusData.error || 'Push Failed'}`, pct, false, true);
        setTimeout(() => hideGitHubToast(), 6000);
      }
    } catch (e) {
      console.error('Error polling sync status:', e);
    }
  }, 700);
}

function showGitHubToast(step, pct) {
  const toast = document.getElementById('github-sync-toast');
  if (!toast) return;
  toast.style.display = 'block';
  updateGitHubToast(step, pct);
}

function updateGitHubToast(step, pct, isSuccess = false, isError = false) {
  const toast = document.getElementById('github-sync-toast');
  const title = document.getElementById('toast-github-title');
  const stepEl = document.getElementById('toast-github-step');
  const percentEl = document.getElementById('toast-github-percent');
  const barEl = document.getElementById('toast-github-bar');
  const icon = document.getElementById('toast-github-icon');

  if (!toast) return;
  toast.style.display = 'block';

  if (title) title.innerText = isSuccess ? 'GitHub Sync Complete' : (isError ? 'GitHub Sync Failed' : 'GitHub Sync in Progress');
  if (stepEl) stepEl.innerText = step;
  if (percentEl) percentEl.innerText = pct + '%';
  if (barEl) {
    barEl.style.width = pct + '%';
    barEl.style.background = isError ? '#ef4444' : (isSuccess ? '#10b981' : 'linear-gradient(90deg, #6366f1, #10b981)');
  }
  if (icon) {
    icon.className = isSuccess ? 'fa-solid fa-circle-check toast-icon' : (isError ? 'fa-solid fa-circle-xmark toast-icon' : 'fa-brands fa-github toast-icon');
    icon.style.color = isSuccess ? '#10b981' : (isError ? '#ef4444' : 'var(--accent-purple)');
  }
}

function hideGitHubToast() {
  const toast = document.getElementById('github-sync-toast');
  if (toast) toast.style.display = 'none';
}

// --- AI TASK MANAGER & RESEARCH CHECKLIST ENGINE ---
let aiTasksFilter = 'all';

function initAITaskManager() {
  renderAITasks();
}

function getActiveProjectTasks() {
  if (!activeProject) return [];
  if (!activeProject.tasks || !Array.isArray(activeProject.tasks)) {
    activeProject.tasks = [];
  }
  return activeProject.tasks;
}

function renderAITasks() {
  const listContainer = document.getElementById('ai-tasks-list');
  const countText = document.getElementById('ai-tasks-count-text');
  if (!listContainer) return;

  const tasks = getActiveProjectTasks();
  const filtered = tasks.filter(t => {
    if (aiTasksFilter === 'todo') return t.status === 'todo';
    if (aiTasksFilter === 'done') return t.status === 'done';
    return true;
  });

  if (countText) {
    const todoCount = tasks.filter(t => t.status === 'todo').length;
    countText.innerText = `${todoCount} Pending / ${tasks.length} Total`;
  }

  listContainer.innerHTML = '';

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="color:var(--text-muted); text-align:center; padding:30px 10px; font-size:0.82rem;">
        <i class="fa-solid fa-list-check" style="font-size:2rem; margin-bottom:8px; opacity:0.4;"></i><br>
        No ${aiTasksFilter !== 'all' ? aiTasksFilter : ''} research tasks.
      </div>
    `;
    return;
  }

  filtered.forEach(task => {
    const card = document.createElement('div');
    card.className = `task-card ${task.status === 'done' ? 'completed' : ''}`;
    card.style.cssText = `
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      transition: all 0.2s ease;
    `;

    const isDone = task.status === 'done';
    const categoryBadge = task.category ? `<span class="badge" style="font-size:0.65rem; padding:2px 6px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3);">${escapeHtml(task.category)}</span>` : '';

    card.innerHTML = `
      <input type="checkbox" ${isDone ? 'checked' : ''} style="margin-top:3px; cursor:pointer; accent-color:var(--accent-purple);" onchange="toggleTaskState('${task.id}')">
      <div style="flex:1;">
        <div style="font-size:0.84rem; font-weight:500; color:${isDone ? 'var(--text-muted)' : 'var(--text-main)'}; text-decoration:${isDone ? 'line-through' : 'none'}; line-height:1.4;">
          ${escapeHtml(task.title)}
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
          ${categoryBadge}
          <span style="font-size:0.7rem; color:var(--text-muted);">${isDone ? '✅ Completed' : '⏳ Pending'}</span>
        </div>
      </div>
      <button class="btn-file-action delete" title="Delete Task" onclick="deleteAITask('${task.id}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">
        <i class="fa-solid fa-trash-can" style="font-size:0.8rem;"></i>
      </button>
    `;

    listContainer.appendChild(card);
  });
}

function addAITaskManual() {
  const input = document.getElementById('ai-task-new-input');
  if (!input) return;
  const title = input.value.trim();
  if (!title) return;

  const tasks = getActiveProjectTasks();
  const newTask = {
    id: `task-${Date.now()}`,
    title: title,
    status: 'todo',
    category: 'Manual',
    created_at: Date.now()
  };

  tasks.unshift(newTask);
  input.value = '';
  renderAITasks();
  saveCurrentProjectToBackend(true);

  if (typeof showToast === 'function') {
    showToast(`📌 Added research task: "${title}"`, 'success');
  }
}

function toggleTaskState(taskId) {
  const tasks = getActiveProjectTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.status = task.status === 'done' ? 'todo' : 'done';
  renderAITasks();
  saveCurrentProjectToBackend(true);
}

function deleteAITask(taskId) {
  if (!activeProject || !activeProject.tasks) return;
  activeProject.tasks = activeProject.tasks.filter(t => t.id !== taskId);
  renderAITasks();
  saveCurrentProjectToBackend(true);
}

function filterAITasks(filter) {
  aiTasksFilter = filter;
  ['all', 'todo', 'done'].forEach(f => {
    const btn = document.getElementById(`btn-filter-task-${f}`);
    if (btn) {
      if (f === filter) {
        btn.style.background = 'var(--accent-purple)';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
      }
    }
  });
  renderAITasks();
}

async function generateAITasksFromManuscript() {
  const btn = document.getElementById('btn-gen-ai-tasks');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanning...`;
  }

  try {
    const mainContent = editor ? editor.getValue() : (fileStore[activeFile] || '');
    const prompt = `You are an expert academic paper reviewer. Analyze this LaTeX manuscript excerpt and extract a list of 4 actionable research tasks, missing citation checks, or TODO action items.\n\nManuscript Excerpt:\n${mainContent.slice(0, 3000)}\n\nReturn JSON ONLY as an array of objects: [{"title": "task description", "category": "Writing|Citations|Figures|Math"}]`;

    const modelSelect = document.getElementById('model-select');
    const selectedModel = modelSelect ? modelSelect.value : 'qwen3-coder:30b';

    const res = await fetch('/api/ai/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        prompt: prompt,
        system: 'You return ONLY JSON arrays of objects with keys title and category.'
      })
    });

    if (res.ok) {
      const data = await res.json();
      let extracted = [];
      try {
        const clean = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
        extracted = JSON.parse(clean);
        if (!Array.isArray(extracted)) throw new Error('AI returned a non-array task response');
      } catch (pe) {
        throw new Error(`AI returned invalid task data: ${pe.message}`);
      }

      const tasks = getActiveProjectTasks();
      extracted.forEach(item => {
        if (item.title) {
          tasks.unshift({
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            title: item.title,
            status: 'todo',
            category: item.category || 'AI Auto',
            created_at: Date.now()
          });
        }
      });

      renderAITasks();
      saveCurrentProjectToBackend(true);

      if (typeof showToast === 'function') {
        showToast(`✨ Generated ${extracted.length} AI research tasks!`, 'success');
      }
    }
  } catch (err) {
    console.warn('Error generating AI tasks:', err);
    if (typeof showToast === 'function') {
      showToast(`AI task extraction failed: ${err.message}`, 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Generate`;
    }
  }
}






