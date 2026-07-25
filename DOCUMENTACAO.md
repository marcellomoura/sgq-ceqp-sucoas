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
| `--success` / `--warning` / `--danger` | `#0f766e` / `#b45309` / `#dc2626` | Recalibrados nesta sessão — os tons "500" originalmente escolhidos (`#14b8a6`/`#f59e0b`/`#ef4444`) falhavam WCAG AA (contraste 2.1–3.8:1) como texto ou texto branco sobre preenchimento; os valores atuais passam em ≥4.5:1 |
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

---

## 9. Próximas Melhorias

1. **Testes:** extrair lógica pura (`calcularNivelRisco`, `_statusPlano`, `_tarefaArquivada_`, `colIdx_`, `calcularProximaRevisao`) para funções testáveis + suíte com `clasp run`/GAS testing.
2. **Observabilidade:** painel de saúde (contagem de linhas por aba, alertas de aproximação de cotas).
3. **Migração de store:** se o volume crescer muito, considerar Sheets como cache e um backend real (Firestore/BigQuery) para Logs/Atividades.
4. **Tematização:** consolidar estilos inline em classes; suporte a tema claro/escuro via tokens já existentes.
5. **Acessibilidade:** completar rótulos ARIA nas tabelas dinâmicas e feedback de status para leitores de tela.
6. **CI/CD:** pipeline `clasp push` com lint (ESLint) e verificação de versões de dependência.

---

*Documento gerado por auditoria de código read-only. Nenhum arquivo de código-fonte foi alterado na produção deste relatório.*
