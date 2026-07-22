// ==========================================
// MÓDULO 3 — UNIDADES / SUBCOMISSÕES
// ==========================================
function salvarUnidade(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados || !String(dados.unidade||'').trim() || !String(dados.sigla||'').trim() || !String(dados.email||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos da Unidade.' };
    // 'Link do Drive' aceita texto livre (unidades sem Drive registram algo como
    // 'Não possui'). Por isso NÃO passa por linkPermitido_ — ao contrário dos
    // links de Documentos. A tela só transforma em link clicável o que for
    // http(s) de verdade (ver renderUnidades); o resto aparece como texto.
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
      aba.appendRow([id, dados.unidade.trim(), dados.sigla.trim(), dados.email.trim(), (dados.linkDrive||'').trim(), 'Sim'].map(neutralizarFormula_));
      registrarLog('Cadastro de Unidade', dados.sigla, 'Unidade incluída: ' + dados.unidade);
      return { sucesso: true, mensagem: 'Unidade cadastrada com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
}

function atualizarUnidade(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    // Mesma guarda de salvarUnidade (defense-in-depth): sem ela, uma chamada
    // direta gravava sigla vazia — que passa batido na checagem de duplicidade
    // abaixo e quebra a geração de código de documento (Modulo_Documentos.js),
    // que assume Sigla preenchida.
    if (!dados || !String(dados.unidade||'').trim() || !String(dados.sigla||'').trim() || !String(dados.email||'').trim())
      return { sucesso: false, mensagem: 'Preencha todos os campos da Unidade.' };
    // 'Link do Drive' aceita texto livre — ver salvarUnidade.
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_UNITS);
      const C = colIdx_(CABECALHOS_UNIDADES);
      const linha = parseInt(dados.idRow, 10);
      if (isNaN(linha) || linha < 2 || linha > aba.getLastRow())
        return { sucesso: false, mensagem: 'Registro não localizado.' };
      // Uma leitura só: o getDataRange() abaixo já contém a sigla original que
      // antes era buscada com um getValue() dedicado logo acima.
      const rows = aba.getDataRange().getValues();
      // Confere a sigla original antes de escrever, para não atualizar a linha
      // errada se a lista do usuário estiver desatualizada.
      if (dados.siglaOriginal) {
        const atual = String(rows[linha-1][C('Sigla')]||'').trim();
        if (atual !== String(dados.siglaOriginal).trim())
          return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      }
      // Impede renomear a sigla para uma já usada por OUTRA unidade (a criação
      // já bloqueia duplicatas; a edição não bloqueava). Ignora a própria linha.
      const siglaNova = String(dados.sigla||'').trim().toUpperCase();
      for (let i = 1; i < rows.length; i++) {
        if (i === linha - 1) continue; // a própria linha (rows[i] = linha da planilha i+1)
        if ((rows[i][C('Sigla')]||'').toString().trim().toUpperCase() === siglaNova)
          return { sucesso: false, mensagem: "Já existe uma unidade com a sigla '" + dados.sigla + "'." };
      }
      aba.getRange(linha, C('Nome da Unidade')+1, 1, 4).setValues([[dados.unidade, dados.sigla, dados.email, (dados.linkDrive||'').trim()].map(neutralizarFormula_)]);
      registrarLog('Edição de Unidade', dados.sigla, 'Dados atualizados.');
      return { sucesso: true, mensagem: 'Unidade atualizada com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
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
      // Linha inteira em uma leitura: sigla, ID e nome saíam de três getValue()
      // separados (três round-trips à API, dentro do lock).
      const linhaAtual = aba.getRange(linha, 1, 1, CABECALHOS_UNIDADES.length).getValues()[0];
      const sigla = linhaAtual[C('Sigla')];
      // Confere a sigla antes de excluir
      if (siglaEsperada && sigla.toString().trim() !== String(siglaEsperada).trim())
        return { sucesso: false, mensagem: 'Lista desatualizada. Recarregue e tente novamente.' };
      // Integridade referencial: Documentos/Riscos/Planos guardam a unidade
      // responsável pelo id (ex.: "UN-5"). Excluir a unidade deixaria essas
      // referências órfãs (passariam a exibir o id cru na tela). Bloqueia a
      // exclusão enquanto houver itens vinculados. Dentro do lock, garante que
      // nada passe a referenciá-la entre a checagem e a remoção.
      const idUnidade   = String(linhaAtual[C('ID Unidade')]||'').trim();
      const nomeUnidade = String(linhaAtual[C('Nome da Unidade')]||'').trim();
      const refs = contarReferenciasUnidade_(idUnidade, sigla.toString().trim(), nomeUnidade);
      if (refs.total > 0)
        return { sucesso: false, mensagem: 'Não é possível excluir: a unidade ainda é responsável por ' + refs.descricao + '. Reatribua ou remova esses itens antes.' };
      aba.deleteRow(linha);
      registrarLog('Exclusão de Unidade', sigla, 'Unidade removida.');
      return { sucesso: true, mensagem: 'Unidade excluída com sucesso!' };
    });
  } catch(e) { return erroInterno_(e); }
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
  } catch(e) { return erroInterno_(e); }
}

function inativarUnidade(idRow, sigla) { return _definirStatusUnidade_(idRow, sigla, false); }
function reativarUnidade(idRow, sigla) { return _definirStatusUnidade_(idRow, sigla, true); }