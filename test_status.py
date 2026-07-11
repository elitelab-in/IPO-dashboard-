from server import app, api_auth_status
from flask import session

with app.test_request_context():
    session['user_id'] = 9
    response = api_auth_status()
    print("Response:", response.get_json())
