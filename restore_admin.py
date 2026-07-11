import json
import re
import os

with open('admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Insert sidebar buttons
buttons = '''
                <button class="admin-menu-item" onclick="switchSection('plans')">
                    <i class="fa-solid fa-tags"></i> Manage Plans
                </button>
                <button class="admin-menu-item" onclick="switchSection('fiidii')">
                    <i class="fa-solid fa-paper-plane"></i> FII/DII Delivery
                </button>
'''
html = html.replace('                <button class="admin-menu-item" onclick="switchSection(\'payments\')">\n                    <i class="fa-solid fa-receipt"></i> Transactions\n                </button>', '                <button class="admin-menu-item" onclick="switchSection(\'payments\')">\n                    <i class="fa-solid fa-receipt"></i> Transactions\n                </button>' + buttons)

# Insert sections
sections = '''
                <!-- Manage Plans Section -->
                <div class="admin-section" id="sec-plans">
                    <h2 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 1rem;">Manage Subscription Plans</h2>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.5rem;">Create, edit, or delete billing tiers displayed on the pricing page.</p>
                    
                    <button class="btn btn-primary" onclick="openPlanEditor()" style="margin-bottom: 1rem;">
                        <i class="fa-solid fa-plus"></i> Add New Plan
                    </button>
                    
                    <div class="table-responsive">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Plan Name</th>
                                    <th>Price</th>
                                    <th>Cycle</th>
                                    <th>Razorpay ID</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="plans-list-body">
                                <tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Loading plans...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- FII/DII Delivery Section -->
                <div class="admin-section" id="sec-fiidii">
                    <h2 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 1rem;">FII / DII Manual Trigger</h2>
                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.5rem;">Manually trigger the FII/DII extraction script to test delivery or force an immediate push notification to all subscribers.</p>
                    
                    <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                        <button class="btn btn-primary" onclick="triggerFiiDii()">
                            <i class="fa-solid fa-paper-plane"></i> Send Manual Test
                        </button>
                        <button class="btn" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);" onclick="clearFiiDiiLogs()">
                            <i class="fa-solid fa-trash"></i> Clear Logs
                        </button>
                    </div>

                    <h3 style="font-size: 1rem; color: #fff; margin-bottom: 1rem;">Delivery Logs</h3>
                    <div class="table-responsive">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Status</th>
                                    <th>Message</th>
                                </tr>
                            </thead>
                            <tbody id="fiidii-logs-body">
                                <tr>
                                    <td colspan="3" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading logs...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
'''
html = html.replace('<!-- End Sections -->', sections + '\n            <!-- End Sections -->')

# Insert JS logic
js_logic = '''
        // Manage Plans Logic
        async function loadAdminPlans() {
            try {
                const res = await fetch('/api/plans');
                const data = await res.json();
                const tbody = document.getElementById('plans-list-body');
                tbody.innerHTML = '';
                
                if(!data.plans || data.plans.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">No plans found</td></tr>';
                    return;
                }
                
                data.plans.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = 
                        <td></td>
                        <td style="font-weight:600; color:#fff;"></td>
                        <td>?</td>
                        <td></td>
                        <td style="font-family:monospace; font-size:0.8rem;"></td>
                        <td>
                            <button onclick='openPlanEditor()' style="background:none; border:none; color:var(--accent-primary); cursor:pointer; margin-right:1rem;"><i class="fa-solid fa-edit"></i></button>
                            <button onclick='deleteAdminPlan()' style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    ;
                    tbody.appendChild(tr);
                });
            } catch(e) {
                console.error(e);
            }
        }

        async function openPlanEditor(plan = null) {
            const name = prompt("Plan Name:", plan ? plan.plan_name : "");
            if(name === null) return;
            const price = prompt("Price (INR):", plan ? plan.price : "");
            if(price === null) return;
            const duration = prompt("Duration (Days):", plan ? plan.duration_days : "30");
            if(duration === null) return;
            const billing = prompt("Billing Cycle (monthly/yearly):", plan ? plan.billing_cycle : "monthly");
            if(billing === null) return;
            const rzp = prompt("Razorpay Plan ID (optional):", plan ? plan.razorpay_plan_id : "");
            if(rzp === null) return;
            
            try {
                const res = await fetch('/api/admin/plans/update', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        id: plan ? plan.id : null,
                        plan_name: name,
                        price: parseFloat(price),
                        duration_days: parseInt(duration),
                        billing_cycle: billing,
                        razorpay_plan_id: rzp
                    })
                });
                const data = await res.json();
                if(data.status === 'success') {
                    alert("Plan saved successfully!");
                    loadAdminPlans();
                } else {
                    alert("Error: " + data.message);
                }
            } catch(e) {
                alert("Network error.");
            }
        }

        async function deleteAdminPlan(id) {
            if(!confirm("Are you sure you want to delete this plan? This cannot be undone.")) return;
            try {
                const res = await fetch('/api/admin/plans/delete/' + id, {method: 'POST'});
                const data = await res.json();
                if(data.status === 'success') {
                    loadAdminPlans();
                } else {
                    alert("Error: " + data.message);
                }
            } catch(e) {
                alert("Network error.");
            }
        }

        // FII/DII Manual Trigger
        async function triggerFiiDii() {
            if(!confirm("Are you sure you want to manually trigger the FII/DII script? This may send notifications to users.")) return;
            try {
                const res = await fetch('/api/admin/fii_dii/test', { method: 'POST' });
                const data = await res.json();
                alert(data.message);
                loadFiiDiiLogs();
            } catch(e) {
                alert("Network error occurred.");
            }
        }

        function loadFiiDiiLogs() {
            fetch('/api/admin/fii_dii/logs')
                .then(res => res.json())
                .then(data => {
                    const tbody = document.getElementById('fiidii-logs-body');
                    tbody.innerHTML = '';
                    
                    if (!data.logs || data.logs.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">No logs found</td></tr>';
                        return;
                    }
                    
                    data.logs.forEach(l => {
                        const tr = document.createElement('tr');
                        const statusColor = l.status === 'success' ? '#10b981' : '#ef4444';
                        tr.innerHTML = 
                            <td></td>
                            <td style="color: ; font-weight: 600;"></td>
                            <td style="font-family: monospace; font-size: 0.85rem;"></td>
                        ;
                        tbody.appendChild(tr);
                    });
                });
        }

        async function clearFiiDiiLogs() {
            if(!confirm("Clear all logs?")) return;
            try {
                await fetch('/api/admin/fii_dii/clear_logs', { method: 'POST' });
                loadFiiDiiLogs();
            } catch(e) { }
        }
'''
html = html.replace('// Initialization', js_logic + '\n\n        // Initialization')

html = html.replace("if (secId === 'users') loadUsersList();", "if (secId === 'users') loadUsersList();\n            if (secId === 'plans') loadAdminPlans();\n            if (secId === 'fiidii') loadFiiDiiLogs();")

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Restored Admin UI.")
