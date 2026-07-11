// ==========================================
// MÓDULO 5 — GESTÃO DE RISCOS, PLANOS DE AÇÃO (5W2H) E ENTREGAS
// (arquivo único: os três estão intimamente ligados — planos vinculam
// a riscos, entregas vinculam a planos)
// ==========================================
function salvarRisco(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_RISKS);
      const rows = aba.getDataRange().getValues();
      let max = 0;
      rows.slice(1).forEach(r => {
        const n = parseInt(String(r[1]||'').replace(/\D/g,''), 10);
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
      const ref = 'R' + dados.id;
      const rows = aba.getDataRange().getValues();
      let linha = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1].toString().trim() === ref && String(rows[i][12]||'Vigente').trim() === 'Vigente') { linha = i+1; break; }
      }
      if (linha === -1) return { sucesso: false, mensagem: 'Risco não localizado.' };
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      aba.getRange(linha, 3, 1, 10).setValues([[dados.macroetapa, dados.nome, dados.causa, dados.consequencia,
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
      const ref = 'R' + dados.id;
      const rows = aba.getDataRange().getValues();
      let linhaAntiga = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1].toString().trim() === ref && String(rows[i][12]||'Vigente').trim() === 'Vigente') { linhaAntiga = i+1; break; }
      }
      if (linhaAntiga === -1) throw new Error('Risco original não localizado.');
      aba.getRange(linhaAntiga, 13).setValue('Obsoleto');
      const antiga = rows[linhaAntiga - 1];
      const nivel = calcularNivelRisco(dados.probabilidade, dados.impacto);
      aba.appendRow([dados.data ? new Date(dados.data + 'T12:00:00') : new Date(), ref,
        antiga[2], antiga[3], antiga[4], antiga[5], antiga[6],
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
      for (let i = rowsR.length - 1; i >= 1; i--) {
        if (rowsR[i][1].toString().trim() === ref) abaR.deleteRow(i+1);
      }
      [SHEET_PLANS, SHEET_DELIVERY].forEach(nomeAba => {
        const aba = ss.getSheetByName(nomeAba);
        if (!aba) return;
        const rows = aba.getDataRange().getValues();
        for (let i = rows.length - 1; i >= 1; i--) {
          const r = String(rows[i][1]||'');
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
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_PLANS);
      const rows = aba.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        const st = String(rows[i][10]||'').trim();
        if (String(rows[i][1]||'') === dados.riscoVinculado && st !== 'Arquivado' && st !== 'Superado')
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
      const rows = aba.getDataRange().getValues();
      const status = _statusPlano(dados.whenPrevisto, dados.whenFinalizado, dados.cancelamento);
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][1]||'') === dados.riscoVinculado) {
          aba.getRange(i+1, 3, 1, 10).setValues([[dados.what, dados.why, dados.who, dados.where,
            dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status, dados.cancelamento||'']]);
          if (status === 'Arquivado') {
            const abaE = ss.getSheetByName(SHEET_DELIVERY);
            if (abaE) {
              const rowsE = abaE.getDataRange().getValues();
              for (let e = 1; e < rowsE.length; e++) {
                if (String(rowsE[e][1]||'') === dados.riscoVinculado) abaE.getRange(e+1, 10).setValue('Arquivado');
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
      const rows = aba.getDataRange().getValues();
      let linhaAtual = -1;
      for (let i = 1; i < rows.length; i++) {
        const st = String(rows[i][10]||'').trim();
        if (String(rows[i][1]||'') === dados.riscoVinculado && st !== 'Arquivado' && st !== 'Superado') {
          linhaAtual = i + 1; break;
        }
      }
      if (linhaAtual === -1) return { sucesso: false, mensagem: 'Plano ativo não localizado para este risco.' };

      const antiga = rows[linhaAtual - 1];
      const versaoAtual = parseFloat(String(antiga[12] || '1').replace(',', '.')) || 1;
      const novaVersao = (versaoAtual + 1).toFixed(1);

      aba.getRange(linhaAtual, 11).setValue('Superado');
      // Guarda o motivo da revisão na própria linha antiga (coluna de
      // Motivo Cancelamento é reaproveitada aqui só para versões
      // superadas — não tem conflito, pois "Arquivado" já usa esse
      // mesmo campo para o motivo do arquivamento).
      aba.getRange(linhaAtual, 12).setValue(dados.motivo || '');

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
    const rows = aba.getDataRange().getValues();
    const versoes = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1] || '') === riscoVinculado) {
        versoes.push({
          versao: (parseFloat(String(rows[i][12] || '1').replace(',', '.')) || 1).toFixed(1),
          what: String(rows[i][2] || ''), why: String(rows[i][3] || ''),
          who: String(rows[i][4] || ''), where: String(rows[i][5] || ''),
          whenPrevisto: formatarDataParaUI(rows[i][6]), whenFinalizado: formatarDataParaUI(rows[i][7]),
          how: String(rows[i][8] || ''), howMuch: String(rows[i][9] || ''),
          status: String(rows[i][10] || ''), motivo: String(rows[i][11] || ''),
          dataRegistro: formatarDataParaUI(rows[i][0])
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
      const rows = aba.getDataRange().getValues();
      let excluiu = false;
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][1]||'') === idPlano) { aba.deleteRow(i+1); excluiu = true; }
      }
      if (!excluiu) return { sucesso: false, mensagem: 'Plano não localizado.' };
      // Remove também as entregas vinculadas — sem isso, um plano novo criado
      // para o mesmo risco "herdava" os registros de entrega do plano excluído.
      const abaE = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DELIVERY);
      if (abaE) {
        const rowsE = abaE.getDataRange().getValues();
        for (let i = rowsE.length - 1; i >= 1; i--) {
          if (String(rowsE[i][1]||'') === idPlano) abaE.deleteRow(i+1);
        }
      }
      registrarLog('Exclusão de Plano', idPlano, 'Plano e entregas vinculadas removidos.');
      return { sucesso: true, mensagem: 'Plano excluído!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// --- Entregas ---
function salvarEntrega(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DELIVERY);
      const rows = aba.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][1]||'') === dados.riscoVinculado &&
            String(rows[i][2]||'') === dados.unidade &&
            String(rows[i][9]||'Ativo') !== 'Arquivado')
          return { sucesso: false, mensagem: 'Já existe um registro ativo para esta unidade.' };
      }
      aba.appendRow([new Date(), dados.riscoVinculado, dados.unidade, dados.entregue,
        dados.dataEntrega||'', dados.tipoDoc||'', dados.processoSei||'', dados.justificativa||'', usuarioAtual_(), 'Ativo']);
      _reavaliarBaixa(dados.riscoVinculado);
      registrarLog('Registro de Entrega', dados.riscoVinculado, 'Unidade: ' + dados.unidade);
      return { sucesso: true, mensagem: 'Registro salvo!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarEntrega(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DELIVERY);
      const rows = aba.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][1]||'') === dados.riscoVinculado &&
            String(rows[i][2]||'') === dados.unidade &&
            String(rows[i][9]||'Ativo') !== 'Arquivado') {
          aba.getRange(i+1, 4, 1, 6).setValues([[dados.entregue, dados.dataEntrega||'',
            dados.tipoDoc||'', dados.processoSei||'', dados.justificativa||'', usuarioAtual_()]]);
          _reavaliarBaixa(dados.riscoVinculado);
          return { sucesso: true, mensagem: 'Entrega atualizada!' };
        }
      }
      return { sucesso: false, mensagem: 'Registro não encontrado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirEntrega(riscoVinculado, unidade) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DELIVERY);
      const rows = aba.getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][1]||'') === riscoVinculado &&
            String(rows[i][2]||'') === unidade &&
            String(rows[i][9]||'Ativo') !== 'Arquivado') {
          aba.deleteRow(i+1);
          _reavaliarBaixa(riscoVinculado);
          registrarLog('Exclusão de Entrega', riscoVinculado, 'Unidade: ' + unidade);
          return { sucesso: true, mensagem: 'Registro excluído!' };
        }
      }
      return { sucesso: false, mensagem: 'Registro não encontrado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function _reavaliarBaixa(refRisco) {
  const abaP = conectarAba(SHEET_PLANS);
  const abaE = conectarAba(SHEET_DELIVERY);
  const rowsP = abaP.getDataRange().getValues();
  let indexPlano = -1, planoGlobal = false;
  for (let i = 1; i < rowsP.length; i++) {
    const st = String(rowsP[i][10]||'').trim();
    if (String(rowsP[i][1]||'') === refRisco && st !== 'Arquivado' && st !== 'Superado') {
      indexPlano = i+1;
      planoGlobal = (String(rowsP[i][4]||'')).toUpperCase().includes('TODAS');
      break;
    }
  }
  if (indexPlano === -1) return;
  const rowsE = abaE.getDataRange().getValues();
  let darBaixa = false;
  if (planoGlobal) {
    const abaU = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNITS);
    const rowsU = abaU ? abaU.getDataRange().getValues() : [];
    const subcomissoes = rowsU.slice(1).filter(r => { const n = String(r[0]||'').toLowerCase(); return n.includes('subcomissão') || n.includes('subcomissao'); });
    const total = Math.max(subcomissoes.length, 1);
    const entregaram = new Set();
    rowsE.slice(1).forEach(r => {
      if (String(r[1]||'') === refRisco && r[3] === 'Sim' && r[9] !== 'Arquivado') entregaram.add(String(r[2]||''));
    });
    darBaixa = entregaram.size >= total;
  } else {
    for (let i = rowsE.length - 1; i >= 1; i--) {
      if (String(rowsE[i][1]||'') === refRisco && rowsE[i][9] !== 'Arquivado') {
        darBaixa = rowsE[i][3] === 'Sim'; break;
      }
    }
  }
  const hoje = new Date().toISOString().split('T')[0];
  if (darBaixa) {
    abaP.getRange(indexPlano, 8).setValue(hoje);
    abaP.getRange(indexPlano, 11).setValue('Concluído');
  } else {
    abaP.getRange(indexPlano, 8).clearContent();
    abaP.getRange(indexPlano, 11).setValue(_statusPlano(rowsP[indexPlano-1][6], '', rowsP[indexPlano-1][11]));
  }
}

// Salva/atualiza múltiplas entregas de uma vez (acompanhamento em lote).
function salvarEntregasEmLote(riscoVinculado, entregas) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_DELIVERY);
      let rows = aba.getDataRange().getValues();
      const usr = usuarioAtual_();

      entregas.forEach(function(ent) {
        let linhaExistente = -1;
        for (let i = rows.length - 1; i >= 1; i--) {
          if (String(rows[i][1]||'') === riscoVinculado &&
              String(rows[i][2]||'') === ent.unidade &&
              String(rows[i][9]||'Ativo') !== 'Arquivado') {
            linhaExistente = i + 1; break;
          }
        }
        if (linhaExistente > 0) {
          aba.getRange(linhaExistente, 4, 1, 6).setValues([[ent.entregue, ent.dataEntrega||'',
            ent.tipoDoc||'', ent.processoSei||'', ent.justificativa||'', usr]]);
        } else {
          aba.appendRow([new Date(), riscoVinculado, ent.unidade, ent.entregue,
            ent.dataEntrega||'', ent.tipoDoc||'', ent.processoSei||'', ent.justificativa||'', usr, 'Ativo']);
          rows.push(new Array(10).fill(''));
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