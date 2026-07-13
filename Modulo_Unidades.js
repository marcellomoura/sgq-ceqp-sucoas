// ==========================================
// MÓDULO 3 — UNIDADES / SUBCOMISSÕES
// ==========================================
function salvarUnidade(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.unidade||'').trim() || !String(dados.sigla||'').trim() || !String(dados.email||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos da Unidade.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS, CABECALHOS_UNIDADES);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const rows = aba.getDataRange().getValues();
      const siglaNova = dados.sigla.toString().trim().toUpperCase();
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i][C('Sigla')]||'').toString().trim().toUpperCase() === siglaNova)
          return { sucesso: false, mensagem: "Já existe uma unidade com a sigla '" + dados.sigla + "'." };
      }
      const id = getNextId(SHEET_UNITS, 'UN-');
      aba.appendRow([id, dados.unidade.trim(), dados.sigla.trim(), dados.email.trim(), (dados.linkDrive||'').trim()]);
      registrarLog('Cadastro de Unidade', dados.sigla, 'Unidade incluída: ' + dados.unidade);
      return { sucesso: true, mensagem: 'Unidade cadastrada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarUnidade(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const linha = parseInt(dados.idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      // Confere a sigla original antes de escrever, para não atualizar a linha
      // errada se a lista do usuário estiver desatualizada.
      if (dados.siglaOriginal) {
        const atual = aba.getRange(linha, C('Sigla')+1).getValue().toString().trim();
        if (atual !== String(dados.siglaOriginal).trim())
          return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      }
      aba.getRange(linha, C('Nome da Unidade')+1, 1, 4).setValues([[dados.unidade, dados.sigla, dados.email, (dados.linkDrive||'').trim()]]);
      registrarLog('Edição de Unidade', dados.sigla, 'Dados atualizados.');
      return { sucesso: true, mensagem: 'Unidade atualizada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirUnidade(idRow, siglaEsperada) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const linha = parseInt(idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      const sigla = aba.getRange(linha, C('Sigla')+1).getValue();
      // Confere a sigla antes de excluir
      if (siglaEsperada && sigla.toString().trim() !== String(siglaEsperada).trim())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      aba.deleteRow(linha);
      registrarLog('Exclusão de Unidade', sigla, 'Unidade removida.');
      return { sucesso: true, mensagem: 'Unidade excluída com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}