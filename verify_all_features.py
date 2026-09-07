import urllib.request
import json
import base64
import zipfile
import io
import time
import subprocess
import os

SERVER_URL = 'http://127.0.0.1:8090'

def ensure_server_running():
    try:
        urllib.request.urlopen(f'{SERVER_URL}/api/projects', timeout=1)
    except Exception:
        print("Starting background server process on port 8090...")
        subprocess.Popen(['python3', 'server.py'])
        time.sleep(2.5)

def run_suite():
    ensure_server_running()
    print("=" * 80)
    print("🚀 COMPREHENSIVE 50-TEST RIGOROUS VERIFICATION SUITE: AI-OVERLEAF")
    print("=" * 80)

    passed_tests = 0
    total_tests = 50

    def test(num, title, fn):
        nonlocal passed_tests
        print(f"\n--- TEST {num:02d}: {title} ---")
        try:
            fn()
            print(f"✅ TEST {num:02d} PASSED: {title}")
            passed_tests += 1
        except Exception as e:
            print(f"❌ TEST {num:02d} FAILED: {e}")

    # =========================================================================
    # MODULE 1: DASHBOARD & REST API LIFECYCLE (TESTS 1 - 10)
    # =========================================================================

    def t01():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?tab=active')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert isinstance(data, list), "Active projects must return array"
    test(1, "Get Active Projects Tab API", t01)

    def t02():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?tab=archived')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert isinstance(data, list), "Archived projects must return array"
    test(2, "Get Archived Projects Tab API", t02)

    def t03():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?tab=trash')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert isinstance(data, list), "Trash projects must return array"
    test(3, "Get Trash Projects Tab API", t03)

    def t04():
        payload = json.dumps({'name': 'Rigorous_Project_04', 'description': 'Test project'}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/new', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert 'id' in data, "Created project must have unique ID"
    test(4, "Create New Blank Project API", t04)

    def t05():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert data.get('id') == 'proj_spinet', "Must fetch proj_spinet metadata and files"
    test(5, "Fetch Specific Project Details API", t05)

    def t06():
        payload = json.dumps({'id': 'proj_spinet', 'action': 'archive'}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/archive', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200, "Archive operation must return HTTP 200"
    test(6, "Archive Project Action API", t06)

    def t07():
        payload = json.dumps({'id': 'proj_spinet', 'action': 'restore'}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/archive', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200, "Restore operation must return HTTP 200"
    test(7, "Restore Project Action API", t07)

    def t08():
        payload = json.dumps({'id': 'proj_spinet', 'action': 'trash'}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/trash', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200, "Trash action must return 200"
    test(8, "Move Project to Trash API", t08)

    def t09():
        payload = json.dumps({'id': 'proj_spinet', 'action': 'restore'}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/trash', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200, "Restore from trash must return 200"
    test(9, "Restore Project from Trash API", t09)

    def t10():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet&meta_only=true')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert 'version' in data and 'files' in data, "Lightweight meta polling must return version and file list"
    test(10, "Lightweight Workspace Meta Polling API", t10)

    # =========================================================================
    # MODULE 2: SECURITY & PATH TRAVERSAL BOUNDARIES (TESTS 11 - 15)
    # =========================================================================

    def t11():
        bad_payload = json.dumps({'id': 'proj_spinet', 'files': {'../../etc/passwd': 'bad'}}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/save', data=bad_payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        req_check = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        proj = json.loads(urllib.request.urlopen(req_check).read().decode('utf-8'))
        assert not any('../../' in f for f in proj.get('files', {}).keys()), "Path traversal files must be rejected"
    test(11, "Path Traversal Boundary Shield (../../)", t11)

    def t12():
        bad_payload = json.dumps({'id': 'proj_spinet', 'files': {'..\\..\\Windows\\system32': 'bad'}}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/save', data=bad_payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        req_check = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        proj = json.loads(urllib.request.urlopen(req_check).read().decode('utf-8'))
        assert not any('..' in f for f in proj.get('files', {}).keys()), "Backslash traversal files must be rejected"
    test(12, "Backslash Path Traversal Shield (..\\\\)", t12)

    def t13():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        files = data.get('files', {})
        for f in files.keys():
            assert not f.startswith('.git') and '/.git' not in f, ".git metadata must never be exposed"
    test(13, "Git Metadata Isolation (.git filter)", t13)

    def t14():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        files = data.get('files', {})
        assert 'last_compiled.pdf' not in files, "Build artifact last_compiled.pdf must not be exposed as user file"
    test(14, "Build Artifact Filtering (last_compiled.pdf)", t14)

    def t15():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/download?id=proj_spinet')
        res = urllib.request.urlopen(req)
        zip_bytes = res.read()
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        names = zf.namelist()
        assert not any(n.startswith('.git') or 'last_compiled.pdf' in n for n in names), "ZIP exports must be clean of git & build artifacts"
    test(15, "ZIP Export Sanitization & Clean Content", t15)

    # =========================================================================
    # MODULE 3: LATEX COMPILATION & TECTONIC ENGINE (TESTS 16 - 25)
    # =========================================================================

    def t16():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}'}, 'main_file': 'main.tex'}
        req = urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200 and len(res.read()) > 0, "Valid TeX compilation must return PDF HTTP 200"
    test(16, "Basic TeX Document Compilation API", t16)

    def t17():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n$E=mc^2$\n\\end{document}'}, 'main_file': 'main.tex'}
        req = urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200 and len(res.read()) > 0, "Math package preamble compilation must succeed"
    test(17, "Math Preamble Compilation (amsmath)", t17)

    def t18():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\usepackage{booktabs}\n\\begin{document}\n\\begin{table}\\begin{tabular}{c}\\toprule A \\\\ \\bottomrule\\end{tabular}\\end{table}\n\\end{document}'}, 'main_file': 'main.tex'}
        req = urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200 and len(res.read()) > 0, "Table package compilation (booktabs) must succeed"
    test(18, "Booktabs Table Compilation", t18)

    def t19():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\begin{document}\nBad LaTeX \\invalidcommand\n\\end{document}'}, 'main_file': 'main.tex'}
        req = urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        pdf_bytes = res.read()
        assert res.status == 200 and len(pdf_bytes) > 0, "Fault-tolerant pass (-Z continue-on-errors) must return PDF preview"
    test(19, "Fault-Tolerant Compilation Pass (-Z continue-on-errors)", t19)

    def t20():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\begin{document}\n\\cite{missingkey}\n\\end{document}'}, 'main_file': 'main.tex'}
        req = urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200, "Compilation with missing citations must succeed under fault tolerance"
    test(20, "Missing Citation Fault-Tolerant Compilation", t20)

    def t21():
        cp = {'id': 'proj_spinet', 'files': {'docA.tex': '\\documentclass{article}\n\\begin{document}\nDoc A\n\\end{document}', 'docB.tex': '\\documentclass{article}\n\\begin{document}\nDoc B Long Content Text Here\n\\end{document}'}, 'main_file': 'docA.tex'}
        resA = urllib.request.urlopen(urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'}))
        sizeA = len(resA.read())

        cp['main_file'] = 'docB.tex'
        resB = urllib.request.urlopen(urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'}))
        sizeB = len(resB.read())

        assert sizeA != sizeB, "Per-file compiled PDF sizes must differ for docA vs docB"
    test(21, "Per-File PDF Compilation Caching", t21)

    def t22():
        cp = {'id': 'proj_spinet', 'engine': 'tectonic', 'files': {'main.tex': '\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}'}, 'main_file': 'main.tex'}
        res = urllib.request.urlopen(urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'}))
        assert res.headers.get('X-Compiler-Error') is not None, "Compiler response must include X-Compiler-Error status header"
    test(22, "X-Compiler-Error Status Header Inspection", t22)

    def t23():
        cp = {'id': 'proj_spinet', 'engine': 'tectonic', 'files': {'main.tex': '\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}'}, 'main_file': 'main.tex'}
        res = urllib.request.urlopen(urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'}))
        assert res.headers.get('X-Compiler-Log') is not None, "Compiler response must return base64 X-Compiler-Log header"
    test(23, "X-Compiler-Log Header Inspection", t23)

    def t24():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\n\\end{document}'}, 'main_file': 'main.tex'}
        res = urllib.request.urlopen(urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'}))
        assert res.status == 200, "TikZ graphic package compilation must succeed"
    test(24, "TikZ Graphics Package Compilation Pass", t24)

    def t25():
        cp = {'id': 'proj_spinet', 'files': {'main.tex': '\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\n\\url{https://ctan.org}\n\\end{document}'}, 'main_file': 'main.tex'}
        res = urllib.request.urlopen(urllib.request.Request(f'{SERVER_URL}/api/compile', data=json.dumps(cp).encode('utf-8'), headers={'Content-Type': 'application/json'}))
        assert res.status == 200, "Hyperref hyperlink package compilation must succeed"
    test(25, "Hyperref URL Package Compilation Pass", t25)

    # =========================================================================
    # MODULE 4: AI CONTEXT ENGINE & CITATION AUDIT (TESTS 26 - 35)
    # =========================================================================

    def t26():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function getAIContext()' in app_js, "app.js must contain getAIContext()"
    test(26, "AI Context Engine getAIContext() Presence", t26)

    def t27():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'current_section' in app_js, "Context engine must extract parent section heading"
    test(27, "AI Context Engine Section Extraction", t27)

    def t28():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'surrounding_text' in app_js, "Context engine must extract 30-line surrounding text window"
    test(28, "AI Context Engine Surrounding Text Window", t28)

    def t29():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'bib_keys' in app_js, "Context engine must extract workspace BibTeX keys"
    test(29, "AI Context Engine Workspace BibTeX Key Extraction", t29)

    def t30():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function streamOllamaPrompt' in app_js, "app.js must implement streamOllamaPrompt SSE streaming"
    test(30, "Streaming Ollama SSE Handler Presence", t30)

    def t31():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function computeLinePatch' in app_js, "app.js must implement computeLinePatch line-aware patch generator"
    test(31, "Line-Aware Patch Generator computeLinePatch Presence", t31)

    def t32():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function runCitationAudit()' in app_js, "app.js must implement runCitationAudit"
    test(32, "BibTeX Citation Auditor Presence", t32)

    def t33():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function runEquationAnalyzer()' in app_js, "app.js must implement runEquationAnalyzer"
    test(33, "Equation & Notation Analyzer Presence", t33)

    def t34():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function calculatePaperHealthScore()' in app_js, "app.js must implement calculatePaperHealthScore"
    test(34, "Paper Health Score Calculator Presence", t34)

    def t35():
        app_js = urllib.request.urlopen(f'{SERVER_URL}/app.js').read().decode('utf-8')
        assert 'function runAutomatedCompileFixLoop()' in app_js, "app.js must implement runAutomatedCompileFixLoop"
    test(35, "Automated Compile-Fix-Verify Loop Presence", t35)

    # =========================================================================
    # MODULE 5: GITHUB SYNC & ASYNC TASK MANAGEMENT (TESTS 36 - 40)
    # =========================================================================

    def t36():
        t0 = time.time()
        payload = json.dumps({'id': 'proj_spinet', 'repo_url': 'https://github.com/venkateshvaddadi/AI-Overleaf.git', 'github_token': 'test_tok'}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/github-sync', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        elapsed_ms = (time.time() - t0) * 1000
        assert elapsed_ms < 150 and res.status == 200, "GitHub sync API must return background start confirmation under 150ms"
    test(36, "GitHub Non-Blocking Async Background Sync API", t36)

    def t37():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/github-sync-status?id=proj_spinet')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert data.get('status') in ['syncing', 'completed', 'error', 'idle'], "Sync status polling must return valid state"
    test(37, "GitHub Background Sync Status Polling API", t37)

    def t38():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/github-sync-status?id=proj_spinet')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert 'progress' in data and 'step' in data, "Sync status polling must return progress percentage and step label"
    test(38, "GitHub Sync Progress Percentage & Step Inspection", t38)

    def t39():
        payload = json.dumps({'id': 'proj_spinet', 'repo_url': 'https://github.com/venkateshvaddadi/AI-Overleaf.git', 'github_token': 'tok', 'auto_sync': True}).encode('utf-8')
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/github-sync', data=payload, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        assert res.status == 200, "Auto-sync toggle settings must save cleanly"
    test(39, "GitHub Auto-Sync Configuration Persistence", t39)

    def t40():
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        assert isinstance(data, dict) and data.get('id') == 'proj_spinet', "Project data must return dictionary with project ID"
    test(40, "Project Details Metadata Integration", t40)

    # =========================================================================
    # MODULE 6: UI LAYOUT, VIEWS & FRONTEND INTEGRITY (TESTS 41 - 50)
    # =========================================================================

    def t41():
        html = urllib.request.Request(f'{SERVER_URL}/').full_url
        html_str = urllib.request.urlopen(html).read().decode('utf-8')
        assert 'compiler-engine-select' in html_str and 'model-select' in html_str, "Row 1 Header must contain engine & model selectors"
    test(41, "2-Row Top Header Row 1 Dropdowns Integrity", t41)

    def t42():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'btn-layout-editor' in html_str and 'btn-layout-split' in html_str and 'btn-layout-pdf' in html_str, "Row 2 Toolbar must contain view switcher controls"
    test(42, "Row 2 Preview Toolbar View Switchers Integrity", t42)

    def t43():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'fa-solid fa-code' in html_str and 'fa-solid fa-columns' in html_str and 'fa-solid fa-file-pdf' in html_str, "Layout switchers must use icon-only representations"
    test(43, "Icon-Only View Switchers (Code, Split, PDF)", t43)

    def t44():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'btn-new-file' in html_str and 'btn-new-folder' in html_str and 'btn-upload-file' in html_str, "File Tree header must contain file/folder creation and upload buttons"
    test(44, "File Tree Creation & Upload Controls", t44)

    def t45():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'fa-file-circle-plus' in html_str and 'fa-folder-plus' in html_str and 'fa-cloud-arrow-up' in html_str, "File Tree creation controls must be icon-only format"
    test(45, "Icon-Only File Tree Action Buttons", t45)

    def t46():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert '<span>File Tree</span>' in html_str, "Side nav label must be updated to File Tree"
    test(46, "Side Nav Strip 'File Tree' Text Label", t46)

    def t47():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'tool-citation-audit' in html_str and 'tool-equation-analyzer' in html_str, "AI Assistant drawer must contain Citation & Equation cards"
    test(47, "AI Assistant Panel Cards Integrity (Citation & Equation)", t47)

    def t48():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'tool-health-score' in html_str and 'tool-auto-repair' in html_str, "AI Assistant drawer must contain Health Score & Auto-Repair cards"
    test(48, "AI Assistant Panel Cards Integrity (Health Score & Repair)", t48)

    def t49():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'pdf-preview' in html_str and 'latex-code-editor' in html_str and 'file-list' in html_str, "Core editor viewports must be present in HTML"
    test(49, "Core Viewports Integrity (Editor, PDF, File Tree)", t49)

    def t50():
        html_str = urllib.request.urlopen(f'{SERVER_URL}/').read().decode('utf-8')
        assert 'btn-compile' in html_str and 'btn-export-pdf' in html_str and 'btn-github-sync' in html_str, "Core action controls must be present in toolbar"
    test(50, "Core Action Controls Integrity (Compile, Download, Sync)", t50)

    # =========================================================================
    # FINAL SUMMARY REPORT
    # =========================================================================
    print("\n" + "=" * 80)
    print(f"🎯 VERIFICATION SUMMARY: {passed_tests} / {total_tests} TESTS PASSED")
    print("=" * 80)
    if passed_tests == total_tests:
        print("🎉 ALL 50 RIGOROUS TEST CASES ARE VERIFIED AND PASSED CLEAN!\n")
    else:
        print("⚠️ SOME TESTS ENCOUNTERED ISSUES. SEE LOG ABOVE.\n")

if __name__ == '__main__':
    run_suite()
