import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let chosenPath = '';

    const platform = process.platform;
    if (platform === 'darwin') {
      // macOS AppleScript folder picker
      const cmd = `osascript -e 'POSIX path of (choose folder with prompt "Select Logos Workspace Folder")'`;
      const { stdout } = await execPromise(cmd);
      chosenPath = stdout.trim();
    } else if (platform === 'win32') {
      // Windows PowerShell folder picker
      const cmd = `powershell -Command "& { Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Logos Workspace Folder'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath } }"`;
      const { stdout } = await execPromise(cmd);
      chosenPath = stdout.trim();
    } else {
      // Linux zenity or kdialog folder picker
      try {
        const { stdout } = await execPromise('zenity --file-selection --directory --title="Select Logos Workspace Folder"');
        chosenPath = stdout.trim();
      } catch {
        try {
          const { stdout } = await execPromise('kdialog --getexistingdirectory');
          chosenPath = stdout.trim();
        } catch {
          return NextResponse.json({ error: 'Folder picker not supported on this platform. Please enter the path manually.' }, { status: 400 });
        }
      }
    }

    if (!chosenPath) {
      return NextResponse.json({ error: 'No folder chosen' }, { status: 400 });
    }

    return NextResponse.json({ path: chosenPath });
  } catch (error: unknown) {
    console.error('[Workspace Picker] Failed to run native folder picker:', error);
    const message = error instanceof Error ? error.message : String(error);
    
    // Check if the user cancelled the dialog (which throws an error in zenity/kdialog/osascript)
    if (message.includes('User canceled') || message.includes('cancelled') || message.includes('Code: -128')) {
      return NextResponse.json({ error: 'Selection cancelled' }, { status: 400 });
    }
    
    return NextResponse.json({ error: 'Failed to run folder picker', details: message }, { status: 500 });
  }
}
