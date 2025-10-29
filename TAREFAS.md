# 📋 LISTA DE TAREFAS - LIBERMEDIA

**Última atualização:** 29 de Outubro de 2025

---

## ✅ CONCLUÍDO HOJE (29/Out/2025)

### 1. Filtro por Tipo
- ✅ Pills com filtros (📦 Todos | 🖼️ Imagens | 🎬 Vídeos | 📄 Docs | 🎵 Áudio)
- ✅ Combinação de filtros: Pasta + Tipo

### 2. Seleção Múltipla + Deleção em Lote
- ✅ Menu dropdown "Seleção" (discreto)
- ✅ Modo Seleção toggle on/off
- ✅ Checkboxes aparecem apenas quando ativado
- ✅ Selecionar Todos / Desmarcar
- ✅ Botão "Deletar X selecionados" flutuante
- ✅ Modal de confirmação com contador
- ✅ Feedback com toasts

### 3. Botão Sair Discreto
- ✅ Botão 🚪 na sidebar
- ✅ Limpeza completa do localStorage
- ✅ Redirecionamento para login

### 4. Botão Config ⚙️
- ✅ Modal de configurações
- ✅ Campos: Nome e URL do Avatar (temporariamente local)
- ✅ Persistência via localStorage
- ✅ Carregamento automático ao abrir página

---

## 🔴 PRIORIDADE ALTA

### 🌐 SINCRONIZAÇÃO NOSTR - NIP-01 (CRÍTICO)
**Status:** ⏳ Aguardando implementação

#### 📖 Sobre o NIP-01:
- **NIP-01** define o protocolo básico do Nostr
- **Kind 0 Events** são para metadados de usuário
- **Campos padrão:**
  - `name` - Nome/nickname
  - `display_name` - Nome de exibição
  - `about` - Bio curta
  - `picture` - URL do avatar
  - `banner` - URL do banner
  - `website` - Site pessoal
  - `nip05` - Verificação DNS
  - `lud16` - Lightning Address

#### 🎯 Tarefas:
- [ ] **Implementar leitura de perfil Nostr (NIP-01)**
  - Buscar evento kind 0 do usuário via relays
  - Extrair: name, picture, about, display_name
  - Substituir dados locais por dados do Nostr

- [ ] **Implementar escrita de perfil Nostr (NIP-01)**
  - Formulário completo no modal Config
  - Criar evento kind 0 ao salvar
  - Publicar evento em relays Nostr
  - Usar NIP-07 (window.nostr) para assinatura

- [ ] **Sincronização automática**
  - Buscar perfil ao fazer login
  - Atualizar UI com dados do Nostr
  - Cache local com sincronização periódica
  - Detectar mudanças e atualizar automaticamente

- [ ] **Modal Config atualizado**
  - Adicionar campo "about" (bio)
  - Adicionar campo "banner" (URL)
  - Adicionar campo "website"
  - Adicionar campo "nip05" (verificação)
  - Adicionar campo "lud16" (Lightning)
  - Botão "🔄 Sincronizar com Nostr"
  - Status: "Sincronizado" / "Desatualizado"

#### 🔧 Arquivos a modificar:
- `app.py` - Novo endpoint `/api/nostr/profile/update`
- `templates/dashboard.html` - Expandir modal Config
- `static/js/dashboard.js` - Funções de leitura/escrita NIP-01
- Novo arquivo: `static/js/nostr.js` - Biblioteca Nostr dedicada

#### 📚 Referências:
- https://github.com/nostr-protocol/nips/blob/master/01.md
- https://nips.nostr.com/1

---

## 🟡 PRIORIDADE MÉDIA

### PASTAS - FASE 3 (Opcional)
- [ ] Renomear pastas
- [ ] Deletar pastas (com validação se tem arquivos)
- [ ] Mover arquivos entre pastas (drag & drop ou menu)
- [ ] Ordenar pastas customizado
- [ ] Tabela Pastas separada no banco (metadados: cor, ícone, ordem)

### UX/MOBILE
- [ ] Preview de arquivos (PDF, DOC) sem baixar
- [ ] Busca/pesquisa de arquivos por nome
- [ ] Ordenação (nome, data, tamanho)
- [ ] Filtros avançados combinados
- [ ] View em lista (já existe código, precisa ativar)

---

## 🟢 PRIORIDADE BAIXA

### BACKEND
- [ ] Endpoint gerar link compartilhável público (tempo limitado)
- [ ] Endpoint deletar múltiplos arquivos em batch (já existe frontend)
- [ ] Compressão automática de imagens no upload
- [ ] Limite de taxa (rate limiting) por usuário
- [ ] Logs de atividade do usuário

### NOSTR - FASE 4 (Futuro)
- [ ] **NIP-78:** Sincronizar pastas via Nostr
- [ ] Pastas compartilhadas entre dispositivos
- [ ] Compatibilidade com outros clientes Nostr
- [ ] Backup descentralizado de metadados
- [ ] **NIP-94:** File Metadata (metadados de arquivos no Nostr)
- [ ] **NIP-96:** HTTP File Storage Integration

### INTERFACE
- [ ] Modo de visualização: cards, lista, galeria
- [ ] Customização de cores/tema
- [ ] Atalhos de teclado
- [ ] Arrastar e soltar para organizar
- [ ] Seleção por range (Shift + Click)

---

## 🎯 ROADMAP GERAL

### Fase 1: ✅ CONCLUÍDO
- Core features (upload, download, organização)
- Filtros básicos
- Seleção múltipla
- Configurações locais

### Fase 2: 🔄 EM ANDAMENTO
- **Sincronização Nostr completa (NIP-01)**
- Perfil sincronizado
- Metadados descentralizados

### Fase 3: 📅 FUTURO
- Pastas avançadas (Nostr NIP-78)
- Compartilhamento
- Preview de arquivos
- Busca avançada

### Fase 4: 🚀 LONGO PRAZO
- File metadata no Nostr (NIP-94)
- Storage integration (NIP-96)
- Multi-relay suporte
- Criptografia E2E

---

## 📊 ESTATÍSTICAS

### Commits Hoje:
```
7fb0c4a - Remove seção de tema duplicada do modal de configurações
1b4665a - Adiciona modal de configurações com tema e perfil
63d86d7 - Refatora seleção múltipla com menu dropdown discreto
ebc022c - Implementa botão de logout discreto com limpeza completa
f398358 - Adiciona seleção múltipla e deleção em lote de arquivos
```

### Linhas Modificadas: ~400+ linhas
### Arquivos Alterados: 2 principais (dashboard.html, dashboard.js)

---

## 🔗 LINKS ÚTEIS

- **Nostr NIPs:** https://github.com/nostr-protocol/nips
- **NIP-01 (Profile):** https://github.com/nostr-protocol/nips/blob/master/01.md
- **NIP-07 (Browser Extension):** https://github.com/nostr-protocol/nips/blob/master/07.md
- **NIP-78 (App Data):** https://github.com/nostr-protocol/nips/blob/master/78.md
- **NIP-94 (File Metadata):** https://github.com/nostr-protocol/nips/blob/master/94.md
- **Nostr Tools:** https://github.com/nbd-wtf/nostr-tools

---

**FIM DO DOCUMENTO**
