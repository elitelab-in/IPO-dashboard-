import json
import urllib.request

req = urllib.request.Request('http://127.0.0.1:5000/api/auth/google', data=b'{"credential":"dummy"}', headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode())
except Exception as e:
    print(e.read().decode())
