# 02 — Arquitetura do Sistema

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Runtime server-side** | Google Apps Script (V8 engine) |
| **Armazenamento** | Google Sheets (planilha ativa — sem banco de dados externo) |
| **Frontend** | HTML/CSS/JS Vanilla (sem framework) |
| **Templating** | `HtmlService` do GAS com `<?!= include(...) ?>` |
| **Comunicação cliente-servidor** | `google.script.run` (RPC assíncrono nativo do GAS) |
| **Concorrência** | `LockService.getScriptLock()` em todas as escritas |
| **E-mail** | `MailApp.sendEmail()` |
| **Auditoria** | `Session.getActiveUser().getEmail()` + Stackdriver exception logging |
| **Ferramentas de dev** | clasp (push/pull de arquivos para o GAS) |

## Bibliotecas Client-side (CDN)

| Biblioteca | Versão | Uso |
|---|---|---|
| `drag-drop-touch` | 1.3.0 | Drag-and-drop mobile no Kanban |
| `Chart.js` | latest | Gráficos no Dashboard |
| `html2pdf.js` | 0.10.1 | Geração de PDF no cliente |
| Google Fonts | — | Inter + IBM Plex Sans |

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      Navegador (Cliente)                     │
│                                                             │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐  │
│  │JS_Utili- │  │ JS_Kanban  │  │JS_Documentos│  │JS_Riscos│ │
│  │tarios    │  │            │  │             │  │        │  │
│  └────┬─────┘  └─────┬──────┘  └──────┬──────┘  └───┬────┘  │
│       │              │                │              │       │
│       └──────────────┴────────────────┴──────────────┘       │
│                          state (global)                      │
│                     google.script.run (RPC)                  │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────▼───────────────────────────────┐
│                  Google Apps Script (Servidor)               │
│                                                             │
│  Código.js          Modulo_Tarefas.js   Modulo_Unidades.js  │
│  Modulo_Documentos  Modulo_Riscos.js                        │
│                                                             │
│  doGet() ──► HtmlService.createTemplateFromFile('Index')    │
│                    include(CSS) + include(JS_*)             │
│                                                             │
│  comBloqueio() ──► LockService.getScriptLock()              │
└─────────────────────────────┬───────────────────────────────┘
                              │ SpreadsheetApp
┌─────────────────────────────▼───────────────────────────────┐
│                        Google Sheets                        │
│                                                             │
│  [Tarefas] [Membros] [Unidades] [Documentos]               │
│  [Riscos] [Planos_Acao] [Entregas_Acoes] [Logs]            │
└─────────────────────────────────────────────────────────────┘
```

## Padrão SPA (Single Page Application)

A aplicação é servida inteiramente a partir de um único `doGet()`. Após o carregamento inicial, toda a navegação é feita no cliente — sem recarregamentos de página.

**Composição server-side do HTML:**

```
doGet()
  └── Index.html (shell principal)
        ├── <?!= include('CSS') ?>
        ├── <?!= include('JS_Utilitarios') ?>
        ├── <?!= include('JS_Kanban') ?>
        ├── <?!= include('JS_Unidades') ?>
        ├── <?!= include('JS_Documentos') ?>
        └── <?!= include('JS_Riscos') ?>
```

## Carregamento em Dois Estágios (Lazy Loading)

Para otimizar o tempo de carregamento inicial, os dados são buscados em duas etapas:

```
Página carrega
     │
     ▼
getKanbanData()          ← Estágio 1 (imediato)
  - tasks
  - members
     │
     ▼
Kanban renderiza
     │
     ▼  (usuário navega para outra aba)
garantirRestoData()      ← Estágio 2 (lazy — apenas 1 vez)
  - units
  - docs
  - risks
  - plans
  - deliveries
     │
     ▼
Callback(s) na fila executam
```

Se `getRestoData()` ainda estiver em curso quando outro módulo for aberto, o callback é enfileirado em `restoDataCallbacks[]` e executado quando a resposta chegar.

## Comunicação Cliente-Servidor

Toda comunicação usa o padrão `google.script.run`:

```javascript
// Exemplo de chamada com sucesso/erro
google.script.run
  .withSuccessHandler(function(result) { /* ... */ })
  .withFailureHandler(function(err) { /* ... */ })
  .nomeDaFuncaoNoServidor(parametro1, parametro2);
```

Não há API REST. Todas as funções server-side são expostas diretamente.

## Gerenciamento de Estado Client-Side

Um objeto global `state` armazena todos os dados em memória após o carregamento:

```javascript
state = {
  tasks: [],       // cartões do Kanban
  members: [],     // membros da comissão
  units: [],       // unidades/subcomissões
  docs: [],        // documentos
  risks: [],       // riscos
  plans: [],       // planos de ação
  deliveries: []   // entregas
}
```

Após cada operação de escrita, apenas o subconjunto afetado é recarregado do servidor.

## Concorrência

Todas as operações de escrita são encapsuladas em `comBloqueio(operacao)`:

```javascript
function comBloqueio(operacao) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // espera até 10 segundos
  try {
    return operacao();
  } finally {
    lock.releaseLock();
  }
}
```

Isso previne condições de corrida quando múltiplos usuários operam simultaneamente.
