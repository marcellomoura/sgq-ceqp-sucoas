# 06 — Frontend (Client-side)

## Visão Geral

O frontend é uma SPA (Single Page Application) em HTML/CSS/JS puro, sem framework. Todo o código JS é dividido em arquivos `.html` injetados no shell principal via `include()`.

---

## Estado Global (`state`)

Declarado em `JS_Utilitarios.html`, o objeto `state` é a fonte única de verdade no cliente:

```javascript
let state = {
  tasks: [],        // Cartões Kanban
  members: [],      // Membros da comissão
  units: [],        // Unidades/subcomissões
  docs: [],         // Documentos
  risks: [],        // Riscos
  plans: [],        // Planos de ação
  deliveries: []    // Entregas
};
```

Após cada operação de escrita, apenas o subconjunto afetado é recarregado do servidor.

---

## Navegação SPA

```javascript
mudarTab(tab, botao)
```

Controla a visibilidade das sections:
1. Esconde todas as `<section id="view-*">`
2. Remove classe `ativo` de todos os botões da sidebar
3. Exibe a section `view-{tab}` e ativa o botão correspondente
4. Aciona `garantirRestoData()` se necessário (módulos além do Kanban)
5. Invoca funções de renderização específicas do módulo

---

## Sistema de Lazy Loading

```javascript
let restoDataCarregado = false;
let restoDataCarregando = false;
let restoDataCallbacks = [];

function garantirRestoData(callback) {
  if (restoDataCarregado) {
    callback();
    return;
  }
  restoDataCallbacks.push(callback);
  if (!restoDataCarregando) {
    restoDataCarregando = true;
    google.script.run
      .withSuccessHandler(function(data) {
        // preenche state.units, docs, risks, plans, deliveries
        restoDataCarregado = true;
        restoDataCarregando = false;
        restoDataCallbacks.forEach(cb => cb());
        restoDataCallbacks = [];
      })
      .getRestoData();
  }
}
```

---

## Delegação de Eventos

Todos os cliques são capturados em um único listener no `document`, roteados pelo atributo `data-acao`:

```javascript
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-acao]');
  if (!btn) return;
  const acao = btn.dataset.acao;
  switch(acao) {
    case 'abrir-modal-tarefa': /* ... */ break;
    case 'salvar-tarefa':      /* ... */ break;
    // ...
  }
});
```

Isso evita rebinding de eventos após re-renders.

---

## Estrutura de Views (HTML)

Definidas em `Index.html` como `<section id="view-*">`:

| ID da Section | Tab | Conteúdo |
|---|---|---|
| `view-kanban` | Kanban | Quadro com 5 colunas drag-and-drop |
| `view-members` | Membros | Lista de membros em cards |
| `view-dashboard` | Dashboard | KPIs + 4 gráficos Chart.js |
| `view-archived` | Arquivados | Tabela de cartões arquivados |
| `view-unidades` | Unidades | Lista de unidades com CRUD |
| `view-docs` | Lista Mestra | Tabela de documentos com filtros |
| `view-docs-revisoes` | Hist. Revisões | Histórico de versões de documentos |
| `view-matriz` | Matriz de Risco | Grid 5×5 visual + lista de riscos |
| `view-planos` | Plano de Ação | Lista de planos 5W2H |
| `view-entregas` | Controle Entregas | Tabela de entregas por unidade |
| `view-logs` | Log Auditoria | Tabela de log de alterações |

---

## Sidebar de Navegação

Estrutura com grupos colapsáveis:

```
[≡] SGQ

▼ Gestão de Tarefas
   • Quadro Kanban
   • Membros
   • Dashboard
   • Arquivados

▼ Unidades
   • Unidades / Subcomissões

▼ Gestão Documental
   • Lista Mestra
   • Histórico de Revisões

▼ Gestão de Riscos
   • Matriz de Risco
   • Plano de Ação
   • Controle de Entregas

▼ Auditoria
   • Log de Alterações
```

---

## Módulo Kanban (`JS_Kanban.html`)

### `renderTasks()`
Renderiza os cartões nas 5 colunas. Filtra tarefas não arquivadas. Aplica lógica de cor por prioridade.

**Colunas:**
```
Backlog | A Fazer | Em Andamento | Em Revisão | Concluído
```

Cada coluna tem um contador de cartões e suporta drag-and-drop via atributos `draggable="true"` e listeners `dragstart`/`dragover`/`drop`.

### `renderDashboard()`
Renderiza 4 KPIs e 4 gráficos Chart.js:

| KPI | Descrição |
|---|---|
| Total de Tarefas | Contagem total (excluindo arquivadas) |
| Em Andamento | Tarefas com status `Em Andamento` |
| Concluídas | Tarefas com status `Concluído` |
| Atrasadas | Tarefas com prazo vencido e não concluídas |

| Gráfico | Tipo | Dados |
|---|---|---|
| Status das Tarefas | Doughnut | Distribuição por status |
| Prioridade | Bar | Distribuição por prioridade |
| Progresso Mensal | Line | Criações vs conclusões por mês |
| Membros | Bar horizontal | Tarefas por membro responsável |

Também exibe tabela "Próximas Entregas" (tarefas com prazo nos próximos 7 dias).

### Modal de Tarefa
Layout split estilo Trello:
- **Coluna esquerda:** título (editável inline), descrição, atividades/comentários
- **Coluna direita:** sidebar com status, prioridade, responsáveis, datas

Responsáveis: multi-seleção via dropdown customizado (checkboxes).

Atividades: campo de texto com botão "Adicionar Comentário", serializado como JSON na coluna `Atividades`.

---

## Módulo Documentos (`JS_Documentos.html`)

### Lista Mestra
Tabela filtrada com:
- Busca por texto (título, código)
- Filtro por tipo
- Filtro por status
- Filtro por unidade

Cada linha mostra badge de status com cor:
- Verde: Vigente
- Amarelo: Próximo da Revisão
- Vermelho: Vencido / Em Elaboração
- Cinza: Obsoleto

Ações disponíveis: Editar metadados, Publicar nova revisão, Excluir.

### Histórico de Revisões
Exibe todas as versões de todos os documentos em ordem cronológica, incluindo versões obsoletas.

---

## Módulo Riscos (`JS_Riscos.html`)

### Matriz de Risco
Grid visual 5×5 (Probabilidade × Impacto). Cada célula exibe os riscos naquele quadrante.

Cores por nível:
- Verde (Baixo): P×I = 1–4
- Amarelo (Médio): P×I = 5–9
- Laranja (Alto): P×I = 10–14
- Vermelho (Crítico): P×I = 15–25

### Plano de Ação (5W2H)
Lista de planos com colunas do framework 5W2H:
- **O Que** (What), **Por Que** (Why), **Quem** (Who), **Onde** (Where), **Quando** (When), **Como** (How), **Quanto Custa** (How Much)

Badge de status com cores. Acesso ao histórico de versões via modal.

### Controle de Entregas
Tabela agrupada por risco. Exibe:
- Status de cada unidade (Pendente / Entregue)
- Tipo de evidência, número SEI, data de entrega
- Observações

---

## PDF Generation (`JS_Utilitarios.html`)

### `gerarPdfLocal(tipo)`
Gera PDF no cliente usando `html2pdf.js`. Antes de converter:
1. Oculta a sidebar
2. Força `overflow: visible` nos containers
3. Converte todos os `<canvas>` (Chart.js) para `<img>` via `canvas.toDataURL('image/png')`
4. Aplica configuração de página e resolução
5. Restaura o DOM após geração

### `dispararEnvioPdf()`
1. Chama `gerarPdfLocal()` para obter o blob
2. Converte para Base64
3. Chama `enviarPdfPorEmail()` no servidor via `google.script.run`

**Relatórios disponíveis:**

| Chave | Elemento fonte | Arquivo gerado | Orientação |
|---|---|---|---|
| `dashboard` | `#view-dashboard` | `Dashboard_Tarefas_SGQ.pdf` | Paisagem |
| `archived` | `#view-archived` | `Cartoes_Arquivados_SGQ.pdf` | Retrato |
| `matriz` | `#area-matriz` | `Matriz_Risco_SGQ.pdf` | Paisagem |
| `acomp` | `#area-acomp` | `Acompanhamento_Acoes_SGQ.pdf` | Paisagem |

---

## Modais

Todos definidos em `Index.html`. Abertos/fechados via classes CSS (sem biblioteca de modal).

| Modal ID | Propósito |
|---|---|
| `modal-task` | Detalhe/edição de cartão Kanban |
| `modal-member` | Formulário de membro |
| `modal-unidade` | Edição de unidade |
| `modal-doc-novo` | Novo documento |
| `modal-doc-editar` | Editar documento |
| `modal-doc-revisao` | Nova versão de documento |
| `modal-risco-novo` | Mapear risco |
| `modal-risco-editar` | Editar risco |
| `modal-risco-revisao` | Revisão de risco (com P×I novo + justificativa) |
| `modal-plano-novo` | Novo plano 5W2H |
| `modal-plano-editar` | Editar/arquivar plano |
| `modal-plano-revisao` | Arquivar plano com justificativa |
| `modal-plano-nova-revisao` | Nova versão do plano (replanejamento) |
| `modal-plano-historico` | Histórico de versões do plano |
| `modal-entrega` | Registrar entrega de unidade |
| `modal-entrega-editar` | Editar registro de entrega |
| `modal-pdf-email` | Enviar PDF por e-mail |
| `modal-confirmar` | Confirmação genérica de exclusão |
| `modal-alerta` | Alerta genérico |
