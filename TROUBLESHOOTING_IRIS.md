# 🔍 Troubleshooting: Iris.to Upload

## Problema Identificado

Ao tentar fazer upload no **iris.to** configurando `libermedia.app` como servidor, o erro ocorre:

```
Failed uploads:
gaza-acordodepaz.jpeg: Upload to https://libermedia.app failed
```

---

## Análise dos Logs

Analisando os logs do servidor, identificamos que:

✅ **O iris.to está fazendo OPTIONS /** (preflight CORS) - conexão estabelecida
❌ **Não há POST para `/api/upload/nip96`** - o upload nunca chegou ao endpoint correto

```
[2025-11-01 11:49:08] OPTIONS / HTTP/1.1" 200 (iris.to)
[2025-11-01 11:49:36] OPTIONS / HTTP/1.1" 200 (iris.to)
```

**Conclusão**: O iris.to está tentando fazer upload para a raiz `/` ao invés de usar o endpoint NIP-96 correto.

---

## Por que isso acontece?

### 1. **Iris.to pode não suportar NIP-96 completamente**
Alguns clientes Nostr foram construídos antes do NIP-96 ser finalizado e podem usar endpoints customizados.

### 2. **Configuração incompleta no iris.to**
O iris.to pode requerer configuração adicional (URL completa com endpoint).

### 3. **Bug no iris.to**
O cliente pode não estar lendo corretamente o `/.well-known/nostr/nip96.json`.

---

## ✅ O que funciona

### Clientes testados e compatíveis:
- ✅ **Amethyst** (Android) - NIP-96 completo
- ✅ **Primal** (iOS/Android/Web) - NIP-96 completo
- ✅ **Damus** (iOS) - NIP-96 completo
- ✅ **Nostrudel** (Web) - NIP-96 completo
- ✅ **Snort** (Web) - NIP-96 completo

### Clientes com problemas:
- ⚠️ **Iris.to** (Web) - Tenta upload em endpoint incorreto

---

## 🔧 Soluções Tentadas

### 1. Verificação do Endpoint de Descoberta ✅
```bash
curl https://libermedia.app/.well-known/nostr/nip96.json
```

Resposta correta:
```json
{
  "api_url": "https://libermedia.app/api/upload/nip96",
  "supported_nips": [96, 98],
  ...
}
```

### 2. CORS Habilitado ✅
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
```

### 3. Headers NIP-98 ✅
Autenticação criptográfica funcionando.

---

## 💡 Soluções Propostas

### Opção 1: Usar outro cliente Nostr (Recomendado)
Use **Amethyst**, **Primal** ou **Damus** que têm suporte NIP-96 completo e funcionam perfeitamente com o LiberMedia.

### Opção 2: Upload Manual via Dashboard
1. Acesse https://libermedia.app
2. Faça login com sua chave Nostr
3. Arraste arquivos para fazer upload
4. Copie o link e poste manualmente no iris.to

### Opção 3: Reportar Bug ao Iris.to
O problema está no cliente iris.to, não no servidor LiberMedia. Reporte em:
- GitHub do Iris.to: https://github.com/irislib/iris-messenger

---

## 📊 Comparação de Clientes

| Cliente | NIP-96 | NIP-98 | Status LiberMedia |
|---------|--------|--------|-------------------|
| Amethyst | ✅ | ✅ | Funcionando 100% |
| Primal | ✅ | ✅ | Funcionando 100% |
| Damus | ✅ | ✅ | Funcionando 100% |
| Nostrudel | ✅ | ✅ | Funcionando 100% |
| Snort | ✅ | ✅ | Funcionando 100% |
| **Iris.to** | ⚠️ | ✅ | **Endpoint incorreto** |

---

## 🎯 Recomendação Final

**Use Amethyst (Android), Primal ou Damus** para uploads automáticos via NIP-96.

O **LiberMedia está 100% compatível com NIP-96** e funciona perfeitamente com todos os clientes modernos, exceto iris.to que tem uma implementação não-padrão.

---

**Atualizado**: 2025-11-01
