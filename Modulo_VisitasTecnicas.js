// ==========================================
// MÓDULO: VISITAS TÉCNICAS
// ==========================================

function calcularStatusVisita_(dataDaVisita) {
  return dataDaVisita ? 'Realizada' : 'Planejada';
}

function salvarVisitaTecnica(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.objetivo||'').trim())
      return { sucesso: false, mensagem: 'O Objetivo/Motivo da Visita é obrigatório.' };

    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_VISITAS, CABECALHOS_VISITAS);
      const id  = getNextId_(aba, 'VT-');
      const dt  = dados.data ? new Date(dados.data + 'T12:00:00') : '';
      const st  = calcularStatusVisita_(dados.data);

      aba.appendRow([
        id,
        dados.objetivo.trim(),
        (dados.local || '').trim(),
        dt,
        st,
        (dados.participantes || ''),
        (dados.relatorio || '').trim()
      ].map(neutralizarFormula_));

      registrarLog_('Cadastro de Visita Técnica', id, 'Visita técnica incluída: ' + dados.objetivo);
      return { sucesso: true, mensagem: 'Visita técnica cadastrada com sucesso!', novoId: id, novaLinha: aba.getLastRow() };
    });
  } catch(e) { return erroInterno_(e); }
}

function atualizarVisitaTecnica(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.objetivo||'').trim())
      return { sucesso: false, mensagem: 'O Objetivo/Motivo da Visita é obrigatório.' };

    return comBloqueio_(() => {
      const aba  = conectarAba_(SHEET_VISITAS);
      const C    = colIdx_(CABECALHOS_VISITAS);
      const linha = parseInt(dados.idRow, 10);

      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };

      const idAtual = aba.getRange(linha, C('ID_Visitas_Tecnicas')+1).getValue().toString();
      if (dados.idEsperado && idAtual !== dados.idEsperado.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };

      const dt = dados.data ? new Date(dados.data + 'T12:00:00') : '';
      const st = calcularStatusVisita_(dados.data);

      // 6 colunas: Objetivo da Visita → Relatório/Anexo
      aba.getRange(linha, C('Objetivo_Da_Visita')+1, 1, 6).setValues([[
        dados.objetivo.trim(),
        (dados.local || '').trim(),
        dt,
        st,
        (dados.participantes || ''),
        (dados.relatorio || '').trim()
      ].map(neutralizarFormula_)]);

      registrarLog_('Edição de Visita Técnica', idAtual, 'Dados atualizados.');
      return { sucesso: true, mensagem: 'Visita técnica atualizada com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
}

function excluirVisitaTecnica(idRow, idEsperado) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio_(() => {
      const aba  = conectarAba_(SHEET_VISITAS);
      const C    = colIdx_(CABECALHOS_VISITAS);
      const linha = parseInt(idRow, 10);

      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };

      const id = aba.getRange(linha, C('ID_Visitas_Tecnicas')+1).getValue().toString();
      if (idEsperado && id !== idEsperado.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };

      aba.deleteRow(linha);
      registrarLog_('Exclusão de Visita Técnica', id, 'Visita técnica removida.');
      return { sucesso: true, mensagem: 'Visita técnica excluída com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
}
