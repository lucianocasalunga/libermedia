import hashlib
import json
import base64

def calcular_hash(filepath):
    """Calcula SHA-256 do arquivo"""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()

def validar_nostr_auth(auth_header):
    """Valida evento Nostr assinado (Authorization header)"""
    try:
        if not auth_header.startswith('Nostr '):
            return None
        
        # Decodifica base64
        event_b64 = auth_header.replace('Nostr ', '')
        event_json = base64.b64decode(event_b64).decode('utf-8')
        event = json.loads(event_json)
        
        # TODO: validar assinatura Schnorr
        # Por enquanto, aceita se tiver pubkey
        return event.get('pubkey')
        
    except:
        return None

def verificar_admin(npub):
    """Verifica se usuário é admin"""
    from app import app, db, Usuario
    with app.app_context():
        user = Usuario.query.filter_by(pubkey=npub).first()
        return user and getattr(user, 'is_admin', False)
