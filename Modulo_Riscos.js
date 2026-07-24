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
        const n = parseInt(String(r[CR('ID_Risco')]||'').replace(/\D/g,''), 10);
        if (!isNaN(n) && n > max) max = n;
      });
      const id = 'R' + (max + 1);
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      // Histórico nasce com 1 entrada (o próprio cadastro), não vazio —
      // sem isso, a 1ª avaliação do risco nunca aparecia na tabela de
      // histórico (só reavaliações posteriores eram registradas ali).
      const historicoInicial = [{
        data: _dataLocalISO_(new Date()), prob: Number(dados.probabilidade), impacto: Number(dados.impacto),
        nivel: nivel, tratamento: dados.tipoTratamento, responsavel: dados.responsavel,
        justificativa: 'Cadastro inicial do risco.'
      }];
      aba.appendRow([id, dados.macroetapa, nomeR, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel,
        dados.tipoTratamento, dados.responsavel, 'Ativo', JSON.stringify(historicoInicial)].map(neutralizarFormula_));
      registrarLog('Cadastro de Risco', id, 'Risco criado: ' + nomeR);
      return { sucesso: true, mensagem: 'Risco mapeado com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
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
        if (rows[i][CR('ID_Risco')].toString().trim() === ref) { linha = i+1; break; }
      }
      if (linha === -1) return { sucesso: false, mensagem: 'Risco não localizado.' };
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      
      let histArr = [];
      const jsonStr = String(rows[linha-1][CR('Historico')]||'').trim();
      if (jsonStr.startsWith('[')) {
        try { histArr = JSON.parse(jsonStr); } catch(e) {}
      }
      
      if (histArr.length > 0) {
        // Atualiza a última reavaliação no array JSON
        const lastHist = histArr[histArr.length - 1];
        lastHist.prob = Number(dados.probabilidade);
        lastHist.impacto = Number(dados.impacto);
        lastHist.nivel = nivel;
        lastHist.tratamento = dados.tipoTratamento;
        lastHist.responsavel = dados.responsavel;

        // Em SHEET_RISKS, Probabilidade/Impacto/Nível da coluna base ficam
        // congelados no valor do cadastro original de propósito — a tela
        // sempre lê a versão "atual" do histórico (última entrada), nunca a
        // coluna base, para esses 3 campos. Tipo_Tratamento/Responsável são
        // diferentes: a Matriz (renderMatriz) exibe ESSAS DUAS direto da
        // coluna base, sem passar pelo histórico — por isso precisam ser
        // atualizadas aqui também (mesmo padrão que reavaliarRisco já usa),
        // senão a tela ficava mostrando o tratamento/responsável antigo
        // depois de editar um risco que já tinha histórico.
        aba.getRange(linha, CR('Macroetapa')+1, 1, 5).setValues([[dados.macroetapa, nomeR, dados.causa, dados.consequencia, dados.categoria].map(neutralizarFormula_)]);
        aba.getRange(linha, CR('Tipo_Tratamento')+1, 1, 2).setValues([[dados.tipoTratamento, dados.responsavel].map(neutralizarFormula_)]);
        aba.getRange(linha, CR('Historico')+1).setValue(JSON.stringify(histArr));
      } else {
        // Risco não possui histórico. Atualiza o cadastro base.
        aba.getRange(linha, CR('Macroetapa')+1, 1, 11).setValues([[dados.macroetapa, nomeR, dados.causa, dados.consequencia,
          dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel, dados.tipoTratamento, dados.responsavel, 'Ativo'].map(neutralizarFormula_)]);
      }
      
      registrarLog('Edição de Risco', ref, 'Metadados atualizados.');
      return { sucesso: true, mensagem: 'Risco atualizado!' };
    });
  } catch(e) { return erroInterno_(e); }
}

// Soft delete: arquivar e restaurar diferiam apenas pelo valor de Status e
// pelo texto do log — mesma extração que _definirStatusMembro_ já faz em
// Modulo_Kanban.js. Mantém a varredura completa (sem break) do código
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
        if (rowsR[i][CR('ID_Risco')].toString().trim() === ref) {
          abaR.getRange(i+1, CR('Status') + 1).setValue(novoStatus);
          encontrou = true;
        }
      }
      if (!encontrou) return { sucesso: false, mensagem: 'Risco ' + ref + ' não encontrado.' };
      registrarLog(acaoLog, ref, detalheLog);
      return { sucesso: true, mensagem: msgOk };
    });
  } catch(e) { return erroInterno_(e); }
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
        if (rowsR[i][CR('ID_Risco')].toString().trim() === ref) { linhaR = i+1; break; }
      }
      if (linhaR === -1) return { sucesso: false, mensagem: 'Risco ' + ref + ' não encontrado.' };

      const nivel = calcularNivelRisco(prob, imp);
      
      let histArr = [];
      const jsonStr = String(rowsR[linhaR-1][CR('Historico')]||'').trim();
      if (jsonStr.startsWith('[')) {
        try { histArr = JSON.parse(jsonStr); } catch(e) {}
      }
      histArr.push({
        data: _dataLocalISO_(new Date()),
        prob: prob,
        impacto: imp,
        nivel: nivel,
        tratamento: dados.tipoTratamento,
        responsavel: dados.responsavel,
        justificativa: dados.justificativa
      });
      abaR.getRange(linhaR, CR('Historico')+1).setValue(JSON.stringify(histArr));

      // Só marca planos que NÃO foram Cancelados/Substituídos como pendentes
      // de revisão — esses dois são decisão formal já tomada (abandonar/
      // trocar o plano) e não devem voltar a pedir revisão. "Concluído" NÃO
      // entra aqui: significa que as entregas foram feitas, mas se o risco
      // for reavaliado depois, o tratamento já concluído ainda pode precisar
      // ser revisto (continua válido? precisa de um novo plano?).
      const abaP = conectarAba(SHEET_PLANS);
      const rowsP = abaP.getDataRange().getValues();
      const CP = colIdx_(CABECALHOS_PLANOS);
      const STATUS_TERMINAIS = ['Cancelado', 'Substituído'];
      for (let i = 1; i < rowsP.length; i++) {
        if (rowsP[i][CP('ID_Risco')].toString().trim() === ref &&
            !STATUS_TERMINAIS.includes(String(rowsP[i][CP('Status')]||'').trim())) {
          abaP.getRange(i+1, CP('Revisao_Pendente') + 1).setValue('Sim');
        }
      }
      
      abaR.getRange(linhaR, CR('Tipo_Tratamento')+1, 1, 2).setValues([[dados.tipoTratamento, dados.responsavel].map(neutralizarFormula_)]);
      registrarLog('Reavaliação de Risco', ref, 'Risco reavaliado.');
      return { sucesso: true, mensagem: 'Reavaliação salva!' };
    });
  } catch(e) { return erroInterno_(e); }
}

function revisarPlano(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const ref = dados.riscoVinculado;
      const abaP = conectarAba(SHEET_PLANS);
      const rowsP = abaP.getDataRange().getValues();
      const CP = colIdx_(CABECALHOS_PLANOS);
      
      let linhaP = -1;
      let planAntigo = null;
      // Localiza pelo ID_Plano (chave estável) — casar por "O Que" corria o
      // risco de bater com um plano Substituído anterior que tivesse o mesmo
      // texto (mesmo bug relatado em atualizarPlano).
      for (let i = 1; i < rowsP.length; i++) {
        if (String(rowsP[i][CP('ID_Plano')]||'').trim() === String(dados.idPlano).trim()) {
          if (String(rowsP[i][CP('ID_Risco')]||'').trim() !== ref) return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
          linhaP = i + 1;
          planAntigo = rowsP[i];
          break;
        }
      }
      
      if (linhaP === -1) return { sucesso: false, mensagem: 'Plano não encontrado para revisão.' };

      // Processar histórico comum a todas as ações
      let histArr = [];
      const jsonStr = String(planAntigo[CP('Historico')]||'').trim();
      if (jsonStr.startsWith('[')) { try { histArr = JSON.parse(jsonStr); } catch(e) {} }
      
      let justifTexto = dados.justificativa;

      // Ação: MANTER
      if (dados.acao === 'manter') {
        abaP.getRange(linhaP, CP('Revisao_Pendente') + 1).setValue('Não');
        histArr.push({ data: _dataLocalISO_(new Date()), justificativa: justifTexto || 'Mantido após reavaliação.' });
        abaP.getRange(linhaP, CP('Historico') + 1).setValue(JSON.stringify(histArr));
        registrarLog('Revisão de Plano', ref, 'Plano mantido em andamento.');
        return { sucesso: true, mensagem: 'Plano mantido com sucesso!' };
      }
      
      // Ação: CANCELAR
      if (dados.acao === 'cancelar') {
        abaP.getRange(linhaP, CP('Revisao_Pendente') + 1).setValue('Não');
        abaP.getRange(linhaP, CP('Status') + 1).setValue('Cancelado');
        abaP.getRange(linhaP, CP('Data_Finalizacao') + 1).setValue(_dataLocalISO_(new Date()));
        histArr.push({ data: _dataLocalISO_(new Date()), justificativa: justifTexto || 'Plano cancelado após reavaliação.' });
        abaP.getRange(linhaP, CP('Historico') + 1).setValue(JSON.stringify(histArr));
        registrarLog('Revisão de Plano', ref, 'Plano cancelado.');
        return { sucesso: true, mensagem: 'Plano cancelado!' };
      }

      // Ação: ALTERAR (Substituir plano: fecha o antigo e cria um novo)
      if (dados.acao === 'alterar') {
        // 1. Fechar o plano antigo
        abaP.getRange(linhaP, CP('Revisao_Pendente') + 1).setValue('Não');
        abaP.getRange(linhaP, CP('Status') + 1).setValue('Substituído');
        abaP.getRange(linhaP, CP('Data_Finalizacao') + 1).setValue(_dataLocalISO_(new Date()));
        histArr.push({ data: _dataLocalISO_(new Date()), justificativa: justifTexto || 'Estratégia substituída por um novo plano.' });
        abaP.getRange(linhaP, CP('Historico') + 1).setValue(JSON.stringify(histArr));
        
        // 2. Criar o novo plano (appendRow)
        const novoStatus = _statusPlano(dados.whenPrevisto, dados.whenFinalizado);
        const novaRow = new Array(CABECALHOS_PLANOS.length).fill('');
        novaRow[CP('ID_Plano')] = getNextId_(abaP, 'PLA-');
        novaRow[CP('ID_Risco')] = ref;
        novaRow[CP('O_Que')] = dados.what;
        novaRow[CP('Por_Que')] = dados.why;
        novaRow[CP('Quem(ID_Unidade)')] = dados.who;
        novaRow[CP('Onde')] = dados.where;
        novaRow[CP('Data_Prevista')] = dados.whenPrevisto;
        novaRow[CP('Data_Finalizacao')] = dados.whenFinalizado || '';
        novaRow[CP('Como')] = dados.how;
        novaRow[CP('Quanto_Custa')] = dados.howMuch;
        novaRow[CP('Status')] = novoStatus;
        novaRow[CP('Revisao_Pendente')] = 'Não';
        novaRow[CP('Historico')] = '[]';
        novaRow[CP('Entregas')] = '[]';
        
        abaP.appendRow(novaRow);
        
        registrarLog('Revisão de Plano', ref, 'Plano substituído por nova estratégia.');
        return { sucesso: true, mensagem: 'Plano antigo substituído e novo plano criado com sucesso!' };
      }

    });
  } catch(e) { return erroInterno_(e); }
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
        if (String(rows[i][CP('ID_Risco')]||'') === dados.riscoVinculado)
          return { sucesso: false, mensagem: 'Já existe um plano ativo para este risco.' };
      }
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado);
      const idPlano = getNextId_(aba, 'PLA-');
      aba.appendRow([idPlano, dados.riscoVinculado, dados.what, dados.why, dados.who,
        dados.where, dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status, 'Não', '[]', '[]'].map(neutralizarFormula_));
      registrarLog('Cadastro de Plano', dados.riscoVinculado, 'Plano 5W2H criado: ' + dados.what);
      return { sucesso: true, mensagem: 'Plano registrado!' };
    });
  } catch(e) { return erroInterno_(e); }
}

function atualizarPlano(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !dados.idPlano || !dados.riscoVinculado || !String(dados.what||'').trim() || !String(dados.why||'').trim() ||
        !dados.who || !String(dados.where||'').trim() || !dados.whenPrevisto || !String(dados.how||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos do plano.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado);
      for (let i = 1; i < rows.length; i++) {
        // Localiza pelo ID_Plano (chave estável) — o "O Que" pode se repetir
        // entre um plano Substituído e o novo que o sucedeu (ver revisarPlano,
        // ação "alterar"), e casar por texto localizava a linha ERRADA.
        if (String(rows[i][CP('ID_Plano')]||'').trim() === String(dados.idPlano).trim()) {
          if (String(rows[i][CP('ID_Risco')]||'').trim() !== dados.riscoVinculado)
            return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
          // Bloco contíguo O Que → Status (9 colunas)
          aba.getRange(i+1, CP('O_Que')+1, 1, 9).setValues([[dados.what, dados.why, dados.who, dados.where,
            dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status].map(neutralizarFormula_)]);
          registrarLog('Edição de Plano', dados.riscoVinculado, 'Status: ' + status);
          return { sucesso: true, mensagem: 'Plano atualizado!' };
        }
      }
      return { sucesso: false, mensagem: 'Plano não localizado.' };
    });
  } catch(e) { return erroInterno_(e); }
}

// --- Entregas ---
// Regra de negócio, num único ponto de verdade: um plano cujo "Quem" contém
// "TODAS" cobra todas as subcomissões; uma unidade é subcomissão quando
// "Subcomissão" aparece no nome. (Espelhada no cliente — ver JS_Riscos.html.)
function _planoEhGlobal_(quem) { return String(quem||'').toUpperCase().includes('TODAS'); }
function _ehSubcomissao_(nomeUnidade) { const n = String(nomeUnidade||'').toLowerCase(); return n.includes('subcomissão') || n.includes('subcomissao'); }

// A reavaliação da baixa automática do plano
function _reavaliarBaixa(abaP, indexPlano, rowData, entregasArr) {
  const CP = colIdx_(CABECALHOS_PLANOS);
  const who = String(rowData[CP('Quem(ID_Unidade)')]||'');
  const planoGlobal = _planoEhGlobal_(who);
  const statusAtualPlano = String(rowData[CP('Status')]||'');
  
  let darBaixa = false;
  
  if (planoGlobal) {
    const CU = colIdx_(CABECALHOS_UNIDADES);
    const abaU = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNITS);
    const rowsU = abaU ? abaU.getDataRange().getValues() : [];
    const subcomissoes = rowsU.slice(1).filter(r => _ehSubcomissao_(r[CU('Nome_Da_Unidade')]));
    const total = Math.max(subcomissoes.length, 1);
    const entregaram = new Set();
    entregasArr.forEach(e => {
      if (e.status === 'Sim') entregaram.add(e.unidade);
    });
    darBaixa = entregaram.size >= total;
  } else {
    darBaixa = entregasArr.some(e => e.status === 'Sim');
  }

  const hoje = _dataLocalISO_(new Date());
  if (darBaixa) {
    abaP.getRange(indexPlano, CP('Data_Finalizacao')+1).setValue(hoje);
    abaP.getRange(indexPlano, CP('Status')+1).setValue('Concluído');
  } else {
    if (statusAtualPlano === 'Concluído') return; // Congelamento de status aprovado (não reabrir se cadastrar nova unidade)
    abaP.getRange(indexPlano, CP('Data_Finalizacao')+1).clearContent();
    abaP.getRange(indexPlano, CP('Status')+1).setValue(_statusPlano(rowData[CP('Data_Prevista')], ''));
  }
}

// Salva/atualiza múltiplas entregas de uma vez (acompanhamento em lote).
function salvarEntregasEmLote(idPlano, entregas) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const rows = aba.getDataRange().getValues();
      const CP = colIdx_(CABECALHOS_PLANOS);

      let indexPlano = -1;
      let riscoVinculado = '';
      let jsonAntigo = [];

      // Localiza pelo ID_Plano (chave estável) — ver mesmo comentário em
      // atualizarPlano/revisarPlano sobre por que "O Que" não é confiável.
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CP('ID_Plano')]||'').trim() === String(idPlano).trim()) {
          indexPlano = i + 1;
          riscoVinculado = String(rows[i][CP('ID_Risco')]||'');
          const txt = String(rows[i][CP('Entregas')]||'').trim();
          if (txt.startsWith('[')) {
            try { jsonAntigo = JSON.parse(txt); } catch(e) {}
          }
          break;
        }
      }

      if (indexPlano === -1) return { sucesso: false, mensagem: 'Plano não encontrado na planilha.' };
      
      const mapEntregas = new Map();
      jsonAntigo.forEach(e => mapEntregas.set(e.unidade, e));
      
      entregas.forEach(ent => {
        mapEntregas.set(ent.unidade, {
          unidade: ent.unidade,
          status: ent.entregue,
          data: ent.dataEntrega || '',
          sei: ent.processoSei || ''
        });
      });
      
      const novoJsonArr = Array.from(mapEntregas.values());
      aba.getRange(indexPlano, CP('Entregas') + 1).setValue(JSON.stringify(novoJsonArr));
      
      _reavaliarBaixa(aba, indexPlano, rows[indexPlano-1], novoJsonArr);
      
      registrarLog('Acompanhamento de Entregas', riscoVinculado, 'Entregas do plano atualizadas. Registros: ' + entregas.length);
      return { sucesso: true, mensagem: 'Registros salvos com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
}

// PDF por e-mail: ver gerarPdfDeHtml/enviarPdfDeHtml em Código.js — a
// geração de PDF agora é feita a partir de HTML (não mais de um Base64
// de captura de tela), então essa função não é mais necessária aqui.