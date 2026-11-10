# AirViewer na web

## Endereços

- Site: https://lltorres1983.github.io/airviewer/
- Repositório: https://github.com/lltorres1983/airviewer
- Publicações: https://github.com/lltorres1983/airviewer/actions

O repositório público contém o frontend em `web/`, o workflow de publicação,
o script que gera a programação e esta documentação.

## O que foi separado

- `web/index.html` e o frontend 3D público.
- O mapa consulta posições públicas do [adsb.lol](https://www.adsb.lol/) via [cors.dev](https://cors.dev/).
- A programação dos próximos 30 minutos usa [dados planejados da ANAC/SIROS](https://sas.anac.gov.br/sas/siros_api) para GRU, GIG e SDU. Os horários são exibidos no fuso de Brasília.
- As rotas são enriquecidas pelo navegador via ADSBDB quando a API permitir a consulta.
- O tray e o popup PowerShell continuam locais e não são publicados.

## Publicação no GitHub Pages

1. Crie um repositório público no GitHub.
2. Envie este projeto para a branch `main` ou `master`.
3. Em **Settings > Pages**, selecione **GitHub Actions** como origem.
4. O workflow `Deploy AirViewer web` publicará o diretório `web`.
5. O endereço será parecido com `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`.

O workflow também pode ser executado manualmente em **Actions > Deploy AirViewer web > Run workflow**.
A publicação gera `web/schedule.json` e atualiza o arquivo a cada seis horas. Se o GitHub suspender as execuções agendadas por inatividade, reative o workflow para retomar as atualizações.

## Limitações atuais

- A página pública não inicia o popup do tray, porque esse recurso depende do PowerShell local.
- A programação registra horários previstos. Para atrasos e cancelamentos, consulte a companhia aérea ou o aeroporto.
- A cobertura do tráfego ao vivo depende da recepção de sinais ADS-B na região e da disponibilidade do adsb.lol e do cors.dev.
