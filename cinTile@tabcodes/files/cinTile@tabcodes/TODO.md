TODO and Known Issues
---------------------
(also checkout the [issues on github project page](https://github.com/shuairan/gTile/issues)

* Preview has a different ratio than the actual screen -> improve that! <br />
        -> also take care of multimonitor environments! 

* multimonitor support: test it

* Test compatibility with other extensions:
    + [CinnaDock](http://cinnamon-spices.linuxmint.com/extensions/view/6)
    + [2 Bottom Panels](http://cinnamon-spices.linuxmint.com/extensions/view/9)
    + [Panel-Span](http://cinnamon-spices.linuxmint.com/extensions/view/20)

* Test compatibility with cinnamon 2.2 (High-Res mode!)

FIXED ISSUES:
-------------

* there seems to be a small offset to the left <br />
        -> maybe a hardcoded default border size which differs in gnome-shell and cinnamon? 

* position of panel is not determined correctly (its assumed to be top) <br />
        -> Main.panel.bottomPosition = true/false

* If two panels are used one will be overlapped. <br />
        -> Main.panel2 // if there are two panels enabled
