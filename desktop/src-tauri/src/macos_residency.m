#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>
#import <objc/runtime.h>

// AppKit sends Dock Quit directly to its delegate, outside Tauri's close-window event.
static NSApplicationTerminateReply handleQuit(id delegate, SEL selector, NSApplication *app) {
    (void)delegate;
    (void)selector;
    NSAppleEventDescriptor *event = NSAppleEventManager.sharedAppleEventManager.currentAppleEvent;
    if ([event attributeDescriptorForKeyword:kAEQuitReason] ||
        [event paramDescriptorForKeyword:kAEQuitReason]) {
        return NSTerminateNow; // Allow logout, shutdown and restart.
    }
    for (NSWindow *window in app.windows) {
        if (window.canBecomeMainWindow) [window orderOut:nil];
    }
    [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
    return NSTerminateCancel;
}

bool install_troy_quit_handler(void) {
    id delegate = NSApp.delegate;
    if (!delegate) return false;
    return class_addMethod([delegate class], @selector(applicationShouldTerminate:),
                           (IMP)handleQuit, "Q@:@");
}
