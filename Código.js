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
const SHEET_CAPACITACOES = 'Capacitações';

// Layouts de colunas usados em vários pontos (setup, leitura e escrita).
// Uma única fonte de verdade evita que uma migração futura esqueça algum lugar.
// 'Ativo' (Sim/Não) controla se o membro tem acesso ao sistema e aparece nas
// telas. Em branco = ativo (compatível com linhas anteriores à coluna). Membro
// inativo preserva o histórico (tarefas/afastamentos/logs) mas perde o login.
const CABECALHOS_MEMBROS = ['ID','Nome','Cargo','Email Funcional','E-mail Pessoal','Dias Semana','Dia Presencial','Ativo'];
// Uma linha por (Membro + Ano) — permite manter vários anos abertos ao
// mesmo tempo sem perder histórico (ver Modulo_Pessoas.js).
const CABECALHOS_AFASTAMENTOS = ['ID','Ano','Membro ID','Membro Nome','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio','Demais Afastamentos'];
// Demais abas — mesma ideia de fonte única de verdade para o layout.
const CABECALHOS_TAREFAS  = ['ID','Status','Título','Descrição','Responsável_ID','Prioridade','Data Criação','Data Início','Prazo','Data Conclusão','Atividades','Arquivado','Etiquetas'];
const CABECALHOS_UNIDADES = ['ID Unidade', 'Nome da Unidade','Sigla','E-mail Funcional','Link do Drive', 'Ativo'];
const CABECALHOS_DOCS     = ['Código','Versão','Tipo','Título','Data Aprovação','Próxima Revisão','Status','Responsável','Link Principal','Doc Auxiliar 1','Doc Auxiliar 2','Revisão'];
const CABECALHOS_RISCOS   = ['ID Risco','Macroetapa','Risco','Causa','Consequência','Categoria','Probabilidade','Impacto','Nível','Tipo Tratamento','Responsável'];
const CABECALHOS_PLANOS   = ['ID Risco','O Que','Por Que','Quem','Onde','Data Prevista','Data Finalização','Como','Quanto Custa','Status'];
const CABECALHOS_ENTREGAS = ['Risco Vinculado','Unidade','Status','Data Entrega','SEI'];
const CABECALHOS_LOGS     = ['Data/Hora','Usuário','Ação','Referência','Detalhes'];
const CABECALHOS_CAPACITACOES = ['ID', 'Título da Capacitação', 'Tema', 'Público-alvo', 'Modalidade', 'Data Prevista', 'Data Realizada', 'Status', 'Materiais', 'Participantes'];

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
  if (!isMembro_()) {
    return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;padding:2rem;text-align:center;color:#333;"><h2>Acesso Negado</h2><p>Você não possui acesso a este sistema.</p></div>');
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('SGQ · CEQP')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// UTILITÁRIOS COMPARTILHADOS
// ==========================================
// Serializa operações de escrita para evitar corrida entre usuários. Espera
// até 30s pela trava (antes eram 10s, que sob contenção — ex.: migração de
// setup ou auto-arquivamento rodando em paralelo — estourava e mostrava um
// erro cru "Tempo limite do bloqueio..."). Se ainda assim não obtiver, lança
// uma mensagem clara e acionável em vez da exceção nativa.
function comBloqueio(operacao) {
  const lock = LockService.getScriptLock();
  let obteve = false;
  try { lock.waitLock(30000); obteve = true; } catch (e) { obteve = false; }
  if (!obteve)
    throw new Error('O sistema está ocupado processando outra operação. Aguarde alguns segundos e tente novamente.');
  try { return operacao(); } finally { lock.releaseLock(); }
}

function safeGetSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const target = normalize(sheetName);
    sheet = ss.getSheets().find(s => normalize(s.getName()) === target);
    if (sheet) sheet.setName(sheetName); // Padroniza o nome
  }
  return sheet;
}

function safeGetSheetData(ss, sheetName) {
  const sheet = safeGetSheet(ss, sheetName);
  return sheet ? sheet.getDataRange().getValues() : [];
}

function conectarAba(nome, cabecalhos) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = safeGetSheet(ss, nome);
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
// Lista compacta de membros para autenticação, em cache COMPARTILHADO
// (ScriptCache): [ [emailFuncional, emailPessoal, nome], ... ].
// isMembro_/nomeUsuarioAtual_ rodam no início de PRATICAMENTE TODA chamada ao
// servidor; sem cache, cada uma relia a aba Membros inteira — um dos maiores
// gargalos de carregamento. O cache é compartilhado entre todos os usuários
// (memcache, leitura muito mais barata que a planilha) e é invalidado na hora
// por invalidarCacheMembros_() sempre que um membro é criado/editado/removido —
// então um membro novo passa a ter acesso imediatamente, sem esperar o TTL.
function membrosParaAuth_() {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    const bruto = cache.get('membros_auth');
    if (bruto) { try { return JSON.parse(bruto); } catch (e) {} }
  }
  let lista = [];
  let tentativas = 3;
  while (tentativas-- > 0) {
    try {
      const C = colIdx_(CABECALHOS_MEMBROS);
      const mData = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS).getDataRange().getValues();
      for (let i = 1; i < mData.length; i++) {
        const at = String(mData[i][C('Ativo')] || '').trim().toLowerCase();
        if (at === 'não' || at === 'nao') continue;
        lista.push([
          String(mData[i][C('Email Funcional')] || '').trim().toLowerCase(),
          String(mData[i][C('E-mail Pessoal')] || '').trim().toLowerCase(),
          String(mData[i][C('Nome')] || '')
        ]);
      }
      break; // sucesso na leitura
    } catch (e) {
      if (tentativas === 0) {
        console.error('membrosParaAuth_ falhou após retries: ' + e);
      }
      Utilities.sleep(500);
    }
  }
  // Só cacheia listas NÃO vazias: uma lista vazia quase sempre significa
  // leitura falha (erro transitório do Sheets) ou aba ainda não populada.
  // Cachear [] por 6h travaria TODO o sistema — isMembro_ retornaria false
  // para todos, e nem saveMember (também protegido por isMembro_) conseguiria
  // invalidar. Sem cache, a próxima chamada relê e se auto-recupera.
  if (cache && lista.length > 0) { try { cache.put('membros_auth', JSON.stringify(lista), 21600); } catch (e) {} }
  return lista;
}

// Remove o cache compartilhado de membros. Chamada após qualquer escrita na
// aba Membros (saveMember/inativarMembro/reativarMembro) para que membership e nomes fiquem
// atualizados na hora, sem esperar o TTL de 6h.
function invalidarCacheMembros_() {
  try { CacheService.getScriptCache().remove('membros_auth'); } catch (e) {}
}

function nomeUsuarioAtual_() {
  const email = usuarioAtual_();
  if (!email || email === 'Sistema') return 'Sistema';
  const alvo = email.trim().toLowerCase();
  const lista = membrosParaAuth_();
  for (let i = 0; i < lista.length; i++) {
    if (alvo && (alvo === lista[i][0] || alvo === lista[i][1])) return lista[i][2] || email;
  }
  return email;
}

// Verifica se o usuário atual é um membro cadastrado (usado para autorização e bloqueio)
function isMembro_() {
  const email = usuarioAtual_();
  // Se for uma chamada anônima ou não identificável, bloqueia o acesso
  if (!email || email === 'Sistema') return false;
  const alvo = email.trim().toLowerCase();
  const lista = membrosParaAuth_();
  for (let i = 0; i < lista.length; i++) {
    if (alvo && (alvo === lista[i][0] || alvo === lista[i][1])) return true;
  }
  return false;
}

// Converte datas vindas da planilha para 'yyyy-MM-dd'; strings passam
// apenas por trim. Usada por todo o módulo de Pessoas/Afastamentos.
function dataParaISO_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]') return _dataLocalISO_(val);
  return String(val || '').trim();
}

function getNextId_(sheet, prefixo) {
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
  if (!isMembro_()) return; // não-membros não disparam setup/migração (proteção contra chamada direta via F12)
  // O setup só cria abas faltantes e roda migrações idempotentes — não
  // precisa executar em TODA carga do Kanban. Sem esta guarda, cada abertura
  // do sistema pagava ~5 round-trips à planilha (getSheetByName/getLastColumn/
  // leitura de cabeçalho/migração). Roda no máximo 1x a cada 6h por deploy.
  try { if (CacheService.getScriptCache().get('setup_kanban_ok')) return; } catch (e) {}
  conectarAba(SHEET_TASKS, CABECALHOS_TAREFAS);
  const abaMembros = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
  try {
    const atualParaMig = abaMembros.getRange(1, 1, 1, abaMembros.getLastColumn()).getValues()[0];
    const idxP = atualParaMig.indexOf('E-mail Pessoal');
    const idxF = atualParaMig.indexOf('Email Funcional');
    if (idxP > -1 && idxF > -1 && idxP > idxF + 1) {
      abaMembros.moveColumns(abaMembros.getRange(1, idxP + 1), idxF + 2);
    }
  } catch(e) {}
  // Corrige o texto do cabeçalho apenas se estiver divergente — evita uma
  // escrita na planilha a cada carregamento do sistema.
  const atual = abaMembros.getRange(1, 1, 1, CABECALHOS_MEMBROS.length).getValues()[0];
  if (atual.some((v, i) => String(v) !== CABECALHOS_MEMBROS[i])) {
    abaMembros.getRange(1, 1, 1, CABECALHOS_MEMBROS.length)
      .setValues([CABECALHOS_MEMBROS]).setFontWeight('bold').setBackground('#f1f5f9');
  }
  migrarEmailPessoalMembros_(abaMembros);
  try { CacheService.getScriptCache().put('setup_kanban_ok', '1', 21600); } catch (e) {}
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
  if (!isMembro_()) return; // idem: bloqueia disparo direto por não-membro
  // Mesma lógica de setupDatabaseKanban: conectar 7 abas + migração de
  // Documentos custava ~8 round-trips à planilha em TODA primeira visita a
  // uma aba do SGQ. Roda no máximo 1x a cada 6h; os dados seguem lidos frescos.
  // Chave versionada (v2): ao subir a remoção da coluna E-mail dos Documentos,
  // o bump força o setup (e a migração nova) a rodar uma vez no próximo
  // carregamento, sem esperar o TTL de 6h da chave antiga.
  try { if (CacheService.getScriptCache().get('setup_resto_ok_v2')) return; } catch (e) {}
  conectarAba(SHEET_UNITS, CABECALHOS_UNIDADES);
  migrarRemoverCarimboDocumentos();
  migrarRemoverColunaEmailDocumentos_();
  conectarAba(SHEET_DOCS,     CABECALHOS_DOCS);
  conectarAba(SHEET_RISKS,    CABECALHOS_RISCOS);
  conectarAba(SHEET_PLANS,    CABECALHOS_PLANOS);
  conectarAba(SHEET_DELIVERY, CABECALHOS_ENTREGAS);
  conectarAba(SHEET_LOGS,     CABECALHOS_LOGS);
  conectarAba(SHEET_CAPACITACOES, CABECALHOS_CAPACITACOES);
  try { CacheService.getScriptCache().put('setup_resto_ok_v2', '1', 21600); } catch (e) {}
}

// Migração única e segura: remove a coluna "E-mail" da aba Documentos (deixou
// de ser usada). Localiza a coluna pelo CABEÇALHO FÍSICO da planilha e a
// exclui inteira, deslocando as demais uma posição à esquerda, sem perder
// dados. Idempotente: depois de removida, indexOf devolve -1 e nada acontece.
// Roda ANTES de conectarAba(SHEET_DOCS, ...) e de qualquer leitura no novo
// layout — getRestoData chama setupDatabaseResto antes de ler; getDocsData só
// é acionado depois que getRestoData já rodou na sessão.
function migrarRemoverColunaEmailDocumentos_() {
  if (!isMembro_()) return;
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DOCS);
    if (!aba || aba.getLastColumn() < 1) return; // aba ainda não existe
    const cab = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(v => String(v).trim());
    const idx = cab.indexOf('E-mail');
    if (idx > -1) aba.deleteColumn(idx + 1);
  } catch (e) {
    console.error('Falha na migração de remoção da coluna E-mail (Documentos): ' + e);
  }
}

// Migração única e segura: se a aba Documentos já existir de uma versão
// anterior com a coluna "Carimbo" na posição A, remove essa coluna
// inteira da planilha (desloca tudo uma posição à esquerda, sem perder
// nenhum dado) para o layout novo, sem essa coluna, ficar consistente
// com os documentos que já estavam cadastrados.
function migrarRemoverCarimboDocumentos() {
  if (!isMembro_()) return; // migração só roda para membro autenticado
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
  if (!isMembro_()) throw new Error('Acesso Negado.');
  setupDatabaseKanban();
  const sheet = conectarAba(SHEET_TASKS);
  const tData = sheet.getDataRange().getValues();
  const C = colIdx_(CABECALHOS_TAREFAS);

  if (tData.length <= 1) return { tasks: [], members: getKanbanData_members_() };

  const hoje = new Date(); hoje.setHours(0,0,0,0);

  const tasks = tData.slice(1).map((r, idx) => {
    const status = String(r[C('Status')]);
    const completionDate = formatarDataParaUI(r[C('Data Conclusão')]);
    let arquivadoRaw = String(r[C('Arquivado')] || '').trim();
    let archived = arquivadoRaw === 'Sim';

    // Arquivamento automático: só entra em jogo quando a coluna está
    // EM BRANCO (nunca decidido). Se o valor for 'Não', significa que o
    // usuário restaurou esse cartão manualmente — respeita a decisão dele
    // e não volta a arquivar sozinho, mesmo que a data de conclusão seja antiga.
    // Calculado apenas EM MEMÓRIA (para exibição) — não grava 'Sim' na planilha
    // durante a leitura, para o carregamento do quadro nunca disputar a trava
    // (comBloqueio) com uma escrita de outra ação. O cálculo é idempotente e
    // determinístico, então o cartão aparece arquivado de forma consistente a
    // cada carga; a persistência só ocorre quando o usuário arquiva/restaura.
    if (arquivadoRaw === '' && status === 'Concluído' && completionDate) {
      const p = completionDate.split('-');
      if (p.length === 3) {
        const dtConclusao = new Date(+p[0], +p[1]-1, +p[2]);
        const diasPassados = Math.floor((hoje - dtConclusao) / 86400000);
        if (diasPassados >= DIAS_PARA_ARQUIVAR) archived = true;
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
    // ativo: em branco/'Sim' = ativo; só 'Não' inativa. Todos os membros são
    // retornados (inclusive inativos) para que os nomes continuem resolvendo em
    // cartões/gráficos/afastamentos antigos; a flag é usada no cliente para
    // filtrar quem aparece nas telas/seletores.
    const at = String(r[C('Ativo')] || '').trim().toLowerCase();
    return {
      id: String(r[C('ID')]), name: String(r[C('Nome')]), role: String(r[C('Cargo')]), email: String(r[C('Email Funcional')]||''), emailPessoal: String(r[C('E-mail Pessoal')]||''),
      diasSemana: diasSemana, diaPresencial: String(r[C('Dia Presencial')]||''),
      horarios: horarios, ativo: !(at === 'não' || at === 'nao')
    };
  }) : [];
}

// Leitura da aba Unidades → array de objetos para o cliente. Extraída de
// getRestoData para poder ser reaproveitada pelo endpoint leve getDocsData().
function _lerUnidades_(ss) {
  const CU = colIdx_(CABECALHOS_UNIDADES);
  const uData = safeGetSheetData(ss, SHEET_UNITS);
  return uData.length > 1 ? uData.slice(1).map((r, i) => {
    const at = String(r[CU('Ativo')] || '').trim().toLowerCase();
    return {
      idRow: i + 2, id: String(r[CU('ID Unidade')] || ''), unidade: String(r[CU('Nome da Unidade')] || ''), sigla: String(r[CU('Sigla')] || ''), email: String(r[CU('E-mail Funcional')] || ''), linkDrive: String(r[CU('Link do Drive')] || ''), ativo: !(at === 'não' || at === 'nao')
    };
  }) : [];
}

// Leitura + normalização da aba Documentos (cálculo de status Vigente/Vencido/
// Próximo da Revisão/Em Elaboração). Extraída de getRestoData para ser
// reaproveitada por getDocsData() — a recarga leve usada após cada escrita
// de documento, que evita reler as 7 abas do sistema inteiro.
function _lerDocumentos_(ss) {
  const CD = colIdx_(CABECALHOS_DOCS);
  const dData = safeGetSheetData(ss, SHEET_DOCS);
  const hoje  = new Date(); hoje.setHours(0,0,0,0);
  return dData.length > 1 ? dData.slice(1).map((r, i) => {
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
      status: statusCalc, responsavel: String(r[CD('Responsável')] || ''),
      linkDoc: String(r[CD('Link Principal')] || ''), docAuxiliar: String(r[CD('Doc Auxiliar 1')] || ''), docAuxiliar2: String(r[CD('Doc Auxiliar 2')] || ''),
      obsoleto: isObsoleto, motivo: String(r[CD('Revisão')] || '')
    };
  }) : [];
}

// Endpoint LEVE para o módulo de Documentos: lê apenas Unidades + Documentos
// (as duas abas de que a aba de Documentos precisa), em vez de reler as 7 abas
// do sistema como getRestoData(). Usado por recarregarDocs() no cliente depois
// de cadastrar/editar/revisar/excluir um documento — é a principal correção da
// lentidão para "efetivar" essas ações. Não dispara setupDatabaseResto (as
// abas já existem quando este caminho é alcançado).
function getDocsData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return { units: _lerUnidades_(ss), docs: _lerDocumentos_(ss) };
}

// Endpoint LEVE para o módulo de Unidades: lê apenas a aba Unidades em vez das
// 7 abas de getRestoData(). Usado por recarregarUnidades() após cadastrar/
// editar/excluir uma unidade. Como Documentos/Riscos/Planos resolvem a unidade
// por id em tempo de renderização (formatUnidadeUI), atualizar só state.units
// já mantém os selects e as telas consistentes.
function getUnitsData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  return { units: _lerUnidades_(SpreadsheetApp.getActiveSpreadsheet()) };
}

function getRestoData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  setupDatabaseResto();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Unidades (usadas por Documentos, Riscos e Entregas) ---
  const units = _lerUnidades_(ss);

  // --- Documentos ---
  const docs = _lerDocumentos_(ss);

  // --- Riscos ---
  const CR = colIdx_(CABECALHOS_RISCOS);
  const CP = colIdx_(CABECALHOS_PLANOS);
  const rData = safeGetSheetData(ss, SHEET_RISKS);
  const pData = safeGetSheetData(ss, SHEET_PLANS);
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
  const eData = safeGetSheetData(ss, SHEET_DELIVERY);
  const deliveries = eData.length > 1 ? eData.slice(1)
    .map(r => ({
      riscoVinculado: String(r[CE('Risco Vinculado')]||''), unidade: String(r[CE('Unidade')]||''),
      entregue: String(r[CE('Status')]||''), dataEntrega: formatarDataParaUI(r[CE('Data Entrega')]),
      processoSei: String(r[CE('SEI')]||'')
    })) : [];

  // --- Capacitações ---
  const CCAP = colIdx_(CABECALHOS_CAPACITACOES);
  const capData = safeGetSheetData(ss, SHEET_CAPACITACOES);
  const trainings = capData.length > 1 ? capData.slice(1)
    .map((r, i) => ({
      idRow: i + 2,
      id: String(r[CCAP('ID')]||''),
      titulo: String(r[CCAP('Título da Capacitação')]||''),
      tema: String(r[CCAP('Tema')]||''),
      publico: String(r[CCAP('Público-alvo')]||''),
      modalidade: String(r[CCAP('Modalidade')]||''),
      dataPrevista: formatarDataParaUI(r[CCAP('Data Prevista')]),
      dataPrevistaRaw: r[CCAP('Data Prevista')] instanceof Date ? r[CCAP('Data Prevista')].getTime() : null,
      dataRealizada: formatarDataParaUI(r[CCAP('Data Realizada')]),
      status: String(r[CCAP('Status')]||'Planejada'),
      materiais: String(r[CCAP('Materiais')]||''),
      participantes: String(r[CCAP('Participantes')]||'')
    })) : [];

  return { units: units, docs: docs, risks: risks, plans: plans, deliveries: deliveries, trainings: trainings };
}

function getCapacitacoesData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const CCAP = colIdx_(CABECALHOS_CAPACITACOES);
  const capData = safeGetSheetData(ss, SHEET_CAPACITACOES);
  return capData.length > 1 ? capData.slice(1).map((r, i) => ({
    idRow: i + 2,
    id: String(r[CCAP('ID')]||''),
    titulo: String(r[CCAP('Título da Capacitação')]||''),
    tema: String(r[CCAP('Tema')]||''),
    publico: String(r[CCAP('Público-alvo')]||''),
    modalidade: String(r[CCAP('Modalidade')]||''),
    dataPrevista: formatarDataParaUI(r[CCAP('Data Prevista')]),
    dataPrevistaRaw: r[CCAP('Data Prevista')] instanceof Date ? r[CCAP('Data Prevista')].getTime() : null,
    dataRealizada: formatarDataParaUI(r[CCAP('Data Realizada')]),
    status: String(r[CCAP('Status')]||'Planejada'),
    materiais: String(r[CCAP('Materiais')]||''),
    // Incluído para casar com o shape de getRestoData(): sem este campo,
    // recarregarCapacitacoes() (após salvar/editar/excluir) zerava a coluna
    // Participantes na UI até um reload completo.
    participantes: String(r[CCAP('Participantes')]||'')
  })) : [];
}

// Migração única: remove colunas Código e Última Atualização da aba de
// Capacitações preservando todos os dados. Executar uma vez pelo editor do
// Apps Script após o deploy e depois pode apagar esta função.
function migrarCapacitacoes() {
  if (!isMembro_()) return 'Acesso Negado.'; // migração manual: exige membro autenticado
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = safeGetSheet(ss, SHEET_CAPACITACOES);
  if (!aba) return 'Aba Capacitações não encontrada.';

  const dados = aba.getDataRange().getValues();
  if (dados.length < 1) return 'Aba vazia, nada para migrar.';

  const cab = dados[0].map(String);
  const idx = n => cab.indexOf(n);

  const novosDados = dados.slice(1).map(r => [
    r[idx('ID')],
    r[idx('Título da Capacitação')],
    r[idx('Tema')],
    r[idx('Público-alvo')],
    r[idx('Modalidade')],
    r[idx('Data Prevista')],
    r[idx('Data Realizada')],
    r[idx('Status')],
    r[idx('Materiais')]
  ]);

  aba.clearContents();
  aba.getRange(1, 1, 1, CABECALHOS_CAPACITACOES.length)
    .setValues([CABECALHOS_CAPACITACOES])
    .setFontWeight('bold').setBackground('#f1f5f9');
  aba.setFrozenRows(1);

  if (novosDados.length > 0) {
    aba.getRange(2, 1, novosDados.length, CABECALHOS_CAPACITACOES.length).setValues(novosDados);
  }

  return 'Migração concluída: ' + novosDados.length + ' registros reorganizados.';
}

// ==========================================
// LOG DE ALTERAÇÕES (auditoria)
// Busca sob demanda (não faz parte de getKanbanData/getRestoData) —
// sempre traz a versão mais recente, sem cache, já que é uma trilha
// de auditoria e precisa refletir o estado atual a cada visita.
// Retorna só os N registros mais recentes para não pesar com o tempo.
// ==========================================
function buscarLogs(filtros) {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  const LIMITE_REGISTROS = 30;
  filtros = filtros || {};
  const aba = conectarAba(SHEET_LOGS, CABECALHOS_LOGS);
  if (aba.getLastRow() <= 1) return { logs: [], temMais: false, acoesUnicas: [] };

  const CL = colIdx_(CABECALHOS_LOGS);
  
  const MAX_ROWS_TO_READ = 2000;
  const lastRow = aba.getLastRow();
  const startRow = Math.max(2, lastRow - MAX_ROWS_TO_READ + 1);
  const numRows = lastRow - startRow + 1;
  const colCount = CABECALHOS_LOGS.length;
  
  const linhasLidas = aba.getRange(startRow, 1, numRows, colCount).getValues();

  let linhas = linhasLidas.map(r => ({
    dataHora: r[CL('Data/Hora')] instanceof Date
      ? Utilities.formatDate(r[CL('Data/Hora')], Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
      : String(r[CL('Data/Hora')] || ''),
    usuario: String(r[CL('Usuário')] || ''),
    acao: String(r[CL('Ação')] || ''),
    referencia: String(r[CL('Referência')] || ''),
    detalhes: String(r[CL('Detalhes')] || ''),
    _ordenacao: r[CL('Data/Hora')] instanceof Date ? r[CL('Data/Hora')].getTime() : 0
  }));

  // Extrai as ações únicas ANTES de filtrar (para popular o dropdown no frontend na primeira carga)
  const acoesUnicas = Array.from(new Set(linhas.map(l => l.acao).filter(a => a))).sort();

  // Filtros no servidor
  if (filtros.acao) linhas = linhas.filter(l => l.acao === filtros.acao);
  if (filtros.usuario) linhas = linhas.filter(l => l.usuario === filtros.usuario);
  
  if (filtros.dataIni || filtros.dataFim) {
    const tsIni = filtros.dataIni ? new Date(filtros.dataIni + 'T00:00:00').getTime() : 0;
    const tsFim = filtros.dataFim ? new Date(filtros.dataFim + 'T23:59:59').getTime() : Infinity;
    linhas = linhas.filter(l => l._ordenacao >= tsIni && l._ordenacao <= tsFim);
  }

  if (filtros.busca) {
    const buscaStr = String(filtros.busca).toLowerCase().trim();
    linhas = linhas.filter(l =>
      (l.referencia || '').toLowerCase().includes(buscaStr) || (l.detalhes || '').toLowerCase().includes(buscaStr)
    );
  }

  linhas.sort((a, b) => b._ordenacao - a._ordenacao);

  // Paginação
  const offset = parseInt(filtros.offset, 10) || 0;
  const resultados = linhas.slice(offset, offset + LIMITE_REGISTROS);
  const temMais = (offset + LIMITE_REGISTROS) < linhas.length;

  return {
    logs: resultados.map(l => ({
      dataHora: l.dataHora, usuario: l.usuario, acao: l.acao, referencia: l.referencia, detalhes: l.detalhes
    })),
    temMais: temMais,
    acoesUnicas: acoesUnicas
  };
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
function sanitizarHtml_(html) {
  // Remove tags perigosas e atributos event handlers inline
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '');
}

function gerarPdfDeHtml(htmlContent, nomeArquivo) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    const htmlSeguro = sanitizarHtml_(htmlContent);
    const blob = Utilities.newBlob(htmlSeguro, MimeType.HTML, 'relatorio.html');
    const pdf = blob.getAs(MimeType.PDF).setName(nomeArquivo);
    return { sucesso: true, base64: Utilities.base64Encode(pdf.getBytes()) };
  } catch (e) { return { sucesso: false, mensagem: e.toString() }; }
}

function enviarPdfDeHtml(destinatario, htmlContent, nomeArquivo, titulo) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario.trim()))
      return { sucesso: false, mensagem: 'E-mail do destinatário inválido.' };
      
    // C04: Restringe o envio exclusivamente para membros cadastrados
    const alvo = destinatario.trim().toLowerCase();
    const lista = membrosParaAuth_();
    const isDestinatarioMembro = lista.some(m => alvo === m[0] || alvo === m[1]);
    
    if (!isDestinatarioMembro) {
      return { sucesso: false, mensagem: 'O destinatário deve ser um membro cadastrado no sistema.' };
    }

    const htmlSeguro = sanitizarHtml_(htmlContent);
    const blob = Utilities.newBlob(htmlSeguro, MimeType.HTML, 'relatorio.html');
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