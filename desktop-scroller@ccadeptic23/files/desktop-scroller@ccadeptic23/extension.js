// Desktop Scroller.
// Copyright (C) 2011-2012 Chace Clark <ccdevelop23@gmail.com>.
//
// Desktop Scroller is libre software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 3 of the License, or newer.
//
// You should have received a copy of the GNU General Public License along with
// this file. If not, see <http://www.gnu.org/licenses/>.


const Main = imports.ui.main;
const Meta = imports.gi.Meta
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Config = imports.misc.config
const ExtensionSystem = imports.ui.extensionSystem;

let desktopscroller = null;

// Main class for the extension.
function DesktopScroller(metadata, orientation, panel_height, instanceId)
{
	this._init(metadata, orientation, panel_height, instanceId);
}

DesktopScroller.prototype = {

	_init: function(metadata, orientation, panel_height, instanceId)
	{
		this.metadata = metadata;
		this.panel_height = panel_height;
		this.orientation = orientation;
		
		//set defaults for undefined variables in the metadata file
		if(this.metadata.switchPrevIcon === undefined) {this.metadata.switchPrevIcon = "my-go-prev.svg";}
		if(this.metadata.switchNextIcon === undefined) {this.metadata.switchNextIcon = "my-go-next.svg";}
		this.prevIconPath = this.metadata.path + "/" + this.metadata.switchPrevIcon;
		this.nextIconPath = this.metadata.path + "/" + this.metadata.switchNextIcon;
		this.settings = new Settings.ExtensionSettings(this, "desktop-scroller@ccadeptic23");
		this.settings.bindProperty(Settings.BindingDirection.IN, "showDirectionArrow", "showDirectionArrow", this.onSettingsChanged, null);
		this.settings.bindProperty(Settings.BindingDirection.IN, "activationAreaWidth", "activationAreaWidth", this.onSettingsChanged, null);
		this.settings.bindProperty(Settings.BindingDirection.IN, "showActivationAreas", "showActivationAreas", this.onSettingsChanged, null);
		this.settings.bindProperty(Settings.BindingDirection.IN, "useSwitcherExtension", "useSwitcherExtension", this.onSettingsChanged, null);
		this.onSettingsChanged();
	},

	updateSettings: function()
	{
		if (!this.enabled)
			return;
		
		var monitor = Main.layoutManager.primaryMonitor;
		//var porthole = Main.layoutManager.getPorthole(); //why you taking away myapi's :(
		var porthole = {x:0, y:0, width:global.screen_width, height:global.screen_height};
		var yoffset = 20;
		var width = this.activationAreaWidth;
		var height = porthole.height-2*yoffset;
		
		
		var rx = porthole.x + porthole.width - width;
		var ry = porthole.y+yoffset;
		var lx = porthole.x;
		var ly = porthole.y+yoffset;
		
		this.ractor.set_position(rx, ry);
		this.ractor.set_width(width);
		this.ractor.set_height(height);
		
		this.lactor.set_position(lx,ly);
		this.lactor.set_width(width);
		this.lactor.set_height(height);
		
		var opacity = this.showActivationAreas ? 127 : 0;
		this.ractor.opacity = this.lactor.opacity = opacity;
	},

	onSettingsChanged: function()
	{
		this.workspaceSwitcherExt = null;
		this.updateSettings();
	},

	enable: function()
	{
		this.ractor = new St.Button({style_class:'desktopscroller'});
		this.ractor.connect('scroll-event', this.hook.bind(this));
		this.lactor = new St.Button({style_class:'desktopscroller'});
		this.lactor.connect('scroll-event', this.hook.bind(this));
		
		Main.layoutManager.addChrome(this.ractor, {visibleInFullscreen:true});
		Main.layoutManager.addChrome(this.lactor, {visibleInFullscreen:true});
		
		this.enabled = true;
		this.updateSettings()
	},
  
	disable: function()
	{
		Main.layoutManager.removeChrome(this.lactor);
		Main.layoutManager.removeChrome(this.ractor);
		this.lactor.destroy();
		this.ractor.destroy();
	},
  
	hook: function(actor, event)
	{
		var scrollDirection = event.get_scroll_direction();

		if (scrollDirection === Clutter.ScrollDirection.SMOOTH) {
			return Clutter.EVENT_PROPAGATE;
		}

		var direction = scrollDirection == 1 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT;
		this.switch_workspace(direction);
	},

	_updateWorkspaceSwitcherExt: function() {
		// Check if one of the workspace switcher extensions are installed or if the state has changed since we last checked
		if (ExtensionSystem.runningExtensions.indexOf('DesktopCube@yare') > -1 ) {
			if (!this.workspaceSwitcherExt || this.workspaceSwitcherExt !== ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension']) {
				this.workspaceSwitcherExt = ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension'];
			}
		} else if (ExtensionSystem.runningExtensions.indexOf('Flipper@connerdev') > -1) {
			if (!this.workspaceSwitcherExt || this.workspaceSwitcherExt !== ExtensionSystem.extensions['Flipper@connerdev']['5.4']['extension']) {
				this.workspaceSwitcherExt = ExtensionSystem.extensions['Flipper@connerdev']['5.4']['extension'];
			}
		}
		// Make sure the switcher extension has the required API to allow us to change to any arbitrary workspace
		if (this.workspaceSwitcherExt && typeof this.workspaceSwitcherExt.ExtSwitchToWorkspace !== "function") {
			this.workspaceSwitcherExt =  null;
		}
	},

	switch_workspace: function(direction)
	{
		let active = global.screen.get_active_workspace();
		let neighbor = active.get_neighbor(direction);
		
		if (active != neighbor)
		{
			if(this.showDirectionArrow){
				this.showDirection(direction);
			}
			if (this.useSwitcherExtension) {
				this._updateWorkspaceSwitcherExt()
			}
			if (this.workspaceSwitcherExt) {
				this.workspaceSwitcherExt.ExtSwitchToWorkspace(neighbor);
			} else {
				neighbor.activate(global.get_current_time());
			}
		}
	},

	show: function()
	{
		this.actor.show()
	},

	hide: function()
	{
		this.actor.hide()
	},

	hideDirection: function(icon)
	{
		Main.uiGroup.remove_actor(icon);
	},

	showDirection: function(dir)
	{
		try
		{
			let iconFilename = dir == Meta.MotionDirection.RIGHT ? this.nextIconPath : this.prevIconPath;
			let textureCache = St.TextureCache.get_default();
			let directionicontexture = textureCache.load_uri_async("file://" + iconFilename, -1, -1);
			
			let icon = new St.Bin(
				{
					style_class: 'direction-icon', 
					width: 500, 
					height: 500, 
					child: directionicontexture
				} );
			
			let monitor = Main.layoutManager.primaryMonitor;
			let x = Math.floor(monitor.width / 2 - icon.width / 2) + monitor.x;
			let y = Math.floor(monitor.height / 2 - icon.height / 2) + monitor.y;
			icon.set_position(x, y);
			Main.uiGroup.add_actor(icon);
		
			let hideDirection = this.hideDirection;
			Tweener.addTween(
			icon,
			{ opacity: 0,
			time: 0.5,
			transition: 'easeOutQuad',
			onComplete: function() { hideDirection(icon) } });
		}
		catch (e)
		{
			global.logError(e);
		}
	},
}

// Gnome-shell extension API.
function init(metadata) {desktopscroller = new DesktopScroller(metadata);}
function enable() {desktopscroller.enable()}
function disable() {desktopscroller.disable()}

