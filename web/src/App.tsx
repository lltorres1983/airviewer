import { MiniNearbyRadar } from "@/components/mini-nearby-radar";
import { NearbyRadar } from "@/components/nearby-radar";
import { Observatory } from "@/components/observatory";
import { startTrafficRecording } from "@/lib/traffic-recording";
import { AirportSpotting } from "@/components/airport-spotting";
import { HomeRadarTrigger } from "@/components/home-radar-panel";
import { useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { AccountPanel, AccountTrigger } from "@/components/account-panel";
import { AircraftDetails } from "@/components/aircraft-details";
import { startAirviewer } from "@/lib/airviewer";

export default function App() {
  // Restore imperatively moved mobile nodes before React removes the page.
  useLayoutEffect(() => startAirviewer(), []);
  useEffect(() => startTrafficRecording(), []);
  return (
    <>
      <AccountPanel />
      <div
        id="map"
        aria-label="Mapa tridimensional livre acompanhando a aeronave"
      ></div>
      <header className="topbar">
        <picture className="brand">
          <source
            media="(max-width: 600px)"
            srcSet="./assets/airviewer-symbol.svg"
          />
          <img
            className="brand-logo"
            src="./assets/airviewer-logo.svg"
            alt="Airviewer"
            width="154"
            height="36"
          />
        </picture>
        <div className="flight-heading">
          <div id="route" className="route"></div>
          <div id="aircraft-identity" className="aircraft-identity"></div>
          <div id="mode-eyebrow" className="sr-only">
            Visão panorâmica 3D
          </div>
        </div>
      </header>
      <div id="telemetry" className="telemetry"></div>
      <div id="status" className="status">
        Carregando mapa 3D livre...
      </div>
      <MiniNearbyRadar />
      <div className="right-rail">
        <div className="aircraft-details-slot">
          <AircraftDetails />
        </div>
        <aside
          id="arrivals-panel"
          className="arrivals-panel hidden"
          aria-label="Movimentos do aeroporto"
        >
        <button className="panel-resize" type="button" aria-label="Redimensionar movimentos" title="Arraste para redimensionar ou use as setas do teclado">⤢</button>
          <div className="arrivals-header">
            <strong id="arrivals-title">MOVIMENTOS</strong>
            <span id="arrivals-count">carregando</span>
            <button id="movements-fit" type="button" aria-label="Ajustar altura dos movimentos ao conteúdo">Ajustar</button>
          </div>
          <div
            className="traffic-tabs"
            role="tablist"
            aria-label="Tipo de movimento"
          >
            <Button
              variant="secondary"
              id="schedule-tab"
              className="traffic-tab"
              type="button"
              role="tab"
              aria-selected="true"
            >
              PRÓXIMOS 30 MIN
            </Button>
            <Button
              variant="secondary"
              id="live-tab"
              className="traffic-tab"
              type="button"
              role="tab"
              aria-selected="false"
            >
              AO VIVO
            </Button>
          </div>
          <div className="traffic-legend" aria-label="Legenda dos avioes">
            <span>
              <i className="traffic-dot"></i>Chegada
            </span>
            <span>
              <i className="traffic-dot departure"></i>Saida
            </span>
            <span>
              <i className="traffic-dot nearby"></i>Local
            </span>
            <span>
              <i className="traffic-dot tracked"></i>Acompanhada
            </span>
          </div>
          <small
            id="live-signal"
            className="schedule-source hidden"
            role="status"
          ></small>
          <div id="schedule-view" className="traffic-view">
            <div id="schedule-list" className="schedule-list"></div>
            <small className="schedule-source">
              Programação{" "}
              <a
                href="https://sas.anac.gov.br/sas/siros_api"
                target="_blank"
                rel="noopener"
              >
                ANAC/SIROS
              </a>{" "}
              · horário de Brasília
            </small>
          </div>
          <div id="live-view" className="traffic-view hidden">
            <div id="arrivals-list" className="arrivals-list"></div>
          </div>
        </aside>
      </div>
      <aside
        id="airport-camera"
        className="airport-camera hidden"
        aria-label="Camera ao vivo do aeroporto mais proximo"
      >
        <button className="panel-resize" type="button" aria-label="Redimensionar câmera" title="Arraste para redimensionar ou use as setas do teclado">⤢</button>
        <div className="airport-camera-header">
          <div className="airport-camera-title">
            <strong id="airport-camera-title">CAMERA AO VIVO</strong>
            <span id="airport-camera-distance">
              Aeronave proxima ao aeroporto
            </span>
          </div>
          <select
            id="airport-camera-source"
            className="airport-camera-source"
            aria-label="Selecionar transmissao da camera"
          ></select>
          <a
            id="airport-camera-link"
            href="https://www.youtube.com/"
            target="_self"
            rel="noopener noreferrer"
          >
            YouTube
          </a>
          <Button
            variant="secondary"
            id="airport-camera-close"
            className="airport-camera-close"
            type="button"
            title="Ocultar camera"
            aria-label="Ocultar camera"
          >
            X
          </Button>
        </div>
        <div className="airport-camera-video-grid">
          <div className="airport-camera-feed">
            <strong id="airport-camera-feed-title">CAMERA PRINCIPAL</strong>
            <iframe
              id="airport-camera-frame"
              title="Camera ao vivo do aeroporto"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
          </div>
        </div>
        <div id="airport-camera-note" className="airport-camera-note">
          Se aparecer “vídeo não disponível”, o YouTube bloqueou esta
          incorporação; escolha a outra fonte no seletor acima.
        </div>
      </aside>
      <div className="controls">
        <label className="control-field" htmlFor="airport-select">
          Aeroporto
          <select id="airport-select">
            <option value="AUTO">Automatico</option>
            <option value="GIG">GIG</option>
            <option value="GRU">GRU</option>
            <option value="SDU">SDU</option>
          </select>
        </label>
        <label className="control-field" htmlFor="refresh-interval">
          Atualizar
          <select id="refresh-interval">
            <option value="2000">2 s</option>
            <option value="3000">3 s</option>
            <option value="5000">5 s</option>
            <option value="7000">7 s</option>
            <option value="10000">10 s</option>
            <option value="15000">15 s</option>
          </select>
        </label>
        <label className="control-field" htmlFor="zoom-control">
          Zoom
          <input id="zoom-control" type="range" min="9" max="18" step="0.5" />
          <output id="zoom-value" htmlFor="zoom-control"></output>
        </label>
        <label className="control-field" htmlFor="camera-size-control">
          Video
          <input
            id="camera-size-control"
            type="range"
            min="300"
            max="900"
            step="20"
          />
          <output id="camera-size-value" htmlFor="camera-size-control"></output>
        </label>
        <Button id="recenter" type="button">
          Recentrar aeronave
        </Button>
        <Button
          variant="secondary"
          id="rotate-map"
          type="button"
          title="Girar a orientação do mapa em 45 graus"
        >
          Girar mapa
        </Button>
        <div className="mode-switch" role="group" aria-label="Modo de visao">
          <Button
            variant="secondary"
            id="aircraft-view-switch"
            type="button"
            title="Mostrar a visão da aeronave"
          >
            Aeronave
          </Button>
          <Button
            variant="secondary"
            id="airport-view-switch"
            type="button"
            title="Mostrar a visão do aeroporto"
          >
            Aeroporto
          </Button>
        </div>
        <div
          className="cardinal-controls"
          role="group"
          aria-label="Orientacao cardinal"
        >
          <span className="cardinal-label">Orientacao</span>
          <Button
            variant="secondary"
            type="button"
            data-cardinal-bearing="0"
            title="Norte"
            aria-label="Norte"
          >
            N
          </Button>
          <Button
            variant="secondary"
            type="button"
            data-cardinal-bearing="90"
            title="Leste"
            aria-label="Leste"
          >
            L
          </Button>
          <Button
            variant="secondary"
            type="button"
            data-cardinal-bearing="180"
            title="Sul"
            aria-label="Sul"
          >
            S
          </Button>
          <Button
            variant="secondary"
            type="button"
            data-cardinal-bearing="270"
            title="Oeste"
            aria-label="Oeste"
          >
            O
          </Button>
          <output id="cardinal-value" className="cardinal-value">
            N 000°
          </output>
        </div>
        <Button
          variant="secondary"
          id="reload-page"
          type="button"
          title="Recarregar a página"
        >
          Recarregar
        </Button>
        <Button
          variant="secondary"
          id="view-mode"
          className="view-mode hidden"
          type="button"
        >
          Visao trafego
        </Button>
        <Button
          variant="secondary"
          id="camera-toggle"
          className="camera-toggle hidden"
          type="button"
        >
          Camera aeroporto
        </Button>
        <HomeRadarTrigger />
        <NearbyRadar />
        <AirportSpotting />
        <Observatory />
        <Button variant="secondary" id="show-diagnostics" type="button">
          Diagnostico
        </Button>
        <Button variant="secondary" id="fullscreen" type="button">
          Tela cheia
        </Button>
      </div>
      <section
        id="diagnostics"
        className="diagnostics hidden"
        aria-labelledby="diagnostics-title"
      >
        <h2 id="diagnostics-title">Diagnostico do mapa 3D</h2>
        <pre id="diagnostics-text">Nenhuma falha registrada.</pre>
        <div className="diagnostics-actions">
          <Button variant="secondary" id="close-diagnostics" type="button">
            Fechar
          </Button>
        </div>
      </section>
      <nav className="mobile-nav" aria-label="Navegação principal">
        <Button
          variant="secondary"
          id="mobile-map"
          type="button"
          aria-current="page"
        >
          Mapa
        </Button>
        <Button
          variant="secondary"
          id="mobile-menu-toggle"
          type="button"
          aria-controls="mobile-panel"
          aria-expanded="false"
        >
          Menu
        </Button>
        <AccountTrigger mobile />
      </nav>
      <section
        id="mobile-panel"
        className="mobile-panel"
        aria-labelledby="mobile-panel-title"
        hidden
      >
        <div className="mobile-panel-header">
          <h2 id="mobile-panel-title" tabIndex={-1}>
            Menu
          </h2>
          <Button variant="secondary" id="mobile-panel-close" type="button">
            Voltar ao mapa
          </Button>
        </div>
        <div className="mobile-panel-content">
          <div id="mobile-menu" className="mobile-menu">
            <Button variant="secondary" type="button" data-mobile-view="camera">
              Câmera do aeroporto
            </Button>
            <Button
              variant="secondary"
              type="button"
              data-mobile-view="flights"
            >
              Próximos voos
            </Button>
          </div>
          <div id="mobile-camera" hidden>
            <p className="mobile-empty" id="mobile-camera-empty">
              Não há câmera disponível para este aeroporto. Escolha outro em
              Opções.
            </p>
          </div>
          <div id="mobile-flights" hidden>
            <p className="mobile-empty" id="mobile-flights-empty">
              Selecione um aeroporto em Opções para consultar os próximos voos.
            </p>
          </div>
          <div id="mobile-options" hidden></div>
        </div>
      </section>
    </>
  );
}
