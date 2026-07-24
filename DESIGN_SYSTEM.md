# Design System — SGQ · CEQP / SUCOAS

Bem-vindo à documentação oficial do Design System do Sistema de Gestão de Qualidade. Este guia documenta as regras, padrões visuais e comportamentos dos componentes do SGQ baseados na arquitetura CSS do projeto.

## 1. Visão Geral e Princípios
- **Estética:** "Light Mode Premium". Utiliza uma interface clara e de alto contraste.
- **Elevação vs. Sombras:** O design evita sombras pesadas. A separação entre elementos é feita predominantemente através de bordas claras (`var(--border-color)`) e tons sutis de fundo, garantindo um visual limpo e fluido sem pesar o processamento da interface.
- **Micro-interações:** Transições suaves baseadas em curvas de atenuação consistentes para feedback instantâneo e amigável, sem exageros nas animações de elementos estáticos.
- **Densidade Espacial:** Uso extensivo de espaços baseados em múltiplos de 4 para melhor legibilidade, alinhamento simétrico e consistência (Grid System Base 4).

---

## 2. Design Tokens

### 2.1 Cores (Color Palette)
Todas as cores devem ser aplicadas sempre que possível utilizando as variáveis nativas (`var(--nome-da-variavel)`).

#### Marca e Ação (Primária)
O tema primário utiliza tons quase pretos ("tinta preta") para gerar forte contraste contra os fundos claros e trazer aspecto profissional.
- `--primary`: `#030712`
- `--primary-hover`: `#1f2937`
- `--primary-active`: `#111827`
- `--primary-light`: `#f3f4f6`
- `--primary-lighter`: `#f9fafb`
- `--primary-text`: `#030712`

#### Cores de Superfície e Fundo
- `--bg-app`: `#f3f4f6` (Fundo geral da aplicação)
- `--bg-card`: `#ffffff` (Fundo branco absoluto, exclusivo para cartões, tabelas e modais em destaque)
- `--bg-panel`: `#f9fafb` (Superfície leve para divisões internas em modais/tabelas)
- `--bg-subtle`, `--bg-hover`: `#f3f4f6`
- `--kanban-list-bg`: `#D3D6DC` (Fundo acinzentado específico das colunas do quadro Kanban)

#### Textos
- `--text-main`: `#030712` (Prioridade máxima de cor e legibilidade de dados)
- `--text-secondary`: `#4b5563` (Títulos de seções, cabeçalhos, textos secundários)
- `--text-muted`: `#6b7280` (Textos de apoio, placeholders, metadados)
- `--text-inverse`: `#ffffff` (Texto claro exclusivamente usado sobre fundos escuros e CTAs primários)

#### Bordas
- `--border-color`: `#e5e7eb` (Borda padrão para separar componentes principais)
- `--border-subtle`: `#eef0f2` (Divisões internas menos contrastantes, ex: separação de linhas de tabelas)
- `--border-strong`: `#d1d5db` (Bordas de foco ou para isolamento de componentes contidos)

#### Semântica de Feedback e Status
O SGQ usa uma paleta unificada e acessível de cores semânticas vinculadas por escalas:
- **Sucesso (Verde Menta)**
  - Fundo: `--success-bg` (`#DFF6EF`), Borda: `--success-border` (`#A6E0D2`)
  - Texto/Ícone: `--success-text` (`#157965`), Base: `--success` (`#2CA98F`)
- **Aviso/Atenção (Amarelo Dourado)**
  - Fundo: `--warning-bg` (`#FBF3D3`), Borda: `--warning-border` (`#EBD98C`)
  - Texto/Ícone: `--warning-text` (`#795B15`), Base: `--warning` (`#C99A2E`)
- **Perigo/Crítico/Atrasado (Vermelho Tijolo)**
  - Fundo: `--danger-bg` (`#FCE1DE`), Borda: `--danger-border` (`#F3B8B0`)
  - Texto/Ícone: `--danger-text` (`#791E15`), Base: `--danger` (`#D8483A`)
- **Informação/Ação Secundária (Roxo Lavanda e Azul)**
  - **Info (Roxo suave):** Fundo `--info-bg` (`#E9E6FB`), Borda `--info-border` (`#CBC3F3`), Base `--info` (`#7A6CDD`)
  - **Destaque Azul:** Acento `--accent` (`#2b7fff`), útil em links ou gráficos (exceções de ação rápida).

---

### 2.2 Tipografia
A família tipográfica padrão e única da aplicação é **Inter**. Caso a Inter falhe por rede, utilizam-se fontes de sistema seguras e otimizadas sem-serifa.
- `font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`

**Escala de Fontes:**
- `--fs-2xs`: 10px (Metadados minúsculos e labels secundários)
- `--fs-xs`: 11px (Informações secundárias do sistema)
- `--fs-sm`: 12px (Cabeçalhos de tabela menores e subtítulos)
- `--fs-base`: 13px (Padrão e linha de base da aplicação, usado em campos e parágrafos)
- `--fs-md`: 14px (Títulos pequenos)
- `--fs-lg`: 16px (Títulos de seções primárias)
- `--fs-xl`: 18px (Títulos de formulários/modais)
- `--fs-2xl`: 24px (Títulos proeminentes de telas, como o Painel de Indicadores)

---

### 2.3 Espaçamentos, Raios e Sombras
**Espaçamentos Base (System Base 4px):**
`--space-1`: 4px | `--space-2`: 8px | `--space-3`: 12px | `--space-4`: 16px | `--space-5`: 20px | `--space-6`: 24px | `--space-7`: 28px | `--space-8`: 32px.

**Border Radius (Arredondamento):**
- `--radius-xs`: 6px (Micro componentes e inputs)
- `--radius-sm`: 8px (Botões e caixas pequenas)
- `--radius-md`: 12px (Cartões do sistema)
- `--radius-lg`: 16px (Panels e seções amplas)
- `--radius-xl`: 20px (Caixas de sobreposição e janelas muito grandes)
- `--radius-pill`: 999px (Utilizado em tags nativas e botões curvos unificados)

**Sombras (Elevations):**
A elevação visual na aplicação é minimalista, contando muito com mudança de cor para demarcar limites:
- `--shadow-xs`: none
- `--shadow-sm`: `0 1px 2px rgba(3,7,18,0.05)` (Sombras do cotidiano, cards)
- `--shadow-md`: `0 4px 12px rgba(3,7,18,0.07)` (Hover para grid lists em interação de mouse)
- `--shadow-lg`: `0 12px 28px rgba(3,7,18,0.12)` (Modais e popovers suspensos)

**Transições (Motion):**
A constante `--ease: cubic-bezier(0.4,0,0.2,1)` guia animações rápidas, naturais e não-lineares.
- Durações: `--transition-fast` (150ms), `--transition-base` (200ms) e `--transition-slow` (300ms).

---

## 3. Layout Principal e Navegação

### 3.1 App Layout
A raiz do aplicativo baseia-se num simples e responsivo `display: flex; flex-direction: row` ancorado em `100vw` e `100vh`. Ele é divido fundamentalmente entre uma `<aside>` (`.sidebar`) e a área `.main-content`. O overflow vertical é isolado, evitando que o menu desça quando há rolagem no painel principal.

### 3.2 Sidebar Global
A navegação lateral é altamente reativa.
- **Modo Expandido:** Possui largura de `255px`. Os menus organizam-se em grupos (ex: `.nav-group-title`), possuindo submenus expansíveis via acordeão animado para baixo (`.nav-group-items`).
- **Modo Recolhido (`.sidebar.collapsed`):** A largura recua fluidamente para `68px`. Todo texto oculta-se visualmente preservando a acessibilidade.
- **Flyouts:** Estando na forma recolhida, os acordeões transformam-se em sub-painéis "flyout" flutuantes posicionados absolutamente (`z-index: 50`) no hover ou clique (`.nav-group-items.flyout-visible`), possibilitando fácil navegação de desktop.

### 3.3 Views (Seções Modulares)
O conteúdo central (`.view-section`) alterna sua visibilidade pelo estado de `.active` (lógica JS). Algumas visões pesadas e de relatórios forçam um visual compacto, anulando o padding para ocupar a tela completamente e gerar fluidez de imersão (ex: Visualizações em listagens complexas de Documentos, Matriz de Riscos, Kanban, Ferias e Capacitações).

---

## 4. Biblioteca de Componentes

### 4.1 Tabelas e Grid Lists Modernas
Para visualização de registros da organização, o SGQ une tabelas clássicas e listagens CSS Grid avançadas:
- **Tabelas Clássicas (`.data-table`):** Utilizadas em dados unificados (ex: Férias e Indicadores Simples). Caracterizam-se pelo Sticky Header (título fixo no scroll) e comportamento clássico com variação de cor (`--bg-hover`) nas linhas.
- **Grid Lists (Ex: `.log-row`, `.cap-row`, `.doc-row`):** Uma evolução semântica. Utilizam `display: grid; grid-template-columns` contendo diversas frações (`fr`). Os registros parecem mini-cards empilhados horizontalmente e respondem visualmente ao cursor flutuando e mudando de sombra com transições limpas de CPU (`.grid-row-hover`).

### 4.2 Formulários (Inputs)
A arquitetura de inputs garante alinhamento e facilidade na seleção da informação.
- **Padrão em repouso:** Inputs (`[type="text"]`, `[type="date"]`, etc) e selects ganham bordas cinzas e fundos em tom `--bg-panel` (suave distinção).
- **Em Atividade / Foco:** Recebem a cor `--bg-card` (branco estrito), e geram um halo envolvente azulado ou preto (focus-ring nativo de acessibilidade via `box-shadow`). Placeholder (`--text-muted`) suaviza a leitura.

### 4.3 Botões (`.btn`)
Categorizados por sua prioridade:
- `.btn.primary`: Para as ações supremas de telas (como submissão de cadastro). Fundo na cor dark (`#2E323C`). Hover e Active trazem nuances suaves, além de desativarem quando em processamento ou disabled.
- `.btn.secondary` e `.btn-outline`: Fundo transparente ou branco que só demarca interação por bordas fortes.
- `.btn.danger` / `.btn.success`: Comandos que sinalizam perdas destrutivas (deleção e arquivamento) ou aceites explícitos.
- `.btn-icon`: Botões utilitários contidos (quadrados de aprox `32px`) responsáveis por ações na listagem de tabelas (edição `.edit`, visão de revisões `.rev`, banimento/deleção `.del`).
- `.btn-pdf-download`: Botões circulares assíncronos. Eles possuem a capacidade nativa no CSS de sumirem seu ícone svg e rotacionarem infinitamente um "spinner" (`.loading::after`) de forma contínua até voltarem ao status normal, indicando andamento do processamento do relatorio.

### 4.4 KPIs e Cards de Indicadores
A seção de métricas (Dashboards) engloba os `kpi-card`:
- Formados por layout horizontal e muito minimalistas, sem sombra em repouso.
- Elevam-se verticalmente no contato interativo.
- Possuem forte colorização dinâmica baseada em CSS condicional ou herança em árvore (`.kpi-fill-blue`, `.kpi-fill-green`, `.kpi-fill-sky`), de forma harmônica a um `.kpi-icon` no lado esquerdo do quadro.

### 4.5 Componentes Especializados
- **Quadro Kanban (`.board-canvas`):** Componente desenhado para fluidez massiva de cartões horizontalmente emparelhados. Os cartões recebem classes lógicas que pintam suas bordas verticais esquerdas de acordo com a prioridade (`prio-Alta`, `prio-Media`, `prio-Baixa`). Além disso, assumem tons de vermelho gritante para alertar o usuário através da classe `.overdue`.
- **Matriz de Riscos Semântica (`.matrix-table`):** Utiliza um Grid-Heatmap de ponta a ponta. Ao contrário das badges usuais, o sistema usa tons pastéis e terrosos exclusivos para representar gradações sem causar cansaço visual (`#72C9B7`, `#E6CC8C`, `#E6AD7A`, `#E27E73`).
- **Modais e Overlay (`.modal-box`):** Um background desfocado suave (`rgba + backdrop-filter`) com entrada animada abrigará as opções cruciais do sistema (`@keyframes modalIn`). Um layout derivado fundamental é a `modal-split-layout` com colunas de dados do lado esquerdo e de ações na coluna da direita para detalhes dos cartões de tarefas Kanban.

---

## 5. Convenções, Acessibilidade e Geração
1. **Design Responsivo & Redução de Animações:**
   - Para telas pequenas, o layout abandona a barra lateral rígida para empilhá-la acima do conteúdo (`flex-direction: column`).
   - Respeito pela acessibilidade através da `@media (prefers-reduced-motion: reduce)`, reduzindo drasticamente a velocidade dos carregadores.
2. **Identidade Visual por Avatares (`.member-avatar`):**
   - Na falta de uma fotografia de funcionário, o CSS abarca dezenas de utilitários como `.avatar-pastel-1` a `.12` (Céu, Menta, Rosa, Lavanda, Pêssego, etc) com forte harmonia colorimétrica calculada em runtime para renderizar "pílulas de identificação" em views de Escalas e Pessoas.
3. **Geração Nativa de Documentos (`_gridRowsParaPdf`):**
   - O Design System prevê que certas regras no código gerador precisam herdar estilos fixos. Algumas tabelas mantêm colorizações e margens declaradas pontualmente para sobreviverem ao ecossistema de geração HTML-para-PDF do Google Apps Script sem quebras e deformações do visual projetado.

---
*Este documento é gerado baseando-se estritamente na folha de estilos `CSS.html`. O Sistema de Gestão de Qualidade mantém sua arquitetura Vanilla CSS purista. Nenhuma dependência visual como Bootstrap ou Tailwind foi introduzida, visando controle, carregamento ultra-rápido e previsibilidade em longo prazo.*
