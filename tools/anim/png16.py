"""Minimal PNG codec for 16-bit RGBA (color type 6, bit depth 16).

Why not Pillow: Pillow cannot write 16-bit-per-channel RGBA PNGs (it
round-trips them as 8-bit). Bone textures need more precision than 8 bit,
so matrix data (float32) is quantized to float16 and stored as 16-bit RGBA.
This matches what GPUs consume (half-float data textures). Only filter
type 0 (None) is written, so decoding is trivial.
"""
import struct
import zlib

import numpy as np

_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _chunk(ctype, data):
    return (struct.pack(">I", len(data)) + ctype + data +
            struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF))


def write_rgba16(path, arr):
    """Write (H, W, 4) float array as 16-bit RGBA PNG (float32->float16)."""
    a = np.asarray(arr, dtype=np.float32)
    assert a.ndim == 3 and a.shape[2] == 4, a.shape
    h, w, _ = a.shape
    half = a.astype(np.float16)
    raw = half.tobytes()  # float16 is native little-endian; PNG needs big-endian
    raw = np.frombuffer(raw, dtype="<u2").astype(">u2").tobytes()
    stride = w * 4 * 2
    scanlines = b"".join(b"\x00" + raw[i * stride:(i + 1) * stride]
                         for i in range(h))
    ihdr = struct.pack(">IIBBBBB", w, h, 16, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(_SIGNATURE)
        f.write(_chunk(b"IHDR", ihdr))
        f.write(_chunk(b"IDAT", zlib.compress(scanlines)))
        f.write(_chunk(b"IEND", b""))
    return path


def read_rgba16(path):
    """Read a 16-bit RGBA PNG -> (H, W, 4) float32 array."""
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == _SIGNATURE, "not a PNG"
    pos, idat, w = 8, b"", None
    bitdepth = ctype = None
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos:pos + 4])
        ctype_c = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if ctype_c == b"IHDR":
            w, h, bitdepth, ctype, _, _, _ = struct.unpack(">IIBBBBB", body)
        elif ctype_c == b"IDAT":
            idat += body
        elif ctype_c == b"IEND":
            break
        pos += 12 + ln
    assert bitdepth == 16 and ctype == 6, f"need 16-bit RGBA, got {bitdepth}/{ctype}"
    raw = zlib.decompress(idat)
    stride = w * 4 * 2
    rows = []
    for i in range(h):
        filt = raw[i * (stride + 1)]
        assert filt == 0, f"unsupported PNG filter {filt}"
        rows.append(raw[i * (stride + 1) + 1:(i + 1) * (stride + 1)])
    u16 = np.frombuffer(b"".join(rows), dtype=">u2").reshape(h, w, 4)
    # reinterpret the uint16 bit patterns as half floats (native order)
    f16 = u16.astype("<u2").view(np.float16)
    return f16.astype(np.float32)
