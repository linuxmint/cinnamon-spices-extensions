/**
 * Loads the ambient Cinnamon typings: the `imports.gi` namespace and the
 * Cinnamon shape of `global`. The side-effect import is what makes their
 * declarations part of the program. Listing the package in tsconfig's
 * "types" would resolve `imports` too, but node's own `global` then wins
 * over Cinnamon's, so this import is the form that works.
 */
import "@ci-types/cjs";
