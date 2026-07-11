# 01 — Visão Geral

## Identificação do Sistema

| Campo | Valor |
|---|---|
| **Nome** | SGQ — Sistema de Gestão da Qualidade |
| **Organização** | CEQP / SUCOAS — SES/DF |
| **Descrição** | Comissão Especial de Qualidade e Padronização, Secretaria de Saúde do Distrito Federal |
| **Plataforma** | Google Apps Script (GAS) — Web App |
| **Script ID** | `1APgnmymXy4KsGCViY4KiEMNGz510FNH-DtKKNFNaZsNHl2aMRwIrLYCE` |
| **Fuso horário** | America/Sao_Paulo |

## Propósito

O SGQ é uma aplicação web interna que centraliza a gestão da qualidade da organização em um único sistema. Elimina planilhas dispersas e processos manuais, oferecendo:

- **Gestão de tarefas** em formato Kanban com rastreabilidade completa
- **Cadastro de membros** da comissão com cargos e contatos
- **Gestão documental** com controle de versões, status e revisões periódicas
- **Gestão de riscos** com matriz probabilidade × impacto e planos de ação estruturados (5W2H)
- **Controle de entregas** por unidade/subcomissão com acompanhamento de evidências
- **Trilha de auditoria** completa de todas as operações
- **Relatórios em PDF** gerados no cliente ou enviados por e-mail

## Módulos do Sistema

```
SGQ
├── Gestão de Tarefas
│   ├── Quadro Kanban (5 colunas)
│   ├── Membros da Comissão
│   ├── Dashboard com indicadores e gráficos
│   └── Cartões Arquivados
├── Unidades / Subcomissões
├── Gestão Documental
│   ├── Lista Mestra de Documentos
│   └── Histórico de Revisões
├── Gestão de Riscos
│   ├── Matriz de Risco (5×5)
│   ├── Plano de Ação (5W2H)
│   └── Controle de Entregas por Unidade
└── Auditoria
    └── Log de Alterações
```

## Usuários

O sistema é utilizado pelos membros da CEQP/SUCOAS. O acesso é controlado via Google Workspace — o web app executa como `USER_DEPLOYING` e o acesso é restrito a `MYSELF` (conforme `appsscript.json`).

A identidade do usuário logado é capturada em cada operação de escrita via `Session.getActiveUser().getEmail()` e registrada no log de auditoria.
