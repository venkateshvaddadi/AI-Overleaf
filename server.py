# Overleaf AI LaTeX Studio Pro - Persistent Backend Database & Native Tectonic Compiler
import http.server
import socketserver
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import threading

PORT = 8090
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TECTONIC_BIN = '/home/medimg/.gemini/antigravity/scratch/texenv/bin/tectonic'

# Thread-safe status map for GitHub background sync
sync_status_map = {}
sync_status_lock = threading.Lock()

# Backend Database & Disk Storage Configuration
DB_DIR = os.path.join(DIRECTORY, 'projects_db')
METADATA_FILE = os.path.join(DB_DIR, 'projects.json')

def is_user_content_file(rel_path):
    if not rel_path or not isinstance(rel_path, str):
        return False
    norm = rel_path.replace('\\', '/')
    parts = norm.split('/')
    for part in parts:
        if part.startswith('.'):
            return False
        if part in ['__pycache__', 'node_modules', '.venv', 'venv']:
            return False
    filename = parts[-1]
    if filename in ['last_compiled.pdf']:
        return False
    return True

def init_db():
    os.makedirs(DB_DIR, exist_ok=True)
    if not os.path.exists(METADATA_FILE):
        initial_projects = {
            'proj_spinet': {
                'id': 'proj_spinet',
                'name': 'SpiNet_QSM_Paper',
                'description': 'Model-based Deep Learning with Schatten p-norm Regularization for QSM',
                'created_at': '2026-09-06 14:00',
                'modified_at': 'Just now',
                'favorite': True,
                'main_file': 'main.tex',
                'file_count': 3
            },
            'proj_ieee': {
                'id': 'proj_ieee',
                'name': 'IEEE_Trans_Paper',
                'description': 'High-Throughput Deep Learning Medical Image Reconstruction',
                'created_at': '2026-09-05 10:30',
                'modified_at': '1 day ago',
                'favorite': False,
                'main_file': 'main.tex',
                'file_count': 1
            }
        }
        
        # Seed default project directories on disk
        spinet_dir = os.path.join(DB_DIR, 'proj_spinet')
        os.makedirs(spinet_dir, exist_ok=True)
        with open(os.path.join(spinet_dir, 'main.tex'), 'w', encoding='utf-8') as f:
            f.write(r"""\documentclass{article}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{booktabs}
\usepackage{graphicx}

\title{SpiNet-QSM: Model-based Deep Learning with Schatten p-norm Regularization for Quantitative Susceptibility Mapping}
\author{Vaddadi Venkatesh \and Phaneendra K. Yalavarthy}
\date{\today}

\begin{document}

\maketitle

\begin{abstract}
Quantitative susceptibility mapping (QSM) provides an estimation of the tissue magnetic susceptibility from MR phase measurements. This paper presents SpiNet-QSM, a Schatten p-norm regularized deep model for dipole inversion.
\end{abstract}

\section{Introduction}
Quantitative susceptibility mapping (QSM) is a magnetic resonance imaging (MRI) technique.

\section{Methods}
SpiNet solves the inverse problem through majorization-minimization unrolled iterations.

\section{Conclusion}
Local deep learning models enable fast, confidential LaTeX compilation and research workflow.

\end{document}""")

        with open(os.path.join(spinet_dir, 'references.bib'), 'w', encoding='utf-8') as f:
            f.write(r"""@article{venkatesh2026spinet,
  title={SpiNet-QSM: Model-based Deep Learning},
  author={Venkatesh, Vaddadi and Yalavarthy, Phaneendra K.},
  journal={IEEE Transactions on Medical Imaging},
  year={2026}
}""")

        with open(os.path.join(spinet_dir, 'custom.sty'), 'w', encoding='utf-8') as f:
            f.write(r"""% Custom Package
\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{custom}[2026/09/06 Custom Paper Style]""")

        ieee_dir = os.path.join(DB_DIR, 'proj_ieee')
        os.makedirs(ieee_dir, exist_ok=True)
        with open(os.path.join(ieee_dir, 'main.tex'), 'w', encoding='utf-8') as f:
            f.write(r"""\documentclass{article}
\title{IEEE Transactions Study}
\author{Research Author}
\begin{document}
\maketitle
\section{Introduction}
Content here.
\end{document}""")

        save_metadata(initial_projects)

def load_metadata():
    init_db()
    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_metadata(data):
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def run_bg_github_sync(proj_id, token, repo_url, commit_msg, auto_sync, files):
    def update_status(status=None, progress=None, step=None, synced_count=None, files_count=None, error=None, log=None, last_synced=None):
        with sync_status_lock:
            st = sync_status_map.get(proj_id, {}).copy()
            if status is not None: st['status'] = status
            if progress is not None: st['progress'] = progress
            if step is not None: st['step'] = step
            if synced_count is not None: st['synced_count'] = synced_count
            if files_count is not None: st['files_count'] = files_count
            if error is not None: st['error'] = error
            if log is not None: st['log'] = log
            if last_synced is not None: st['last_synced'] = last_synced
            sync_status_map[proj_id] = st

    try:
        total_files = len(files) if files else 0
        update_status(status='syncing', progress=5, step='Writing project files to disk...', files_count=total_files, synced_count=0)

        proj_dir = os.path.join(DB_DIR, proj_id)
        os.makedirs(proj_dir, exist_ok=True)

        # Write current files to disk with step updates
        import base64
        written = 0
        for rel_path, content in files.items():
            if rel_path.startswith('.git') or '/.git' in rel_path or '\\.git' in rel_path:
                continue

            full_path = os.path.join(proj_dir, rel_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)

            ext = os.path.splitext(rel_path)[1].lower()
            is_binary = ext in ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.svg', '.eps']

            if isinstance(content, str) and content.startswith('data:') and ';base64,' in content:
                try:
                    b64_data = content.split(';base64,')[1]
                    raw_b = base64.b64decode(b64_data)
                    with open(full_path, 'wb') as f:
                        f.write(raw_b)
                    written += 1
                    prog = min(40, int(5 + (written / max(1, total_files)) * 35))
                    update_status(progress=prog, synced_count=written, step=f'Writing {rel_path} ({written}/{total_files})...')
                    continue
                except Exception:
                    pass

            if not is_binary and content != '[Binary Asset]':
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content if isinstance(content, str) else '')
            written += 1
            prog = min(40, int(5 + (written / max(1, total_files)) * 35))
            update_status(progress=prog, synced_count=written, step=f'Writing {rel_path} ({written}/{total_files})...')

        # Create .gitignore for space optimization (skip temp logs and last_compiled.pdf)
        update_status(progress=45, step='Configuring .gitignore space optimization rules...')
        gitignore_path = os.path.join(proj_dir, '.gitignore')
        if not os.path.exists(gitignore_path):
            with open(gitignore_path, 'w', encoding='utf-8') as f:
                f.write("*.aux\n*.log\n*.out\n*.toc\n*.synctex.gz\n*.fls\n*.fdb_latexmk\nlast_compiled.pdf\ntemp.tex\n")

        # Clean remote URL for authenticated HTTPS push
        clean_repo = repo_url.replace('https://', '').replace('http://', '')
        if '@' in clean_repo:
            clean_repo = clean_repo.split('@')[-1]
        
        auth_repo_url = f"https://x-access-token:{token}@{clean_repo}"

        # Git operations
        update_status(progress=55, step='Initializing local Git repository...')
        if not os.path.exists(os.path.join(proj_dir, '.git')):
            subprocess.run(['git', 'init'], cwd=proj_dir, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            subprocess.run(['git', 'config', 'user.name', 'AI-Overleaf Sync'], cwd=proj_dir)
            subprocess.run(['git', 'config', 'user.email', 'sync@ai-overleaf.local'], cwd=proj_dir)

        update_status(progress=70, step='Staging & committing local changes...')
        subprocess.run(['git', 'add', '-A'], cwd=proj_dir, check=True)

        status_res = subprocess.run(['git', 'status', '--porcelain'], cwd=proj_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if status_res.stdout.strip():
            subprocess.run(['git', 'commit', '-m', commit_msg], cwd=proj_dir, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        update_status(progress=85, step='Pushing commits to remote GitHub repository...')
        push_res = subprocess.run(['git', 'push', auth_repo_url, 'HEAD:main'], cwd=proj_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if push_res.returncode != 0:
            push_res = subprocess.run(['git', 'push', auth_repo_url, 'HEAD:master'], cwd=proj_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        if push_res.returncode == 0:
            metadata = load_metadata()
            ts = time.strftime('%Y-%m-%d %H:%M:%S')
            if proj_id in metadata:
                metadata[proj_id]['github_token'] = token
                metadata[proj_id]['github_repo'] = repo_url
                metadata[proj_id]['github_autosync'] = auto_sync
                metadata[proj_id]['github_last_synced'] = ts
                save_metadata(metadata)

            update_status(
                status='completed',
                progress=100,
                step='Successfully synced all files to GitHub repository!',
                last_synced=ts,
                log=push_res.stdout + push_res.stderr or 'Push completed cleanly.'
            )
        else:
            err_msg = 'GitHub push failed. Please verify repository URL and PAT permissions.'
            update_status(
                status='failed',
                progress=100,
                step=f'Push error: {err_msg}',
                error=err_msg,
                log=push_res.stderr or push_res.stdout
            )
    except Exception as git_err:
        update_status(
            status='failed',
            progress=100,
            step=f'Sync Error: {str(git_err)}',
            error=str(git_err),
            log=str(git_err)
        )

class OverleafServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Compiler-Log, X-Compiler-Error')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/projects':
            params = urllib.parse.parse_qs(parsed.query)
            proj_id = params.get('id', [None])[0]
            tab = params.get('tab', ['active'])[0]
            metadata = load_metadata()

            if proj_id:
                if proj_id in metadata:
                    proj = metadata[proj_id]
                    meta_only = params.get('meta_only', ['false'])[0] == 'true'
                    proj_dir = os.path.join(DB_DIR, proj_id)

                    if meta_only:
                        user_files = []
                        if os.path.exists(proj_dir):
                            for root, _, files in os.walk(proj_dir):
                                for fname in files:
                                    full_path = os.path.join(root, fname)
                                    rel_path = os.path.relpath(full_path, proj_dir)
                                    if is_user_content_file(rel_path):
                                        user_files.append(rel_path)
                        self.send_json(200, {
                            'id': proj_id,
                            'name': proj.get('name'),
                            'updated_at': proj.get('updated_at', 0),
                            'version': proj.get('version', 0),
                            'file_count': len(user_files),
                            'files': user_files
                        })
                        return

                    files_obj = {}
                    if os.path.exists(proj_dir):
                        for root, _, files in os.walk(proj_dir):
                            for fname in files:
                                full_path = os.path.join(root, fname)
                                rel_path = os.path.relpath(full_path, proj_dir)
                                if not is_user_content_file(rel_path):
                                    continue
                                ext = os.path.splitext(rel_path)[1].lower()
                                is_binary = ext in ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.svg', '.eps', '.bmp', '.ico']
                                if is_binary:
                                    import base64
                                    try:
                                        with open(full_path, 'rb') as f:
                                            raw_b = f.read()
                                        b64_bytes = base64.b64encode(raw_b).decode('utf-8')
                                        mime = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else ('image/png' if ext == '.png' else ('image/gif' if ext == '.gif' else ('image/svg+xml' if ext == '.svg' else ('application/pdf' if ext == '.pdf' else 'application/octet-stream'))))
                                        files_obj[rel_path] = f'data:{mime};base64,{b64_bytes}'
                                    except Exception:
                                        files_obj[rel_path] = '[Binary Asset]'
                                else:
                                    try:
                                        with open(full_path, 'r', encoding='utf-8') as f:
                                            files_obj[rel_path] = f.read()
                                    except UnicodeDecodeError:
                                        import base64
                                        with open(full_path, 'rb') as f:
                                            raw_b = f.read()
                                        b64_bytes = base64.b64encode(raw_b).decode('utf-8')
                                        files_obj[rel_path] = f'data:application/octet-stream;base64,{b64_bytes}'
                    proj['files'] = files_obj
                    proj['file_count'] = len(files_obj)
                    self.send_json(200, proj)
                else:
                    self.send_json(404, {'error': 'Project not found'})
            else:
                # Filter by dashboard tab lifecycle state & update file counts
                all_projs = list(metadata.values())
                for p in all_projs:
                    pid = p.get('id')
                    pdir = os.path.join(DB_DIR, pid)
                    if os.path.exists(pdir):
                        user_files = []
                        for root, _, files in os.walk(pdir):
                            for fname in files:
                                rp = os.path.relpath(os.path.join(root, fname), pdir)
                                if is_user_content_file(rp):
                                    user_files.append(rp)
                        p['file_count'] = len(user_files)

                if tab == 'archived':
                    proj_list = [p for p in all_projs if p.get('archived', False) and not p.get('deleted_at')]
                elif tab == 'trash':
                    proj_list = [p for p in all_projs if p.get('deleted_at') is not None]
                elif tab == 'shared':
                    proj_list = [p for p in all_projs if p.get('shared', False) and not p.get('deleted_at')]
                elif tab == 'all':
                    proj_list = all_projs
                else:  # 'active' (default)
                    proj_list = [p for p in all_projs if not p.get('archived', False) and not p.get('deleted_at')]

                self.send_json(200, proj_list)
            return

        elif parsed.path == '/api/projects/file':
            params = urllib.parse.parse_qs(parsed.query)
            proj_id = params.get('id', [None])[0]
            rel_file = params.get('file', [None])[0]
            if proj_id and rel_file:
                target_path = os.path.normpath(os.path.join(DB_DIR, proj_id, rel_file))
                proj_dir = os.path.abspath(os.path.join(DB_DIR, proj_id))
                if target_path.startswith(proj_dir) and os.path.exists(target_path) and os.path.isfile(target_path):
                    ext = os.path.splitext(target_path)[1].lower()
                    mime = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else ('image/png' if ext == '.png' else ('image/gif' if ext == '.gif' else ('image/svg+xml' if ext == '.svg' else ('application/pdf' if ext == '.pdf' else 'application/octet-stream'))))
                    try:
                        with open(target_path, 'rb') as f:
                            data = f.read()
                        self.send_response(200)
                        self.send_header('Content-Type', mime)
                        self.send_header('Content-Length', str(len(data)))
                        self.send_header('Cache-Control', 'public, max-age=3600')
                        self.end_headers()
                        self.wfile.write(data)
                        return
                    except Exception as e:
                        self.send_json(500, {'error': str(e)})
                        return
            self.send_json(404, {'error': 'File not found'})
            return

        elif parsed.path == '/api/projects/download':
            params = urllib.parse.parse_qs(parsed.query)
            proj_id = params.get('id', [None])[0]
            metadata = load_metadata()
            if not proj_id or proj_id not in metadata:
                self.send_json(404, {'error': 'Project not found.'})
                return
            
            proj = metadata[proj_id]
            proj_name = proj.get('name', 'project').replace(' ', '_')
            proj_dir = os.path.join(DB_DIR, proj_id)

            if not os.path.exists(proj_dir):
                self.send_json(404, {'error': 'Project directory does not exist on disk.'})
                return

            import zipfile, io
            mem_zip = io.BytesIO()
            with zipfile.ZipFile(mem_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
                for root, _, files in os.walk(proj_dir):
                    for fname in files:
                        full_p = os.path.join(root, fname)
                        rel_p = os.path.relpath(full_p, proj_dir)
                        if not is_user_content_file(rel_p):
                            continue
                        zf.write(full_p, rel_p)
            
            mem_zip.seek(0)
            zip_bytes = mem_zip.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', f'attachment; filename="{proj_name}.zip"')
            self.send_header('Content-Length', str(len(zip_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(zip_bytes)
            return

        elif parsed.path == '/api/projects/github-sync-status':
            params = urllib.parse.parse_qs(parsed.query)
            proj_id = params.get('id', [None])[0]
            with sync_status_lock:
                st = sync_status_map.get(proj_id, {'status': 'idle', 'progress': 0, 'step': 'Idle', 'files_count': 0, 'synced_count': 0}).copy()
            self.send_json(200, st)
            return

        elif parsed.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        super().do_GET()

    def read_body_json(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length <= 0:
            return {}
        try:
            raw_body = self.rfile.read(content_length)
            return json.loads(raw_body.decode('utf-8', errors='replace'))
        except Exception as e:
            print(f"Error reading body json ({content_length} bytes):", e)
            return {}

    def do_POST(self):
        if self.path == '/api/projects/create':
            data = self.read_body_json()
            name = data.get('name', 'New_Project').strip()
            description = data.get('description', 'LaTeX Research Paper').strip()

            proj_id = 'proj_' + str(int(time.time())) + '_' + str(os.urandom(3).hex())
            proj_dir = os.path.join(DB_DIR, proj_id)
            os.makedirs(proj_dir, exist_ok=True)

            main_content = f"\\documentclass{{article}}\n\\usepackage{{amsmath}}\n\\title{{{name}}}\n\\author{{Research Author}}\n\\date{{\\today}}\n\n\\begin{{document}}\n\n\\maketitle\n\n\\section{{Introduction}}\nWrite your paper content here.\n\n\\end{{document}}"
            with open(os.path.join(proj_dir, 'main.tex'), 'w', encoding='utf-8') as f:
                f.write(main_content)
            with open(os.path.join(proj_dir, 'references.bib'), 'w', encoding='utf-8') as f:
                f.write("% References Bibliography\n")

            metadata = load_metadata()
            new_proj = {
                'id': proj_id,
                'name': name,
                'description': description,
                'created_at': time.strftime('%Y-%m-%d %H:%M'),
                'modified_at': 'Just now',
                'favorite': False,
                'main_file': 'main.tex',
                'file_count': 2
            }
            metadata[proj_id] = new_proj
            save_metadata(metadata)

            new_proj['files'] = {
                'main.tex': main_content,
                'references.bib': "% References Bibliography\n"
            }
            self.send_json(200, new_proj)
            return

        elif self.path == '/api/projects/save':
            data = self.read_body_json()
            proj_id = data.get('id')
            files = data.get('files', {})
            main_file = data.get('main_file', 'main.tex')
            name = data.get('name')

            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                proj_dir = os.path.join(DB_DIR, proj_id)
                # Safely update files without nuking existing binary disk assets
                os.makedirs(proj_dir, exist_ok=True)

                import base64
                for rel_path, content in files.items():
                    if rel_path.startswith('.git') or '/.git' in rel_path or '\\.git' in rel_path:
                        continue

                    full_path = os.path.join(proj_dir, rel_path)
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)

                    ext = os.path.splitext(rel_path)[1].lower()
                    is_binary = ext in ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.svg', '.eps']

                    if isinstance(content, str) and content.startswith('data:') and ';base64,' in content:
                        try:
                            b64_data = content.split(';base64,')[1]
                            raw_b = base64.b64decode(b64_data)
                            with open(full_path, 'wb') as f:
                                f.write(raw_b)
                            continue
                        except Exception:
                            pass

                    if is_binary or content == '[Binary Asset]':
                        # Do not overwrite existing binary disk file with string placeholders
                        continue

                    with open(full_path, 'w', encoding='utf-8') as f:
                        f.write(content if isinstance(content, str) else '')

                now_ms = int(time.time() * 1000)
                metadata[proj_id]['modified_at'] = 'Just now'
                metadata[proj_id]['updated_at'] = now_ms
                metadata[proj_id]['version'] = metadata[proj_id].get('version', 0) + 1
                metadata[proj_id]['file_count'] = len(files)
                metadata[proj_id]['main_file'] = main_file
                if name:
                    metadata[proj_id]['name'] = name
                save_metadata(metadata)
                self.send_json(200, {'status': 'saved', 'modified_at': 'Just now', 'updated_at': now_ms, 'version': metadata[proj_id]['version']})
            else:
                self.send_json(404, {'error': 'Project not found'})
            return

        elif self.path == '/api/projects/archive':
            data = self.read_body_json()
            proj_id = data.get('id')
            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                metadata[proj_id]['archived'] = True
                metadata[proj_id]['archived_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                save_metadata(metadata)
                self.send_json(200, {'status': 'archived', 'project': metadata[proj_id]})
            else:
                self.send_json(404, {'error': 'Project not found'})
            return

        elif self.path == '/api/projects/restore':
            data = self.read_body_json()
            proj_id = data.get('id')
            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                metadata[proj_id]['archived'] = False
                metadata[proj_id]['archived_at'] = None
                metadata[proj_id]['deleted_at'] = None
                save_metadata(metadata)
                self.send_json(200, {'status': 'restored', 'project': metadata[proj_id]})
            else:
                self.send_json(404, {'error': 'Project not found'})
            return

        elif self.path == '/api/projects/trash':
            data = self.read_body_json()
            proj_id = data.get('id')
            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                metadata[proj_id]['deleted_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                save_metadata(metadata)
                self.send_json(200, {'status': 'trashed', 'project': metadata[proj_id]})
            else:
                self.send_json(404, {'error': 'Project not found'})
            return

        elif self.path == '/api/projects/delete':
            data = self.read_body_json()
            proj_id = data.get('id')

            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                del metadata[proj_id]
                save_metadata(metadata)
                proj_dir = os.path.join(DB_DIR, proj_id)
                if os.path.exists(proj_dir):
                    shutil.rmtree(proj_dir)
                self.send_json(200, {'status': 'deleted'})
            else:
                self.send_json(404, {'error': 'Project not found'})
            return

        elif self.path == '/api/projects/import-zip':
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length)
            
            proj_name = "Imported_Project"
            description = "Imported LaTeX Template Archive"
            files_obj = {}
            main_file = "main.tex"

            try:
                data = json.loads(raw_body.decode('utf-8'))
                proj_name = data.get('name', 'Imported_Project').strip()
                description = data.get('description', 'Imported LaTeX Template Archive').strip()
                files_obj = data.get('files', {})
            except Exception:
                import io, zipfile, base64
                zip_buffer = io.BytesIO(raw_body)
                try:
                    with zipfile.ZipFile(zip_buffer, 'r') as zip_ref:
                        infolist = zip_ref.infolist()
                        
                        # Detect if ZIP has a single top-level wrapper folder
                        top_dirs = set()
                        for info in infolist:
                            if not info.filename:
                                continue
                            parts = info.filename.strip('/').split('/')
                            if len(parts) > 1:
                                top_dirs.add(parts[0])
                        
                        strip_prefix = ""
                        if len(top_dirs) == 1:
                            single_top = list(top_dirs)[0]
                            strip_prefix = single_top + '/'

                        for info in infolist:
                            if info.is_dir():
                                continue
                            orig_filename = info.filename
                            if orig_filename.startswith('__MACOSX') or '/.' in orig_filename or orig_filename.startswith('.'):
                                continue

                            clean_path = orig_filename
                            if strip_prefix and clean_path.startswith(strip_prefix):
                                clean_path = clean_path[len(strip_prefix):]

                            if not clean_path or not is_user_content_file(clean_path):
                                continue

                            ext = os.path.splitext(clean_path)[1].lower()
                            is_binary = ext in ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.svg', '.eps', '.bmp', '.ico', '.bst', '.cls', '.sty', '.ttf', '.woff', '.otf']

                            raw_bytes = zip_ref.read(info.filename)

                            if is_binary:
                                b64_str = base64.b64encode(raw_bytes).decode('utf-8')
                                mime = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else ('image/png' if ext == '.png' else ('image/gif' if ext == '.gif' else ('image/svg+xml' if ext == '.svg' else ('application/pdf' if ext == '.pdf' else 'application/octet-stream'))))
                                files_obj[clean_path] = f'data:{mime};base64,{b64_str}'
                            else:
                                try:
                                    files_obj[clean_path] = raw_bytes.decode('utf-8')
                                except UnicodeDecodeError:
                                    try:
                                        files_obj[clean_path] = raw_bytes.decode('latin-1')
                                    except Exception:
                                        b64_str = base64.b64encode(raw_bytes).decode('utf-8')
                                        files_obj[clean_path] = f'data:application/octet-stream;base64,{b64_str}'
                except Exception as zip_err:
                    self.send_json(400, {'error': f'Invalid ZIP archive: {str(zip_err)}'})
                    return

            if not files_obj:
                self.send_json(400, {'error': 'No valid files found in ZIP archive'})
                return

            # Overleaf Template Master TeX Detection
            detected_main = None
            for fname, fcontent in files_obj.items():
                if fname == 'main.tex':
                    detected_main = 'main.tex'
                    break
                elif fname.endswith('.tex') and isinstance(fcontent, str) and '\\documentclass' in fcontent:
                    if not detected_main or 'cv' in fname.lower() or 'resume' in fname.lower() or 'paper' in fname.lower():
                        detected_main = fname
            
            if detected_main:
                main_file = detected_main
            else:
                tex_files = [f for f in files_obj.keys() if f.endswith('.tex')]
                if tex_files:
                    main_file = tex_files[0]

            proj_id = 'proj_' + str(int(time.time())) + '_' + str(os.urandom(3).hex())
            proj_dir = os.path.join(DB_DIR, proj_id)
            os.makedirs(proj_dir, exist_ok=True)

            for rel_path, content in files_obj.items():
                full_path = os.path.join(proj_dir, rel_path)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                if isinstance(content, str) and content.startswith('data:') and ';base64,' in content:
                    try:
                        b64_data = content.split(';base64,')[1]
                        raw_b = base64.b64decode(b64_data)
                        with open(full_path, 'wb') as f:
                            f.write(raw_b)
                        continue
                    except Exception:
                        pass
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content if isinstance(content, str) else '')

            metadata = load_metadata()
            new_proj = {
                'id': proj_id,
                'name': proj_name,
                'description': description,
                'created_at': time.strftime('%Y-%m-%d %H:%M'),
                'modified_at': 'Just now',
                'favorite': False,
                'main_file': main_file,
                'file_count': len(files_obj)
            }
            metadata[proj_id] = new_proj
            save_metadata(metadata)

            new_proj['files'] = files_obj
            self.send_json(200, new_proj)
            return

        elif self.path == '/api/projects/toggle-favorite':
            data = self.read_body_json()
            proj_id = data.get('id')

            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                metadata[proj_id]['favorite'] = not metadata[proj_id].get('favorite', False)
                save_metadata(metadata)
                self.send_json(200, {'favorite': metadata[proj_id]['favorite']})
            else:
                self.send_json(404, {'error': 'Project not found'})
            return

        elif self.path == '/api/projects/github-sync':
            data = self.read_body_json()
            proj_id = data.get('id')
            token = data.get('github_token', '').strip()
            repo_url = data.get('repo_url', '').strip()
            commit_msg = data.get('commit_message', '').strip() or f"Auto-sync: LaTeX update {time.strftime('%Y-%m-%d %H:%M')}"
            auto_sync = data.get('auto_sync', False)
            files = data.get('files', {})

            if not proj_id or not token or not repo_url:
                self.send_json(400, {'error': 'Missing project ID, GitHub token, or repository URL.'})
                return

            metadata = load_metadata()
            if proj_id not in metadata:
                self.send_json(404, {'error': 'Project not found.'})
                return

            # Check if sync is already running in background
            with sync_status_lock:
                curr_status = sync_status_map.get(proj_id, {}).get('status')
                if curr_status == 'syncing':
                    self.send_json(200, {'status': 'syncing', 'message': 'Sync is already running in background.'})
                    return
                
                sync_status_map[proj_id] = {
                    'status': 'syncing',
                    'progress': 5,
                    'step': 'Preparing files for background git sync...',
                    'files_count': len(files),
                    'synced_count': 0,
                    'error': None,
                    'log': '',
                    'last_synced': ''
                }

            # Launch background thread for non-blocking sync
            t = threading.Thread(
                target=run_bg_github_sync,
                args=(proj_id, token, repo_url, commit_msg, auto_sync, files),
                daemon=True
            )
            t.start()

            self.send_json(200, {'status': 'started', 'message': 'GitHub sync started in background thread.'})
            return

        elif self.path == '/api/compile':
            data = self.read_body_json()
            
            files = data.get('files', {})
            main_file = data.get('main_file', 'main.tex')
            title = data.get('title', 'document')
            proj_id = data.get('id')
            engine = data.get('engine', 'tectonic')
            
            if 'sn-jnl.cls' not in files:
                sn_cls_path = os.path.join(DIRECTORY, 'sn-jnl.cls')
                if os.path.exists(sn_cls_path):
                    with open(sn_cls_path, 'r', encoding='utf-8') as f:
                        files['sn-jnl.cls'] = f.read()

            pdf_bytes, log_output, err = self.compile_latex_project(files, main_file, proj_id=proj_id, engine=engine)
            
            if pdf_bytes:
                import base64
                b64_log = base64.b64encode((log_output or '').encode('utf-8')).decode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'attachment; filename="{title}.pdf"')
                self.send_header('Content-Length', str(len(pdf_bytes)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Expose-Headers', 'X-Compiler-Log, X-Compiler-Error')
                self.send_header('X-Compiler-Log', b64_log)
                self.send_header('X-Compiler-Error', '1' if err else '0')
                self.end_headers()
                self.wfile.write(pdf_bytes)
            else:
                self.send_json(400, {'error': err or 'Compilation failed completely', 'log': log_output or ''})
            return

    def send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def compile_latex_project(self, files, main_file, proj_id=None, engine='tectonic'):
        if 'sn-jnl.cls' not in files:
            sn_cls_path = os.path.join(DIRECTORY, 'sn-jnl.cls')
            if os.path.exists(sn_cls_path):
                try:
                    with open(sn_cls_path, 'r', encoding='utf-8') as f:
                        files['sn-jnl.cls'] = f.read()
                except Exception:
                    pass

        def save_and_return_pdf(pdf_b, log_txt, err_txt):
            if proj_id and pdf_b:
                p_dir = os.path.join(DB_DIR, proj_id)
                os.makedirs(p_dir, exist_ok=True)
                cache_path = os.path.join(p_dir, 'last_compiled.pdf')
                try:
                    with open(cache_path, 'wb') as cf:
                        cf.write(pdf_b)
                except Exception:
                    pass
            return pdf_b, log_txt, err_txt

        def get_fallback_cached_pdf(log_txt, err_reason):
            if proj_id:
                cache_path = os.path.join(DB_DIR, proj_id, 'last_compiled.pdf')
                if os.path.exists(cache_path):
                    try:
                        with open(cache_path, 'rb') as cf:
                            b = cf.read()
                            if b:
                                return b, log_txt + f'\n\n⚠️ LaTeX Warning ({err_reason}). Showing last compiled PDF preview for this project.', 'LaTeX errors'
                    except Exception:
                        pass

            return None, log_txt, err_reason

        with tempfile.TemporaryDirectory() as tmpdir:
            import re, struct, zlib, base64
            target_main_file = main_file
            is_active_root = target_main_file and target_main_file in files and isinstance(files.get(target_main_file), str) and '\\documentclass' in files[target_main_file]
            active_file_fallback = not is_active_root

            if is_active_root:
                target_main_file = main_file
            else:
                found_root = None
                for fname, fcontent in files.items():
                    if fname.endswith('.tex') and isinstance(fcontent, str) and '\\documentclass' in fcontent:
                        found_root = fname
                        break
                if found_root:
                    target_main_file = found_root
                elif main_file and main_file.endswith('.tex'):
                    target_main_file = main_file
                else:
                    for fname in files.keys():
                        if fname.endswith('.tex'):
                            target_main_file = fname
                            break

            for filepath, content in files.items():
                full_path = os.path.join(tmpdir, filepath)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)

                ext = os.path.splitext(filepath)[1].lower()
                is_binary = ext in ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.svg', '.eps']

                if isinstance(content, str) and content.startswith('data:') and ';base64,' in content:
                    try:
                        b64_data = content.split(';base64,')[1]
                        binary_bytes = base64.b64decode(b64_data)
                        with open(full_path, 'wb') as f:
                            f.write(binary_bytes)
                        continue
                    except Exception:
                        pass

                if is_binary or content == '[Binary Asset]':
                    found_disk = False
                    if proj_id:
                        disk_p = os.path.join(DB_DIR, proj_id, filepath)
                        if os.path.exists(disk_p) and os.path.isfile(disk_p):
                            shutil.copy2(disk_p, full_path)
                            found_disk = True
                    if not found_disk:
                        for pid in os.listdir(DB_DIR):
                            disk_p = os.path.join(DB_DIR, pid, filepath)
                            if os.path.exists(disk_p) and os.path.isfile(disk_p):
                                shutil.copy2(disk_p, full_path)
                                found_disk = True
                                break
                    if found_disk:
                        continue

                    valid_png_b64 = "iVBORw0KGgoAAAANSU5QoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                    with open(full_path, 'wb') as f:
                        f.write(base64.b64decode(valid_png_b64))
                    continue

                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content if isinstance(content, str) else '')

            compilation_entry_file = target_main_file
            
            if main_file and main_file.endswith('.tex') and main_file in files:
                active_txt = files.get(main_file, '')
                if isinstance(active_txt, str) and '\\documentclass' not in active_txt:
                    standalone_wrapper_filename = f"__standalone_{os.path.basename(main_file)}"
                    norm_active = main_file.replace('\\', '/')
                    wrapper_content = f"\\documentclass{{article}}\n\\usepackage{{graphicx}}\n\\usepackage{{amsmath}}\n\\usepackage{{amssymb}}\n\\usepackage{{hyperref}}\n\\begin{{document}}\n\\input{{{norm_active}}}\n\\end{{document}}"
                    
                    wrapper_path = os.path.join(tmpdir, standalone_wrapper_filename)
                    with open(wrapper_path, 'w', encoding='utf-8') as f:
                        f.write(wrapper_content)
                    
                    compilation_entry_file = standalone_wrapper_filename

            main_filepath = os.path.join(tmpdir, compilation_entry_file)
            pdf_filepath = os.path.splitext(main_filepath)[0] + '.pdf'

            if not os.path.exists(main_filepath):
                return get_fallback_cached_pdf('', f'Main TeX file {target_main_file} not found')

            # Select Engine (pdflatex, xelatex, lualatex, or tectonic)
            if engine in ['pdflatex', 'xelatex', 'lualatex'] and shutil.which(engine):
                try:
                    cmd = [engine, '-interaction=nonstopmode', '-output-directory', tmpdir, main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output = f"Engine: {engine}\n\n" + stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, None)
                except Exception:
                    pass

            # Primary Engine: Tectonic (Overleaf CLSI Fast Pass)
            if os.path.exists(TECTONIC_BIN):
                log_output = 'Engine: Tectonic (Native Fast)\n\n'
                try:
                    cmd = [TECTONIC_BIN, '-Z', 'continue-on-errors', '-k', '--only-cached', main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=12)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output += stdout_str + '\n' + stderr_str

                    if not os.path.exists(pdf_filepath):
                        missing_sty = re.findall(r"File [`']([^`']+\.sty)[`'] not found", log_output)
                        if missing_sty:
                            for m_sty in set(missing_sty):
                                m_path = os.path.join(tmpdir, m_sty)
                                m_name = os.path.splitext(m_sty)[0]
                                if not os.path.exists(m_path):
                                    with open(m_path, 'w', encoding='utf-8') as fp:
                                        fp.write(f'% Auto stub for {m_name}\n\\NeedsTeXFormat{{LaTeX2e}}\n\\ProvidesPackage{{{m_name}}}[2026/09/06 Auto Stub]\n')
                            try:
                                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=12)
                                log_output += '\n--- Re-try pass after stubbing missing packages ---\n' + res.stdout.decode('utf-8', errors='ignore') + res.stderr.decode('utf-8', errors='ignore')
                            except Exception:
                                pass

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output or active_file_fallback
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))
                except Exception as e1:
                    log_output += f'\nPass 1 notice: {e1}\n'

                try:
                    cmd = [TECTONIC_BIN, '-Z', 'continue-on-errors', '-k', main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output += '\n--- Full Compilation Pass ---\n' + stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output or active_file_fallback
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))

                    # If PDF generation failed on current pass, return cached PDF preview if available
                    cached_pdf_bytes, cached_log, _ = get_fallback_cached_pdf(log_output, 'Compilation error')
                    if cached_pdf_bytes:
                        return cached_pdf_bytes, cached_log, 'LaTeX errors'
                    return None, log_output, 'Compilation error'
                except Exception as e2:
                    return get_fallback_cached_pdf(log_output + f'\nCompilation pass exception: {e2}', 'Compilation exception')
            elif os.path.exists('/usr/bin/pdflatex'):
                try:
                    cmd = ['pdflatex', '-interaction=nonstopmode', '-output-directory', tmpdir, main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output = stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))
                    return get_fallback_cached_pdf(log_output, stderr_str or 'Compilation error')
                except subprocess.TimeoutExpired:
                    return get_fallback_cached_pdf('pdflatex timed out', 'Compilation timed out')
            else:
                return get_fallback_cached_pdf('', 'No native PDF compiler installed')

if __name__ == '__main__':
    init_db()
    import socketserver
    from http.server import ThreadingHTTPServer
    socketserver.TCPServer.allow_reuse_address = True
    print(f'Overleaf Multi-Threaded Native Compiler & Database Server running on port {PORT}')
    try:
        httpd = ThreadingHTTPServer(('0.0.0.0', PORT), OverleafServer)
        httpd.serve_forever()
    except BaseException as err:
        print(f"Server shutting down: {err}")
