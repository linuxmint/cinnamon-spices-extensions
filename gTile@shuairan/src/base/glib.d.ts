/**
 * Manual type declarations for GLib in the GJS environment.
 *
 * Supplement missing parts of the standard environment to allow for type-safe
 * usage of GLib timers within Cinnamon.
 */

export {};

declare global {
    namespace imports.gi.GLib {
        /**
         * Sets a function to be called after a specific delay.
         * @param priority - The priority of the timeout (usually GLib.PRIORITY_DEFAULT).
         * @param interval - The time to wait in milliseconds.
         * @param func - The callback function. Return GLib.SOURCE_REMOVE (false)
         * to run only once, or GLib.SOURCE_CONTINUE (true) to repeat.
         * @returns The numeric ID of the event source.
         */
        function timeout_add(
            priority: number,
            interval: number,
            func: () => boolean
        ): number;
    }
}
