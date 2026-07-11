# 09 — Geração e Envio de PDF

## Visão Geral

O sistema suporta geração de relatórios em PDF de duas formas:
1. **Download local** — gerado no cliente via `html2pdf.js` e salvo diretamente no navegador
2. **Envio por e-mail** — gerado no cliente, convertido para Base64, enviado ao servidor e disparado via `MailApp`

---

## Relatórios Disponíveis

| Chave | Elemento HTML Fonte | Nome do Arquivo | Orientação |
|---|---|---|---|
| `dashboard` | `#view-dashboard` | `Dashboard_Tarefas_SGQ.pdf` | Paisagem |
| `archived` | `#view-archived` | `Cartoes_Arquivados_SGQ.pdf` | Retrato |
| `matriz` | `#area-matriz` | `Matriz_Risco_SGQ.pdf` | Paisagem |
| `acomp` | `#area-acomp` | `Acompanhamento_Acoes_SGQ.pdf` | Paisagem |

---

## Fluxo de Geração Local

```
gerarPdfLocal(tipo)
       │
       ▼
1. Oculta sidebar (#sidebar)
2. Força overflow: visible em containers
3. Converte <canvas> Chart.js → <img> (data:image/png)
4. Configura html2pdf:
   - margin: 10
   - image.quality: 0.98
   - html2canvas.scale: 2 (alta resolução)
   - jsPDF: orientação por tipo (landscape/portrait)
5. Chama html2pdf().save(nomeArquivo)
6. Restaura DOM (sidebar, overflow, canvas)
```

A conversão de `<canvas>` para `<img>` é necessária porque o `html2canvas` (usado internamente pelo `html2pdf.js`) não consegue capturar contextos WebGL/Canvas já renderizados pelo Chart.js.

---

## Fluxo de Envio por E-mail

```
dispararEnvioPdf()
       │
       ▼
1. Obtém destinatário do campo #pdf-email-destinatario
2. Chama _gerarPdfLocalReal(tipo) → retorna blob
3. Converte blob → Base64 (FileReader.readAsDataURL)
4. google.script.run.enviarPdfPorEmail(
     destinatario, base64Pdf, nomeArquivo, titulo
   )
       │
       ▼ (servidor)
5. Decodifica Base64 → Blob
6. MailApp.sendEmail({
     to: destinatario,
     subject: titulo,
     body: "...",
     attachments: [blob.setName(nomeArquivo)]
   })
```

---

## Função Server-side: `enviarPdfPorEmail`

```javascript
function enviarPdfPorEmail(destinatario, base64Pdf, nomeArquivo, titulo)
```

**Parâmetros:**
- `destinatario` — endereço de e-mail do destinatário
- `base64Pdf` — conteúdo do PDF codificado em Base64
- `nomeArquivo` — nome do arquivo para o anexo
- `titulo` — assunto do e-mail

**Implementação:** Usa `MailApp.sendEmail()` do Google Apps Script. O PDF é decodificado de Base64 para um `Blob` e anexado ao e-mail.

**Quota:** `MailApp` está sujeito às cotas do Google Workspace (geralmente 100–1500 e-mails/dia dependendo do plano).

---

## Modal de Envio por E-mail

`#modal-pdf-email` — Modal com campo de e-mail do destinatário e seletor do tipo de relatório. Disparado pelo botão "Enviar por E-mail" presente nos módulos Dashboard e Riscos.

---

## Configuração html2pdf.js

```javascript
{
  margin: 10,
  filename: nomeArquivo,
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: {
    scale: 2,           // 2× resolução para nitidez
    useCORS: true,
    logging: false
  },
  jsPDF: {
    unit: 'mm',
    format: 'a4',
    orientation: orientacao  // 'landscape' ou 'portrait'
  }
}
```
