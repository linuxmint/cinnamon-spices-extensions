# cinTile 
Window-Tiling Extension for Cinnamon 5.x

-----
- [Updates / Fixes](#updates--fixes)
- [Installation](#installation)
- [Usage](#usage)
- [Would You Like To Know More?](#would-you-like-to-know-more)
  - [But... why?](#but-why)
  - [Can I help?](#can-i-help)
  - [Are you actually going to fix reported bugs or otherwise maintain this?](#are-you-actually-going-to-fix-reported-bugs-or-otherwise-maintain-this)



The original gTile extension was developed by [vibou](https://github.com/vibou/vibou.gTile). The original Cinnamon fork was developed by [shuairan](https://github.com/shuairan/gTile). 

However, the Cinnamon fork has been long-since abandoned, and while it works *reasonably* well, it had some issues that I hope to rectify.

The extension is currently under development, and has not hit any stable release just yet. This is my first foray
into Cinnamon extension development, so.... maybe set your expecatations low? (In other words, **use at your own risk- this may crash Cinnamon!**)

# Updates / Fixes

I picked this up to fix one issue I'd noticed specifically: keyboard support for multi-monitor grids, as [somewhat described here](https://github.com/linuxmint/cinnamon-spices-extensions/issues/191). 

It's also been modified such that now, when you open the grid window (via hotkey), it only opens on the active monitor- as opposed to all of them, which I believe may have been<sup>*</sup> the source of some issues.

It's now also possible to switch between grid options via hotkey, using (non-numpad) number keys 1-4!

<sub><sub>* But I'm also wrong, like... *all* the time. For further reference, see my stock portfolio and/or sportsbook.</sub></sub>


# Installation

At the moment, this extension isn't available for download via the Extensions Manager/Cinnamon Spices, mainly because:

* I don't actually know how to do that.
* It hasn't been tested on any machine other than my own, and I'm not entirely sure it works. (see: "Would You Like To Know More?")

Manual installation is as follows.

	git clone https://github.com/tabcodes/cinTile.git

(Or download the project's ZIP archive and extract it.)

Move the resulting folder to the Cinnamon extensions folder:

	mv cinTile ~/.local/share/cinnamon/extensions/cinTile@tabcodes

Once completed, you should see cinTile available in your Extensions window.

# Usage


| Hotkey      | Function    |
| ----------- | ----------- |
|<kbd>Super (Win Key)</kbd>+<kbd>Space</kbd> | Open cinTile Grid menu (configurable via Extension Settings) |
| <kbd>Esc</kbd> | Close cinTile Grid menu       |
| <kbd>Shift</kbd>+<kbd>Arrow Key(s)</kbd> | Select grid tile with keyboard |
| <kbd>Shift</kbd>+<kbd>Arrow Key(s)</kbd> | Select multiple grid tiles/wide grid |
| <kbd>1</kbd>| Switch to grid orientation #1 |
| <kbd>2</kbd>| Switch to grid orientation #2 |
| <kbd>3</kbd>| Switch to grid orientation #3 |
| <kbd>4</kbd>| Switch to grid orientation #4 |


# Would You Like To Know More?


## But... why?

So, by now in 2021, Cinnamon actually has its own window tiling manager that is- for the most part- pretty handy! Unfortunately, its complete lack of configurability made it kind of a non-starter for me and everyone else with a widescreen monitor- tiling one window to half of a 40+" monitor doesn't do much for organization or effective usage of real estate. I started with shuairan's version of gTile that's available in the Cinnamon Spices repository, but some bugs came up, and... here we are.

## Can I help?

Glad you asked! Yes, you can- by testing this and letting me know what works, what's broken, what crashes Cinnamon entirely, etc. If you decide to let me know, do me a favor and include the relevant info from your `.xsession-errors` log as well as your Linux flavor and Cinnamon version.

## Are you actually going to fix reported bugs or otherwise maintain this?

Yes, of course! Well, probably. Maybe. 

The short answer here is that I am a mortal man with a job and a finite amount of time, so expendable development time for this project is limited until I hit the lottery. But I promise I'll try to at least address/respond to any info that comes in! (Maybe. Honestly, who knows.) 


