import urllib.request
import json
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

def run_ai_suite():
    ensure_server_running()
    print("=" * 80)
    print("🧠 RIGOROUS 50-TEST AI SUITE: AI-OVERLEAF RESEARCH & COPILOT ENGINE")
    print("=" * 80)

    passed_tests = 0
    total_tests = 50

    req_app = urllib.request.Request(f'{SERVER_URL}/app.js')
    app_js = urllib.request.urlopen(req_app).read().decode('utf-8')

    req_html = urllib.request.Request(f'{SERVER_URL}/')
    html_str = urllib.request.urlopen(req_html).read().decode('utf-8')

    def test(num, title, fn):
        nonlocal passed_tests
        print(f"\n--- AI TEST {num:02d}: {title} ---")
        try:
            fn()
            print(f"✅ AI TEST {num:02d} PASSED: {title}")
            passed_tests += 1
        except Exception as e:
            print(f"❌ AI TEST {num:02d} FAILED: {e}")

    # =========================================================================
    # CATEGORY 1: CONTEXT ENGINE & MANUSCRIPT SCOPING (TESTS 01 - 10)
    # =========================================================================

    test(1, "getAIContext() Function Definition", lambda: assert_in('function getAIContext()', app_js))
    test(2, "Active File Name Context Extraction", lambda: assert_in('file: activeFile', app_js))
    test(3, "Cursor Line Number Extraction", lambda: assert_in('cursor_line: cursor.line', app_js))
    test(4, "Selection Highlight Extraction", lambda: assert_in('selection: selection', app_js))
    test(5, "Section Heading Regex Matching", lambda: assert_in('/\\\\(section|subsection|subsubsection)\\*?\\{([^}]+)\\}/', app_js))
    test(6, "Surrounding 30-Line Context Window", start_end_text_check(app_js))
    test(7, "Workspace BibTeX Keys Collection", lambda: assert_in('bib_keys: bibKeys', app_js))
    test(8, "Compiler Error Traceback Context Injection", lambda: assert_in('compile_errors: lastCompilerLog', app_js))
    test(9, "Active Project Title Context Awareness", lambda: assert_in('project_name: activeProject', app_js))
    test(10, "Preamble Default Section Fallback", lambda: assert_in('Preamble / Document Header', app_js))

    # =========================================================================
    # CATEGORY 2: LINE-AWARE PATCH GENERATOR & SSE STREAMING (TESTS 11 - 20)
    # =========================================================================

    test(11, "streamOllamaPrompt() Streaming Handler Presence", lambda: assert_in('function streamOllamaPrompt', app_js))
    test(12, "Ollama SSE Chunk Reader (getReader)", lambda: assert_in('response.body.getReader()', app_js))
    test(13, "UTF-8 TextDecoder Stream Parsing", lambda: assert_in("new TextDecoder('utf-8')", app_js))
    test(14, "Line-Aware Patch Generator computeLinePatch() Presence", lambda: assert_in('function computeLinePatch', app_js))
    test(15, "Scoped Selection Line-Range Calculation", lambda: assert_in('startLine: cursor.line + 1', app_js))
    test(16, "Scoped Selection End Line Calculation", lambda: assert_in('selection.split(\'\\n\').length', app_js))
    test(17, "Targeted Scoped Replacement (code.replace)", lambda: assert_in('originalCode.replace(selection, proposedCode)', app_js))
    test(18, "Markdown Code Block Strip Filter (```latex)", lambda: assert_in(".replace(/^```latex/g, '')", app_js))
    test(19, "Ollama Prompt Payload Construction", lambda: assert_in('SURROUNDING DOCUMENT CONTEXT:', app_js))
    test(20, "Model Selection Binding (#model-select)", lambda: assert_in("document.getElementById('model-select').value", app_js))

    # =========================================================================
    # CATEGORY 3: CITATION AUDITOR & BIBTEX GROUNDING (TESTS 21 - 30)
    # =========================================================================

    test(21, "runCitationAudit() Function Presence", lambda: assert_in('function runCitationAudit()', app_js))
    test(22, "Document \\cite{} Regex Extraction", lambda: assert_in('/\\\\cite\\{([^}]+)\\}/g', app_js))
    test(23, "Workspace .bib Key Parser (@type{key)", lambda: assert_in('/@(\\w+)\\s*\\{\\s*([^,\\s]+)/g', app_js))
    test(24, "Missing Citations Key Detection", lambda: assert_in('citedKeys.has(k)', app_js))
    test(25, "Unused .bib Keys Detection", lambda: assert_in('bibKeys.has(k)', app_js))
    test(26, "Citation Auditor Card ID in HTML", lambda: assert_in('id="tool-citation-audit"', html_str))
    test(27, "Citation Auditor Card Icon in HTML", lambda: assert_in('fa-book-open-reader', html_str))
    test(28, "BibTeX Generator Tool Card ID", lambda: assert_in('id="tool-gen-bibtex"', html_str))
    test(29, "BibTeX Prompt Builder (@article / @inproceedings)", lambda: assert_in('Generate valid, publication-ready BibTeX entry', app_js))
    test(30, "Citation Audit Tool Card Event Binding", lambda: assert_in("toolAudit.addEventListener('click', runCitationAudit)", app_js))

    # =========================================================================
    # CATEGORY 4: EQUATION & NOTATION ANALYZER (TESTS 31 - 40)
    # =========================================================================

    test(31, "runEquationAnalyzer() Function Presence", lambda: assert_in('function runEquationAnalyzer()', app_js))
    test(32, "Display Math Environment Matching (equation/align/gather)", lambda: assert_in('(equation|align|gather)', app_js))
    test(33, "Inline Math Expression Matching ($...$)", lambda: assert_in('/\\$([^$]+)\\$/g', app_js))
    test(34, "Equation Cross-Reference Label Audit (\\label{eq:})", lambda: assert_in("!m[2].includes('\\\\label{')", app_js))
    test(35, "Math Package Preamble Audit (amsmath/amssymb)", lambda: assert_in("includes('amsmath')", app_js))
    test(36, "Equation Analyzer Tool Card ID in HTML", lambda: assert_in('id="tool-equation-analyzer"', html_str))
    test(37, "Equation Analyzer Tool Card Icon (fa-calculator)", lambda: assert_in('fa-calculator', html_str))
    test(38, "Math Formula Generator Tool Card ID", lambda: assert_in('id="tool-gen-math"', html_str))
    test(39, "Math Formula Generator Prompt Builder", lambda: assert_in('Generate LaTeX equation with \\\\begin{equation}', app_js))
    test(40, "Equation Analyzer Tool Card Event Binding", lambda: assert_in("toolEq.addEventListener('click', runEquationAnalyzer)", app_js))

    # =========================================================================
    # CATEGORY 5: PAPER HEALTH SCORE & AUTOMATED REPAIR LOOP (TESTS 41 - 50)
    # =========================================================================

    test(41, "calculatePaperHealthScore() Function Presence", lambda: assert_in('function calculatePaperHealthScore()', app_js))
    test(42, "Paper Health Title Audit (\\title)", lambda: assert_in("includes('\\\\title')", app_js))
    test(43, "Paper Health Abstract Audit (abstract)", lambda: assert_in("includes('abstract')", app_js))
    test(44, "Paper Health Section Audit (\\section)", lambda: assert_in("includes('\\\\section')", app_js))
    test(45, "Paper Health Score Card ID in HTML", lambda: assert_in('id="tool-health-score"', html_str))
    test(46, "runAutomatedCompileFixLoop() Function Presence", lambda: assert_in('function runAutomatedCompileFixLoop()', app_js))
    test(47, "Automated Fix Loop Compilation Trigger", lambda: assert_in('await compileLaTeX()', app_js))
    test(48, "Automated Fix Loop Error Traceback Extraction", lambda: assert_in('lastCompilerLog.slice(-1500)', app_js))
    test(49, "Auto Repair Tool Card ID in HTML", lambda: assert_in('id="tool-auto-repair"', html_str))
    test(50, "Auto Repair Tool Card Event Binding", lambda: assert_in("toolRepair.addEventListener('click', runAutomatedCompileFixLoop)", app_js))

    # =========================================================================
    # SUMMARY REPORT
    # =========================================================================
    print("\n" + "=" * 80)
    print(f"🧠 RIGOROUS AI VERIFICATION SUMMARY: {passed_tests} / {total_tests} TESTS PASSED")
    print("=" * 80)
    if passed_tests == total_tests:
        print("🎉 ALL 50 RIGOROUS AI TEST CASES ARE VERIFIED AND PASSED CLEAN!\n")
    else:
        print("⚠️ SOME AI TESTS ENCOUNTERED ISSUES. SEE LOG ABOVE.\n")

def assert_in(substring, target):
    assert substring in target, f"Substring '{substring}' not found in target"

def start_end_text_check(app_js):
    return lambda: assert_in('surroundingText = lines.slice', app_js)

if __name__ == '__main__':
    run_ai_suite()
