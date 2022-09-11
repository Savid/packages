declare module 'snappyjs' {
  export function uncompress(payload: Uint8Array): Buffer;
}

declare module '@chainsafe/snappy-stream' {
  import type { Transform } from 'node:stream';

  export function createCompressStream(): Transform;
}

declare module 'stream-to-it' {
  import type { Transform } from 'node:stream';

  export function source(stream: Transform): Transform;
}
