# Auditoria Técnica e Documentação — Sistema de Gestão da Qualidade (SGQ · CEQP)

> **Documento oficial do projeto.** Auditoria técnica + documentação de engenharia reversa produzida a partir da leitura integral do código-fonte (16 arquivos, ~8.400 linhas). Toda afirmação foi extraída do código; onde há incerteza, está sinalizado explicitamente. Data-base: 2026-07-16.
>
> **Escopo:** 7 arquivos `.js` (backend Apps Script, ~2.478 linhas) + arquivos `.html` (cliente: 1 CSS, 7 módulos JS, e — desde 2026-07-23 — as telas separadas em 8 arquivos `View_*` por módulo; ver §8.8). Originalmente as views/modais viviam num único `Index.html`; o total de linhas de cliente é ~o mesmo (~5.900), só redistribuído.

---

## Sumário

1. [Diagnóstico Executivo](#1-diagnóstico-executivo)
2. [Arquitetura Atual](#2-arquitetura-atual)
3. [Mapa de Dependências](#3-mapa-de-dependências)
4. [Relatório dos Agentes Especialistas](#4-relatório-dos-agentes-especialistas)
5. [Plano de Refatoração](#5-plano-de-refatoração-faseado-seguro-preservando-comportamento)
6. [Análise de Riscos das Alterações](#6-análise-de-riscos-das-alterações)
7. [Checklist Final](#7-checklist-final-estado-atual)
8. [Documentação Técnica (engenharia reversa)](#8-documentação-técnica-engenharia-reversa)
9. [Próximas Melhorias](#9-próximas-melhorias)

---

## 1. Diagnóstico Executivo

O SGQ é um **web app monolítico de página única (SPA)** sobre Google Apps Script (V8) com Google Sheets como banco de dados. A qualidade de engenharia é **acima da média para projetos GAS**: comentários de racional densos e corretos, trava otimista, `LockService` em todas as escritas, carregamento em duas/múltiplas etapas, cache compartilhado de autenticação, e defesa em profundidade (validação cliente + servidor). **Não foram encontrados bugs funcionais críticos comprováveis.** Os problemas concentram-se em **escalabilidade de longo prazo**, **acoplamento de manutenção** e **postura de segurança/implantação**.

### Classificação dos problemas

| # | Problema | Categoria | Severidade |
|---|----------|-----------|------------|
| P1 | `executeAs: USER_ACCESSING` + `access: ANYONE`: membros precisam de acesso direto à planilha; a autorização `isMembro_` é contornável abrindo o Sheet | Segurança/Arquitetura | **Alto** — *Decisão 2026-07-16: ACEITO/MITIGADO (ver §5, Fase 1).* Migração para `USER_DEPLOYING` é **inviável** porque os membros logam com conta pessoal (@gmail), e `Session.getActiveUser().getEmail()` retorna vazio sob "executar como o dono" para contas fora do domínio. Mantém-se `USER_ACCESSING`; mitigar controlando o compartilhamento da planilha. |
| P2 | Leitura de abas inteiras (`getDataRange().getValues()`) + varredura linear em **toda** operação; `getKanbanData`/`_contarComentariosPorTarefa_` relidos a cada ação de cartão | Performance/Escalabilidade | **Alto** — ⚙️ *Parcial (Fase 2.3, 2026-07-16): contagem de comentários agora vem de cache invalidado na escrita — a aba `Atividades` (ilimitada) deixou de ser relida a cada mover/arquivar/editar. Leituras de `Tarefas`/`Membros` seguem por chamada (dados que mudam a cada ação).* |
| P3 | Abas `Logs` e `Atividades` crescem **indefinidamente** sem rotação (teto de 10M células/planilha) | Escalabilidade | **Alto** — ⚙️ *Endereçado (Fase 2.1, 2026-07-16): `Logs` ganhou arquivamento manual (`arquivarLogsAntigos_`) + diagnóstico (`diagnosticoAbas_`). `Atividades` não tem rotação por idade (atrelada ao ciclo do cartão) — mitigada por 2.2 (limpeza ao excluir cartão) + 2.3 (contagem cacheada). `buscarLogs` já era janelado (últimas 2.000).* |
| P4 | Dependência de CDNs externos, `chart.js` **sem versão fixada** (risco de quebra por major + supply chain) | Segurança/Estabilidade | **Médio** |
| P5 | `deleteRow` em laço (`_excluirAtividadesDaTarefa_`, `excluirDocumento`, `excluirPlano`) — O(n) chamadas de API dentro do lock | Performance | **Médio** — ✅ *Resolvido 2026-07-16 (Fase 2.2): helper `_deleteRowsBatch_` agrupa em blocos contíguos via `deleteRows`.* |
| P6 | Regra de negócio **duplicada** cliente/servidor (nível de risco, `_statusPlano`, plano global) | Manutenção/DRY | **Médio** |
| P7 | Acoplamento por **índice de array** (`data-idx`) entre render e handlers — frágil, já causou bug histórico | Robustez | **Médio** — ⏸️ *Aceito/não urgente (2026-07-16). Hoje mitigado (cada render calcula o índice original com cuidado; não é bug ativo). Migração para `data-id` descartada: benefício preventivo, `Planos` não têm id atômico (chave composta risco+"O Que"), e a validação manual cobriria toda a app.* |
| P8 | `Código.js` mistura responsabilidades (config + utils + auth + acesso a dados + PDF + endpoints) | Arquitetura/SoC | **Médio** — ❌ *Descartado por decisão (2026-07-16): manter arquivo único.* |
| P9 | Ausência total de **testes automatizados**, mesmo para lógica pura testável | Qualidade | **Médio** — ⚙️ *Endereçado (Fase 5.2, 2026-07-16): `runTests_()` cobre a lógica pura (nível de risco, próxima revisão, status de plano/capacitação, arquivamento, sanitização, colIdx, links). 40 asserções. Rodar pelo editor.* |
| P10 | Sanitização de HTML por **regex** (reconhecidamente não é parser) | Segurança | **Baixo** |
| P11 | Código morto: `histJson` em `renderRiscosArquivados`; `state.afastamentos` fora da inicialização de `state` | Clean Code | **Baixo** — ✅ *Resolvido: `histJson` removido e `afastamentos: []` já consta na inicialização de `state`. O endpoint latente `excluirUnidade`/`contarReferenciasUnidade_` (sem chamador de UI) também foi removido em 2026-07-22.* |
| P12 | `gerarPdfDeHtml` (download) **sem** rate limit (só o envio por e-mail tem) | Performance | **Baixo** — ✅ *Resolvido (Fase 5.3, 2026-07-16): helper `_limitePdfExcedido_` compartilhado; download com janela curta (3s) e chave própria, sem bloquear downloads sequenciais legítimos.* |

---

## 2. Arquitetura Atual

### 2.1 Visão geral e objetivo
Sistema de gestão da qualidade da **Comissão Especial de Qualidade e Padronização (CEQP · SUCOAS · SES/DF)**. Consolida seis domínios num único quadro: **Pessoas** (membros, escala semanal, afastamentos), **Tarefas** (Kanban), **Capacitações**, **Unidades/Subcomissões**, **Documentos** (lista mestra + revisões), **Riscos** (matriz 5×5, planos 5W2H, entregas) e **Monitoramento** (indicadores + trilha de auditoria).

### 2.2 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENTE (navegador) — SPA renderizada via HtmlService        │
│  Index.html  ← shell: head/CDNs, sidebar (menu), includes    │
│  View_*.html ← telas+modais por módulo (8 arq., ver §8.8)    │
│  CSS.html    ← design system (tokens :root, sem framework)   │
│  JS_Utilitarios.html ← núcleo: state, navegação, delegação   │
│  JS_Kanban / JS_Riscos / JS_Pessoas / JS_Documentos /        │
│  JS_Unidades / JS_Capacitacoes  ← controladores por domínio  │
└───────────────▲───────────────────────────────┬─────────────┘
                │ google.script.run (assíncrono) │
┌───────────────┴───────────────────────────────▼─────────────┐
│ SERVIDOR (Apps Script V8)                                    │
│  Código.js  ← doGet, config, utils, AUTH, acesso a dados,    │
│               endpoints de leitura, PDF, logs                 │
│  Modulo_Kanban / _Pessoas / _Unidades / _Documentos /        │
│  _Riscos / _Capacitacoes  ← serviços de escrita por domínio  │
└───────────────────────────────┬─────────────────────────────┘
                                 │ SpreadsheetApp / Cache /
                                 │ Properties / Lock / Mail
┌────────────────────────────────▼────────────────────────────┐
│ DADOS — Google Sheet (11 abas) + ScriptProperties + Cache    │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Fluxo de execução (inicialização)

1. `doGet()` → `isMembro_()` (bloqueia não-membros com "Acesso Negado") → renderiza `Index` template, que faz `include_()` de CSS, das 8 `View_*` (telas+modais por módulo) e dos 7 JS. O servidor concatena tudo num único HTML antes de enviar ao navegador — a separação em arquivos não muda o DOM final nem adiciona round-trips (ver §8.8).
2. `DOMContentLoaded` (JS_Utilitarios): abre o grupo Tarefas e ativa o Kanban **imediatamente** (UI aparece sem esperar dados).
3. **Duas chamadas paralelas** ao servidor:
   - `getKanbanData()` → Tarefas + Membros (etapa 1). No sucesso: `renderTasks()`, re-renderiza a aba ativa se necessário, e agenda (`setTimeout 400ms`) o pré-carregamento do "resto".
   - `getAfastamentos()` → aba Afastamentos (paralela, não encadeada).
4. `garantirRestoData()` (background) → `getRestoData()` traz Unidades, Documentos, Riscos, Planos, Entregas, Capacitações numa carga só.
5. Cada aba do SGQ, ao ser visitada, dispara sua rotina em `mudarTab()`; se depender do "resto", passa por `garantirRestoData` (fila de callbacks, dispara uma busca única).

### 2.4 Padrões de carregamento (bem projetados)
- **Caminhos leves pós-escrita:** cada módulo recarrega só o que precisa — `recarregarKanban` (Tarefas+Membros), `getDocsData` (Unidades+Docs), `getUnitsData`, `getRiscosData`, `getCapacitacoesData` — evitando reler as 7 abas.
- **Cargas sob demanda com fila:** `garantirRestoData` e `garantirArquivados` usam o padrão `loaded/loading/filaCallbacks` para coalescer chamadas concorrentes.
- **Atualização otimista:** inativar/reativar membro/unidade, mover cartão, excluir doc — a UI muda na hora e reverte só em falha.

---

## 3. Mapa de Dependências

### 3.1 Endpoints servidor ← chamadas do cliente (`google.script.run`)

| Endpoint servidor | Arquivo | Chamado por (cliente) |
|---|---|---|
| `doGet` | Código.js | (GET inicial) |
| `getKanbanData` | Código.js | DOMContentLoaded, `recarregarKanban` |
| `getAfastamentos` | Modulo_Pessoas | DOMContentLoaded |
| `getRestoData` | Código.js | `garantirRestoData` |
| `getTarefasArquivadas` | Código.js | `garantirArquivados` |
| `getDocsData` | Código.js | `recarregarDocs` |
| `getUnitsData` | Código.js | `recarregarUnidades` |
| `getRiscosData` | Código.js | `recarregarRiscosPlanos` |
| `getCapacitacoesData` | Código.js | `recarregarCapacitacoes` |
| `getAtividadesTarefa` | Código.js | `abrirEditarTarefa` |
| `buscarLogs` | Código.js | `carregarLogs` |
| `saveTask`/`updateTaskStatus`/`deleteTask`/`arquivarTarefaManual`/`restaurarTarefaArquivada` | Modulo_Kanban | `salvarTarefa`/`drop`/`confirmarExcluirTarefa`/`confirmarArquivarTarefa`/`restaurarTarefa` |
| `saveMember`/`inativarMembro`/`reativarMembro` | Modulo_Kanban | `salvarMembro`/`inativarMembro`/`reativarMembro` |
| `salvarEscala`/`salvarAfastamento` | Modulo_Pessoas | `confirmarEscala`/`confirmarFerias` |
| `salvarUnidade`/`atualizarUnidade`/`inativarUnidade`/`reativarUnidade` | Modulo_Unidades | `confirmarUnidade`/… |
| `salvarDocumento`/`atualizarDocumento`/`salvarRevisaoDocumento`/`excluirDocumento` | Modulo_Documentos | `salvarDocumento`/`confirmarEdicaoDoc`/`publicarRevisaoDoc`/`excluirDoc` |
| `salvarRisco`/`atualizarRisco`/`reavaliarRisco`/`excluirRisco`/`restaurarRisco` | Modulo_Riscos | módulo Riscos |
| `salvarPlano`/`atualizarPlano`/`excluirPlano`/`revisarPlano`/`salvarEntregasEmLote` | Modulo_Riscos | módulo Riscos |
| `salvarCapacitacao`/`atualizarCapacitacao`/`excluirCapacitacao` | Modulo_Capacitacoes | `salvarFormCapacitacao`/`excluirCapacitacaoConfirm` |
| `gerarPdfDeHtml`/`enviarPdfDeHtml` | Código.js | `_gerarPdfReal`/`_dispararEnvioPdfReal` |

### 3.2 Dependências internas do servidor (quem depende de quem)

- **Núcleo compartilhado (Código.js):** `colIdx_`, `comBloqueio`, `conectarAba`, `safeGetSheet(Data)`, `isMembro_`, `membrosParaAuth_` (+ cache), `getNextId_`, `registrarLog`, `formatarDataParaUI`, `_dataLocalISO_`, `linkPermitido_`, `calcularNivelRisco`, `calcularProximaRevisao` — **usados por todos os módulos.**
- **`isMembro_` → `membrosParaAuth_` → `conectarAba(SHEET_MEMBERS)`** roda no início de **praticamente toda** chamada (mitigado por `ScriptCache` de 6h, invalidado em escrita de membro).
- **Cadeia de setup/migração (crítica de ordem):** `setupDatabaseKanban` → `_migrarEremoverColunaAtividades_` → `_reordenarColunasTarefas_` → `conectarAba`. **Tem de rodar antes de qualquer leitura de Tarefas** (senão `colIdx_` cai na coluna errada). Idempotente via `ScriptProperties` + re-checagem dentro do lock.
- **Acoplamento cruzado por dados:** `reavaliarRisco` marca `Revisao_Pendente` nos planos; `salvarEntregasEmLote` → `_reavaliarBaixa` lê Unidades.

### 3.3 Estado do cliente
`var state = { tasks, archivedTasks, members, units, docs, risks, plans, deliveries, history, trainings, afastamentos }` — fonte única no cliente. (P11 resolvido: `afastamentos: []` já consta na inicialização de `state`.)

### 3.4 Funções órfãs / código morto
- Nenhum item aberto (revisado em 2026-07-22): `histJson` foi removido e o endpoint latente `excluirUnidade`/`contarReferenciasUnidade_` (sem chamador de UI) foi removido.
- Comentário final em Modulo_Riscos.js: nota sobre função de PDF que "não é mais necessária aqui" — ruído inofensivo.
- Não há funções GS expostas sem chamador (todos os endpoints são invocados pelo cliente).

### 3.5 Índice de tags de auditoria (rastreabilidade nos comentários)
Alguns comentários do código carregam tags curtas de auditorias anteriores. O prefixo indica a série de auditoria de origem; abaixo, o que cada tag ainda presente no código significa (índice criado em 2026-07-22):

| Tag | Onde | O que a mudança fez |
|-----|------|---------------------|
| `A03` | `JS_Utilitarios.html` — handler do botão `btn-confirmar-excluir` | Proteção imediata contra clique duplo: desabilita o botão já no 1º clique. |
| `A13` | `JS_Utilitarios.html` — `inicializarSidebarRetratil`/modais | Acessibilidade: injeta ARIA roles nos modais e configura o Focus Trap. |
| `C04` | `Código.js` — `enviarPdfDeHtml` | Restringe o envio de PDF exclusivamente a e-mails de membros cadastrados. |
| `H03` | `Código.js` — `enviarPdfDeHtml` → `registrarLog` | Protege o `registrarLog` do envio de PDF com `comBloqueio`, evitando colisão com escrita concorrente na aba Logs. |

> `B17` (declaração global de `logsCache`) foi removida em 2026-07-22 na migração da paginação de logs — a tag não existe mais no código.

---

## 4. Relatório dos Agentes Especialistas

### 4.1 Agente de Arquitetura
- **Pontos fortes:** separação clara UI (Index/CSS) × controlador (JS_*) × serviço (Modulo_*) × acesso a dados (helpers `_ler*_`); fonte única de layout (`CABECALHOS_*` + `colIdx_`) elimina índices mágicos; endpoints leves por domínio.
- **Problemas:** `Código.js` é um "god file" (config + utils + auth + data-access + PDF + logs + endpoints) → **viola SoC/SRP** (P8). Lógica de negócio duplicada cliente/servidor (P6). Sugestão: extrair `Auth.gs`, `DataAccess.gs` (os `_ler*_`), `Pdf.gs`, `Config.gs`.

### 4.2 Agente de Performance
- **Custo dominante = round-trips ao Sheets.** `getKanbanData` lê Tarefas inteira + `_contarComentariosPorTarefa_` lê Atividades inteira **a cada ação de cartão** (P2). Toda escrita faz `getDataRange().getValues()` + scan linear O(n).
- **Complexidade já corrigida em vários pontos** (índices `Map` substituíram O(n²) em `_lerRiscosPlanosEntregas_`, `renderMatriz`, `renderDocumentos`) — excelente.
- **Gargalos remanescentes:** `deleteRow` em laço (P5); `buscarLogs` lê 2.000 linhas e ordena em memória a cada chamada; crescimento ilimitado de Logs/Atividades (P3).
- **Bom uso de:** `CacheService` (auth, setup, rate-limit), `PropertiesService` (contadores, flags de migração), `LockService` (serialização), `SpreadsheetApp.flush()`, escrita em lote (`setValues`).

### 4.3 Agente Google Sheets
- Uso predominante de `getValues/setValues` em lote (correto). `appendRow` usado pontualmente (aceitável). `getSheetByName` encapsulado em `safeGetSheet` com normalização de acento/maiúscula + auto-rename logado.
- **Redução possível:** cachear cabeçalhos/`colIdx_` já é barato (constantes); o ganho real está em não reler abas inteiras por operação (ver P2/P5).

### 4.4 Agente Front-end
- **Pontos fortes:** delegação de eventos centralizada (um listener de `click`/`change`/`input`), dragstart delegado por coluna (sobrevive à recriação de cartões), render por `innerHTML` por coluna (não por cartão), foco/ESC/Tab trap em modais, ARIA em modais.
- **Problemas:** acoplamento por `data-idx` (P7); mistura de `onclick=` inline (Riscos) com delegação `data-acao` (inconsistência de padrão); estilos inline extensos no HTML (dificultam manutenção/tematização).

### 4.5 Agente Segurança
- **Positivos:** `isMembro_` em todos os endpoints; escrita restrita a membros; envio de PDF só para membros + rate-limit; `linkPermitido_` (http/https) no servidor; `esc()` amplo no cliente; `rel="noopener noreferrer"`; validação servidor espelhando cliente (defense-in-depth).
- **Riscos:** **P1** (modelo de execução expõe a planilha aos membros e o endpoint a ANYONE); **P10** (sanitização por regex); IDs de configuração versionados em `.clasp.json` — baixo risco pois scriptId não é segredo, mas convém não versionar IDs de planilha/URLs sensíveis.

### 4.6 Agente de Qualidade (Clean Code)
- **Positivos:** nomes claros e consistentes; comentários explicam o *porquê*, não o *quê*; funções em geral coesas.
- **Problemas:** funções longas com alta complexidade ciclomática — `renderTasks` (JS_Kanban), `renderFerias` (JS_Pessoas), `renderAcompanhamento`/`abrirModalAcompEntregas` (JS_Riscos), `saveTask` (Modulo_Kanban); código morto (P11); referências a auditorias antigas nos comentários (`A03`, `A13`, `C04`, `H03`) — rastreabilidade útil, agora indexadas em §3.5.

---

## 5. Plano de Refatoração (faseado, seguro, preservando comportamento)

**Fase 1 — Correções críticas / segurança (baixo risco)**
1. Revisar modelo de implantação (P1) — **DECIDIDO (2026-07-16): manter `USER_ACCESSING`.** A migração para `USER_DEPLOYING` foi descartada: como os membros logam com conta **pessoal** (@gmail), `Session.getActiveUser().getEmail()` retornaria vazio sob "executar como o dono" e bloquearia todos. A autenticação permanece inalterada. O furo (membro editar a planilha crua) é tradeoff inerente e deve ser mitigado por controle de compartilhamento da planilha, não por código.
2. Fixar versões dos CDNs (P4): `chart.js@4.x.x`, e idealmente adotar Subresource Integrity (SRI) ou auto-hospedar os assets como `.html` servidos por `HtmlService`.
3. Remover código morto (P11) — **✅ FEITO:** `histJson` removido, `afastamentos: []` na inicialização de `state`, e endpoint latente `excluirUnidade`/`contarReferenciasUnidade_` removido (2026-07-22).

**Fase 2 — Performance / escalabilidade**
4. Rotação de `Logs` e `Atividades` (P3) — **✅ FEITO (Fase 2.1, 2026-07-16).** Duas funções admin em `Código.js` (nome com `_` final → não chamáveis pelo cliente; rodam pelo editor como o dono): `diagnosticoAbas_()` (relatório de células por aba × teto de 10M, só leitura) e `arquivarLogsAntigos_(mesesRetencao=12)` (move Logs antigos para `Logs_Arquivo`; **sempre preserva as últimas 2.000 linhas** — a janela que a UI exibe — então nunca reduz a tela; copia+flush antes de remover, remove em lote via `_deleteRowsBatch_`, nunca apaga sem salvar). `Atividades` **não** é rotacionada: está atrelada ao ciclo de vida do cartão (ativo/arquivado precisa do histórico) e já é limpa ao excluir o cartão (2.2) + contagem cacheada (2.3).
5. Substituir `deleteRow` em laço por operações em lote (P5) — **✅ FEITO (Fase 2.2, 2026-07-16).** Criado o helper compartilhado `_deleteRowsBatch_` (Código.js), que agrupa as linhas-alvo em blocos contíguos e usa `deleteRows(início, quantidade)` por bloco. Aplicado em `_excluirAtividadesDaTarefa_`, `excluirDocumento` e `excluirPlano`. Optou-se por `deleteRows` em vez de reescrever a aba com `setValues` para não pagar custo O(N) numa aba grande (ex.: `Atividades`) nem abrir janela de perda de dados. Exclusões de linha única (`excluirCapacitacao`, `deleteTask`) seguem com `deleteRow`.
6. Cache da contagem de comentários, invalidado em escrita (P2) — **✅ FEITO (Fase 2.3, 2026-07-16).** Novo `CACHE_KEY_COMENTARIOS` + `invalidarCacheComentarios_` (Código.js). `_contarComentariosPorTarefa_` virou cache-aware (lê o mapa do `ScriptCache`, calcula no miss, grava com guarda de 90KB). Invalidação **só** quando a contagem muda: `_registrarAtividades_` (apenas se houver item `comment`) e `_excluirAtividadesDaTarefa_`. Mover/editar cartão (itens `log`) não invalidam → deixam de reler a aba `Atividades`. Mesmo padrão de `membros_auth`. **Não** cacheado: payload do quadro (limite de 100KB) nem `Tarefas` (precisa vir fresco). Cache de Membros avaliado e descartado (aba pequena/limitada, ganho marginal, invalidação extra em `salvarEscala` fácil de esquecer).

**Fase 3 — Arquitetura**
7. Fatiar `Código.js` em `Config.gs`, `Auth.gs`, `DataAccess.gs`, `Pdf.gs`, `Logs.gs` (P8) — **❌ DESCARTADO (2026-07-16) por decisão.** Mantém-se `Código.js` como arquivo único.
8. Centralizar regras duplicadas (P6) num único módulo servidor e expor os valores calculados ao cliente via payload, em vez de recalcular no JS.

**Fase 4 — Clean Code** — **⏭️ PULADA por decisão (2026-07-16).** Fase de menor valor (ganho só de manutenção, sem impacto para o usuário).
9. Extrair sub-funções de render longas; padronizar tudo em `data-acao` (eliminar `onclick=` inline). — *Não feito. A parte de `data-acao` está entrelaçada com o 5.1 (o `onclick` inline existe para fugir da ambiguidade do `data-idx`); será tratada junto com o 5.1, em base `data-id`.*
10. Mover estilos inline recorrentes para classes no CSS. — **✅ FEITO (2026-07-22, commit 5eb4dff):** linhas de lista migradas para classes em CSS.html (Logs, Capacitações, Unidades, Documentos, Membros, Pessoas — completas; Kanban Arquivados e Matriz de Riscos só o CONTAINER, por causa da clonagem em PDF; `renderAcompanhamento`/`renderRiscosArquivados` fora de propósito — usam `clone.innerHTML`). Cores com token exato viram `var(--...)` (prepara o futuro modo noturno); partes dinâmicas seguem inline.

**Fase 5 — Escalabilidade / robustez futura**
11. Introduzir testes (ver §9) — **✅ FEITO (Fase 5.2, 2026-07-16).** `runTests_()` em `Código.js` (admin, roda pelo editor): harness próprio (sem dependência externa) com 40 asserções sobre a lógica pura. Expectativas auto-verificadas em Node antes de escrever. Não altera lógica de produção.
12. Substituir acoplamento por índice (`data-idx`) por `data-id` + lookup por id (P7) — **⏸️ NÃO FEITO / aceito (2026-07-16)** para o `data-idx` da UI em geral (custo de validação manual em toda a app supera o benefício preventivo, sem bug ativo). **Reaberto e corrigido parcialmente em 2026-07-23 para Planos especificamente — ver §8.12: um bug ativo real foi encontrado** (editar/revisar um plano podia gravar por cima do plano ERRADO quando duas linhas do mesmo risco tinham o mesmo texto em "O Que") e a causa era exatamente a premissa aqui aceita ("Planos não têm id atômico"). Corrigido com a introdução de `ID_Plano`.
13. Mover cartões arquivados para uma aba própria `Tarefas_Arquivo` (**registrado 2026-07-22 como possibilidade futura; NÃO implementado**). **Problema (risco R-01):** hoje os cartões arquivados ficam na MESMA aba `Tarefas`, apenas marcados (`Arquivado='Sim'` ou `Concluído` há mais de `DIAS_PARA_ARQUIVAR` dias). `getKanbanData` faz `getDataRange().getValues()` na aba INTEIRA **a cada ação de cartão** (arrastar/salvar/abrir) e só descarta os arquivados na memória (`_tarefaArquivada_`) — então a leitura no caminho quente cresce sem limite com o histórico de concluídos, mesmo o quadro exibindo poucos ativos. **Proposta:** espelhar o padrão já validado de `Logs`/`Logs_Arquivo` — arquivar (manual e por data) passa a **MOVER** a linha para `Tarefas_Arquivo`; `getKanbanData` lê só a `Tarefas` (agora só ativos → leitura pequena e limitada); `getTarefasArquivadas` lê a `Tarefas_Arquivo` sob demanda; restaurar move de volta. **Seguro** porque os cartões são endereçados por ID (`TAR-n`), não por posição de linha. **Ponto de atenção:** o arquivamento por DATA hoje é *virtual* (calculado na leitura, sem gravação) — precisaria de uma rotina de manutenção (gatilho diário, no espírito de `arquivarLogsAntigos_`) que move os qualificados, mantendo o filtro `_tarefaArquivada_` no `getKanbanData` como **rede de segurança** (correção não depende do timing do move). Os gráficos históricos do Kanban continuam lendo ativos + arquivo (muda só a origem no servidor). **Ganho:** caminho quente fica MAIS leve (não mais lento); sem crescimento de células (linhas realocadas, não duplicadas). **Esforço:** médio e contido; **risco:** baixo-médio (migração inicial única dos arquivados atuais + conferir os gráficos).

---

## 6. Análise de Riscos das Alterações

| Alteração | Risco | Mitigação |
|---|---|---|
| Trocar `executeAs` | `getActiveUser().getEmail()` pode vir vazio para usuários fora do domínio → todos bloqueados | Testar em conta de membro real antes; manter deploy antigo como rollback |
| Fixar/auto-hospedar CDNs | Diferença de comportamento entre versões do Chart.js | Fixar exatamente a major/minor já em uso; validar cada gráfico |
| Rotacionar Logs/Atividades | Perda de histórico se a migração falhar no meio | Espelhar o padrão já existente: idempotência via `ScriptProperties`, re-checagem no lock, nunca apagar antes de confirmar a cópia |
| Refatorar `deleteRow` | Reconstrução de aba pode perder dados se interrompida | Usar `setValues` sobre as mesmas células (nunca `clearContents` + escrita), como já faz `_reordenarColunasTarefas_` |
| Fatiar `Código.js` | Ordem de carregamento GS / referências quebradas | GS concatena todos os arquivos no mesmo escopo global — mover funções não muda resolução; validar com deploy de teste |
| Aba `Tarefas_Arquivo` (item 5.13) | Migração inicial dos arquivados atuais pode falhar no meio; gráficos históricos deixarem de somar o arquivo | Espelhar `arquivarLogsAntigos_` (idempotência via `ScriptProperties`, copiar+flush antes de apagar, lote via `_deleteRowsBatch_`); manter `_tarefaArquivada_` como rede de segurança no `getKanbanData`; conferir `renderGraficosKanban` lendo ativos + arquivo |

---

## 7. Checklist Final (estado atual)

- Nenhuma funcionalidade removida ou modificada (auditoria read-only).
- Todas as 11 abas mapeadas e referenciadas por constantes `SHEET_*`/`CABECALHOS_*`.
- Todos os endpoints `google.script.run` têm chamador identificado.
- Todas as integrações Google (Sheets, Cache, Properties, Lock, Mail, Utilities, HtmlService, Session) catalogadas.
- Nenhum trigger (`onOpen`/`onEdit`/`ScriptApp`/time-driven) existe — confirmado por busca; o auto-arquivamento é **calculado em memória na leitura** (`_tarefaArquivada_`), não por gatilho.
- Nenhum menu personalizado — é web app puro (`doGet`).
- ⚠️ Dependências externas (CDNs) funcionam mas não são fixadas por versão.

---

## 8. Documentação Técnica (engenharia reversa)

### 8.1 Estrutura de arquivos e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `appsscript.json` | Manifesto: timezone `America/Sao_Paulo`, V8, Stackdriver, web app `executeAs: USER_ACCESSING`, `access: ANYONE`. Sem `oauthScopes` explícitos (inferidos pelo uso). |
| `.clasp.json` | Config do clasp (deploy CLI). `scriptId` versionado; extensões `.js/.gs/.html/.json`. |
| `Código.js` | Config global, `doGet`/`include_`, utils compartilhados, **autenticação** (`isMembro_`, `membrosParaAuth_`), setup/migrações, endpoints de **leitura**, Atividades, Logs, **geração/envio de PDF**. |
| `Modulo_Kanban.js` | Escritas de Tarefas (Kanban) e Membros. |
| `Modulo_Pessoas.js` | Escala semanal e Afastamentos (leitura + escrita). |
| `Modulo_Unidades.js` | CRUD de Unidades + integridade referencial. |
| `Modulo_Documentos.js` | Documentos: cadastro, edição, revisão (versionamento), exclusão. |
| `Modulo_Riscos.js` | Riscos, Planos 5W2H, Entregas, reavaliação, revisão de plano. |
| `Modulo_Capacitacoes.js` | CRUD de Capacitações. |
| `Modulo_VisitasTecnicas.js` | CRUD de Visitas Técnicas (ver §8.9). |
| `Index.html` | **Shell da SPA** (desde 2026-07-23, ver §8.8): `<head>` + CDNs, a sidebar/menu único, e a lista de `include_()`. As telas (15 `view-*`) e os 19+1 modais foram movidos para os `View_*`. |
| `View_Kanban.html` | Telas Kanban e Arquivados + `modal-task`. |
| `View_Pessoas.html` | Telas Membros, Escala e Afastamentos + modais `modal-member`/`modal-escala`/`modal-ferias`. |
| `View_Unidades.html` | Tela Unidades + `modal-unidade`. |
| `View_Documentos.html` | Telas Lista Mestra e Histórico de Revisões + modais `modal-doc-novo`/`modal-doc-editar`/`modal-doc-revisao`. |
| `View_Riscos.html` | Telas Matriz, Plano de Ação e Riscos Arquivados + 7 modais (risco-novo/editar, plano-novo/editar, reavaliar-risco, revisar-plano, acomp-entregas). |
| `View_Capacitacoes.html` | Tela Capacitações + `modal-capacitacao`. |
| `View_VisitasTecnicas.html` | Tela Visitas Técnicas + `modal-visita` (ver §8.9). |
| `View_Monitoramento.html` | Telas Painel de Indicadores e Registros (logs). |
| `View_Comum.html` | Modais genéricos compartilhados: `modal-pdf-email`, `modal-confirmar`, `modal-alerta`. |
| `CSS.html` | Design system: tokens `:root` (cor primária `#030712` + acento azul `#2b7fff` — ver §8.7), sem framework; `@media` (768/900px), `@keyframes`, estilos de impressão (`.no-print`, `.pdf-header`). |
| `JS_Utilitarios.html` | Núcleo do cliente: `state`, navegação (`mudarTab`), delegação de eventos, `garantirRestoData`, helpers (`esc`, `badge`, `linkA`, `showConfirm`), geração de PDF (montagem HTML), logs. |
| `JS_Kanban.html` | Membros, quadro Kanban, arquivados, modal de tarefa, gráficos do Kanban, `recarregarKanban/RiscosPlanos`. |
| `JS_Riscos.html` | Matriz, planos, entregas, reavaliação, arquivados de risco, PDFs. |
| `JS_Pessoas.html` | Escala semanal e afastamentos (render + modais). |
| `JS_Documentos.html` | Lista mestra, histórico de revisões, modais de documento. |
| `JS_Unidades.html` | Render e CRUD de unidades. |
| `JS_Capacitacoes.html` | Render, KPIs, gráficos e CRUD de capacitações; carregamento sob demanda (`garantirCapacitacoesData`, desde 2026-07-23, ver §8.9). |
| `JS_VisitasTecnicas.html` | Render, KPIs e CRUD de visitas técnicas; carregamento sob demanda (`garantirVisitasData`, ver §8.9). |

### 8.2 Modelo de dados (12 abas)

| Aba (`SHEET_*`) | Colunas (`CABECALHOS_*`) | Chave/observações |
|---|---|---|
| `Tarefas` | ID_Tarefas, Status, Titulo, Descricao, ID_Membro (JSON de ids), Prioridade, Data_Criacao, Data_Inicio, Prazo, Data_Conclusao, Etiquetas (JSON), Arquivado, Ultima_Atualizacao (ms) | ID `TAR-n`. "Ultima_Atualizacao" = trava otimista. Coluna legada "Atividades" migrada e removida. |
| `Membros` | ID_Membro, Nome, Cargo, Email_Funcional, Email_Pessoal, Dias_Semana, Dia_Presencial, Ativo | ID `MEM-n`. Email(s) = login. Inativação preserva histórico. |
| `Unidades` | ID_Unidade, Nome_Da_Unidade, Sigla, Email_Funcional, Link_Do_Drive, Ativo | ID `UN-n`. Sigla única. Link do Drive aceita texto livre. |
| `Documentos` | Codigo, Versao, Tipo, Titulo, Data_Aprovacao, Proxima_Revisao, Status, Responsavel(ID_Unidade), Link_Principal, Doc_Auxiliar_1/2, Revisao | Código `SIGLATIPO-SIGLAUND-NN`. Revisão = nova linha + antiga vira "Obsoleto". |
| `Riscos` | ID_Risco, Versao, Macroetapa, Risco, Causa, Consequencia, Categoria, Probabilidade, Impacto, Nivel, Tipo_Tratamento, Responsavel(ID_Unidade), Status, Justificativa, Data_Avaliacao | ID `Rn`. **1 linha por VERSÃO do risco** (adicionado 2026-07-24 — ver §8.13): toda reavaliação cria uma linha nova com o mesmo `ID_Risco` e `Versao` incrementada; a linha de maior `Versao` é o estado atual. `Status` (Ativo/Arquivado) descreve o risco inteiro — arquivar aplica a TODAS as linhas do `ID_Risco` de uma vez. Sem `Historico` (JSON) — o histórico é o próprio conjunto de linhas. |
| `Planos_Acao` | ID_Plano, ID_Risco, O_Que, Por_Que, Quem(ID_Unidade), Onde, Data_Prevista, Data_Finalizacao, Como, Quanto_Custa, Status, Revisao_Pendente, Justificativa, Data_Avaliacao | ID próprio `PLA-n` (adicionado 2026-07-23 — ver §8.12). Vincula a Risco (`Rn`) por `ID_Risco`. `Quem` aceita também "Todas as Subcomissões" (`.includes('TODAS')`, `_planoEhGlobal_`). **Linha nova só quando a estratégia muda de verdade** (2026-07-24 — ver §8.13): "Substituir" fecha a linha atual (`Status='Substituído'`) e cria uma linha com `ID_Plano` novo; "Manter" não cria linha — só atualiza `Justificativa`/`Data_Avaliacao`/`Revisao_Pendente` na própria linha, já que nada do 5W2H muda. Sem `Historico`/`Entregas` (JSON) — entregas viraram a aba `Entregas_Planos`. |
| `Entregas_Planos` | ID_Plano, Unidade, Status, Data, Processo_SEI | Sem ID próprio — chave composta `(ID_Plano, Unidade)`, única por construção (upsert). Sob demanda (`conectarAba`), fora do setup eager, mesmo padrão de `Capacitacoes`/`Visitas_Tecnicas`. Adicionada 2026-07-24 — ver §8.13. |
| `Afastamentos` | ID_Afastamento, Ano, ID_Membro, Membro_Nome, Ferias_1/2/3, Abonos, Abono_Aniversario, Licenca_Servidor_Premio (JSON), Demais_Afastamentos (JSON) | ID `AF-n`. Uma linha por (Membro+Ano). |
| `Capacitacoes` | ID_Capacitacoes, Titulo_Da_Capacitacao, Tema, Publico_Alvo, Modalidade, Data_Prevista, Data_Realizada, Status, Lista_De_Presenca, Responsaveis(ID_Membro) (JSON de ids) | ID `CAP-n`. Status derivado das datas. **Não entra mais no setup automático** desde 2026-07-23 (ver §8.9) — sob demanda, igual `Visitas_Tecnicas`. |
| `Visitas_Tecnicas` | ID_Visitas_Tecnicas, Objetivo_Da_Visita, Local_Visitado, Data_Da_Visita, Status, Responsaveis(ID_Membro) (JSON de ids), Relatorio_Anexo | ID `VT-n`. Status derivado só de Data_Da_Visita (sem "prevista", ver §8.9). **Não entra no setup automático** (`setupDatabaseResto`) — criada por `conectarAba` na 1ª leitura/gravação sob demanda. |
| `Atividades` | ID_Tarefas, Tipo (comment/log), Texto, Data, Autor | Append-only, uma linha por item (substitui blob JSON que estourava 50k chars). |
| `Logs` | Data_Hora, Usuario, Acao, Referencia, Detalhes | Trilha de auditoria append-only. |

> Observação: 13 abas de dados no total. `Capacitacoes`, `Visitas_Tecnicas` e `Entregas_Planos` são criadas sob demanda, fora do setup automático `setupDatabaseResto` (ver §8.9 e §8.13); as demais são provisionadas eager.

### 8.3 Regras de negócio identificadas
- **Autenticação/autorização:** membro = e-mail (funcional ou pessoal) presente e ativo na aba Membros. Não-membros são bloqueados em `doGet` e em cada endpoint.
- **Nível de risco:** `P×I` → ≥15 Crítico, ≥10 Alto, ≥5 Médio, senão Baixo (`calcularNivelRisco`, espelhado em `atualizarLegendaRisco`).
- **Próxima revisão de documento:** data de aprovação + 1 ano (`calcularProximaRevisao`). Status calculado: sem data de aprovação → "Em Elaboração"; ≤60 dias → "Próximo da Revisão"; vencido → "Vencido".
- **Auto-arquivamento de tarefa:** concluída há ≥15 dias (`DIAS_PARA_ARQUIVAR`) e coluna Arquivado em branco → arquivada (só em memória). `Arquivado='Não'` (restauração manual) impede re-arquivamento.
- **Status de plano:** finalizado → "Concluído"; previsto no passado → "Atrasado"; senão "Em Andamento" (`_statusPlano`).
- **Baixa automática de plano:** plano "global" (contém "TODAS") conclui quando todas as subcomissões entregam; plano específico conclui quando há ≥1 entrega "Sim" (`_reavaliarBaixa`). Status "Concluído" não reabre.
- **Reavaliação de risco** marca `Revisao_Pendente=Sim` nos planos vinculados.
- **Integridade referencial:** unidade não pode ser excluída enquanto houver Documentos/Riscos/Planos apontando para ela.
- **Trava otimista:** `saveTask` (via "Ultima_Atualizacao") e edições de documento/unidade/capacitação (via conferência de código/sigla/id) rejeitam gravações sobre listas desatualizadas.

### 8.4 Integrações e serviços Google usados
`SpreadsheetApp`, `HtmlService` (template + include), `CacheService` (Script + User), `PropertiesService` (Script), `LockService` (Script), `MailApp` (envio de PDF), `Utilities` (formatDate, newBlob, base64, getAs PDF, sleep), `Session` (email/timezone). **Externas (CDN):** Google Fonts (Inter), `drag-drop-touch`, `chart.js` + `chartjs-plugin-datalabels`, `html2canvas`.

### 8.5 Configuração para implantação
- Projeto Apps Script **vinculado à planilha** (usa `getActiveSpreadsheet`); deploy via `clasp` (scriptId em `.clasp.json`).
- Deploy como **Web App**: `executeAs: USER_ACCESSING`, `access: ANYONE` (ver P1).
- Primeira execução cria/migra abas automaticamente (`setupDatabaseKanban`/`Resto`, idempotentes, cache 6h).
- Escopos OAuth necessários (inferidos): Spreadsheets, envio de e-mail (MailApp), userinfo.email. Não há `oauthScopes` explícitos no manifesto — recomenda-se declará-los.

### 8.6 Limitações conhecidas / pontos críticos
- Cotas Apps Script: tempo de execução (~6 min), cota diária de e-mail (mitigada por rate-limit), 10M células/planilha (ver P3).
- `sanitizarHtml_` não é parser (P10) — aceitável porque o destino é PDF estático.
- Crescimento de payload/latência com volume (P2/P3).
- Sem testes automatizados (P9).

### 8.7 Reformulação de identidade visual (2026-07-16)

Aplicação de um novo design system a todo o cliente (`CSS.html`, `Index.html`, `JS_Kanban.html`, `JS_Riscos.html`, `JS_Capacitacoes.html`, `JS_Pessoas.html`, `JS_Unidades.html`, `JS_Documentos.html`, `JS_Utilitarios.html`), por engenharia reversa de um template de referência (dashboard shell público em light mode) — cor, tipografia, raio, sombra e espaçamento; comportamento e arquitetura preservados integralmente (troca puramente visual, ver §6 sobre risco zero em regra de negócio).

**Decisão de marca:** substituição completa do índigo (`#6c5dd3`) — não uma adaptação parcial. Cor primária virou tinta preta (`#030712`), com azul (`#2b7fff`) como acento secundário (links de referência, gráficos, categorização "info").

**Tokens principais** (`:root` em `CSS.html`):
| Token | Valor | Observação |
|---|---|---|
| `--primary` | `#030712` | Estado ativo do menu, botões primários, foco |
| `--accent` | `#2b7fff` | Acento azul — não é a cor de ação principal |
| `--success` / `--warning` / `--danger` | `#0f766e` / `#b45309` / `#dc2626` (⚠️ **desatualizado** — recalibrados numa sessão posterior para a escada "Menta/Dourado/Tijolo"; valores atuais em `:root`: `#2CA98F`/`#C99A2E`/`#D8483A`, ver §8.19) | Os tons "500" originalmente escolhidos (`#14b8a6`/`#f59e0b`/`#ef4444`) falhavam WCAG AA (contraste 2.1–3.8:1) como texto ou texto branco sobre preenchimento |
| `--purple` | `#8b5cf6` | 5ª cor categórica (KPIs/gráficos), não faz parte da paleta do template de referência |
| Raios | 6/8/12/16/20px + pill | Cards em 16px, botões/inputs em 12px |
| Sombra | quase nula (`--shadow-xs: none`) | Elevação por borda + tonalidade, não por `box-shadow` — cards estáticos não têm sombra; hover de elementos arrastáveis (Kanban) mantém uma sombra sutil como affordance |

**Sidebar:** de grafite escuro (`#24252f`) para claro (`#fafafa`); item ativo = pill preto sólido com texto branco; títulos de grupo sem opacidade (cor sólida `var(--primary)`, igual aberto/fechado — não há mais distinção visual de estado); logo circular preto com "SGQ".

**Cards de KPI** (`.kpi-card`, `.tl-kpi-card`): fundo tintado por categoria via seletor CSS `:has()` (`.kpi-card:has(.icon-blue) { background: var(--info-bg) }`, etc. — dispensa classe extra no HTML), layout horizontal compacto (ícone circular + número + label), número sempre em cor neutra (nunca colorido, por legibilidade sobre fundo tintado).

**Gráficos Chart.js** (Kanban + Capacitações, Painel de Indicadores): barras em formato de pílula (`borderRadius: 20`, sem borda) com apenas a barra de maior valor em cor sólida (demais a 16% de opacidade) — sem rótulo fixo dentro da barra (só tooltip). "Capacitações por Mês" convertido de barra para **linha** com curva suave (`tension: 0.4`) e preenchimento em degradê (`createLinearGradient`, cor para transparente).

**Fora do escopo, deliberadamente:**
- Geração de PDF (`_envelopeHtml`/`_pdfKpiCell`/`_pdfGraficoCel` em `JS_Utilitarios.html`) — paleta própria, documentada no código como intencionalmente independente do `CSS.html` (o conversor de PDF do Apps Script não lida bem com flex/grid do app); nunca usou a marca antiga.
- Formatação de células da planilha Google Sheets (`Código.js`, `setBackground('#f1f5f9')` em cabeçalhos) — superfície diferente (banco de dados), não é UI do app.
- Badge de variação percentual em KPIs/gráficos (ex.: "+18%") e paleta categórica das etiquetas do Kanban (`LABELS_DISPONIVEIS`) — o primeiro exigiria calcular tendência vs. período anterior (dado que o sistema não tem hoje); o segundo é uma paleta multi-hue já madura e não ligada à marca antiga.

### 8.8 Separação das Views por módulo (2026-07-23)

Refatoração **puramente organizacional** (zero mudança funcional): o `Index.html`, antes monolítico (~2.230 linhas com todas as telas e modais), foi reduzido a um **shell** (~275 linhas: `<head>`, CDNs, sidebar/menu único e a lista de `include_()`). As 14 telas (`view-*`) e os 19 modais (`.modal-overlay`) foram distribuídos em **8 arquivos `View_*.html`**, um por módulo, incluídos via `<?!= include_('View_X'); ?>` — o mesmo padrão modular que `JS_*.html` e `Modulo_*.js` já seguiam.

**Motivação:** consistência. Front (JS) e back (GS) já eram modulares por domínio; só as telas ficaram monolíticas. Agora, mexer num módulo é abrir `View_X.html` + `JS_X.html` + `Modulo_X.js`.

**Por que não impacta performance:** o Apps Script concatena todos os `include_()` **no servidor** e entrega um HTML único ao navegador. A troca de aba/abertura de modal roda 100% no cliente (mostrar/esconder seções já carregadas). Mais arquivos = mais algumas leituras de arquivo no servidor no carregamento inicial (milissegundos, uma vez), **não** mais round-trips nem lazy-loading. O DOM final é idêntico ao de antes.

**Por que nenhuma vinculação quebrou:**
- Os `JS_*.html` localizam telas/modais **por ID** (`getElementById`/`abrirModal('modal-x')`), nunca por arquivo ou posição — e nenhum ID mudou.
- O GS não precisou de ajuste: `include_()` já é genérico e `createTemplateFromFile('Index')` continua apontando para o mesmo `Index.html`.
- Modais são `.modal-overlay { position: fixed }` sem seletor CSS de adjacência (`+`/`~`) dependente de ordem, então movê-los para junto de suas telas não altera renderização.

**Garantia de fidelidade (como foi verificado):** os blocos foram extraídos preservando bytes (CRLF), com *guardas* que abortam se um marcador de linha não bater. A prova final foi um **invariante**: o multiset de linhas não-vazias de (`Index.html` + todos os `View_*.html`) é **idêntico** ao `Index.html` original (0 divergências) — nada perdido, alterado ou duplicado; cada uma das 14 views e 19 modais aparece exatamente uma vez. Menu ↔ tela: as 14 abas (`data-tab`) continuam todas ligadas a uma `view-*` existente.

**Como reverter, se necessário (rollback):** o `Index.html` monolítico original está preservado no histórico do git (commit `e86f690`, anterior à refatoração). Para voltar ao estado de arquivo único: `git checkout e86f690 -- Index.html` e apagar os `View_*.html` (removendo antes as linhas `include_('View_*')` — que na verdade voltam junto com o `Index.html` restaurado). Como o back-end nunca foi tocado, o rollback é só de front-end. Alternativamente, mover um bloco de volta para o `Index.html` é seguro desde que os IDs não mudem.

### 8.9 Módulo Visitas Técnicas (2026-07-23)

Novo módulo de domínio, seguindo à risca a mesma estrutura de arquivos de Capacitações: `Modulo_VisitasTecnicas.js` (CRUD) + `View_VisitasTecnicas.html` (tela + modal) + `JS_VisitasTecnicas.html` (render/KPIs/interações). Reaproveita 100% dos utilitários genéricos existentes (`conectarAba`, `colIdx_`, `getNextId_`, `comBloqueio`, `neutralizarFormula_`, `erroInterno_`, `registrarLog`, `isMembro_`, `renderPaginacao`, `iconBtn`, seletor de responsáveis) — nenhuma alteração em autenticação/autorização.

**Modelo de dados** (decisão do usuário, 2026-07-23): entidade visitada é local/instituição externa em texto livre (não vinculado a `Unidades`); sem Data Prevista (só Data da Visita); Status derivado (`Planejada` sem data / `Realizada` com data); campo de Relatório/Anexo (link), no mesmo padrão do "Lista de Presença" de Capacitações.

**Decisão arquitetural: carregamento SOB DEMANDA (única diferença de padrão em relação a Capacitações).** Capacitações, Documentos, Riscos, Planos e Unidades são todos lidos juntos em `getRestoData()`, pré-carregado em segundo plano ~400ms após o Kanban abrir (ver §8.2 e o comentário em `JS_Utilitarios.html` sobre `garantirRestoData`). Visitas Técnicas **não** entra nesse pacote: tem seu próprio endpoint leve (`getVisitasTecnicasData()`, em `Código.js`) e seu próprio mecanismo de carregamento no cliente (`garantirVisitasData()`, em `JS_VisitasTecnicas.html`), espelhando o padrão já usado por "Arquivados" (`garantirArquivados`/`archivedLoaded` em `JS_Kanban.html`) — busca só na 1ª vez que o usuário abre a aba "Visitas Técnicas", com fila de callbacks caso o clique aconteça durante uma busca em andamento.

**Por quê:** era o ponto de atenção do usuário ao pedir o módulo — não pesar a abertura/atualização do sistema a cada novo módulo agregado ao pacote eager. Resultado prático: `getKanbanData()` e `getRestoData()` (e portanto a abertura do app e toda ação de Kanban/Capacitações/Riscos/etc.) permanecem **byte a byte** como eram antes deste módulo existir — zero linhas alteradas nessas funções. O único custo é a própria aba `Visitas_Tecnicas` (criada por `conectarAba` na 1ª leitura), que cresce de forma independente e não é lida por nenhuma outra tela.

**Trade-off aceito:** ao contrário de Capacitações (que já está pronta quando o usuário clica, por já ter sido pré-carregada), a primeira visita à aba "Visitas Técnicas" numa sessão mostra "A carregar..." por um instante — mesma UX que "Arquivados" já tem hoje. Cliques seguintes na mesma sessão são instantâneos (cache em `state.visitas`).

**Integração com o Painel de Indicadores (2026-07-23, mesmo dia):** adicionados 2 gráficos ("Evolução Mensal das Visitas Técnicas" e "Visitas Técnicas por Membro", em `renderGraficosVisitas`, JS_VisitasTecnicas.html) e 2 KPIs ("Visitas Planejadas"/"Visitas Realizadas") ao `#view-indicadores`, seguindo à risca o padrão de `renderGraficosCapacitacoes`. Sem Tema/Modalidade equivalentes (o módulo não tem esses campos), por isso só 2 gráficos em vez de 4. Também estendido ao PDF/e-mail do Painel (`montarHtmlIndicadoresPdf`/`graficosVisitasPdfHtml`), para não ficar inconsistente com a tela.

**Consequência da carga sob demanda para o Painel:** como Visitas Técnicas não vem em `getRestoData()`, a aba "indicadores" (que já dependia de `garantirArquivados()` antes de renderizar) passou a depender também de `garantirVisitasData()` — senão os 2 gráficos novos apareceriam vazios na primeira vez que alguém abrisse o Painel sem antes visitar a aba "Visitas Técnicas". Isso é uma busca isolada da aba `Visitas_Tecnicas`, disparada só ao abrir o Painel — não reintroduz o pacote pesado no carregamento inicial do app.

**Capacitações migrada para o mesmo padrão sob demanda (2026-07-23, mesmo dia, a pedido do usuário):** depois de discutir o trade-off (pacote eager sempre paga o custo da leitura, mesmo se a aba nunca for visitada na sessão; sob demanda só paga se for usada — o critério que decide é a frequência de uso, não "peso" em termos absolutos), decidiu-se tirar Capacitações do `getRestoData()`/`setupDatabaseResto()` e replicar exatamente o mecanismo de Visitas Técnicas:
- `getCapacitacoesData()` (Código.js) passou a criar a aba sozinha via `conectarAba` (antes usava `safeGetSheetData`, que não cria) — mesmo comportamento de `getVisitasTecnicasData()`.
- `garantirCapacitacoesData()` novo, em `JS_Capacitacoes.html`, espelhando `garantirVisitasData()` (mesma fila de callbacks, mesmas flags `capacitacoesLoaded`/`capacitacoesLoading`).
- `'capacitacoes-lista'` saiu de `SGQ_TABS`; ganhou o mesmo gate inline (`msgTabela` + `garantir...Data`) que `'visitas-lista'` já tinha.
- A cadeia de dependências do Painel de Indicadores (nos dois pontos que chamam `renderIndicadores`) passou a ser `garantirArquivados → garantirCapacitacoesData → garantirVisitasData → renderIndicadores`.
- **Importante:** `garantirRestoData()` (JS_Utilitarios.html) parou de fazer `state.trainings = resto.trainings` — como esse campo não existe mais na resposta de `getRestoData()`, deixar essa linha sobrescreveria (com `undefined`) um `state.trainings` já carregado por `garantirCapacitacoesData()`, dependendo da ordem de chegada das duas respostas.

Paginação (client-side, 20 por página) não foi afetada por essa mudança — já era 100% em memória antes e continua sendo; a única coisa que mudou é o momento em que a única busca completa acontece (automática em segundo plano → sob demanda no primeiro clique/abertura do Painel).

### 8.10 Auditoria de atualização "cirúrgica" de linha por módulo (2026-07-23) — DECIDIDO: manter como está

Auditoria read-only pedida pelo usuário para verificar, em todos os módulos, se salvar/excluir um registro atualiza **só a linha afetada na tela** (sem recarregar a tabela inteira), com o servidor devolvendo apenas o registro alterado. Nenhum código foi alterado nesta sessão.

**Achado:** o padrão completo (payload de 1 registro → servidor devolve só esse registro → cliente aplica patch otimista na linha, sem reload) só existe hoje em **Kanban — Tarefas** (`saveTask`/`salvarTarefa`/`confirmarExcluirTarefa`, feito em 2026-07-21 como correção de performance pontual, commits `add6246`/`7a1159e`, ver histórico de decisão em memória de sessão) e nas ações de ativar/inativar (Membros, Unidades) e Escala/Férias (Pessoas), que já são otimistas por padrão.

Nos demais módulos, o registro alterado nunca é reenviado por completo (isso já está correto em 100% dos casos), mas o servidor devolve só `{sucesso, mensagem}` (sem o registro), e o cliente reage recarregando o pacote de dados do módulo e redesenhando a tabela inteira:
- **Documentos, Capacitações, Visitas Técnicas:** fazem um patch otimista da linha e, em seguida, recarregam tudo mesmo assim (trabalho duplicado, sem ganho).
- **Unidades e Membros (criar/editar):** recarregam tudo, sem patch otimista algum.
- **Riscos / Planos 5W2H / Entregas:** recarregam tudo em toda ação (criar, editar, reavaliar, arquivar, restaurar) — nenhum caminho otimista.

Isso é **distinto** do padrão já documentado em §2.4 ("cada módulo recarrega só o pacote de abas relacionado, não as 12 abas inteiras") — aquela otimização evita releitura de abas *sem relação* no servidor; o achado desta auditoria é sobre o **redesenho da tabela inteira na tela** por causa de 1 registro, dentro do próprio módulo.

**Risco de estender o padrão do Kanban aos demais módulos** (avaliado, não implementado):
1. Tela pode mostrar dado momentaneamente desatualizado se dois usuários editam o mesmo registro ao mesmo tempo (mesma aresta já aceita no Kanban) — a trava otimista do servidor (`Ultima_Atualizacao`/conferência de código-sigla-id) continua protegendo o dado em si, o risco é só de UI.
2. Painéis derivados (KPIs/gráficos de Capacitações e Visitas Técnicas) recalculam a partir do cache — fácil esquecer de recalculá-los junto com o patch cirúrgico.
3. Integridade referencial de Unidades (não pode excluir unidade referenciada por Documentos/Riscos) exigiria lógica de desfazer em caso de rejeição do servidor.
4. Riscos é o caso mais arriscado: reavaliação de risco propaga `Revisao_Pendente=Sim` para vários planos vinculados — replicar essa cascata no cliente sem esquecer nenhum caso é o ponto de maior chance de bug silencioso.
5. Sem suíte de testes de UI automatizada (só `runTests_`, 40 asserções de lógica pura) — toda validação seria manual, módulo por módulo.

**DECISÃO (2026-07-23): manter como está.** Usuário optou por não aplicar a extensão do padrão aos demais módulos por ora. Ganho seria de performance percebida (sem "flash" de recarregar a tabela) em módulos de uso menos intenso que o Kanban; custo/risco (sincronização de painéis derivados, cascata de Riscos, ausência de testes automatizados) não foi considerado compensador no momento. Reavaliar se algum desses módulos passar a ter uso concorrente intenso ou reclamação de lentidão.

### 8.11 Documentos — versionamento, classificação e ordenação da Lista Mestra (2026-07-23)

Detalhamento de como a aba `Documentos` (modelo de dados em §8.2) vira as telas "Lista Mestra" e "Histórico de Revisões". Levantamento read-only, nenhum código alterado.

**Versionamento — linhas append-only, nunca sobrescritas.** `Código` (ex. `IT-UND-01`) é gerado uma vez em `salvarDocumento` e nunca muda; `Versão` nasce `1` e só sobe. Publicar uma revisão (`salvarRevisaoDocumento`, `Modulo_Documentos.js`) faz duas gravações: a linha vigente atual tem `Status` trocado para `Obsoleto` (permanece na planilha como histórico) e uma linha **nova** é acrescentada com o mesmo `Código`, `Versão = Math.floor(versaoAtual) + 1`, nova `Data_Aprovacao`/link/motivo e `Status = Vigente`. Um documento com 3 revisões = 3 linhas na aba, mesmo `Código`, só a mais recente `Vigente`. Editar metadados (`atualizarDocumento`) só corrige a linha existente, não cria versão. Excluir (`excluirDocumento`) remove **todas** as linhas daquele `Código` (vigente + obsoletas), não deixa versão órfã.

**Classificação Mestra vs. Histórico — pelo campo `Status`.** `_lerDocumentos_` (Código.js) marca `obsoleto=true` quando `Status` bruto é `"OBSOLETO"`. Na tela, `renderDocumentos(modo)` (JS_Documentos.html) filtra: modo `'mestra'` mostra status `Vigente`/`Vencido`/`Próximo da Revisão`/`Em Elaboração`; modo `'revisoes'` mostra só `Obsoleto`.

**O selo de status é CALCULADO na leitura, não é um valor fixo gravado** (exceto `Obsoleto`, que é setado explicitamente ao revisar). Em `_lerDocumentos_`: sem `Obsoleto` e sem `Data_Aprovacao` → `"Em Elaboração"`; senão compara `Proxima_Revisao` (sempre = `Data_Aprovacao` + 1 ano, via `calcularProximaRevisao`) com a data de hoje — `diff < 0` dias → `"Vencido"`; `diff <= 60` → `"Próximo da Revisão"`; caso contrário mantém `"Vigente"`. Ou seja, o status muda sozinho com o passar do tempo, sem ninguém editar o documento.

**Classificação por `Tipo`** é só rótulo categórico do cadastro (Instrução de Trabalho, Procedimento, Política, etc.), exibido com cor própria via `CORES_TIPO_DOC` (JS_Utilitarios.html) — paleta deliberadamente distinta da usada nos badges de Status, para não confundir as duas colunas. Não afeta em qual lista o documento cai, só filtro (`f-doc-tipo`) e cor do badge.

**Ordenação da lista — fixa, não clicável, 2 chaves, 100% client-side** em `renderDocumentos` (após aplicar filtros, sobre `state.docs` já em memória): 1º por `Responsável` (o **ID da unidade**, não a sigla/nome exibido, comparado em maiúsculas — alfabético A→Z); em caso de empate, 2º por `Código` (`localeCompare`). Não há ordenação por Tipo, Título, Data, Status ou Versão, e o usuário não pode alterar a ordem pela UI.

### 8.12 Riscos/Planos — sessão de correções em cadeia (2026-07-23): ID_Plano, ciclo de revisão e UI de Planos/Arquivados

Sessão longa de bugs reais reportados pelo usuário no fluxo Risco → Reavaliação → Plano de Ação → Revisão. Registrado num só lugar porque as correções são interdependentes (a #2 só existe por causa da #1, a #4 corrige um efeito colateral da #3, etc.). Ordem cronológica abaixo; a subseção **"Como funciona hoje"** no fim resume o comportamento final, sem precisar reconstruir o histórico.

**1) `ID_Plano` — plano errado sendo sobrescrito.** Sintoma: reavaliar um risco → "Revisar Plano → Alterar" (fecha o plano atual como `Substituído`, cria um novo `Em Andamento`) → editar o plano novo → o plano ANTIGO (que devia continuar `Substituído`) voltava a aparecer como `Em Andamento`. Causa: `Planos_Acao` não tinha ID próprio; `atualizarPlano`/`revisarPlano`/`salvarEntregasEmLote` (`Modulo_Riscos.js`) localizavam a linha por `ID_Risco` + **texto** do campo `O_Que`. Quando "Alterar" cria o plano novo reaproveitando a mesma descrição de ação do antigo (comum — normalmente só se ajusta prazo/como/quem), as duas linhas colidem na busca; o servidor para no primeiro match (a linha mais antiga) e grava ali por engano. É exatamente a lacuna do item P7 da auditoria de 2026-07-16 (§5 item 12), na época descartada por "sem bug ativo" — a premissa era falsa.
   - Nova coluna `ID_Plano` (`PLA-n`, mesma convenção `TAR-n`/`MEM-n`/`CAP-n`) como **1ª coluna** de `Planos_Acao` — usuário inseriu manualmente na planilha; `CABECALHOS_PLANOS` (Código.js) atualizado.
   - `salvarPlano` e o ramo "alterar" de `revisarPlano` geram o ID via `getNextId_(aba, 'PLA-')`.
   - `atualizarPlano`/`revisarPlano`/`salvarEntregasEmLote` (perdeu o parâmetro `whatPlano`, agora só `idPlano`) passaram a localizar por `ID_Plano` em vez de `O_Que`. `atualizarPlano`/`revisarPlano` ganharam checagem extra: se o `ID_Risco` da linha não bater com o enviado, recusa "Lista desatualizada" (mesmo padrão de Documentos/Unidades).
   - `_lerRiscosPlanosEntregas_` (Código.js) passou a expor `id` (o `ID_Plano`) em cada plano devolvido ao cliente.
   - Cliente (`JS_Riscos.html`): `dataset.idPlano` substitui `dataset.whatAntigo` em editar/revisar plano.
   - Sem migração de dados — `Planos_Acao` estava vazia em produção no momento da correção; nenhum script de backfill foi necessário.

**2) Título do modal de edição de plano.** "Atualizar Plano de Ação (5W2H)" → **"Editar Plano de Ação (5W2H)"** (`View_Riscos.html`, modal `modal-plano-editar`) — só texto, sem mudança de comportamento.

**3) Campo "Data Finalização" removido do formulário de novo plano dentro de "Revisão Pendente do Plano".** O bloco "Novo Plano de Ação (5W2H)" da ação "Substituir Plano" (`modal-revisar-plano` → `#revp-alterar-campos`) tinha um campo "Data Finalização" que não existe no formulário de criação normal de plano (`modal-plano-novo`) — inconsistente, já que a data de finalização é sempre preenchida automaticamente pelo acompanhamento de entregas (`_reavaliarBaixa`), nunca digitada à mão. Campo `revp-fin` removido da tela e do JS; `dados.whenFinalizado` no envio ao servidor passou a ser sempre `''`, igual ao padrão já usado em `salvarPlano`.

**4) Botão "Editar Risco" ficava oculto para sempre assim que o risco tinha qualquer plano.** `renderMatriz` escondia o botão com a condição `temPlanos` (qualquer plano vinculado, sem checar status/pendência) — forçando o usuário a usar "Reavaliar" (que sempre ACRESCENTA uma entrada ao histórico) até para corrigir um erro de digitação na reavaliação recém-feita, empilhando reavaliações espúrias. Trocado por `temPlanoResolvido` = existe algum plano **ativo** (não `Cancelado`/`Substituído`) do risco com `Revisao_Pendente !== 'Sim'`. Agora o botão reaparece enquanto a revisão está pendente de decisão, e volta a ficar oculto assim que o plano é processado. Seguro porque `atualizarRisco` já sobrescrevia a ÚLTIMA entrada do histórico quando existe histórico — nessa janela é sempre a entrada ainda pendente, nunca uma reavaliação antiga já processada.

**5) Reavaliar risco reabria o alerta "Revisar Plano" em planos já `Substituído`/`Cancelado`.** Bug confirmado com print: reavaliar o risco pela 3ª vez fez o alerta reaparecer no 1º plano da lista, já `Substituído` desde a 1ª revisão. Causa: `reavaliarRisco` marcava `Revisao_Pendente='Sim'` em TODOS os planos com aquele `ID_Risco`, sem checar `Status`. Corrigido em 2 camadas: servidor (`reavaliarRisco`, `Modulo_Riscos.js`) só marca pendente planos com `Status` fora de uma lista de terminais; cliente (`renderAcompanhamento`) só mostra o ícone/realce quando `revisaoPendente==='Sim'` e o status não é terminal (defesa extra, cobre dado antigo já viciado).

**6) Correção de rota: "Concluído" NÃO é terminal para fins de revisão.** A correção #5, na 1ª versão, também bloqueava planos `Concluído` de virarem pendentes — errado, corrigido a pedido do usuário: "Concluído" só significa que as entregas foram feitas; se o risco for reavaliado depois, o tratamento concluído ainda pode precisar ser revisto (continua adequado? precisa de plano novo?). A lista de terminais (`STATUS_TERMINAIS` no servidor, `ehTerminal` no cliente) ficou só com `['Cancelado','Substituído']` — os únicos estados onde a decisão sobre aquela linha já foi tomada de forma definitiva.

**7) Botão "Ver Histórico de Reavaliações" na tela de Arquivados.** Um risco Superado/Arquivado não tinha nenhuma forma de consultar seu histórico de reavaliações (só quem ainda estava Ativo, via o botão "Reavaliar"). Adicionado: modal novo `modal-historico-risco` (somente leitura, mesma tabela — Data/Prob/Impacto/Nível/Tratamento/Responsável/Justificativa — do modal de Reavaliar, sem os campos editáveis), função `abrirHistoricoRisco(id)` (`JS_Riscos.html`) e botão de ícone (relógio) ao lado de "Restaurar" em `renderRiscosArquivados`. Registrado na delegação de eventos (`JS_Utilitarios.html`, chave `hist-risco`).

**8) Planos `Substituído` ficavam com o texto riscado (tachado) igual a `Cancelado`.** A pedido do usuário: um plano `Substituído` não é a mesma coisa que um `Cancelado` — foi conscientemente trocado por uma nova estratégia (o histórico da decisão continua íntegro), enquanto `Cancelado` é abandono. Separado o estilo: `Cancelado` mantém `text-decoration: line-through` + opacidade reduzida; `Substituído` passou a ter só a opacidade reduzida, sem risco no texto. Corrigido nas duas telas que desenham planos (`renderAcompanhamento` e `renderRiscosArquivados`, `JS_Riscos.html`). O ícone de "Acompanhamento/Entregas" continua disponível em planos `Substituído` (tentativa anterior de escondê-lo foi revertida a pedido do usuário — não era isso que fora pedido).

**9) Cadastro inicial do risco não aparecia no Histórico de Reavaliações.** Bug confirmado: `salvarRisco` gravava `Historico` como `'[]'` — só reavaliações posteriores (via `reavaliarRisco`) entravam no array. Um risco reavaliado 1 vez mostrava só essa 1 reavaliação na tabela de histórico, sem nunca revelar os valores originais do cadastro. Corrigido: `salvarRisco` agora grava o `Historico` já com **1 entrada inicial** ("Cadastro inicial do risco", com a data/prob/impacto/nível/tratamento/responsável do cadastro). Efeito colateral tratado: a seta de tendência (⬆️/⬇️/➖) na Matriz (`renderMatriz`) antes disparava com `hist.length > 0`, o que agora mostraria "➖ manteve" em todo risco recém-criado sem nunca ter sido reavaliado de verdade — passou a exigir `hist.length > 1` (pelo menos uma reavaliação real além do cadastro) para desenhar a seta. **Bug relacionado encontrado e corrigido junto:** como a nova regra faz `atualizarRisco` sempre cair no ramo "já tem histórico" (grava só no JSON) mesmo para o 1º registro, e a Matriz lê Tratamento/Responsável **direto da coluna-base** (não do histórico, ao contrário de Prob./Impacto/Nível) — `atualizarRisco` não escrevia essas 2 colunas nesse ramo, então editar um risco com histórico deixava a Matriz mostrando Tratamento/Responsável desatualizados. `atualizarRisco` passou a escrever `Tipo_Tratamento`/`Responsavel` na coluna-base também nesse ramo, mesmo padrão que `reavaliarRisco` já usa. **Sem retroatividade:** riscos já cadastrados antes desta correção continuam com o `Historico` que já tinham (não é possível reconstruir com segurança a data/valores do cadastro original deles).

**Não corrigido** (fora do escopo desta sessão, registrado também em §8.10): módulo Riscos continua sem trava otimista em `salvarRisco`/`atualizarRisco`/`reavaliarRisco`; um risco cujo único plano foi `Cancelado` (não `Substituído`) ainda fica sem caminho na UI para receber um plano novo.

**10) RESOLVIDO (ver §8.16) — gravação intermitente: "às vezes salva, às vezes não".** Reportado pelo usuário reavaliando um risco: `Salvo!` aparecia, a mudança aparecia no painel na hora, mas ao atualizar a página (F5) a informação sumia e também não estava na planilha — de forma intermitente, sem padrão fixo, sem nenhum erro visível na tela. Hipóteses levantadas e status:
- Deploy desatualizado (código editado aqui não chega ao app publicado sem `clasp push`/`clasp deploy`) — descartada como causa única; ver §8.16.
- Linha `ID_Risco` duplicada na planilha (duas linhas "R4", escrita e leitura pegando linhas diferentes) — descartada. **Nota 2026-07-24 (§8.13):** múltiplas linhas por `ID_Risco` agora são esperadas e corretas (row-per-versão), não indício de corrupção.
- `comBloqueio` (Código.js, único `LockService` do sistema) soltando o lock sem `SpreadsheetApp.flush()` antes — **confirmada como causa raiz estrutural** após auditoria completa de todos os módulos (§8.16) e corrigida.

### 8.13 Riscos e Planos_Acao — migração de Historico/Entregas (JSON em célula) para linha-por-versão (2026-07-24)

Motivação: `Historico` (Riscos e Planos) e `Entregas` (Planos) guardavam JSON serializado numa única célula, mutado a cada gravação. Problemas de manter esse modelo, identificados em auditoria: perda silenciosa de histórico se o JSON corrompesse (`catch` vazio caindo pra array vazio, próxima gravação apaga tudo), limite de 50.000 caracteres por célula, opacidade pra quem abre a planilha direto (sem filtro/ordenação nativos), e Probabilidade/Impacto/Nível da linha-base de Riscos ficando congelados no cadastro original por design (a tela sempre lia o histórico, nunca a linha-base).

**Riscos — 1 linha por VERSÃO do risco**, mesmo padrão que `Documentos` já usa (`salvarRevisaoDocumento`): toda reavaliação (`reavaliarRisco`) vira `appendRow` com o mesmo `ID_Risco` e `Versao` incrementada, nunca reescreve a linha anterior. `CABECALHOS_RISCOS` ganhou `Versao` (logo após `ID_Risco`) e `Justificativa`/`Data_Avaliacao` no lugar de `Historico`. `Status` (Ativo/Arquivado) continua descrevendo o risco inteiro — `_definirStatusRisco_` (arquivar/restaurar) já varria todas as linhas com aquele `ID_Risco` sem `break` (escrito por outro motivo, mas já servia pra isso). Escritas em linha específica (`atualizarRisco`, correção da versão atual; `reavaliarRisco`, leitura da linha base pra copiar campos que não mudam) passaram a localizar por `idRow` (número da linha, carregado pelo cliente) com trava otimista — não mais por `ID_Risco` com `break` no primeiro match, que agora acertaria a linha mais ANTIGA por engano (mesmo bug do item 1 de §8.12, mesma causa raiz: buscar por chave que deixou de ser 1:1). `_lerRiscosPlanosEntregas_` (Código.js) agrupa as linhas por `ID_Risco`; a de maior `Versao` é o estado atual (nunca filtra por `Status` antes — um risco arquivado tem TODAS as linhas arquivadas).

**Planos_Acao — linha nova só quando a estratégia muda de verdade.** Desenho passou por 2 rodadas na mesma sessão. 1ª tentativa: espelhar Riscos e fazer TODA revisão (Manter ou Alterar) criar linha nova com `ID_Plano` novo, copiando os campos que não mudam em "Manter". Gerou um bug real: a linha nova de "Manter" precisava ter o `Status` recalculado do zero, e esse recálculo não considerava as entregas recém-copiadas pro `ID_Plano` novo — um plano que já tinha entregas suficientes pra baixa automática (`_reavaliarBaixa`) aparecia como `Em Andamento` depois de um "Manter", em vez de manter `Concluído`. **Correção (mesmo dia):** "Manter" deixou de criar linha — como nada do 5W2H muda, só atualiza `Justificativa`/`Data_Avaliacao`/`Revisao_Pendente` na própria linha (`revisarPlano`). Isso elimina o bug na raiz (Status nunca é recalculado, porque nada que o afeta muda) e também elimina a necessidade de copiar `Entregas_Planos` pra um `ID_Plano` novo (o `ID_Plano` não muda) e a coluna `Acao` (só "Alterar"/cadastro criam linha, então o motivo já é implícito). Só "Alterar" continua fechando a linha atual (`Status='Substituído'`, `Data_Finalizacao=hoje`) e criando uma linha com `ID_Plano` novo e dados do formulário. `CABECALHOS_PLANOS` ganhou `Justificativa`/`Data_Avaliacao` no lugar de `Historico`/`Entregas` (14 colunas, sem `Acao`, sem `Versao` — `Status='Substituído'` já marca a linha superada sem ambiguidade, já que só existe 1 linha não-terminal por `ID_Risco` por vez).

**Ação "Cancelar" removida de `revisarPlano`.** Descoberta ao mexer no código: o modal "Revisão Pendente do Plano" (`View_Riscos.html`, `modal-revisar-plano`) só tinha 2 rádios — "Manter" e "Substituir" — nunca mandava `acao:'cancelar'`; o branch `acao==='cancelar'` no servidor era código morto, inalcançável pela aplicação real. Removido sem impacto de comportamento. Isso também fecha, por consequência, a lacuna registrada em §8.12 ("Não corrigido"): um risco cujo único plano fosse `Cancelado` ficava sem caminho na UI pra receber plano novo — como a ação nunca era disparável, não deveria haver dado real preso nesse estado por uso normal do sistema.

**`Entregas` — normalização, não histórico.** Diferente de `Historico`, o JSON de `Entregas` nunca foi um log de eventos — é o status ATUAL por unidade (`salvarEntregasEmLote` já fazia upsert via `Map.set(unidade,...)`). Virou a aba `Entregas_Planos` (`ID_Plano, Unidade, Status, Data, Processo_SEI`), 1 linha por `(ID_Plano, Unidade)`, sem ID próprio (chave composta já é única por construção), criada sob demanda (mesmo padrão de `Capacitacoes`/`Visitas_Tecnicas`, fora do `setupDatabaseResto` eager). Fica vinculada a `ID_Plano` (não a `ID_Risco`) de propósito — um risco acumula vários planos ao longo do tempo, e a entrega precisa ficar presa ao plano específico que a gerou. Com "Manter" não criando mais linha (ver correção acima), o `ID_Plano` nunca muda nesse caso — as entregas continuam vinculadas certas sem precisar copiar nada. Só "Alterar" (estratégia nova) começa com `Entregas_Planos` vazio, de propósito.

**Trava adicionada (mesmo dia, após teste do usuário):** um plano `Em Andamento` continuava com "Editar" (5W2H) liberado mesmo depois de alguma unidade já ter entregue de verdade — risco de descolar o que foi pedido do que já foi registrado como entregue. `atualizarPlano` (servidor) e `renderAcompanhamento` (cliente) passaram a travar a edição assim que existe pelo menos 1 linha em `Entregas_Planos` daquele `ID_Plano` com `Status='Sim'` (marcar "Não" não trava — é só pendência, não compromisso).

### 8.14 Riscos — modal "Reavaliar" exige escolha explícita de ação (2026-07-24)

O modal "Reavaliar Risco" (`View_Riscos.html`) abria com o campo "Ação" já pré-selecionado em "Reavaliar Risco (Alterar Notas)" — os campos de Probabilidade/Impacto/Tratamento/Proprietário ficavam liberados desde a abertura, sem o usuário escolher a ação de propósito. Corrigido:
- `rev-acao` (select) ganhou uma opção placeholder `value=""` (`disabled selected`, "Selecione uma ação"), sem nenhuma opção pré-marcada.
- `abrirModalReavaliar` (`JS_Riscos.html`) não força mais `value = 'reavaliar'` ao abrir o modal.
- `toggleCamposReavaliacao()` passou a esconder os campos de notas também quando `acao === ''` (antes só escondia para `'superado'`).
- Handler de `btn-salvar-reaval` ganhou validação `if (!acao) return showAlerta('Selecione uma ação.')` — sem ela, clicar em "Salvar Reavaliação" sem escolher ação caía no fluxo de "reavaliar" com os valores padrão dos selects (Probabilidade=1/Impacto=1), gravando uma reavaliação sem sentido.

**Correção relacionada, mesmo modal:** o botão "Editar Risco" reaparece quando o risco tem uma reavaliação pendente de decisão, pra permitir corrigir erro de digitação (ver §8.12 item 4) — mas os campos do mapeamento original (Macroetapa/Categoria/Descrição/Causa/Consequência) ficavam liberados nesse caso mesmo já havendo uma reavaliação de verdade registrada, risco de alterar o que foi definido no mapeamento a pretexto de "corrigir" a reavaliação. Corrigido em `abrirEditarRisco` (`JS_Riscos.html`): esses 5 campos ficam `disabled` quando `hist.length > 1` (mais de uma entrada de histórico = já houve reavaliação real, não só o cadastro inicial) — nesse caso só Probabilidade/Impacto/Tratamento/Proprietário continuam editáveis. **Bug corrigido durante essa mudança:** a condição inicial usava `hist.length > 0`, mas `hist[0]` é sempre o próprio cadastro inicial (`salvarRisco` já grava essa entrada) — isso travava os campos já na 1ª edição de um risco recém-mapeado, antes de qualquer reavaliação de verdade ter acontecido. Trocado para `hist.length > 1`.

**Bug corrigido junto:** `planoPorRef` (`Código.js`, texto "Plano de Ação" mostrado na Matriz de Riscos) pegava a PRIMEIRA linha encontrada por `ID_Risco`, não a mais recente — um risco com histórico de "Alterar" podia mostrar a descrição de um plano já substituído. Corrigido pra ignorar linhas terminais (`Substituído`/`Cancelado`) antes de escolher.

**Sem backfill em nenhum dos dois casos** — decisão explícita do usuário: o histórico anterior (JSON antigo) não foi expandido em linhas retroativas; cada risco/plano existente começou do zero na migração (`Versao=1` em Riscos), preservado apenas na cópia de segurança da planilha feita antes da migração. Os dados de `Entregas` (operacionais, não histórico) foram transcritos manualmente pro `Entregas_Planos` antes do deploy, por serem estado atual relevante (não teria sentido perder "quem já entregou").

### 8.15 Riscos/Planos — Refinamentos visuais e lógicos do ciclo de revisão (2026-07-24)

Sessão focada em aprimoramento de UI, geração de relatórios e pequenas correções lógicas no ciclo de vida dos planos de ação.

**1) Melhorias na UI da Lista de Planos de Ação.** 
- Alterado o título da seção de "Histórico de Estratégias (Planos de Ação)" para apenas "Planos de Ação".
- Adicionada a coluna "Finalização" logo após "Prazo Previsto" para exibir a data de conclusão diretamente na lista de planos sem precisar abrir modais.
- Ajustado o prefixo da versão do risco na exibição do plano de "Versão X" para "Risco Y - Versão X", facilitando o rastreamento visual de qual risco o plano pertence.
- Removido o campo "Data de Finalização" do formulário do modal "Editar Plano" (já havia sido removido do "Novo Plano" na sessão anterior), garantindo que a data seja sempre calculada via fluxo de entregas.

**2) Limpeza e Reestruturação CSS dos Planos de Ação.** A tabela (grid) de planos estava com fontes muito pesadas (negrito desnecessário), as caixas de plano muito altas (espaço desperdiçado), e os planos `Substituídos` estavam demasiadamente opacos dificultando a leitura. Reduzida a altura do `plan-card`, padronizado o `font-weight` e ajustada a opacidade para planos inativos para leitura confortável. Corrigida a perda acidental de classes CSS genéricas de listas (`.list-head`, `.list-body`) que havia quebrado o layout de outras páginas (Capacitações, Escala Semanal) durante as limpezas de estilos.

**3) PDF de Acompanhamento (Quebras de linha e Margens).** A barra separadora (`|`) no cabeçalho do risco (Macroetapa | Categoria...) estava encapsulada em um `<div>`, o que forçava quebras de linha na renderização do conversor de PDF do Google Apps Script (que tem suporte limitado a flexbox). Convertido para `<span style="margin: 0 4px;">|</span>` (inline). Adicionadas margens *inline* mais estritas para garantir os espaçamentos na impressão. Adicionada a classe `no-print` ao container de botões de ação para evitar retângulos cinzas na renderização final do PDF.

**4) Espaçamentos da UI (Paddings duplos).** As margens *inline* inseridas para forçar o layout do PDF acabaram somando-se aos `paddings` CSS que já existiam (`.risk-block` e `.plans-container`), gerando um "buraco branco" gigante entre o cabeçalho do risco e os planos de ação na visualização web. Corrigido reduzindo o padding CSS e removendo as margens forçadas excessivas do HTML, equilibrando o layout web com o PDF.

**5) Histórico de reavaliação exibindo "Falso Positivo" de pendência em versões antigas.** O usuário notou que planos atrelados a versões antigas do risco mostravam o ícone amarelo de "Revisão Pendente". Causa: ao reavaliar um risco (criando a Versão 2), a Versão 1 (histórica) continua apontando para o mesmo `ID_Plano` (ex: `PLA-123`). Como o `PLA-123` recebia o status `Revisao_Pendente='Sim'`, a UI renderizava o ícone de alerta em *todas* as versões do risco, confundindo o usuário (dava a impressão de que um plano histórico estava exigindo revisão). Corrigido: em `JS_Riscos.html`, a classe `.needs-review` e o botão `acaoRev` ("Revisar Plano") passaram a exigir `&& isLatest`. Agora, versões históricas de risco renderizam o plano silenciosamente, sem prompt de ação.

**6) Preservação da `Data_Finalizacao` de planos concluídos e correção do bug de sobrescrita ao registrar entrega.** Na sessão anterior, corrigiu-se um bug na ação "Alterar" do modal "Revisar Plano": `revisarPlano` incondicionalmente sobrescrevia a `Data_Finalizacao` com a data da revisão. Corrigido em `Modulo_Riscos.js`: a data antiga passou a ser preservada se já existisse. Contudo, um **novo bug correlato foi identificado (2026-07-24):** ao registrar uma entrega (baixa automática do plano), o sistema (`_reavaliarBaixa`) ignorava a "Data da Entrega" que o usuário digitou no formulário e gravava a data atual (`hoje`) como a `Data_Finalizacao` do plano. Assim, se o usuário fizesse a entrega e em seguida "substituísse" o plano, ele via a data da substituição na tela e achava (erroneamente) que o `revisarPlano` estava sobrescrevendo a data da entrega. **Correção:** `_reavaliarBaixa` foi alterado para buscar a maior (mais recente) data informada nas entregas (`e.data`) que deram causa à conclusão do plano; usando `hoje` apenas como fallback caso nenhuma data tenha sido informada.

**Como funciona hoje (resumo pós-correções) — ciclo de vida de um plano de ação:**
> **Atualizado em 2026-07-24 (§8.13):** o ciclo de revisão mudou de "Manter/Cancelar/Alterar" pra "Manter/Alterar" (Cancelar removido — já era inalcançável pela UI). "Alterar" continua fechando a linha atual e criando uma linha nova com `ID_Plano` novo; "Manter" NÃO cria linha — só atualiza `Justificativa`/`Data_Avaliacao`/`Revisao_Pendente` na própria linha. Ver §8.13 pro comportamento atual; os pontos abaixo descrevem o estado ANTES dessa mudança, mantidos por registro histórico.
- **Status possíveis:** `Em Andamento`, `Atrasado` (calculados por `_statusPlano`, nunca digitados), `Concluído` (via entregas completas, `_reavaliarBaixa`), `Cancelado` e `Substituído` (só via "Revisar Plano").
- **`Revisao_Pendente`** vira `'Sim'` sempre que o risco vinculado é reavaliado (`reavaliarRisco`) — **exceto** se o plano já está `Cancelado` ou `Substituído` (decisão definitiva, não reabre). Um plano `Concluído` PODE voltar a ficar pendente.
- Plano pendente mostra o ícone ⚠️ "Revisar Plano" em `renderAcompanhamento`; ação escolhida em `revisarPlano`: **Manter** (zera a pendência, mesma linha), **Cancelar** (`Status='Cancelado'`, zera pendência) ou **Alterar** (fecha a linha atual como `Substituído` e cria uma linha nova com `ID_Plano` novo).
- Enquanto o plano ativo do risco está com revisão pendente (ou o risco ainda não tem nenhum plano ativo), o botão "Editar Risco" fica disponível na Matriz — depois que a pendência é resolvida, some, e mudanças de Prob./Impacto só pela via formal "Reavaliar".
- Visualmente: `Cancelado` = riscado + esmaecido; `Substituído` = só esmaecido (fica lendo normal, mostra que foi uma decisão consciente, não um abandono); ambos perdem o botão "Editar" (5W2H), mas mantêm "Acompanhamento/Entregas" disponível para consulta.
- Riscos arquivados (`Status='Arquivado'`) têm botão próprio para consultar o histórico completo de reavaliações, já que o botão "Reavaliar" (que também mostra esse histórico) só aparece para riscos Ativos.

### 8.16 Causa raiz confirmada e corrigida — gravação intermitente em `comBloqueio` (2026-07-24)

Retomando o item 10 de §8.12 (EM ABERTO): a pedido do usuário, foi feita uma auditoria completa (somente leitura) de todos os módulos de escrita do sistema — os 7 `Modulo_*.js` e os 8 `JS_*.html` correspondentes — para verificar se o bug "às vezes salva, às vezes não" era exclusivo de Riscos ou um padrão sistêmico.

**Causa raiz confirmada:** `comBloqueio` (`Código.js:108-115`), o único wrapper de `LockService` usado por todo o sistema, liberava o lock (`lock.releaseLock()`) sem chamar `SpreadsheetApp.flush()` antes. Sem o flush, não há garantia de que a escrita feita dentro do lock foi de fato persistida na planilha no momento em que o lock é liberado — uma segunda execução concorrente (por exemplo, a releitura da tela logo após "Salvo!", ou outro usuário salvando ao mesmo tempo) pode ler um estado desatualizado, e a tela reflete esse estado sem nenhum erro.

**Alcance:** dos 7 módulos de escrita, **6 (Riscos, Unidades, Documentos, Pessoas, Capacitações, Visitas Técnicas) compartilhavam exatamente esse padrão vulnerável.** Apenas o **Kanban** escapava, porque cada função de escrita (`Modulo_Kanban.js`) já chamava `SpreadsheetApp.flush()` manualmente antes de retornar — não por proteção do `comBloqueio`, mas por decisão pontual de quem escreveu aquele módulo.

No frontend, a exposição ao bug variava por módulo conforme o padrão de releitura pós-salvamento (sempre uma nova chamada `google.script.run`, ou seja, uma execução separada da que gravou):
- **Documentos e Unidades:** releem o servidor imediatamente após o sucesso — janela de corrida mais estreita.
- **Capacitações e Visitas Técnicas:** combinavam atualização otimista local **com** releitura imediata, que podia sobrescrever silenciosamente o valor otimista com um dado ainda não persistido — reproduzindo exatamente o sintoma relatado.
- **Pessoas:** não relia o servidor após salvar — uma escrita perdida só seria percebida no F5 seguinte.
- **Riscos** e cadastro de Membro (Kanban): esperavam ~1400ms (delay do `feedbackBtn`) antes de reler, o que atenuava mas não eliminava o risco.
- **Kanban (tarefas):** sem exposição — o próprio retorno da escrita já traz o registro atualizado, sem depender de releitura.

Hipótese de múltiplas planilhas (`openById` vs `getActiveSpreadsheet`) foi descartada — nenhuma ocorrência de `openById` no projeto; todos os módulos usam a mesma planilha ativa.

**Correção aplicada:** uma linha em `Código.js:114`, centralizada no wrapper:
```js
try { return operacao(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
```
Cobre os 6 módulos afetados de uma vez, sem alterar nenhum `Modulo_*.js` individualmente — mesmo padrão que o Kanban já usava, generalizado para o ponto único de serialização do sistema.

**Impacto de performance:** afeta somente a ação de salvar/editar/excluir (não leitura/abertura de páginas), acrescentando tipicamente dezenas a poucas centenas de milissegundos por escrita — imperceptível na prática, como já evidenciado pelo Kanban rodando com esse padrão sem relato de lentidão.

### 8.17 Status "Atrasado" de Plano de Ação recalculado na leitura (2026-07-25)

**Bug identificado:** `_statusPlano` (que decide `Em Andamento`/`Atrasado`/`Concluído` comparando `Data_Prevista` com hoje) só era chamado nos momentos de escrita — `salvarPlano`, `atualizarPlano`, `revisarPlano` (ação "Alterar"). A leitura (`_lerRiscosPlanosEntregas_`) só reproduzia o valor já gravado na célula `Status`, sem recalcular. Consequência: um plano `Em Andamento` cujo prazo vencesse **sem que ninguém editasse aquele plano especificamente** ficava mostrando `Em Andamento` indefinidamente — inclusive no KPI "Planos Atrasados" — até alguém tocar nele de novo (editar 5W2H, "Revisar Plano"). Nem a ação "Manter" corrige isso, pois só atualiza `Justificativa`/`Data_Avaliacao`/`Revisao_Pendente` (§8.13), não `Status`.

**Correção aplicada** (`Código.js:982-999`, dentro de `_lerRiscosPlanosEntregas_`): quando o status gravado é `Em Andamento`, a leitura recalcula na hora com `_statusPlano(whenPrevisto, whenFinalizado)` — mesmo padrão de cálculo em memória, sem gravar nada, já usado por `_tarefaArquivada_` no Kanban ([§ítem 6 desta seção, ver comentário em Código.js:702-704]). Estados terminais (`Concluído`, `Cancelado`, `Substituído`) não são recalculados — são decisões definitivas e não devem reabrir sozinhas.

**Trade-off consciente, decidido em conversa com o usuário:** a célula `Status` na planilha **continua** mostrando o valor antigo (`Em Andamento`) até que o plano seja editado de verdade — só a tela do app mostra `Atrasado` corretamente. Quem abrir a planilha `Planos_Acao` diretamente no Google Sheets verá um valor desatualizado. Optou-se por isso porque: (1) gravar exigiria entrar no lock (`comBloqueio`) fora de uma ação de usuário, o mesmo problema discutido para o auto-arquivamento do Kanban; (2) calcular em memória tem custo desprezível (a aba já é lida por completo de qualquer forma; o recálculo é só comparação de data sobre dado já carregado), enquanto gravar teria custo real (lock + escrita + flush). Caso surja necessidade de consultar o status correto fora do app (relatório externo direto da planilha), revisitar essa decisão.

**Auditoria complementar (mesma sessão):** verificado se o mesmo tipo de bug (status gravado só na edição, nunca recalculado no tempo) existe em outros módulos. Resultado: **não existe em nenhum outro módulo**. Documentos já fazia esse recálculo desde sempre (`_lerDocumentos_`, `Código.js:836-857` — `Vigente`/`Vencido`/`Próximo da Revisão`/`Em Elaboração` são todos calculados na leitura; só `Vigente` e `Obsoleto` são de fato gravados, via `salvarDocumento`/`salvarRevisaoDocumento`). Capacitações e Visitas Técnicas não têm conceito de "atrasado" (status só depende de a data já ter ocorrido ou não, nunca compara com hoje). Pessoas/Afastamentos não persiste nenhum status calculado. Unidades não tem campo de prazo/validade. Kanban nunca teve esse bug — o "Atrasado" do cartão é 100% calculado no cliente a cada render (`JS_Kanban.html:131-132`), nunca gravado em nenhuma coluna.

### 8.18 Kanban — implementação: `Atividades_Arquivadas` (IMPLEMENTADO — 2026-07-25)

**Status: IMPLEMENTADO.** O arquivamento agora é estritamente manual (unidirecional) e migra as atividades para `Atividades_Arquivadas`. A pedido do usuário, a funcionalidade "Desarquivar" foi removida (Opção A), mas a alternativa segura de restaurá-la (Opção B) está registrada abaixo para o futuro.

#### Problema original

`getAtividadesTarefa(tarefaId)` (`Código.js:560-580`) lê a aba `Atividades` **inteira** (`getDataRange`, sem cache, sem range restrito) toda vez que um cartão do Kanban é aberto, e filtra em memória as linhas daquele cartão. O custo cresce com o total de linhas da aba — incluindo atividades de cartões já arquivados há anos, que ninguém vai mais consultar mas que continuam pesando em toda abertura de qualquer cartão ativo. Não afeta o carregamento do quadro inteiro (`getKanbanData` só lê `Tarefas`) — é especificamente "abrir 1 cartão" que paga esse custo.

#### Caminhos considerados e descartados (com o porquê)

1. **Cache do conteúdo (CacheService), sem separar aba.** Mesmo padrão já usado para contagem de comentários (`CACHE_KEY_COMENTARIOS`, `Código.js:287-299`). Resolve a lentidão de abrir cartão de forma mais simples e sem risco de mover dado entre abas. **Não foi descartado por ser ruim — é uma alternativa mais barata e pode ser feita independentemente desta mudança, inclusive antes dela como ganho rápido.** Segue válida como opção B ou como complemento.
2. **Separar aba mantendo arquivamento automático (virtual, 15 dias) E o botão "Desarquivar".** Descartado: o arquivamento automático de hoje (`_tarefaArquivada_`, `Código.js:707-718`) nunca grava nada na planilha (calculado só na leitura, de propósito — ver comentário em `Código.js:702-704`) — então cartões "arquivados só na tela" nunca disparariam a migração de atividades, deixando a maioria dos casos reais sem cobertura. E mantendo "Desarquivar", seria necessário migrar atividades de volta (`Atividades_Arquivadas → Atividades`) a cada restauração — mesmo full-scan que se está tentando evitar, agora dentro do lock de restaurar, com risco real de o histórico "sumir" da tela se essa migração reversa falhar no meio (não é atômica: copiar + apagar).
3. **Cron diário gravando `Arquivado='Sim'` fisicamente para cartões virtualmente arquivados.** Tecnicamente viável e de baixo impacto de performance (rodaria de madrugada, sem afetar usuários) — mas seria a **primeira automação por tempo do projeto** (hoje: zero triggers, tudo é sob demanda por ação de usuário), com necessidade de monitoramento próprio e geração de entradas de Log que hoje não existem para arquivamento automático. Superado pela alternativa 4 abaixo, que dispensa o cron por completo.

#### Desenho final escolhido

**Remover o arquivamento automático (virtual) por completo — só arquivamento manual.** Isso fecha a lacuna da alternativa 2: como só existe um caminho para um cartão virar arquivado (`arquivarTarefaManual`), 100% dos cartões arquivados passam por ali, e a migração de atividades pode ficar presa a esse único ponto, sem exceção e sem cron.

**Trade-off aceito conscientemente pelo usuário:** hoje, um cartão concluído some sozinho do quadro após 15 dias, mesmo sem ação de ninguém. Sem o arquivamento automático, cartões concluídos ficam parados na coluna "Concluído" até alguém clicar em "Arquivar" manualmente — depende de disciplina da equipe. Racional aceito: o Kanban já pressupõe uso diário ativo (mover cartão, atualizar status); arquivar cartões concluídos é uma extensão natural dessa mesma rotina, não uma tarefa extra. Ressalva registrada: esse hábito pode falhar em períodos de exceção (férias, troca de equipe) — hoje o automático cobre esse buraco silenciosamente; sem ele, o quadro pode acumular cartões antigos visíveis até a rotina ser retomada.

**Estrutura de dados:**
- Nova aba `Atividades_Arquivadas`, mesmos cabeçalhos de `Atividades` (`ID_Tarefas`, `Tipo`, `Texto`, `Data`, `Autor`).
- `Tarefas` **não muda** — continua uma aba só, tanto para cartões ativos quanto arquivados (a separação de ativo/arquivado já acontece hoje via filtro em duas funções diferentes: `getKanbanData` retorna só ativos, `getTarefasArquivadas` retorna só arquivados — nenhuma das duas precisa de aba própria).

**Migração de atividades (dentro de `arquivarTarefaManual`, mesmo `comBloqueio`):**
1. Ler `Atividades` inteira, filtrar linhas daquele `ID_Tarefas` (mesmo full-scan que `_excluirAtividadesDaTarefa_` já faz hoje, `Código.js:515` — nada novo em termos de leitura).
2. Gravar (append) essas linhas em `Atividades_Arquivadas` — **operação pura de escrita, não precisa ler a aba de destino antes**. Por isso, o custo de arquivar um cartão **nunca** cresce com o tamanho de `Atividades_Arquivadas`, só com o tamanho de `Atividades` (que tende a diminuir com o tempo conforme mais cartões são arquivados — arquivar tende a ficar mais rápido, não mais lento, com o uso continuado).
3. `SpreadsheetApp.flush()` — confirma a cópia antes do próximo passo.
4. Só então apagar as linhas originais de `Atividades`, em lote, reaproveitando `_deleteRowsBatch_` (`Código.js:395-407`).

Ordem copiar → flush → apagar é obrigatória e deliberada (mesmo padrão de `arquivarLogsAntigos_`, `Código.js:1217-1266`): garante que, no pior caso (script interrompido no meio — timeout, erro transitório), o resultado é uma atividade **duplicada** (existe nos dois lugares, recuperável, detectável) e nunca uma atividade **perdida**.

**Leitura de atividades de cartão arquivado — sob demanda, não automática:**
- Nova função `getAtividadesTarefaArquivada(id)`, lê só `Atividades_Arquivadas`, filtra por `ID_Tarefas` — mesmo formato de retorno de `getAtividadesTarefa`.
- Novo botão "Ver Atividades"/histórico na tela de Arquivados (`View_Kanban.html`/`JS_Kanban.html`), ao lado dos já existentes ("Restaurar", etc.) — só dispara essa leitura quando clicado, nunca ao simplesmente listar os cartões arquivados.
- Sem ambiguidade sobre qual aba consultar: cartões ativos vêm de `state.tasks` (de `getKanbanData`) e sempre chamam `getAtividadesTarefa`; cartões arquivados vêm de `state.archivedTasks` (de `getTarefasArquivadas`) e o botão novo sempre chamaria `getAtividadesTarefaArquivada` — a distinção já está decidida pela lista/tela de origem, não precisa ser inferida em tempo de execução.
- Esse é o único ponto do desenho cujo custo cresce com o tamanho de `Atividades_Arquivadas` ao longo dos anos — mas só quando alguém pede explicitamente, não em uso corriqueiro.

#### Decisão tomada: remover "Desarquivar" (Opção A)

O usuário optou pela **Opção A**. O arquivamento é de mão única, igual aos Logs. A Opção B fica registrada caso haja interesse no futuro:
- **Sugestão futura (Opção B):** Para manter "Desarquivar", seria necessário implementar a migração reversa (`Atividades_Arquivadas → Atividades`) dentro de `restaurarTarefaArquivada`, com a mesma ordem segura e idempotente (copiar → flush → apagar).

#### Passos de implementação (assumindo Opção A escolhida)

1. Remover a lógica de arquivamento virtual por data em `_tarefaArquivada_` (deixa de calcular por `Data_Conclusao` + 15 dias; passa a considerar arquivado só quando `Arquivado==='Sim'` literal). Ajustar `getKanbanData`/`getTarefasArquivadas` de acordo.
2. Criar a aba `Atividades_Arquivadas` (mesmo padrão de criação sob demanda de `Capacitacoes`/`Visitas_Tecnicas`, fora do setup eager — ver §8.2).
3. Implementar a migração dentro de `arquivarTarefaManual` (ler+filtrar `Atividades`, append em `Atividades_Arquivadas`, flush, apagar de `Atividades` via `_deleteRowsBatch_`).
4. Implementar `getAtividadesTarefaArquivada(id)` e o botão novo na tela de Arquivados.
5. Remover `restaurarTarefaArquivada` e o botão "Restaurar" correspondente.
6. **Migração retroativa dispensada:** Como não havia cartões arquivados, o script de migração do legado foi dispensado a pedido do usuário.
7. Testar: arquivar cartão com atividades → conferir migração completa (nenhuma atividade órfã em nenhuma das duas abas), abrir cartão ativo (deve continuar rápido, sem tocar `Atividades_Arquivadas`), clicar "Ver Atividades" em cartão arquivado (deve trazer o histórico certo), e (se Opção B) restaurar cartão e conferir volta das atividades.
8. `clasp push`/deploy.

#### Alternativa mais simples, ainda disponível

Se o objetivo imediato for só resolver a lentidão de abrir cartão (sem mexer em arquivar/restaurar nem preparar o sistema pro longo prazo), o cache do conteúdo de atividades (opção 1 acima) resolve isso com uma fração do esforço e do risco — mas não reduz o tamanho de `Atividades` no longo prazo. As duas abordagens não são mutuamente exclusivas.

### 8.19 Referência completa da paleta de cores (`:root` em `CSS.html`)

A tabela do §8.7 listava só alguns tokens de exemplo do rollout original e ficou desatualizada (3 valores recalibrados numa sessão posterior nunca foram corrigidos ali). Esta seção é o inventário completo e atual — se algum valor mudar no futuro, atualizar aqui.

**Marca (preto)** — `--primary: #030712` e variações `--primary-hover` (`#1f2937`), `--primary-active` (`#111827`), `--primary-light` (`#f3f4f6`), `--primary-lighter` (`#f9fafb`), `--primary-ring` (`rgba(3,7,18,0.14)`), `--primary-text` (`#030712`).

**Acento (azul)** — `--accent: #2b7fff`, `--accent-hover: #1c6ef2`, `--accent-light: #eaf2ff`.

**Superfícies (fundos)** — `--bg-app: #f3f4f6`, `--bg-card: #ffffff`, `--bg-panel: #f9fafb`, `--bg-subtle: #f3f4f6`, `--bg-hover: #f3f4f6` (as 3 últimas têm o mesmo valor literal hoje — nomes diferentes por propósito semântico diferente, não coincidência a preservar), `--kanban-list-bg: #D3D6DC`.

**Barra lateral** — `--sidebar-bg`, `--sidebar-bg-alt`, `--sidebar-hover`, `--sidebar-active-bg` (`#2E323C`), `--sidebar-text`, `--sidebar-text-hover`, `--sidebar-text-active`, `--sidebar-border`, `--sidebar-icon`, `--sidebar-group-text`.

**Texto** — `--text-main: #030712`, `--text-secondary: #4b5563`, `--text-muted: #6b7280`, `--text-inverse: #ffffff`.

**Bordas** — `--border-color: #e5e7eb`, `--border-subtle: #eef0f2`, `--border-strong: #d1d5db`.

**Status (4 famílias oficiais, cada uma com base/fundo/borda/texto — paleta unificada Menta/Dourado/Tijolo/Lavanda)**:
| Família | base | bg | border | text |
|---|---|---|---|---|
| `--success` (Menta) | `#2CA98F` | `#DFF6EF` | `#A6E0D2` | `#157965` |
| `--warning` (Dourado) | `#C99A2E` | `#FBF3D3` | `#EBD98C` | `#795B15` |
| `--danger` (Tijolo) | `#D8483A` | `#FCE1DE` | `#F3B8B0` | `#791E15` |
| `--info` (Lavanda) | `#7A6CDD` | `#E9E6FB` | `#CBC3F3` | `#3424A8` |

Mais um `--purple` avulso (`#8b5cf6`, bg `#f3e8ff`, border `#ddd6fe`) — só base+bg+border, sem a família completa (5ª cor categórica de KPIs/gráficos).

**Prioridade do Kanban** — `--tag-alta`/`--tag-media`/`--tag-baixa` são só apelidos apontando pra `--danger`/`--warning`/`--success` (não são cores novas).

**Níveis de risco (Matriz de Risco)** — cada um com bg/border/text: `--risk-low` (`#72C9B7`/`#55B5A1`/`#030712`), `--risk-med` (`#E6CC8C`/`#D1B46C`/`#030712`), `--risk-high` (`#E6AD7A`/`#D59963`/`#030712`), `--risk-crit` (`#E27E73`/`#D2685C`/`#030712`) — as 4 cores do heatmap de probabilidade×impacto, texto sempre quase-preto (contraste testado sobre todos os 4 fundos).

**Paleta decorativa de 12 tons** (categórica, sem significado fixo — usada em avatares de membro `.avatar-pastel-1..12`, em `PALETA_PASTEL_HEX`/`corPastelHex`/`corPastelPorNome` — JS_Utilitarios.html —, e nas tags `--tag-lavender`...`--tag-cinnamon`, mesmos 12 valores sob nomes diferentes para uso em badges/etiquetas):

| # | Nome | Fundo (claro) | Texto (escuro) |
|---|------|------|------|
| 1 | Lavanda | `#E9E6FB` | `#7A6CDD` |
| 2 | Menta | `#DFF6EF` | `#2CA98F` |
| 3 | Rosa | `#FBE3E6` | `#D2596F` |
| 4 | Céu | `#E1F1FC` | `#3D8FC4` |
| 5 | Pêssego | `#FBEADD` | `#E0904A` |
| 6 | Dourado | `#FBF3D3` | `#C99A2E` |
| 7 | Tijolo | `#FCE1DE` | `#D8483A` |
| 8 | Lima | `#EAF5DC` | `#6B9B37` |
| 9 | Turquesa | `#DCF3F3` | `#1E9AA3` |
| 10 | Orquídea | `#F6E3F5` | `#A94FA0` |
| 11 | Ardósia | `#E7EBF2` | `#55647A` |
| 12 | Canela | `#F2E4D8` | `#8B5E3C` |

Avatares usam as duas metades (fundo+texto, via classe `.avatar-pastel-N`); gráficos Chart.js e a paleta `--tag-*` usam só o tom escuro (canvas não aceita duas cores por "fatia").

**Decorativas pontuais** (resolvem uma necessidade específica de uma tela só, não fazem parte de nenhuma família maior): `--afast-abono` (`#b45309`)/`--afast-aniversario` (`#0f766e`) — ícones do modal de Afastamentos; `--color-presencial-bg`/`--color-presencial-text` (`#35598D`/`#fff`) — selo "presencial" da Escala; `--color-agora-bg`/`--color-agora-text`/`--color-agora-border` (`#E2EBF8`/`#25497F`/`#B8CBE3`) — destaque "em andamento" de Férias/Escala.

**Fora do `:root`, deliberadamente:** a folha de estilo isolada que `_envelopeHtml()` (`JS_Utilitarios.html`) gera para os PDFs tem sua própria cópia em hex literal das cores de status/tag (ver §10, "Sétima rodada") — não enxerga `:root`, então precisa repetir os valores; e o conversor de PDF do Apps Script não renderiza `background-color` de forma confiável em `<div>`/`<span>`, então lá as cores de badge são só borda+texto, nunca preenchimento.

---

### 8.20 Modo Escuro — auditoria de preparação e plano de implementação (2026-07-27)

Levantamento **read-only** feito antes de qualquer alteração, consolidando 30 achados de quatro varreduras sucessivas (tokens → verificação de neutralidade → gráficos → Kanban/filtros/botões/painéis). O modo escuro **não existe no código** (ver histórico: houve uma tentativa em 19/07/2026 que nunca foi commitada). Esta seção é o plano aprovado.

#### 8.20.1 Como o modo escuro é montado

Quase nenhuma regra do `CSS.html` declara cor literal — todas dizem `var(--token)`. Logo, o modo escuro **não é reescrever o CSS**: é adicionar um segundo bloco que redeclara os *mesmos nomes* com outros valores, e um atributo no `<html>` que liga a chave:

```
:root                  { --bg-app: #f3f4f6; --text-main: #030712; ... }   ← claro (existe)
[data-theme="dark"]    { --bg-app: #0f131a; --text-main: #e6e8eb; ... }   ← escuro (novo)
```

Trocar o atributo faz as ~1.400 linhas de CSS mudarem de cor de uma vez, sem que nenhuma seja modificada. Custo de runtime ≈ zero (um recálculo de estilo).

**Dimensões:** o `:root` tem **131 tokens** — 101 de cor (ganham contraparte) e 30 de geometria/tipografia/motion (não ganham: `border-radius: 12px` é 12px nos dois temas). Payload atual dos 19 arquivos servidos: **472 KB**; acréscimo estimado **+4,7 KB (+1,0%)**, e bem menos na rede por ser texto altamente repetitivo.

**Os três furos que a cascata não alcança:**

| Furo | Motivo | Solução |
|---|---|---|
| Gráficos (canvas) | Chart.js pinta bitmap; `var()` não existe lá | `corVar()` + descongelar constantes + redesenhar no toggle |
| Ícones SVG em `data:` URI | A cor está *dentro de uma string de texto* — CSS não interpola `var()` ali | Token guardando a URL inteira, uma por tema |
| PDF | `_envelopeHtml()` gera folha isolada que não enxerga `:root` (§8.19) | **Não seguir o tema** — papel é sempre claro |

**Anti-flash é obrigatório:** o atributo tem que estar no `<html>` antes do primeiro paint. Aplicado no `onload` (onde o JS carrega hoje, no fim do body), o usuário vê ~200 ms de tela branca antes de escurecer, a cada carregamento.

#### 8.20.2 Decisão de paleta: quase-preto azulado, não preto puro

**Preto puro (`#000`) está descartado**, e o argumento decisivo vem do próprio código: no claro, `--kanban-list-bg` (`#D3D6DC`) é **mais escuro** que `--bg-app` (`#f3f4f6`) — a coluna do Kanban é um *poço rebaixado*. Com `--bg-app: #000` **não existe lugar para essa coluna ir**, e a relação de profundidade teria de ser invertida.

Reforçam a decisão: (a) o design system declara elevação por tonalidade, não por sombra (`CSS.html:121`, `--shadow-xs: none`) — precisa de espaço nos dois sentidos; (b) são 5 níveis de superfície a acomodar; (c) a tipografia é densa (`--fs-2xs: 10px`, `--fs-xs: 11px`), e branco puro sobre preto puro nesses tamanhos causa *halation*. (O argumento OLED não se aplica: app administrativo de desktop em iframe.)

**Viés azul, não cinza neutro** — a rampa clara já é azulada (`#030712`, `#4b5563`, `#6b7280`, `#e5e7eb`), e manter a matiz é o que faz parecer o mesmo produto com a luz apagada.

| Token | Claro | Escuro | Papel |
|---|---|---|---|
| `--kanban-list-bg` | `#D3D6DC` | `#0a0d13` | poço (abaixo da página) |
| `--bg-app` | `#f3f4f6` | `#0f131a` | página |
| `--bg-card` | `#ffffff` | `#161a22` | cartão elevado |
| `--bg-panel` | `#f9fafb` | `#1b2029` | painel |
| `--bg-subtle` / `--bg-hover` | `#f3f4f6` | `#21262f` | hover (passam a **divergir**) |

Texto principal **`#e6e8eb`, não `#ffffff`** — contraste ≈ **13,9:1** sobre `#161a22` (AAA); branco puro daria ~16,5:1, que é contraste *demais* para leitura prolongada. Valores são ponto de partida fundamentado, sujeitos a ajuste visual (principalmente os degraus de hover).

#### 8.20.3 As 9 famílias de cor e suas estratégias

Inverter tudo mecanicamente produz resultado ruim — cada família tem regra própria.

| # | Família | Estratégia | Cuidado específico |
|---|---|---|---|
| 1 | Superfícies | Inverte **preservando a ordem**, não espelhando: elevação continua sendo "mais claro" | `--bg-subtle`/`--bg-hover`/`--bg-app` têm o mesmo valor hoje e **precisam divergir** |
| 2 | Texto | Inverte | `--text-inverse` inverte de *sentido* (é "texto sobre preenchimento") e alimenta os datalabels das roscas |
| 3 | Bordas | Inverte com **menos** contraste | Clarear demais transforma a tela numa gaiola de linhas |
| 4 | Marca `--primary` | **Decisão conceitual** — tinta preta não existe sobre fundo escuro | Consumidores: `:focus-visible`, `accent-color`, `.tl-section-title::before`, `.btn.primary` |
| 5 | Acento azul | Só ajuste de luminosidade | `--accent-light` **inverte de papel**: tint pálido → escuro dessaturado (vale p/ todo token `-light`) |
| 6 | Status ×4 (16 tokens) | `base` quase intacto; `bg` ↔ `text` trocam | Validar também **contraste interno** de família (ver P1) |
| 7 | Níveis de risco | **Quase não muda** — heatmap precisa preservar ordem perceptual | Menor esforço, maior criticidade (vai ao PDF via html2canvas) |
| 8 | 12 tons decorativos | Metades trocam; a metade escura clareia → **conserta os gráficos sozinha** | Os 12 devem seguir mutuamente distinguíveis — verificação visual, não cálculo |
| 9 | Sidebar | Inversão limpa e simétrica | `--sidebar-active-bg` e `--sidebar-text-active` trocam de lado |
| — | Decorativas pontuais | Clareamento simples | `--afast-abono`/`--afast-aniversario` são **fósseis da paleta pré-recalibração** (ver §8.7) |

#### 8.20.4 Inventário completo dos achados

**Infraestrutura ausente (N1–N8)**

| # | Achado |
|---|---|
| N1 | Dois SVG `data:` URI com cor chumbada dentro da string: calendário `stroke='%234b5563'` (`CSS.html:319`) e chevron do `<select>` `stroke='%23374151'` (`CSS.html:1076`). `var()` **não** é interpolado ali |
| N2 | Nenhum `color-scheme` no projeto — controles nativos (painel do date-picker, dropdown, autofill, scrollbar) continuam claros |
| N3 | `accent-color: var(--primary)` em 3 lugares (`CSS.html:1089, 1256, 1266`) — `--primary` é tinta preta; no escuro o checkbox some |
| N4 | `.modal-overlay { background: rgba(17,17,24,0.5) }` (`CSS.html:961`) — véu escuro sobre fundo escuro |
| N5 | `_capturarElementoComoImg()` (`JS_Utilitarios.html:1416`) captura o elemento **ao vivo** → no escuro entra imagem escura dentro de PDF claro. Afeta Matriz de Riscos e KPIs/grids do Painel |
| N6 | Constantes de gráfico congeladas no topo do módulo — **corrigido para 3 reais + 2 mortas** (ver G4) |
| N7 | `box-shadow` com cor literal — **corrigido de 5 para 8** (ver V1) |
| N8 | Sem `<meta name="theme-color">`; sem ponto de ancoragem para o toggle (só existe `#sidebar-user-container`) |

**Verificação de neutralidade (V1–V7)** — nem toda tokenização é troca invisível:

| # | Achado |
|---|---|
| V1 | **8** `box-shadow` com cor literal (`175, 245, 248, 1155, 1157, 1162, 1357, 1406`) e **nenhum bate com `--shadow-*`**. Trocar por token **mudaria o modo claro**. *(A contagem anterior de 5 vinha de um grep `rgba(0,0,0` sem espaços, que perdia `rgba(0, 0, 0, 0.05)`.)* |
| V2 | `#2563eb`, `#dc2626`, `#16a34a` **não existem** como token — apontá-los para `--danger`/`--success` mudaria a cor visível |
| V3 | `#dc2626` (`JS_Utilitarios.html:296`) e `#0f766e` (`View_Documentos.html:261`) são **fósseis da paleta antiga** (§8.7 registra `--success/--warning/--danger` = `#0f766e`/`#b45309`/`#dc2626`). Não são cores intencionais: é migração incompleta. `#16a34a` é avulso |
| V4 | Contagem de constantes congeladas — superada por G4 |
| V5 | `corVar()` **não tem cache** (`JS_Utilitarios.html:63`). Tornar `PALETA_PASTEL_HEX` lazy sem cache é **regressão real**: `corPastelHex()` roda por etiqueta/cartão (`JS_Kanban.html:340`) e `_mapaCoresMembros()` já recomputa o mapa a cada avatar |
| V6 | Declarar `color-scheme: light` **muda o comportamento atual** para quem usa SO escuro (força claro nos controles nativos) |
| V7 | ✅ Os 12 `.avatar-pastel-N` (`CSS.html:1234-1245`) batem **exatamente** com os 24 valores `--tag-*`. Troca 100% neutra |

**Gráficos (G1–G5)**

| # | Achado |
|---|---|
| G1 | ✅ Canvas é transparente — o fundo vem de `.tl-chart-card` (`var(--bg-card)`). **Nada a fazer** |
| G2 | As 4 roscas usam `borderColor: corVar('--bg-card')` como falso espaçamento entre fatias (`JS_Kanban.html:710, 757`; `JS_Capacitacoes.html:365`; `JS_VisitasTecnicas.html:253`). Sem re-render, ficam **anéis brancos** sobre cartões escuros — o modo de falha mais visível do sistema |
| G3 | `--border-subtle` acumula **dois propósitos** (borda de UI + grade do eixo Y, `JS_Utilitarios.html:103`) que **divergem no escuro**: borda deve ser discreta, grade precisa ser legível. Exige token `--chart-grid` dedicado |
| G4 | `CHART_LEGEND_BASE` (`:87`) e `CHART_DATALABELS_BASE` (`:92`) são **código morto** — aparecem só na própria declaração; os 10 gráficos usam `legend:{display:false}`. Restam **3** constantes a descongelar: `CHART_TOOLTIP_BASE`, `CHART_SCALES_BASE`, `PALETA_PASTEL_HEX` |
| G5 | Avatar da legenda tem fundo inline vindo da paleta congelada e texto em `var(--text-inverse)` (`CSS.html:1231`) — **as duas metades viram em momentos diferentes** |
| ✅ | `CHART_TOOLTIP_BASE` está escrito em termos semânticos (`--text-main` como fundo, `--text-inverse` como título) e **se auto-inverte** corretamente |

**Kanban, filtros, botões e painéis (K, F, B, P)**

| # | Achado |
|---|---|
| K1 | `.btn-add-card:hover { background: rgba(23,24,31,0.06) }` (`CSS.html:517`) — lavagem de tinta escura, some no escuro |
| K2 | `.card { border: 1px solid var(--bg-card) }` (`CSS.html:532`) — a borda do cartão **é a cor do cartão** (decisão da rodada 5). Funciona, mas o cartão passa a depender **inteiramente** da escada de superfícies estar correta |
| K3 | `.label-chip` (`CSS.html:1096`) tem o mesmo descasamento do G5 — fundo inline de `corLabel()`, texto em token. **G5 tem 3 vítimas: legenda, etiquetas do Kanban e avatares** |
| **F1** | ⚠️ **Achado estrutural.** `.filter-select`/`.filter-input` (`276`), `.filter-date-group` (`173`) e `.btn-top-action` (`241`) têm `border: none` e são definidos **só pela sombra** — que morre no escuro. **Toda a barra de filtros e ações do topo, em todas as páginas, perde o contorno.** Exige adicionar `border` no bloco escuro: muda **propriedade**, não valor |
| F2 | `box-shadow: 0 4px 14px rgba(43, 127, 255, 0.15)` (`CSS.html:1162`) — `--accent` (`#2b7fff` = 43,127,255) chumbado como brilho |
| B1 | ⚠️ **Bug latente.** `.btn.primary` usa `var(--sidebar-active-bg)` como fundo e `var(--primary-hover)` como hover — **famílias diferentes**. Hoje passa despercebido (ambos cinza-escuro); no escuro `--sidebar-active-bg` precisa inverter enquanto `--primary-hover` segue a marca → **hover quebra** |
| B2 | ✅ `.btn-pdf { background: var(--text-main) }` — botão pintado com token de texto; frágil semanticamente, mas **auto-inverte** |
| B3 | `.btn.success:hover` (`881`) e `.btn-pdf-email:hover` (`906`) usam o slot `-text` da família como **fundo** de hover — quando o slot inverter, o hover passa a clarear. Aceitável, mas acidental |
| B4 | `.btn:disabled { opacity: 0.5 }` — sobre fundo escuro lê como "transparente", não "desabilitado" |
| **P1** | ⚠️ `.icon-blue/green/red/yellow` e `.c-*` (`CSS.html:835-841`) usam `-border` como **fundo** e `base` como **glifo**: o contraste é **interno à família**, não contra a página. Se os dois slots convergirem no escuro, **o ícone some dentro do próprio chip**. Acrescenta um critério de validação |
| P2 | `.tl-section-title::before` (`CSS.html:1316`) usa `var(--primary)` como barra decorativa — amarrado à decisão de marca |
| P3 | `.kpi-card`/`.tl-kpi-card` têm `border: none; box-shadow: none` — mesma classe de problema do F1, mais brando por serem superfícies maiores |

#### 8.20.5 Plano faseado

| Fase | Conteúdo | Afeta o claro? |
|---|---|---|
| **0** | ✅ **DECIDIDO em 27/07/2026** — ver §8.20.7 | — |
| **1a** | ✅ **CONCLUÍDO em 27/07/2026.** Tokenização **neutra**: 12 `.avatar-pastel-N` → `--tag-*` (V7); `#2b7fff`→`var(--accent)` e `#4b5563`→`var(--text-secondary)`; removidas as 2 constantes mortas (G4) | ❌ Não |
| **1b** | ✅ **CONCLUÍDO em 27/07/2026** — ver §8.20.8. Mudanças **visíveis**: 8 sombras (V1); fósseis de paleta (V2/V3); F2; K1; `color-scheme` (V6); **correção do B1 + o gêmeo `.save-btn`** | ⚠️ Sim, aprovado |
| **2** | ✅ **CONCLUÍDO em 27/07/2026.** Ganchos: `--overlay-bg` (N4), `--badge-glass-bg`, `--control-accent` (N3), `--chart-grid` (G3), `--icon-calendar`/`--icon-chevron` (N1) — todos inicializados com o valor atual | ❌ Não |
| **3** | ✅ **CONCLUÍDO em 27/07/2026** — ver §8.20.8. Paleta escura: as 9 famílias de §8.20.3 | ❌ Não |
| **4** | ✅ **CONCLUÍDO em 27/07/2026** — ver §8.20.8. **Regras estruturais do escuro** (categoria nova): recorte nos filtros/botões do topo (F1), P3, B4 | ❌ Não |
| **5** | ✅ **CONCLUÍDO em 27/07/2026** — ver §8.20.8. Infra: `data-theme`, `localStorage`, toggle, `theme-color` (N8), **anti-flash no `<head>`** | ❌ Não |
| **6** | ✅ **CONCLUÍDO em 27/07/2026** — ver §8.20.8. Gráficos: descongelar as constantes; **cache de `corVar()` invalidado no toggle** (V5); re-render (G2); G5/K3; `--chart-grid` | ⚠️ Risco técnico |
| **7** | ✅ **CONCLUÍDO em 27/07/2026** — ver §8.20.8. PDF/export: tema claro forçado na montagem do relatório (N5); `_envelopeHtml()` segue com hex literais | ⚠️ Risco técnico |
| **8** | ✅ **Parte automatizável CONCLUÍDA em 27/07/2026** — ver §8.20.8. Validação: WCAG AA; contraste interno de família (P1); 12 tons; varredura final; guarda de regressão. Resta a conferência visual manual | — |

#### 8.20.6 Impacto no modo claro e proteções

**As Fases 1a, 2, 3, 4 e 5 não mudam nada visualmente no claro.** As Fases 3 e 4 vivem dentro de `[data-theme="dark"]`, que não existe até a Fase 5. A Fase 1b é opcional e granular. As Fases 6 e 7 não mudam aparência, mas tocam código que roda no claro.

| Risco | Mitigação |
|---|---|
| Constante → função: errar um call site dá `undefined` no Chart.js e **o gráfico não renderiza** | Trocar declaração e os 6 call sites de `CHART_SCALES_BASE` no mesmo commit; abrir os 3 painéis antes de seguir |
| Cache de `corVar()` mal invalidado → cores congeladas do tema anterior | Invalidar no **mesmo ponto** que troca o atributo, nunca em listener separado |
| Anti-flash quebra a página inteira (roda antes de tudo) | `try/catch` mudo — falhar em silêncio e cair no claro |
| Captura de PDF não restaura o tema → tela presa no claro | `try/finally`, restauração garantida mesmo com exceção |
| Borda nos filtros altera layout | ✅ **Sem risco:** o reset já tem `box-sizing: border-box` (`CSS.html:143`) — borda não muda dimensão externa |

**Regras de execução:** branch dedicada, um commit por fase (reversão granular) · **fronteira rígida** — não tocar em `comBloqueio`/`flush`, salvamento, paginação, autenticação ou lógica de negócio; este trabalho é **cor e render, só** · não mexer no `classList.toggle('hidden')` nem nas 7 exceções documentadas de `style.display` · regressão funcional a cada fase no modo claro (salvar/excluir/arquivar cartão, drag-and-drop, os 5 PDFs, filtros e paginação de Logs/Capacitações/Arquivados, modais de Riscos/Planos) · `clasp push` só após validação manual (não há dev server local no Apps Script).

**Ponto de parada seguro:** ao fim da Fase 2 o sistema está mais limpo e o modo escuro pronto para ser ligado quando se quiser, sem nenhuma mudança visível.

#### 8.20.7 Decisões da Fase 0 (27/07/2026)

| Decisão | Escolha |
|---|---|
| **`--primary` no escuro** | **Inverter a tinta** — o preto `#030712` vira quase-branco; botões primários ficam claros sobre fundo escuro. Preserva a identidade "tinta" do design system em vez de passar a identidade para o azul. Consequência: `.btn.primary`, `:focus-visible`, `accent-color` e `.tl-section-title::before` seguem a tinta invertida |
| **Posição do toggle** | Rodapé da sidebar, **abaixo do avatar do membro** (`#sidebar-user-container`), no formato sol/lua. **Requisito explícito:** dimensionado para continuar visível com a sidebar **retraída** (`.sidebar.collapsed`) — validar contra as regras de colapso em `CSS.html` |
| **Padrão na primeira visita** | **Seguir o SO** via `prefers-color-scheme`. A escolha manual, quando feita, tem prioridade e fica persistida em `localStorage` |
| **Export `html2canvas`** | **Sempre claro**, igual ao PDF (Fase 7) |
| **Escada de superfícies** | Confirmada conforme §8.20.2 |
| **Ordem de execução** | Começar **só pela Fase 1a** (mínimo verificado valor a valor), avaliando o ritmo antes de seguir |

#### 8.20.8 Registro de execução

**Fase 1a — concluída em 27/07/2026.** Quatro alterações, todas verificadas como neutras no modo claro:

1. Os 12 `.avatar-pastel-N` (`CSS.html`) passaram de hex literal para `var(--tag-*)`. Os 24 valores foram comparados par a par antes da troca (V7) — `#E9E6FB/#7A6CDD` = Lavanda … `#F2E4D8/#8B5E3C` = Canela. Com isso, o `CSS.html` deixa de ter qualquer declaração de cor em hex fora do bloco `:root` (as ocorrências restantes de `#111827`/`#f3f4f6` no arquivo estão apenas em **comentários** que documentam estilos inline do lado JS).
2. `linkA()` (`JS_Utilitarios.html`): `#2b7fff` → `var(--accent)`. **Verificação de segurança feita antes da troca:** `var()` não resolve em PDF, então foi confirmado que nenhuma lista que usa `linkA()` (Documentos, Capacitações, Visitas) entra em PDF — os 5 tipos de `CFG_PDF` são dashboard/archived/matriz/acomp/risco-arquivado, e o único clone de lista é `_gridRowsParaPdf('archived-list')` (`JS_Kanban.html:774`). O `#2563eb` do mesmo ternário **permaneceu literal** por não ter token equivalente (V2, pendente na Fase 1b).
3. `JS_Documentos.html`: `#4b5563` → `var(--text-secondary)` nos dois links de anexo (valor idêntico).
4. Removidas `CHART_LEGEND_BASE` e `CHART_DATALABELS_BASE` (G4) — código morto, zero consumidores. Comentário no lugar explica o porquê.

Validação: sintaxe dos dois JS conferida com `new Function()`; nenhuma referência órfã às constantes removidas; 12 avatares consumindo token. Validado visualmente pelo usuário. Commit `d857293`.

**Fase 2 — concluída em 27/07/2026.** Seis tokens novos no `:root`, **todos inicializados com exatamente o valor que substituíram** — nenhuma mudança visual no modo claro. O objetivo é que cada um destes pontos possa divergir no modo escuro sem precisar mexer em regra nenhuma depois:

| Token | Valor inicial | Consumidor | Por que precisa ser token próprio |
|---|---|---|---|
| `--overlay-bg` | `rgba(17,17,24,0.5)` | `.modal-overlay` | Véu escuro sobre fundo escuro deixa o modal sem separação |
| `--badge-glass-bg` | `rgba(255,255,255,0.92)` | `.risk-badge` | O badge "de vidro" precisa inverter de branco para escuro |
| `--control-accent` | `#030712` | `accent-color` em 3 regras | A tinta da marca inverte para quase-branca no escuro, e checkbox quase-branco sobre superfície escura some. Unificou os 3 pontos, que antes usavam `--primary` (2×) e `--text-main` (1×) — mesmo valor, propósitos distintos |
| `--chart-grid` | `#eef0f2` | `CHART_SCALES_BASE` via `corVar()` | Grade de gráfico e borda de UI divergem no escuro (G3) |
| `--icon-calendar` | data: URI, stroke `#4b5563` | `input[type="date"]` | A cor está **dentro** da string do data: URI; CSS não interpola `var()` ali (N1) |
| `--icon-chevron` | data: URI, stroke `#374151` | `.sidebar-field-group .field-multiselect::after` | idem |

**Validação:** comparação programática contra `HEAD` confirmou que os 2 `data:` URI ficaram **byte a byte idênticos** (um caractere trocado quebraria o ícone silenciosamente); os 4 valores literais conferidos um a um contra a origem, e os tokens de origem (`--border-subtle`, `--primary`, `--text-main`) permanecem intactos; sintaxe JS e balanceamento de chaves do CSS verificados.

**Ponto de parada seguro atingido.** Com as Fases 1a e 2 concluídas, o terreno está preparado: a partir daqui o modo escuro pode ser ligado sem que nenhuma regra de CSS precise ser reescrita — só valores de token, mais as regras estruturais da Fase 4 (F1). Validado visualmente pelo usuário. Commit `609518e`.

**Fase 1b — concluída em 27/07/2026.** Primeira fase que **altera o modo claro**, com as duas decisões de fundo aprovadas explicitamente pelo usuário.

**Sombras (V1/F2) — decisão: consolidar na escada.** As 8 sombras com cor literal passaram a usar a escada declarada, mais um token novo `--shadow-accent` para o brilho azul da coluna "hoje" da Escala (que é cor, não profundidade, e por isso fica fora da escada neutra). Seis das oito ficaram visualmente idênticas ou imperceptíveis — cinco delas só trocavam `rgba(0,0,0)` por `rgba(3,7,18)` a 4–5% de opacidade. **Duas mudaram de verdade:** `.btn-top-action:hover` e `.plan-card:hover` ganharam sombra mais difusa ao adotar `--shadow-md`. Alternativa descartada: preservar os valores exatos criando 5 tokens de uso único, o que enshrinaria desvios ad-hoc de sessões passadas em vez de eliminá-los.

**Botão primário (B1) — decisão: alinhar com a marca.** `.btn.primary` usava `var(--sidebar-active-bg)` (`#2E323C`) como fundo e `var(--primary-hover)` no hover: **duas famílias no mesmo botão**. Pior, o sistema tinha **dois botões primários com cores base diferentes** — `.btn-create` já usava `--primary` (`#030712`). Corrigido para `--primary`/`--primary-hover`, igual a `.btn-create`.

> **Achado durante a execução:** `.save-btn` ("Salvar Cartão", painel de detalhe do Kanban) tinha **exatamente o mesmo defeito** — fundo de `--sidebar-active-bg`, hover de `--primary-hover`. Foi corrigido junto, e isso era **obrigatório, não opcional**: antes da correção `.btn.primary` e `.save-btn` combinavam em `#2E323C` e só `.btn-create` destoava; corrigir apenas o `.btn.primary` teria *movido* a inconsistência em vez de resolvê-la, deixando o "Salvar Cartão" como único primário em cinza. Com os três alinhados, `--sidebar-active-bg` passou a ser usado **apenas pela navegação** (`.menu-item.active`), que é o seu propósito.

**Fósseis da paleta antiga (V2/V3).** Valores presos desde a recalibração da paleta para a escada Menta/Dourado/Tijolo (§8.7), agora migrados: `#dc2626` → `var(--danger)` (mensagem de erro, `falha()`); `#0f766e` → `var(--success-text)` ("Versão Atual" no modal de revisão, `View_Documentos.html`); `#16a34a` → `var(--success)` (feedback verde do botão de confirmação); `#2563eb` → `var(--accent)` em `linkA()` — como os dois ramos do ternário passaram a usar a mesma cor, o ternário de cor foi eliminado.

**Outros:** `--hover-wash` criado para o hover do botão "adicionar cartão" sobre a coluna do Kanban (K1) — precisa ser translúcido porque a superfície de baixo é colorida, então um `--bg-hover` opaco não serve; `color-scheme: light` declarado no `:root` (N2/V6), garantindo que quem usa o SO em modo escuro não receba controles nativos escuros dentro da interface clara.

**Validação:** nenhuma sombra com cor literal restante; nenhum fóssil de paleta fora de comentários; auditoria de tokens confirmou **139 declarados, 118 usados via `var()`, zero usados-mas-não-declarados**; sintaxe JS e balanceamento de chaves do CSS verificados.

**A conferir visualmente (esta fase muda aparência):** botões primários em geral ("Salvar Documento", "Enviar PDF", "Entendi", "Salvar Cartão") — devem estar pretos como os botões "Novo"; hover dos botões redondos do topo e dos cards de Plano de Ação (sombra mais difusa); mensagens de erro; "Versão Atual" no modal de revisão de documento; hover do "adicionar cartão" no Kanban; coluna "hoje" da Escala Semanal.

**Fase 3 — concluída em 27/07/2026.** Criado o bloco `[data-theme="dark"]` em `CSS.html`, logo após o `:root`. **Inerte por ora:** nenhum HTML/JS aplica o atributo até a Fase 5, então o modo claro não muda em nada — verificado programaticamente que o `:root` ficou idêntico ao commit anterior.

**Cobertura:** 93 tokens redeclarados. Omitidos **de propósito**: 26 de geometria/tipografia/motion (não mudam com o tema), os 12 `--risk-*` (o heatmap precisa preservar a ordem perceptual baixo→crítico, são tons médios que funcionam sobre fundo escuro, e o texto quase-preto contrasta contra o próprio preenchimento — além de a matriz ser fotografada para dentro do PDF), os 6 apelidos (`--tag-alta/media/baixa`, `--green/--red/--yellow`, que seguem `--danger/--warning/--success` sozinhos), `--shadow-xs` (é `none`, não tem cor) e `--color-presencial-text` (branco sobre o azul escurecido dá 4,6:1, passa no AA sem mudar). Auditoria confirmou **zero tokens de cor sem contraparte**.

**Validação de contraste (WCAG):**

| Par | Resultado |
|---|---|
| `--text-main` sobre as 4 superfícies | 13,3:1 a 15,8:1 — **AAA** |
| `--text-secondary` / `--text-muted` sobre cartão | 7,95:1 e 5,13:1 — AAA / AA |
| Texto de status sobre o próprio `-bg` (4 famílias) | 7,33:1 a 9,24:1 — **AAA** |
| Pílula ativa da sidebar (texto escuro sobre claro) | 15,16:1 — AAA |
| Texto sobre o botão primário (tinta invertida) | 15,16:1 — AAA |

**Achado da validação — o P1 se resolve sozinho.** O contraste *interno* dos chips de ícone dos KPIs (glifo em `base` sobre fundo em `-border`, mesma família) era o critério que eu havia deixado de fora na auditoria original. Medido nas duas paletas, ele **melhora** no escuro: 1,82–3,05 no claro → 3,21–3,98 no escuro. O risco que eu havia levantado não se materializou com esta paleta.

**Distinguibilidade dos 12 tons decorativos.** Medida por ΔE (CIELAB) entre todos os 66 pares da metade escura (a que alimenta os gráficos): mínimo de **13,8** no escuro (peach/cinnamon) contra 19,9 no claro (peach/gold). Fica acima do limiar de 10 para "claramente distinguíveis", mas com margem menor — confirmando a previsão de §8.20.3 de que a gama útil é mais estreita no escuro. **Ainda assim exige conferência visual lado a lado**, porque ΔE não captura tudo.

**Decisões de paleta aplicadas:** tinta da marca invertida (`#030712` → `#e6e8eb`), com o hover continuando a caminhar na direção do fundo (no claro escurecia menos; aqui clareia menos), preservando a gramática de interação; `--text-inverse` invertido de sentido; `--accent-light` invertido de papel (regra que vale para todo token `-light`); as três superfícies que compartilhavam `#f3f4f6` agora divergem; sidebar invertida com pílula ativa clara; sombras mais profundas (`alpha` 0,40–0,55), já que sombra rende pouco no escuro — o que reforça a necessidade da Fase 4.

**Fase 4 — concluída em 27/07/2026.** Único bloco do modo escuro que muda **propriedade**, não valor de token. Inserido no fim do `CSS.html`; **70 linhas inseridas, 0 removidas** — a natureza puramente aditiva da mudança é a garantia de que o modo claro não foi tocado, e os 19 seletores novos são todos prefixados com `[data-theme="dark"]`.

**A varredura ampliou o achado F1.** A auditoria original tinha mapeado 4 componentes definidos apenas por sombra; uma varredura programática (procurando regras com `background` + `box-shadow` e `border: none` ou borda ausente) encontrou **dois grupos a mais**, ambos importantes:

- **As 10 classes de linha de lista** — `.doc-row`, `.membro-row`, `.escala-row`, `.vt-row`, `.ferias-row`, `.arq-row`, `.risco-row`, `.unid-row`, `.log-row`, `.cap-row`. É o componente mais repetido do sistema, presente em praticamente toda tela de listagem.
- **`.modal-box`** — no claro é a `--shadow-lg` que descola o modal do fundo.

Descartados após análise: `.btn-create` e `.btn.primary` (preenchimento sólido colorido — o próprio fill recorta), `.grid-row-hover:hover` (o `background-color` carrega o feedback), `.card` do Kanban (a definição vem da escada de superfícies, §8.20 K2) e `.tl-chart-card`/`.table-wrap`/`.legend-row` (já têm borda de verdade).

**Anel em vez de borda.** A solução não usa `border`, e sim `box-shadow: 0 0 0 1px` (raio zero = hairline). Motivo: borda real ocuparia espaço nos elementos **sem `width`/`height` explícitos** — as pílulas de filtro, as linhas de lista e o modal —, empurrando o layout em 2px. O `box-shadow` desenha a mesma linha sem afetar layout nenhum e, de quebra, substitui naturalmente a sombra que deixou de funcionar. *(Correção a uma afirmação anterior desta seção: `box-sizing: border-box` só neutraliza o custo da borda quando `width`/`height` estão declarados — vale para `.btn-top-action`, que é 40×40, mas não para os demais.)*

**Armadilha tratada:** `box-shadow` **não faz merge** entre declarações — é substituído por inteiro. Por isso `.btn-top-action:hover` e `.grid-row-hover:hover`, que declaram sombra própria, precisaram reaplicar o anel explicitamente (em `--border-strong`, mais forte), senão o anel sumiria justamente ao passar o mouse. É a mesma classe de problema já registrada na terceira rodada com a propriedade `transition`.

**Especificidade verificada regra a regra:** todas as novas vencem suas bases — inclusive `.tl-kpi-card`, cuja regra base usa `#view-indicadores` e por isso exigiu o ID também no seletor escuro (`[1,2,0]` contra `[1,1,0]`).

**B4 resolvido como não-mudança.** `.btn:disabled { opacity: 0.5 }` foi analisado e mantido: o efeito é **simétrico** nos dois temas — tinta escura a 50% sobre branco e tinta clara a 50% sobre escuro chegam ao mesmo cinza médio. A preocupação levantada na auditoria não se sustentou, e inventar um valor diferente sem poder validá-lo visualmente seria pior do que manter.

**Fase 5 — concluída em 27/07/2026.** O modo escuro passa a existir de verdade: a chave foi ligada.

**Anti-flash (`Index.html`, `<head>`).** Script inline colocado **antes** do `include_('CSS')`, porque precisa rodar antes do primeiro paint — o resto do JS carrega no fim do `<body>`, tarde demais. Sem ele, quem usa o modo escuro veria a tela branca por ~200 ms a cada carregamento. Envolvido em `try/catch` mudo de propósito: como roda antes de tudo, uma exceção ali derrubaria a página inteira; sem `localStorage` (navegação privada, cookies bloqueados) o sistema simplesmente abre no claro.

**Botão (decisões do usuário).** Ícone circular de **26 px** no rodapé da sidebar. A medida foi escolhida com uma prévia interativa montada com os tokens reais: menor que o avatar (34 px), o que mantém a hierarquia do rodapé — a pessoa em primeiro plano, o controle em segundo —, e acima do piso de **24 px** que o WCAG 2.5.8 (Target Size) exige para alvo de clique.

**Layout do rodapé.** Criado `.sidebar-foot`, que recebeu o padding que era do `.sidebar-user`: expandida, avatar e botão dividem a mesma linha (uma linha só para um botão de 26 px desperdiçaria altura); **retraída, o rodapé empilha** — avatar em cima, tema embaixo. Isso atende o requisito de o botão continuar visível com a sidebar recolhida, onde sobram só 36 px úteis (68 menos o padding), que é exatamente a largura do avatar.

**O ícone é trocado pelo CSS, não pelo JS.** Os dois SVGs ficam sempre no HTML e o `data-theme` decide qual aparece. Assim o ícone certo já vem no primeiro paint, sem depender de JS e sem piscar. Convenção adotada: o botão mostra **para onde vai**, não onde está — lua no claro ("clique para escurecer"), sol no escuro. Como sol/lua são ambíguos em qualquer produto, o `title` e o `aria-label` carregam a frase inteira ("Mudar para o modo escuro") e são atualizados pelo JS, que é a parte que o CSS não alcança.

**Persistência e SO.** Chave `sgq-tema` no `localStorage` (distinta de `sgqSidebarCollapsed`, já existente). Sem escolha gravada, o sistema segue `prefers-color-scheme` **em tempo real** — quem alterna o tema do Windows vê o SGQ acompanhar sem recarregar. Gravar é justamente o que marca "o usuário escolheu" e faz o tema parar de seguir o SO. `<meta name="theme-color">` acompanha o tema, com valores idênticos ao `--bg-app` de cada paleta.

**`aplicarTema()` é a fonte única da verdade** para troca de tema — qualquer coisa que precise reagir (redesenhar gráficos, na Fase 6) deve ser pendurada ali, não em listener paralelo.

⚠️ *Estado intermediário (resolvido pela Fase 6, a seguir): entre as duas fases, alternar o tema deixava os gráficos com as cores do tema anterior.*

**Fase 6 — concluída em 27/07/2026.** Fecha o único lugar da interface que não acompanha o tema sozinho: o `canvas`.

**Constantes viraram funções.** `CHART_TOOLTIP_BASE` → `chartTooltipBase()`, `CHART_SCALES_BASE` → `chartScalesBase()` e `PALETA_PASTEL_HEX` → `paletaPastelHex()`. Como `const` de topo de módulo, as cores eram resolvidas **uma vez, na carga da página**, e ficavam congeladas no tema inicial. **12 call sites** atualizados (6 de tooltip + 6 de scales, em `JS_Kanban`/`JS_Capacitacoes`/`JS_VisitasTecnicas`) mais os 3 consumidores da paleta, com verificação de que nenhuma referência órfã sobrou — errar um deles daria `undefined` no Chart.js e o gráfico simplesmente não renderizaria.

**Cache em `corVar()` (V5).** Sem ele, tornar a paleta uma função seria uma **regressão de performance real**: `corPastelHex()` roda por etiqueta/cartão e `_mapaCoresMembros()` por avatar, então um Kanban cheio faria milhares de `getComputedStyle` por render. Com cache, 500 chamadas viram 1 leitura — o sistema fica **mais rápido do que era antes** desta fase. A invalidação (`limparCacheCores()`) acontece **dentro de `aplicarTema()`**, no mesmo ponto que troca o atributo, nunca num listener paralelo — senão os gráficos poderiam ser redesenhados com valores do tema anterior. `_paletaPastel` foi declarado junto do cache, e não ao lado de `paletaPastelHex()`, para que `limparCacheCores()` não possa esbarrar na TDZ do `let`.

**Redesenho (G2).** `retematizarGraficos()` é chamado por `aplicarTema()` e delega a `renderIndicadores()` — o ponto de entrada único dos gráficos, que já valida o Chart.js, relê o filtro de membro e chama os três grupos, cada um destruindo e recriando suas instâncias. Guarda: só redesenha se alguma instância já existir, porque na carga `aplicarTema()` roda no `DOMContentLoaded`, antes de os dados chegarem e do Painel montar. Sem este redesenho, o sintoma mais visível seriam as **4 roscas com anel branco** sobre cartão escuro — o espaçamento entre fatias é um anel pintado em `--bg-card`.

**G5 resolvido pelo mesmo caminho:** redesenhar pelo `renderIndicadores()` reconstrói também as legendas em HTML, onde a cor de fundo do avatar é inline — que era exatamente o descasamento apontado (fundo congelado + texto em token).

**K3 não precisou de nada — o achado estava superestimado.** As etiquetas do Kanban usam `LABELS_DISPONIVEIS`, cujas cores já são `var(--tag-*)`, e `var()` **resolve normalmente em `style=""` no DOM** (só canvas e PDF é que não resolvem). As etiquetas sem cor curada caem em `corPastelPorNome()`, que devolve a classe `.avatar-pastel-N` — tokenizada na Fase 1a. Os dois caminhos já eram theme-aware.

**Nota sobre `_mapaCoresMembros()`:** continua recalculando o mapa a cada avatar. Não foi alterado nesta fase — com o cache de `corVar()`, o custo caiu para aritmética pura, e mexer na função exigiria decidir quando invalidar (a lista de membros muda em runtime), risco desnecessário aqui.

**Fase 7 — concluída em 27/07/2026.** Blinda os relatórios: **PDF é papel e sai sempre claro**, qualquer que seja o tema da tela.

**Trocar o atributo não bastaria — e essa foi a descoberta da fase.** `montarHtmlIndicadoresPdf()` fotografa os `.tl-chart-grid`, que **contêm os `<canvas>` dos gráficos**. Mudar o CSS repinta o DOM mas **não** o bitmap já desenhado: o relatório sairia com cartões claros e gráficos escuros. Por isso o tema é trocado de verdade, via `aplicarTema()`, que recria os gráficos no tema claro antes da foto. *(A Matriz de Riscos, por outro lado, captura `.matrix-table` e `.legend-row` — DOM puro, sem canvas — e teria funcionado só com o atributo.)*

**Segunda armadilha: a animação.** **Nenhum gráfico do sistema declara `animation`**, então vale o padrão de 1000 ms do Chart.js. Recriar os gráficos e fotografar em seguida pegaria todos no meio da entrada. `Chart.defaults.animation` é desligado durante a operação e restaurado depois. Isso não existia antes porque, sem esta fase, os gráficos fotografados já estavam na tela havia tempo — a re-renderização é que introduziu o problema.

**Sincronismo:** entre trocar o tema e fotografar há um `_aposPintar()` — dois `requestAnimationFrame` encadeados. O primeiro entra no quadro atual; o segundo só dispara depois que o navegador realmente pintou o anterior, garantindo que a tela já está clara quando o `html2canvas` roda.

**Ponto de aplicação:** o wrapper `_montarCorpoPdfEmTemaClaro()` envolve os **dois** call sites de `window[cfg.montarFn]()` — o download (`_gerarPdfReal`) e o envio por e-mail (`_dispararEnvioPdfReal`) —, cobrindo os 5 relatórios de uma vez. Quando o tema já é claro, retorna direto, sem custo nenhum.

**Garantias:** `aplicarTema()` **não grava no `localStorage`** (só `alternarTema` grava), então a preferência do usuário não é afetada; e a restauração está em `.finally()`, de modo que a tela nunca fica presa no claro mesmo se a montagem falhar.

**Esta fase precisou de duas correções depois do teste do usuário** — vale registrar porque a solução final é bem melhor que a original.

*Primeira correção:* a versão inicial trocava o tema da página inteira para os **cinco** relatórios. Só 2 fotografam a tela; os outros 3 montam o corpo a partir de clones que usam as classes da folha isolada do PDF, imune ao tema — e ainda assim disparavam `renderIndicadores()` duas vezes, vinte gráficos recriados à toa.

*Segunda correção:* mesmo restrito a 2, o usuário reportou que a tela **ficava clara por muito tempo**, não apenas piscava. O motivo é que a troca de tema durava toda a captura, e `html2canvas` com `scale: 2` leva segundos. A solução foi eliminar a troca de tema quase por completo:

**`onclone` — a tela real nunca muda.** O `html2canvas` monta um clone do documento antes de renderizar e expõe o hook `onclone`. Em `_capturarElementoComoImg()`, o clone tem o `data-theme` removido e a raiz marcada com `.tema-claro`; o clone é invisível e descartado em seguida. Resultado: a foto sai clara sem nenhuma alteração visível.

**`.tema-claro` — válvula de escape no CSS.** O seletor `:root` virou `:root, .tema-claro`, então qualquer subárvore marcada com a classe usa a paleta clara mesmo sob `[data-theme="dark"]` — uma declaração no próprio elemento vence o valor herdado, sem depender de especificidade. Custo: uma vírgula.

**A sonda invisível — para os gráficos.** O `onclone` não alcança `<canvas>`: o `html2canvas` copia o bitmap já desenhado, e bitmap não obedece a CSS. Só o Painel de Indicadores tem esse problema. Em vez de trocar o tema da página, `corVar()` ganhou uma raiz configurável (`_raizCor`) que aponta temporariamente para uma **sonda invisível** com `.tema-claro`. Os gráficos são redesenhados lendo a paleta clara **enquanto o resto da interface continua escuro**.

| Relatório | Captura | Efeito visível ao gerar no modo escuro |
|---|---|---|
| Cartões Arquivados, Acompanhamento, Riscos Arquivados | — | **nenhum** |
| Matriz de Risco | DOM puro | **nenhum** (resolvido pelo `onclone`) |
| Painel de Indicadores | `<canvas>` | só os gráficos mudam de cor brevemente; a página segue escura |

Corrigida junto a ordem do `finally`: a animação do Chart.js volta ao normal **depois** do redesenho de retorno, não antes — senão a volta animava 1000 ms sem necessidade.

**Fase 8 — parte automatizável concluída em 27/07/2026.** A conferência visual tela a tela continua sendo do usuário (não há dev server local no Apps Script), mas tudo que dava para verificar por código foi verificado.

**Varredura final por cor literal em todos os arquivos servidos.** Um único achado real, corrigido: `.risk-badge` tinha o `background` tokenizado na Fase 2 mas a **borda** ficou em `rgba(0,0,0,0.1)` — uma borda preta a 10% sobre fundo escuro é invisível, e o badge da Matriz perderia o contorno. Criado `--badge-glass-border`. Todo o resto do que a busca trouxe é legítimo: comentários, a folha isolada do PDF (`_envelopeHtml`, que não enxerga `:root` de propósito), o `backgroundColor: '#ffffff'` do `html2canvas` (papel é branco) e o `theme-color`, que é sincronizado com `--bg-app` das duas paletas. Também conferidos e limpos: `::selection` e `@media print` não existem no projeto, `:focus-visible` já usa token, e o único `filter` é o `backdrop-filter` do overlay.

**Guarda de regressão — `verificar-tema.cjs`.** O maior risco remanescente do modo escuro não é performance: é alguém adicionar um token à paleta clara e esquecer a contraparte escura. O sintoma seria um elemento com cor de tema claro no meio da interface escura — **silencioso**, sem erro no console. O script compara os dois blocos e falha com código 1 se achar divergência, em qualquer direção (token sem contraparte, ou declarado só no escuro por erro de digitação). As isenções são explícitas e cada uma tem o motivo registrado no próprio arquivo.

Rodar antes de cada `clasp push`:

```
node verificar-tema.cjs
```

> ⚠️ **A extensão `.cjs` é deliberada.** O `.clasp.json` declara `scriptExtensions: [".js", ".gs"]` com `rootDir` na raiz e **não existe `.claspignore`** — um arquivo `.js` solto aqui seria enviado ao Apps Script pelo `clasp push`, onde `require`, `process` e `__dirname` não existem. Com `.cjs`, o Node roda normalmente e o clasp ignora. Vale a mesma cautela para qualquer utilitário de desenvolvimento que venha a ser adicionado ao projeto.

O próprio script foi testado nos dois sentidos: apontou uma falha na sua primeira execução (a regra de isenção não cobria `--ease`, que não tem sufixo), e depois, com um token falso injetado só na paleta clara, falhou com exit 1 e voltou a passar ao restaurar.

**O que só a conferência visual resolve** (em ordem de risco): os 12 tons decorativos lado a lado, onde o ΔE mínimo caiu de 19,9 para 13,8; os 5 PDFs gerados com o tema escuro ativo; as 4 roscas do Painel (anel de separação); filtros e linhas de lista, que dependem do anel da Fase 4; a sidebar retraída com o botão de tema; e recarregar a página no escuro para confirmar que não pisca branco.

#### 8.20.9 Piscada na troca de tema (27/07/2026)

Reportado na conferência visual: grids de todas as páginas, botões de PDF/e-mail, botões "Novo" e a borda das linhas de ação do Plano piscavam ao alternar o tema.

**Causa única para os quatro sintomas:** as transições feitas para *hover* estavam sendo disparadas pela troca de tema. Alternar o tema muda ~93 tokens de uma vez, e **33 regras** do `CSS.html` declaram `transition` numa propriedade de cor. O CSS não distingue "mudou porque passou o mouse" de "mudou porque o tema trocou" — para o navegador é a mesma alteração de propriedade.

| Sintoma reportado | Regra |
|---|---|
| Grids de todas as páginas | `.grid-row-hover`, `.data-table tbody tr` |
| Botões de PDF e e-mail | `.btn-pdf`, `.btn-pdf-email` |
| Botões "Novo" | `.btn-create` |
| Borda das linhas de ação (Plano) | `.plan-card`, `.acomp-ent-row` |

**Por que lia como piscada e não como transição suave:** os elementos *sem* `transition` trocavam instantaneamente enquanto os *com* `transition` chegavam 150–300 ms depois — e em durações **diferentes** (`--transition-fast` 150 ms, `--transition-base` 200 ms, mais `0.2s` e `0.3s` chumbados em `.plan-card` e `.version-card`). Por cerca de um terço de segundo a tela era uma mistura dessincronizada dos dois temas, com dezenas de elementos chegando ao destino em momentos distintos.

**Correção:** classe `.sem-transicao`, aplicada por `aplicarTema()` e removida no quadro seguinte — vale por um único frame e não altera o comportamento de hover.

Dois detalhes decidem se a correção é segura:

1. **A remoção é agendada ANTES do redesenho dos gráficos.** `aplicarTema()` termina em `retematizarGraficos()` → `renderIndicadores()` → Chart.js. Se isso lançar (CDN fora do ar, dado inesperado) e o `requestAnimationFrame` tivesse sido registrado depois, a classe ficaria presa e **o sistema inteiro perderia as transições de hover até a página ser recarregada** — falha silenciosa, sem erro no console. Com o agendamento antes, o rAF já está na fila e as transições voltam de qualquer forma. Verificado por simulação nos dois sentidos.
2. **Só `transition` é suprimido, nunca `animation`.** As animações por keyframe do projeto disparam quando o elemento entra na tela (`modalIn`, `overlayIn`, `navExpand`), não quando uma cor muda; e `spinnerRing` roda em loop no botão de PDF, então seria reiniciada do zero à toa se alguém trocasse o tema durante a geração de um relatório. A proposta inicial incluía `animation: none` — era mais agressiva do que o necessário.

Também obrigatória a leitura de layout (`void raiz.offsetHeight`) entre a troca do atributo e o agendamento da remoção: sem ela o navegador agruparia as duas operações no mesmo quadro e as transições disparariam mesmo assim. É o passo que a maioria das implementações deste padrão esquece.

**Correção a uma afirmação anterior:** o registro da Fase 5 dizia que o `prefers-reduced-motion` seria respeitado na troca de tema. Isso nunca foi implementado — o bloco `@media (prefers-reduced-motion: reduce)` existente cobre apenas a duração de um spinner e não desliga transição alguma. Com `.sem-transicao`, a troca passa a ser instantânea para todos os usuários, o que atende a preferência por consequência.

**Permanece:** no Painel de Indicadores os gráficos são destruídos e recriados, o que dá um apagar-e-desenhar visível. É inerente ao `<canvas>` e nenhuma regra de CSS alcança.

**`_envelopeHtml()` permanece intocada,** com suas cores em hex literal: ela gera uma folha isolada que não enxerga o `:root` (§8.19), o que agora é uma vantagem — o PDF é imune ao tema por construção. Verificado que continua com **zero** ocorrências de `var(--...)`.

---

## 9. Próximas Melhorias

1. **Testes:** extrair lógica pura (`calcularNivelRisco`, `_statusPlano`, `_tarefaArquivada_`, `colIdx_`, `calcularProximaRevisao`) para funções testáveis + suíte com `clasp run`/GAS testing.
2. **Observabilidade:** painel de saúde (contagem de linhas por aba, alertas de aproximação de cotas).
3. **Migração de store:** se o volume crescer muito, considerar Sheets como cache e um backend real (Firestore/BigQuery) para Logs/Atividades.
4. **Tematização:** consolidar estilos inline em classes (**concluído em 26/07/2026**, ver §10 — de ~378 para 35 `style=""`, restando só casos dinâmicos/PDF-literais); modo escuro **auditado e planejado em 27/07/2026 — ver §8.20** (30 achados catalogados, paleta decidida, plano em 8 fases; ainda não implementado).
5. **Acessibilidade:** completar rótulos ARIA nas tabelas dinâmicas e feedback de status para leitores de tela.
6. **CI/CD:** pipeline `clasp push` com lint (ESLint) e verificação de versões de dependência.

---

*Documento gerado por auditoria de código read-only. Nenhum arquivo de código-fonte foi alterado na produção deste relatório.*

---

## 10. Modificações Recentes (Histórico de Alterações)

### Avatar do Usuário Logado no Menu Lateral (25/07/2026)
Foi adicionado um widget fixo no rodapé do menu lateral exibindo o nome e avatar do usuário atual. A cor do avatar segue a mesma lógica determinística da tela de Membros. Se no futuro for necessário remover essa funcionalidade, reverta os seguintes passos:

1. **`Código.js` (Função `getKanbanData`)**: Remover `currentUserEmail: usuarioAtual_()` do objeto de retorno.
2. **`JS_Utilitarios.html`**:
   - Remover a chamada à função `renderUserAvatar()` dentro do bloco `.withSuccessHandler(function(data) { ... })` de inicialização (logo após atribuir `state.currentUserEmail = data.currentUserEmail;`).
   - Apagar a declaração da função `renderUserAvatar()`.
3. **`Index.html`**:
   - Remover a div `<div id="sidebar-user-container" ...></div>` localizada imediatamente antes da tag de fechamento `</aside>` do menu lateral.
4. **`CSS.html`**:
   - As propriedades CSS `.sidebar { overflow: hidden; }`, `.sidebar-nav { flex: 1; overflow-y: auto; min-height: 0; }` e `.sidebar-nav > * { flex-shrink: 0; }` foram ajustadas para permitir o scroll interno dos links enquanto o avatar fica fixo. Caso o avatar seja removido, essa estrutura não causará problemas (o menu continuará rolando), mas pode ser revertida para o layout anterior se desejado.
5. **Paleta de Cores**: As cores "Céu" (Azul claro) e "Lavanda" (Roxo claro) tiveram suas posições invertidas na paleta para agradar uma preferência de sorteio do usuário. Para reverter, basta destrocar os códigos HEX em `JS_Utilitarios.html` (`PALETA_PASTEL_HEX` - índices 0 e 3) e `CSS.html` (classes `.avatar-pastel-1` e `.avatar-pastel-4`).

### Implementação do Modo Noturno (Tentativa em 25/07/2026)
Houve uma tentativa de implementar o Modo Noturno na aplicação. O código foi posteriormente revertido a pedido do usuário, mas os detalhes técnicos estão documentados abaixo para referência futura:
1. **Estrutura Base**: Uso de `color-scheme: dark;` e `[data-theme="dark"]` no `CSS.html` para substituir as variáveis de cor globais (ex: `--bg-app`, `--bg-card`, `--text-main`, `--text-secondary`). A aplicação ativava automaticamente com `window.matchMedia('(prefers-color-scheme: dark)').matches` no `Index.html`.
2. **Botões e Ícones**: Criação da classe `.btn-create` para evitar estilos inline nos botões do topo, permitindo a transição automática de cores (`color: var(--bg-app); background-color: var(--primary)`). Foi necessário aplicar o filtro `invert(0.8)` no `::-webkit-calendar-picker-indicator` para ícones nativos de calendário aparecerem corretamente no fundo escuro.
3. **Listas e Grids**: Conversão de centenas de `style=""` inline nas listagens (`.unid-row`, `.doc-row`, `.member-row`, etc.) para classes do `CSS.html`, padronizando bordas para usar a variável dinâmica `var(--border-subtle)`.
4. **Motivos do Rollback**: 
   - Componentes JS (ex: `JS_Pessoas.html`) usavam concatenação de strings em Javascript injetando cores HEX absolutas (`#E2EBF8` e `#25497F`) em tags, o que destruía o contraste no modo escuro sem uma refatoração severa de lógica JS para classes CSS.
   - Falta de padronização estrutural prévia: muitos rótulos, pesos de fonte (`font-weight: 600;`) e cores secundárias estavam fixados de forma inline nas views HTML ao invés de usar classes genéricas (como `.page-title` ou `.section-label`), tornando a adaptação inconsistente entre as telas.
   - O rollback foi feito para priorizar primeiro uma refatoração limpa da arquitetura de estilos (removendo todos os inlines para classes semânticas) antes de introduzir uma variável de tema.

### Ajustes de Proporção nas Tabelas (26/07/2026)
Foram realizados refinamentos nas larguras (widths) das colunas das grids CSS para otimizar o espaço e a legibilidade dos dados sem quebrar layout.
1. **Listas de Documentos (`CSS.html`, `.doc-row--mestra` e `.doc-row--rev`)**:
   - Foi feita uma tentativa de usar larguras dinâmicas (`auto`/`max-content`) nas colunas. Porém, como cada linha do grid (`.doc-row`) é independente (aplicada em uma `div` em vez de um único elemento de grid-container ou `<table>`), o uso de `auto` fazia com que cada linha calculasse sua largura baseada no próprio conteúdo, destruindo o alinhamento vertical da tabela inteira.
   - A solução final preservou **tamanhos fixos, porém mais largos** para evitar esmagamento de textos e manter a coluna "Título" fluida (`1fr`):
     - **Código**: subiu de `90px` para `110px`.
     - **Tipo**: subiu de `160px` para `180px`.
     - **Histórico**: subiu de `110px` para `140px`.
     - **Link** e **Auxiliares**: ganharam `10px` a mais cada.
2. **Histórico de Revisões (`View_Documentos.html`)**:
   - A `div` wrapper da lista teve seu `min-width` reduzido de `1400px` para `1100px`. Por possuir menos colunas fixas que a lista principal, o tamanho enorme forçava a coluna elástica de "Título" (`1fr`) a absorver um espaço vazio muito grande (mais de 500px), causando distanciamento exagerado e espremendo os dados da direita. A redução de 300px deixou a tabela muito mais harmônica.
3. **Lista de Registros (`CSS.html`, `.log-row`)**:
   - Essa tabela possui uma arquitetura estável de frações elásticas (`fr`), não sofrendo do problema de desalinhamento independente relatado nas views de Documentos. O balanceamento de espaço foi repensado:
     - **Data/Hora**: expandiu de `140px` para `160px`.
     - **Ação**: expandiu de `180px` para `220px`.
     - **Usuário**: cedeu uma parte do seu espaço reduzindo sua proporção de `1.5fr` para `1.2fr`.

### Correção de bugs do refactor "inline style → classe CSS" + migração completa (26/07/2026)

O commit local que converteu estilos inline em classes (2 commits: `1492a12` design-system no `CSS.html`, `d9941e0` aplicação nos 18 arquivos JS/View) introduziu 3 bugs que passaram despercebidos por afetarem apenas a aparência, sem gerar erro. Auditoria (só leitura) encontrou os 3; depois, a pedido do usuário, todos foram corrigidos e o trabalho de migração foi retomado e levado até o fim.

#### Bugs encontrados e corrigidos

1. **`CORES_STATUS` virou `{chave: 'nome-da-classe'}` mas 2 call sites ainda desestruturavam como array `[bg, cor]`.** Como uma string é iterável por índice em JS, `const [a, b] = 'badge-danger'` não gera erro — só produz `a='b'`, `b='a'`, cores inválidas e silenciosamente ignoradas pelo navegador.
   - `JS_Kanban.html` (badge de prioridade em "Cartões Arquivados", ~linha 264/269): corrigido para aplicar a classe diretamente (`class="tag-badge ${prioCls}"`).
   - `JS_Riscos.html` (`atualizarLegendaRisco`, legenda de Probabilidade×Impacto nos modais de Risco): a função manipula `.style.backgroundColor/borderColor/color` diretamente via JS (uso legítimo de inline dinâmico), então a correção não foi trocar por classe — foi criar um mapa `CORES_NIVEL_RISCO` local usando as variáveis `--risk-low/med/high/crit-bg/border/text` (já existiam em `CSS.html`, adicionadas no commit `1492a12` mas nunca usadas em lugar nenhum) e desestruturar `[bg, borda, cor]` corretamente a partir dele.
   - `JS_Capacitacoes.html`/`JS_VisitasTecnicas.html`: mesmo padrão de desestruturação quebrada existia mas o resultado nunca era usado (código morto) — apenas removido.
2. **Classe `.multiselect-trigger` referenciada em `View_Capacitacoes.html`/`View_VisitasTecnicas.html` mas nunca definida no CSS** — o refactor trocou o `style=""` do seletor de participantes por essa classe inexistente, deixando o elemento sem borda/padding/layout. Adicionada a definição faltante em `CSS.html`.
3. **Rename `member-row` → `membro-row` incompleto.** `JS_Kanban.html` passou a emitir `membro-row`/`membro-row--inativa`, mas `CSS.html` só tinha `.member-row`/`.member-row--inativa` (modificador de opacidade do membro inativo, no Kanban, ficou sem efeito) e, à parte, um bloco `.membro-row`/`.escala-row` inteiramente duplicado mais abaixo no arquivo (usado por Afastamentos/Escala em Pessoas). Consolidado em uma única definição de cada, renomeando corretamente.

#### Migração adicional (a pedido do usuário, "deixar 100% perfeito")

Com os bugs corrigidos, foi feita uma segunda passada, módulo por módulo (Pessoas → Riscos → Kanban → Documentos → Capacitações/Visitas Técnicas → Unidades/Monitoramento/Comum/Index):

- **Cores hex hardcoded → `var(--...)`** em todo `style=""` que ainda usava valor literal com equivalente já existente na paleta (ex.: `#6b7280`→`var(--text-muted)`, `#4b5563`→`var(--text-secondary)`, `#030712`→`var(--text-main)`, `#cbd5e1`→`var(--border-strong)`). **Exceção deliberada:** as funções `_pdfKpiCel`/`_pdfGraficoCel`/`_pdfDoughnutComLegendaCel`/`_cabecalhoPdfHtml`/`_envelopeHtml` (`JS_Utilitarios.html`) e `montarHtmlAcompanhamentoPdf`/`montarHtmlRiscoArquivadoPdf` (`JS_Riscos.html`) constroem um documento HTML **standalone** para o conversor de PDF do Apps Script, com seu próprio `<style>` isolado — não tem acesso às variáveis `:root` do `CSS.html`, então ali cor literal continua sendo o correto.
- **Estilos inline estáticos repetidos (3+ vezes no mesmo contexto) → classes novas.** Exemplos: `.escala-day-card`/`.escala-hora-input`/`.afast-section`/`.afast-dot` (modais de Escala/Afastamentos em Pessoas), `.risco-legenda-nivel`/`.risk-meta`/`.plan-card--nested` (Riscos), `.chart-legend-row`/`.chart-legend-avatar` (lista de legenda dos gráficos por membro — reaproveitada em Kanban, Capacitações e Visitas Técnicas, que tinham o mesmo bloco copiado 3x), `.tl-chart-simple`/`.tl-chart-donut-wrap`/`.tl-donut-*` (painel de Indicadores, 6 gráficos com o mesmo wrapper repetido). Estilos genuinamente dinâmicos (cor calculada em runtime, `display:none` de toggle) foram deixados inline propositalmente.
- Total de atributos `style="` no projeto caiu de ~378 para ~201 (o restante é majoritariamente as funções de PDF, casos de uso único, ou estilos dinâmicos).

#### Validação e achados extras

Ao final, todas as classes novas foram conferidas contra `CSS.html` (existência da definição + uso real). Isso pegou um mismatch introduzido pela própria sessão (`risco-meta-sep` no `JS_Riscos.html` vs `risk-meta-sep` definido no CSS — corrigido para `risk-meta-sep` em ambos os lados antes de reportar) e um bloco duplicado **pré-existente** (não desta sessão) `.filter-date-group`/`.filter-date-input`/`.filter-date-sep`, dead code do refactor original, removido por estar na mesma área sendo trabalhada.

**Estado do deploy:** `clasp push` foi feito (todos os arquivos atualizados no editor do Apps Script). O `clasp deploy` (publicação de nova versão na URL de produção usada pelos usuários) foi **deliberadamente adiado a pedido do usuário** — o projeto tem 2 deployments (`@HEAD`, que reflete o push na hora, e `@7`, versão fixa antiga); se o link do dia a dia aponta para `@7`, as mudanças desta sessão só valerão para quem testar via editor/`@HEAD` até que um deploy seja publicado.

### Segunda rodada — plano faseado eliminando o restante dos estilos inline (26/07/2026)

Ainda no mesmo dia, o usuário pediu uma nova auditoria dos ~201 `style=""` restantes (mapeados na rodada anterior) e um **plano faseado** para eliminar o que fosse viável, com um critério novo em relação à rodada anterior: **criar classe mesmo para valores usados uma única vez hoje** (visando reaproveitamento futuro), não só para os repetidos 3+ vezes. Plano de 9 fases aprovado pelo usuário e executado por completo, com validação ao final de cada fase (não só no final de tudo — lição direta da rodada anterior, onde um mismatch só foi pego na auditoria final).

**Resultado:** `style="` no projeto caiu de ~201 para **35**. Os 35 remanescentes são: cores/dimensões calculadas por variável JS (ex.: `stroke:${cor}`, `background-color:${bgColorsM[i]}`), toggles `display:none`/`display:flex` acionados via `.style.display` no JS (modais, blocos condicionais), o único `'<td style="' + cel.getAttribute('style') + '">'` (pass-through literal de um nó clonado, não dá para virar classe), e um punhado de cores dentro das funções de PDF (`_pdfKpiCell`, `_pdfGraficoCel` etc.) sem token de design equivalente — todos documentados como exceção intencional, não pendência.

#### Bugs de cascata/especificidade CSS pegos durante a execução (não estavam na auditoria original — só apareceram ao aplicar)

A validação por fase (em vez de só no fim) pegou problemas que teriam passado despercebidos numa migração em lote única:

- **`.list-body` + `.gap-20`, `.form-row` + `.gap-12`/`.gap-10`:** a classe utilitária (`.gap-20` etc.) estava definida **antes** da classe-base (`.list-body`) no `CSS.html`. Com a mesma especificidade (uma classe cada), quem vem depois no arquivo vence — então a classe-base sempre ganhava e o gap "customizado" nunca era aplicado, silenciosamente. Corrigido substituindo a combinação por modificadores dedicados (`.list-body--spaced`, `.form-row--gap-12`, `.form-row--gap-10`), que não dependem de ordem no arquivo.
- **`.risk-title--archived`** definida **antes** de `.risk-title` — mesma causa, mesma correção (reposicionada para depois da base).
- **`.data-table` + `.font-12`, `.field-label` + `.mt-8`:** aqui o problema não era ordem, era **especificidade**. `label.field-label` (seletor elemento+classe) e a regra de `.data-table` sempre vencem uma classe utilitária de classe única, não importa onde ela esteja no arquivo. Corrigido com seletor de especificidade equivalente ou maior (`.field-label.mt-8`) ou modificador dedicado (`.data-table--sm`).
- **O mais sério:** `.w-100px`, `.field-input-compact`, `.acomp-data`, `.acomp-sei`, `.escala-hora-input` perdiam para uma regra genérica já existente no `CSS.html` (~linha 924): `input[type="text"]:not(.filter-input), input[type="email"], input[type="date"]:not(.filter-date-input), select.field-select, textarea.field-area { width:100%; padding:10px 13px; ... }`. Essa regra tem especificidade maior que qualquer classe única (o seletor de atributo `[type="text"]` e o `:not(.filter-input)` cada um conta como "classe" na especificidade). Resultado: campos que deveriam ser compactos (datas de Abono/Licença, campo de ano, inputs de horário da Escala) renderizavam com o tamanho/padding padrão, sem nenhum erro — só errado visualmente. **Corrigido com `!important` nessas 5 classes**, seguindo o mesmo padrão que `.mt-10`/`.px-28`/`.pb-28` já usavam no projeto antes desta sessão, exatamente pelo mesmo motivo.
- **Achado à parte (bug real, não de cascata):** dentro do `<style>` isolado que `_envelopeHtml()` (`JS_Utilitarios.html`) gera para o PDF, a classe `.text-center` era usada em 2 pontos (imagem da matriz de risco e do gráfico) mas nunca tinha sido definida ali — só existe em `CSS.html`, que o documento de PDF não enxerga. A imagem nunca foi de fato centralizada no PDF. Corrigido adicionando `.text-center { text-align: center; }` ao `<style>` do envelope.
- **Dead code pré-existente removido incidentalmente** (não introduzido nesta nem na rodada anterior, só notado por estar na área sendo trabalhada): `.list-scroll.x` duplicada (duas definições conflitantes), `.gap-20` duplicada, `.mt-2` (nome enganoso — aplicava 8px, não 2px — e nunca usada em lugar nenhum), `.acomp-status-wrap` duplicada, `.acomp-main-row`/`.acomp-fields-row` (classes nunca referenciadas em nenhum HTML do projeto).

**Regra prática registrada para o futuro** (relevante para quem for criar novos utilitários CSS de classe única): antes de combinar uma classe utilitária nova com uma classe de componente já existente, verificar se o componente já define a mesma propriedade CSS — e com que tipo de seletor. Se o componente usa seletor de elemento (`label.field-label`), atributo (`input[type=...]`) ou `:not()`, a especificidade dele provavelmente supera uma classe única sozinha; nesse caso, só reordenar o CSS não resolve — é preciso `!important` no utilitário ou um seletor de especificidade equivalente.

`clasp push` feito novamente ao final (28 arquivos). Deploy de produção novamente não foi solicitado nesta rodada.

### Terceira rodada — auditoria técnica completa da arquitetura CSS + plano de remediação em 10 fases (26/07/2026)

Com o `style=""` já reduzido a 35 casos justificados (rodada anterior), o usuário pediu uma **auditoria técnica completa, somente leitura**, da arquitetura do `CSS.html` — não mais focada em inline vs. classe, e sim em saúde estrutural: duplicatas, classes semelhantes, CSS órfão, organização, reuso, conflitos/especificidade/`!important`, integração com JS, padronização, performance e compatibilidade futura (modo escuro/responsividade). Critério explícito do usuário: não unificar classes semelhantes só por terem propriedades parecidas — só recomendar unificação quando não há perda de organização/modularidade.

**Resultado da auditoria: nota 74/100.** Achado mais grave: 5 classes declaradas duas vezes com `grid-template-columns` **conflitantes** (`.unid-row`, `.log-row`, `.doc-row--mestra`, `.doc-row--rev`, `.cap-row`) — como a especificidade é igual, a segunda declaração sempre vence silenciosamente; a primeira já estava morta (zero efeito visual), mas continuava no arquivo como se fosse a fonte da verdade. Também: ~30 regras de CSS órfão, 10 classes de linha-de-grid repetindo 7 propriedades idênticas, 2 usos de `!important` com justificativa desatualizada, utilitários (`.mb-14`/`.w-100`/`.w-100px`) fisicamente longe da escala principal, pares de cor hex repetidos sem token, e ~19 pontos de `element.style.display` que poderiam virar `classList`.

O usuário pediu um plano de ação cobrindo **todos** os achados (Crítica + Importante + Opcional), executado em 10 fases com validação (balanceamento de chaves + grep de órfãos) depois de cada uma — mesma disciplina de "validar por fase, não só no fim" das rodadas anteriores:

1. **Crítica — as 5 duplicatas conflitantes:** removida a primeira declaração (morta) de cada uma, preservando o layout renderizado (a segunda, vigente, não mudou de valor).
2. **Importante — CSS órfão:** removidas a seção "Dashboard" legada inteira (`.dashboard-grid`, `.dash-row`, `.chart-box`, `.upcoming-table` etc.), o cabeçalho antigo do painel de Indicadores (`.tl-header`), variantes de cor nunca usadas (`.c-orange`, `.icon-purple`, `.badge-info`), utilitários nunca adotados (`.d-flex`, `.font-14`, `.justify-between`, `.m-0`, `.relative`, `.gap-6`, `.text-right`, `.grid-header`) e componentes/estados órfãos (`.btn-rounded`, `.btn-outline`, `.action-btn-main`, `.archived-table`, `.group-row`, `.row-warning`/`.row-cancelled`, `.label-dot`, `.plan-grid`, `.period-active`/`.period-inactive`, `.status-msg`, `.plan-version-context`, `.version-badge`, `.gap-20`). Cada remoção foi reconfirmada com `grep` antes de apagar (não só `class="..."` literal, para pegar uso dinâmico via JS).
3. **Importante — consolidação:** as 7 propriedades idênticas (`display:grid; gap:16px; align-items:center; background-color:var(--bg-card); padding:16px 20px; border-radius:var(--radius-lg); border:none; box-shadow:var(--shadow-sm);`) repetidas nas 10 classes de linha-de-grid foram extraídas para um seletor combinado único; cada classe manteve só seu `grid-template-columns` (e, quando havia, `text-align`/`word-break`) próprio.
4. **Importante — revisão de `!important`:** ao investigar o `.grid-row-hover:hover { box-shadow: ... !important; }`, foi descoberta **uma 6ª duplicata não capturada na auditoria original** — `.grid-row-hover`/`.grid-row-hover:hover` estava declarada duas vezes com propriedades diferentes; como a propriedade `transition` é sobrescrita por inteiro (não faz merge), a segunda declaração apagava silenciosamente a transição suave de `transform`/`box-shadow` do hover, deixando só a de `background-color` funcionando (as demais propriedades "saltavam" em vez de animar). Unificado em uma única declaração, sem `!important` (a especificidade de `.grid-row-hover:hover`, classe+pseudo-classe, já vence a classe única da linha, sem precisar forçar). Também removido o `!important` de `.sidebar.collapsed .nav-group-items { display:none; }` — ele na verdade **quebrava** silenciosamente a regra mobile `.nav-group-items.open` (que não tinha `!important` próprio para competir); removê-lo corrige esse caso sem afetar o flyout (que já vence por especificidade, 4 classes vs. 3).
5. **Importante — reorganização:** `.mb-14`, `.w-100`, `.w-100px` movidos da seção "Modais" para junto da escala `.mb-N`/`.mt-N` no topo do arquivo.
6. **Opcional — tokenização:** `#35598D`/`#fff` e `#E2EBF8`/`#25497F` (repetidos em `.escala-member-pill`/`.tag-badge--presencial` e `.tag-periodo.agora`/`.escala-check.presencial`) viraram `--color-presencial-bg`/`--color-presencial-text` e `--color-agora-bg`/`--color-agora-text` no `:root`.
7. **Opcional — `style.display` → `classList`:** dos ~19 pontos em `JS_Pessoas.html`/`JS_Kanban.html`/`JS_Riscos.html`, 12 foram convertidos para `classList.toggle('hidden')` + nova classe `.hidden{display:none}` (blocos de Férias, botão "Adicionar", notas de reavaliação de Risco, campos de alteração de Plano, botão Salvar de Acompanhamento). Os 7 restantes ficaram deliberadamente em `style.display` (documentado inline): a caixa "Novo ano" (Pessoas) precisa do valor exato `inline-flex`, diferente do `display:flex` que a classe `.flex-row` já aplicada geraria sozinha; os botões Excluir/Arquivar da sidebar do Kanban forçam `block` para evitar o espaço de whitespace inline que um `<button>` nativo (`inline-block`) teria entre botões empilhados — uma classe `.hidden` genérica não capturaria nenhum dos dois casos corretamente.
8. **Opcional — documentação:** comentário adicionado perto de `#view-indicadores` explicando que a convenção `tl-` (vs. componentes genéricos sem prefixo) é isolamento intencional entre o painel de Indicadores e o design system compartilhado, não duplicação.
9. **Validação final consolidada:** pegou **um resíduo esquecido da própria Fase 2** — `.dash-row.two-cols`/`.dash-row.two-cols-table` sobrevivia dentro do `@media (max-width:768px)` mesmo depois do `.dash-row` base ter sido removido. Corrigido. Uma segunda varredura (a pedido do usuário, ao perguntar pela nota atualizada) achou mais 3 duplicatas idênticas — inofensivas, mas redundantes — que também tinham passado despercebidas: `.text-left`, `.text-center` e `.msg-error`, cada uma declarada duas vezes com o mesmo conteúdo. Removidas as cópias redundantes.
10. **`clasp push`** feito pelo usuário.

**Achado fora do escopo aprovado, corrigido à parte:** `.urgent-date { color: #D8483A; font-weight: 700; }` dentro do `<style>` isolado que `_envelopeHtml()` (`JS_Utilitarios.html`) gera para o conversor de PDF — nunca aplicada a nenhum elemento (provável resíduo do widget "próximos prazos" do Dashboard legado, já removido). Como vive num arquivo/contexto fora do escopo combinado no plano (só `CSS.html` + os 3 JS da Fase 7), foi perguntado ao usuário antes de remover; aprovado e removido.

**Resultado numérico:** `CSS.html` caiu de 1590 para 1485 linhas (-6,6%, mesmo tendo *adicionado* código em 3 fases — tokens de cor, classe `.hidden`, comentários de documentação) e `!important` caiu de 54 para 50 ocorrências. **Nota final estimada: ~91/100** — o que falta para mais é essencialmente modo escuro (segue zero, fora do escopo pedido) e a confirmação visual manual das mudanças de comportamento (hover, sidebar recolhida, os 12 toggles convertidos), já que o projeto (Apps Script) não tem dev server local para testar automaticamente; o usuário testou manualmente antes de aprovar o commit final.

### Quarta rodada — auditoria visual de tipografia (pesos, cores, hierarquia) (26/07/2026)

Com a arquitetura CSS já saneada, o usuário pediu uma auditoria comparando **componentes equivalentes entre páginas** — tipografia, negrito, cor do texto, contraste e hierarquia (títulos/labels/valores/descrições) — para achar casos de "o mesmo tipo de campo com aparência diferente por ter sido feito em sessões diferentes". Critério explícito: só sinalizar como problema o que quebra consistência/legibilidade, nunca preferência estética.

A base (títulos de página, títulos de modal, badges, tags) já estava 100% consistente. 8 inconsistências reais foram confirmadas e corrigidas, todas isoladas em `CSS.html`:

1. **Peso do "nome/título principal" variava por tela** para o mesmo dado (`m.name`, `d.titulo`): `.escala-c-nome` e `.doc-c-titulo` estavam em peso 500 enquanto `.member-c-name-txt`/`.ferias-c-nome`/`.cap-c-titulo` (mesmo papel, outras telas) já usavam 600. Padronizado em 600.
2. **`#111827` literal em 5 classes** (`.unid-c-sigla`, `.ferias-c-nome`, `.cap-c-titulo`, `.log-c-ref`, `.log-c-user`) em vez do token `--text-main` (`#030712`) usado pelas equivalentes — coincidência: `#111827` é o valor de um token *diferente* (`--primary-active`), nunca referenciado ali por engano de cópia. Trocado por `var(--text-main)`.
3. **`.risco-c-id`** (coluna de ID do risco, não é link) usava azul (`--accent`) enquanto `.unid-c-sigla`/`.doc-c-codigo` (mesmo papel de "coluna de ID/código") usam preto — alinhado para `var(--text-main)`.
4. **`.modal-ref-label` (Riscos) vs `.member-modal-label` (Pessoas)** — mesmo papel (rótulo mostrando o registro em edição no modal), pesos/margens diferentes; o próprio comentário no CSS já registrava a divergência sem nunca ter sido corrigida. Unificadas numa declaração combinada (peso 700).
5. **`.plan-field-label` vs `.acomp-field-label`** — mesmo papel (micro-rótulo em caixa alta), tamanho/peso/cor diferentes (11px/600/muted vs 10.5px/700/secondary). Padronizados em 11px/700/muted, alinhado com outros rótulos semelhantes do sistema (`.acomp-unit-sigla`, `.plans-title`).
6. **`.log-c-data` (12px) vs `.doc-c-sec`/`.cap-c-sec` (13px)** — mesma coluna de data em listas diferentes, tamanho inconsistente. Padronizado em 13px.
7. **`.unid-c-nome`** usava `#374151`, cinza nunca tokenizado em nenhum outro lugar do CSS. Trocado por `var(--text-secondary)`. (A diferença de *peso/hierarquia* entre `.unid-c-nome` e `.acomp-unit-nome` foi avaliada e o usuário decidiu que é **intencional** — contextos com foco visual diferente — mantida como está.)
8. **`.doc-c-motivo`/`.doc-c-motivo-c` (12px) e `.log-c-det` (12,5px)** vs `.risco-c-text` (13px) — mesmo papel de texto explicativo secundário numa linha. Padronizado em 13px.

Nenhuma mudança em `View_*.html`/`JS_*.html` nesta rodada — só valores de classes já existentes em `CSS.html`.

### Quinta rodada — auditoria de paleta de cores (light-mode + preparação para modo escuro) (26/07/2026)

Auditoria da paleta inteira (fundos, bordas, ícones, títulos, links, botões, badges, gráficos), verificando se cada cor vem de uma variável de tema ou de um valor fixo — critério do usuário: cor fixa (fora de `var()`) é o que mais compromete uma futura troca de tema. Status/KPIs/badges/matriz de risco já estavam 100% tokenizados (nenhum achado ali). Confirmados e corrigidos:

**No CSS:**
1. **"Branco sobre fundo escuro/colorido"** — token `--text-inverse` já existia mas só era usado em 2 lugares; 9 componentes (`.btn-create`, `.btn.primary`, `.btn.success`, `.btn-pdf`, `.btn-pdf-email`, `.btn-action-icon`, `.save-btn`, `.sidebar-brand-icon`, `.label-chip`) usavam a palavra-chave `white`/`#fff` direto. Trocados por `var(--text-inverse)`.
2. **`#2E323C`** (cor de marca) literal em 3 lugares apesar do token `--sidebar-active-bg` já existir com esse valor exato. Trocado.
3. **`.icon-sky`/`.kpi-fill-sky`** duplicavam `--tag-sky`/`--tag-sky-text` como literal. Trocados pelos tokens.
4. **Cinza "quase-branco" reinventado 2x** dentro do mesmo componente (Planos de Ação): `.risk-header` (`#fafafa`) e `.plan-card.inactive`/`.version-header` (`#f8fafc`) — nenhum batia com o token já existente para essa função (`--bg-panel`). Unificados; `.plans-container`/`.plan-card`/`.version-card::before` (branco puro solto) também passaram a usar `var(--bg-card)`.
5. **Borda `#B8CBE3` de `.tag-periodo.agora`** ficou sem token quando `--color-agora-bg`/`--color-agora-text` foram criados numa sessão anterior — criado `--color-agora-border` e aplicado.
6. **Opacidade de "desabilitado" inconsistente**: `.btn:disabled` em 0.5 vs `.btn-pdf`/`.btn-pdf-email`/`.btn-action-icon` em 0.6. Padronizado em 0.5.

**Nos gráficos (Chart.js) — `JS_Utilitarios.html`, `JS_Kanban.html`, `JS_Capacitacoes.html`, `JS_VisitasTecnicas.html`, `JS_Riscos.html`:** todas as cores dos gráficos eram hex literais copiados à mão do CSS, sem nenhuma ligação com os tokens (canvas não resolve `var()` sozinho como o CSS resolve) — incluindo **um achado mais sério**: o gráfico "Distribuição por Prioridade" do Kanban mostrava "Média" em pêssego (`#E0904A`), enquanto o cartão/tag "Média" no quadro usa dourado (`var(--warning)`) — cor efetivamente errada, não só duplicada. A pedido do usuário, a correção foi feita "de verdade" (não só documentada): criado `corVar(nome)` em `JS_Utilitarios.html` (lê o valor atual do token via `getComputedStyle` em tempo de execução) e aplicado nas 4 configs compartilhadas de gráfico (`CHART_TOOLTIP_BASE`/`CHART_LEGEND_BASE`/`CHART_DATALABELS_BASE`/`CHART_SCALES_BASE`) e em todos os arrays de cor individuais dos gráficos (status/prioridade do Kanban, modalidade/tema/mês/membro de Capacitações, mês/membro de Visitas Técnicas — incluindo os `datalabels` brancos dos gráficos de rosca, achado extra pego só na validação final). `JS_Riscos.html`: o fallback da legenda de nível de risco (estado "sem nível ainda") usava hex literal onde o resto da função já usava string `'var(--risk-x-bg)'` (que funciona normalmente em `element.style`, ao contrário de canvas) — alinhado ao mesmo padrão.

**3 refinamentos pedidos pelo usuário depois do relatório inicial:**
- **Borda do cartão do Kanban**: a borda de 1px (topo/direita/embaixo) usava `--border-color`, mais claro que o fundo da própria coluna (`--kanban-list-bg`) onde o cartão fica — nessa combinação a borda não ajudava a definir o contorno do cartão. A pedido do usuário, a borda geral virou `var(--bg-card)` (a cor do próprio cartão — efetivamente invisível, deixando o contraste branco-vs-coluna e a sombra fazerem a separação). A faixa esquerda de prioridade (`border-left`, colorida por Alta/Média/Baixa) não foi tocada.
- **Gradientes `rgba()` dos gráficos de linha** (Capacitações, Visitas Técnicas) também usavam RGB fixo (`rgba(122,108,221,...)` etc.) — canvas não aceita `var()` dentro de `rgba()`. Criado `corVarRgba(nome, alpha)` (converte o hex do token pra RGB) e aplicado nos 2 gráficos.
- **`.icon-sky`** — o fundo (`#CDE8FA`) não batia com nenhum token existente; a pedido do usuário, reaproveitado `var(--tag-sky)` (mesmo token agora usado por `.kpi-fill-sky`) em vez de criar uma variável nova ou deixar solto.

Nenhum `!important` novo, nenhuma duplicata criada. Validação: balanceamento de chaves do `CSS.html` a cada etapa + grep de cada literal removido, mesmo processo das rodadas anteriores. Como o Apps Script não tem dev server local, a confirmação visual (principalmente do gráfico de Prioridade, que muda de cor de verdade, e da nova borda dos cartões do Kanban) é manual, depois do `clasp push`.

### Sexta rodada — bug do ícone de calendário + últimas cores chumbadas (26/07/2026)

**Bug relatado pelo usuário:** os campos de data dentro de modais (ex.: "Data Prevista"/"Data Realizada" em Capacitações/Riscos) não mostravam o ícone de calendário, enquanto os filtros de período no topo das páginas mostravam. Investigado e confirmado: `input[type="date"]` tem uma regra base (`background-image: url(...ícone svg...)`) e uma regra de formulário mais específica (`input[type="date"]:not(.filter-date-input) { background: var(--bg-panel); ... }`) que sempre vence por especificidade quando o campo não tem a classe `filter-date-input` (só os filtros do topo têm). O problema: `background` é a versão *shorthand*, que reseta `background-image` para "nenhum" mesmo só querendo mudar a cor — apagando o ícone sem querer. Mesma causa encontrada em mais 2 lugares (`.sidebar-date` do prazo do Kanban, `.acomp-field-group input` do campo "Data de Entrega"). Corrigido trocando `background` por `background-color` (a propriedade específica, que não mexe em `background-image`) nos 6 pontos afetados (regra geral de formulário + estado `readonly` + estado `:focus` + as 2 variantes de `.sidebar-date` + `.acomp-field-group input`) — nenhuma mudança visual em nenhum outro tipo de campo, só o ícone voltando a aparecer.

**Última varredura de cores chumbadas** (a pedido do usuário, "verificar se ainda sobrou alguma cor chumbada"): mais 7 pontos encontrados e corrigidos, todos duplicando um token que já existia:
- `.btn-pdf:hover` (`#303140` → `var(--primary-hover)`, alinhando com os outros 3 botões de fundo escuro que já usavam esse token no hover).
- `.required-mark` (`#dc2626` → `var(--danger)` — o vermelho do asterisco de campo obrigatório era um tom "genérico", diferente do vermelho usado em todo o resto do sistema).
- `.plan-card:hover` (`#cbd5e1` → `var(--border-strong)`, o token já usado em todo o resto do sistema pra "borda em destaque no hover").
- `.plan-card.needs-review` (`#fffbeb`/`#fde68a` → `var(--warning-bg)`/`var(--warning-border)` — eram cores "de catálogo" genéricas, não do design system).
- `::-webkit-scrollbar-thumb:hover` (`#9ca3af` → `var(--text-muted)` — não batia exatamente com nenhum token; usado o mais próximo semanticamente, mantendo a progressão de hover mais escura que o estado normal).
- `JS_Utilitarios.html` `showConfirm()` (modal de Excluir/Arquivar/Restaurar): `cor`/`bg` eram cópia exata de `--warning`/`--warning-bg`/`--danger`/`--danger-bg`; trocados por essas strings `var(...)` (aplicadas via `.style.propriedade`, que resolve `var()` normalmente).
- `JS_Kanban.html` `LABELS_DISPONIVEIS` (as 7 etiquetas pré-definidas do cartão): cada `cor`/`bg` já era cópia exata de um token `--tag-*`/`--tag-*-text` — trocados pelas variáveis. A curadoria manual das cores (pra evitar colisão com o hash automático) continua a mesma, só o valor virou referência em vez de repetição.

**Achado à parte, mais elaborado:** `PALETA_PASTEL_HEX` (`JS_Utilitarios.html`) — array de 12 hex que espelha as classes `.avatar-pastel-1..12` — é consumido de duas formas: (1) via `corPastelHex()`, num `style=""` de SVG (contexto DOM normal); (2) direto, como `backgroundColor` dos 3 gráficos de rosca "por Membro" (Kanban, Capacitações, Visitas Técnicas) — contexto canvas de verdade. Como o mesmo array alimenta os dois, não dava pra só trocar por strings `var()` (quebraria os gráficos) — a correção usa `corVar()` (já criado na rodada anterior) pra resolver os 12 tokens `--tag-*-text` em tempo de execução, funcionando nos dois contextos ao mesmo tempo.

Mesma validação de sempre (grep + balanceamento de chaves). Um ponto para conferir visualmente: em `showConfirm()`, a cor do ícone SVG é aplicada via `svg.setAttribute('stroke', cfg.cor)` (atributo XML puro, não `.style`) — navegadores modernos resolvem `var()` aí também, mas vale abrir um modal de Excluir/Arquivar depois do push pra confirmar que o ícone continua colorido.

`.btn-pdf-email:hover` também foi alinhado nessa mesma linha de raciocínio: usava `filter: brightness(0.92)` em vez de trocar pra `var(--success-text)` (a técnica que os outros 2 botões com o mesmo fundo — `.btn.success`, `.btn-action-icon.email` — já usavam) — mesma inconsistência de sempre (mesmo componente, técnica de hover diferente), corrigida.

### Sétima rodada — auditoria dos 5 PDFs gerados pelo sistema (26/07/2026)

Auditoria completa dos 5 PDFs (Painel de Indicadores, Cartões Arquivados, Matriz de Risco, Acompanhamento de Ações, Riscos e Planos Arquivados): mapeado todo o pipeline (`CFG_PDF` → `montarHtml...Pdf()` → `_envelopeHtml()` → `gerarPdfDeHtml`/`enviarPdfDeHtml` no servidor) e comparado o que cada um deveria representar com o que o código realmente produz.

**Achado crítico:** badges de status/prioridade perdiam toda a cor em 4 dos 5 PDFs (todos os que clonam uma lista/tabela real da tela — só o Painel de Indicadores usa captura de tela via `html2canvas` e não é afetado). Causa: o sistema colore badges por classe CSS (`class="tag-badge tag-brick"`) desde a refatoração documentada na Primeira rodada (§10) — mas `_converterBadgesParaPdf()` só sabia extrair cor de um atributo `style=""` inline que os badges não têm mais, então nunca fazia nada, e a folha isolada do PDF nunca teve as classes de cor (`.badge-success`, `.tag-brick` etc.) definidas, só a forma. Corrigido adicionando as ~16 classes de cor que faltavam na folha isolada — **só borda + texto colorido, sem fundo**, porque o conversor de PDF do Apps Script não renderiza `background-color` de forma confiável em `<div>`/`<span>` (limitação já documentada no próprio código, testada e comprovada) — e removendo `_converterBadgesParaPdf`/`_extrairCorTexto` (ficaram sem função nenhuma).

**Código morto removido** (nunca chamado por nenhum dos 5 PDFs ativos — o Painel de Indicadores usa só `html2canvas`): `_pdfKpiCell`, `_imgDeCanvas`, `_pdfGraficoCel`, `_pdfDoughnutComLegendaCel` (`JS_Utilitarios.html`), `graficosKanbanPdfHtml` (`JS_Kanban.html`), `graficosCapacitacoesPdfHtml` (`JS_Capacitacoes.html`), `graficosVisitasPdfHtml` (`JS_VisitasTecnicas.html`) — e as ~14 classes CSS que só elas emitiam na folha isolada (`.pdf-kpi-*`, `.pdf-chart-*`, `.pdf-legend-*`, `.pdf-table-spaced*`, `.matrix-table`/`.badge-cluster`/`.risk-badge`, que nunca chegam a ser emitidas porque a Matriz de Risco vai pro PDF como imagem).

**`montarHtmlIndicadoresPdf()` tornado robusto:** decidia o título de cada seção só pela posição no array (`i===1` Tarefas, `i===2` Capacitações, `i===4` Visitas Técnicas) — conferido que batia com o HTML de hoje, mas quebraria silenciosamente se alguém adicionasse/removesse um gráfico no futuro. Trocado por busca dinâmica: sobe pelos `previousElementSibling` até achar o `<h3 class="tl-section-title">` mais próximo.

**Mecanismo de impressão vestigial removido:** `.pdf-header`/`.print-target` (`CSS.html` + `View_Kanban.html`/`View_Riscos.html` ×3/`View_Monitoramento.html`) — zero CSS ativo (`.pdf-header` sempre `display:none`), zero uso em JS, resíduo de uma abordagem de "imprimir do navegador" anterior ao pipeline atual.

**2 bugs de alinhamento visual encontrados depois, testando o resultado, e corrigidos (só nos arquivos de PDF):**
- **Cartões Arquivados**: a coluna "Tempo de Execução" aparecia desalinhada do cabeçalho. Causa: `_gridRowsParaPdf()` remonta cada linha (`<div>` vira `<td>`) copiando só o atributo `style=""` da célula original — mas o alinhamento (`.text-center`) vem de **classe**, não de style inline, e nenhuma célula dessa tabela usa style inline (confirmado). Corrigido preservando a classe também; a captura de `style=""` (morta, nunca tinha nada pra pegar nessa tabela) foi removida.
- **Acompanhamento de Ações**: Macroetapa/Categoria/Causa/Consequência apareciam cada uma na sua própria linha, com o separador "|" isolado entre elas. Causa: `.risk-meta` usa `display:flex` na tela pra por tudo numa linha, mas cada campo é um `<div>` (bloco por padrão) — o conversor de PDF não renderiza `flex` de forma confiável (mesmo problema já documentado com `grid`), então cada `<div>` voltava a quebrar linha sozinho. Corrigido forçando esses `<div>` a `display:inline` só dentro do clone do PDF (`montarHtmlAcompanhamentoPdf`) — `montarHtmlRiscoArquivadoPdf` (Riscos Arquivados) tem a mesma estrutura e provavelmente o mesmo bug, mas não foi tocado (fora do escopo pedido).

### Oitava rodada — bugs encontrados testando a interface (26/07/2026)

- **Ícone de calendário sumindo em campos compactos**: `.field-input-compact` (usada em Licença Servidor/Prêmio, Demais Afastamentos, Abono Aniversário — modal de Afastamentos) usa `padding: 4px !important`, que zera o `padding-right: 32px` que o `input[type="date"]` base reserva pro ícone — colava o ícone no texto. Corrigido com `input[type="date"].field-input-compact { padding-right: 32px !important; }`, restaurando só o lado direito.
- **Modal de Afastamentos estourando a largura**: ao corrigir o ícone acima (que também afeta os campos de data normais — ver Sexta rodada), a coluna "Licença Servidor/Prêmio" ficou larga demais pro espaço do `.modal-box.lg` (600px), forçando rolagem horizontal. Corrigido trocando pra `.modal-box.wide` (800px, classe já existente, usada no modal do cartão do Kanban e em 3 modais de Riscos — mesmo tipo de formulário rico em colunas) em vez de inventar um valor novo.
- **Caixa "Novo ano"** (Férias/Afastamentos): campo de ano e botões Adicionar/Cancelar não seguiam o formato de pílula padrão do sistema. Ajustados pra `border-radius: pill` + mesmo tamanho (`padding`/`font-size`) do `.btn-create` ("+ Novo Ano") ao lado.
- **Bug real achado ao mexer no botão Cancelar dessa caixa:** `class="btn btn-secondary"` — mas a classe certa é `secondary` (sem o prefixo `btn-`); `.btn-secondary` não existe em lugar nenhum do CSS, então o botão renderizava sem nenhum estilo (sem fundo, sem borda). Varredura no projeto inteiro achou o mesmo erro em **mais 7 botões** (`btn-primary`/`btn-secondary`/`btn-danger`, sempre com o prefixo indevido): `View_Capacitacoes.html` (Cancelar), `View_Comum.html` (3 modais compartilhados — "OK - Adicionar Selecionados", Cancelar/Enviar PDF, Cancelar/Excluir, Entendi), `View_Unidades.html` (Cancelar), `View_VisitasTecnicas.html` (Cancelar). Todos corrigidos (8 botões ao todo).

### Nona rodada — cor de identidade sem colisão para os membros (26/07/2026)

Os 4 gráficos "por Membro" do Painel de Indicadores (Kanban ×2, Capacitações, Visitas Técnicas) coloriam cada fatia **por posição** no array ordenado (`i % 12`), não pela identidade da pessoa — a mesma pessoa podia aparecer com cores diferentes em gráficos diferentes (e até entre os 2 gráficos do próprio Kanban, já que cada um filtra um conjunto diferente de membros). O usuário pediu pra usar a mesma cor do avatar.

**Risco identificado antes de implementar:** hash puro (`_hashPastel`, só 12 cores) pode fazer duas pessoas diferentes caírem na mesma cor — e isso **já aconteceu de verdade** neste projeto (comentário em `JS_Kanban.html` sobre `LABELS_DISPONIVEIS`: "o hash de corPastelPorNome() colidia em duas delas", só com 7 itens). Resolvido com um mapa único (`_mapaCoresMembros()`, `JS_Utilitarios.html`) que roda uma vez sobre `membrosOrdenados()` (lista estável de membros ativos, já existente e reaproveitada em várias partes do sistema) e resolve toda colisão de uma vez — se o hash de alguém colidir com quem já ganhou aquele tom, avança pro próximo livre da paleta. Resultado: **avatar e gráfico usam a mesma fonte de cor**, não só cada gráfico consistente consigo mesmo.

Duas funções novas consomem esse mapa: `corMembroPorNome()` (classe, pros avatares — trocou `corPastelPorNome()` em 4 lugares: lista de Membros do Kanban, lista de Membros e Escala/Férias em Pessoas, avatar do usuário logado na sidebar) e `corMembroHex()` (hex puro, pros 4 gráficos — trocou o cálculo por posição, removendo os aliases `chartColors`/`chartColorsCap`/`chartColorsVt` que ficaram sem uso). `corPastelPorNome`/`corPastelHex`/`corLabel()` (etiquetas do Kanban) não foram tocados — continuam servindo as etiquetas exatamente como antes, sem nenhuma ligação com a lista de membros.

Membro inativo/histórico (não está em `membrosOrdenados()`, ex.: responsável de um cartão arquivado antigo) cai no hash puro sem garantia de colisão — caso raro, documentado, nunca quebra. Acima de 12 membros ativos, repetição de cor volta a ser inevitável (limite físico da paleta) — mesma limitação de antes, não uma regressão.

### Correção — texto invisível no botão dos modais de confirmação (27/07/2026)

**Regressão introduzida pela própria oitava rodada**, reportada pelo usuário ao testar em produção depois do `clasp push`: o botão de confirmar dos modais aparecia com texto vermelho sobre fundo dourado ("Inativar") ou **sem texto visível** ("Excluir", vermelho sobre vermelho).

**Causa:** a oitava rodada corrigiu 8 botões que usavam a classe errada (`class="btn btn-danger"` → `class="btn danger"`). A correção estava certa, mas `#btn-confirmar-excluir` (`View_Comum.html:44`) é **o único dos 8 que também recebe estilo inline** — de `showConfirm()` (`JS_Utilitarios.html`). Enquanto a classe não existia, nenhuma regra de cor se aplicava e o texto ficava na cor padrão do navegador; o fundo vinha do inline. **Funcionava por acidente.** Ao ativar `.btn.danger` (`CSS.html:878`), que é um botão *fantasma* (`background: var(--bg-card); color: var(--danger); border: 1px solid var(--danger-border)`), o texto passou a ser vermelho — enquanto `showConfirm()` sobrescrevia inline **apenas `background` e `borderColor`**, nunca `color`.

Afetava os quatro estados do mesmo botão: Excluir (vermelho/vermelho), Arquivar e Restaurar (vermelho/dourado) e o feedback de sucesso (vermelho/verde, este ainda não observado pelo usuário).

**Correção:** uma linha em `showConfirm()` — `btn.style.color = 'var(--text-inverse)'`, ao lado das duas sobrescritas que já existiam. Segue a convenção já estabelecida para botão sólido colorido no sistema (`.btn.success` e `.btn-action-icon`: fundo colorido + texto inverso) e cobre os quatro estados de uma vez. Verificado que os outros 7 botões da oitava rodada **não** recebem estilo inline, então nenhum outro foi afetado.

**Ressalva registrada:** branco sobre o dourado `#C99A2E` dá ~2,6:1 de contraste, abaixo do WCAG AA. Isso **já é característica da paleta atual** (`.btn.success`, branco sobre menta, dá ~2,9:1) e não foi introduzido aqui — corrigir exigiria recalibrar a paleta de botões sólidos, o que afeta várias telas e ficou fora do escopo desta correção.

**Lição:** corrigir um seletor que estava errado **ativa regras que estavam dormentes**. Sempre que um typo de classe for corrigido, verificar se o elemento também recebe `style` inline — a regra recém-ativada pode brigar com o inline e só sobrescrever parte das propriedades. É a mesma classe de colisão registrada nos achados B1/B3 de §8.20.
