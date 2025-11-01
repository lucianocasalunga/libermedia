#!/usr/bin/env python3
"""Script de teste para NIP-96 upload"""
import sys
sys.path.insert(0, '/app')

from nostr_sdk import Keys, EventBuilder, Kind as NostrKind, Tag
import json
import base64
import requests
import time

print("=" * 60)
print("🧪 TESTE NIP-96 UPLOAD")
print("=" * 60)

# Chaves de teste
nsec = 'nsec1ekt4hnw96avl0qe4x72x7yfrryhyjvv3m6w5g92v7vgdksj7mwtqzw56hj'
keys = Keys.parse(nsec)
npub = keys.public_key().to_bech32()

print(f"\n🔑 Usando chaves:")
print(f"   npub: {npub}")

# Cria evento NIP-98
print(f"\n🔐 Criando evento NIP-98...")
http_url = "http://localhost:8081/api/upload/nip96"

# Usa método específico http_auth do EventBuilder
from nostr_sdk import HttpMethod, HttpData

http_data = HttpData(url=http_url, method=HttpMethod.POST, payload=None)
builder = EventBuilder.http_auth(http_data)
event = builder.sign_with_keys(keys)

# Serializa
event_json = event.as_json()
event_b64 = base64.b64encode(event_json.encode()).decode()

print(f"✅ Evento criado e assinado")
print(f"   ID: {json.loads(event_json)['id'][:16]}...")
print(f"   Header size: {len(event_b64)} chars")

# Cria arquivo de teste em memória
test_content = f"Hello NIP-96!\nTimestamp: {int(time.time())}\nTest from LiberMedia\n"

# Faz upload
print(f"\n📤 Fazendo upload...")
headers = {
    "Authorization": f"Nostr {event_b64}"
}

files = {"file": ("test_nip96.txt", test_content.encode(), "text/plain")}
data = {
    "caption": "Teste NIP-96 upload",
    "alt": "Test file"
}

try:
    response = requests.post(http_url, headers=headers, files=files, data=data)

    print(f"\n📊 Resposta:")
    print(f"   Status HTTP: {response.status_code}")

    try:
        result = response.json()
        print(f"   JSON:")
        print(json.dumps(result, indent=6))

        if response.status_code == 200 and result.get("status") == "success":
            print(f"\n✅ SUCESSO! Upload NIP-96 funcionando!")
            print(f"   URL: {result.get('url')}")
            print(f"   SHA256: {result.get('sha256')[:16]}...")
            print(f"   Size: {result.get('size')} bytes")
            if result.get('nip94_event'):
                print(f"   NIP-94 publicado: {result['nip94_event']['id'][:16]}...")
        else:
            print(f"\n❌ Erro no upload")

    except Exception as e:
        print(f"   Erro ao parsear JSON: {e}")
        print(f"   Resposta bruta: {response.text[:200]}")

except Exception as e:
    print(f"\n❌ Erro na requisição: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
