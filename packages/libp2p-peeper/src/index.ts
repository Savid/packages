import Discovery from './discovery.js';

export default async function* generator(options: ConstructorParameters<typeof Discovery>[0]) {
  const server = new Discovery(options);
  let enrs: { enr?: string; error?: Error }[] = [];
  let resolve: () => void;
  let promise = new Promise<void>((r) => {
    resolve = r;
  });
  server.on('peer', (enr) => {
    enrs.push({ enr });
    resolve();
    promise = new Promise((r) => {
      resolve = r;
    });
  });
  server.on('error', (error) => {
    enrs.push({ error });
    resolve();
    promise = new Promise((r) => {
      resolve = r;
    });
  });
  server.start();
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      await promise;
      yield* enrs;
      enrs = [];
    }
  } finally {
    server.stop();
  }
}
