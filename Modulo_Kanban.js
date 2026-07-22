// ==========================================
// MÓDULO 1 — GESTÃO DE TAREFAS E MEMBROS (KANBAN)
// (arquivo único: Membros só existe como responsáveis das Tarefas)
// ==========================================
function saveTask(task) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para editar.' };
  if (!task || !String(task.title||'').trim())
    return { sucesso: false, mensagem: 'O título do cartão é obrigatório.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_TASKS);
    const C = colIdx_(CABECALHOS_TAREFAS);
    const timeNow = getNowTimestamp();
    const autor = nomeUsuarioAtual_();

    if (task.id && task.id !== 'null' && task.id !== '') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][C('ID')]) === String(task.id)) {
          // Trava otimista: se o carimbo que o cliente tinha ao abrir o editor
          // não bate com o que está na planilha agora, alguém mais salvou este
          // cartão nesse meio-tempo. Sem isso, esta gravação sobrescreveria em
          // silêncio título/descrição/responsáveis/prioridade/prazo/etiquetas
          // com os valores desatualizados que o cliente carregou antes.
          // Vazio de qualquer lado (linha migrada sem o carimbo ainda, ou
          // cartão recém-criado) não bloqueia — só a divergência real bloqueia.
          const versaoAtual = String(data[i][C('Última Atualização')] || '');
          const versaoCliente = String(task.updatedAt || '');
          if (versaoCliente && versaoAtual && versaoCliente !== versaoAtual) {
            return { sucesso: false, conflito: true, mensagem: 'Este cartão foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver a versão mais recente e refaça sua edição.' };
          }
          // Histórico: o cliente manda APENAS os comentários novos (marcados
          // _novo) — o histórico existente vive na aba Atividades e nunca
          // trafega no salvamento. Isso torna impossível uma edição
          // desatualizada sobrescrever comentários criados por outra pessoa
          // nesse meio-tempo: nada é reescrito, só acrescentado.
          // O erro ainda é fatal aqui: estes comentários só existem neste
          // payload, então engolir a falha devolveria "sucesso" com o
          // comentário do usuário descartado.
          let novos = [];
          try {
            const arr = JSON.parse(task.activities || '[]');
            if (Array.isArray(arr)) novos = arr.filter(a => a && a._novo);
          } catch (e) {
            console.error('Payload de atividades inválido na tarefa ' + task.id + ': ' + e);
            return { sucesso: false, mensagem: 'Não foi possível ler os comentários enviados. Recarregue a página e tente novamente.' };
          }
          // A data é carimbada pelo SERVIDOR (timeNow), não pela do payload: o
          // relógio do cliente não é confiável, e o formato dele ('15/07/2026 às
          // 14:15') divergia do dos logs ('15/07/2026 14:15') — dois formatos na
          // mesma coluna. O autor já era carimbado aqui pelo mesmo motivo.
          const novasAtividades = novos.map(a => ({
            tarefaId: task.id, tipo: 'comment', texto: String(a.text || ''), data: timeNow, autor: autor
          }));
          // Detecta quais campos mudaram comparando a linha atual da planilha
          // com o payload. Status/datas ficam de fora de propósito (ver abaixo).
          const campos = [
            { label: 'Título',           antes: String(data[i][C('Título')]||''),          depois: String(task.title||'') },
            { label: 'Descrição',        antes: String(data[i][C('Descrição')]||''),       depois: String(task.description||'') },
            { label: 'Responsáveis',     antes: String(data[i][C('Responsável_ID')]||''),  depois: String(task.assigneeId||'') },
            { label: 'Prioridade',       antes: String(data[i][C('Prioridade')]||''),      depois: String(task.priority||'') },
            { label: 'Prazo de Entrega', antes: formatarDataParaUI(data[i][C('Prazo')]),   depois: String(task.deadline||'') },
            { label: 'Etiquetas',        antes: String(data[i][C('Etiquetas')]||'[]'),     depois: String(task.labels||'[]') }
          ];
          const alterados = campos.filter(c => c.antes.trim() !== c.depois.trim()).map(c => c.label);
          // Só registra log de alteração se algum campo realmente mudou (se o
          // usuário só adicionou um comentário, não gera ruído no histórico).
          if (alterados.length) novasAtividades.push({
            tarefaId: task.id, tipo: 'log', texto: 'Alterou: ' + alterados.join(', '), data: timeNow, autor: autor
          });
          // A edição grava SOMENTE os campos editáveis no modal. Status, Data
          // Início, Data Conclusão e Data Criação NÃO são tocados aqui — são
          // controlados por updateTaskStatus/drag. Sem isso, salvar o cartão
          // depois de um arrastar revertia o status para o valor antigo.
          // Título→Prioridade são contíguos (cols Título..Prioridade).
          sheet.getRange(i+1, C('Título')+1, 1, 4).setValues([[task.title, task.description, task.assigneeId, task.priority].map(neutralizarFormula_)]);
          sheet.getRange(i+1, C('Prazo')+1).setValue(task.deadline || '');
          // Etiquetas..Última Atualização em uma escrita só. 'Arquivado' está no
          // meio do intervalo e NÃO é editável aqui — reescreve-se o valor que
          // veio da planilha (lido dentro deste mesmo lock), preservando-o.
          // Sem esse cuidado, o carimbo de tempo cairia dentro de 'Arquivado' e
          // a trava otimista nunca mais seria gravada.
          const novoCarimbo = String(new Date().getTime());
          sheet.getRange(i+1, C('Etiquetas')+1, 1, 3).setValues([[
            task.labels || '[]',
            data[i][C('Arquivado')],
            novoCarimbo
          ]]);
          _registrarAtividades_(novasAtividades);
          SpreadsheetApp.flush();
          // Devolve o cartão JÁ atualizado para o cliente aplicar no estado local,
          // sem precisar de uma 2ª ida ao servidor (getKanbanData) só para reler o
          // que acabamos de gravar. Reaproveita a linha lida dentro deste mesmo
          // lock (data[i]) com os campos editados sobrepostos, e _mapearTarefa_
          // para garantir EXATAMENTE o mesmo formato que o quadro recebe em
          // getKanbanData (status/datas preservados vêm da própria linha).
          const linhaAtualizada = data[i].slice();
          linhaAtualizada[C('Título')]             = task.title;
          linhaAtualizada[C('Descrição')]          = task.description;
          linhaAtualizada[C('Responsável_ID')]     = task.assigneeId;
          linhaAtualizada[C('Prioridade')]         = task.priority;
          linhaAtualizada[C('Prazo')]              = task.deadline || '';
          linhaAtualizada[C('Etiquetas')]          = task.labels || '[]';
          linhaAtualizada[C('Última Atualização')] = novoCarimbo;
          return { sucesso: true, task: _mapearTarefa_(linhaAtualizada, C) };
        }
      }
    } else {
      const newId = getNextId_(sheet, 'TAR-');
      const dateNow = _dataLocalISO_(new Date());
      // Coerência de datas na criação (mesma regra do updateTaskStatus):
      // - fora do Backlog, Data Início assume hoje se não veio preenchida;
      // - criado já em "Concluído", Data Conclusão assume hoje — senão o cartão
      //   ficaria sem conclusão, fora do auto-arquivamento e do cálculo de duração.
      let startDate = task.startDate || '';
      if (task.status !== 'Backlog' && !startDate) startDate = dateNow;
      let completionDate = task.completionDate || '';
      if (task.status === 'Concluído' && !completionDate) completionDate = dateNow;
      // 13 valores, na ordem de CABECALHOS_TAREFAS (sem 'Atividades', que saiu
      // do layout — o histórico vive na aba Atividades). Ordem do fim:
      // Etiquetas, Arquivado, Última Atualização. O '' é 'Arquivado' — o
      // cartão nasce sem decisão de arquivamento. `|| ''` no Prazo alinhado ao
      // caminho de edição: sem ele, um deadline undefined gravava a string
      // "undefined" na célula. Montada em variável para ser reaproveitada no
      // retorno (via _mapearTarefa_), sem uma leitura extra da linha recém-criada.
      const novaLinha = [
        newId, task.status, task.title, task.description, task.assigneeId,
        task.priority, dateNow, startDate, task.deadline || '', completionDate, task.labels || '[]', '', String(new Date().getTime())
      ];
      sheet.appendRow(novaLinha.map(neutralizarFormula_));
      _registrarAtividades_([{
        tarefaId: newId, tipo: 'log', texto: `Criou este cartão na lista "${task.status}"`, data: timeNow, autor: autor
      }]);
      SpreadsheetApp.flush();
      // Mesmo motivo do caminho de edição: devolve o cartão criado (com o id novo,
      // datas calculadas no servidor e carimbo) para o cliente inseri-lo no estado
      // local, dispensando o getKanbanData que era feito logo após salvar.
      return { sucesso: true, task: _mapearTarefa_(novaLinha, C) };
    }
    return { sucesso: false, mensagem: 'Tarefa não localizada.' };
  });
}

function updateTaskStatus(id, newStatus) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para editar.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_TASKS);
    const C = colIdx_(CABECALHOS_TAREFAS);
    const data  = sheet.getDataRange().getValues();
    const dateNow = _dataLocalISO_(new Date());
    const timeNow = getNowTimestamp();
    const autor = nomeUsuarioAtual_();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][C('ID')]) === String(id)) {
        const oldStatus = String(data[i][C('Status')]);
        if (oldStatus === newStatus) { SpreadsheetApp.flush(); return { sucesso: true }; }

        const row = data[i];
        row[C('Status')] = newStatus;

        // A coluna 'Atividades' não é mais lida nem alterada — o log do
        // movimento vira uma linha na aba Atividades. O valor legado que
        // porventura exista na célula é reescrito como está pelo setValues
        // abaixo (preservado, nunca reinterpretado).
        if (newStatus === 'Concluído') row[C('Data Conclusão')] = dateNow;
        else row[C('Data Conclusão')] = '';
        
        if (newStatus !== 'Backlog' && !String(row[C('Data Início')] || '')) row[C('Data Início')] = dateNow;

        row[C('Arquivado')] = '';

        sheet.getRange(i+1, 1, 1, row.length).setValues([row.map(neutralizarFormula_)]);
        _registrarAtividades_([{
          tarefaId: id, tipo: 'log', texto: `Moveu de "${oldStatus}" para "${newStatus}"`, data: timeNow, autor: autor
        }]);
        SpreadsheetApp.flush();
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Tarefa não encontrada.' };
  });
}

function deleteTask(id) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para excluir.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_TASKS);
    const C = colIdx_(CABECALHOS_TAREFAS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][C('ID')]) === String(id)) {
        sheet.deleteRow(i+1);
        // O histórico do cartão vive na aba Atividades: sem esta limpeza, as
        // linhas dele ficariam órfãs para sempre (e um TAR- reaproveitado no
        // futuro herdaria os comentários do cartão excluído).
        _excluirAtividadesDaTarefa_(id);
        SpreadsheetApp.flush();
        registrarLog('Exclusão de Tarefa', id, 'Cartão removido do Kanban.');
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Tarefa não encontrada.' };
  });
}

// Arquiva manualmente um cartão concluído, sem esperar os 15 dias
function arquivarTarefaManual(id) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para editar.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_TASKS);
    const C = colIdx_(CABECALHOS_TAREFAS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][C('ID')]) === String(id)) {
        if (String(data[i][C('Status')]) !== 'Concluído') {
          return { sucesso: false, mensagem: 'Só é possível arquivar cartões já concluídos.' };
        }
        sheet.getRange(i+1, C('Arquivado')+1).setValue('Sim');
        SpreadsheetApp.flush();
        registrarLog('Arquivamento Manual', id, 'Cartão arquivado manualmente.');
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Tarefa não encontrada.' };
  });
}

// Restaura um cartão arquivado de volta ao quadro (fica em "Concluído").
// Grava 'Não' (não apenas vazio) para o sistema respeitar essa decisão e
// não voltar a arquivar automaticamente, mesmo com a data de conclusão antiga.
function restaurarTarefaArquivada(id) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para editar.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_TASKS);
    const C = colIdx_(CABECALHOS_TAREFAS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][C('ID')]) === String(id)) {
        sheet.getRange(i+1, C('Arquivado')+1).setValue('Não');
        SpreadsheetApp.flush();
        registrarLog('Restauração de Arquivo', id, 'Cartão restaurado ao quadro.');
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Tarefa não encontrada.' };
  });
}

// ==========================================
// MÓDULO 2 — MEMBROS (KANBAN)
// ==========================================
function saveMember(member) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para editar membros.' };
  if (!member || !String(member.name||'').trim() || !String(member.role||'').trim() || !String(member.email||'').trim() || !String(member.emailPessoal||'').trim())
    return { sucesso: false, mensagem: 'Preencha todos os campos.' };
  const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!reEmail.test(String(member.email).trim()) || !reEmail.test(String(member.emailPessoal).trim()))
    return { sucesso: false, mensagem: 'Informe e-mails válidos (funcional e pessoal).' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
    const C = colIdx_(CABECALHOS_MEMBROS);
    const data = sheet.getDataRange().getValues();
    // Duplicidade de e-mail (funcional OU pessoal): como o e-mail autentica o
    // acesso (isMembro_), duas linhas com o mesmo e-mail dariam acesso ambíguo.
    // Ignora a própria linha na edição.
    const emailF = String(member.email).trim().toLowerCase();
    const emailP = String(member.emailPessoal).trim().toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (member.id && String(data[i][C('ID')]) === String(member.id)) continue;
      const f = String(data[i][C('Email Funcional')]||'').trim().toLowerCase();
      const p = String(data[i][C('E-mail Pessoal')]||'').trim().toLowerCase();
      if ((emailF && (emailF === f || emailF === p)) || (emailP && (emailP === f || emailP === p)))
        return { sucesso: false, mensagem: 'Já existe um membro cadastrado com esse e-mail.' };
    }
    if (member.id && member.id !== 'null' && member.id !== '') {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][C('ID')]) === String(member.id)) {
          // Nome, Cargo e Email Funcional são contíguos (colunas 2-4)
          sheet.getRange(i+1, C('Nome')+1, 1, 3).setValues([[member.name, member.role, member.email].map(neutralizarFormula_)]);
          // E-mail pessoal na coluna do cabeçalho (antes ia para a 13ª por
          // engano, ficando invisível na leitura — ver getKanbanData_members_)
          sheet.getRange(i+1, C('E-mail Pessoal')+1).setValue(neutralizarFormula_(member.emailPessoal || ''));
          SpreadsheetApp.flush();
          invalidarCacheMembros_(); // nome/e-mails mudaram — refaz o cache de auth
          return { sucesso: true };
        }
      }
    } else {
      const newId = getNextId_(sheet, 'MEM-');
      // Nova linha no layout de CABECALHOS_MEMBROS (Dias Semana / Dia
      // Presencial ficam vazios até a edição da Escala; nasce Ativo = 'Sim')
      const row = [newId, member.name, member.role, member.email || '', member.emailPessoal || '', '', '', 'Sim'];
      sheet.appendRow(row.map(neutralizarFormula_));
      SpreadsheetApp.flush();
      invalidarCacheMembros_(); // membro novo ganha acesso imediato (sem esperar TTL)
      return { sucesso: true };
    }
    return { sucesso: false, mensagem: 'Membro não encontrado.' };
  });
}

// Membros não são EXCLUÍDOS (perderíamos o histórico de tarefas/afastamentos/
// logs que os referenciam por ID). São INATIVADOS: somem das telas e perdem o
// acesso ao sistema, mas o registro permanece e a inativação é reversível.
function inativarMembro(id) { return _definirStatusMembro_(id, false); }
function reativarMembro(id)  { return _definirStatusMembro_(id, true); }

function _definirStatusMembro_(id, ativo) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado. Você não tem permissão para editar membros.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
    const C = colIdx_(CABECALHOS_MEMBROS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][C('ID')]) === String(id)) {
        sheet.getRange(i+1, C('Ativo')+1).setValue(ativo ? 'Sim' : 'Não');
        SpreadsheetApp.flush();
        invalidarCacheMembros_(); // muda quem tem acesso — refaz o cache de auth
        registrarLog(ativo ? 'Reativação de Membro' : 'Inativação de Membro',
          String(data[i][C('Nome')]),
          ativo ? 'Membro reativado (acesso restabelecido).' : 'Membro inativado (sem acesso ao sistema).');
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Membro não encontrado.' };
  });
}