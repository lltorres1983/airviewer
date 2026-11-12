import { useRef, useSyncExternalStore } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { Button } from './ui/button';
import { closeObservatory, getObservatory, openObservatory, subscribeObservatory, type ObservatoryTab } from '@/lib/observatory-ui';
import { TrafficReplay } from './traffic-replay';
import { AirportComparison } from './airport-comparison';
import { SpottingDiary } from './spotting-diary';
export function Observatory() {
  const state = useSyncExternalStore(subscribeObservatory, getObservatory);
  const trigger = useRef<HTMLButtonElement>(null);
  return <Dialog.Root open={state.open} onOpenChange={open => open ? openObservatory() : closeObservatory()}>
    <Dialog.Trigger asChild><Button ref={trigger} variant="secondary">Central de acompanhamento</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="observatory-overlay" /><Dialog.Content className="observatory-panel" onCloseAutoFocus={event => {
      event.preventDefault(); const target = trigger.current?.getClientRects().length ? trigger.current : document.querySelector<HTMLButtonElement>('#mobile-menu-toggle'); target?.focus();
    }}>
      <div className="observatory-header"><div><Dialog.Title>Central de acompanhamento</Dialog.Title><Dialog.Description>Explore GRU e GIG e registre seus avistamentos.</Dialog.Description></div><Dialog.Close asChild><button aria-label="Fechar central de acompanhamento">Fechar</button></Dialog.Close></div>
      <Tabs.Root value={state.tab} onValueChange={tab => openObservatory(tab as ObservatoryTab)}>
        <Tabs.List aria-label="Recursos de acompanhamento" className="observatory-tabs"><Tabs.Trigger value="replay">Replay</Tabs.Trigger><Tabs.Trigger value="compare">GRU × GIG</Tabs.Trigger><Tabs.Trigger value="diary">Meu diário</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="replay"><TrafficReplay /></Tabs.Content><Tabs.Content value="compare"><AirportComparison /></Tabs.Content><Tabs.Content value="diary"><SpottingDiary draft={state.draft} /></Tabs.Content>
      </Tabs.Root>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
