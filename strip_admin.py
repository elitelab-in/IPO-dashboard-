import re

def remove_html_blocks():
    with open('admin.html', 'r', encoding='utf-8') as f:
        html = f.read()

    # 1. Remove Sidebar Buttons
    html = re.sub(r'<button class="admin-menu-item".*?onclick="switchSection\(\'fii-dii\'\)".*?</button>', '', html, flags=re.DOTALL)
    html = re.sub(r'<button class="admin-menu-item".*?onclick="switchSection\(\'plans\'\)".*?</button>', '', html, flags=re.DOTALL)

    # 2. Remove Sections
    html = re.sub(r'<!-- FII/DII Delivery Section -->.*?<section id="sec-fii-dii".*?</section>', '', html, flags=re.DOTALL)
    html = re.sub(r'<!-- Manage Plans Section -->.*?<section id="sec-plans".*?</section>', '', html, flags=re.DOTALL)

    # 3. Remove JS functions
    html = re.sub(r'// FII/DII Manual Trigger.*?function loadFiiDiiLogs\(\) \{.*?\}(?=\n\s*(//|function|const|let))', '', html, flags=re.DOTALL)
    html = re.sub(r'async function triggerFiiDii.*?\}', '', html, flags=re.DOTALL)
    html = re.sub(r'async function clearFiiDiiLogs.*?\}', '', html, flags=re.DOTALL)
    
    html = re.sub(r'async function loadAdminPlans.*?\}', '', html, flags=re.DOTALL)
    html = re.sub(r'async function updateAdminPlan.*?\}', '', html, flags=re.DOTALL)
    html = re.sub(r'async function deleteAdminPlan.*?\}', '', html, flags=re.DOTALL)
    
    # 4. Remove switchSection bindings
    html = html.replace("if (secId === 'fii-dii') loadFiiDiiLogs();", "")
    html = html.replace("if (secId === 'plans') loadAdminPlans();", "")
    
    with open('admin.html', 'w', encoding='utf-8') as f:
        f.write(html)

def remove_python_blocks():
    with open('server.py', 'r', encoding='utf-8') as f:
        py = f.read()

    # Remove FII DII Admin Routes
    py = re.sub(r'@app\.route\(\'/api/admin/fii_dii.*?(?=@app\.route)', '', py, flags=re.DOTALL)
    
    # Remove Admin Plans Update Routes
    py = re.sub(r'@app\.route\(\'/api/admin/plans/update.*?(?=@app\.route)', '', py, flags=re.DOTALL)
    py = re.sub(r'@app\.route\(\'/api/admin/plans/delete.*?(?=@app\.route)', '', py, flags=re.DOTALL)

    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(py)

remove_html_blocks()
remove_python_blocks()
print('Removed admin sections.')
