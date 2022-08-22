# @savid/rlpx-peeper

Discover [RLPx](https://github.com/ethereum/devp2p/blob/master/rlpx.md) peers with the [eth/66](https://eips.ethereum.org/EIPS/eip-2481) protocol.

This package is adapted from the [@ethereumjs/devp2p](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/devp2p) project.

## Requirements

- NodeJS v18+
- ESM only

## Install

```bash
npm install --save @savid/rlpx-peeper
```

## Usage

Manually adding boot nodes and dns networks;
```typescript
import peeper from '@savid/rlpx-peeper';

const dnsNetworks = [
  'enrtree://AKA3AM6LPBYEUDMVNU3BSVQJ5AD45Y7YPOHJLEF6W26QOE4VTUDPE@all.mainnet.ethdisco.net',
];

const bootnodes = [
  {
    id: Buffer.from(
      'd860a01f9722d78051619d1e2351aba3f43f943f6f00718d1b9baa4101932a1f5011f16bb2b1bb35db20d6fe28fa0bf09636d26a87d31de9ec6203eeedb1f666',
      'hex',
    ),
    ip: '18.138.108.67',
    port: 30303,
  },
];

try {
  for await (const { error, enode } of peeper({ bootnodes, dnsNetworks })) {
    if (error) throw error;
    if (enode) console.log(enode);
  }
} catch (error) {
  console.error(error);
}
```

Consuming [`@ethereumjs/common`](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/common) chains;
```typescript
import peeper from '@savid/rlpx-peeper';
import chain from '@ethereumjs/common/dist/chains/mainnet.json' assert { type: 'json' };

const bootnodes = chain.bootstrapNodes.map((bootnode) => ({
  id: Buffer.from(bootnode.id, 'hex'),
  ip: bootnode.ip,
  port: bootnode.port,
}));

const { dnsNetworks } = chain;

try {
  for await (const { error, enode } of peeper({ bootnodes, dnsNetworks })) {
    if (error) throw error;
    if (enode) console.log(enode);
  }
} catch (error) {
  console.error(error);
}
```

## API

```typescript
async function* peeper(options: {
  // EIP-1459 ENR tree urls to query for peer discovery
  dnsNetworks?: string[];
  // boot node peers
  bootnodes?: { id: Buffer; ip: string; port: number }[];
  // interval for peer table refresh
  refreshInterval?: number;
  // max number of candidate peers to retrieve from DNS records when attempting to discover new nodes
  maxPeers?: number;
  // DNS server to query DNS TXT records from for peer discovery
  dnsAddress?: string;
}): AsyncGenerator<{
  enode?: string | undefined;
  error?: Error | undefined;
}>;
```

## License

[MIT](https://opensource.org/licenses/MIT)
