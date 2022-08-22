import Server from './server.js';

export default async function* generator(options: ConstructorParameters<typeof Server>[0]) {
  const server = new Server(options);
  let enodes: { enode?: string; error?: Error }[] = [];
  let resolve: () => void;
  let promise = new Promise<void>((r) => {
    resolve = r;
  });
  server.on('peer', (enode) => {
    enodes.push({ enode });
    resolve();
    promise = new Promise((r) => {
      resolve = r;
    });
  });
  server.on('error', (error) => {
    enodes.push({ error });
    resolve();
    promise = new Promise((r) => {
      resolve = r;
    });
  });
  await server.start();
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      await promise;
      yield* enodes;
      enodes = [];
    }
  } finally {
    server.stop();
  }
}
