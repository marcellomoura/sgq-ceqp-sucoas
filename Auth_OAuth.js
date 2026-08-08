// ==========================================
// AUTENTICAÇÃO OAuth — Login "Entrar com Google"
// ==========================================
//
// Backend do login do sistema, usado quando o web app roda com
// `executeAs: USER_DEPLOYING` ("executar como o dono"). Nesse modelo o
// Session.getActiveUser() vem VAZIO para todo mundo que não seja a própria
// conta-dona — então a identidade do membro não vem mais "de graça" e passa a
// ser estabelecida por um login OAuth 2.0 (fluxo Authorization Code).
//
// Por que Authorization Code e não Google Identity Services (GIS): a página
// roda dentro do iframe do Apps Script, cujo domínio (*.googleusercontent.com)
// é dinâmico e não pode ser cadastrado como "Authorized JavaScript origin".
// O code-flow não depende da origem, só do redirect_uri — que é a URL /exec,
// fixa e registrável. Ver IMPLEMENTACAO_LOGIN_OAUTH.md §2.
//
// Peças principais:
//   authUrlLoginApp_/authUrlLogin_ → monta a URL de autorização (com `state`);
//   authLoginRealRetorno_          → valida o retorno e cria a sessão;
//   authCriarSessao_/authSessao_   → sessão no CacheService (6h);
//   dispatch                       → endpoint único usado pelo cliente;
//   authDiagnostico_               → página de diagnóstico (?page=auth_diag).
//
// CONFIGURAÇÃO NECESSÁRIA (uma vez, no editor do Apps Script):
//   Configurações do projeto → Propriedades do script → adicionar:
//     OAUTH_CLIENT_ID      = <o Client ID .apps.googleusercontent.com>
//     OAUTH_CLIENT_SECRET  = <o Client Secret>
//   E, no Client ID (Google Cloud Console → Credenciais), a URL /exec deste
//   web app precisa estar cadastrada em "URIs de redirecionamento autorizados".
//   `?page=auth_diag` imprime o redirect_uri exato deste deploy para conferir.
// ==========================================

// Endpoints oficiais do Google (fluxo Authorization Code).
const AUTH_ENDPOINT_AUTORIZACAO_ = 'https://accounts.google.com/o/oauth2/v2/auth';
const AUTH_ENDPOINT_TOKEN_        = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT_USERINFO_     = 'https://www.googleapis.com/oauth2/v3/userinfo';
// Só o mínimo necessário: o sistema usa exclusivamente o E-MAIL para
// identificar o membro. O nome exibido vem da aba Membros, não do perfil do
// Google — por isso o escopo `profile` foi removido (pedi-lo daria acesso a
// nome/foto que nunca são lidos, e fazia a tela de consentimento pedir mais do
// que o necessário a cada pessoa que entra).
const AUTH_ESCOPOS_               = 'openid email';

// Lê a configuração OAuth das Propriedades do Script. Retorna também o
// redirect_uri derivado da PRÓPRIA URL do web app (ScriptApp.getService().getUrl()),
// para nunca ficar "hardcoded" nem desalinhado do deploy atual.
function authConfig_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = String(props.getProperty('OAUTH_CLIENT_ID') || '').trim();
  const clientSecret = String(props.getProperty('OAUTH_CLIENT_SECRET') || '').trim();
  let redirectUri = '';
  try { redirectUri = ScriptApp.getService().getUrl() || ''; } catch (e) { redirectUri = ''; }
  return { clientId: clientId, clientSecret: clientSecret, redirectUri: redirectUri };
}

// Monta a URL de autorização do Google. `state` é um valor aleatório guardado
// em cache para conferir na volta (proteção CSRF): a resposta do Google só é
// aceita se trouxer de volta o mesmo `state` que emitimos.
function authUrlLogin_(cfg, state) {
  const params = {
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: AUTH_ESCOPOS_,
    state: state,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account'
  };
  const query = Object.keys(params)
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  return AUTH_ENDPOINT_AUTORIZACAO_ + '?' + query;
}

// TTL de 6h (não 10 min): a URL de login é gerada no CARREGAMENTO da página e
// só é usada quando o usuário clica — que pode ser bem depois (deixou a tela de
// login aberta, ou a sessão expirou horas mais tarde). Com TTL curto, o clique
// batia no Google e voltava para a tela de login sem explicação, exigindo um
// segundo clique. O state continua aleatório e de USO ÚNICO, então a proteção
// contra CSRF não muda — só a janela de validade.
function authGerarState_(prefixo) {
  const state = (prefixo || 'app:') + Utilities.getUuid();
  try { CacheService.getScriptCache().put('oauth_state_' + state, '1', 21600); } catch (e) {}
  return state;
}

function authValidarState_(state) {
  if (!state) return false;
  try {
    const cache = CacheService.getScriptCache();
    const ok = cache.get('oauth_state_' + state) === '1';
    if (ok) cache.remove('oauth_state_' + state); // uso único
    return ok;
  } catch (e) { return false; }
}

// Troca o `code` recebido do Google por um access_token e, com ele, busca o
// e-mail verificado (userinfo). Retorna { ok, email, emailVerificado } ou
// { ok:false, erro }. Nunca lança — devolve o erro para a tela mostrar.
// Não devolve nome: com o escopo `profile` removido, o Google não o envia — e o
// sistema nunca o usou, porque o nome exibido vem da aba Membros.
function authTrocarCodePorPerfil_(cfg, code) {
  try {
    const respToken = UrlFetchApp.fetch(AUTH_ENDPOINT_TOKEN_, {
      method: 'post',
      muteHttpExceptions: true,
      payload: {
        code: code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code'
      }
    });
    const codToken = respToken.getResponseCode();
    const dadosToken = JSON.parse(respToken.getContentText() || '{}');
    if (codToken !== 200 || !dadosToken.access_token) {
      return { ok: false, erro: 'Falha ao trocar o código por token (HTTP ' + codToken + '): ' +
        (dadosToken.error_description || dadosToken.error || 'resposta inesperada') };
    }

    const respUser = UrlFetchApp.fetch(AUTH_ENDPOINT_USERINFO_, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + dadosToken.access_token }
    });
    const codUser = respUser.getResponseCode();
    const perfil = JSON.parse(respUser.getContentText() || '{}');
    if (codUser !== 200 || !perfil.email) {
      return { ok: false, erro: 'Token obtido, mas falha ao ler o perfil (HTTP ' + codUser + ').' };
    }

    return {
      ok: true,
      email: String(perfil.email).trim().toLowerCase(),
      emailVerificado: perfil.email_verified === true || perfil.email_verified === 'true'
    };
  } catch (e) {
    return { ok: false, erro: 'Exceção na troca OAuth: ' + (e && e.message ? e.message : e) };
  }
}

// ==========================================
// FASE 2 — Checagem de membro (pelo e-mail do login) + camada de sessão
// ==========================================
//
// Ainda ADITIVO: nada aqui substitui o `isMembro_`/`Session` atuais. São as
// peças que a Fase 3 vai plugar no fluxo real (quando o `executeAs` virar
// "executar como o dono" e a conta-sistema já for a dona do script).

// O e-mail (verificado) do login é de um membro ativo? Usa a MESMA fonte e a
// MESMA regra do isMembro_ (compara com a coluna Email_Pessoal, via
// membrosParaAuth_), só que recebendo o e-mail de fora em vez de Session.
// Devolve `indisponivel: true` quando a lista vem VAZIA — que na prática nunca
// significa "não há membros", e sim falha transitória de leitura da aba
// (membrosParaAuth_ já tenta 3x e deliberadamente NÃO cacheia lista vazia).
// A distinção importa na tela: sem ela, um membro legítimo receberia
// "sua conta não está cadastrada" — uma afirmação falsa — em vez de um aviso
// de indisponibilidade temporária.
function authEmailEhMembro_(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return { membro: false, nome: '', indisponivel: false };
  const lista = membrosParaAuth_(); // [ [emailFuncional, emailPessoal, nome], ... ]
  if (!lista.length) return { membro: false, nome: '', indisponivel: true };
  for (let i = 0; i < lista.length; i++) {
    if (alvo === lista[i][1]) return { membro: true, nome: lista[i][2] || '', indisponivel: false };
  }
  return { membro: false, nome: '', indisponivel: false };
}

// Cria uma sessão do lado do servidor: um id aleatório aponta para o e-mail
// verificado. O CLIENTE guarda só o id (opaco) e o envia a cada chamada; o
// servidor resolve quem é sem depender do Session. TTL de 6h (renovável no
// uso, na Fase 3). Guardado no ScriptCache — chave aleatória, sem PII na chave.
function authCriarSessao_(email, nome) {
  const sid = Utilities.getUuid();
  const dados = JSON.stringify({ email: String(email || '').trim().toLowerCase(), nome: nome || '', ts: Date.now() });
  try { CacheService.getScriptCache().put('sess_' + sid, dados, 21600); } catch (e) {}
  return sid;
}

// Resolve uma sessão pelo id. Retorna { email, nome } ou null (inexistente/expirada).
function authSessao_(sid) {
  const chave = String(sid || '').trim();
  if (!chave) return null;
  try {
    const bruto = CacheService.getScriptCache().get('sess_' + chave);
    if (!bruto) return null;
    const d = JSON.parse(bruto);
    return { email: d.email, nome: d.nome };
  } catch (e) { return null; }
}

function authEncerrarSessao_(sid) {
  try { CacheService.getScriptCache().remove('sess_' + String(sid || '').trim()); } catch (e) {}
}

// ── Ponte de execução ──────────────────────────────────────────────────────
// Global publicado por dispatch() SÓ durante a execução de uma chamada
// autenticada por sessão. Fora disso é null → usuarioAtual_() usa o Session
// nativo (que só responde para a própria conta-dona).
// Não há risco de uma chamada sobrescrever a identidade de outra: no Apps
// Script cada execução roda em contexto isolado — globais são reinicializadas
// a cada invocação e não são compartilhadas entre execuções simultâneas — e o
// `finally` de dispatch() ainda as limpa ao final.
var __SESSAO_EMAIL__ = null;
var __SESSAO_SID__ = null; // id da sessão em curso — permite a própria função chamada (ex.: authLogout) agir sobre a sessão sem precisar recebê-la como argumento.

// Endpoint ÚNICO pelo qual o cliente chama o servidor quando o app roda "como
// o dono" (aí o Session fica vazio). Valida a sessão, publica o e-mail para
// usuarioAtual_()/isMembro_() enxergarem, e executa a função pública pedida.
//
// Guardas, em ordem:
//  1. sessão válida obrigatória (só é emitida a membro verificado por OAuth);
//  2. recusa nomes privados (terminados em '_') e a própria infraestrutura;
//  3. recusa funções NATIVAS do JavaScript — ver abaixo;
//  4. cada função de destino ainda faz seu próprio isMembro_(), que relê a aba
//     Membros: um membro inativado perde acesso na ação seguinte, mesmo com a
//     sessão ainda dentro das 6h.
function dispatch(sessionToken, fnName, args) {
  const sess = authSessao_(sessionToken);
  if (!sess) throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  if (typeof fnName !== 'string' || /_$/.test(fnName) ||
      fnName === 'dispatch' || fnName === 'doGet' || fnName === 'include_') {
    throw new Error('Função não permitida.');
  }
  const fn = (typeof globalThis !== 'undefined') ? globalThis[fnName] : this[fnName];
  if (typeof fn !== 'function') throw new Error('Função inexistente: ' + fnName);
  // `globalThis` não contém só as funções DESTE projeto: contém também as
  // embutidas do JavaScript — inclusive `eval` e `Function`, que executam texto
  // como código. Sem esta guarda, um membro autenticado poderia chamar
  // dispatch(sid, 'eval', [...]) e rodar código arbitrário COMO A CONTA-SISTEMA
  // (leria o OAUTH_CLIENT_SECRET, alteraria dados sem passar por registrarLog_,
  // apagaria abas) — devolvendo por outra porta exatamente o privilégio que a
  // migração para "executar como o dono" tirou dos membros (o P1).
  // Barrar as NATIVAS resolve porque nenhuma função deste projeto é nativa —
  // por isso não é preciso manter uma lista de nomes permitidos, que quebraria
  // silenciosamente a cada endpoint novo que alguém esquecesse de cadastrar.
  if (/\[native code\]/.test(Function.prototype.toString.call(fn))) {
    throw new Error('Função não permitida.');
  }
  __SESSAO_EMAIL__ = sess.email;
  __SESSAO_SID__ = sessionToken;
  try { return fn.apply(null, Array.isArray(args) ? args : []); }
  finally { __SESSAO_EMAIL__ = null; __SESSAO_SID__ = null; }
}

// Encerra a sessão atual (chamada pelo botão "Sair"). Sempre retorna sucesso —
// mesmo sem sessão em curso, não há nada a fazer, e o cliente já limpa o lado
// dele independentemente da resposta do servidor.
function authLogout() {
  if (__SESSAO_SID__) authEncerrarSessao_(__SESSAO_SID__);
  return { sucesso: true };
}

// ==========================================
// FLUXO REAL de login (usado pelo doGet, não é a rota de teste)
// ==========================================

// URL de início do login OAuth do app (state 'app:'), injetada no cliente para
// o botão do overlay de login. Vazia se o OAuth ainda não foi configurado.
function authUrlLoginApp_() {
  const cfg = authConfig_();
  if (!cfg.clientId || !cfg.clientSecret) return '';
  return authUrlLogin_(cfg, authGerarState_('app:'));
}

// Retorno do OAuth no fluxo REAL (state 'app:'): valida, identifica o membro,
// cria a sessão e serve o app. Não-membro → Acesso Negado (com opção de trocar
// de conta). Qualquer falha volta para a tela de login com a mensagem.
function authLoginRealRetorno_(e) {
  const cfg = authConfig_();
  const p = e.parameter || {};
  // Falhas de estado/troca (ex.: recarregar a URL pós-login, com code/state já
  // usados) caem no porteiro do cliente (casca do app), que reusa a sessão salva
  // ou mostra o login — em vez de forçar uma tela de login e novo OAuth.
  if (p.error) return servirApp_('');
  if (!authValidarState_(p.state)) return servirApp_('');
  const perfil = authTrocarCodePorPerfil_(cfg, p.code);
  if (!perfil.ok) return servirApp_('');
  if (!perfil.emailVerificado) return servirApp_('');

  const m = authEmailEhMembro_(perfil.email);
  // Falha de leitura da aba Membros ≠ pessoa não cadastrada. Dizer "você não
  // está cadastrado" a um membro legítimo por causa de uma instabilidade do
  // Sheets seria informação errada — e geraria chamado de suporte à toa.
  if (m.indisponivel) {
    return authPaginaHtml_('Serviço indisponível',
      authBadgeDanger_() +
      '<p>Não foi possível verificar seu cadastro agora. Isso costuma ser temporário — tente novamente em alguns instantes.</p>' +
      authBtnSec_(cfg.redirectUri, 'Tentar novamente'), 'perigo');
  }
  if (!m.membro) {
    return authPaginaHtml_('Acesso negado',
      authBadgeDanger_() +
      '<p>A conta <span class="auth-email">' + authEsc_(perfil.email) + '</span> ainda não está cadastrada. Solicite acesso ao gestor da qualidade.</p>' +
      authBtnSec_(cfg.redirectUri, 'Entrar com outra conta'), 'perigo');
  }
  const sid = authCriarSessao_(perfil.email, m.nome);
  return servirApp_(sid); // serve o app já autenticado, com o id da sessão injetado
}

// ── Diagnóstico de configuração (?page=auth_diag) — SOMENTE LEITURA ────────
// Substitui as antigas rotas de teste (?page=auth_test e ?page=auth_whoami),
// removidas por dois motivos: criavam sessão para QUALQUER conta Google —
// inclusive de quem não é membro — e passavam o id da sessão na própria URL
// (que fica no histórico do navegador e em logs de proxy). Elas cumpriram o
// papel de validar o fluxo OAuth antes do go-live; o que restou de útil está
// aqui. Esta página NÃO inicia login, NÃO cria sessão e NÃO aceita `sid`:
// apenas informa o que costuma quebrar na configuração — em especial o
// redirect_uri deste deploy, que precisa estar cadastrado no Client ID (a
// causa nº 1 de falha quando se publica uma implantação nova, com URL nova).
function authDiagnostico_() {
  const cfg = authConfig_();
  const item = function (rotulo, ok) {
    return '<p>' + (ok ? '<span class="ok">✓</span>' : '<span class="err">✗</span>') +
      ' ' + authEsc_(rotulo) + '</p>';
  };
  return authPaginaHtml_('Diagnóstico do login',
    item('OAUTH_CLIENT_ID configurado', !!cfg.clientId) +
    item('OAUTH_CLIENT_SECRET configurado', !!cfg.clientSecret) +
    authBlocoRedirect_(cfg.redirectUri));
}

// Botão secundário (contorno) no padrão do sistema.
function authBtnSec_(url, texto) {
  return '<a class="btn-sec" target="_top" rel="noopener" href="' + authEsc_(url) + '">' + authEsc_(texto) + '</a>';
}

// Selo circular de alerta para a tela de Acesso Negado.
function authBadgeDanger_() {
  return '<div class="auth-badge"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'stroke="#D8483A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>';
}

// Bloco discreto com o redirect_uri (só nas telas de teste/erro), para conferir
// se bate com o cadastrado no Client ID (a causa nº 1 de erro é divergência).
function authBlocoRedirect_(redirectUri) {
  return '<p class="auth-note">redirect_uri deste deploy:<br><code>' +
    authEsc_(redirectUri || '(indisponível)') + '</code></p>';
}

function authEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Cabeçalho de marca compartilhado por todas as telas de auth.
function authMarca_() {
  return '<div class="auth-brand"><div class="auth-logo">SGQ</div>' +
    '<h2>Sistema de Gestão da Qualidade</h2>' +
    '<span>CEQP / SUCOAS · SES/DF</span></div>';
}

// Casca visual das telas de auth: fonte Inter, tokens do sistema (tema claro/
// escuro com anti-flash antes do primeiro paint) e cartão centralizado.
// `tom`: 'perigo' | 'ok' | undefined (neutro) tinge o título.
function authPaginaHtml_(titulo, corpoHtml, tom) {
  const tomClasse = tom === 'perigo' ? ' tom-perigo' : (tom === 'ok' ? ' tom-ok' : '');
  const antiFlash = '(function(){try{var t=localStorage.getItem("sgq-tema");' +
    'if(t!=="dark"&&t!=="light"){t=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";}' +
    'var r=document.documentElement;if(t==="dark")r.setAttribute("data-theme","dark");' +
    'r.style.colorScheme=t;r.style.backgroundColor=(t==="dark")?"#131820":"#f3f4f6";}catch(e){}})();';
  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>SGQ · CEQP</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<script>' + antiFlash + '</script><style>' + authCss_() + '</style></head><body>' +
    '<div class="auth-wrap"><main class="auth-card' + tomClasse + '">' + authMarca_() +
    '<h1 class="auth-title">' + authEsc_(titulo) + '</h1>' +
    '<div class="auth-body">' + corpoHtml + '</div></main></div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('SGQ · CEQP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// CSS autossuficiente das telas de auth, espelhando os tokens do CSS.html
// (claro e escuro). Não depende do CSS do app (estas telas rodam fora dele).
function authCss_() {
  return (
    ':root{--bg-app:#f3f4f6;--bg-card:#fff;--bg-panel:#f9fafb;--bg-hover:#f3f4f6;' +
    '--text-main:#030712;--text-secondary:#4b5563;--text-muted:#6b7280;--text-inverse:#fff;' +
    '--border-color:#e5e7eb;--border-strong:#d1d5db;--primary:#030712;' +
    '--danger-text:#791E15;--danger-bg:#FCE1DE;--danger-border:#F3B8B0;' +
    '--success-text:#157965;--shadow:0 12px 28px rgba(3,7,18,.12)}' +
    ':root[data-theme="dark"]{--bg-app:#131820;--bg-card:#1c2129;--bg-panel:#212633;--bg-hover:#2a3240;' +
    '--text-main:#e6e8eb;--text-secondary:#aab3c0;--text-muted:#8b94a3;--text-inverse:#131820;' +
    '--border-color:#2a3240;--border-strong:#3a4453;--primary:#e6e8eb;' +
    '--danger-text:#f0b3aa;--danger-bg:#3a1f1c;--danger-border:#5e2c26;' +
    '--success-text:#8fe0cd;--shadow:0 12px 28px rgba(0,0,0,.45)}' +
    '*{box-sizing:border-box}' +
    'body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'background:var(--bg-app);color:var(--text-main);-webkit-font-smoothing:antialiased}' +
    '.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}' +
    '.auth-card{width:100%;max-width:400px;background:var(--bg-card);border:1px solid var(--border-color);' +
    'border-radius:16px;box-shadow:var(--shadow);padding:34px 30px;text-align:center}' +
    '.auth-brand{display:flex;flex-direction:column;align-items:center;gap:9px;margin-bottom:22px}' +
    '.auth-logo{width:52px;height:52px;border-radius:14px;background:var(--primary);color:var(--text-inverse);' +
    'display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:.5px}' +
    '.auth-brand h2{margin:0;font-size:15px;font-weight:700;letter-spacing:.2px}' +
    '.auth-brand span{font-size:11px;color:var(--text-muted);font-weight:500}' +
    '.auth-title{font-size:20px;font-weight:700;margin:0 0 10px}' +
    '.tom-perigo .auth-title{color:var(--danger-text)}.tom-ok .auth-title{color:var(--success-text)}' +
    '.auth-body{font-size:13.5px;color:var(--text-secondary);line-height:1.55}.auth-body p{margin:8px 0}' +
    '.auth-email,.email{display:inline-block;font-size:15px;font-weight:700;color:var(--text-main);word-break:break-all}' +
    '.btn-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:20px;' +
    'padding:12px 16px;background:#fff;color:#1f1f1f;border:1px solid var(--border-strong);border-radius:8px;' +
    'font-family:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;transition:box-shadow .2s,background .2s}' +
    '.btn-google:hover{box-shadow:0 1px 3px rgba(3,7,18,.12);background:#f8f9fa}' +
    '.btn-sec,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;' +
    'padding:11px 20px;background:transparent;color:var(--text-main);border:1px solid var(--border-strong);' +
    'border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s}' +
    '.btn-sec:hover,.btn:hover{background:var(--bg-hover)}' +
    '.auth-badge{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
    'margin:0 auto 14px;background:var(--danger-bg);border:1px solid var(--danger-border)}' +
    '.auth-note,.small{font-size:11.5px;color:var(--text-muted);margin-top:16px;line-height:1.5}' +
    '.ok{color:var(--success-text);font-weight:600}.err{color:var(--danger-text);font-weight:600}' +
    'hr,.auth-sep{border:none;border-top:1px solid var(--border-color);margin:20px 0}' +
    'code{background:var(--bg-panel);border:1px solid var(--border-color);padding:2px 6px;border-radius:6px;font-size:11px;word-break:break-all}'
  );
}
