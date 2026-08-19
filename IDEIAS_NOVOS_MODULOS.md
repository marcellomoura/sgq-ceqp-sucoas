# Análise do Sistema de Gestão da Qualidade (SGQ)

Com base na arquitetura atual do sistema da **CEQP · SUCOAS · SES/DF** (Pessoas, Tarefas, Capacitações, Unidades, Documentos, Riscos, Monitoramento e Visitas Técnicas) e nas melhores práticas globais de Gestão da Qualidade (fortemente baseadas nas normas da família **ISO 9001** e metodologias de excelência), abaixo está um diagnóstico focado em **Oportunidades de Melhoria** e **Expansão do Sistema**.

---

## 1. Melhorias em Módulos Existentes

Os módulos atuais já cobrem o "esqueleto" de um bom sistema de gestão, mas podem ser aprofundados para garantir maior aderência técnica aos requisitos de qualidade.

### 📄 Documentos
- **Fluxo de Aprovação Sistêmico (Workflow):** Ao invés de apenas registrar a revisão final, implementar os status "Em Elaboração", "Em Revisão" e "Aprovado", com assinaturas digitais ou aceite sistêmico dos responsáveis.
- **Controle de Leitura (Ciente):** Quando uma nova revisão de um documento crítico for publicada, o sistema gera automaticamente uma pendência de "leitura obrigatória" para os membros dos perfis afetados, rastreando quem já leu e quem não leu.
- **Tabela de Temporalidade:** Incluir prazos de retenção e regras de descarte seguro, em conformidade com políticas de arquivo e LGPD.

### ⚠️ Riscos e Planos de Ação (5W2H)
- **Oportunidades (Matriz SWOT):** A gestão da qualidade moderna exige pensar em "Riscos" (impacto negativo) e "Oportunidades" (impacto positivo). O módulo de riscos poderia englobar gestão de oportunidades.
- **Ferramentas de Causa Raiz:** Integrar ao formulário do plano de ação ou do risco ferramentas de análise, como **5 Porquês** ou Diagrama de Ishikawa (Espinha de Peixe).

### 🎓 Capacitações e 👥 Pessoas
- **Matriz de Competências / Habilidades:** Cruzar os requisitos do cargo (o que o membro *precisa* saber) com o histórico do membro (o que ele *já sabe* e *treinamentos realizados*), gerando um gráfico de "Gap de Competências".
- **Avaliação de Eficácia:** A ISO 9001 exige não apenas treinar, mas garantir que o treinamento funcionou. Adicionar um fluxo onde, X dias após a capacitação, o gestor avalia se o membro conseguiu aplicar o conhecimento na prática.

### 👁️ Visitas Técnicas e 📊 Monitoramento
- **Checklists Dinâmicos:** Permitir o cadastro de modelos de checklists personalizados por tipo de visita, com opções pré-definidas (Conforme, Não Conforme, Não Aplicável).
- **Geração de Desvios (Spin-off):** Toda vez que um item do checklist for marcado como "Não Conforme", o sistema deve abrir automaticamente uma "Não Conformidade" vinculada à visita.
- **Painéis (Dashboards) com Gatilhos:** Estabelecer metas e limites de tolerância para os indicadores. Se um KPI ficar fora da meta, o sistema deve exigir obrigatoriamente a abertura de um Plano de Ação para correção.

---

## 2. Novos Módulos Propostos

Para que o sistema se torne um SGQ pleno, abrangente e robusto (nível certificação), a implementação dos seguintes módulos é altamente recomendada:

### 🚨 Gestão de Não Conformidades (CAPA)
* **Por que é necessário:** É o motor da melhoria contínua. O sistema atual tem Gestão de Riscos (preventivo), mas precisa gerenciar quando o erro efetivamente acontece.
* **O que contemplaria:**
  - Abertura de RNC (Registro de Não Conformidade).
  - Ação Imediata (Disposição/Correção).
  - Análise de Causa Raiz.
  - Ação Corretiva (vinculada aos planos 5W2H já existentes).
  - Validação da Eficácia (fecha-se o ciclo apenas se a ação resolveu o problema de vez).

### 🔎 Auditorias Internas
* **Por que é necessário:** Embora exista o módulo de "Visitas Técnicas", a Auditoria Interna possui rito próprio obrigatório.
* **O que contemplaria:**
  - Programa Anual de Auditorias.
  - Planos de Auditoria (por processo ou área).
  - Registro de Constatações (Não Conformidades, Oportunidades de Melhoria, Observações e Pontos Fortes).
  - Gestão de auditores internos qualificados (cruzando com o módulo de Capacitações).

### 🤝 Gestão de Fornecedores e Insumos
* **Por que é necessário:** A qualidade dos serviços/produtos entregues pela organização depende de seus fornecedores externos.
* **O que contemplaria:**
  - Cadastro e homologação de fornecedores críticos.
  - IDF (Índice de Desempenho de Fornecedores): avaliações periódicas baseadas em qualidade, prazo e atendimento.
  - Planos de ação automáticos para fornecedores com notas abaixo da meta.

### 🗣️ Gestão da Satisfação (Ouvidoria / Feedbacks)
* **Por que é necessário:** O foco no cliente/cidadão é o princípio base de qualquer norma de qualidade.
* **O que contemplaria:**
  - Registro de reclamações, elogios ou sugestões.
  - Pesquisas de Satisfação (ex: NPS ou CSAT).
  - Tratativa de reclamações críticas via análise de causa raiz e planos de ação.

### 📅 Reuniões de Análise Crítica (RAC) pela Direção
* **Por que é necessário:** A alta direção precisa revisar o SGQ periodicamente, de forma documentada.
* **O que contemplaria:**
  - Gestão de Atas de Reunião com pautas obrigatórias travadas pelo sistema (Status das Não Conformidades, Resultados de Auditoria, KPIs, etc.).
  - Controle de pendências: deliberações geram imediatamente cartões no módulo Kanban para os responsáveis.

### 🛠️ (Opcional) Gestão de Equipamentos / Calibração
* **Por que é necessário:** Caso a Secretaria (SES/DF) dependa de equipamentos de medição ou itens críticos, garantir a calibração é vital.
* **O que contemplaria:**
  - Inventário de equipamentos críticos.
  - Cronograma de calibração/manutenção preventiva com alertas de vencimento.

---

> [!TIP]
> **Estratégia de Evolução:** Sugere-se iniciar a evolução pela criação do **Módulo de Não Conformidades (CAPA)** e pelas melhorias no módulo de **Documentos (Workflow e Ciente)**, pois geram o maior valor imediato para a maturidade do SGQ sem necessitar de mudanças arquiteturais profundas no banco de dados em planilha.
