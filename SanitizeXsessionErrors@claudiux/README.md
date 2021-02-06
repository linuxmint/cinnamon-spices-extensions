# Sanitize ~/.xsession-errors

**Please note that this extension is no longer useful since Cinnamon 4.8, because the messages polluting the `~/.xsession-errors` file have been removed upstream.**

The `~/.xsession-errors` file logs all errors that occur in your Linux graphical environment.

This _SanitizeXsessionErrors@claudiux_ Cinnamon extension prevents some very repetitive "Log level 128" messages like these from being written to the `~/.xsession-errors` file:

  * Cinnamon warning: Log level 128: **posix_spawn** avoided (automatic reaping requested) (fd close requested)
  * Cinnamon warning: Log level 128: **posix_spawn** avoided (fd close requested) (child_setup specified)
  * etc (sometimes in the thousands!)

This Cinnamon extension saves your solid-state drive (SSD) and makes the `~/.xsession-errors`file more readable by no longer writing useless "Log level 128" messages you don't want.

Simply indicate in the settings of this extension the list of words or expressions starting the "Log level 128" messages to be deleted. In the example above, it suffices to indicate the word **posix_spawn**.

This extension is preconfigured to filter the "Log level 128" messages beginning with:

  * **posix_spawn**
  * **setenv()/putenv()**
  * **unsetenv()**

_Please note that "Log level 128" messages in `~/.xsession-errors` are only filtered after this extension is started._

_**Technical note:** Using this extension, all "Log level 128" (LEVEL_DEBUG) unfiltered messages have their level changed to LEVEL_WARNING to avoid infinite loop._

## Example

Without this extension, certain "Log level 128" messages pollute the `~/.xsession-errors` file:

[![Without_Sanitize](https://raw.githubusercontent.com/claudiux/docs/master/SanitizeXsessionErrors/Without.png)]

Once this extension is loaded, your `~/.xsession-errors` file is sanitized, more readable, takes less much space:

[![With_Sanitize](https://raw.githubusercontent.com/claudiux/docs/master/SanitizeXsessionErrors/With.png)]

(An SSD only accepts about 10,000 writes in one place. Then, the information is moved to another location on the SSD. So, little by little, your SSD wears out and its capacity decreases.)

## Install

### From Spices Update (recommended)
This method is recommended to be sure to obtain the latest version of this extension.

  1. Install [the Spices Update applet][spicesupdate] on a panel of your Cinnamon desktop.
  2. Select **Extensions** in the menu of Spices Update.
  3. In the just opened window, search this extension with the keyword **Sanitize** and download it.
  4. Go to the _Manage_ tab of the same window, click on this extension then add it to Cinnamon.
  5. Open the settings of this extension and configure it as you want.

### From the Cinnamon settings
Just go to `System Settings > Extensions` then, in the Download tab, run the 3-5 steps above.

Please note that using this method you are not sure that you are getting the latest version of this extension.

### From the Cinnamon Spices website
Go to [the Cinnamon Spices website][spices], download the package and extract the contents into `~/.local/share/cinnamon/extensions`. Then go to `System Settings > Extensions` and run the 4-5 steps above.

Please note that using this method you are not sure that you are getting the latest version of this extension.

## Settings

[![Settings](https://raw.githubusercontent.com/claudiux/docs/master/SanitizeXsessionErrors/Settings.png)]

Indicate in the list the words (or expression) starting a message that you want to filter. (At least 6 characters.) Then, choose whether or not to filter this type of message.

A button allows you to see in real time the contents of your `~/.xsession-errors` file.

## Issues
If you find any bug you can fill an issue using the button at the top of this page.

Make sure you have an updated version of Cinnamon, an updated version of this extension (you can use [the Spices Update applet][spicesupdate] to do that), and try to explain the more detailed you can what the problem is.

Please, do not post issues in the comments.

## Contributing
Contributions and translations are welcome!

## Thank the author

If you think this Cinnamon extension is useful then please take the time to log in with your Github account and click on the star at the top of this page. It really encourages me!

Claudiux ([@claudiux][claudiux])



[claudiux]: https://github.com/claudiux
[rawdoc]: https://github.com/claudiux/docs
[spices]: https://cinnamon-spices.linuxmint.com/extensions
[spicesupdate]: https://cinnamon-spices.linuxmint.com/applets/view/309