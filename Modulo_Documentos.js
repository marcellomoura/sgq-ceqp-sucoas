// ==========================================
// MÓDULO 4 — GESTÃO DOCUMENTAL
// ==========================================
function salvarDocumento(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !dados.tipo || !String(dados.titulo||'').trim() || !dados.responsavel || !String(dados.linkDoc||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos obrigatórios.' };
    // Sigla do tipo e da unidade são derivadas de dados de ENTRADA e da aba
    // Unidades (que esta operação não altera) — calculadas FORA do lock para
    // não segurar o ScriptLock durante a leitura da aba Unidades, o que
    // serializava desnecessariamente cadastros concorrentes.
    const mapa = { 'Instrução de Trabalho':'IT','Plano de Fiscalização':'PF','Procedimento':'PRO','Política':'POL','Regimento Interno':'RI','Manual':'MAN','Guia':'GUI','Formulário':'FOR' };
    const siglaTipo = mapa[dados.tipo] || 'DOC';
    let siglaUnd = 'UND';
    if (dados.responsavel) {
      const uData = conectarAba(SHEET_UNITS).getDataRange().getValues();
      const C_UN = colIdx_(CABECALHOS_UNIDADES);
      const unRow = uData.slice(1).find(r => String(r[C_UN('ID Unidade')]) === String(dados.responsavel));
      if (unRow) {
        siglaUnd = String(unRow[C_UN('Sigla')] || 'UND').trim();
      } else {
        siglaUnd = dados.responsavel.split(' - ')[0];
      }
    }
    const prefixo   = `${siglaTipo}-${siglaUnd}-`;
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DOCS);
      const C = colIdx_(CABECALHOS_DOCS);
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
        'Vigente', dados.responsavel, dados.linkDoc, dados.docAuxiliar || '', dados.docAuxiliar2 || '', 'Emissão Inicial']);
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
      // Bloco Tipo→Próxima Revisão (4 colunas) e Responsável→Doc Auxiliar 2 (4 colunas)
      aba.getRange(linha, C('Tipo')+1, 1, 4).setValues([[dados.tipo, dados.titulo, dados.dataAprovacao, proxRev]]);
      aba.getRange(linha, C('Responsável')+1, 1, 4).setValues([[dados.responsavel, dados.linkDoc, dados.docAuxiliar||'', dados.docAuxiliar2||'']]);
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
      // Trava otimista: garante que a linha ainda é o documento que o usuário
      // via na tela. Sem isto, uma lista desatualizada (ex.: outro usuário
      // excluiu/inseriu uma linha acima) faria a revisão obsoletar e versionar
      // o documento ERRADO. Mesma proteção já usada em editar/excluir.
      if (dados.codigo && aba.getRange(linha, C('Código')+1).getValue().toString() !== dados.codigo.toString())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
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
        'Vigente', antiga[C('Responsável')], dados.linkDoc, dados.docAuxiliar||'', dados.docAuxiliar2||'', dados.motivo]);
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
      // Exclui TODAS as versões deste documento — a vigente e as revisões
      // arquivadas/obsoletas, que ficam em linhas separadas com o mesmo Código.
      // Antes só a linha selecionada era removida, deixando as versões antigas
      // órfãs na planilha.
      const colCod = C('Código');
      const valores = aba.getDataRange().getValues();
      let linhasParaExcluir = [];
      if (cod) {
        for (let i = 1; i < valores.length; i++) {
          if (String(valores[i][colCod]) === cod) linhasParaExcluir.push(i + 1); // nº da linha na planilha
        }
      }
      if (!linhasParaExcluir.length) linhasParaExcluir = [linha]; // fallback: só a linha atual
      // De baixo para cima, para os índices das linhas restantes não se deslocarem.
      linhasParaExcluir.sort((a, b) => b - a).forEach(l => aba.deleteRow(l));
      registrarLog('Exclusão de Documento', cod, 'Documento removido (' + linhasParaExcluir.length + ' versão(ões)).');
      return { sucesso: true, mensagem: 'Documento excluído com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}