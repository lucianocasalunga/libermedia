# 🔍 NIP-96 Upload - Guia de Debug

**Atualização:** 01/Nov/2025 - 17:54 UTC

---

## 🎯 Status Atual

### Última Tentativa de Upload (iris.to)

**Timestamp:** 2025-11-01 17:42:59 UTC

**O que funcionou:**
- ✅ OPTIONS / (CORS preflight) - 200 OK
- ✅ POST / detectado com arquivo `fileToUpload`
- ✅ Workaround ativado (redirecionou para handler NIP-96)
- ✅ Header Authorization presente (`Nostr eyJ...`)

**O que falhou:**
- ❌ Retornou 401 Unauthorized após 6 segundos

**Próximos passos:**
- Adicionado logging ultra-detalhado no NIP-98
- Logs agora mostram:
  - URL do request vs evento (antes/depois normalização)
  - Método HTTP do request vs evento
  - Validação de cada step
- **Aguardando nova tentativa de upload para identificar causa exata do 401**

---

## ✅ Correções Implementadas

### 1. **API URL Corrigida no Discovery Endpoint**
- **Antes:** `"api_url": "https://libermedia.app/api"` ❌
- **Depois:** `"api_url": "https://libermedia.app/api/upload/nip96"` ✅

**Testar:**
```bash
curl https://libermedia.app/.well-known/nostr/nip96.json | jq -r '.api_url'
# Deve retornar: https://libermedia.app/api/upload/nip96
```

### 2. **Logging Ultra-Verboso Ativado**

Todos os endpoints agora registram detalhes completos das requisições:

**Endpoint `/api/upload/nip96`:**
- Método (POST/OPTIONS)
- URL completa
- Headers (User-Agent, Origin, Authorization, Content-Type)
- Form data
- Arquivos enviados

**Endpoint `/` (raiz):**
- Captura requisições POST/OPTIONS incorretas
- Alerta se cliente tentar upload na raiz

### 3. **Endpoint Raiz com Suporte POST/OPTIONS**

Clientes que tentarem fazer upload em `/` ao invés de `/api/upload/nip96` serão:
- ✅ Logados com detalhes completos
- ✅ Respondidos com erro explicativo e endpoint correto

---

## 🧪 Como Testar Agora

### Passo 1: Abrir Terminal de Logs

Em um terminal separado, execute:
```bash
docker logs -f libermedia 2>&1 | grep -E "\[NIP-96\]|\[ROOT\]"
```

Isso mostrará apenas os logs relevantes do NIP-96.

### Passo 2: Testar Upload via Cliente Nostr

#### **Opção A: iris.to**
1. Acesse https://iris.to
2. Vá em Settings
3. Configure servidor de mídia: `https://libermedia.app`
4. Tente fazer upload de uma imagem

#### **Opção B: Snort**
1. Acesse https://snort.social
2. Settings → File Upload → Custom Server
3. URL: `https://libermedia.app`
4. Tente postar uma imagem

#### **Opção C: Nostrudel**
1. Acesse https://nostrudel.ninja
2. Settings → Media → Custom Upload Server
3. URL: `https://libermedia.app`
4. Tente fazer upload

### Passo 3: Analisar Logs

Você verá logs como:

#### Se cliente acertar o endpoint:
```
================================================================================
[NIP-96] 📥 Requisição recebida!
[NIP-96] Método: POST
[NIP-96] URL: https://libermedia.app/api/upload/nip96
[NIP-96] Remote IP: 1.2.3.4
[NIP-96] User-Agent: Mozilla/5.0 ...
[NIP-96] Origin: https://iris.to
[NIP-96] Authorization: Nostr eyJpZCI6IjFhMmIzYz...
[NIP-96] Content-Type: multipart/form-data
[NIP-96] Form data keys: ['caption', 'alt']
[NIP-96] Files: ['file']
================================================================================
```

#### Se cliente errar (POST na raiz):
```
================================================================================
[ROOT /] 🔍 Requisição não-GET recebida na raiz!
[ROOT] Método: POST
[ROOT] User-Agent: iris.to/3.0
[ROOT] Files: ['file']
[ROOT] ⚠️ CLIENTE TENTANDO UPLOAD NA RAIZ - NÃO NO ENDPOINT NIP-96!
================================================================================
```

#### Se cliente fazer OPTIONS (CORS preflight):
```
================================================================================
[NIP-96] 📥 Requisição recebida!
[NIP-96] Método: OPTIONS
[NIP-96] Origin: https://iris.to
[NIP-96] ✅ OPTIONS preflight - respondendo com CORS headers
================================================================================
```

---

## 📊 O Que Esperar

### ✅ Cenário Ideal (Cliente Compatível)
1. Cliente faz `OPTIONS /api/upload/nip96` (CORS preflight)
2. Servidor responde 200 com headers CORS
3. Cliente faz `POST /api/upload/nip96` com:
   - Header `Authorization: Nostr <base64_event>`
   - Form data `multipart/form-data`
   - Campo `file` com arquivo
4. Servidor valida NIP-98
5. Upload bem-sucedido!

### ⚠️ Cenário Problema (Cliente Incompatível)
1. Cliente faz `OPTIONS /` (preflight na raiz)
2. Cliente faz `POST /` (upload na raiz) ❌
3. Servidor rejeita e informa endpoint correto

### ❌ Cenário Crítico (Cliente Não-Compatível NIP-96)
1. Cliente não lê `/.well-known/nostr/nip96.json`
2. Cliente não envia requisição alguma
3. Logs permanecem vazios

---

## 🔧 Próximos Passos (Se Necessário)

### Se iris.to continuar falhando:
1. **Capturar logs completos** do teste
2. **Verificar qual endpoint cliente está usando**
3. **Implementar endpoint de fallback** se necessário
4. **Reportar bug ao iris.to** com evidências

### Se funcionar:
1. ✅ Atualizar `TROUBLESHOOTING_IRIS.md`
2. ✅ Documentar clientes compatíveis
3. ✅ Anunciar suporte completo NIP-96

---

## 🎯 Comandos Úteis

```bash
# Ver TODOS logs em tempo real
docker logs -f libermedia

# Ver apenas NIP-96
docker logs -f libermedia 2>&1 | grep "\[NIP-96\]"

# Ver apenas ROOT
docker logs -f libermedia 2>&1 | grep "\[ROOT\]"

# Ver últimas 100 linhas
docker logs --tail 100 libermedia

# Verificar discovery endpoint
curl https://libermedia.app/.well-known/nostr/nip96.json | jq

# Verificar se servidor está respondendo
curl -I https://libermedia.app/api/upload/nip96

# Testar OPTIONS
curl -X OPTIONS -H "Origin: https://iris.to" \
  https://libermedia.app/api/upload/nip96 -v
```

---

**Próximo teste:** Faça upload via iris.to e compartilhe os logs!
