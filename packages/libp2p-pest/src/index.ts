import { Stream } from 'node:stream';

import { ENR } from '@chainsafe/discv5';
import { GossipSub } from '@chainsafe/libp2p-gossipsub';
import { Noise } from '@chainsafe/libp2p-noise';
import snappy from '@chainsafe/snappy-stream';
import { Mplex } from '@libp2p/mplex';
import { createSecp256k1PeerId } from '@libp2p/peer-id-factory';
import { TCP } from '@libp2p/tcp';
import { ssz } from '@lodestar/types';
import { pipe, Sink, Source } from 'it-pipe';
import { createLibp2p as createNode, Libp2p } from 'libp2p';
import { uncompress } from 'snappyjs';
import { source as streamToItSource } from 'stream-to-it';
import { Uint8ArrayList } from 'uint8arraylist';
import varint from 'varint';

// source: https://github.com/ChainSafe/lodestar/blob/b7dcc4beff7472997d139dc93c4a53a5fb1e4bcb/packages/beacon-node/src/network/reqresp/encodingStrategies/sszSnappy/snappyFrames/uncompress.ts#L79
const getFrameSize = (buffer: Uint8Array, offset: number) =>
  // eslint-disable-next-line no-bitwise
  buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);

interface Conn extends Stream {
  sink: Sink<unknown, unknown>;
  source: Source<Uint8ArrayList>;
}

export interface Status {
  forkDigest: string;
  finalizedRoot: string;
  finalizedEpoch: number;
  headRoot: string;
  headSlot: number;
}

export class PeerError extends Error {
  code: ErrorCode;

  constructor(message: string, code: ErrorCode) {
    super(message);
    this.name = 'PeerError';
    this.code = code;
  }
}

export enum ErrorCode {
  SECP256K1_PEER_ID_FAILED = 'SECP256K1_PEER_ID_FAILED',
  LIBP2P_START_FAILED = 'LIBP2P_START_FAILED',
  MALFORMED_ENR = 'MALFORMED_ENR',
  NO_VALID_MULTIADDR = 'NO_VALID_MULTIADDR',
  LIBP2P_DIALIER_NODE_START_FAILED = 'LIBP2P_DIALIER_NODE_START_FAILED',
  LIBP2P_DIALIER_DIAL_FAILED = 'LIBP2P_DIALIER_DIAL_FAILED',
  PEER_STATUS_FAILED = 'PEER_STATUS_FAILED',
  PEER_STATUS_NOT_SUCCESSFUL = 'PEER_STATUS_NOT_SUCCESSFUL',
  PEER_STATUS_SSZ_LENGTH_INVALID = 'PEER_STATUS_SSZ_LENGTH_INVALID',
  PEER_STATUS_SSZ_LENGTH_TOO_LARGE = 'PEER_STATUS_SSZ_LENGTH_TOO_LARGE',
  PEER_STATUS_SSZ_LENGTH_TOO_SMALL = 'PEER_STATUS_SSZ_LENGTH_TOO_SMALL',
  PEER_STATUS_IDENTIFIER_INVALID = 'PEER_STATUS_IDENTIFIER_INVALID',
  PEER_STATUS_CHUNK_TYPE_INVALID = 'PEER_STATUS_CHUNK_TYPE_INVALID',
}

const wrapError = (error: Error, code: ErrorCode) => {
  if (error instanceof PeerError) {
    return error;
  }
  const wrappedError = new PeerError(error.message, code);
  wrappedError.stack = error.stack;
  return wrappedError;
};

export default async function pest({
  enr: enrTxt,
  timeout = 30_000,
}: {
  enr: string;
  timeout?: number;
}) {
  let peerId: Awaited<ReturnType<typeof createSecp256k1PeerId>>;
  try {
    peerId = await createSecp256k1PeerId();
  } catch (error) {
    if (error instanceof Error) throw wrapError(error, ErrorCode.SECP256K1_PEER_ID_FAILED);
    throw new PeerError('unknown', ErrorCode.SECP256K1_PEER_ID_FAILED);
  }
  // Dialer
  let dialerNode: Libp2p;
  async function cleanupDialerNode() {
    try {
      await dialerNode?.hangUp(peerId);
      await dialerNode?.stop();
    } catch (error) {
      // blackhole
    }
  }
  try {
    dialerNode = await createNode({
      transports: [new TCP()],
      streamMuxers: [new Mplex()],
      connectionEncryption: [new Noise()],
      addresses: {
        listen: ['/ip4/0.0.0.0/tcp/0'],
      },
      pubsub: new GossipSub(),
      peerId,
    });
  } catch (error) {
    if (error instanceof Error) throw wrapError(error, ErrorCode.LIBP2P_START_FAILED);
    throw new PeerError('unknown', ErrorCode.LIBP2P_START_FAILED);
  }

  let enr: ENR;
  try {
    enr = ENR.decodeTxt(enrTxt);
  } catch (error) {
    if (error instanceof Error) throw wrapError(error, ErrorCode.MALFORMED_ENR);
    throw new PeerError('unknown', ErrorCode.MALFORMED_ENR);
  }
  let multiaddr: Awaited<ReturnType<typeof enr.getFullMultiaddr>>;
  try {
    multiaddr = await enr.getFullMultiaddr('tcp4');
  } catch (error) {
    if (error instanceof Error) throw wrapError(error, ErrorCode.NO_VALID_MULTIADDR);
    throw new PeerError('unknown', ErrorCode.NO_VALID_MULTIADDR);
  }
  if (!multiaddr) throw new PeerError('no valid multiaddr found', ErrorCode.NO_VALID_MULTIADDR);

  try {
    await dialerNode.start();
  } catch (error) {
    if (error instanceof Error) throw wrapError(error, ErrorCode.LIBP2P_DIALIER_NODE_START_FAILED);
    throw new PeerError('unknown', ErrorCode.LIBP2P_DIALIER_NODE_START_FAILED);
  }

  // https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/p2p-interface.md#status
  const protocolPrefix = '/eth2/beacon_chain/req';
  const method = 'status';
  const version = '1';
  const encoding = 'ssz_snappy';
  const protocol = `${protocolPrefix}/${method}/${version}/${encoding}`;
  // Dial the listener node
  let conn: Conn;
  try {
    conn = (await dialerNode.dialProtocol(multiaddr, protocol)) as unknown as Conn;
  } catch (error) {
    await cleanupDialerNode();
    if (error instanceof Error) throw wrapError(error, ErrorCode.LIBP2P_DIALIER_DIAL_FAILED);
    throw new PeerError('unknown', ErrorCode.LIBP2P_DIALIER_DIAL_FAILED);
  }

  /*
   * eth2 field;
   *   The first four bytes are the fork digest
   *   The next four bytes are the fork version
   *   The next four bytes are the "next" fork version
   *   The next four bytes is the "next" fork epoch
   */
  const forkDigest = new Uint8Array(enr.get('eth2')?.slice(0, 4) ?? Buffer.from('00000000', 'hex'));
  const finalizedRoot = new Uint8Array(
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
  );
  const finalizedEpoch = 0;
  const headRoot = new Uint8Array(
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
  );
  const headSlot = 0;

  // phase0.Status
  const payload = {
    forkDigest,
    finalizedRoot,
    finalizedEpoch,
    headRoot,
    headSlot,
  }; /* as phase0.Status */
  const bytes = ssz.phase0.Status.serialize(payload);
  const serializedBody = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  const length = Buffer.from(varint.encode(serializedBody.length));
  const stream = snappy.createCompressStream();
  stream.write(serializedBody);
  stream.end();
  const compressedBody = streamToItSource(stream);
  // send status to remote
  pipe(async function* requestEncode() {
    yield length;
    yield* compressedBody;
  }, conn.sink);
  let status: Status | undefined;
  // handle remote status
  try {
    await pipe(conn.source, async (source) => {
      const timeoutTimer = setTimeout(() => {
        throw new Error('timed out');
      }, timeout);
      /*
       * Depending on the client implementation, a single chunk
       * may include 1 or more stages of the status message.
       *   status: the status of the message (1 byte)
       *   length: the length of the message (varint)
       *   identifier: the identifier of the message
       *   body: the body of the message
       */
      let stage: 'status' | 'length' | 'identifier' | 'body' = 'status';
      /*
       * to determine the body frame size we need to store the last 8 bytes
       * of the identifier
       */
      let identifier = new Uint8Array();
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of source) {
        let buffer = chunk.subarray();
        if (stage === 'status') {
          if (buffer[0] !== 0x00)
            throw new PeerError(
              'non successful response status',
              ErrorCode.PEER_STATUS_NOT_SUCCESSFUL,
            );
          stage = 'length';
          // eslint-disable-next-line no-continue
          if (chunk.length === 1) continue;
          // remove status byte
          buffer = buffer.slice(1);
        }
        if (stage === 'length') {
          // check message size
          let sszDataLength;
          try {
            sszDataLength = varint.decode(buffer);
          } catch (error) {
            if (error instanceof Error)
              throw wrapError(error, ErrorCode.PEER_STATUS_SSZ_LENGTH_INVALID);
            throw new PeerError('unknown', ErrorCode.PEER_STATUS_SSZ_LENGTH_INVALID);
          }
          if (sszDataLength > ssz.phase0.Status.maxSize)
            throw new PeerError(
              `${sszDataLength} over ssz expected min size of ${ssz.phase0.Status.maxSize}`,
              ErrorCode.PEER_STATUS_SSZ_LENGTH_TOO_LARGE,
            );
          if (sszDataLength < ssz.phase0.Status.minSize)
            throw new PeerError(
              `${sszDataLength} under ssz expected min size of ${ssz.phase0.Status.minSize}`,
              ErrorCode.PEER_STATUS_SSZ_LENGTH_TOO_SMALL,
            );
          stage = 'identifier';
          // eslint-disable-next-line no-continue
          if (chunk.length === 1) continue;
          // remove varint bytes
          buffer = buffer.slice(varint.decode.bytes);
        }
        if (stage === 'identifier') {
          // must begine with indentifier byte
          if (buffer[0] !== 0xff)
            throw new PeerError('must have indentifier', ErrorCode.PEER_STATUS_IDENTIFIER_INVALID);
          // remove identifier bytes
          buffer = buffer.slice(4 + getFrameSize(buffer, 1));
          /*
           * check chunk type for status message is valid
           *   0x00 - compressed
           *   0x01 - uncompressed
           */
          if (![0x00, 0x01].includes(buffer[0]))
            throw new PeerError(
              `invalid chunk type of ${buffer[0]}`,
              ErrorCode.PEER_STATUS_CHUNK_TYPE_INVALID,
            );
          identifier = new Uint8Array(buffer.slice(0, 8));
          buffer = buffer.slice(8);
          stage = 'body';
          // eslint-disable-next-line no-continue
          if (buffer.length === 0) continue;
        }
        if (stage === 'body') {
          buffer = new Uint8Array([...identifier, ...buffer]);
          const frameSize = getFrameSize(buffer, 1);
          const data = buffer.slice(4, 4 + frameSize);
          const result = buffer[0] === 0x00 ? uncompress(data.slice(4)) : data.slice(4);
          const deserializedData = ssz.phase0.Status.deserialize(result);
          status = {
            forkDigest: `0x${Buffer.from(deserializedData.forkDigest).toString('hex')}`,
            finalizedRoot: `0x${Buffer.from(deserializedData.finalizedRoot).toString('hex')}`,
            finalizedEpoch: deserializedData.finalizedEpoch,
            headRoot: `0x${Buffer.from(deserializedData.headRoot).toString('hex')}`,
            headSlot: deserializedData.headSlot,
          };
        }
      }
      clearTimeout(timeoutTimer);
    });
  } catch (error) {
    await cleanupDialerNode();
    if (error instanceof PeerError) throw error;
    if (error instanceof Error) throw wrapError(error, ErrorCode.PEER_STATUS_FAILED);
    throw new PeerError('unknown', ErrorCode.PEER_STATUS_FAILED);
  }
  await cleanupDialerNode();
  return status;
}
