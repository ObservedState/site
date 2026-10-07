// CloudFront Function, event type: viewer-request.
//
// Astro builds /writing/foo/ as writing/foo/index.html. When CloudFront fronts the
// S3 REST endpoint (which is what Origin Access Control requires), S3 does not resolve
// directory indexes, so this rewrites the request URI before it reaches the origin.
//
// Written in ES5 so it runs on either CloudFront Functions JavaScript runtime.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.charAt(uri.length - 1) === '/') {
    // /writing/foo/  ->  /writing/foo/index.html
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    // /writing/foo (no file extension)  ->  /writing/foo/index.html
    request.uri = uri + '/index.html';
  }

  return request;
}
