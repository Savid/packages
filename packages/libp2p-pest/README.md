# @savid/libp2p-pest

Get the [status](https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/p2p-interface.md#status) of a [libp2p](https://libp2p.io/) peer via the [Node Discovery Protocol v5](https://github.com/ethereum/devp2p/blob/master/discv5/discv5.md).

This package is adapted from the [@chainsafe/discv5](https://github.com/ChainSafe/discv5) project.

## Requirements

- NodeJS v18+
- ESM only

## Limitations

Currently only support an [ENR](https://ethereum.org/en/developers/docs/networking-layer/network-addresses/#enr) with tcp4 multiaddr.

## Install

```bash
npm install --save @savid/libp2p-pest
```

## Usage

```typescript
import pest from '@savid/libp2p-pest';

try {
  const status = await pest({
    enr: 'enr:-IS4QLkKqDMy_ExrpOEWa59NiClemOnor-krjp4qoeZwIw2QduPC-q7Kz4u1IOWf3DDbdxqQIgC4fejavBOuUPy-HE4BgmlkgnY0gmlwhCLzAHqJc2VjcDI1NmsxoQLQSJfEAHZApkm5edTCZ_4qps_1k_ub2CxHFxi-gr2JMIN1ZHCCIyg',
  });
} catch (error) {
  console.log('something happened', error.code);
}
```

## API

```typescript
function pest(options: {
  // ETHEREUM NODE RECORDS (ENRS) https://ethereum.org/en/developers/docs/networking-layer/network-addresses/#enr
  enr: string;
  // connection timeout
  timeout?: number;
}): Response;

// status https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/p2p-interface.md#status
type Response = {
  // fork digest of peer
  forkDigest: string;
  // state.finalized_checkpoint.root for the state corresponding to the head block
  finalizedRoot: string;
  // state.finalized_checkpoint.epoch for the state corresponding to the head block
  finalizedEpoch: number;
  // the hash_tree_root root of the current head block (BeaconBlock)
  headRoot: string;
  // the slot of the block corresponding to the head_root
  headSlot: number;
};
```

example response;

```typescript
{
  forkDigest: '0x36fa5013',
  finalizedRoot: '0x35b8f3cc8cd912056d45541573d02475379a98b7ed40c7672dfd225b0fd166e7',
  finalizedEpoch: 17193,
  headRoot: '0x35b8f3cc8cd912056d45541573d02475379a98b7ed40c7672dfd225b0fd166e7',
  headSlot: 550176
}
```

## Error codes

| Reason                             | Meaning                                         |
|----------------------------------- |:------------------------------------------------|
| `SECP256K1_PEER_ID_FAILED`         | Failed to generate secp256k1 peer id            |
| `LIBP2P_START_FAILED`              | Failed to start libp2p instance                 |
| `MALFORMED_ENR`                    | Malformed ENR provided                          |
| `NO_VALID_MULTIADDR`               | No valid tcp4 multiaddr in ENR provided         |
| `LIBP2P_DIALIER_NODE_START_FAILED` | Failed to start libp2p dialer node              |
| `LIBP2P_DIALIER_DIAL_FAILED`       | Failed to dial out with libp2p dialer           |
| `PEER_STATUS_FAILED`               | Failed to receive peer status                   |
| `PEER_STATUS_NOT_SUCCESSFUL`       | Received non success status header              |
| `PEER_STATUS_SSZ_LENGTH_INVALID`   | Peer status SSZ length invalid                  |
| `PEER_STATUS_SSZ_LENGTH_TOO_LARGE` | Peer status SSZ length too large                |
| `PEER_STATUS_SSZ_LENGTH_TOO_SMALL` | Peer status SSZ length too small                |
| `PEER_STATUS_IDENTIFIER_INVALID`   | Peer status identifier invalid                  |
| `PEER_STATUS_CHUNK_TYPE_INVALID`   | Peer status chunk type invalid                  |

## License

[MIT](https://opensource.org/licenses/MIT)
