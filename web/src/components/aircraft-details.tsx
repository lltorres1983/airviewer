import { useEffect, useState, useSyncExternalStore } from "react";
import { FavoriteButton } from "./account-panel";
import { Button } from "./ui/button";
import {
  getAircraftSelection,
  subscribeAircraftSelection,
  selectAircraft,
  type AircraftSelection,
} from "@/lib/aircraft-selection";
import {
  fetchAircraftPhoto,
  fetchFlightRoute,
  fetchAirline,
  fetchRegistration,
  type AircraftPhoto,
  type Airline,
} from "@/lib/aircraft-data";
import type { FlightRoute } from "@/lib/types";

type LoadStatus = "loading" | "ready" | "empty" | "error";

export function AircraftDetails() {
  const selection = useSyncExternalStore(
    subscribeAircraftSelection,
    getAircraftSelection,
  );
  return selection ? (
    <SelectedAircraft
      key={`${selection.hex}:${selection.flight}:${selection.registration}`}
      aircraft={selection}
    />
  ) : null;
}

function SelectedAircraft({ aircraft }: { aircraft: AircraftSelection }) {
  const [registration, setRegistration] = useState(aircraft.registration);
  const [type, setType] = useState(aircraft.type);
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [photoStatus, setPhotoStatus] = useState<LoadStatus>("loading");
  const [route, setRoute] = useState<FlightRoute | null>(null);
  const [routeStatus, setRouteStatus] = useState<LoadStatus>("loading");
  const [airline, setAirline] = useState<Airline | null>(null);
  const [airlineStatus, setAirlineStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setPhoto(null);
    setPhotoStatus("loading");
    setRoute(null);
    setRouteStatus("loading");
    setAirline(null);
    setAirlineStatus("loading");
    const loadPhoto = async () => {
      try {
        let prefix = aircraft.registration;
        if (!prefix) {
          const identity = await fetchRegistration(aircraft.hex, signal);
          if (signal.aborted) return;
          prefix = identity?.registration || "";
          setRegistration(prefix);
          if (!aircraft.type && identity?.type) setType(identity.type);
        }
        if (!prefix) {
          setPhotoStatus("empty");
          return;
        }
        const result = await fetchAircraftPhoto(prefix, signal);
        if (signal.aborted) return;
        setPhoto(result);
        setPhotoStatus(result ? "loading" : "empty");
      } catch {
        if (!signal.aborted) setPhotoStatus("error");
      }
    };
    const loadRoute = async () => {
      let result: FlightRoute | null = null;
      try {
        result = await fetchFlightRoute(aircraft.flight, signal);
        if (signal.aborted) return;
        setRoute(result);
        setRouteStatus(
          result?.origin || result?.destination ? "ready" : "empty",
        );
      } catch {
        if (!signal.aborted) setRouteStatus("error");
      }
      if (signal.aborted) return;
      try {
        const company =
          result?.airline || (await fetchAirline(aircraft.flight, signal));
        if (signal.aborted) return;
        setAirline(company);
        setAirlineStatus(company ? "ready" : "empty");
      } catch {
        if (!signal.aborted) setAirlineStatus("error");
      }
    };
    void loadPhoto();
    void loadRoute();
    return () => controller.abort();
  }, [
    aircraft.hex,
    aircraft.flight,
    aircraft.registration,
    aircraft.type,
    attempt,
  ]);

  const hint = aircraft.routeHint.split(" -> ");
  const origin = route?.origin || (hint.length === 2 ? hint[0] : "");
  const destination = route?.destination || (hint.length === 2 ? hint[1] : "");
  return (
    <section
      className="aircraft-details"
      aria-labelledby="selected-aircraft-title"
    >
      <header className="aircraft-details-header">
        <div>
          <h2 id="selected-aircraft-title">
            {aircraft.flight || registration || aircraft.hex.toUpperCase()}
          </h2>
          <p>
            Prefixo <strong>{registration || "não informado"}</strong>
            {type ? ` · ${type}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fechar detalhes da aeronave"
          onClick={() => selectAircraft(null)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </Button>
      </header>
      <FavoriteButton aircraft={{ hex: aircraft.hex, registration, type }} />
      <figure
        className="selected-aircraft-photo"
        aria-busy={photoStatus === "loading"}
      >
        {photo && photoStatus !== "error" && (
          <a
            href={photo.link}
            target="_blank"
            rel="noopener noreferrer"
            hidden={photoStatus !== "ready"}
          >
            <img
              src={photo.src}
              alt={`Foto da aeronave ${registration}`}
              onLoad={() => setPhotoStatus("ready")}
              onError={() => setPhotoStatus("error")}
            />
          </a>
        )}
        {photoStatus !== "ready" && (
          <p className="aircraft-photo-state" role="status">
            {photoStatus === "loading"
              ? "Buscando foto pelo prefixo…"
              : photoStatus === "error"
                ? "Não foi possível carregar a foto."
                : registration
                  ? `Nenhuma foto disponível para ${registration}.`
                  : "Prefixo não disponível para buscar a foto."}
          </p>
        )}
        {photo && photoStatus === "ready" && (
          <figcaption>
            Foto: {photo.photographer} ·{" "}
            <a href={photo.link} target="_blank" rel="noopener noreferrer">
              Planespotters.net
            </a>
          </figcaption>
        )}
      </figure>
      <div className="aircraft-details-body">
        <dl
          className="aircraft-route-details"
          aria-busy={routeStatus === "loading"}
        >
          <div>
            <dt>Origem{origin && origin !== "--" ? ` · ${origin}` : ""}</dt>
            <dd>
              {route?.originName ||
                (routeStatus === "loading"
                  ? "Consultando…"
                  : "Cidade não informada")}
            </dd>
            {route?.originAirport && (
              <dd className="airport-name">{route.originAirport}</dd>
            )}
          </div>
          <div>
            <dt>
              Destino
              {destination && destination !== "--" ? ` · ${destination}` : ""}
            </dt>
            <dd>
              {route?.destinationName ||
                (routeStatus === "loading"
                  ? "Consultando…"
                  : "Cidade não informada")}
            </dd>
            {route?.destinationAirport && (
              <dd className="airport-name">{route.destinationAirport}</dd>
            )}
          </div>
        </dl>
        {(routeStatus === "empty" || routeStatus === "error") && (
          <p className="aircraft-detail-note" role="status">
            {routeStatus === "error"
              ? "Consulta da rota temporariamente indisponível."
              : "Rota não informada pela fonte."}
          </p>
        )}
        <section
          className="airline-details"
          aria-labelledby="airline-title"
          aria-busy={airlineStatus === "loading"}
        >
          <h3 id="airline-title">Companhia aérea</h3>
          {airline ? (
            <>
              <p className="airline-name">{airline.name}</p>
              <dl>
                <div>
                  <dt>País</dt>
                  <dd>{airline.country || "Não informado"}</dd>
                </div>
                <div>
                  <dt>ICAO / IATA</dt>
                  <dd>
                    {airline.icao || "—"} / {airline.iata || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Indicativo de rádio</dt>
                  <dd>{airline.callsign || "Não informado"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p role="status">
              {airlineStatus === "loading"
                ? "Consultando companhia…"
                : airlineStatus === "error"
                  ? "Consulta da companhia temporariamente indisponível."
                  : "Companhia não informada pela fonte."}
            </p>
          )}
        </section>
        <footer className="aircraft-details-footer">
          <span>
            Rota e companhia:{" "}
            <a
              href="https://www.adsbdb.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ADSBDB
            </a>
          </span>
          {(photoStatus === "error" ||
            routeStatus === "error" ||
            airlineStatus === "error") && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Tentar novamente
            </Button>
          )}
        </footer>
      </div>
    </section>
  );
}
