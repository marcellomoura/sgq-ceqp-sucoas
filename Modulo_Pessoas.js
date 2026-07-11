// ==========================================
// MÓDULO 6 — GESTÃO DE PESSOAS
// (usa CABECALHOS_MEMBROS / CABECALHOS_AFASTAMENTOS e os helpers
//  dataParaISO_ / usuarioAtual_ definidos em Código.js)
// ==========================================

function salvarEscala(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_MEMBERS, CABECALHOS_MEMBROS);
      const rows = aba.getDataRange().getValues();
      const membroId = String(dados.membroId || '');
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === membroId) {
          // Dias gravados como texto legível na planilha: "Segunda (08h-12h), Terça"
          const comboStr = (dados.diasSemana || []).map(d => {
            const h = (dados.horarios && dados.horarios[d]) ? dados.horarios[d] : '';
            return h ? `${d} (${h})` : d;
          });
          aba.getRange(i + 1, 5, 1, 2).setValues([[
            comboStr.join(', '),
            dados.diaPresencial || ''
          ]]);
          registrarLog('Edição de Escala', String(rows[i][1]), 'Escala semanal atualizada.');
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
  try {
    const aba = conectarAba(SHEET_AFASTAMENTOS, CABECALHOS_AFASTAMENTOS);
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
      const p1 = String(r[4] || '').trim();
      const p2 = String(r[5] || '').trim();
      const p3 = String(r[6] || '').trim();
      const abonosSt = String(r[7] || '').trim();
      const aniversario = dataParaISO_(r[8]);
      const licencaSt = String(r[9] || '').trim();

      const ferias = [];
      if (p1) ferias.push(parsePeriod(p1));
      if (p2) ferias.push(parsePeriod(p2));
      if (p3) ferias.push(parsePeriod(p3));

      return {
        id: String(r[0]),
        ano: String(r[1]),
        membroId: String(r[2]),
        membroNome: String(r[3]),
        ferias: ferias,
        abonosFixos: abonosSt ? abonosSt.split(',').map(s => s.trim()).filter(x => x) : [],
        abonoAniv: aniversario ? { inicio: aniversario, fim: aniversario } : null,
        licenca: parsePeriod(licencaSt)
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
  try {
    if (!dados.membroId || !dados.ano)
      return { sucesso: false, mensagem: 'Membro e ano são obrigatórios.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_AFASTAMENTOS, CABECALHOS_AFASTAMENTOS);
      const rows = aba.getDataRange().getValues();
      const periodo = p => p ? p.inicio + ' a ' + p.fim : '';
      const f = dados.ferias || [];
      const abonoStr = Array.isArray(dados.abonos) ? dados.abonos.filter(d => d).join(', ') : '';
      const valores = [
        periodo(f[0]), periodo(f[1]), periodo(f[2]),
        abonoStr, dados.abonoAniversario || '', periodo(dados.licenca)
      ];

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][2]) === String(dados.membroId) && String(rows[i][1]) === String(dados.ano)) {
          aba.getRange(i + 1, 5, 1, 6).setValues([valores]);
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
