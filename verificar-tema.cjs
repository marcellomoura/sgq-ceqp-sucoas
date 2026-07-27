#!/usr/bin/env node
/**
 * verificar-tema.cjs — guarda de regressão do modo escuro.
 *
 * Rodar ANTES de cada `clasp push`:
 *     node verificar-tema.cjs
 *
 * O modo escuro depende de duas listas de tokens que precisam andar juntas
 * (`:root, .tema-claro` e `[data-theme="dark"]`, em CSS.html). O risco não é
 * de performance: é alguém adicionar um token novo à paleta clara e esquecer
 * a contraparte escura. O sintoma seria um elemento com cor de tema claro no
 * meio da interface escura — silencioso, sem erro no console, e só percebido
 * por inspeção visual da tela certa.
 *
 * Este script transforma esse risco silencioso em saída de erro. Sai com
 * código 1 se achar problema, para poder ser encadeado num script de deploy.
 *
 * Extensão .cjs de propósito: o .clasp.json declara scriptExtensions
 * [".js", ".gs"] com rootDir na raiz, então um arquivo .js aqui seria
 * enviado ao Apps Script pelo clasp push — onde require/process/__dirname
 * não existem. Com .cjs o Node roda normalmente e o clasp ignora.
 *
 * Ver DOCUMENTACAO.md §8.20.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ARQ_CSS = path.join(__dirname, 'CSS.html');

// Tokens que existem só na paleta clara DE PROPÓSITO. Cada isenção tem motivo
// registrado — se algo entrar aqui, o motivo precisa vir junto.
const ISENTOS = [
  // Geometria, tipografia e tempo não mudam com o tema.
  /^--(radius|space|fs|ease|transition)(-|$)/,
  // Heatmap da Matriz de Risco: as 4 cores precisam preservar a ordem
  // perceptual (baixo -> crítico) e o texto contrasta contra o próprio
  // preenchimento, não contra a página. Ainda vão para dentro do PDF.
  /^--risk-/,
  // Apelidos que apontam para --danger/--warning/--success: seguem sozinhos.
  /^--(tag-alta|tag-media|tag-baixa|green|red|yellow)$/,
  // Sem cor: o valor é `none`.
  /^--shadow-xs$/,
  // Branco sobre o azul escurecido dá 4,6:1 — passa no AA sem mudar.
  /^--color-presencial-text$/,
];

function tokensDe(trecho) {
  const semComentario = trecho.replace(/\/\*[\s\S]*?\*\//g, '');
  const achados = semComentario.matchAll(/(--[a-z0-9-]+)\s*:/g);
  return new Set(Array.from(achados, (m) => m[1]));
}

function main() {
  const css = fs.readFileSync(ARQ_CSS, 'utf8');

  const iClaro = css.indexOf(':root, .tema-claro');
  const iEscuro = css.indexOf('[data-theme="dark"] {');
  const iFim = css.indexOf('*, *::before');

  if (iClaro < 0 || iEscuro < 0 || iFim < 0) {
    console.error('ERRO: não achei os blocos de tema em CSS.html.');
    console.error('Se os seletores mudaram, atualize este script junto.');
    process.exit(1);
  }

  const claro = tokensDe(css.slice(iClaro, iEscuro));
  const escuro = tokensDe(css.slice(iEscuro, iFim));

  const isento = (t) => ISENTOS.some((re) => re.test(t));
  const semContraparte = Array.from(claro).filter((t) => !escuro.has(t) && !isento(t));
  const soNoEscuro = Array.from(escuro).filter((t) => !claro.has(t));

  console.log('Tokens na paleta clara : ' + claro.size);
  console.log('Tokens na paleta escura: ' + escuro.size);
  console.log('Isentos por regra      : ' + Array.from(claro).filter(isento).length);
  console.log('');

  let falhou = false;

  if (semContraparte.length) {
    falhou = true;
    console.error('FALHA: token de cor sem contraparte no modo escuro');
    semContraparte.forEach((t) => console.error('   ' + t));
    console.error('   -> declare em [data-theme="dark"], ou adicione a ISENTOS com o motivo.');
    console.error('');
  }

  if (soNoEscuro.length) {
    falhou = true;
    console.error('FALHA: token declarado só no escuro (provável erro de digitação)');
    soNoEscuro.forEach((t) => console.error('   ' + t));
    console.error('');
  }

  if (falhou) process.exit(1);
  console.log('OK — as duas paletas estão sincronizadas.');
}

main();
