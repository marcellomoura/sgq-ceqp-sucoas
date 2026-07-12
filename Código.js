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
const CABECALHOS_AFASTAMENTOS = ['ID','Ano','Membro ID','Membro Nome','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio'];

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

function safeDateString(val) {
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return val ? String(val) : '';
}

function formatarDataParaUI(campo) {
  if (campo instanceof Date) {
    return campo.getFullYear() + '-' +
      String(campo.getMonth() + 1).padStart(2,'0') + '-' +
      String(campo.getDate()).padStart(2,'0');
  }
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

// Converte datas vindas da planilha para 'yyyy-MM-dd'; strings passam
// apenas por trim. Usada por todo o módulo de Pessoas/Afastamentos.
function dataParaISO_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return val.getFullYear() + '-' +
      String(val.getMonth() + 1).padStart(2, '0') + '-' +
      String(val.getDate()).padStart(2, '0');
  }
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
    const aba = conectarAba(SHEET_LOGS, ['Data/Hora','Usuário','Ação','Referência','Detalhes']);
    aba.appendRow([new Date(), usuarioAtual_(), acao, ref, detalhe]);
  } catch(e) { console.error('Log falhou: ' + e); }
}

function setupDatabaseKanban() {
  conectarAba(SHEET_TASKS,    ['ID','Status','Título','Descrição','Responsável_ID','Prioridade','Data Criação','Data Início','Prazo','Data Conclusão','Atividades','Arquivado']);
  const abaMembros = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
  // Corrige o texto do cabeçalho apenas se estiver divergente — evita uma
  // escrita na planilha a cada carregamento do sistema.
  const atual = abaMembros.getRange(1, 1, 1, CABECALHOS_MEMBROS.length).getValues()[0];
  if (atual.some((v, i) => String(v) !== CABECALHOS_MEMBROS[i])) {
    abaMembros.getRange(1, 1, 1, CABECALHOS_MEMBROS.length)
      .setValues([CABECALHOS_MEMBROS]).setFontWeight('bold').setBackground('#f1f5f9');
  }
}

function setupDatabaseResto() {
  conectarAba(SHEET_UNITS,    ['Nome da Unidade','Sigla','E-mail Funcional','Tipo']);
  migrarRemoverCarimboDocumentos();
  conectarAba(SHEET_DOCS,     ['Código','Versão','Tipo','Título','Data Aprovação','Próxima Revisão','Status','Responsável','E-mail','Link Principal','Doc Auxiliar 1','Doc Auxiliar 2','Revisão']);
  conectarAba(SHEET_RISKS,    ['Data','ID Risco','Macroetapa','Risco','Causa','Consequência','Categoria','Probabilidade','Impacto','Nível','Tipo Tratamento','Responsável','Status','Motivo']);
  conectarAba(SHEET_PLANS,    ['Data Registro','ID Risco','O Que','Por Que','Quem','Onde','Data Prevista','Data Finalização','Como','Quanto Custa','Status','Motivo Cancelamento','Versão']);
  conectarAba(SHEET_DELIVERY, ['Data Registo','Risco Vinculado','Unidade','Status','Data Entrega','Tipo Doc','SEI','Obs','Usuário','Status Sistema']);
  conectarAba(SHEET_LOGS,     ['Data/Hora','Usuário','Ação','Referência','Detalhes']);
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

  if (tData.length <= 1) return { tasks: [], members: getKanbanData_members_() };

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const linhasParaArquivar = []; // índices (0-based, relativos aos dados sem cabeçalho) a marcar 'Sim'

  const tasks = tData.slice(1).map((r, idx) => {
    const status = String(r[1]);
    const completionDate = safeDateString(r[9]);
    let arquivadoRaw = String(r[11] || '').trim();
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
      id: String(r[0]), status: status, title: String(r[2]), description: String(r[3]),
      assigneeId: String(r[4]), priority: String(r[5]), creationDate: safeDateString(r[6]),
      startDate: safeDateString(r[7]), deadline: safeDateString(r[8]),
      completionDate: completionDate, activities: String(r[10] || '[]'),
      archived: archived
    };
  });

  // Grava as marcações novas em UMA única escrita (independente de quantas linhas mudaram)
  if (linhasParaArquivar.length > 0) {
    comBloqueio(() => {
      const colArquivado = sheet.getRange(2, 12, tData.length - 1, 1).getValues();
      linhasParaArquivar.forEach(idx => { colArquivado[idx][0] = 'Sim'; });
      sheet.getRange(2, 12, colArquivado.length, 1).setValues(colArquivado);
    });
  }

  return { tasks: tasks, members: getKanbanData_members_() };
}

function getKanbanData_members_() {
  const mData = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS).getDataRange().getValues();

  return mData.length > 1 ? mData.slice(1).map(r => {
    let rawDias = String(r[4] || '').trim();
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

    return {
      id: String(r[0]), name: String(r[1]), role: String(r[2]), email: String(r[3]||''), emailPessoal: String(r[6]||''),
      diasSemana: diasSemana, diaPresencial: String(r[5]||''),
      horarios: horarios
    };
  }) : [];
}

function getRestoData() {
  setupDatabaseResto();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Unidades (usadas por Documentos, Riscos e Entregas) ---
  const uData = ss.getSheetByName(SHEET_UNITS).getDataRange().getValues();
  const units = uData.length > 1 ? uData.slice(1).map((r, i) => ({
    id: i + 1, unidade: String(r[0] || ''), sigla: String(r[1] || ''), email: String(r[2] || ''), tipo: String(r[3] || '')
  })) : [];

  // --- Documentos ---
  const dData = ss.getSheetByName(SHEET_DOCS).getDataRange().getValues();
  const hoje  = new Date(); hoje.setHours(0,0,0,0);
  const docs  = dData.length > 1 ? dData.slice(1).map((r, i) => {
    const statusOrig = String(r[6] || 'Vigente').trim();
    const isObsoleto = statusOrig.toUpperCase() === 'OBSOLETO';
    let proxRevStr   = formatarDataParaUI(r[5]);
    const dataAprovacaoStr = formatarDataParaUI(r[4]);
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
    if (r[1] !== undefined && r[1] !== '') {
      const v = typeof r[1] === 'number' ? r[1] : parseFloat(String(r[1]).replace(',','.'));
      if (!isNaN(v) && v > 0) versao = v;
    }
    return {
      idRow: i + 2, codigo: String(r[0] || ''), versao: versao.toFixed(1), tipo: String(r[2] || ''),
      titulo: String(r[3] || ''), dataAprovacao: formatarDataParaUI(r[4]), proximaRevisao: proxRevStr,
      status: statusCalc, responsavel: String(r[7] || ''), email: String(r[8] || ''),
      linkDoc: String(r[9] || ''), docAuxiliar: String(r[10] || ''), docAuxiliar2: String(r[11] || ''),
      obsoleto: isObsoleto, motivo: String(r[12] || '')
    };
  }) : [];

  // --- Riscos ---
  const rData = ss.getSheetByName(SHEET_RISKS).getDataRange().getValues();
  const pData = ss.getSheetByName(SHEET_PLANS).getDataRange().getValues();
  const planosRows = pData.length > 1 ? pData.slice(1) : [];
  const risks = rData.length > 1 ? rData.slice(1).filter(r => (String(r[12]||'Vigente')).trim() === 'Vigente')
    .map((r, i) => {
      const idRisco = parseInt(String(r[1]||'').replace('R',''), 10) || (i+1);
      const ref = 'R' + idRisco;
      let planoAcao = '-';
      for (const p of planosRows) {
        const rRef = String(p[1]||'');
        const statusP = String(p[10]||'').trim();
        // Ignora versões antigas (Superado) e planos cancelados (Arquivado) —
        // só mostra o texto do plano ATUAL na Matriz de Riscos.
        if ((rRef === ref || rRef.startsWith(ref + ' -')) && statusP !== 'Superado' && statusP !== 'Arquivado') {
          planoAcao = String(p[2]||'-'); break;
        }
      }
      return {
        id: idRisco, macroetapa: String(r[2]||''), nome: String(r[3]||''), causa: String(r[4]||''),
        consequencia: String(r[5]||''), categoria: String(r[6]||''),
        probabilidade: parseInt(r[7],10)||1, impacto: parseInt(r[8],10)||1,
        nivel: String(r[9]||''), tipoTratamento: String(r[10]||''),
        responsavel: String(r[11]||'Não atribuído'), status: String(r[12]||'Vigente'),
        motivo: String(r[13]||''), planoAcao: planoAcao
      };
    }) : [];

  // --- Planos ---
  // "Superado" = versão antiga de um plano que foi revisado (existe
  // histórico, mas não deve aparecer na lista de planos ativos).
  const plans = planosRows.filter(r => {
    const st = String(r[10]||'').trim();
    return st !== 'Arquivado' && st !== 'Superado';
  }).map(r => ({
    riscoVinculado: String(r[1]||''), what: String(r[2]||''), why: String(r[3]||''),
    who: String(r[4]||''), where: String(r[5]||''),
    whenPrevisto: formatarDataParaUI(r[6]), whenFinalizado: formatarDataParaUI(r[7]),
    how: String(r[8]||''), howMuch: String(r[9]||''),
    status: String(r[10]||'Em Andamento'), cancelamento: String(r[11]||''),
    versao: (parseFloat(String(r[12]||'1').replace(',','.')) || 1).toFixed(1)
  }));

  // --- Entregas ---
  const eData = ss.getSheetByName(SHEET_DELIVERY).getDataRange().getValues();
  const deliveries = eData.length > 1 ? eData.slice(1)
    .filter(r => String(r[9]||'Ativo') !== 'Arquivado')
    .map(r => ({
      riscoVinculado: String(r[1]||''), unidade: String(r[2]||''),
      entregue: String(r[3]||''), dataEntrega: formatarDataParaUI(r[4]),
      tipoDoc: String(r[5]||''), processoSei: String(r[6]||''), justificativa: String(r[7]||'')
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
  const aba = conectarAba(SHEET_LOGS, ['Data/Hora','Usuário','Ação','Referência','Detalhes']);
  const dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

  const linhas = dados.slice(1).map(r => ({
    dataHora: r[0] instanceof Date
      ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
      : String(r[0] || ''),
    usuario: String(r[1] || ''),
    acao: String(r[2] || ''),
    referencia: String(r[3] || ''),
    detalhes: String(r[4] || ''),
    // Mantém a data crua (não formatada) só para poder ordenar corretamente
    _ordenacao: r[0] instanceof Date ? r[0].getTime() : 0
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