// Constants esbuild writes into the bundle at build time, through its
// define option in tools/build.sh.

/** True in a development build, which registers the development handle,
 * and false in a release build, which leaves the handle out altogether. */
declare const CPLACE_DEVELOPMENT: boolean;
