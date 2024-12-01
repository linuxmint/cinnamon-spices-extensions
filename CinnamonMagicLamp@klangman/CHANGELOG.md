# Changelog

## 1.1.0

* Added "random" effect option which will randomly pick between the default and the sine effect for each minimize and unminimize event.
* Added effect options that allows you to use different effects for minimize and unminimize events.
* Changed the configuration "effect duration" and the X/Y tiles options to be a slider control rather than a spin-button control.

## 1.0.3

* Fix an issue that caused some default Cinnamon effect (i.e. Restore and Maximize effects) to be disabled when Magic Lamp effects were enabled.

## 1.0.2

* Removed the need to change the System-Settings->Effect settings to "none" for the Minimize/Unminimize options. This is now accomplished by intercepting a cinnamon API and forcing it to disable the Cinnamon Minimize/Unminimize effects while the MagicLamp extension is enabled.
* Fixed some minor typos in the README.

## 1.0.1

* Initial version committed to cinnamon spices
