# Follow: CouchDB changes notifier for NodeJS

Follow (upper-case *F*) comes from an internal Iris Couch project used in production for over a year.

## Objective

The API must be very simple: notify me every time a change happens in the DB. Also, never fail.

If an error occurs, Follow will internally retry without notifying your code.

Specifically, this should be possible:

1. Begin a changes feed. Get a couple of change callbacks
2. Shut down CouchDB
3. Go home. Have a nice weekend. Come back on Monday.
4. Start CouchDB with a different IP address
5. Make a couple of changes
6. Update DNS so the domain points to the new IP
7. Once DNS propagate, get a couple more change callbacks

## Failure Mode

If CouchDB permanently crashes, these failure options for Follow:

* **Default:** Simply never call back with a change again
* **Optional:** Specify an *inactivity* timeout. If no changes happen by the timeout, Follow will signal an error.

## API

Under review
