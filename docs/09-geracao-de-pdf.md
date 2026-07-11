# 09 — Geração e Envio de PDF

## Visão Geral

O PDF é gerado **inteiramente no servidor**, a partir de um HTML de impressão dedicado — não é uma captura de tela.

Isso é o resultado de uma reformulação: a versão anterior usava `html2canvas`/`html2pdf.js` no cliente para "fotografar" a página visível e fatiar essa imagem em páginas A4. Essa técnica sofria de dois problemas recorrentes e difíceis de eliminar de vez:
- **Cortes e páginas em branco** — o fatiamento de uma imagem em páginas não sabe onde uma linha de tabela ou um gráfico termina, então corta no meio.
- **Flash na tela** — para tirar a "foto" certa, o código precisava esconder a sidebar, trocar gráficos por imagens estáticas e forçar a página a um layout de impressão por um instante, tudo visível ao usuário.

A solução atual monta um **documento HTML autônomo** (não a página do app) com os mesmos dados já carregados na tela, e pede ao Apps Script para convertê-lo em PDF (`Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF)`). Vantagens diretas:
- Nunca corta/deixa página em branco — é uma conversão de documento real, com CSS de paginação (`@page`), não uma imagem fatiada.
- Nenhum flash — a página visível do usuário nunca é alterada; o HTML do relatório é montado como uma string, à parte.
- Mais leve — não depende de nenhuma biblioteca de terceiros (removida a `html2pdf.bundle.min.js`, ~700 KB).

---

## Relatórios Disponíveis

| Chave | Função que monta o corpo do HTML | Nome do Arquivo | Orientação |
|---|---|---|---|
| `dashboard` | `montarHtmlDashboardPdf()` — JS_Kanban.html | `Dashboard_Tarefas_SGQ.pdf` | Paisagem |
| `archived` | `montarHtmlArquivadosPdf()` — JS_Kanban.html | `Cartoes_Arquivados_SGQ.pdf` | Retrato |
| `matriz` | `montarHtmlMatrizPdf()` — JS_Riscos.html | `Matriz_Risco_SGQ.pdf` | Paisagem |
| `acomp` | `montarHtmlAcompanhamentoPdf()` — JS_Riscos.html | `Acompanhamento_Acoes_SGQ.pdf` | Paisagem |

A configuração de cada um (arquivo, título, orientação e qual função monta o corpo) vive em `CFG_PDF`, dentro de `JS_Utilitarios.html`. O nome da função (`montarFn`) é guardado como **string** e resolvido em tempo de clique via `window[cfg.montarFn]()` — não por referência direta — porque os arquivos `JS_*.html` são concatenados em `<script>`s separados na mesma página; resolver por nome evita depender da ordem em que cada `<script>` terminou de rodar.

---

## Como o corpo de cada relatório é montado

Cada `montarHtml*Pdf()` **reaproveita o HTML que já está correto na tela** (tabelas, badges, valores de KPI) em vez de recalcular os dados — isso garante que o PDF sempre reflita exatamente o que o usuário está vendo (mesmos filtros aplicados, mesmos valores), sem duplicar a lógica de renderização em dois lugares.

- **Tabelas de dados**: a linha `<tbody>` já renderizada na tela é clonada via `_tbodyParaPdf(tbodyId)`, que remove qualquer célula marcada com a classe `.no-print` (convenção já usada no app para colunas de ações/botões, que não fazem sentido num documento impresso).
- **Gráficos** (Dashboard): cada `<canvas>` do Chart.js vira uma imagem estática via `canvas.toDataURL('image/png')` e é embutida no HTML como `data:image/png;base64,...` — não existe Canvas fora do navegador, então o gráfico precisa virar imagem antes de chegar ao servidor.
- **KPIs**: lidos diretamente do texto já exibido em tela (`$id(id).innerText`), sem recomputar.
- **Matriz de Risco**: a própria tabela da matriz (`.matrix-table`) já é um `<table>` real — é clonada inteira (`outerHTML`) e reaproveitada.

## Envelope HTML (`_envelopeHtml`, em `JS_Utilitarios.html`)

O corpo montado por cada `montarHtml*Pdf()` é envolvido num documento HTML completo com:
- Um `<style>` **próprio e independente** do `CSS.html` do app — o app usa flexbox/grid extensivamente (não confiáveis no conversor de HTML→PDF do Apps Script), então o envelope define um CSS enxuto, baseado só em tabelas/blocos, cobrindo apenas as classes realmente usadas nos relatórios (`.status-badge`, `.tag-badge`, `.cell-green/yellow/orange/red`, `.risk-badge` etc.).
- Uma regra `@page { size: <largura>mm <altura>mm; margin: 12mm; }` — a orientação é definida com **dimensões explícitas em milímetros** (ex.: `297mm 210mm` para paisagem), não pela palavra-chave `landscape`, por ser mais confiável entre conversores de HTML→PDF.
- Um cabeçalho institucional fixo (`_cabecalhoPdfHtml`) com o nome do sistema e o título do relatório.

---

## Fluxo de Download (`gerarPdfLocal(tipo)`)

```
gerarPdfLocal(tipo)
       │
       ▼ (matriz/acomp esperam garantirRestoData primeiro)
_gerarPdfReal(tipo)
       │
       ▼
1. html = _envelopeHtml(cfg, window[cfg.montarFn]())
2. google.script.run.gerarPdfDeHtml(html, cfg.file)
       │
       ▼ (servidor)
3. Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF)
4. Retorna { sucesso: true, base64 }
       │
       ▼ (cliente)
5. Cria um <a download> com href = data:application/pdf;base64,... e clica nele
```

## Fluxo de Envio por E-mail (`dispararEnvioPdf()`)

```
dispararEnvioPdf()
       │
       ▼
_dispararEnvioPdfReal(email)
       │
       ▼
1. html = _envelopeHtml(cfg, window[cfg.montarFn]())
2. google.script.run.enviarPdfDeHtml(email, html, cfg.file, cfg.title)
       │
       ▼ (servidor — gera E envia na mesma chamada, sem round-trip de Base64)
3. Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF)
4. MailApp.sendEmail({ to, subject, body, attachments: [pdf] })
```

---

## Funções Server-side (`Código.js`)

### `gerarPdfDeHtml(htmlContent, nomeArquivo)`
Converte o HTML recebido em PDF e devolve o conteúdo em Base64 para o cliente baixar.

### `enviarPdfDeHtml(destinatario, htmlContent, nomeArquivo, titulo)`
Mesma conversão, mas envia o PDF por e-mail via `MailApp` em vez de devolvê-lo — evita transitar o PDF (maior que o HTML) de volta ao cliente só para reenviá-lo ao servidor no envio por e-mail.

Ambas registram a operação em `registrarLog` (envio de PDF) e vivem em `Código.js`, não em `Modulo_Riscos.js` (onde ficava a antiga `enviarPdfPorEmail`), por serem utilitários genéricos usados pelos quatro relatórios, não específicos do módulo de Riscos.

---

## Modal de Envio por E-mail

`#modal-pdf-email` — Modal com campo de e-mail do destinatário. Disparado pelo botão "Enviar por E-mail" presente nos módulos Dashboard, Arquivados, Matriz de Risco e Plano de Ação.
