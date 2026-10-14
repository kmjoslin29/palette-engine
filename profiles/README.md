# ICC profiles

The LUT build (`build/build_luts.py`) needs six ICC profiles (the first five are free downloads; see the note on the last). They are not stored in this repository; download them
and put them in this folder with these file names.

| File | Print condition | Source | SHA-256 (what the shipped LUTs were built from) |
| --- | --- | --- | --- |
| `GRACoL2013_CRPC6.icc` | GRACoL 2013 coated, 320% total ink | ICC Profile Registry | `4ebbfad6bc9cfc033fdafdd8ac5df8159208932cb16d9a6596d349ae7ab50443` |
| `SWOP2013C3_CRPC5.icc` | SWOP 2013, 300% total ink | ICC Profile Registry | `01123776855855378ed540228875458dfe88fca233a14d5b537800353c04faaf` |
| `GRACoL2013UNC_CRPC3.icc` | GRACoL 2013 uncoated, 280% total ink | ICC Profile Registry | `0c0d5b0893c6637244a1d47108e50046c7e570c296dcf639aaa04ce2f884265c` |
| `PSOcoated_v3.icc` | PSO Coated v3 (FOGRA51), 300% total ink; ISO 12647-2:2013, premium coated; Europe | ICC Profile Registry (issued by ECI) | `c30ad2c01e8f93135ec7682c535e0a81bc2d177c301e196376c5f5838b5c8e86` |
| `PSOuncoated_v3_FOGRA52.icc` | PSO Uncoated v3 (FOGRA52), 300% total ink; ISO 12647-2:2013 condition 5, wood-free uncoated; Europe | ICC Profile Registry (issued by ECI) | `7c39f74fbede1e8c85f8fbb9df7d359aea638b9b68dd0854fdd3ba386e3a02c0` |
| `Coated_Fogra39L_VIGC_260.icc` | FOGRA39 data, coated; Europe; no ink limit stated (tables reach 265.4%) | Supplied by Kwade; **source and terms not recorded** (TO-CONFIRM C23) | `8decbce6c2efafdce11eca36571f5e22b5cb85418343a87d84c9289369e3519e` |

Download from `https://registry.color.org/profile-registry/profiles/<file name>` (or the PRINTING United Alliance page for GRACoL and SWOP).
The registry states the GRACoL and SWOP profiles "may be used, embedded, exchanged, and shared without restriction" and must not be altered or sold. The two ECI profiles may be "used, embedded and exchanged without restriction" but not "distributed, sold or altered without written permission", so they are not stored in this repository either. The FOGRA39 file has no stated terms (C23).

The build writes the SHA-256 of each profile into its LUT file (`profile_sha256`). If your download hashes differently, the registry has
published a new version and the LUTs will differ slightly from the ones in `data/`.
