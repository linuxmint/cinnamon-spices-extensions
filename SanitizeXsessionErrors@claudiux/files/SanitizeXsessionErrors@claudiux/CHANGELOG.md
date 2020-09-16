## v1.0.0~20200916

  * Prevents some very repetitive "Log level 128" messages, such as those starting with **posix_spawn**, from being written to the `~/.xsession-errors` file.
  * Fully configurable. The user can choose in settings which messages to filter.
  * In the settings there is a button to monitor in real time the contents of the `~/.xsession-errors` file.