from app import app, db, Usuario
from sqlalchemy import text

with app.app_context():
    # Adiciona coluna is_admin (se não existir)
    try:
        db.session.execute(text('ALTER TABLE usuario ADD COLUMN is_admin BOOLEAN DEFAULT FALSE'))
        db.session.commit()
        print("✅ Coluna is_admin adicionada!")
    except Exception as e:
        if "already exists" in str(e) or "duplicate column" in str(e).lower():
            print("✅ Coluna is_admin já existe!")
        else:
            print(f"❌ Erro: {e}")
            raise
    
    # Define Sofia como admin (substitua pelo npub dela)
    sofia_npub = input("Cole o NPUB da Sofia: ")
    
    sofia = Usuario.query.filter_by(pubkey=sofia_npub).first()
    if sofia:
        sofia.is_admin = True
        db.session.commit()
        print(f"✅ {sofia.nome} agora é ADMIN!")
    else:
        print("⚠️ Sofia ainda não fez cadastro. Faça login primeiro, depois rode este script de novo.")
