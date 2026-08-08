// ==========================================
// MÓDULO: VISITAS TÉCNICAS
// ==========================================

// Só 2 estados (Planejada/Realizada) — diferente de calcularStatusCapacitacao_
// (3 estados, com "Em Andamento" quando há Data Prevista mas não Realizada).
// Aqui a Data Prevista não muda o status, só informa quando a visita é
// esperada; o parâmetro nem é recebido, para não sobrar argumento sem uso.
function calcularStatusVisita_(dataRealizada) {
  return dataRealizada ? 'Realizada' : 'Planejada';
}

function salvarVisitaTecnica(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.objetivo||'').trim())
      return { sucesso: false, mensagem: 'O Objetivo/Motivo da Visita é obrigatório.' };

    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_VISITAS, CABECALHOS_VISITAS);
      const id  = getNextId_(aba, 'VT-');
      const dp  = dados.dataPrevista  ? new Date(dados.dataPrevista  + 'T12:00:00') : '';
      const dr  = dados.dataRealizada ? new Date(dados.dataRealizada + 'T12:00:00') : '';
      const st  = calcularStatusVisita_(dados.dataRealizada);

      // Ordem casada com CABECALHOS_VISITAS: ID → Objetivo → Local →
      // Data_Prevista → Data_Da_Visita → Status → Responsáveis → Relatório.
      aba.appendRow([
        id,
        dados.objetivo.trim(),
        (dados.local || '').trim(),
        dp,
        dr,
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

      const dp = dados.dataPrevista  ? new Date(dados.dataPrevista  + 'T12:00:00') : '';
      const dr = dados.dataRealizada ? new Date(dados.dataRealizada + 'T12:00:00') : '';
      const st = calcularStatusVisita_(dados.dataRealizada);

      // 7 colunas: Objetivo da Visita → Relatório/Anexo (Data_Prevista entrou
      // no meio do bloco contíguo)
      aba.getRange(linha, C('Objetivo_Da_Visita')+1, 1, 7).setValues([[
        dados.objetivo.trim(),
        (dados.local || '').trim(),
        dp,
        dr,
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
