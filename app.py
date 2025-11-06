import os
import time
import jwt
from flask import Flask, request, jsonify, render_template, send_from_directory, redirect, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configuração ---
app = Flask(__name__)
app.secret_key = 'LiberMedia2025SecretKey!@#$%Sofia'

# CORS configurado para endpoints NIP-96 e arquivos públicos
CORS(app, resources={
    r"/.well-known/*": {"origins": "*"},
    r"/nip96.json": {"origins": "*"},
    r"/api/upload/nip96": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"]},
    r"/f/*": {"origins": "*"},
    r"/uploads/*": {"origins": "*"}
})

# Proteção Admin
ADMIN_PASSWORD = "Liber1010"

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged"):
            return redirect("/admin/login")
        return f(*args, **kwargs)
    return decorated_function
app.config["SQLALCHEMY_DATABASE_URI"] = "postgresql://libermedia:libermedia123@libermedia-db:5432/libermedia"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

JWT_SECRET = os.environ.get("JWT_SECRET", "libermedia-secret")
JWT_ALGO = "HS256"

# ============================================
# BLACKLIST - Pubkeys Bloqueadas
# ============================================
BLACKLISTED_PUBKEYS = [
    "3a8298f05b42d6d1533b714ae1f319c8a5bd1662400703ae631e70149979dce8",  # npub182pf3uzmgttdz5emw99wruceezjm69nzgqrs8tnrrecpfxtemn5qtdg5xp
]

def is_blacklisted(pubkey_hex):
    """Verifica se pubkey está na blacklist"""
    return pubkey_hex.lower() in [pk.lower() for pk in BLACKLISTED_PUBKEYS]

def check_blacklist_npub(npub_or_hex):
    """
    Verifica se npub ou hex está na blacklist
    Retorna (is_blocked: bool, pubkey_hex: str)
    """
    try:
        # Se começa com npub, converte para hex
        if npub_or_hex.startswith('npub'):
            from nostr_sdk import PublicKey
            pubkey = PublicKey.parse(npub_or_hex)
            pubkey_hex = pubkey.to_hex()
        else:
            pubkey_hex = npub_or_hex

        return is_blacklisted(pubkey_hex), pubkey_hex
    except:
        return False, npub_or_hex


# ============================================
# NIP-98: HTTP AUTH MIDDLEWARE
# ============================================
from nostr_sdk import Event as NostrEvent, PublicKey
from functools import wraps
import base64

def validate_nip98_auth(required=True):
    """
    Decorator para validar autenticação NIP-98

    Usage:
        @app.route('/api/protected')
        @validate_nip98_auth(required=True)
        def protected_route():
            npub = request.nip98_pubkey  # Pubkey autenticado
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization', '')

            # Se não é obrigatório e não tem header, permite
            if not required and not auth_header:
                request.nip98_pubkey = None
                return f(*args, **kwargs)

            # Valida formato: "Nostr <base64_event>"
            if not auth_header.startswith('Nostr '):
                if required:
                    return jsonify({'error': 'Authorization header inválido (esperado: Nostr <base64_event>)'}), 401
                request.nip98_pubkey = None
                return f(*args, **kwargs)

            try:
                # Decodifica evento base64
                event_b64 = auth_header[6:]  # Remove "Nostr "
                event_json = base64.b64decode(event_b64).decode('utf-8')

                # Parse evento Nostr
                event = NostrEvent.from_json(event_json)

                # Valida kind 27235 (HTTP Auth)
                if event.kind().as_u16() != 27235:
                    return jsonify({'error': 'Evento deve ser kind 27235 (HTTP Auth)'}), 401

                # Valida assinatura
                if not event.verify():
                    return jsonify({'error': 'Assinatura inválida'}), 401

                # Valida timestamp (máximo 60 segundos de diferença)
                event_time = event.created_at().as_secs()
                now = int(time.time())
                if abs(now - event_time) > 60:
                    return jsonify({'error': 'Evento expirado (máximo 60s)'}), 401

                # Extrai tags
                tags = {}
                for tag in event.tags().to_vec():
                    tag_list = tag.as_vec()
                    if len(tag_list) >= 2:
                        tags[tag_list[0]] = tag_list[1]

                # Valida URL (tag 'u')
                request_url = request.url
                event_url = tags.get('u', '')

                # Normaliza http/https para comparação (alguns clientes enviam http)
                request_url_normalized = request_url.replace('http://', 'https://')
                event_url_normalized = event_url.replace('http://', 'https://')

                if event_url and event_url_normalized != request_url_normalized:
                    # Permite variação com/sem query params
                    if not request_url_normalized.startswith(event_url_normalized):
                        print(f"[NIP-98] ❌ URL mismatch: event={event_url} request={request_url}")
                        return jsonify({'error': 'URL não corresponde ao evento'}), 401

                # Valida método HTTP (tag 'method')
                event_method = tags.get('method', '').upper()
                if event_method and event_method != request.method:
                    print(f"[NIP-98] ❌ Método HTTP não corresponde!")
                    return jsonify({'error': 'Método HTTP não corresponde'}), 401

                # Extrai pubkey
                pubkey = event.author()
                pubkey_hex = pubkey.to_hex()

                # Verifica blacklist
                if is_blacklisted(pubkey_hex):
                    print(f"[BLACKLIST] ⛔ Acesso bloqueado: {pubkey.to_bech32()}")
                    return jsonify({'error': 'Acesso negado'}), 403

                # Sucesso! Anexa pubkey ao request
                request.nip98_pubkey = pubkey.to_bech32()
                request.nip98_pubkey_hex = pubkey_hex
                request.nip98_event = event

                print(f"[NIP-98] ✅ Auth válido: {pubkey.to_bech32()[:16]}... método={request.method} url={request.path}")

                return f(*args, **kwargs)

            except Exception as e:
                print(f"[NIP-98] ❌ Erro ao validar: {e}")
                if required:
                    return jsonify({'error': f'Erro ao validar autenticação: {str(e)}'}), 401
                request.nip98_pubkey = None
                return f(*args, **kwargs)

        return decorated_function
    return decorator


def validate_blossom_auth(required=True):
    """
    Decorator para validar autenticação Blossom (kind 24242)

    Usage:
        @app.route('/upload', methods=['PUT'])
        @validate_blossom_auth(required=True)
        def blossom_upload():
            pubkey = request.blossom_pubkey  # Pubkey autenticado
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization', '')

            # Se não é obrigatório e não tem header, permite
            if not required and not auth_header:
                request.blossom_pubkey = None
                return f(*args, **kwargs)

            # Valida formato: "Nostr <base64_event>"
            if not auth_header.startswith('Nostr '):
                if required:
                    return jsonify({'message': 'Missing authorization'}), 401
                request.blossom_pubkey = None
                return f(*args, **kwargs)

            try:
                # Decodifica evento base64
                event_b64 = auth_header[6:]  # Remove "Nostr "
                event_json = base64.b64decode(event_b64).decode('utf-8')

                # Parse evento Nostr
                event = NostrEvent.from_json(event_json)

                # Valida kind 24242 (Blossom Auth)
                if event.kind().as_u16() != 24242:
                    return jsonify({'message': 'Invalid auth event kind (expected 24242)'}), 401

                # Valida assinatura
                if not event.verify():
                    return jsonify({'message': 'Invalid signature'}), 401

                # Valida timestamp (máximo 10 minutos de diferença)
                event_time = event.created_at().as_secs()
                now = int(time.time())
                if abs(now - event_time) > 600:
                    return jsonify({'message': 'Authorization expired'}), 401

                # Extrai tags
                tags = {}
                for tag in event.tags().to_vec():
                    tag_list = tag.as_vec()
                    if len(tag_list) >= 2:
                        tags[tag_list[0]] = tag_list[1]

                # Tag 't' deve ser 'upload' para uploads
                action = tags.get('t', '')
                if action and action not in ['upload', 'list', 'get', 'delete']:
                    return jsonify({'message': f'Invalid action: {action}'}), 401

                # Extrai pubkey
                pubkey = event.author()
                pubkey_hex = pubkey.to_hex()

                # Verifica blacklist
                if is_blacklisted(pubkey_hex):
                    print(f"[BLACKLIST] ⛔ Acesso bloqueado: {pubkey.to_bech32()}")
                    return jsonify({'message': 'Access denied'}), 403

                # Sucesso! Anexa pubkey ao request
                request.blossom_pubkey = pubkey.to_bech32()
                request.blossom_pubkey_hex = pubkey_hex
                request.blossom_event = event
                request.blossom_action = action
                request.blossom_sha256 = tags.get('x', '')  # Hash SHA256 se presente

                print(f"[Blossom] ✅ Auth válido: {pubkey.to_bech32()[:16]}... action={action} método={request.method}")

                return f(*args, **kwargs)

            except Exception as e:
                print(f"[Blossom] ❌ Erro ao validar: {e}")
                if required:
                    return jsonify({'message': f'Authorization error: {str(e)}'}), 401
                request.blossom_pubkey = None
                return f(*args, **kwargs)

        return decorated_function
    return decorator


@app.route("/api/nip98/sign", methods=["POST"])
def api_nip98_sign():
    """
    Endpoint para criar e assinar evento NIP-98 (HTTP Auth)
    Usado quando usuário tem privkey no banco
    """
    try:
        data = request.get_json()
        npub = data.get("npub")
        http_method = data.get("http_method", "GET")
        http_url = data.get("http_url", "")
        payload = data.get("payload")

        if not npub or not http_url:
            return jsonify({"status": "error", "error": "npub e http_url obrigatórios"}), 400

        # Busca usuário
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        if not usuario.privkey or usuario.privkey == "":
            return jsonify({"status": "error", "error": "Usuário sem privkey"}), 400

        # Cria evento NIP-98
        keys = Keys.parse(usuario.privkey)

        # Tags obrigatórias
        tags = [
            Tag.parse(["u", http_url]),
            Tag.parse(["method", http_method.upper()])
        ]

        # Se tem payload, adiciona hash
        if payload:
            import hashlib
            payload_hash = hashlib.sha256(payload.encode()).hexdigest()
            tags.append(Tag.parse(["payload", payload_hash]))

        # Cria evento kind 27235
        builder = EventBuilder(NostrKind(27235), "", tags)
        event = builder.sign_with_keys(keys)

        # Serializa para JSON e converte para base64
        event_json = event.as_json()
        event_b64 = base64.b64encode(event_json.encode()).decode()

        print(f"[NIP-98] ✅ Evento assinado para {npub[:16]}... método={http_method} url={http_url}")

        return jsonify({
            "status": "ok",
            "auth_header": event_b64,
            "event_id": event.id().to_hex()
        })

    except Exception as e:
        print(f"[NIP-98] ❌ Erro ao assinar: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


# --- Modelo de usuário ---
class Usuario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    pubkey = db.Column(db.String(256), unique=True, nullable=False)
    privkey = db.Column(db.String(256), nullable=False)
    senha_hash = db.Column(db.String(256), nullable=False)
    plano = db.Column(db.String(32), default="free")
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

    # Sistema de assinaturas
    expiration_date = db.Column(db.Integer, nullable=True)  # Unix timestamp de expiração
    subscription_months = db.Column(db.Integer, default=0)  # Duração em meses (0 = free)
    email = db.Column(db.String(120), nullable=True)  # Email para notificações
    last_notification = db.Column(db.Integer, nullable=True)  # Última notificação enviada

    # NIP-05: Verificação de identidade
    nip05_username = db.Column(db.String(64), unique=True, nullable=True)  # username@libermedia.app
    nip05_verified = db.Column(db.Boolean, default=False)  # Se está verificado

# --- Modelo de Suporte ---
class Suporte(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    mensagem = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))
    respondido = db.Column(db.Boolean, default=False)

with app.app_context():
    db.create_all()

# --- Rotas principais ---
@app.route("/", methods=["GET", "POST", "OPTIONS"])
def index():
    """Homepage - com suporte para POST/OPTIONS para debug de clientes NIP-96"""

    # Workaround: alguns clientes Nostr enviam para raiz ao invés de /api/upload/nip96

    # Handle OPTIONS (CORS preflight)
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok", "message": "Use /api/upload/nip96 for uploads"})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response, 200

    # Handle POST (WORKAROUND para clientes que enviam na raiz)
    if request.method == "POST":
        # Verifica se é um upload (tem arquivo - qualquer campo)
        if request.files:
            print(f"[NIP-96] ⚠️ Cliente enviou upload para raiz '/' ao invés de '/api/upload/nip96'")
            # Chama o handler NIP-96 diretamente
            return _nip96_upload_post()

        return jsonify({
            "status": "error",
            "message": "Invalid request. See /.well-known/nostr/nip96.json for upload endpoint"
        }), 400

    # GET - página normal
    return render_template("index.html")


# ============================================
# NIP-05: VERIFICATION (username@libermedia.app)
# ============================================

@app.route("/.well-known/nostr.json")
def nip05_verification():
    """
    Endpoint NIP-05 para verificação de identidade
    Retorna mapeamento username → pubkey

    Exemplo: GET /.well-known/nostr.json?name=luciano
    Retorna: {"names": {"luciano": "9b31915dd140b34774cb60c42fc0e015d800cde7f5e4f82a5f2d4e21d72803e4"}}
    """
    try:
        # Busca todos usuários verificados
        usuarios_verificados = Usuario.query.filter_by(nip05_verified=True).all()

        # Cria dicionário de mapeamentos
        names = {}
        relays = {}

        for usuario in usuarios_verificados:
            if usuario.nip05_username:
                # Remove npub prefix e converte para hex se necessário
                pubkey_hex = usuario.pubkey
                if pubkey_hex.startswith("npub"):
                    # Converte npub para hex
                    from nostr_sdk import Nip19
                    try:
                        decoded = Nip19.from_bech32(pubkey_hex)
                        pubkey_hex = decoded.as_enum().npub.to_hex()
                    except:
                        print(f"[NIP-05] Erro ao converter npub para hex: {pubkey_hex}")
                        continue

                names[usuario.nip05_username] = pubkey_hex
                # Adiciona relays recomendados (opcional)
                relays[usuario.nip05_username] = [
                    "wss://relay.damus.io",
                    "wss://nos.lol",
                    "wss://relay.nostr.band"
                ]

        # Retorna JSON conforme especificação NIP-05
        response = {"names": names}
        if relays:
            response["relays"] = relays

        return jsonify(response), 200, {'Content-Type': 'application/json; charset=utf-8'}

    except Exception as e:
        print(f"[NIP-05] Erro no endpoint: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"names": {}}), 200


# ============================================
# NIP-96: FILE STORAGE INTEGRATION
# ============================================

def _get_nip96_config():
    """Retorna configuração NIP-96 (compartilhado entre endpoints)"""
    return {
        "api_url": "https://libermedia.app/api/upload/nip96",
        "download_url": "https://libermedia.app/f",
        "delegated_to_url": None,
        "supported_nips": [96, 98],
        "tos_url": "https://libermedia.app/terms",
        "content_types": [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/webm",
            "video/mov",
            "video/avi",
            "audio/mp3",
            "audio/wav",
            "audio/ogg",
            "audio/m4a",
            "application/pdf"
        ],
        "plans": {
            "free": {
                "name": "Free",
                "is_nip98_required": True,
                "url": "https://libermedia.app/plans",
                "max_byte_size": 3 * 1024 * 1024 * 1024,  # 3 GB
                "file_expiration": [0, 0],  # nunca expira
                "media_transformations": {
                    "image": []
                }
            },
            "alpha": {
                "name": "Alpha",
                "is_nip98_required": True,
                "url": "https://libermedia.app/plans",
                "max_byte_size": 6 * 1024 * 1024 * 1024,  # 6 GB
                "file_expiration": [0, 0]
            },
            "bravo": {
                "name": "Bravo",
                "is_nip98_required": True,
                "url": "https://libermedia.app/plans",
                "max_byte_size": 12 * 1024 * 1024 * 1024,  # 12 GB
                "file_expiration": [0, 0]
            }
        }
    }

@app.route("/.well-known/nostr/nip96.json")
def nip96_discovery():
    """
    Endpoint de descoberta NIP-96 (localização padrão)
    Informa capacidades do servidor para clientes Nostr
    """
    response = jsonify(_get_nip96_config())
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response

@app.route("/nip96.json")
def nip96_discovery_alt():
    """
    Endpoint alternativo de descoberta NIP-96
    Alguns clientes (como Jumble) podem buscar aqui
    """
    response = jsonify(_get_nip96_config())
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response


@app.route("/.well-known/blossom")
def blossom_discovery():
    """
    Endpoint de descoberta Blossom (BUD-01)
    Informa capacidades do servidor para clientes Blossom
    """
    config = {
        "name": "LiberMedia Blossom Server",
        "description": "Decentralized file storage with Nostr authentication",
        "pubkey": "9b31915dd140b34774cb60c42fc0e015d800cde7f5e4f82a5f2d4e21d72803e4",  # Pubkey do servidor
        "icons": ["https://libermedia.app/static/img/logo.jpg"],
        "upload": {
            "enabled": True,
            "max_size": 3221225472,  # 3GB para free, ajustado por plano
            "mime_types": [
                "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
                "video/mp4", "video/webm", "video/mov", "video/avi",
                "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a",
                "application/pdf"
            ]
        },
        "storage": {
            "enabled": True,
            "retention": 0,  # 0 = permanent
            "public": True
        }
    }
    response = jsonify(config)
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response


@app.route("/api/upload/nip96", methods=["POST", "OPTIONS"])
def nip96_upload():
    """
    Endpoint de upload compatível com NIP-96
    Suporta OPTIONS (CORS preflight) e POST (upload)
    """
    # Handle OPTIONS preflight (CORS já adiciona headers automaticamente)
    if request.method == "OPTIONS":
        return '', 204

    # POST request - requer NIP-98 auth
    return _nip96_upload_post()

def _add_cors_headers(response):
    """
    DEPRECATED: Flask-CORS agora cuida dos headers automaticamente
    Mantido por compatibilidade com código antigo
    """
    # Headers já são adicionados pelo Flask-CORS
    return response

@validate_nip98_auth(required=True)
def _nip96_upload_post():
    """Handler de POST após validação NIP-98"""
    try:
        # Log detalhado para debug
        print(f"[NIP-96] 📨 Request files: {list(request.files.keys())}")
        print(f"[NIP-96] 📨 Request form: {list(request.form.keys())}")

        # Aceita qualquer campo de arquivo (diferentes clientes usam nomes diferentes)
        file = None
        file_field_name = None

        # Tenta campos conhecidos primeiro
        if 'file' in request.files:
            file = request.files['file']
            file_field_name = 'file'
        elif 'fileToUpload' in request.files:
            file = request.files['fileToUpload']
            file_field_name = 'fileToUpload'
        elif request.files:
            # Pega o primeiro arquivo encontrado
            file_field_name = list(request.files.keys())[0]
            file = request.files[file_field_name]
            print(f"[NIP-96] 📎 Arquivo recebido em campo não-padrão: '{file_field_name}'")

        if not file or file.filename == '':
            print(f"[NIP-96] ❌ Nenhum arquivo válido encontrado")
            return jsonify({
                "status": "error",
                "message": "No file provided"
            }), 400

        print(f"[NIP-96] ✅ Arquivo recebido: {file.filename} (campo: {file_field_name})")
        npub = request.nip98_pubkey  # Vem do decorator NIP-98

        # Parâmetros opcionais NIP-96
        caption = request.form.get('caption', '')
        expiration = request.form.get('expiration', '')
        size = request.form.get('size', '')
        alt = request.form.get('alt', '')
        pasta = request.form.get('pasta', 'Photos')  # LiberMedia specific

        # Busca ou cria usuário
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            usuario = Usuario(
                nome="Nostr User",
                pubkey=npub,
                privkey="",
                senha_hash="nip98_auth",
                plano="free"
            )
            db.session.add(usuario)
            db.session.commit()

        # Valida tamanho do arquivo
        plano_limites = LIMITES_PLANO.get(usuario.plano, LIMITES_PLANO['free'])
        file.seek(0, 2)  # vai para o final
        tamanho = file.tell()
        file.seek(0)  # volta para o início

        if tamanho > plano_limites:
            return jsonify({
                "status": "error",
                "message": f"File too large. Max size for {usuario.plano} plan: {plano_limites / (1024**3):.0f}GB"
            }), 413

        # Calcula SHA256
        import hashlib
        file_data = file.read()
        file.seek(0)
        sha256_hash = hashlib.sha256(file_data).hexdigest()

        # Gera nome único
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'bin'
        nome_unico = f"{int(time.time())}_{usuario.id}.{ext}"
        caminho = os.path.join('uploads', nome_unico)

        # Salva arquivo
        file.save(caminho)
        tamanho_real = os.path.getsize(caminho)

        # Detecta MIME type
        import mimetypes
        mime_type = mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'

        # Detecta tipo LiberMedia
        tipos = {
            'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
            'mp4': 'video', 'avi': 'video', 'mov': 'video', 'webm': 'video',
            'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document',
            'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'm4a': 'audio'
        }
        tipo = tipos.get(ext, 'document')

        # Salva no banco
        novo_arquivo = Arquivo(
            usuario_id=usuario.id,
            nome=nome_unico,
            nome_original=file.filename,
            tipo=tipo,
            tamanho=tamanho_real,
            pasta=pasta,
            caminho=caminho
        )
        db.session.add(novo_arquivo)
        db.session.commit()

        # Cria URL de download
        download_url = f"https://libermedia.app/f/{novo_arquivo.id}.{ext}"

        # Cria evento NIP-94 (kind 1063) - File Metadata
        # Publica em relays Nostr para descoberta
        if usuario.privkey and usuario.privkey != "":
            try:
                nip94_event = publicar_file_metadata(
                    nsec=usuario.privkey,
                    url=download_url,
                    mime_type=mime_type,
                    sha256=sha256_hash,
                    size=tamanho_real,
                    alt=alt or file.filename,
                    caption=caption
                )
            except Exception as e:
                print(f"[NIP-96] ⚠️ Erro ao publicar NIP-94: {e}")
                nip94_event = None
        else:
            nip94_event = None

        # Resposta NIP-96 - Formato conforme especificação
        # CRÍTICO: "content" é obrigatório (deve ser string vazia)
        nip94_response = {
            "tags": [
                ["url", download_url],
                ["ox", sha256_hash],  # original hash (antes de transformação)
                ["x", sha256_hash],   # hash atual (mesmo, pois não transformamos)
                ["m", mime_type],
                ["size", str(tamanho_real)]
            ],
            "content": ""  # OBRIGATÓRIO - deve ser string vazia
        }

        # Se conseguimos publicar evento NIP-94 assinado, incluir campos adicionais
        if nip94_event:
            nip94_response["id"] = nip94_event.get("id", "")
            nip94_response["pubkey"] = nip94_event.get("pubkey", "")
            nip94_response["created_at"] = nip94_event.get("created_at", 0)
            nip94_response["kind"] = 1063
            nip94_response["sig"] = nip94_event.get("sig", "")

        response = {
            "status": "success",
            "message": "File uploaded successfully",
            "nip94_event": nip94_response
        }

        print(f"[NIP-96] ✅ Upload completo: {file.filename} ({tamanho_real} bytes) por {npub[:16]}...")
        print(f"[NIP-96] 🔗 URL: {download_url}")

        # Retorna com CORS headers e status 201 Created (não 200!)
        return _add_cors_headers(jsonify(response)), 201

    except Exception as e:
        db.session.rollback()
        print(f"[NIP-96] ❌ Erro no upload: {e}")
        import traceback
        traceback.print_exc()
        return _add_cors_headers(jsonify({
            "status": "error",
            "message": str(e)
        })), 500


def publicar_file_metadata(nsec, url, mime_type, sha256, size, alt="", caption=""):
    """
    Publica evento kind 1063 (File Metadata) nos relays Nostr
    Compatível com NIP-94
    """
    try:
        from nostr_sdk import FileMetadata

        keys = Keys.parse(nsec)

        # Cria FileMetadata com dados obrigatórios
        metadata = FileMetadata(url, mime_type, sha256)
        metadata.size(size)

        # Description (conteúdo do evento)
        description = caption if caption else alt if alt else ""

        # Cria evento kind 1063 usando método específico
        builder = EventBuilder.file_metadata(description, metadata)
        event = builder.sign_with_keys(keys)

        # Publica nos relays (async)
        import asyncio
        asyncio.run(publicar_event_async(event))

        # Retorna evento serializado como JSON e depois como dict
        import json
        event_json = event.as_json()
        return json.loads(event_json)

    except Exception as e:
        print(f"[NIP-94] ❌ Erro ao criar evento: {e}")
        return None


async def publicar_event_async(event):
    """Helper async para publicar evento nos relays"""
    try:
        client = Client()
        await client.add_relay(RelayUrl.parse("wss://relay.damus.io"))
        await client.add_relay(RelayUrl.parse("wss://nos.lol"))
        await client.add_relay(RelayUrl.parse("wss://relay.nostr.band"))

        await client.connect()
        output = await client.send_event(event)

        print(f"[NIP-94] ✅ Evento publicado: {output.id.to_hex()}")

        await client.disconnect()
    except Exception as e:
        print(f"[NIP-94] ❌ Erro ao publicar: {e}")


# ============================================
# BLOSSOM: ENDPOINTS DE FILE STORAGE
# ============================================

@app.route("/upload", methods=["PUT", "OPTIONS"])
@validate_blossom_auth(required=True)
def blossom_upload():
    """
    Endpoint Blossom para upload de arquivos (BUD-02)
    PUT /upload - recebe binário raw, retorna blob descriptor
    """
    if request.method == "OPTIONS":
        return '', 204

    try:
        # Lê dados binários do body
        file_data = request.get_data()

        if not file_data or len(file_data) == 0:
            return jsonify({'message': 'No file data provided'}), 400

        # Pega informações do auth
        npub = request.blossom_pubkey
        pubkey_hex = request.blossom_pubkey_hex

        # Busca ou cria usuário
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            usuario = Usuario(
                nome="Nostr User",
                pubkey=npub,
                privkey="",
                senha_hash="blossom_auth",
                plano="free"
            )
            db.session.add(usuario)
            db.session.commit()

        # Valida tamanho do arquivo
        plano_limites = LIMITES_PLANO.get(usuario.plano, LIMITES_PLANO['free'])
        file_size = len(file_data)

        if file_size > plano_limites:
            return jsonify({
                'message': f'File too large. Max: {plano_limites / (1024**3):.0f}GB'
            }), 413

        # Calcula SHA256
        import hashlib
        sha256_hash = hashlib.sha256(file_data).hexdigest()

        # Verifica se já existe arquivo com esse hash (deduplicação)
        arquivo_existente = Arquivo.query.filter_by(usuario_id=usuario.id).filter(
            Arquivo.caminho.like(f'%{sha256_hash}%')
        ).first()

        if arquivo_existente:
            # Arquivo já existe - retorna descriptor existente
            print(f"[Blossom] 📦 Arquivo já existe (dedupe): {sha256_hash[:16]}...")

            # Detecta MIME type
            import mimetypes
            ext = arquivo_existente.nome.rsplit('.', 1)[1] if '.' in arquivo_existente.nome else 'bin'
            mime_type = mimetypes.guess_type(arquivo_existente.nome)[0] or 'application/octet-stream'

            blob_descriptor = {
                "url": f"https://libermedia.app/{sha256_hash}",
                "sha256": sha256_hash,
                "size": arquivo_existente.tamanho,
                "type": mime_type,
                "uploaded": arquivo_existente.created_at
            }

            return jsonify(blob_descriptor), 200

        # Detecta tipo de arquivo pelo header (magic bytes)
        mime_type = 'application/octet-stream'
        ext = 'bin'

        # Magic bytes para tipos comuns
        if file_data[:4] == b'\xff\xd8\xff\xe0' or file_data[:4] == b'\xff\xd8\xff\xe1':
            mime_type, ext = 'image/jpeg', 'jpg'
        elif file_data[:8] == b'\x89PNG\r\n\x1a\n':
            mime_type, ext = 'image/png', 'png'
        elif file_data[:4] == b'GIF8':
            mime_type, ext = 'image/gif', 'gif'
        elif file_data[:4] == b'RIFF' and file_data[8:12] == b'WEBP':
            mime_type, ext = 'image/webp', 'webp'
        elif file_data[:12] == b'\x00\x00\x00\x1cftypmp42' or file_data[4:12] == b'ftypmp42':
            mime_type, ext = 'video/mp4', 'mp4'
        elif file_data[:4] == b'\x1aE\xdf\xa3':
            mime_type, ext = 'video/webm', 'webm'
        elif file_data[:4] == b'ID3\x03' or file_data[:4] == b'ID3\x04':
            mime_type, ext = 'audio/mpeg', 'mp3'
        elif file_data[:4] == b'%PDF':
            mime_type, ext = 'application/pdf', 'pdf'

        # Salva arquivo com nome baseado no SHA256
        nome_arquivo = f"{sha256_hash}.{ext}"
        caminho = os.path.join('uploads', nome_arquivo)

        with open(caminho, 'wb') as f:
            f.write(file_data)

        # Detecta tipo LiberMedia
        tipos = {
            'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
            'mp4': 'video', 'webm': 'video', 'mov': 'video', 'avi': 'video',
            'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document',
            'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'm4a': 'audio'
        }
        tipo = tipos.get(ext, 'document')

        # Salva no banco
        novo_arquivo = Arquivo(
            usuario_id=usuario.id,
            nome=nome_arquivo,
            nome_original=f"blossom_{sha256_hash[:8]}.{ext}",
            tipo=tipo,
            tamanho=file_size,
            pasta='Blossom',
            caminho=caminho
        )
        db.session.add(novo_arquivo)
        db.session.commit()

        # Blob descriptor response
        blob_descriptor = {
            "url": f"https://libermedia.app/{sha256_hash}",
            "sha256": sha256_hash,
            "size": file_size,
            "type": mime_type,
            "uploaded": novo_arquivo.created_at
        }

        print(f"[Blossom] ✅ Upload: {sha256_hash[:16]}... ({file_size} bytes) por {npub[:16]}...")

        return jsonify(blob_descriptor), 201

    except Exception as e:
        db.session.rollback()
        print(f"[Blossom] ❌ Erro no upload: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'message': str(e)}), 500


@app.route("/list/<pubkey>", methods=["GET"])
def blossom_list(pubkey):
    """
    Lista todos os blobs de um pubkey (BUD-04)
    GET /list/<pubkey> - retorna array de blob descriptors
    """
    try:
        # Converte npub para hex se necessário
        if pubkey.startswith('npub'):
            from nostr_sdk import Nip19
            decoded = Nip19.from_bech32(pubkey)
            pubkey_hex = decoded.as_enum().npub.to_hex()
            pubkey_npub = pubkey
        else:
            # Assume que já é hex
            pubkey_hex = pubkey
            # Converte para npub
            from nostr_sdk import PublicKey
            pk = PublicKey.from_hex(pubkey_hex)
            pubkey_npub = pk.to_bech32()

        # Busca usuário
        usuario = Usuario.query.filter_by(pubkey=pubkey_npub).first()
        if not usuario:
            return jsonify([]), 200

        # Busca todos arquivos do usuário na pasta Blossom
        arquivos = Arquivo.query.filter_by(usuario_id=usuario.id, pasta='Blossom').all()

        blob_list = []
        import mimetypes

        for arquivo in arquivos:
            # Extrai SHA256 do nome do arquivo
            sha256_hash = arquivo.nome.split('.')[0] if '.' in arquivo.nome else arquivo.nome

            # Detecta MIME type
            mime_type = mimetypes.guess_type(arquivo.nome)[0] or 'application/octet-stream'

            blob_list.append({
                "url": f"https://libermedia.app/{sha256_hash}",
                "sha256": sha256_hash,
                "size": arquivo.tamanho,
                "type": mime_type,
                "uploaded": arquivo.created_at
            })

        print(f"[Blossom] 📋 List: {len(blob_list)} blobs para {pubkey_npub[:16]}...")
        return jsonify(blob_list), 200

    except Exception as e:
        print(f"[Blossom] ❌ Erro ao listar: {e}")
        return jsonify({'message': str(e)}), 500


@app.route("/<sha256>", methods=["GET", "HEAD"])
def blossom_get_blob(sha256):
    """
    Retorna blob por SHA256 (BUD-02)
    GET /<sha256> - retorna arquivo
    HEAD /<sha256> - verifica existência
    """
    try:
        # Valida formato SHA256 (64 caracteres hex)
        if len(sha256) != 64 or not all(c in '0123456789abcdef' for c in sha256.lower()):
            return jsonify({'message': 'Invalid SHA256 format'}), 400

        # Procura arquivo com esse hash no nome
        arquivo = Arquivo.query.filter(Arquivo.nome.like(f'{sha256}%')).first()

        if not arquivo:
            return jsonify({'message': 'Blob not found'}), 404

        # HEAD request - apenas verifica existência
        if request.method == "HEAD":
            response = make_response('', 200)
            response.headers['Content-Type'] = 'application/octet-stream'
            response.headers['Content-Length'] = str(arquivo.tamanho)
            return response

        # GET request - retorna arquivo
        # Redireciona para o caminho real
        return redirect(f"/uploads/{arquivo.nome}")

    except Exception as e:
        print(f"[Blossom] ❌ Erro ao buscar blob: {e}")
        return jsonify({'message': str(e)}), 500


@app.route("/cadastro")
def cadastro_page():
    return render_template("cadastro.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/registro")
def registro_page():
    return render_template("registro.html")

@app.route("/dashboard-v2")
def dashboard_v2():
    return render_template("dashboard-v2.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", timestamp=int(time.time()))

# --- API Registro ---
@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(force=True)
    nome = data.get("nome")
    pubkey = data.get("pubkey")
    privkey = data.get("privkey")
    password = data.get("password")
    confirm = data.get("confirm")

    if not nome or not pubkey or not privkey or not password or not confirm:
        return jsonify({"error": "Todos os campos são obrigatórios"}), 400

    if password != confirm:
        return jsonify({"error": "As senhas não coincidem"}), 400

    if Usuario.query.filter_by(pubkey=pubkey).first():
        return jsonify({"error": "Usuário já existe"}), 400

    senha_hash = generate_password_hash(password)
    user = Usuario(
        nome=nome,
        pubkey=pubkey,
        privkey=privkey,
        senha_hash=senha_hash
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({"message": "Usuário registrado com sucesso", "plan": user.plano}), 200

# --- API Login ---
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True)
    pubkey = data.get("pubkey")
    password = data.get("password")

    # Verifica blacklist
    is_blocked, _ = check_blacklist_npub(pubkey)
    if is_blocked:
        print(f"[BLACKLIST] ⛔ Login bloqueado: {pubkey[:20]}...")
        return jsonify({"error": "Acesso negado"}), 403

    user = Usuario.query.filter_by(pubkey=pubkey).first()
    if not user or not check_password_hash(user.senha_hash, password):
        return jsonify({"error": "Credenciais inválidas"}), 401

    token = jwt.encode(
        {"pubkey": pubkey, "plan": user.plano, "exp": time.time() + 3600},
        JWT_SECRET,
        algorithm=JWT_ALGO
    )
    return jsonify({"token": token, "plan": user.plano}), 200

# --- API Me ---
@app.route("/api/me", methods=["GET"])
def api_me():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Token ausente"}), 401

    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return jsonify({"error": "Token inválido"}), 401

    user = Usuario.query.filter_by(pubkey=payload["pubkey"]).first()
    if not user:
        return jsonify({"error": "Usuário não encontrado"}), 404

    return jsonify({
        "nome": user.nome,
        "pubkey": user.pubkey,
        "plano": user.plano,
        "created_at": user.created_at
    })

# --- Healthcheck ---
@app.route("/health")
def health():
    try:
        db.session.execute("SELECT 1")
        return jsonify({"status": "ok", "db": True})
    except Exception:
        return jsonify({"status": "erro", "db": False}), 500

# --- Main ---

# === [Login Routes] ===
@app.route("/login-nip07")
def login_nip07():
    return render_template("login_nip07.html")

@app.route("/sobre")
def sobre():
    return render_template("sobre.html")
@app.route("/suporte")
def suporte():
    return render_template("suporte.html")
import json, os
def _load_plans_config():
    conf_path = os.path.join(os.path.dirname(__file__), "config", "plans.json")
    with open(conf_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("plans", []), data
@app.route("/planos")
def planos():
    plans, meta = _load_plans_config()
    return render_template("planos.html", plans=plans, meta=meta)
import os, json, requests
from flask import jsonify, abort, session
def _load_lnbits_env():
    env_path = os.path.join(os.path.dirname(__file__), "secrets", "lnbits.env")
    cfg = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line=line.strip()
                if not line or line.startswith("#"): continue
                k,v = line.split("=",1)
                cfg[k.strip()] = v.strip()
    return cfg
def lnbits_create_invoice(amount_sats: int, memo: str):
    cfg = _load_lnbits_env()
    base = cfg.get("LNBITS_URL", "").rstrip("/")
    key  = cfg.get("LNBITS_INVOICE_KEY", "")
    if not base or not key:
        raise RuntimeError("LNBits não configurado (URL/INVOICE_KEY ausentes)")
    url = f"{base}/api/v1/payments"
    payload = {"out": False, "amount": amount_sats, "memo": memo}
    headers = {"X-Api-Key": key, "Content-Type": "application/json"}
    r = requests.post(url, headers=headers, json=payload, timeout=20)
    if r.status_code not in [200, 201]:
        raise RuntimeError(f"LNBits erro HTTP {r.status_code}: {r.text}")
    data = r.json()
    return {
        "bolt11": data.get("bolt11"),
        "checking_id": data.get("checking_id")
    }

# === OPENNODE INTEGRATION ===
def _load_opennode_env():
    """Carrega configuração do OpenNode"""
    env_path = os.path.join(os.path.dirname(__file__), "secrets", "opennode.env")
    cfg = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    cfg[k.strip()] = v.strip()
    return cfg

def opennode_create_invoice(amount_sats: int, memo: str):
    """Cria invoice no OpenNode"""
    cfg = _load_opennode_env()
    api_key = cfg.get("OPENNODE_API_KEY", "")
    base_url = cfg.get("OPENNODE_API_URL", "https://api.opennode.com/v1")

    if not api_key:
        raise RuntimeError("OpenNode não configurado (API_KEY ausente)")

    url = f"{base_url}/charges"
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "amount": amount_sats,
        "currency": "btc",
        "description": memo,
        "callback_url": "https://libermedia.app/api/webhook/opennode"
    }

    r = requests.post(url, headers=headers, json=payload, timeout=20)

    if r.status_code not in [200, 201]:
        raise RuntimeError(f"OpenNode erro HTTP {r.status_code}: {r.text}")

    data = r.json()
    charge_data = data.get("data", {})

    print(f"[OPENNODE] ✅ Invoice criado: {amount_sats} sats - {charge_data.get('id')}")

    return {
        "bolt11": charge_data.get("lightning_invoice", {}).get("payreq", ""),
        "payment_hash": charge_data.get("id")  # usado como checking_id
    }

def opennode_check_invoice(charge_id: str):
    """Verifica status de pagamento no OpenNode"""
    cfg = _load_opennode_env()
    api_key = cfg.get("OPENNODE_API_KEY", "")
    base_url = cfg.get("OPENNODE_API_URL", "https://api.opennode.com/v1")

    if not api_key:
        raise RuntimeError("OpenNode não configurado (API_KEY ausente)")

    url = f"{base_url}/charge/{charge_id}"
    headers = {
        "Authorization": api_key
    }

    r = requests.get(url, headers=headers, timeout=15)

    if r.status_code not in [200, 201]:
        raise RuntimeError(f"OpenNode erro HTTP {r.status_code}: {r.text}")

    data = r.json()
    charge_data = data.get("data", {})

    # OpenNode retorna status: "paid", "unpaid", "processing", etc
    status = charge_data.get("status", "unpaid")
    is_paid = (status == "paid")

    return {
        "paid": is_paid,
        "amount_sat": charge_data.get("amount", 0)
    }
def _calculate_subscription_price(base_price, months):
    """Calcula preço com desconto baseado no período"""
    discount_rates = {
        1: 0.00,   # 0% desconto
        2: 0.02,   # 2% desconto
        6: 0.04,   # 4% desconto
        12: 0.08   # 8% desconto
    }

    discount = discount_rates.get(months, 0)
    total = base_price * months
    final_price = int(total * (1 - discount))

    return final_price

@app.route("/api/invoice/<plan_id>", methods=["POST","GET"])
def api_invoice(plan_id):
    plans, meta = _load_plans_config()
    plan = next((p for p in plans if p.get("id")==plan_id), None)
    if not plan:
        abort(404, description="Plano não encontrado")

    base_amount = int(plan.get("amount_sats", 0))
    if base_amount <= 0:
        return jsonify({"status":"free","message":"Plano gratuito — contribua livre se desejar."})

    # Obtém período (padrão: 1 mês)
    months = int(request.args.get('months', 1))
    if months not in [1, 2, 6, 12]:
        months = 1

    # Calcula preço final com desconto
    final_amount = _calculate_subscription_price(base_amount, months)

    memo = f"LiberMedia {plan.get('name')} - {months} {'mês' if months == 1 else 'meses'}"

    try:
        inv = opennode_create_invoice(final_amount, memo)
        return jsonify({
            "status": "ok",
            "plan": plan_id,
            "amount_sats": final_amount,
            "months": months,
            "bolt11": inv["bolt11"],
            "checking_id": inv["payment_hash"]
        })
    except Exception as e:
        return jsonify({"status":"error","error":str(e)}), 500
import requests
from flask import jsonify, session
@app.route("/api/invoice/create/<plan_id>", methods=["POST"])
def api_create_invoice(plan_id):
    try:
        plans, _ = _load_plans_config()
        plan = next((p for p in plans if p.get("id") == plan_id), None)
        if not plan:
            return jsonify({"status": "error", "error": "Plano não encontrado"}), 404
        if plan["amount_sats"] == 0:
            return jsonify({"status": "free", "message": "Plano gratuito"}), 200

        memo = f"LiberMedia Plano {plan['name']}"
        inv = opennode_create_invoice(plan["amount_sats"], memo)

        return jsonify({
            "status": "ok",
            "plan": plan["name"],
            "bolt11": inv["bolt11"],
            "checking_id": inv["payment_hash"]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
@app.route("/api/invoice/check/<checking_id>", methods=["GET"])
def api_check_invoice(checking_id):
    try:
        result = opennode_check_invoice(checking_id)
        return jsonify({
            "status": "ok",
            "paid": result["paid"]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/upgrade-plan", methods=["POST"])
def api_upgrade_plan():
    """Faz upgrade do plano do usuário após pagamento confirmado"""
    try:
        data = request.get_json()
        npub = data.get('npub')
        plan_id = data.get('plan_id')
        checking_id = data.get('checking_id')
        months = int(data.get('months', 1))

        if not npub or not plan_id or not checking_id:
            return jsonify({"status": "error", "error": "Parâmetros incompletos"}), 400

        # Verifica pagamento no OpenNode
        payment_result = opennode_check_invoice(checking_id)

        if not payment_result.get("paid", False):
            return jsonify({"status": "error", "error": "Pagamento não confirmado"}), 400

        # Busca usuário
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        # Calcula data de expiração
        from datetime import datetime, timedelta
        from dateutil.relativedelta import relativedelta

        now = datetime.now()

        # Se já tem expiração futura, estende a partir dela
        if usuario.expiration_date and usuario.expiration_date > int(now.timestamp()):
            expiration_datetime = datetime.fromtimestamp(usuario.expiration_date)
            new_expiration = expiration_datetime + relativedelta(months=months)
        else:
            # Nova assinatura, inicia agora
            new_expiration = now + relativedelta(months=months)

        # Atualiza usuário
        usuario.plano = plan_id
        usuario.expiration_date = int(new_expiration.timestamp())
        usuario.subscription_months = months
        db.session.commit()

        expiration_str = new_expiration.strftime('%d/%m/%Y')
        print(f"[UPGRADE] ✅ Usuário {usuario.nome} ({npub[:16]}...) upgraded para {plan_id} - {months} {'mês' if months == 1 else 'meses'} - Expira: {expiration_str}")

        return jsonify({
            "status": "ok",
            "message": f"Plano atualizado para {plan_id} por {months} {'mês' if months == 1 else 'meses'}!",
            "new_plan": plan_id,
            "expiration_date": int(new_expiration.timestamp()),
            "expiration_formatted": expiration_str
        })

    except Exception as e:
        db.session.rollback()
        print(f"[UPGRADE] ❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500



# === [INTEGRAÇÃO LOGIN/CADASTRO COM BANCO] ===
@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    """Registra novo usuário no banco após gerar chaves"""
    try:
        data = request.get_json()
        npub = data.get("npub")
        nsec = data.get("nsec")
        nome = data.get("nome", "Usuário")
        
        if not npub or not nsec:
            return jsonify({"status": "error", "error": "npub e nsec obrigatórios"}), 400
        
        # Verifica se já existe
        existing = Usuario.query.filter_by(pubkey=npub).first()
        if existing:
            return jsonify({"status": "error", "error": "Usuário já cadastrado"}), 409
        
        # Cria novo usuário
        novo = Usuario(
            nome=nome,
            pubkey=npub,
            privkey=nsec,  # ⚠️ ATENÇÃO: em produção, criptografar!
            senha_hash="nostr_auth",  # placeholder
            plano="free"
        )
        db.session.add(novo)
        db.session.commit()
        
        return jsonify({"status": "ok", "message": "Usuário criado", "plano": "free"})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Faz login e retorna dados do usuário"""
    try:
        data = request.get_json()
        npub = data.get("npub")

        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400

        # Verifica blacklist
        is_blocked, _ = check_blacklist_npub(npub)
        if is_blocked:
            print(f"[BLACKLIST] ⛔ Login bloqueado: {npub[:20]}...")
            return jsonify({"status": "error", "error": "Acesso negado"}), 403

        # Busca usuário
        user = Usuario.query.filter_by(pubkey=npub).first()
        
        if user:
            return jsonify({
                "status": "ok",
                "user": {
                    "nome": user.nome,
                    "npub": user.pubkey,
                    "plano": user.plano,
                    "created_at": user.created_at
                }
            })
        else:
            # Não existe, cria automaticamente
            novo = Usuario(
                nome="Usuário Nostr",
                pubkey=npub,
                privkey="",
                senha_hash="nostr_auth",
                plano="free"
            )
            db.session.add(novo)
            db.session.commit()
            
            return jsonify({
                "status": "ok",
                "user": {
                    "nome": novo.nome,
                    "npub": novo.pubkey,
                    "plano": "free",
                    "created_at": novo.created_at
                }
            })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500


# ============================================
# NIP-05: API de Gerenciamento
# ============================================

@app.route("/api/nip05/request-username", methods=["POST"])
@validate_nip98_auth(required=False)
def request_nip05_username():
    """
    Usuário solicita um username para verificação NIP-05 (com suporte NIP-98)
    """
    try:
        data = request.get_json()

        # Prioriza autenticação NIP-98, fallback para npub do body
        npub = getattr(request, 'nip98_pubkey', None) or data.get("npub")
        username = data.get("username")

        if not npub or not username:
            return jsonify({"status": "error", "error": "npub e username obrigatórios"}), 400

        # Valida formato do username (somente letras minúsculas, números, hífen, underscore)
        import re
        if not re.match(r'^[a-z0-9_-]+$', username):
            return jsonify({
                "status": "error",
                "error": "Username inválido. Use apenas letras minúsculas, números, - e _"
            }), 400

        # Verifica se username já existe
        existing = Usuario.query.filter_by(nip05_username=username).first()
        if existing:
            return jsonify({"status": "error", "error": "Username já em uso"}), 400

        # Busca usuário
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        # Atualiza username (mas não verifica automaticamente)
        usuario.nip05_username = username
        usuario.nip05_verified = False  # Precisa aprovação do admin
        db.session.commit()

        print(f"[NIP-05] Solicitação de username: {username} para {npub[:12]}...")

        return jsonify({
            "status": "ok",
            "message": f"Username '{username}' solicitado! Aguarde aprovação do admin.",
            "username": username,
            "verified": False
        })

    except Exception as e:
        print(f"[NIP-05] Erro ao solicitar username: {e}")
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/admin/nip05/pending", methods=["GET"])
@admin_required
def admin_nip05_pending():
    """
    Lista todas solicitações de verificação NIP-05
    """
    try:
        # Busca todos usuários com username solicitado
        usuarios = Usuario.query.filter(Usuario.nip05_username.isnot(None)).all()

        pendentes = []
        verificados = []

        for u in usuarios:
            user_data = {
                "id": u.id,
                "nome": u.nome if hasattr(u, 'nome') else u.pubkey[:12] + "...",
                "pubkey": u.pubkey,
                "username": u.nip05_username,
                "identifier": f"{u.nip05_username}@libermedia.app",
                "verified": u.nip05_verified,
                "created_at": u.created_at if hasattr(u, 'created_at') else None
            }

            if u.nip05_verified:
                verificados.append(user_data)
            else:
                pendentes.append(user_data)

        return jsonify({
            "status": "ok",
            "pendentes": pendentes,
            "verificados": verificados,
            "total_pendentes": len(pendentes),
            "total_verificados": len(verificados)
        })

    except Exception as e:
        print(f"[NIP-05] Erro ao listar solicitações: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/admin/nip05/verify", methods=["POST"])
@admin_required
def admin_verify_nip05():
    """
    Admin aprova/rejeita verificação NIP-05 de um usuário
    """
    try:
        data = request.get_json()
        user_id = data.get("user_id")
        verified = data.get("verified", False)

        usuario = Usuario.query.get(user_id)
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        if not usuario.nip05_username:
            return jsonify({"status": "error", "error": "Usuário não possui username solicitado"}), 400

        usuario.nip05_verified = verified
        db.session.commit()

        status_text = "verificado" if verified else "rejeitado"
        print(f"[NIP-05] Admin {status_text} username '{usuario.nip05_username}' para {usuario.pubkey[:12]}...")

        return jsonify({
            "status": "ok",
            "message": f"Username {status_text} com sucesso!",
            "username": usuario.nip05_username,
            "verified": verified
        })

    except Exception as e:
        print(f"[NIP-05] Erro ao verificar username: {e}")
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/api/nip05/check", methods=["GET"])
def check_nip05():
    """
    Verifica status NIP-05 de um usuário
    """
    try:
        npub = request.args.get("npub")
        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({
                "status": "ok",
                "verified": False,
                "username": None
            })

        return jsonify({
            "status": "ok",
            "verified": usuario.nip05_verified,
            "username": usuario.nip05_username,
            "identifier": f"{usuario.nip05_username}@libermedia.app" if usuario.nip05_username else None
        })

    except Exception as e:
        print(f"[NIP-05] Erro ao checar status: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)

@app.route("/api/invoice/create-donation", methods=["POST"])
def create_donation():
    try:
        data = request.get_json()
        amount = int(data.get("amount", 1000))

        if amount < 1:
            return jsonify({"status": "error", "error": "Valor mínimo: 1 sat"}), 400

        memo = f"Doação livre LiberMedia ({amount} sats)"
        inv = opennode_create_invoice(amount, memo)

        return jsonify({
            "status": "ok",
            "bolt11": inv["bolt11"],
            "checking_id": inv["payment_hash"]
        })

    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/configuracoes")
def configuracoes():
    return render_template("configuracoes.html")

# Modelo de Arquivo
class Arquivo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    nome = db.Column(db.String(255), nullable=False)
    nome_original = db.Column(db.String(255), nullable=False)
    tipo = db.Column(db.String(50))  # image, video, document, audio
    tamanho = db.Column(db.Integer)  # bytes
    pasta = db.Column(db.String(100), default='Geral')
    caminho = db.Column(db.String(512), nullable=False)
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

# Modelo de Link Público
class LinkPublico(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    arquivo_id = db.Column(db.Integer, db.ForeignKey('arquivo.id'), nullable=False)
    token = db.Column(db.String(64), unique=True, nullable=False)
    expira_em = db.Column(db.Integer, nullable=False)  # timestamp
    acessos = db.Column(db.Integer, default=0)
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

# Limpa links expirados após definir as classes
with app.app_context():
    try:
        LinkPublico.query.filter(LinkPublico.expira_em < int(time.time())).delete()
        db.session.commit()
    except:
        pass  # Tabela pode não existir ainda

# Rota de upload
@app.route("/api/upload", methods=["POST"])
def upload_arquivo():
    try:
        if 'file' not in request.files:
            return jsonify({"status": "error", "error": "Nenhum arquivo"}), 400

        file = request.files['file']
        npub = request.form.get('npub')
        pasta = request.form.get('pasta', 'Geral')

        if not npub:
            return jsonify({"status": "error", "error": "Usuário não identificado"}), 401

        # Verifica blacklist
        is_blocked, _ = check_blacklist_npub(npub)
        if is_blocked:
            print(f"[BLACKLIST] ⛔ Upload bloqueado: {npub[:20]}...")
            return jsonify({"status": "error", "error": "Acesso negado"}), 403

        # Busca usuário
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            # Criar usuário automaticamente
            usuario = Usuario(
                nome="Usuário Nostr",
                pubkey=npub,
                privkey="",
                senha_hash="nostr_auth",
                plano="free"
            )
            db.session.add(usuario)
            db.session.commit()
        
        # Gera nome único
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        nome_unico = f"{int(time.time())}_{usuario.id}.{ext}"
        caminho = os.path.join('uploads', nome_unico)
        
        # Salva arquivo
        file.save(caminho)
        tamanho = os.path.getsize(caminho)
        
        # Detecta tipo
        tipos = {
            'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image',
            'mp4': 'video', 'avi': 'video', 'mov': 'video', 'webm': 'video',
            'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document',
            'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio', 'm4a': 'audio'
        }
        tipo = tipos.get(ext, 'document')
        
        # Salva no banco
        novo_arquivo = Arquivo(
            usuario_id=usuario.id,
            nome=nome_unico,
            nome_original=file.filename,
            tipo=tipo,
            tamanho=tamanho,
            pasta=pasta,
            caminho=caminho
        )
        db.session.add(novo_arquivo)
        db.session.commit()
        
        return jsonify({
            "status": "ok",
            "arquivo": {
                "id": novo_arquivo.id,
                "nome": file.filename,
                "tipo": tipo,
                "tamanho": tamanho
            }
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500

# Listar arquivos do usuário
@app.route("/api/arquivos", methods=["GET"])
def listar_arquivos():
    try:
        npub = request.args.get('npub')
        pasta = request.args.get('pasta')
        
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            # Criar usuário automaticamente
            usuario = Usuario(
                nome="Usuário Nostr",
                pubkey=npub,
                privkey="",
                senha_hash="nostr_auth",
                plano="free"
            )
            db.session.add(usuario)
            db.session.commit()
        
        query = Arquivo.query.filter_by(usuario_id=usuario.id)
        
        if pasta:
            query = query.filter_by(pasta=pasta)
        
        arquivos = query.order_by(Arquivo.created_at.desc()).all()
        
        return jsonify({
            "status": "ok",
            "arquivos": [{
                "id": a.id,
                "nome": a.nome_original,
                "tipo": a.tipo,
                "tamanho": a.tamanho,
                "pasta": a.pasta,
                "url": f"/uploads/{a.nome}",
                "created_at": a.created_at
            } for a in arquivos]
        })
    
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# Listar pastas únicas do usuário
@app.route("/api/pastas", methods=["GET"])
def listar_pastas():
    try:
        npub = request.args.get('npub')

        if not npub:
            return jsonify({"status": "error", "error": "npub não informado"}), 400

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "ok", "pastas": []})

        # Busca pastas únicas usando DISTINCT
        pastas_query = db.session.query(Arquivo.pasta).filter_by(usuario_id=usuario.id).distinct().all()

        # Extrai os nomes das pastas e remove 'Geral' (Mesa mostra tudo)
        pastas = [p[0] for p in pastas_query if p[0] and p[0] != 'Geral']

        return jsonify({
            "status": "ok",
            "pastas": pastas
        })

    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# Renomear pasta (atualiza todos os arquivos)
@app.route("/api/pasta/rename", methods=["PUT"])
def renomear_pasta():
    try:
        npub = request.args.get('npub')
        data = request.get_json()
        pasta_antiga = data.get('pasta_antiga')
        pasta_nova = data.get('pasta_nova')

        if not npub or not pasta_antiga or not pasta_nova:
            return jsonify({"status": "error", "error": "Dados incompletos"}), 400

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        # Atualiza todos os arquivos da pasta antiga
        arquivos = Arquivo.query.filter_by(usuario_id=usuario.id, pasta=pasta_antiga).all()
        for arquivo in arquivos:
            arquivo.pasta = pasta_nova

        db.session.commit()

        return jsonify({"status": "ok", "arquivos_atualizados": len(arquivos)})

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500

# Deletar pasta (valida se está vazia)
@app.route("/api/pasta/delete", methods=["DELETE"])
def deletar_pasta():
    try:
        npub = request.args.get('npub')
        pasta = request.args.get('pasta')

        if not npub or not pasta:
            return jsonify({"status": "error", "error": "Dados incompletos"}), 400

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        # Verifica se há arquivos na pasta
        count = Arquivo.query.filter_by(usuario_id=usuario.id, pasta=pasta).count()

        if count > 0:
            return jsonify({"status": "error", "error": f"Pasta contém {count} arquivo(s). Mova ou delete os arquivos primeiro."}), 400

        return jsonify({"status": "ok", "message": "Pasta pode ser deletada"})

    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# Servir arquivos
@app.route("/uploads/<filename>")
def servir_arquivo(filename):
    return send_from_directory('uploads', filename)

@app.route("/f/<int:arquivo_id>")
@app.route("/f/<int:arquivo_id>.<ext>")
@app.route("/f/<int:arquivo_id>.<ext>")
def short_link(arquivo_id, ext=None):
    """Redireciona link curto pro arquivo"""
    arquivo = Arquivo.query.get(arquivo_id)
    if not arquivo:
        return "Arquivo não encontrado", 404
    return redirect(f"/uploads/{arquivo.nome}")

@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        password = request.form.get("password")
        if password == ADMIN_PASSWORD:
            session["admin_logged"] = True
            return redirect("/admin")
        return render_template("admin_login.html", error="Senha incorreta!")
    return render_template("admin_login.html")

@app.route("/admin/logout")
def admin_logout():
    session.pop("admin_logged", None)
    return redirect("/")

@app.route("/admin")
@admin_required
def admin_page():
    return render_template("admin.html")

@app.route("/api/admin/usuarios", methods=["GET"])
@admin_required
def admin_usuarios():
    try:
        usuarios = Usuario.query.all()
        return jsonify({
            "status": "ok",
            "usuarios": [{
                "id": u.id,
                "nome": u.nome,
                "pubkey": u.pubkey[:30]+"...",
                "plano": u.plano,
                "is_admin": getattr(u, 'is_admin', False),
                "created_at": u.created_at
            } for u in usuarios]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/api/admin/arquivos", methods=["GET"])
@admin_required
def admin_arquivos():
    try:
        arquivos = Arquivo.query.all()
        return jsonify({
            "status": "ok",
            "arquivos": [{
                "id": a.id,
                "nome": a.nome_original,
                "usuario_id": a.usuario_id,
                "tipo": a.tipo,
                "tamanho": a.tamanho,
                "url": f"/uploads/{a.nome}"
            } for a in arquivos]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# Mover arquivo para outra pasta
@app.route("/api/arquivo/move/<int:arquivo_id>", methods=["PUT"])
def move_arquivo(arquivo_id):
    try:
        npub = request.args.get('npub')
        data = request.get_json()
        nova_pasta = data.get('pasta')

        if not npub:
            return jsonify({"status": "error", "error": "npub não fornecido"}), 401

        if not nova_pasta:
            return jsonify({"status": "error", "error": "pasta não fornecida"}), 400

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        arquivo = Arquivo.query.get(arquivo_id)
        if not arquivo:
            return jsonify({"status": "error", "error": "Arquivo não encontrado"}), 404

        # Verifica se o arquivo pertence ao usuário
        if arquivo.usuario_id != usuario.id:
            return jsonify({"status": "error", "error": "Sem permissão"}), 403

        # Atualiza a pasta
        arquivo.pasta = nova_pasta
        db.session.commit()

        return jsonify({"status": "ok", "nova_pasta": nova_pasta})

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500

# Deletar arquivo (validação por npub)
@app.route("/api/arquivo/delete/<int:arquivo_id>", methods=["DELETE"])
def delete_arquivo(arquivo_id):
    try:
        npub = request.args.get('npub')
        if not npub:
            return jsonify({"status": "error", "error": "npub não fornecido"}), 401

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        arquivo = Arquivo.query.get(arquivo_id)
        if not arquivo:
            return jsonify({"status": "error", "error": "Arquivo não encontrado"}), 404

        # Verifica se o arquivo pertence ao usuário
        if arquivo.usuario_id != usuario.id:
            return jsonify({"status": "error", "error": "Sem permissão"}), 403

        import os
        caminho = f"uploads/{arquivo.nome}"
        if os.path.exists(caminho):
            os.remove(caminho)

        db.session.delete(arquivo)
        db.session.commit()

        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/api/admin/delete/<int:arquivo_id>", methods=["DELETE"])
@admin_required
def admin_delete(arquivo_id):
    try:
        arquivo = Arquivo.query.get(arquivo_id)
        if not arquivo:
            return jsonify({"status": "error", "error": "Não encontrado"}), 404
        
        import os
        caminho = f"uploads/{arquivo.nome}"
        if os.path.exists(caminho):
            os.remove(caminho)
        
        db.session.delete(arquivo)
        db.session.commit()
        
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/login-direto")
def login_direto():
    """Login de emergência"""
    return '''
    <script>
    const npub = prompt("Cole seu npub:");
    if(npub) {
        localStorage.setItem("libermedia_npub", npub);
        location.href = "/dashboard";
    }
    </script>
    '''

@app.route("/api/hex-to-npub", methods=["POST"])
def hex_to_npub_api():
    """Converte hex pubkey para npub (backend confiável)"""
    try:
        data = request.get_json()
        pubkey_hex = data.get('pubkey_hex')
        
        if not pubkey_hex or len(pubkey_hex) != 64:
            return jsonify({"status": "error", "error": "Pubkey inválida"}), 400
        
        # Converte usando biblioteca confiável
        import subprocess
        subprocess.run(['pip', 'install', 'bech32', '-q'])
        
        from bech32 import bech32_encode, convertbits
        
        # Hex para bytes
        pubkey_bytes = bytes.fromhex(pubkey_hex)
        
        # Converte para words (5 bits)
        words = convertbits(pubkey_bytes, 8, 5)
        
        # Gera npub
        npub = bech32_encode('npub', words)
        
        return jsonify({
            "status": "ok",
            "npub": npub,
            "pubkey_hex": pubkey_hex
        })
        
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/novo")
def novo():
    return render_template("novo.html")


# Anti-cache headers
@app.after_request
def add_no_cache_headers(response):
    if request.path.startswith('/login') or request.path.startswith('/static'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# ============================================
# BUSCAR PERFIL NOSTR
# ============================================
from nostr_sdk import Client, Filter, Kind, Nip19, RelayUrl
from datetime import timedelta

async def buscar_perfil_nostr_async(npub: str):
    """Busca perfil (kind 0) de um npub nos relays"""
    try:
        decoded = Nip19.from_bech32(npub)
        pubkey = decoded.as_enum().npub
        
        client = Client()
        await client.add_relay(RelayUrl.parse("wss://relay.damus.io"))
        await client.add_relay(RelayUrl.parse("wss://nos.lol"))
        await client.add_relay(RelayUrl.parse("wss://relay.nostr.band"))
        
        await client.connect()
        
        filter_obj = Filter().kind(Kind(0)).author(pubkey).limit(1)
        events = await client.fetch_events(filter_obj, timeout=timedelta(seconds=10))
        
        if not events.is_empty():
            event = events.first()
            content = json.loads(event.content())

            return {
                "name": content.get("name", ""),
                "display_name": content.get("display_name", ""),
                "picture": content.get("picture", ""),
                "about": content.get("about", ""),
                "banner": content.get("banner", ""),
                "website": content.get("website", ""),
                "nip05": content.get("nip05", ""),
                "lud16": content.get("lud16", "")
            }
        
        return None
    except Exception as e:
        print(f"Erro ao buscar perfil: {e}")
        return None
    finally:
        try:
            await client.disconnect()
        except:
            pass

def buscar_perfil_nostr(npub: str):
    """Wrapper síncrono"""
    import asyncio
    return asyncio.run(buscar_perfil_nostr_async(npub))

@app.route("/api/nostr/profile", methods=["POST"])
def api_nostr_profile():
    """API para buscar perfil Nostr"""
    try:
        data = request.get_json()
        npub = data.get("npub")

        print(f"[DEBUG] Buscando perfil para npub: {npub}")

        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400

        perfil = buscar_perfil_nostr(npub)

        print(f"[DEBUG] Perfil encontrado: {perfil}")

        if perfil:
            return jsonify({"status": "ok", "perfil": perfil})
        else:
            return jsonify({"status": "error", "error": "Perfil não encontrado"}), 404

    except Exception as e:
        print(f"[ERROR] Erro ao buscar perfil: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


# ============================================
# PUBLICAR PERFIL NOSTR (NIP-01)
# ============================================
from nostr_sdk import Keys, EventBuilder, Kind as NostrKind

async def publicar_perfil_nostr_async(nsec: str, perfil_data: dict):
    """Publica perfil (kind 0) usando nsec do usuário"""
    try:
        # Cria keys a partir do nsec
        keys = Keys.parse(nsec)

        # Cria evento kind 0 com metadados
        content = json.dumps({
            "name": perfil_data.get("name", ""),
            "display_name": perfil_data.get("display_name", ""),
            "picture": perfil_data.get("picture", ""),
            "about": perfil_data.get("about", ""),
            "banner": perfil_data.get("banner", ""),
            "website": perfil_data.get("website", ""),
            "nip05": perfil_data.get("nip05", ""),
            "lud16": perfil_data.get("lud16", "")
        })

        # Cria e assina evento
        event_builder = EventBuilder.metadata(content)
        event = event_builder.sign_with_keys(keys)

        # Conecta aos relays e publica
        client = Client()
        await client.add_relay(RelayUrl.parse("wss://relay.damus.io"))
        await client.add_relay(RelayUrl.parse("wss://nos.lol"))
        await client.add_relay(RelayUrl.parse("wss://relay.nostr.band"))

        await client.connect()

        # Publica evento
        output = await client.send_event(event)

        print(f"[DEBUG] Evento publicado: {output}")

        return {
            "success": True,
            "event_id": event.id().to_hex(),
            "relays": ["relay.damus.io", "nos.lol", "relay.nostr.band"]
        }

    except Exception as e:
        print(f"[ERROR] Erro ao publicar perfil: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        try:
            await client.disconnect()
        except:
            pass


def publicar_perfil_nostr(nsec: str, perfil_data: dict):
    """Wrapper síncrono"""
    import asyncio
    return asyncio.run(publicar_perfil_nostr_async(nsec, perfil_data))


@app.route("/api/nostr/profile/publish", methods=["POST"])
@validate_nip98_auth(required=False)
def api_publish_nostr_profile():
    """API para publicar perfil Nostr (funciona sem extensão) com suporte NIP-98"""
    try:
        data = request.get_json()

        # Prioriza autenticação NIP-98, fallback para npub do body
        npub = getattr(request, 'nip98_pubkey', None) or data.get("npub")
        perfil = data.get("perfil", {})

        auth_method = "NIP-98" if getattr(request, 'nip98_pubkey', None) else "npub"
        print(f"[NIP-01] Publicando perfil para {npub[:12]}... (auth: {auth_method})")
        print(f"[NIP-01] Dados do perfil: {perfil}")

        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400

        # Busca usuário no banco
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        # Verifica se tem privkey
        if not usuario.privkey or usuario.privkey == "":
            return jsonify({
                "status": "error",
                "error": "Usuário não possui chave privada cadastrada. Use a extensão Nostr para publicar."
            }), 400

        # Publica perfil
        result = publicar_perfil_nostr(usuario.privkey, perfil)

        if result.get("success"):
            print(f"[DEBUG] Perfil publicado com sucesso: {result}")
            return jsonify({
                "status": "ok",
                "message": "Perfil publicado com sucesso!",
                "event_id": result.get("event_id"),
                "relays": result.get("relays")
            })
        else:
            print(f"[ERROR] Falha ao publicar: {result.get('error')}")
            return jsonify({
                "status": "error",
                "error": result.get("error", "Erro desconhecido")
            }), 500

    except Exception as e:
        print(f"[ERROR] Erro ao publicar perfil: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


# ============================================
# NIP-78: SINCRONIZAÇÃO DE PASTAS
# ============================================
from nostr_sdk import Tag

async def buscar_pastas_nostr_async(npub: str):
    """Busca pastas (kind 30078) de um npub nos relays"""
    try:
        decoded = Nip19.from_bech32(npub)
        pubkey = decoded.as_enum().npub

        client = Client()
        await client.add_relay(RelayUrl.parse("wss://relay.damus.io"))
        await client.add_relay(RelayUrl.parse("wss://nos.lol"))
        await client.add_relay(RelayUrl.parse("wss://relay.nostr.band"))

        await client.connect()

        # Filtro para kind 30078 (application data) com tag "d" = "folders"
        # Para eventos parametrizáveis (30000-39999), usar .identifier() em vez de custom_tag
        filter = (Filter()
                  .author(pubkey)
                  .kind(NostrKind(30078))
                  .identifier("folders"))

        # Timeout de 3 segundos (reduzido para melhor performance)
        # Nota: fetch_events espera Filter instance, não lista
        events = await client.fetch_events(filter, timedelta(seconds=3))

        # Converte Events object para lista
        events_list = list(events) if events else []

        if events_list:
            # Pega o evento mais recente (kind 30078 é replaceable)
            latest = max(events_list, key=lambda e: e.created_at())
            content = latest.content()

            try:
                data = json.loads(content)
                folders = data.get("folders", [])

                print(f"[NIP-78] ✅ {len(folders)} pastas encontradas para {npub[:12]}...")

                return {
                    "status": "ok",
                    "folders": folders,
                    "timestamp": latest.created_at().as_secs()
                }
            except json.JSONDecodeError:
                print(f"[NIP-78] ⚠️ Erro ao decodificar JSON do evento")
                return {"status": "error", "error": "Formato inválido"}

        print(f"[NIP-78] ℹ️ Nenhuma pasta encontrada para {npub[:12]}...")
        return {"status": "ok", "folders": []}

    except Exception as e:
        print(f"[NIP-78] ❌ Erro ao buscar pastas: {e}")
        return {"status": "error", "error": str(e)}
    finally:
        try:
            await client.disconnect()
        except:
            pass


def buscar_pastas_nostr(npub: str):
    """Wrapper síncrono para buscar pastas"""
    import asyncio
    return asyncio.run(buscar_pastas_nostr_async(npub))


@app.route("/api/nostr/folders", methods=["POST"])
def api_nostr_folders():
    """API para buscar pastas do Nostr (NIP-78)"""
    try:
        data = request.get_json()
        npub = data.get("npub")

        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400

        result = buscar_pastas_nostr(npub)
        return jsonify(result)

    except Exception as e:
        print(f"[ERROR] Erro ao buscar pastas: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500


async def publicar_pastas_nostr_async(nsec: str, folders: list):
    """Publica pastas (kind 30078) usando nsec do usuário"""
    try:
        keys = Keys.parse(nsec)

        # Cria conteúdo JSON com as pastas
        content = json.dumps({"folders": folders})

        # Tag "d" identifica este evento como sendo de pastas
        d_tag = Tag.parse(["d", "folders"])

        # Cria evento kind 30078 (application-specific data)
        builder = EventBuilder(NostrKind(30078), content, [d_tag])
        event = builder.sign_with_keys(keys)

        client = Client()
        await client.add_relay(RelayUrl.parse("wss://relay.damus.io"))
        await client.add_relay(RelayUrl.parse("wss://nos.lol"))
        await client.add_relay(RelayUrl.parse("wss://relay.nostr.band"))

        await client.connect()

        # Publica evento
        output = await client.send_event(event)

        print(f"[NIP-78] ✅ Pastas publicadas: {folders}")
        print(f"[NIP-78] Event ID: {output.id.to_hex()}")

        return {
            "success": True,
            "event_id": output.id.to_hex(),
            "folders_count": len(folders)
        }

    except Exception as e:
        print(f"[NIP-78] ❌ Erro ao publicar pastas: {e}")
        return {"success": False, "error": str(e)}
    finally:
        try:
            await client.disconnect()
        except:
            pass


def publicar_pastas_nostr(nsec: str, folders: list):
    """Wrapper síncrono para publicar pastas"""
    import asyncio
    return asyncio.run(publicar_pastas_nostr_async(nsec, folders))


@app.route("/api/nostr/folders/publish", methods=["POST"])
@validate_nip98_auth(required=False)
def api_publish_nostr_folders():
    """API para publicar pastas no Nostr (NIP-78) com suporte NIP-98"""
    try:
        data = request.get_json()

        # Prioriza autenticação NIP-98, fallback para npub do body
        npub = getattr(request, 'nip98_pubkey', None) or data.get("npub")
        folders = data.get("folders", [])

        auth_method = "NIP-98" if getattr(request, 'nip98_pubkey', None) else "npub"
        print(f"[NIP-78] Publicando {len(folders)} pastas para {npub[:12] if npub else 'unknown'}... (auth: {auth_method})")

        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400

        # Busca usuário no banco
        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        # Verifica se tem privkey
        if not usuario.privkey or usuario.privkey == "":
            return jsonify({
                "status": "error",
                "error": "Usuário não possui chave privada. Sincronização desabilitada."
            }), 400

        # Publica pastas
        result = publicar_pastas_nostr(usuario.privkey, folders)

        if result.get("success"):
            return jsonify({
                "status": "ok",
                "message": f"{len(folders)} pastas sincronizadas!",
                "event_id": result.get("event_id")
            })
        else:
            return jsonify({
                "status": "error",
                "error": result.get("error", "Erro desconhecido")
            }), 500

    except Exception as e:
        print(f"[ERROR] Erro ao publicar pastas: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


async def publicar_evento_assinado_async(event_json: dict):
    """Publica um evento já assinado (de NIP-07) nos relays"""
    try:
        from nostr_sdk import Event as NostrEventSDK

        # Converte JSON para objeto Event
        event = NostrEventSDK.from_json(json.dumps(event_json))

        client = Client()
        await client.add_relay(RelayUrl.parse("wss://relay.damus.io"))
        await client.add_relay(RelayUrl.parse("wss://nos.lol"))
        await client.add_relay(RelayUrl.parse("wss://relay.nostr.band"))

        await client.connect()

        # Publica evento
        output = await client.send_event(event)

        print(f"[NIP-78] ✅ Evento NIP-07 publicado: {output.id.to_hex()}")

        return {
            "success": True,
            "event_id": output.id.to_hex()
        }

    except Exception as e:
        print(f"[NIP-78] ❌ Erro ao publicar evento assinado: {e}")
        return {"success": False, "error": str(e)}
    finally:
        try:
            await client.disconnect()
        except:
            pass


def publicar_evento_assinado(event_json: dict):
    """Wrapper síncrono para publicar evento assinado"""
    import asyncio
    return asyncio.run(publicar_evento_assinado_async(event_json))


@app.route("/api/nostr/publish-signed", methods=["POST"])
def api_publish_signed_event():
    """API para publicar evento já assinado (de extensão NIP-07)"""
    try:
        data = request.get_json()
        event = data.get("event")

        if not event:
            return jsonify({"status": "error", "error": "Evento obrigatório"}), 400

        result = publicar_evento_assinado(event)

        if result.get("success"):
            return jsonify({
                "status": "ok",
                "event_id": result.get("event_id")
            })
        else:
            return jsonify({
                "status": "error",
                "error": result.get("error", "Erro desconhecido")
            }), 500

    except Exception as e:
        print(f"[ERROR] Erro ao publicar evento assinado: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


# Mapeamento de planos para limites (em bytes)
LIMITES_PLANO = {
    'free': 3 * 1024 * 1024 * 1024,      # 3 GB
    'alpha': 6 * 1024 * 1024 * 1024,     # 6 GB
    'bravo': 12 * 1024 * 1024 * 1024,    # 12 GB
    'charlie': 24 * 1024 * 1024 * 1024,  # 24 GB
    'delta': 48 * 1024 * 1024 * 1024,    # 48 GB
    'echo': 96 * 1024 * 1024 * 1024,     # 96 GB
    'fox': 192 * 1024 * 1024 * 1024,     # 192 GB
    'golf': 384 * 1024 * 1024 * 1024     # 384 GB
}

@app.route('/api/uso', methods=['GET'])
def get_uso():
    try:
        npub = request.args.get('npub')
        if not npub:
            return jsonify({'error': 'npub obrigatório'}), 400

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({'error': 'Usuário não encontrado'}), 404

        # Totais básicos
        total_usado = db.session.query(db.func.sum(Arquivo.tamanho)).filter_by(usuario_id=usuario.id).scalar() or 0
        total_arquivos = db.session.query(db.func.count(Arquivo.id)).filter_by(usuario_id=usuario.id).scalar() or 0
        limite = LIMITES_PLANO.get(usuario.plano, LIMITES_PLANO['free'])
        percentual = (total_usado / limite * 100) if limite > 0 else 0

        # Arquivos por tipo
        arquivos_por_tipo = db.session.query(
            Arquivo.tipo,
            db.func.count(Arquivo.id),
            db.func.sum(Arquivo.tamanho)
        ).filter_by(usuario_id=usuario.id).group_by(Arquivo.tipo).all()

        tipos = {}
        for tipo, count, size in arquivos_por_tipo:
            tipos[tipo or 'outros'] = {'count': count, 'size': size or 0}

        # Histórico simplificado (últimos 7 dias - apenas count)
        sete_dias_atras = int(time.time()) - (7 * 24 * 60 * 60)
        uploads_ultimos_7d = db.session.query(
            db.func.count(Arquivo.id)
        ).filter(
            Arquivo.usuario_id == usuario.id,
            Arquivo.created_at >= sete_dias_atras
        ).scalar() or 0

        historico = {'uploads_7d': uploads_ultimos_7d}

        # Top 5 arquivos maiores
        maiores_arquivos = db.session.query(Arquivo).filter_by(
            usuario_id=usuario.id
        ).order_by(Arquivo.tamanho.desc()).limit(5).all()

        top_arquivos = []
        for arq in maiores_arquivos:
            top_arquivos.append({
                'id': arq.id,
                'nome': arq.nome_original,
                'tipo': arq.tipo,
                'tamanho': arq.tamanho,
                'pasta': arq.pasta
            })

        # Alertas
        alertas = []
        if percentual >= 90:
            alertas.append({
                'tipo': 'critico',
                'mensagem': f'Você está usando {percentual:.1f}% do seu armazenamento! Considere fazer upgrade.'
            })
        elif percentual >= 75:
            alertas.append({
                'tipo': 'aviso',
                'mensagem': f'Você está usando {percentual:.1f}% do seu armazenamento.'
            })

        return jsonify({
            'usado': total_usado,
            'limite': limite,
            'percentual': round(percentual, 2),
            'plano': usuario.plano,
            'total_arquivos': total_arquivos,
            'tipos': tipos,
            'historico': historico,
            'top_arquivos': top_arquivos,
            'alertas': alertas
        })
    except Exception as e:
        print(f"[USO] Erro ao buscar dados: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ============================================
# COMPARTILHAMENTO PÚBLICO
# ============================================
import secrets

@app.route("/api/arquivo/share/<int:arquivo_id>", methods=["POST"])
def criar_link_publico(arquivo_id):
    try:
        npub = request.args.get('npub')
        data = request.get_json()
        duracao = data.get('duracao', 3600)  # padrão: 1 hora

        if not npub:
            return jsonify({"status": "error", "error": "npub não fornecido"}), 401

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        arquivo = Arquivo.query.get(arquivo_id)
        if not arquivo:
            return jsonify({"status": "error", "error": "Arquivo não encontrado"}), 404

        if arquivo.usuario_id != usuario.id:
            return jsonify({"status": "error", "error": "Sem permissão"}), 403

        # Verifica se já existe link ativo
        link_existente = LinkPublico.query.filter_by(arquivo_id=arquivo_id).filter(
            LinkPublico.expira_em > int(time.time())
        ).first()

        if link_existente:
            return jsonify({
                "status": "ok",
                "token": link_existente.token,
                "expira_em": link_existente.expira_em,
                "url": f"https://libermedia.app/share/{link_existente.token}"
            })

        # Cria novo link
        token = secrets.token_urlsafe(32)
        expira_em = int(time.time()) + duracao

        novo_link = LinkPublico(
            arquivo_id=arquivo_id,
            token=token,
            expira_em=expira_em
        )
        db.session.add(novo_link)
        db.session.commit()

        return jsonify({
            "status": "ok",
            "token": token,
            "expira_em": expira_em,
            "url": f"https://libermedia.app/share/{token}"
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/share/<token>")
def acessar_link_publico(token):
    """Página pública de download"""
    try:
        link = LinkPublico.query.filter_by(token=token).first()

        if not link:
            return render_template("erro.html", mensagem="Link não encontrado"), 404

        # Verifica expiração
        if link.expira_em < int(time.time()):
            db.session.delete(link)
            db.session.commit()
            return render_template("erro.html", mensagem="Link expirado"), 410

        # Incrementa contador
        link.acessos += 1
        db.session.commit()

        arquivo = Arquivo.query.get(link.arquivo_id)
        if not arquivo:
            return render_template("erro.html", mensagem="Arquivo não encontrado"), 404

        # Renderiza página de compartilhamento
        return render_template("share.html", arquivo=arquivo, link=link)

    except Exception as e:
        return render_template("erro.html", mensagem=str(e)), 500

@app.route("/api/arquivo/share/<int:arquivo_id>", methods=["DELETE"])
def revogar_link_publico(arquivo_id):
    """Revoga/cancela link público"""
    try:
        npub = request.args.get('npub')

        if not npub:
            return jsonify({"status": "error", "error": "npub não fornecido"}), 401

        usuario = Usuario.query.filter_by(pubkey=npub).first()
        if not usuario:
            return jsonify({"status": "error", "error": "Usuário não encontrado"}), 404

        arquivo = Arquivo.query.get(arquivo_id)
        if not arquivo or arquivo.usuario_id != usuario.id:
            return jsonify({"status": "error", "error": "Sem permissão"}), 403

        # Deleta links ativos
        LinkPublico.query.filter_by(arquivo_id=arquivo_id).delete()
        db.session.commit()

        return jsonify({"status": "ok"})

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500


# ============================================
# SUPORTE: Formulário de Contato
# ============================================

@app.route("/api/suporte", methods=["POST"])
def enviar_suporte():
    """Recebe mensagem do formulário de suporte"""
    try:
        data = request.get_json()
        nome = data.get('nome', '').strip()
        email = data.get('email', '').strip()
        mensagem = data.get('mensagem', '').strip()

        # Validações
        if not nome or len(nome) < 2:
            return jsonify({"status": "error", "error": "Nome inválido"}), 400

        if not email or '@' not in email:
            return jsonify({"status": "error", "error": "Email inválido"}), 400

        if not mensagem or len(mensagem) < 10:
            return jsonify({"status": "error", "error": "Mensagem muito curta (mínimo 10 caracteres)"}), 400

        # Salva no banco
        suporte = Suporte(
            nome=nome,
            email=email,
            mensagem=mensagem
        )
        db.session.add(suporte)
        db.session.commit()

        print(f"[SUPORTE] Nova mensagem de {nome} ({email})")

        # TODO: Enviar email via SMTP Porkbun (configurar depois)

        return jsonify({
            "status": "ok",
            "message": "Mensagem enviada com sucesso! Responderemos em breve."
        })

    except Exception as e:
        db.session.rollback()
        print(f"[SUPORTE] Erro: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "error": "Erro ao enviar mensagem"}), 500


@app.route("/api/admin/suporte", methods=["GET"])
@admin_required
def listar_suporte():
    """Lista mensagens de suporte (admin only)"""
    try:
        mensagens = Suporte.query.order_by(Suporte.created_at.desc()).all()

        return jsonify({
            "status": "ok",
            "mensagens": [{
                "id": m.id,
                "nome": m.nome,
                "email": m.email,
                "mensagem": m.mensagem,
                "created_at": m.created_at,
                "respondido": m.respondido
            } for m in mensagens]
        })

    except Exception as e:
        print(f"[SUPORTE] Erro ao listar: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500
