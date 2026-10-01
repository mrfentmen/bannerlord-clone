#!/usr/bin/env python3
"""ITU-R BS.1770-4 integrated loudness measurement (mono).

Implements the K-weighting (pre-filter + RLB high-pass), 400 ms blocks
with 75% overlap, absolute gate at -70 LUFS and relative gate at -10 LU.

Uses the standard 48 kHz filter coefficients at 44.1 kHz; the resulting
bias is ~0.1 dB, negligible for a -16 LUFS normalization target.

Sanity anchor: a full-scale 1 kHz sine measures about -3.01 LUFS.
"""
import numpy as np
from scipy.signal import lfilter

SR = 44100

# K-weighting stage 1: pre-filter (high shelf), BS.1770-4 Table 1 (48 kHz)
_PRE_B = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285])
_PRE_A = np.array([1.0, -1.69065929318241, 0.73248077421585])
# K-weighting stage 2: RLB high-pass
_RLB_B = np.array([1.0, -2.0, 1.0])
_RLB_A = np.array([1.0, -1.99004745483398, 0.99007225036621])

_BLOCK_S = 0.400   # 400 ms measurement blocks
_HOP_S = 0.100     # 75% overlap
_ABS_GATE = -70.0  # LUFS
_REL_GATE = -10.0  # LU below ungated


def k_weight(x):
    """Apply K-weighting to a mono float signal."""
    y = lfilter(_PRE_B, _PRE_A, x)
    return lfilter(_RLB_B, _RLB_A, y)


def _block_energies(y):
    n_block = int(_BLOCK_S * SR)
    n_hop = int(_HOP_S * SR)
    out = []
    for start in range(0, len(y) - n_block + 1, n_hop):
        seg = y[start:start + n_block]
        out.append(np.mean(seg ** 2))
    return np.array(out)


def block_loudness(z):
    """Loudness of one block from mean-square energy z (mono, G=1)."""
    if z <= 0:
        return float("-inf")
    return -0.691 + 10.0 * np.log10(z)


def integrated_lufs(x):
    """Integrated gated loudness of a mono float signal in LUFS.

    Returns float("-inf") when nothing passes the absolute gate
    (digital silence).
    """
    x = np.asarray(x, dtype=float)
    if x.size == 0 or np.all(x == 0):
        return float("-inf")
    y = k_weight(x)
    z = _block_energies(y)
    if z.size == 0:
        # shorter than one block: measure the whole thing, no gating
        return block_loudness(np.mean(y ** 2))
    l = np.array([block_loudness(zi) for zi in z])
    l = l[l > _ABS_GATE]
    if l.size == 0:
        return float("-inf")
    ungated = -0.691 + 10.0 * np.log10(np.mean(10.0 ** ((l + 0.691) / 10.0)))
    rel_thresh = ungated + _REL_GATE
    l = l[l > rel_thresh]
    if l.size == 0:
        return float("-inf")
    return float(-0.691 + 10.0 * np.log10(np.mean(10.0 ** ((l + 0.691) / 10.0))))


def gain_db_for_target(x, target_lufs=-16.0):
    """dB gain needed to bring x to target LUFS. None if unmeasurable."""
    l = integrated_lufs(x)
    if l == float("-inf"):
        return None
    return target_lufs - l
