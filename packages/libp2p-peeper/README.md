# @savid/libp2p-peeper

Discover [libp2p](https://libp2p.io/) peers with the [Node Discovery Protocol v5](https://github.com/ethereum/devp2p/blob/master/discv5/discv5.md).

This package is adapted from the [@chainsafe/discv5](https://github.com/ChainSafe/discv5) project.

## Requirements

- NodeJS v18+
- ESM only

## Install

```bash
npm install --save @savid/libp2p-peeper
```

## Usage

Add bootnodes to begin;
```typescript
import peeper from '@savid/libp2p-peeper';

const bootnodes = [
  'enr:-Iq4QMCTfIMXnow27baRUb35Q8iiFHSIDBJh6hQM5Axohhf4b6Kr_cOCu0htQ5WvVqKvFgY28893DHAg8gnBAXsAVqmGAX53x8JggmlkgnY0gmlwhLKAlv6Jc2VjcDI1NmsxoQK6S-Cii_KmfFdUJL2TANL3ksaKUnNXvTCv1tLwXs0QgIN1ZHCCIyk',
];

try {
  for await (const { error, enr } of peeper({ bootnodes })) {
    if (error) throw error;
    // https://ethereum.org/en/developers/docs/networking-layer/network-addresses/#enr
    if (enr) console.log(enr);
  }
} catch (error) {
  console.error(error);
}
```

## API

```typescript
async function* peeper(options: {
  // list of EIP-778: Ethereum Node Records (ENR) bootnodes
  bootnodes: string[];
  // min number of candidate peers to retrieve from DNS records when attempting to discover new nodes
  minConnections?: number;
  // max number of candidate peers to retrieve from DNS records when attempting to discover new nodes
  maxConnections?: number;
}): AsyncGenerator<{
  enr?: string | undefined;
  error?: Error | undefined;
}>;
```

## License

[MIT](https://opensource.org/licenses/MIT)
