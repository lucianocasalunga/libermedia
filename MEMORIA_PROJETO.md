# 📋 MEMÓRIA DO PROJETO LIBERMEDIA

**Última atualização:** 30/Outubro/2025 20:00 UTC
**Contexto:** Plataforma de hospedagem descentralizada com Nostr

---

## 🎯 SITUAÇÃO ATUAL (30/Out/2025 - 19:30 UTC)

### ✅ FUNCIONALIDADES IMPLEMENTADAS HOJE:
1. ✅ Busca de arquivos por nome (filtro em tempo real)
2. ✅ Ordenação (data, nome, tamanho - 6 opções)
3. ✅ Mover arquivos entre pastas
4. ✅ Renomear/Deletar pastas customizadas
5. ✅ Layout mobile otimizado (3 botões compactos lado a lado)
6. ✅ Compartilhamento público com links temporários (1h/24h/7d/30d)
7. ✅ **NIP-01: Sincronização completa de perfil Nostr** 🎉

### 📊 COMMITS RECENTES:
- `2f7d5e6` - feat: NIP-01 completo com código inline (solução definitiva) ✅
- `b97f7e8` - docs: Atualiza documentação com NIP-01 implementado
- `5499375` - feat: Implementa sincronização completa de perfil Nostr (NIP-01)
- `7a139df` - feat: 4 funcionalidades (busca, ordenação, mover, renomear/deletar)

---

## 🔮 PROTOCOLOS NOSTR (NIPs) - IMPLEMENTAÇÃO PENDENTE

### ⚠️ PRIORIDADE ALTA - MENCIONADOS ONTEM:

#### **NIP-01: Basic Protocol Flow**
- Status: ✅ **IMPLEMENTADO E TESTADO COM SUCESSO**
- Implementado em: 30/Out/2025 (commits 5499375, 2f7d5e6)
- Solução final: Código inline no dashboard.js (evita cache)
- Funcionalidades:
  - ✅ Sincronizar metadados de perfil (kind 0) completos
  - ✅ Publicar perfil usando NIP-07 (window.nostr)
  - ✅ Todos os campos: name, display_name, about, picture, banner, website, nip05, lud16
  - ✅ Sincronização automática (1x por hora)
  - ✅ Publicação em múltiplos relays (Damus, nos.lol, relay.band)
  - ✅ Modal expandido com 8 campos editáveis
  - ✅ Indicador de status de sincronização
  - ✅ Funciona sem cache do usuário
- Próximos passos:
  - [ ] Publicar eventos de atividade do usuário (kind 1)
  - [ ] Melhorar tratamento de eventos recebidos

#### **NIP-07: window.nostr Capability**
- Status: ✅ IMPLEMENTADO (login via extensão)
- O que falta:
  - [ ] Usar para assinar eventos (atualmente só login)
  - [ ] Implementar sign/encrypt/decrypt via extensão

#### **NIP-78: Application-specific Data**
- Status: ❌ NÃO IMPLEMENTADO
- Objetivo: Armazenar dados privados do app (pastas, preferências)
- Tarefas:
  - [ ] Criar eventos kind 30078 para armazenar pastas
  - [ ] Sincronizar preferências do usuário via Nostr
  - [ ] Backup descentralizado de metadados
  - [ ] Conflito resolution (múltiplos dispositivos)

#### **NIP-96: HTTP File Storage Integration**
- Status: ❌ NÃO IMPLEMENTADO
- Objetivo: Protocolo padrão para servidores de arquivo Nostr
- Tarefas:
  - [ ] Implementar endpoints padrão NIP-96
  - [ ] Suporte a auth via NIP-98
  - [ ] Metadata de arquivos compatível
  - [ ] Descoberta de servidor via NIP-05

#### **NIP-98: HTTP Auth**
- Status: ❌ NÃO IMPLEMENTADO
- Objetivo: Autenticação HTTP usando eventos Nostr assinados
- Tarefas:
  - [ ] Substituir npub simples por auth assinado
  - [ ] Validar assinaturas em todos endpoints
  - [ ] Token de sessão via evento kind 27235
  - [ ] Expiração e renovação de auth

#### **NIP-05: Mapping Nostr Keys to DNS**
- Status: ❌ NÃO IMPLEMENTADO
- Objetivo: Verificação de identidade (ex: nome@libermedia.app)
- Tarefas:
  - [ ] Endpoint /.well-known/nostr.json
  - [ ] Sistema de verificação de usuários
  - [ ] UI para mostrar verificados
  - [ ] Badge de verificado no perfil

### 📝 OUTROS NIPs RELEVANTES (FUTURO):

- **NIP-04:** Encrypted Direct Messages (mensagens privadas)
- **NIP-26:** Delegated Event Signing (compartilhar sem expor nsec)
- **NIP-42:** Authentication of Clients to Relays
- **NIP-57:** Lightning Zaps (pagamentos integrados)
- **NIP-94:** File Metadata (metadados descentralizados de arquivos)

---

## 🚀 ROADMAP TÉCNICO

### FASE 1: SYNC & BACKUP (NIP-78)
**Objetivo:** Sincronizar dados do usuário entre dispositivos
- Implementar NIP-78 para pastas customizadas
- Sincronizar preferências (tamanho grid, tema, etc)
- Resolver conflitos entre dispositivos
- **Estimativa:** 2-3 dias

### FASE 2: AUTENTICAÇÃO SEGURA (NIP-98)
**Objetivo:** Substituir auth simples por assinatura Nostr
- Implementar NIP-98 em todos endpoints
- Criar sistema de tokens assinados
- Middleware de validação
- **Estimativa:** 1-2 dias

### FASE 3: COMPATIBILIDADE NIP-96
**Objetivo:** Tornar servidor compatível com protocolo padrão
- Implementar endpoints NIP-96
- Metadata de arquivos descentralizado
- Descoberta de servidor
- **Estimativa:** 2-3 dias

### FASE 4: VERIFICAÇÃO (NIP-05)
**Objetivo:** Sistema de verificação de usuários
- Endpoint .well-known/nostr.json
- UI de verificação
- Badge de verificado
- **Estimativa:** 1 dia

---

## 📂 ESTRUTURA DO PROJETO

```
/opt/libermedia/
├── app.py                    # Backend Flask
├── docker-compose.yml        # Containers
├── templates/                # Frontend HTML
│   ├── dashboard.html       # Dashboard principal
│   ├── share.html           # Página pública
│   └── ...
├── static/
│   ├── js/dashboard.js      # Lógica frontend
│   └── css/
├── uploads/                  # Arquivos dos usuários
├── config/plans.json         # Planos de assinatura
├── secrets/lnbits.env        # Config Lightning
└── MEMORIA_PROJETO.md        # Este arquivo
```

---

## 🔗 REFERÊNCIAS IMPORTANTES

### Documentação Nostr:
- https://github.com/nostr-protocol/nips
- https://nostr.com/nips
- https://nostr-sdk.org/

### Bibliotecas em uso:
- `nostr-sdk` (Python) - Interação com relays
- `bech32` (Python) - Encoding npub/nsec
- NIP-07 via JavaScript (window.nostr)

### Relays configurados:
- wss://relay.damus.io
- wss://nos.lol
- wss://relay.nostr.band

---

## 📌 NOTAS IMPORTANTES

1. **Segurança:**
   - NUNCA armazenar nsec em plaintext no banco
   - Usar NIP-98 para auth ao invés de npub simples
   - Implementar rate limiting

2. **Performance:**
   - Cache de perfis Nostr (atualmente busca toda vez)
   - Batch de eventos para reduzir requests
   - Compressão de arquivos grandes

3. **UX:**
   - Feedback visual de sincronização
   - Indicador de status de conexão com relays
   - Modo offline com cache

4. **Compliance:**
   - GDPR: direito ao esquecimento
   - DMCA: sistema de takedown
   - Backup automático dos metadados

---

## 🎯 PRÓXIMAS SESSÕES DE TRABALHO

### Sessão 1: NIP-78 (Sincronização de Pastas)
- [ ] Criar schema de evento kind 30078
- [ ] Implementar publicação de pastas
- [ ] Implementar leitura de pastas dos relays
- [ ] Merge com localStorage
- [ ] UI de status de sync

### Sessão 2: NIP-98 (Auth Seguro)
- [ ] Middleware de validação
- [ ] Endpoint de geração de token
- [ ] Atualizar frontend para assinar requests
- [ ] Remover auth por npub simples

### Sessão 3: NIP-96 (Compatibilidade)
- [ ] Implementar endpoints padrão
- [ ] Metadata descentralizado
- [ ] Testes de interoperabilidade

---

## 💬 OBSERVAÇÕES DO USUÁRIO

> "Eu faço muitas coisas ao mesmo tempo e preciso de você concentrada no que eu não tenho tempo para fazer"

**Action Items:**
- Manter este arquivo sempre atualizado
- Ser proativo em lembrar tarefas pendentes
- Focar em automação e eficiência
- Registrar decisões e contextos importantes

---

**FIM DA MEMÓRIA - ARQUIVO VIVO (atualizar conforme progresso)**
