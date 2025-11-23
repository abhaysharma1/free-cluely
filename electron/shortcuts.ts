import { globalShortcut, app } from "electron"
import { AppState } from "./main" // Adjust the import path if necessary

export class ShortcutsHelper {
  private appState: AppState
  private registeredShortcuts: Map<string, boolean> = new Map()

  constructor(appState: AppState) {
    this.appState = appState
  }

  private registerShortcut(
    accelerator: string, 
    callback: (() => void) | (() => Promise<void>), 
    description: string
  ): boolean {
    try {
      // Check if already registered
      if (globalShortcut.isRegistered(accelerator)) {
        console.warn(`Shortcut ${accelerator} (${description}) is already registered, unregistering first...`)
        globalShortcut.unregister(accelerator)
      }

      // Note: Electron's type definitions incorrectly show register() returning void
      // but it actually returns boolean. Using type assertion to fix this.
      const registered = globalShortcut.register(accelerator, () => {
        // Wrap callback to handle both sync and async
        try {
          const result = callback()
          if (result && typeof result.catch === 'function') {
            result.catch(err => console.error(`Error in shortcut ${accelerator}:`, err))
          }
        } catch (err) {
          console.error(`Error in shortcut ${accelerator}:`, err)
        }
      }) as unknown as boolean
      this.registeredShortcuts.set(accelerator, registered)
      
      if (registered) {
        console.log(`✓ Successfully registered: ${accelerator} (${description})`)
      } else {
        console.error(`✗ Failed to register: ${accelerator} (${description})`)
        console.error(`  → This shortcut may already be in use by another application or the OS`)
      }
      
      return registered
    } catch (error) {
      console.error(`✗ Error registering ${accelerator} (${description}):`, error)
      this.registeredShortcuts.set(accelerator, false)
      return false
    }
  }

  private registerWithFallback(
    primaryAccelerator: string,
    fallbackAccelerators: string[],
    callback: (() => void) | (() => Promise<void>),
    description: string
  ): { success: boolean; accelerator: string | null } {
    // Try primary first
    if (this.registerShortcut(primaryAccelerator, callback, description)) {
      return { success: true, accelerator: primaryAccelerator }
    }

    // Try fallbacks
    console.log(`  → Trying fallback shortcuts for: ${description}`)
    for (const fallback of fallbackAccelerators) {
      if (this.registerShortcut(fallback, callback, `${description} (fallback)`)) {
        console.log(`  ✓ Using fallback: ${fallback}`)
        return { success: true, accelerator: fallback }
      }
    }

    console.error(`  ✗ All shortcuts failed for: ${description}`)
    return { success: false, accelerator: null }
  }

  public registerGlobalShortcuts(): void {
    console.log("=== Starting Global Shortcuts Registration ===")
    console.log("Platform:", process.platform)
    console.log("App ready:", true)
    console.log("")
    
    // Track which shortcuts actually worked
    const workingShortcuts: { [key: string]: string } = {}
    
    // Add global shortcut to show/center window
    const showResult = this.registerWithFallback(
      "CommandOrControl+Shift+Space",
      ["CommandOrControl+Shift+S", "Alt+Shift+Space"],
      () => {
        console.log("Show/Center window shortcut pressed...")
        this.appState.centerAndShowWindow()
      },
      "Show/Center Window"
    )
    if (showResult.success && showResult.accelerator) {
      workingShortcuts["Show/Center Window"] = showResult.accelerator
    }

    const screenshotResult = this.registerWithFallback(
      "CommandOrControl+H",
      ["CommandOrControl+Shift+H", "Alt+Shift+H"],
      async () => {
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow) {
          console.log("Taking screenshot...")
          try {
            const screenshotPath = await this.appState.takeScreenshot()
            const preview = await this.appState.getImagePreview(screenshotPath)
            mainWindow.webContents.send("screenshot-taken", {
              path: screenshotPath,
              preview
            })
          } catch (error) {
            console.error("Error capturing screenshot:", error)
          }
        }
      },
      "Take Screenshot"
    )
    if (screenshotResult.success && screenshotResult.accelerator) {
      workingShortcuts["Take Screenshot"] = screenshotResult.accelerator
    }

    const processResult = this.registerWithFallback(
      "CommandOrControl+Enter",
      ["CommandOrControl+Shift+Enter", "Alt+Shift+Enter"],
      async () => {
        console.log("Process screenshots shortcut pressed...")
        await this.appState.processingHelper.processScreenshots()
      },
      "Process Screenshots"
    )
    if (processResult.success && processResult.accelerator) {
      workingShortcuts["Process Screenshots"] = processResult.accelerator
    }

    const resetResult = this.registerWithFallback(
      "CommandOrControl+R",
      ["CommandOrControl+Shift+R", "Alt+Shift+R"],
      () => {
        console.log("Command + R pressed. Canceling requests and resetting queues...")

        // Cancel ongoing API requests
        this.appState.processingHelper.cancelOngoingRequests()

        // Clear both screenshot queues
        this.appState.clearQueues()

        console.log("Cleared queues.")

        // Update the view state to 'queue'
        this.appState.setView("queue")

        // Notify renderer process to switch view to 'queue'
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("reset-view")
        }
      },
      "Reset Queues"
    )
    if (resetResult.success && resetResult.accelerator) {
      workingShortcuts["Reset Queues"] = resetResult.accelerator
    }

    // New shortcuts for moving the window
    this.registerShortcut(
      "Alt+CommandOrControl+Left",
      () => {
        console.log("Alt+Ctrl + Left pressed. Moving window left.")
        this.appState.moveWindowLeft()
      },
      "Move Window Left"
    )

    this.registerShortcut(
      "Alt+CommandOrControl+Right",
      () => {
        console.log("Alt+Ctrl + Right pressed. Moving window right.")
        this.appState.moveWindowRight()
      },
      "Move Window Right"
    )

    this.registerShortcut(
      "Alt+CommandOrControl+Down",
      () => {
        console.log("Alt+Ctrl + down pressed. Moving window down.")
        this.appState.moveWindowDown()
      },
      "Move Window Down"
    )

    this.registerShortcut(
      "Alt+CommandOrControl+Up",
      () => {
        console.log("Alt+Ctrl + Up pressed. Moving window Up.")
        this.appState.moveWindowUp()
      },
      "Move Window Up"
    )

    // Shortcuts for MCQ and Coding modes
    this.registerShortcut(
      "CommandOrControl+Shift+M",
      async () => {
        console.log("MCQ Mode shortcut pressed")
        await this.appState.processingHelper.processMcq()
      },
      "MCQ Mode"
    )

    this.registerShortcut(
      "CommandOrControl+Shift+C",
      async () => {
        console.log("Coding Mode shortcut pressed")
        await this.appState.processingHelper.processCoding()
      },
      "Coding Mode"
    )

    // Chat shortcut
    this.registerShortcut(
      "Alt+Shift+L",
      () => {
        console.log("Chat shortcut pressed")
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send("toggle-chat")
        }
      },
      "Toggle Chat"
    )

    const toggleResult = this.registerWithFallback(
      "CommandOrControl+B",
      ["CommandOrControl+Shift+B", "Alt+Shift+B", "CommandOrControl+T"],
      () => {
        console.log("Toggle Window shortcut pressed")
        this.appState.toggleMainWindow()
        // If window exists and we're showing it, bring it to front
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow && !this.appState.isVisible()) {
          // Force the window to the front on macOS
          if (process.platform === "darwin") {
            mainWindow.setAlwaysOnTop(true, "normal")
            // Reset alwaysOnTop after a brief delay
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setAlwaysOnTop(true, "floating")
              }
            }, 100)
          }
        }
      },
      "Toggle Window"
    )
    if (toggleResult.success && toggleResult.accelerator) {
      workingShortcuts["Toggle Window"] = toggleResult.accelerator
    }

    // Print summary
    console.log("")
    console.log("=== Shortcuts Registration Summary ===")
    let successCount = 0
    let failCount = 0
    
    this.registeredShortcuts.forEach((success, accelerator) => {
      if (success) {
        successCount++
      } else {
        failCount++
        console.error(`FAILED: ${accelerator}`)
      }
    })
    
    console.log(`Total: ${this.registeredShortcuts.size} shortcuts`)
    console.log(`Success: ${successCount}`)
    console.log(`Failed: ${failCount}`)
    console.log("")
    
    // Show working shortcuts
    if (Object.keys(workingShortcuts).length > 0) {
      console.log("=== WORKING SHORTCUTS ===")
      Object.entries(workingShortcuts).forEach(([action, shortcut]) => {
        console.log(`  ${action}: ${shortcut}`)
      })
    } else {
      console.error("⚠️  WARNING: No shortcuts were successfully registered!")
      console.error("This usually means:")
      console.error("  1. Another application is using these shortcuts")
      console.error("  2. The OS has reserved these key combinations")
      console.error("  3. Try closing other applications and restarting")
    }
    console.log("======================================")

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      console.log("Unregistering all shortcuts...")
      globalShortcut.unregisterAll()
    })
  }

  public verifyShortcuts(): void {
    console.log("=== Verifying Shortcuts ===")
    this.registeredShortcuts.forEach((registered, accelerator) => {
      const isActuallyRegistered = globalShortcut.isRegistered(accelerator)
      console.log(`${accelerator}: Expected=${registered}, Actual=${isActuallyRegistered}`)
    })
  }
}
