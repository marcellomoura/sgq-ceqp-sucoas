// ==========================================
// MÓDULO 4 — GESTÃO DOCUMENTAL
// ==========================================
function salvarDocumento(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !dados.tipo || !String(dados.titulo||'').trim() || !dados.responsavel || !String(dados.linkDoc||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos obrigatórios.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DOCS);
      const C = colIdx_(CABECALHOS_DOCS);
      const mapa = { 'Instrução de Trabalho':'IT','Plano de Fiscalização':'PF','Procedimento':'PRO','Política':'POL','Regimento Interno':'RI','Manual':'MAN','Guia':'GUI','Formulário':'FOR' };
      const siglaTipo = mapa[dados.tipo] || 'DOC';
      const siglaUnd  = dados.responsavel ? dados.responsavel.split(' - ')[0] : 'UND';
      const prefixo   = `${siglaTipo}-${siglaUnd}-`;
      const rows = aba.getDataRange().getValues();
      let max = 0;
      rows.slice(1).forEach(r => {
        const cod = String(r[C('Código')]||'');
        if (cod.startsWith(prefixo)) {
          const n = parseInt(cod.split('-').pop(), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
      const codigo = prefixo + String(max + 1).padStart(2,'0');
      const proxRev = calcularProximaRevisao(dados.dataAprovacao);
      // Versão gravada como NÚMERO (não texto) — mantém consistência de
      // formatação e alinhamento na planilha com as revisões seguintes.
      aba.appendRow([codigo, 1, dados.tipo, dados.titulo, dados.dataAprovacao, proxRev,
        'Vigente', dados.responsavel, dados.email || '', dados.linkDoc, dados.docAuxiliar || '', dados.docAuxiliar2 || '', 'Emissão Inicial']);
      registrarLog('Cadastro de Documento', codigo, 'Documento publicado: ' + dados.titulo);
      return { sucesso: true, mensagem: 'Documento registrado com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarDocumento(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DOCS);
      const C = colIdx_(CABECALHOS_DOCS);
      const linha = parseInt(dados.idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Documento não localizado.' };
      if (dados.codigo && aba.getRange(linha, C('Código')+1).getValue().toString() !== dados.codigo.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      const proxRev = calcularProximaRevisao(dados.dataAprovacao);
      // Bloco Tipo→Próxima Revisão (4 colunas) e Responsável→Doc Auxiliar 2 (5 colunas)
      aba.getRange(linha, C('Tipo')+1, 1, 4).setValues([[dados.tipo, dados.titulo, dados.dataAprovacao, proxRev]]);
      aba.getRange(linha, C('Responsável')+1, 1, 5).setValues([[dados.responsavel, dados.email||'', dados.linkDoc, dados.docAuxiliar||'', dados.docAuxiliar2||'']]);
      registrarLog('Edição de Documento', dados.codigo, 'Metadados atualizados.');
      return { sucesso: true, mensagem: 'Documento atualizado com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function salvarRevisaoDocumento(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DOCS);
      const C = colIdx_(CABECALHOS_DOCS);
      const linha = parseInt(dados.idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Documento não localizado.' };
      const antiga = aba.getRange(linha, 1, 1, aba.getLastColumn()).getValues()[0];
      aba.getRange(linha, C('Status')+1).setValue('Obsoleto');
      let versao = 1.0;
      if (dados.versaoAtual) {
        const v = parseFloat(String(dados.versaoAtual).replace(',','.'));
        if (!isNaN(v) && v > 0) versao = v;
      }
      // Versão gravada como NÚMERO puro (ex: 2, 3, 4...) — antes ia como
      // texto ("2.0"), o que deixava o alinhamento e a formatação da
      // coluna diferentes entre a primeira versão e as revisões seguintes.
      const novaVersaoNum = Math.floor(versao) + 1;
      const proxRev = calcularProximaRevisao(dados.dataAprovacao);
      aba.appendRow([antiga[C('Código')], novaVersaoNum, antiga[C('Tipo')], antiga[C('Título')], dados.dataAprovacao, proxRev,
        'Vigente', antiga[C('Responsável')], antiga[C('E-mail')], dados.linkDoc, dados.docAuxiliar||'', dados.docAuxiliar2||'', dados.motivo]);
      registrarLog('Revisão de Documento', antiga[C('Código')], 'Nova versão v' + novaVersaoNum.toFixed(1));
      return { sucesso: true, mensagem: 'Revisão publicada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirDocumento(idRow, codigoEsperado) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DOCS);
      const C = colIdx_(CABECALHOS_DOCS);
      const linha = parseInt(idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Documento não localizado.' };
      const cod = aba.getRange(linha, C('Código')+1).getValue().toString();
      if (codigoEsperado && cod !== codigoEsperado.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      aba.deleteRow(linha);
      registrarLog('Exclusão de Documento', cod, 'Documento removido.');
      return { sucesso: true, mensagem: 'Documento excluído com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}