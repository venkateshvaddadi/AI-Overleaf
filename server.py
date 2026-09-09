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
import urllib.request
import threading
import re

PORT = 8090
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
ANTIGRAVITY_BASE_URL = os.environ.get('ANTIGRAVITY_BASE_URL', 'http://127.0.0.1:8000/v1').rstrip('/')
ANTIGRAVITY_API_KEY = os.environ.get('ANTIGRAVITY_API_KEY', '')
home_dir = os.path.expanduser('~')
local_tectonic = os.path.join(DIRECTORY, 'tools', 'tectonic', 'tectonic')
default_tectonic = os.path.join(home_dir, '.gemini/antigravity/scratch/texenv/bin/tectonic')
TECTONIC_BIN = (
    shutil.which('tectonic')
    or (local_tectonic if os.path.exists(local_tectonic) else None)
    or (default_tectonic if os.path.exists(default_tectonic) else default_tectonic)
)

# Thread-safe status map for GitHub background sync
sync_status_map = {}
sync_status_lock = threading.Lock()

# Backend Database & Disk Storage Configuration
DB_DIR = os.path.join(DIRECTORY, 'projects_db')
METADATA_FILE = os.path.join(DB_DIR, 'projects.json')

def safe_project_path(project_dir, relative_path):
    """Prevent directory traversal attacks by validating that target stays inside project_dir."""
    project_dir = os.path.realpath(project_dir)
    target = os.path.realpath(os.path.join(project_dir, relative_path.lstrip('/\\')))
    if not target.startswith(project_dir + os.sep) and target != project_dir:
        raise ValueError(f"Path traversal security violation: '{relative_path}' escapes project root")
    return target

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

def history_dir(project_id):
    return os.path.join(DB_DIR, project_id, '.history')

def create_project_snapshot(project_id, message, files, main_file):
    snapshot_root = history_dir(project_id)
    os.makedirs(snapshot_root, exist_ok=True)
    snapshot_id = f'{int(time.time() * 1000)}_{os.urandom(3).hex()}'
    snapshot = {
        'id': snapshot_id,
        'message': message or 'Snapshot update',
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'main_file': main_file,
        'files': {k: v for k, v in files.items() if is_user_content_file(k)}
    }
    snapshot_path = safe_project_path(snapshot_root, f'{snapshot_id}.json')
    with open(snapshot_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f)
    return {k: snapshot[k] for k in ('id', 'message', 'timestamp', 'main_file')}

def list_project_snapshots(project_id):
    root = history_dir(project_id)
    if not os.path.isdir(root):
        return []
    snapshots = []
    for filename in sorted(os.listdir(root), reverse=True):
        if not filename.endswith('.json'):
            continue
        try:
            with open(os.path.join(root, filename), 'r', encoding='utf-8') as f:
                snapshot = json.load(f)
            snapshots.append({k: snapshot.get(k) for k in ('id', 'message', 'timestamp', 'main_file')})
        except (OSError, ValueError):
            continue
    return snapshots

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

            try:
                full_path = safe_project_path(proj_dir, rel_path)
            except ValueError:
                continue
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

        elif parsed.path == '/api/projects/history':
            params = urllib.parse.parse_qs(parsed.query)
            proj_id = params.get('id', [None])[0]
            metadata = load_metadata()
            if not proj_id or proj_id not in metadata:
                self.send_json(404, {'error': 'Project not found'})
                return
            snapshot_id = params.get('snapshot', [None])[0]
            if snapshot_id:
                snapshot_path = safe_project_path(history_dir(proj_id), f'{snapshot_id}.json')
                if not os.path.exists(snapshot_path):
                    self.send_json(404, {'error': 'Snapshot not found'})
                    return
                with open(snapshot_path, 'r', encoding='utf-8') as f:
                    self.send_json(200, json.load(f))
            else:
                self.send_json(200, list_project_snapshots(proj_id))
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

        elif parsed.path == '/api/tags':
            try:
                req = urllib.request.Request('http://10.24.48.24:11435/api/tags', headers={'User-Agent': 'AI-Overleaf-Server'})
                with urllib.request.urlopen(req, timeout=1.5) as res:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(res.read())
                    return
            except Exception:
                pass
            self.send_json(200, {
                'models': [
                    {'name': 'qwen2.5:latest', 'details': {'family': 'qwen2', 'parameter_size': '7B'}},
                    {'name': 'deepseek-r1:latest', 'details': {'family': 'deepseek', 'parameter_size': '8B'}},
                    {'name': 'llama3.3:latest', 'details': {'family': 'llama', 'parameter_size': '70B'}},
                    {'name': 'ai-overleaf-local:latest', 'details': {'family': 'academic', 'parameter_size': 'Native'}}
                ]
            })
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
        if self.path in ['/api/projects/create', '/api/projects/new']:
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
            expected_version = data.get('expected_version')

            metadata = load_metadata()
            if proj_id and proj_id in metadata:
                current_version = metadata[proj_id].get('version', 0)
                if expected_version is not None and int(expected_version) != current_version:
                    self.send_json(409, {
                        'error': 'Project changed on the server. Reload or merge the newer version before saving.',
                        'version': current_version,
                        'updated_at': metadata[proj_id].get('updated_at', 0)
                    })
                    return
                proj_dir = os.path.join(DB_DIR, proj_id)
                # Safely update files without nuking existing binary disk assets
                os.makedirs(proj_dir, exist_ok=True)

                import base64
                for rel_path, content in files.items():
                    if rel_path.startswith('.git') or '/.git' in rel_path or '\\.git' in rel_path:
                        continue

                    try:
                        full_path = safe_project_path(proj_dir, rel_path)
                    except ValueError:
                        continue
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

        elif self.path == '/api/projects/history':
            data = self.read_body_json()
            proj_id = data.get('id')
            metadata = load_metadata()
            if not proj_id or proj_id not in metadata:
                self.send_json(404, {'error': 'Project not found'})
                return
            if data.get('action') == 'restore':
                snapshot_id = data.get('snapshot')
                snapshot_path = safe_project_path(history_dir(proj_id), f'{snapshot_id}.json')
                if not os.path.exists(snapshot_path):
                    self.send_json(404, {'error': 'Snapshot not found'})
                    return
                with open(snapshot_path, 'r', encoding='utf-8') as f:
                    snapshot = json.load(f)
                for rel_path, content in snapshot.get('files', {}).items():
                    full_path = safe_project_path(os.path.join(DB_DIR, proj_id), rel_path)
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    if isinstance(content, str):
                        with open(full_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                metadata[proj_id]['main_file'] = snapshot.get('main_file', metadata[proj_id].get('main_file', 'main.tex'))
                metadata[proj_id]['version'] = metadata[proj_id].get('version', 0) + 1
                metadata[proj_id]['updated_at'] = int(time.time() * 1000)
                save_metadata(metadata)
                self.send_json(200, {'status': 'restored', 'version': metadata[proj_id]['version']})
                return

            files = data.get('files', {})
            snapshot = create_project_snapshot(proj_id, data.get('message'), files, data.get('main_file', 'main.tex'))
            self.send_json(200, {'status': 'created', 'snapshot': snapshot})
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

                        total_extracted_size = 0
                        max_extracted_limit = 300 * 1024 * 1024  # 300 MB
                        max_file_count = 5000

                        if len(infolist) > max_file_count:
                            self.send_json(400, {'error': f'ZIP archive exceeds maximum file count limit ({max_file_count})'})
                            return

                        for info in infolist:
                            if info.is_dir():
                                continue
                            if info.file_size > 50 * 1024 * 1024:  # 50 MB per file limit
                                continue
                            total_extracted_size += info.file_size
                            if total_extracted_size > max_extracted_limit:
                                self.send_json(400, {'error': f'ZIP archive total uncompressed size exceeds limit (300 MB)'})
                                return

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
                try:
                    full_path = safe_project_path(proj_dir, rel_path)
                except ValueError:
                    continue
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
            self.send_json(200, {'status': 'syncing', 'message': 'Background GitHub sync started successfully.'})
            return

        elif self.path in ['/api/generate', '/api/ai/llm']:
            data = self.read_body_json()
            prompt = data.get('prompt', '') or data.get('system', '')
            is_stream = data.get('stream', False)
            model = data.get('model', '')

            if model == 'gpt-oss-120b-medium':
                antigravity_prompt = prompt
                if data.get('system'):
                    antigravity_prompt = f"{data['system']}\n\n{prompt}"
                antigravity_payload = {
                    'model': model,
                    'prompt': antigravity_prompt,
                    'max_tokens': data.get('max_tokens', 512),
                    'temperature': data.get('temperature', 0.2),
                    'stream': False
                }
                antigravity_headers = {'Content-Type': 'application/json'}
                if ANTIGRAVITY_API_KEY:
                    antigravity_headers['Authorization'] = f'Bearer {ANTIGRAVITY_API_KEY}'
                try:
                    antigravity_req = urllib.request.Request(
                        f'{ANTIGRAVITY_BASE_URL}/completions',
                        data=json.dumps(antigravity_payload).encode('utf-8'),
                        headers=antigravity_headers
                    )
                    with urllib.request.urlopen(antigravity_req, timeout=120.0) as res:
                        response_data = json.loads(res.read().decode('utf-8'))
                    choices = response_data.get('choices') or []
                    generated_text = choices[0].get('text', '') if choices else ''
                    self.send_json(200, {'response': generated_text, 'done': True, 'provider': 'antigravity'})
                    return
                except Exception as exc:
                    self.send_json(502, {'error': f'Antigravity GPT-OSS request failed: {exc}'})
                    return

            # Try proxying to local Ollama first with extended 60s timeout for local models
            try:
                ollama_req = urllib.request.Request(
                    'http://10.24.48.24:11435/api/generate',
                    data=json.dumps(data).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                with urllib.request.urlopen(ollama_req, timeout=60.0) as res:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/x-ndjson' if is_stream else 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    shutil.copyfileobj(res, self.wfile)
                    return
            except Exception:
                pass

            self.send_json(503, {
                'error': 'AI backend unavailable. Start the configured Ollama service and try again.'
            })
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
                # Keep response headers below common HTTP header-size limits.
                # The complete log remains available to the compiler workflow.
                header_log = (log_output or '')[-12000:]
                b64_log = base64.b64encode(header_log.encode('utf-8')).decode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'attachment; filename="{title}.pdf"')
                self.send_header('Content-Length', str(len(pdf_bytes)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Expose-Headers', 'X-Compiler-Log, X-Compiler-Error, X-Compiler-Stale, X-Compilation-Type')
                self.send_header('X-Compiler-Log', b64_log)
                self.send_header('X-Compiler-Error', '1' if err else '0')
                self.send_header('X-Compiler-Stale', '1' if err else '0')
                is_frag = main_file and main_file in files and '\\documentclass' not in str(files.get(main_file, ''))
                self.send_header('X-Compilation-Type', 'fragment' if is_frag else 'root')
                self.end_headers()
                self.wfile.write(pdf_bytes)
            else:
                self.send_json(400, {'error': err or 'Compilation failed completely', 'log': log_output or ''})
            return

        elif self.path == '/api/synctex':
            data = self.read_body_json()
            proj_id = data.get('id')
            main_file = data.get('main_file', 'main.tex')
            page = int(data.get('page', 1))
            x = float(data.get('x', 0))
            y = float(data.get('y', 0))
            if not proj_id:
                self.send_json(400, {'error': 'Project id is required'})
                return

            safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', main_file or 'main.tex')
            synctex_path = os.path.join(DB_DIR, proj_id, f'compiled_{safe_name}.synctex.gz')
            pdf_path = os.path.join(DB_DIR, proj_id, f'compiled_{safe_name}.pdf')
            if not os.path.exists(synctex_path) or not os.path.exists(pdf_path):
                self.send_json(404, {'error': 'No SyncTeX mapping is available. Compile the document first.'})
                return

            try:
                result = subprocess.run(
                    ['synctex', 'edit', '-o', f'{page}:{x}:{y}:{pdf_path}'],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    timeout=10, env={**os.environ, 'SYNCTEX': synctex_path}
                )
                output = result.stdout.decode('utf-8', errors='replace')
                match = re.search(r'Input:\s*(.+?)\s*\nLine:\s*(\d+)', output)
                if not match:
                    self.send_json(404, {'error': 'No source location found', 'raw': output[-2000:]})
                    return
                raw_source = match.group(1).strip().replace('\\', '/')
                source_file = raw_source
                project_dir = os.path.dirname(pdf_path)
                candidates = []
                for root, _, filenames in os.walk(project_dir):
                    for filename in filenames:
                        relative = os.path.relpath(os.path.join(root, filename), project_dir).replace('\\', '/')
                        if is_user_content_file(relative):
                            candidates.append(relative)
                for candidate in candidates:
                    if raw_source.endswith('/' + candidate) or raw_source == candidate:
                        source_file = candidate
                        break
                if source_file == raw_source and os.path.basename(raw_source) == os.path.basename(main_file):
                    source_file = main_file.replace('\\', '/')
                self.send_json(200, {'file': source_file, 'line': int(match.group(2)), 'raw': output[-2000:]})
            except Exception as exc:
                self.send_json(500, {'error': f'SyncTeX lookup failed: {exc}'})
            return

        elif self.path == '/api/compile-fix':
            data = self.read_body_json()
            files = data.get('files', {})
            main_file = data.get('main_file', 'main.tex')
            proj_id = data.get('id')
            engine = data.get('engine', 'tectonic')
            model = data.get('model', 'qwen3-coder:30b')
            max_attempts = max(1, min(int(data.get('max_attempts', 3)), 5))
            result = self.run_compile_fix_loop(files, main_file, proj_id, engine, model, max_attempts)
            self.send_json(200, result)
            return

    def send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def run_compile_fix_loop(self, files, main_file, proj_id, engine, model, max_attempts):
        """Compile, request one bounded line patch from Ollama, and verify it."""
        import base64
        working_files = dict(files) if isinstance(files, dict) else {}
        attempts = []

        for attempt in range(1, max_attempts + 1):
            pdf_bytes, log_output, err = self.compile_latex_project(
                working_files, main_file, proj_id=proj_id, engine=engine
            )
            attempt_info = {'attempt': attempt, 'error': err, 'log': log_output or ''}
            if not err:
                return {
                    'status': 'verified', 'attempts': attempts + [attempt_info],
                    'files': working_files, 'main_file': main_file,
                    'pdf_base64': base64.b64encode(pdf_bytes or b'').decode('ascii'),
                    'log': log_output or ''
                }

            attempts.append(attempt_info)
            if attempt == max_attempts:
                break

            source = working_files.get(main_file, '')
            if not isinstance(source, str):
                break
            prompt = f'''You are a LaTeX compiler repair agent. Return ONLY valid JSON.
Schema: {{"file":"{main_file}","start_line":number,"end_line":number,"replacement":"string","explanation":"string"}}
Rules: make the smallest necessary line-range patch; preserve user content; do not rewrite the document; line numbers are 1-based and inclusive; replacement may contain newlines.
Compiler log:
{(log_output or '')[-10000:]}

Failing file ({main_file}):
```latex
{source}
```'''
            try:
                request = urllib.request.Request(
                    'http://10.24.48.24:11435/api/generate',
                    data=json.dumps({'model': model, 'prompt': prompt, 'stream': False, 'format': 'json'}).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                with urllib.request.urlopen(request, timeout=120.0) as response:
                    ai_payload = json.loads(response.read().decode('utf-8'))
                patch_text = ai_payload.get('response', '')
                patch_text = patch_text.strip().removeprefix('```json').removesuffix('```').strip()
                patch = json.loads(patch_text)
                patch_file = patch.get('file', main_file)
                start_line = int(patch['start_line'])
                end_line = int(patch['end_line'])
                replacement = patch['replacement']
                target = working_files.get(patch_file)
                if not isinstance(target, str) or not isinstance(replacement, str):
                    raise ValueError('Patch file or replacement is invalid')
                lines = target.split('\n')
                if start_line < 1 or end_line < start_line or end_line > len(lines):
                    raise ValueError('Patch line range is outside the target file')
                working_files[patch_file] = '\n'.join(lines[:start_line - 1] + replacement.split('\n') + lines[end_line:])
                attempt_info['patch'] = {
                    'file': patch_file, 'start_line': start_line, 'end_line': end_line,
                    'replacement': replacement, 'explanation': patch.get('explanation', '')
                }
            except Exception as exc:
                attempt_info['patch_error'] = str(exc)
                break

        return {
            'status': 'failed', 'attempts': attempts, 'files': working_files,
            'main_file': main_file, 'log': attempts[-1]['log'] if attempts else ''
        }

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
                safe_file_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', main_file or 'main.tex')
                cache_path = os.path.join(p_dir, f'compiled_{safe_file_name}.pdf')
                try:
                    with open(cache_path, 'wb') as cf:
                        cf.write(pdf_b)
                except Exception:
                    pass
            return pdf_b, log_txt, err_txt

        def get_fallback_cached_pdf(log_txt, err_reason):
            if proj_id:
                p_dir = os.path.join(DB_DIR, proj_id)
                safe_file_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', main_file or 'main.tex')
                cache_path = os.path.join(p_dir, f'compiled_{safe_file_name}.pdf')
                if not os.path.exists(cache_path):
                    cache_path = os.path.join(p_dir, 'last_compiled.pdf')
                if os.path.exists(cache_path):
                    try:
                        with open(cache_path, 'rb') as cf:
                            b = cf.read()
                            if b:
                                return b, log_txt + f'\n\n⚠️ LaTeX Warning ({err_reason}). Showing cached PDF preview for file "{main_file}".', 'LaTeX errors'
                    except Exception:
                        pass

            return None, log_txt, err_reason

        with tempfile.TemporaryDirectory() as tmpdir:
            import re, struct, zlib, base64
            target_main_file = main_file
            is_active_root = target_main_file and target_main_file in files and isinstance(files.get(target_main_file), str) and '\\documentclass' in files[target_main_file]
            active_file_fallback = not is_active_root

            if main_file and main_file.endswith('.tex') and main_file in files:
                target_main_file = main_file
            elif is_active_root:
                target_main_file = main_file
            else:
                found_root = None
                for fname, fcontent in files.items():
                    if fname.endswith('.tex') and isinstance(fcontent, str) and '\\documentclass' in fcontent:
                        found_root = fname
                        break
                if found_root:
                    target_main_file = found_root
                else:
                    for fname in files.keys():
                        if fname.endswith('.tex'):
                            target_main_file = fname
                            break

            for filepath, content in files.items():
                try:
                    full_path = safe_project_path(tmpdir, filepath)
                except ValueError:
                    continue
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

            def persist_synctex_mapping():
                if not proj_id:
                    return
                source_synctex = os.path.splitext(main_filepath)[0] + '.synctex.gz'
                if not os.path.exists(source_synctex):
                    return
                safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', main_file or 'main.tex')
                target_synctex = os.path.join(DB_DIR, proj_id, f'compiled_{safe_name}.synctex.gz')
                try:
                    shutil.copy2(source_synctex, target_synctex)
                except Exception:
                    pass

            if not os.path.exists(main_filepath):
                return get_fallback_cached_pdf('', f'Main TeX file {target_main_file} not found')

            has_bibliography_workflow = any(
                isinstance(content, str) and (
                    '\\bibliography{' in content or
                    '\\addbibresource{' in content or
                    '\\printbibliography' in content
                )
                for content in files.values()
            )

            # A bibliography needs an auxiliary-tool pass between LaTeX runs.
            # latexmk detects whether the project needs BibTeX or Biber and
            # repeats the TeX pass until the references stabilize.
            if has_bibliography_workflow and shutil.which('latexmk'):
                latexmk_engine = {
                    'pdflatex': '-pdf',
                    'xelatex': '-xelatex',
                    'lualatex': '-lualatex'
                }.get(engine, '-pdf')
                try:
                    cmd = [
                        'latexmk', '-f', latexmk_engine, '-interaction=nonstopmode',
                        '-outdir=' + tmpdir, main_filepath
                    ]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output = f'Engine: latexmk ({latexmk_engine})\n\n' + stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output
                        persist_synctex_mapping()
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))
                except subprocess.TimeoutExpired:
                    pass

            # Select Engine (pdflatex, xelatex, lualatex, or tectonic)
            if engine in ['pdflatex', 'xelatex', 'lualatex'] and shutil.which(engine):
                try:
                    cmd = [engine, '-synctex=1', '-interaction=nonstopmode', '-output-directory', tmpdir, main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output = f"Engine: {engine}\n\n" + stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        with open(pdf_filepath, 'rb') as f:
                            persist_synctex_mapping()
                            return save_and_return_pdf(f.read(), log_output, None)
                except Exception:
                    pass

            # Primary Engine: Tectonic (Overleaf CLSI Fast Pass)
            if os.path.exists(TECTONIC_BIN):
                log_output = 'Engine: Tectonic (Native Fast)\n\n'
                try:
                    # Execute Tectonic with continue-on-errors to auto-download missing packages from CTAN
                    cmd = [TECTONIC_BIN, '--synctex', '-Z', 'continue-on-errors', main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output += stdout_str + '\n' + stderr_str

                    if 'not found' in log_output.lower() or 'cannot find' in log_output.lower() or 'file `' in log_output.lower():
                        import re
                        missing_match = re.search(r"file `([^']+)' not found|cannot find file ([^\s\n]+)", log_output, re.IGNORECASE)
                        if missing_match:
                            missing_name = missing_match.group(1) or missing_match.group(2)
                            log_output += f"\n\n💡 DIAGNOSTIC HINT: Tectonic could not find '{missing_name}'.\n" \
                                          f"  • If this is a custom journal template or class (e.g. sn-jnl.cls, IEEEtran.cls, neurips.sty), upload '{missing_name}' directly into your project file list in the left sidebar.\n" \
                                          f"  • If your machine is offline or behind a network proxy/firewall, install full local TeXLive (`sudo apt install texlive-full`) and switch to 'Engine: pdfLaTeX' in the top header dropdown.\n"

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output
                        persist_synctex_mapping()
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))

                    # If PDF generation failed on current pass, return cached PDF preview if available
                    cached_pdf_bytes, cached_log, _ = get_fallback_cached_pdf(log_output, 'Compilation error')
                    if cached_pdf_bytes:
                        return cached_pdf_bytes, cached_log, 'LaTeX errors'
                    return None, log_output, 'Compilation error'
                except Exception as e:
                    return get_fallback_cached_pdf(log_output + f'\nCompilation pass exception: {e}', 'Compilation exception')
            elif os.path.exists('/usr/bin/pdflatex'):
                try:
                    cmd = ['pdflatex', '-synctex=1', '-interaction=nonstopmode', '-output-directory', tmpdir, main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output = stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output
                        persist_synctex_mapping()
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))
                    return get_fallback_cached_pdf(log_output, stderr_str or 'Compilation error')
                except subprocess.TimeoutExpired:
                    return get_fallback_cached_pdf('pdflatex timed out', 'Compilation timed out')
            else:
                return get_fallback_cached_pdf('', 'No native PDF compiler installed')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='AI-Overleaf Server')
    parser.add_argument('--port', type=int, default=8090, help='Port to run server on')
    args, _ = parser.parse_known_args()
    PORT = args.port

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
