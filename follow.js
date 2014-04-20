// The changes_couchdb API
//
// Copyright 2014 Iris Couch
//
//    Licensed under the Apache License, Version 2.0 (the "License");
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.

var Feed = require('./feed');

module.exports = function follow (opts, cb) {
  var feed = new Feed(opts);

  feed.on('error' , function(err) { return cb && cb.call(feed, err) });
  feed.on('change', function(change) { return cb && cb.call(feed, null, change) });

  // Give the caller a chance to hook into any events.
  process.nextTick(function() {
    feed.follow();
  });

  return feed;
}

module.exports.Feed = Feed;
