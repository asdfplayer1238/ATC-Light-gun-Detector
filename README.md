# Signal | Flight Deck

A small, dependency-free browser app for identifying U.S. airport control-tower light-gun signals.

## Use

Open `index.html` in a modern browser to use the manual signal lookup and quick-reference table. Choose whether the aircraft is in flight or on the ground, then select the observed light.

For live identification, serve this folder over HTTPS or on `localhost`, open the app in a browser with camera support, and select **Live camera**. For example, run `python -m http.server 8000` from this folder and visit `http://localhost:8000`. Allow camera access and keep the tower light visible anywhere in the frame; the app scans the full camera image rather than just the center. It detects red, green, and white light regions and checks whether they are steady, flashing, or alternating red and green. Camera video is analyzed locally in the browser and is not uploaded.

No build step or package installation is required.

## Important

This is an educational training aid, not an approved aviation reference or substitute for ATC instructions. Camera recognition can be affected by glare, distance, color distortion, and other lights. Always verify signals and use current FAA publications and procedures.

Signal meanings are summarized from the FAA Aeronautical Information Manual, **ATC Light Gun Signals**.
