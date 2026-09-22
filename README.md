# Yes or No · Jev

**Sim ou Não** — experimental bilingual app powered by Jev.

Aplicativo experimental de perguntas livres com respostas **Sim**, **Não** ou **Inconclusivo**, usando o Jev da TypeSafe AI.

[Versão hospedada — acesso privado](https://sim-ou-nao-olympio.olympio224224.chatgpt.site)

> **Experimento:** use apenas dados fictícios ou públicos. Não insira informações sensíveis nem anexe documentos confidenciais, seus ou de terceiros. Perguntas, contexto e texto dos PDFs são enviados à TypeSafe. As respostas podem conter erros.

## Recursos

- Interface em português e inglês, com preferência de idioma salva neste navegador.
- Perguntas digitadas livremente e contexto adicional.
- PDF com texto selecionável: até 10 MB, 100 páginas e 30.000 caracteres de contexto total. A leitura acontece no navegador, com prévia do texto e opção de remover o anexo. Não há OCR.
- Busca opcional na Wikipédia no idioma selecionado; o documento e o contexto adicional não entram nessa busca.
- Percentuais estimados de sim e não. A classificação auxiliar sobre a base da resposta não bloqueia esses percentuais.
- Cancelamento de consultas e cópia da resposta.

## Executar no computador

Requisitos: Node.js 22.13.0 ou superior e pnpm 11.25.0, conforme `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abra o endereço local informado no terminal. No app, clique em **Conectar Jev** e insira sua chave do [painel da TypeSafe](https://console.typesafe.ai/keys). As consultas usam os créditos dessa conta.

A chave fica apenas na memória da aba e é encaminhada à TypeSafe pelo servidor do app. Não deve ser incluída no código, em commits ou em arquivos publicados. Ao recarregar a página, conecte novamente. O app não cria histórico persistente de perguntas ou documentos.

A troca de idioma muda a interface e a busca na Wikipédia. Perguntas e PDFs não são traduzidos automaticamente.

## Verificação e compilação

```sh
node scripts/verify-core.mjs
node scripts/verify-worker.mjs
pnpm exec tsc --noEmit --incremental false
pnpm build
pnpm start
```

Os testes usam respostas simuladas para verificar o aplicativo; não medem a precisão do Jev nem exigem uma chave real. `pnpm start` executa localmente a versão compilada.

## Organização

- `app/page.tsx`: interface, idioma, conexão e anexos.
- `lib/jev.ts`: consulta ao Jev e interpretação dos percentuais.
- `lib/api-handlers.ts`: encaminhamento para a TypeSafe e busca na Wikipédia.
- `lib/pdf.ts`: extração de texto do PDF no navegador.
- `lib/i18n.ts`: textos em português e inglês.
- `scripts/verify-*.mjs`: verificações do comportamento do app.

React, TypeScript, Vinext/Vite, Cloudflare Workers e PDF.js compõem a aplicação. Dependências e recursos gerados durante instalação e compilação não fazem parte do repositório.

A pasta `portable/` e `scripts/build-portable.mjs` preservam um protótipo anterior de distribuição local. Para usar a versão atual, inclusive os PDFs, utilize o procedimento acima.

## Limites

“Sim” exige probabilidade de sim de pelo menos 85%; “Não”, no máximo 15%. Entre esses limites aparece “Inconclusivo”. Perguntas abertas ou ambíguas precisam ser reformuladas. Cálculos e informações atuais sem suporte podem permanecer inconclusivos. Essas regras são escolhas do aplicativo, não uma garantia de acerto.

Confira o texto extraído dos PDFs, especialmente tabelas, múltiplas colunas e páginas digitalizadas. Documentos sem texto selecionável precisam passar por OCR antes do uso.

O site hospedado continua administrado pelo Sites. Esta cópia do código no GitHub não cria publicação nem sincronização automática com ele. A configuração de acesso privado da hospedagem não deve ser presumida em outros ambientes.
