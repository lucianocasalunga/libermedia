#!/usr/bin/env python3
import sys
sys.path.insert(0, '/app')
from app import app, db, Usuario

npub = "npub1ml3ktz3jq7ms5esfx87g4cf2uen28zwwasaygpmuz7x42xawk3wqg80knm"
nsec = "nsec1ekt4hnw96avl0qe4x72x7yfrryhyjvv3m6w5g92v7vgdksj7mwtqzw56hj"

with app.app_context():
    user = Usuario.query.filter_by(pubkey=npub).first()
    if user:
        print(f"Usuario encontrado: ID={user.id}, Nome={user.nome}")
        print(f"Privkey atual: {user.privkey[:20] if user.privkey else 'None'}...")
        user.privkey = nsec
        db.session.commit()
        print(f"✅ Privkey atualizada!")
    else:
        print("❌ Usuário não encontrado")
