import json
import os
import re

transcript_path = r'C:\Users\abhis\.gemini\antigravity\brain\977eb66f-b222-433e-9d9a-ca91801c8bc4\.system_generated\logs\transcript_full.jsonl'
target_time = "2026-07-11T11:28:00Z"

files_to_extract = ['server.py', 'admin.html', 'screener.html', 'schema.py', 'requirements.txt']
file_contents = {f: None for f in files_to_extract}

print("Parsing transcript...")
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            entry = json.loads(line)
            time_str = entry.get('created_at', '')
            if time_str > target_time:
                break
                
            # If the tool call response shows the file via view_file or read_file or replace_file_content or write_to_file
            if entry.get('type') == 'CODE_ACTION':
                text = entry.get('content', '')
                
                # Check for replace_file_content diffs (not full files, so we might need something else)
                # But wait, view_file shows lines!
                
                # The most reliable way to get the full file is if I ever dumped the whole file or if it's in a temp zip or something.
                pass
        except:
            pass

print(file_contents)
