# Yes or No · Jev

**Sim ou Não** — experimental bilingual app powered by Jev.

**Public hosted app:** choose Portuguese or English. When the owner enables the demo, sign in with ChatGPT for one sponsored attempt. Connect your own TypeSafe API key to continue using your own credits.

Aplicativo experimental de perguntas livres com respostas **Sim**, **Não** ou **Inconclusivo**, usando o Jev da TypeSafe AI.

[Usar o app — acesso público](https://sim-ou-nao-olympio.olympio224224.chatgpt.site)

> **Experimento:** use apenas dados fictícios ou públicos. Não insira informações sensíveis nem anexe documentos confidenciais, seus ou de terceiros. Perguntas, contexto e texto dos PDFs são enviados à TypeSafe. As respostas podem conter erros.

## Usar a versão pública

1. [Abra o app](https://sim-ou-nao-olympio.olympio224224.chatgpt.site), sem precisar instalar.
2. Escolha português ou inglês.
3. Se a demonstração estiver disponível, clique em **Entrar com ChatGPT** para liberar uma tentativa por conta. Ou clique em **Usar minha chave** e insira sua própria chave do [painel da TypeSafe](https://console.typesafe.ai/keys); essa opção não exige login no ChatGPT.
4. Digite a pergunta e, se desejar, acrescente contexto ou um PDF.

**A demonstração usa os créditos TypeSafe do responsável pelo site. Consultas com chave própria usam os créditos TypeSafe do visitante.** A chave do responsável fica em um segredo do servidor, sem ser entregue ao navegador. A demonstração continua dependendo da API Jev.

As consultas deste app não chamam modelos nem consomem tokens da API da OpenAI. A hospedagem utiliza recursos do Sites e está sujeita aos limites do plano do responsável pelo site; consulte a [documentação de hospedagem](https://learn.chatgpt.com/docs/sites).

A chave informada pelo visitante fica apenas na memória da aba e é encaminhada à TypeSafe pelo servidor do app. Não é salva; ao recarregar a página, conecte novamente. Nenhuma chave deve ser incluída no código, em commits ou em arquivos publicados. O app não cria histórico persistente de perguntas ou documentos.

A troca de idioma muda a interface e a busca na Wikipédia. Perguntas e PDFs não são traduzidos automaticamente.

## Recursos

- Interface em português e inglês, com preferência de idioma salva neste navegador.
- Perguntas digitadas livremente e contexto adicional.
- PDF com texto selecionável: até 10 MB, 100 páginas e 30.000 caracteres de contexto total. A leitura acontece no navegador, com prévia do texto e opção de remover o anexo. Não há OCR.
- Busca opcional na Wikipédia no idioma selecionado; o documento e o contexto adicional não entram nessa busca.
- Percentuais estimados de sim e não. A classificação auxiliar sobre a base da resposta não bloqueia esses percentuais.
- Cancelamento de consultas e cópia da resposta.
- Contador público e persistente de consultas concluídas, sem identificar visitantes.
- Demonstração opcional: uma tentativa por conta do ChatGPT, com limite total no servidor e continuidade por chave própria.

## Configurar a demonstração no Sites

O código está preparado, mas a demonstração fica desativada até o responsável cadastrar sua chave nas configurações de ambiente do Site:

| Variável | Tipo | Valor |
| --- | --- | --- |
| `JEV_DEMO_API_KEY` | Segredo | Chave TypeSafe do responsável, inserida diretamente no painel do Sites |
| `JEV_DEMO_TOTAL_LIMIT` | Variável | `100` por padrão; aceita de `0` a `1000` |

Após salvar, publique novamente a versão salva para aplicar as configurações. Não envie a chave pelo chat, não use prefixos de variável pública e não a coloque no GitHub. `.env.example` contém somente os nomes e valores não sensíveis.

O teto inicial é de **100 tentativas no site inteiro, durante toda a vida do banco**, sem renovação diária. Uma conta pode utilizar apenas uma delas; recarregar, limpar cookies, trocar de dispositivo ou fazer chamadas simultâneas não libera outra. Mais de uma conta pode pertencer à mesma pessoa, portanto esse limite é por conta, não por pessoa. O teto limita tentativas, não um valor monetário fixo. Para desativar a demonstração, configure o limite como `0` ou remova a chave e publique novamente. Aumentar o teto libera vagas para novas contas, sem renovar tentativas já usadas.

A tentativa é reservada atomicamente **antes** de chamar a TypeSafe. Erro do provedor, timeout, cancelamento após envio ou resultado inconclusivo podem consumir a tentativa. Não há repetição automática de uma chamada potencialmente cobrada. Requisições rejeitadas localmente antes da reserva não consomem a tentativa. Se o banco falhar, nenhuma nova demonstração é autorizada; consultas com chave própria continuam disponíveis.

O banco guarda um hash do identificador da conta do ChatGPT na tabela `demo_claims`, exclusivamente para aplicar esse limite. É um identificador pseudônimo; não são armazenados nome, e-mail, IP, perguntas, documentos ou chaves nessa tabela. O login é tratado pelo Sites. A chave própria tem prioridade e uma chave inválida nunca faz o app recorrer silenciosamente à conta do responsável.

Essa autenticação depende dos cabeçalhos confiáveis injetados pelo Sites. Ao hospedar em outro provedor, mantenha a demonstração desativada até implementar e verificar autenticação no servidor; não confie em cabeçalhos de identidade enviados diretamente pelo cliente.

## Contador de consultas

O contador público mostra o total de consultas com uma resposta válida do Jev, incluindo resultados inconclusivos. Começa em zero na ativação; não recupera usos anteriores e não conta visitas à página, chaves inválidas, erros da TypeSafe ou respostas malformadas.

O total é compartilhado entre visitantes e persiste no banco D1. A interface o consulta ao abrir a página, ao voltar à aba, após uma consulta concluída ou ao pressionar **Atualizar contador**. A tabela `usage_totals` guarda somente uma linha com o total, sem perguntas, respostas, PDFs, chaves, endereços IP ou identificadores de visitantes. A tabela separada da demonstração guarda o identificador pseudônimo descrito acima.

A soma ocorre no servidor após o retorno do Jev, com atualização atômica. Recarregar a página não aumenta o total. Se o armazenamento falhar, a resposta continua disponível, mas a consulta pode não entrar na contagem. Uma consulta que já terminou no servidor pode ser contada mesmo que a aba seja fechada antes de exibir o resultado.

## Executar no computador

Requisitos: Node.js 22.13.0 ou superior e pnpm 11.25.0, conforme `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_luxuriant_alex_power.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_freezing_ozymandias.sql
pnpm dev
```

Aplique cada migração uma única vez, na ordem, por banco local novo. Em um banco existente, aplique apenas as migrações ainda pendentes; não reaplique `0000`. O ambiente de desenvolvimento usa D1 local; a publicação no Sites provisiona o banco da hospedagem e aplica as migrações separadamente. Preserve os arquivos de `drizzle/` e a configuração `"d1": "DB"` em `.openai/hosting.json`. Sem o banco, o contador e a demonstração ficam indisponíveis, mas consultas com chave própria continuam funcionando. O login do Sites não é simulado no servidor local; os testes isolados verificam a demonstração sem credenciais reais.

Abra o endereço local informado no terminal e siga os mesmos passos de conexão descritos em **Usar a versão pública**.

## Verificação e compilação

```sh
node scripts/verify-core.mjs
node scripts/verify-worker.mjs
node scripts/verify-usage.mjs
node scripts/verify-demo.mjs
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
- `components/usage-counter.tsx`, `lib/usage.ts` e `app/api/usage/route.ts`: contador público.
- `components/demo-offer.tsx`, `lib/demo.ts`, `lib/demo-runtime.ts` e `app/api/demo/route.ts`: demonstração e limite persistente.
- `db/schema.ts` e `drizzle/`: esquema e migrações do contador e das tentativas.
- `scripts/verify-*.mjs`: verificações do comportamento do app.

React, TypeScript, Vinext/Vite, Cloudflare Workers e PDF.js compõem a aplicação. Dependências e recursos gerados durante instalação e compilação não fazem parte do repositório.

A pasta `portable/` e `scripts/build-portable.mjs` preservam um protótipo anterior de distribuição local. Para usar a versão atual, inclusive os PDFs, utilize o procedimento acima.

## Limites

“Sim” exige probabilidade de sim de pelo menos 85%; “Não”, no máximo 15%. Entre esses limites aparece “Inconclusivo”. Perguntas abertas ou ambíguas precisam ser reformuladas. Cálculos e informações atuais sem suporte podem permanecer inconclusivos. Essas regras são escolhas do aplicativo, não uma garantia de acerto.

Confira o texto extraído dos PDFs, especialmente tabelas, múltiplas colunas e páginas digitalizadas. Documentos sem texto selecionável precisam passar por OCR antes do uso.

O site é hospedado e administrado pelo Sites. O repositório no GitHub contém o código-fonte e não atualiza automaticamente a versão online: alterações no código exigem uma nova publicação no Sites. A visibilidade do repositório e o acesso ao site são configurações independentes.
