# 🎥 LiberMedia

**Plataforma descentralizada de hospedagem de arquivos com Nostr e Lightning Network**

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()
[![Nostr](https://img.shields.io/badge/nostr-integrated-purple.svg)]()

---

## 🌟 Visão Geral

**LiberMedia** é uma plataforma moderna de hospedagem de arquivos que integra:
- 🔐 **Autenticação Nostr** (NIP-01, NIP-07)
- ⚡ **Pagamentos Lightning Network** via LNBits
- 📦 **Armazenamento descentralizado**
- 🚀 **Interface responsiva** (desktop, tablet, mobile)

---

## ✨ Funcionalidades

### 🔑 Autenticação
- Login via extensão Nostr (NIP-07)
- Login via chave privada (nsec)
- Sincronização automática de perfil Nostr (NIP-01)
- Autenticação HTTP via NIP-98 (eventos assinados) ✨ **NOVO**
- Verificação de identidade NIP-05 (username@libermedia.app) ✨ **NOVO**
- Suporte a múltiplos relays

### 📂 Gerenciamento de Arquivos
- Upload de múltiplos arquivos (drag & drop)
- Organização em pastas customizáveis (sincronizadas via NIP-78)
- Busca em tempo real
- Ordenação por data, nome e tamanho (6 opções)
- Thumbnails automáticos (imagens, vídeos, áudio, PDF)
- Preview inline de arquivos
- Mover arquivos entre pastas
- Dashboard de uso com analytics (histórico 30 dias, top arquivos) ✨ **NOVO**

### 🔗 Compartilhamento
- Links públicos temporários (1h, 24h, 7d, 30d)
- Links permanentes
- QR codes para compartilhamento mobile

### ⚡ Planos e Pagamentos
- Plano Free (500MB)
- Plano Bronze (5GB)
- Plano Silver (20GB)
- Plano Gold (50GB)
- Plano Platinum (100GB)
- Pagamentos via Lightning Network (LNBits)

### 🎨 Interface
- Design moderno com Tailwind CSS
- Modo responsivo (mobile-first)
- Drag & drop para upload
- Grid view com 3 tamanhos ajustáveis
- Suporte a dark mode (em desenvolvimento)

---

## 🛠️ Tecnologias

### Backend
- **Python 3.12** + Flask
- **PostgreSQL** (banco de dados)
- **nostr-sdk** (integração Nostr)
- **LNBits API** (pagamentos Lightning)
- **Gunicorn** (servidor WSGI)

### Frontend
- **Tailwind CSS** (estilização)
- **JavaScript Vanilla** (sem frameworks)
- **NIP-07** (window.nostr)
- **Nostr-tools** (biblioteca JavaScript)

### Infraestrutura
- **Docker** + **Docker Compose**
- **Nginx** (proxy reverso)
- **Cloudflare** (CDN e proteção)

---

## 🚀 Instalação

### Pré-requisitos
- Docker 20.10+
- Docker Compose 2.0+
- Conta LNBits (para pagamentos)

### Passos

1. **Clone o repositório:**
```bash
git clone https://github.com/lucianocasalunga/libermedia.git
cd libermedia
```

2. **Configure as variáveis de ambiente:**
```bash
cp secrets/lnbits.env.example secrets/lnbits.env
nano secrets/lnbits.env
```

3. **Configure os planos:**
```bash
nano config/plans.json
```

4. **Inicie os containers:**
```bash
docker-compose up -d
```

5. **Acesse a aplicação:**
```
http://localhost:8081
```

---

## 📊 NIPs Implementados

### ✅ Implementados (Novembro 2025)
- **NIP-01**: Basic Protocol Flow (sincronização completa de perfil)
- **NIP-05**: Verificação DNS (username@libermedia.app) ✨ **NOVO**
- **NIP-07**: window.nostr capability (login via extensão)
- **NIP-78**: Application-specific Data (sync de pastas entre dispositivos) ✨ **NOVO**
- **NIP-94**: File Metadata (metadata descentralizado) ✨ **NOVO**
- **NIP-96**: HTTP File Storage Integration (protocolo Nostr completo) ✨ **NOVO**
- **NIP-98**: HTTP Auth (autenticação criptográfica) ✨ **NOVO**

### 🔄 Planejados
- **NIP-04**: Encrypted Direct Messages (mensagens privadas)
- **NIP-26**: Delegated Event Signing
- **NIP-57**: Lightning Zaps (pagamentos integrados)

---

## 📁 Estrutura do Projeto

```
/opt/libermedia/
├── app.py                  # Backend Flask
├── docker-compose.yml      # Orquestração Docker
├── Dockerfile              # Imagem Python customizada
├── requirements.txt        # Dependências Python
├── templates/              # Templates HTML
│   ├── index.html         # Página de login
│   ├── dashboard.html     # Dashboard principal
│   └── share.html         # Página de compartilhamento
├── static/
│   ├── js/
│   │   ├── dashboard.js   # Lógica do dashboard
│   │   ├── nostr.js       # Biblioteca Nostr
│   │   └── login.js       # Lógica de login
│   ├── css/               # Estilos customizados
│   └── img/               # Imagens e ícones
├── uploads/                # Arquivos dos usuários
├── config/
│   └── plans.json         # Planos de assinatura
├── secrets/
│   └── lnbits.env         # Configuração LNBits
└── MEMORIA_PROJETO.md     # Documentação do projeto
```

---

## 🔧 Configuração

### LNBits
Configure suas credenciais LNBits em `secrets/lnbits.env`:
```env
LNBITS_URL=https://legend.lnbits.com
LNBITS_API_KEY=sua_chave_api
LNBITS_WEBHOOK_URL=https://libermedia.app/api/webhook/lnbits
```

### Planos de Assinatura
Edite `config/plans.json` para customizar planos e preços:
```json
{
  "bronze": {
    "name": "Bronze",
    "storage": 5368709120,
    "price": 1000
  }
}
```

### Relays Nostr
Configure em `static/js/nostr.js`:
```javascript
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];
```

---

## 📖 Documentação

- [MEMORIA_PROJETO.md](MEMORIA_PROJETO.md) - Histórico e roadmap
- [PERMISSOES_AUTOMATICAS.md](PERMISSOES_AUTOMATICAS.md) - Sistema de permissões

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

---

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 👤 Autor

**Luciano Casalunga**
- GitHub: [@lucianocasalunga](https://github.com/lucianocasalunga)
- Nostr: npub1nvcezhw3gze5waxtvrzzls8qzhvqpn087hj0s2jl948zr4egq0jqhm3mrr

---

## 🌐 Ecossistema LiberNet

**LiberMedia** faz parte do ecossistema **LiberNet**:
- 🌐 [LiberNet](https://libernet.app) - Plataforma de comunicação
- 📡 [Relay.LiberNet.app](https://relay.libernet.app) - Relay Nostr
- 🎥 [LiberMedia](https://libermedia.app) - Hospedagem de arquivos

---

## 📞 Suporte

- Issues: [GitHub Issues](https://github.com/lucianocasalunga/libermedia/issues)
- Email: contato@libermedia.app
- Nostr: Envie DM via Nostr

---

**Feito com ❤️ e Nostr**
