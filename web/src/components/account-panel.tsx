import { Dialog } from "radix-ui";
import { Button } from "./ui/button";
import { useAccount } from "@/providers/account-provider";
import {
  openSavedAircraft,
  type SavedAircraft,
} from "@/lib/aircraft-selection";

function Star({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3l-5.7 3 1.1-6.3L3 9.6l6.2-.9Z" />
    </svg>
  );
}

export function AccountTrigger({ mobile = false }: { mobile?: boolean }) {
  const account = useAccount();
  return (
    <Button
      variant="secondary"
      type="button"
      className={mobile ? "account-trigger-mobile" : "account-trigger-desktop"}
      onClick={account.openPanel}
      aria-haspopup="dialog"
      aria-expanded={account.panelOpen}
    >
      {mobile ? "Conta" : "Conta e favoritos"}
    </Button>
  );
}

export function FavoriteButton({ aircraft }: { aircraft: SavedAircraft }) {
  const account = useAccount();
  const saved = account.favorites.some(
    (item) => item.aircraft_hex === aircraft.hex.toLowerCase(),
  );
  const pending = account.busyHex === aircraft.hex.toLowerCase();
  return (
    <div className="favorite-action">
      <Button
        variant="secondary"
        size="sm"
        type="button"
        aria-pressed={saved}
        disabled={
          account.initializing ||
          account.loadingFavorites ||
          Boolean(account.busyHex) ||
          Boolean(account.session && account.favoritesError)
        }
        onClick={() => void account.toggleFavorite(aircraft)}
      >
        <Star filled={saved} />
        {pending
          ? "Salvando…"
          : saved
            ? "Remover dos favoritos"
            : "Salvar nos favoritos"}
      </Button>
      {account.session && account.favoritesError && (
        <p role="alert">
          {account.favoritesError}{" "}
          <button
            type="button"
            className="account-text-action"
            onClick={account.refreshFavorites}
          >
            Atualizar favoritos
          </button>
        </p>
      )}
    </div>
  );
}

export function AccountPanel() {
  const account = useAccount();
  const name = account.session?.user.user_metadata?.full_name;
  return (
    <>
      <AccountTrigger />
      <Dialog.Root
        open={account.panelOpen}
        onOpenChange={(open) =>
          open ? account.openPanel() : account.closePanel()
        }
      >
        <Dialog.Portal>
          <Dialog.Overlay className="account-overlay" />
          <Dialog.Content
            className="account-panel"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (account.returnFocus.current?.isConnected)
                account.returnFocus.current.focus();
            }}
          >
            <div className="account-panel-header">
              <Dialog.Title>Conta e favoritos</Dialog.Title>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar conta e favoritos"
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
              </Dialog.Close>
            </div>
            <Dialog.Description className="account-description">
              Salve suas aeronaves e acesse seus favoritos em outros
              dispositivos.
            </Dialog.Description>
            {account.authError && (
              <p className="account-error" role="alert">
                {account.authError}
              </p>
            )}
            {!account.configured ? (
              <p role="status">
                O login está temporariamente indisponível. Você pode continuar
                explorando o mapa.
              </p>
            ) : account.initializing ? (
              <p role="status">Carregando sua conta…</p>
            ) : !account.session ? (
              <div className="account-signin">
                <p>
                  Entre com Google para salvar favoritos. Sua conta é criada no
                  primeiro acesso.
                </p>
                <Button
                  type="button"
                  disabled={account.authBusy}
                  onClick={() => void account.signIn()}
                >
                  {account.authBusy ? "Conectando…" : "Entrar com Google"}
                </Button>
              </div>
            ) : (
              <>
                <div className="account-user">
                  <div>
                    <strong>
                      {typeof name === "string" && name.trim()
                        ? name
                        : "Minha conta"}
                    </strong>
                    <p>{account.session.user.email}</p>
                  </div>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={account.authBusy}
                    onClick={() => void account.signOut()}
                  >
                    {account.authBusy ? "Saindo…" : "Sair"}
                  </Button>
                </div>
                <section
                  className="favorites-section"
                  aria-labelledby="favorites-title"
                  aria-busy={account.loadingFavorites}
                >
                  <div className="favorites-heading">
                    <h3 id="favorites-title">Aeronaves favoritas</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={
                        account.loadingFavorites || Boolean(account.busyHex)
                      }
                      onClick={account.refreshFavorites}
                    >
                      Atualizar
                    </Button>
                  </div>
                  {account.favoritesError && (
                    <p className="account-error" role="alert">
                      {account.favoritesError}
                    </p>
                  )}
                  {account.loadingFavorites ? (
                    <p role="status">Carregando favoritos…</p>
                  ) : !account.favorites.length && !account.favoritesError ? (
                    <p className="favorites-empty">
                      Você ainda não tem favoritos. Selecione uma aeronave no
                      mapa e toque em “Salvar nos favoritos”.
                    </p>
                  ) : (
                    <ul className="favorites-list">
                      {account.favorites.map((favorite) => (
                        <li key={favorite.aircraft_hex}>
                          <Button
                            variant="ghost"
                            className="favorite-open"
                            type="button"
                            aria-label={`Abrir aeronave ${favorite.registration || favorite.aircraft_hex.toUpperCase()}`}
                            onClick={() => {
                              openSavedAircraft({
                                hex: favorite.aircraft_hex,
                                registration: favorite.registration,
                                type: favorite.aircraft_type,
                              });
                              account.closePanel();
                            }}
                          >
                            <span>
                              <strong>
                                {favorite.registration ||
                                  favorite.aircraft_hex.toUpperCase()}
                              </strong>
                              <small>
                                {favorite.aircraft_type ||
                                  "Modelo não informado"}{" "}
                                · {favorite.aircraft_hex.toUpperCase()}
                              </small>
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            aria-label={`Remover ${favorite.registration || favorite.aircraft_hex.toUpperCase()} dos favoritos`}
                            disabled={
                              Boolean(account.busyHex) ||
                              Boolean(account.favoritesError)
                            }
                            onClick={() =>
                              void account.toggleFavorite({
                                hex: favorite.aircraft_hex,
                                registration: favorite.registration,
                                type: favorite.aircraft_type,
                              })
                            }
                          >
                            <Star filled />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
