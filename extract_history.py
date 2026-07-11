import json
import os

transcript_path = r'C:\Users\abhis\.gemini\antigravity\brain\977eb66f-b222-433e-9d9a-ca91801c8bc4\.system_generated\logs\transcript_full.jsonl'

# We want the content of server.py and admin.html around 4:58 PM (16:58) which is 2026-07-11T11:28:00Z in UTC.
# Wait, IST is UTC + 5:30.
# 16:58 IST = 11:28 UTC.

target_time = "2026-07-11T11:28:00Z"
server_content = None
admin_content = None

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            entry = json.loads(line)
            time_str = entry.get('created_at', '')
            if time_str > target_time:
                break
                
            # Look for tool calls that view or write the files
            if 'tool_calls' in entry:
                for tc in entry['tool_calls']:
                    args = tc.get('args', {})
                    if 'TargetFile' in args and 'server.py' in args['TargetFile']:
                        pass
                        
            # But the easiest way is to find the view_file output!
            if entry.get('type') == 'CODE_ACTION':
                text = entry.get('content', '')
                if 'File Path: ile:///C:/Users/abhis/.gemini/antigravity/scratch/elitelab.in/server.py' in text:
                    # this is view_file output. It might not be the whole file.
                    pass
        except:
            pass

print("Searching transcript for file state...")
