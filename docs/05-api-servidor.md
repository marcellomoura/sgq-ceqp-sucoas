# 05 — API Servidor (google.script.run)

Todas as funções abaixo são expostas como server-side e chamadas pelo cliente via `google.script.run`. Não há API REST — toda comunicação é RPC nativo do Google Apps Script.

**Padrão de chamada (cliente):**
```javascript
google.script.run
  .withSuccessHandler(function(result) { /* ... */ })
  .withFailureHandler(function(err) { alert(err.message); })
  .nomeDaFuncao(arg1, arg2);
```

---

## Código.js — Core

### `doGet(e)`
Ponto de entrada do web app. Compõe o HTML final e o serve.

### `include(filename)`
Helper de template. Injeta o conteúdo de um arquivo HTML dentro de outro.
```javascript
<?!= include('CSS') ?>
```

### `comBloqueio(operacao)`
Wrapper de lock para operações de escrita. Aguarda até 10 segundos pelo lock.
- **Parâmetro:** `operacao` — função a executar com exclusão mútua
- **Retorno:** resultado da operação
- **Lança:** exceção se lock não obtido em 10s

### `conectarAba(nome, cabecalhos)`
Obtém ou cria uma aba na planilha ativa, adicionando colunas ausentes.
- **Parâmetros:** `nome` (string), `cabecalhos` (array de strings)
- **Retorno:** objeto Sheet do GAS

### `getKanbanData()`
Carregamento de Estágio 1. Executa auto-arquivo de tarefas vencidas.
- **Retorno:**
  ```json
  {
    "tasks": [...],
    "members": [...]
  }
  ```

### `getRestoData()`
Carregamento de Estágio 2. Calcula status de documentos na leitura.
- **Retorno:**
  ```json
  {
    "units": [...],
    "docs": [...],
    "risks": [...],
    "plans": [...],
    "deliveries": [...]
  }
  ```

### `getAppData()`
Wrapper de compatibilidade que combina ambos os estágios.
- **Retorno:** objeto com todas as coleções (`tasks`, `members`, `units`, `docs`, `risks`, `plans`, `deliveries`)

### `buscarLogs()`
Retorna as últimas 300 entradas do log de auditoria, em ordem decrescente.
- **Retorno:** array de objetos `{ dataHora, usuario, acao, referencia, detalhes }`

### Utilitários internos

| Função | Descrição |
|---|---|
| `safeDateString(val)` | Converte valor de célula do Sheets para string de data formatada |
| `formatarDataParaUI(campo)` | Formata data para exibição no formato `DD/MM/YYYY` |
| `getNowTimestamp()` | Retorna timestamp atual no formato `DD/MM/YYYY HH:mm:ss` |
| `getNextId(sheetName, prefixo)` | Gera próximo ID sequencial (ex: `T5`, `M3`, `R2`) |
| `calcularNivelRisco(p, i)` | Calcula nível textual a partir de Probabilidade × Impacto |
| `calcularProximaRevisao(dataStr)` | Retorna data +1 ano a partir de uma string de data |
| `registrarLog(acao, ref, detalhe)` | Grava linha na aba Logs com usuário atual e timestamp |

---

## Modulo_Tarefas.js — Tarefas e Membros

### `saveTask(task)`
Cria ou atualiza um cartão Kanban.
- **Parâmetro:** objeto com campos do cartão (`id`, `titulo`, `descricao`, `responsavelId`, `prioridade`, `prazo`, `dataInicio`, `atividades`)
- Se `id` vazio → cria nova tarefa com ID gerado e `Data Criação = agora`
- Se `id` preenchido → localiza linha e atualiza campos
- **Retorno:** objeto tarefa salva

### `updateTaskStatus(id, newStatus)`
Atualiza a coluna Status de uma tarefa e registra atividade de movimentação no histórico.
- **Parâmetros:** `id` (string), `newStatus` (string)

### `deleteTask(id)`
Remove uma tarefa pelo ID.

### `arquivarTarefaManual(id)`
Marca `Arquivado = Sim` na tarefa.

### `restaurarTarefaArquivada(id)`
Marca `Arquivado = Não` (impede re-arquivamento automático) e reseta `Data Conclusão`.

### `saveMember(member)`
Cria ou atualiza um membro.
- **Parâmetro:** objeto com `id`, `nome`, `cargo`, `email`
- Se `id` vazio → cria com ID gerado

### `deleteMember(id)`
Remove um membro pelo ID.

---

## Modulo_Unidades.js — Unidades

### `salvarUnidade(dados)`
Cria uma nova unidade. Valida unicidade da sigla.
- **Parâmetro:** `{ nomeUnidade, sigla, emailFuncional }`
- **Lança:** erro se sigla já existir

### `atualizarUnidade(dados)`
Atualiza uma unidade existente pelo `nomeUnidade`.
- **Parâmetro:** `{ nomeUnidade, sigla, emailFuncional }`

### `excluirUnidade(idUnidade)`
Remove uma unidade pelo nome.
- **Parâmetro:** `idUnidade` — nome da unidade (usado como chave)

---

## Modulo_Documentos.js — Documentos

### `salvarDocumento(dados)`
Cria um novo documento. Gera código automático no formato `{SIGLA_TIPO}-{SIGLA_UNIDADE}-{NN}`.
- **Parâmetro:** `{ tipo, titulo, unidade, versao, dataAprovacao, responsavel, email, linkPrincipal, docAuxiliar1, docAuxiliar2 }`
- Gera `proximaRevisao` automaticamente (+1 ano)

### `atualizarDocumento(dados)`
Atualiza metadados de um documento existente (localizado pelo `codigo`).
- **Parâmetro:** objeto com `codigo` como chave + campos a atualizar

### `salvarRevisaoDocumento(dados)`
Publica nova versão de um documento.
1. Marca linha atual como `Revisão = Sim`
2. Insere nova linha com versão incrementada e novos dados
- **Parâmetro:** `{ codigoAtual, novaVersao, dataAprovacao, ... }`

### `excluirDocumento(idRow, codigoEsperado)`
Remove um documento verificando o código esperado para segurança.
- **Parâmetros:** `idRow` (índice da linha), `codigoEsperado` (código do documento)

---

## Modulo_Riscos.js — Riscos, Planos e Entregas

### `salvarRisco(dados)`
Mapeia um novo risco. Gera ID automático (`R{N}`). Calcula `nivel` a partir de `probabilidade × impacto`.
- **Parâmetro:** `{ macroetapa, risco, causa, consequencia, categoria, probabilidade, impacto, tipoTratamento, responsavel }`

### `atualizarRisco(dados)`
Atualiza os dados da versão atual do risco (localizado pelo `idRisco`).

### `salvarRevisaoRisco(dados)`
Publica nova versão do risco.
1. Marca linha atual como `Status = Obsoleto` com motivo
2. Insere nova linha com dados atualizados
- **Parâmetro:** inclui `motivo` para justificar a revisão

### `excluirRisco(idRisco)`
Remove o risco e **em cascata** todos os planos e entregas vinculados ao mesmo `idRisco`.

### `salvarPlano(dados)`
Cria um plano de ação 5W2H para um risco. Valida que não existe plano ativo para o risco.
- **Parâmetro:** `{ idRisco, oQue, porQue, quem, onde, dataPrevista, como, quantoCusta }`
- Se `quem` contém lista de unidades, cria registros de entrega pendentes para cada uma

### `atualizarPlano(dados)`
Atualiza o plano ativo. Se marcado como `Arquivado`, também arquiva todas as entregas vinculadas.

### `salvarRevisaoPlano(dados)`
Arquiva o plano atual e cria nova versão (replanejamento).
1. Marca plano atual como `Versão = Superado`
2. Insere nova linha com novos dados

### `buscarHistoricoPlano(riscoVinculado)`
Retorna todas as versões de um plano para um risco, ordenadas do mais recente ao mais antigo.
- **Retorno:** array de planos (incluindo `Superado`)

### `excluirPlano(idPlano)`
Remove todas as linhas do plano (todas as versões) para um `idRisco`.

### `salvarEntrega(dados)`
Registra uma entrega de evidência por uma unidade.
- **Parâmetro:** `{ riscoVinculado, unidade, status, dataEntrega, tipoDoc, sei, obs }`
- Após salvar, chama `_reavaliarBaixa(riscoVinculado)`

### `atualizarEntrega(dados)`
Atualiza um registro de entrega existente.
- Após atualizar, chama `_reavaliarBaixa(riscoVinculado)`

### `excluirEntrega(riscoVinculado, unidade)`
Remove a entrega de uma unidade específica para um risco.

### `enviarPdfPorEmail(destinatario, base64Pdf, nomeArquivo, titulo)`
Envia um PDF gerado no cliente por e-mail via `MailApp`.
- **Parâmetros:**
  - `destinatario` — endereço de e-mail
  - `base64Pdf` — conteúdo do PDF em Base64
  - `nomeArquivo` — nome do arquivo anexo
  - `titulo` — assunto do e-mail

### Funções internas

| Função | Descrição |
|---|---|
| `_statusPlano(previsto, finalizado, cancelamento)` | Computa status do plano com base nas datas |
| `_reavaliarBaixa(refRisco)` | Auto-completa ou re-abre plano com base nas entregas |
