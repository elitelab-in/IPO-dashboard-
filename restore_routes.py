import json
import re

transcript = r"C:\Users\abhis\.gemini\antigravity\brain\977eb66f-b222-433e-9d9a-ca91801c8bc4\.system_generated\logs\transcript_full.jsonl"
# We want the last full state of server.py and admin.html before 11:28 UTC (4:58 PM)

# Let's search the transcript for replace_file_content calls before 11:28 UTC today
# and reconstruct the file by applying the diffs!
# Or we can just find the latest file state from a script output if possible.

# Since applying diffs in python is hard, let's just use the fact that I appended code
# I know EXACTLY what code I appended.

server_additions = '''
@app.route('/api/admin/fii_dii/test', methods=['POST'])
@admin_required
def api_admin_fii_dii_test():
    try:
        from test_fiidii import send_fii_dii_update
        send_fii_dii_update()
        
        # Log it
        conn = get_db_connection()
        conn.execute("INSERT INTO fii_dii_delivery_logs (status, message) VALUES (?, ?)", 
                    ('success', 'Manual test delivery executed successfully.'))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "FII/DII Delivery Test Sent Successfully!"})
    except Exception as e:
        conn = get_db_connection()
        conn.execute("INSERT INTO fii_dii_delivery_logs (status, message) VALUES (?, ?)", 
                    ('error', str(e)))
        conn.commit()
        conn.close()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/fii_dii/logs', methods=['GET'])
@admin_required
def api_admin_fii_dii_logs():
    conn = get_db_connection()
    logs = conn.execute("SELECT * FROM fii_dii_delivery_logs ORDER BY created_at DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify({"status": "success", "logs": [dict(l) for l in logs]})

@app.route('/api/admin/fii_dii/clear_logs', methods=['POST'])
@admin_required
def api_admin_fii_dii_clear_logs():
    conn = get_db_connection()
    conn.execute("DELETE FROM fii_dii_delivery_logs")
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/admin/plans/update', methods=['POST'])
@admin_required
def api_admin_plans_update():
    data = request.json
    plan_id = data.get('id')
    plan_name = data.get('plan_name')
    price = data.get('price')
    duration = data.get('duration_days')
    billing = data.get('billing_cycle')
    razorpay_id = data.get('razorpay_plan_id')
    desc = data.get('description', '')
    
    conn = get_db_connection()
    if plan_id:
        # Update existing
        conn.execute("""
            UPDATE plans SET plan_name=?, price=?, duration_days=?, billing_cycle=?, razorpay_plan_id=?, description=?
            WHERE id=?
        """, (plan_name, price, duration, billing, razorpay_id, desc, plan_id))
    else:
        # Create new
        conn.execute("""
            INSERT INTO plans (plan_name, price, duration_days, billing_cycle, razorpay_plan_id, description)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (plan_name, price, duration, billing, razorpay_id, desc))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/admin/plans/delete/<int:plan_id>', methods=['POST'])
@admin_required
def api_admin_plans_delete(plan_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM plans WHERE id=?", (plan_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})
'''

with open('server.py', 'a', encoding='utf-8') as f:
    f.write("\n" + server_additions + "\n")

print("Restored admin backend routes to server.py")

