# 10 — Deploy e Configuração

## Pré-requisitos

- Conta Google com acesso ao Google Workspace (SES/DF)
- [Node.js](https://nodejs.org) instalado (para uso do clasp)
- [clasp](https://github.com/google/clasp) instalado globalmente:
  ```bash
  npm install -g @google/clasp
  ```
- Autenticação clasp:
  ```bash
  clasp login
  ```

---

## Arquivos de Configuração

### `.clasp.json`

```json
{
  "scriptId": "1APgnmymXy4KsGCViY4KiEMNGz510FNH-DtKKNFNaZsNHl2aMRwIrLYCE",
  "fileExtension": "js",
  "filePushOrder": null
}
```

Mapeamentos de extensão:
- `.js` / `.gs` → arquivos de script GAS
- `.html` → arquivos HTML do GAS
- `.json` → arquivos JSON (manifesto)

### `appsscript.json`

```json
{
  "timeZone": "America/Sao_Paulo",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "MYSELF"
  }
}
```

**Campos importantes:**
- `timeZone` — Brasília, importante para cálculos de data (prazo, revisão, status)
- `runtimeVersion: "V8"` — engine V8 moderna do Chrome (suporte a ES6+, arrow functions, etc.)
- `exceptionLogging: "STACKDRIVER"` — exceções registradas no Google Cloud Logging
- `executeAs: "USER_DEPLOYING"` — executa com as permissões de quem fez o deploy
- `access: "MYSELF"` — acesso restrito ao dono da conta; para compartilhar com a organização mudar para `DOMAIN` ou `ANYONE_WITH_GOOGLE_ACCOUNT`

---

## Workflow de Deploy com clasp

### Enviar código para o GAS

```bash
# Na raiz do projeto
clasp push
```

Isso envia todos os arquivos locais para o projeto GAS identificado pelo `scriptId`.

### Verificar status

```bash
clasp status
```

### Abrir o editor GAS no navegador

```bash
clasp open
```

### Criar nova versão e publicar o Web App

1. No Google Apps Script Editor:
   - Menu **Implantar** → **Gerenciar implantações**
   - Criar nova implantação ou atualizar existente
   - Tipo: **App da Web**
   - Executar como: **Eu** (o usuário atual)
   - Quem tem acesso: **Apenas eu** (ou domínio conforme necessário)

2. Copiar a URL gerada — é o endereço do sistema.

### Puxar código do GAS para local

```bash
clasp pull
```

---

## Inicialização Automática da Planilha

Na primeira execução do sistema, `setupDatabase()` é chamada e cria automaticamente todas as 8 abas com os cabeçalhos corretos:

| Aba | Criada por |
|---|---|
| Tarefas | `setupDatabaseKanban()` |
| Membros | `setupDatabaseKanban()` |
| Unidades | `setupDatabaseResto()` |
| Documentos | `setupDatabaseResto()` |
| Riscos | `setupDatabaseResto()` |
| Planos_Acao | `setupDatabaseResto()` |
| Entregas_Acoes | `setupDatabaseResto()` |
| Logs | `setupDatabaseResto()` |

Não é necessário criar a planilha manualmente — basta abrir o Web App.

---

## Variáveis e Constantes do Sistema

Definidas no início de `Código.js`:

```javascript
const SHEET_TASKS    = 'Tarefas';
const SHEET_MEMBERS  = 'Membros';
const SHEET_UNITS    = 'Unidades';
const SHEET_DOCS     = 'Documentos';
const SHEET_RISKS    = 'Riscos';
const SHEET_PLANS    = 'Planos_Acao';
const SHEET_DELIVERY = 'Entregas_Acoes';
const SHEET_LOGS     = 'Logs';
```

Definida em `JS_Kanban.html`:
```javascript
const DIAS_PARA_ARQUIVAR = 15;
```

---

## Permissões (OAuth Scopes)

O GAS solicita as seguintes permissões automaticamente com base no uso:

| Permissão | Uso |
|---|---|
| `spreadsheets` | Leitura e escrita na planilha ativa |
| `script.external_request` | Carregamento de CDNs (Chart.js, html2pdf, etc.) |
| `gmail.send` (MailApp) | Envio de e-mails com PDF |
| `userinfo.email` | Identificação do usuário logado (`Session.getActiveUser()`) |
| `logging` | Stackdriver exception logging |

---

## Limites do Google Apps Script

| Recurso | Limite |
|---|---|
| Tempo de execução por chamada | 6 minutos |
| E-mails por dia (MailApp) | 100–1.500 (depende do plano Workspace) |
| Células de planilha | 10.000.000 por arquivo |
| Tamanho do script | 50 MB |
| Chamadas `google.script.run` simultâneas | Sem limite documentado, mas sujeito a cotas |

---

## Monitoramento de Erros

Exceções server-side são capturadas pelo Stackdriver (Google Cloud Logging):
- Acesse: [Google Cloud Console](https://console.cloud.google.com) → Logging → Logs Explorer
- Filtre por `resource.type = "app_script_function"`

Erros client-side são exibidos via `withFailureHandler` nas chamadas `google.script.run` — geralmente um `alert()` com a mensagem de erro.

---

## Alterando o Nível de Acesso

Para disponibilizar o sistema para outros usuários da organização, altere `appsscript.json`:

```json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "DOMAIN"  // ou "ANYONE_WITH_GOOGLE_ACCOUNT"
}
```

Após a alteração, faça `clasp push` e republique o Web App.

> **Atenção:** Com `access: "DOMAIN"`, qualquer pessoa da organização SES/DF com link pode acessar o sistema. Todos os dados são da mesma planilha — não há isolamento por usuário.
