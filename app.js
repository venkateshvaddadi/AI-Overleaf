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
    const sharedCount = allProjs.filter(p => p.shared && !p.deleted_at).length;
    const archivedCount = allProjs.filter(p => p.archived && !p.deleted_at).length;
    const trashCount = allProjs.filter(p => p.deleted_at).length;

    const elActive = document.getElementById('nav-count-active');
    const elShared = document.getElementById('nav-count-shared');
    const elArchived = document.getElementById('nav-count-archived');
    const elTrash = document.getElementById('nav-count-trash');

    if (elActive) elActive.innerText = activeCount;
    if (elShared) elShared.innerText = sharedCount;
    if (elArchived) elArchived.innerText = archivedCount;
    if (elTrash) elTrash.innerText = trashCount;
  } catch (e) {
    console.warn('Error updating sidebar counts:', e);
  }
}

function switchDashboardTab(tab) {
  currentDashTab = tab;

  // Update navigation items state
  ['active', 'shared', 'archived', 'trash'].forEach(t => {
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
    } else if (tab === 'shared') {
      titleEl.innerHTML = `<i class="fa-solid fa-users" style="color:var(--accent-blue);"></i> Shared with You`;
      if (searchInput) searchInput.placeholder = 'Search shared research projects...';
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

  modal.style.display = 'flex';
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

async function openProjectFromDashboard(projId, projNameHint) {
  try {
    let projName = projNameHint;
    if (!projName && typeof allProjects !== 'undefined' && Array.isArray(allProjects)) {
      const found = allProjects.find(p => p.id === projId);
      if (found) projName = found.name;
    }

    showProjectLoader(projName || 'Research Project');
    updateProjectLoaderStep(1, 30, 'Retrieving source code & LaTeX files...');

    const res = await fetch(`/api/projects?id=${projId}`);
    if (res.ok) {
      activeProject = await res.json();
      fileStore = sanitizeFileStore(activeProject.files);
      const userKeys = Object.keys(fileStore);
      activeFile = (activeProject.main_file && isUserContentFile(activeProject.main_file)) ? activeProject.main_file : (userKeys[0] || 'main.tex');

      updateProjectLoaderStep(2, 65, 'Preparing CodeMirror editor & workspace layout...');

      renderProjectTitle();
      renderFileList();

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
      switchView('editor', projId);

      setTimeout(() => hideProjectLoader(), 250);
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
  try {
    const payloadFiles = getSanitizedTextFilesPayload(fileStore);
    const res = await fetch('/api/projects/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject.id,
        name: activeProject.name,
        main_file: activeFile,
        files: payloadFiles
      })
    });

    if (res.ok) {
      const statusEl = document.getElementById('save-status');
      if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved';
    }
  } catch (e) {
    console.warn('Error saving to backend:', e);
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
  const btnEditor = document.getElementById('btn-layout-editor');
  const btnSplit = document.getElementById('btn-layout-split');
  const btnPdf = document.getElementById('btn-layout-pdf');

  if (mainContainer) {
    mainContainer.classList.remove('mode-editor-only', 'mode-pdf-only', 'mode-split');
    if (mode === 'editor') mainContainer.classList.add('mode-editor-only');
    else if (mode === 'pdf') mainContainer.classList.add('mode-pdf-only');
    else mainContainer.classList.add('mode-split');
  }

  // Update button active highlights
  if (btnEditor && btnSplit && btnPdf) {
    btnEditor.classList.toggle('active', mode === 'editor');
    btnSplit.classList.toggle('active', mode === 'split');
    btnPdf.classList.toggle('active', mode === 'pdf');
  }

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
    document.getElementById('view-dashboard').classList.add('active');
    if (window.location.hash !== '') {
      history.replaceState(null, '', ' ');
    }
    localStorage.removeItem('activeProjectId');
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

    for (const entryName of Object.keys(zip.files)) {
      const entry = zip.files[entryName];
      if (entry.dir) continue;

      let cleanPath = entryName;
      const parts = cleanPath.split('/');
      if (parts.length > 1 && (parts[0].includes('master') || parts[0].includes('main') || parts[0].includes('template'))) {
        cleanPath = parts.slice(1).join('/');
      }
      if (!cleanPath) continue;

      if (cleanPath.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i)) {
        const b64 = await entry.async('base64');
        const ext = cleanPath.split('.').pop().toLowerCase();
        filesObj[cleanPath] = `data:image/${ext};base64,${b64}`;
      } else {
        const textContent = await entry.async('text');
        filesObj[cleanPath] = textContent;
      }

      if (cleanPath === 'main.tex' || cleanPath.endsWith('.tex')) {
        mainFile = cleanPath;
      }
    }

    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projName,
        description: 'Imported LaTeX Template Archive'
      })
    });

    if (res.ok) {
      activeProject = await res.json();
      fileStore = filesObj;
      activeFile = mainFile;

      await saveCurrentProjectToBackend();
      await fetchProjectsFromBackend();
      
      renderFileList();
      if (editor) editor.setValue(fileStore[activeFile] || '');

      compileLaTeX();
      switchView('editor');
      alert(`✅ Imported template archive '${projName}' successfully!`);
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

// --- FILE STRUCTURE & UPLOAD MANAGEMENT ---
function renderFileList() {
  const container = document.getElementById('file-list');
  if (!container) return;
  container.innerHTML = '';

  Object.keys(fileStore).filter(isUserContentFile).forEach(filename => {
    const li = document.createElement('li');
    li.className = `file-item ${filename === activeFile ? 'active' : ''}`;
    
    let iconClass = 'fa-file-code';
    if (filename.endsWith('.bib')) iconClass = 'fa-book';
    else if (filename.endsWith('.cls') || filename.endsWith('.sty')) iconClass = 'fa-sliders';
    else if (filename.match(/\.(png|jpg|jpeg|pdf|svg)$/i)) iconClass = 'fa-file-image';

    li.innerHTML = `
      <div class="file-item-info" onclick="switchActiveFile('${filename}')">
        <i class="fa-solid ${iconClass}"></i>
        <span>${filename}</span>
      </div>
      <div class="file-actions">
        <button class="btn-file-action" onclick="event.stopPropagation(); downloadSingleFile('${filename}')" title="Download File">
          <i class="fa-solid fa-download"></i>
        </button>
        <button class="btn-file-action" onclick="event.stopPropagation(); renameFile('${filename}')" title="Rename File">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="btn-file-action delete" onclick="event.stopPropagation(); deleteFile('${filename}')" title="Delete File">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

    container.appendChild(li);
  });
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
      setTimeout(() => editor.refresh(), 50);
    }
  }

  const indicator = document.getElementById('active-file-indicator');
  if (indicator) indicator.innerText = activeFile;
  const pdfLabel = document.getElementById('pdf-file-label');
  if (pdfLabel) pdfLabel.innerText = activeFile;
  
  renderFileList();
  ensurePdfViewActive();
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
  { text: "\\documentclass[12pt, a4paper]{article}", displayText: "\\documentclass{article} - Standard Paper Document" },
  { text: "\\documentclass{IEEEtran}", displayText: "\\documentclass{IEEEtran} - IEEE Conference / Journal" },
  { text: "\\documentclass{beamer}", displayText: "\\documentclass{beamer} - Presentation Slides" },
  { text: "\\usepackage{graphicx}", displayText: "\\usepackage{graphicx} - Image Graphics" },
  { text: "\\usepackage{amsmath, amssymb}", displayText: "\\usepackage{amsmath, amssymb} - Math Symbols & Formulas" },
  { text: "\\usepackage{booktabs}", displayText: "\\usepackage{booktabs} - Professional Publication Tables" },
  { text: "\\usepackage{hyperref}", displayText: "\\usepackage{hyperref} - Interactive PDF Links" },
  { text: "\\usepackage{tikz}", displayText: "\\usepackage{tikz} - Vector Diagrams" },
  { text: "\\begin{document}\n  \n\\end{document}", displayText: "\\begin{document} ... \\end{document}" },
  { text: "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{filename}\n  \\caption{Caption}\n  \\label{fig:label}\n\\end{figure}", displayText: "\\begin{figure} - Image figure block" },
  { text: "\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{cc}\n    \\toprule\n    Header 1 & Header 2 \\\\\n    \\midrule\n    Data 1 & Data 2 \\\\\n    \\bottomrule\n  \\end{tabular}\n  \\caption{Caption}\n  \\label{tab:label}\n\\end{table}", displayText: "\\begin{table} - Tabular data table" },
  { text: "\\begin{equation}\n  \n\\end{equation}", displayText: "\\begin{equation} - Numbered equation" },
  { text: "\\begin{align}\n  \n\\end{align}", displayText: "\\begin{align} - Aligned multi-line math" },
  { text: "\\begin{abstract}\n  \n\\end{abstract}", displayText: "\\begin{abstract} - Document Abstract" },
  { text: "\\section{", displayText: "\\section{Title}" },
  { text: "\\subsection{", displayText: "\\subsection{Title}" },
  { text: "\\subsubsection{", displayText: "\\subsubsection{Title}" },
  { text: "\\paragraph{", displayText: "\\paragraph{Title}" },
  { text: "\\title{", displayText: "\\title{Paper Title}" },
  { text: "\\author{", displayText: "\\author{Author Name}" },
  { text: "\\date{\\today}", displayText: "\\date{\\today}" },
  { text: "\\maketitle", displayText: "\\maketitle - Render title block" },
  { text: "\\includegraphics[width=0.8\\linewidth]{", displayText: "\\includegraphics{file}" },
  { text: "\\caption{", displayText: "\\caption{text}" },
  { text: "\\label{", displayText: "\\label{key}" },
  { text: "\\ref{", displayText: "\\ref{key}" },
  { text: "\\cite{", displayText: "\\cite{citation}" },
  { text: "\\textbf{", displayText: "\\textbf{bold text}" },
  { text: "\\textit{", displayText: "\\textit{italic text}" },
  { text: "\\underline{", displayText: "\\underline{underlined text}" },
  { text: "\\centering", displayText: "\\centering - Center alignment" },
  { text: "\\toprule", displayText: "\\toprule - Table top line" },
  { text: "\\midrule", displayText: "\\midrule - Table middle line" },
  { text: "\\bottomrule", displayText: "\\bottomrule - Table bottom line" },
  { text: "\\hline", displayText: "\\hline - Grid line" },
  { text: "\\frac{num}{den}", displayText: "\\frac{a}{b} - Fraction" },
  { text: "\\sum_{i=1}^{n}", displayText: "\\sum_{i=1}^{n} - Summation" },
  { text: "\\int_{a}^{b}", displayText: "\\int_{a}^{b} - Integral" },
  { text: "\\sqrt{", displayText: "\\sqrt{x} - Square root" },
  { text: "\\alpha", displayText: "\\alpha" },
  { text: "\\beta", displayText: "\\beta" },
  { text: "\\gamma", displayText: "\\gamma" },
  { text: "\\theta", displayText: "\\theta" },
  { text: "\\lambda", displayText: "\\lambda" },
  { text: "\\pi", displayText: "\\pi" },
  { text: "\\sigma", displayText: "\\sigma" },
  { text: "\\omega", displayText: "\\omega" }
];

function latexHintProvider(cm) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);
  const start = cursor.ch;
  
  let lineBefore = line.slice(0, start);
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

  // Dynamic \ref{ completions from labels in current document
  if (query.startsWith('\\ref') || query.startsWith('\\label')) {
    const docText = cm.getValue();
    const labelMatches = docText.matchAll(/\\label\{([^}]+)\}/g);
    for (const m of labelMatches) {
      const labelKey = m[1];
      completions.push({
        text: `\\ref{${labelKey}}`,
        displayText: `\\ref{${labelKey}} (Document Label)`
      });
    }
  }

  // Dynamic \includegraphics{ completions from uploaded image files
  if (query.startsWith('\\include') || query.startsWith('\\fig')) {
    Object.keys(fileStore).filter(f => f.match(/\.(png|jpg|jpeg|gif|svg|pdf)$/i)).forEach(img => {
      completions.push({
        text: `\\includegraphics[width=0.8\\linewidth]{${img}}`,
        displayText: `\\includegraphics{${img}} (Project Asset)`
      });
    });
  }

  return {
    list: completions,
    from: CodeMirror.Pos(cursor.line, slashIdx),
    to: CodeMirror.Pos(cursor.line, start)
  };
}

if (window.CodeMirror) {
  CodeMirror.registerHelper("hint", "stex", latexHintProvider);
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
    autoCloseBrackets: true,
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

  // Real-time typing autocomplete trigger on '\\'
  editor.on('inputRead', (cm, change) => {
    if (change.text[0] === '\\' || (change.text[0] && change.text[0].match(/[a-zA-Z]/))) {
      const cursor = cm.getCursor();
      const line = cm.getLine(cursor.line);
      const lineBefore = line.slice(0, cursor.ch);
      if (lineBefore.includes('\\')) {
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
      compileLaTeX();
      saveCurrentProjectToBackend();
    }, 500);
  });

  const btnNewFile = document.getElementById('btn-new-file');
  if (btnNewFile) btnNewFile.addEventListener('click', openNewFileModal);
  
  const btnUpload = document.getElementById('btn-upload-file');
  const fileInput = document.getElementById('file-upload-input');
  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
  }

  setTimeout(() => editor.refresh(), 100);
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
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject ? activeProject.id : null,
        files: payloadFiles,
        main_file: activeFile,
        title: title
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      if (activePdfBlobUrl) URL.revokeObjectURL(activePdfBlobUrl);
      activePdfBlobUrl = URL.createObjectURL(blob);

      const pdfFrame = document.getElementById('pdf-frame');
      if (pdfFrame) pdfFrame.src = activePdfBlobUrl;
      ensurePdfViewActive();

      const b64Log = res.headers.get('X-Compiler-Log');
      const hasErr = res.headers.get('X-Compiler-Error') === '1';

      let decodedLog = '';
      if (b64Log) {
        try { decodedLog = atob(b64Log); } catch (e) { decodedLog = ''; }
      }

      const logOutput = document.getElementById('compiler-log-output');
      if (hasErr) {
        if (logOutput) logOutput.innerText = `⚠️ PDF Generated with LaTeX Warnings/Errors:\n\n${decodedLog || 'Errors detected during TeX pass.'}`;
        if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-amber)"></i> PDF (with errors)';
      } else {
        if (logOutput) logOutput.innerText = `✅ PDF Compilation Successful!\n\n${decodedLog || 'Engine: Tectonic (Native TeX)\nStatus: PDF Preview Updated.'}`;
        if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> PDF Ready';
      }
    } else {
      const err = await res.json();
      const logOutput = document.getElementById('compiler-log-output');
      if (logOutput) logOutput.innerText = `❌ LaTeX Compilation Error:\n${err.error || ''}\n\n=== Compiler Log ===\n${err.log || ''}`;
      if (statusBadge) statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-red)"></i> Compile Error';
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

function initPreviewTabs() {
  const tabs = document.querySelectorAll('.preview-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.target;
      document.querySelectorAll('.preview-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      document.getElementById(target).classList.add('active');
      updateViewportPadding(target);
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
      const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://127.0.0.1:11434';
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          system: systemPrompt,
          prompt: textToTranslate,
          stream: false
        })
      });

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
  if (commitHistory.length === 0) {
    createCommit('Initial Document Creation');
  } else {
    renderCommitTimeline();
  }

  document.getElementById('btn-create-commit').addEventListener('click', () => {
    const msg = document.getElementById('commit-msg-input').value.trim() || 'Snapshot update';
    createCommit(msg);
    document.getElementById('commit-msg-input').value = '';
  });
}

function createCommit(message) {
  const text = editor ? editor.getValue() : '';
  const commit = {
    hash: Math.random().toString(36).substring(2, 8),
    message: message,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content: text
  };

  commitHistory.unshift(commit);
  renderCommitTimeline();
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
      editor.setValue(commit.content);
      compileLaTeX();
      saveCurrentProjectToBackend();
    }
  }
}

function viewDiff(hash) {
  const commit = commitHistory.find(c => c.hash === hash);
  if (!commit) return;

  const currentContent = editor.getValue();
  const oldContent = commit.content;

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
  const toolReview = document.getElementById('tool-peer-review');
  if (toolReview) toolReview.addEventListener('click', runPeerReview);

  const toolCsv = document.getElementById('tool-csv-table');
  if (toolCsv) toolCsv.addEventListener('click', openCSVTableModal);

  const toolFig = document.getElementById('tool-insert-figure');
  if (toolFig) toolFig.addEventListener('click', openFigureInserterModal);

  const toolBib = document.getElementById('tool-gen-bibtex');
  if (toolBib) toolBib.addEventListener('click', () => {
    const query = prompt('Enter Paper Title, Authors, or DOI for BibTeX generation:');
    if (query) runAITool(`Generate valid, publication-ready BibTeX entry (@article or @inproceedings) for: ${query}. Return ONLY raw BibTeX code without markdown wrapper.`, `BibTeX: ${query}`);
  });

  const toolTikz = document.getElementById('tool-gen-tikz');
  if (toolTikz) toolTikz.addEventListener('click', () => {
    const promptText = prompt('Describe the TikZ diagram, flowchart, or plot you want to generate:');
    if (promptText) runAITool(`Generate complete, compilable LaTeX \\begin{tikzpicture}...\\end{tikzpicture} block for: ${promptText}. Return ONLY raw LaTeX code.`, `TikZ Diagram: ${promptText}`);
  });

  const toolFix = document.getElementById('tool-fix-errors');
  if (toolFix) toolFix.addEventListener('click', () => runAITool('Fix any syntax, structural, or unclosed environment errors in this LaTeX document.', 'Auto-Fix Syntax Errors'));

  const toolMath = document.getElementById('tool-gen-math');
  if (toolMath) toolMath.addEventListener('click', () => {
    const formula = prompt('Describe the math formula or matrix you want to generate:');
    if (formula) runAITool(`Generate LaTeX equation with \\begin{equation} and \\label{} for: ${formula}`, `Math Formula: ${formula}`);
  });

  const toolPolish = document.getElementById('tool-polish');
  if (toolPolish) toolPolish.addEventListener('click', () => runAITool('Polish the academic writing style and grammar of this document while maintaining LaTeX tags and equations.', 'Academic Polish'));

  initCSVTableConverter();
  initFigureInserter();
}

// --- 1. CSV TO LATEX TABLE CONVERTER ENGINE ---
function openCSVTableModal() {
  document.getElementById('csv-table-modal').classList.add('active');
  updateCSVTablePreview();
}

function initCSVTableConverter() {
  const fileInput = document.getElementById('csv-file-input');
  const rawTextarea = document.getElementById('csv-raw-textarea');
  const styleSelect = document.getElementById('csv-style-select');
  const captionInput = document.getElementById('csv-caption-input');
  const labelInput = document.getElementById('csv-label-input');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        rawTextarea.value = evt.target.result;
        updateCSVTablePreview();
      };
      reader.readAsText(file);
    });
  }

  [rawTextarea, styleSelect, captionInput, labelInput].forEach(elem => {
    if (elem) elem.addEventListener('input', updateCSVTablePreview);
    if (elem) elem.addEventListener('change', updateCSVTablePreview);
  });
}

function updateCSVTablePreview() {
  const rawText = document.getElementById('csv-raw-textarea').value.trim();
  const style = document.getElementById('csv-style-select').value;
  const caption = document.getElementById('csv-caption-input').value.trim();
  const label = document.getElementById('csv-label-input').value.trim();
  const preview = document.getElementById('csv-code-preview');

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

// --- 2. SMART AI FIGURE INSERTER ENGINE ---
function openFigureInserterModal() {
  const select = document.getElementById('fig-asset-select');
  if (!select) return;

  select.innerHTML = '';
  const imageFiles = Object.keys(fileStore).filter(f => f.match(/\.(png|jpg|jpeg|gif|svg|webp|pdf)$/i));

  if (imageFiles.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.innerText = 'No image assets uploaded yet (Upload via Files tab)';
    select.appendChild(opt);
  } else {
    imageFiles.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.innerText = f;
      select.appendChild(opt);
    });
  }

  document.getElementById('figure-inserter-modal').classList.add('active');
  updateFigurePreview();
}

function initFigureInserter() {
  const select = document.getElementById('fig-asset-select');
  const widthSelect = document.getElementById('fig-width-select');
  const placementSelect = document.getElementById('fig-placement-select');
  const captionInput = document.getElementById('fig-caption-input');
  const labelInput = document.getElementById('fig-label-input');

  [select, widthSelect, placementSelect, captionInput, labelInput].forEach(elem => {
    if (elem) elem.addEventListener('input', updateFigurePreview);
    if (elem) elem.addEventListener('change', updateFigurePreview);
  });
}

function updateFigurePreview() {
  const asset = document.getElementById('fig-asset-select').value || 'figure.png';
  const width = document.getElementById('fig-width-select').value || '0.8\\linewidth';
  const placement = document.getElementById('fig-placement-select').value || 'htbp';
  const caption = document.getElementById('fig-caption-input').value.trim();
  let label = document.getElementById('fig-label-input').value.trim();

  if (!label && asset) {
    const baseName = asset.split('.')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_');
    label = `fig:${baseName}`;
  } else if (label && !label.startsWith('fig:')) {
    label = `fig:${label}`;
  }

  let code = `\\begin{figure}[${placement}]\n  \\centering\n  \\includegraphics[width=${width}]{${asset}}\n`;
  if (caption) code += `  \\caption{${caption}}\n`;
  if (label) code += `  \\label{${label}}\n`;
  code += '\\end{figure}';

  document.getElementById('fig-code-preview').value = code;
}

async function generateAICaptionForFigure() {
  const asset = document.getElementById('fig-asset-select').value;
  if (!asset) {
    alert('Please select an image asset first.');
    return;
  }

  const model = document.getElementById('model-select').value;
  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://127.0.0.1:11434';
  
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: `Generate a concise, formal academic figure caption for an image asset named "${asset}" used in a research paper. Output ONLY the caption sentence without quotes or LaTeX commands.`,
        stream: false
      })
    });
    const data = await res.json();
    const caption = data.response.trim().replace(/^["']|["']$/g, '');
    document.getElementById('fig-caption-input').value = caption;
    updateFigurePreview();
  } catch (e) {
    alert(`Caption suggestion error: ${e.message}`);
  }
}

function copyFigureCode() {
  const code = document.getElementById('fig-code-preview').value;
  if (code) {
    navigator.clipboard.writeText(code);
    alert('✅ LaTeX Figure code copied to clipboard!');
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

async function runAITool(instruction, title) {
  const model = document.getElementById('model-select').value;
  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://127.0.0.1:11434';
  const code = editor.getValue();

  alert(`🧠 Processing request with ${model}...`);

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: `${instruction}\n\nDOCUMENT:\n${code}`,
        stream: false
      })
    });
    const data = await response.json();
    let result = data.response.trim();
    result = result.replace(/^```latex/g, '').replace(/^```/g, '').replace(/```$/g, '');

    showAIDiffModal(code, result, title || 'AI Modification');
  } catch (e) {
    alert(`❌ Error: ${e.message}`);
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
  document.getElementById(id).classList.remove('active');
}

document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('settings-modal').classList.add('active');
});

async function testOllamaConnection() {
  const url = document.getElementById('ollama-url-input').value || 'http://127.0.0.1:11434';
  const resElem = document.getElementById('conn-test-result');
  resElem.innerText = ' Testing...';
  try {
    const res = await fetch(`${url}/api/tags`);
    if (res.ok) {
      resElem.innerHTML = ' <span style="color:var(--accent-green)">Connected to Dual RTX 3090 Backend!</span>';
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

  // Text Selection Sync (Selecting text in PDF/Paper locates source line in editor)
  document.addEventListener('mouseup', (e) => {
    if (e.target && e.target.closest('.CodeMirror')) return;

    const sel = window.getSelection() ? window.getSelection().toString().trim() : '';
    if (sel && sel.length >= 3) {
      const line = findLineByText(sel);
      if (line >= 0) {
        jumpToCodeLine(line);
      }
    }
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

// --- 3. AI MANUSCRIPT PEER REVIEWER & CRITIQUE ENGINE ---
async function runPeerReview() {
  if (!editor) return;
  const modal = document.getElementById('peer-review-modal');
  const reportBody = document.getElementById('peer-review-report-body');
  const badge = document.getElementById('review-status-badge');

  modal.classList.add('active');
  reportBody.innerHTML = '⏳ <i class="fa-solid fa-spinner fa-spin"></i> Analyzing manuscript structure, academic tone, citations, math rigor, and clarity...';
  badge.innerText = 'Evaluating Document...';

  const code = editor.getValue();
  const model = document.getElementById('model-select').value;
  const ollamaUrl = document.getElementById('ollama-url-input').value || 'http://127.0.0.1:11434';

  const promptText = `You are a distinguished Senior Peer Reviewer for top academic journals (IEEE, Nature, Springer).
Perform a comprehensive peer review critique of the following LaTeX manuscript document:

MANUSCRIPT:
${code}

Provide your feedback structured cleanly with headings:
1. 🌟 OVERALL ASSESSMENT & RECOMMENDATION (e.g. Accept with Minor Revisions, Major Revisions)
2. 🔬 STRENGTHS & KEY CONTRIBUTIONS (Highlight strong sections or methods)
3. ⚠️ CRITICAL WEAKNESSES & MISSING CITATIONS/DATA (Identify weak arguments, missing citations, or unclear math)
4. ✍️ LINE-BY-LINE SUGGESTIONS FOR IMPROVEMENT (Specific paragraph or sentence recommendations)
5. 📝 SUMMARY RECOMMENDATIONS FOR AUTHOR`;

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: promptText,
        stream: false
      })
    });
    const data = await res.json();
    const feedback = data.response.trim();
    reportBody.innerText = feedback;
    badge.innerText = 'Review Completed ✓';
  } catch (e) {
    reportBody.innerText = `❌ Peer Review Evaluation Error: ${e.message}. Make sure Ollama backend is connected.`;
    badge.innerText = 'Evaluation Failed';
  }
}

function copyPeerReviewReport() {
  const reportBody = document.getElementById('peer-review-report-body');
  if (reportBody && reportBody.innerText) {
    navigator.clipboard.writeText(reportBody.innerText);
    alert('✅ Peer Reviewer Critique copied to clipboard!');
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





