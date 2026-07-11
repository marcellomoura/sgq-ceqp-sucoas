# 03 — Estrutura de Arquivos

## Mapa Completo

```
SistemaGestaoQualidade/
├── .clasp.json              — Configuração do clasp (scriptId, mapeamento de extensões)
├── appsscript.json          — Manifesto do GAS (runtime V8, timezone, webapp config)
│
├── Código.js                — Servidor: ponto de entrada + utilitários + carregamento de dados
├── Modulo_Tarefas.js        — Servidor: módulos Tarefas (Kanban) e Membros
├── Modulo_Unidades.js       — Servidor: módulo Unidades / Subcomissões
├── Modulo_Documentos.js     — Servidor: módulo Gestão Documental
├── Modulo_Riscos.js         — Servidor: módulos Riscos, Planos de Ação e Entregas
│
├── Index.html               — Shell HTML principal (layout, views, todos os modais)
├── CSS.html                 — Estilos (injetado via include())
├── JS_Utilitarios.html      — JS cliente: estado global, utilitários, navegação, PDF, logs
├── JS_Kanban.html           — JS cliente: renderização e interações do Kanban
├── JS_Unidades.html         — JS cliente: renderização CRUD de Unidades
├── JS_Documentos.html       — JS cliente: renderização CRUD de Documentos
└── JS_Riscos.html           — JS cliente: renderização de Riscos, Planos e Entregas
```

**Total:** 14 arquivos

## Descrição Detalhada dos Arquivos

### Arquivos de Configuração

#### `.clasp.json`
Configuração do clasp para deploy no Google Apps Script.
- `scriptId` — ID do projeto GAS
- `fileExtension` — extensão usada localmente (`.js`)
- Mapeamentos: `.js`/`.gs` → script, `.html` → html, `.json` → json

#### `appsscript.json`
Manifesto do projeto GAS.
- `timeZone: "America/Sao_Paulo"`
- `runtimeVersion: "V8"`
- `exceptionLogging: "STACKDRIVER"`
- `webapp.executeAs: "USER_DEPLOYING"`, `access: "MYSELF"`

---

### Arquivos Server-side (`.js`)

#### `Código.js`
Ponto de entrada e núcleo do sistema.

**Responsabilidades:**
- `doGet()` — serve a aplicação web
- `include()` — helper de template para injetar CSS e JS no HTML
- `comBloqueio()` — wrapper de lock para escritas concorrentes
- `conectarAba()` — cria/migra abas do Google Sheets
- Utilitários de data/ID: `safeDateString`, `formatarDataParaUI`, `getNowTimestamp`, `getNextId`
- `calcularNivelRisco()` — lógica de nível de risco
- `calcularProximaRevisao()` — cálculo de revisão anual
- `registrarLog()` — gravação do log de auditoria
- `setupDatabase*()` — inicialização das planilhas
- `getKanbanData()` — carregamento estágio 1
- `getRestoData()` — carregamento estágio 2
- `buscarLogs()` — retorna últimas 300 entradas do log

#### `Modulo_Tarefas.js`
CRUD de tarefas Kanban e membros.

**Funções exportadas:** `saveTask`, `updateTaskStatus`, `deleteTask`, `arquivarTarefaManual`, `restaurarTarefaArquivada`, `saveMember`, `deleteMember`

#### `Modulo_Unidades.js`
CRUD de unidades/subcomissões.

**Funções exportadas:** `salvarUnidade`, `atualizarUnidade`, `excluirUnidade`

#### `Modulo_Documentos.js`
Gestão documental com versionamento.

**Funções exportadas:** `salvarDocumento`, `atualizarDocumento`, `salvarRevisaoDocumento`, `excluirDocumento`

#### `Modulo_Riscos.js`
Riscos, planos de ação (5W2H) e controle de entregas.

**Funções exportadas:** `salvarRisco`, `atualizarRisco`, `salvarRevisaoRisco`, `excluirRisco`, `salvarPlano`, `atualizarPlano`, `salvarRevisaoPlano`, `buscarHistoricoPlano`, `excluirPlano`, `salvarEntrega`, `atualizarEntrega`, `excluirEntrega`, `enviarPdfPorEmail`

---

### Arquivos HTML/Client-side

#### `Index.html`
Shell principal da SPA. Contém:
- Layout com sidebar de navegação
- Todas as views/seções (`<section id="view-*">`)
- Todos os modais (`<div id="modal-*">`)
- Tags `<?!= include('...') ?>` para injeção de CSS e JS

#### `CSS.html`
Todos os estilos do sistema em um único arquivo, injetado no `<head>` via `include()`.

#### `JS_Utilitarios.html`
Módulo JS central do cliente. Contém:
- Objeto `state` global
- Sistema de lazy loading (`garantirRestoData`)
- Navegação SPA (`mudarTab`)
- Delegação de eventos (`data-acao`)
- Geração de PDF (`gerarPdfLocal`, `dispararEnvioPdf`)
- Log de auditoria (`carregarLogs`, `renderLogs`)
- Funções utilitárias compartilhadas

#### `JS_Kanban.html`
Renderização e interações do Kanban:
- `renderTasks()` — cards nas 5 colunas
- `renderArquivados()` — tabela de arquivados
- `renderDashboard()` — KPIs + gráficos Chart.js
- Drag-and-drop nativo + touch
- Modal de tarefa com atividades

#### `JS_Unidades.html`
Renderização da lista de unidades e formulários de criação/edição.

#### `JS_Documentos.html`
Renderização da Lista Mestra e Histórico de Revisões de documentos.

#### `JS_Riscos.html`
Renderização da Matriz de Risco (grid 5×5), lista de riscos, planos 5W2H e controle de entregas.
