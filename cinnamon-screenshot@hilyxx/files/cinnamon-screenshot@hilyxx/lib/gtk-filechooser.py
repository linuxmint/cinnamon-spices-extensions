#!/usr/bin/env python3
"""
GtkFileChooserDialog in SAVE mode.
(filename entry field disabled)
"""

import sys
import os
import argparse
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gio, GLib

def disable_filename_entry(dialog):
    try:
        def find_entry_widget(widget):
            if isinstance(widget, Gtk.Entry):
                widget.set_sensitive(False)
                widget.set_editable(False)
                return True
            elif isinstance(widget, Gtk.Container):
                for child in widget.get_children():
                    if find_entry_widget(child):
                        return True
            return False
        
        find_entry_widget(dialog)
        
    except Exception as e:
        print(f"Warning: Unable to disable filename entry: {e}", file=sys.stderr)

def create_file_chooser(title="Save As...", 
                       initial_filename=None,
                       initial_directory=None,
                       file_filter=None,
                       save_button_text="Save",
                       cancel_button_text="Cancel"):
    
    dialog = Gtk.FileChooserDialog(
        title=title,
        action=Gtk.FileChooserAction.SAVE,
        transient_for=None,
        modal=True
    )
    
    dialog.add_button(cancel_button_text, Gtk.ResponseType.CANCEL)
    dialog.add_button(save_button_text, Gtk.ResponseType.ACCEPT)
    
    if initial_directory:
        if os.path.exists(initial_directory):
            dialog.set_current_folder(initial_directory)
    
    if initial_filename:
        dialog.set_current_name(initial_filename)
    
    # Add image filter if specified
    if file_filter:
        file_filter_obj = Gtk.FileFilter()
        file_filter_obj.set_name(file_filter)
        file_filter_obj.add_pattern("*.png")
        file_filter_obj.add_pattern("*.jpg")
        file_filter_obj.add_pattern("*.jpeg")
        file_filter_obj.add_pattern("*.bmp")
        file_filter_obj.add_pattern("*.tiff")
        dialog.add_filter(file_filter_obj)
    
    # Disable preview
    dialog.set_use_preview_label(False)
    
    # Disable filename entry field
    disable_filename_entry(dialog)
    
    response = dialog.run()
    
    filename = None
    if response == Gtk.ResponseType.ACCEPT:
        filename = dialog.get_filename()
    
    dialog.destroy()
    return filename

def main():
    parser = argparse.ArgumentParser(description="GTK file chooser with disabled filename entry field")
    parser.add_argument("--title", default="Save As...", 
                       help="Dialog title")
    parser.add_argument("--filename", help="Initial filename")
    parser.add_argument("--directory", help="Initial directory")
    parser.add_argument("--filter", help="File filter")
    parser.add_argument("--save-button", default="Save", help="Save button text")
    parser.add_argument("--cancel-button", default="Cancel", help="Cancel button text")
    
    args = parser.parse_args()
    
    try:
        Gtk.init()
        
        # Create and show the dialog
        result = create_file_chooser(
            title=args.title,
            initial_filename=args.filename,
            initial_directory=args.directory,
            file_filter=args.filter,
            save_button_text=args.save_button,
            cancel_button_text=args.cancel_button
        )
        
        if result:
            print(result)
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main() 
