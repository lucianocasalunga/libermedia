import os, uuid, time, mimetypes
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, render_template, send_from_directory, abort
import jwt

app = Flask(__name__, template_folder="templates", static_folder="static")
DATA_DIR = os.environ.get("LIBERMEDIA_DATA_DIR", "/data")
JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-secret")
JWT_EXP_SECONDS = int(os.environ.get("JWT_EXP_SECONDS", str(7*24*3600)))
os.makedirs(DATA_DIR, exist_ok=True)

def _now_ts():
    return int(datetime.now(timezone.utc).timestamp())

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/ping")
def ping():
    return jsonify({"status":"ok","time":_now_ts()})

@app.route("/api/challenge")
def challenge():
    return jsonify({"challenge": uuid.uuid4().hex})

@app.route("/api/auth", methods=["POST"])
def auth():
    # MODO DEMO: aceita pubkey+signature+challenge e emite token. **NAO valida assinatura**.
    # Substituir por verificação real em produção (veja instruções na saída do script).
    data = request.get_json() or {}
    pubkey = data.get("pubkey")
    signature = data.get("signature")
    challenge = data.get("challenge")
    if not (pubkey and signature and challenge):
        return jsonify({"error":"missing fields"}), 400
    payload = {"sub": pubkey, "iat": _now_ts(), "exp": _now_ts() + JWT_EXP_SECONDS}
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return jsonify({"token": token})

@app.route("/api/list")
def api_list():
    files = []
    for f in os.listdir(DATA_DIR):
        path = os.path.join(DATA_DIR, f)
        if os.path.isfile(path):
            files.append({
                "name": f,
                "url": f"/files/{f}",
                "size": os.path.getsize(path),
                "mtime": os.path.getmtime(path)
            })
    return jsonify(files)

@app.route("/api/upload", methods=["POST"])
def upload():
    token = request.headers.get("Authorization", "")
    # demo: accept without token validation for now
    if 'file' not in request.files:
        return jsonify({"error":"no file"}), 400
    f = request.files['file']
    safe_name = f.filename.replace("/", "_")
    dest = os.path.join(DATA_DIR, safe_name)
    f.save(dest)
    return jsonify({"filename": safe_name, "url": f"/files/{safe_name}"})

@app.route("/files/<path:filename>")
def uploaded_files(filename):
    return send_from_directory(DATA_DIR, filename, as_attachment=False)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081)
