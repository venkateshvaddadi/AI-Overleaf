# 🚀 AI-Overleaf LaTeX Studio Pro

> **AI-Native, High-Performance LaTeX Writing & Research Workspace with Multi-Threaded Native Compiler Backend, Bidirectional SyncTeX, Threaded GitHub Sync, and Multi-Tab Project Lifecycle Management.**

---

## 🌟 Key Features

### 🎯 **1. Bidirectional SyncTeX Engine (Editor ⟷ PDF)**
- **Forward Search (Editor ➔ PDF)**: Click **Jump to PDF** or press shortcut to jump from the active CodeMirror cursor line directly to the corresponding PDF preview page and paragraph.
- **Inverse Search (PDF ➔ Editor)**: Double-click any text paragraph, figure, or section heading in the PDF / Paper preview pane to instantly position the editor cursor at that source code line with a purple pulse highlight (`.editor-sync-highlight`).
- **Live Auto-Scroll Sync (Auto Sync ON/OFF)**: Toggle real-time auto-scroll tracking to keep the PDF preview automatically aligned with your active editing line as you type.

### ⚡ **2. Multi-Threaded Non-Blocking GitHub Sync**
- **Async Thread Execution**: GitHub repository synchronization runs on dedicated background Python threads, keeping HTTP responses instant (< 5ms) without freezing the UI.
- **Interactive UI Feedback**: Real-time progress bar (0% -> 100%), live file count counter (*e.g., Files: 4 / 6*), step messages, and a floating glassmorphic status toast pill.

### 🏠 **3. Dual Dashboard Views & Multi-Tab Project Lifecycle**
- **Grid Card View vs. Horizontal Row View**: Switch between visual project cards and compact list rows with persistent layout state.
- **Multi-Tab Dashboard Sidebar**:
  - 📁 **Your Projects**: Active workspace papers and active research.
  - 👥 **Shared with You**: Collaborative papers shared across teams.
  - 📦 **Archived Projects**: Dedicated separate dashboard view for completed or inactive projects.
  - 🗑️ **Trash**: Safe 2-stage soft trash bin protecting projects before permanent deletion.
- **Reversible Lifecycle Operations**: Soft archive, soft trash, restore, and permanent deletion.
- **Native .zip Project Export**: Download full project repositories as `.zip` archives directly from the dashboard card or row menu.

### 📐 **4. 3-Way Workspace View Modes**
- 💻 **Code Only (100%)**: Maximize editor focused workspace for pure writing.
- 🌓 **Split View (50/50)**: Classic side-by-side editing and PDF preview.
- 📄 **PDF Only (100%)**: Full-screen paper reading and presentation mode.
- **Smooth Layout Reflow**: CodeMirror automatically recalculates line height and column layout (`editor.refresh()`) on view mode transitions.

### 🛡️ **5. Strict User-Content File Filtering**
- **Clean Workspace Explorer**: Both backend (`is_user_content_file`) and frontend (`isUserContentFile`) automatically filter out non-user management files, including:
  - Git internal objects & metadata (`.git/`, `.gitignore`, `.gitattributes`, `.gitmodules`)
  - Hidden system dotfiles (`.DS_Store`, `.user`, `.vscode`, `.env`)
  - Compiled binaries & cache artifacts (`last_compiled.pdf`, `__pycache__`)
- **Clean Focus**: The **Project Files** view displays strictly user-created content files (`.tex`, `.bib`, `.cls`, `.sty`, images, documents).

### 📁 **6. Per-File Selection & Individual File Download**
- **Multi-File LaTeX Compilation**: Click any `.tex` file in the **Project Files** sidebar (`main.tex`, `cover-letter.tex`, `supplementary_materials.tex`) to compile and inspect its specific PDF output.
- **1-Click Individual File Download**: Download any `.tex`, `.bib`, `.cls`, `.sty`, or image asset directly from the file list using the download button (<i class="fa-solid fa-download"></i>).
- **Asset Upload**: Drag and drop or upload `.png`, `.jpg`, `.pdf`, `.bib`, or `.zip` template archives directly into disk storage.

### 🤖 **7. Local AI Assistant & Peer Reviewer**
- **Ollama LLM Integration**: Connects locally with **Qwen 2.5**, **DeepSeek-R1**, or **Llama 3.3** for automated manuscript peer review, equation generation, grammar polishing, and LaTeX syntax error resolution.

---

## 📋 System Requirements & Setup

### 1. **System Requirements**
- **OS**: Linux / macOS / Windows
- **Python**: Python `3.8+` (utilizes standard library `http.server`, `socketserver`, `threading`, `json`)
- **TeX Engine** (Optional / Recommended): **Tectonic** (single-binary TeX engine) or standard **TeX Live** (`pdflatex`).

---

## 🚀 Quick Start Guide

### Step 1: Clone the Repository
```bash
git clone https://github.com/venkateshvaddadi/AI-Overleaf.git
cd AI-Overleaf
```

### Step 2: Launch the Backend Server
Start the multi-threaded backend server (default port `8090`):
```bash
python3 server.py --port 8090
```

### Step 3: Access in Browser
Open your browser and navigate to:
```text
http://localhost:8090/
```

---

## 📂 Project Structure

```text
AI-Overleaf/
├── server.py               # Multi-threaded Python HTTP API, background Git sync worker & TeX compiler
├── index.html              # Main HTML5 application structure & UI viewports
├── styles.css              # Modern glassmorphism theme system, row view styles & animations
├── app.js                  # Frontend state engine, CodeMirror integration, SyncTeX & GitHub sync logic
├── verify_compilation.py   # Verification & compilation test suite
├── projects_db/            # Persistent disk storage for project files, git repositories & PDFs
└── README.md               # Application documentation
```

---

## 💻 Dashboard & Editor Operations Overview

```text
                         HOME / DASHBOARD
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
  Your Projects            Archived Projects           Shared
       │                        │                        │
  ┌────┴────┐              ┌────┴────┐                   │
  ▼         ▼              ▼         ▼                   ▼
Grid View  Row View    Grid View  Row View           Shared Papers
  │         │              │         │
  └────┬────┘              └────┬────┘
       │                        │
       ▼                        ▼
 ┌───────────┐            ┌───────────┐
 │  Editor   │            │ Restore / │
 │ Workspace │            │ Delete    │
 └───────────┘            └───────────┘
```

---

## 👨‍💻 Author & Repository
- **Author**: Venkatesh Vaddadi
- **Repository**: [https://github.com/venkateshvaddadi/AI-Overleaf](https://github.com/venkateshvaddadi/AI-Overleaf)
