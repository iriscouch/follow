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

If CouchDB permanently crashes, there is an option of failure modes:

* **Default:** Simply never call back with a change again
* **Optional:** Specify an *inactivity* timeout. If no changes happen by the timeout, Follow will signal an error.

## Very Simple API

The whole point is, I don't care about network or HTTP problems. Just tell me when a change happens.

    var follow_couchdb = require('follow_couchdb');
    follow_couchdb("https://example.iriscouch.com/boogie", function(error, change) {
      if(!error) {
        console.log("Got change number " + change.seq + " for document " + change.id);
      }
    })

The first argument can be an object, which is useful to include the documents in the feed.

    follow_couchdb({db:"https://example.iriscouch.com/boogie", include_docs:true}, function(error, change) {
      if(!error) {
        console.log("Change " + change.seq + " has " + Object.keys(change.doc).length + " fields");
      }
    })

### follow_couchdb(options, callback)

The first argument is an options object. The only required option is `db`. Instead of an object, you can use a string to indicate the ``db` value.

All of the CouchDB _changes options are allowed. See http://guide.couchdb.org/draft/notifications.html.

* `db` | Fully-qualified URL of a couch database. (Basic auth URLs are ok.)
* `since` | The sequence number to start from
* `heartbeat` | Milliseconds within which CouchDB must respond (default: **30000** or 30 seconds)
* `feed` | **Optional but only "continuous" is allowed**
* `filter`
  * **Either** | Path to design document filter, e.g. `app/important`
  * **Or** | A Javascript `function(doc, req) { ... }` which should return true or false

Besides the CouchDB options, more are available:

* `headers` | Object with HTTP headers to add to the request
* `inactivity_ms` | Maximum time to wait between **changes**. Omitting this means no maximum.
