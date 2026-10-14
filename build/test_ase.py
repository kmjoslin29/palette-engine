"""Independent ASE reader for the phase 5 tests (no shared code with engine/export/ase.js).
usage: test_ase.py file.ase expected.json   -> exits 1 on any mismatch."""
import json, struct, sys

def read_ase(data):
    if data[:4] != b'ASEF':
        raise ValueError('bad signature')
    major, minor, count = struct.unpack('>HHI', data[4:12])
    if (major, minor) != (1, 0):
        raise ValueError('bad version')
    pos, groups, cur = 12, [], None
    def name_at(p):
        (n,) = struct.unpack('>H', data[p:p + 2])
        raw = data[p + 2:p + 2 + 2 * n]
        if raw[-2:] != b'\x00\x00':
            raise ValueError('name not terminated')
        return raw[:-2].decode('utf-16-be'), p + 2 + 2 * n
    for _ in range(count):
        btype, blen = struct.unpack('>HI', data[pos:pos + 6])
        start, end = pos + 6, pos + 6 + blen
        if end > len(data):
            raise ValueError('block past end')
        if btype == 0xC001:
            nm, e = name_at(start)
            assert e == end, 'group length'
            cur = {'name': nm, 'colors': []}; groups.append(cur)
        elif btype == 0xC002:
            assert blen == 0 and cur is not None
            cur = None
        elif btype == 0x0001:
            nm, e = name_at(start)
            model = data[e:e + 4].decode('ascii')
            n = {'RGB ': 3, 'CMYK': 4, 'LAB ': 3, 'Gray': 1}[model]
            vals = struct.unpack('>' + 'f' * n, data[e + 4:e + 4 + 4 * n])
            (ctype,) = struct.unpack('>H', data[e + 4 + 4 * n:e + 6 + 4 * n])
            assert e + 6 + 4 * n == end, 'color length'
            cur['colors'].append({'name': nm, 'model': model, 'values': list(vals), 'type': ctype})
        else:
            raise ValueError('unknown block %x' % btype)
        pos = end
    assert pos == len(data) and cur is None
    return groups

if __name__ == '__main__':
    got = read_ase(open(sys.argv[1], 'rb').read())
    want = json.load(open(sys.argv[2], encoding='utf-8'))
    assert len(got) == len(want), ('group count', len(got), len(want))
    for g, w in zip(got, want):
        assert g['name'] == w['name'], ('group name', g['name'], w['name'])
        assert len(g['colors']) == len(w['colors']), ('color count', g['name'])
        for c, x in zip(g['colors'], w['colors']):
            assert c['name'] == x['name'] and c['model'] == x['model'] and c['type'] == x['type'], (c, x)
            assert all(abs(a - b) < 1e-6 for a, b in zip(c['values'], x['values'])), (c, x)
    print('python reader: %d groups, %d colors match' % (len(got), sum(len(g['colors']) for g in got)))
