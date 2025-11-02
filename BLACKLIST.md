# 🚫 Sistema de Blacklist - LiberMedia

## Implementação

Sistema de bloqueio de pubkeys para prevenir acesso de usuários indesejados.

## Pubkey Bloqueada

**npub:** `npub182pf3uzmgttdz5emw99wruceezjm69nzgqrs8tnrrecpfxtemn5qtdg5xp`  
**hex:** `3a8298f05b42d6d1533b714ae1f319c8a5bd1662400703ae631e70149979dce8`

---

## Pontos de Bloqueio

A blacklist é verificada em **todos os pontos de entrada** do sistema:

### 1. **Autenticação NIP-98** (Automático)
- **Decorator:** `@validate_nip98_auth()`
- **Endpoints protegidos:**
  - `/api/upload/nip96` (Upload via clientes Nostr)
  - `/api/nip05/request-username` (Solicitação de username)
  - Qualquer endpoint que use o decorator
- **Ação:** Retorna `403 Forbidden` com mensagem "Acesso negado"

### 2. **Login via API**
- **Endpoint:** `/api/login` (POST)
- **Verificação:** Antes de validar credenciais
- **Log:** `[BLACKLIST] ⛔ Login bloqueado: {pubkey}`

### 3. **Autenticação Nostr**
- **Endpoint:** `/api/auth/login` (POST)
- **Verificação:** Antes de buscar/criar usuário
- **Ação:** Bloqueia criação automática de conta

### 4. **Upload de Arquivos**
- **Endpoint:** `/api/upload` (POST)
- **Verificação:** Antes de processar arquivo
- **Ação:** Impede upload e criação de usuário

---

## Como Funciona

### Conversão Automática npub ↔ hex
```python
def check_blacklist_npub(npub_or_hex):
    """
    Verifica se npub ou hex está na blacklist
    Retorna (is_blocked: bool, pubkey_hex: str)
    """
    # Converte npub para hex automaticamente
    if npub_or_hex.startswith('npub'):
        pubkey = PublicKey.parse(npub_or_hex)
        pubkey_hex = pubkey.to_hex()
    else:
        pubkey_hex = npub_or_hex

    return is_blacklisted(pubkey_hex), pubkey_hex
```

### Verificação Case-Insensitive
```python
def is_blacklisted(pubkey_hex):
    """Verifica se pubkey está na blacklist"""
    return pubkey_hex.lower() in [pk.lower() for pk in BLACKLISTED_PUBKEYS]
```

---

## Adicionar Nova Pubkey

1. **Converter npub para hex:**
```bash
docker exec libermedia python3 -c "
from nostr_sdk import PublicKey
npub = 'npub1...'
pubkey = PublicKey.parse(npub)
print(pubkey.to_hex())
"
```

2. **Editar `app.py`:**
```python
BLACKLISTED_PUBKEYS = [
    "3a8298f05b42d6d1533b714ae1f319c8a5bd1662400703ae631e70149979dce8",  # npub182pf...
    "novo_hex_aqui",  # npub1novo...
]
```

3. **Reiniciar container:**
```bash
cd /opt/libermedia
docker-compose restart libermedia
```

---

## Logs de Bloqueio

Quando um acesso é bloqueado, o sistema registra nos logs:

```
[BLACKLIST] ⛔ Acesso bloqueado: npub182pf3uzmgttdz5...
[BLACKLIST] ⛔ Login bloqueado: npub182pf3uzmgttdz5...
[BLACKLIST] ⛔ Upload bloqueado: npub182pf3uzmgttdz5...
```

Para monitorar:
```bash
docker logs -f libermedia | grep BLACKLIST
```

---

## Códigos de Resposta HTTP

| Código | Situação | Mensagem |
|--------|----------|----------|
| `403` | Pubkey na blacklist | `{"error": "Acesso negado"}` |
| `401` | Sem autenticação | `{"error": "Authorization header inválido"}` |
| `200` | Acesso permitido | - |

---

## Segurança

✅ **Bloqueio em todas as camadas** - NIP-98, Login, Upload  
✅ **Conversão automática** - Funciona com npub ou hex  
✅ **Case-insensitive** - Evita bypass por capitalização  
✅ **Logs auditáveis** - Rastreamento de tentativas bloqueadas  
✅ **Sem criação de conta** - Previne registro de usuários bloqueados  

---

**Implementado em:** 2025-11-01  
**Arquivo:** `/opt/libermedia/app.py` (linhas 30-58, 123-126, 621-625, 829-833, 1118-1122)
