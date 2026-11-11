import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, authRedirectUrl } from "@/lib/supabase";
import type { Favorite } from "@/lib/database.types";
import {
  getAircraftSelection,
  openSavedAircraft,
  type SavedAircraft,
} from "@/lib/aircraft-selection";

type Account = {
  configured: boolean;
  session: Session | null;
  initializing: boolean;
  authBusy: boolean;
  favorites: Favorite[];
  loadingFavorites: boolean;
  favoritesError: string;
  authError: string;
  busyHex: string | null;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshFavorites: () => void;
  toggleFavorite: (aircraft: SavedAircraft) => Promise<void>;
  returnFocus: React.RefObject<HTMLElement | null>;
};
const AccountContext = createContext<Account | null>(null);
const pendingSelectionKey = "airviewer:login-selection";

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(Boolean(supabase));
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favoritesError, setFavoritesError] = useState("");
  const [busyHex, setBusyHex] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const activeUser = useRef<string | null>(null);
  const mutationPending = useRef(false);
  const mounted = useRef(true);

  const openPanel = () => {
    returnFocus.current = document.activeElement as HTMLElement;
    setPanelOpen(true);
  };
  useEffect(() => {
    mounted.current = true;
    if (!supabase)
      return () => {
        mounted.current = false;
      };
    let live = true;
    let eventSeen = false;
    const apply = (next: Session | null) => {
      if (!live) return;
      const nextId = next?.user.id || null;
      if (activeUser.current !== nextId) {
        activeUser.current = nextId;
        setFavorites([]);
        setFavoritesError("");
        setBusyHex(null);
      }
      setSession(next);
      setInitializing(false);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      eventSeen = true;
      apply(next);
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!live) return;
        if (!eventSeen) apply(data.session);
        if (error) {
          setAuthError(
            "Não foi possível recuperar sua sessão. Entre novamente.",
          );
          setPanelOpen(true);
        }
        setInitializing(false);
      })
      .catch(() => {
        if (live) {
          setInitializing(false);
          setAuthError("Não foi possível recuperar sua sessão.");
        }
      });
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (params.has("error") || hash.has("error")) {
      setAuthError("O login com Google não foi concluído. Tente novamente.");
      setPanelOpen(true);
      const url = new URL(window.location.href);
      for (const key of ["error", "error_code", "error_description"])
        url.searchParams.delete(key);
      if (hash.has("error")) url.hash = "";
      window.history.replaceState(null, "", url);
    }
    return () => {
      live = false;
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!supabase || !userId) {
      setLoadingFavorites(false);
      return;
    }
    const controller = new AbortController();
    setLoadingFavorites(true);
    setFavoritesError("");
    void supabase
      .from("aircraft_favorites")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted || activeUser.current !== userId) return;
        setLoadingFavorites(false);
        if (error)
          setFavoritesError(
            "Não foi possível carregar seus favoritos. Tente novamente.",
          );
        else setFavorites(data || []);
      });
    return () => controller.abort();
  }, [session?.user.id, reload]);

  useEffect(() => {
    if (!session) return;
    try {
      const raw = sessionStorage.getItem(pendingSelectionKey);
      if (!raw) return;
      sessionStorage.removeItem(pendingSelectionKey);
      const saved = JSON.parse(raw) as SavedAircraft;
      if (
        /^[a-f0-9]{6}$/i.test(saved.hex) &&
        typeof saved.registration === "string" &&
        typeof saved.type === "string"
      )
        openSavedAircraft(saved);
    } catch {
      /* A blocked sessionStorage must not prevent sign-in. */
    }
  }, [session?.user.id]);

  const signIn = async () => {
    if (!supabase || authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const aircraft = getAircraftSelection();
      if (aircraft)
        try {
          sessionStorage.setItem(
            pendingSelectionKey,
            JSON.stringify({
              hex: aircraft.hex,
              registration: aircraft.registration,
              type: aircraft.type,
            }),
          );
        } catch {
          /* optional restoration */
        }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl() },
      });
      if (error) throw error;
    } catch {
      if (mounted.current)
        setAuthError(
          "Não foi possível iniciar o login com Google. Tente novamente.",
        );
    } finally {
      if (mounted.current) setAuthBusy(false);
    }
  };
  const signOut = async () => {
    if (!supabase || authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      activeUser.current = null;
      setSession(null);
      setFavorites([]);
      setFavoritesError("");
      try {
        sessionStorage.removeItem(pendingSelectionKey);
      } catch {
        /* optional storage */
      }
    } catch {
      if (mounted.current)
        setAuthError("Não foi possível sair da conta. Tente novamente.");
    } finally {
      if (mounted.current) setAuthBusy(false);
    }
  };
  const toggleFavorite = async (aircraft: SavedAircraft) => {
    if (!session || !supabase) {
      openPanel();
      return;
    }
    if (mutationPending.current || loadingFavorites || favoritesError) return;
    const userId = session.user.id;
    const hex = aircraft.hex.toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(hex)) return;
    mutationPending.current = true;
    setBusyHex(hex);
    setFavoritesError("");
    try {
      const exists = favorites.some((item) => item.aircraft_hex === hex);
      if (exists) {
        const { error, data } = await supabase
          .from("aircraft_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("aircraft_hex", hex)
          .select("aircraft_hex");
        if (error || !data?.length)
          throw error || new Error("Favorite was not deleted");
        if (mounted.current && activeUser.current === userId)
          setFavorites((items) =>
            items.filter((item) => item.aircraft_hex !== hex),
          );
      } else {
        const { error, data } = await supabase
          .from("aircraft_favorites")
          .insert({
            user_id: userId,
            aircraft_hex: hex,
            registration: aircraft.registration.slice(0, 16),
            aircraft_type: aircraft.type.slice(0, 16),
          })
          .select()
          .single();
        if (error?.code === "23505") {
          if (activeUser.current === userId) setReload((value) => value + 1);
        } else if (error || !data)
          throw error || new Error("Favorite was not saved");
        else if (mounted.current && activeUser.current === userId)
          setFavorites((items) => [data, ...items]);
      }
    } catch {
      if (mounted.current && activeUser.current === userId)
        setFavoritesError(
          "Não foi possível alterar os favoritos. Atualize a lista e tente novamente.",
        );
    } finally {
      mutationPending.current = false;
      if (mounted.current) setBusyHex(null);
    }
  };

  return (
    <AccountContext.Provider
      value={{
        configured: Boolean(supabase),
        session,
        initializing,
        authBusy,
        favorites,
        loadingFavorites,
        favoritesError,
        authError,
        busyHex,
        panelOpen,
        openPanel,
        closePanel: () => setPanelOpen(false),
        signIn,
        signOut,
        refreshFavorites: () => setReload((value) => value + 1),
        toggleFavorite,
        returnFocus,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("AccountProvider ausente");
  return value;
}
