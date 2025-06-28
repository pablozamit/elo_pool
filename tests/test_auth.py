import os
import pytest

os.environ.setdefault('JWT_SECRET', 'test_secret_key_1234567890')
os.environ.setdefault('MONGO_URL', 'mongodb://localhost:27017')
os.environ.setdefault('DB_NAME', 'testdb')

from backend.server import hash_password, verify_password, create_jwt_token, verify_jwt_token


def test_password_hashing():
    password = 's3cr3t'
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)


def test_jwt_token_roundtrip():
    token = create_jwt_token('uid123', 'testuser')
    payload = verify_jwt_token(token)
    assert payload['user_id'] == 'uid123'
    assert payload['username'] == 'testuser'
