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
          // Histórico: a fonte da verdade é o que está NA PLANILHA agora, não o
          // snapshot que o cliente carregou. Do payload aproveitamos apenas os
          // comentários novos (marcados _novo) e os anexamos ao histórico atual.
          // Assim, comentários/logs criados por outros usuários (ou o log de
          // "Moveu" gerado por um drag) entre abrir e salvar não são perdidos.
          let acts = [];
          try { acts = JSON.parse(String(data[i][C('Atividades')] || '[]')); if (!Array.isArray(acts)) acts = []; } catch(e) { acts = []; }
          let novos = [];
          try { const arr = JSON.parse(task.activities); if (Array.isArray(arr)) novos = arr.filter(a => a && a._novo); } catch(e) {}
          novos.forEach(a => { a.author = autor; delete a._novo; acts.push(a); });
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
          if (alterados.length) acts.push({ type: 'log', text: 'Alterou: ' + alterados.join(', '), date: timeNow, author: autor });
          // A edição grava SOMENTE os campos editáveis no modal. Status, Data
          // Início, Data Conclusão e Data Criação NÃO são tocados aqui — são
          // controlados por updateTaskStatus/drag. Sem isso, salvar o cartão
          // depois de um arrastar revertia o status para o valor antigo.
          // Título→Prioridade são contíguos (cols Título..Prioridade).
          sheet.getRange(i+1, C('Título')+1, 1, 4).setValues([[task.title, task.description, task.assigneeId, task.priority]]);
          sheet.getRange(i+1, C('Prazo')+1).setValue(task.deadline || '');
          sheet.getRange(i+1, C('Atividades')+1).setValue(JSON.stringify(acts));
          sheet.getRange(i+1, C('Etiquetas')+1).setValue(task.labels || '[]');
          SpreadsheetApp.flush();
          return { sucesso: true };
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
      const hist = [{ type: 'log', text: `Criou este cartão na lista "${task.status}"`, date: timeNow, author: autor }];
      sheet.appendRow([
        newId, task.status, task.title, task.description, task.assigneeId,
        task.priority, dateNow, startDate, task.deadline, completionDate, JSON.stringify(hist), '', task.labels || '[]'
      ]);
      SpreadsheetApp.flush();
      return { sucesso: true };
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
        
        let acts = [];
        try { acts = JSON.parse(String(row[C('Atividades')] || '[]')); } catch(e) {}
        acts.push({ type: 'log', text: `Moveu de "${oldStatus}" para "${newStatus}"`, date: timeNow, author: autor });
        row[C('Atividades')] = JSON.stringify(acts);

        if (newStatus === 'Concluído') row[C('Data Conclusão')] = dateNow;
        else row[C('Data Conclusão')] = '';
        
        if (newStatus !== 'Backlog' && !String(row[C('Data Início')] || '')) row[C('Data Início')] = dateNow;

        row[C('Arquivado')] = '';

        sheet.getRange(i+1, 1, 1, row.length).setValues([row]);
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
          sheet.getRange(i+1, C('Nome')+1, 1, 3).setValues([[member.name, member.role, member.email]]);
          // E-mail pessoal na coluna do cabeçalho (antes ia para a 13ª por
          // engano, ficando invisível na leitura — ver getKanbanData_members_)
          sheet.getRange(i+1, C('E-mail Pessoal')+1).setValue(member.emailPessoal || '');
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
      sheet.appendRow(row);
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