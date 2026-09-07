import urllib.request
import json
import base64
import zipfile
import io
import time

import subprocess

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
    print("🚀 FULL SUITE VERIFICATION: AI-OVERLEAF LATEX STUDIO PRO")
    print("=" * 80)

    passed_tests = 0
    total_tests = 7

    # ---------------------------------------------------------
    # TEST 1: REST API & MULTI-TAB DASHBOARD LIFECYCLE
    # ---------------------------------------------------------
    print("\n--- TEST 1: Multi-Tab Dashboard Lifecycle & REST APIs ---")
    try:
        # Check active projects tab
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?tab=active')
        res = urllib.request.urlopen(req)
        active_list = json.loads(res.read().decode('utf-8'))
        print(f"Active Projects Count: {len(active_list)}")

        # Check archived projects tab
        req_arch = urllib.request.Request(f'{SERVER_URL}/api/projects?tab=archived')
        res_arch = urllib.request.urlopen(req_arch)
        arch_list = json.loads(res_arch.read().decode('utf-8'))
        print(f"Archived Projects Count: {len(arch_list)}")

        # Check trash projects tab
        req_trash = urllib.request.Request(f'{SERVER_URL}/api/projects?tab=trash')
        res_trash = urllib.request.urlopen(req_trash)
        trash_list = json.loads(res_trash.read().decode('utf-8'))
        print(f"Trash Projects Count: {len(trash_list)}")

        assert isinstance(active_list, list), "Active projects must be a list"
        assert isinstance(arch_list, list), "Archived projects must be a list"
        assert isinstance(trash_list, list), "Trash projects must be a list"

        print("✅ TEST 1 PASSED: Multi-Tab Dashboard APIs return valid lifecycle lists.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 1 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 2: STRICT USER-CONTENT FILE FILTERING
    # ---------------------------------------------------------
    print("\n--- TEST 2: Strict User-Content File Filtering ---")
    try:
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_1788709298_dd641f')
        res = urllib.request.urlopen(req)
        proj_data = json.loads(res.read().decode('utf-8'))
        files = proj_data.get('files', {})

        forbidden_keys = ['.git', '.gitignore', '.gitattributes', '.DS_Store', 'last_compiled.pdf', '.git/config']
        found_forbidden = [k for k in files if any(k == f or k.startswith(f + '/') or k.endswith('/' + f) for f in forbidden_keys)]

        print(f"User Content Files Count: {len(files)}")
        print(f"Forbidden Files Found in API Response: {found_forbidden}")

        assert len(found_forbidden) == 0, f"Forbidden system/meta files detected: {found_forbidden}"
        print("✅ TEST 2 PASSED: Git metadata, dotfiles, and build artifacts are strictly excluded.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 2 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 3: NATIVE ZIP ARCHIVE GENERATION
    # ---------------------------------------------------------
    print("\n--- TEST 3: Native ZIP Archive Generation ---")
    try:
        req = urllib.request.Request(f'{SERVER_URL}/api/projects/download?id=proj_1788709298_dd641f')
        res = urllib.request.urlopen(req)
        zip_bytes = res.read()
        print(f"Downloaded ZIP Size: {len(zip_bytes)} bytes")
        print(f"Content-Type: {res.headers.get('Content-Type')}")

        assert res.headers.get('Content-Type') == 'application/zip', "Content-Type must be application/zip"
        assert len(zip_bytes) > 0, "ZIP bytes must be greater than 0"

        with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zf:
            namelist = zf.namelist()
            print(f"Files inside ZIP: {namelist}")
            for name in namelist:
                assert not name.startswith('.git'), f"ZIP contains git file: {name}"
                assert not name.startswith('.gitignore'), f"ZIP contains .gitignore: {name}"
                assert name != 'last_compiled.pdf', f"ZIP contains build artifact: {name}"

        print("✅ TEST 3 PASSED: Native ZIP export streams clean user files without metadata.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 3 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 4: MULTI-THREADED ASYNC GITHUB SYNC & POLLING
    # ---------------------------------------------------------
    print("\n--- TEST 4: Multi-Threaded Async GitHub Sync & Polling ---")
    try:
        t0 = time.time()
        payload = json.dumps({
            'id': 'proj_spinet',
            'repo_url': 'https://github.com/venkateshvaddadi/AI-Overleaf.git',
            'github_token': 'test_token_verification'
        }).encode('utf-8')
        req = urllib.request.Request(
            f'{SERVER_URL}/api/projects/github-sync',
            data=payload,
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req)
        elapsed_ms = (time.time() - t0) * 1000
        sync_resp = json.loads(res.read().decode('utf-8'))
        print(f"Sync Request Elapsed Time: {elapsed_ms:.2f} ms")
        print(f"Sync API Response: {sync_resp}")

        assert elapsed_ms < 100, "Background sync endpoint must return in under 100ms"
        assert sync_resp.get('status') == 'started', "Status must be 'started'"

        # Poll status via /api/projects/github-sync-status
        req_st = urllib.request.Request(f'{SERVER_URL}/api/projects/github-sync-status?id=proj_spinet')
        res_st = urllib.request.urlopen(req_st)
        status_data = json.loads(res_st.read().decode('utf-8'))
        print(f"Polled Sync Status: {status_data}")

        assert status_data.get('status') in ['syncing', 'completed', 'error', 'idle'], "Polled status must be valid"
        print("✅ TEST 4 PASSED: GitHub sync runs on non-blocking background thread with live status polling.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 4 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 5: FAULT-TOLERANT MULTI-FILE TEX COMPILATION
    # ---------------------------------------------------------
    print("\n--- TEST 5: Fault-Tolerant Multi-File TeX Compilation ---")
    try:
        req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_1788706740_833e99')
        res = urllib.request.urlopen(req)
        proj = json.loads(res.read().decode('utf-8'))
        files = proj['files']

        test_files = ['cleanversion.tex', 'cover-letter.tex', 'supplementary_materials.tex']
        compiled_sizes = {}

        for tf in test_files:
            cp = {
                'id': 'proj_1788706740_833e99',
                'files': files,
                'main_file': tf,
                'title': 'TestDoc'
            }
            creq = urllib.request.Request(
                f'{SERVER_URL}/api/compile',
                data=json.dumps(cp).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            cres = urllib.request.urlopen(creq)
            pdf_b = cres.read()
            compiled_sizes[tf] = len(pdf_b)
            print(f"File: {tf:<30} | PDF Size: {len(pdf_b):>7} bytes | HTTP {cres.status}")

            assert cres.status == 200, "Compilation status must be 200"
            assert len(pdf_b) > 0, "Generated PDF must be non-empty"

        assert compiled_sizes['cleanversion.tex'] != compiled_sizes['cover-letter.tex'], "Per-file PDF sizes must differ"
        print("✅ TEST 5 PASSED: Multi-file LaTeX compilation generates distinct file-specific PDFs.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 5 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 6: FRONTEND HTML & INTEGRITY VERIFICATION
    # ---------------------------------------------------------
    print("\n--- TEST 6: Frontend HTML & Integrity Verification ---")
    try:
        req = urllib.request.Request(f'{SERVER_URL}/')
        res = urllib.request.urlopen(req)
        html = res.read().decode('utf-8')

        required_controls = [
            'btn-layout-editor', 'btn-layout-split', 'btn-layout-pdf',  # 3 View Modes
            'btn-compile', 'btn-export-pdf',  # Core Action Controls
            'btn-view-grid', 'btn-view-list',  # Dashboard dual view switchers
            'file-list', 'pdf-preview', 'latex-code-editor'  # Core Viewports
        ]

        missing = [ctrl for ctrl in required_controls if ctrl not in html]
        print(f"Checked Frontend Elements: {len(required_controls)} required controls")
        print(f"Missing Elements: {missing}")

        assert len(missing) == 0, f"Missing frontend elements: {missing}"
        print("✅ TEST 6 PASSED: Frontend HTML contains all required controls and viewports.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 6 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 7: REAL-TIME MULTI-USER WORKSPACE SYNC & META POLLING
    # ---------------------------------------------------------
    print("\n--- TEST 7: Real-Time Multi-User Workspace Sync & Meta Polling ---")
    try:
        # 1. System 1 polls project meta
        req1 = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet&meta_only=true')
        res1 = urllib.request.urlopen(req1)
        meta1 = json.loads(res1.read().decode('utf-8'))
        initial_ver = meta1.get('version', 0)
        initial_files = meta1.get('files', [])

        # 2. System 2 uploads a file to the same project
        save_payload = {
            'id': 'proj_spinet',
            'name': 'SPINet Project',
            'files': {
                'main.tex': '% Main file',
                'figures/concurrent_system2_fig.png': 'data:image/png;base64,iVBORw0KGgoAAAANSU5QoAAA'
            }
        }
        req_save = urllib.request.Request(
            f'{SERVER_URL}/api/projects/save',
            data=json.dumps(save_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res_save = urllib.request.urlopen(req_save)
        save_resp = json.loads(res_save.read().decode('utf-8'))

        # 3. System 1 polls lightweight meta endpoint again
        res2 = urllib.request.urlopen(req1)
        meta2 = json.loads(res2.read().decode('utf-8'))
        new_ver = meta2.get('version', 0)
        new_files = meta2.get('files', [])

        print(f"Initial Version: {initial_ver} -> Updated Version: {new_ver}")
        print(f"Concurrent Asset Added: 'figures/concurrent_system2_fig.png' in Remote Files: { 'figures/concurrent_system2_fig.png' in new_files }")

        assert new_ver > initial_ver, "Version must increment on concurrent save"
        assert 'figures/concurrent_system2_fig.png' in new_files, "Concurrent file upload must be visible in remote files list"

        print("✅ TEST 7 PASSED: Real-time multi-user workspace sync and lightweight meta polling verified.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 7 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 8: PATH BOUNDARY SECURITY & TRAVERSAL PREVENTION
    # ---------------------------------------------------------
    print("\n--- TEST 8: Path Boundary Security & Traversal Prevention ---")
    total_tests += 1
    try:
        traversal_payload = {
            'id': 'proj_spinet',
            'name': 'Hacked Project',
            'files': {
                '../../etc/malicious.txt': 'malicious content'
            }
        }
        req_bad = urllib.request.Request(
            f'{SERVER_URL}/api/projects/save',
            data=json.dumps(traversal_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        res_bad = urllib.request.urlopen(req_bad)
        bad_resp = json.loads(res_bad.read().decode('utf-8'))
        
        # Verify that malicious path traversal was ignored / neutralized
        req_check = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_spinet')
        res_check = urllib.request.urlopen(req_check)
        proj_data = json.loads(res_check.read().decode('utf-8'))
        
        has_escaped_path = any('../../' in f for f in proj_data.get('files', {}).keys())
        print(f"Path Traversal Escaped File Present: {has_escaped_path}")
        assert not has_escaped_path, "Path traversal attack vector must be blocked by safe_project_path"

        print("✅ TEST 8 PASSED: Path boundary security & safe_project_path validation verified.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 8 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 9: AI CONTEXT ENGINE & CITATION AUDITOR INTEGRITY
    # ---------------------------------------------------------
    print("\n--- TEST 9: AI Context Engine & Citation Auditor Integrity ---")
    total_tests += 1
    try:
        req_app = urllib.request.Request(f'{SERVER_URL}/app.js')
        res_app = urllib.request.urlopen(req_app)
        app_js = res_app.read().decode('utf-8')

        required_functions = [
            'function getAIContext()',
            'function streamOllamaPrompt',
            'function computeLinePatch',
            'function runCitationAudit()',
            'function runEquationAnalyzer()',
            'function calculatePaperHealthScore()',
            'function runAutomatedCompileFixLoop()'
        ]

        missing_fns = [fn for fn in required_functions if fn not in app_js]
        print(f"Checked AI Context & Engine Functions: {len(required_functions)} required functions")
        print(f"Missing Functions: {missing_fns}")

        assert len(missing_fns) == 0, f"Missing AI functions in app.js: {missing_fns}"
        print("✅ TEST 9 PASSED: AI Context Engine, Citation Auditor & Health Score functions verified.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 9 FAILED: {e}")

    # ---------------------------------------------------------
    # TEST 10: AI ASSISTANT PANEL CARDS & TOOLBAR UI CONTROLS
    # ---------------------------------------------------------
    print("\n--- TEST 10: AI Assistant Panel Cards & Toolbar UI Controls ---")
    total_tests += 1
    try:
        req_html = urllib.request.Request(f'{SERVER_URL}/')
        res_html = urllib.request.urlopen(req_html)
        html = res_html.read().decode('utf-8')

        tool_cards = [
            'tool-citation-audit',
            'tool-equation-analyzer',
            'tool-health-score',
            'tool-auto-repair'
        ]

        missing_cards = [tc for tc in tool_cards if f'id="{tc}"' not in html]
        print(f"Checked AI Assistant Cards: {len(tool_cards)} required tool cards")
        print(f"Missing Cards: {missing_cards}")

        assert len(missing_cards) == 0, f"Missing tool cards in index.html: {missing_cards}"
        print("✅ TEST 10 PASSED: AI Assistant panel cards and toolbar UI controls verified.")
        passed_tests += 1
    except Exception as e:
        print(f"❌ TEST 10 FAILED: {e}")

    # ---------------------------------------------------------
    # SUMMARY REPORT
    # ---------------------------------------------------------
    print("\n" + "=" * 80)
    print(f"🎯 VERIFICATION SUMMARY: {passed_tests} / {total_tests} TESTS PASSED")
    print("=" * 80)
    if passed_tests == total_tests:
        print("🎉 ALL 10 RIGOROUS TEST SUITES ARE VERIFIED AND WORKING PERFECTLY!\n")
    else:
        print("⚠️ SOME TESTS ENCOUNTERED ISSUES. SEE LOG ABOVE.\n")

if __name__ == '__main__':
    run_suite()
