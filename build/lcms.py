"""Minimal double-precision LittleCMS 2 bindings via ctypes.

Pillow's ImageCms only runs 8-bit transforms, which quantizes Lab too coarsely
for sub-1 ΔE00 validation, so this calls liblcms2 directly with *_DBL formats.

Windows: place lcms2.dll (from a LittleCMS release, vcpkg, or conda) next to this
file or on PATH. macOS/Linux: install liblcms2 via the system package manager.
"""
import ctypes, ctypes.util, os, sys
import numpy as np

def _load():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [os.path.join(here, "lcms2.dll"), ctypes.util.find_library("lcms2"),
                  ctypes.util.find_library("liblcms2-2"), "liblcms2.so.2", "liblcms2.dylib"]
    for c in candidates:
        if c and (os.path.exists(c) or not os.path.isabs(c)):
            try:
                return ctypes.CDLL(c)
            except OSError:
                pass
    sys.exit("LittleCMS 2 library not found (see lcms.py docstring).")

L = _load()
L.cmsOpenProfileFromFile.restype = ctypes.c_void_p
L.cmsOpenProfileFromFile.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
L.cmsCreate_sRGBProfile.restype = ctypes.c_void_p
L.cmsCreateLab4Profile.restype = ctypes.c_void_p
L.cmsCreateLab4Profile.argtypes = [ctypes.c_void_p]
L.cmsCreateTransform.restype = ctypes.c_void_p
L.cmsCreateTransform.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p,
                                 ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32]
L.cmsDoTransform.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32]
L.cmsGetEncodedCMMversion.restype = ctypes.c_int

def _fmt(space, ch):  # FLOAT_SH(1)|COLORSPACE_SH|CHANNELS_SH|BYTES_SH(0) = double
    return (1 << 22) | (space << 16) | (ch << 3)

RGB_DBL, CMYK_DBL, LAB_DBL = _fmt(4, 3), _fmt(6, 4), _fmt(10, 3)
INTENT_PERCEPTUAL, INTENT_RELATIVE = 0, 1
FLAG_BPC, FLAG_NOOPTIMIZE = 0x2000, 0x0100

def version():
    return L.cmsGetEncodedCMMversion()

def srgb():
    return L.cmsCreate_sRGBProfile()

def lab_d50():
    return L.cmsCreateLab4Profile(None)  # NULL white point = D50

def open_profile(path):
    h = L.cmsOpenProfileFromFile(path.encode(), b"r")
    if not h:
        sys.exit(f"Could not open profile {path}")
    return h

class Transform:
    def __init__(self, src, sfmt, sch, dst, dfmt, dch, intent=INTENT_RELATIVE, bpc=False):
        flags = FLAG_NOOPTIMIZE | (FLAG_BPC if bpc else 0)
        self.h = L.cmsCreateTransform(src, sfmt, dst, dfmt, intent, flags)
        if not self.h:
            raise RuntimeError("cmsCreateTransform failed")
        self.sch, self.dch = sch, dch

    def __call__(self, arr):
        a = np.ascontiguousarray(arr, dtype=np.float64).reshape(-1, self.sch)
        out = np.zeros((a.shape[0], self.dch), dtype=np.float64)
        L.cmsDoTransform(self.h, a.ctypes.data, out.ctypes.data, a.shape[0])
        return out

def transforms(profile_path):
    """RGB in 0..1, CMYK in 0..100, Lab in D50 units."""
    s, lab, p = srgb(), lab_d50(), open_profile(profile_path)
    return {
        "rgb_to_cmyk": Transform(s, RGB_DBL, 3, p, CMYK_DBL, 4, bpc=True),      # brand CMYK values
        "cmyk_to_lab": Transform(p, CMYK_DBL, 4, lab, LAB_DBL, 3),               # what the press prints
        "rgb_to_lab": Transform(s, RGB_DBL, 3, lab, LAB_DBL, 3),                 # screen color, D50
        "lab_to_cmyk_nobpc": Transform(lab, LAB_DBL, 3, p, CMYK_DBL, 4),         # gamut round trip
    }
