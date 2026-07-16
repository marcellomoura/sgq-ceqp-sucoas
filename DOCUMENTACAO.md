# Auditoria Técnica e Documentação — Sistema de Gestão da Qualidade (SGQ · CEQP)

> **Documento oficial do projeto.** Auditoria técnica + documentação de engenharia reversa produzida a partir da leitura integral do código-fonte (16 arquivos, ~8.400 linhas). Toda afirmação foi extraída do código; onde há incerteza, está sinalizado explicitamente. Data-base: 2026-07-16.
>
> **Escopo:** 7 arquivos `.js` (backend Apps Script, ~2.478 linhas) + 9 arquivos `.html` (cliente: 1 view, 1 CSS, 7 módulos JS, ~5.900 linhas).

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
| P11 | Código morto: `histJson` em `renderRiscosArquivados`; `state.afastamentos` fora da inicialização de `state` | Clean Code | **Baixo** |
| P12 | `gerarPdfDeHtml` (download) **sem** rate limit (só o envio por e-mail tem) | Performance | **Baixo** — ✅ *Resolvido (Fase 5.3, 2026-07-16): helper `_limitePdfExcedido_` compartilhado; download com janela curta (3s) e chave própria, sem bloquear downloads sequenciais legítimos.* |

---

## 2. Arquitetura Atual

### 2.1 Visão geral e objetivo
Sistema de gestão da qualidade da **Comissão Especial de Qualidade e Padronização (CEQP · SUCOAS · SES/DF)**. Consolida seis domínios num único quadro: **Pessoas** (membros, escala semanal, afastamentos), **Tarefas** (Kanban), **Capacitações**, **Unidades/Subcomissões**, **Documentos** (lista mestra + revisões), **Riscos** (matriz 5×5, planos 5W2H, entregas) e **Monitoramento** (indicadores + trilha de auditoria).

### 2.2 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENTE (navegador) — SPA renderizada via HtmlService        │
│  Index.html  ← estrutura (views + modais), inclui os JS      │
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
│  Modulo_Tarefas / _Pessoas / _Unidades / _Documentos /       │
│  _Riscos / _Capacitacoes  ← serviços de escrita por domínio  │
└───────────────────────────────┬─────────────────────────────┘
                                 │ SpreadsheetApp / Cache /
                                 │ Properties / Lock / Mail
┌────────────────────────────────▼────────────────────────────┐
│ DADOS — Google Sheet (11 abas) + ScriptProperties + Cache    │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Fluxo de execução (inicialização)

1. `doGet()` → `isMembro_()` (bloqueia não-membros com "Acesso Negado") → renderiza `Index` template, que faz `include_()` de CSS e dos 7 JS.
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
| `saveTask`/`updateTaskStatus`/`deleteTask`/`arquivarTarefaManual`/`restaurarTarefaArquivada` | Modulo_Tarefas | `salvarTarefa`/`drop`/`confirmarExcluirTarefa`/`confirmarArquivarTarefa`/`restaurarTarefa` |
| `saveMember`/`inativarMembro`/`reativarMembro` | Modulo_Tarefas | `salvarMembro`/`inativarMembro`/`reativarMembro` |
| `salvarEscala`/`salvarAfastamento` | Modulo_Pessoas | `confirmarEscala`/`confirmarFerias` |
| `salvarUnidade`/`atualizarUnidade`/`excluirUnidade`/`inativarUnidade`/`reativarUnidade` | Modulo_Unidades | `confirmarUnidade`/`excluirUnidade`/… |
| `salvarDocumento`/`atualizarDocumento`/`salvarRevisaoDocumento`/`excluirDocumento` | Modulo_Documentos | `salvarDocumento`/`confirmarEdicaoDoc`/`publicarRevisaoDoc`/`excluirDoc` |
| `salvarRisco`/`atualizarRisco`/`reavaliarRisco`/`excluirRisco`/`restaurarRisco` | Modulo_Riscos | módulo Riscos |
| `salvarPlano`/`atualizarPlano`/`excluirPlano`/`revisarPlano`/`salvarEntregasEmLote` | Modulo_Riscos | módulo Riscos |
| `salvarCapacitacao`/`atualizarCapacitacao`/`excluirCapacitacao` | Modulo_Capacitacoes | `salvarFormCapacitacao`/`excluirCapacitacaoConfirm` |
| `gerarPdfDeHtml`/`enviarPdfDeHtml` | Código.js | `_gerarPdfReal`/`_dispararEnvioPdfReal` |

### 3.2 Dependências internas do servidor (quem depende de quem)

- **Núcleo compartilhado (Código.js):** `colIdx_`, `comBloqueio`, `conectarAba`, `safeGetSheet(Data)`, `isMembro_`, `membrosParaAuth_` (+ cache), `getNextId_`, `registrarLog`, `formatarDataParaUI`, `_dataLocalISO_`, `linkPermitido_`, `calcularNivelRisco`, `calcularProximaRevisao` — **usados por todos os módulos.**
- **`isMembro_` → `membrosParaAuth_` → `conectarAba(SHEET_MEMBERS)`** roda no início de **praticamente toda** chamada (mitigado por `ScriptCache` de 6h, invalidado em escrita de membro).
- **Cadeia de setup/migração (crítica de ordem):** `setupDatabaseKanban` → `_migrarEremoverColunaAtividades_` → `_reordenarColunasTarefas_` → `conectarAba`. **Tem de rodar antes de qualquer leitura de Tarefas** (senão `colIdx_` cai na coluna errada). Idempotente via `ScriptProperties` + re-checagem dentro do lock.
- **Acoplamento cruzado por dados:** `excluirUnidade` → `contarReferenciasUnidade_` lê Documentos/Riscos/Planos (integridade referencial); `reavaliarRisco` marca `Revisão Pendente` nos planos; `salvarEntregasEmLote` → `_reavaliarBaixa` lê Unidades.

### 3.3 Estado do cliente
`var state = { tasks, archivedTasks, members, units, docs, risks, plans, deliveries, history, trainings }` — fonte única no cliente. **Observação (P11):** `afastamentos` é usado (`state.afastamentos`) mas **não** está na inicialização de `state`, contradizendo o comentário que diz declarar tudo para evitar chaves que "aparecem só após a carga".

### 3.4 Funções órfãs / código morto
- `histJson` em `renderRiscosArquivados` (JS_Riscos.html ~L786): declarada, nunca usada, com comentário-nota em inglês (`// Wait, ... // Actually...`).
- Comentário final em Modulo_Riscos.js: nota sobre função de PDF que "não é mais necessária aqui" — ruído inofensivo.
- Não há funções GS expostas sem chamador (todos os endpoints são invocados pelo cliente).

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
- **Problemas:** funções longas com alta complexidade ciclomática — `renderTasks` (JS_Kanban), `renderFerias` (JS_Pessoas), `renderAcompanhamento`/`abrirModalAcompEntregas` (JS_Riscos), `saveTask` (Modulo_Tarefas); código morto (P11); referências a auditorias antigas nos comentários (`A03`, `B17`, `C04`, `H03`) — rastreabilidade útil, mas viram ruído sem um índice.

---

## 5. Plano de Refatoração (faseado, seguro, preservando comportamento)

**Fase 1 — Correções críticas / segurança (baixo risco)**
1. Revisar modelo de implantação (P1) — **DECIDIDO (2026-07-16): manter `USER_ACCESSING`.** A migração para `USER_DEPLOYING` foi descartada: como os membros logam com conta **pessoal** (@gmail), `Session.getActiveUser().getEmail()` retornaria vazio sob "executar como o dono" e bloquearia todos. A autenticação permanece inalterada. O furo (membro editar a planilha crua) é tradeoff inerente e deve ser mitigado por controle de compartilhamento da planilha, não por código.
2. Fixar versões dos CDNs (P4): `chart.js@4.x.x`, e idealmente adotar Subresource Integrity (SRI) ou auto-hospedar os assets como `.html` servidos por `HtmlService`.
3. Remover código morto (P11): `histJson`; adicionar `afastamentos: []` à inicialização de `state`.

**Fase 2 — Performance / escalabilidade**
4. Rotação de `Logs` e `Atividades` (P3) — **✅ FEITO (Fase 2.1, 2026-07-16).** Duas funções admin em `Código.js` (nome com `_` final → não chamáveis pelo cliente; rodam pelo editor como o dono): `diagnosticoAbas_()` (relatório de células por aba × teto de 10M, só leitura) e `arquivarLogsAntigos_(mesesRetencao=12)` (move Logs antigos para `Logs_Arquivo`; **sempre preserva as últimas 2.000 linhas** — a janela que a UI exibe — então nunca reduz a tela; copia+flush antes de remover, remove em lote via `_deleteRowsBatch_`, nunca apaga sem salvar). `Atividades` **não** é rotacionada: está atrelada ao ciclo de vida do cartão (ativo/arquivado precisa do histórico) e já é limpa ao excluir o cartão (2.2) + contagem cacheada (2.3).
5. Substituir `deleteRow` em laço por operações em lote (P5) — **✅ FEITO (Fase 2.2, 2026-07-16).** Criado o helper compartilhado `_deleteRowsBatch_` (Código.js), que agrupa as linhas-alvo em blocos contíguos e usa `deleteRows(início, quantidade)` por bloco. Aplicado em `_excluirAtividadesDaTarefa_`, `excluirDocumento` e `excluirPlano`. Optou-se por `deleteRows` em vez de reescrever a aba com `setValues` para não pagar custo O(N) numa aba grande (ex.: `Atividades`) nem abrir janela de perda de dados. Exclusões de linha única (`excluirUnidade`, `excluirCapacitacao`, `deleteTask`) seguem com `deleteRow`.
6. Cache da contagem de comentários, invalidado em escrita (P2) — **✅ FEITO (Fase 2.3, 2026-07-16).** Novo `CACHE_KEY_COMENTARIOS` + `invalidarCacheComentarios_` (Código.js). `_contarComentariosPorTarefa_` virou cache-aware (lê o mapa do `ScriptCache`, calcula no miss, grava com guarda de 90KB). Invalidação **só** quando a contagem muda: `_registrarAtividades_` (apenas se houver item `comment`) e `_excluirAtividadesDaTarefa_`. Mover/editar cartão (itens `log`) não invalidam → deixam de reler a aba `Atividades`. Mesmo padrão de `membros_auth`. **Não** cacheado: payload do quadro (limite de 100KB) nem `Tarefas` (precisa vir fresco). Cache de Membros avaliado e descartado (aba pequena/limitada, ganho marginal, invalidação extra em `salvarEscala` fácil de esquecer).

**Fase 3 — Arquitetura**
7. Fatiar `Código.js` em `Config.gs`, `Auth.gs`, `DataAccess.gs`, `Pdf.gs`, `Logs.gs` (P8) — **❌ DESCARTADO (2026-07-16) por decisão.** Mantém-se `Código.js` como arquivo único.
8. Centralizar regras duplicadas (P6) num único módulo servidor e expor os valores calculados ao cliente via payload, em vez de recalcular no JS.

**Fase 4 — Clean Code** — **⏭️ PULADA por decisão (2026-07-16).** Fase de menor valor (ganho só de manutenção, sem impacto para o usuário).
9. Extrair sub-funções de render longas; padronizar tudo em `data-acao` (eliminar `onclick=` inline). — *Não feito. A parte de `data-acao` está entrelaçada com o 5.1 (o `onclick` inline existe para fugir da ambiguidade do `data-idx`); será tratada junto com o 5.1, em base `data-id`.*
10. Mover estilos inline recorrentes para classes no CSS. — *Não feito (baixo valor, diff enorme, puramente cosmético).*

**Fase 5 — Escalabilidade / robustez futura**
11. Introduzir testes (ver §9) — **✅ FEITO (Fase 5.2, 2026-07-16).** `runTests_()` em `Código.js` (admin, roda pelo editor): harness próprio (sem dependência externa) com 40 asserções sobre a lógica pura. Expectativas auto-verificadas em Node antes de escrever. Não altera lógica de produção.
12. Substituir acoplamento por índice (`data-idx`) por `data-id` + lookup por id (P7) — **⏸️ NÃO FEITO / aceito (2026-07-16).** Descartado por decisão: hoje mitigado (não é bug ativo), `Planos` não têm id atômico (migração ficaria inconsistente) e o custo de validação manual (toda a app) supera o benefício preventivo.

---

## 6. Análise de Riscos das Alterações

| Alteração | Risco | Mitigação |
|---|---|---|
| Trocar `executeAs` | `getActiveUser().getEmail()` pode vir vazio para usuários fora do domínio → todos bloqueados | Testar em conta de membro real antes; manter deploy antigo como rollback |
| Fixar/auto-hospedar CDNs | Diferença de comportamento entre versões do Chart.js | Fixar exatamente a major/minor já em uso; validar cada gráfico |
| Rotacionar Logs/Atividades | Perda de histórico se a migração falhar no meio | Espelhar o padrão já existente: idempotência via `ScriptProperties`, re-checagem no lock, nunca apagar antes de confirmar a cópia |
| Refatorar `deleteRow` | Reconstrução de aba pode perder dados se interrompida | Usar `setValues` sobre as mesmas células (nunca `clearContents` + escrita), como já faz `_reordenarColunasTarefas_` |
| Fatiar `Código.js` | Ordem de carregamento GS / referências quebradas | GS concatena todos os arquivos no mesmo escopo global — mover funções não muda resolução; validar com deploy de teste |

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
| `Modulo_Tarefas.js` | Escritas de Tarefas (Kanban) e Membros. |
| `Modulo_Pessoas.js` | Escala semanal e Afastamentos (leitura + escrita). |
| `Modulo_Unidades.js` | CRUD de Unidades + integridade referencial. |
| `Modulo_Documentos.js` | Documentos: cadastro, edição, revisão (versionamento), exclusão. |
| `Modulo_Riscos.js` | Riscos, Planos 5W2H, Entregas, reavaliação, revisão de plano. |
| `Modulo_Capacitacoes.js` | CRUD de Capacitações. |
| `Index.html` | Estrutura da SPA: sidebar, header por aba (`hdr-*`), 14 views (`view-*`), ~20 modais; inclui CSS e os 7 JS. |
| `CSS.html` | Design system: tokens `:root` (cor primária `#6c5dd3`), sem framework; `@media` (768/900px), `@keyframes`, estilos de impressão (`.no-print`, `.pdf-header`). |
| `JS_Utilitarios.html` | Núcleo do cliente: `state`, navegação (`mudarTab`), delegação de eventos, `garantirRestoData`, helpers (`esc`, `badge`, `linkA`, `showConfirm`), geração de PDF (montagem HTML), logs. |
| `JS_Kanban.html` | Membros, quadro Kanban, arquivados, modal de tarefa, gráficos do Kanban, `recarregarKanban/RiscosPlanos`. |
| `JS_Riscos.html` | Matriz, planos, entregas, reavaliação, arquivados de risco, PDFs. |
| `JS_Pessoas.html` | Escala semanal e afastamentos (render + modais). |
| `JS_Documentos.html` | Lista mestra, histórico de revisões, modais de documento. |
| `JS_Unidades.html` | Render e CRUD de unidades. |
| `JS_Capacitacoes.html` | Render, KPIs, gráficos e CRUD de capacitações. |

### 8.2 Modelo de dados (11 abas)

| Aba (`SHEET_*`) | Colunas (`CABECALHOS_*`) | Chave/observações |
|---|---|---|
| `Tarefas` | ID, Status, Título, Descrição, Responsável_ID (JSON de ids), Prioridade, Data Criação, Data Início, Prazo, Data Conclusão, Etiquetas (JSON), Arquivado, Última Atualização (ms) | ID `TAR-n`. "Última Atualização" = trava otimista. Coluna legada "Atividades" migrada e removida. |
| `Membros` | ID, Nome, Cargo, Email Funcional, E-mail Pessoal, Dias Semana, Dia Presencial, Ativo | ID `MEM-n`. Email(s) = login. Inativação preserva histórico. |
| `Unidades` | ID Unidade, Nome, Sigla, E-mail Funcional, Link do Drive, Ativo | ID `UN-n`. Sigla única. Link do Drive aceita texto livre. |
| `Documentos` | Código, Versão, Tipo, Título, Data Aprovação, Próxima Revisão, Status, Responsável (id de unidade), Link Principal, Doc Auxiliar 1/2, Revisão | Código `SIGLATIPO-SIGLAUND-NN`. Revisão = nova linha + antiga vira "Obsoleto". |
| `Riscos` | ID Risco, Macroetapa, Risco, Causa, Consequência, Categoria, Probabilidade, Impacto, Nível, Tipo Tratamento, Responsável, Status, Histórico (JSON) | ID `Rn`. Soft delete (`Status=Arquivado`). Histórico = reavaliações. |
| `Planos_Acao` | ID Risco, O Que, Por Que, Quem, Onde, Data Prevista, Data Finalização, Como, Quanto Custa, Status, Revisão Pendente, Histórico (JSON), Entregas (JSON) | Vincula a Risco (`Rn`). Entregas embutidas em JSON. |
| `Afastamentos` | ID, Ano, Membro ID, Membro Nome, Férias 1/2/3, Abonos, Abono Aniversário, Licença Servidor/Prêmio (JSON), Demais Afastamentos (JSON) | ID `AF-n`. Uma linha por (Membro+Ano). |
| `Capacitações` | ID, Título, Tema, Público-alvo, Modalidade, Data Prevista, Data Realizada, Status, Lista de Presença, Responsáveis (JSON de ids) | ID `CAP-n`. Status derivado das datas. |
| `Atividades` | Tarefa ID, Tipo (comment/log), Texto, Data, Autor | Append-only, uma linha por item (substitui blob JSON que estourava 50k chars). |
| `Logs` | Data/Hora, Usuário, Ação, Referência, Detalhes | Trilha de auditoria append-only. |

> Observação: `SHEET_ATIVIDADES` (`Atividades`) e `SHEET_LOGS` (`Logs`) somam com as 8 abas de domínio acima o total de 10 abas de dados + a aba `Planos_Acao` — 11 abas no total gerenciadas pelo setup.

### 8.3 Regras de negócio identificadas
- **Autenticação/autorização:** membro = e-mail (funcional ou pessoal) presente e ativo na aba Membros. Não-membros são bloqueados em `doGet` e em cada endpoint.
- **Nível de risco:** `P×I` → ≥15 Crítico, ≥10 Alto, ≥5 Médio, senão Baixo (`calcularNivelRisco`, espelhado em `atualizarLegendaRisco`).
- **Próxima revisão de documento:** data de aprovação + 1 ano (`calcularProximaRevisao`). Status calculado: sem data de aprovação → "Em Elaboração"; ≤60 dias → "Próximo da Revisão"; vencido → "Vencido".
- **Auto-arquivamento de tarefa:** concluída há ≥15 dias (`DIAS_PARA_ARQUIVAR`) e coluna Arquivado em branco → arquivada (só em memória). `Arquivado='Não'` (restauração manual) impede re-arquivamento.
- **Status de plano:** finalizado → "Concluído"; previsto no passado → "Atrasado"; senão "Em Andamento" (`_statusPlano`).
- **Baixa automática de plano:** plano "global" (contém "TODAS") conclui quando todas as subcomissões entregam; plano específico conclui quando há ≥1 entrega "Sim" (`_reavaliarBaixa`). Status "Concluído" não reabre.
- **Reavaliação de risco** marca `Revisão Pendente=Sim` nos planos vinculados.
- **Integridade referencial:** unidade não pode ser excluída enquanto houver Documentos/Riscos/Planos apontando para ela.
- **Trava otimista:** `saveTask` (via "Última Atualização") e edições de documento/unidade/capacitação (via conferência de código/sigla/id) rejeitam gravações sobre listas desatualizadas.

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
