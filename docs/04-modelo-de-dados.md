# 04 — Modelo de Dados

O sistema usa **Google Sheets** como banco de dados. A planilha ativa contém 8 abas (tabs), cada uma representando uma tabela. As abas são criadas automaticamente na primeira execução via `conectarAba()`, que também realiza migrações de schema (adição de colunas ausentes).

---

## Aba: Tarefas

**Constante:** `SHEET_TASKS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | ID | String | Identificador único (ex: `T1`, `T2`) |
| 2 | Status | String | `Backlog` / `A Fazer` / `Em Andamento` / `Em Revisão` / `Concluído` |
| 3 | Título | String | Título do cartão Kanban |
| 4 | Descrição | String | Descrição detalhada |
| 5 | Responsável_ID | String | IDs dos membros separados por vírgula |
| 6 | Prioridade | String | `Baixa` / `Média` / `Alta` / `Urgente` |
| 7 | Data Criação | String | Data de criação (formato `DD/MM/YYYY`) |
| 8 | Data Início | String | Data de início |
| 9 | Prazo | String | Data limite |
| 10 | Data Conclusão | String | Data de conclusão |
| 11 | Atividades | String | JSON serializado com array de atividades/comentários |
| 12 | Arquivado | String | `''` (nunca decidido) / `Sim` / `Não` |

**Lógica de auto-arquivo:** Cartões em `Concluído` com `Arquivado = ''` há 15+ dias são automaticamente arquivados no momento do carregamento (`getKanbanData`). Ao restaurar, `Arquivado` recebe `Não` para impedir re-arquivamento.

---

## Aba: Membros

**Constante:** `SHEET_MEMBERS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | ID | String | Identificador único (ex: `M1`) |
| 2 | Nome | String | Nome completo do membro |
| 3 | Cargo | String | Cargo na comissão |
| 4 | Email Funcional | String | E-mail corporativo |

---

## Aba: Unidades

**Constante:** `SHEET_UNITS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | Nome da Unidade | String | Nome completo da unidade/subcomissão |
| 2 | Sigla | String | Sigla única (usada em códigos de documentos) |
| 3 | E-mail Funcional | String | E-mail da unidade |

**Restrição:** A sigla deve ser única. `salvarUnidade()` verifica duplicatas antes de inserir.

---

## Aba: Documentos

**Constante:** `SHEET_DOCS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | Código | String | Código único gerado automaticamente (ex: `IT-ABC-01`) |
| 2 | Versão | String | Número da versão (ex: `1.0`) |
| 3 | Tipo | String | Tipo de documento (ver lista abaixo) |
| 4 | Título | String | Título do documento |
| 5 | Data Aprovação | String | Data de aprovação formal |
| 6 | Próxima Revisão | String | Data calculada (+1 ano da aprovação) |
| 7 | Status | String | Calculado na leitura (ver lógica abaixo) |
| 8 | Responsável | String | Responsável pelo documento |
| 9 | E-mail | String | E-mail do responsável |
| 10 | Link Principal | String | URL do documento principal |
| 11 | Doc Auxiliar 1 | String | URL de documento auxiliar |
| 12 | Doc Auxiliar 2 | String | URL de documento auxiliar |
| 13 | Revisão | String | `Sim` indica versão obsoleta |

**Tipos de documento e siglas:**

| Tipo | Sigla |
|---|---|
| Instrução de Trabalho | IT |
| Plano de Fiscalização | PF |
| Procedimento | PRO |
| Política | POL |
| Regimento Interno | RI |
| Manual | MAN |
| Guia | GUI |
| Formulário | FOR |

**Formato do código:** `{SIGLA_TIPO}-{SIGLA_UNIDADE}-{NN}` (ex: `IT-CEQP-01`)

**Lógica de status (calculada em `getRestoData`):**

```
Se sem Data Aprovação          → "Em Elaboração"
Se marcado como Obsoleto       → "Obsoleto"
Se Próxima Revisão < hoje      → "Vencido"
Se Próxima Revisão ≤ hoje+60d  → "Próximo da Revisão"
Caso contrário                 → "Vigente"
```

**Padrão de versionamento:** Ao publicar uma nova revisão (`salvarRevisaoDocumento`), a linha antiga recebe `Revisão = Sim` e uma nova linha é inserida com versão incrementada, preservando o histórico.

---

## Aba: Riscos

**Constante:** `SHEET_RISKS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | Data | String | Data de registro |
| 2 | ID Risco | String | Identificador único (ex: `R1`) |
| 3 | Macroetapa | String | Macroetapa do processo |
| 4 | Risco | String | Descrição do risco |
| 5 | Causa | String | Causa raiz |
| 6 | Consequência | String | Impacto esperado |
| 7 | Categoria | String | Categoria do risco |
| 8 | Probabilidade | Number | 1–5 |
| 9 | Impacto | Number | 1–5 |
| 10 | Nível | String | Calculado: Baixo / Médio / Alto / Crítico |
| 11 | Tipo Tratamento | String | Aceitar / Mitigar / Transferir / Eliminar |
| 12 | Responsável | String | Responsável pelo risco |
| 13 | Status | String | `Mapeado` / `Em Tratamento` / `Obsoleto` |
| 14 | Motivo | String | Motivo de obsolescência (revisões) |

**Padrão de versionamento:** Igual aos documentos — revisão cria nova linha, antiga recebe `Status = Obsoleto`.

---

## Aba: Planos_Acao

**Constante:** `SHEET_PLANS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | Data Registro | String | Data de criação do plano |
| 2 | ID Risco | String | Referência ao risco vinculado |
| 3 | O Que | String | O que será feito (What) |
| 4 | Por Que | String | Por que será feito (Why) |
| 5 | Quem | String | Quem é responsável (Who) — `TODAS` = todas as unidades |
| 6 | Onde | String | Onde será feito (Where) |
| 7 | Data Prevista | String | Quando previsto (When) |
| 8 | Data Finalização | String | Data real de conclusão |
| 9 | Como | String | Como será feito (How) |
| 10 | Quanto Custa | String | Quanto custará (How Much) |
| 11 | Status | String | Em Andamento / Concluído / Atrasado / Arquivado |
| 12 | Motivo Cancelamento | String | Justificativa de arquivamento |
| 13 | Versão | String | `Superado` indica versão substituída |

**Regra:** Apenas um plano ativo por risco. `salvarPlano()` verifica existência antes de criar.

**Status automático (`_statusPlano`):**
```
Se Motivo Cancelamento preenchido → "Arquivado"
Se Data Finalização preenchida    → "Concluído"
Se Data Prevista < hoje           → "Atrasado"
Caso contrário                    → "Em Andamento"
```

---

## Aba: Entregas_Acoes

**Constante:** `SHEET_DELIVERY`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | Data Registo | String | Data do registro da entrega |
| 2 | Risco Vinculado | String | ID do risco relacionado |
| 3 | Unidade | String | Sigla da unidade que entregou |
| 4 | Status | String | `Pendente` / `Entregue` |
| 5 | Data Entrega | String | Data efetiva da entrega |
| 6 | Tipo Doc | String | Tipo de evidência (ver lista abaixo) |
| 7 | SEI | String | Número do processo SEI |
| 8 | Obs | String | Observações |
| 9 | Usuário | String | E-mail do usuário que registrou |
| 10 | Status Sistema | String | `Ativo` / `Arquivado` |

**Tipos de evidência disponíveis:**
- Relatório Técnico
- Formulário/Check-list
- Planilha de Controle
- Ata de Reunião
- Lista de Presença
- Certificado
- POP/IT
- Registro Fotográfico
- Print de Tela SEI
- Termo de Recebimento
- Outros

---

## Aba: Logs

**Constante:** `SHEET_LOGS`

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | Data/Hora | String | Timestamp da operação |
| 2 | Usuário | String | E-mail do usuário ativo (`Session.getActiveUser().getEmail()`) |
| 3 | Ação | String | Tipo de ação (ex: `TAREFA_CRIADA`, `RISCO_MAPEADO`) |
| 4 | Referência | String | ID do item afetado |
| 5 | Detalhes | String | Descrição textual da operação |

`buscarLogs()` retorna as últimas 300 entradas em ordem decrescente (mais recente primeiro).

---

## Inicialização e Migração de Schema

`conectarAba(nome, cabecalhos)` é chamado a cada operação e garante:
1. Cria a aba se não existir
2. Adiciona colunas ausentes ao final (migração forward-only)
3. Nunca remove ou reordena colunas existentes

Uma migração pontual remove a coluna `Carimbo` da aba Documentos (via `migrarRemoverCarimboDocumentos()`), executada uma única vez na inicialização.
