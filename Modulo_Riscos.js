// ==========================================
// MÓDULO 5 — GESTÃO DE RISCOS, PLANOS DE AÇÃO (5W2H) E ENTREGAS
// (arquivo único: os três estão intimamente ligados — planos vinculam
// a riscos, entregas vinculam a planos)
// ==========================================
function salvarRisco(dados) {
  try {
    // Validação no servidor (espelha a do cliente) — protege contra dados
    // incompletos mesmo que a checagem da tela seja contornada.
    if (!dados || !dados.macroetapa || !dados.categoria || !String(dados.nomeRisco||'').trim() ||
        !String(dados.causa||'').trim() || !String(dados.consequencia||'').trim() ||
        !dados.tipoTratamento || !dados.responsavel)
      return { sucesso: false, mensagem: 'Preencha todos os campos do risco.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const rows = aba.getDataRange().getValues();
      let max = 0;
      rows.slice(1).forEach(r => {
        const n = parseInt(String(r[CR('ID Risco')]||'').replace(/\D/g,''), 10);
        if (!isNaN(n) && n > max) max = n;
      });
      const id = 'R' + (max + 1);
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      aba.appendRow([new Date(), id, dados.macroetapa, dados.nomeRisco, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel,
        dados.tipoTratamento, dados.responsavel, 'Vigente', 'Mapeamento Inicial']);
      registrarLog('Cadastro de Risco', id, 'Risco criado: ' + dados.nomeRisco);
      return { sucesso: true, mensagem: 'Risco mapeado com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarRisco(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const ref = 'R' + dados.id;
      const rows = aba.getDataRange().getValues();
      let linha = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][CR('ID Risco')].toString().trim() === ref && String(rows[i][CR('Status')]||'Vigente').trim() === 'Vigente') { linha = i+1; break; }
      }
      if (linha === -1) return { sucesso: false, mensagem: 'Risco não localizado.' };
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      // Bloco contíguo Macroetapa → Responsável (10 colunas)
      aba.getRange(linha, CR('Macroetapa')+1, 1, 10).setValues([[dados.macroetapa, dados.nome, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel, dados.tipoTratamento, dados.responsavel]]);
      registrarLog('Edição de Risco', ref, 'Metadados atualizados.');
      return { sucesso: true, mensagem: 'Risco atualizado!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function salvarRevisaoRisco(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const ref = 'R' + dados.id;
      const rows = aba.getDataRange().getValues();
      let linhaAntiga = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][CR('ID Risco')].toString().trim() === ref && String(rows[i][CR('Status')]||'Vigente').trim() === 'Vigente') { linhaAntiga = i+1; break; }
      }
      if (linhaAntiga === -1) throw new Error('Risco original não localizado.');
      aba.getRange(linhaAntiga, CR('Status')+1).setValue('Obsoleto');
      const antiga = rows[linhaAntiga - 1];
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      aba.appendRow([dados.data ? new Date(dados.data + 'T12:00:00') : new Date(), ref,
        antiga[CR('Macroetapa')], antiga[CR('Risco')], antiga[CR('Causa')], antiga[CR('Consequência')], antiga[CR('Categoria')],
        Number(dados.probabilidade), Number(dados.impacto), nivel,
        dados.tipoTratamento, dados.responsavel, 'Vigente', dados.motivo]);
      registrarLog('Revisão de Risco', ref, 'Nova revisão publicada.');
      return { sucesso: true, mensagem: 'Revisão publicada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirRisco(idRisco) {
  try {
    return comBloqueio(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const ref = 'R' + idRisco;

      const abaR = conectarAba(SHEET_RISKS);
      const rowsR = abaR.getDataRange().getValues();
      const colIdRisco = colIdx_(CABECALHOS_RISCOS)('ID Risco');
      for (let i = rowsR.length - 1; i >= 1; i--) {
        if (rowsR[i][colIdRisco].toString().trim() === ref) abaR.deleteRow(i+1);
      }
      // A coluna que guarda a referência do risco tem nomes diferentes em
      // cada aba (Planos: 'ID Risco'; Entregas: 'Risco Vinculado').
      const colRefPorAba = {};
      colRefPorAba[SHEET_PLANS]    = colIdx_(CABECALHOS_PLANOS)('ID Risco');
      colRefPorAba[SHEET_DELIVERY] = colIdx_(CABECALHOS_ENTREGAS)('Risco Vinculado');
      [SHEET_PLANS, SHEET_DELIVERY].forEach(nomeAba => {
        const aba = ss.getSheetByName(nomeAba);
        if (!aba) return;
        const colRef = colRefPorAba[nomeAba];
        const rows = aba.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--) {
          const r = String(rows[i][colRef]||'');
          if (r === ref || r.startsWith(ref + ' -')) aba.deleteRow(i+1);
        }
      });
      registrarLog('Exclusão de Risco', ref, 'Risco e vínculos removidos.');
      return { sucesso: true, mensagem: 'Risco excluído!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// ==========================================
// MÓDULO 6 — PLANOS DE AÇÃO (5W2H) E ENTREGAS
// ==========================================
function _statusPlano(previsto, finalizado, cancelamento) {
  if (cancelamento && cancelamento.toString().trim()) return 'Arquivado';
  const fin = formatarDataParaUI(finalizado);
  if (fin && fin.trim()) return 'Concluído';
  const prev = formatarDataParaUI(previsto);
  if (prev) {
    const p = prev.split('-');
    if (p.length === 3) {
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      if (new Date(p[0], p[1]-1, p[2]) < hoje) return 'Atrasado';
    }
  }
  return 'Em Andamento';
}

function salvarPlano(dados) {
  try {
    if (!dados || !dados.riscoVinculado || !String(dados.what||'').trim() || !String(dados.why||'').trim() ||
        !dados.who || !String(dados.where||'').trim() || !dados.whenPrevisto || !String(dados.how||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos do plano.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const st = String(rows[i][CP('Status')]||'').trim();
        if (String(rows[i][CP('ID Risco')]||'') === dados.riscoVinculado && st !== 'Arquivado' && st !== 'Superado')
          return { sucesso: false, mensagem: 'Já existe um plano ativo para este risco.' };
      }
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado, '');
      aba.appendRow([new Date(), dados.riscoVinculado, dados.what, dados.why, dados.who,
        dados.where, dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status, '', '1.0']);
      registrarLog('Cadastro de Plano', dados.riscoVinculado, 'Plano 5W2H criado: ' + dados.what);
      return { sucesso: true, mensagem: 'Plano registrado!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarPlano(dados) {
  try {
    return comBloqueio(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const CE = colIdx_(CABECALHOS_ENTREGAS);
      const rows = aba.getDataRange().getValues();
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado, dados.cancelamento);
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CP('ID Risco')]||'') === dados.riscoVinculado) {
          // Bloco contíguo O Que → Motivo Cancelamento (10 colunas)
          aba.getRange(i+1, CP('O Que')+1, 1, 10).setValues([[dados.what, dados.why, dados.who, dados.where,
            dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status, dados.cancelamento||'']]);
          if (status === 'Arquivado') {
            const abaE = ss.getSheetByName(SHEET_DELIVERY);
            if (abaE) {
              const rowsE = abaE.getDataRange().getValues();
              for (let e = 1; e < rowsE.length; e++) {
                if (String(rowsE[e][CE('Risco Vinculado')]||'') === dados.riscoVinculado) abaE.getRange(e+1, CE('Status Sistema')+1).setValue('Arquivado');
              }
            }
          }
          registrarLog('Edição de Plano', dados.riscoVinculado, 'Status: ' + status);
          return { sucesso: true, mensagem: 'Plano atualizado!' };
        }
      }
      return { sucesso: false, mensagem: 'Plano não localizado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// Cria uma NOVA VERSÃO do plano (mesmo padrão usado em Risco e
// Documento): a versão atual vira "Superado" — preserva o histórico —
// e uma nova linha entra como a versão vigente, com o motivo da
// revisão registrado. Diferente de "Arquivar" (que encerra o plano
// definitivamente), aqui o trabalho continua, só que replanejado.
function salvarRevisaoPlano(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      let linhaAtual = -1;
      for (let i = 1; i < rows.length; i++) {
        const st = String(rows[i][CP('Status')]||'').trim();
        if (String(rows[i][CP('ID Risco')]||'') === dados.riscoVinculado && st !== 'Arquivado' && st !== 'Superado') {
          linhaAtual = i + 1; break;
        }
      }
      if (linhaAtual === -1) return { sucesso: false, mensagem: 'Plano ativo não localizado para este risco.' };

      const antiga = rows[linhaAtual - 1];
      const versaoAtual = parseFloat(String(antiga[CP('Versão')] || '1').replace(',', '.')) || 1;
      const novaVersao = (versaoAtual + 1).toFixed(1);

      aba.getRange(linhaAtual, CP('Status')+1).setValue('Superado');
      // Guarda o motivo da revisão na própria linha antiga (coluna de
      // Motivo Cancelamento é reaproveitada aqui só para versões
      // superadas — não tem conflito, pois "Arquivado" já usa esse
      // mesmo campo para o motivo do arquivamento).
      aba.getRange(linhaAtual, CP('Motivo Cancelamento')+1).setValue(dados.motivo || '');

      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado, '');
      aba.appendRow([new Date(), dados.riscoVinculado, dados.what, dados.why, dados.who,
        dados.where, dados.whenPrevisto, dados.whenFinalizado || '', dados.how, dados.howMuch,
        status, '', novaVersao]);

      registrarLog('Revisão de Plano', dados.riscoVinculado, `Nova versão v${novaVersao} — motivo: ${dados.motivo || '-'}`);
      return { sucesso: true, mensagem: 'Revisão do plano publicada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// Retorna TODAS as versões (inclusive superadas/arquivadas) de um
// plano, mais recente primeiro — usado pela tela de histórico.
function buscarHistoricoPlano(riscoVinculado) {
  try {
    const aba = conectarAba(SHEET_PLANS);
    const CP = colIdx_(CABECALHOS_PLANOS);
    const rows = aba.getDataRange().getValues();
    const versoes = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][CP('ID Risco')] || '') === riscoVinculado) {
        versoes.push({
          versao: (parseFloat(String(rows[i][CP('Versão')] || '1').replace(',', '.')) || 1).toFixed(1),
          what: String(rows[i][CP('O Que')] || ''), why: String(rows[i][CP('Por Que')] || ''),
          who: String(rows[i][CP('Quem')] || ''), where: String(rows[i][CP('Onde')] || ''),
          whenPrevisto: formatarDataParaUI(rows[i][CP('Data Prevista')]), whenFinalizado: formatarDataParaUI(rows[i][CP('Data Finalização')]),
          how: String(rows[i][CP('Como')] || ''), howMuch: String(rows[i][CP('Quanto Custa')] || ''),
          status: String(rows[i][CP('Status')] || ''), motivo: String(rows[i][CP('Motivo Cancelamento')] || ''),
          dataRegistro: formatarDataParaUI(rows[i][CP('Data Registro')])
        });
      }
    }
    versoes.sort((a, b) => parseFloat(b.versao) - parseFloat(a.versao));
    return versoes;
  } catch(e) { return []; }
}

function excluirPlano(idPlano) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      let excluiu = false;
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][CP('ID Risco')]||'') === idPlano) { aba.deleteRow(i+1); excluiu = true; }
      }
      if (!excluiu) return { sucesso: false, mensagem: 'Plano não localizado.' };
      // Remove também as entregas vinculadas — sem isso, um plano novo criado
      // para o mesmo risco "herdava" os registros de entrega do plano excluído.
      const abaE = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DELIVERY);
      if (abaE) {
        const CE = colIdx_(CABECALHOS_ENTREGAS);
        const rowsE = abaE.getDataRange().getValues();
        for (let i = rowsE.length - 1; i >= 1; i--) {
          if (String(rowsE[i][CE('Risco Vinculado')]||'') === idPlano) abaE.deleteRow(i+1);
        }
      }
      registrarLog('Exclusão de Plano', idPlano, 'Plano e entregas vinculadas removidos.');
      return { sucesso: true, mensagem: 'Plano excluído!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// --- Entregas ---
// Regra de negócio, num único ponto de verdade: um plano cujo "Quem" contém
// "TODAS" cobra todas as subcomissões; uma unidade é subcomissão quando
// "Subcomissão" aparece no nome. (Espelhada no cliente — ver JS_Riscos.html.)
function _planoEhGlobal_(quem) { return String(quem||'').toUpperCase().includes('TODAS'); }
function _ehSubcomissao_(nomeUnidade) { const n = String(nomeUnidade||'').toLowerCase(); return n.includes('subcomissão') || n.includes('subcomissao'); }

// A reavaliação da baixa automática do plano e a gravação de entregas em
// lote (via modal de Acompanhamento) são o único fluxo de entregas em uso.
function _reavaliarBaixa(refRisco) {
  const abaP = conectarAba(SHEET_PLANS);
  const abaE = conectarAba(SHEET_DELIVERY);
  const CP = colIdx_(CABECALHOS_PLANOS);
  const CE = colIdx_(CABECALHOS_ENTREGAS);
  const rowsP = abaP.getDataRange().getValues();
  let indexPlano = -1, planoGlobal = false;
  for (let i = 1; i < rowsP.length; i++) {
    const st = String(rowsP[i][CP('Status')]||'').trim();
    if (String(rowsP[i][CP('ID Risco')]||'') === refRisco && st !== 'Arquivado' && st !== 'Superado') {
      indexPlano = i+1;
      planoGlobal = _planoEhGlobal_(rowsP[i][CP('Quem')]);
      break;
    }
  }
  if (indexPlano === -1) return;
  const rowsE = abaE.getDataRange().getValues();
  let darBaixa = false;
  if (planoGlobal) {
    const CU = colIdx_(CABECALHOS_UNIDADES);
    const abaU = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNITS);
    const rowsU = abaU ? abaU.getDataRange().getValues() : [];
    const subcomissoes = rowsU.slice(1).filter(r => _ehSubcomissao_(r[CU('Nome da Unidade')]));
    const total = Math.max(subcomissoes.length, 1);
    const entregaram = new Set();
    rowsE.slice(1).forEach(r => {
      if (String(r[CE('Risco Vinculado')]||'') === refRisco && r[CE('Status')] === 'Sim' && r[CE('Status Sistema')] !== 'Arquivado') entregaram.add(String(r[CE('Unidade')]||''));
    });
    darBaixa = entregaram.size >= total;
  } else {
    for (let i = rowsE.length - 1; i >= 1; i--) {
      if (String(rowsE[i][CE('Risco Vinculado')]||'') === refRisco && rowsE[i][CE('Status Sistema')] !== 'Arquivado') {
        darBaixa = rowsE[i][CE('Status')] === 'Sim'; break;
      }
    }
  }
  const hoje = _dataLocalISO_(new Date());
  if (darBaixa) {
    abaP.getRange(indexPlano, CP('Data Finalização')+1).setValue(hoje);
    abaP.getRange(indexPlano, CP('Status')+1).setValue('Concluído');
  } else {
    abaP.getRange(indexPlano, CP('Data Finalização')+1).clearContent();
    abaP.getRange(indexPlano, CP('Status')+1).setValue(_statusPlano(rowsP[indexPlano-1][CP('Data Prevista')], '', rowsP[indexPlano-1][CP('Motivo Cancelamento')]));
  }
}

// Salva/atualiza múltiplas entregas de uma vez (acompanhamento em lote).
function salvarEntregasEmLote(riscoVinculado, entregas) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DELIVERY);
      const CE = colIdx_(CABECALHOS_ENTREGAS);
      let rows = aba.getDataRange().getValues();
      const usr = usuarioAtual_();

      entregas.forEach(function(ent) {
        let linhaExistente = -1;
        for (let i = rows.length - 1; i >= 1; i--) {
          if (String(rows[i][CE('Risco Vinculado')]||'') === riscoVinculado &&
              String(rows[i][CE('Unidade')]||'') === ent.unidade &&
              String(rows[i][CE('Status Sistema')]||'Ativo') !== 'Arquivado') {
            linhaExistente = i + 1; break;
          }
        }
        if (linhaExistente > 0) {
          // Bloco contíguo Status → Usuário (6 colunas)
          aba.getRange(linhaExistente, CE('Status')+1, 1, 6).setValues([[ent.entregue, ent.dataEntrega||'',
            ent.tipoDoc||'', ent.processoSei||'', ent.justificativa||'', usr]]);
        } else {
          aba.appendRow([new Date(), riscoVinculado, ent.unidade, ent.entregue,
            ent.dataEntrega||'', ent.tipoDoc||'', ent.processoSei||'', ent.justificativa||'', usr, 'Ativo']);
          rows.push(new Array(CABECALHOS_ENTREGAS.length).fill(''));
        }
      });

      _reavaliarBaixa(riscoVinculado);
      registrarLog('Acompanhamento de Entregas', riscoVinculado, 'Entregas atualizadas em lote. Registros: ' + entregas.length);
      return { sucesso: true, mensagem: 'Registros salvos com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// PDF por e-mail: ver gerarPdfDeHtml/enviarPdfDeHtml em Código.js — a
// geração de PDF agora é feita a partir de HTML (não mais de um Base64
// de captura de tela), então essa função não é mais necessária aqui.