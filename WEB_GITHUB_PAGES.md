# AirViewer na web

## Endereços

- Site: https://lltorres1983.github.io/airviewer/
- Repositório: https://github.com/lltorres1983/airviewer
- Publicações: https://github.com/lltorres1983/airviewer/actions

O repositório público contém o frontend em `web/`, o workflow de publicação,
o script que gera a programação e esta documentação.

## O que foi separado

- `web/` contém o frontend React + TypeScript, com componentes shadcn/ui, Tailwind CSS e mapa MapLibre.
- O mapa consulta posições públicas do [adsb.lol](https://www.adsb.lol/) via [cors.dev](https://cors.dev/).
- A programação dos próximos 30 minutos usa [dados planejados da ANAC/SIROS](https://sas.anac.gov.br/sas/siros_api) para GRU, GIG e SDU. Os horários são exibidos no fuso de Brasília.
- As rotas são enriquecidas pelo navegador via ADSBDB quando a API permitir a consulta.
- O tray e o popup PowerShell continuam locais e não são publicados.

## Publicação no GitHub Pages

1. Crie um repositório público no GitHub.
2. Envie este projeto para a branch `main` ou `master`.
3. Em **Settings > Pages**, selecione **GitHub Actions** como origem.
4. O workflow `Deploy AirViewer web` instalará as dependências, compilará o aplicativo e publicará o diretório `dist`.
5. O endereço será parecido com `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`.

O workflow também pode ser executado manualmente em **Actions > Deploy AirViewer web > Run workflow**.
A publicação gera `web/public/schedule.json` e atualiza o arquivo a cada seis horas. Se o GitHub suspender as execuções agendadas por inatividade, reative o workflow para retomar as atualizações.

## Limitações atuais

- A página pública não inicia o popup do tray, porque esse recurso depende do PowerShell local.
- A programação registra horários previstos. Para atrasos e cancelamentos, consulte a companhia aérea ou o aeroporto.
- A cobertura do tráfego ao vivo depende da recepção de sinais ADS-B na região e da disponibilidade do adsb.lol e do cors.dev.

## Desenvolvimento local

Requer Node.js 24 e npm.

```sh
npm ci
npm run schedule
npm run dev
```

A geração da programação consulta a ANAC e precisa de acesso à internet. Sem esse
arquivo, o mapa funciona e o painel informa que a programação está indisponível.

```sh
npm run build
npm run preview
npx playwright install chromium
npm test
```

O build verifica TypeScript em modo estrito e gera `dist/`. Os testes de navegador
usam respostas simuladas para conferir os controles e os estados de falha sem
depender das APIs externas. `base: './'` permite publicar em subdiretórios do Pages.

## Organização da interface

- `web/src/App.tsx`: interface React e botões shadcn/ui.
- `web/src/components/ui/`: componentes shadcn editáveis; configuração em `components.json`.
- `web/src/lib/airviewer.ts`: controlador TypeScript do mapa, dados e controles existentes.
- `web/src/lib/types.ts`: tipos de aeroportos, aeronaves e programação.
- `web/src/theme.css` e `styles.css`: tokens do shadcn e layout responsivo do mapa.
- `web/public/assets/`: logo Airviewer e símbolo usado como favicon.

A interface é montada pelo React; o controlador atualiza as áreas de dados e o mapa
sem renderizações React concorrentes sobre esses elementos. Seu descarte cancela
consultas, listeners, animações e temporizadores, e remove o mapa. Ao adicionar
estado React a uma dessas áreas, transfira também suas atualizações para o componente.

Para adicionar componentes: `npx shadcn@latest add NOME_DO_COMPONENTE`.

## Detalhes da aeronave selecionada

Ao clicar em uma aeronave no mapa ou na lista ao vivo, o painel React exibe o
prefixo, a foto correspondente, as cidades e aeroportos da rota e os dados da
companhia (nome, país, ICAO/IATA e indicativo de rádio). No celular, os detalhes
aparecem sobre a parte inferior do mapa e podem ser rolados ou fechados.

A foto é consultada pelo prefixo no Planespotters.net, com crédito ao fotógrafo e
link para a página original. Se o ADS-B não informar o prefixo, o aplicativo tenta
resolvê-lo pelo identificador hexadecimal no ADSBDB. Nunca substitui uma foto
indisponível pela de outro avião do mesmo modelo.

Rotas e companhias vêm do ADSBDB; a cobertura e a atualização dependem da fonte.
Dados ausentes ou falhas são indicados no painel. Consultas da seleção anterior são
canceladas ao trocar de aeronave. Não é necessário banco de dados para esse recurso.

## Conta Google e favoritos no Supabase

O frontend usa Supabase Auth com OAuth/PKCE. O primeiro acesso com Google cria a
conta; os próximos acessos reutilizam a sessão. A tabela `aircraft_favorites`
guarda aeronaves por identificador hexadecimal, prefixo e modelo, sem gravar uma
rota antiga como se fosse atual. O botão fica no painel da aeronave; a lista está
em **Conta e favoritos** (desktop) ou **Conta** (celular).

### Ativação do projeto

1. Crie ou escolha um projeto Supabase e execute a migration
   `supabase/migrations/20261111000000_aircraft_favorites.sql` no SQL Editor desse
   projeto. Execute apenas uma vez; em projetos gerenciados pela CLI, aplique pelo
   fluxo de migrations do Supabase.
2. No Google Cloud, configure a tela de consentimento e um cliente OAuth do tipo
   **Web application**. Cadastre o callback mostrado pelo Supabase, normalmente
   `https://SEU_PROJETO.supabase.co/auth/v1/callback`, como URI de redirecionamento
   autorizada. Em modo de teste do Google, adicione os usuários de teste; para
   disponibilizar o acesso ao público, configure a publicação do aplicativo OAuth.
3. No Supabase, habilite **Authentication → Sign In / Providers → Google** e
   configure o Client ID e o Client Secret do Google. O segredo fica apenas no
   Supabase, nunca no código do frontend.
4. Em **Authentication → URL Configuration**, configure a Site URL e as Redirect
   URLs exatas do aplicativo. Exemplos: `http://localhost:5173/` e
   `https://lltorres1983.github.io/airviewer/`. Use o endereço real do seu deploy,
   incluindo o subdiretório e a barra final. O retorno acontece na própria página
   inicial, sem uma rota `/auth/callback` que exigiria regras extras no Pages.
5. Copie `.env.example` para `.env.local` na raiz do repositório. Preencha
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL e a chave pública
   do projeto. Uma chave legada `anon` também é aceita. Não use `service_role`,
   `sb_secret_...`, senha do banco ou Client Secret do Google em variáveis `VITE_`.
6. No GitHub, configure essas mesmas duas variáveis públicas em **Settings →
   Secrets and variables → Actions → Variables**. O workflow as utiliza durante o
   build. Execute um novo deploy após configurá-las; alterar variáveis depois do
   build não modifica um site estático já publicado.

Sem essas duas variáveis, o mapa continua funcionando e a área de conta informa
que o login está indisponível. Não há substituição por favoritos locais ou login
simulado no aplicativo publicado.

A migration usa RLS, vincula cada registro a `auth.users` e limita leitura,
inserção e exclusão ao dono. A exclusão da conta no Supabase remove seus favoritos.
Os dados pessoais de autenticação permanecem em Supabase Auth; não há uma tabela
pública de perfis. Ao sair ou mudar de conta, a interface limpa a lista anterior.

### Validação

```sh
npm run build
npm test
npm run test:db
```

Os testes de navegador compilam um artefato separado em `.test-dist/` com um projeto
fictício e respostas simuladas nas fronteiras OAuth/REST. Eles validam início do
OAuth Google com PKCE, retorno do código, sessão, persistência, remoção, abertura de
favoritos, troca de conta e falhas de rede. Não acessam uma conta Google real.

`test:db` precisa de PostgreSQL 16 instalado (ou `PG_BIN` apontando para o diretório
de binários). Cria e remove um banco temporário, aplica a migration real e testa
isolamento entre usuários, permissões anônimas, duplicidade, validação do hex e
exclusão em cascata. Apenas `auth.users` e `auth.uid()` são reproduzidos para o teste;
a ativação e o OAuth do projeto hospedado precisam ser validados após a configuração.

Referências: [Google no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls) e
[controle de acesso por linha](https://supabase.com/docs/guides/database/postgres/row-level-security).
