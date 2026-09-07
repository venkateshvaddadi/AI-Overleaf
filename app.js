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

document.addEventListener('DOMContentLoaded', () => {
  initViewRouter();
  initDashboard();
  initProjectManagement();
  initCodeEditor();
  initNavigation();
  initPreviewTabs();
  initVersionControl();
  initAITools();
  initPdfInverseSearch();

  // Load existing projects from backend on startup
  fetchProjectsFromBackend();
});

// --- BACKEND REST API CALLS ---
async function fetchProjectsFromBackend(filterQuery = '') {
  try {
    const res = await fetch('/api/projects');
    if (res.ok) {
      projectsList = await res.json();
      renderDashboard(filterQuery);
      renderProjectSelector();

      // F5 Refresh & Direct Hash Navigation Support:
      let savedProjId = null;
      const hash = window.location.hash;
      if (hash && hash.startsWith('#/project/')) {
        savedProjId = hash.replace('#/project/', '');
      } else {
        savedProjId = localStorage.getItem('activeProjectId');
      }

      if (savedProjId && projectsList.some(p => p.id === savedProjId)) {
        if (!activeProject || activeProject.id !== savedProjId) {
          await openProjectFromDashboard(savedProjId);
        }
      }
    }
  } catch (e) {
    console.warn('Error fetching projects from backend:', e);
  }
}

async function openProjectFromDashboard(projId) {
  try {
    const res = await fetch(`/api/projects?id=${projId}`);
    if (res.ok) {
      activeProject = await res.json();
      fileStore = activeProject.files || {};
      activeFile = activeProject.main_file || Object.keys(fileStore)[0] || 'main.tex';

      renderProjectSelector();
      renderFileList();

      if (editor) {
        editor.setValue(fileStore[activeFile] || '');
        const indicator = document.getElementById('active-file-indicator');
        if (indicator) indicator.innerText = activeFile;
        const pdfLabel = document.getElementById('pdf-file-label');
        if (pdfLabel) pdfLabel.innerText = activeFile;
        setTimeout(() => editor.refresh(), 50);
      }

      compileLaTeX();
      ensurePdfViewActive();
      switchView('editor', projId);
    }
  } catch (e) {
    alert(`Error opening project: ${e.message}`);
  }
}

async function createNewProjectFromDashboard() {
  let projName = prompt('Enter new LaTeX Project Name:', 'QSM_Research_Paper');
  if (!projName) return;
  projName = projName.trim();

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
      fileStore = activeProject.files || {};
      activeFile = activeProject.main_file || 'main.tex';

      await fetchProjectsFromBackend();
      renderFileList();

      if (editor) {
        editor.setValue(fileStore[activeFile] || '');
        document.getElementById('active-file-indicator').innerText = activeFile;
      }

      compileLaTeX();
      switchView('editor');
    }
  } catch (e) {
    alert(`Error creating project: ${e.message}`);
  }
}

async function saveCurrentProjectToBackend() {
  if (!activeProject || !editor) return;

  if (fileStore && activeFile) {
    fileStore[activeFile] = editor.getValue();
  }

  try {
    const res = await fetch('/api/projects/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject.id,
        name: activeProject.name,
        main_file: activeFile,
        files: fileStore
      })
    });

    if (res.ok) {
      document.getElementById('save-status').innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved';
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

function switchView(targetView, projId = null) {
  currentView = targetView;
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  
  if (targetView === 'home') {
    document.getElementById('view-dashboard').classList.add('active');
    if (window.location.hash !== '') {
      history.replaceState(null, '', ' ');
    }
    localStorage.removeItem('activeProjectId');
  } else {
    document.getElementById('view-editor').classList.add('active');
    ensurePdfViewActive();
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

  filtered.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'project-card';

    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-card-title">${proj.name}</span>
        <button class="star-btn ${proj.favorite ? 'starred' : ''}" onclick="toggleFavorite('${proj.id}')" title="Toggle Favorite">
          <i class="fa-${proj.favorite ? 'solid' : 'regular'} fa-star"></i>
        </button>
      </div>

      <div class="project-card-meta">
        <span><i class="fa-regular fa-clock"></i> ${proj.modified_at || 'Recently'}</span>
        <span><i class="fa-solid fa-file"></i> ${proj.file_count || 1} file(s)</span>
      </div>

      <div class="project-card-footer">
        <button class="btn btn-sm btn-primary" onclick="openProjectFromDashboard('${proj.id}')">
          <i class="fa-solid fa-folder-open"></i> Open Editor
        </button>
        <button class="btn btn-sm btn-secondary" onclick="deleteProjectFromDashboard('${proj.id}')" title="Delete Project">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
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
  const selector = document.getElementById('project-selector');
  if (selector) {
    selector.addEventListener('change', (e) => {
      openProjectFromDashboard(e.target.value);
    });
  }

  const btnCreateProj = document.getElementById('btn-create-project');
  if (btnCreateProj) {
    btnCreateProj.addEventListener('click', createNewProjectFromDashboard);
  }

  const btnRenameProj = document.getElementById('btn-rename-project');
  if (btnRenameProj) {
    btnRenameProj.addEventListener('click', renameActiveProject);
  }
}

function renderProjectSelector() {
  const selector = document.getElementById('project-selector');
  if (!selector) return;
  selector.innerHTML = '';
  
  projectsList.forEach(proj => {
    const opt = document.createElement('option');
    opt.value = proj.id;
    opt.innerText = proj.name;
    if (activeProject && proj.id === activeProject.id) opt.selected = true;
    selector.appendChild(opt);
  });
}

async function renameActiveProject() {
  if (!activeProject) return;
  let newProjName = prompt(`Rename project '${activeProject.name}' to:`, activeProject.name);
  if (!newProjName || newProjName.trim() === activeProject.name) return;
  newProjName = newProjName.trim();

  activeProject.name = newProjName;
  await saveCurrentProjectToBackend();
  await fetchProjectsFromBackend();
}

// --- FILE STRUCTURE & UPLOAD MANAGEMENT ---
function renderFileList() {
  const container = document.getElementById('file-list');
  if (!container) return;
  container.innerHTML = '';

  Object.keys(fileStore).forEach(filename => {
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
  if (src && src.startsWith('data:')) {
    if (imgElem) {
      imgElem.src = src;
      imgElem.onload = () => {
        if (infoElem) infoElem.innerHTML = `<i class="fa-solid fa-circle-info"></i> Asset Info: ${imgElem.naturalWidth} × ${imgElem.naturalHeight} px`;
      };
    }
  } else {
    if (imgElem) imgElem.src = src || '';
  }
}

function copyIncludeGraphicsCode() {
  const codeElem = document.getElementById('img-snippet-code');
  if (codeElem) {
    navigator.clipboard.writeText(codeElem.innerText);
    alert(`Copied code snippet to clipboard:\n${codeElem.innerText}`);
  }
}

function createNewFile() {
  let newName = prompt('Enter new file path/name (e.g. sections/methods.tex, references.bib, custom.cls):', 'section.tex');
  if (!newName) return;
  newName = newName.trim();
  if (fileStore[newName]) {
    alert('A file with this name already exists.');
    return;
  }
  
  let defaultContent = '';
  if (newName.endsWith('.tex')) defaultContent = `% New LaTeX Section\n\\section{${newName.replace('.tex', '')}}\n`;
  else if (newName.endsWith('.bib')) defaultContent = `% Bibliography File\n`;
  else if (newName.endsWith('.cls') || newName.endsWith('.sty')) defaultContent = `% Custom Style/Class File\n`;

  fileStore[newName] = defaultContent;
  switchActiveFile(newName);
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

  saveCurrentProjectToBackend();
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
  if (btnNewFile) btnNewFile.addEventListener('click', createNewFile);
  
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
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: activeProject ? activeProject.id : null,
        files: fileStore,
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

  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);
  document.getElementById('btn-download').addEventListener('click', exportTeXFile);
}

function exportTeXFile() {
  const text = editor.getValue();
  const filename = activeFile || 'document.tex';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
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

function insertFigureAtCursor() {
  const code = document.getElementById('fig-code-preview').value;
  if (!code) return;
  if (editor) {
    const cursor = editor.getCursor();
    editor.replaceRange(`\n${code}\n`, cursor);
    editor.focus();
  }
  closeModal('figure-inserter-modal');
  compileLaTeX();
  saveCurrentProjectToBackend();
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

// Helper snippet insertions
function insertLaTeX(start, end) {
  const selection = editor.getSelection();
  editor.replaceSelection(start + selection + end);
  editor.focus();
}

function insertTableSnippet() {
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

// PDF Inverse Search & Cursor Jump Sync Engine
function initPdfInverseSearch() {
  const pdfContainer = document.getElementById('pdf-preview');
  if (!pdfContainer) return;

  // Render floating SyncTeX pill indicator
  if (!document.getElementById('pdf-sync-bar')) {
    const syncBadge = document.createElement('div');
    syncBadge.id = 'pdf-sync-bar';
    syncBadge.className = 'pdf-sync-bar';
    syncBadge.innerHTML = '<i class="fa-solid fa-crosshairs"></i> SyncTeX Active (Click to Jump)';
    pdfContainer.style.position = 'relative';
    pdfContainer.appendChild(syncBadge);
  }

  // Position-based click & double-click listener on PDF container
  pdfContainer.addEventListener('click', handlePdfClick);
  pdfContainer.addEventListener('dblclick', handlePdfClick);

  function handlePdfClick(e) {
    if (!editor) return;
    const rect = pdfContainer.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    if (clickY < 0 || clickY > rect.height) return;

    const heightRatio = Math.max(0, Math.min(1, clickY / rect.height));
    const lineCount = editor.lineCount();
    const targetLine = Math.floor(heightRatio * lineCount);

    jumpToCodeLine(targetLine);
  }

  // Text Selection Sync (Select/Double-click text to locate line in editor)
  document.addEventListener('mouseup', () => {
    const sel = window.getSelection() ? window.getSelection().toString() : '';
    if (sel && sel.trim().length >= 3) {
      const line = findLineByText(sel);
      if (line >= 0) jumpToCodeLine(line);
    }
  });

  // Paper HTML preview click listener
  const paper = document.getElementById('paper-content');
  if (paper && !paper.dataset.syncBound) {
    paper.dataset.syncBound = 'true';
    paper.addEventListener('click', (e) => {
      const lineElem = e.target.closest('[data-line]');
      if (lineElem) {
        const line = parseInt(lineElem.getAttribute('data-line'), 10);
        if (!isNaN(line)) jumpToCodeLine(line);
      }
    });
  }
}

function findLineByText(text) {
  if (!text || !editor) return -1;
  const clean = text.trim().toLowerCase();
  if (clean.length < 3) return -1;
  const count = editor.lineCount();

  // Try exact substring match first
  for (let i = 0; i < count; i++) {
    const lineContent = editor.getLine(i).toLowerCase();
    if (lineContent.includes(clean)) return i;
  }

  // Try first word match
  const firstWord = clean.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 4) {
    for (let i = 0; i < count; i++) {
      const lineContent = editor.getLine(i).toLowerCase();
      if (lineContent.includes(firstWord)) return i;
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
  const lineHandle = editor.addLineClass(validLine, 'background', 'cm-sync-highlight');
  setTimeout(() => {
    editor.removeLineClass(lineHandle, 'background', 'cm-sync-highlight');
  }, 2200);
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




