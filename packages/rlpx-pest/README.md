# @savid/rlpx-pest

Get the [status](https://github.com/ethereum/devp2p/blob/master/caps/eth.md#status-0x00) of a [RLPx](https://github.com/ethereum/devp2p/blob/master/rlpx.md) peer via the [eth/66](https://eips.ethereum.org/EIPS/eip-2481) protocol.

This package is adapted from the [@ethereumjs/devp2p](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/devp2p) project.

## Requirements

- NodeJS v18+
- ESM only

## Install

```bash
npm install --save @savid/rlpx-pest
```

## Usage

```typescript
import pest from '@savid/rlpx-pest';

try {
  const status = await pest({
    enode: 'enode://6f8a80d14311c39f35f516fa664deaaaa13e85b2f7493f37f6144d86991ec012937307647bd3b9a82abe2974e1407241d54947bbb39763a4cac9f77166ad92a0@10.3.58.6:30303',
  });
} catch (error) {
  console.log('something happened', error.code);
}
```

## API

```typescript
function pest(options: {
  // Enode https://ethereum.org/en/developers/docs/networking-layer/network-addresses#enode
  enode: string;
  // connection timeout
  timeout?: number;
}): Response;

// status https://github.com/ethereum/devp2p/blob/master/caps/eth.md#status-0x00
type Response = {
  // integer identifying the blockchain, see table below
  networkId: bigint;
  // total difficulty of the best chain. Integer, as found in block header.
  td: bigint;
  // the hash of the best (i.e. highest TD) known block
  bestHash: string;
  // the hash of the genesis block
  genesisHash: string;
  // EIP-2124 fork identifier
  fork?: {
    hash: string;
    next: string;
  };
  // peer client id
  client?: string;
};
```

example response;

```typescript
{
  networkId: 1n,
  td: 56495485781309105821794n,
  bestHash: '0xe125949899e443bbf1f26b8a89c40f2ac6b504c648b4f90cc79f19738d9a38fd',
  genesisHash: '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
  fork: { hash: '0xf0afd0e3', next: '0x00' },
  client: 'Geth/v1.10.20-stable-8f2416a8/linux-amd64/go1.17.10',
}
```

## Error codes

| Reason                          | Meaning                                         |
|-------------------------------- |:------------------------------------------------|
| `INITIAL_SOCKET_CONNECT_FAILED` | TCP socket failed to initialial connect         |
| `SOCKET_ERROR`                  | TCP socket error                                |
| `SOCKET_CLOSED`                 | TCP socket closed unexpectedly                  |
| `INCOMING_DATA_STATE`           | Invalid Auth/Ack/Header/Body state sent by peer |
| `INVALID_HEADER_SIZE`           | Invalid header size                             |
| `SEND_HELLO_MESSAGE_FAILED`     | Failed to send hello message to peer            |
| `EMPTY_BODY_MESSAGE`            | Received unexpected empty message body          |
| `BODY_PARSE_FAILED`             | Failed to parse message body from peer          |
| `PEER_DISCONNECTED`             | Peer sent disconnect message                    |

## License

[MIT](https://opensource.org/licenses/MIT)
