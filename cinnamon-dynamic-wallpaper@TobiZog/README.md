# Cinnamon Dynamic Wallpaper

## About the project
Based on a location, this extension calculates the periods of a day and switches the background image of your Cinnamon desktop. The extension offers the choice between a set of included wallpapers or to select a HEIC-file.

### Features
- 8 included image sets
- 9 day periods
- HEIF converter
- Image configuration assistent with simple one-click setup for image choose
- Online location estimation or offline with manual latitude and longitude input
- Offline sun angles estimation

### Tested Cinnamon versions
- 5.4 (Mint 21)
- 5.6 (Mint 21.1)
- 5.8 (Mint 21.2)

### Technology
- Using `JavaScript` for
	- Sun angle estimation
	- Location estimation
	- Change of the desktop wallpapers
- `Python` displays the Image Configurator
- Image Configurator UI was written with `Glade`

## Installation
### From the repo
1. Download the Repository
2. Extract the files
3. Copy the folder `cinnamon-dynamic-wallpaper@TobiZog` to `~/.local/share/cinnamon/extensions/`

### From Built-in Extension Manager
1. Open "Extensions" in Linux Mint or any other distribution with Cinnamon as Desktop Environment
2. Click on "Download"
3. Search and download it

## How to use it
1. Active the Extension via Cinnamon Extension Manager
2. Open the settings
3. Keep `Estimate coordinates via network` active or disable it and insert latitude and longitude in the fields
4. Choose a set of images or disable it and select for every daytime an image manually

## Image Configurator
The Cinnamon Dynamic Wallpaper extension offers an integrated image configuration assistant. Here, you can choose an included image set or import a HEIC-file from your system. You have to choose the images for the time periods after the import.


## Included image sets
The image sets are from https://github.com/adi1090x/dynamic-wallpaper

| Aurora | Beach | Bitday |
| ------ | ----- | ------ |
| ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/aurora/5.jpg) | ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/beach/4.jpg) | ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/bitday/4.jpg) |

| Cliffs | Gradient | Lakeside | 
| -------- | --------- | ------ |
| ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/cliffs/4.jpg) | ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/gradient/4.jpg) | ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/lakeside/4.jpg) |

| Mountains | Sahara |
| --------- | ------ |
| ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/mountains/4.jpg) | ![](files/cinnamon-dynamic-wallpaper@TobiZog/images/included_image_sets/sahara/4.jpg) |