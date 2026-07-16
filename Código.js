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
const SHEET_HISTORICO    = 'Histórico_Reavaliacoes';
const SHEET_ATIVIDADES   = 'Atividades';

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
// 'Última Atualização' (carimbo de milissegundos) sustenta a trava otimista de
// saveTask(): detecta quando o cartão foi alterado por outra pessoa entre o
// momento em que o editor foi aberto e o clique em Salvar, evitando que uma
// edição desatualizada sobrescreva em silêncio o que já foi salvo por outra pessoa.
// A coluna 'Atividades' saiu deste layout: o histórico do cartão virou a aba
// Atividades (uma linha por item). A remoção da coluna física é feita por
// _migrarEremoverColunaAtividades_ DENTRO do setup, antes de qualquer leitura —
// fazer isso à mão criaria uma janela em que a planilha e esta constante
// discordam, e todo campo depois de 'Atividades' gravaria na coluna errada.
// 'Arquivado' vem depois de 'Etiquetas'. A ordem física é alinhada a esta
// constante por _reordenarColunasTarefas_, no setup, antes de qualquer leitura.
const CABECALHOS_TAREFAS  = ['ID','Status','Título','Descrição','Responsável_ID','Prioridade','Data Criação','Data Início','Prazo','Data Conclusão','Etiquetas','Arquivado','Última Atualização'];
// Histórico do cartão NORMALIZADO: uma linha por comentário/log, em vez de um
// blob JSON na coluna 'Atividades' de Tarefas. Motivo: uma célula do Sheets
// comporta 50.000 caracteres — um cartão muito comentado estourava esse teto,
// o JSON truncava e o histórico corrompia. Aqui não há teto: cada item é uma
// linha. De quebra, saveTask passa a ACRESCENTAR só o que é novo em vez de
// reescrever o histórico inteiro (menos tempo segurando o ScriptLock), e o
// payload do quadro deixa de carregar o histórico de todos os cartões.
// Append-only e nunca referenciada por id — por isso não tem coluna 'ID'.
// A antiga coluna 'Atividades' de Tarefas foi removida do layout: o dado legado
// é migrado para cá e a coluna excluída por _migrarEremoverColunaAtividades_.
const CABECALHOS_ATIVIDADES = ['Tarefa ID','Tipo','Texto','Data','Autor'];
const CABECALHOS_UNIDADES = ['ID Unidade', 'Nome da Unidade','Sigla','E-mail Funcional','Link do Drive', 'Ativo'];
const CABECALHOS_DOCS     = ['Código','Versão','Tipo','Título','Data Aprovação','Próxima Revisão','Status','Responsável','Link Principal','Doc Auxiliar 1','Doc Auxiliar 2','Revisão'];
const CABECALHOS_RISCOS   = ['ID Risco','Macroetapa','Risco','Causa','Consequência','Categoria','Probabilidade','Impacto','Nível','Tipo Tratamento','Responsável','Status','Histórico'];
const CABECALHOS_PLANOS   = ['ID Risco','O Que','Por Que','Quem','Onde','Data Prevista','Data Finalização','Como','Quanto Custa','Status','Revisão Pendente','Histórico','Entregas'];
const CABECALHOS_ENTREGAS = ['Risco Vinculado','Unidade','Status','Data Entrega','SEI'];
const CABECALHOS_LOGS     = ['Data/Hora','Usuário','Ação','Referência','Detalhes'];
const CABECALHOS_CAPACITACOES = ['ID', 'Título da Capacitação', 'Tema', 'Público-alvo', 'Modalidade', 'Data Prevista', 'Data Realizada', 'Status', 'Lista de Presença', 'Responsáveis'];
const CABECALHOS_HISTORICO = ['ID', 'Tipo', 'Data', 'Nova Probabilidade', 'Novo Impacto', 'Novo Nível', 'Novo Tratamento', 'Novo Responsável', 'Justificativa da Mudança'];

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
    if (sheet) {
      const nomeAntigo = sheet.getName();
      sheet.setName(sheetName); // Padroniza o nome
      // Rename autom\u00e1tico \u00e9 raro (s\u00f3 quando o nome da aba diverge por
      // acento/mai\u00fascula) mas acontecia em sil\u00eancio \u2014 registra para ficar
      // rastre\u00e1vel na auditoria caso um dia isso pegue uma aba errada por coincid\u00eancia.
      try { registrarLog('Sistema', sheetName, 'Aba renomeada automaticamente de "' + nomeAntigo + '" para "' + sheetName + '" (normaliza\u00e7\u00e3o de nome).'); } catch (e) {}
    }
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

// Aceita apenas links http(s). Usado ao gravar qualquer campo de link
// (Documentos, Unidades) — o cliente já bloqueia esquemas perigosos
// (ex.: 'javascript:') na exibição, mas a validação também precisa existir
// aqui: o servidor não deve confiar apenas no que o cliente faz antes de
// enviar (defesa em profundidade).
function linkPermitido_(url) {
  const v = String(url || '').trim();
  return !v || /^https?:\/\//i.test(v);
}

function getNowTimestamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

// Data+hora vinda de uma célula para exibição, no formato de getNowTimestamp().
// O Sheets converte sozinho em Date qualquer texto que PAREÇA data ao ser
// gravado — então a mesma coluna pode devolver ora Date, ora string, e ler sem
// guarda entrega o toString cru do JS na tela. Contraparte de
// formatarDataParaUI() (que é só data) para os campos com hora.
function _dataHoraParaUI_(val) {
  if (Object.prototype.toString.call(val) === '[object Date]')
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  return String(val || '');
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

// Gera o próximo ID sequencial de um prefixo (TAR-, MEM-, UN-, CAP-, AF-),
// guardando um contador em PropertiesService em vez de reler a coluna de IDs
// inteira a cada gravação. Todos os chamadores já rodam dentro de um
// comBloqueio (ver saveTask/saveMember/salvarUnidade/salvarCapacitacao/
// salvarAfastamento) — por isso o incremento aqui não precisa de lock
// próprio, já está serializado por quem chama.
// Na primeira chamada para um prefixo (contador ainda não existe), calcula a
// partir do maior ID já gravado na aba — mesma conta que o código antigo
// fazia sempre — para não colidir com IDs existentes; das próximas em diante
// só lê/grava o contador, sem reler a planilha.
function getNextId_(sheet, prefixo) {
  const props = PropertiesService.getScriptProperties();
  const chave = 'nextid_' + prefixo;
  let atual = parseInt(props.getProperty(chave), 10);
  if (isNaN(atual)) {
    atual = 0;
    if (sheet && sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      ids.forEach(r => {
        const n = parseInt(String(r[0]).replace(/\D/g,''), 10);
        if (!isNaN(n) && n > atual) atual = n;
      });
    }
  }
  const proximo = atual + 1;
  props.setProperty(chave, String(proximo));
  return prefixo + proximo;
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

// ==========================================
// ATIVIDADES (histórico dos cartões)
// ==========================================
// Ponte do layout legado → atual: migra o que restar do JSON da coluna
// 'Atividades' de Tarefas para a aba Atividades e então REMOVE a coluna,
// alinhando a planilha ao CABECALHOS_TAREFAS (que não a lista mais).
//
// Roda dentro do setup, ANTES de qualquer leitura de Tarefas. É o único jeito
// seguro: enquanto a planilha tiver a coluna e a constante não, todo campo
// depois dela (Arquivado, Etiquetas, Última Atualização) desalinha em uma
// posição — em silêncio. Fazer a remoção à mão abriria exatamente essa janela.
//
// O cabeçalho é lido da PLANILHA, não da constante — a constante já não conhece
// 'Atividades', e é justamente a planilha que pode estar defasada.
// Idempotente por PropertiesService (permanente; o cache de 6h do setup não
// serviria de guarda) e re-checado dentro do lock, para dois usuários abrindo
// o sistema ao mesmo tempo não migrarem em paralelo e duplicarem o histórico.
// Tolera a coluna já ter sido removida à mão: nesse caso é um no-op.
function _migrarEremoverColunaAtividades_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('coluna_atividades_removida_v1') === 'ok') return;
  comBloqueio(() => {
    if (props.getProperty('coluna_atividades_removida_v1') === 'ok') return;
    const aba = safeGetSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_TASKS);
    if (!aba || aba.getLastColumn() < 1) return;

    const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const idxAtiv = cabecalho.indexOf('Atividades');
    if (idxAtiv === -1) { // já removida (à mão ou por uma execução anterior)
      props.setProperty('coluna_atividades_removida_v1', 'ok');
      return;
    }
    const idxId = cabecalho.indexOf('ID');
    // A migração anterior (_migrarAtividadesParaAba_) pode JÁ ter copiado este
    // histórico para a aba Atividades. Se copiar de novo, duplica tudo — por
    // isso a varredura abaixo só MIGRA quando essa flag ainda não existe. O
    // rastreio de JSON ilegível acontece nos dois casos: a migração antiga
    // pulava os ilegíveis e os deixava na coluna, e são exatamente eles que
    // impedem a exclusão.
    const jaMigrado = props.getProperty('migracao_atividades_v1') === 'ok';

    let migrados = 0, ilegiveis = 0;
    if (aba.getLastRow() > 1 && idxId !== -1) {
      const dados = aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();
      const linhas = [];
      dados.forEach(r => {
        const bruto = String(r[idxAtiv] || '').trim();
        if (!bruto || bruto === '[]') return;
        let arr;
        try { arr = JSON.parse(bruto); } catch (e) { ilegiveis++; return; }
        if (!Array.isArray(arr)) { ilegiveis++; return; }
        if (jaMigrado) return; // legível e já copiado — nada a fazer
        const tarefaId = String(r[idxId]);
        arr.forEach(a => {
          if (!a) return;
          linhas.push([tarefaId, String(a.type || 'log'), String(a.text || ''), String(a.date || ''), String(a.author || '')]);
        });
      });
      if (linhas.length) {
        const abaA = conectarAba(SHEET_ATIVIDADES, CABECALHOS_ATIVIDADES);
        abaA.getRange(abaA.getLastRow() + 1, 1, linhas.length, CABECALHOS_ATIVIDADES.length).setValues(linhas);
        migrados = linhas.length;
      }
    }

    // JSON ilegível = histórico que NÃO pôde ser migrado (o cartão corrompido
    // pelo antigo teto de 50k, por exemplo). Apagar a coluna aqui destruiria o
    // único lugar onde esse dado ainda existe — então para tudo e pede olho
    // humano. O sistema continua funcionando: a coluna sobrando é inerte.
    if (ilegiveis > 0) {
      registrarLog('Sistema', 'Tarefas', 'ATENÇÃO: coluna "Atividades" NÃO removida — ' + ilegiveis +
        ' cartão(ões) com JSON ilegível que não pôde ser migrado. ' + migrados +
        ' registro(s) migrado(s). Inspecione esses cartões manualmente antes de excluir a coluna.');
      return; // sem marcar a flag: tenta de novo no próximo setup
    }

    aba.deleteColumn(idxAtiv + 1);
    props.setProperty('coluna_atividades_removida_v1', 'ok');
    props.setProperty('migracao_atividades_v1', 'ok'); // encerra a migração antiga
    registrarLog('Sistema', 'Tarefas', 'Coluna "Atividades" removida do layout de Tarefas. ' +
      migrados + ' registro(s) de histórico migrado(s) para a aba Atividades.');
  });
}

// Acrescenta itens de histórico em lote. `itens` = [{tarefaId, tipo, texto,
// data, autor}]. Uma escrita só, independentemente da quantidade — appendRow
// em laço custaria um round-trip por item, dentro do lock.
function _registrarAtividades_(itens) {
  if (!itens || !itens.length) return;
  const aba = conectarAba(SHEET_ATIVIDADES, CABECALHOS_ATIVIDADES);
  const linhas = itens.map(a => [String(a.tarefaId), String(a.tipo || 'log'), String(a.texto || ''), String(a.data || ''), String(a.autor || '')]);
  aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CABECALHOS_ATIVIDADES.length).setValues(linhas);
}

// Remove todo o histórico de uma tarefa (usado ao excluir o cartão). Itera de
// trás para frente porque cada deleteRow desloca as linhas seguintes.
function _excluirAtividadesDaTarefa_(tarefaId) {
  const aba = safeGetSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ATIVIDADES);
  if (!aba || aba.getLastRow() <= 1) return;
  const CA = colIdx_(CABECALHOS_ATIVIDADES);
  const alvo = String(tarefaId || '').trim();
  if (!alvo) return;
  const dados = aba.getDataRange().getValues();
  for (let i = dados.length - 1; i >= 1; i--) {
    if (String(dados[i][CA('Tarefa ID')]).trim() === alvo) aba.deleteRow(i + 1);
  }
}

// Contagem de COMENTÁRIOS por tarefa, para o badge do cartão no quadro.
// Lê apenas as colunas 'Tarefa ID' e 'Tipo' (2 de 5) — o texto dos comentários
// é o campo pesado e não é necessário para contar.
function _contarComentariosPorTarefa_() {
  const contagem = {};
  const aba = safeGetSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ATIVIDADES);
  if (!aba || aba.getLastRow() <= 1) return contagem;
  const CA = colIdx_(CABECALHOS_ATIVIDADES);
  const dados = aba.getRange(2, CA('Tarefa ID') + 1, aba.getLastRow() - 1, 2).getValues();
  dados.forEach(r => {
    if (String(r[1]).trim() !== 'comment') return;
    const id = String(r[0]).trim();
    if (id) contagem[id] = (contagem[id] || 0) + 1;
  });
  return contagem;
}

// Histórico de UM cartão — buscado só ao abrir o cartão (ver abrirModalTarefa).
// É o que permite o quadro não trafegar o histórico de todos os cartões.
function getAtividadesTarefa(tarefaId) {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  const aba = safeGetSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_ATIVIDADES);
  if (!aba || aba.getLastRow() <= 1) return [];
  const CA = colIdx_(CABECALHOS_ATIVIDADES);
  const alvo = String(tarefaId || '').trim();
  if (!alvo) return [];
  return aba.getDataRange().getValues().slice(1)
    .filter(r => String(r[CA('Tarefa ID')]).trim() === alvo)
    .map(r => ({
      type: String(r[CA('Tipo')] || 'log'),
      text: String(r[CA('Texto')] || ''),
      // Gravamos 'dd/MM/yyyy HH:mm' como TEXTO, mas o Sheets reconhece esse
      // formato e converte a célula em Date por conta própria. Sem esta guarda,
      // String(umDate) devolvia o toString cru do JS ("Wed Jul 15 2026
      // 14:15:00 GMT-0300 (Horário Padrão de Brasília)") direto na tela.
      // Mesmo tratamento que buscarLogs já faz na coluna Data/Hora.
      date: _dataHoraParaUI_(r[CA('Data')]),
      author: String(r[CA('Autor')] || '')
    }));
}

// Alinha a ORDEM FÍSICA das colunas de Tarefas ao CABECALHOS_TAREFAS. Roda no
// setup, antes de qualquer leitura — enquanto planilha e constante discordarem,
// todo acesso por colIdx_ cai na coluna errada, sem erro.
//
// Remonta cada linha em memória pelo NOME da coluna (lido do cabeçalho real) e
// sobrescreve. Não usa moveColumns: uma única escrita, resultado determinístico
// e sem depender da semântica de índice pré/pós-movimento. Não usa
// clearContents: se o script morresse entre limpar e escrever, a aba inteira
// iria junto — o setValues sobrescreve as mesmas células, sem janela de perda.
// Idempotente (sai na hora se já estiver alinhado) e re-checado dentro do lock.
function _reordenarColunasTarefas_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ordem_tarefas_v1') === 'ok') return;
  comBloqueio(() => {
    if (props.getProperty('ordem_tarefas_v1') === 'ok') return;
    const aba = safeGetSheet(SpreadsheetApp.getActiveSpreadsheet(), SHEET_TASKS);
    if (!aba || aba.getLastColumn() < 1) return;

    const largura = aba.getLastColumn();
    const cabecalho = aba.getRange(1, 1, 1, largura).getValues()[0].map(h => String(h).trim());
    const alinhado = cabecalho.length === CABECALHOS_TAREFAS.length &&
                     CABECALHOS_TAREFAS.every((c, i) => cabecalho[i] === c);
    if (alinhado) { props.setProperty('ordem_tarefas_v1', 'ok'); return; }

    // Só reordena se TODAS as colunas do layout existirem na aba. Faltando
    // alguma, remontar embaralharia o dado — melhor não tocar e pedir olho
    // humano (o conectarAba cria as faltantes no fim; o próximo setup alinha).
    const faltando = CABECALHOS_TAREFAS.filter(c => cabecalho.indexOf(c) === -1);
    if (faltando.length) {
      registrarLog('Sistema', 'Tarefas', 'Reordenação de colunas adiada — ausente(s) na aba: ' + faltando.join(', '));
      return;
    }

    const nLinhas = aba.getLastRow();
    const dados = aba.getRange(1, 1, nLinhas, largura).getValues();
    const novos = dados.map(r => CABECALHOS_TAREFAS.map(nome => r[cabecalho.indexOf(nome)]));
    novos[0] = CABECALHOS_TAREFAS.slice(); // cabeçalho na ordem nova
    aba.getRange(1, 1, nLinhas, CABECALHOS_TAREFAS.length).setValues(novos);
    aba.getRange(1, 1, 1, CABECALHOS_TAREFAS.length).setFontWeight('bold').setBackground('#f1f5f9');
    props.setProperty('ordem_tarefas_v1', 'ok');
    registrarLog('Sistema', 'Tarefas', 'Colunas reordenadas para o layout atual: ' + CABECALHOS_TAREFAS.join(' | '));
  });
}

function setupDatabaseKanban() {
  if (!isMembro_()) return; // não-membros não disparam setup/migração (proteção contra chamada direta via F12)
  // O setup só cria abas faltantes e roda migrações idempotentes — não
  // precisa executar em TODA carga do Kanban. Sem esta guarda, cada abertura
  // do sistema pagava ~5 round-trips à planilha (getSheetByName/getLastColumn/
  // leitura de cabeçalho/migração). Roda no máximo 1x a cada 6h por deploy.
  // Chave versionada (_v2): o cache antigo faria o setup pular a remoção da
  // coluna 'Atividades' por até 6h — e nesse meio-tempo a planilha (com a
  // coluna) e CABECALHOS_TAREFAS (sem ela) estariam desalinhados.
  try { if (CacheService.getScriptCache().get('setup_kanban_ok_v2')) return; } catch (e) {}
  // PRIMEIRA coisa: alinhar a planilha ao layout atual. Tem de vir antes do
  // conectarAba abaixo — com a coluna ainda presente, a aba tem 14 colunas e a
  // constante 13, e qualquer leitura/escrita de Arquivado, Etiquetas ou Última
  // Atualização cairia uma coluna adiante, sem erro nenhum.
  _migrarEremoverColunaAtividades_(); // 1) tira a coluna que saiu do layout
  _reordenarColunasTarefas_();        // 2) põe as que restaram na ordem certa
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
  conectarAba(SHEET_ATIVIDADES, CABECALHOS_ATIVIDADES);
  try { CacheService.getScriptCache().put('setup_kanban_ok_v2', '1', 21600); } catch (e) {}
}

function setupDatabaseResto() {
  if (!isMembro_()) return; // idem: bloqueia disparo direto por não-membro
  // Mesma lógica de setupDatabaseKanban: conectar 7 abas custava ~8 round-trips
  // à planilha em TODA primeira visita a uma aba do SGQ. Roda no máximo 1x a
  // cada 6h; os dados seguem lidos frescos. Chave versionada (v2): mantida por
  // compatibilidade com o cache já distribuído — o "v3" garante a migração.
  try { if (CacheService.getScriptCache().get('setup_resto_ok_v4')) return; } catch (e) {}
  conectarAba(SHEET_UNITS, CABECALHOS_UNIDADES);
  conectarAba(SHEET_DOCS,     CABECALHOS_DOCS);
  conectarAba(SHEET_RISKS,    CABECALHOS_RISCOS);
  conectarAba(SHEET_PLANS,    CABECALHOS_PLANOS);
  conectarAba(SHEET_DELIVERY, CABECALHOS_ENTREGAS);
  conectarAba(SHEET_LOGS,     CABECALHOS_LOGS);
  conectarAba(SHEET_CAPACITACOES, CABECALHOS_CAPACITACOES);
  conectarAba(SHEET_HISTORICO, CABECALHOS_HISTORICO);

  try { CacheService.getScriptCache().put('setup_resto_ok_v4', '1', 21600); } catch (e) {}
}

// ==========================================
// CARREGAMENTO EM DUAS ETAPAS
// Etapa 1 (getKanbanData): só Tarefas + Membros — usada para o quadro
// Kanban aparecer imediatamente ao abrir o sistema, sem esperar a
// leitura de Unidades/Documentos/Riscos/Planos/Entregas. Chamada de novo a
// cada ação de cartão (recarregarKanban) — por isso fica restrita só a
// Tarefas+Membros; Afastamentos tem sua própria busca (getAfastamentos),
// em paralelo, para não pesar nessa releitura frequente.
// Etapa 2 (getRestoData): as demais abas, buscadas em segundo plano
// logo depois que o Kanban já está na tela.
// ==========================================
// Dias após a conclusão para um cartão ser arquivado automaticamente
const DIAS_PARA_ARQUIVAR = 15;

// Regra ÚNICA de "este cartão está arquivado?", compartilhada pelo quadro e
// pela aba Arquivados — as duas telas precisam concordar, e duplicar a regra
// era o caminho mais curto para elas divergirem.
// Arquivamento automático: só entra em jogo quando a coluna está EM BRANCO
// (nunca decidido). Se o valor for 'Não', o usuário restaurou o cartão
// manualmente — respeita a decisão dele e não volta a arquivar sozinho, mesmo
// com data de conclusão antiga. Calculado apenas EM MEMÓRIA: não grava 'Sim'
// durante a leitura, para o carregamento nunca disputar a trava (comBloqueio)
// com uma escrita de outra ação. É idempotente e determinístico, então o
// resultado é consistente a cada carga; a persistência só ocorre quando o
// usuário arquiva/restaura.
function _tarefaArquivada_(r, C, hoje) {
  const arquivadoRaw = String(r[C('Arquivado')] || '').trim();
  if (arquivadoRaw === 'Sim') return true;
  if (arquivadoRaw !== '') return false;
  if (String(r[C('Status')]) !== 'Concluído') return false;
  const completionDate = formatarDataParaUI(r[C('Data Conclusão')]);
  if (!completionDate) return false;
  const p = completionDate.split('-');
  if (p.length !== 3) return false;
  const dtConclusao = new Date(+p[0], +p[1]-1, +p[2]);
  return Math.floor((hoje - dtConclusao) / 86400000) >= DIAS_PARA_ARQUIVAR;
}

function _mapearTarefa_(r, C) {
  return {
    id: String(r[C('ID')]), status: String(r[C('Status')]), title: String(r[C('Título')]), description: String(r[C('Descrição')]),
    assigneeId: String(r[C('Responsável_ID')]), priority: String(r[C('Prioridade')]), creationDate: formatarDataParaUI(r[C('Data Criação')]),
    startDate: formatarDataParaUI(r[C('Data Início')]), deadline: formatarDataParaUI(r[C('Prazo')]),
    completionDate: formatarDataParaUI(r[C('Data Conclusão')]),
    labels: String(r[C('Etiquetas')] || '[]'),
    updatedAt: String(r[C('Última Atualização')] || '')
  };
}

// Quadro Kanban: SÓ os cartões ativos, e SEM o histórico de atividades.
// Antes devolvia todos os cartões já criados (os arquivados iam junto, para a
// aba Arquivados filtrar no cliente) e, dentro de cada um, o histórico completo
// de comentários — o campo mais pesado do sistema. Como esta função é chamada
// a cada ação de cartão (recarregarKanban), o payload crescia para sempre e
// era pago a cada arrastar. Arquivados agora têm endpoint próprio
// (getTarefasArquivadas) e o histórico é buscado ao abrir o cartão
// (getAtividadesTarefa); aqui vai apenas a CONTAGEM, que é o que o cartão
// exibe no badge.
function getKanbanData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  setupDatabaseKanban();
  const sheet = conectarAba(SHEET_TASKS);
  const tData = sheet.getDataRange().getValues();
  const C = colIdx_(CABECALHOS_TAREFAS);

  if (tData.length <= 1) return { tasks: [], members: getKanbanData_members_() };

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const contagem = _contarComentariosPorTarefa_();

  const tasks = [];
  tData.slice(1).forEach(r => {
    if (_tarefaArquivada_(r, C, hoje)) return;
    const t = _mapearTarefa_(r, C);
    t.commentCount = contagem[t.id] || 0;
    tasks.push(t);
  });

  return { tasks: tasks, members: getKanbanData_members_() };
}

// Aba Arquivados — busca própria e sob demanda (só na primeira visita à aba),
// no mesmo espírito de getAfastamentos(). Não devolve commentCount: a tabela
// de arquivados não exibe comentários, então contar seria custo sem uso.
function getTarefasArquivadas() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  const sheet = conectarAba(SHEET_TASKS);
  const tData = sheet.getDataRange().getValues();
  if (tData.length <= 1) return [];
  const C = colIdx_(CABECALHOS_TAREFAS);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const arquivadas = [];
  tData.slice(1).forEach(r => {
    if (!_tarefaArquivada_(r, C, hoje)) return;
    const t = _mapearTarefa_(r, C);
    t.archived = true;
    arquivadas.push(t);
  });
  return arquivadas;
}

function getKanbanData_members_() {
  const C = colIdx_(CABECALHOS_MEMBROS);
  // Sem passar cabecalhos: a validação/migração de colunas de Membros já é
  // garantida (e cacheada por 6h) por setupDatabaseKanban() logo acima em
  // getKanbanData(). Repeti-la aqui só custaria um getLastColumn() extra
  // por carga, sem necessidade.
  const mData = conectarAba(SHEET_MEMBERS).getDataRange().getValues();

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

// Leitura + normalização de Riscos/Planos/Entregas — extraída de getRestoData
// para ser reaproveitada por getRiscosData(), o endpoint leve usado ao
// recarregar só a aba de Riscos/Planos depois de salvar/editar/excluir (evita
// reler também Documentos e Capacitações, que essa tela não usa).
function _lerRiscosPlanosEntregas_(ss) {
  const CR = colIdx_(CABECALHOS_RISCOS);
  const CP = colIdx_(CABECALHOS_PLANOS);
  const rData = safeGetSheetData(ss, SHEET_RISKS);
  const pData = safeGetSheetData(ss, SHEET_PLANS);
  const planosRows = pData.length > 1 ? pData.slice(1) : [];

  // Índice ref do risco → 'O Que' do primeiro plano vinculado, montado UMA vez.
  // Antes era um for sobre todos os planos DENTRO do map dos riscos (O(n²)):
  // 200 riscos × 200 planos = 40 mil comparações a cada carga do sistema.
  // A chave normaliza os dois formatos aceitos de 'ID Risco' ('R5' e
  // 'R5 - descrição') para 'R5'; o primeiro plano encontrado vence, como o
  // `break` original garantia.
  const planoPorRef = new Map();
  for (const p of planosRows) {
    const base = String(p[CP('ID Risco')]||'').split(' -')[0].trim();
    if (base && !planoPorRef.has(base)) planoPorRef.set(base, String(p[CP('O Que')]||'-'));
  }

  const historico = [];

  const risks = rData.length > 1 ? rData.slice(1)
    .map((r, i) => {
      const idRisco = parseInt(String(r[CR('ID Risco')]||'').replace('R',''), 10) || (i+1);
      const ref = 'R' + idRisco;
      const planoAcao = planoPorRef.get(ref) || '-';

      const jsonHist = String(r[CR('Histórico')]||'').trim();
      if (jsonHist.startsWith('[')) {
        try {
          const parsed = JSON.parse(jsonHist);
          parsed.forEach(h => {
             historico.push({
               id: ref, tipo: 'Risco', data: h.data||'',
               prob: h.prob||null, impacto: h.impacto||null, nivel: h.nivel||'',
               tratamento: h.tratamento||'', responsavel: h.responsavel||'', justificativa: h.justificativa||''
             });
          });
        } catch(e) {}
      }

      return {
        id: idRisco, macroetapa: String(r[CR('Macroetapa')]||''), nome: String(r[CR('Risco')]||''), causa: String(r[CR('Causa')]||''),
        consequencia: String(r[CR('Consequência')]||''), categoria: String(r[CR('Categoria')]||''),
        probabilidade: parseInt(r[CR('Probabilidade')],10)||1, impacto: parseInt(r[CR('Impacto')],10)||1,
        nivel: String(r[CR('Nível')]||''), tipoTratamento: String(r[CR('Tipo Tratamento')]||''),
        responsavel: String(r[CR('Responsável')]||'Não atribuído'), planoAcao: planoAcao,
        status: String(r[CR('Status')]||'Ativo')
      };
    }) : [];

  const deliveries = [];

  const plans = planosRows.map((r, pIdx) => {
    const ref = String(r[CP('ID Risco')]||'');
    
    // Processar Histórico
    const jsonHist = String(r[CP('Histórico')]||'').trim();
    if (jsonHist.startsWith('[')) {
      try {
        const parsed = JSON.parse(jsonHist);
        parsed.forEach(h => {
           historico.push({
             id: ref, tipo: 'Plano', data: h.data||'',
             justificativa: h.justificativa||''
           });
        });
      } catch(e) {}
    }

    // Processar Entregas
    const jsonEntregas = String(r[CP('Entregas')]||'').trim();
    if (jsonEntregas.startsWith('[')) {
      try {
        const parsedE = JSON.parse(jsonEntregas);
        parsedE.forEach(e => {
           deliveries.push({
             planoIdx: pIdx, riscoVinculado: ref, unidade: e.unidade||'',
             entregue: e.status||'', dataEntrega: formatarDataParaUI(e.data||''),
             processoSei: e.sei||''
           });
        });
      } catch(e) {}
    }

    return {
      riscoVinculado: ref, what: String(r[CP('O Que')]||''), why: String(r[CP('Por Que')]||''),
      who: String(r[CP('Quem')]||''), where: String(r[CP('Onde')]||''),
      whenPrevisto: formatarDataParaUI(r[CP('Data Prevista')]), whenFinalizado: formatarDataParaUI(r[CP('Data Finalização')]),
      how: String(r[CP('Como')]||''), howMuch: String(r[CP('Quanto Custa')]||''),
      status: String(r[CP('Status')]||'Em Andamento'), revisaoPendente: String(r[CP('Revisão Pendente')]||'Não')
    };
  });



  return { risks: risks, plans: plans, deliveries: deliveries, history: historico };
}

// Endpoint LEVE para a tela de Riscos/Acompanhamento: lê só Unidades +
// Riscos + Planos + Entregas, em vez das 7 abas de getRestoData(). Usado por
// recarregarRiscosPlanos() no cliente após salvar/editar/excluir um
// risco/plano/entrega — mesma lógica de getDocsData()/getUnitsData(), que já
// evitam reler Documentos/Capacitações nessas telas.
function getRiscosData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const units = _lerUnidades_(ss);
  const rpe = _lerRiscosPlanosEntregas_(ss);
  return { units: units, risks: rpe.risks, plans: rpe.plans, deliveries: rpe.deliveries, history: rpe.history };
}

function getRestoData() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  setupDatabaseResto();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Unidades (usadas por Documentos, Riscos e Entregas) ---
  const units = _lerUnidades_(ss);

  // --- Documentos ---
  const docs = _lerDocumentos_(ss);

  // --- Riscos, Planos e Entregas ---
  const rpe = _lerRiscosPlanosEntregas_(ss);
  const risks = rpe.risks, plans = rpe.plans, deliveries = rpe.deliveries;

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
      materiais: String(r[CCAP('Lista de Presença')]||''),
      participantes: String(r[CCAP('Responsáveis')]||'')
    })) : [];

  return { 
    units: units, 
    docs: docs, 
    risks: risks, 
    plans: plans, 
    deliveries: deliveries,
    history: rpe.history,
    trainings: trainings 
  };
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
    materiais: String(r[CCAP('Lista de Presença')]||''),
    // Incluído para casar com o shape de getRestoData(): sem este campo,
    // recarregarCapacitacoes() (após salvar/editar/excluir) zerava a coluna
    // Responsáveis na UI até um reload completo.
    participantes: String(r[CCAP('Responsáveis')]||'')
  })) : [];
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
// Blocklist reforçada (não é um parser de verdade — o runtime do Apps
// Script não tem um parser de HTML nativo utilizável aqui). Antes só cobria
// atributos de evento entre aspas; agora também cobre a versão sem aspas
// (ex.: <img onerror=alert(1)>) e esquemas 'javascript:' em href/src, que
// escapavam da checagem original. O destino é sempre um PDF estático — não
// há HTML "ao vivo" no navegador consumindo este retorno — então o risco
// prático já era baixo, mas a proteção não deveria depender só disso.
function sanitizarHtml_(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<(object|embed|link|base|meta)\b[^>]*>/gi, '')
    // Atributos de evento (onclick, onerror, onload...) com aspas duplas, simples ou sem aspas
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/\s+on\w+=[^\s>]+/gi, '')
    // Esquema 'javascript:' em href/src (com ou sem aspas) — preserva http(s)/data:
    .replace(/\s+(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '')
    .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]*/gi, '');
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

// Evita que um clique duplo (ou um script repetindo a chamada) dispare vários
// e-mails em sequência e consuma a cota diária do MailApp. Por usuário (não
// global), com uma janela curta — não é para impedir uso normal, só rajadas.
const RATE_LIMIT_ENVIO_PDF_SEGUNDOS = 10;
function limiteEnvioPdfExcedido_() {
  try {
    const cache = CacheService.getUserCache();
    if (!cache) return false; // sem cache disponível: não bloqueia por segurança
    if (cache.get('envio_pdf_rate')) return true;
    cache.put('envio_pdf_rate', '1', RATE_LIMIT_ENVIO_PDF_SEGUNDOS);
    return false;
  } catch (e) { return false; }
}

function enviarPdfDeHtml(destinatario, htmlContent, nomeArquivo, titulo) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (limiteEnvioPdfExcedido_())
      return { sucesso: false, mensagem: 'Aguarde alguns segundos antes de enviar outro relatório.' };
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
    // Único ponto do sistema em que registrarLog roda fora de um comBloqueio
    // já existente — protegido aqui para não colidir com outra escrita
    // concorrente na aba Logs (ver auditoria H03).
    comBloqueio(() => registrarLog('Envio de PDF', titulo || 'Relatório', 'Destinatário: ' + destinatario));
    return { sucesso: true, mensagem: 'Relatório enviado com sucesso!' };
  } catch (e) { return { sucesso: false, mensagem: e.toString() }; }
}

// SCRIPT TEMPORÁRIO DE MIGRAÇÃO - DE HISTÓRICO PARA JSON NAS ABAS
function MIGRAR_HISTORICO_PARA_JSON() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaH = ss.getSheetByName('Histórico_Reavaliacoes');
  if (!abaH) return 'Aba de histórico não encontrada.';
  
  const abaR = ss.getSheetByName('Riscos');
  const abaP = ss.getSheetByName('Planos_Acao');
  
  const rowsH = abaH.getDataRange().getValues();
  if (rowsH.length < 2) return 'Histórico vazio.';
  
  const CH = colIdx_(CABECALHOS_HISTORICO);
  
  // Agrupar histórico por ID e Tipo
  const histRiscos = {};
  const histPlanos = {};
  
  for (let i = 1; i < rowsH.length; i++) {
    const r = rowsH[i];
    const id = String(r[CH('ID')]||'').trim();
    const tipo = String(r[CH('Tipo')]||'').trim();
    if (!id || !tipo) continue;
    
    if (tipo === 'Risco') {
      if (!histRiscos[id]) histRiscos[id] = [];
      histRiscos[id].push({
        data: formatarDataParaUI(r[CH('Data')]),
        prob: parseInt(r[CH('Nova Probabilidade')],10)||null,
        impacto: parseInt(r[CH('Novo Impacto')],10)||null,
        nivel: String(r[CH('Novo Nível')]||''),
        tratamento: String(r[CH('Novo Tratamento')]||''),
        responsavel: String(r[CH('Novo Responsável')]||''),
        justificativa: String(r[CH('Justificativa da Mudança')]||'')
      });
    } else if (tipo === 'Plano') {
      if (!histPlanos[id]) histPlanos[id] = [];
      histPlanos[id].push({
        data: formatarDataParaUI(r[CH('Data')]),
        justificativa: String(r[CH('Justificativa da Mudança')]||'')
      });
    }
  }
  
  // Atualizar aba Riscos
  const rowsR = abaR.getDataRange().getValues();
  const CR = colIdx_(CABECALHOS_RISCOS);
  for (let i = 1; i < rowsR.length; i++) {
    const id = String(rowsR[i][CR('ID Risco')]||'').trim();
    if (id && histRiscos[id]) {
      abaR.getRange(i + 1, CR('Histórico') + 1).setValue(JSON.stringify(histRiscos[id]));
    } else {
      abaR.getRange(i + 1, CR('Histórico') + 1).setValue('[]');
    }
  }
  
  // Atualizar aba Planos
  if (abaP) {
    const rowsP = abaP.getDataRange().getValues();
    const CP = colIdx_(CABECALHOS_PLANOS);
    for (let i = 1; i < rowsP.length; i++) {
      const id = String(rowsP[i][CP('ID Risco')]||'').trim();
      if (id && histPlanos[id]) {
        abaP.getRange(i + 1, CP('Histórico') + 1).setValue(JSON.stringify(histPlanos[id]));
      } else {
        abaP.getRange(i + 1, CP('Histórico') + 1).setValue('[]');
      }
    }
  }
  
  return 'Migração concluída com sucesso!';
}

//==============================================================================
// MIGRACÃO DE ENTREGAS
// Função para ser executada manualmente no Editor de Script para migrar as
// entregas da aba "Acompanhamento_Entregas" para a coluna "Entregas" em "Planos_Acao"
//==============================================================================
function MIGRAR_ENTREGAS_PARA_JSON() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaEntregas = ss.getSheetByName(SHEET_DELIVERY);
  const abaPlanos = ss.getSheetByName(SHEET_PLANS);
  
  if (!abaEntregas || !abaPlanos) {
    Logger.log("Aba de Entregas ou Planos não encontrada.");
    return;
  }
  
  const rowsE = abaEntregas.getDataRange().getValues();
  const CE = colIdx_(CABECALHOS_ENTREGAS);
  
  // Agrupar entregas por ID Risco
  const entregasPorRisco = {};
  for (let i = 1; i < rowsE.length; i++) {
    const rId = String(rowsE[i][CE('Risco Vinculado')] || '').trim();
    if (!rId) continue;
    if (!entregasPorRisco[rId]) entregasPorRisco[rId] = [];
    
    entregasPorRisco[rId].push({
      unidade: String(rowsE[i][CE('Unidade')] || ''),
      status: String(rowsE[i][CE('Status')] || ''),
      data: String(rowsE[i][CE('Data Entrega')] || ''),
      sei: String(rowsE[i][CE('SEI')] || '')
    });
  }
  
  const rowsP = abaPlanos.getDataRange().getValues();
  const CP = colIdx_(CABECALHOS_PLANOS);
  const updateData = []; // [linha, valor]
  
  // Para cada risco, encontramos o SEU ÚLTIMO PLANO e injetamos as entregas nele.
  const planosPorRisco = {}; // { R1: [linhas...] }
  for (let i = 1; i < rowsP.length; i++) {
    const rId = String(rowsP[i][CP('ID Risco')] || '').trim();
    if (!rId) continue;
    if (!planosPorRisco[rId]) planosPorRisco[rId] = [];
    planosPorRisco[rId].push(i + 1); // linha base 1
  }
  
  for (const rId in entregasPorRisco) {
    const linhasPlano = planosPorRisco[rId];
    if (linhasPlano && linhasPlano.length > 0) {
      // Pega o último plano daquele risco
      const ultimaLinha = linhasPlano[linhasPlano.length - 1];
      const jsonStr = JSON.stringify(entregasPorRisco[rId]);
      updateData.push([ultimaLinha, jsonStr]);
    }
  }
  
  // Escrever de volta
  updateData.forEach(upd => {
    abaPlanos.getRange(upd[0], CP('Entregas') + 1).setValue(upd[1]);
  });
  
  Logger.log("Migração de Entregas concluída! Registros migrados para " + updateData.length + " planos.");
}