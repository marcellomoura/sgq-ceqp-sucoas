// ==========================================
// MÓDULO 6 — GESTÃO DE PESSOAS
// ==========================================

function salvarEscala(dados) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_MEMBERS, ['ID','Nome','Cargo','Email Funcional','Dias Semana','Dia Presencial','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio']);
      const rows = aba.getDataRange().getValues();
      const membroId = String(dados.membroId || '');
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === membroId) {
          
          let comboStr = [];
          (dados.diasSemana || []).forEach(d => {
             let h = (dados.horarios && dados.horarios[d]) ? dados.horarios[d] : '';
             comboStr.push(h ? `${d} (${h})` : d);
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

function salvarFerias(dados) {
  try {
    if (!dados.membroId)
      return { sucesso: false, mensagem: 'Membro obrigatório.' };
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_MEMBERS, ['ID','Nome','Cargo','Email Funcional','Dias Semana','Dia Presencial','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio']);
      const rows = aba.getDataRange().getValues();
      const membroId = String(dados.membroId);
      
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === membroId) {
          
          const f1 = dados.ferias && dados.ferias[0] ? dados.ferias[0].inicio + ' a ' + dados.ferias[0].fim : '';
          const f2 = dados.ferias && dados.ferias[1] ? dados.ferias[1].inicio + ' a ' + dados.ferias[1].fim : '';
          const f3 = dados.ferias && dados.ferias[2] ? dados.ferias[2].inicio + ' a ' + dados.ferias[2].fim : '';
          
          let abonoStr = '';
          if (dados.abonos && Array.isArray(dados.abonos)) {
            abonoStr = dados.abonos.filter(d => d).join(', ');
          }
          
          const abonoNiver = dados.abonoAniversario || '';
          const licenca = dados.licenca ? dados.licenca.inicio + ' a ' + dados.licenca.fim : '';

          aba.getRange(i + 1, 7, 1, 6).setValues([[f1, f2, f3, abonoStr, abonoNiver, licenca]]);
          registrarLog('Edição de Afastamentos', String(rows[i][1]), 'Cadastro de afastamentos atualizado nas colunas nativas.');
          return { sucesso: true };
        }
      }
      return { sucesso: false, mensagem: 'Membro não encontrado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function excluirFerias(membroId) {
  try {
    return comBloqueio(() => {
      const aba = conectarAba(SHEET_MEMBERS, ['ID','Nome','Cargo','Email Funcional','Dias Semana','Dia Presencial','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio']);
      const rows = aba.getDataRange().getValues();
      const mId = String(membroId);
      
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === mId) {
          const ref = String(rows[i][1]); // Nome do membro
          aba.getRange(i + 1, 7, 1, 6).clearContent();
          registrarLog('Exclusão de Afastamentos', ref, 'Todos os afastamentos limpos das colunas nativas.');
          return { sucesso: true };
        }
      }
      return { sucesso: false, mensagem: 'Membro não encontrado.' };
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function getFerias() {
  try {
    const aba = conectarAba(SHEET_MEMBERS, ['ID','Nome','Cargo','Email Funcional','Dias Semana','Dia Presencial','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio']);
    const rows = aba.getDataRange().getValues();
    if (rows.length <= 1) return [];
    
    let listaAfastamentos = [];
    
    const formatarData = function(val) {
      if (Object.prototype.toString.call(val) === '[object Date]') {
        let yyyy = val.getFullYear();
        let mm = String(val.getMonth() + 1).padStart(2, '0');
        let dd = String(val.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      return String(val || '').trim();
    };

    for (let i = 1; i < rows.length; i++) {
      const membroId   = String(rows[i][0]);
      const membroNome = String(rows[i][1]);
      const membroRole = String(rows[i][2]);
      
      const p1 = String(rows[i][6] || '').trim();
      const p2 = String(rows[i][7] || '').trim();
      const p3 = String(rows[i][8] || '').trim();
      const abonosSt = String(rows[i][9] || '').trim();
      const aniversario = formatarData(rows[i][10]);
      const licencaSt = String(rows[i][11] || '').trim();

      const parsePeriod = (str) => {
        if (!str) return null;
        const pts = str.split(' a ');
        if (pts.length === 2) return { inicio: pts[0], fim: pts[1] };
        return null;
      };

      const ferias = [];
      if (p1) ferias.push(parsePeriod(p1));
      if (p2) ferias.push(parsePeriod(p2));
      if (p3) ferias.push(parsePeriod(p3));
      
      const abonosArr = abonosSt ? abonosSt.split(',').map(s => s.trim()).filter(x => x) : [];
      let abonoAniversario = null;
      if(aniversario) abonoAniversario = { inicio: aniversario, fim: aniversario };

      const objAfast = {
        ferias: ferias,
        abonosFixos: abonosArr,
        abonoAniv: abonoAniversario,
        licenca: parsePeriod(licencaSt)
      };

      listaAfastamentos.push({
        membroId:   membroId,
        membroNome: membroNome,
        membroRole: membroRole,
        afastamentos: objAfast
      });
    }
    return listaAfastamentos;
  } catch(e) {
    console.error('getFerias falhou: ' + e);
    return [];
  }
}

function arquivarAfastamentosGeral(anoArquivo, membroIdAlvo) {
  try {
    return comBloqueio(() => {
      if (!anoArquivo) return { sucesso: false, mensagem: 'Ano obrigatório.' };
      const abaMembros = conectarAba(SHEET_MEMBERS, ['ID','Nome','Cargo','Email Funcional','Dias Semana','Dia Presencial','Férias 1','Férias 2','Férias 3','Abonos','Abono Aniversário','Licença Servidor/Prêmio', 'E-mail Pessoal']);
      const abaHist = conectarAba(SHEET_AFAST_HIST, ['Ano', 'Nome', 'Cargo', 'Férias 1', 'Férias 2', 'Férias 3', 'Abonos Fixos', 'Abono Aniversário', 'Licença Servidor/Prêmio']);
      
      const rows = abaMembros.getDataRange().getValues();
      if (rows.length <= 1) return { sucesso: false, mensagem: 'Sem membros para arquivar.' };
      
      const formatarData = function(val) {
        if (Object.prototype.toString.call(val) === '[object Date]') {
          let yyyy = val.getFullYear(); let mm = String(val.getMonth() + 1).padStart(2, '0'); let dd = String(val.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
        return String(val || '').trim();
      };

      const novosArquivos = [];
      let alvoEncontrado = false;
      
      for (let i = 1; i < rows.length; i++) {
        let r = rows[i];
        if (membroIdAlvo && String(r[0]) !== String(membroIdAlvo)) continue;
        
        let p1 = String(r[6] || '').trim();
        let p2 = String(r[7] || '').trim();
        let p3 = String(r[8] || '').trim();
        let abs = String(r[9] || '').trim();
        let niver = formatarData(r[10]);
        let lic = String(r[11] || '').trim();
        
        if (p1 || p2 || p3 || abs || niver || lic) {
          novosArquivos.push([
            anoArquivo,
            String(r[1]), // Nome
            String(r[2]), // Cargo
            p1, p2, p3, abs, niver, lic
          ]);
          // Wipe this member's absence columns
          abaMembros.getRange(i + 1, 7, 1, 6).clearContent();
        }
        if (membroIdAlvo) { alvoEncontrado = true; break; }
      }
      
      if (novosArquivos.length > 0) {
        abaHist.getRange(abaHist.getLastRow() + 1, 1, novosArquivos.length, 9).setValues(novosArquivos);
        let logMsg = membroIdAlvo ? `Afastamentos do membro arquivados.` : `${novosArquivos.length} registros movidos para histórico.`;
        registrarLog('Arquivamento Afastamentos', membroIdAlvo ? `Membro ID: ${membroIdAlvo}` : `Todos (${anoArquivo})`, logMsg);
        return { sucesso: true, arquivados: novosArquivos.length };
      } else {
        return { sucesso: true, arquivados: 0, mensagem: 'Nenhum afastamento aberto para arquivar neste membro.' };
      }
    });
  } catch(e) { return { sucesso: false, mensagem: e.toString() }; }
}

function getHistoricoAfastamentos() {
  try {
    const abaHist = conectarAba(SHEET_AFAST_HIST, ['Ano', 'Nome', 'Cargo', 'Férias 1', 'Férias 2', 'Férias 3', 'Abonos Fixos', 'Abono Aniversário', 'Licença Servidor/Prêmio']);
    const hData = abaHist.getDataRange().getValues();
    if (hData.length <= 1) return [];
    
    const formatarData = function(val) {
      if (Object.prototype.toString.call(val) === '[object Date]') {
        let yyyy = val.getFullYear(); let mm = String(val.getMonth() + 1).padStart(2, '0'); let dd = String(val.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      return String(val || '').trim();
    };

    return hData.slice(1).map(r => ({
      ano: String(r[0]),
      nome: String(r[1]),
      cargo: String(r[2]),
      f1: String(r[3] || ''),
      f2: String(r[4] || ''),
      f3: String(r[5] || ''),
      abonos: String(r[6] || ''),
      niver: formatarData(r[7]),
      licenca: String(r[8] || '')
    }));
  } catch(e) { console.error('getHist falhou: ' + e); return []; }
}
