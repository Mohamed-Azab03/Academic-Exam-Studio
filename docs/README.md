# GitHub Pages demonstration

This folder contains a fully static demonstration. It can run on GitHub Pages from the **main /docs** folder after the repository is public and Pages is enabled.

**Test credentials:** any Student ID containing letters, digits, underscores or hyphens and exam code `DEMO2026`.

**Customize:** edit `config.js` to change the title, exam code, duration, UTC opening/closing schedule and MCQ questions.

**Not secure for a real graded exam:** GitHub Pages exposes JavaScript source including access code and correct answers. Identity verification, deadlines, grading, localStorage and result files can be manipulated by a student. The result is downloaded to the student's device, not saved to this GitHub repository. Use a server-side exam platform for important assessments.

To publish, set the repo public (your plan's requirement) under Settings → General → Danger Zone, then Settings → Pages → Deploy from branch → main → /docs → Save. **Review the entire repository before making it public**, including prior backend files, configs and commit history. A public Pages site is viewable by anyone.

To disable, Settings → Pages → unpublish / remove publishing source, or archive/delete the site as appropriate.
