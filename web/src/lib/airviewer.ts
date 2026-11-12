import { RUNWAYS, bearing as runwayBearing, publishAirportSnapshot, subscribeAirportCommands } from "./airport-operations";
import { getRadarOrigin, setRadarOrigin, subscribeRadarOrigin } from "./home-radar";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import type {
  Airport,
  CameraSource,
  ScheduledFlight,
  Schedule,
  TrafficAircraft,
  TrafficState,
  AdsbAircraft,
  AdsbResponse,
  FlightRoute,
} from "./types";
import { element } from "./dom";
import {
  selectAircraft,
  getAircraftSelection,
  subscribeSavedAircraft,
} from "./aircraft-selection";
import { fetchFlightRoute } from "./aircraft-data";
import { aircraftIconKind, aircraftIconKinds, createAircraftMapIcon, createAircraftMarkerDataUrl } from "./aircraft-icons";

maplibregl.setWorkerUrl(workerUrl);

/** Mount once after React commits the shell; dispose before it unmounts. */
export function startAirviewer() {
  const lifecycle = new AbortController();
  const frames = new Set<number>();
  const requestFrame = (callback: FrameRequestCallback) => {
    const id = requestAnimationFrame((time) => {
      frames.delete(id);
      if (!lifecycle.signal.aborted) callback(time);
    });
    frames.add(id);
    return id;
  };
  const request = (input: RequestInfo | URL, init: RequestInit = {}) =>
    fetch(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([lifecycle.signal, init.signal])
        : lifecycle.signal,
    });
  const pageQuery = new URLSearchParams(window.location.search);
  const aircraftHex = pageQuery.get("hex") || "";
  let trackedAircraftHex = aircraftHex;
  const routeLabel = pageQuery.get("route") || "";
  const initialAircraftName = pageQuery.get("name") || "";
  const initialAircraftType = pageQuery.get("type") || "";
  const initialLat = Number(pageQuery.get("lat"));
  const initialLon = Number(pageQuery.get("lon"));
  const initialAltitude = Number(pageQuery.get("alt"));
  const initialTrack = Number(pageQuery.get("track"));
  let current = {
    lat: Number.isFinite(initialLat) ? initialLat : -23.4356,
    lon: Number.isFinite(initialLon) ? initialLon : -46.4731,
    altFeet: Number.isFinite(initialAltitude) ? initialAltitude : 0,
    track: Number.isFinite(initialTrack) ? initialTrack : 0,
    verticalRate: 0,
  };
  let map: maplibregl.Map;
  let marker: maplibregl.Marker | null = null;
  let homeMarker: maplibregl.Marker | null = null;
  let regionGeneration = 0;
  let towerRunway: string | null = null;
  let currentAircraftType = initialAircraftType;
  let trackedMarkerElement: HTMLDivElement | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let airportTrafficTimer: ReturnType<typeof setInterval> | undefined;
  let nightModeTimer: ReturnType<typeof setInterval> | undefined;
  let cameraDismissed = false;
  let activeAirportCamera: Airport | null = null;
  let arrivalsFetchInProgress = false;
  let lastArrivalsFetch = 0;
  let adsbRetryAt = 0;
  let trackedFetchInProgress = false;
  let scheduleData: Schedule | null = null;
  let scheduleFetchInProgress = false;
  let lastScheduleFetch = 0;
  let lastScheduleRender = 0;
  let routeFetchInProgress = false;
  let lastRouteFetch = 0;
  const routeCache = new Map<string, FlightRoute>();
  let trafficPanelMode = "schedule";
  let lastScheduleFlights: ScheduledFlight[] = [];
  let liveMessage = "Carregando";
  let scheduleMessage = "Carregando";
  // Temporariamente desativada; mantenha a seleção de voos no mapa do aeroporto.
  const aircraft3dEnabled = false;
  let airportOverviewMode = !aircraft3dEnabled;
  let lastAirportTraffic: TrafficAircraft[] = [];
  let lastAirportTrafficAt = 0;
  let airportTrafficStates = new Map<string, TrafficState>();
  let airportTrafficAnimationFrame: number | null = null;
  let lastRegionalSnapshotKey = "";
  let selectedAirportCode = "GRU";
  let selectedMovementFlight = "";
  let manualMapBearing: number | null = null;
  let pendingFlightSelection: {
    flight: string;
    route: string;
    airportCode: string;
  } | null = null;
  let nightMode = isNightTime();
  let cameraZoom = readStoredNumber("aircraft-3d-zoom", 13, 9, 18);
  let panoramaZoom = readStoredNumber("aircraft-3d-panorama-zoom", 11.5, 9, 18);
  const legacyPanelScale = readStoredNumber("aircraft-3d-panel-scale", 1.15, 0.85, 1.8);
  let cameraWidth = readStoredNumber("aircraft-3d-camera-width", 420, 300, 900);
  let selectedCameraSourceId = "primary";
  const airportCenterZoom = 11.5;
  const scheduleTimeFormat = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  let refreshIntervalMs = readStoredNumber(
    "aircraft-3d-refresh-ms",
    7000,
    2000,
    15000,
  );
  const history = [[current.lon, current.lat]];
  const diagnosticLines: string[] = [];

  const status = element("status");
  const modeEyebrow = element("mode-eyebrow");
  const airportSelect = element("airport-select");
  const recenterButton = element("recenter");
  const zoomControl = element("zoom-control");
  const zoomValue = element("zoom-value");
  const refreshInterval = element("refresh-interval");
  const airportCamera = element("airport-camera");
  const airportCameraFrame = element("airport-camera-frame");
  const airportCameraDistance = element("airport-camera-distance");
  const airportCameraTitle = element("airport-camera-title");
  const airportCameraLink = element("airport-camera-link");
  const airportCameraSource = element("airport-camera-source");
  const airportCameraFeedTitle = element("airport-camera-feed-title");
  const airportCameraNote = element("airport-camera-note");
  const cameraToggle = element("camera-toggle");
  const viewModeButton = element("view-mode");
  const aircraftViewSwitch = element("aircraft-view-switch");
  const airportViewSwitch = element("airport-view-switch");
  const cardinalValue = element("cardinal-value");
  const rightRail = document.querySelector<HTMLElement>(".right-rail")!;
  const arrivalsPanel = element("arrivals-panel");
  const arrivalsTitle = element("arrivals-title");
  const arrivalsCount = element("arrivals-count");
  const liveSignal = element("live-signal");
  const arrivalsList = element("arrivals-list");
  const scheduleList = element("schedule-list");
  const scheduleView = element("schedule-view");
  const liveView = element("live-view");
  const scheduleTab = element("schedule-tab");
  const liveTab = element("live-tab");
  const cameraSizeControl = element("camera-size-control");
  const cameraSizeValue = element("camera-size-value");
  const controls = document.querySelector<HTMLElement>(".controls")!;
  const controlsObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty(
      "--controls-height",
      `${controls.offsetHeight}px`,
    );
  });
  controlsObserver.observe(controls);
  const mobileViewport = window.matchMedia("(max-width: 900px)");
  const mobilePanel = element("mobile-panel");
  const mobileMenuToggle = element("mobile-menu-toggle");
  const mobileMap = element("mobile-map");
  let mobileView = "map";
  const mobileSections = ["camera", "flights", "options"];
  const mobileTitles: Record<string, string> = {
    menu: "Menu",
    camera: "Câmera",
    flights: "Próximos voos",
    options: "Opções",
  };
  const mobileDestinations = (
    [
      [airportCamera, "camera"],
      [arrivalsPanel, "flights"],
      [document.querySelector<HTMLElement>(".controls")!, "options"],
    ] satisfies [HTMLElement, string][]
  ).map(([element, section]) => {
    const placeholder = document.createComment("Posição no desktop");
    element.before(placeholder);
    return { element, section, placeholder };
  });
  function setMobileView(view: string, focus = true) {
    mobileView = view;
    mobilePanel.hidden = view === "map";
    mobileMenuToggle.setAttribute("aria-expanded", String(view !== "map"));
    if (view === "map") mobileMap.setAttribute("aria-current", "page");
    else mobileMap.removeAttribute("aria-current");
    element("mobile-menu").hidden = view !== "options";
    mobileSections.forEach((section) => {
      element(`mobile-${section}`).hidden = section !== view;
    });
    element("mobile-panel-title").textContent = mobileTitles[view] || "Menu";
    document.querySelector<HTMLElement>(".mobile-panel-content")!.scrollTop = 0;
    if (mobileViewport.matches) {
      if (view === "camera") showAirportCamera();
      else {
        airportCameraFrame.removeAttribute("src");
      }
    }
    if (focus)
      (view === "map"
        ? mobileMenuToggle
        : element("mobile-panel-title")
      ).focus();
  }
  function syncMobileLayout() {
    mobileDestinations.forEach(({ element: node, section, placeholder }) => {
      if (mobileViewport.matches) element(`mobile-${section}`).append(node);
      else placeholder.after(node);
    });
    setMobileView("map", false);
    if (!mobileViewport.matches && !cameraDismissed) showAirportCamera();
    if (map) map.resize();
  }
  mobileMenuToggle.addEventListener(
    "click",
    () => setMobileView(mobileView === "options" ? "map" : "options"),
    { signal: lifecycle.signal },
  );
  mobileMap.addEventListener("click", () => setMobileView("map"), {
    signal: lifecycle.signal,
  });
  element("mobile-panel-close").addEventListener(
    "click",
    () => setMobileView("map"),
    { signal: lifecycle.signal },
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-mobile-view]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => setMobileView(button.dataset.mobileView || "map"),
        { signal: lifecycle.signal },
      );
    });
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        mobileViewport.matches &&
        mobileView !== "map"
      )
        setMobileView("map");
    },
    { signal: lifecycle.signal },
  );
  // Preserve the existing handlers and values when moving between layouts.
  mobileViewport.addEventListener("change", syncMobileLayout, {
    signal: lifecycle.signal,
  });
  const mobileObserver = new MutationObserver(() => {
    element("mobile-camera-empty").hidden =
      !airportCamera.classList.contains("hidden");
    element("mobile-flights-empty").hidden =
      !arrivalsPanel.classList.contains("hidden");
  });
  mobileObserver.observe(mobilePanel, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  arrivalsPanel.addEventListener(
    "click",
    (event) => {
      if (
        mobileViewport.matches &&
        event.target instanceof Element &&
        event.target.closest(".arrival-row, .schedule-row")
      )
        setMobileView("map");
    },
    { signal: lifecycle.signal },
  );
  const airports: Airport[] = [
    {
      code: "GIG",
      name: "Galeao",
      lat: -22.809,
      lon: -43.2506,
      elevationFeet: 28,
      radiusKm: 50,
      feedRadiusNm: 45,
      videoId: "",
      videoSearchUrl:
        "https://www.youtube.com/results?search_query=GIG+Galeao+camera+ao+vivo",
    },
    {
      code: "GRU",
      name: "Guarulhos",
      lat: -23.4356,
      lon: -46.4731,
      elevationFeet: 2459,
      radiusKm: 45,
      feedRadiusNm: 45,
      liveSources: [
        {
          id: "sbgr-live",
          label: "SBGR Live - ao vivo",
          channelId: "UCNZCKDhAVtbh7sddChTxI7w",
          externalUrl: "https://www.youtube.com/@SBGRLIVE/live",
        },
        {
          id: "golf-live",
          label: "Golf Oscar Romeo - ao vivo",
          channelId: "UCbpmfj2g2tYuBezI2kEDhsg",
          externalUrl: "https://www.youtube.com/@GolfOscarRomeoAviacao/live",
        },
      ],
      archiveSources: [
        {
          id: "archive-1",
          label: "ARQUIVO - Golf Oscar Romeo (22/07)",
          videoId: "t7e8AYLM8i4",
          externalUrl: "https://www.youtube.com/watch?v=t7e8AYLM8i4",
        },
        {
          id: "archive-2",
          label: "ARQUIVO - Golf Oscar Romeo (21/07)",
          videoId: "4dSeSUxsDio",
          externalUrl: "https://www.youtube.com/watch?v=4dSeSUxsDio",
        },
      ],
      videoSearchUrl: "https://www.youtube.com/@SBGRLIVE/live",
    },
    {
      code: "SDU",
      name: "Santos Dumont",
      lat: -22.9105,
      lon: -43.1631,
      elevationFeet: 11,
      radiusKm: 25,
      feedRadiusNm: 30,
      videoId: "",
      videoSearchUrl:
        "https://www.youtube.com/results?search_query=SDU+Santos+Dumont+camera+ao+vivo",
    },
  ];
  const airportRunways: FeatureCollection = {
    type: "FeatureCollection",
    features: RUNWAYS.map(runway => ({ type: "Feature", properties: { airport: runway.airport, runway: runway.ends.join(" / ") },
      geometry: { type: "LineString", coordinates: runway.coordinates } })),
  };
  // Referencia visual dos eixos de aproximacao; nao representa uma STAR publicada.
  const airportApproaches: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { airport: "GRU", approach: "APROX. 10L" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.64, -23.4769],
            [-46.482548, -23.434059],
          ],
        },
      },
      {
        type: "Feature",
        properties: { airport: "GRU", approach: "APROX. 28R" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.291, -23.3826],
            [-46.449203, -23.425043],
          ],
        },
      },
      {
        type: "Feature",
        properties: { airport: "GRU", approach: "APROX. 10R" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.6448, -23.4827],
            [-46.487, -23.438801],
          ],
        },
      },
      {
        type: "Feature",
        properties: { airport: "GRU", approach: "APROX. 28L" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-46.3, -23.3888],
            [-46.4589, -23.4312],
          ],
        },
      },
    ],
  };
  try {
  } catch (_) {}
  const routeElement = element("route");
  routeElement.textContent = routeLabel || "ROTA NAO CONFIRMADA";

  function updateAircraftIdentity(aircraft: AdsbAircraft | null) {
    const liveName =
      aircraft && String(aircraft.flight || aircraft.r || "").trim();
    const liveType = aircraft && String(aircraft.t || "").trim();
    const name =
      liveName ||
      initialAircraftName ||
      trackedAircraftHex.toUpperCase() ||
      "AERONAVE NAO IDENTIFICADA";
    const type = liveType || initialAircraftType;
    currentAircraftType = type;
    updateTrackedIcon();
    const identity = type ? `${name} | ${type}` : name;
    element("aircraft-identity").textContent = identity;
  }

  function readStoredNumber(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value >= minimum && value <= maximum
        ? value
        : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function storeNumber(key: string, value: number) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  function isNightTime() {
    const hour = new Date().getHours();
    return hour >= 18 || hour < 6;
  }

  function mapStyleUrl() {
    return nightMode
      ? "https://tiles.openfreemap.org/styles/dark"
      : "https://tiles.openfreemap.org/styles/bright";
  }

  function updateNightMode() {
    const nextNightMode = isNightTime();
    document.body.classList.toggle("night-mode", nextNightMode);
    if (nextNightMode === nightMode) return;
    nightMode = nextNightMode;
    if (map) map.setStyle(mapStyleUrl());
  }

  function enterAirportPanorama(airportCode: string) {
    selectAircraft(null);
    trackedAircraftHex = "";
    selectedMovementFlight = "";
    pendingFlightSelection = null;
    airportOverviewMode = true;
    history.length = 0;
    routeElement.textContent = `TRAFEGO ${airportCode}`;
    modeEyebrow.textContent = "VISAO PANORAMICA 3D";
    element("aircraft-identity").textContent = "VISAO PANORAMICA DO AEROPORTO";
    element("telemetry").classList.add("hidden");
    if (trackedMarkerElement) trackedMarkerElement.style.display = "none";
    redrawAirportTraffic();
    zoomControl.value = String(panoramaZoom);
    showZoomValue();
    status.textContent = `Visao panoramica - ${airportCode}`;
    updateViewModeButton();
  }

  function showZoomValue() {
    const activeZoom = airportOverviewMode ? panoramaZoom : cameraZoom;
    zoomValue.value = activeZoom.toFixed(1).replace(".0", "");
  }

  function showCameraSizeValue() {
    cameraSizeValue.value = `${Math.round(cameraWidth)} px`;
    airportCamera.style.setProperty("--panel-width", `${Math.round(cameraWidth)}px`);
  }

    function initPanelResize(panel: HTMLElement, storageKey: string, width: number, height: number, minimumHeight: number) {
      const handle = panel.querySelector<HTMLButtonElement>('.panel-resize');
      if (!handle) return;
      const widthDirection = panel === airportCamera ? 1 : -1;
      const heightDirection = -widthDirection;
      const minimumWidth = panel === airportCamera ? 300 : 260;
      const savedWidth = readStoredNumber(`${storageKey}-width`, width, minimumWidth, 900);
      const savedHeight = readStoredNumber(`${storageKey}-height`, panel === arrivalsPanel ? NaN : height, minimumHeight, 900);
      panel.style.setProperty('--panel-width', `${savedWidth}px`);
      if (Number.isFinite(savedHeight)) panel.style.setProperty('--panel-height', `${savedHeight}px`);
      else panel.style.removeProperty('--panel-height');
      if (panel === airportCamera) {
        cameraWidth = savedWidth;
        cameraSizeControl.value = String(cameraWidth);
        showCameraSizeValue();
      }
      let drag: {pointerId: number; x: number; y: number; width: number; height: number} | null = null;
      const applySize = (nextWidth: number, nextHeight: number) => {
        const maxWidth = Math.min(900, window.innerWidth - (panel === airportCamera ? 32 : 116));
        const maxHeight = Math.min(900, window.innerHeight - (panel === airportCamera ? 200 : 210));
        panel.style.setProperty('--panel-width', `${Math.max(minimumWidth, Math.min(nextWidth, maxWidth))}px`);
        panel.style.setProperty('--panel-height', `${Math.max(minimumHeight, Math.min(nextHeight, maxHeight))}px`);
        if (panel === airportCamera) {
          cameraWidth = panel.offsetWidth;
          cameraSizeControl.value = String(cameraWidth);
          showCameraSizeValue();
        }
      };
      const saveSize = () => {
        storeNumber(`${storageKey}-width`, Number.parseFloat(panel.style.getPropertyValue('--panel-width')));
        storeNumber(`${storageKey}-height`, Number.parseFloat(panel.style.getPropertyValue('--panel-height')));
      };
      const finishDrag = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag = null;
        document.body.classList.remove('resizing-panel');
        if (!mobileViewport.matches) saveSize();
      };
      handle.addEventListener('pointerdown', event => {
        if (mobileViewport.matches || event.button !== 0) return;
        event.preventDefault();
        drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: panel.offsetWidth, height: panel.offsetHeight };
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('resizing-panel');
      }, { signal: lifecycle.signal });
      handle.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        applySize(drag.width + (event.clientX - drag.x) * widthDirection, drag.height + (event.clientY - drag.y) * heightDirection);
      }, { signal: lifecycle.signal });
      handle.addEventListener('pointerup', finishDrag, { signal: lifecycle.signal });
      handle.addEventListener('pointercancel', finishDrag, { signal: lifecycle.signal });
      handle.addEventListener('lostpointercapture', finishDrag, { signal: lifecycle.signal });
      handle.addEventListener('keydown', event => {
        if (mobileViewport.matches || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 16;
        const x = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        const y = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        applySize(panel.offsetWidth + x * widthDirection, panel.offsetHeight + y * heightDirection);
        saveSize();
      }, { signal: lifecycle.signal });
    }

  function updateTelemetry() {
    const degrees = String.fromCharCode(176);
    element("telemetry").textContent =
      `ALTITUDE  ${Math.round(current.altFeet || 0).toLocaleString("pt-BR")} PES\n` +
      `RUMO      ${String(Math.round(current.track || 0)).padStart(3, "0")}${degrees}\n` +
      `POSICAO   ${Number(current.lat).toFixed(4)}, ${Number(current.lon).toFixed(4)}`;
  }

  function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const radiusKm = 6371;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const deltaLatitude = toRadians(lat2 - lat1);
    const deltaLongitude = toRadians(lon2 - lon1);
    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(deltaLongitude / 2) ** 2;
    return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const latitude1 = toRadians(lat1);
    const latitude2 = toRadians(lat2);
    const deltaLongitude = toRadians(lon2 - lon1);
    const y = Math.sin(deltaLongitude) * Math.cos(latitude2);
    const x =
      Math.cos(latitude1) * Math.sin(latitude2) -
      Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  function angleDifference(left: number, right: number) {
    return Math.abs(((left - right + 540) % 360) - 180);
  }

  function publishOperations() {
    publishAirportSnapshot({ code: activeAirportCamera?.code || selectedAirportCode,
      name: activeAirportCamera?.name || "", elevation: activeAirportCamera?.elevationFeet || 0,
      traffic: lastAirportTraffic, receivedAt: lastAirportTrafficAt, message: liveMessage, towerRunway });
    document.documentElement.dataset.airportView = towerRunway ? "tower" : "panorama";
  }

  function clearNearbyArrivals() {
    arrivalsPanel.classList.add("hidden");
    arrivalsList.replaceChildren();
    scheduleList.replaceChildren();
    lastScheduleFlights = [];
    liveMessage = "Carregando";
    liveSignal.classList.add("hidden");
    scheduleMessage = "Carregando";
    updateMovementCount();
    lastAirportTraffic = [];
    lastAirportTrafficAt = 0;
    lastRegionalSnapshotKey = "";
    publishOperations();
    airportTrafficStates.clear();
    if (airportTrafficAnimationFrame) {
      cancelAnimationFrame(airportTrafficAnimationFrame);
      airportTrafficAnimationFrame = null;
    }
    if (map && map.getSource("airport-arrivals")) {
      map
        .getSource<maplibregl.GeoJSONSource>("airport-arrivals")!
        .setData({ type: "FeatureCollection", features: [] });
    }
  }

  function updateMovementCount() {
    arrivalsCount.textContent =
      trafficPanelMode === "schedule"
        ? scheduleMessage ||
          `${lastScheduleFlights.length} ${lastScheduleFlights.length === 1 ? "voo" : "voos"}`
        : liveMessage ||
          `${lastAirportTraffic.length} ${lastAirportTraffic.length === 1 ? "aeronave" : "aeronaves"}`;
  }

  function renderNearbyArrivals(
    airport: Airport,
    arrivals: TrafficAircraft[],
    message = "",
  ) {
    lastAirportTraffic = arrivals;
    if (airport.code === "CASA" && !trackedAircraftHex) {
      status.textContent = message || `Radar de casa | ${arrivals.length} aeronaves | atualizado ${new Date().toLocaleTimeString("pt-BR")}`;
    }
    arrivalsPanel.classList.remove("hidden");
    arrivalsTitle.textContent = airport.code === "CASA" ? "AO REDOR DA MINHA CASA" : `MOVIMENTOS - ${airport.code}`;
    setLiveMessage(message);
    publishOperations();
    arrivalsList.replaceChildren();
    if (!arrivals.length) {
      const empty = document.createElement("div");
      empty.className = "arrivals-empty";
      empty.textContent = message || "Nenhuma aeronave detectada na região.";
      arrivalsList.appendChild(empty);
      return;
    }
    for (const arrival of arrivals) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "arrival-row";
      if (selectedMovementFlight === arrival.flight)
        row.classList.add("selected");
      row.setAttribute("aria-label", `Acompanhar ${arrival.flight}`);
      const name = document.createElement("strong");
      name.textContent = arrival.flight;
      const distance = document.createElement("span");
      distance.textContent = `${arrival.distance.toFixed(1).replace(".", ",")} km`;
      const detail = document.createElement("small");
      detail.textContent = `${Math.round(arrival.altitude).toLocaleString("pt-BR")} pes | rumo ${Math.round(arrival.track)} graus${arrival.type ? ` | ${arrival.type}` : ""}`;
      if (airport.code === "CASA") {
        const direction = arrival.headingDifference <= 70 ? "Se aproximando" : arrival.headingDifference >= 110 ? "Se afastando" : "Passando pela região";
        detail.textContent = `${direction} | ${detail.textContent}`;
      }
      row.append(name, distance, detail);
      row.addEventListener(
        "click",
        () => selectLiveMovement(arrival, airport, true),
        { signal: lifecycle.signal },
      );
      arrivalsList.appendChild(row);
    }
  }

  function setLiveMessage(message: string) {
    liveMessage = message;
    liveSignal.textContent = message;
    liveSignal.classList.toggle("hidden", !message);
    updateMovementCount();
  }

  function renderAirportSchedule(
    airport: Airport,
    flights: ScheduledFlight[],
    message = "",
  ) {
    lastScheduleFlights = flights;
    scheduleMessage = message;
    arrivalsPanel.classList.remove("hidden");
    arrivalsTitle.textContent = airport.code === "CASA" ? "AO REDOR DA MINHA CASA" : `MOVIMENTOS - ${airport.code}`;
    updateMovementCount();
    scheduleList.replaceChildren();
    redrawAirportTraffic();
    if (!flights.length) {
      const empty = document.createElement("div");
      empty.className = "arrivals-empty";
      empty.textContent =
        message || "Nenhum voo programado nos próximos 30 minutos.";
      scheduleList.appendChild(empty);
      return;
    }
    for (const flight of flights) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "schedule-row";
      if (selectedMovementFlight === flight.flight)
        row.classList.add("selected");
      row.setAttribute("aria-label", `Selecionar voo ${flight.flight}`);
      const time = document.createElement("span");
      time.className = "schedule-time";
      time.textContent = scheduleTimeFormat.format(flight.time);
      const name = document.createElement("strong");
      name.textContent = flight.flight || "VOO";
      const direction = document.createElement("span");
      direction.className = `schedule-direction${flight.direction === "departure" ? " departure" : ""}`;
      direction.textContent =
        flight.direction === "departure" ? "SAI" : "CHEGA";
      const detail = document.createElement("small");
      detail.textContent = movementRoute(flight, airport);
      row.append(time, name, direction, detail);
      row.addEventListener(
        "click",
        () => selectScheduledMovement(flight, airport),
        { signal: lifecycle.signal },
      );
      scheduleList.appendChild(row);
    }
  }

  function flightKey(flight: string | undefined) {
    return String(flight || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/^([A-Z]{3})0+(?=\d)/, "$1");
  }

  function normalizeTrafficFlight(
    rawFlight: string | undefined,
    registration: string | undefined,
    hex: string | undefined,
  ) {
    const raw = String(rawFlight || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (/^[A-Z0-9-]{2,12}$/.test(raw) && /[A-Z0-9]/.test(raw)) return raw;
    const fallbackRegistration = String(registration || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (/^[A-Z0-9-]{2,12}$/.test(fallbackRegistration))
      return fallbackRegistration;
    return String(hex || "SEM CALLSIGN")
      .trim()
      .toUpperCase();
  }

  async function refreshRouteCache() {
    if (routeFetchInProgress) return;
    const now = Date.now();
    if (now - lastRouteFetch < 30000) return;
    routeFetchInProgress = true;
    lastRouteFetch = now;
    try {
      const flights = [
        ...new Set(
          lastAirportTraffic
            .map((aircraft) => String(aircraft.flight || "").trim())
            .filter(Boolean),
        ),
      ].slice(0, 12);
      await Promise.all(
        flights.map(async (flight) => {
          const route = await fetchFlightRoute(flight, lifecycle.signal);
          if (route && !lifecycle.signal.aborted)
            routeCache.set(flightKey(flight), route);
        }),
      );
      redrawAirportTraffic();
    } catch (error) {
      if (lifecycle.signal.aborted) return;
      addDiagnostic("Rotas ADSBDB", "Consulta web indisponivel no momento.");
    } finally {
      routeFetchInProgress = false;
    }
  }

  function findLiveTrafficForFlight(flight: string) {
    const key = flightKey(flight);
    return lastAirportTraffic.find(
      (aircraft) => flightKey(aircraft.flight) === key,
    );
  }

  function trafficRoute(aircraft: TrafficAircraft) {
    if (getRadarOrigin()) {
      const cached = routeCache.get(flightKey(aircraft.flight));
      return cached?.origin && cached.destination ? `${cached.origin} -> ${cached.destination}` : "ROTA NÃO INFORMADA";
    }
    const liveFlight = flightKey(aircraft.flight);
    const scheduled = lastScheduleFlights.find(
      (flight) => flightKey(flight.flight) === liveFlight,
    );
    if (scheduled) {
      const airportCode = activeAirportCamera ? activeAirportCamera.code : "--";
      const otherAirport = scheduled.airport || "--";
      return scheduled.direction === "departure"
        ? `${airportCode} -> ${otherAirport}`
        : `${otherAirport} -> ${airportCode}`;
    }
    const cached = routeCache.get(liveFlight);
    if (cached && cached.origin && cached.destination)
      return `${cached.origin} -> ${cached.destination}`;
    if (aircraft.movement === "arrival" && activeAirportCamera)
      return `-- -> ${activeAirportCamera.code}`;
    if (aircraft.movement === "departure" && activeAirportCamera)
      return `${activeAirportCamera.code} -> --`;
    return "--";
  }

  function trafficMovement(aircraft: TrafficAircraft) {
    if (getRadarOrigin()) return aircraft.movement;
    const cached = routeCache.get(flightKey(aircraft.flight));
    const airportCode = String(activeAirportCamera?.code || "").toUpperCase();
    if (cached && airportCode) {
      const origin = String(cached.origin || "").toUpperCase();
      const destination = String(cached.destination || "").toUpperCase();
      if (origin === airportCode) return "departure";
      if (destination === airportCode) return "arrival";
      if (origin && destination) return "overflight";
    }
    return aircraft.movement || "nearby";
  }

  function movementRoute(flight: ScheduledFlight, airport: Airport) {
    const other = flight.airport || "---";
    return flight.direction === "departure"
      ? `${airport.code} -> ${other}`
      : `${other} -> ${airport.code}`;
  }

  function followTrafficAircraft(
    aircraft: TrafficAircraft,
    airport: Airport,
    selectedRoute: string,
    movementLabel = "",
  ) {
    trackedAircraftHex = aircraft.hex;
    selectedMovementFlight = movementLabel || aircraft.flight;
    pendingFlightSelection = null;
    current.lat = aircraft.lat;
    current.lon = aircraft.lon;
    current.altFeet = aircraft.altitude;
    current.track = aircraft.track;
    current.verticalRate = aircraft.verticalRate;
    history.length = 0;
    history.push([current.lon, current.lat]);
    routeElement.textContent =
      selectedRoute || `${aircraft.flight} | ${airport.code}`;
    modeEyebrow.textContent = towerRunway ? "TORRE VIRTUAL 3D" : getRadarOrigin() ? "RADAR DA MINHA CASA" : "VISAO PANORAMICA 3D";
    updateAircraftIdentity({ flight: aircraft.flight, t: aircraft.type });
    selectAircraft({
      hex: aircraft.hex,
      registration: aircraft.registration,
      flight: aircraft.flight,
      type: aircraft.type,
      routeHint: selectedRoute,
    });
    rightRail.scrollTop = 0;
    element("telemetry").classList.remove("hidden");
    if (trackedMarkerElement) trackedMarkerElement.style.display = "grid";
    airportOverviewMode = true;
    zoomControl.value = String(panoramaZoom);
    showZoomValue();
    updateTelemetry();
    updateAirportCamera();
    updateTrail();
    redrawAirportTraffic();
    updateViewModeButton();
    status.textContent = `Acompanhando ${aircraft.flight} pelo ADS-B`;
    if (activeAirportCamera?.code === airport.code) {
      renderNearbyArrivals(airport, lastAirportTraffic, liveMessage);
      if (!getRadarOrigin()) renderAirportSchedule(airport, lastScheduleFlights, scheduleMessage);
    }
  }

  function centerSelectedAircraft() {
    if (!map || !trackedAircraftHex || towerRunway) return;
    map.stop();
    map.easeTo({
      center: [current.lon, current.lat],
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
    });
  }

  function selectLiveMovement(aircraft: TrafficAircraft, airport: Airport, centerMap = false) {
    followTrafficAircraft(aircraft, airport, trafficRoute(aircraft));
    if (centerMap) centerSelectedAircraft();
  }

  function selectScheduledMovement(flight: ScheduledFlight, airport: Airport) {
    selectAircraft(null);
    trackedAircraftHex = "";
    if (trackedMarkerElement) trackedMarkerElement.style.display = "none";
    redrawAirportTraffic();
    element("telemetry").classList.add("hidden");
    selectedMovementFlight = flight.flight;
    const selectedRoute = movementRoute(flight, airport);
    routeElement.textContent = selectedRoute;
    pendingFlightSelection = {
      flight: flight.flight,
      route: selectedRoute,
      airportCode: airport.code,
    };
    renderAirportSchedule(airport, lastScheduleFlights, scheduleMessage);
    const liveAircraft = findLiveTrafficForFlight(flight.flight);
    if (liveAircraft) {
      followTrafficAircraft(
        liveAircraft,
        airport,
        selectedRoute,
        flight.flight,
      );
      centerSelectedAircraft();
    } else {
      void locateScheduledAircraft(flight, airport, pendingFlightSelection);
    }
  }

  async function locateScheduledAircraft(
    flight: ScheduledFlight,
    airport: Airport,
    selection: NonNullable<typeof pendingFlightSelection>,
  ) {
    const stillSelected = () => !lifecycle.signal.aborted &&
      pendingFlightSelection === selection && activeAirportCamera?.code === airport.code;
    status.textContent = `${flight.flight} | buscando posição atual da aeronave…`;
    try {
      const payload = await fetchAdsb(`callsign/${encodeURIComponent(flightKey(flight.flight))}`);
      if (!stillSelected()) return;
      const candidates = payload.ac.filter(raw =>
        flightKey(raw.flight) === flightKey(flight.flight) &&
        /^[a-f0-9]{6}$/i.test(raw.hex || "") &&
        typeof raw.lat === "number" && Number.isFinite(raw.lat) && Math.abs(raw.lat) <= 90 &&
        typeof raw.lon === "number" && Number.isFinite(raw.lon) && Math.abs(raw.lon) <= 180 &&
        typeof raw.seen_pos === "number" && Number.isFinite(raw.seen_pos) && raw.seen_pos >= 0 && raw.seen_pos <= 60,
      );
      if (candidates.length !== 1) {
        status.textContent = candidates.length > 1
          ? `${flight.flight} | mais de uma aeronave encontrada; posição não confirmada`
          : `${flight.flight} | sem posição ADS-B disponível no momento`;
        return;
      }
      const raw = candidates[0];
      const lat = raw.lat!, lon = raw.lon!;
      const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
      const aircraft: TrafficAircraft = {
        hex: raw.hex!.toLowerCase(),
        registration: String(raw.r || "").trim().toUpperCase(),
        flight: normalizeTrafficFlight(raw.flight, raw.r, raw.hex),
        type: String(raw.t || "").trim().toUpperCase(),
        lat, lon,
        altitude: raw.alt_baro === "ground" ? airport.elevationFeet : finite(raw.alt_baro ?? raw.alt_geom),
        track: finite(raw.track ?? raw.calc_track ?? raw.true_heading),
        verticalRate: finite(raw.baro_rate ?? raw.geom_rate),
        groundSpeed: finite(raw.gs),
        distance: distanceKm(lat, lon, airport.lat, airport.lon),
        airportBearing: bearingTo(lat, lon, airport.lat, airport.lon),
        headingDifference: 0,
        onGround: raw.alt_baro === "ground",
        movement: flight.direction,
      };
      followTrafficAircraft(aircraft, airport, selection.route, flight.flight);
      centerSelectedAircraft();
    } catch {
      if (stillSelected()) status.textContent = `${flight.flight} | consulta ADS-B indisponível; tente novamente`;
    }
  }

  function setTrafficPanelMode(mode: "schedule" | "live") {
    if (getRadarOrigin()) mode = "live";
    trafficPanelMode = mode;
    const scheduleSelected = mode === "schedule";
    scheduleTab.setAttribute("aria-selected", String(scheduleSelected));
    liveTab.setAttribute("aria-selected", String(!scheduleSelected));
    scheduleView.classList.toggle("hidden", !scheduleSelected);
    liveView.classList.toggle("hidden", scheduleSelected);
    if (!activeAirportCamera) return;
    updateMovementCount();
  }

  async function refreshAirportSchedule(force = false) {
    if (getRadarOrigin() || !activeAirportCamera || scheduleFetchInProgress) return;
    const now = Date.now();
    if (!force && now - lastScheduleRender < 30000) return;
    lastScheduleRender = now;

    if (now - lastScheduleFetch >= (scheduleData ? 15 * 60000 : 60000)) {
      scheduleFetchInProgress = true;
      lastScheduleFetch = now;
      if (!scheduleData)
        renderAirportSchedule(
          activeAirportCamera,
          [],
          "Carregando programação…",
        );
      try {
        const response = await request("./schedule.json", {
          cache: "no-cache",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error(`Programação HTTP ${response.status}`);
        const data = await response.json();
        lifecycle.signal.throwIfAborted();
        if (
          !Number.isFinite(data.start) ||
          !Number.isFinite(data.end) ||
          !airports.every((airport) =>
            Array.isArray(data.airports?.[airport.code]),
          )
        ) {
          throw new Error("Formato inesperado da programação");
        }
        scheduleData = data;
      } catch (error) {
        if (lifecycle.signal.aborted) return;
        addDiagnostic(
          "Programação ANAC/SIROS",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        scheduleFetchInProgress = false;
      }
    }

    const airport = activeAirportCamera;
    if (!airport || getRadarOrigin()) return;
    const from = Date.now();
    const until = from + 30 * 60000;
    if (
      !scheduleData ||
      from < scheduleData.start ||
      until > scheduleData.end
    ) {
      renderAirportSchedule(
        airport,
        [],
        "Programação temporariamente indisponível.",
      );
      return;
    }
    const flights = scheduleData.airports[airport.code].filter(
      (flight) => flight.time >= from && flight.time < until,
    );
    renderAirportSchedule(airport, flights);
  }

  async function fetchAdsb(path: string): Promise<AdsbResponse> {
    const response = await request(
      `https://proxy.cors.dev/https://api.adsb.lol/v2/${path}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.status === 429) {
      const now = Date.now();
      const retryAfter = response.headers.get("Retry-After") || "";
      const retryAt = /^\d+$/.test(retryAfter)
        ? now + Number(retryAfter) * 1000
        : Date.parse(retryAfter);
      adsbRetryAt = Math.max(adsbRetryAt, now + 30000, retryAt || 0);
    }
    if (!response.ok) throw new Error(`adsb.lol HTTP ${response.status}`);
    const data = await response.json();
    lifecycle.signal.throwIfAborted();
    if (!Array.isArray(data.ac)) throw new Error("Resposta ADS-B inesperada");
    if (data.now && Date.now() - data.now > 90000)
      throw new Error("Posições ADS-B desatualizadas");
    return data;
  }

  async function refreshNearbyArrivals() {
    if (!activeAirportCamera || !map || !map.getSource("airport-arrivals"))
      return;
    const now = Date.now();
    if (lastAirportTrafficAt && now - lastAirportTrafficAt >= 60000)
      showAdsbInterruption(activeAirportCamera);
    if (
      arrivalsFetchInProgress ||
      now < adsbRetryAt ||
      now - lastArrivalsFetch < 15000
    )
      return;
    arrivalsFetchInProgress = true;
    lastArrivalsFetch = now;
    const airport = { ...activeAirportCamera };
    const generation = regionGeneration;
    const homeMode = airport.code === "CASA";
    const radiusNm = airport.feedRadiusNm || 30;
    try {
      const data = await fetchAdsb(
        `point/${airport.lat}/${airport.lon}/${radiusNm}`,
      );
      if (activeAirportCamera?.code !== airport.code || generation !== regionGeneration) return;
      const firstAircraft = (data.ac || [])[0] || {};
      const snapshotKey = `${airport.code}:${data.now || ""}:${data.total || 0}:${firstAircraft.hex || ""}:${firstAircraft.lat || ""}:${firstAircraft.lon || ""}`;
      if (snapshotKey === lastRegionalSnapshotKey) return;
      lastRegionalSnapshotKey = snapshotKey;
      lastAirportTrafficAt = Date.now();
      document.documentElement.dataset.airportTrafficSnapshot = homeMode ? `CASA:${data.now || ""}` : snapshotKey;
      document.documentElement.dataset.airportTrafficReceivedAt =
        String(lastAirportTrafficAt);
      const traffic = data.ac
        .filter(
          (item) =>
            item.hex &&
            item.lat != null &&
            item.lon != null &&
            !((item.seen_pos ?? 0) > 60),
        )
        .map((item) => {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          const onGround =
            String(item.alt_baro || "").toLowerCase() === "ground";
          const geometricAltitude = Number(item.alt_geom);
          const barometricAltitude = Number(item.alt_baro);
          const altitude = onGround
            ? Number.isFinite(geometricAltitude)
              ? geometricAltitude
              : airport.elevationFeet
            : Number.isFinite(barometricAltitude)
              ? barometricAltitude
              : geometricAltitude;
          const track = Number(
            item.track ?? item.calc_track ?? item.true_heading,
          );
          const verticalRate = Number(item.baro_rate ?? item.geom_rate);
          const groundSpeed = Number(item.gs);
          const distance =
            Number.isFinite(lat) && Number.isFinite(lon)
              ? distanceKm(lat, lon, airport.lat, airport.lon)
              : Infinity;
          const airportBearing =
            Number.isFinite(lat) && Number.isFinite(lon)
              ? bearingTo(lat, lon, airport.lat, airport.lon)
              : NaN;
          const headingDifference =
            Number.isFinite(track) && Number.isFinite(airportBearing)
              ? angleDifference(track, airportBearing)
              : NaN;
          return {
            hex: String(item.hex || "").toLowerCase(),
            registration: String(item.r || "")
              .trim()
              .toUpperCase(),
            lat,
            lon,
            altitude,
            track,
            verticalRate,
            groundSpeed,
            distance,
            airportBearing,
            headingDifference,
            onGround,
            flight: normalizeTrafficFlight(item.flight, item.r, item.hex),
            type: String(item.t || "")
              .trim()
              .toUpperCase(),
            movement:
              headingDifference <= 70
                ? "arrival"
                : headingDifference >= 110
                  ? "departure"
                  : "nearby",
          };
        })
        .filter((item) => {
          if (!item.flight) return false;
          if (
            ![
              item.lat,
              item.lon,
              item.altitude,
              item.track,
              item.airportBearing,
              item.headingDifference,
            ].every(Number.isFinite)
          )
            return false;
          if (homeMode) return !item.onGround && item.distance <= airport.radiusKm && item.altitude >= -1500 && item.altitude <= 65000;
          if (
            item.altitude - airport.elevationFeet < -200 ||
            item.altitude > 25000 ||
            item.distance > radiusNm * 1.852
          )
            return false;
          if (
            item.onGround &&
            (item.distance > 8 ||
              (Number.isFinite(item.groundSpeed) && item.groundSpeed < 15))
          )
            return false;
          if (
            !item.onGround &&
            Number.isFinite(item.groundSpeed) &&
            item.groundSpeed < 60
          )
            return false;
          if (/^(H|R22|R44|R66)/.test(item.type)) return false;
          return true;
        })
        .sort((left, right) => left.distance - right.distance);

      renderNearbyArrivals(airport, traffic);
      animateAirportTraffic(traffic);
      void refreshRouteCache();
      if (
        pendingFlightSelection &&
        pendingFlightSelection.airportCode === airport.code
      ) {
        const liveAircraft = findLiveTrafficForFlight(
          pendingFlightSelection.flight,
        );
        if (liveAircraft) {
          followTrafficAircraft(
            liveAircraft,
            airport,
            pendingFlightSelection.route,
            pendingFlightSelection.flight,
          );
          centerSelectedAircraft();
        }
      }
    } catch (error) {
      if (lifecycle.signal.aborted) return;
      if (activeAirportCamera?.code !== airport.code || generation !== regionGeneration) return;
      addDiagnostic(
        "Tráfego ADS-B",
        error instanceof Error ? error.message : String(error),
      );
      showAdsbInterruption(airport);
    } finally {
      arrivalsFetchInProgress = false;
    }
  }

  function showAdsbInterruption(airport: Airport) {
    if (
      airportTrafficStates.size &&
      Date.now() - lastAirportTrafficAt < 60000
    ) {
      setLiveMessage("ADS-B: últimas posições recebidas");
      return;
    }
    lastRegionalSnapshotKey = "";
    lastAirportTrafficAt = 0;
    airportTrafficStates.clear();
    animateAirportTraffic([]);
    renderNearbyArrivals(
      airport,
      [],
      "Sinal ADS-B temporariamente indisponível.",
    );
  }

  function getCameraSources(camera: Airport | null) {
    if (!camera) return [];
    const sources: CameraSource[] = [];
    (camera.liveSources || []).forEach((source) => {
      if (
        !source?.channelId ||
        sources.some((existing) => existing.id === source.id)
      )
        return;
      sources.push({ ...source, isLive: true });
    });
    if (camera.videoId && camera.videoId !== "live_stream") {
      sources.push({
        id: "primary",
        label: camera.videoLabel || "Ao vivo agora",
        videoId: camera.videoId,
        externalUrl:
          camera.videoSearchUrl ||
          `https://www.youtube.com/watch?v=${camera.videoId}`,
      });
    }
    (camera.videoChoices || []).forEach((choice, index) => {
      if (
        !choice?.videoId ||
        sources.some((source) => source.videoId === choice.videoId)
      )
        return;
      sources.push({
        id: `choice-${index + 1}`,
        label: choice.label || `Video ${index + 2}`,
        videoId: choice.videoId,
        externalUrl: `https://www.youtube.com/watch?v=${choice.videoId}`,
      });
    });
    if (camera.extraVideoId) {
      sources.push({
        id: "extra",
        label: camera.extraVideoLabel || "Camera 2",
        videoId: camera.extraVideoId,
        externalUrl: `https://www.youtube.com/watch?v=${camera.extraVideoId}`,
      });
    }
    (camera.archiveSources || []).forEach((source) => {
      if (
        !source?.videoId ||
        sources.some((existing) => existing.videoId === source.videoId)
      )
        return;
      sources.push({ ...source, isArchive: true });
    });
    if (camera.videoChannelId) {
      sources.push({
        id: "channel-live",
        label: "Canal - live atual",
        channelId: camera.videoChannelId,
        externalUrl: `https://www.youtube.com/channel/${camera.videoChannelId}/live`,
      });
    }
    return sources;
  }

  function cameraEmbedUrl(source: CameraSource | null) {
    if (!source) return "";
    const target = source.playlistId
      ? `videoseries?list=${encodeURIComponent(source.playlistId)}`
      : source.channelId
        ? `live_stream?channel=${encodeURIComponent(source.channelId)}`
        : source.videoId || "";
    const separator = target.includes("?") ? "&" : "?";
    const origin =
      location.origin && location.origin !== "null"
        ? `&origin=${encodeURIComponent(location.origin)}`
        : "";
    return `https://www.youtube-nocookie.com/embed/${target}${separator}autoplay=1&mute=1&playsinline=1&controls=1&rel=0&enablejsapi=1${origin}`;
  }

  function updateCameraSourceOptions() {
    const sources = getCameraSources(activeAirportCamera);
    if (!sources.some((source) => source.id === selectedCameraSourceId))
      selectedCameraSourceId = sources[0]?.id || "primary";
    airportCameraSource.replaceChildren();
    sources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      option.selected = source.id === selectedCameraSourceId;
      airportCameraSource.appendChild(option);
    });
    airportCameraSource.classList.toggle("hidden", sources.length < 2);
    return (
      sources.find((source) => source.id === selectedCameraSourceId) ||
      sources[0] ||
      null
    );
  }

  function showAirportCamera() {
    if (mobileViewport.matches && mobileView !== "camera") return;
    if (!activeAirportCamera || !getCameraSources(activeAirportCamera).length) {
      airportCamera.classList.add("hidden");
      cameraToggle.classList.add("hidden");
      airportCameraFrame.removeAttribute("src");
      airportCameraSource.classList.add("hidden");
      return;
    }
    cameraDismissed = false;
    airportCamera.classList.remove("hidden");
    cameraToggle.classList.add("hidden");
    const selectedSource = updateCameraSourceOptions();
    const embedUrl = cameraEmbedUrl(selectedSource);
    if (airportCameraFrame.getAttribute("src") !== embedUrl) {
      airportCameraFrame.src = embedUrl;
    }
    airportCameraFeedTitle.textContent =
      selectedSource?.label || "CAMERA PRINCIPAL";
    airportCameraNote.textContent = selectedSource?.isArchive
      ? "ARQUIVO: este vídeo é uma gravação e não representa uma transmissão ao vivo."
      : "AO VIVO: se o canal não estiver transmitindo publicamente agora, o YouTube mostrará “sem transmissão ao vivo agora”. Nenhuma gravação é usada como fallback.";
  }

  function updateAirportApproachVisibility() {
    if (!map || !map.getLayer("airport-approach-glow")) return;
    const airportCode = activeAirportCamera?.code || selectedAirportCode;
    map.setFilter("airport-approach-glow", [
      "==",
      ["get", "airport"],
      airportCode,
    ]);
    map.setFilter("airport-approach-line", [
      "==",
      ["get", "airport"],
      airportCode,
    ]);
    map.setFilter("airport-approach-labels", [
      "==",
      ["get", "airport"],
      airportCode,
    ]);
  }

  function homeAirport(): Airport | null {
    const home = getRadarOrigin();
    return home ? { code: "CASA", name: "Minha casa", lat: home.latitude, lon: home.longitude,
      elevationFeet: 0, radiusKm: home.radius_km, feedRadiusNm: home.radius_km / 1.852 } : null;
  }

  function updateHomeRadarLayers() {
    const home = getRadarOrigin();
    if (!home) { homeMarker?.remove(); homeMarker = null; }
    if (!map || !map.getSource("home-radar-rings")) return;
    const features: FeatureCollection["features"] = [];
    if (home) {
      for (const radius of [5, 10, 20].filter(value => value <= home.radius_km)) {
        const coordinates = Array.from({ length: 129 }, (_, index) => pointAhead(home.latitude, home.longitude, index * 360 / 128, radius * 1000));
        features.push({ type: "Feature", properties: { label: `${radius} km` }, geometry: { type: "LineString", coordinates } });
        features.push({ type: "Feature", properties: { label: `${radius} km` }, geometry: { type: "Point", coordinates: pointAhead(home.latitude, home.longitude, 0, radius * 1000) } });
      }
      if (!homeMarker) {
        const label = document.createElement("div");
        label.className = "home-radar-marker";
        const caption = document.createElement("span");
        caption.textContent = "Minha casa";
        label.appendChild(caption);
        homeMarker = new maplibregl.Marker({ element: label }).setLngLat([home.longitude, home.latitude]).addTo(map);
      } else homeMarker.setLngLat([home.longitude, home.latitude]);
    } else { homeMarker?.remove(); homeMarker = null; }
    map.getSource<maplibregl.GeoJSONSource>("home-radar-rings")!.setData({ type: "FeatureCollection", features });
  }

  function updateAirportCamera(): Airport | null {
    const home = homeAirport();
    if (home) {
      towerRunway = null;
      activeAirportCamera = home;
      airportOverviewMode = true;
      airportCamera.classList.add("hidden");
      cameraToggle.classList.add("hidden");
      airportCameraFrame.removeAttribute("src");
      scheduleTab.hidden = true;
      liveTab.textContent = "AO REDOR DE CASA";
      setTrafficPanelMode("live");
      arrivalsTitle.textContent = "AO REDOR DA MINHA CASA";
      arrivalsPanel.classList.remove("hidden");
      updateAirportApproachVisibility();
      updateViewModeButton();
      publishOperations();
      void refreshNearbyArrivals();
      return home;
    }
    scheduleTab.hidden = false;
    liveTab.textContent = "AO VIVO";
    const manuallySelected =
      selectedAirportCode === "AUTO"
        ? null
        : airports.find((airport) => airport.code === selectedAirportCode);
    const nearbyCamera = manuallySelected
      ? {
          ...manuallySelected,
          distance: distanceKm(
            current.lat,
            current.lon,
            manuallySelected.lat,
            manuallySelected.lon,
          ),
        }
      : airports
          .map((airport) => ({
            ...airport,
            distance: distanceKm(
              current.lat,
              current.lon,
              airport.lat,
              airport.lon,
            ),
          }))
          .filter(
            (airport) =>
              airport.distance <= airport.radiusKm || airport.code === "GRU",
          )
          .sort(
            (left, right) =>
              Number(right.distance <= right.radiusKm) -
                Number(left.distance <= left.radiusKm) ||
              left.distance - right.distance,
          )[0];

    if (!nearbyCamera) {
      activeAirportCamera = null;
      airportOverviewMode = !aircraft3dEnabled;
      cameraDismissed = false;
      airportCamera.classList.add("hidden");
      cameraToggle.classList.add("hidden");
      airportCameraFrame.removeAttribute("src");
      clearNearbyArrivals();
      updateAirportApproachVisibility();
      updateViewModeButton();
      return null;
    }

    const cameraChanged =
      !activeAirportCamera || activeAirportCamera.code !== nearbyCamera.code;
    if (cameraChanged) {
      towerRunway = null;
      if (activeAirportCamera) clearNearbyArrivals();
      activeAirportCamera = nearbyCamera;
      airportOverviewMode = !aircraft3dEnabled || !trackedAircraftHex;
      cameraDismissed = false;
      lastArrivalsFetch = 0;
      airportCameraFrame.removeAttribute("src");
    } else {
      activeAirportCamera = nearbyCamera;
    }
    airportCameraTitle.textContent = `CAMERA AO VIVO - ${activeAirportCamera.code}`;
    airportCameraDistance.textContent = trackedAircraftHex
      ? `Aeronave a ${(activeAirportCamera.distance ?? 0).toFixed(1).replace(".", ",")} km de ${activeAirportCamera.code}`
      : "Visao panoramica do aeroporto";
    const selectedSource = getCameraSources(activeAirportCamera).find(
      (source) => source.id === selectedCameraSourceId,
    );
    airportCameraLink.href =
      selectedSource?.externalUrl ||
      activeAirportCamera.videoSearchUrl ||
      `https://www.youtube.com/watch?v=${activeAirportCamera.videoId}`;
    airportCameraFrame.title = `Camera ao vivo do Aeroporto ${activeAirportCamera.name}`;
    cameraToggle.textContent = `Camera ${activeAirportCamera.code}`;
    updateAirportApproachVisibility();
    updateViewModeButton();
    arrivalsPanel.classList.remove("hidden");
    arrivalsTitle.textContent = `MOVIMENTOS - ${activeAirportCamera.code}`;
    if (!getCameraSources(activeAirportCamera).length) {
      airportCamera.classList.add("hidden");
      cameraToggle.classList.add("hidden");
      airportCameraFrame.removeAttribute("src");
    } else if (cameraDismissed) cameraToggle.classList.remove("hidden");
    else showAirportCamera();
    publishOperations();
    void refreshNearbyArrivals();
    void refreshAirportSchedule(cameraChanged);
    return activeAirportCamera;
  }

  function addDiagnostic(code: string, detail: string) {
    diagnosticLines.unshift(
      `[${new Date().toLocaleTimeString("pt-BR")}] ${code}\n` +
        `Detalhe: ${detail || "indisponivel"}\n` +
        `Origem: ${location.origin}\n` +
        `Navegador online: ${navigator.onLine ? "sim" : "nao"}\n` +
        `Servico: MapLibre + OpenFreeMap/OpenStreetMap`,
    );
    if (diagnosticLines.length > 8) diagnosticLines.length = 8;
    element("diagnostics-text").textContent = diagnosticLines.join("\n\n");
  }

  function pointAhead(
    lat: number,
    lon: number,
    bearing: number,
    distanceMeters: number,
  ): [number, number] {
    const radius = 6371000;
    const angularDistance = distanceMeters / radius;
    const heading = (bearing * Math.PI) / 180;
    const latitude = (lat * Math.PI) / 180;
    const longitude = (lon * Math.PI) / 180;
    const nextLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(heading),
    );
    const nextLongitude =
      longitude +
      Math.atan2(
        Math.sin(heading) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
      );
    return [(nextLongitude * 180) / Math.PI, (nextLatitude * 180) / Math.PI];
  }

  function externalCamera() {
    const heading = ((Number(current.track || 0) % 360) + 360) % 360;
    return {
      center: pointAhead(current.lat, current.lon, heading, 180),
      zoom: cameraZoom,
      pitch: aircraft3dEnabled ? 65 : 0,
      bearing: manualMapBearing ?? heading,
    };
  }

  function airportCameraView(airport: Airport): maplibregl.CameraOptions {
    const runway = towerRunway && RUNWAYS.find(row => row.airport === airport.code && row.ends.join("/") === towerRunway);
    if (runway) {
      const [start, end] = runway.coordinates;
      return { center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], zoom: 14.5,
        pitch: 68, bearing: (runwayBearing(start, end) + 90) % 360 };
    }
    return {
      center: [airport.lon, airport.lat],
      zoom: airport.code === "CASA" ? 12 - Math.log2(airport.radiusKm / 5) : airportCenterZoom,
      bearing: manualMapBearing ?? 0,
      pitch: airport.code === "CASA" ? 55 : 45,
    };
  }

  function updateCardinalValue() {
    const bearing =
      manualMapBearing !== null
        ? manualMapBearing
        : map
          ? ((Number(map.getBearing() || 0) % 360) + 360) % 360
          : 0;
    const cardinal =
      bearing < 45 || bearing >= 315
        ? "N"
        : bearing < 135
          ? "L"
          : bearing < 225
            ? "S"
            : "O";
    cardinalValue.textContent = `${cardinal} ${Math.round(bearing).toString().padStart(3, "0")}°`;
    document
      .querySelectorAll<HTMLButtonElement>("[data-cardinal-bearing]")
      .forEach((button) => {
        const target = Number(button.dataset.cardinalBearing);
        const difference = Math.abs(((bearing - target + 540) % 360) - 180);
        button.classList.toggle("is-active", difference < 1);
      });
  }

  function setCardinalBearing(bearing: string | number | undefined) {
    manualMapBearing = ((Number(bearing) % 360) + 360) % 360;
    if (map) {
      map.stop();
      map.jumpTo({ bearing: manualMapBearing });
    }
    updateCardinalValue();
  }

  function updateViewModeButton() {
    airportViewSwitch.textContent = getRadarOrigin() ? "Minha casa" : "Aeroporto";
    recenterButton.textContent = towerRunway ? "Recentrar torre" : getRadarOrigin() ? "Centralizar minha casa" :
      aircraft3dEnabled && trackedAircraftHex
        ? "Recentrar aeronave"
        : "Centralizar aeroporto";
    aircraftViewSwitch.disabled = !aircraft3dEnabled || !trackedAircraftHex;
    aircraftViewSwitch.title = aircraft3dEnabled
      ? "Mostrar a visão da aeronave"
      : "Visão 3D da aeronave temporariamente indisponível";
    airportViewSwitch.disabled = !activeAirportCamera;
    aircraftViewSwitch.classList.toggle(
      "is-active",
      !airportOverviewMode && Boolean(trackedAircraftHex),
    );
    airportViewSwitch.classList.toggle(
      "is-active",
      airportOverviewMode && Boolean(activeAirportCamera),
    );
    if (!aircraft3dEnabled || !activeAirportCamera || !trackedAircraftHex) {
      viewModeButton.classList.add("hidden");
      return;
    }
    viewModeButton.classList.remove("hidden");
    viewModeButton.textContent = airportOverviewMode
      ? "Acompanhar aeronave"
      : "Visao trafego";
  }

  function setViewMode(airportMode: boolean, animate: boolean) {
    if (airportMode && !activeAirportCamera) return;
    if (!airportMode && (!aircraft3dEnabled || !trackedAircraftHex)) return;
    towerRunway = null;
    publishOperations();
    redrawAirportTraffic();
    airportOverviewMode = airportMode;
    zoomControl.value = String(airportOverviewMode ? panoramaZoom : cameraZoom);
    showZoomValue();
    updateViewModeButton();
    recenter(animate);
  }

  function fitAirportTraffic(animate: boolean) {
    const selectedAirport = homeAirport() || (
      selectedAirportCode !== "AUTO"
        ? airports.find((airport) => airport.code === selectedAirportCode)
        : activeAirportCamera);
    if (!map || !selectedAirport) return false;
    if (
      !activeAirportCamera ||
      activeAirportCamera.code !== selectedAirport.code
    ) {
      activeAirportCamera = selectedAirport;
    }
    panoramaZoom = Number(airportCameraView(selectedAirport).zoom);
    zoomControl.value = String(panoramaZoom);
    showZoomValue();
    storeNumber("aircraft-3d-panorama-zoom", panoramaZoom);
    map.stop();
    map.easeTo({
      ...airportCameraView(selectedAirport),
      duration: animate ? 700 : 0,
    });
    return true;
  }

  function recenter(animate: boolean) {
    if (!map) return;
    if (airportOverviewMode && fitAirportTraffic(animate)) return;
    const camera = externalCamera();
    map.jumpTo(camera);
    if (marker) {
      marker.setLngLat([current.lon, current.lat]);
      marker.setRotation(Number(current.track || 0));
      updateTrackedVerticalIndicator();
    }
  }

  function updateTrail() {
    marker?.setLngLat([current.lon, current.lat]);
    marker?.setRotation(Number(current.track || 0));
    updateTrackedVerticalIndicator();
    if (!map || !map.getSource("aircraft-trail")) return;
    map.getSource<maplibregl.GeoJSONSource>("aircraft-trail")!.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: history },
    });
  }

  function aircraftIconScale(type: string) {
    const normalized = String(type || "").toUpperCase();
    if (/^(A388|B748|A124|A225)/.test(normalized)) return 2;
    if (/^(A30|A31|A33|A34|A35|B74|B76|B77|B78|MD11|DC10)/.test(normalized))
      return 1.65;
    if (/^(AT|E1|E2|CRJ|SF3|DH8)/.test(normalized)) return 0.95;
    return 1.18;
  }

  function verticalRateIndicator(verticalRate: number) {
    if (!Number.isFinite(verticalRate) || Math.abs(verticalRate) < 250) {
      return { symbol: "", trend: "level" };
    }
    return verticalRate > 0
      ? { symbol: String.fromCodePoint(0x2191), trend: "up" }
      : { symbol: String.fromCodePoint(0x2193), trend: "down" };
  }

  function updateTrackedVerticalIndicator() {
    if (!trackedMarkerElement) return;
    const arrow =
      trackedMarkerElement.querySelector<HTMLElement>(".vertical-arrow");
    if (!arrow) return;
    const vertical = verticalRateIndicator(Number(current.verticalRate));
    arrow.textContent = vertical.symbol;
    arrow.classList.toggle("down", vertical.trend === "down");
    const bearing = map ? Number(map.getBearing() || 0) : 0;
    const markerRotation = Number(current.track || 0) - bearing;
    arrow.style.transform = `rotate(${-markerRotation}deg)`;
  }

  function interpolateHeading(start: number, end: number, progress: number) {
    const difference = ((end - start + 540) % 360) - 180;
    return (start + difference * progress + 360) % 360;
  }

  function sampleTrafficState(state: TrafficState, timestamp: number) {
    const progress =
      state.duration > 0
        ? Math.min(
            1,
            Math.max(0, (timestamp - state.startedAt) / state.duration),
          )
        : 1;
    return {
      lat: state.startLat + (state.targetLat - state.startLat) * progress,
      lon: state.startLon + (state.targetLon - state.startLon) * progress,
      track: interpolateHeading(state.startTrack, state.targetTrack, progress),
      progress,
    };
  }

  function renderAirportTrafficFrame(timestamp: number) {
    airportTrafficAnimationFrame = null;
    if (!map || !map.getSource("airport-arrivals")) return;
    let animating = false;
    const features: FeatureCollection["features"] = [];
    for (const state of airportTrafficStates.values()) {
      const position = sampleTrafficState(state, timestamp);
      const route = trafficRoute(state);
      const movement = trafficMovement(state);
      const vertical = verticalRateIndicator(state.verticalRate);
      if (position.progress < 1) animating = true;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [position.lon, position.lat] },
        properties: {
          hex: state.hex,
          registration: state.registration,
          label: `${movement === "overflight" ? "SOBREVOO\n" : ""}${state.flight}\n${state.type || "TIPO NAO INFORMADO"} | ${Math.round(state.altitude).toLocaleString("pt-BR")} pes\nROTA: ${route}`,
          detailLabel: `${state.flight} | ${state.type || "TIPO NAO INFORMADO"} | ${Math.round(state.altitude).toLocaleString("pt-BR")} pes | ${route}`,
          isTracked:
            state.hex === String(trackedAircraftHex || "").toLowerCase(),
          track: position.track,
          towerFocus: !towerRunway || (state.distance < 12 && state.altitude < (activeAirportCamera?.elevationFeet || 0) + 8000),
          scale: aircraftIconScale(state.type),
          icon: `${movement === "overflight" ? "nearby" : movement}-${aircraftIconKind(state.type)}`,
          verticalIndicator: vertical.symbol,
          verticalTrend: vertical.trend,
        },
      });
    }
    map
      .getSource<maplibregl.GeoJSONSource>("airport-arrivals")!
      .setData({ type: "FeatureCollection", features });
    document.documentElement.dataset.airportTrafficAnimating = animating
      ? "true"
      : "false";
    if (animating)
      airportTrafficAnimationFrame = requestFrame(renderAirportTrafficFrame);
  }

  function redrawAirportTraffic() {
    if (
      !map ||
      !map.getSource("airport-arrivals") ||
      !airportTrafficStates.size
    )
      return;
    if (airportTrafficAnimationFrame)
      cancelAnimationFrame(airportTrafficAnimationFrame);
    renderAirportTrafficFrame(performance.now());
  }

  function animateAirportTraffic(traffic: TrafficAircraft[]) {
    const timestamp = performance.now();
    const nextStates = new Map<string, TrafficState>();
    for (const aircraft of traffic) {
      const previous = airportTrafficStates.get(aircraft.hex);
      const position = previous
        ? sampleTrafficState(previous, timestamp)
        : { lat: aircraft.lat, lon: aircraft.lon, track: aircraft.track };
      nextStates.set(aircraft.hex, {
        ...aircraft,
        startLat: position.lat,
        startLon: position.lon,
        startTrack: position.track,
        targetLat: aircraft.lat,
        targetLon: aircraft.lon,
        targetTrack: aircraft.track,
        startedAt: timestamp,
        duration: previous ? 16000 : 0,
        lastSeenAt: timestamp,
      });
    }
    for (const [hex, previous] of airportTrafficStates) {
      if (
        !nextStates.has(hex) &&
        timestamp - Number(previous.lastSeenAt || 0) <= 45000
      ) {
        nextStates.set(hex, previous);
      }
    }
    airportTrafficStates = nextStates;
    if (airportTrafficAnimationFrame)
      cancelAnimationFrame(airportTrafficAnimationFrame);
    renderAirportTrafficFrame(timestamp);
  }

  function updateTrackedIcon() {
    const icon = trackedMarkerElement?.querySelector<HTMLElement>(".aircraft-symbol");
    if (!icon || !trackedMarkerElement) return;
    const kind = aircraftIconKind(currentAircraftType);
    const key = `${kind}-${nightMode}`;
    if (icon.dataset.iconKey === key) return;
    icon.style.backgroundImage = `url("${createAircraftMarkerDataUrl(nightMode ? "#fbbf24" : "#ff5a00", nightMode ? "#ffffff" : "#07111f", kind)}")`;
    icon.dataset.iconKey = key;
    trackedMarkerElement.dataset.aircraftKind = kind;
  }

  function initMap() {
    map = new maplibregl.Map({
      container: "map",
      style: mapStyleUrl(),
      ...(airportOverviewMode && activeAirportCamera
        ? airportCameraView(activeAirportCamera)
        : externalCamera()),
      maxPitch: 85,
      canvasContextAttributes: { antialias: true },
      attributionControl: {},
    });
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.on("zoomend", () => {
      const updatedZoom = Math.max(9, Math.min(18, map.getZoom()));
      if (airportOverviewMode) {
        panoramaZoom = updatedZoom;
        zoomControl.value = String(panoramaZoom);
        showZoomValue();
        storeNumber("aircraft-3d-panorama-zoom", panoramaZoom);
        return;
      }
      cameraZoom = updatedZoom;
      zoomControl.value = String(cameraZoom);
      showZoomValue();
      storeNumber("aircraft-3d-zoom", cameraZoom);
    });
    map.on("rotate", () => {
      updateTrackedVerticalIndicator();
      updateCardinalValue();
    });

    map.on("style.load", () => {
      try {
        const layers = map.getStyle().layers || [];
        const labelLayer = layers.find(
          (layer) =>
            layer.type === "symbol" &&
            layer.layout &&
            layer.layout["text-field"],
        );
        map.addSource("aircraft-open-buildings", {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
        });
        map.addLayer(
          {
            id: "aircraft-3d-buildings",
            source: "aircraft-open-buildings",
            "source-layer": "building",
            type: "fill-extrusion",
            minzoom: 12,
            filter: ["!=", ["get", "hide_3d"], true],
            paint: {
              "fill-extrusion-color": nightMode
                ? [
                    "interpolate",
                    ["linear"],
                    ["coalesce", ["get", "render_height"], 0],
                    0,
                    "#172033",
                    80,
                    "#26364d",
                    250,
                    "#3b4f6b",
                  ]
                : [
                    "interpolate",
                    ["linear"],
                    ["coalesce", ["get", "render_height"], 0],
                    0,
                    "#cbd5c0",
                    80,
                    "#a9b6c1",
                    250,
                    "#d6dde3",
                  ],
              "fill-extrusion-height": [
                "coalesce",
                ["get", "render_height"],
                8,
              ],
              "fill-extrusion-base": [
                "coalesce",
                ["get", "render_min_height"],
                0,
              ],
              "fill-extrusion-opacity": 0.92,
            },
          },
          labelLayer && labelLayer.id,
        );

        map.addSource("airport-runways", {
          type: "geojson",
          data: airportRunways,
        });
        map.addLayer({
          id: "airport-runways-neon-glow",
          type: "line",
          source: "airport-runways",
          minzoom: 9,
          layout: {
            "line-cap": "butt",
            "line-join": "round",
          },
          paint: {
            "line-color": "#f5ff00",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              3,
              12,
              10,
              14,
              20,
              17,
              42,
            ],
            "line-opacity": nightMode ? 0.82 : 0.62,
            "line-blur": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              2,
              14,
              5,
              17,
              9,
            ],
          },
        });
        map.addLayer({
          id: "airport-runways-neon-core",
          type: "line",
          source: "airport-runways",
          minzoom: 9,
          layout: {
            "line-cap": "butt",
            "line-join": "round",
          },
          paint: {
            "line-color": "#faff00",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              1.5,
              12,
              3,
              14,
              7,
              17,
              16,
            ],
            "line-opacity": 0.98,
          },
        });
        map.addLayer({
          id: "airport-runways-labels",
          type: "symbol",
          source: "airport-runways",
          minzoom: 11,
          layout: {
            "symbol-placement": "line-center",
            "text-field": ["get", "runway"],
            "text-size": 12,
            "text-rotation-alignment": "map",
            "text-keep-upright": true,
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#faff00",
            "text-halo-color": "#020617",
            "text-halo-width": 2,
          },
        });

        map.addSource("airport-approaches", {
          type: "geojson",
          data: airportApproaches,
        });
        map.addLayer({
          id: "airport-approach-glow",
          type: "line",
          source: "airport-approaches",
          minzoom: 9,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#22d3ee",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              8,
              13,
              18,
              17,
              34,
            ],
            "line-opacity": nightMode ? 0.22 : 0.16,
            "line-blur": 4,
          },
        });
        map.addLayer({
          id: "airport-approach-line",
          type: "line",
          source: "airport-approaches",
          minzoom: 9,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#0891b2",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              2,
              13,
              3,
              17,
              5,
            ],
            "line-opacity": 0.9,
            "line-dasharray": [1.2, 1.2],
          },
        });
        map.addLayer({
          id: "airport-approach-labels",
          type: "symbol",
          source: "airport-approaches",
          minzoom: 10,
          layout: {
            "symbol-placement": "line-center",
            "text-field": ["get", "approach"],
            "text-size": 11,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#67e8f9",
            "text-halo-color": "#082f49",
            "text-halo-width": 2,
          },
        });
        updateAirportApproachVisibility();

        map.addSource("aircraft-trail", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: history },
          },
        });
        map.addLayer({
          id: "aircraft-trail-line",
          type: "line",
          source: "aircraft-trail",
          paint: {
            "line-color": "#0284c7",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });

        map.addSource("home-radar-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "home-radar-rings-line", type: "line", source: "home-radar-rings", filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "#38bdf8", "line-width": 2, "line-opacity": 0.8, "line-dasharray": [3, 3] } });
        map.addLayer({ id: "home-radar-rings-label", type: "symbol", source: "home-radar-rings", filter: ["==", ["geometry-type"], "Point"],
          layout: { "text-field": ["get", "label"], "text-size": 13, "text-allow-overlap": true },
          paint: { "text-color": "#e0f2fe", "text-halo-color": "#07111f", "text-halo-width": 2 } });
        updateHomeRadarLayers();
        map.addSource("airport-arrivals", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          attribution:
            '<a href="https://www.adsb.lol/" target="_blank" rel="noopener">Posições adsb.lol</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>)',
        });
        const aircraftStroke = nightMode ? "#ffffff" : "#07111f";
        for (const kind of aircraftIconKinds) {
          for (const [movement, color] of [
            ["arrival", nightMode ? "#fbbf24" : "#ff5a00"],
            ["departure", nightMode ? "#38bdf8" : "#008cff"],
            ["nearby", nightMode ? "#f8fafc" : "#e11d48"],
          ]) {
            map.addImage(`${movement}-${kind}`, createAircraftMapIcon(color, aircraftStroke, kind), { pixelRatio: 2 });
          }
        }
        map.addLayer({
          id: "airport-arrivals-points",
          type: "symbol",
          source: "airport-arrivals",
          filter: ["!=", ["get", "isTracked"], true],
          paint: { "icon-opacity": ["case", ["boolean", ["get", "towerFocus"], true], 1, 0.3] },
          layout: {
            "icon-image": ["get", "icon"],
            "icon-size": nightMode
              ? ["*", ["get", "scale"], 1.18]
              : ["get", "scale"],
            "icon-rotate": ["get", "track"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        map.addLayer({
          id: "airport-arrivals-vertical-rate",
          type: "symbol",
          source: "airport-arrivals",
          filter: [
            "all",
            ["!=", ["get", "isTracked"], true],
            ["!=", ["get", "verticalIndicator"], ""],
          ],
          layout: {
            "text-field": ["get", "verticalIndicator"],
            "text-size": 20,
            "text-offset": [1.05, 0],
            "text-anchor": "left",
            "text-rotation-alignment": "viewport",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": [
              "match",
              ["get", "verticalTrend"],
              "up",
              "#22c55e",
              "down",
              "#ef4444",
              "#f8fafc",
            ],
            "text-halo-color": nightMode ? "#020617" : "#ffffff",
            "text-halo-width": 2,
          },
        });
        map.addLayer({
          id: "airport-arrivals-labels",
          type: "symbol",
          source: "airport-arrivals",
          filter: ["!=", ["get", "isTracked"], true],
          layout: {
            "text-field": ["get", "label"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              8,
              13,
              9,
              17,
              11,
            ],
            "text-offset": [0, 1.55],
            "text-anchor": "top",
            "text-max-width": 18,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "symbol-sort-key": [
              "case",
              ["boolean", ["get", "isTracked"], false],
              0,
              1,
            ],
          },
          paint: {
            "text-color": "#f8fafc",
            "text-halo-color": "#07111f",
            "text-halo-width": 4,
          },
        });
        map.addLayer({
          id: "airport-arrivals-tracked-label",
          type: "symbol",
          source: "airport-arrivals",
          filter: ["==", ["get", "isTracked"], true],
          layout: {
            "text-field": ["get", "detailLabel"],
            "text-size": 12,
            "text-offset": [0, 2.35],
            "text-anchor": "top",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#0f172a",
            "text-halo-color": "#f8fafc",
            "text-halo-width": 3,
          },
        });
        map.on("click", "airport-arrivals-points", (event) => {
          const feature = event.features && event.features[0];
          const hex =
            feature && String(feature.properties?.hex || "").toLowerCase();
          const aircraft = hex ? airportTrafficStates.get(hex) : null;
          if (!aircraft || !activeAirportCamera) return;
          selectLiveMovement(aircraft, activeAirportCamera);
        });
        map.on("mouseenter", "airport-arrivals-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "airport-arrivals-points", () => {
          map.getCanvas().style.cursor = "";
        });
      } catch (error) {
        if (lifecycle.signal.aborted) return;
        addDiagnostic(
          "Camadas 3D",
          error instanceof Error ? error.message : String(error),
        );
      }

      if (!marker) {
        trackedMarkerElement = document.createElement("div");
        trackedMarkerElement.className = "aircraft-marker";
        trackedMarkerElement.addEventListener(
          "click",
          () => {
            const aircraft = lastAirportTraffic.find(
              (item) => item.hex === trackedAircraftHex,
            );
            if (aircraft && activeAirportCamera)
              selectLiveMovement(aircraft, activeAirportCamera);
          },
          { signal: lifecycle.signal },
        );
        const markerIcon = document.createElement("span");
        markerIcon.className = "aircraft-symbol";
        const markerVerticalArrow = document.createElement("span");
        markerVerticalArrow.className = "vertical-arrow";
        trackedMarkerElement.append(markerIcon, markerVerticalArrow);
        marker = new maplibregl.Marker({
          element: trackedMarkerElement,
          anchor: "center",
          rotationAlignment: "map",
          rotation: Number(current.track || 0),
        })
          .setLngLat([current.lon, current.lat])
          .addTo(map);
      }
      updateTrackedIcon();
      trackedMarkerElement!.style.display = trackedAircraftHex
        ? "grid"
        : "none";
      updateTrackedVerticalIndicator();
      updateTrail();
      renderAirportTrafficFrame(performance.now());
      recenter(false);
      status.textContent = trackedAircraftHex
        ? "3D livre ativo | acompanhando ADS-B"
        : getRadarOrigin() ? "Radar da minha casa ativo"
        : `Visao panoramica - ${activeAirportCamera ? activeAirportCamera.code : selectedAirportCode}`;
      void refreshNearbyArrivals();
      void refreshAirportSchedule(true);
    });

    map.on("error", (event) => {
      const detail =
        event && event.error
          ? event.error.message
          : "Falha ao carregar dados do mapa";
      addDiagnostic("MapLibre/OpenFreeMap", detail);
    });
  }

  async function refresh() {
    const hex = trackedAircraftHex.toLowerCase();
    if (
      !hex ||
      trackedFetchInProgress ||
      document.hidden ||
      Date.now() < adsbRetryAt
    )
      return;
    trackedFetchInProgress = true;
    try {
      const data = await fetchAdsb(`hex/${encodeURIComponent(hex)}`);
      if (trackedAircraftHex.toLowerCase() !== hex) return;
      const aircraft = data.ac.find(
        (item) => String(item.hex).toLowerCase() === hex,
      );
      if (
        !aircraft ||
        aircraft.lat == null ||
        aircraft.lon == null ||
        (aircraft.seen_pos ?? 0) > 60
      ) {
        status.textContent = `Ultima posicao mantida | sinal ADS-B nao encontrado ${new Date().toLocaleTimeString("pt-BR")}`;
        return;
      }
      current.lat = Number(aircraft.lat);
      current.lon = Number(aircraft.lon);
      const altitude = Number(aircraft.alt_baro);
      if (Number.isFinite(altitude)) current.altFeet = altitude;
      const heading = Number(
        aircraft.track ?? aircraft.calc_track ?? aircraft.true_heading,
      );
      if (Number.isFinite(heading)) current.track = heading;
      const verticalRate = Number(aircraft.baro_rate ?? aircraft.geom_rate);
      current.verticalRate = Number.isFinite(verticalRate) ? verticalRate : 0;
      updateAircraftIdentity(aircraft);
      const selection = getAircraftSelection();
      if (selection?.hex === hex && !selection.registration && aircraft.r) {
        selectAircraft({
          ...selection,
          registration: aircraft.r.trim().toUpperCase(),
        });
      }
      const last = history[history.length - 1];
      if (
        !last ||
        Math.abs(last[0] - current.lon) > 0.0001 ||
        Math.abs(last[1] - current.lat) > 0.0001
      ) {
        history.push([current.lon, current.lat]);
        if (history.length > 80) history.shift();
      }
      updateTelemetry();
      updateAirportCamera();
      updateTrail();
      if (!airportOverviewMode) recenter(true);
      const center = map ? map.getCenter() : null;
      const mapPosition = center
        ? ` | visao a frente ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`
        : "";
      status.textContent = `${towerRunway ? `Torre virtual ${activeAirportCamera?.code} · ${towerRunway}` : "3D livre ativo"} | atualizado ${new Date().toLocaleTimeString("pt-BR")}${towerRunway ? "" : mapPosition}`;
    } catch (error) {
      if (lifecycle.signal.aborted) return;
      if (trackedAircraftHex.toLowerCase() === hex) {
        status.textContent =
          "3D livre ativo | ADS-B temporariamente indisponivel";
        addDiagnostic(
          "Atualizacao ADS-B",
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      trackedFetchInProgress = false;
    }
  }

  function restartRefreshTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, refreshIntervalMs);
  }

  function restartAirportTrafficTimer() {
    if (airportTrafficTimer) clearInterval(airportTrafficTimer);
    airportTrafficTimer = setInterval(() => {
      if (document.hidden) return;
      void refreshNearbyArrivals();
      void refreshAirportSchedule();
    }, 3000);
  }

  recenterButton.addEventListener("click", () => recenter(true), {
    signal: lifecycle.signal,
  });
  element("rotate-map").addEventListener(
    "click",
    () => {
      if (!map) return;
      setCardinalBearing((map.getBearing() + 45) % 360);
    },
    { signal: lifecycle.signal },
  );
  element("reload-page").addEventListener(
    "click",
    () => window.location.reload(),
    { signal: lifecycle.signal },
  );
  aircraftViewSwitch.addEventListener("click", () => setViewMode(false, true), {
    signal: lifecycle.signal,
  });
  airportViewSwitch.addEventListener("click", () => setViewMode(true, true), {
    signal: lifecycle.signal,
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-cardinal-bearing]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => setCardinalBearing(button.dataset.cardinalBearing),
        { signal: lifecycle.signal },
      );
    });
  viewModeButton.addEventListener(
    "click",
    () => {
      setViewMode(!airportOverviewMode, true);
    },
    { signal: lifecycle.signal },
  );
  element("airport-camera-close").addEventListener(
    "click",
    () => {
      cameraDismissed = true;
      airportCamera.classList.add("hidden");
      cameraToggle.classList.remove("hidden");
    },
    { signal: lifecycle.signal },
  );
  cameraToggle.addEventListener("click", showAirportCamera, {
    signal: lifecycle.signal,
  });
  airportCameraSource.addEventListener(
    "change",
    () => {
      selectedCameraSourceId = airportCameraSource.value || "primary";
      showAirportCamera();
      const selectedSource = getCameraSources(activeAirportCamera).find(
        (source) => source.id === selectedCameraSourceId,
      );
      if (selectedSource?.externalUrl)
        airportCameraLink.href = selectedSource.externalUrl;
    },
    { signal: lifecycle.signal },
  );
  scheduleTab.addEventListener("click", () => setTrafficPanelMode("schedule"), {
    signal: lifecycle.signal,
  });
  liveTab.addEventListener("click", () => setTrafficPanelMode("live"), {
    signal: lifecycle.signal,
  });
  zoomControl.addEventListener(
    "input",
    () => {
      if (airportOverviewMode) {
        panoramaZoom = Number(zoomControl.value);
        storeNumber("aircraft-3d-panorama-zoom", panoramaZoom);
        if (map) map.easeTo({ zoom: panoramaZoom, duration: 0 });
      } else {
        cameraZoom = Number(zoomControl.value);
        storeNumber("aircraft-3d-zoom", cameraZoom);
        recenter(false);
      }
      showZoomValue();
    },
    { signal: lifecycle.signal },
  );
  refreshInterval.addEventListener(
    "change",
    () => {
      refreshIntervalMs = Number(refreshInterval.value);
      storeNumber("aircraft-3d-refresh-ms", refreshIntervalMs);
      restartRefreshTimer();
    },
    { signal: lifecycle.signal },
  );
  cameraSizeControl.addEventListener(
    "input",
    () => {
      cameraWidth = Number(cameraSizeControl.value);
      storeNumber("aircraft-3d-camera-width", cameraWidth);
      showCameraSizeValue();
    },
    { signal: lifecycle.signal },
  );
  airportSelect.addEventListener(
    "change",
    () => {
      selectedAirportCode = airportSelect.value;
      towerRunway = null;
      regionGeneration++;
      if (getRadarOrigin()) setRadarOrigin(null);
      clearNearbyArrivals();
      activeAirportCamera = null;
      cameraDismissed = false;
      airportCameraFrame.removeAttribute("src");
      if (selectedAirportCode === "AUTO") {
        const camera = updateAirportCamera();
        if (camera) enterAirportPanorama(camera.code);
      } else enterAirportPanorama(selectedAirportCode);
      updateAirportCamera();
      updateViewModeButton();
      recenter(true);
      requestFrame(() => fitAirportTraffic(true));
    },
    { signal: lifecycle.signal },
  );
  element("show-diagnostics").addEventListener(
    "click",
    () => element("diagnostics").classList.remove("hidden"),
    { signal: lifecycle.signal },
  );
  element("close-diagnostics").addEventListener(
    "click",
    () => element("diagnostics").classList.add("hidden"),
    { signal: lifecycle.signal },
  );
  element("fullscreen").addEventListener(
    "click",
    () => {
      if (!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    },
    { signal: lifecycle.signal },
  );

  syncMobileLayout();
  zoomControl.value = String(
    selectedAirportCode === "AUTO" ? cameraZoom : panoramaZoom,
  );
  showZoomValue();
  cameraSizeControl.value = String(cameraWidth);
  showCameraSizeValue();
  initPanelResize(airportCamera, 'aircraft-3d-camera', cameraWidth, 270, 180);
  initPanelResize(arrivalsPanel, 'airviewer-movements', 360 * legacyPanelScale, 290 * legacyPanelScale, 220);
  element('movements-fit').addEventListener('click', () => {
    arrivalsPanel.style.removeProperty('--panel-height');
    try { localStorage.removeItem('airviewer-movements-height'); } catch { /* Storage may be disabled. */ }
  }, { signal: lifecycle.signal });
  airportSelect.value = selectedAirportCode;
  refreshInterval.value = String(refreshIntervalMs);
  updateTelemetry();
  updateAircraftIdentity(null);
  updateViewModeButton();
  updateCardinalValue();
  setTrafficPanelMode("schedule");
  updateNightMode();
  if (selectedAirportCode !== "AUTO") enterAirportPanorama(selectedAirportCode);
  updateAirportCamera();
  initMap();
  refresh();
  restartRefreshTimer();
  restartAirportTrafficTimer();
  nightModeTimer = setInterval(updateNightMode, 60000);

  const unsubscribeHomeRadar = subscribeRadarOrigin(() => {
    towerRunway = null;
    regionGeneration++;
    clearNearbyArrivals();
    lastArrivalsFetch = 0;
    lastScheduleRender = 0;
    lastScheduleFlights = [];
    activeAirportCamera = null;
    enterAirportPanorama(getRadarOrigin() ? "CASA" : selectedAirportCode);
    updateAirportCamera();
    updateHomeRadarLayers();
    const home = getRadarOrigin();
    document.body.dataset.homeRadar = String(Boolean(home));
    if (home) {
      if (!airportSelect.querySelector('option[value="CASA"]')) {
        const option = new Option("Minha casa", "CASA");
        option.disabled = true;
        airportSelect.add(option);
      }
      airportSelect.value = "CASA";
      routeElement.textContent = `RADAR DA MINHA CASA | ${home.radius_km} km`;
      element("aircraft-identity").textContent = "TRÁFEGO AO REDOR DE CASA";
      modeEyebrow.textContent = "MAPA 3D | ANÉIS DE DISTÂNCIA";
      status.textContent = "Radar de casa ativo | buscando aeronaves";
    } else {
      airportSelect.querySelector('option[value="CASA"]')?.remove();
      airportSelect.value = selectedAirportCode;
      setTrafficPanelMode("schedule");
    }
    document.querySelectorAll<HTMLElement>(".traffic-legend span").forEach(node => {
      const labels: Record<string, string> = home ? { Chegada: "Aproximando", Saida: "Afastando", Local: "Na região" } : { Aproximando: "Chegada", Afastando: "Saida", "Na região": "Local" };
      const text = Array.from(node.childNodes).find(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
      if (text?.textContent && labels[text.textContent.trim()]) text.textContent = labels[text.textContent.trim()];
    });
    recenter(true);
    if (mobileViewport.matches) setMobileView("map", false);
  });

  const unsubscribeAirportCommands = subscribeAirportCommands(command => {
    if (command.type === "airport") {
      airportSelect.value = command.code;
      airportSelect.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (command.type === "tower") {
      if (!activeAirportCamera || !["GRU", "GIG"].includes(activeAirportCamera.code)) return;
      if (command.runway && !RUNWAYS.some(row => row.airport === activeAirportCamera!.code && row.ends.join("/") === command.runway)) return;
      towerRunway = command.runway;
      airportOverviewMode = true;
      manualMapBearing = null;
      updateViewModeButton();
      publishOperations();
      redrawAirportTraffic();
      recenter(true);
      status.textContent = towerRunway ? `Torre virtual ${activeAirportCamera.code} | pista ${towerRunway}` : `Visão geral ${activeAirportCamera.code}`;
    } else {
      const aircraft = lastAirportTraffic.find(row => row.hex === command.hex);
      if (aircraft && activeAirportCamera) selectLiveMovement(aircraft, activeAirportCamera, !towerRunway);
    }
    if (mobileViewport.matches) setMobileView("map", false);
  });

  let favoriteRequest = 0;
  const unsubscribeSavedAircraft = subscribeSavedAircraft(async (saved) => {
    const requestId = ++favoriteRequest;
    trackedAircraftHex = "";
    selectedMovementFlight = "";
    pendingFlightSelection = null;
    element("telemetry").classList.add("hidden");
    if (trackedMarkerElement) trackedMarkerElement.style.display = "none";
    redrawAirportTraffic();
    selectAircraft({ ...saved, flight: "", routeHint: "" });
    rightRail.scrollTop = 0;
    routeElement.textContent = "ROTA NÃO INFORMADA";
    updateAircraftIdentity({
      r: saved.registration || saved.hex.toUpperCase(),
      t: saved.type,
    });
    status.textContent = "Consultando aeronave favorita…";
    try {
      const payload = await fetchAdsb(`hex/${encodeURIComponent(saved.hex)}`);
      if (
        lifecycle.signal.aborted ||
        requestId !== favoriteRequest ||
        getAircraftSelection()?.hex !== saved.hex
      )
        return;
      const raw = payload.ac.find(
        (item) => item.hex?.toLowerCase() === saved.hex,
      );
      if (
        !raw ||
        raw.lat == null ||
        raw.lon == null ||
        (raw.seen_pos ?? 0) > 60 ||
        !activeAirportCamera
      ) {
        status.textContent =
          "Favorito selecionado | posição ao vivo indisponível";
        return;
      }
      const airport = activeAirportCamera;
      const lat = Number(raw.lat),
        lon = Number(raw.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        status.textContent = "Favorito selecionado | posição ao vivo indisponível";
        return;
      }
      const altitude = Number(
        raw.alt_baro === "ground"
          ? airport.elevationFeet
          : (raw.alt_baro ?? raw.alt_geom ?? 0),
      );
      const aircraft: TrafficAircraft = {
        hex: saved.hex,
        registration: raw.r || saved.registration,
        flight: normalizeTrafficFlight(raw.flight, raw.r, raw.hex),
        type: raw.t || saved.type,
        lat,
        lon,
        altitude: Number.isFinite(altitude) ? altitude : 0,
        track: Number(raw.track ?? raw.calc_track ?? 0),
        verticalRate: Number(raw.baro_rate ?? raw.geom_rate ?? 0),
        groundSpeed: Number(raw.gs ?? 0),
        distance: distanceKm(lat, lon, airport.lat, airport.lon),
        airportBearing: bearingTo(lat, lon, airport.lat, airport.lon),
        headingDifference: 0,
        onGround: raw.alt_baro === "ground",
        movement: "nearby",
      };
      followTrafficAircraft(aircraft, airport, trafficRoute(aircraft));
      centerSelectedAircraft();
    } catch {
      if (
        !lifecycle.signal.aborted &&
        requestId === favoriteRequest &&
        getAircraftSelection()?.hex === saved.hex
      )
        status.textContent =
          "Favorito selecionado | posição ao vivo indisponível";
    }
  });

  return () => {
    lifecycle.abort();
    unsubscribeSavedAircraft();
    unsubscribeHomeRadar();
    unsubscribeAirportCommands();
    delete document.documentElement.dataset.airportView;
    homeMarker?.remove();
    delete document.body.dataset.homeRadar;
    selectAircraft(null);
    clearInterval(refreshTimer);
    clearInterval(airportTrafficTimer);
    clearInterval(nightModeTimer);
    frames.forEach(cancelAnimationFrame);
    mobileObserver.disconnect();
    controlsObserver.disconnect();
    document.documentElement.style.removeProperty("--controls-height");
    airportCameraFrame.removeAttribute("src");
    mobileDestinations.forEach(({ element: node, placeholder }) => {
      placeholder.after(node);
      placeholder.remove();
    });
    marker?.remove();
    map?.remove();
  };
}
