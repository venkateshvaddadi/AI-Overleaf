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

PORT = 8090
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TECTONIC_BIN = '/home/medimg/.gemini/antigravity/scratch/texenv/bin/tectonic'

# Backend Database & Disk Storage Configuration
DB_DIR = os.path.join(DIRECTORY, 'projects_db')
METADATA_FILE = os.path.join(DB_DIR, 'projects.json')

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
            metadata = load_metadata()

            if proj_id:
                if proj_id in metadata:
                    proj = metadata[proj_id]
                    proj_dir = os.path.join(DB_DIR, proj_id)
                    files_obj = {}
                    if os.path.exists(proj_dir):
                        for root, _, files in os.walk(proj_dir):
                            for fname in files:
                                full_path = os.path.join(root, fname)
                                rel_path = os.path.relpath(full_path, proj_dir)
                                try:
                                    with open(full_path, 'r', encoding='utf-8') as f:
                                        files_obj[rel_path] = f.read()
                                except UnicodeDecodeError:
                                    import base64
                                    with open(full_path, 'rb') as f:
                                        raw_b = f.read()
                                    b64_bytes = base64.b64encode(raw_b).decode('utf-8')
                                    ext = os.path.splitext(rel_path)[1].lower()
                                    mime = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else ('image/png' if ext == '.png' else ('image/svg+xml' if ext == '.svg' else ('application/pdf' if ext == '.pdf' else 'application/octet-stream')))
                                    files_obj[rel_path] = f'data:{mime};base64,{b64_bytes}'
                    proj['files'] = files_obj
                    self.send_json(200, proj)
                else:
                    self.send_json(404, {'error': 'Project not found'})
            else:
                # Return list of all projects
                proj_list = list(metadata.values())
                self.send_json(200, proj_list)
            return

        super().do_GET()

    def read_body_json(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length <= 0:
            return {}
        body = bytearray()
        while len(body) < content_length:
            chunk = self.rfile.read(min(content_length - len(body), 65536))
            if not chunk:
                break
            body.extend(chunk)
        return json.loads(body.decode('utf-8'))

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

                metadata[proj_id]['modified_at'] = 'Just now'
                metadata[proj_id]['file_count'] = len(files)
                metadata[proj_id]['main_file'] = main_file
                if name:
                    metadata[proj_id]['name'] = name
                save_metadata(metadata)
                self.send_json(200, {'status': 'saved', 'modified_at': 'Just now'})
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
                import io, zipfile
                zip_buffer = io.BytesIO(raw_body)
                try:
                    with zipfile.ZipFile(zip_buffer, 'r') as zip_ref:
                        for info in zip_ref.infolist():
                            if info.is_dir():
                                continue
                            clean_path = info.filename
                            if clean_path.startswith('__MACOSX') or '/.' in clean_path or clean_path.startswith('.'):
                                continue
                            parts = clean_path.split('/')
                            if len(parts) > 1 and any(k in parts[0].lower() for k in ['master', 'template', 'main', 'draft', 'zip']):
                                clean_path = '/'.join(parts[1:])
                            if not clean_path:
                                continue
                            try:
                                content = zip_ref.read(info.filename).decode('utf-8')
                                files_obj[clean_path] = content
                            except UnicodeDecodeError:
                                files_obj[clean_path] = '[Binary Asset]'
                except Exception as zip_err:
                    self.send_json(400, {'error': f'Invalid ZIP archive: {str(zip_err)}'})
                    return

            if not files_obj:
                self.send_json(400, {'error': 'No valid files found in ZIP archive'})
                return

            for fname in files_obj.keys():
                if fname == 'main.tex':
                    main_file = 'main.tex'
                    break
                elif fname.endswith('.tex'):
                    if '\\documentclass' in files_obj[fname]:
                        main_file = fname
                        break
                    main_file = fname

            proj_id = 'proj_' + str(int(time.time())) + '_' + str(os.urandom(3).hex())
            proj_dir = os.path.join(DB_DIR, proj_id)
            os.makedirs(proj_dir, exist_ok=True)

            for rel_path, content in files_obj.items():
                full_path = os.path.join(proj_dir, rel_path)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)

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

        elif self.path == '/api/compile':
            data = self.read_body_json()
            
            files = data.get('files', {})
            main_file = data.get('main_file', 'main.tex')
            title = data.get('title', 'document')
            proj_id = data.get('id')
            
            if 'sn-jnl.cls' not in files:
                sn_cls_path = os.path.join(DIRECTORY, 'sn-jnl.cls')
                if os.path.exists(sn_cls_path):
                    with open(sn_cls_path, 'r', encoding='utf-8') as f:
                        files['sn-jnl.cls'] = f.read()

            pdf_bytes, log_output, err = self.compile_latex_project(files, main_file, proj_id=proj_id)
            
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

    def compile_latex_project(self, files, main_file, proj_id=None):
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
            # ONLY return project-specific last compiled PDF to prevent cross-project PDF leakage
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
            # Determine primary compilation root document
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

            # Write all project files into temporary compilation directory
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

                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content if isinstance(content, str) else '')

            # Auto-include active sub-file into target_main_file if it's not referenced yet
            if target_main_file and target_main_file in files and activeFile and activeFile != target_main_file and activeFile.endswith('.tex'):
                main_txt = files.get(target_main_file, '')
                clean_active = activeFile.replace('.tex', '')
                if clean_active not in main_txt and activeFile not in main_txt:
                    if '\\end{document}' in main_txt:
                        sub_include = f"\n% Auto-included active sub-file: {activeFile}\n\\input{{{activeFile}}}\n\\end{{document}}"
                        mod_main = main_txt.replace('\\end{document}', sub_include)
                        with open(os.path.join(tmpdir, target_main_file), 'w', encoding='utf-8') as f:
                            f.write(mod_main)

            main_filepath = os.path.join(tmpdir, target_main_file)
            pdf_filepath = os.path.splitext(main_filepath)[0] + '.pdf'

            if not os.path.exists(main_filepath):
                return get_fallback_cached_pdf('', f'Main TeX file {target_main_file} not found')

            # Run Tectonic compilation with continue-on-errors flag
            if os.path.exists(TECTONIC_BIN):
                log_output = ''
                cmd = [TECTONIC_BIN, '-Z', 'continue-on-errors', '-k', '--only-cached', main_filepath]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
                stdout_str = res.stdout.decode('utf-8', errors='ignore')
                stderr_str = res.stderr.decode('utf-8', errors='ignore')
                log_output = stdout_str + '\n' + stderr_str

                if not os.path.exists(pdf_filepath):
                    missing_sty = re.findall(r"File [`']([^`']+\.sty)[`'] not found", log_output)
                    if missing_sty:
                        for m_sty in set(missing_sty):
                            m_path = os.path.join(tmpdir, m_sty)
                            m_name = os.path.splitext(m_sty)[0]
                            if not os.path.exists(m_path):
                                with open(m_path, 'w', encoding='utf-8') as fp:
                                    fp.write(f'% Auto stub for {m_name}\n\\NeedsTeXFormat{{LaTeX2e}}\n\\ProvidesPackage{{{m_name}}}[2026/09/06 Auto Stub]\n')
                        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
                        log_output += '\n--- Re-try pass after stubbing missing packages ---\n' + res.stdout.decode('utf-8', errors='ignore') + res.stderr.decode('utf-8', errors='ignore')

                if os.path.exists(pdf_filepath):
                    has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output or active_file_fallback
                    with open(pdf_filepath, 'rb') as f:
                        return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))

                # 2. Full compilation pass if needed with continue-on-errors
                try:
                    cmd = [TECTONIC_BIN, '-Z', 'continue-on-errors', '-k', main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output += '\n--- Full Compilation Pass ---\n' + stdout_str + '\n' + stderr_str

                    if not os.path.exists(pdf_filepath):
                        missing_sty = re.findall(r"File [`']([^`']+\.sty)[`'] not found", log_output)
                        if missing_sty:
                            for m_sty in set(missing_sty):
                                m_path = os.path.join(tmpdir, m_sty)
                                m_name = os.path.splitext(m_sty)[0]
                                if not os.path.exists(m_path):
                                    with open(m_path, 'w', encoding='utf-8') as fp:
                                        fp.write(f'% Auto stub for {m_name}\n\\NeedsTeXFormat{{LaTeX2e}}\n\\ProvidesPackage{{{m_name}}}[2026/09/06 Auto Stub]\n')
                            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                            log_output += '\n--- Re-try full pass after stubbing missing packages ---\n' + res.stdout.decode('utf-8', errors='ignore') + res.stderr.decode('utf-8', errors='ignore')

                    if os.path.exists(pdf_filepath):
                        has_err = res.returncode != 0 or 'error:' in log_output.lower() or '! ' in log_output or active_file_fallback
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, ('LaTeX errors' if has_err else None))

                    # Fallback to root document if active file failed completely
                    fallback_main = None
                    for fname in ['cleanversion.tex', 'main_version_with_annotations.tex', 'main.tex']:
                        if fname in files and fname != target_main_file:
                            fallback_main = fname
                            break
                    if fallback_main:
                        fallback_path = os.path.join(tmpdir, fallback_main)
                        fallback_pdf = os.path.splitext(fallback_path)[0] + '.pdf'
                        res = subprocess.run([TECTONIC_BIN, '-Z', 'continue-on-errors', '-k', fallback_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                        if os.path.exists(fallback_pdf):
                            with open(fallback_pdf, 'rb') as f:
                                return save_and_return_pdf(f.read(), log_output + f'\n--- Fallback PDF preview from {fallback_main} ---\n', 'LaTeX errors')

                    return get_fallback_cached_pdf(log_output, stderr_str or 'Compilation error')
                except subprocess.TimeoutExpired:
                    return get_fallback_cached_pdf(log_output + '\nCompilation timed out after 20 seconds.', 'Compilation timed out')
            elif os.path.exists('/usr/bin/pdflatex'):
                try:
                    cmd = ['pdflatex', '-interaction=nonstopmode', '-output-directory', tmpdir, main_filepath]
                    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
                    stdout_str = res.stdout.decode('utf-8', errors='ignore')
                    stderr_str = res.stderr.decode('utf-8', errors='ignore')
                    log_output = stdout_str + '\n' + stderr_str

                    if os.path.exists(pdf_filepath):
                        with open(pdf_filepath, 'rb') as f:
                            return save_and_return_pdf(f.read(), log_output, None)
                    return get_fallback_cached_pdf(log_output, stderr_str or 'Compilation error')
                except subprocess.TimeoutExpired:
                    return get_fallback_cached_pdf('pdflatex timed out', 'Compilation timed out')
            else:
                return get_fallback_cached_pdf('', 'No native PDF compiler installed')

if __name__ == '__main__':
    init_db()
    import socketserver
    socketserver.TCPServer.allow_reuse_address = True
    from http.server import ThreadingHTTPServer
    server_address = ('0.0.0.0', PORT)
    httpd = ThreadingHTTPServer(server_address, OverleafServer)
    httpd.daemon_threads = True
    print(f'Overleaf Multi-Threaded Native Compiler & Database Server running on port {PORT}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
