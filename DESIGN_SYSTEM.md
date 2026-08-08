# Design System — SGQ · CEQP / SUCOAS

Documentação oficial do Design System do Sistema de Gestão de Qualidade. Este guia documenta as regras, padrões visuais e comportamentos dos componentes do SGQ baseados na arquitetura CSS do projeto.

> **Fonte da verdade:** `CSS.html`. Este documento descreve o que está lá — quando divergirem, o CSS vence e este arquivo é que deve ser corrigido.
> **Última revisão:** 2026-07-29. Histórico detalhado das mudanças visuais em `DOCUMENTACAO.md` §8.19 (paleta), §8.20 (modo escuro) e §10.

## 1. Visão Geral e Princípios
- **Estética:** "Premium" de alto contraste, em **dois temas**. O modo claro é o padrão; o modo escuro (implementado em 2026-07-27) é uma contraparte completa de tokens — **não** uma inversão de filtro. Uma tentativa anterior de "Night Mode" via `filter: invert() hue-rotate()` (25/07/2026) foi revertida justamente porque destruía as cores semânticas e quebrava componentes nativos; a solução atual redeclara os mesmos nomes de variável sob `[data-theme="dark"]`, e **nenhuma regra de layout precisa saber que o tema existe**.
- **Elevação vs. Sombras:** O design evita sombras pesadas. A separação entre elementos é feita predominantemente através de bordas claras (`var(--border-color)`) e tons sutis de fundo, garantindo um visual limpo e fluido sem pesar o processamento da interface.
- **Micro-interações:** Transições suaves baseadas em curvas de atenuação consistentes para feedback instantâneo e amigável, sem exageros nas animações de elementos estáticos.
- **Densidade Espacial:** Uso extensivo de espaços baseados em múltiplos de 4 para melhor legibilidade, alinhamento simétrico e consistência (Grid System Base 4).

---

## 2. Design Tokens

### 2.1 Cores — modo claro (`:root`)
Todas as cores devem ser aplicadas sempre que possível utilizando as variáveis nativas (`var(--nome-da-variavel)`). **Cor chumbada em regra é considerada defeito** — as auditorias de 26/07 e 27/07 removeram dezenas delas.

#### Marca e Ação (Primária)
O tema primário utiliza tons quase pretos ("tinta preta") para gerar forte contraste contra os fundos claros e trazer aspecto profissional.
- `--primary`: `#030712` · `--primary-hover`: `#1f2937` · `--primary-active`: `#111827`
- `--primary-light`: `#f3f4f6` · `--primary-lighter`: `#f9fafb` · `--primary-text`: `#030712`
- `--primary-ring`: `rgba(3,7,18,0.14)` — halo de foco
- `--control-accent`: preenchimento de checkbox/radio nativos. Hoje tem o mesmo valor de `--primary`, mas é **token separado de propósito**: no escuro a tinta da marca vira quase-branca, e um checkbox quase-branco sobre superfície escura ficaria ilegível.

#### Acento secundário
- `--accent`: `#2b7fff` · `--accent-hover`: `#1c6ef2` · `--accent-light`: `#eaf2ff` — CTA pontual, links e gráficos.

#### Cores de Superfície e Fundo
- `--bg-app`: `#f3f4f6` (fundo geral) · `--bg-card`: `#ffffff` (cartões, tabelas e modais)
- `--bg-panel`: `#f9fafb` (divisões internas) · `--bg-subtle`, `--bg-hover`: `#f3f4f6`
- `--kanban-list-bg`: `#D3D6DC` (poço das colunas do Kanban — fica **abaixo** de `--bg-app` na escada de elevação)

#### Textos
- `--text-main`: `#030712` · `--text-secondary`: `#4b5563` · `--text-muted`: `#6b7280` · `--text-inverse`: `#ffffff`

#### Bordas
- `--border-color`: `#e5e7eb` · `--border-subtle`: `#eef0f2` · `--border-strong`: `#d1d5db`

#### Semântica de Feedback e Status
- **Sucesso (verde menta):** `--success-bg` `#DFF6EF` · `--success-border` `#A6E0D2` · `--success-text` `#157965` · `--success` `#2CA98F`
- **Aviso (amarelo dourado):** `--warning-bg` `#FBF3D3` · `--warning-border` `#EBD98C` · `--warning-text` `#795B15` · `--warning` `#C99A2E`
- **Perigo/Atrasado (vermelho tijolo):** `--danger-bg` `#FCE1DE` · `--danger-border` `#F3B8B0` · `--danger-text` `#791E15` · `--danger` `#D8483A`
- **Info (roxo lavanda):** `--info-bg` `#E9E6FB` · `--info-border` `#CBC3F3` · `--info` `#7A6CDD`

#### Heatmap da Matriz de Riscos
Família própria, **tokenizada** (`--risk-*`), usada por `.cell-green/.cell-yellow/.cell-orange/.cell-red` e pelos `.legend-dot`:
- `--risk-low-bg` `#72C9B7` · `--risk-med-bg` `#E6CC8C` · `--risk-high-bg` `#E6AD7A` · `--risk-crit-bg` `#E27E73` (cada um com `-border` e `-text` próprios).

---

### 2.2 Modo Escuro (`[data-theme="dark"]`)

Implementado em 2026-07-27 (`DOCUMENTACAO.md` §8.20), refinado em 2026-07-29 (§10, Décima rodada).

**Como funciona:** o bloco `[data-theme="dark"]` **redeclara os mesmos nomes** do `:root`. A cascata resolve tudo quando o atributo aparece no `<html>` — nenhuma regra de componente é duplicada por tema. Há anti-flash: o atributo é aplicado antes do primeiro paint.

**Princípios que o escuro preserva:**
- **A escada de elevação não é espelhada, é preservada.** "Mais claro" continua significando "mais elevado": o poço do Kanban fica abaixo da página, o cartão acima dela. É por isso que o fundo **não pode ser preto puro** — não sobraria lugar para o poço descer.
- **A tinta da marca inverte:** preto vira quase-branco (`--primary: #e6e8eb`), e o hover continua caminhando na direção do fundo, mantendo a mesma gramática de interação.
- `--bg-subtle` e `--bg-hover`, que no claro compartilham `#f3f4f6`, **divergem** no escuro — senão o hover não se distingue do fundo.

**Superfícies (valores após o refinamento de 29/07):**

| Token | Claro | Escuro |
|---|---|---|
| `--kanban-list-bg` | `#D3D6DC` | `#151a23` |
| `--bg-app` | `#f3f4f6` | `#131820` |
| `--bg-card` | `#ffffff` | `#1c2129` |
| `--bg-panel` | `#f9fafb` | `#212633` |
| `--bg-subtle` | `#f3f4f6` | `#252c37` |
| `--bg-hover` | `#f3f4f6` | `#2a3240` |
| `--sidebar-bg` | `#f3f4f6` | `#131820` |

Contraste validado: texto principal `#e6e8eb` sobre `--bg-card` = **14,2:1** (AAA+++); secundário 9,7:1; muted 7,1:1.

**O que NÃO ganha contraparte, deliberadamente:**
- **Raio, espaçamento, tipografia e motion** — geometria não muda com o tema.
- **`--risk-*`** — as 4 cores do heatmap precisam preservar a **ordem perceptual** (baixo→crítico). São tons médios saturados que funcionam sobre fundo escuro, e o texto quase-preto contrasta contra o próprio preenchimento, não contra a página. Mudá-las quebraria a leitura do gradiente — e essa matriz ainda é **fotografada para dentro do PDF**.
- **`--tag-alta/media/baixa`, `--green`/`--red`/`--yellow`** — são apelidos que apontam para `--danger`/`--warning`/`--success` e seguem sozinhos.

**`color-scheme`:** declarado nos dois blocos (`light` / `dark`). Sem isso, controles **nativos** (painel do date-picker, dropdown do select, autofill, scrollbar) são pintados pelo tema do sistema operacional e destoam da interface.

**`.tema-claro` — válvula de escape.** Repete os valores claros e força a paleta clara em qualquer subárvore marcada, mesmo com o modo escuro ativo (uma declaração no próprio elemento vence o valor herdado). É o que permite **gerar PDF em tema claro sem piscar a tela** — ver `_capturarElementoComoImg` em `JS_Utilitarios.html`.

---

### 2.3 Tipografia
A família tipográfica padrão e única da aplicação é **Inter**, com fallback para fontes de sistema sem-serifa.
- `font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`

**Escala de Fontes:**
- `--fs-2xs`: 10px (metadados minúsculos) · `--fs-xs`: 11px · `--fs-sm`: 12px
- `--fs-base`: 13px (**linha de base** da aplicação: campos e parágrafos)
- `--fs-md`: 14px · `--fs-lg`: 16px · `--fs-xl`: 18px · `--fs-2xl`: 24px (Painel de Indicadores)

---

### 2.4 Espaçamentos, Raios, Sombras e Motion
**Espaçamentos (base 4px):** `--space-1` 4px | `--space-2` 8px | `--space-3` 12px | `--space-4` 16px | `--space-5` 20px | `--space-6` 24px | `--space-7` 28px | `--space-8` 32px.

**Border Radius:** `--radius-xs` 6px (inputs) | `--radius-sm` 8px (botões) | `--radius-md` 12px (cartões) | `--radius-lg` 16px (panels) | `--radius-xl` 20px (sobreposições) | `--radius-pill` 999px (tags).

**Sombras:** elevação minimalista, apoiada mais em cor que em sombra.
- `--shadow-xs`: none | `--shadow-sm`: `0 1px 2px rgba(3,7,18,0.05)` | `--shadow-md`: `0 4px 12px rgba(3,7,18,0.07)` (hover de grid lists) | `--shadow-lg`: `0 12px 28px rgba(3,7,18,0.12)` (modais).

> No modo escuro vários componentes sem borda precisaram de **ajuste estrutural**, não só de valor: uma pílula definida apenas por sombra desaparece sobre fundo escuro. É o único ponto do tema que muda *propriedade* em vez de valor de token.

**Transições:** `--ease: cubic-bezier(0.4,0,0.2,1)`; durações `--transition-fast` (150ms), `--transition-base` (200ms), `--transition-slow` (300ms).

---

## 3. Layout Principal e Navegação

### 3.1 App Layout
Raiz em `display: flex; flex-direction: row` ancorada em `100vw`/`100vh`, dividida entre `<aside>` (`.sidebar`) e `.main-content`. O overflow vertical é isolado, evitando que o menu desça quando há rolagem no painel principal.

### 3.2 Sidebar Global
- **Expandido:** `255px`. Menus em grupos (`.nav-group-title`) com submenus expansíveis em acordeão (`.nav-group-items`).
- **Recolhido (`.sidebar.collapsed`):** `68px`. O texto oculta-se preservando a acessibilidade.
- **Flyouts:** recolhida, os acordeões viram sub-painéis flutuantes (`z-index: 50`) no hover/clique (`.nav-group-items.flyout-visible`).
- No mobile (`max-width: 768px`) o modo ícones é neutralizado: a barra vira horizontal e os rótulos voltam.

### 3.3 Views (Seções Modulares)
`.view-section` alterna visibilidade por `.active` (lógica JS). Visões pesadas anulam o padding para ocupar a tela inteira (Documentos, Matriz de Riscos, Kanban, Férias, Capacitações).

---

## 4. Biblioteca de Componentes

### 4.1 Tabelas e Grid Lists
- **Tabelas Clássicas (`.data-table`):** dados unificados (Férias, indicadores simples). Sticky header e variação de cor (`--bg-hover`) nas linhas.
- **Grid Lists (`.log-row`, `.cap-row`, `.doc-row`, `.risco-row`, `.arq-row`…):** `display: grid; grid-template-columns` em frações. Reagem ao cursor via `.grid-row-hover`.

**Padrão obrigatório para lista larga** — usado em 11 telas:

```html
<div class="list-scroll x">              <!-- rola na horizontal -->
  <div class="list-scroll-inner min-w-1250">   <!-- piso de largura -->
    <div class="list-head doc-row">…</div>
    <div class="list-body">…</div>
```

Sem o piso de largura, colunas fracionárias são esmagadas em telas estreitas e os rótulos quebram em 3 linhas. Degraus disponíveis: `.min-w-750`, `.min-w-850`, `.min-w-900`, `.min-w-950`, `.min-w-1000`, `.min-w-1100`, `.min-w-1150`, `.min-w-1250`, `.min-w-1400`, `.min-w-1500`. A Matriz de Riscos usa a variante `.overflow-x-auto > .min-w-1400` por ser um caso à parte (cabeçalho fora do `.list-scroll`).

> Não existe `.table-responsive` no projeto, apesar de o nome ser intuitivo — use um dos dois padrões acima.

### 4.2 Formulários (Inputs)
- **Repouso:** inputs e selects com borda cinza e fundo `--bg-panel`.
- **Foco:** fundo vira `--bg-card` e surge um halo via `box-shadow` (`--primary-ring`). Placeholder em `--text-muted`.

### 4.3 Botões (`.btn`)
- **`.btn.primary`** — ações supremas. Fundo `var(--primary)` (**tokenizado**, segue o tema). Padrão rigoroso para todo "Salvar"/"Confirmar" no rodapé dos modais. `.btn-create` e `.save-btn` compartilham a mesma cor de propósito.
- **`.btn.secondary` / `.btn-outline`** — fundo transparente ou branco, demarcado por borda. "Cancelar"/"Fechar".
- **`.btn.danger` / `.btn.success`** — ações destrutivas (exclusão, arquivamento) ou aceites explícitos.
- **`.btn-top-action`** — exclusiva do `.view-header`. Circular `40×40px`, alinhada aos dropdowns de filtro; utilitários de exportação (PDF, e-mail).
- **`.btn-icon`** — squircles de `32px` com stroke cinza, para ações **ao nível de linha** em tabelas/listas (`.edit`, `.archive`, `.del`, `.history`), evitando que as linhas estiquem.
- **`.btn-pdf-download`** — comportamental, para relatórios assíncronos: oculta o `<svg>` e gira um spinner (`.loading::after`) até concluir, com estado `.success`. Respeita `prefers-reduced-motion`.

### 4.4 KPIs e Cards de Indicadores
`kpi-card`: layout horizontal minimalista, sem sombra em repouso, elevando-se na interação. Colorização por classe (`.kpi-fill-blue`, `.kpi-fill-green`, `.kpi-fill-sky`) harmonizada com o `.kpi-icon` à esquerda.

### 4.5 Componentes Especializados
- **Quadro Kanban (`.board-canvas`):** cartões emparelhados horizontalmente, com borda esquerda pintada por prioridade (`prio-Alta`, `prio-Media`, `prio-Baixa`) e `.overdue` para atraso.
- **Matriz de Riscos (`.matrix-table`):** grid-heatmap com os tons `--risk-*` (pastéis e terrosos, sem cansaço visual). Ver §2.2 sobre por que não mudam no escuro.
- **Modais e Overlay (`.modal-box`):** fundo desfocado (`--overlay-bg` + `backdrop-filter`) e entrada animada (`@keyframes modalIn`). A variante `.modal-split-layout` põe dados à esquerda e ações à direita (detalhe do cartão Kanban).
- **Cards de plano 5W2H (`.plan-single-line`):** grid de 9 colunas fracionárias com `padding-right: 120px` reservado às ações. **Exige** o wrapper de §4.1.

---

## 5. Convenções, Acessibilidade e Geração

1. **Design responsivo — estado real, com ressalva:**
   - Só existem **duas** media queries funcionais: `max-width: 768px` (empilha a sidebar) e `max-width: 900px` (colapsa o grid de gráficos).
   - **Não há faixa intermediária (1024–1366px)**, justamente onde as listas de 9–13 colunas mais sofrem. Hoje isso é mitigado pelo scroll horizontal de §4.1, não resolvido — ver `DOCUMENTACAO.md` §9.
   - `@media (prefers-reduced-motion: reduce)` desacelera drasticamente os carregadores.

2. **Identidade Visual por Avatares (`.member-avatar`):** na falta de foto, utilitários `.avatar-pastel-1` a `.12` (céu, menta, rosa, lavanda, pêssego…) atribuídos em runtime **sem colisão** entre membros, gerando pílulas de identificação em Escala e Pessoas.

3. **Geração de PDF — a regra que já causou bug:**
   > ⚠️ Os helpers de PDF (`_gridRowsParaPdf`, `_planoGridsParaTabelaPdf_`) remontam cada linha de CSS Grid como `<tr><td>` de verdade, **copiando a `class` de cada célula** — não `style` inline. Clonar `<div>` para dentro de `<tbody>` é HTML inválido e o conversor as expulsa da tabela.
   >
   > Um comentário antigo neste projeto afirmava o contrário ("as células ficam inline de propósito porque o helper copia o style inline"). Isso era **falso** e induziu à criação de um `_linhasMatrizParaPdf_` que copiava um atributo sempre ausente e descartava as classes — o PDF da Matriz saía sem centralização nem negrito. Corrigido em 29/07 (`DOCUMENTACAO.md` §8.27, item M-04).
   >
   > **Consequência prática:** estilize células de lista por **classe**. Só assim o visual sobrevive ao PDF.

4. **Escrita de CSS:** sem seletor duplicado (auditoria de 26/07 zerou e a de 27/07 confirmou); sem cor chumbada onde exista token; e classe utilitária que perde o último uso deve sair junto — em 29/07 saíram `.px-28`, `.btn-pdf-email` e `.required-mark` por esse motivo.

---
*Baseado estritamente na folha de estilos `CSS.html`. O SGQ mantém arquitetura Vanilla CSS purista: nenhuma dependência visual como Bootstrap ou Tailwind foi introduzida, visando controle, carregamento ultra-rápido e previsibilidade a longo prazo.*
