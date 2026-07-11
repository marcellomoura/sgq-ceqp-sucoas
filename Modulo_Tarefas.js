// ==========================================
// MÓDULO 1 — GESTÃO DE TAREFAS E MEMBROS (KANBAN)
// (arquivo único: Membros só existe como responsáveis das Tarefas)
// ==========================================
function saveTask(task) {
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_TASKS);
    const timeNow = getNowTimestamp();

    if (task.id && task.id !== 'null' && task.id !== '') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(task.id)) {
          let acts = [];
          try { acts = JSON.parse(task.activities); } catch(e) {}
          acts.push({ type: 'log', text: 'Cartão atualizado via sistema', date: timeNow });
          sheet.getRange(i+1, 2, 1, 10).setValues([[
            task.status, task.title, task.description, task.assigneeId,
            task.priority, task.creationDate, task.startDate,
            task.deadline, task.completionDate, JSON.stringify(acts)
          ]]);
          SpreadsheetApp.flush();
          return { sucesso: true };
        }
      }
    } else {
      const newId = getNextId(SHEET_TASKS, 'TAR-');
      const dateNow = new Date().toISOString().split('T')[0];
      const hist = [{ type: 'log', text: `Criou este cartão na lista "${task.status}"`, date: timeNow }];
      sheet.appendRow([
        newId, task.status, task.title, task.description, task.assigneeId,
        task.priority, dateNow, task.startDate, task.deadline, '', JSON.stringify(hist), ''
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
    const data  = sheet.getDataRange().getValues();
    const dateNow = new Date().toISOString().split('T')[0];
    const timeNow = getNowTimestamp();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        const oldStatus = String(data[i][1]);
        if (oldStatus === newStatus) { SpreadsheetApp.flush(); return { sucesso: true }; }

        sheet.getRange(i+1, 2).setValue(newStatus);
        let acts = [];
        try { acts = JSON.parse(String(data[i][10] || '[]')); } catch(e) {}
        acts.push({ type: 'log', text: `Moveu de "${oldStatus}" para "${newStatus}"`, date: timeNow });
        sheet.getRange(i+1, 11).setValue(JSON.stringify(acts));

        if (newStatus === 'Concluído') sheet.getRange(i+1, 10).setValue(dateNow);
        else sheet.getRange(i+1, 10).setValue('');
        if (newStatus !== 'Backlog' && !String(data[i][7] || '')) sheet.getRange(i+1, 8).setValue(dateNow);

        // Qualquer mudança de status reseta o arquivamento (recomeça o
        // contador de 15 dias caso o cartão volte a ser concluído depois)
        sheet.getRange(i+1, 12).setValue('');

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
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
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
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        if (String(data[i][1]) !== 'Concluído') {
          return { sucesso: false, mensagem: 'Só é possível arquivar cartões já concluídos.' };
        }
        sheet.getRange(i+1, 12).setValue('Sim');
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
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i+1, 12).setValue('Não');
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
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_MEMBERS);
    if (member.id && member.id !== 'null' && member.id !== '') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(member.id)) {
          sheet.getRange(i+1, 2, 1, 3).setValues([[member.name, member.role, member.email]]);
          sheet.getRange(i+1, 13).setValue(member.emailPessoal || '');
          SpreadsheetApp.flush();
          return { sucesso: true };
        }
      }
    } else {
      const newId = getNextId(SHEET_MEMBERS, 'MEM-');
      const row = [newId, member.name, member.role, member.email || '', '', '', '', '', '', '', '', '', member.emailPessoal || ''];
      sheet.appendRow(row);
      SpreadsheetApp.flush();
      return { sucesso: true };
    }
    return { sucesso: false, mensagem: 'Membro não encontrado.' };
  });
}

function deleteMember(id) {
  return comBloqueio(() => {
    const sheet = conectarAba(SHEET_MEMBERS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i+1);
        SpreadsheetApp.flush();
        return { sucesso: true };
      }
    }
    return { sucesso: false, mensagem: 'Membro não encontrado.' };
  });
}