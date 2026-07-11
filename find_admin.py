import json
import os

transcript = r"C:\Users\abhis\.gemini\antigravity\brain\977eb66f-b222-433e-9d9a-ca91801c8bc4\.system_generated\logs\transcript_full.jsonl"
target = "2026-07-11T10:13:00Z"

with open(transcript, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            entry = json.loads(line)
            if entry.get('created_at', '') > target:
                break
            if entry.get('type') == 'CODE_ACTION':
                c = entry.get('content', '')
                if 'File Path:' in c and 'admin.html' in c:
                    print("Found admin.html view at", entry.get('created_at'))
        except:
            pass
