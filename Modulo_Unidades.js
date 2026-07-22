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