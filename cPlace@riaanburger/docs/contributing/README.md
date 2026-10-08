
# Contributing to cPlace

For developers who want to change cPlace or add an arrangement of their own.

- [The Arrangement Contract](the-arrangement-contract.md) explains what an
  arrangement receives, what it returns, and why it is a pure function.
- [Writing an Arrangement](writing-an-arrangement.md) adds one, worked through
  from the function to its page in the chooser.

`tools/check.sh all` type-checks and builds the extension, runs the tests and
reports the lint, and `tools/check.sh docs` checks these documents, compiling
and testing the code the guide shows. A change reaches cPlace as a pull request
to Linux Mint's Spices, as the guide's last section describes.

Translations are welcome the way every spice takes them: a `.po` file for your
language in `files/cPlace@riaanburger/po/`, made from the template there, sent
as a pull request.
