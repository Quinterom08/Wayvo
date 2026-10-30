"""Offline verification tests: Firebase token checks using a local test certificate.
No production keys, Gmail or network required.
"""
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import server
try:
    import jwt
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
except ImportError:
    jwt=None

@unittest.skipIf(jwt is None,'Install backend/requirements.txt to verify ID tokens')
class FirebaseGoogleSignatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        now=datetime.now(timezone.utc)
        cls.cert=x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Wayvo test')]))\
            .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Wayvo test')]))\
            .public_key(cls.key.public_key()).serial_number(x509.random_serial_number())\
            .not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=1))\
            .sign(cls.key,hashes.SHA256()).public_bytes(serialization.Encoding.PEM).decode()
    def token(self,**overrides):
        now=int(time.time())
        claims={'sub':'google_test_12','aud':'wayvo-fde6b','iss':'https://securetoken.google.com/wayvo-fde6b',
            'iat':now,'exp':now+900,'auth_time':now,'email':'test@wayvo.example','email_verified':True,
            'firebase':{'sign_in_provider':'google.com'}}
        claims.update(overrides)
        return jwt.encode(claims,self.key,algorithm='RS256',headers={'kid':'test-key'})
    def verify(self,token):
        with patch.dict(server._CERT_CACHE,{'certs':{'test-key':self.cert},'until':time.monotonic()+600}):
            with patch.dict('os.environ',{'WAYVO_FIREBASE_PROJECT_ID':'wayvo-fde6b'}):
                return server.verify_firebase_google_id_token(token)
    def test_valid_google_token(self):
        self.assertEqual(self.verify(self.token())['email'],'test@wayvo.example')
    def test_rejects_wrong_audience(self):
        with self.assertRaises(ValueError):self.verify(self.token(aud='another-project'))
    def test_rejects_unverified_email(self):
        with self.assertRaises(ValueError):self.verify(self.token(email_verified=False))
    def test_rejects_password_provider(self):
        with self.assertRaises(ValueError):self.verify(self.token(firebase={'sign_in_provider':'password'}))
    def test_rejects_expired_token(self):
        with self.assertRaises(ValueError):self.verify(self.token(exp=int(time.time())-120))

if __name__=='__main__':unittest.main()
