import { strict as assert } from 'node:assert';

import { Capabilities } from '@ethereumjs/devp2p';
import { arrToBufArr, bufferToBigInt, NestedBufferArray } from '@ethereumjs/util';
import RLP from 'rlp';

// https://github.com/ethereum/devp2p/blob/master/caps/eth.md#status-0x00
export type ETH66Status = {
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
};

export default (callback: (error?: Error, response?: ETH66Status) => void): Capabilities => ({
  name: 'eth',
  version: 66,
  length: 17,
  constructor: class EthProtocol {
    // eslint-disable-next-line class-methods-use-this
    handleMessage(code: number, message: Iterable<number>) {
      // expecting to only handle the 0x00 status message
      // https://github.com/ethereum/devp2p/blob/master/caps/eth.md#status-0x00
      if (code !== 0x00) {
        callback(new Error(`invalid code: ${code}`));
        return;
      }
      try {
        const payload = arrToBufArr(RLP.decode(Uint8Array.from(message))) as NestedBufferArray;
        assert.equal(payload.length, 6);
        assert.equal(payload[5].length, 2);
        callback(undefined, {
          networkId: bufferToBigInt(payload[1] as Buffer),
          td: bufferToBigInt(payload[2] as Buffer),
          bestHash: `0x${payload[3].toString('hex')}`,
          genesisHash: `0x${payload[4].toString('hex')}`,
          fork: {
            hash: `0x${(payload[5][0] as Buffer).toString('hex')}`,
            next: `0x${(payload[5][1] as Buffer).toString('hex') || '00'}`,
          },
        } as ETH66Status);
      } catch (err) {
        callback(new Error(`failed to decode RLP: ${err}`));
      }
    }
  },
});
