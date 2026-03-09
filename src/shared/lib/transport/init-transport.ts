/**
 * Renderer-side transport initialisation for Electron.
 *
 * - Registers the Service Worker (requires app:// origin in prod)
 * - Bridges BroadcastChannel('ExtendedFetch') ↔ window.fetchBridge IPC
 *   so the SW can route requests through the main-process Tor proxy
 * - Handles AltTransportActive queries from the SW via
 *   BroadcastChannel('ServiceWorker')
 */

declare global {
  interface Window {
    fetchBridge: {
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, cb: (err: unknown, ...args: unknown[]) => void) => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
    electronAPI?: { isElectron: boolean };
  }
}

const WHITELIST = [
  /\.?youtube\.com$/,
  /\.?imgur\.com$/,
  /\.?cdn\.jsdelivr\.net$/,
  /\.?vimeocdn\.com$/,
  /\.?vimeo\.com$/,
];

function initFetchRetranslator() {
  const fetchBC = new BroadcastChannel('ExtendedFetch');

  fetchBC.onmessage = ({ data: msg }) => {
    if (msg.name === 'Request') {
      const rid = msg.id;
      window.fetchBridge.send('FetchBridge:Request', rid, msg.data);

      window.fetchBridge.on(`FetchBridge:${rid}:InitialData`, (_e, d) =>
        fetchBC.postMessage({ name: 'InitialData', id: rid, data: d }));

      window.fetchBridge.on(`FetchBridge:${rid}:Data`, (_e, d) =>
        fetchBC.postMessage({ name: 'Data', id: rid, data: d }));

      window.fetchBridge.on(`FetchBridge:${rid}:End`, () =>
        fetchBC.postMessage({ name: 'End', id: rid }));

      window.fetchBridge.on(`FetchBridge:${rid}:Error`, (_e, d) =>
        fetchBC.postMessage({ name: 'Error', id: rid, data: d }));
    } else if (msg.name === 'Abort') {
      window.fetchBridge.send(`FetchBridge:${msg.id}:Abort`);
    }
  };
}

function initAltTransportHandler() {
  const swBC = new BroadcastChannel('ServiceWorker');

  swBC.onmessage = async ({ data: msg }) => {
    if (msg.name === 'AltTransportActive') {
      const url: string = msg.data.data;
      const id: string = msg.data.id;

      try {
        const hostname = new URL(url).hostname;

        if (WHITELIST.some(re => re.test(hostname))) {
          swBC.postMessage({ name: `AltTransportActive_result[${id}]`, data: false });
          return;
        }
      } catch {
        swBC.postMessage({ name: `AltTransportActive_result[${id}]`, data: false });
        return;
      }

      const result = await window.fetchBridge.invoke('AltTransportActive', url);
      swBC.postMessage({ name: `AltTransportActive_result[${id}]`, data: result });
    }
  };
}

export async function initTransport(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported — transport proxy disabled');
    return;
  }

  // SW registration only works on http(s) origins; skip on app:// protocol
  const proto = location.protocol;
  if (proto !== 'https:' && proto !== 'http:') {
    console.warn(`Service Workers not supported on ${proto} — transport proxy disabled`);
    return;
  }

  try {
    await navigator.serviceWorker.register('./service-worker.js?platform=electron');
  } catch (err) {
    console.error('Service Worker registration failed:', err);
    return;
  }

  initFetchRetranslator();
  initAltTransportHandler();
}
