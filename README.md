# Couch changes follower in NodeJS

This comes from an internal Iris Couch project used in production for over a year.

## Objective

We want an API that is very simple: notify me every time a change happens in the DB. Errors should (generally) be hidden, simply retrying from couch to continue the feed.

Specifically, this should be possible:

1. Begin a changes feed. Get a couple of change callbacks
2. Shut down CouchDB
3. Go home. Have a nice weekend. Come back on Monday.
4. Start CouchDB with a different IP address
5. Make a couple of changes
6. Update DNS so the domain points to the new IP
7. Once DNS propogates, get a couple more change callbacks

## API

Under review
