// The changes_couchdb API
//

var feed = require('./feed');

function follow_feed(opts, cb) {
  var ch_feed = new feed.Feed(opts);
  ch_feed.on('error' , function(er) { return cb && cb(er) });
  ch_feed.on('change', function(ch) { return cb && cb(null, ch) });
  ch_feed.follow();
  return ch_feed;
}

module.exports = follow_feed;
module.exports.Feed = feed.Feed;
