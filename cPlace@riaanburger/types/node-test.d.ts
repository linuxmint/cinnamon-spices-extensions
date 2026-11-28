// Hand-kept declarations for the slice of node's test runner and assertions
// the tests use, so the checked tree needs no @types/node dependency. The
// runtime provides the real modules; node --test is the runner.

declare module "node:test" {
    export function test(
        name: string,
        fn: () => void | Promise<void>,
    ): Promise<void>;
}

declare module "node:assert/strict" {
    export function deepEqual(actual: unknown, expected: unknown): void;
    export function equal(actual: unknown, expected: unknown): void;
    export function ok(value: unknown, message?: string): asserts value;
}
