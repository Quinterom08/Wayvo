"""Send a real test email with backend/.env settings: python backend/check_email.py destino@gmail.com.
Never prints credentials or OTPs. This email is not a login verification code.
"""
import sys
import os
from email.message import EmailMessage
from mail_security import ready, deliver
from server import load_local_env

load_local_env()

if __name__ == '__main__':
    if len(sys.argv)!=2 or '@' not in sys.argv[1]:
        print('Uso: python backend/check_email.py destinatario@gmail.com')
        raise SystemExit(2)
    if os.getenv('WAYVO_MAIL_MODE','smtp').lower()!='smtp':
        print('ERROR: Cambia WAYVO_MAIL_MODE=smtp. El modo outbox NO envía mensajes reales.')
        raise SystemExit(1)
    if not ready():
        print('ERROR: SMTP aún no configurado. Revisa backend/.env. Debes definir WAYVO_SMTP_HOST, WAYVO_SMTP_FROM, WAYVO_SMTP_USER y WAYVO_SMTP_PASSWORD.')
        raise SystemExit(1)
    message=EmailMessage()
    message['To']=sys.argv[1].strip()
    message['From']=os.environ['WAYVO_SMTP_FROM']
    message['Subject']='Wayvo · Correo de prueba'
    message.set_content('Hola! Este correo confirma que Wayvo puede enviar mensajes reales. No es un código de acceso.')
    message.add_alternative('''<div style="padding:32px;background:#edf0e4;font:16px Arial,sans-serif"><div style="max-width:500px;margin:auto;background:#fffdf1;border:2px solid #1b4935;border-radius:12px;overflow:hidden"><header style="padding:22px;background:#1b4935;color:#e6d681;font-size:24px;font-weight:bold">WAYVO 🚌</header><section style="padding:26px;color:#1b4935"><h2>¡Tu correo está conectado!</h2><p>Wayvo ya puede enviar mensajes a esta dirección. Esta es una prueba de configuración, no un código de inicio de sesión.</p></section></div></div>''', subtype='html')
    try:
        deliver(message)
    except Exception as exc:
        # Do not reveal raw SMTP errors which might contain sensitive details.
        print('ERROR: No se pudo entregar el correo. Revisa conexión, host, puerto, remitente y contraseña de aplicación. Tipo de error:',type(exc).__name__)
        raise SystemExit(1)
    print('El servidor SMTP aceptó el mensaje. Revisa la bandeja de entrada y Spam de',sys.argv[1])
