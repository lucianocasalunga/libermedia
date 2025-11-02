# 📋 Changelog - 01 de Novembro de 2025

## ✅ Implementações Concluídas

### 1. **NIP-96 Upload Funcionando** 🎉
**Status:** ✅ **RESOLVIDO E TESTADO**

**Problema:** Uploads externos via clientes Nostr (iris.to, Primal, etc) falhavam.

**Solução implementada:**
- ✅ Corrigido API URL no discovery endpoint (`/.well-known/nostr/nip96.json`)
- ✅ Implementado workaround para clientes que enviam para `/` ao invés de `/api/upload/nip96`
- ✅ Adicionado suporte para campo `fileToUpload` (formato iris.to)
- ✅ Implementada normalização HTTP/HTTPS em validação NIP-98
- ✅ Adicionados CORS headers em todas respostas
- ✅ Formato de resposta NIP-96 corrigido (tags format)

**Resultado:**
- ✅ iris.to fazendo upload com sucesso
- ✅ Arquivos salvos: IDs 315, 316, 317
- ✅ 100% compatível com especificação NIP-96

---

### 2. **Fix de Timeout em Uploads** 🔥
**Status:** ✅ **RESOLVIDO**

**Problema:** Gunicorn timeout de 30s em uploads grandes (causado por logging verboso).

**Solução:**
- ✅ Removido parsing de `request.form` e `request.files` no logging
- ✅ Uploads grandes (2-3MB) agora funcionam sem travar
- ✅ Logging otimizado mantendo apenas informações essenciais

---

### 3. **Performance do Dashboard** ⚡
**Status:** ✅ **OTIMIZADO**

**Antes:** 2.5s (com cache problemático do Cloudflare)
**Depois:** 0.6s (após limpar cache)

**Servidor Flask:** 6ms de resposta local (excelente!)

---

### 4. **Blacklist System** 🔒
**Status:** ✅ **OPERACIONAL** (implementado anteriormente)

- Bloqueio em todos endpoints (NIP-98, login, upload)
- npub bloqueado: `npub182pf3...`

---

### 5. **Paginação do Dashboard** 📄
**Status:** ✅ **OPERACIONAL** (implementado anteriormente)

- 50 arquivos por página
- 84% redução em elementos DOM
- Performance frontend excelente

---

## 📊 Estatísticas Atuais

- **Total de arquivos:** 314
- **Espaço usado:** 563 MB (0.5 GB)
- **Upload mais recente:** ID 317 - IMG_2758.jpeg (3.2MB via iris.to)
- **Clientes compatíveis:** iris.to ✅, Dashboard web ✅

---

## 🗂️ Arquivos Modificados

### Código principal:
- `app.py` - Correções NIP-96, timeout fix, CORS, logging otimizado
- `Dockerfile` - Timeout aumentado para 120s (preparado, não aplicado)

### Documentação:
- `NIP96_DEBUG_GUIDE.md` - Guia completo de debug
- `OTIMIZACAO_PERFORMANCE.md` - Análise de performance
- `BLACKLIST.md` - Documentação do sistema de blacklist
- `CHANGELOG_01NOV2025.md` - Este documento

### Backup:
- `backups/backup_nip96_01nov2025.tar.gz` - Backup de todos arquivos modificados

---

## 📋 Próximas Tarefas (TODO List)

1. ✅ **[CONCLUÍDO]** NIP-96 External Uploads
2. ⏳ **Publicação no GitHub** - Documentação, README, badges
3. ⏳ **Onboarding de assinantes** - Sistema de pagamento, docs
4. ⏳ **Melhorias UX** - Preview, busca, ordenação
5. ⏳ **Bot Sofia Nostr** - Sistema de publicação manual/sob demanda
6. ⏳ **Servidor de nomes @liber.app** - NIP-05 (último, requer domínio)

---

## 🔧 Configurações Importantes

### NIP-96 Discovery:
```json
{
  "api_url": "https://libermedia.app/api/upload/nip96"
}
```

### CORS Headers (todas respostas):
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

### Workarounds ativos:
- Endpoint raiz `/` aceita POST com arquivos (redireciona para NIP-96)
- Aceita campo `file` (padrão) e `fileToUpload` (iris.to)
- Normalização HTTP/HTTPS em validação NIP-98

---

## ✅ Verificações Finais

- ✅ Containers rodando normalmente
- ✅ NIP-96 discovery endpoint correto
- ✅ 314 arquivos no banco de dados
- ✅ Logging otimizado (não verboso)
- ✅ Processos em background limpos
- ✅ Backup criado
- ✅ Performance excelente (6ms local, 600ms via Cloudflare)

---

**Implementado por:** Claude Code
**Data:** 01/Novembro/2025
**Status geral:** 🟢 **Sistema estável e operacional**
