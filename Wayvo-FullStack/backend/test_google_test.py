"""Google linking tests, all local. No Firebase, SMTP or internet required."""
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer

sys.path.insert(0,str(Path(__file__).resolve().parent))
import server

class GoogleLinkTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db_patch=patch.object(server,'DB',Path(self.temp.name)/'db.sqlite3')
        self.db_patch.start()
        server.init()
        self.codes={}
        self.mail_patch=patch.object(server,'send_code',side_effect=lambda email,purpose,code:self.codes.__setitem__((email,purpose),code))
        self.mail_patch.start()
        self.ready_patch=patch.object(server,'mail_ready',return_value=True)
        self.ready_patch.start()
        self.verify_patch=patch.object(server,'verify_firebase_google_id_token',side_effect=self.google_identity)
        self.verify_patch.start()
        self.web=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.web.serve_forever,daemon=True)
        self.thread.start()
    def tearDown(self):
        self.web.shutdown();self.web.server_close();self.thread.join(timeout=3)
        self.verify_patch.stop();self.ready_patch.stop();self.mail_patch.stop();self.db_patch.stop()
        self.temp.cleanup()
    @staticmethod
    def google_identity(token):
        if token == 'google_alice':return {'uid':'firebase_google_alice','email':'alice@example.com','name':'Alice'}
        if token == 'google_bob':return {'uid':'firebase_google_bob','email':'bob@example.com','name':'Bob'}
        raise ValueError('Token invalid')
    def request(self,method,path,data):
        payload=json.dumps(data).encode() if data is not None else None
        req=Request(f'http://127.0.0.1:{self.web.server_port}{path}',method=method,data=payload,headers={'Content-Type':'application/json'})
        try:
            with urlopen(req,timeout=5) as r:return r.status,json.load(r)
        except HTTPError as exc:return exc.code,json.load(exc)
    def test_existing_account_requires_explicit_consent_and_email_code(self):
        e='alice@example.com'
        status,body=self.request('POST','/api/auth/register',{'name':'Alice Old','email':e,'password':'Seguro8!A'})
        self.assertEqual(status,201)
        status,body=self.request('POST','/api/auth/verify',{'email':e,'purpose':'register','code':self.codes[e,'register']})
        self.assertEqual(status,200)
        original_token=body['token']
        self.codes.clear()
        status,body=self.request('POST','/api/auth/firebase/google',{'id_token':'google_alice'})
        self.assertEqual(status,200)
        self.assertEqual(body,{'requires_link':True,'email':e})
        self.assertFalse(self.codes,'Must not send email until explicit consent')
        self.assertEqual(self.request('POST','/api/auth/verify',{'email':e,'purpose':'google_link','code':'123456'})[0],400)
        status,body=self.request('POST','/api/auth/firebase/google',{'id_token':'google_alice','confirm_link':True})
        self.assertEqual(status,200)
        self.assertEqual(body['purpose'],'google_link')
        self.assertNotIn('token',body)
        code=self.codes[e,'google_link']
        self.assertEqual(self.request('POST','/api/auth/verify',{'email':e,'purpose':'google_link','code':'000000'})[0],400)
        status,body=self.request('POST','/api/auth/verify',{'email':e,'purpose':'google_link','code':code})
        self.assertEqual(status,200)
        self.assertEqual(body['user']['name'],'Alice Old')
        self.assertTrue(body['token'])
        self.assertEqual(self.request('POST','/api/auth/verify',{'email':e,'purpose':'google_link','code':code})[0],400)
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM users WHERE email=?',(e,)).fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM social_accounts WHERE provider=? AND subject=?',('firebase_google','firebase_google_alice')).fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)',(e,)).fetchone()[0],2)
        status,body=self.request('POST','/api/auth/firebase/google',{'id_token':'google_alice'})
        self.assertEqual(status,200)
        self.assertEqual(body['purpose'],'login')
        self.assertEqual(self.request('POST','/api/auth/login',{'email':e,'password':'Seguro8!A'})[0],429) # 60s code cooldown shared
        self.assertTrue(original_token)

    def test_new_google_signup_kept_unchanged(self):
        status,body=self.request('POST','/api/auth/firebase/google',{'id_token':'google_bob'})
        self.assertEqual(status,200)
        self.assertEqual(body['purpose'],'register')
        self.assertEqual(self.request('POST','/api/auth/verify',{'email':'bob@example.com','purpose':'register','code':self.codes['bob@example.com','register']})[0],200)

    def test_unverified_identity_cannot_start_link(self):
        self.assertEqual(self.request('POST','/api/auth/firebase/google',{'id_token':'bad'})[0],401)
        self.assertEqual(self.request('POST','/api/auth/firebase/google',{'id_token':'bad','confirm_link':True})[0],401)

if __name__=='__main__':unittest.main()
