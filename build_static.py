import os
import shutil
from flask import Flask, render_template

app = Flask(__name__, template_folder='templates', static_folder='static')

pages = [
    ('login.html', 'login.html'),
    ('login.html', 'index.html'),
    ('setup.html', 'setup.html'),
    ('dashboard.html', 'dashboard.html'),
    ('reports.html', 'reports.html')
]

os.makedirs('public', exist_ok=True)

with app.test_request_context():
    for template_name, output_name in pages:
        rendered = render_template(template_name)
        out_path = os.path.join('public', output_name)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(rendered)
        print(f"Rendered: {template_name} -> {out_path}")

# Copy Service Worker and Manifest to public root
if os.path.exists('static/sw.js'):
    shutil.copy('static/sw.js', 'public/sw.js')
    print("Copied: static/sw.js -> public/sw.js")

if os.path.exists('static/manifest.json'):
    shutil.copy('static/manifest.json', 'public/manifest.json')
    print("Copied: static/manifest.json -> public/manifest.json")

print("Static build completed successfully!")
