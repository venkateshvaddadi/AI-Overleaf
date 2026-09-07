# 🚀 AI-Overleaf LaTeX Studio Pro

> **AI-Native, High-Performance LaTeX Writing & Research Workspace with Multi-Threaded Native Compiler Backend, Fault-Tolerant Preview, and PDF-to-Editor Inverse Search.**

---

## 🌟 Key Features

- 📄 **Per-File Selection & PDF Compilation**: Click any `.tex` file in the sidebar (e.g. `main.tex`, `cover-letter.tex`, `supplementary_materials.tex`) to compile and render its distinct PDF preview.
- ⚡ **Fault-Tolerant Native Compilation**: Integrated with the **Tectonic** TeX engine running with `-Z continue-on-errors -k`. PDF previews stay active even when syntax errors or unclosed math modes occur.
- 🎯 **PDF ↔ Code Inverse Search (SyncTeX)**: Click or double-click anywhere in the PDF preview pane or text selection to instantly jump the CodeMirror editor cursor to that line, scroll into view, and highlight the line with a purple pulse animation.
- 🏠 **Seamless Navigation Router**: Seamless two-way navigation between the **Home Projects Dashboard** and **Editor Workspace** with automatic snapshot saving.
- 📦 **Zip Template Import & Asset Management**: Import multi-file LaTeX project archives (`.zip`) or individual figures (`.png`, `.jpg`, `.pdf`) directly into disk storage.
- 🤖 **Local AI Assistant & Translation**: Connects with local Ollama LLMs (**Qwen 2.5**, **DeepSeek-R1**, **Llama 3.3**) for academic prose polishing, LaTeX equation generation, and syntax error auto-fixing.

---

## 📋 Requirements & Dependencies

### 1. **System Requirements**
- **Operating System**: Linux / macOS / Windows
- **Python**: Python `3.8` or higher (uses built-in `http.server`, `socketserver`, `json`, `subprocess`)

### 2. **LaTeX Compiler Engine**
- **Tectonic** (Recommended): Native single-binary TeX engine that automatically downloads required packages.
- **TeX Live / pdfLaTeX** (Fallback): Standard `pdflatex` installation.

---

## 🚀 Quick Start Guide

### Step 1: Clone the Repository
```bash
git clone https://github.com/venkateshvaddadi/AI-Overleaf.git
cd AI-Overleaf
```

### Step 2: Start the Web Server
Launch the multi-threaded backend server:
```bash
python3 server.py
```

### Step 3: Open in Browser
Open your browser and navigate to:
```text
http://localhost:8090/
```
*(Or access from any device on your local network via `http://<YOUR_IP_ADDRESS>:8090/`)*

---

## 📂 Project Architecture

```text
AI-Overleaf/
├── server.py               # Multi-threaded Python HTTP API & Tectonic compiler backend
├── index.html              # Main single-page web app UI structure
├── styles.css              # Glassmorphism dark mode theme design system & utilities
├── app.js                  # Frontend state engine, CodeMirror editor, & Inverse Search
├── verify_compilation.py   # Automated backend compilation & fault-tolerance verification suite
├── projects_db/            # Persistent disk storage for user projects, files, & cached PDFs
└── README.md               # User documentation & setup guide
```

---

## 💻 How to Use

### 1. **Navigating Projects**
- From the **Home Dashboard**, click **Open Editor** on any project card or click **+ New Project** to create a new paper.
- Click the **`<i class="fa-solid fa-house"></i> Home`** button or the **`AI-Overleaf`** brand logo in the editor header at any time to save your work and return to the Home Dashboard.

### 2. **Editing & Compiling**
- Select any `.tex` file in the **Project Files** sidebar.
- Press `Ctrl+S` or `Cmd+S` (or click **Compile**) to recompile.
- If syntax errors occur, check the **Compiler Log** tab while keeping your PDF preview visible in the **PDF View** pane.

### 3. **PDF-to-Editor Inverse Search**
- Click or double-click any paragraph, heading, or line in the **PDF View** or **Quick HTML View**.
- The editor cursor will jump to that exact line number, scroll into view, and temporarily highlight the target line.

---

## 👨‍💻 Author & Attribution
- **Author**: Venkatesh Vaddadi
- **Repository**: [https://github.com/venkateshvaddadi/AI-Overleaf](https://github.com/venkateshvaddadi/AI-Overleaf)
