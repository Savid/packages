import { ETH66Status } from './eth66.js';
import Peer from './peer.js';

export { PeerError } from './peer.js';

export default async ({
  enode,
  timeout = 30_000,
}: {
  timeout?: number;
  enode: string;
}): Promise<ETH66Status & { client?: string }> =>
  new Promise((res, rej) => {
    const url = new URL(enode);
    if (url.protocol !== 'enode:') {
      rej(new Error(`invalid enode protocol: ${url.protocol}`));
      return;
    }

    let peer: Peer;
    let timer: NodeJS.Timeout;
    let client: string | undefined;

    const cleanup = () => {
      clearTimeout(timer);
      peer.removeAllListeners();
      peer.destroy();
    };
    timer = setTimeout(() => {
      cleanup();
      rej(new Error('timeout'));
    }, timeout);

    peer = new Peer({
      remoteId: Buffer.from(url.username, 'hex'),
      host: url.hostname,
      port: Number.parseInt(url.port),
    });
    peer.on('err', (error) => {
      cleanup();
      rej(error);
    });
    peer.on('client', (c) => {
      client = c;
    });
    peer.on('status', (status) => {
      cleanup();
      res({
        ...status,
        client,
      });
    });
    peer.init();
  });
