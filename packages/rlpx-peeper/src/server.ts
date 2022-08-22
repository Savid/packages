/* eslint-disable max-classes-per-file */
import crypto from 'crypto';
import EventEmitter from 'events';

import { RLPx, DPT, Peer } from '@ethereumjs/devp2p';

const ignoredErrors = new RegExp(
  [
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'Hash verification failed',
    'Invalid address buffer',
    'Invalid timestamp buffer',
    'Invalid type',
    'Timeout error: ping',
    'Peer is banned',
    'Invalid MAC',
    'Handshake timed out',
    'Server already destroyed',
  ].join('|'),
);

type Options = {
  dnsNetworks?: string[];
  bootnodes?: { id: Buffer; ip: string; port: number }[];
  refreshInterval?: number;
  maxPeers?: number;
  dnsAddress?: string;
};

declare interface Server {
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'peer', listener: (data: string) => void): this;
}

class Server extends EventEmitter {
  key: Buffer;

  bootnodes: NonNullable<Options['bootnodes']>;

  dnsNetworks: NonNullable<Options['dnsNetworks']>;

  refreshInterval: NonNullable<Options['refreshInterval']>;

  peers = new Map();

  rlpx: RLPx | undefined;

  dpt: DPT | undefined;

  name = 'rlpx';

  maxPeers: NonNullable<Options['maxPeers']>;

  dnsAddress: NonNullable<Options['dnsAddress']>;

  constructor(options: Options) {
    super();
    this.key = crypto.randomBytes(32);
    this.bootnodes = options.bootnodes ?? [];
    this.dnsNetworks = options.dnsNetworks ?? [];
    this.refreshInterval = options.refreshInterval ?? 30000;
    this.maxPeers = options.maxPeers ?? 100;
    this.dnsAddress = options.dnsAddress ?? '8.8.8.8';
  }

  async start() {
    this.initDpt();
    this.initRlpx();
    if (!this.dpt) throw new Error('DPT not initialized');
    const dnsPeers = (await this.dpt.getDnsPeers()) ?? [];
    return Promise.all([
      ...dnsPeers.map((node) => this.dpt?.bootstrap(node)),
      ...this.bootnodes.map((bootnode) =>
        this.dpt?.bootstrap({
          id: bootnode.id,
          address: bootnode.ip,
          udpPort: bootnode.port,
          tcpPort: bootnode.port,
        }),
      ),
    ]);
  }

  stop() {
    this.rlpx?.destroy();
    this.dpt?.destroy();
  }

  async initDpt() {
    this.dpt = new DPT(this.key, {
      refreshInterval: this.refreshInterval,
      endpoint: {
        address: '0.0.0.0',
        udpPort: null,
        tcpPort: null,
      },
      shouldFindNeighbours: true,
      shouldGetDnsPeers: true,
      dnsRefreshQuantity: this.maxPeers,
      dnsNetworks: this.dnsNetworks,
      dnsAddr: this.dnsAddress,
    });
    this.dpt.on('error', (error) => {
      if (error instanceof Error) {
        if (ignoredErrors.test(error.message)) return;
        this.emit('error', error);
      }
    });
  }

  initRlpx() {
    this.rlpx = new RLPx(this.key, {
      dpt: this.dpt,
      maxPeers: this.maxPeers,
      capabilities: [
        {
          name: 'eth',
          version: 66,
          length: 17,
          // add dummy constructor
          constructor: class ETH66 {
            // eslint-disable-next-line class-methods-use-this, no-underscore-dangle
            _handleMessage() {}
          },
        },
      ],
      // @ts-ignore do not need a common chain defined
      common: undefined,
    });

    this.rlpx.on('peer:added', async (rlpxPeer: Peer) => {
      const id = rlpxPeer.getId()?.toString('hex');
      // eslint-disable-next-line no-underscore-dangle
      const { remoteAddress, remotePort } = rlpxPeer._socket;
      if (id && remoteAddress && remotePort) {
        this.emit('peer', `enode://${id}@${remoteAddress}:${remotePort}`);
      }
    });
    this.rlpx.on('error', (error) => {
      if (error instanceof Error) {
        if (ignoredErrors.test(error.message)) return;
        this.emit('error', error);
      }
    });
  }
}

export default Server;
