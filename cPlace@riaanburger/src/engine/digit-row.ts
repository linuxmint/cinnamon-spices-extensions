// The digit row by its place on the keyboard. Clutter reports a key by the
// place it sits as well as by what it types, and the row's keys from 1 to 9
// carry the codes 10 to 18 whatever the layout types there. So a layout that
// types & on the 1 key without Shift, as French AZERTY does, still runs
// preset 1 from it, as the keypad already does on every layout.

/** The digit, 1 to 9, the key at this place on the digit row names; zero
 * for any other place, the 0 key's included. */
export function rowDigit(code: number): number {
    const digit = code - 9;
    return digit >= 1 && digit <= 9 ? digit : 0;
}
