import requests

s = requests.Session()
r = s.post('http://localhost:5000/api/auth/login', json={'email': 'elitelab.in@gmail.com', 'password': 'admin'})
print("Login:", r.json())

r2 = s.get('http://localhost:5000/api/auth/status')
print("Status:", r2.json())
