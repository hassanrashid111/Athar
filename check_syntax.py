import os, subprocess

for f in os.listdir('static/js'):
    if f.endswith('.js'):
        path = './static/js/' + f
        p = subprocess.run(['node', '--input-type=module', '--eval', f'import("{path}")'], capture_output=True, text=True)
        if p.returncode != 0 and 'SyntaxError' in p.stderr:
            print('SYNTAX ERROR IN', f, ':\n', p.stderr)
        else:
            print('OK:', f)
