# Notice

Palette Engine's own code and documentation are released under the [MIT license](LICENSE), © 2026 Kwade Joslin
(https://kwadejoslin.com). Keep the copyright line and license text when you copy or adapt it.

## Not covered by that license

- **The print lookup tables (`data/lut_*.json`).** They are derived from six ICC profiles; each has its own owner and terms.
  - *GRACoL 2013 coated (CRPC6), GRACoL 2013 uncoated (CRPC3), SWOP 2013 (CRPC5)*, PRINTING United Alliance (IDEAlliance). **Permission given** in writing
    on 2026-10-01 to use the lookup tables and the profiles in this tool, provided their notice is included (TO-CONFIRM C5, closed). The notice text is below
    and in the page footer. The tables for these three may be treated as MIT-licensed, with that notice kept.
  - *PSO Coated v3 (FOGRA51), PSO Uncoated v3 (FOGRA52)*, ECI European Color Initiative. The profiles may be "used, embedded and exchanged without restriction" but
    "may not be distributed, sold or altered without written permission of ECI". **Answered** (C22, closed 2026-10-13): ECI's chairman wrote that, as long as ECI's ICC
    profiles are not distributed as such, no license or other form of permission is needed, and that some form of attribution would be highly appreciated (the maintainer keeps the
    email privately; it is not published here). The profiles are not in this repository. The tables for these two are credited to ECI below and in the page footer, and
    may be treated like the GRACoL and SWOP tables: MIT-licensed, with that credit kept.
  - *Coated FOGRA39L (VIGC 260)*, provided by VIGC with permission of X-Rite. The terms are on the ICC Profile Registry page for the file
    (registry.color.org/profile-registry/Coated_Fogra39L_VIGC_260, read 2026-10-13): "This profile is made available by VIGC, with permission of X-rite, and may be used,
    embedded, exchanged, and shared without restriction. It may not be altered or sold without written permission of VIGC". Inside the file the only notice is
    "Copyright X-Rite, Inc.". The tables are derived values, not the profile, and the maintainer judged the registry notice enough (C23, closed). The notice is kept
    here and in the page footer (C30), and the table may be treated like the others, with that notice kept.

  Notices to keep with the GRACoL and SWOP tables, as PRINTING United Alliance asked:

  > GRACoL2013_CRPC6, GRACoL2013UNC_CRPC3: Copyright © PRINTING United Alliance 2013. This profile is based upon the GRACoL® trademark color specification, made available by PRINTING United Alliance (www.printing.org), and may be used, embedded, exchanged, and shared without restriction. It may not be altered or sold without the prior written permission of PRINTING United Alliance. GRACoL® is a registered trademark of the PRINTING United Alliance.

  > SWOP2013C3_CRPC5: Copyright © PRINTING United Alliance 2013. This profile is based upon the SWOP® trademark color specification, made available by PRINTING United Alliance (www.printing.org), and may be used, embedded, exchanged, and shared without restriction. It may not be altered or sold without the prior written permission of PRINTING United Alliance. SWOP® is a registered trademark of the PRINTING United Alliance.

  Credit: the PSO Coated v3 and PSO Uncoated v3 tables are computed from profiles published by ECI European Color Initiative (www.eci.org).

  The ECI profiles carry this notice: "This profile is made available by ECI European Color Initiative (www.eci.org), with permission of Heidelberger Druckmaschinen AG (www.heidelberg.com), and may be used, embedded and exchanged without restriction. It may not be distributed, sold or altered without written permission of ECI European Color Initiative. Color Toolbox 17.0.0 - (c) Copyright 2015 Heidelberger Druckmaschinen AG. All Rights Reserved."
- **The ICC profiles themselves.** They are not in this repository. See [`profiles/README.md`](profiles/README.md).
- **Third-party packages and data.** Each keeps its own license; see [`docs/08-data-and-licences.md`](docs/08-data-and-licences.md).
  - `apca-w3` (APCA contrast) is bundled in the page under its own limited license: web-content contrast only, no change to its essential code or
    constants, no commercial use without a signed agreement except under the W3 arrangement. Its license banner is kept in the built page, and the Checks
    step names the version used (0.1.9). Palette Engine does not change `apca-w3`. Anyone who reuses the built page takes on those terms for this code.
  - `colorparsley` (AGPL-3.0), a dependency of `apca-w3`, is **not** in the built page. `apca-w3` uses it for one function the engine does not need
    (reading colors given as words or `rgb()` strings; the engine passes hex only), so the build replaces it with a small hex-only module written for this
    project (`build/stubs/colorparsley-hex.js`). A test (`engine/test_apcastub.mjs`) compares the replacement with the real package and fails if any AGPL text
    reaches the built page. The real package is installed by `npm ci` for development and testing only and is not part of this repository.
- **Trademarks.** Pantone, Adobe, Illustrator, InDesign, Material Design and other names belong to their owners. This project is not affiliated
  with or endorsed by them.
