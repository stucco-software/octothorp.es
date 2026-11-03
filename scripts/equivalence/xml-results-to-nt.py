"""Stream a SPARQL XML results dump (?s ?p ?o) to N-Triples on stdout.

The 6.7 production dump is a SELECT ?s ?p ?o result set, not an RDF
serialization, so it has to be converted before Oxigraph can load it.
Usage: python3 -I scripts/equivalence/xml-results-to-nt.py "6.7 dump" > out.nt
"""
import re
import sys
import xml.etree.ElementTree as ET

NS = '{http://www.w3.org/2005/sparql-results#}'
XML_LANG = '{http://www.w3.org/XML/1998/namespace}lang'


def esc_lit(s):
    out = []
    for ch in s:
        o = ord(ch)
        if ch == '\\': out.append('\\\\')
        elif ch == '"': out.append('\\"')
        elif ch == '\n': out.append('\\n')
        elif ch == '\r': out.append('\\r')
        elif ch == '\t': out.append('\\t')
        elif o < 0x20 or o == 0x7f: out.append('\\u%04X' % o)
        else: out.append(ch)
    return ''.join(out)


def esc_iri(s):
    out = []
    for ch in s:
        o = ord(ch)
        if o <= 0x20 or ch in '<>"{}|^`\\':
            out.append('\\u%04X' % o)
        else:
            out.append(ch)
    return ''.join(out)


def term(el):
    tag = el.tag[len(NS):]
    text = unshift(el.text or '')
    if tag == 'uri':
        return '<' + esc_iri(text) + '>'
    if tag == 'bnode':
        return '_:b' + ''.join(c if c.isalnum() else '_' for c in text)
    if tag == 'literal':
        lit = '"' + esc_lit(text) + '"'
        lang = el.get(XML_LANG)
        dt = el.get('datatype')
        if lang: return lit + '@' + lang
        if dt: return lit + '^^<' + esc_iri(dt) + '>'
        return lit
    raise ValueError('unsupported term type: ' + tag)


# Oxigraph writes raw C0 control chars (e.g. \x01) inside literals, which
# XML 1.0 forbids. Shift them into the Private Use Area before parsing and
# shift back when emitting literals, so values round-trip unchanged.
ILLEGAL = bytes(b for b in range(0x20) if b not in (0x09, 0x0A, 0x0D))
PUA_BASE = 0xE000
ILLEGAL_RE = re.compile(b'[' + re.escape(ILLEGAL) + b']')


class Sanitized:
    def __init__(self, f):
        self.f = f

    def read(self, n=-1):
        chunk = self.f.read(n)
        if not chunk:
            return chunk
        return ILLEGAL_RE.sub(lambda m: chr(PUA_BASE + m.group()[0]).encode('utf-8'), chunk)


def unshift(s):
    return ''.join(chr(ord(c) - PUA_BASE) if PUA_BASE <= ord(c) < PUA_BASE + 0x20 else c for c in s)


def iter_events(path):
    with open(path, 'rb') as f:
        src = Sanitized(f)
        parser = ET.XMLPullParser(events=('end',))
        while True:
            chunk = src.read(1 << 20)
            if not chunk:
                break
            parser.feed(chunk)
            yield from parser.read_events()
        parser.close()
        yield from parser.read_events()


def main(path):
    w = sys.stdout.write
    n = 0
    for _, el in iter_events(path):
        if el.tag != NS + 'result':
            continue
        b = {}
        for binding in el.findall(NS + 'binding'):
            b[binding.get('name')] = term(binding[0])
        w('%s %s %s .\n' % (b['s'], b['p'], b['o']))
        n += 1
        el.clear()
    sys.stderr.write('triples written: %d\n' % n)


if __name__ == '__main__':
    main(sys.argv[1])
