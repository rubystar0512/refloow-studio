# Windows installer (split)

The full setup EXE is ~123 MB (over GitHub’s 100 MB git file limit), so it is stored in **30 MB parts**.

## Files
- `Refloow-Photo-Studio-Setup-1.1.0.exe.part001` …
- `join-installer.bat` / `join-installer.ps1` — merge parts back into the installer

## Rebuild
Double-click `join-installer.bat`, or run:

```powershell
.\join-installer.ps1
```

That creates `Refloow Photo Studio Setup 1.1.0.exe` in this folder.
