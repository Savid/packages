# @savid/shutdown

Graceful shutdown handling for NodeJS

## Usage

```js
import Shutdown from '@savid/shutdown';

// register to log unhandled/uncaught exceptions
Shutdown.register('unhandled', async (error) => {
  if (error) console.error('unhandled shutdown error', error);
});

// register an async database shutdown handler
Shutdown.register('database', async (error) => {
  // wait for database to gracefully shutdown
  await database.shutdown();
});

// register an async webserver shutdown handler
Shutdown.register('webserver', async (error) => {
  // if an unhandled/uncaught exception happened, it might make sense to ungracefully terminate
  if (error) return;
  // wait for webserver to gracefully shutdown
  await webserver.shutdown();
});

// allow handling errors thrown from registered shutdown handlers for a chance to log the exception
Shutdown.on('error', ({ error, register }) => {
  console.error(`shutdown handler error: ${register}`, error);
});

// deregister an existing registered handler
Shutdown.deregister('database');
```

## License

[MIT](https://opensource.org/licenses/MIT)
