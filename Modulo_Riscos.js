// ==========================================
// MÓDULO 5 — GESTÃO DE RISCOS, PLANOS DE AÇÃO (5W2H) E ENTREGAS
// (arquivo único: os três estão intimamente ligados — planos vinculam
// a riscos, entregas vinculam a planos)
// ==========================================
function salvarRisco(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    // Validação no servidor (espelha a do cliente) — protege contra dados
    // incompletos mesmo que a checagem da tela seja contornada.
    const nomeR = String(dados.nome || dados.nomeRisco || '').trim();
    if (!dados || !dados.macroetapa || !dados.categoria || !nomeR ||
        !String(dados.causa||'').trim() || !String(dados.consequencia||'').trim() ||
        !dados.tipoTratamento || !dados.responsavel)
      return { sucesso: false, mensagem: 'Preencha todos os campos do risco.' };
    if (isNaN(dados.probabilidade) || isNaN(dados.impacto) || dados.probabilidade < 1 || dados.impacto < 1)
      return { sucesso: false, mensagem: 'Probabilidade e impacto são obrigatórios e devem ser válidos.' };
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
      aba.appendRow([id, dados.macroetapa, nomeR, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel,
        dados.tipoTratamento, dados.responsavel]);
      registrarLog('Cadastro de Risco', id, 'Risco criado: ' + nomeR);
      return { sucesso: true, mensagem: 'Risco mapeado com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarRisco(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    const nomeR = String(dados.nome || dados.nomeRisco || '').trim();
    if (!dados || !dados.macroetapa || !dados.categoria || !nomeR ||
        !String(dados.causa||'').trim() || !String(dados.consequencia||'').trim() ||
        !dados.tipoTratamento || !dados.responsavel)
      return { sucesso: false, mensagem: 'Preencha todos os campos do risco.' };
    if (isNaN(dados.probabilidade) || isNaN(dados.impacto) || dados.probabilidade < 1 || dados.impacto < 1)
      return { sucesso: false, mensagem: 'Probabilidade e impacto são obrigatórios e devem ser válidos.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const ref = 'R' + dados.id;
      const rows = aba.getDataRange().getValues();
      let linha = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][CR('ID Risco')].toString().trim() === ref) { linha = i+1; break; }
      }
      if (linha === -1) return { sucesso: false, mensagem: 'Risco não localizado.' };
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      // Bloco contíguo Macroetapa → Responsável (10 colunas)
      aba.getRange(linha, CR('Macroetapa')+1, 1, 10).setValues([[dados.macroetapa, nomeR, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel, dados.tipoTratamento, dados.responsavel]]);
      registrarLog('Edição de Risco', ref, 'Metadados atualizados.');
      return { sucesso: true, mensagem: 'Risco atualizado!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirRisco(idRisco) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
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
function _statusPlano(previsto, finalizado) {
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
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !dados.riscoVinculado || !String(dados.what||'').trim() || !String(dados.why||'').trim() ||
        !dados.who || !String(dados.where||'').trim() || !dados.whenPrevisto || !String(dados.how||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos do plano.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CP('ID Risco')]||'') === dados.riscoVinculado)
          return { sucesso: false, mensagem: 'Já existe um plano ativo para este risco.' };
      }
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado);
      aba.appendRow([dados.riscoVinculado, dados.what, dados.why, dados.who,
        dados.where, dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status]);
      registrarLog('Cadastro de Plano', dados.riscoVinculado, 'Plano 5W2H criado: ' + dados.what);
      return { sucesso: true, mensagem: 'Plano registrado!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarPlano(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !dados.riscoVinculado || !String(dados.what||'').trim() || !String(dados.why||'').trim() ||
        !dados.who || !String(dados.where||'').trim() || !dados.whenPrevisto || !String(dados.how||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos do plano.' };
    return comBloqueio(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const CE = colIdx_(CABECALHOS_ENTREGAS);
      const rows = aba.getDataRange().getValues();
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado);
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CP('ID Risco')]||'') === dados.riscoVinculado) {
          // Bloco contíguo O Que → Status (9 colunas)
          aba.getRange(i+1, CP('O Que')+1, 1, 9).setValues([[dados.what, dados.why, dados.who, dados.where,
            dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status]]);
          registrarLog('Edição de Plano', dados.riscoVinculado, 'Status: ' + status);
          return { sucesso: true, mensagem: 'Plano atualizado!' };
        }
      }
      return { sucesso: false, mensagem: 'Plano não localizado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirPlano(idPlano) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
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
function _reavaliarBaixa(refRisco, cacheRowsE) {
  const abaP = conectarAba(SHEET_PLANS);
  const CP = colIdx_(CABECALHOS_PLANOS);
  const CE = colIdx_(CABECALHOS_ENTREGAS);
  const rowsP = abaP.getDataRange().getValues();
  let indexPlano = -1, planoGlobal = false;
  for (let i = 1; i < rowsP.length; i++) {
    if (String(rowsP[i][CP('ID Risco')]||'') === refRisco) {
      indexPlano = i+1;
      planoGlobal = _planoEhGlobal_(rowsP[i][CP('Quem')]);
      break;
    }
  }
  if (indexPlano === -1) return;
  const statusAtualPlano = String(rowsP[indexPlano-1][CP('Status')] || '');
  let rowsE = cacheRowsE;
  if (!rowsE) {
    const abaE = conectarAba(SHEET_DELIVERY);
    rowsE = abaE.getDataRange().getValues();
  }
  let darBaixa = false;
  if (planoGlobal) {
    const CU = colIdx_(CABECALHOS_UNIDADES);
    const abaU = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNITS);
    const rowsU = abaU ? abaU.getDataRange().getValues() : [];
    const subcomissoes = rowsU.slice(1).filter(r => _ehSubcomissao_(r[CU('Nome da Unidade')]));
    const total = Math.max(subcomissoes.length, 1);
    const entregaram = new Set();
    rowsE.slice(1).forEach(r => {
      if (String(r[CE('Risco Vinculado')]||'') === refRisco && r[CE('Status')] === 'Sim') entregaram.add(String(r[CE('Unidade')]||''));
    });
    darBaixa = entregaram.size >= total;
  } else {
    for (let i = rowsE.length - 1; i >= 1; i--) {
      if (String(rowsE[i][CE('Risco Vinculado')]||'') === refRisco) {
        darBaixa = rowsE[i][CE('Status')] === 'Sim'; break;
      }
    }
  }
  const hoje = _dataLocalISO_(new Date());
  if (darBaixa) {
    abaP.getRange(indexPlano, CP('Data Finalização')+1).setValue(hoje);
    abaP.getRange(indexPlano, CP('Status')+1).setValue('Concluído');
  } else {
    if (statusAtualPlano === 'Concluído') return; // Congelamento de status aprovado (não reabrir se cadastrar nova unidade)
    abaP.getRange(indexPlano, CP('Data Finalização')+1).clearContent();
    abaP.getRange(indexPlano, CP('Status')+1).setValue(_statusPlano(rowsP[indexPlano-1][CP('Data Prevista')], ''));
  }
}

// Salva/atualiza múltiplas entregas de uma vez (acompanhamento em lote).
function salvarEntregasEmLote(riscoVinculado, entregas) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DELIVERY);
      const CE = colIdx_(CABECALHOS_ENTREGAS);
      let rows = aba.getDataRange().getValues();

      entregas.forEach(function(ent) {
        let linhaExistente = -1;
        for (let i = rows.length - 1; i >= 1; i--) {
          if (String(rows[i][CE('Risco Vinculado')]||'') === riscoVinculado &&
              String(rows[i][CE('Unidade')]||'') === ent.unidade) {
            linhaExistente = i + 1; break;
          }
        }
        if (linhaExistente > 0) {
          rows[linhaExistente][CE('Status')] = ent.entregue;
          rows[linhaExistente][CE('Data Entrega')] = ent.dataEntrega||'';
          rows[linhaExistente][CE('SEI')] = ent.processoSei||'';
        } else {
          let novaRow = new Array(CABECALHOS_ENTREGAS.length).fill('');
          novaRow[CE('Risco Vinculado')] = riscoVinculado;
          novaRow[CE('Unidade')] = ent.unidade;
          novaRow[CE('Status')] = ent.entregue;
          novaRow[CE('Data Entrega')] = ent.dataEntrega||'';
          novaRow[CE('SEI')] = ent.processoSei||'';
          rows.push(novaRow);
        }
      });

      if (rows.length > 0) {
        aba.getRange(1, 1, rows.length, CABECALHOS_ENTREGAS.length).setValues(rows);
      }

      _reavaliarBaixa(riscoVinculado, rows);
      registrarLog('Acompanhamento de Entregas', riscoVinculado, 'Entregas atualizadas em lote. Registros: ' + entregas.length);
      return { sucesso: true, mensagem: 'Registros salvos com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// PDF por e-mail: ver gerarPdfDeHtml/enviarPdfDeHtml em Código.js — a
// geração de PDF agora é feita a partir de HTML (não mais de um Base64
// de captura de tela), então essa função não é mais necessária aqui.