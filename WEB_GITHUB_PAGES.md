# AirViewer na web

## Endereços

- Site: https://lltorres1983.github.io/airviewer/
- Repositório: https://github.com/lltorres1983/airviewer
- Publicações: https://github.com/lltorres1983/airviewer/actions

Somente `web/`, o workflow `.github/workflows/deploy-pages.yml` e esta
documentação devem ser enviados ao repositório público. Os demais arquivos
da pasta local não fazem parte do site.

## O que foi separado

- `web/index.html` e o frontend 3D público.
- O mapa consulta Airplanes.live diretamente pelo navegador.
- As rotas são enriquecidas pelo navegador via ADSBDB quando a API permitir a consulta.
- O tray e o popup PowerShell continuam locais e não são publicados.

## Publicação no GitHub Pages

1. Crie um repositório público no GitHub.
2. Envie este projeto para a branch `main` ou `master`.
3. Em **Settings > Pages**, selecione **GitHub Actions** como origem.
4. O workflow `Deploy AirViewer web` publicará o diretório `web`.
5. O endereço será parecido com `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`.

O workflow também pode ser executado manualmente em **Actions > Deploy AirViewer web > Run workflow**.

## Limitações atuais

- A página pública não inicia o popup do tray, porque esse recurso depende do PowerShell local.
- A aba de agenda de horários permanece preparada, mas sem dados no modo web até adotarmos uma fonte pública de horários com acesso browser estável.
- O navegador está sujeito aos limites e à disponibilidade das APIs públicas. Para uso contínuo ou muitos visitantes, o próximo passo é colocar um proxy/cache serverless.
- O mapa, fotos, Airplanes.live, ADSBDB e o vídeo do YouTube são serviços externos e podem alterar CORS, limites ou disponibilidade.
