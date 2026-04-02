# TODOs

- [ ] Cross-browser MediaRecorder format handling — Safari doesn't support webm/opus, Chrome's audio/mp4 produces AAC-in-MP4 with a video track flag that some APIs reject. Current hackathon approach: test format pre-build and use Chrome for demo. Post-hackathon: add proper format detection and transcoding. `2026-04-01`
