import json
from unittest.mock import patch
from backend.app import app

with app.test_client() as client:
    with patch('backend.app.id_token.verify_oauth2_token') as mock_verify:
        mock_verify.return_value = {
            'email': 'mockuser@example.com',
            'name': 'Mock User',
            'sub': '1234567890'
        }
        
        response = client.post('/api/auth/google', json={'credential': 'fake_token'})
        print("Status:", response.status_code)
        print("Data:", response.get_json())
