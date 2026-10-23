"""Prueba de endpoints sin servicios externos: python -m unittest backend/test_auth.py"""
import os, subprocess, sys, tempfile, time, unittest, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class AuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.port=18871
        env={**os.environ,'WAYVO_DB':str(Path(cls.temp.name)/'test.sqlite3'),'WAYVO_PORT':str(cls.port),'WAYVO_HOST':'127.0.0.1'}
        cls.server=subprocess.Popen([sys.executable,str(ROOT/'backend/server.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(40):
            try: cls.call('GET','/api/health');break
            except Exception: time.sleep(.1)
        else: raise RuntimeError('API no arrancó')
    @classmethod
    def tearDownClass(cls): cls.server.terminate();cls.server.wait();cls.temp.cleanup()
    @classmethod
    def call(cls, method,path,data=None,token=None):
        headers={'Content-Type':'application/json'}
        if token: headers['Authorization']='Bearer '+token
        req=Request(f'http://127.0.0.1:{cls.port}'+path, method=method,data=json.dumps(data).encode() if data else None,headers=headers)
        try:
            with urlopen(req,timeout=3) as r:return r.status,json.load(r)
        except HTTPError as e:return e.code,json.load(e)
    def test_register_and_login(self):
        self.assertEqual(self.call('POST','/api/auth/register',{'name':'Prueba','email':'test@example.com','password':'segura123'})[0],201)
        status,body=self.call('POST','/api/auth/login',{'email':'test@example.com','password':'segura123'})
        self.assertEqual(status,200);self.assertTrue(body['token'])
        self.assertEqual(self.call('POST','/api/auth/login',{'email':'test@example.com','password':'incorrecta'})[0],401)
    def test_chat_requires_authentication_and_recommends_demo_route(self):
        payload={'messages':[{'role':'user','content':'¿Cómo llego de Bello a Envigado?'}]}
        self.assertEqual(self.call('POST','/api/assistant/chat',payload)[0],401)
        self.assertEqual(self.call('POST','/api/auth/register',{'name':'Chat demo','email':'chat@example.com','password':'demosegura123'})[0],201)
        status,login=self.call('POST','/api/auth/login',{'email':'chat@example.com','password':'demosegura123'})
        self.assertEqual(status,200)
        status,answer=self.call('POST','/api/assistant/chat',payload,token=login['token'])
        self.assertEqual(status,200)
        self.assertIn('WV-302',answer['answer'])
        self.assertTrue(answer['demo'])
    def test_social_status_without_secrets(self):
        for provider in ('google','microsoft'):
            status,body=self.call('GET',f'/api/auth/oauth/{provider}/status')
            self.assertEqual(status,200);self.assertFalse(body['configured'])
if __name__=='__main__':unittest.main()
