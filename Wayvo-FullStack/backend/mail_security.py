"""Email codes & delivery; no API routes expose verification codes.

Configure SMTP for actual delivery. Explicit outbox mode is only for local tests;
never enable it on a publicly reachable server.
"""
import html
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

PURPOSES = {'register': 'Confirma tu cuenta', 'login': 'Tu acceso seguro', 'reset': 'Recupera tu contraseña', 'google_link': 'Vincula tu cuenta con Google'}


def validate_password(password: str) -> str | None:
    if not isinstance(password, str) or not 8 <= len(password) <= 12:
        return 'La contraseña debe tener entre 8 y 12 caracteres.'
    if any(c.isspace() for c in password):
        return 'La contraseña no puede incluir espacios.'
    if not re.search(r'[a-z]', password) or not re.search(r'[A-Z]', password) or not re.search(r'\d', password) or not re.search(r'[^\w\s]', password):
        return 'Usa al menos una mayúscula, una minúscula, un número y un símbolo.'
    if password.lower() in {'password1!', 'admin1234!', 'wayvo1234!', 'qwerty123!'}:
        return 'Elige una contraseña menos común.'
    return None


def ready() -> bool:
    mode = os.getenv('WAYVO_MAIL_MODE', 'smtp').lower()
    if mode == 'outbox':
        return os.getenv('WAYVO_HOST', '127.0.0.1') in ('127.0.0.1', 'localhost') and bool(os.getenv('WAYVO_MAIL_OUTBOX'))
    return bool(os.getenv('WAYVO_SMTP_HOST') and os.getenv('WAYVO_SMTP_FROM') and (not os.getenv('WAYVO_SMTP_USER') or os.getenv('WAYVO_SMTP_PASSWORD')))


def compose_mail(purpose: str, code: str) -> tuple[str, str, str]:
    title = PURPOSES[purpose]
    description = {
        'register': 'Para activar tu cuenta y comenzar a viajar con Wayvo, verifica tu correo.',
        'login': 'Recibimos una solicitud para entrar a Wayvo. Confirma que eres tú.',
        'reset': 'Recibimos una solicitud para cambiar tu contraseña. Usa este código para continuar.',
        'google_link': 'Solicitaste vincular Google a tu cuenta Wayvo. Confirma esta acción con el código.',
    }[purpose]
    subject = f'Wayvo · {title}'
    plain = f'WAYVO\n\n{title}\n{description}\n\nTu código: {code}\n\nVálido por 10 minutos. No lo compartas. Si no fuiste tú, ignora este mensaje.'
    # Inline styles for consistent Gmail/Outlook rendering. No external assets or links.
    markup = f'''<!doctype html><html lang="es"><body style="margin:0;background:#eef0e6;padding:32px 12px;font-family:Arial,sans-serif;color:#17251e">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:560px;margin:auto;background:#fffdf1;border:2px solid #1b4935;border-radius:16px">
      <tr><td style="padding:30px 30px 16px;background:#1b4935;color:#e6d681;border-radius:13px 13px 0 0;font-size:26px;font-weight:900;letter-spacing:3px">WAYVO <span style="font-size:13px;letter-spacing:1px">● TU RUTA, A TU RITMO</span></td></tr>
      <tr><td style="padding:32px 30px 34px">
        <p style="margin:0;color:#67806b;font-size:12px;letter-spacing:2px;font-weight:bold">ACCESO SEGURO · WAYVO</p>
        <h1 style="font-size:25px;margin:12px 0;color:#1b4935">{html.escape(title)}</h1>
        <p style="font-size:15px;line-height:1.6;color:#3b5346">{html.escape(description)}</p>
        <div style="margin:26px 0;text-align:center;background:#f0efda;border:2px dashed #c0a76a;border-radius:12px;padding:22px">
          <span style="font-size:35px;color:#1b4935;font-weight:900;letter-spacing:9px">{html.escape(code)}</span>
          <p style="font-size:12px;color:#526957;margin:12px 0 0">Válido por 10 minutos</p>
        </div>
        <p style="font-size:13px;line-height:1.6;color:#66786a">Nunca compartas este código. Si tú no solicitaste esta acción, simplemente ignora este correo.</p>
      </td></tr><tr><td style="padding:16px 30px;border-top:1px solid #c3d0b8;font-size:11px;color:#66786a">Wayvo · Proyecto de movilidad urbana · Mensaje automático</td></tr></table>
    </body></html>'''
    return subject, plain, markup


def send_code(recipient: str, purpose: str, code: str) -> None:
    if not ready():
        raise RuntimeError('Configura el correo SMTP en backend/.env para enviar códigos reales.')
    subject, plain, markup = compose_mail(purpose, code)
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = os.getenv('WAYVO_SMTP_FROM', 'Wayvo <no-reply@wayvo.local>')
    msg['To'] = recipient
    msg.set_content(plain)
    msg.add_alternative(markup, subtype='html')
    deliver(msg)


def deliver(msg: EmailMessage) -> None:
    if not ready():
        raise RuntimeError('Configura correo SMTP real antes de enviar mensajes.')
    if os.getenv('WAYVO_MAIL_MODE', 'smtp').lower() == 'outbox':
        outbox = Path(os.environ['WAYVO_MAIL_OUTBOX'])
        outbox.mkdir(parents=True, exist_ok=True)
        import secrets
        (outbox / (secrets.token_hex(12) + '.eml')).write_bytes(msg.as_bytes())
        return
    host = os.environ['WAYVO_SMTP_HOST']
    port = int(os.getenv('WAYVO_SMTP_PORT', '587'))
    timeout = 12
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as smtp:
            if os.getenv('WAYVO_SMTP_USER'):
                smtp.login(os.environ['WAYVO_SMTP_USER'], os.environ['WAYVO_SMTP_PASSWORD'])
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            if os.getenv('WAYVO_SMTP_USER'):
                smtp.login(os.environ['WAYVO_SMTP_USER'], os.environ['WAYVO_SMTP_PASSWORD'])
            smtp.send_message(msg)
