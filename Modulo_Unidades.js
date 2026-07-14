// ==========================================
// MÓDULO 3 — UNIDADES / SUBCOMISSÕES
// ==========================================
function salvarUnidade(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.unidade||'').trim() || !String(dados.sigla||'').trim() || !String(dados.email||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos da Unidade.' };
    if (!linkPermitido_(dados.linkDrive))
      return { sucesso: false, mensagem: 'O link do Drive deve começar com http:// ou https://' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS, CABECALHOS_UNIDADES);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const rows = aba.getDataRange().getValues();
      const siglaNova = dados.sigla.toString().trim().toUpperCase();
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i][C('Sigla')]||'').toString().trim().toUpperCase() === siglaNova)
          return { sucesso: false, mensagem: "Já existe uma unidade com a sigla '" + dados.sigla + "'." };
      }
      const id = getNextId_(aba, 'UN-');
      aba.appendRow([id, dados.unidade.trim(), dados.sigla.trim(), dados.email.trim(), (dados.linkDrive||'').trim(), 'Sim']);
      registrarLog('Cadastro de Unidade', dados.sigla, 'Unidade incluída: ' + dados.unidade);
      return { sucesso: true, mensagem: 'Unidade cadastrada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function atualizarUnidade(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!linkPermitido_(dados.linkDrive))
      return { sucesso: false, mensagem: 'O link do Drive deve começar com http:// ou https://' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const linha = parseInt(dados.idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      // Confere a sigla original antes de escrever, para não atualizar a linha
      // errada se a lista do usuário estiver desatualizada.
      if (dados.siglaOriginal) {
        const atual = aba.getRange(linha, C('Sigla')+1).getValue().toString().trim();
        if (atual !== String(dados.siglaOriginal).trim())
          return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      }
      // Impede renomear a sigla para uma já usada por OUTRA unidade (a criação
      // já bloqueia duplicatas; a edição não bloqueava). Ignora a própria linha.
      const siglaNova = String(dados.sigla||'').trim().toUpperCase();
      const rows = aba.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (i === linha - 1) continue; // a própria linha (rows[i] = linha da planilha i+1)
        if ((rows[i][C('Sigla')]||'').toString().trim().toUpperCase() === siglaNova)
          return { sucesso: false, mensagem: "Já existe uma unidade com a sigla '" + dados.sigla + "'." };
      }
      aba.getRange(linha, C('Nome da Unidade')+1, 1, 4).setValues([[dados.unidade, dados.sigla, dados.email, (dados.linkDrive||'').trim()]]);
      registrarLog('Edição de Unidade', dados.sigla, 'Dados atualizados.');
      return { sucesso: true, mensagem: 'Unidade atualizada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirUnidade(idRow, siglaEsperada) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const linha = parseInt(idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      const sigla = aba.getRange(linha, C('Sigla')+1).getValue();
      // Confere a sigla antes de excluir
      if (siglaEsperada && sigla.toString().trim() !== String(siglaEsperada).trim())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      // Integridade referencial: Documentos/Riscos/Planos guardam a unidade
      // responsável pelo id (ex.: "UN-5"). Excluir a unidade deixaria essas
      // referências órfãs (passariam a exibir o id cru na tela). Bloqueia a
      // exclusão enquanto houver itens vinculados. Dentro do lock, garante que
      // nada passe a referenciá-la entre a checagem e a remoção.
      const idUnidade   = aba.getRange(linha, C('ID Unidade')+1).getValue().toString().trim();
      const nomeUnidade = aba.getRange(linha, C('Nome da Unidade')+1).getValue().toString().trim();
      const refs = contarReferenciasUnidade_(idUnidade, sigla.toString().trim(), nomeUnidade);
      if (refs.total > 0)
        return { sucesso: false, mensagem: 'Não é possível excluir: a unidade ainda é responsável por ' + refs.descricao + '. Reatribua ou remova esses itens antes.' };
      aba.deleteRow(linha);
      registrarLog('Exclusão de Unidade', sigla, 'Unidade removida.');
      return { sucesso: true, mensagem: 'Unidade excluída com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// Conta quantos Documentos/Riscos/Planos ainda apontam para uma unidade.
// Aceita o id atual (ex.: "UN-5") e também o formato de texto legado
// ("SIGLA - Nome"), já que dados antigos podem ter gravado o responsável
// como texto antes de o sistema passar a referenciar por id.
function contarReferenciasUnidade_(idUnidade, sigla, nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const alvos = {};
  if (idUnidade) alvos[idUnidade] = true;
  if (sigla && nome) alvos[sigla + ' - ' + nome] = true; // formato legado
  const bate = v => !!alvos[String(v || '').trim()];

  let docs = 0, riscos = 0, planos = 0;
  const dData = safeGetSheetData(ss, SHEET_DOCS);
  if (dData.length > 1) { const CD = colIdx_(CABECALHOS_DOCS);   docs   = dData.slice(1).filter(r => bate(r[CD('Responsável')])).length; }
  const rData = safeGetSheetData(ss, SHEET_RISKS);
  if (rData.length > 1) { const CR = colIdx_(CABECALHOS_RISCOS); riscos = rData.slice(1).filter(r => bate(r[CR('Responsável')])).length; }
  const pData = safeGetSheetData(ss, SHEET_PLANS);
  if (pData.length > 1) { const CP = colIdx_(CABECALHOS_PLANOS); planos = pData.slice(1).filter(r => bate(r[CP('Quem')])).length; }

  const partes = [];
  if (docs)   partes.push(docs   + (docs   === 1 ? ' documento' : ' documentos'));
  if (riscos) partes.push(riscos + (riscos === 1 ? ' risco'     : ' riscos'));
  if (planos) partes.push(planos + (planos === 1 ? ' plano de ação' : ' planos de ação'));
  return { total: docs + riscos + planos, descricao: partes.join(', ') };
}

function _definirStatusUnidade_(idRow, siglaEsperada, statusAtivo) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const linha = parseInt(idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      
      const sigla = aba.getRange(linha, C('Sigla')+1).getValue();
      if (siglaEsperada && sigla.toString().trim() !== String(siglaEsperada).trim())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
        
      aba.getRange(linha, C('Ativo')+1).setValue(statusAtivo ? 'Sim' : 'Não');
      registrarLog(statusAtivo ? 'Reativação de Unidade' : 'Inativação de Unidade', sigla, statusAtivo ? 'Unidade reativada.' : 'Unidade inativada.');
      return { sucesso: true, mensagem: statusAtivo ? 'Unidade reativada com sucesso!' : 'Unidade inativada com sucesso!' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function inativarUnidade(idRow, sigla) { return _definirStatusUnidade_(idRow, sigla, false); }
function reativarUnidade(idRow, sigla) { return _definirStatusUnidade_(idRow, sigla, true); }