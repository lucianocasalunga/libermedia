# 🔓 SISTEMA DE PERMISSÕES AUTOMÁTICAS - CLAUDE CODE

**Criado em:** 31/Outubro/2025
**Objetivo:** Eliminar pedidos de permissão repetitivos durante a sessão

---

## 🎯 **PROBLEMA RESOLVIDO:**

Antes, Claude pedia permissão para cada operação:
- ❌ "Posso ler o arquivo X?"
- ❌ "Posso executar o comando Y?"
- ❌ "Posso editar o arquivo Z?"

**Agora:** Permissões automáticas configuradas! ✅

---

## 📋 **PERMISSÕES JÁ CONFIGURADAS NO SERVIDOR:**

As seguintes operações **NÃO PRECISAM DE PERMISSÃO**:

### **1. Leitura de Arquivos:**
```
✅ Read(//opt/libermedia/**)
✅ Read(//opt/libermedia/templates/**)
✅ Read(//opt/**)
✅ Read(//var/log/**)
```

### **2. Comandos Docker:**
```
✅ Bash(docker cp:*)
✅ Bash(docker exec:*)
✅ Bash(docker restart:*)
✅ Bash(docker inspect:*)
✅ Bash(docker stop:*)
✅ Bash(docker rm:*)
✅ Bash(docker-compose:*)
✅ Bash(docker-compose up:*)
✅ Bash(docker-compose down:*)
✅ Bash(docker-compose restart:*)
✅ Bash(docker-compose ps:*)
✅ Bash(docker logs:*)
```

### **3. Comandos Git:**
```
✅ Bash(git add:*)
✅ Bash(git commit:*)
✅ Bash(git push:*)
✅ Bash(git log:*)
```

### **4. Comandos Gerais:**
```
✅ Bash(find:*)
✅ Bash(cat:*)
✅ Bash(curl:*)
✅ Bash(python3:*)
✅ Bash(apt list:*)
✅ Bash(nak decode:*)
✅ WebSearch
```

### **5. APIs Específicas:**
```
✅ Bash(curl -s -X POST https://libermedia.app/api/nostr/profile ...)
```

---

## ⚙️ **COMO ADICIONAR NOVAS PERMISSÕES:**

### **Arquivo de Configuração:**
```
/root/.claude/settings.json
```

### **Estrutura do Arquivo:**
```json
{
  "allowedCommands": [
    {
      "type": "Read",
      "pattern": "//opt/libermedia/**"
    },
    {
      "type": "Bash",
      "pattern": "docker *"
    },
    {
      "type": "Bash",
      "pattern": "git *"
    }
  ]
}
```

### **Tipos de Permissões Disponíveis:**

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| `Read` | Leitura de arquivos | `Read(//opt/**)` |
| `Write` | Criação de arquivos | `Write(//opt/libermedia/**)` |
| `Edit` | Edição de arquivos | `Edit(//opt/libermedia/**)` |
| `Bash` | Comandos shell | `Bash(docker *)` |
| `Glob` | Busca de arquivos | `Glob(**)` |
| `Grep` | Busca em conteúdo | `Grep(**)` |
| `WebSearch` | Pesquisa na web | `WebSearch` |
| `WebFetch` | Buscar URLs | `WebFetch(*)` |

---

## 🚀 **PERMISSÕES RECOMENDADAS PARA ADICIONAR:**

### **Para evitar 100% dos pedidos:**

```json
{
  "allowedCommands": [
    {
      "type": "Read",
      "pattern": "**"
    },
    {
      "type": "Write",
      "pattern": "//opt/libermedia/**"
    },
    {
      "type": "Edit",
      "pattern": "//opt/libermedia/**"
    },
    {
      "type": "Bash",
      "pattern": "*"
    },
    {
      "type": "Glob",
      "pattern": "**"
    },
    {
      "type": "Grep",
      "pattern": "**"
    },
    {
      "type": "WebSearch",
      "pattern": "*"
    }
  ]
}
```

⚠️ **ATENÇÃO:** Isso dá permissão TOTAL para Claude. Use apenas se confiar 100%.

---

## 🎯 **PERMISSÕES RECOMENDADAS (SEGURAS):**

### **Somente para o projeto Libermedia:**

```json
{
  "allowedCommands": [
    {
      "type": "Read",
      "pattern": "//opt/**"
    },
    {
      "type": "Write",
      "pattern": "//opt/libermedia/**"
    },
    {
      "type": "Edit",
      "pattern": "//opt/libermedia/**"
    },
    {
      "type": "Bash",
      "pattern": "docker*"
    },
    {
      "type": "Bash",
      "pattern": "git*"
    },
    {
      "type": "Bash",
      "pattern": "python3*"
    },
    {
      "type": "Bash",
      "pattern": "curl*"
    },
    {
      "type": "Bash",
      "pattern": "cat*"
    },
    {
      "type": "Bash",
      "pattern": "ls*"
    },
    {
      "type": "Bash",
      "pattern": "tail*"
    },
    {
      "type": "Bash",
      "pattern": "echo*"
    },
    {
      "type": "Glob",
      "pattern": "**"
    },
    {
      "type": "Grep",
      "pattern": "**"
    },
    {
      "type": "WebSearch",
      "pattern": "*"
    }
  ]
}
```

---

## 📝 **COMO APLICAR AS PERMISSÕES:**

### **Opção 1: Editar manualmente**
```bash
nano /root/.claude/settings.json
```

### **Opção 2: Usar script (criar arquivo)**
```bash
cat > /root/.claude/settings.json << 'EOF'
{
  "allowedCommands": [
    {"type": "Read", "pattern": "//opt/**"},
    {"type": "Write", "pattern": "//opt/libermedia/**"},
    {"type": "Edit", "pattern": "//opt/libermedia/**"},
    {"type": "Bash", "pattern": "docker*"},
    {"type": "Bash", "pattern": "git*"},
    {"type": "Glob", "pattern": "**"},
    {"type": "Grep", "pattern": "**"}
  ]
}
EOF
```

### **Opção 3: Aplicar via interface do Claude Code**
1. Abrir Claude Code
2. Configurações → Permissions
3. Adicionar permissões desejadas

---

## ✅ **STATUS ATUAL:**

**Permissões já configuradas:** ✅
**Cobertura:** ~80% das operações comuns
**Pedidos de permissão restantes:** ~20% (operações não previstas)

---

## 🎯 **PRÓXIMA AÇÃO RECOMENDADA:**

Para **ZERO pedidos de permissão**, adicione as permissões recomendadas acima em:
```
/root/.claude/settings.json
```

Ou simplesmente **aprove uma vez por sessão** quando Claude pedir.

---

## 📚 **DOCUMENTAÇÃO OFICIAL:**

- Claude Code Permissions: https://docs.claude.com/en/docs/claude-code/permissions
- Configuração avançada: https://docs.claude.com/en/docs/claude-code/configuration

---

**Última atualização:** 31/Out/2025 13:15 UTC
**Mantido por:** Claude Code IA Assistant
