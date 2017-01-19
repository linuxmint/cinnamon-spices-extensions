const Lang = imports.lang;
const St = imports.gi.St;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const AppletManager = imports.ui.appletManager;
const Layout = imports.ui.layout;
const Mainloop = imports.mainloop;
const Gettext = imports.gettext.domain('cinnamon-applets');
const _ = Gettext.gettext;

/*
 * Container for old attributes and functions for later restore 
 */
let old = {
	main:{},
	layoutmanager:{},
	appletmanager:{},
	applet:{}
};

/**
 * called when extension is loaded
 */
function init(extensionMeta) {
  //extensionMeta holds your metadata.json info
  const UUID = extensionMeta['uuid'];
}

/**
 * called when extension is loaded
 */
function enable() {
	global.log("enabling morePanels");
	patchLayoutManager();
  patchMain();
	patchAppletManager();

	Main.patchedStart();
	Main.enablePanels();

	AppletManager.onEnabledAppletsChanged();
  Main.layoutManager._monitorsChanged();
	Main.layoutManager._windowsRestacked();
	Main.layoutManager._processPanelSettings(); 
}

/**
 * called when extension gets disabled
 */
function disable() {
	unpatchLayoutManager();
	unpatchMain();	
	unpatchAppletManager();
  Main.layoutManager._monitorsChanged();
	Main.layoutManager._windowsRestacked();
	Main.layoutManager._processPanelSettings(); 
}

function unpatchMain(){
	Main.disablePanels();
	Main.panelManager.removePanels();
	delete Main.LAYOUT_FREE;
  Main.panel  = old.main.panel;
  Main.panel2 = old.main.panel2;
  delete Main.panelManager;
  Main.enablePanels = old.main.enablePanels;
  Main.disablePanels = old.main.disablePanels;
  Main.getPanels = old.main.getPanels;
  delete Main.patchedStart;
	Main.enablePanels();
}

function patchMain(){
  Main.LAYOUT_FREE = "free";
	Main.disablePanels();
	old.main.panel = Main.panel;
	delete Main.panel;
	old.main.panel2 = Main.panel2;
	delete Main.panel2;

	Main.panelManager = new PanelManager();

	old.main.enablePanels = Main.enablePanels;
	Main.enablePanels = function(){
		this.panelManager.enablePanels();
	}
	old.main.disablePanels = Main.disablePanels;
	Main.disablePanels = function(){
		this.panelManager.disablePanels();
	}
	old.main.getPanels = Main.getPanels;
  Main.getPanels = function(){
    return this.panelManager.getPanels();
	}
	Main.patchedStart = function(){
		this.panelManager._onSettingsChanged();
		/*desktop_layout = global.settings.get_string("desktop-layout");
	  if (desktop_layout == Main.LAYOUT_TRADITIONAL) {
			this.panelManager.addPanel(this.layoutManager.primaryIndex, 'bottom');
    }
    else if (desktop_layout == Main.LAYOUT_FLIPPED) {
			this.panelManager.addPanel(this.layoutManager.primaryIndex, 'top');
    }
    else if (desktop_layout == Main.LAYOUT_FREE) {
			this.panelManager.addPanel(this.layoutManager.primaryIndex, 'top');
		}
    else {
      desktop_layout == Main.LAYOUT_CLASSIC;
			this.panelManager.addPanel(this.layoutManager.primaryIndex, 'top');
			this.panelManager.addPanel(this.layoutManager.primaryIndex, 'bottom');
    }
    this.layoutManager._updateBoxes();
		this.layoutManager._updatePanelBarriers();
		*/
	} 
}
function unpatchAppletManager(){
  AppletManager.getAppletDefinition  = old.appletmanager.getAppletDefinition;
	AppletManager.saveAppletsPositions = old.appletmanager.saveAppletsPositions; 
	AppletManager.onEnabledAppletsChanged();
}

function patchAppletManager(){
	let am = AppletManager;

/*************************************************************************************************** overwrite AppletManager.getAppletDefinition */
	old.appletmanager.getAppletDefinition = am.getAppletDefinition;
	am.getAppletDefinition = function(definition) {
		global.log(definition);
    let elements = definition.split(":");
    if (elements.length > 4) {
				let panelid = elements[0];
				if (elements[0] == "panel1"){
					panelid = 0;
				}
				else if (elements[0] == "panel2"){
					panelid = 1;
				}
				if (!Main.panelManager.panels[panelid]){
					panelid = 0;
				}
				let panel = Main.panelManager.panels[panelid].panel;
        let orientation = panel.bottomPosition ? St.Side.BOTTOM : St.Side.TOP;
        let order;
        try { order = parseInt(elements[2]); } catch(e) { order = 0; }
        
        let location = panel._leftBox;
        let center = elements[1] == "center";
        if (center)
            location = panel._centerBox;
        else if (elements[1] == "right")
            location = panel._rightBox;
        
        return {
            panel: panel,
            orientation: orientation,
            location: location,
            center: center,
            order: order,
            uuid: elements[3],
            applet_id: elements[4]
        };
    }
    global.logError("Bad applet definition: " + definition);
    return null;
	}
/*************************************************************************************************** overwrite AppletManager.saveAppletsPositions */
	old.appletmanager.saveAppletsPositions = am.saveAppletsPositions;
  am.saveAppletsPositions = function() {
		global.log("saveAppletsPositions");
		let panels = Main.panelManager.getPanels();
    let zones_strings = ["left", "center", "right"];
    let allApplets = new Array();
    for (var i in panels){
        let panel = panels[i];
				global.log(panel);
        if (!panel) continue;
        for (var j in zones_strings){
            let zone_string = zones_strings[j];
            let zone = panel["_"+zone_string+"Box"];
            let children = zone.get_children();
            for (var k in children) if (children[k]._applet) allApplets.push(children[k]._applet);
        }
    }
    let applets = new Array();
    for (var i in panels){
        let panel = panels[i];
        if (!panel) continue;
        let panel_string;
				panel_string = i;
        for (var j in zones_strings){
            let zone_string = zones_strings[j];
            let zone = panel["_"+zone_string+"Box"];
            for (var k in allApplets){
                let applet = allApplets[k];
                let appletZone;
                if (applet._newPanelLocation != null) appletZone = applet._newPanelLocation;
                else appletZone = applet._panelLocation;
                let appletOrder;
                if (applet._newOrder != null) appletOrder = applet._newOrder;
                else appletOrder = applet._order;

                if (appletZone == zone) applets.push(panel_string+":"+zone_string+":"+appletOrder+":"+applet._uuid+":"+applet.instance_id);
            }
        }
    }
    for (var i in allApplets){
        allApplets[i]._newPanelLocation = null;
        allApplets[i]._newOrder = null;
    }
    global.settings.set_strv('enabled-applets', applets);
	}
}
function unpatchLayoutManager(){
	Main.layoutManager._leftPanelBarrier    = old.layoutmanager._leftPanelBarrier;
	Main.layoutManager._rightPanelBarrier   = old.layoutmanager._rightPanelBarrier;
	Main.layoutManager._leftPanelBarrier2   = old.layoutmanager._leftPanelBarrier2;
	Main.layoutManager._rightPanelBarrier2  = old.layoutmanager._rightPanelBarrier2;
	Main.layoutManager.panelBox             = old.layoutmanager.panelBox;
	Main.layoutManager.panelBox2            = old.layoutmanager.panelBox2;
	Main.layoutManager._updateBoxes         = old.layoutmanager._updateBoxes;
	Main.layoutManager._updatePanelBarriers = old.layoutmanager._updatePanelBarriers;
	Main.layoutManager._processPanelSettings= old.layoutmanager._processPanelSettings;
	Main.layoutManager._startupAnimation    = old.layoutmanager._startupAnimation;
	Main.layoutManager.addChrome(Main.layoutManager.panelBox, { addToWindowgroup: false });
  Main.layoutManager.addChrome(Main.layoutManager.panelBox2, { addToWindowgroup: false });
}

function patchLayoutManager(){
	
	let lm = Main.layoutManager;
	old.layoutmanager._leftPanelBarrier = lm._leftPanelBarrier;
	delete lm._leftPanelBarrier;
	old.layoutmanager._rightPanelBarrier = lm._rightPanelBarrier;
	delete lm._rightPanelBarrier;
	old.layoutmanager._leftPanelBarrier2 = lm._leftPanelBarrier2;
	delete lm._leftPanelBarrier2;
	old.layoutmanager._rightPanelBarrier2 = lm._rightPanelBarrier2;
	delete lm._rightPanelBarrier2;
	old.layoutmanager.panelBox = lm.panelBox;
  lm.removeChrome(lm.panelBox);
	delete lm.panelBox;
	old.layoutmanager.panelBox2 = lm.panelBox2;
  lm.removeChrome(lm.panelBox2);
	delete lm.panelBox2;

  lm.panelManager = Main.panelManager;

/*************************************************************************************************** overwrite LayoutManager._updateBoxes */
	old.layoutmanager._updateBoxes = lm._updateBoxes;
	lm._updateBoxes = function(){
    this._updateHotCorners();

    let getPanelHeight = function(panel) {
      let panelHeight = 0;
      if (panel) {
        panelHeight = panel.actor.get_height();
      }
      return panelHeight;
    };
		
		for (let i = 0; i < Main.panelManager.panels.length; i++){
			let pc = Main.panelManager.panels[i];
    	let pHeight = getPanelHeight(pc.panel);
			let monitor = this.monitors[pc.monitor];
			if (pc.position = 'bottom'){
      	pc.box.set_size(monitor.width, pHeight);
      	pc.box.set_position(monitor.x, monitor.y + monitor.height - pHeight);
			}else{
      	pc.box.set_size(monitor.width, pHeight);
        pc.box.set_position(monitor.x, monitor.y);
			}	
		}
    this.keyboardBox.set_position(this.bottomMonitor.x,
                                  this.bottomMonitor.y + this.bottomMonitor.height);
    this.keyboardBox.set_size(this.bottomMonitor.width, -1);
    this._chrome._queueUpdateRegions();
	}

/*************************************************************************************************** overwrite LayoutManager._updatePanelBarriers */
	old.layoutmanager._updatePanelBarriers = lm._updatePanelBarriers;
	lm._updatePanelBarriers = function(panelBox){
    /* start: I dont like barriers */
		if (leftPanelBarrier)
      global.destroy_pointer_barrier(leftPanelBarrier);
    if (rightPanelBarrier)
      global.destroy_pointer_barrier(rightPanelBarrier);
		return;
	  /* end: I dont like barriers */
		let leftPanelBarrier;
    let rightPanelBarrier;

		let pc = Main.PanelManager.getContainerFromBox(panelBox);
		
		leftPanelBarrier = pc.barrier[0];
		rightPanelBarrier = pc.barrier[1];

    if (leftPanelBarrier)
      global.destroy_pointer_barrier(leftPanelBarrier);
    if (rightPanelBarrier)
      global.destroy_pointer_barrier(rightPanelBarrier);
    if (panelBox.height) {                        
      if ((Main.desktop_layout == Main.LAYOUT_TRADITIONAL && panelBox==pc.box) || (Main.desktop_layout == Main.LAYOUT_CLASSIC && panelBox==pc.box)) {
        let monitor = this.monitors[pc.monitor];
        leftPanelBarrier = global.create_pointer_barrier(monitor.x, monitor.y + monitor.height - panelBox.height,
                                                         monitor.x, monitor.y + monitor.height,
                                                         1 /* BarrierPositiveX */);
        rightPanelBarrier = global.create_pointer_barrier(monitor.x + monitor.width, monitor.y + monitor.height - panelBox.height,
                                                          monitor.x + monitor.width, monitor.y + monitor.height,
                                                          4 /* BarrierNegativeX */);
      }
      else {
        let primary = this.monitors[pc.monitor];
        leftPanelBarrier = global.create_pointer_barrier(primary.x, primary.y,
                                                         primary.x, primary.y + panelBox.height,
                                                         1 /* BarrierPositiveX */);
        rightPanelBarrier = global.create_pointer_barrier(primary.x + primary.width, primary.y,
                                                          primary.x + primary.width, primary.y + panelBox.height,
                                                          4 /* BarrierNegativeX */);
      }
    } else {
      leftPanelBarrier = 0;
      rightPanelBarrier = 0;
    }
		pc.barrier[0] = leftPanelBarrier;
    pc.barrier[1] = rightPanelBarrier;
	}
	old.layoutmanager._processPanelSettings = lm._processPanelSettings;
  lm._processPanelSettings = function() {
        if (this._processPanelSettingsTimeout) {
            Mainloop.source_remove(this._processPanelSettingsTimeout);
        }
        // delay this action somewhat, to let others do their thing before us
        this._processPanelSettingsTimeout = Mainloop.timeout_add(0, Lang.bind(this, function() {
            this._processPanelSettingsTimeout = 0;
            this._updateBoxes();
						for (var i = 0; i < Main.panelManager.panels.length; i ++){
							let pc = Main.panelManager.panels[i];
            	this._chrome.modifyActorParams(pc.box, { affectsStruts: pc.panel && !pc.panel.isHideable() });
						} 
        }));
    },

/*************************************************************************************************** overwrite LayoutManager._startupAnimation */
/* doesn't work at the moment */
	old.layoutmanager._startupAnimation = lm._startupAnimation;
	lm._startupAnimation = function(){
    this._chrome.freezeUpdateRegions();
    let params = { anchor_y: 0,
                   time: Main.LayoutManager.STARTUP_ANIMATION_TIME,
                   transition: 'easeOutQuad',
                   onComplete: this._startupAnimationComplete,
                   onCompleteScope: this
                 };
        
		for(var i=0;i < Main.panelManager.panels.length ; i++){
			let pc = Main.panelManager.panels[i];
			pc.box.anchor_y = (pc.location=='bottom')? -(pc.box.height) : pc.box.height;	
    	Tweener.addTween(pc.box, params);
		}
	}
}
/********************************************************************************************************************************************************* PANELMANAGER **/
const MAX_MONITORS = 6;
function PanelManager(){
	this._init.apply(this, arguments);
}

PanelManager.prototype = {
	_init: function(){
		this.panels = [];		
		this.sp = new Settings.ExtensionSettings(this, "morePanels@fastr.de");
		this.sp.connect("settings-changed", Lang.bind(this, this._onSettingsChanged));
	},
  _onSettingsChanged: function(){
		this.removePanels();
		this.panels = [];
		let lmMonitors = Main.layoutManager.monitors.length;
		let nMonitors = (MAX_MONITORS < lmMonitors)? MAX_MONITORS : lmMonitors; 
		global.log("Monitors: "+ nMonitors);
		for(let i=0;i < nMonitors; i++){

			if (this.sp.getValue(i+":1")){
				this.addPanel(i, 'top');
			}
			if (this.sp.getValue(i+":2")){
				this.addPanel(i, 'bottom');
			}
		}
		global.log("changed something");
		AppletManager.onEnabledAppletsChanged();
	  Main.layoutManager._processPanelSettings(); 
	},
/*************************************************************************************************** adds a Panel to the 'monitor' at the given 'position' */
/* monitor: Index of Monitor in layoutManager.monitors */
/* position: 'bottom' or 'top' */
	addPanel:  function(monitor, position){
		let isPrimaryPanel = (this.panels.length==0)? true : false;
		let bottom         = (position == 'bottom')? true: false;

	 	let p = {
			panel: new Panel.Panel(bottom, isPrimaryPanel),
			box: new St.BoxLayout({ name: 'panelBox', vertical: true }),
			barrier: [0,0],
      monitor: monitor,
      position: position
		};		
  	let panelHeight = p.box.get_height();
    Main.layoutManager.addChrome(p.box, { addToWindowgroup: false });
    //p.box.connect('allocation-changed', Lang.bind(Main.layoutManager, Main.layoutManager._updatePanelBarriers));
		p.panel.actor.add_style_class_name('panel-' + position);
		p.box.add(p.panel.actor);
		p.panel.enable();
    p.box.add_style_class_name('panel-' + position);
    p.box.set_size(Main.layoutManager.monitors[p.monitor].width, panelHeight);
    p.box.set_position(Main.layoutManager.monitors[p.monitor].x, Main.layoutManager.monitors[p.monitor].y + Main.layoutManager.monitors[p.monitor].height - panelHeight);
		this.panels.push(p);
	},
/*************************************************************************************************** removes the box from the layoutManagers Chrome */ 
	removePanel: function(pc){
		Main.layoutManager.removeChrome(pc.box);
	},
/*************************************************************************************************** removes all (panel-)box */ 
	removePanels: function(){
		for (let i = 0; i < this.panels.length; i++){
			let pc = this.panels[i];
			this.removePanel(pc);
		}
	},
/*************************************************************************************************** enables the panels */
	enablePanels: function(){
		for (let i = 0; i < this.panels.length; i++){
			let panel = this.panels[i].panel;
			if (panel) panel.enable();
		}
	},
/*************************************************************************************************** disables the panels */
	disablePanels: function(){
		for (let i = 0; i < this.panels.length; i++){
			let panel = this.panels[i].panel;
			if (panel) panel.disable();
		}
	},
/*************************************************************************************************** returns an array of panels */
  getPanels: function(){
		let panels = [];
		for (let i = 0; i < this.panels.length; i++){
			let panel = this.panels[i].panel;
			panels.push(panel);
		}
    return panels;
	},
/*************************************************************************************************** returns the "panelContainer" of a given panelBox */
	getContainerFromBox: function(panelBox){
		for (let i = 0; i < this.panels.length; i++){
			let box = this.panels[i].box;
			if (box == panelBox)
				return this.panels[i];	
		}
		return null;
	}
}
