// ==========================================
// MÓDULO 1 — GESTÃO DE TAREFAS E MEMBROS (KANBAN)
// (arquivo único: Membros só existe como responsáveis das Tarefas)
// ==========================================
function saveTask(task) {
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
          let acts = [];
          try { acts = JSON.parse(task.activities); } catch(e) {}
          // Comentários novos chegam do cliente marcados com _novo — carimba
          // o autor no servidor (não confia no cliente) sem tocar no histórico
          // antigo, que fica sem autor.
          acts.forEach(a => { if (a && a._novo) { a.author = autor; delete a._novo; } });
          // Detecta quais campos mudaram comparando a linha antiga (já em
          // memória) com o payload — sem leitura extra. Para incluir um campo
          // novo no futuro, basta adicionar uma entrada nesta lista.
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
          // Bloco contíguo de Status até Atividades (10 colunas)
          sheet.getRange(i+1, C('Status')+1, 1, 10).setValues([[
            task.status, task.title, task.description, task.assigneeId,
            task.priority, task.creationDate, task.startDate,
            task.deadline, task.completionDate, JSON.stringify(acts)
          ]]);
          sheet.getRange(i+1, C('Etiquetas')+1).setValue(task.labels || '[]');
          SpreadsheetApp.flush();
          return { sucesso: true };
        }
      }
    } else {
      const newId = getNextId(SHEET_TASKS, 'TAR-');
      const dateNow = _dataLocalISO_(new Date());
      const hist = [{ type: 'log', text: `Criou este cartão na lista "${task.status}"`, date: timeNow, author: autor }];
      sheet.appendRow([
        newId, task.status, task.title, task.description, task.assigneeId,
        task.priority, dateNow, task.startDate, task.deadline, '', JSON.stringify(hist), '', task.labels || '[]'
      ]);
      SpreadsheetApp.flush();
      return { sucesso: true };
    }
    return { sucesso: false, mensagem: 'Tarefa não localizada.' };
  });
}

function updateTaskStatus(id, newStatus) {
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

        sheet.getRange(i+1, C('Status')+1).setValue(newStatus);
        let acts = [];
        try { acts = JSON.parse(String(data[i][C('Atividades')] || '[]')); } catch(e) {}
        acts.push({ type: 'log', text: `Moveu de "${oldStatus}" para "${newStatus}"`, date: timeNow, author: autor });
        sheet.getRange(i+1, C('Atividades')+1).setValue(JSON.stringify(acts));

        if (newStatus === 'Concluído') sheet.getRange(i+1, C('Data Conclusão')+1).setValue(dateNow);
        else sheet.getRange(i+1, C('Data Conclusão')+1).setValue('');
        if (newStatus !== 'Backlog' && !String(data[i][C('Data Início')] || '')) sheet.getRange(i+1, C('Data Início')+1).setValue(dateNow);

        // Qualquer mudança de status reseta o arquivamento (recomeça o
        // contador de 15 dias caso o cartão volte a ser concluído depois)
        sheet.getRange(i+1, C('Arquivado')+1).setValue('');

        SpreadsheetApp.flush();
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Tarefa não encontrada.' };
  });
}

function deleteTask(id) {
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
  if (!member || !String(member.name||'').trim() || !String(member.role||'').trim() || !String(member.email||'').trim() || !String(member.emailPessoal||'').trim())
    return { sucesso: false, mensagem: 'Preencha todos os campos.' };
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
    const C = colIdx_(CABECALHOS_MEMBROS);
    if (member.id && member.id !== 'null' && member.id !== '') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][C('ID')]) === String(member.id)) {
          // Nome, Cargo e Email Funcional são contíguos (colunas 2-4)
          sheet.getRange(i+1, C('Nome')+1, 1, 3).setValues([[member.name, member.role, member.email]]);
          // E-mail pessoal na coluna do cabeçalho (antes ia para a 13ª por
          // engano, ficando invisível na leitura — ver getKanbanData_members_)
          sheet.getRange(i+1, C('E-mail Pessoal')+1).setValue(member.emailPessoal || '');
          SpreadsheetApp.flush();
          return { sucesso: true };
        }
      }
    } else {
      const newId = getNextId(SHEET_MEMBERS, 'MEM-');
      // Nova linha no layout de CABECALHOS_MEMBROS (Dias Semana / Dia
      // Presencial ficam vazios até a edição da Escala)
      const row = [newId, member.name, member.role, member.email || '', '', '', member.emailPessoal || ''];
      sheet.appendRow(row);
      SpreadsheetApp.flush();
      return { sucesso: true };
    }
    return { sucesso: false, mensagem: 'Membro não encontrado.' };
  });
}

function deleteMember(id) {
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
    const C = colIdx_(CABECALHOS_MEMBROS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][C('ID')]) === String(id)) {
        sheet.deleteRow(i+1);
        SpreadsheetApp.flush();
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Membro não encontrado.' };
  });
}