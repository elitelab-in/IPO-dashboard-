import json

transcript_path = r'C:\Users\abhis\.gemini\antigravity\brain\977eb66f-b222-433e-9d9a-ca91801c8bc4\.system_generated\logs\transcript_full.jsonl'
target_time = "2026-07-11T11:28:00Z"

print("Searching transcript...")
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            entry = json.loads(line)
            time_str = entry.get('created_at', '')
            if time_str > target_time:
                break
                
            if entry.get('source') == 'MODEL' and 'tool_calls' in entry:
                for tc in entry['tool_calls']:
                    args = tc.get('args', {})
                    if tc.get('name') == 'write_to_file':
                        filepath = args.get('TargetFile', '')
                        if 'admin.html' in filepath or 'server.py' in filepath:
                            print(f"[{time_str}] write_to_file: {filepath}")
                    elif tc.get('name') == 'replace_file_content':
                        filepath = args.get('TargetFile', '')
                        if 'admin.html' in filepath or 'server.py' in filepath or 'screener.html' in filepath:
                            print(f"[{time_str}] replace_file_content: {filepath}")
        except Exception as e:
            pass

