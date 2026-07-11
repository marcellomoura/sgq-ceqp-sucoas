// ==========================================
// MÓDULO 3 — UNIDADES / SUBCOMISSÕES
// ==========================================
function salvarUnidade(dados) {
  try {
    if (!dados || !String(dados.unidade||'').trim() || !String(dados.sigla||'').trim() || !String(dados.email||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos da Unidade.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS, ['Nome da Unidade','Sigla','E-mail Funcional','Tipo']);
      const rows = aba.getDataRange().getValues();
      const siglaNova = dados.sigla.toString().trim().toUpperCase();
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i][1]||'').toString().trim().toUpperCase() === siglaNova)
          return { sucesso: false, mensagem: "Já existe uma unidade com a sigla '" + dados.sigla + "'." };
      }
      aba.appendRow([dados.unidade.trim(), dados.sigla.trim(), dados.email.trim(), (dados.tipo||'').trim()]);
      registrarLog('Cadastro de Unidade', dados.sigla, 'Unidade incluída: ' + dados.unidade);
      return { sucesso: true, mensagem: 'Unidade cadastrada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarUnidade(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const linha = parseInt(dados.id, 10) + 1;
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      aba.getRange(linha, 1, 1, 4).setValues([[dados.unidade, dados.sigla, dados.email, (dados.tipo||'').trim()]]);
      registrarLog('Edição de Unidade', dados.sigla, 'Dados atualizados.');
      return { sucesso: true, mensagem: 'Unidade atualizada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirUnidade(idUnidade) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const linha = parseInt(idUnidade, 10) + 1;
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      const sigla = aba.getRange(linha, 2).getValue();
      aba.deleteRow(linha);
      registrarLog('Exclusão de Unidade', sigla, 'Unidade removida.');
      return { sucesso: true, mensagem: 'Unidade excluída com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}