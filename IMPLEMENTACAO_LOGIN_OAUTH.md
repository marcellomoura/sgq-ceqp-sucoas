# Implementação: Login OAuth ("Entrar com Google") + Executar como o Dono

> **Documento à parte**, dedicado exclusivamente à migração de autenticação. Não substitui a `DOCUMENTACAO.md` geral.
>
> Serve a dois usos: as **§§1–19** são o registro do que foi feito e **por quê** (motivação, arquitetura, decisões, segurança, limites); a **[§20](#20-guia-de-replicação-em-outro-projeto)** é o guia prático de **como refazer** isto em outro projeto Apps Script, na ordem certa e com o que precisa ser adaptado.
>
> **Origem:** escrito em 2026-08-07 durante a implementação no projeto de teste (script `1UkE2Oty…`).
>
> **Aplicado em produção em 2026-08-08** (script `1VHG3zsv…`, container-bound à planilha de produção), seguindo o roteiro da §20. Commits `2889222` + merge `c457629` no `master`. O que divergiu da receita está registrado na **[§21](#21-registro-da-aplicação-em-produção-2026-08-08)**.

---

## Índice

1. [O problema que motivou a mudança (P1)](#1-o-problema-que-motivou-a-mudança-p1)
2. [Por que OAuth code-flow, e não Google Identity Services (GIS)](#2-por-que-oauth-code-flow-e-não-google-identity-services-gis)
3. [Visão geral da arquitetura](#3-visão-geral-da-arquitetura)
4. [Modelo de execução: antes e depois](#4-modelo-de-execução-antes-e-depois)
5. [Passo a passo — criar o OAuth Client ID no Google Cloud Console](#5-passo-a-passo--criar-o-oauth-client-id-no-google-cloud-console)
6. [Configuração no Apps Script](#6-configuração-no-apps-script)
7. [Arquivos alterados/criados — referência completa](#7-arquivos-alteradoscriados--referência-completa)
8. [Fluxo de login, ponta a ponta](#8-fluxo-de-login-ponta-a-ponta)
9. [Sessão: criação, persistência e expiração](#9-sessão-criação-persistência-e-expiração)
10. [O botão "Sair" (logout)](#10-o-botão-sair-logout)
11. [Telas de login e Acesso Negado](#11-telas-de-login-e-acesso-negado)
12. [O iframe do Apps Script e seus impactos](#12-o-iframe-do-apps-script-e-seus-impactos)
13. [Rota de diagnóstico](#13-rota-de-diagnóstico)
14. [Segurança — o que foi avaliado](#14-segurança--o-que-foi-avaliado)
15. [Limites e cotas do Google (OAuth/Apps Script)](#15-limites-e-cotas-do-google-oauthapps-script)
16. [Impacto em performance](#16-impacto-em-performance)
17. [Checklist de publicação / rollback](#17-checklist-de-publicação--rollback)
18. [Pendências conhecidas](#18-pendências-conhecidas)
19. [Pós-migração: a autorização OAuth antiga e o compartilhamento da planilha](#19-pós-migração-a-autorização-oauth-antiga-e-o-compartilhamento-da-planilha)
20. [**Guia de replicação em outro projeto**](#20-guia-de-replicação-em-outro-projeto)
21. [Registro da aplicação em produção (2026-08-08)](#21-registro-da-aplicação-em-produção-2026-08-08)

---

## 1. O problema que motivou a mudança (P1)

Antes desta implementação, o deploy do web app usava:

```json
"webapp": { "executeAs": "USER_ACCESSING", "access": "ANYONE" }
```

Sob `USER_ACCESSING`, o código roda **como a conta Google de cada membro** que abre o sistema. Consequência: **todo membro precisa ter acesso de edição à planilha crua** (senão o código, "sendo" aquele membro, não conseguiria ler/gravar). Esse era o risco **P1**, documentado desde a auditoria original: qualquer membro podia abrir a planilha diretamente no Google Sheets — inclusive editar a aba `Membros` para se autopromover — contornando toda a lógica de autorização do app.

**Migrar para `USER_DEPLOYING`** ("executar como o dono") resolve o P1: o código passa a rodar sempre como uma **conta-sistema** dedicada, e os membros deixam de precisar de qualquer acesso à planilha. Só que essa troca tem um efeito colateral direto: `Session.getActiveUser().getEmail()` **passa a retornar vazio** para qualquer pessoa que não seja a própria conta-sistema (é uma proteção de privacidade do Apps Script). O sistema perde a única fonte de identidade que tinha.

**A solução:** substituir essa identidade "de graça" por um **login explícito** — o membro autentica com a própria conta Google, o Google atesta o e-mail (verificado, não digitado), e o servidor usa esse e-mail para tudo que antes vinha do `Session`.

---

## 2. Por que OAuth code-flow, e não Google Identity Services (GIS)

Duas formas de "Entrar com Google" foram avaliadas:

| | **GIS** (não usado) | **OAuth 2.0 Authorization Code Flow** (implementado) |
|---|---|---|
| Onde a identidade nasce | No navegador, via botão JS (`gsi/client`), devolve um ID token (JWT) | No servidor, trocando um `code` pelo perfil |
| O que o Google valida | A **origem JavaScript** da página | O **`redirect_uri`** cadastrado |
| Funciona dentro do Apps Script? | **Não** — a página roda num iframe `*.googleusercontent.com`, origem **dinâmica e não registrável** | **Sim** — o `redirect_uri` é a própria URL `/exec`, **fixa e registrável** |
| Validação de assinatura | Exigiria verificar JWT RS256 (Apps Script não tem isso nativamente) | Servidor só chama o endpoint oficial do Google (`tokeninfo`/`token` + `userinfo`) |

**Motivo decisivo:** o web app do Apps Script é sempre servido dentro de um `<iframe>` hospedado em `*.googleusercontent.com` (ver [§12](#12-o-iframe-do-apps-script-e-seus-impactos)). Essa origem é gerada dinamicamente pelo Google e **não pode ser cadastrada** como "Authorized JavaScript origin" — o que inviabiliza o GIS. O OAuth code-flow contorna isso porque não depende da origem da página, só do `redirect_uri` (a URL `/exec`, que é estável).

---

## 3. Visão geral da arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (dentro do iframe googleusercontent.com)                  │
│                                                                        │
│  JS_Auth_Cliente.html                                                 │
│   • porteiro de sessão (sessionStorage)                               │
│   • srv() — substitui google.script.run                               │
│   • overlay de login / sessão expirada                                │
│   • botão "Sair"                                                      │
└───────────────────────────┬────────────────────────────────────────┘
                             │ dispatch(sid, fnName, args)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  APPS SCRIPT (roda como a CONTA-SISTEMA — USER_DEPLOYING)             │
│                                                                        │
│  Código.js            doGet() → login OU servirApp_()                 │
│                        usuarioAtual_() → sessão OU Session nativo      │
│                                                                        │
│  Auth_OAuth.js         dispatch() — endpoint único                    │
│                        authTrocarCodePorPerfil_() → chama o Google    │
│                        authCriarSessao_/authSessao_ → CacheService     │
│                        isMembro_() (Código.js) — MESMA regra de antes  │
└───────────────────────────┬────────────────────────────────────────┘
                             │ UrlFetchApp (token + userinfo)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GOOGLE (accounts.google.com / oauth2.googleapis.com)                 │
│   • autentica o usuário                                               │
│   • devolve code → servidor troca por access_token → busca e-mail     │
└─────────────────────────────────────────────────────────────────────┘
```

**Princípio de design em toda a implementação:** cada peça foi construída para ser **retrocompatível** com o modelo antigo. Enquanto `executeAs` fosse `USER_ACCESSING`, nada do código novo alterava o comportamento existente — o `sid` global ficava vazio e todo o roteamento caía no caminho de sempre. Isso permitiu testar cada camada isoladamente (por uma rota de teste temporária, depois removida — ver [§13.1](#131-rotas-de-teste-removidas-histórico)) antes de acoplar ao fluxo real.

---

## 4. Modelo de execução: antes e depois

| | **Antes** (`USER_ACCESSING`) | **Depois** (`USER_DEPLOYING`) |
|---|---|---|
| O código roda como | Cada membro que acessa | Sempre a **conta-sistema** (quem publicou o deploy) |
| Quem precisa de acesso à planilha | **Todos os membros** (o P1) | Só a conta-sistema |
| Origem da identidade | `Session.getActiveUser().getEmail()` — de graça | Login OAuth explícito → sessão no servidor |
| Prompt de autorização do Apps Script | Cada membro via, na primeira vez | Só a conta-sistema autorizou, uma vez |
| Remetente dos e-mails (`MailApp.sendEmail`) | O gmail pessoal de quem clicou "Enviar" | A conta-sistema (remetente único e institucional) |
| Logs de auditoria (`registrarLog_`) | Atribuídos ao membro via `Session` | Atribuídos ao membro via sessão OAuth (mesma granularidade) |

A troca do `executeAs` está em [`appsscript.json`](appsscript.json):

```json
"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE" }
```

> **Importante:** quem **publica** a implantação (Implantar → Gerenciar implantações → Nova versão) determina quem é "o dono" em `USER_DEPLOYING`. Publicar logado com a conta errada faz o app rodar como essa conta — por isso toda publicação de produção deve ser feita **logado na conta-sistema**.

---

## 5. Passo a passo — criar o OAuth Client ID no Google Cloud Console

> Faça isso **logado na conta-sistema** (a conta dona do projeto/script), não numa conta pessoal.

### 5.1 Abrir o Console
Acesse [console.cloud.google.com](https://console.cloud.google.com).

### 5.2 Criar (ou usar) um projeto
"Selecionar projeto" → "Novo projeto". Use um projeto **standard** (criado explicitamente aqui), não o projeto oculto que o Apps Script gera sozinho — isso facilita reassociar o Client ID a outro script Apps Script no futuro, sem recriar nada.

### 5.3 Configurar a Tela de Consentimento OAuth
Menu → **APIs e serviços → Tela de permissão OAuth** (também aparece como "Google Auth Platform").
- **Tipo de usuário:** **Externo** (os membros usam contas @gmail pessoais).
- **Nome do app:** ex. `SGQ · CEQP`.
- **E-mail de suporte / do desenvolvedor:** a própria conta-sistema.
- **Escopos:** adicionar apenas `openid` e `.../auth/userinfo.email`. São **básicos/não sensíveis** e **não exigem** processo de verificação do Google, independentemente do número de usuários.
  > **Não adicione `.../auth/userinfo.profile`.** O sistema identifica o membro **só pelo e-mail** — o nome exibido vem da aba `Membros`, nunca do perfil do Google. Pedir `profile` daria acesso a nome e foto que nunca são lidos e faria a tela de consentimento pedir mais do que o necessário a cada pessoa. (Esta implementação chegou a usá-lo por hábito; foi removido depois de verificar que o dado não era consumido em lugar nenhum.)
- **Publicação:** clique em **"Publicar app"** (Publish app). Como os escopos são básicos, a publicação é direta — isso evita o teto de 100 usuários do modo de teste.

### 5.4 Criar o Client ID
Menu → **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
- **Tipo de aplicativo:** **Aplicativo da Web**.
- **Nome:** ex. `SGQ Web`.
- **URIs de redirecionamento autorizados:** cole a **URL `/exec`** do web app publicado. Este é o campo mais importante — precisa ser **idêntico** ao valor que `ScriptApp.getService().getUrl()` devolve (o próprio sistema imprime esse valor em `?page=auth_diag`, ver [§13](#13-rota-de-diagnóstico)).
- Clique em **Criar**. Anote o **Client ID** e o **Client Secret** exibidos (o Secret não é reexibido facilmente depois).

> **Ordem prática:** o `redirect_uri` só existe depois de o web app ser publicado ao menos uma vez. Publique primeiro (mesmo que com o login ainda não configurado), pegue a URL `/exec`, depois volte aqui e cadastre-a.

### 5.5 Associar o projeto Apps Script a este projeto Cloud
No editor do Apps Script → **⚙ Configurações do projeto** → seção **"Projeto do Google Cloud Platform (GCP)"** → **Alterar projeto** → cole o **número do projeto** (visível na página inicial do Console).

### 5.6 Múltiplos ambientes / múltiplos scripts com o mesmo Client ID
Um único Client ID pode ter **vários** `redirect_uri` cadastrados simultaneamente. Isso permite:
- Ter uma `/exec` de teste e uma de produção no mesmo Client ID (basta cadastrar as duas).
- Reaproveitar o mesmo Client ID em outro projeto Apps Script no futuro — só adicionar a nova `/exec` à lista, sem recriar credenciais.

O que **não** é compartilhável por Client ID individual, mas sim por **projeto Cloud**: a tela de consentimento (nome do app exibido no login). Para nomes de app diferentes, use projetos Cloud diferentes.

---

## 6. Configuração no Apps Script

Depois de criar o Client ID, registre as credenciais **nas Propriedades do Script** (nunca no código-fonte):

Editor do Apps Script → **⚙ Configurações do projeto → Propriedades do script → Adicionar propriedade do script**:

| Propriedade | Valor |
|---|---|
| `OAUTH_CLIENT_ID` | o Client ID (`...apps.googleusercontent.com`) |
| `OAUTH_CLIENT_SECRET` | o Client Secret |

Essas propriedades são lidas por `authConfig_()` em [`Auth_OAuth.js`](Auth_OAuth.js):

```js
function authConfig_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = String(props.getProperty('OAUTH_CLIENT_ID') || '').trim();
  const clientSecret = String(props.getProperty('OAUTH_CLIENT_SECRET') || '').trim();
  let redirectUri = '';
  try { redirectUri = ScriptApp.getService().getUrl() || ''; } catch (e) { redirectUri = ''; }
  return { clientId, clientSecret, redirectUri };
}
```

O `redirectUri` **nunca** é fixado manualmente — é sempre derivado de `ScriptApp.getService().getUrl()`, a URL real do deploy ativo. Isso evita divergência entre o que o Client ID espera e o que o sistema efetivamente usa.

Nenhum outro ajuste manual é necessário: o escopo de rede (`UrlFetchApp`, usado para chamar o Google) é **inferido automaticamente** pelo uso — não é preciso declarar `oauthScopes` no `appsscript.json`.

---

## 7. Arquivos alterados/criados — referência completa

| Arquivo | Tipo | O que contém |
|---|---|---|
| [`Auth_OAuth.js`](Auth_OAuth.js) | **Novo** | Todo o backend de autenticação: troca de código OAuth, sessão, `dispatch`, telas server-side (Acesso negado / Serviço indisponível) e a rota de diagnóstico |
| [`JS_Auth_Cliente.html`](JS_Auth_Cliente.html) | **Novo** | Porteiro de sessão no cliente, `srv()` (substituto de `google.script.run`), overlay de login/sessão expirada, botão "Sair", ilustração SVG |
| [`Código.js`](Código.js) | Alterado | `doGet()` roteia login vs. app; `servirApp_()` injeta variáveis de sessão no template; `usuarioAtual_()` passa a checar a sessão antes do `Session` nativo |
| [`Index.html`](Index.html) | Alterado | Injeta `window.SGQ_SID`, `SGQ_AUTH`, `SGQ_LOGIN_URL`, `SGQ_APP_URL`; inclui `JS_Auth_Cliente`; botão `#btn-logout` no rodapé da sidebar (oculto por padrão) |
| `JS_Kanban.html`, `JS_Riscos.html`, `JS_VisitasTecnicas.html`, `JS_Unidades.html`, `JS_Capacitacoes.html`, `JS_Documentos.html`, `JS_Pessoas.html`, `JS_Utilitarios.html` | Alterados | Todas as ~49 ocorrências de `google.script.run` trocadas por `srv()` |
| `appsscript.json` | Alterado | `executeAs`: `USER_ACCESSING` → `USER_DEPLOYING` |
| `.clasp.json` | Alterado | `scriptId` atualizado para o projeto atual |

---

## 8. Fluxo de login, ponta a ponta

### 8.1 Requisição inicial (`doGet`, em [`Código.js`](Código.js))

```js
function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};

  if (p.page === 'auth_diag') return authDiagnostico_();

  if ((p.code || p.error) && p.state && String(p.state).indexOf('app:') === 0) {
    return authLoginRealRetorno_(e);
  }
  if (p.code || p.error) return servirApp_('');

  if (isMembro_()) return servirApp_('');

  let temEmailNativo = false;
  try { temEmailNativo = !!Session.getActiveUser().getEmail(); } catch (e2) {}
  if (temEmailNativo) {
    return HtmlService.createHtmlOutput('<div ...>Acesso Negado</div>');
  }
  return servirApp_(''); // Session vazio → casca do app; o cliente mostra o overlay de login
}
```

Lógica, em ordem:
1. **Rotas de teste** (`?page=auth_*`) são atendidas à parte — nunca interferem no fluxo real.
2. **Retorno do OAuth real** (o `state` gerado por este sistema sempre começa com `app:`) → processado por `authLoginRealRetorno_`.
3. **`isMembro_()` continua sendo a mesma função de sempre** — hoje ela primeiro tenta o `Session` nativo (funciona para a própria conta-sistema) e, via `usuarioAtual_()`, também aceita a identidade vinda da sessão OAuth quando ela está em curso (ver [§8.4](#84-usuarioatual_-e-ismembro_-inalterados-na-regra)).
4. Se não há membro nem identidade nativa (caso normal de um membro comum, sob `USER_DEPLOYING`), a **casca do app** é servida mesmo assim — quem decide mostrar o login é o **cliente** (porteiro em `JS_Auth_Cliente.html`), não o servidor. Essa escolha existe porque só o cliente sabe se já existe uma sessão salva no navegador daquela aba (ver [§9](#9-sessão-criação-persistência-e-expiração)).

### 8.2 Início do login (clique em "Entrar com Google")

A URL de autorização é montada por `authUrlLogin_`:

```js
function authUrlLogin_(cfg, state) {
  const params = {
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email',   // sem `profile`: o nome vem da aba Membros — ver §5.3
    state: state,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account'
  };
  // ...monta a query string...
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + query;
}
```

- **`state`**: gerado por `authGerarState_('app:')` — um UUID prefixado, guardado no `CacheService` por **6h**, de **uso único** (removido ao ser validado). Protege contra CSRF: a volta só é aceita se o `state` bater com um que o próprio servidor emitiu. O TTL era de 10 min e foi ampliado: a URL de login é montada no **carregamento da página**, mas só é usada quando o usuário clica — o que pode ser bem depois (tela de login aberta há um tempo, ou sessão expirando horas mais tarde). Com TTL curto, o clique ia ao Google e voltava para a tela de login sem explicação, exigindo um segundo clique.
- **`prompt: select_account`**: sempre mostra o seletor de contas do Google, útil em computadores compartilhados.
- O link usa **`target="_top"`** — obrigatório, porque a página de login do Google **não abre dentro do iframe** do Apps Script (bloqueio `X-Frame-Options` do próprio Google). O clique precisa levar a **janela inteira** para fora do iframe.

### 8.3 Retorno do Google (`authLoginRealRetorno_`)

```js
function authLoginRealRetorno_(e) {
  const cfg = authConfig_();
  const p = e.parameter || {};
  if (p.error) return servirApp_('');
  if (!authValidarState_(p.state)) return servirApp_('');
  const perfil = authTrocarCodePorPerfil_(cfg, p.code);
  if (!perfil.ok) return servirApp_('');
  if (!perfil.emailVerificado) return servirApp_('');

  const m = authEmailEhMembro_(perfil.email);
  if (!m.membro) {
    return authPaginaHtml_('Acesso negado', /* ... */, 'perigo');
  }
  const sid = authCriarSessao_(perfil.email, m.nome);
  return servirApp_(sid);
}
```

- Falhas de estado/troca (ex.: usuário recarregou a URL de retorno, `code`/`state` já consumidos) **não** mostram uma tela de erro isolada — caem de volta na casca do app (`servirApp_('')`), e o porteiro do cliente decide se reusa uma sessão salva ou mostra o login. Isso evita becos sem saída na navegação.
- `authTrocarCodePorPerfil_` faz duas chamadas `UrlFetchApp` (troca do `code` por `access_token`, depois `access_token` por perfil) contra os endpoints oficiais do Google — nunca contra um serviço de terceiros.
- `authEmailEhMembro_` usa a **mesma fonte e mesma regra** que `isMembro_` já usava: compara o e-mail contra a coluna `Email_Pessoal` da aba `Membros`, via `membrosParaAuth_()` (cache de 6h). Nenhuma lógica de autorização nova foi criada — só passou a receber o e-mail de fora (do login) em vez de `Session`.
- **Não-membro:** tela de "Acesso negado" (server-side), com a conta exibida e um botão para tentar com outra conta.
- **Membro:** `authCriarSessao_` grava a sessão no cache e `servirApp_(sid)` serve o app já com o `sid` embutido na página.

### 8.4 `usuarioAtual_()` e `isMembro_()` — inalterados na regra

```js
function usuarioAtual_() {
  try { if (typeof __SESSAO_EMAIL__ !== 'undefined' && __SESSAO_EMAIL__) return __SESSAO_EMAIL__; } catch (e) {}
  try { return Session.getActiveUser().getEmail() || 'Sistema'; } catch (e) { return 'Sistema'; }
}
```

`__SESSAO_EMAIL__` só é diferente de vazio **durante** a execução de uma chamada validada por `dispatch()` (ver [§8.5](#85-dispatch--o-endpoint-único)). Fora disso, cai no `Session` nativo — comportamento idêntico ao de antes da migração. **Nenhuma das ~50 checagens `isMembro_()` espalhadas pelos módulos foi tocada** — elas continuam chamando a mesma função, que agora simplesmente enxerga também a identidade vinda do login.

### 8.5 `dispatch` — o endpoint único

```js
function dispatch(sessionToken, fnName, args) {
  const sess = authSessao_(sessionToken);
  if (!sess) throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  if (typeof fnName !== 'string' || /_$/.test(fnName) ||
      fnName === 'dispatch' || fnName === 'doGet' || fnName === 'include_') {
    throw new Error('Função não permitida.');
  }
  const fn = (typeof globalThis !== 'undefined') ? globalThis[fnName] : this[fnName];
  if (typeof fn !== 'function') throw new Error('Função inexistente: ' + fnName);
  __SESSAO_EMAIL__ = sess.email;
  __SESSAO_SID__ = sessionToken;
  try { return fn.apply(null, Array.isArray(args) ? args : []); }
  finally { __SESSAO_EMAIL__ = null; __SESSAO_SID__ = null; }
}
```

É o **único** endpoint que o cliente chama quando está em modo OAuth (`srv()` decide isso automaticamente). Recebe o id da sessão, o nome da função de verdade a executar, e os argumentos. Valida a sessão, publica a identidade nas variáveis globais (lidas por `usuarioAtual_`), executa a função-alvo e limpa as globais no `finally` (mesmo em caso de exceção). Recusa nomes privados (sufixo `_`) e as próprias funções de infraestrutura (`dispatch`, `doGet`, `include_`).

> Recusa também funções **nativas** do JavaScript (`eval`, `Function`) — sem isso, um membro autenticado poderia executar código arbitrário como a conta-sistema. Ver [§14.1](#141--corrigido--execução-de-código-arbitrário-via-dispatch).

---

## 9. Sessão: criação, persistência e expiração

### 9.1 No servidor (`CacheService`)

```js
function authCriarSessao_(email, nome) {
  const sid = Utilities.getUuid();
  const dados = JSON.stringify({ email: String(email||'').trim().toLowerCase(), nome: nome||'', ts: Date.now() });
  try { CacheService.getScriptCache().put('sess_' + sid, dados, 21600); } catch (e) {}
  return sid;
}
```

- Chave: `sess_<uuid>` — aleatória, sem PII no nome da chave.
- Valor: e-mail, nome e timestamp, em JSON.
- **TTL: 21.600 segundos = 6 horas**, o teto do `CacheService` do Apps Script. É um prazo **fixo desde a criação**, não deslizante — não se renova a cada ação.

### 9.2 No navegador (`sessionStorage`)

Depois do login, o servidor injeta o `sid` na página (`window.SGQ_SID`). O porteiro em `JS_Auth_Cliente.html` salva esse valor:

```js
if (window.SGQ_SID) {
  try { sessionStorage.setItem('sgq-sid', window.SGQ_SID); } catch (e) {}
  try { if (location.search) history.replaceState(null, '', location.pathname); } catch (e) {}
  return;
}
```

Em cargas seguintes da mesma aba (recarregar a página), o `sid` salvo é reaproveitado **sem novo login**:

```js
if (window.SGQ_AUTH === 'oauth') {
  var s = '';
  try { s = sessionStorage.getItem('sgq-sid') || ''; } catch (e) {}
  if (s) { window.SGQ_SID = s; } else { authMostrarLogin_(); }
}
```

**Por que `sessionStorage` e não `localStorage`:** sobrevive a recarregar a página, mas **some ao fechar a aba** — equilíbrio entre conveniência (não repetir login a cada F5) e segurança (não persistir indefinidamente num computador compartilhado).

### 9.3 Expiração

Quando uma chamada ao servidor encontra uma sessão inexistente/expirada, `dispatch` lança `"Sessão inválida ou expirada..."`. O `srv()` no cliente intercepta essa mensagem especificamente:

```js
runner = runner.withFailureHandler(function (err) {
  var msg = (err && err.message) ? err.message : String(err);
  if (/sess[aã]o inv[aá]lida|expirad/i.test(msg)) { authSessaoExpirada_(); return; }
  if (falha) falha(err);
});
```

`authSessaoExpirada_()` limpa o `sessionStorage` e mostra o overlay "Sessão expirada" com botão "Entrar novamente" — em vez de um erro cru.

### 9.4 Por que recarregar não usa `location.reload()`

Ponto de atenção documentado no próprio código: `location.reload()` recarregaria a URL **do iframe** (um endereço de conteúdo interno `googleusercontent.com`), que **não é servível isoladamente** e resulta em tela branca. A correção usa `window.top.location.href` para navegar a **janela real** de volta para a `/exec` — mesmo mecanismo do botão de login (`target="_top"`), que sempre reinvoca `doGet` do zero. Essa é a razão de existir `window.SGQ_APP_URL` (injetado por `servirApp_`).

---

## 10. O botão "Sair" (logout)

### 10.1 Onde aparece

`#btn-logout`, em [`Index.html`](Index.html), no rodapé da sidebar, ao lado do alternador de tema. **Oculto por padrão** (`style="display:none"`) e só revelado quando `window.SGQ_AUTH === 'oauth'`:

```js
if (window.SGQ_AUTH === 'oauth') authWireLogout_();
```

**Por que não aparece para o dono da conta-sistema:** quando a própria conta-sistema abre o app, `Session.getActiveUser()` funciona nativamente (não há restrição de privacidade contra si mesma) → `SGQ_AUTH` fica vazio → não existe uma sessão nossa para encerrar. Um "Sair" nesse caso não teria efeito real (a identidade vem do login Google do navegador, não de algo que o app controla) — deslogar de verdade exigiria encerrar a sessão Google inteira do navegador, o que foi avaliado e **deliberadamente não implementado** (ver [§18](#18-pendências-conhecidas)).

### 10.2 Mecânica do clique

```js
function authSair_() {
  var btn = document.getElementById('btn-logout');
  if (btn) btn.disabled = true;
  var sidAtual = window.SGQ_SID;
  try { sessionStorage.removeItem('sgq-sid'); } catch (e) {}
  window.SGQ_SID = '';
  if (sidAtual && typeof google !== 'undefined' && google.script && google.script.run) {
    try { google.script.run.withFailureHandler(function () {}).dispatch(sidAtual, 'authLogout', []); } catch (e) {}
  }
  var destino = window.SGQ_APP_URL || '';
  try {
    if (window.top && window.top !== window) { window.top.location.href = destino || '/'; }
    else { location.href = destino || location.pathname; }
  } catch (e) { location.reload(); }
}
```

Ordem de execução — **local primeiro, servidor depois, sem bloquear**:
1. Limpa `sessionStorage` e a variável em memória **imediatamente** (não espera rede).
2. Dispara `authLogout` no servidor em modo "fire-and-forget" (`withFailureHandler` vazio — não trava a saída se a chamada falhar/estiver offline).
3. Navega `window.top` de volta para a `/exec` — o mesmo mecanismo do login, evitando a tela branca do `location.reload()`.

No servidor, `authLogout()` usa o `__SESSAO_SID__` publicado pelo próprio `dispatch` durante a chamada, sem precisar recebê-lo como argumento redundante:

```js
function authLogout() {
  if (__SESSAO_SID__) authEncerrarSessao_(__SESSAO_SID__);
  return { sucesso: true };
}
```

---

## 11. Telas de login e Acesso Negado

Duas superfícies visuais, ambas seguindo os tokens do `CSS.html` (cores, tipografia Inter, tema claro/escuro):

### 11.1 Overlay no cliente (`JS_Auth_Cliente.html`) — fluxo normal
Layout de **duas colunas**: card de login à esquerda, ilustração SVG à direita (painel de indicadores com gráfico de barras, selo de aprovação e cartão de KPI — tudo colorido via `--ill-*`, tokens exclusivos deste componente que seguem `--accent`/superfícies do tema). É este overlay que aparece tanto para **login inicial** quanto para **sessão expirada** (mesma estrutura, textos diferentes).

**Textos atuais (login inicial):**
- Subtítulo: *"Entre com sua conta Google para continuar. O acesso é liberado apenas para membros da comissão de qualidade."*
- Rodapé: *"Ainda não está cadastrado? Solicite acesso ao gestor da qualidade."*
- Legenda sob a ilustração (`.sgq-ov-tag`): *"**Qualidade sob controle.** Cuidar do processo é cuidar do resultado."* — título em negrito + complemento, mesmo padrão título/subtítulo do restante do card.

A escolha de "Ainda não está cadastrado?" (em vez de "Não é membro?") é deliberada: o público desta tela **já é** da comissão de qualidade — o que falta para essa pessoa não é pertencimento, é **estar registrada na aba `Membros`**. A pergunta fala com quem já sabe que deveria ter acesso.

### 11.2 Páginas server-side (`authPaginaHtml_`, em `Auth_OAuth.js`) — casos de borda
Usadas nos retornos de erro do próprio OAuth (ex.: configuração ausente) e na tela de **"Acesso negado"** (conta que fez login mas não é membro cadastrado) — card único centralizado, com um selo de alerta e o e-mail rejeitado em destaque, e botão "Entrar com outra conta". Texto atual: *"A conta [e-mail] ainda não está cadastrada. Solicite acesso ao gestor da qualidade."* — mesma linha de raciocínio do §11.1.

A tela de login server-side (`authPaginaLogin_`, usada só em casos de erro do OAuth, não no fluxo normal) recebeu o mesmo subtítulo do overlay, por consistência.

### 11.3 Decisões de conteúdo (histórico)
Ao longo da implementação, por pedido explícito, foram removidos: a frase "O sistema não armazena senhas.", a frase original da legenda "Tarefas, riscos, visitas e capacitações — tudo num só lugar." e um indicador "98%" que estava na ilustração original. Uma segunda versão da ilustração (um personagem/mascote segurando uma prancheta) foi implementada e revertida a pedido — a versão atual é a original (painel + gráfico + selo), sem elementos de personagem. Os textos de subtítulo/rodapé passaram por uma segunda rodada de ajuste (registrada no §11.1) para direcionar melhor a pergunta a membros ainda não cadastrados. A legenda sob a ilustração passou por duas trocas: "Tarefas, riscos..." → "Qualidade sob controle." (sozinha) → versão atual, com complemento ("Cuidar do processo é cuidar do resultado.").

---

## 12. O iframe do Apps Script e seus impactos

Todo web app publicado via `HtmlService` é servido pelo Google dentro de um `<iframe>` num domínio **diferente** do `script.google.com` (algo como `n-xxxxx.googleusercontent.com`). É uma caixa de areia de segurança **obrigatória** — não existe configuração que a remova (o `XFrameOptionsMode` do `doGet` controla se **outros sites** podem embutir o *seu* app, não afeta esse isolamento interno do Google).

Impactos diretos nesta implementação:

| Restrição do iframe | Como foi contornada aqui |
|---|---|
| Origem dinâmica, não registrável | Motivou a escolha do OAuth code-flow em vez do GIS (§2) |
| Não navega o `top` sem gesto do usuário | Botão de login usa `target="_top"` |
| `location.reload()` do iframe não é confiável | Logout navega `window.top.location.href` para a `/exec` |
| Sem cookies de sessão entre a página do Google e o iframe | Sessão persistida via `sessionStorage`, escopada à aba |

---

## 13. Rota de diagnóstico

| Rota | Função | Uso |
|---|---|---|
| `?page=auth_diag` | `authDiagnostico_` | Somente leitura: informa se `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` estão configurados e imprime o **`redirect_uri` exato deste deploy** — o valor que precisa estar cadastrado no Client ID |

Não inicia login, não cria sessão e não aceita `sid`. O `doGet` a reconhece por **igualdade exata** (`p.page === 'auth_diag'`), não por prefixo — para não capturar qualquer `?page=` futuro que por acaso comece com "auth".

### 13.1 Rotas de teste removidas (histórico)

Durante as Fases 1–2 existiram `?page=auth_test` e `?page=auth_whoami&sid=...`, que validaram o fluxo OAuth ponta a ponta antes do go-live. Foram **removidas** numa revisão posterior, por dois motivos:

1. `authRotaTeste_` chamava `authCriarSessao_` **independentemente de a pessoa ser membro** — ou seja, qualquer conta Google que abrisse a rota recebia um id de sessão válido. (O acesso continuava barrado, porque todo endpoint recheca `isMembro_()`, mas era uma violação de defesa em profundidade.)
2. O `auth_whoami` passava o **id da sessão na própria URL**, contrariando o princípio de que o `sid` nunca trafega em URL — ele ficaria no histórico do navegador e em logs de proxy.

O que havia de útil nelas (mostrar o `redirect_uri`) sobreviveu em `?page=auth_diag`. Com a remoção, o prefixo `test:` de `state` deixou de existir: todo `state` emitido hoje começa com `app:`.

---

## 14. Segurança — o que foi avaliado

| Item | Situação |
|---|---|
| Client Secret | Só em Propriedades do Script; nunca enviado ao cliente |
| CSRF no login | `state` aleatório, de uso único, validado no retorno |
| Sessão | Id aleatório (UUID), não trafega na URL, TTL de 6h |
| Chamada direta ao servidor sem sessão | `dispatch` recusa (`"Sessão inválida ou expirada"`); cada função continua com seu próprio `isMembro_()` |
| P1 (planilha exposta) | Fechado — membros não têm mais acesso à planilha crua |

### 14.1 ✅ CORRIGIDO — execução de código arbitrário via `dispatch`

**O problema:** `dispatch` resolvia o nome pedido em `globalThis`, que não contém só as funções deste projeto — contém também as embutidas do JavaScript, inclusive **`eval`** e **`Function`**, que executam texto como código. A validação da época (recusar nomes terminados em `_`) não as barrava. Um **membro autenticado** poderia chamar `dispatch(sid, 'eval', ['...'])` e rodar código arbitrário **como a conta-sistema**: ler o `OAUTH_CLIENT_SECRET` das Propriedades do Script, alterar dados sem passar por `registrarLog_`, apagar abas, enviar e-mail institucional para qualquer destinatário.

Gravidade: exigia sessão válida (ou seja, ser membro, ou usar a sessão de um) — não era explorável por estranho. Mas devolvia, por outra porta, exatamente o privilégio que a migração para "executar como o dono" tirou dos membros (o P1).

**A correção aplicada** — recusar funções **nativas**:

```js
if (/\[native code\]/.test(Function.prototype.toString.call(fn))) {
  throw new Error('Função não permitida.');
}
```

**Por que não uma whitelist de nomes** (a alternativa considerada primeiro): nenhuma função deste projeto é nativa, então barrar as nativas fecha a mesma brecha **sem** manter uma lista de ~45 nomes — lista que quebraria a cada endpoint novo que alguém esquecesse de cadastrar, e cuja geração inicial já arriscaria derrubar uma tela em produção por um nome omitido. Mesma proteção, sem custo de manutenção e sem risco de regressão.

**Ressalva registrada:** funções criadas com `.bind()` também se reportam como `[native code]` e seriam recusadas. Verificado: o servidor não usa `.bind()` em lugar nenhum. Se algum dia um endpoint for criado assim, precisará ser uma função declarada normalmente.

### 14.2 Alguém externo consegue entrar via F12 (console do navegador)?

Não em nenhum cenário testado na lógica do código. Camadas envolvidas:

- **Chamar uma função direto** (`google.script.run.saveTask(...)`, pulando o `dispatch`): cada função pública continua começando com `if (!isMembro_()) return {...}`. Sob `USER_DEPLOYING`, `Session.getActiveUser()` só é preenchido para a **própria conta-sistema** — para qualquer outra pessoa (membro ou não), ele vem **vazio**, então `usuarioAtual_()` cai em `'Sistema'` e `isMembro_()` recusa imediatamente. A chamada direta cai na mesma trava de sempre.
- **Chamar `dispatch` com um `sid` chutado**: `sid` é um UUID (122 bits de entropia), guardado só no `CacheService`, nunca exposto em URL/log. Adivinhação é computacionalmente inviável.
- **Forjar o e-mail no retorno do OAuth**: impossível — o e-mail nunca vem de um parâmetro controlável pelo atacante; vem de uma chamada servidor-a-servidor (`authTrocarCodePorPerfil_`) ao endpoint oficial do Google, depois de trocar um `code` real por um `access_token` real de uma conta Google real.

**Conclusão:** nenhum dado ou ação real fica acessível a quem não tem uma sessão válida — inclusive testando via F12.

### 14.3 Exposição do código-fonte do CLIENTE (diferente do código do servidor)

Vale separar dois tipos de "código-fonte":

- **Código do servidor** (`Código.js`, `Auth_OAuth.js`, `Modulo_*.js`) — **nunca** é enviado ao navegador, de ninguém, membro ou não. É assim que o Apps Script funciona: o servidor executa e devolve só o resultado (HTML renderizado / retorno de função). Nenhuma mudança nesta implementação afeta isso.
- **Código do cliente** (`Index.html`, `CSS.html`, os `JS_*.html`, `View_*.html`) — é concatenado pelo servidor num único HTML e enviado ao navegador, porque é literalmente o que o navegador precisa para desenhar a tela.

**O que mudou de fato com esta migração:** antes (`USER_ACCESSING`), `doGet` chamava `isMembro_()` **antes** de servir qualquer HTML — um não-membro só recebia a mensagem "Acesso Negado", nunca o código do app. Hoje, como o `Session` fica vazio para qualquer um que não seja a conta-sistema, o servidor **não consegue mais distinguir** membro de não-membro antes de servir a página — então `servirApp_('')` entrega a **casca completa do app** (HTML/CSS/JS de interface, nomes de função chamados via `srv()`) para **qualquer pessoa com uma conta Google**, mesmo sem nunca ter feito login.

**O que isso expõe:** estrutura de telas, nomes de função (`saveTask`, `salvarUnidade` etc.), validações client-side.
**O que isso NÃO expõe:** nenhum dado da planilha, nenhuma credencial (`Client Secret` só existe server-side), nenhuma lógica de autorização real — e, como visto em §14.2, conhecer os nomes das funções não ajuda um atacante, porque todas continuam bloqueadas sem sessão válida.

**Por que não é possível voltar ao bloqueio anterior:** o servidor só sabe se é membro **depois** do login, e o login precisa rodar **dentro** dessa mesma página (é onde o botão "Entrar com Google" e o porteiro de sessão vivem). Restaurar o bloqueio pré-login exigiria abrir mão do login-no-cliente — mudança de arquitetura desproporcional ao ganho (o risco real, de dados/ações, já está fechado por outras camadas).

---

## 15. Limites e cotas do Google (OAuth/Apps Script)

| Limite | Valor | Relevância para este sistema |
|---|---|---|
| App em modo de teste (tela de consentimento) | 100 usuários de teste | Contornado publicando o app (§5.3) |
| Verificação do Google para escopos sensíveis/restritos | Obrigatória para esses escopos | Não se aplica — só usa `openid`/`email` (básicos) |
| Cota de `UrlFetchApp` (Apps Script) | ~20.000/dia (conta pessoal) ou ~100.000/dia (Workspace) | Cada login consome 2 chamadas → folga de milhares de logins/dia |
| Rate-limit anti-abuso do endpoint de token do Google | Não divulgado, alto | Pensado contra ataques, não uso legítimo |

**Conclusão:** para o volume de uma comissão (dezenas de membros), nenhum desses limites é alcançável na prática.

---

## 16. Impacto em performance

| Momento | Custo adicional | Magnitude |
|---|---|---|
| Login (uma vez a cada até 6h) | 2 chamadas de rede ao Google (token + perfil) | ~200–500ms, comparável ao próprio redirecionamento do botão |
| Cada ação no app (`dispatch`) | 1 leitura a mais no `CacheService` para validar a sessão | Poucos milissegundos |
| Carregamento da página | 1 `<script>` inline a mais (`JS_Auth_Cliente.html`) | Desprezível, sem chamada de rede |

A sessão de 6h evita repetir o custo do OAuth a cada interação — ele é pago **uma vez por sessão**, não por clique. A lógica de negócio dos módulos (Kanban, Riscos, Documentos etc.) não foi alterada.

---

## 17. Checklist de publicação / rollback

### Para publicar
1. Logar no editor do Apps Script **com a conta-sistema**.
2. Conferir que `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` estão nas Propriedades do Script.
3. Conferir que a `/exec` do deploy está cadastrada como redirect URI no Client ID.
4. **Implantar → Gerenciar implantações → editar → Versão: Nova versão → Implantar.**
5. Testar: abrir como membro (deve ver o overlay de login → app), abrir como não-membro (deve ver "Acesso negado"), testar "Sair".

### Rollback
Voltar, na mesma tela de "Gerenciar implantações", para a **versão anterior** publicada. Como o `executeAs` é parte do manifesto versionado, reverter a versão também reverte o modelo de execução — não requer nenhum passo extra de "desfazer" no código.

---

## 18. Pendências conhecidas

1. **"Sair" para a conta-sistema (dono)** — avaliado e conscientemente não implementado: um logout real exigiria encerrar a sessão Google inteira do navegador (não só do SGQ), o que é uma ação mais pesada e com efeitos colaterais (desloga Gmail, Drive etc. na mesma aba). Recomendação atual: não usar a conta-sistema em computadores compartilhados; se necessário, tratar como decisão explícita do usuário antes de implementar.
2. **Nenhuma das mudanças acima foi testada pelo assistente** (Apps Script não tem servidor local) — toda validação foi feita pelo usuário a cada publicação de nova versão. Em produção, a validação da §20.7 foi concluída em 2026-08-08 (ver §21).

### 18.1 Limites operacionais (não são bugs, mas convém conhecer)

- **Escritas são serializadas globalmente.** As 33 operações de escrita passam por `comBloqueio_` → `LockService.getScriptLock()`, um lock do script inteiro com espera de até 30s. É proposital (evita corrida de dados na planilha) e anterior a esta migração. Leituras **não** usam lock e rodam em paralelo. Sintoma de contenção: a mensagem *"O sistema está ocupado processando outra operação"*, que aparece a partir de ~10–15 escritas simultâneas.
- **Cotas passaram a ser de uma conta só.** Sob `USER_ACCESSING`, cada membro consumia a própria cota; sob `USER_DEPLOYING`, tudo sai da conta-sistema: execuções simultâneas (~30), envio de e-mail (~100/dia em gmail comum, ~1.500/dia em Workspace) e `UrlFetchApp` (~20.000/dia). A mais apertada é a de **e-mail**. A de `UrlFetchApp` é consumida **apenas pelo login** (2 chamadas por login → ~10.000 logins/dia de folga).
- **`CacheService` não é armazenamento garantido.** Sessões podem ser despejadas antes das 6h sob pressão de memória — explica eventuais relatos de "caiu sozinho".
- **Criar uma implantação NOVA (em vez de "Nova versão") muda a URL `/exec`** e quebra o login (`redirect_uri_mismatch`), além dos links salvos pelos membros. Diagnóstico rápido: `?page=auth_diag` imprime o `redirect_uri` que o deploy está usando.

---

## 19. Pós-migração: a autorização OAuth antiga e o compartilhamento da planilha

Tópico avaliado em conversa, sem alteração de código — registrado aqui como referência para decisões futuras.

### 19.1 Duas autorizações diferentes, não confundir

| | **Autorização antiga** (concedida sob `USER_ACCESSING`) | **Autorização nova** (login OAuth do SGQ) |
|---|---|---|
| O que foi concedido | Acesso **amplo**: o script podia agir **como o membro** — ler/editar Planilhas Google, enviar e-mail em nome dele | Acesso **básico**: só nome + e-mail |
| A quem | Ao **projeto Apps Script** em si (cada script é um cliente OAuth implícito do Google) | Ao **Client ID** criado no Cloud Console (§5) |
| Ainda em uso hoje? | **Não** — o código não roda mais como o membro | **Sim** — é o login atual |

Nenhuma reautorização é necessária para o app continuar funcionando — a autorização nova acontece sozinha, no primeiro "Entrar com Google" de cada membro.

### 19.2 O que realmente fecha o P1: compartilhamento no Drive, não o OAuth

A autorização antiga, por si só, **não é o que dava acesso irrestrito** à planilha — quem dava era o **compartilhamento da planilha no Google Drive** (necessário para o `USER_ACCESSING` funcionar). Se a planilha continuar compartilhada com os membros no Drive, eles continuam conseguindo abri-la direto — **independente** de qualquer autorização OAuth, antiga ou nova.

**Ação decisiva, que só o administrador consegue fazer:** revisar o compartilhamento da planilha no Drive e remover o acesso dos membros, deixando só a conta-sistema (e, se necessário, 1–2 administradores). Esta é uma configuração do Google Drive, fora do escopo do código — não verificável nem alterável por aqui.

> ✅ **Executada em 2026-08-08.** Com isso o P1 está fechado de fato, e não apenas habilitado a ser fechado. Ver §21.5 e §21.6.

### 19.3 Autorização antiga: risco condicional, não ativo

Enquanto o sistema continuar em `USER_DEPLOYING`, a autorização antiga fica **inerte** — não é usada, não expõe nada, não tem custo. O risco é **condicional**: só se materializa se, no futuro, alguém reverter o `executeAs` para `USER_ACCESSING`, ou adicionar um gatilho (trigger) automático vinculado a um membro — nesses cenários, a autorização antiga (já concedida) permitiria o script agir na conta dele novamente, sem novo consentimento.

**Recomendação:** por higiene (princípio do menor privilégio), cada membro pode revogar a autorização antiga em [myaccount.google.com/permissions](https://myaccount.google.com/permissions) — ação rápida, feita por cada um em sua própria conta, independente e sem efeito sobre o login novo do SGQ. Não é urgente nem crítico; o Google também tende a revogar automaticamente autorizações de escopos sensíveis não usadas por ~6 meses.

### 19.4 Por que NÃO se optou por "copiar o projeto inteiro e excluir o antigo"

Ideia avaliada como alternativa para neutralizar de vez a autorização antiga (um `scriptId` novo = um cliente OAuth genuinamente novo). Tecnicamente resolveria o item 19.3 — mas foi descartada para este sistema pelos seguintes motivos:

- O script é **vinculado à planilha** (container-bound) — não existe "copiar só o script"; a cópia precisaria ser da **planilha inteira**, arrastando todos os dados (Membros, Tarefas, Riscos etc.) para um arquivo novo.
- Isso geraria uma **nova URL `/exec`** (quebra todos os favoritos/links salvos pelos membros), exigiria recadastrar `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` nas Propriedades do Script novo (não são copiadas automaticamente), reassociar o projeto ao Google Cloud, atualizar o `redirect_uri` no Client ID e o `scriptId` no `.clasp.json`.
- Risco real de **divergência de dados** durante a janela de transição, se alguém editar a planilha antiga depois da cópia.
- **Custo/benefício desproporcional**: uma migração completa do sistema em produção para neutralizar um risco que já é condicional, de baixo impacto, e resolvível por cada membro em 30 segundos (§19.3) ou pela ação central do §19.2.

**Decisão registrada:** não copiar/recriar o projeto. Se o `executeAs` for revertido a `USER_ACCESSING` no futuro por qualquer motivo, reavaliar este item nesse momento.

---

## 20. Guia de replicação em outro projeto

As seções anteriores registram **o que foi feito e por quê**. Esta é a receita de **como refazer** em outro projeto Apps Script. As §§1–19 continuam sendo a referência do "porquê" — consulte-as quando algo aqui parecer arbitrário, porque quase nada é.

### 20.1 Pré-requisitos

| Requisito | Por quê |
|---|---|
| Uma **conta-sistema dedicada** (não pessoal, não compartilhada) que seja **dona** do script e da planilha | Sob `USER_DEPLOYING` o código roda como ela; se a senha for compartilhada com os usuários, o P1 não é fechado (§19.2) |
| O projeto já ter uma **fonte de "quem é membro"** — uma aba/lista que mapeie e-mail → pessoa | O login apenas **atesta** a identidade; quem autoriza continua sendo a regra do projeto |
| O projeto já ter uma **função de autorização** chamada no início de cada endpoint (aqui, `isMembro_()`) | O login não substitui isso. Ver §20.6, item 1 |
| O web app já **publicado ao menos uma vez** | O `redirect_uri` a cadastrar é a URL `/exec`, que só existe depois do primeiro deploy |

> ⚠️ Se o projeto **não** tiver uma checagem de autorização por endpoint, pare e implemente isso primeiro. No Apps Script, **toda função pública é um endpoint independente** — o login sozinho não protege nada (§14.2).

### 20.2 Ordem de execução

Siga nesta ordem. Os passos 1–4 não alteram o comportamento do sistema (são aditivos); o comportamento só muda no passo 6.

1. **Google Cloud Console** — criar projeto, tela de consentimento e Client ID → **§5** (passo a passo completo).
2. **Propriedades do Script** — gravar `OAUTH_CLIENT_ID` e `OAUTH_CLIENT_SECRET` → **§6**.
3. **Copiar os 2 arquivos novos** → §20.3.
4. **Editar os arquivos existentes** → §20.4.
5. **Substituir as chamadas do cliente** (`google.script.run` → `srv()`) → §20.5.
6. **Adaptar ao projeto** → §20.6. ← **é aqui que a maioria das replicações quebra**
7. **Virar o `executeAs`** para `USER_DEPLOYING` no `appsscript.json` → §4.
8. **Publicar nova versão logado na conta-sistema** e validar → §20.7.

### 20.3 Arquivos a copiar na íntegra

| Arquivo | Conteúdo |
|---|---|
| `Auth_OAuth.js` | Backend: fluxo OAuth, sessão, `dispatch`, telas server-side, `authDiagnostico_` |
| `JS_Auth_Cliente.html` | Cliente: porteiro de sessão, `srv()`, overlay de login/sessão expirada, botão Sair, ilustração SVG |

Copie-os **como estão** e só então aplique as adaptações da §20.6. Não vale a pena reescrevê-los a partir dos trechos citados nas §§8–11 — aqueles são recortes ilustrativos, não o código completo.

### 20.4 Edições nos arquivos existentes

#### a) `Código.js` — `doGet`

Substituir o corpo por: rotas de auth primeiro, depois o fluxo normal. Código completo em **§8.1**. O essencial:

```js
function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  if (p.page === 'auth_diag') return authDiagnostico_();
  if ((p.code || p.error) && p.state && String(p.state).indexOf('app:') === 0) {
    return authLoginRealRetorno_(e);
  }
  if (p.code || p.error) return servirApp_('');

  if (isMembro_()) return servirApp_('');
  let temEmailNativo = false;
  try { temEmailNativo = !!Session.getActiveUser().getEmail(); } catch (e2) {}
  if (temEmailNativo) return HtmlService.createHtmlOutput('<div ...>Acesso Negado</div>');
  return servirApp_('');   // Session vazio → o porteiro do cliente cuida do login
}
```

#### b) `Código.js` — extrair `servirApp_`

Todo ponto que renderizava o template principal passa a chamar esta função (é o único lugar que injeta as variáveis de sessão):

```js
function servirApp_(sid) {
  const t = HtmlService.createTemplateFromFile('Index');
  let nativo = false;
  try { nativo = !!Session.getActiveUser().getEmail(); } catch (e) {}
  let appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  t.sid = sid || '';
  t.authOAuth = nativo ? '' : 'oauth';
  t.loginUrl = nativo ? '' : authUrlLoginApp_();
  t.appUrl = appUrl;
  return t.evaluate()
    .setTitle('SGQ · CEQP')                                    // ← adaptar (§20.6)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
```

#### c) `Código.js` — `usuarioAtual_`

Acrescentar **uma linha** no início, antes do `Session`:

```js
function usuarioAtual_() {
  try { if (typeof __SESSAO_EMAIL__ !== 'undefined' && __SESSAO_EMAIL__) return __SESSAO_EMAIL__; } catch (e) {}
  try { return Session.getActiveUser().getEmail() || 'Sistema'; } catch (e) { return 'Sistema'; }
}
```

É esta linha que faz **toda** a autorização e **todos** os logs existentes passarem a enxergar a identidade do login, sem alterar nenhuma das outras funções.

#### d) `Index.html` — injeção das variáveis (antes dos demais `<script>`)

```html
  <script>
    window.SGQ_SID = <?!= JSON.stringify(typeof sid !== 'undefined' ? sid : '') ?>;
    window.SGQ_AUTH = <?!= JSON.stringify(typeof authOAuth !== 'undefined' ? authOAuth : '') ?>;
    window.SGQ_LOGIN_URL = <?!= JSON.stringify(typeof loginUrl !== 'undefined' ? loginUrl : '') ?>;
    window.SGQ_APP_URL = <?!= JSON.stringify(typeof appUrl !== 'undefined' ? appUrl : '') ?>;
  </script>
  <?!= include_('JS_Auth_Cliente'); ?>
```

> **Ordem importa:** o `include_('JS_Auth_Cliente')` precisa vir **antes** dos JS que usam `srv()`, e o bloco todo depois do HTML da interface (o porteiro procura `#btn-logout` ao ser executado).

#### e) `Index.html` — botão Sair

Em algum ponto da interface (aqui, no rodapé da sidebar). **Precisa nascer oculto** — quem o revela é o `JS_Auth_Cliente.html`, só em modo OAuth:

```html
        <button type="button" id="btn-logout" class="theme-toggle" style="display:none"
                title="Sair" aria-label="Sair">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
```

O `id` **precisa ser exatamente `btn-logout`** (é o que `authWireLogout_` procura). A classe é do design do projeto — troque à vontade.

### 20.5 Substituir as chamadas do cliente

Em **todos** os arquivos de JS do cliente, trocar `google.script.run` por `srv()`:

```
google.script.run.withSuccessHandler(f).minhaFuncao(x)
        ↓
srv().withSuccessHandler(f).minhaFuncao(x)
```

É busca-e-substituição literal em todos os `.html` de script (aqui foram ~49 ocorrências em 8 arquivos). Depois, confirme que **não sobrou nenhuma** fora do `JS_Auth_Cliente.html` (que legitimamente usa `google.script.run` por dentro):

```bash
grep -rn "google\.script\.run" --include=*.html . | grep -v JS_Auth_Cliente
```

`srv()` mantém o mesmo encadeamento (`.withSuccessHandler`/`.withFailureHandler`), então nada mais no cliente muda.

### 20.6 ⚠️ O que ADAPTAR ao novo projeto

Copiar os arquivos sem fazer isto resulta em "o login funciona, mas ninguém é reconhecido".

**1. A checagem de membro** — `authEmailEhMembro_` em `Auth_OAuth.js`:

```js
const lista = membrosParaAuth_(); // [ [emailFuncional, emailPessoal, nome], ... ]
...
if (alvo === lista[i][1]) return { membro: true, ... };   // compara com Email_Pessoal
```

Aponte para a fonte de membros **do novo projeto**. O contrato a preservar: devolver `{ membro, nome, indisponivel }`, sendo `indisponivel: true` quando a leitura falhar (≠ "não encontrado") — ver §14 e §8.3.

**2. Marca e textos** — trocar em `Auth_OAuth.js` (`authMarca_`, `authPaginaHtml_`) e em `JS_Auth_Cliente.html` (`authInjetarOverlay_`):

| Texto atual | Onde |
|---|---|
| `SGQ` (badge do logo) | ambos |
| `Sistema de Gestão da Qualidade` | ambos |
| `CEQP / SUCOAS · SES/DF` | ambos |
| `SGQ · CEQP` (título da página) | `Auth_OAuth.js`, `servirApp_` |
| "...apenas para membros da comissão de qualidade" | `JS_Auth_Cliente.html` |
| "Ainda não está cadastrado? Solicite acesso ao **gestor da qualidade**" | `JS_Auth_Cliente.html` e `Auth_OAuth.js` |

**3. Tokens de CSS** — o overlay usa `--bg-app`, `--bg-card`, `--primary`, `--text-main`, `--border-color`, `--danger-text` etc., **com fallback embutido** (`var(--bg-app,#f3f4f6)`). Se o novo projeto tiver outros nomes de token, ajuste; se não tiver design system, os fallbacks já entregam um visual coerente.

**4. Tema claro/escuro** — o anti-flash das telas server-side lê `localStorage['sgq-tema']` (`authCss_`/`authPaginaHtml_`). Se o novo projeto guardar o tema com outra chave, troque — senão as telas de auth abrem sempre no claro.

**5. A ilustração** — `authIlustracao_` em `JS_Auth_Cliente.html` é um SVG próprio deste sistema. Substitua ou remova (nesse caso, remova também a coluna `.sgq-ov-right` do overlay).

### 20.7 Checklist de verificação

Depois de publicar **nova versão logado na conta-sistema**:

| # | Teste | Esperado |
|---|---|---|
| 1 | Abrir `?page=auth_diag` | Dois ✓ de configuração + o `redirect_uri` idêntico ao cadastrado no Client ID |
| 2 | Abrir a `/exec` com conta **membro** | Tela de login → após entrar, o app carrega |
| 3 | Abrir com conta **não-membro** | "Acesso negado" com o e-mail exibido |
| 4 | **Recarregar (F5)** já logado | Entra direto, **sem** pedir login |
| 5 | Criar/editar/excluir em **cada módulo** | Funciona (é o que valida a troca em massa da §20.5) |
| 6 | Conferir o autor nos **logs/atividades** | Nome do membro que agiu, não "Sistema" |
| 7 | Clicar em **Sair** | Volta imediatamente à tela de login, sem tela branca |
| 8 | Fechar a aba e reabrir | Pede login (o `sessionStorage` é por aba) |
| 9 | Envio de e-mail/PDF, se houver | Sai da **conta-sistema**, não da conta de quem clicou |

Se o passo 2 falhar com `redirect_uri_mismatch`, é quase sempre divergência entre a URL do passo 1 e a cadastrada no Client ID (§18.1, último item).

### 20.8 Armadilhas conhecidas (leia antes de depurar)

| Sintoma | Causa provável |
|---|---|
| `redirect_uri_mismatch` | A `/exec` mudou (implantação **nova** em vez de "Nova versão") ou nunca foi cadastrada — §18.1 |
| Tela branca ao sair | `location.reload()` dentro do iframe. Navegue `window.top` — §9.4 |
| "Acesso bloqueado: app não concluiu verificação" | Tela de consentimento em modo teste; publique o app — §5.3 |
| Login pede duas vezes | `state` expirado (TTL curto) — §8.2 |
| Botão Sair não aparece | Está correto para a **conta-dona**: ela tem `Session` nativo, logo não há sessão OAuth a encerrar — §10.1 |
| Membro legítimo vê "não cadastrado" | Falha transitória de leitura da fonte de membros — o contrato `indisponivel` da §20.6 existe para isso |

---

## 21. Registro da aplicação em produção (2026-08-08)

A §20 foi seguida para migrar o sistema de produção (script `1VHG3zsv…`). Esta seção registra **o que a receita não previa** — o valor está no que divergiu, não no que funcionou como escrito.

### 21.1 Correção nova: o rate-limit de PDF virava global

Não veio da implementação de referência; foi encontrada auditando este projeto **antes** de portar o código, e a mesma falha existe no projeto de teste.

`_limitePdfExcedido_` usava `CacheService.getUserCache()` para os limites de 3s (download) e 10s (envio por e-mail) de relatórios. Sob `USER_ACCESSING` isso era corretamente **por membro**. Sob `USER_DEPLOYING`, o "usuário" do cache passa a ser **sempre a conta-sistema**, para todos — o limite viraria **global**: um membro baixando um relatório bloquearia todos os demais durante a janela inteira.

**Correção:** `CacheService.getScriptCache()` com chave derivada de `usuarioAtual_()` (`'gerar_pdf_rate_' + email`), preservando a semântica por usuário. Como `usuarioAtual_()` já enxerga a sessão OAuth (§8.4), a identidade certa chega sem nenhuma outra mudança.

**Lição para replicações:** procure todo `getUserCache()`/`getUserProperties()` antes de virar o `executeAs` — qualquer coisa escopada "por usuário" pelo Google silenciosamente vira "por sistema". Este projeto tinha uma só ocorrência; outro pode ter várias.

### 21.2 O que a §20.6 mandava adaptar e aqui não precisou

O projeto de origem e o de produção são o mesmo sistema, então quatro dos cinco itens de adaptação saíram de graça: a fonte de membros (`membrosParaAuth_`) já devolvia o formato esperado, os textos de marca já eram os certos, os tokens de CSS existiam em claro e escuro, e a chave de tema já era `sgq-tema`. **Numa replicação de verdade, não conte com isso** — a §20.6 continua sendo onde a maioria das replicações quebra.

### 21.3 Cuidado que a §20.3 não menciona: o projeto de origem pode estar desatualizado

A §20.3 diz "copie os 2 arquivos novos na íntegra", o que valeu. Mas o projeto de teste tinha **também** `Código.js`, `Index.html` e os `JS_*.html`, e a tentação de copiá-los junto era real — o `Código.js` e o `Index.html` divergiam **só** em auth e puderam ser copiados, mas `JS_Kanban.html` (1.724 linhas), `JS_VisitasTecnicas.html` (904), `Modulo_Capacitacoes.js` e `Modulo_VisitasTecnicas.js` (~200 cada) divergiam por **evolução do produto**: o teste partira de um snapshot de 30/07 e o master seguira adiante.

Copiá-los teria revertido funcionalidades em produção, e a regressão seria **silenciosa** — o app abriria normalmente. A verificação que evitou isso foi medir a divergência arquivo a arquivo antes de qualquer cópia, e conferir que o nº de linhas alteradas em cada `JS_*` era exatamente **o dobro** da contagem de `google.script.run` (uma removida + uma adicionada por ocorrência): qualquer excedente significaria mudança não relacionada.

### 21.4 Ordem executada, com um desvio

A §20.2 prevê publicar primeiro em `USER_ACCESSING` (regressão isolada) e só depois virar o `executeAs`. Na prática os dois passos foram feitos juntos: a implantação já foi criada com "Executar como: Eu". Consequência assumida: se um módulo falhasse, não haveria como distinguir de imediato se a causa foram as 49 substituições `srv()` ou a troca de identidade. Não houve falha, mas **a separação da §20.2 continua sendo a recomendação** — ela existe para tornar o diagnóstico trivial, não por formalismo.

Um efeito colateral desse desvio: por um intervalo, a implantação rodava em `USER_DEPLOYING` enquanto o `appsscript.json` ainda declarava `USER_ACCESSING`. O app funcionava (vale o que está na implantação), mas uma "Nova versão" futura teria revertido o modelo de execução **sem aviso**, reabrindo o P1 em silêncio. Corrigido alinhando o manifesto antes da publicação final.

### 21.5 Estado final

| Item | Situação |
|---|---|
| `executeAs` no manifesto e na implantação | `USER_DEPLOYING` nos dois |
| Tela de consentimento | Publicada ("Em produção") — sem o teto de 100 usuários da §5.3 |
| Acesso do web app | "Qualquer pessoa com Conta do Google" (`access: ANYONE`) |
| `redirect_uri` cadastrado no Client ID | Sim, conferido por `?page=auth_diag` |
| Validação da §20.7 com conta de membro | Concluída |
| **Compartilhamento da planilha no Drive (§19.2)** | **Removido em 2026-08-08 — P1 FECHADO** |

> O último item é o que dá sentido a tudo isto. A migração **habilita** a remoção do acesso à planilha (os membros não precisam mais dele); ela não a executa. Com a remoção feita, o P1 está efetivamente fechado: os membros passam a interagir com os dados **apenas** através do app, onde toda ação atravessa `isMembro_()` e fica registrada por `registrarLog_`. Não há mais caminho para editar a aba `Membros` direto no Sheets e contornar a autorização.

### 21.6 Consequência operacional a não esquecer

Com o compartilhamento removido, **a conta-sistema passa a ser o único caminho de acesso direto aos dados**. Duas implicações práticas:

- **Manutenção da planilha** (corrigir um dado à mão, ajustar uma fórmula, inspecionar uma aba) agora exige entrar na conta-sistema. Vale manter 1–2 administradores com acesso de edição no Drive, para não depender de uma conta só — a §19.2 já previa isso.
- **Backup/exportação** deixou de ser possível pela conta de cada membro. Se havia alguma rotina informal apoiada nisso, ela quebrou silenciosamente hoje.
