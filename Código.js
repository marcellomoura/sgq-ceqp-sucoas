// ==========================================
// CONFIGURAÇÕES GLOBAIS
// ==========================================
const SHEET_TASKS    = 'Tarefas';
const SHEET_MEMBERS  = 'Membros';
const SHEET_UNITS    = 'Unidades';
const SHEET_DOCS     = 'Documentos';
const SHEET_RISKS    = 'Riscos';
const SHEET_PLANS    = 'Planos_Acao';
const SHEET_DELIVERY = 'Entregas_Acoes';
const SHEET_LOGS     = 'Logs';
const SHEET_AFASTAMENTOS = 'Afastamentos';

// Layouts de colunas usados em vários pontos (setup, leitura e escrita).
// Uma única fonte de verdade evita que uma migração futura esqueça algum lugar.
const CABECALHOS_MEMBROS = ['ID','Nome','Cargo','Email Funcional','Dias Semana','Dia Presencial','E-mail Pessoal'];
// Uma linha por (Membro + Ano) — permite manter vários anos abertos ao
// mesmo tempo sem perder histórico (ver Modulo_Pessoas.js).
const CABECALHOS_AFASTAMENTOS = ['ID','Ano','Membro ID','Membro Nome','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio','Demais Afastamentos'];
// Demais abas — mesma ideia de fonte única de verdade para o layout.
const CABECALHOS_TAREFAS  = ['ID','Status','Título','Descrição','Responsável_ID','Prioridade','Data Criação','Data Início','Prazo','Data Conclusão','Atividades','Arquivado','Etiquetas'];
const CABECALHOS_UNIDADES = ['Nome da Unidade','Sigla','E-mail Funcional','Link do Drive'];
const CABECALHOS_DOCS     = ['Código','Versão','Tipo','Título','Data Aprovação','Próxima Revisão','Status','Responsável','E-mail','Link Principal','Doc Auxiliar 1','Doc Auxiliar 2','Revisão'];
const CABECALHOS_RISCOS   = ['ID Risco','Macroetapa','Risco','Causa','Consequência','Categoria','Probabilidade','Impacto','Nível','Tipo Tratamento','Responsável'];
const CABECALHOS_PLANOS   = ['ID Risco','O Que','Por Que','Quem','Onde','Data Prevista','Data Finalização','Como','Quanto Custa','Status'];
const CABECALHOS_ENTREGAS = ['Risco Vinculado','Unidade','Status','Data Entrega','SEI','Status Sistema'];
const CABECALHOS_LOGS     = ['Data/Hora','Usuário','Ação','Referência','Detalhes'];

// Mapa "nome da coluna" → índice 0-based, derivado do array de cabeçalhos
// (a mesma fonte única usada no setup da planilha). Elimina os índices
// mágicos (r[11], getRange(i,12)) na leitura e na escrita: se uma coluna
// mudar de posição, basta atualizar o CABECALHOS_* correspondente.
// Retorna uma função C('Nome') → índice; um nome inexistente lança erro na
// hora, então um engano de digitação falha alto em vez de virar `undefined`
// silencioso. Para getRange (base 1) use C('Nome') + 1.
function colIdx_(cabecalhos) {
  const mapa = {};
  cabecalhos.forEach((c, i) => { mapa[String(c).trim()] = i; });
  return function (nome) {
    if (!(nome in mapa)) throw new Error('Coluna desconhecida: "' + nome + '"');
    return mapa[nome];
  };
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('SGQ · CEQP')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// UTILITÁRIOS COMPARTILHADOS
// ==========================================
function comBloqueio(operacao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return operacao(); } finally { lock.releaseLock(); }
}

function conectarAba(nome, cabecalhos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(nome);
  if (!aba && cabecalhos) {
    aba = ss.insertSheet(nome);
    aba.appendRow(cabecalhos);
    aba.getRange(1, 1, 1, cabecalhos.length).setFontWeight('bold').setBackground('#f1f5f9');
    aba.setFrozenRows(1);
  } else if (!aba) {
    throw new Error("Aba '" + nome + "' não encontrada.");
  } else if (cabecalhos && aba.getLastColumn() < cabecalhos.length) {
    // Migração: a aba já existia de uma versão anterior e está com menos
    // colunas que o layout atual espera (ex: coluna "Arquivado" nova).
    // Completa só as colunas que faltam, sem tocar nas existentes.
    const colunaInicial = aba.getLastColumn() + 1;
    const faltantes = cabecalhos.slice(aba.getLastColumn());
    aba.getRange(1, colunaInicial, 1, faltantes.length).setValues([faltantes])
      .setFontWeight('bold').setBackground('#f1f5f9');
  }
  return aba;
}

// Formata um Date para 'yyyy-MM-dd' a partir dos componentes LOCAIS (fuso do
// script), sem passar por UTC. É a única forma de montar a data ISO no
// sistema — evita o deslocamento de 1 dia que toISOString() causa em datas à
// meia-noite no horário de Brasília.
function _dataLocalISO_(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function formatarDataParaUI(campo) {
  if (campo instanceof Date) return _dataLocalISO_(campo);
  return campo ? campo.toString() : '';
}

function getNowTimestamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

// E-mail do usuário ativo, com fallback seguro (contas sem permissão de
// leitura do e-mail lançam exceção — nesses casos registra como 'Sistema').
function usuarioAtual_() {
  try { return Session.getActiveUser().getEmail() || 'Sistema'; } catch (e) { return 'Sistema'; }
}

// Nome amigável do usuário ativo para carimbar em atividades: procura o e-mail
// (funcional ou pessoal) entre os membros cadastrados e devolve o Nome. Se não
// achar, devolve o próprio e-mail; sem e-mail disponível, 'Sistema'.
function nomeUsuarioAtual_() {
  const email = usuarioAtual_();
  if (!email || email === 'Sistema') return 'Sistema';
  try {
    const C = colIdx_(CABECALHOS_MEMBROS);
    const mData = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS).getDataRange().getValues();
    const alvo = email.trim().toLowerCase();
    for (let i = 1; i < mData.length; i++) {
      const ef = String(mData[i][C('Email Funcional')] || '').trim().toLowerCase();
      const ep = String(mData[i][C('E-mail Pessoal')] || '').trim().toLowerCase();
      if (alvo && (alvo === ef || alvo === ep)) return String(mData[i][C('Nome')] || email);
    }
  } catch (e) {}
  return email;
}

// Converte datas vindas da planilha para 'yyyy-MM-dd'; strings passam
// apenas por trim. Usada por todo o módulo de Pessoas/Afastamentos.
function dataParaISO_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]') return _dataLocalISO_(val);
  return String(val || '').trim();
}

function getNextId(sheetName, prefixo) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return prefixo + '1';
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let max = 0;
  ids.forEach(r => {
    const n = parseInt(String(r[0]).replace(/\D/g,''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return prefixo + (max + 1);
}

function calcularNivelRisco(p, i) {
  const s = Number(p) * Number(i);
  if (s >= 15) return 'Crítico';
  if (s >= 10) return 'Alto';
  if (s >= 5)  return 'Médio';
  return 'Baixo';
}

function calcularProximaRevisao(dataStr) {
  if (!dataStr) return '';
  const p = dataStr.toString().split('-');
  if (p.length !== 3) return '';
  const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (isNaN(dt.getTime())) return '';
  dt.setFullYear(dt.getFullYear() + 1);
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
}

function registrarLog(acao, ref, detalhe) {
  try {
    const aba = conectarAba(SHEET_LOGS, CABECALHOS_LOGS);
    aba.appendRow([new Date(), nomeUsuarioAtual_(), acao, ref, detalhe]);
  } catch(e) { console.error('Log falhou: ' + e); }
}

function setupDatabaseKanban() {
  conectarAba(SHEET_TASKS, CABECALHOS_TAREFAS);
  const abaMembros = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
  // Corrige o texto do cabeçalho apenas se estiver divergente — evita uma
  // escrita na planilha a cada carregamento do sistema.
  const atual = abaMembros.getRange(1, 1, 1, CABECALHOS_MEMBROS.length).getValues()[0];
  if (atual.some((v, i) => String(v) !== CABECALHOS_MEMBROS[i])) {
    abaMembros.getRange(1, 1, 1, CABECALHOS_MEMBROS.length)
      .setValues([CABECALHOS_MEMBROS]).setFontWeight('bold').setBackground('#f1f5f9');
  }
  migrarEmailPessoalMembros_(abaMembros);
}

// Migração única e segura: versões antigas do saveMember gravavam o e-mail
// pessoal na 13ª coluna, enquanto a leitura sempre usou a coluna do
// cabeçalho ('E-mail Pessoal', 7ª) — o que fazia o e-mail sumir ao recarregar.
// Traz o valor legado da col 13 para a 7ª quando esta está vazia e limpa a
// col 13. Idempotente e sem perda de dados (só escreve quando há o que migrar).
function migrarEmailPessoalMembros_(abaMembros) {
  try {
    const COL_LEGADO = 13; // posição usada pela versão antiga (fora do layout atual)
    const nLin = abaMembros.getLastRow() - 1;
    if (nLin < 1 || abaMembros.getLastColumn() < COL_LEGADO) return; // sem coluna legada
    const colCorreta = colIdx_(CABECALHOS_MEMBROS)('E-mail Pessoal') + 1;
    const legado = abaMembros.getRange(2, COL_LEGADO, nLin, 1).getValues();
    const atual  = abaMembros.getRange(2, colCorreta, nLin, 1).getValues();
    let mudou = false;
    for (let i = 0; i < nLin; i++) {
      const val = String(legado[i][0] || '').trim();
      if (val && !String(atual[i][0] || '').trim()) {
        atual[i][0] = val;
        legado[i][0] = ''; // já preservado na coluna correta
        mudou = true;
      }
    }
    if (mudou) {
      abaMembros.getRange(2, colCorreta, nLin, 1).setValues(atual);
      abaMembros.getRange(2, COL_LEGADO, nLin, 1).setValues(legado);
    }
  } catch (e) {
    console.error('Falha na migração de e-mail pessoal: ' + e);
  }
}

function setupDatabaseResto() {
  conectarAba(SHEET_UNITS, CABECALHOS_UNIDADES);
  migrarRemoverCarimboDocumentos();
  conectarAba(SHEET_DOCS,     CABECALHOS_DOCS);
  conectarAba(SHEET_RISKS,    CABECALHOS_RISCOS);
  conectarAba(SHEET_PLANS,    CABECALHOS_PLANOS);
  conectarAba(SHEET_DELIVERY, CABECALHOS_ENTREGAS);
  conectarAba(SHEET_LOGS,     CABECALHOS_LOGS);
}

// Migração única e segura: se a aba Documentos já existir de uma versão
// anterior com a coluna "Carimbo" na posição A, remove essa coluna
// inteira da planilha (desloca tudo uma posição à esquerda, sem perder
// nenhum dado) para o layout novo, sem essa coluna, ficar consistente
// com os documentos que já estavam cadastrados.
function migrarRemoverCarimboDocumentos() {
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DOCS);
    if (!aba || aba.getLastColumn() < 1) return; // aba ainda não existe — nada a migrar
    const primeiraColuna = String(aba.getRange(1, 1).getValue() || '').trim();
    if (primeiraColuna === 'Carimbo') {
      aba.deleteColumn(1);
    }
  } catch (e) {
    console.error('Falha na migração de remoção do Carimbo: ' + e);
  }
}

// ==========================================
// CARREGAMENTO EM DUAS ETAPAS
// Etapa 1 (getKanbanData): só Tarefas + Membros — usada para o quadro
// Kanban aparecer imediatamente ao abrir o sistema, sem esperar a
// leitura de Unidades/Documentos/Riscos/Planos/Entregas.
// Etapa 2 (getRestoData): as demais abas, buscadas em segundo plano
// logo depois que o Kanban já está na tela.
// ==========================================
// Dias após a conclusão para um cartão ser arquivado automaticamente
const DIAS_PARA_ARQUIVAR = 15;

function getKanbanData() {
  setupDatabaseKanban();
  const sheet = conectarAba(SHEET_TASKS);
  const tData = sheet.getDataRange().getValues();
  const C = colIdx_(CABECALHOS_TAREFAS);

  if (tData.length <= 1) return { tasks: [], members: getKanbanData_members_() };

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const linhasParaArquivar = []; // índices (0-based, relativos aos dados sem cabeçalho) a marcar 'Sim'

  const tasks = tData.slice(1).map((r, idx) => {
    const status = String(r[C('Status')]);
    const completionDate = formatarDataParaUI(r[C('Data Conclusão')]);
    let arquivadoRaw = String(r[C('Arquivado')] || '').trim();
    let archived = arquivadoRaw === 'Sim';

    // Arquivamento automático: só entra em jogo quando a coluna está
    // EM BRANCO (nunca decidido). Se o valor for 'Não', significa que o
    // usuário restaurou esse cartão manualmente — respeita a decisão dele
    // e não volta a arquivar sozinho, mesmo que a data de conclusão seja antiga.
    if (arquivadoRaw === '' && status === 'Concluído' && completionDate) {
      const p = completionDate.split('-');
      if (p.length === 3) {
        const dtConclusao = new Date(+p[0], +p[1]-1, +p[2]);
        const diasPassados = Math.floor((hoje - dtConclusao) / 86400000);
        if (diasPassados >= DIAS_PARA_ARQUIVAR) {
          archived = true;
          linhasParaArquivar.push(idx);
        }
      }
    }

    return {
      id: String(r[C('ID')]), status: status, title: String(r[C('Título')]), description: String(r[C('Descrição')]),
      assigneeId: String(r[C('Responsável_ID')]), priority: String(r[C('Prioridade')]), creationDate: formatarDataParaUI(r[C('Data Criação')]),
      startDate: formatarDataParaUI(r[C('Data Início')]), deadline: formatarDataParaUI(r[C('Prazo')]),
      completionDate: completionDate, activities: String(r[C('Atividades')] || '[]'),
      labels: String(r[C('Etiquetas')] || '[]'), archived: archived
    };
  });

  // Grava as marcações novas em UMA única escrita (independente de quantas linhas mudaram)
  if (linhasParaArquivar.length > 0) {
    comBloqueio(() => {
      const colArq = C('Arquivado') + 1; // getRange usa base 1
      const colArquivado = sheet.getRange(2, colArq, tData.length - 1, 1).getValues();
      linhasParaArquivar.forEach(idx => { colArquivado[idx][0] = 'Sim'; });
      sheet.getRange(2, colArq, colArquivado.length, 1).setValues(colArquivado);
    });
  }

  return { tasks: tasks, members: getKanbanData_members_() };
}

function getKanbanData_members_() {
  const C = colIdx_(CABECALHOS_MEMBROS);
  const mData = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS).getDataRange().getValues();

  return mData.length > 1 ? mData.slice(1).map(r => {
    let rawDias = String(r[C('Dias Semana')] || '').trim();
    let diasSemana = [];
    let horarios = {};

    if (rawDias.startsWith('[')) {
       try { diasSemana = JSON.parse(rawDias); if (!Array.isArray(diasSemana)) diasSemana = []; } catch(e) {}
    } else if (rawDias) {
       let partes = rawDias.split(',').map(s => s.trim());
       partes.forEach(pt => {
          let mt = pt.match(/^([A-Za-zçãáéíóú]+)(?:\s*\((.*?)\))?/i);
          if (mt) { diasSemana.push(mt[1]); if (mt[2]) horarios[mt[1]] = mt[2]; }
       });
    }

    // ATENÇÃO: a leitura do e-mail pessoal usa a coluna do cabeçalho
    // ('E-mail Pessoal', 7ª col), mas saveMember() grava na 13ª coluna —
    // divergência pré-existente que faz o e-mail pessoal aparecer vazio
    // após recarregar. Mantido como está aqui; reconciliar em saveMember.
    return {
      id: String(r[C('ID')]), name: String(r[C('Nome')]), role: String(r[C('Cargo')]), email: String(r[C('Email Funcional')]||''), emailPessoal: String(r[C('E-mail Pessoal')]||''),
      diasSemana: diasSemana, diaPresencial: String(r[C('Dia Presencial')]||''),
      horarios: horarios
    };
  }) : [];
}

function getRestoData() {
  setupDatabaseResto();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Unidades (usadas por Documentos, Riscos e Entregas) ---
  const CU = colIdx_(CABECALHOS_UNIDADES);
  const uData = ss.getSheetByName(SHEET_UNITS).getDataRange().getValues();
  const units = uData.length > 1 ? uData.slice(1).map((r, i) => ({
    id: i + 1, unidade: String(r[CU('Nome da Unidade')] || ''), sigla: String(r[CU('Sigla')] || ''), email: String(r[CU('E-mail Funcional')] || ''), linkDrive: String(r[CU('Link do Drive')] || '')
  })) : [];

  // --- Documentos ---
  const CD = colIdx_(CABECALHOS_DOCS);
  const dData = ss.getSheetByName(SHEET_DOCS).getDataRange().getValues();
  const hoje  = new Date(); hoje.setHours(0,0,0,0);
  const docs  = dData.length > 1 ? dData.slice(1).map((r, i) => {
    const statusOrig = String(r[CD('Status')] || 'Vigente').trim();
    const isObsoleto = statusOrig.toUpperCase() === 'OBSOLETO';
    let proxRevStr   = formatarDataParaUI(r[CD('Próxima Revisão')]);
    const dataAprovacaoStr = formatarDataParaUI(r[CD('Data Aprovação')]);
    let statusCalc   = statusOrig;
    if (!isObsoleto && !dataAprovacaoStr) {
      // Documento cadastrado sem data de aprovação ainda — está em
      // elaboração, não tem sentido calcular vencimento/próxima revisão.
      statusCalc = 'Em Elaboração';
    } else if (!isObsoleto && proxRevStr) {
      const p = proxRevStr.split('-');
      if (p.length === 3) {
        const diff = Math.ceil((new Date(p[0], p[1]-1, p[2]) - hoje) / 86400000);
        if (diff < 0) statusCalc = 'Vencido';
        else if (diff <= 60) statusCalc = 'Próximo da Revisão';
      }
    }
    let versao = 1.0;
    const versaoRaw = r[CD('Versão')];
    if (versaoRaw !== undefined && versaoRaw !== '') {
      const v = typeof versaoRaw === 'number' ? versaoRaw : parseFloat(String(versaoRaw).replace(',','.'));
      if (!isNaN(v) && v > 0) versao = v;
    }
    return {
      idRow: i + 2, codigo: String(r[CD('Código')] || ''), versao: versao.toFixed(1), tipo: String(r[CD('Tipo')] || ''),
      titulo: String(r[CD('Título')] || ''), dataAprovacao: dataAprovacaoStr, proximaRevisao: proxRevStr,
      status: statusCalc, responsavel: String(r[CD('Responsável')] || ''), email: String(r[CD('E-mail')] || ''),
      linkDoc: String(r[CD('Link Principal')] || ''), docAuxiliar: String(r[CD('Doc Auxiliar 1')] || ''), docAuxiliar2: String(r[CD('Doc Auxiliar 2')] || ''),
      obsoleto: isObsoleto, motivo: String(r[CD('Revisão')] || '')
    };
  }) : [];

  // --- Riscos ---
  const CR = colIdx_(CABECALHOS_RISCOS);
  const CP = colIdx_(CABECALHOS_PLANOS);
  const rData = ss.getSheetByName(SHEET_RISKS).getDataRange().getValues();
  const pData = ss.getSheetByName(SHEET_PLANS).getDataRange().getValues();
  const planosRows = pData.length > 1 ? pData.slice(1) : [];
  const risks = rData.length > 1 ? rData.slice(1)
    .map((r, i) => {
      const idRisco = parseInt(String(r[CR('ID Risco')]||'').replace('R',''), 10) || (i+1);
      const ref = 'R' + idRisco;
      let planoAcao = '-';
      for (const p of planosRows) {
        const rRef = String(p[CP('ID Risco')]||'');
        const statusP = String(p[CP('Status')]||'').trim();
        if (rRef === ref || rRef.startsWith(ref + ' -')) {
          planoAcao = String(p[CP('O Que')]||'-'); break;
        }
      }
      return {
        id: idRisco, macroetapa: String(r[CR('Macroetapa')]||''), nome: String(r[CR('Risco')]||''), causa: String(r[CR('Causa')]||''),
        consequencia: String(r[CR('Consequência')]||''), categoria: String(r[CR('Categoria')]||''),
        probabilidade: parseInt(r[CR('Probabilidade')],10)||1, impacto: parseInt(r[CR('Impacto')],10)||1,
        nivel: String(r[CR('Nível')]||''), tipoTratamento: String(r[CR('Tipo Tratamento')]||''),
        responsavel: String(r[CR('Responsável')]||'Não atribuído'), planoAcao: planoAcao
      };
    }) : [];

  // --- Planos ---
  const plans = planosRows.map(r => ({
    riscoVinculado: String(r[CP('ID Risco')]||''), what: String(r[CP('O Que')]||''), why: String(r[CP('Por Que')]||''),
    who: String(r[CP('Quem')]||''), where: String(r[CP('Onde')]||''),
    whenPrevisto: formatarDataParaUI(r[CP('Data Prevista')]), whenFinalizado: formatarDataParaUI(r[CP('Data Finalização')]),
    how: String(r[CP('Como')]||''), howMuch: String(r[CP('Quanto Custa')]||''),
    status: String(r[CP('Status')]||'Em Andamento')
  }));

  // --- Entregas ---
  const CE = colIdx_(CABECALHOS_ENTREGAS);
  const eData = ss.getSheetByName(SHEET_DELIVERY).getDataRange().getValues();
  const deliveries = eData.length > 1 ? eData.slice(1)
    .map(r => ({
      riscoVinculado: String(r[CE('Risco Vinculado')]||''), unidade: String(r[CE('Unidade')]||''),
      entregue: String(r[CE('Status')]||''), dataEntrega: formatarDataParaUI(r[CE('Data Entrega')]),
      processoSei: String(r[CE('SEI')]||'')
    })) : [];

  return { units: units, docs: docs, risks: risks, plans: plans, deliveries: deliveries };
}

// ==========================================
// LOG DE ALTERAÇÕES (auditoria)
// Busca sob demanda (não faz parte de getKanbanData/getRestoData) —
// sempre traz a versão mais recente, sem cache, já que é uma trilha
// de auditoria e precisa refletir o estado atual a cada visita.
// Retorna só os N registros mais recentes para não pesar com o tempo.
// ==========================================
function buscarLogs() {
  const LIMITE_REGISTROS = 20;
  const aba = conectarAba(SHEET_LOGS, CABECALHOS_LOGS);
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

  const CL = colIdx_(CABECALHOS_LOGS);
  const linhas = dados.slice(1).map(r => ({
    dataHora: r[CL('Data/Hora')] instanceof Date
      ? Utilities.formatDate(r[CL('Data/Hora')], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
      : String(r[CL('Data/Hora')] || ''),
    usuario: String(r[CL('Usuário')] || ''),
    acao: String(r[CL('Ação')] || ''),
    referencia: String(r[CL('Referência')] || ''),
    detalhes: String(r[CL('Detalhes')] || ''),
    // Mantém a data crua (não formatada) só para poder ordenar corretamente
    _ordenacao: r[CL('Data/Hora')] instanceof Date ? r[CL('Data/Hora')].getTime() : 0
  }));

  linhas.sort((a, b) => b._ordenacao - a._ordenacao);
  return linhas.slice(0, LIMITE_REGISTROS).map(l => ({
    dataHora: l.dataHora, usuario: l.usuario, acao: l.acao, referencia: l.referencia, detalhes: l.detalhes
  }));
}

// ==========================================
// GERAÇÃO DE PDF
// O PDF é montado no servidor a partir de um HTML de impressão dedicado
// (montado no cliente com os dados já carregados na tela, sem tocar na
// página visível — não há "flash" nem captura de tela). A conversão usa o
// serviço nativo do Apps Script (Utilities/Blob), não uma biblioteca de
// terceiros — mais leve e sem os cortes/páginas em branco que a captura
// via html2canvas causava.
// ==========================================
function gerarPdfDeHtml(htmlContent, nomeArquivo) {
  try {
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML, 'relatorio.html');
    const pdf = blob.getAs(MimeType.PDF).setName(nomeArquivo);
    return { sucesso: true, base64: Utilities.base64Encode(pdf.getBytes()) };
  } catch (e) { return { sucesso: false, mensagem: e.toString() }; }
}

function enviarPdfDeHtml(destinatario, htmlContent, nomeArquivo, titulo) {
  try {
    if (!destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario.trim()))
      return { sucesso: false, mensagem: 'E-mail do destinatário inválido.' };
    const blob = Utilities.newBlob(htmlContent, MimeType.HTML, 'relatorio.html');
    const pdf = blob.getAs(MimeType.PDF).setName(nomeArquivo);
    MailApp.sendEmail({
      to: destinatario.trim(),
      subject: 'SGQ · ' + (titulo || 'Relatório') + ' | CEQP / SUCOAS - SES/DF',
      body: 'Segue em anexo o relatório gerado pelo Sistema de Gestão da Qualidade.\n\nEnvio automático — não responda.',
      attachments: [pdf]
    });
    registrarLog('Envio de PDF', titulo || 'Relatório', 'Destinatário: ' + destinatario);
    return { sucesso: true, mensagem: 'Relatório enviado com sucesso!' };
  } catch (e) { return { sucesso: false, mensagem: e.toString() }; }
}