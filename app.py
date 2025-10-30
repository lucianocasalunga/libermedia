import os
import time
import jwt
from flask import Flask, request, jsonify, render_template, send_from_directory, redirect, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configuração ---
app = Flask(__name__)
app.secret_key = 'LiberMedia2025SecretKey!@#$%Sofia'

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



# --- Modelo de usuário ---
class Usuario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    pubkey = db.Column(db.String(256), unique=True, nullable=False)
    privkey = db.Column(db.String(256), nullable=False)
    senha_hash = db.Column(db.String(256), nullable=False)
    plano = db.Column(db.String(32), default="free")
    created_at = db.Column(db.Integer, default=lambda: int(time.time()))

with app.app_context():
    db.create_all()

# --- Rotas principais ---
@app.route("/")
def index():
    return render_template("index.html")

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
@app.route("/api/invoice/<plan_id>", methods=["POST","GET"])
def api_invoice(plan_id):
    plans, meta = _load_plans_config()
    plan = next((p for p in plans if p.get("id")==plan_id), None)
    if not plan:
        abort(404, description="Plano não encontrado")
    amount = int(plan.get("amount_sats", 0))
    if amount <= 0:
        return jsonify({"status":"free","message":"Plano gratuito — contribua livre se desejar."})
    memo = f"LiberMedia {plan.get('name')} ({plan_id})"
    try:
        inv = lnbits_create_invoice(amount, memo)
        return jsonify({
            "status": "ok",
            "plan": plan_id,
            "amount_sats": amount,
            "bolt11": inv["bolt11"],
            "checking_id": inv["checking_id"]
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
        cfg = _load_lnbits_env()
        url = f"{cfg['LNBITS_URL'].rstrip('/')}/api/v1/payments"
        headers = {"X-Api-Key": cfg["LNBITS_INVOICE_KEY"], "Content-Type": "application/json"}
        payload = {"out": False, "amount": plan["amount_sats"], "memo": f"LiberMedia Plano {plan['name']}"}
        r = requests.post(url, headers=headers, json=payload, timeout=15)
        if r.status_code not in [200, 201]:
            return jsonify({"status": "error", "error": "Falha LNBits", "details": r.text}), 500
        data = r.json()
        return jsonify({"status": "ok", "plan": plan["name"], "bolt11": data.get("bolt11"), "checking_id": data.get("checking_id")})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
@app.route("/api/invoice/check/<checking_id>", methods=["GET"])
def api_check_invoice(checking_id):
    try:
        cfg = _load_lnbits_env()
        url = f"{cfg['LNBITS_URL'].rstrip('/')}/api/v1/payments/{checking_id}"
        headers = {"X-Api-Key": cfg["LNBITS_INVOICE_KEY"]}
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code not in [200, 201]:
            return jsonify({"status": "error", "error": "Falha LNBits", "details": r.text}), 500
        data = r.json()
        return jsonify({"status": "ok", "paid": data.get("paid", False)})
    except Exception as e:
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)

@app.route("/api/invoice/create-donation", methods=["POST"])
def create_donation():
    try:
        data = request.get_json()
        amount = int(data.get("amount", 1000))
        
        if amount < 1:
            return jsonify({"status": "error", "error": "Valor mínimo: 1 sat"}), 400
        
        cfg = _load_lnbits_env()
        url = f"{cfg['LNBITS_URL'].rstrip('/')}/api/v1/payments"
        headers = {"X-Api-Key": cfg["LNBITS_INVOICE_KEY"], "Content-Type": "application/json"}
        payload = {"out": False, "amount": amount, "memo": f"Doação livre LiberMedia ({amount} sats)"}
        
        r = requests.post(url, headers=headers, json=payload, timeout=15)
        if r.status_code not in [200, 201]:
            return jsonify({"status": "error", "error": "Falha LNBits"}), 500
        
        data = r.json()
        return jsonify({"status": "ok", "bolt11": data.get("bolt11"), "checking_id": data.get("checking_id")})
    
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
                "name": content.get("name", "Usuário"),
                "picture": content.get("picture", ""),
                "about": content.get("about", ""),
                "nip05": content.get("nip05", "")
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
        
        if not npub:
            return jsonify({"status": "error", "error": "npub obrigatório"}), 400
        
        perfil = buscar_perfil_nostr(npub)
        
        if perfil:
            return jsonify({"status": "ok", "perfil": perfil})
        else:
            return jsonify({"status": "error", "error": "Perfil não encontrado"}), 404
            
    except Exception as e:
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

        total_usado = db.session.query(db.func.sum(Arquivo.tamanho)).filter_by(usuario_id=usuario.id).scalar() or 0
        limite = LIMITES_PLANO.get(usuario.plano, LIMITES_PLANO['free'])
        percentual = (total_usado / limite * 100) if limite > 0 else 0

        arquivos_por_tipo = db.session.query(
            Arquivo.tipo,
            db.func.count(Arquivo.id),
            db.func.sum(Arquivo.tamanho)
        ).filter_by(usuario_id=usuario.id).group_by(Arquivo.tipo).all()

        tipos = {}
        for tipo, count, size in arquivos_por_tipo:
            tipos[tipo or 'outros'] = {'count': count, 'size': size or 0}

        return jsonify({
            'usado': total_usado,
            'limite': limite,
            'percentual': round(percentual, 2),
            'plano': usuario.plano,
            'tipos': tipos
        })
    except Exception as e:
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
