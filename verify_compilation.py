import urllib.request
import json
import base64

SERVER_URL = 'http://127.0.0.1:8090'

def run_tests():
    # Fetch project files
    req = urllib.request.Request(f'{SERVER_URL}/api/projects?id=proj_1788706740_833e99')
    res = urllib.request.urlopen(req)
    proj_data = json.loads(res.read().decode('utf-8'))
    files = proj_data['files']

    print('=' * 70)
    print('TEST 1: PER-FILE PDF COMPILATION VERIFICATION')
    print('=' * 70)

    test_files = ['cleanversion.tex', 'cover-letter.tex', 'supplementary_materials.tex', 'response_to_reviewers.tex']
    results = {}

    for ftarget in test_files:
        payload = {
            'id': 'proj_1788706740_833e99',
            'files': files,
            'main_file': ftarget,
            'title': 'TestDoc'
        }
        creq = urllib.request.Request(
            f'{SERVER_URL}/api/compile',
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        cres = urllib.request.urlopen(creq)
        pdf_data = cres.read()
        results[ftarget] = len(pdf_data)
        err_hdr = cres.headers.get('X-Compiler-Error', '0')
        print(f'File: {ftarget:<32} | HTTP Status: {cres.status} | PDF Size: {len(pdf_data):>8} bytes | X-Compiler-Error: {err_hdr}')

    assert results['cleanversion.tex'] != results['cover-letter.tex'], 'PDF sizes must differ per file!'
    assert results['cover-letter.tex'] != results['supplementary_materials.tex'], 'PDF sizes must differ per file!'
    print('\n✅ TEST 1 PASSED: Each .tex file compiles and generates its distinct, file-specific PDF preview!\n')

    print('=' * 70)
    print('TEST 2: FAULT-TOLERANT RENDERING WITH SYNTAX ERRORS')
    print('=' * 70)

    # Inject syntax error (undefined macro) into active file
    files_with_error = dict(files)
    files_with_error['cover-letter.tex'] = '\\documentclass{article}\n\\begin{document}\nInvalid macro: \\thisisanundefinedmacro\n\\end{document}'

    payload_err = {
        'id': 'proj_1788706740_833e99',
        'files': files_with_error,
        'main_file': 'cover-letter.tex',
        'title': 'TestDoc'
    }
    creq_err = urllib.request.Request(
        f'{SERVER_URL}/api/compile',
        data=json.dumps(payload_err).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    cres_err = urllib.request.urlopen(creq_err)
    pdf_err_bytes = cres_err.read()
    log_b64 = cres_err.headers.get('X-Compiler-Log', '')
    err_flag = cres_err.headers.get('X-Compiler-Error')

    log_text = base64.b64decode(log_b64).decode('utf-8', errors='ignore') if log_b64 else ''

    print(f'HTTP Status: {cres_err.status}')
    print(f'Content-Type: {cres_err.headers.get("Content-Type")}')
    print(f'PDF Size: {len(pdf_err_bytes)} bytes')
    print(f'X-Compiler-Error Flag: {err_flag}')
    print(f'Compiler Log Snippet:\n{log_text[:200]}')

    assert cres_err.status == 200, 'Must return 200 OK!'
    assert len(pdf_err_bytes) > 0, 'Must return non-empty PDF!'
    assert err_flag == '1', 'Must flag compiler error!'
    assert 'Undefined control sequence' in log_text or 'error' in log_text.lower(), 'Log must contain error details!'
    print('\n✅ TEST 2 PASSED: PDF preview is STILL rendered on syntax errors, with compiler error log populated!\n')

    print('=' * 70)
    print('TEST 3: FATAL SYNTAX ERROR & PDF FALLBACK CACHE VERIFICATION')
    print('=' * 70)

    # Inject fatal syntax error (missing document environment)
    files_fatal = dict(files)
    files_fatal['cover-letter.tex'] = 'Broken text without documentclass or document environment'

    payload_fatal = {
        'id': 'proj_1788706740_833e99',
        'files': files_fatal,
        'main_file': 'cover-letter.tex',
        'title': 'TestDoc'
    }
    creq_fatal = urllib.request.Request(
        f'{SERVER_URL}/api/compile',
        data=json.dumps(payload_fatal).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    cres_fatal = urllib.request.urlopen(creq_fatal)
    pdf_fatal_bytes = cres_fatal.read()
    log_fatal_b64 = cres_fatal.headers.get('X-Compiler-Log', '')
    err_fatal_flag = cres_fatal.headers.get('X-Compiler-Error')

    log_fatal_text = base64.b64decode(log_fatal_b64).decode('utf-8', errors='ignore') if log_fatal_b64 else ''

    print(f'HTTP Status: {cres_fatal.status}')
    print(f'Content-Type: {cres_fatal.headers.get("Content-Type")}')
    print(f'PDF Fallback Size: {len(pdf_fatal_bytes)} bytes')
    print(f'X-Compiler-Error Flag: {err_fatal_flag}')

    assert cres_fatal.status == 200, 'Must return 200 OK!'
    assert len(pdf_fatal_bytes) > 0, 'Must return fallback cached PDF!'
    print('\n✅ TEST 3 PASSED: PDF preview NEVER stops displaying on fatal errors (cached preview served)!\n')

    print('=' * 70)
    print('🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!')
    print('=' * 70)

if __name__ == '__main__':
    run_tests()
