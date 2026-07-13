// ==========================================
// MÓDULO 6 — GESTÃO DE PESSOAS
// (usa CABECALHOS_MEMBROS / CABECALHOS_AFASTAMENTOS e os helpers
//  dataParaISO_ / usuarioAtual_ definidos em Código.js)
// ==========================================

function salvarEscala(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    // Validação de integridade no servidor (defense-in-depth — o cliente já
    // valida, mas uma chamada direta poderia gravar escala incoerente).
    const diasTrab = Array.isArray(dados.diasSemana) ? dados.diasSemana : [];
    const presenciais = String(dados.diaPresencial || '').split(',').map(s => s.trim()).filter(x => x);
    for (const p of presenciais) {
      if (diasTrab.indexOf(p) === -1)
        return { sucesso: false, mensagem: 'Dia presencial "' + p + '" não está entre os dias trabalhados.' };
    }
    if (dados.horarios) {
      for (const k in dados.horarios) {
        if (String(dados.horarios[k]).indexOf(',') !== -1)
          return { sucesso: false, mensagem: 'O horário não pode conter vírgula.' };
      }
    }
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
      const C = colIdx_(CABECALHOS_MEMBROS);
      const rows = aba.getDataRange().getValues();
      const membroId = String(dados.membroId || '');
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][C('ID')]) === membroId) {
          // Dias gravados como texto legível na planilha: "Segunda (08h-12h), Terça"
          const comboStr = (dados.diasSemana || []).map(d => {
            const h = (dados.horarios && dados.horarios[d]) ? dados.horarios[d] : '';
            return h ? `${d} (${h})` : d;
          });
          // Colunas contíguas Dias Semana + Dia Presencial
          aba.getRange(i + 1, C('Dias Semana')+1, 1, 2).setValues([[
            comboStr.join(', '),
            dados.diaPresencial || ''
          ]]);
          registrarLog('Edição de Escala', String(rows[i][C('Nome')]), 'Escala semanal atualizada.');
          return { sucesso: true };
        }
      }
      return { sucesso: false, mensagem: 'Membro não encontrado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

// ─── AFASTAMENTOS (Férias, Abonos, Licença) ────────────────────────────────────
// Uma linha por (Membro + Ano) na aba própria SHEET_AFASTAMENTOS. Isso permite
// ter vários anos abertos simultaneamente (nada é arquivado/apagado ao virar
// o ano) — a tela troca de ano só filtrando quais linhas exibir/editar.

function getAfastamentos() {
  if (!isMembro_()) throw new Error('Acesso Negado.');
  try {
    const aba = conectarAba(SHEET_AFASTAMENTOS, CABECALHOS_AFASTAMENTOS);
    const CA = colIdx_(CABECALHOS_AFASTAMENTOS);
    const rows = aba.getDataRange().getValues();
    if (rows.length <= 1) return [];

    // Mais estrito que o parsePeriod de getKanbanData_members_: aqui um
    // texto sem ' a ' é descartado (null) em vez de virar período de 1 dia.
    const parsePeriod = (str) => {
      if (!str) return null;
      const pts = String(str).split(' a ');
      return pts.length === 2 ? { inicio: pts[0], fim: pts[1] } : null;
    };

    return rows.slice(1).map(r => {
      const p1 = String(r[CA('Férias 1')] || '').trim();
      const p2 = String(r[CA('Férias 2')] || '').trim();
      const p3 = String(r[CA('Férias 3')] || '').trim();
      const abonosSt = String(r[CA('Abonos')] || '').trim();
      const aniversario = dataParaISO_(r[CA('Abono Aniversário')]);
      const licencaSt = String(r[CA('Licença Servidor/Prêmio')] || '').trim();
      const demaisSt = String(r[CA('Demais Afastamentos')] || '').trim();

      // Licença Servidor/Prêmio: pode ter várias. Formato novo = JSON
      // [{inicio,fim}]; formato antigo = "inicio a fim" (um período), migrado
      // para lista de um item na leitura.
      let licencas = [];
      if (licencaSt) {
        if (licencaSt.charAt(0) === '[') {
          try { const arr = JSON.parse(licencaSt); if (Array.isArray(arr)) licencas = arr.filter(x => x && x.inicio && x.fim); } catch(e) {}
        } else {
          const pL = parsePeriod(licencaSt); if (pL) licencas = [pL];
        }
      }

      const ferias = [];
      if (p1) ferias.push(parsePeriod(p1));
      if (p2) ferias.push(parsePeriod(p2));
      if (p3) ferias.push(parsePeriod(p3));

      // Demais afastamentos: lista livre gravada como JSON (descrição + período)
      let demais = [];
      if (demaisSt) { try { const arr = JSON.parse(demaisSt); if (Array.isArray(arr)) demais = arr; } catch(e) {} }

      return {
        id: String(r[CA('ID')]),
        ano: String(r[CA('Ano')]),
        membroId: String(r[CA('Membro ID')]),
        membroNome: String(r[CA('Membro Nome')]),
        ferias: ferias,
        abonosFixos: abonosSt ? abonosSt.split(',').map(s => s.trim()).filter(x => x) : [],
        abonoAniv: aniversario ? { inicio: aniversario, fim: aniversario } : null,
        licencas: licencas,
        demais: demais
      };
    });
  } catch(e) {
    console.error('getAfastamentos falhou: ' + e);
    return [];
  }
}

// Grava (ou atualiza, se já existir) o registro do membro para o ano
// informado. Nunca mexe nos registros de outros anos do mesmo membro.
function salvarAfastamento(dados) {
  if (!isMembro_()) return { sucesso: false, mensagem: 'Acesso Negado.' };
  try {
    if (!dados.membroId || !dados.ano)
      return { sucesso: false, mensagem: 'Membro e ano são obrigatórios.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_AFASTAMENTOS, CABECALHOS_AFASTAMENTOS);
      const CA = colIdx_(CABECALHOS_AFASTAMENTOS);
      const rows = aba.getDataRange().getValues();
      const periodo = p => p ? p.inicio + ' a ' + p.fim : '';
      const f = dados.ferias || [];
      const abonoStr = Array.isArray(dados.abonos) ? dados.abonos.filter(d => d).join(', ') : '';
      const demaisStr = Array.isArray(dados.demais) && dados.demais.length ? JSON.stringify(dados.demais) : '';
      const licencasArr = Array.isArray(dados.licencas) ? dados.licencas.filter(l => l && l.inicio && l.fim) : [];
      const licencaStr = licencasArr.length ? JSON.stringify(licencasArr) : '';
      // Bloco Férias 1 → Demais Afastamentos (7 colunas contíguas)
      const valores = [
        periodo(f[0]), periodo(f[1]), periodo(f[2]),
        abonoStr, dados.abonoAniversario || '', licencaStr, demaisStr
      ];

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][CA('Membro ID')]) === String(dados.membroId) && String(rows[i][CA('Ano')]) === String(dados.ano)) {
          aba.getRange(i + 1, CA('Férias 1')+1, 1, 7).setValues([valores]);
          registrarLog('Edição de Afastamentos', dados.membroNome + ' (' + dados.ano + ')', 'Afastamentos atualizados.');
          return { sucesso: true };
        }
      }
      // Não existia registro deste membro para este ano — cria um novo
      const id = getNextId(SHEET_AFASTAMENTOS, 'AF-');
      aba.appendRow([id, dados.ano, dados.membroId, dados.membroNome].concat(valores));
      registrarLog('Cadastro de Afastamentos', dados.membroNome + ' (' + dados.ano + ')', 'Novo registro anual criado.');
      return { sucesso: true };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}
