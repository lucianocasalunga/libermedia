# 🎥 Como Configurar Clientes Nostr para usar o LiberMedia

## O que é NIP-96?

**NIP-96** é o protocolo Nostr para servidores de mídia (File Storage Integration). Permite que clientes Nostr façam upload de imagens, vídeos e arquivos para servidores compatíveis.

O **LiberMedia** implementa NIP-96 completo e pode substituir o nostr.build ou outros servidores de mídia.

---

## ✅ Verificação: LiberMedia está configurado corretamente

Teste se o servidor está funcionando:

```bash
curl https://libermedia.app/.well-known/nostr/nip96.json
```

Você deve ver algo como:
```json
{
  "api_url": "https://libermedia.app/api/upload/nip96",
  "download_url": "https://libermedia.app/f",
  "supported_nips": [96, 98],
  "content_types": ["image/jpeg", "video/mp4", ...]
}
```

---

## 📱 Como Configurar em Clientes Nostr

### 1. **Amethyst** (Android)

1. Abra o **Amethyst**
2. Vá em **⚙️ Configurações** → **Mídia & Uploads**
3. Em **File Server**, selecione **Custom**
4. Cole a URL: `https://libermedia.app`
5. Salve

Agora quando você postar uma foto, ela será enviada automaticamente para o LiberMedia!

---

### 2. **Primal** (iOS/Android/Web)

1. Abra o **Primal**
2. Vá em **⚙️ Settings** → **Media Upload**
3. Selecione **Custom Server**
4. Cole: `https://libermedia.app`
5. Salve

---

### 3. **Damus** (iOS)

1. Abra o **Damus**
2. Vá em **Settings** → **Media Uploads**
3. Selecione **Custom NIP-96 Server**
4. URL: `https://libermedia.app`
5. Salve

---

### 4. **Nostrudel** (Web)

1. Acesse **nostrudel.ninja**
2. Clique em **⚙️** (canto superior direito)
3. Vá em **Settings** → **Media**
4. Em **Upload Server**, selecione **Custom**
5. Cole: `https://libermedia.app`
6. Clique em **Save**

---

### 5. **Snort** (Web)

1. Acesse **snort.social**
2. Clique no **ícone de perfil** → **Settings**
3. Vá em **File Upload**
4. Selecione **Custom Server**
5. URL: `https://libermedia.app`
6. Salve

---

## ⚠️ Importante: Desvincular do nostr.build

Se você estava usando nostr.build, precisa **remover a vinculação**:

### **Opção 1: Configurar LiberMedia como primário**
Basta configurar o LiberMedia no seu cliente (veja acima). A maioria dos clientes usa o servidor configurado por padrão.

### **Opção 2: Desabilitar nostr.build**
Em alguns clientes, você pode ter múltiplos servidores. Certifique-se de:
1. Remover ou desabilitar nostr.build nas configurações
2. Definir LiberMedia como padrão

---

## 🔐 Autenticação NIP-98

O LiberMedia **exige autenticação NIP-98** (assinatura criptográfica) para uploads. Isso significa:

✅ **Mais seguro** - Somente você pode fazer upload
✅ **Sem spam** - Uploads são vinculados à sua identidade Nostr
✅ **Privacidade** - Seus arquivos ficam na sua conta

Clientes Nostr modernos (Amethyst, Primal, Damus, etc.) **suportam NIP-98 automaticamente**.

---

## 📊 Verificando se está funcionando

### 1. **Teste rápido:**
1. Abra seu cliente Nostr (ex: Amethyst)
2. Crie uma nova nota
3. Adicione uma foto
4. Poste

### 2. **Verifique o link:**
Após postar, inspecione a nota. O link da imagem deve ser:
```
https://libermedia.app/f/123.jpg
```

Se começar com `https://nostr.build` ou outro servidor, verifique a configuração.

### 3. **Verifique no Dashboard:**
1. Acesse https://libermedia.app
2. Faça login com sua chave Nostr
3. Vá para a pasta **Photos**
4. Sua imagem deve aparecer lá!

---

## 🆘 Troubleshooting

### Erro: "Upload failed"
**Causa:** Cliente não está enviando NIP-98 auth
**Solução:** Atualize seu cliente para a versão mais recente

### Erro: "CORS blocked"
**Causa:** Navegador está bloqueando requisições
**Solução:** Já foi corrigido! Reinicie o navegador e tente novamente

### Imagem ainda vai para nostr.build
**Causa:** Cliente está com configuração antiga em cache
**Solução:**
1. Force-close o app
2. Limpe cache do navegador (se web)
3. Reabra e tente novamente

### Como saber qual servidor está sendo usado?
Copie o link da imagem postada e veja o domínio:
- ✅ `libermedia.app` = Usando LiberMedia!
- ❌ `nostr.build` = Ainda usando nostr.build

---

## 🎯 Clientes Testados e Compatíveis

| Cliente | Plataforma | Status NIP-96 | Status NIP-98 |
|---------|------------|---------------|---------------|
| Amethyst | Android | ✅ | ✅ |
| Primal | iOS/Android/Web | ✅ | ✅ |
| Damus | iOS | ✅ | ✅ |
| Nostrudel | Web | ✅ | ✅ |
| Snort | Web | ✅ | ✅ |
| Coracle | Web | ✅ | ✅ |
| Iris | Web | ⚠️ | ⚠️ |

⚠️ = Suporte parcial ou em desenvolvimento

---

## 🔗 Links Úteis

- **Dashboard LiberMedia:** https://libermedia.app
- **Endpoint NIP-96:** https://libermedia.app/.well-known/nostr/nip96.json
- **Documentação NIP-96:** https://github.com/nostr-protocol/nips/blob/master/96.md
- **Documentação NIP-98:** https://github.com/nostr-protocol/nips/blob/master/98.md

---

## 💡 Dica Pro

Depois de configurar, faça um post de teste marcando `#libermedia` para testar se está tudo funcionando! 🚀

---

**Feito com ❤️ e Nostr**
