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
    if (isNaN(dados.probabilidade) || isNaN(dados.impacto) ||
        dados.probabilidade < 1 || dados.probabilidade > 5 || dados.impacto < 1 || dados.impacto > 5)
      return { sucesso: false, mensagem: 'Probabilidade e impacto devem ser números entre 1 e 5.' };
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
        dados.tipoTratamento, dados.responsavel, 'Ativo']);
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
    if (isNaN(dados.probabilidade) || isNaN(dados.impacto) ||
        dados.probabilidade < 1 || dados.probabilidade > 5 || dados.impacto < 1 || dados.impacto > 5)
      return { sucesso: false, mensagem: 'Probabilidade e impacto devem ser números entre 1 e 5.' };
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
      
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const abaH = safeGetSheetData(ss, SHEET_HISTORICO);
      const CH = colIdx_(CABECALHOS_HISTORICO);
      let lastHistRow = -1;
      
      if (abaH && abaH.length > 1) {
        for (let i = abaH.length - 1; i >= 1; i--) {
          if (String(abaH[i][CH('ID')]||'').trim() === ref && String(abaH[i][CH('Tipo')]||'').trim() === 'Risco') {
            lastHistRow = i + 1;
            break;
          }
        }
      }
      
      if (lastHistRow !== -1) {
        // Risco possui histórico. Atualiza a última reavaliação (status atual) 
        // e atualiza em SHEET_RISKS apenas os metadados para não sobrescrever o risco inerente.
        // Nova Probabilidade..Novo Responsável são contíguas em
        // CABECALHOS_HISTORICO — uma escrita no lugar de cinco, sem segurar o
        // ScriptLock por 5 round-trips. (As guardas `CH(...) !== -1` que havia
        // aqui nunca disparavam: colIdx_ opera sobre a constante, que declara
        // as duas colunas, e lança para nome desconhecido em vez de devolver -1.)
        conectarAba(SHEET_HISTORICO)
          .getRange(lastHistRow, CH('Nova Probabilidade')+1, 1, 5)
          .setValues([[Number(dados.probabilidade), Number(dados.impacto), nivel, dados.tipoTratamento, dados.responsavel]]);
        
        // Em SHEET_RISKS, preserva Prob, Imp, Trat, Resp originais
        aba.getRange(linha, CR('Macroetapa')+1, 1, 5).setValues([[dados.macroetapa, nomeR, dados.causa, dados.consequencia, dados.categoria]]);
      } else {
        // Risco não possui histórico. Atualiza o cadastro base.
        aba.getRange(linha, CR('Macroetapa')+1, 1, 10).setValues([[dados.macroetapa, nomeR, dados.causa, dados.consequencia,
          dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel, dados.tipoTratamento, dados.responsavel]]);
      }
      
      registrarLog('Edição de Risco', ref, 'Metadados atualizados.');
      return { sucesso: true, mensagem: 'Risco atualizado!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// Soft delete: arquivar e restaurar diferiam apenas pelo valor de Status e
// pelo texto do log — mesma extração que _definirStatusMembro_ já faz em
// Modulo_Tarefas.js. Mantém a varredura completa (sem break) do código
// original: se um ID duplicado existir na aba, todas as ocorrências recebem o
// mesmo status, como antes.
function _definirStatusRisco_(idRisco, novoStatus, acaoLog, detalheLog, msgOk) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const ref = 'R' + idRisco;
      const abaR = conectarAba(SHEET_RISKS);
      const rowsR = abaR.getDataRange().getValues();
      const CR = colIdx_(CABECALHOS_RISCOS);
      let encontrou = false;
      for (let i = rowsR.length - 1; i >= 1; i--) {
        if (rowsR[i][CR('ID Risco')].toString().trim() === ref) {
          abaR.getRange(i+1, CR('Status') + 1).setValue(novoStatus);
          encontrou = true;
        }
      }
      if (!encontrou) return { sucesso: false, mensagem: 'Risco ' + ref + ' não encontrado.' };
      registrarLog(acaoLog, ref, detalheLog);
      return { sucesso: true, mensagem: msgOk };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirRisco(idRisco) {
  return _definirStatusRisco_(idRisco, 'Arquivado', 'Arquivamento de Risco',
    'Risco arquivado (soft delete).', 'Risco arquivado!');
}

function restaurarRisco(idRisco) {
  return _definirStatusRisco_(idRisco, 'Ativo', 'Restauração de Risco',
    'Risco restaurado (ativo).', 'Risco restaurado com sucesso!');
}

function reavaliarRisco(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    // Validação no servidor (espelha a do cliente e a de salvarRisco). Sem ela,
    // uma chamada direta gravava um Nível sem sentido no histórico — e como
    // atualizarRisco trata a ÚLTIMA linha de histórico como o estado atual do
    // risco, esse lixo virava a verdade do risco na matriz.
    if (!dados || !dados.tipoTratamento || !dados.responsavel)
      return { sucesso: false, mensagem: 'Preencha o tipo de tratamento e o responsável.' };
    const prob = Number(dados.probabilidade), imp = Number(dados.impacto);
    if (isNaN(prob) || isNaN(imp) || prob < 1 || prob > 5 || imp < 1 || imp > 5)
      return { sucesso: false, mensagem: 'Probabilidade e impacto devem ser números entre 1 e 5.' };
    return comBloqueio(() => {
      const ref = 'R' + dados.idRisco;

      // O risco precisa existir ANTES de qualquer escrita: gravar o histórico
      // primeiro deixava uma linha órfã (e um `sucesso: true` enganoso) quando
      // o ID não existia.
      const abaR = conectarAba(SHEET_RISKS);
      const rowsR = abaR.getDataRange().getValues();
      const CR = colIdx_(CABECALHOS_RISCOS);
      let linhaR = -1;
      for (let i = 1; i < rowsR.length; i++) {
        if (rowsR[i][CR('ID Risco')].toString().trim() === ref) { linhaR = i+1; break; }
      }
      if (linhaR === -1) return { sucesso: false, mensagem: 'Risco ' + ref + ' não encontrado.' };

      const abaH = conectarAba(SHEET_HISTORICO);
      const nivel = calcularNivelRisco(prob, imp);
      abaH.appendRow([ref, 'Risco', _dataLocalISO_(new Date()), prob, imp, nivel, dados.tipoTratamento, dados.responsavel, dados.justificativa]);

      const abaP = conectarAba(SHEET_PLANS);
      const rowsP = abaP.getDataRange().getValues();
      const colIdRiscoP = colIdx_(CABECALHOS_PLANOS)('ID Risco');
      const colRevisao = colIdx_(CABECALHOS_PLANOS)('Revisão Pendente');
      for (let i = 1; i < rowsP.length; i++) {
        if (rowsP[i][colIdRiscoP].toString().trim() === ref) {
          abaP.getRange(i+1, colRevisao + 1).setValue('Sim');
        }
      }
      
      abaR.getRange(linhaR, CR('Tipo Tratamento')+1, 1, 2).setValues([[dados.tipoTratamento, dados.responsavel]]);
      registrarLog('Reavaliação de Risco', ref, 'Risco reavaliado.');
      return { sucesso: true, mensagem: 'Reavaliação salva!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function revisarPlano(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const ref = dados.riscoVinculado;
      const abaH = conectarAba(SHEET_HISTORICO);
      const abaP = conectarAba(SHEET_PLANS);
      
      if (dados.acao === 'manter') {
        const rowsP = abaP.getDataRange().getValues();
        const colIdRisco = colIdx_(CABECALHOS_PLANOS)('ID Risco');
        const colRevisao = colIdx_(CABECALHOS_PLANOS)('Revisão Pendente');
        for (let i = 1; i < rowsP.length; i++) {
          if (rowsP[i][colIdRisco].toString().trim() === ref) {
            abaP.getRange(i+1, colRevisao + 1).setValue('Não');
          }
        }
        abaH.appendRow([ref, 'Plano', _dataLocalISO_(new Date()), '', '', '', '', '', dados.justificativa||'Mantido após reavaliação.']);
        registrarLog('Revisão de Plano', ref, 'Plano mantido.');
        return { sucesso: true, mensagem: 'Revisão registrada.' };
      }
      
      const rowsP = abaP.getDataRange().getValues();
      const colIdRisco = colIdx_(CABECALHOS_PLANOS)('ID Risco');
      let linhaP = -1;
      let planAntigo = null;
      for (let i = 1; i < rowsP.length; i++) {
        if (rowsP[i][colIdRisco].toString().trim() === ref) {
          linhaP = i+1;
          planAntigo = rowsP[i];
          break;
        }
      }
      if (linhaP === -1) return { sucesso: false, mensagem: 'Plano não encontrado.' };
      
      const abaE = conectarAba(SHEET_DELIVERY);
      const rowsE = abaE.getDataRange().getValues();
      const colRefE = colIdx_(CABECALHOS_ENTREGAS)('Risco Vinculado');
      // Iteração de trás para frente: os deleteRow abaixo deslocam as linhas.
      const linhasExcluir = [];
      for (let i = rowsE.length - 1; i >= 1; i--) {
        const r = String(rowsE[i][colRefE]||'');
        if (r === ref || r.startsWith(ref + ' -')) linhasExcluir.push(i+1);
      }
      
      const CP = colIdx_(CABECALHOS_PLANOS);
      abaH.appendRow([ref, 'Plano', _dataLocalISO_(new Date()), '', '', '', '', '', dados.justificativa||'Estratégia alterada.']);
      linhasExcluir.forEach(l => abaE.deleteRow(l));
      
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado);
      abaP.getRange(linhaP, CP('O Que')+1, 1, 10).setValues([[dados.what, dados.why, dados.who, dados.where,
        dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status, 'Não']]);
        
      registrarLog('Revisão de Plano', ref, 'Plano alterado.');
      return { sucesso: true, mensagem: 'Plano atualizado!' };
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
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
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
      // Fatiado na largura do layout: getDataRange() devolve a largura REAL da
      // aba, e a regravação abaixo é fixa em CABECALHOS_ENTREGAS.length. Se a
      // aba ganhasse uma coluna extra (uma anotação manual em F, p.ex.), o
      // setValues estourava com "number of columns does not match".
      let rows = aba.getDataRange().getValues().map(r => r.slice(0, CABECALHOS_ENTREGAS.length));

      // Índice (risco|unidade) → posição no array, montado UMA vez. Antes era
      // uma varredura de `rows` por entrega — O(entregas × linhas).
      const posPorChave = new Map();
      for (let i = 1; i < rows.length; i++) {
        const chave = String(rows[i][CE('Risco Vinculado')]||'') + '|' + String(rows[i][CE('Unidade')]||'');
        posPorChave.set(chave, i); // a última ocorrência vence, como no loop de trás para frente original
      }

      const novas = [];
      const atualizadas = [];
      entregas.forEach(function(ent) {
        const pos = posPorChave.get(riscoVinculado + '|' + ent.unidade);
        if (pos !== undefined) {
          rows[pos][CE('Status')] = ent.entregue;
          rows[pos][CE('Data Entrega')] = ent.dataEntrega||'';
          rows[pos][CE('SEI')] = ent.processoSei||'';
          atualizadas.push(pos);
        } else {
          const novaRow = new Array(CABECALHOS_ENTREGAS.length).fill('');
          novaRow[CE('Risco Vinculado')] = riscoVinculado;
          novaRow[CE('Unidade')] = ent.unidade;
          novaRow[CE('Status')] = ent.entregue;
          novaRow[CE('Data Entrega')] = ent.dataEntrega||'';
          novaRow[CE('SEI')] = ent.processoSei||'';
          novas.push(novaRow);
        }
      });

      // Escrita PONTUAL: só as linhas que mudaram, e só as 3 colunas editáveis
      // (Status..SEI são contíguas). Antes reescrevia a aba INTEIRA a cada
      // gravação — uma chamada só, mas de custo proporcional ao total de linhas,
      // crescendo para sempre e regravando dados que ninguém tocou. Aqui são N
      // chamadas, mas N é o nº de entregas DESTE risco (limitado pelas unidades);
      // o custo deixa de depender do tamanho da aba.
      atualizadas.forEach(function(pos) {
        aba.getRange(pos + 1, CE('Status') + 1, 1, 3)
           .setValues([[rows[pos][CE('Status')], rows[pos][CE('Data Entrega')], rows[pos][CE('SEI')]]]);
      });
      if (novas.length) {
        // Acréscimo em bloco (1 chamada), depois da última linha atual.
        aba.getRange(rows.length + 1, 1, novas.length, CABECALHOS_ENTREGAS.length).setValues(novas);
        novas.forEach(r => rows.push(r)); // _reavaliarBaixa enxerga o estado final
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