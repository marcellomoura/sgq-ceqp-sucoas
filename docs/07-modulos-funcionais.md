# 07 — Módulos Funcionais

## Módulo 1 — Gestão de Tarefas (Kanban)

### Descrição
Quadro Kanban para gerenciar as tarefas da comissão com rastreabilidade completa de movimentações.

### Fluxo de trabalho

```
Backlog → A Fazer → Em Andamento → Em Revisão → Concluído → [Arquivado]
```

### Funcionalidades
- **Criação de tarefas** com título, descrição, responsáveis (multi-seleção), prioridade, data de início e prazo
- **Drag-and-drop** entre colunas (desktop e mobile via `drag-drop-touch`)
- **Histórico de atividades** dentro de cada cartão (comentários com usuário e timestamp)
- **Prioridades visuais:** Baixa (verde), Média (amarelo), Alta (laranja), Urgente (vermelho)
- **Auto-arquivo:** Cartões em `Concluído` há 15+ dias são movidos automaticamente para Arquivados
- **Restauração** de cartões arquivados (com proteção contra re-arquivamento)
- **Filtros** por status, prioridade e responsável na visualização

### Campos do cartão

| Campo | Obrigatório | Observação |
|---|---|---|
| Título | Sim | — |
| Descrição | Não | Texto livre |
| Responsável | Não | Multi-seleção de membros cadastrados |
| Prioridade | Sim | Baixa / Média / Alta / Urgente |
| Data Início | Não | — |
| Prazo | Não | Exibe alerta visual se vencido |
| Atividades | Auto | JSON com histórico de movimentações e comentários |

---

## Módulo 2 — Membros

### Descrição
Cadastro dos membros da CEQP/SUCOAS com seus cargos e contatos.

### Funcionalidades
- CRUD completo (criar, editar, excluir)
- Exibição em cards com nome, cargo e e-mail
- Membros são usados como opções nos campos "Responsável" das tarefas e riscos

### Campos

| Campo | Obrigatório |
|---|---|
| Nome | Sim |
| Cargo | Sim |
| E-mail Funcional | Sim |

---

## Módulo 3 — Dashboard

### Descrição
Painel de indicadores e gráficos para acompanhamento da gestão de tarefas.

### Indicadores (KPIs)
- Total de tarefas ativas
- Tarefas em andamento
- Tarefas concluídas
- Tarefas atrasadas (prazo vencido + não concluídas)

### Gráficos (Chart.js)
- **Distribuição por status** — Doughnut
- **Distribuição por prioridade** — Barras
- **Progresso mensal** — Linha (criações vs. conclusões)
- **Tarefas por membro** — Barras horizontais

### Tabela "Próximas Entregas"
Lista tarefas com prazo nos próximos 7 dias, ordenadas por urgência.

---

## Módulo 4 — Unidades / Subcomissões

### Descrição
Cadastro das unidades e subcomissões que participam do sistema de qualidade.

### Funcionalidades
- CRUD completo
- Validação de sigla única
- Sigla usada na geração automática de códigos de documentos
- E-mail funcional usado como destinatário de entregas

### Campos

| Campo | Obrigatório | Observação |
|---|---|---|
| Nome da Unidade | Sim | — |
| Sigla | Sim | Única; usada em códigos de docs |
| E-mail Funcional | Não | Contato da unidade |

---

## Módulo 5 — Gestão Documental

### Descrição
Lista Mestra de documentos com controle de versões, status automatizado e alertas de revisão.

### Funcionalidades

#### Lista Mestra
- Cadastro de documentos com geração automática de código
- Exibição de status com badge colorido
- Filtros por tipo, status, unidade e busca textual
- Edição de metadados
- Publicação de nova revisão (versionamento)
- Exclusão com confirmação

#### Histórico de Revisões
- Exibe todas as versões (incluindo obsoletas) de todos os documentos
- Útil para rastreabilidade e auditorias

### Geração de código de documento

```
Formato: {SIGLA_TIPO}-{SIGLA_UNIDADE}-{NN}
Exemplo: IT-CEQP-01, PRO-SUCOM-02
```

O número `NN` é sequencial por tipo+unidade e é calculado automaticamente.

### Ciclo de vida do documento

```
[Sem Data Aprovação]
       ↓ (aprovação registrada)
   Vigente
       ↓ (60 dias antes do vencimento)
   Próximo da Revisão
       ↓ (data de revisão vencida)
   Vencido
       ↓ (nova versão publicada)
   Obsoleto
```

### Status calculados automaticamente

| Status | Condição |
|---|---|
| Em Elaboração | Sem data de aprovação |
| Vigente | Aprovado e revisão futura (>60 dias) |
| Próximo da Revisão | Revisão nos próximos 60 dias |
| Vencido | Data de revisão ultrapassada |
| Obsoleto | Marcado na publicação de nova versão |

---

## Módulo 6 — Gestão de Riscos

### Descrição
Mapeamento e avaliação de riscos usando matriz de probabilidade × impacto.

### Funcionalidades

#### Matriz de Risco (5×5)
Visualização gráfica posicionando cada risco ativo na grade P×I.

#### Lista de Riscos
- Mapeamento de novos riscos
- Edição de riscos existentes
- Publicação de revisão com justificativa (versionamento)
- Exclusão em cascata (remove planos e entregas vinculados)

### Campos do risco

| Campo | Obrigatório | Observação |
|---|---|---|
| Macroetapa | Sim | Fase do processo |
| Risco | Sim | Descrição do evento de risco |
| Causa | Sim | Causa raiz |
| Consequência | Sim | Impacto esperado |
| Categoria | Sim | Categoria do risco |
| Probabilidade | Sim | 1 (Raro) a 5 (Quase Certo) |
| Impacto | Sim | 1 (Insignificante) a 5 (Catastrófico) |
| Tipo Tratamento | Sim | Aceitar / Mitigar / Transferir / Eliminar |
| Responsável | Sim | Nome do responsável |

### Cálculo do Nível

```
Nível = Probabilidade × Impacto

1–4   → Baixo   (verde)
5–9   → Médio   (amarelo)
10–14 → Alto    (laranja)
15–25 → Crítico (vermelho)
```

---

## Módulo 7 — Plano de Ação (5W2H)

### Descrição
Planejamento estruturado de ações de tratamento para riscos mapeados.

### Funcionalidades
- Um plano ativo por risco (restrição de negócio)
- Framework 5W2H completo
- Status automático baseado em datas
- Replanejamento com geração de nova versão
- Histórico de versões consultável
- Auto-conclusão quando todas as entregas são registradas

### Framework 5W2H

| Dimensão | Campo | Descrição |
|---|---|---|
| What | O Que | Ação a ser executada |
| Why | Por Que | Justificativa da ação |
| Who | Quem | Responsável(is) — `TODAS` = todas as unidades |
| Where | Onde | Local de execução |
| When | Data Prevista | Prazo planejado |
| How | Como | Método de execução |
| How Much | Quanto Custa | Estimativa de custo |

### Status automático do plano

| Status | Condição |
|---|---|
| Em Andamento | Data prevista futura, sem conclusão |
| Atrasado | Data prevista vencida, sem conclusão |
| Concluído | Data de finalização preenchida |
| Arquivado | Motivo de cancelamento preenchido |

---

## Módulo 8 — Controle de Entregas

### Descrição
Rastreamento de evidências entregues por cada unidade em resposta a planos de ação.

### Funcionalidades
- Registro de entrega por unidade vinculada ao risco
- Acompanhamento de status (Pendente / Entregue)
- Registro de tipo de evidência e número SEI
- Auto-conclusão do plano quando todas as entregas são recebidas
- Re-abertura automática do plano se uma entrega é desfeita

### Tipos de evidência

| Tipo |
|---|
| Relatório Técnico |
| Formulário/Check-list |
| Planilha de Controle |
| Ata de Reunião |
| Lista de Presença |
| Certificado |
| POP/IT |
| Registro Fotográfico |
| Print de Tela SEI |
| Termo de Recebimento |
| Outros |

### Lógica de auto-conclusão (`_reavaliarBaixa`)

```
Se Quem = "TODAS":
  Se todas as unidades entregaram → plano.Status = Concluído
  Se alguma entrega revertida     → plano.Status = Em Andamento
Senão:
  Se última entrega registrada    → plano.Status = Concluído
```

---

## Módulo 9 — Auditoria (Log de Alterações)

### Descrição
Trilha completa de todas as operações realizadas no sistema.

### Funcionalidades
- Registro automático de cada operação de escrita
- Exibição das últimas 300 entradas
- Campos: Data/Hora, Usuário (e-mail), Ação, Referência, Detalhes

### Exemplos de ações registradas

| Ação | Descrição |
|---|---|
| `TAREFA_CRIADA` | Nova tarefa criada |
| `TAREFA_ATUALIZADA` | Tarefa editada |
| `TAREFA_STATUS` | Tarefa movida entre colunas |
| `TAREFA_ARQUIVADA` | Tarefa arquivada |
| `MEMBRO_CRIADO` | Novo membro cadastrado |
| `DOCUMENTO_CRIADO` | Novo documento criado |
| `DOCUMENTO_REVISADO` | Nova versão de documento publicada |
| `RISCO_MAPEADO` | Novo risco mapeado |
| `RISCO_REVISADO` | Risco revisado |
| `PLANO_CRIADO` | Plano de ação criado |
| `ENTREGA_REGISTRADA` | Entrega de unidade registrada |
