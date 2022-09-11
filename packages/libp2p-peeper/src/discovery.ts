/* eslint-disable max-classes-per-file */
import crypto from 'crypto';
import EventEmitter from 'events';
import { promisify } from 'node:util';

import { Discv5, ENR } from '@chainsafe/discv5';
import { Noise } from '@chainsafe/libp2p-noise';
import { Bootstrap } from '@libp2p/bootstrap';
import { MulticastDNS } from '@libp2p/mdns';
import { Mplex } from '@libp2p/mplex';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { TCP } from '@libp2p/tcp';
import { Multiaddr } from '@multiformats/multiaddr';
import { createLibp2p as createNode, Libp2p } from 'libp2p';

const randomBytesAsync = promisify(crypto.randomBytes);

type Options = {
  bootnodes: string[];
  maxConnections?: number;
  minConnections?: number;
};

declare interface Discovery {
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'peer', listener: (multiaddr: string) => void): this;
}

class Discovery extends EventEmitter {
  discv5: Discv5 | undefined;

  libp2p: Libp2p | undefined;

  bootnodes: ENR[];

  minConnections: NonNullable<Options['minConnections']>;

  maxConnections: NonNullable<Options['maxConnections']>;

  listen: string[] = ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/udp/0'];

  interval: NodeJS.Timeout | undefined;

  private started = false;

  constructor(options: Options) {
    super();
    this.bootnodes = options.bootnodes.map((bootnode) => ENR.decodeTxt(bootnode));
    this.minConnections = options.minConnections ?? 50;
    this.maxConnections = options.maxConnections ?? 200;
  }

  start() {
    this.started = true;
    this.discover();
  }

  async discover() {
    if (!this.started) return;
    if (this.interval) await this.reset();
    // timeout discovery and start again
    this.interval = setTimeout(async () => {
      this.reset();
    }, 120_000);
    try {
      await this.initLibp2p();
      await this.initDiscv5();
    } catch (error) {
      this.emit('error', error);
      return;
    }
    this.discover();
  }

  private async reset() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.discv5) {
      try {
        await this.discv5.stop();
      } catch (error) {
        // blackhole discv5 stop errors
      }
    }
    this.discv5 = undefined;
    this.libp2p = undefined;
  }

  async stop() {
    this.started = false;
    await this.reset();
  }

  async initLibp2p() {
    const bootnodeAddresses = (
      await Promise.all(this.bootnodes.map((bootnode) => bootnode.getFullMultiaddr('udp4')))
    )
      .filter((bootnodeAddress): bootnodeAddress is Multiaddr => Boolean(bootnodeAddress))
      .map((bootnodeAddress) => bootnodeAddress.toString());
    if (!bootnodeAddresses.length) throw new Error('No bootnode addresses found');
    const peerId = await createSecp256k1PeerId();
    this.libp2p = await createNode({
      transports: [new TCP()],
      streamMuxers: [new Mplex()],
      peerDiscovery: [
        new Bootstrap({
          list: bootnodeAddresses,
        }),
        new MulticastDNS(),
      ],
      connectionEncryption: [new Noise()],
      connectionManager: {
        autoDial: false,
        maxConnections: 100,
        minConnections: 50,
      },
      nat: {
        enabled: false,
      },
      relay: {
        enabled: false,
        hop: {
          enabled: false,
          active: false,
        },
        advertise: {
          enabled: false,
          ttl: 0,
          bootDelay: 0,
        },
        autoRelay: {
          enabled: false,
          maxListeners: 0,
        },
      },
      metrics: {
        enabled: false,
      },
      addresses: {
        listen: this.listen,
      },
      peerId,
    });
  }

  async initDiscv5() {
    if (!this.libp2p) throw new Error('Libp2p not initialized');
    const discv5 = Discv5.create({
      enr: ENR.createFromPeerId(this.libp2p.peerId),
      peerId: this.libp2p.peerId,
      multiaddr: new Multiaddr(this.listen[1]),
    });
    this.bootnodes.forEach((bootnode) => discv5.addEnr(bootnode));
    await discv5.start();
    const randomNodeId = await randomBytesAsync(64);
    const enrs = await discv5.findNode(randomNodeId.toString('hex'));
    enrs.forEach((enr) => {
      this.emit('peer', enr.encodeTxt());
    });
  }
}

export default Discovery;
