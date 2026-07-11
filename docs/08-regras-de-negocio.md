# 08 — Regras de Negócio

## RN-01 — Auto-arquivo de Tarefas

**Contexto:** Tarefas em `Concluído` ocupam espaço no quadro Kanban indefinidamente.

**Regra:** Ao carregar o sistema (`getKanbanData`), qualquer tarefa com:
- `Status = Concluído`
- `Arquivado = ''` (campo nunca preenchido manualmente)
- `Data Conclusão` com 15+ dias atrás

...é automaticamente arquivada (campo `Arquivado = Sim`).

**Constante:** `DIAS_PARA_ARQUIVAR = 15`

**Proteção contra re-arquivo:** Ao restaurar uma tarefa, o campo `Arquivado` recebe `Não` (string). A condição de auto-arquivo exige `Arquivado = ''`, portanto tarefas restauradas nunca são re-arquivadas automaticamente.

---

## RN-02 — Cálculo de Nível de Risco

**Fórmula:** `Nível = Probabilidade × Impacto`

| Score | Nível | Cor |
|---|---|---|
| 1–4 | Baixo | Verde |
| 5–9 | Médio | Amarelo |
| 10–14 | Alto | Laranja |
| 15–25 | Crítico | Vermelho |

Implementado em `calcularNivelRisco(p, i)` no `Código.js`.

---

## RN-03 — Status Automático de Documentos

Calculado em tempo de leitura (`getRestoData`) — não é armazenado na planilha.

```
1. Se coluna "Data Aprovação" vazia           → "Em Elaboração"
2. Se coluna "Revisão" = "Sim"                → "Obsoleto"
3. Se "Próxima Revisão" < data atual          → "Vencido"
4. Se "Próxima Revisão" ≤ data atual + 60d   → "Próximo da Revisão"
5. Caso contrário                             → "Vigente"
```

---

## RN-04 — Geração Automática de Código de Documento

**Formato:** `{SIGLA_TIPO}-{SIGLA_UNIDADE}-{NN}`

- `SIGLA_TIPO` é derivada do tipo selecionado (ex: Instrução de Trabalho → `IT`)
- `SIGLA_UNIDADE` é a sigla cadastrada na unidade
- `NN` é sequencial, calculado contando documentos existentes com mesmo tipo+unidade e somando 1. Não reutiliza números de documentos excluídos.

**Exemplo:** 3º documento do tipo `Procedimento` da unidade `CEQP` → `PRO-CEQP-03`

---

## RN-05 — Próxima Revisão de Documento

**Regra:** A data da próxima revisão é sempre **+1 ano** a partir da Data de Aprovação.

Implementado em `calcularProximaRevisao(dataStr)`.

---

## RN-06 — Versionamento de Documentos

**Regra:** Ao publicar nova versão:
1. A linha atual recebe `Revisão = Sim` (histórico preservado)
2. Uma nova linha é inserida com novos dados e versão incrementada

Histórico permanece na planilha e é exibido na view "Histórico de Revisões".

Não há exclusão de versões anteriores — todas são mantidas para rastreabilidade.

---

## RN-07 — Sigla de Unidade Única

**Regra:** Duas unidades não podem ter a mesma sigla. `salvarUnidade()` verifica unicidade antes de inserir e retorna erro caso haja duplicata.

A sigla é usada como componente do código de documentos, portanto deve ser imutável após uso em documentos.

---

## RN-08 — Um Plano Ativo por Risco

**Regra:** Cada risco pode ter no máximo **um plano de ação ativo**. `salvarPlano()` verifica a existência de plano ativo antes de criar um novo.

Para criar um novo plano é necessário primeiro arquivar o plano atual (via `atualizarPlano` com motivo de cancelamento).

O replanejamento (`salvarRevisaoPlano`) arquiva o plano atual e cria um novo em uma operação atômica.

---

## RN-09 — Status Automático do Plano de Ação

**Regra** (calculada em `_statusPlano`):

```
Se Motivo Cancelamento preenchido  → "Arquivado"
Se Data Finalização preenchida     → "Concluído"
Se Data Prevista < hoje            → "Atrasado"
Caso contrário                     → "Em Andamento"
```

Ordem de verificação: Arquivado → Concluído → Atrasado → Em Andamento.

---

## RN-10 — Auto-conclusão do Plano por Entregas (`_reavaliarBaixa`)

**Contexto:** Um plano cujo campo `Quem` seja `TODAS` depende das entregas de todas as unidades.

**Regra:**
- Após cada `salvarEntrega` ou `atualizarEntrega`, `_reavaliarBaixa` é invocado
- Se **todas as unidades** têm entrega com `Status = Entregue` → `plano.Data Finalização = hoje` + `Status = Concluído`
- Se qualquer entrega for revertida (Status ≠ Entregue) → `plano.Data Finalização = ''` (plano re-abre automaticamente)

---

## RN-11 — Exclusão em Cascata de Riscos

**Regra:** Ao excluir um risco (`excluirRisco`):
1. Remove todas as linhas da aba `Riscos` com aquele `ID Risco`
2. Remove todas as linhas de `Planos_Acao` com aquele `ID Risco`
3. Remove todas as linhas de `Entregas_Acoes` com aquele `Risco Vinculado`

A operação inteira é envolvida em `comBloqueio()`.

---

## RN-12 — Geração de IDs Sequenciais

**Função:** `getNextId(sheetName, prefixo)`

Lê todos os valores da coluna de ID da aba indicada, extrai o maior número, e retorna `{prefixo}{N+1}`.

| Módulo | Prefixo | Exemplo |
|---|---|---|
| Tarefas | `T` | `T1`, `T2`, ... |
| Membros | `M` | `M1`, `M2`, ... |
| Riscos | `R` | `R1`, `R2`, ... |

IDs não são reutilizados após exclusão — o próximo ID sempre é `max + 1`.

---

## RN-13 — Controle de Concorrência

**Regra:** Toda operação de escrita no Google Sheets é encapsulada em `comBloqueio(operacao)`:
- Usa `LockService.getScriptLock()` com timeout de 10 segundos
- Garante que apenas uma escrita ocorre por vez, mesmo com múltiplos usuários simultâneos
- O lock é sempre liberado no `finally`, mesmo em caso de erro

---

## RN-14 — Log de Auditoria Obrigatório

**Regra:** Toda operação de escrita registra uma entrada na aba `Logs` com:
- Timestamp (`DD/MM/YYYY HH:mm:ss`)
- E-mail do usuário ativo (`Session.getActiveUser().getEmail()`)
- Tipo de ação
- Referência ao item (ID)
- Descrição detalhada

O log é append-only — entradas nunca são editadas ou excluídas.

---

## RN-15 — Versionamento de Riscos

**Regra:** Ao revisar um risco:
1. Linha atual recebe `Status = Obsoleto` e `Motivo` preenchido
2. Nova linha inserida com novos dados e `Status = Mapeado`

Histórico preservado na planilha para auditoria.

---

## RN-16 — Arquivamento de Entregas com Plano

**Regra:** Ao arquivar um plano (`atualizarPlano` com motivo de cancelamento preenchido), todas as entregas vinculadas ao risco recebem `Status Sistema = Arquivado`.

Isso remove as entregas da visualização ativa sem excluí-las.

---

## RN-17 — Migração Automática de Schema

**Regra:** `conectarAba()` é chamado antes de qualquer operação em uma aba:
- Se a aba não existe → criada com os cabeçalhos definidos
- Se faltam colunas → adicionadas ao final (nunca removidas)
- Se colunas extras existem → ignoradas (não remove dados legados)

Migração específica: `migrarRemoverCarimboDocumentos()` remove a coluna `Carimbo` da aba Documentos se presente (migração pontual executada uma vez).
