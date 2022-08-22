/**
 * RLPx peer adapted from @ethereumjs/devp2p
 * https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/devp2p
 */
/* eslint-disable max-classes-per-file */
import { randomBytes } from 'crypto';
import EventEmitter from 'events';
import net from 'net';
import * as os from 'os';

import {
  pk2id,
  ECIES,
  buffer2int,
  int2buffer,
  HelloMsg,
  Hello,
  BASE_PROTOCOL_VERSION,
  PREFIXES,
  DISCONNECT_REASONS,
  ProtocolDescriptor,
  BASE_PROTOCOL_LENGTH,
  Capabilities,
} from '@ethereumjs/devp2p';
import { bufArrToArr, arrToBufArr, NestedBufferArray } from '@ethereumjs/util';
import BufferList from 'bl';
import { getPublicKey } from 'ethereum-cryptography/secp256k1.js';
import RLP from 'rlp';
import * as snappy from 'snappyjs';

import ETH66, { ETH66Status } from './eth66.js';

const CLIENT = Buffer.from(`RLPxPest/v1.0.0/${os.platform()}-${os.arch()}/nodejs`, 'utf8');

export class PeerError extends Error {
  code: ErrorCode;

  constructor(message: string, code: ErrorCode) {
    super(message);
    this.name = 'PeerError';
    this.code = code;
  }
}

export enum ErrorCode {
  INITIAL_SOCKET_CONNECT_FAILED = 'INITIAL_SOCKET_CONNECT_FAILED',
  SOCKET_ERROR = 'SOCKET_ERROR',
  SOCKET_CLOSED = 'SOCKET_CLOSED',
  INCOMING_DATA_STATE = 'INCOMING_DATA_STATE',
  INVALID_HEADER_SIZE = 'INVALID_HEADER_SIZE',
  SEND_HELLO_MESSAGE_FAILED = 'SEND_HELLO_MESSAGE_FAILED',
  EMPTY_BODY_MESSAGE = 'EMPTY_BODY_MESSAGE',
  BODY_PARSE_FAILED = 'BODY_PARSE_FAILED',
  PEER_DISCONNECTED = 'PEER_DISCONNECTED',
}

const wrapError = (error: Error, code: ErrorCode) => {
  if (error instanceof PeerError) {
    return error;
  }
  const wrappedError = new PeerError(error.message, code);
  wrappedError.stack = error.stack;
  return wrappedError;
};

declare interface Peer {
  on(event: 'err', listener: (error: PeerError) => void): this;
  on(event: 'status', listener: (data: ETH66Status) => void): this;
  on(event: 'client', listener: (data: string) => void): this;
}

class Peer extends EventEmitter {
  private id: Buffer;

  private remoteId: Buffer;

  private host: string;

  private port: number;

  private privateKey: Buffer;

  private eciesSession: ECIES;

  private state: 'Auth' | 'Ack' | 'Header' | 'Body';

  private socket: net.Socket;

  private socketData: BufferList;

  private socketNextPacketSize: number;

  private hello?: Hello;

  private protocols: ProtocolDescriptor[];

  private capabilities: Capabilities[];

  constructor({ remoteId, host, port }: { remoteId: Buffer; host: string; port: number }) {
    super();
    this.capabilities = [
      ETH66((error, response) => {
        if (error) this.emit('err', error);
        if (response) this.emit('status', response);
      }),
    ];
    this.remoteId = remoteId;
    this.host = host;
    this.port = port;
    this.privateKey = randomBytes(32);
    this.id = pk2id(Buffer.from(getPublicKey(this.privateKey, false)));
    this.eciesSession = new ECIES(this.privateKey, this.id, this.remoteId);
    this.socket = new net.Socket();
    this.socketNextPacketSize = 307;
    this.socketData = new BufferList();
    this.state = 'Auth';
    this.protocols = [];
  }

  destroy() {
    this.socket.destroy();
  }

  init() {
    this.socket.on('error', (error) =>
      this.emit('err', wrapError(error, ErrorCode.INITIAL_SOCKET_CONNECT_FAILED)),
    );
    this.socket.once('connect', () => {
      this.socket.on('error', (error) =>
        this.emit('err', wrapError(error, ErrorCode.SOCKET_ERROR)),
      );
      this.socket.on('data', (data) => this.handleData(data));
      this.socket.on('close', () =>
        this.emit('err', new PeerError('socket closed', ErrorCode.SOCKET_CLOSED)),
      );
      this.sendAuth();
    });
    this.socket.connect(this.port, this.host);
  }

  handleData(data: Buffer) {
    if (this.socket.closed) return;
    this.socketData.append(data);
    try {
      while (this.socketData.length >= this.socketNextPacketSize) {
        switch (this.state) {
          case 'Auth':
            // no need to implement when we're always the connection initiator
            throw new Error('not implemented');
          case 'Ack':
            this.handleAck();
            break;
          case 'Header':
            this.handleHeader();
            break;
          case 'Body':
            this.handleBody();
            break;
          default:
            throw new Error(`Unknown state: ${this.state}`);
        }
      }
    } catch (error) {
      this.emit(
        'error',
        error instanceof Error
          ? wrapError(error, ErrorCode.INCOMING_DATA_STATE)
          : new PeerError('unknown', ErrorCode.INCOMING_DATA_STATE),
      );
      this.sendDisconnect(DISCONNECT_REASONS.SUBPROTOCOL_ERROR);
    }
  }

  sendAuth() {
    const auth = this.eciesSession.createAuthEIP8();
    if (auth && !this.socket?.closed) this.socket.write(auth);
    this.state = 'Ack';
    this.socketNextPacketSize = 210;
  }

  handleAck() {
    const bytesCount = this.socketNextPacketSize;
    const parseData = this.socketData.slice(0, bytesCount);
    // eslint-disable-next-line no-underscore-dangle
    if (!this.eciesSession._gotEIP8Ack) {
      if (parseData.subarray(0, 1) === Buffer.from('04', 'hex')) {
        this.eciesSession.parseAckPlain(parseData);
      } else {
        // eslint-disable-next-line no-underscore-dangle
        this.eciesSession._gotEIP8Ack = true;
        this.socketNextPacketSize = buffer2int(this.socketData.slice(0, 2)) + 2;
        return;
      }
    } else {
      this.eciesSession.parseAckEIP8(parseData);
    }
    this.state = 'Header';
    this.socketNextPacketSize = 32;
    process.nextTick(() => this.sendHello());
    this.socketData.consume(bytesCount);
  }

  handleHeader() {
    const bytesCount = this.socketNextPacketSize;
    const parseData = this.socketData.slice(0, bytesCount);
    const size = this.eciesSession.parseHeader(parseData);
    if (!size) {
      this.emit('err', new PeerError('invalid header size', ErrorCode.INVALID_HEADER_SIZE));
      this.sendDisconnect(DISCONNECT_REASONS.NETWORK_ERROR);
      return;
    }

    this.state = 'Body';
    this.socketNextPacketSize = size + 16;
    if (size % 16 > 0) this.socketNextPacketSize += 16 - (size % 16);
    this.socketData.consume(bytesCount);
  }

  handleMessage(code: PREFIXES, msg: NestedBufferArray) {
    if (code === PREFIXES.HELLO) this.handleHello(msg);
  }

  sendHello() {
    const payload: HelloMsg = [
      int2buffer(BASE_PROTOCOL_VERSION),
      CLIENT,
      this.capabilities.map((obj) => [Buffer.from(obj.name), int2buffer(obj.version)]),
      Buffer.allocUnsafe(0),
      this.id,
    ];

    if (!this.socket.closed) {
      if (
        !this.sendMessage(
          PREFIXES.HELLO,
          Buffer.from(RLP.encode(bufArrToArr(payload as unknown as Buffer[]))),
        )
      ) {
        this.emit(
          'error',
          new PeerError('Failed to send hello message', ErrorCode.SEND_HELLO_MESSAGE_FAILED),
        );
        this.sendDisconnect(DISCONNECT_REASONS.NETWORK_ERROR);
      }
    }
  }

  sendMessage(code: number, data: Buffer) {
    if (this.socket.closed) return false;
    const msg = Buffer.concat([Buffer.from(RLP.encode(code)), data]);
    const header = this.eciesSession.createHeader(msg.length);
    if (!header || this.socket.destroyed) return false;
    this.socket.write(header);
    const body = this.eciesSession.createBody(msg);
    if (!body || this.socket.destroyed) return false;
    this.socket.write(body);
    return true;
  }

  sendDisconnect(reason: DISCONNECT_REASONS) {
    const data = Buffer.from(RLP.encode(reason));
    if (this.sendMessage(PREFIXES.DISCONNECT, data) !== true) return;
    setTimeout(() => this.socket.end(), 2000);
  }

  getProtocol(code: number): ProtocolDescriptor | undefined {
    if (code < BASE_PROTOCOL_LENGTH) return { protocol: this, offset: 0 };
    return this.protocols.find(
      (obj) => code >= obj.offset && code < obj.offset + (obj?.length ?? 0),
    );
  }

  handleBody() {
    const bytesCount = this.socketNextPacketSize;
    const parseData = this.socketData.slice(0, bytesCount);
    const body = this.eciesSession.parseBody(parseData);
    if (!body) {
      this.emit('err', new PeerError('empty body payload', ErrorCode.EMPTY_BODY_MESSAGE));
      this.sendDisconnect(DISCONNECT_REASONS.NETWORK_ERROR);
      return;
    }
    this.state = 'Header';
    this.socketNextPacketSize = 32;

    // RLP hack
    let code = body[0];
    if (code === 0x80) code = 0;

    if (code !== PREFIXES.HELLO && code !== PREFIXES.DISCONNECT && this.hello === null) {
      this.sendDisconnect(DISCONNECT_REASONS.PROTOCOL_ERROR);
      return;
    }
    // Protocol object referencing either this Peer object or the
    // underlying subprotocol (e.g. `ETH`)
    const protocolObj = this.getProtocol(code);
    if (protocolObj === undefined) {
      this.sendDisconnect(DISCONNECT_REASONS.PROTOCOL_ERROR);
      return;
    }

    const msgCode = code - protocolObj.offset;
    const protocolName = protocolObj.protocol.constructor.name;

    try {
      let payload: Buffer | NestedBufferArray = body.subarray(1);

      // Use snappy uncompression if peer supports DevP2P >=v5
      let compressed = false;
      const origPayload = payload;
      if (
        Boolean(this.hello) &&
        Boolean(this.hello?.protocolVersion) &&
        (this.hello?.protocolVersion ?? 0) >= 5
      ) {
        payload = snappy.uncompress(payload);
        compressed = true;
      }
      if (protocolName === 'Peer') {
        try {
          payload = arrToBufArr(RLP.decode(Uint8Array.from(payload)));
          if (msgCode === PREFIXES.DISCONNECT) {
            const reason = Buffer.isBuffer(payload)
              ? buffer2int(payload)
              : buffer2int((payload[0] as Buffer) ?? Buffer.from([0]));
            this.emit(
              'error',
              new PeerError(
                `remote disconnected: ${DISCONNECT_REASONS[reason]}`,
                ErrorCode.PEER_DISCONNECTED,
              ),
            );
            return;
          }
          this.emit('client', payload[1].toString());
        } catch (error) {
          if (msgCode === PREFIXES.DISCONNECT) {
            if (compressed) {
              payload = arrToBufArr(RLP.decode(Uint8Array.from(origPayload)));
            } else {
              payload = arrToBufArr(
                RLP.decode(Uint8Array.from(snappy.uncompress(payload as Buffer))),
              );
            }
          } else {
            throw error instanceof Error ? error : new Error('unknown error');
          }
        }
      }
      protocolObj.protocol.handleMessage(msgCode, payload);
      if (protocolName !== 'Peer') this.sendDisconnect(DISCONNECT_REASONS.SUBPROTOCOL_ERROR);
    } catch (error) {
      this.emit(
        'error',
        error instanceof Error
          ? wrapError(error, ErrorCode.BODY_PARSE_FAILED)
          : new PeerError('failed to parse body payload', ErrorCode.BODY_PARSE_FAILED),
      );
      this.sendDisconnect(DISCONNECT_REASONS.SUBPROTOCOL_ERROR);
      return;
    }
    this.socketData.consume(bytesCount);
  }

  handleHello(payload: NestedBufferArray) {
    this.hello = {
      protocolVersion: buffer2int(payload[0] as Buffer),
      clientId: payload[1].toString(),
      capabilities: (payload[2] as Buffer[][]).map((item: Buffer[]) => ({
        name: item[0].toString(),
        version: buffer2int(item[1]),
      })) as Capabilities[],
      port: buffer2int(payload[3] as Buffer),
      id: payload[4] as Buffer,
    };

    if (this.remoteId === null) {
      this.remoteId = Buffer.from(this.hello.id);
    } else if (!this.remoteId.equals(this.hello.id)) {
      this.sendDisconnect(DISCONNECT_REASONS.INVALID_IDENTITY);
      return;
    }

    const shared: Record<string, Capabilities> = {};
    this.hello.capabilities.forEach((item) => {
      this.capabilities.forEach((obj) => {
        if (obj.name !== item.name || obj.version !== item.version) return;
        if (Boolean(shared[obj.name]) && shared[obj.name].version > obj.version) return;
        shared[obj.name] = obj;
      });
    });

    let offset = BASE_PROTOCOL_LENGTH;
    this.protocols = Object.keys(shared)
      .map((key) => shared[key])
      .sort((obj1, obj2) => (obj1.name < obj2.name ? -1 : 1))
      .map((obj) => {
        const origOffset = offset;
        offset += obj.length;

        // The send method handed over to the subprotocol object (e.g. an `ETH` instance).
        // The subprotocol is then calling into the lower level method
        // (e.g. `ETH` calling into `Peer.sendMessage()`).
        const sendMethod = (code: number, data: Buffer) => {
          if (code > obj.length) throw new Error('Code out of range');
          this.sendMessage(origOffset + code, data);
        };
        // Dynamically instantiate the subprotocol object
        // from the constructor
        const SubProtocol = obj.constructor;
        const protocol = new SubProtocol(obj.version, this, sendMethod);

        return { protocol, offset: origOffset, length: obj.length };
      });

    if (this.protocols.length === 0) this.sendDisconnect(DISCONNECT_REASONS.USELESS_PEER);
  }
}

export default Peer;
