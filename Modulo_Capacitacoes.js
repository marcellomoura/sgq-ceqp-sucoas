// ==========================================
// MÓDULO: GESTÃO DE CAPACITAÇÕES
// ==========================================

function calcularStatusCapacitacao_(dataPrevista, dataRealizada) {
  if (dataRealizada) return 'Concluída';
  if (dataPrevista)  return 'Em Andamento';
  return 'Planejada';
}

function salvarCapacitacao(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.titulo||'').trim())
      return { sucesso: false, mensagem: 'O Título é obrigatório.' };

    return comBloqueio(() => {
      const aba = conectarAba(SHEET_CAPACITACOES, CABECALHOS_CAPACITACOES);
      const id  = getNextId_(aba, 'CAP-');
      const dp  = dados.dataPrevista  ? new Date(dados.dataPrevista  + 'T12:00:00') : '';
      const dr  = dados.dataRealizada ? new Date(dados.dataRealizada + 'T12:00:00') : '';
      const st  = calcularStatusCapacitacao_(dados.dataPrevista, dados.dataRealizada);

      aba.appendRow([
        id,
        dados.titulo.trim(),
        (dados.tema       || '').trim(),
        (dados.publico    || '').trim(),
        (dados.modalidade || '').trim(),
        dp,
        dr,
        st,
        (dados.materiais     || '').trim(),
        (dados.participantes || '')
      ]);

      registrarLog('Cadastro de Capacitação', id, 'Capacitação incluída: ' + dados.titulo);
      return { sucesso: true, mensagem: 'Capacitação cadastrada com sucesso!', novoId: id, novaLinha: aba.getLastRow() };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarCapacitacao(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.titulo||'').trim())
      return { sucesso: false, mensagem: 'O Título é obrigatório.' };

    return comBloqueio(() => {
      const aba  = conectarAba(SHEET_CAPACITACOES);
      const C    = colIdx_(CABECALHOS_CAPACITACOES);
      const linha = parseInt(dados.idRow, 10);

      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };

      const idAtual = aba.getRange(linha, C('ID')+1).getValue().toString();
      if (dados.idEsperado && idAtual !== dados.idEsperado.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };

      const dp  = dados.dataPrevista  ? new Date(dados.dataPrevista  + 'T12:00:00') : '';
      const dr  = dados.dataRealizada ? new Date(dados.dataRealizada + 'T12:00:00') : '';
      const st  = calcularStatusCapacitacao_(dados.dataPrevista, dados.dataRealizada);

      // 9 colunas: Título da Capacitação → Participantes
      aba.getRange(linha, C('Título da Capacitação')+1, 1, 9).setValues([[
        dados.titulo.trim(),
        (dados.tema       || '').trim(),
        (dados.publico    || '').trim(),
        (dados.modalidade || '').trim(),
        dp,
        dr,
        st,
        (dados.materiais     || '').trim(),
        (dados.participantes || '')
      ]]);

      registrarLog('Edição de Capacitação', idAtual, 'Dados atualizados.');
      return { sucesso: true, mensagem: 'Capacitação atualizada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirCapacitacao(idRow, idEsperado) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba  = conectarAba(SHEET_CAPACITACOES);
      const C    = colIdx_(CABECALHOS_CAPACITACOES);
      const linha = parseInt(idRow, 10);

      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };

      const id = aba.getRange(linha, C('ID')+1).getValue().toString();
      if (idEsperado && id !== idEsperado.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };

      aba.deleteRow(linha);
      registrarLog('Exclusão de Capacitação', id, 'Capacitação removida.');
      return { sucesso: true, mensagem: 'Capacitação excluída com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}
