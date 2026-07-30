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
    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const rows = aba.getDataRange().getValues();
      let max = 0;
      rows.slice(1).forEach(r => {
        const n = parseInt(String(r[CR('ID_Risco')]||'').replace(/\D/g,''), 10);
        if (!isNaN(n) && n > max) max = n;
      });
      const id = 'R' + (max + 1);
      const nivel = calcularNivelRisco_(dados.probabilidade, dados.impacto);
      // Cadastro inicial = Versao 1 do risco. Reavaliações futuras entram
      // como novas linhas com o mesmo ID_Risco (ver reavaliarRisco), não mais
      // como entradas num JSON dentro desta linha.
      aba.appendRow([id, 1, dados.macroetapa, nomeR, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel,
        dados.tipoTratamento, dados.responsavel, '', 'Ativo', 'Cadastro inicial do risco.',
        _dataLocalISO_(new Date())].map(neutralizarFormula_));
      registrarLog_('Cadastro de Risco', id, 'Risco criado: ' + nomeR);
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
    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const ref = 'R' + dados.id;
      // Localiza pela linha (idRow) que o cliente tinha carregada, não mais
      // pela primeira linha que bater com ID_Risco — com 1 linha por VERSÃO do
      // risco, várias linhas podem compartilhar o mesmo ID_Risco, e o "para no
      // primeiro match" acertaria a linha mais antiga por engano (mesmo bug já
      // corrigido em Planos, ver ID_Plano). Trava otimista: confere que a
      // linha ainda é a do risco esperado antes de escrever.
      const linha = parseInt(dados.idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Risco não localizado.' };
      if (aba.getRange(linha, CR('ID_Risco')+1).getValue().toString().trim() !== ref)
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      const nivel = calcularNivelRisco_(dados.probabilidade, dados.impacto);
      // Corrige a versão atual do risco (esta linha) — não é uma reavaliação,
      // não mexe em Versao/Status/Justificativa/Data_Avaliacao.
      aba.getRange(linha, CR('Macroetapa')+1, 1, 10).setValues([[dados.macroetapa, nomeR, dados.causa, dados.consequencia,
        dados.categoria, Number(dados.probabilidade), Number(dados.impacto), nivel, dados.tipoTratamento, dados.responsavel].map(neutralizarFormula_)]);
      registrarLog_('Edição de Risco', ref, 'Metadados atualizados.');
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
    return comBloqueio_(() => {
      const ref = 'R' + idRisco;
      const abaR = conectarAba_(SHEET_RISKS);
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
      registrarLog_(acaoLog, ref, detalheLog);
      return { sucesso: true, mensagem: msgOk };
    });
  } catch(e) { return erroInterno_(e); }
}

// Status gravado na coluna Status da aba Riscos. Era 'Arquivado' até
// 2026-07-27; renomeado para 'Superado' para bater com o vocabulário da tela
// ("Marcar como Superado" / aba "Superados"). Troca direta, sem aceitar a
// grafia antiga na leitura: não havia nenhum risco arquivado na planilha
// quando a renomeação foi feita, então não existe linha legada para tolerar.
function excluirRisco(idRisco) {
  return _definirStatusRisco_(idRisco, 'Superado', 'Superação de Risco',
    'Risco marcado como superado (soft delete).', 'Risco superado!');
}

function restaurarRisco(idRisco) {
  return _definirStatusRisco_(idRisco, 'Ativo', 'Restauração de Risco',
    'Risco restaurado (ativo).', 'Risco restaurado com sucesso!');
}

function reavaliarRisco(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    // Validação no servidor (espelha a do cliente e a de salvarRisco). Sem ela,
    // uma chamada direta gravava uma linha de versão com Nível sem sentido —
    // e como a leitura sempre trata a linha de maior Versao como o estado
    // atual do risco, esse lixo virava a verdade do risco na matriz.
    if (!dados || !dados.tipoTratamento || !dados.responsavel)
      return { sucesso: false, mensagem: 'Preencha o tipo de tratamento e o responsável.' };
    const prob = Number(dados.probabilidade), imp = Number(dados.impacto);
    if (isNaN(prob) || isNaN(imp) || prob < 1 || prob > 5 || imp < 1 || imp > 5)
      return { sucesso: false, mensagem: 'Probabilidade e impacto devem ser números entre 1 e 5.' };
    return comBloqueio_(() => {
      const ref = 'R' + dados.idRisco;

      const abaR = conectarAba_(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      // Localiza pela linha (idRow) que o cliente tinha carregada — é dela que
      // vêm os campos que não mudam numa reavaliação (Macroetapa/Categoria/
      // Descrição/Causa/Consequência). Mesma trava otimista de atualizarRisco:
      // com 1 linha por versão, várias linhas podem ter o mesmo ID_Risco, então
      // não dá mais pra simplesmente buscar "a primeira que bater".
      const linhaR = parseInt(dados.idRow, 10);
      if (isNaN(linhaR) || linhaR < 2 || linhaR > abaR.getLastRow())
        return { sucesso: false, mensagem: 'Risco ' + ref + ' não encontrado.' };
      const linhaAtual = abaR.getRange(linhaR, 1, 1, abaR.getLastColumn()).getValues()[0];
      if (String(linhaAtual[CR('ID_Risco')]||'').trim() !== ref)
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };

      const nivel = calcularNivelRisco_(prob, imp);
      const novaVersao = (parseInt(linhaAtual[CR('Versao')], 10) || 1) + 1;

      // Reavaliação = linha NOVA (nova versão do risco), nunca reescreve a
      // linha anterior — ela fica intacta como registro histórico. Copia os
      // campos que não mudam (Macroetapa/Categoria/Descrição/Causa/
      // Consequência/Status) da linha atual.
      abaR.appendRow([
        ref, novaVersao, linhaAtual[CR('Macroetapa')], linhaAtual[CR('Risco')], linhaAtual[CR('Causa')],
        linhaAtual[CR('Consequencia')], linhaAtual[CR('Categoria')], prob, imp, nivel,
        dados.tipoTratamento, dados.responsavel, linhaAtual[CR('ID_Plano')] || '', linhaAtual[CR('Status')], dados.justificativa || '',
        _dataLocalISO_(new Date())
      ].map(neutralizarFormula_));

      // A ação "Manter Avaliação Atual" grava a versão acima (rastro auditável
      // de que o risco foi confirmado naquela data), mas NÃO marca os planos
      // como pendentes de revisão: P×I, tratamento e responsável continuam os
      // mesmos, então não há o que revisar no 5W2H. Forçar a pendência aqui
      // obrigava todos os responsáveis a "revisar" algo que não mudou.
      // (Decisão de negócio — auditoria de 2026-07-27, item B-06.)
      // Sem `acao` no payload, mantém o comportamento antigo (marca pendência).
      if (dados.acao !== 'manter') {
        // Só marca planos que NÃO foram Cancelados/Substituídos como pendentes
        // de revisão — esses dois são decisão formal já tomada (abandonar/
        // trocar o plano) e não devem voltar a pedir revisão. "Concluído" NÃO
        // entra aqui: significa que as entregas foram feitas, mas se o risco
        // for reavaliado depois, o tratamento já concluído ainda pode precisar
        // ser revisto (continua válido? precisa de um novo plano?).
        const abaP = conectarAba_(SHEET_PLANS);
        const rowsP = abaP.getDataRange().getValues();
        const CP = colIdx_(CABECALHOS_PLANOS);
        const STATUS_TERMINAIS = ['Cancelado', 'Substituído'];
        for (let i = 1; i < rowsP.length; i++) {
          if (rowsP[i][CP('ID_Risco')].toString().trim() === ref &&
              !STATUS_TERMINAIS.includes(String(rowsP[i][CP('Status')]||'').trim())) {
            abaP.getRange(i+1, CP('Revisao_Pendente') + 1).setValue('Sim');
          }
        }
      }

      registrarLog_('Reavaliação de Risco', ref,
        dados.acao === 'manter' ? 'Avaliação mantida na reavaliação (sem alteração).' : 'Risco reavaliado.');
      return { sucesso: true, mensagem: 'Reavaliação salva!' };
    });
  } catch(e) { return erroInterno_(e); }
}

function revisarPlano(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio_(() => {
      const ref = dados.riscoVinculado;
      const abaP = conectarAba_(SHEET_PLANS);
      const rowsP = abaP.getDataRange().getValues();
      const CP = colIdx_(CABECALHOS_PLANOS);
      
      let linhaP = -1;
      // Localiza pelo ID_Plano (chave estável) — casar por "O Que" corria o
      // risco de bater com um plano Substituído anterior que tivesse o mesmo
      // texto (mesmo bug relatado em atualizarPlano).
      for (let i = 1; i < rowsP.length; i++) {
        if (String(rowsP[i][CP('ID_Plano')]||'').trim() === String(dados.idPlano).trim()) {
          if (String(rowsP[i][CP('ID_Risco')]||'').trim() !== ref) return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
          linhaP = i + 1;
          break;
        }
      }
      
      if (linhaP === -1) return { sucesso: false, mensagem: 'Plano não encontrado para revisão.' };
      if (dados.acao !== 'manter' && dados.acao !== 'alterar')
        return { sucesso: false, mensagem: 'Ação de revisão inválida.' };

      // Defesa em profundidade: sem esta checagem, uma chamada direta criava um
      // plano 5W2H vazio e o vinculava à versão vigente do risco. Espelha o
      // conjunto exigido pelo cliente (what/why/who/whenPrevisto) — de propósito
      // não exige Onde/Como, que o modal de revisão também não obriga.
      if (dados.acao === 'alterar' &&
          (!String(dados.what||'').trim() || !String(dados.why||'').trim() ||
           !dados.who || !dados.whenPrevisto))
        return { sucesso: false, mensagem: 'Preencha os campos obrigatórios do novo plano.' };

      const hoje = _dataLocalISO_(new Date());
      const justifTexto = dados.justificativa;

      if (dados.acao === 'manter') {
        // 'manter': nada do 5W2H muda, então não cria linha nova — só
        // zera a pendência e registra a revisão na própria linha
        // (Justificativa/Data_Avaliacao). Sem linha nova: Status não precisa
        // ser recalculado (continua o que já era, certo) e as entregas já
        // registradas continuam vinculadas ao mesmo ID_Plano sem precisar
        // copiar nada.
        abaP.getRange(linhaP, CP('Revisao_Pendente') + 1).setValue('Não');
        abaP.getRange(linhaP, CP('Justificativa') + 1, 1, 2).setValues([[
          justifTexto || 'Mantido após reavaliação.', hoje
        ].map(neutralizarFormula_)]);
        registrarLog_('Revisão de Plano', ref, 'Plano mantido em andamento.');
        return { sucesso: true, mensagem: 'Plano mantido com sucesso!' };
      }

      // 'alterar': estratégia nova de verdade — fecha a linha atual (vira
      // histórico) e cria uma linha nova com ID_Plano novo, igual
      // reavaliarRisco faz em Riscos. Nunca reescreve a linha antiga.
      abaP.getRange(linhaP, CP('Revisao_Pendente') + 1).setValue('Não');
      abaP.getRange(linhaP, CP('Status') + 1).setValue('Substituído');
      
      const oldFin = String(rowsP[linhaP - 1][CP('Data_Finalizacao')] || '').trim();
      if (!oldFin) {
        abaP.getRange(linhaP, CP('Data_Finalizacao') + 1).setValue(hoje);
      }

      const novaRow = new Array(CABECALHOS_PLANOS.length).fill('');
      novaRow[CP('ID_Plano')] = getNextId_(abaP, 'PLA-');
      novaRow[CP('ID_Risco')] = ref;
      novaRow[CP('Revisao_Pendente')] = 'Não';
      novaRow[CP('O_Que')] = dados.what;
      novaRow[CP('Por_Que')] = dados.why;
      novaRow[CP('Quem(ID_Unidade)')] = dados.who;
      novaRow[CP('Onde')] = dados.where;
      novaRow[CP('Data_Prevista')] = dados.whenPrevisto;
      novaRow[CP('Data_Finalizacao')] = dados.whenFinalizado || '';
      novaRow[CP('Como')] = dados.how;
      novaRow[CP('Quanto_Custa')] = dados.howMuch;
      novaRow[CP('Status')] = _statusPlano_(dados.whenPrevisto, dados.whenFinalizado);
      novaRow[CP('Justificativa')] = justifTexto || 'Estratégia substituída por um novo plano.';
      novaRow[CP('Data_Avaliacao')] = hoje;
      abaP.appendRow(novaRow.map(neutralizarFormula_));
      // Estratégia nova — começa sem nenhuma entrega vinculada (de propósito).
      
      // Atualiza o plano vigente na última versão do risco correspondente
      const abaRiscos = conectarAba_(SHEET_RISKS);
      const rowsR = abaRiscos.getDataRange().getValues();
      const CR = colIdx_(CABECALHOS_RISCOS);
      let lastRiskRow = -1;
      for (let i = rowsR.length - 1; i >= 1; i--) {
        if (String(rowsR[i][CR('ID_Risco')]||'').trim() === ref) {
          lastRiskRow = i + 1;
          break;
        }
      }
      if (lastRiskRow !== -1) {
        abaRiscos.getRange(lastRiskRow, CR('ID_Plano') + 1).setValue(novaRow[CP('ID_Plano')]);
      }

      registrarLog_('Revisão de Plano', ref, 'Plano substituído por nova estratégia.');
      return { sucesso: true, mensagem: 'Plano antigo substituído e novo plano criado com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
}

// ==========================================
// MÓDULO 6 — PLANOS DE AÇÃO (5W2H) E ENTREGAS
// ==========================================
function _statusPlano_(previsto, finalizado) {
  const fin = formatarDataParaUI_(finalizado);
  if (fin && fin.trim()) return 'Concluído';
  const prev = formatarDataParaUI_(previsto);
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
    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      // "Um plano ativo por risco": planos Cancelado/Substituído NÃO contam —
      // são decisão formal encerrada. Contá-los travava o cadastro para sempre,
      // porque revisarPlano('alterar') deixa de propósito a linha antiga como
      // 'Substituído' com o mesmo ID_Risco. Mesmos terminais de reavaliarRisco.
      // (Auditoria de 2026-07-27, item B-07.)
      const STATUS_TERMINAIS = ['Cancelado', 'Substituído'];
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CP('ID_Risco')]||'') === dados.riscoVinculado &&
            !STATUS_TERMINAIS.includes(String(rows[i][CP('Status')]||'').trim()))
          return { sucesso: false, mensagem: 'Já existe um plano ativo para este risco.' };
      }
      const status = _statusPlano_(dados.whenPrevisto, dados.whenFinalizado);
      const idPlano = getNextId_(aba, 'PLA-');
      aba.appendRow([idPlano, dados.riscoVinculado, dados.what, dados.why, dados.who,
        dados.where, dados.whenPrevisto, dados.whenFinalizado||'', dados.how, dados.howMuch, status, 'Não',
        'Cadastro inicial do plano.', _dataLocalISO_(new Date())].map(neutralizarFormula_));
        
      // Atualiza o ID_Plano na última versão do Risco
      const abaRiscos = conectarAba_(SHEET_RISKS);
      const rowsR = abaRiscos.getDataRange().getValues();
      const CR = colIdx_(CABECALHOS_RISCOS);
      let lastRiskRow = -1;
      for (let j = rowsR.length - 1; j >= 1; j--) {
        if (String(rowsR[j][CR('ID_Risco')]||'').trim() === dados.riscoVinculado) {
          lastRiskRow = j + 1;
          break;
        }
      }
      if (lastRiskRow !== -1) {
        abaRiscos.getRange(lastRiskRow, CR('ID_Plano') + 1).setValue(idPlano);
      }
      
      registrarLog_('Cadastro de Plano', dados.riscoVinculado, 'Plano 5W2H criado: ' + dados.what);
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
    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_PLANS);
      const CP = colIdx_(CABECALHOS_PLANOS);
      const rows = aba.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        // Localiza pelo ID_Plano (chave estável) — o "O Que" pode se repetir
        // entre um plano Substituído e o novo que o sucedeu (ver revisarPlano,
        // ação "alterar"), e casar por texto localizava a linha ERRADA.
        if (String(rows[i][CP('ID_Plano')]||'').trim() === String(dados.idPlano).trim()) {
          if (String(rows[i][CP('ID_Risco')]||'').trim() !== dados.riscoVinculado)
            return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
          // Trava: assim que alguma unidade já entregou de verdade (Status
          // 'Sim' em Entregas_Planos), o 5W2H fica travado — mudar O_Que/
          // Como/Quem depois disso desalinharia o que foi pedido do que já
          // foi entregue. Igual a checagem no cliente (renderAcompanhamento),
          // mas aqui é a que realmente impede a gravação.
          const ssE = SpreadsheetApp.getActiveSpreadsheet();
          const rowsE = safeGetSheetData_(ssE, SHEET_ENTREGAS_PLANOS);
          if (rowsE.length > 1) {
            const CE = colIdx_(CABECALHOS_ENTREGAS_PLANOS);
            const temEntregaFeita = rowsE.slice(1).some(rE =>
              String(rE[CE('ID_Plano')]||'').trim() === String(dados.idPlano).trim() && String(rE[CE('Status')]||'').trim() === 'Sim');
            if (temEntregaFeita) return { sucesso: false, mensagem: 'Este plano já tem entregas registradas e não pode mais ser editado.' };
          }
          // O modal de edição não tem campo de Data de Finalização, então o
          // payload vem sem a chave: gravar `dados.whenFinalizado||''` apagaria
          // o valor já existente na planilha (e rebaixaria o Status). Só grava
          // quando a chave vier no payload; caso contrário preserva a célula.
          const finalizado = ('whenFinalizado' in dados) ? (dados.whenFinalizado || '') : rows[i][CP('Data_Finalizacao')];
          const status = _statusPlano_(dados.whenPrevisto, finalizado);
          // Bloco contíguo O Que → Status (9 colunas)
          aba.getRange(i+1, CP('O_Que')+1, 1, 9).setValues([[dados.what, dados.why, dados.who, dados.where,
            dados.whenPrevisto, finalizado, dados.how, dados.howMuch, status].map(neutralizarFormula_)]);
          registrarLog_('Edição de Plano', dados.riscoVinculado, 'Status: ' + status);
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
// O `_` do FIM é o que torna a função privada no Apps Script — só o prefixo não
// basta. Sem ele, esta função era um endpoint chamável sem isMembro_() (mesma
// classe do item M-02 da auditoria, que não a listou).
function _reavaliarBaixa_(abaP, indexPlano, rowData, entregasArr) {
  const CP = colIdx_(CABECALHOS_PLANOS);
  const who = String(rowData[CP('Quem(ID_Unidade)')]||'');
  const planoGlobal = _planoEhGlobal_(who);
  const statusAtualPlano = String(rowData[CP('Status')]||'');
  
  let darBaixa = false;
  
  if (planoGlobal) {
    const CU = colIdx_(CABECALHOS_UNIDADES);
    const abaU = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNITS);
    const rowsU = abaU ? abaU.getDataRange().getValues() : [];
    // Só subcomissões ATIVAS entram no total cobrado — contar as inativadas
    // deixaria `entregaram.size >= total` inalcançável para sempre, prendendo o
    // plano global em "Em Andamento"/"Atrasado". Mesmo critério de _lerUnidades_.
    const subcomissoes = rowsU.slice(1).filter(r => {
      const at = String(r[CU('Ativo')] || '').trim().toLowerCase();
      return _ehSubcomissao_(r[CU('Nome_Da_Unidade')]) && at !== 'não' && at !== 'nao';
    });
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
    // Procura a data de entrega informada mais recente (ou a única) entre as entregas positivas
    let dataFinal = '';
    entregasArr.forEach(e => {
      if (e.status === 'Sim' && String(e.data||'').trim() !== '') {
        if (!dataFinal || e.data > dataFinal) {
          dataFinal = e.data;
        }
      }
    });
    // Se por algum motivo o usuário não preencheu a data no modal (campo Data da Entrega), usa 'hoje'
    const dataGravacao = dataFinal ? dataFinal : hoje;
    
    abaP.getRange(indexPlano, CP('Data_Finalizacao')+1).setValue(dataGravacao);
    abaP.getRange(indexPlano, CP('Status')+1).setValue('Concluído');
  } else {
    if (statusAtualPlano === 'Concluído') return; // Congelamento de status aprovado (não reabrir se cadastrar nova unidade)
    abaP.getRange(indexPlano, CP('Data_Finalizacao')+1).clearContent();
    abaP.getRange(indexPlano, CP('Status')+1).setValue(_statusPlano_(rowData[CP('Data_Prevista')], ''));
  }
}

// Salva/atualiza múltiplas entregas de uma vez (acompanhamento em lote).
function salvarEntregasEmLote(idPlano, entregas) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio_(() => {
      const aba = conectarAba_(SHEET_PLANS);
      const rows = aba.getDataRange().getValues();
      const CP = colIdx_(CABECALHOS_PLANOS);

      let indexPlano = -1;
      let riscoVinculado = '';
      let statusPlano = '';

      // Localiza pelo ID_Plano (chave estável) — ver mesmo comentário em
      // atualizarPlano/revisarPlano sobre por que "O Que" não é confiável.
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CP('ID_Plano')]||'').trim() === String(idPlano).trim()) {
          indexPlano = i + 1;
          riscoVinculado = String(rows[i][CP('ID_Risco')]||'');
          statusPlano = String(rows[i][CP('Status')]||'').trim();
          break;
        }
      }

      if (indexPlano === -1) return { sucesso: false, mensagem: 'Plano não encontrado na planilha.' };

      // A regra "entregas viram somente leitura" existia só no cliente
      // (abrirModalAcompEntregas). Campos disabled mantêm .value em JS, então
      // um clique em Salvar ainda montava um payload válido e gravava —
      // silenciosamente, com log — num risco já encerrado. Guarda de servidor.
      //
      // Só bloqueia o que é decisão DEFINITIVA e está GRAVADO na planilha.
      // 'Substituído' é o único status terminal que algum caminho realmente
      // grava (revisarPlano, ação "Substituir Plano"). 'Cancelado' aparece em
      // comparações legadas de outros pontos do módulo, mas nenhuma rotina o
      // escreve — ficaria como ramo morto e não entra aqui.
      // 'Concluído' de propósito não entra: ele é derivado na leitura por
      // _statusPlano_ (Data_Finalizacao preenchida) e não fica na coluna Status,
      // que segue 'Em Andamento' — ler daqui nunca o veria. Bloquear por data
      // também impediria a correção de uma entrega registrada errado num plano
      // já finalizado, que o cliente permite tratar por outros caminhos.
      if (statusPlano === 'Substituído')
        return { sucesso: false, mensagem: 'Este plano foi substituído — as entregas não podem mais ser alteradas.' };

      const abaR = conectarAba_(SHEET_RISKS);
      const CR = colIdx_(CABECALHOS_RISCOS);
      const rowsR = abaR.getDataRange().getValues();
      // Todas as linhas de um ID_Risco compartilham o mesmo Status (o sweep de
      // _definirStatusRisco_ garante), então o primeiro match já responde.
      for (let i = 1; i < rowsR.length; i++) {
        if (String(rowsR[i][CR('ID_Risco')]||'').trim() === String(riscoVinculado).trim()) {
          if (String(rowsR[i][CR('Status')]||'').trim() === 'Superado')
            return { sucesso: false, mensagem: 'O risco vinculado a este plano já foi superado — as entregas não podem mais ser alteradas.' };
          break;
        }
      }

      const abaE = conectarAba_(SHEET_ENTREGAS_PLANOS, CABECALHOS_ENTREGAS_PLANOS);
      const CE = colIdx_(CABECALHOS_ENTREGAS_PLANOS);
      const rowsE = abaE.getDataRange().getValues();

      // Upsert por (ID_Plano, Unidade) — atualiza a linha se já existe,
      // senão cria. O par é único por construção (nunca duas linhas com o
      // mesmo ID_Plano+Unidade), então não precisa da trava por idRow que
      // Riscos usa (lá, várias linhas legitimamente compartilham ID_Risco).
      entregas.forEach(ent => {
        let linhaE = -1;
        for (let i = 1; i < rowsE.length; i++) {
          if (String(rowsE[i][CE('ID_Plano')]||'').trim() === String(idPlano).trim() &&
              String(rowsE[i][CE('Unidade')]||'').trim() === String(ent.unidade).trim()) {
            linhaE = i + 1;
            break;
          }
        }
        const valores = [ent.unidade, ent.entregue, ent.dataEntrega || '', ent.processoSei || ''].map(neutralizarFormula_);
        if (linhaE === -1) {
          abaE.appendRow([idPlano].concat(valores));
        } else {
          abaE.getRange(linhaE, CE('Unidade') + 1, 1, 4).setValues([valores]);
        }
      });

      // Relê as entregas atuais do plano (pós-escrita) pra decidir a baixa automática.
      const rowsE2 = abaE.getDataRange().getValues();
      const entregasArr = rowsE2.slice(1)
        .filter(rE => String(rE[CE('ID_Plano')]||'').trim() === String(idPlano).trim())
        .map(rE => ({
           unidade: String(rE[CE('Unidade')]||''),
           status: String(rE[CE('Status')]||''),
           data: formatarDataParaUI_(rE[CE('Data')])
        }));

      _reavaliarBaixa_(aba, indexPlano, rows[indexPlano-1], entregasArr);

      registrarLog_('Acompanhamento de Entregas', riscoVinculado, 'Entregas do plano atualizadas. Registros: ' + entregas.length);
      return { sucesso: true, mensagem: 'Registros salvos com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
}

// PDF por e-mail: ver gerarPdfDeHtml/enviarPdfDeHtml em Código.js — a
// geração de PDF agora é feita a partir de HTML (não mais de um Base64
// de captura de tela), então essa função não é mais necessária aqui.